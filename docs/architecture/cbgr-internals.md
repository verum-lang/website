---
sidebar_position: 5
title: CBGR Internals
---

# CBGR Internals

This page is for compiler developers and anyone curious about the
mechanics. For the user-facing view, see
[Language → CBGR](/docs/language/cbgr).

## Data structures

### AllocationHeader

32 bytes, prepended to every CBGR-tracked allocation, 32-byte aligned
(one full cache line on x86_64 / aarch64).

```c
// stdlib/mem/header.vr, @repr(C, align(32))
type AllocationHeader is {
    uint32_t size;          //  4 B — payload size
    uint32_t alignment;     //  4 B — payload alignment
    uint32_t generation;    //  4 B — CBGR counter, bumped on free
    uint16_t epoch;         //  2 B — wraparound-safety counter
    uint16_t capabilities;  //  2 B — 8 capability flags
    uint32_t type_id;       //  4 B — runtime type info
    uint32_t flags;         //  4 B — drop impl, pinned, etc.
    uint32_t reserved[2];   //  8 B — reserved for future use
};
```

`generation` + `epoch` are laid out so they can be loaded in a single
64-bit atomic — `load_generation_epoch_combined()` does exactly that
on the fast path with `Acquire` ordering. Free uses `Release` on the
same word so reader visibility is guaranteed without a full fence.

### ThinRef\<T\>

16 bytes. Used for sized `T`.

```c
type ThinRef is<T> {
    T*        ptr;
    uint32_t  generation;
    uint32_t  epoch_caps;  // 16 bits epoch + 16 bits capabilities
};
```

### FatRef\<T\>

32 bytes. Used when `T` is unsized (slices, `dyn`) or for interior
references that need an offset into a larger allocation.

```c
type FatRef is<T> {
    T*        ptr;                  // 8 B
    uint32_t  generation;           // 4 B
    uint32_t  epoch_caps;           // 4 B — epoch:16 | caps:16
    uint64_t  metadata;             // 8 B — slice length, dyn vtable, …
    uint32_t  offset;               // 4 B — non-zero for interior refs
    uint32_t  reserved;             // 4 B — alignment + room to grow
};
```

## Check sequence

```c
T* deref(ThinRef<T> r) {
    Header* h = (Header*)((uint8_t*)r.ptr - sizeof(Header));
    if (__builtin_expect(h->generation != r.generation, 0)) {
        handle_use_after_free(&r, h);
    }
    return r.ptr;
}
```

On x86_64 this compiles to:

```
    mov    rax, [rdi]                 ; load pointer
    mov    ecx, [rax - 16]            ; load header.generation
    cmp    ecx, [rdi + 8]             ; compare with ref.generation
    jne    .uaf_handler
    ret
```

Measured: 55 cycles, ~13.8 ns on an M3 Max.

## Allocator

Based on Mimalloc's segment architecture:

- **Segment**: 32 MiB virtual region, lazily committed.
- **Page**: subdivision of a segment; each page holds one size class.
- **Size class**: 73 classes, spaced at 12.5% intervals, from 8 bytes
  to 4 MiB.
- **LocalHeap**: per-thread cache; lock-free fast path.
- **Free list**: per-page, reversed on full page to maintain LIFO for
  cache friendliness.

Freeing an object:
1. Atomically increments `header.generation`.
2. Pushes the slot onto the page's free list.

Concurrent readers are protected by hazard pointers (`HazardGuard`):
a reader installs its reference's target into a thread-local slot
before the CBGR check; a freer checks all slots before recycling the
memory.

## Generation wraparound

Generations are 32-bit → wraparound at 4.29 billion allocations per
object. At 1 ns per alloc, that's ~4.3 seconds per object — a real
concern for tight loops that rapidly alloc/free.

**Solution**: epochs. Each thread advances a 32-bit epoch counter
periodically (every 1 ms, or on signal). References carry the epoch at
creation. When the allocator rolls a generation, it also advances the
page's epoch; any reference with an older epoch fails the check.

With 32-bit epochs rolled at 1 kHz per thread, wraparound is
effectively infinite for any practical workload.

## Capability bits

The low 8 bits of the `capabilities` field (and the mirrored 8 bits in
`ThinRef.epoch_caps`) encode a monotonically attenuating capability
set:

| Bit | Name | Meaning |
|-----|------|---------|
| 0 | `CAP_READ` | reads permitted (always set for a live reference) |
| 1 | `CAP_WRITE` | writes permitted |
| 2 | `CAP_EXECUTE` | the target is callable (function pointers) |
| 3 | `CAP_DELEGATE` | the reference can be handed off to another context |
| 4 | `CAP_REVOKE` | the holder can revoke outstanding copies |
| 5 | `CAP_BORROWED` | this is a borrow, not an owner |
| 6 | `CAP_MUTABLE` | `&mut` semantics (exclusive access) |
| 7 | `CAP_NO_ESCAPE` | optimisation hint: cannot escape the function |

**Monotonic attenuation**: capabilities can only be *removed* as a
reference is passed around — a `Database.readonly()` transformation
clears `CAP_WRITE` once and the result can never regain it. The
compiler enforces this at every conversion point.

A method dispatch for `Database.write(...)` emits a capability check:

```c
assert((r.capabilities & CAP_WRITE) != 0);
```

The check is one AND + one branch — ~1 ns, dominated by the branch
predictor.

## Compile-time analysis suite

The tier decisions that let the compiler emit `&checked T` or
`&unsafe T` instead of the Tier 0 `&T` come from a battery of
analyses in `verum_cbgr`:

| Module | Role |
|--------|------|
| `tier_analysis.rs`          | unified API — composes the results below into per-reference tier decisions |
| `escape_analysis.rs`        | forward dataflow; four states: `NoEscape`, `MayEscape`, `Escapes`, `Unknown` |
| `escape_categories.rs`      | refines `Escapes` with provenance data for SBGL decisions |
| `ownership_analysis.rs`     | tracks move/borrow/consume per reference |
| `concurrency_analysis.rs`   | data-race detection driven by `Send`/`Sync` |
| `lifetime_analysis.rs`      | classic borrow checking |
| `nll_analysis.rs`           | non-lexical lifetimes (fine-grained region inference) |
| `polonius_analysis.rs`      | Polonius-style origin tracking for hard cases |
| `dominance_analysis.rs`     | dominator-based promotion |
| `points_to_analysis.rs`     | Andersen-style points-to graph |
| `smt_alias_verification.rs` | SMT-backed alias proofs when the others are inconclusive |

The pipeline walks references through each analysis, producing a
`TierAnalysisResult` that records decisions per `RefId` along with
statistics used for the optimiser's tier distribution report.

### Promotion rule

Only references classified as `NoEscape` are eligible for SBGL
(stack-backed generation-less) promotion. `MayEscape` and `Escapes`
stay at Tier 0. When the purely syntactic analyses are inconclusive,
`smt_alias_verification.rs` asks the SMT solver whether two references can alias
— proofs beyond "no" fall back to Tier 0 as well.

Typical promotion rate on idiomatic code: 60–95 % of `&T` occurrences
land at Tier 1.

## Performance numbers (M3 Max)

| Operation | Cycles | Nanoseconds |
|-----------|--------|-------------|
| Unchecked deref | 2 | 0.5 |
| `&checked T` deref | 2 | 0.5 |
| `&T` deref (hot header) | 55 | 13.8 |
| `&T` deref (cold header) | 220 | 55 |
| Allocation (cached size class) | 40 | 10 |
| Free + gen++ | 80 | 20 |
| Realloc (in place) | 60 | 15 |
| Realloc (moving) | depends | – |

## VBC tier opcodes

Each tier is a distinct VBC instruction, so the tier decision is
visible all the way down to the bytecode — the interpreter and the
AOT lowering pipeline read the same opcode.

| Opcode | Mnemonic | Meaning |
|--------|----------|---------|
| 0x70 | `Ref`         | Tier 0 immutable borrow |
| 0x71 | `RefMut`      | Tier 0 mutable borrow |
| 0x72 | `Deref`       | deref with CBGR validation |
| 0x73 | `DerefMut`    | mutable deref with validation |
| 0x74 | `ChkRef`      | explicit validation check (guard) |
| 0x75 | `RefChecked`  | Tier 1 — compiler-proven safe, 0 ns deref |
| 0x76 | `RefUnsafe`   | Tier 2 — unsafe, 0 ns deref |
| 0x77 | `DropRef`     | drop a reference (bookkeeping only) |

### Tier behaviour across execution modes

| Mode                | Tier 0 deref | Tier 1 deref | Tier 2 deref |
|---------------------|--------------|--------------|--------------|
| Interpreter         | full check  | full check (safety first) | full check (safety first) |
| AOT (LLVM, debug)   | full check  | direct load | direct load |
| AOT (LLVM, release) | full check, elided where escape analysis proves safe | direct load | direct load |

The interpreter intentionally validates *every* deref regardless of
tier — it is the safe-by-default executor. Tier 1 and Tier 2 give
their 0 ns benefit under AOT, where the check is proven away
statically. Verum does not ship a JIT tier: the AOT pipeline lowers
VBC through LLVM (for CPU) and MLIR (for GPU), and the interpreter
handles every non-AOT execution path. A speculative baseline/JIT
tier was evaluated and removed as not pulling its weight given how
fast the interpreter already is and how effectively the AOT
pipeline elides tiered checks.

### MLIR lowering

The `verum.cbgr` dialect mirrors the VBC opcodes:

```
verum.cbgr.borrow        / verum.cbgr.borrow_mut
verum.cbgr.deref         / verum.cbgr.deref_mut
verum.cbgr.store
verum.cbgr.drop
```

Lowering strategy is one of:

- `CbgrValidated` — Tier 0, emits a call into `stdlib/mem`'s
  validation function.
- `DirectLoad` — Tier 1, lowers to `llvm.load` directly.
- `UncheckedLoad` — Tier 2, lowers to `llvm.load` with no
  metadata decorations.

## Threads and concurrency

CBGR is designed to be lock-free on the fast path:

- Per-thread local heap avoids contention.
- Generations are atomic loads (no fences needed on x86_64 TSO).
- Hazard pointers replace epoch-based reclamation for finer-grained
  safety.

On weakly-ordered architectures (aarch64), an acquire fence on deref
and a release fence on free provide the necessary ordering.

## See also

- **[Stdlib → mem](/docs/stdlib/mem)** — user-facing API.
- **[Language → CBGR](/docs/language/cbgr)** — programmer's model.
- **[Runtime tiers](/docs/architecture/runtime-tiers)** — CBGR across
  interpreter / AOT.
