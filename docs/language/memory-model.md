---
sidebar_position: 10
title: Memory Model
---

# Memory Model

Verum's memory model is designed around one question: **how do you get
guaranteed safety without the lifetime gymnastics?**

The answer has three parts:

1. A **three-tier reference model** that lets you choose the safety /
   performance tradeoff per reference.
2. **CBGR** — Capability-Based Generational References — a fast
   runtime check that prevents use-after-free. Measured at
   **~0.93 ns** on the `production_targets` bench, well under the
   ≤ 15 ns design target.
3. **Escape analysis** that promotes CBGR references to zero-cost
   checked references whenever it can prove the check is unnecessary.

## Ownership and values

Every value has exactly one owner. Passing a value moves ownership
(or copies, if the type is `Copy`). Dropping a value runs its `drop`
implementation.

```verum
let heap_int: Heap<Int> = Heap(42);
let moved = heap_int;
// `heap_int` is no longer accessible — moved.
```

`Heap<T>`, `Shared<T>`, and custom allocated types are unique owners.
`Int`, `Float`, `Bool`, `Char`, tuples of `Copy` types, and arrays of
`Copy` types are copyable by default.

## References: the three tiers

### `&T` — managed (default)

```verum
fn process(x: &User) { ... }
```

- **What it is**: a CBGR-checked reference.
- **Size**: 16 bytes (`ThinRef`) for sized types, 32 bytes (`FatRef`) for unsized.
- **Runtime cost**: one generation-check per deref, roughly 15 ns.
- **Safety**: use-after-free and double-free are runtime-detected.

This is the default. Use it unless you have a reason not to.

### `&checked T` — compiler-verified, zero cost

```verum
fn process(x: &checked User) { ... }
```

- **What it is**: the compiler has proven this reference cannot dangle.
- **Size**: 8 bytes (raw pointer).
- **Runtime cost**: zero.
- **How you get one**: escape analysis promotes `&T` to `&checked T`
  automatically where it can prove safety. You can also ask for
  `&checked` explicitly, in which case the compiler _must_ prove it
  or reject the code.

### `&unsafe T` — unchecked, zero cost

```verum
fn process(x: &unsafe User) { ... }
```

- **What it is**: a reference you swear is safe.
- **Size**: 8 bytes.
- **Runtime cost**: zero.
- **Safety**: none — you are asserting the reference is live.

Used for FFI, manual memory management, and performance-critical code
where the compiler cannot prove what you know. Requires an `unsafe`
block to dereference.

### Choosing

```
default-safe:       use &T
speed-critical:     use &T, let escape analysis promote to &checked
FFI / raw pointers: use &unsafe T, justify with a comment
```

## Mutability

References are immutable by default. Mutable variants:

```verum
&mut T            // mutable managed reference
&checked mut T    // mutable checked reference
&unsafe mut T     // mutable unsafe reference
```

**Aliasing rules**:
- Multiple `&T` can coexist — reads are freely shareable.
- A `&mut T` is exclusive — while it exists, no other reference to
  the same value may exist.

These rules are enforced statically by the compiler (or, at the CBGR
level, by the generation counter for references that escape static
analysis).

## Raw pointers

```verum
*const T        // immutable raw pointer
*mut T          // mutable raw pointer
*volatile T     // volatile read
*volatile mut T // volatile write
```

Raw pointers are pure addresses — no size, no lifetime, no generation.
They interoperate with C via `extern "C"`. Dereferencing requires
`unsafe`.

## Heap allocation

```verum
let boxed: Heap<Tree> = Heap(Tree.Leaf);
let shared: Shared<Config> = Shared(load_config());
let cloned = shared.clone();   // bumps the refcount
```

- `Heap<T>` — unique, owned heap allocation.
- `Shared<T>` — atomically reference-counted.
- `Rc<T>` — single-threaded reference-counted (lower overhead, `!Send`).

:::note Status (0.1.0)

`Shared<T>` runtime construction works in both the Tier 0 interpreter
and AOT, including `Shared<Int>.new(42)`, `Shared<Bool>.new(true)`,
and `Shared<Text>.new("hello")`. The earlier interpreter bootstrap
crash was traced to two compounded codegen bugs (TypeExpr layout
property + static method dispatch on `Foo<T>.method(...)` receivers)
and is fixed.

:::

## Drops and destructors

The `Drop` protocol runs when a value goes out of scope:

```verum
implement Drop for File {
    fn drop(&mut self) {
        unsafe { close(self.fd); }
    }
}
```

`drop` is called exactly once, guaranteed. The compiler inserts the
call at the end of the value's scope (or at the point of move into a
function that consumes it).

## Move vs copy

A type is `Copy` if it is "plain old data" — no heap, no drop, no
alias-sensitive invariants. `Copy` is auto-derived where possible and
can be requested explicitly:

```verum
@derive(Copy, Clone)
type Vec2 is { x: Float, y: Float };
```

A non-`Copy` type is moved on assignment and parameter passing. To
duplicate explicitly, call `.clone()`.

## Summary

| Concept | Syntax | Cost |
|---------|--------|------|
| Managed reference | `&T` | ~0.93 ns CBGR check (measured; target ≤ 15 ns) |
| Checked reference | `&checked T` | 0 ns |
| Unsafe reference | `&unsafe T` | 0 ns |
| Mutable variants | `&mut T`, `&checked mut T`, ... | same as above |
| Raw pointer | `*const T`, `*mut T` | 0 ns, requires `unsafe` |
| Heap | `Heap<T>` | 1 allocation, CBGR header |
| Shared | `Shared<T>` | 1 allocation, atomic refcount |

## Allocation internals

`Heap<T>`, `Shared<T>`, and every collection-backing allocation go
through a **mimalloc-inspired, libc-free allocator** with three
hierarchical scales. This is stable public API only in the sense that
`Heap(...)` always works — the structure below explains the *costs*
you see in the summary table, and is useful when reasoning about
latency-sensitive code.

### Three-tier hierarchy

```
Heap (thread-local)  →  Segment (32 MiB)  →  Page (64 KiB / 512 KiB)
```

- **Heap** — per-thread, stored in a TLS context slot. Owns 73 page
  queues plus a direct-access array for allocations ≤ 1 KiB. No lock
  on the fast path.
- **Segment** — a 32 MiB chunk backed by one `mmap` (Linux) /
  `mach_vm_allocate` (macOS) / `VirtualAlloc` (Windows). Tracks which
  of its 512 × 64 KiB slices are committed and which are scheduled
  for purging.
- **Page** — a single size class per page. Three free lists:
  thread-local (`free`), deferred-local (`local_free`), and
  cross-thread (`xthread_free`, atomic).

### 73 size classes (12.5 % spacing)

| Range            | Classes | Spacing |
|------------------|---------|---------|
| 8 – 64 B         | 8       | exact 8-byte bins |
| 80 – 1 024 B     | 16      | logarithmic, 12.5 % |
| 1 280 B – 64 KiB | 32      | logarithmic |
| 80 KiB – 4 MiB   | 16      | logarithmic |
| > 5 MiB          | 1       | `huge` bin — dedicated segment |

Allocation classes:

| Class  | Size        | Page size |
|--------|-------------|-----------|
| small  | ≤ 8 KiB     | 64 KiB    |
| medium | ≤ 64 KiB    | 512 KiB   |
| large  | ≤ 16 MiB    | dedicated |
| huge   | > 16 MiB    | dedicated segment |

### Fast path (~7 instructions)

For a small allocation the sequence is: load `CURRENT_HEAP` from TLS,
index the direct-access array by word-size, pop the head of the
thread-local free list, bump `used`. No atomics, no locks, no
syscalls.

### Cross-thread frees

Freeing a block whose owning thread is not the current one pushes the
block onto `page.xthread_free` with a single CAS. The owning thread
drains that list lazily next time it allocates from that page. This
keeps free paths symmetric without bouncing a cache line per free.

### Segment abandonment

When a thread exits its segments are **abandoned** rather than freed
— their `thread_id` is set to 0. Another thread that deallocates a
block into an abandoned segment can CAS-claim ownership and reclaim
the segment's live pages into its own heap.

### Lazy purging

When a page empties, its slices are added to a `purge_mask` with a
timestamp. A purge pass issues `madvise(MADV_FREE)` (Linux), `MADV_FREE`
(macOS), or `VirtualFree(MEM_DECOMMIT)` (Windows) once the 10 ms
grace window has elapsed. This keeps working-set memory in RAM
through transient allocation spikes.

### CBGR integration

Allocation returns a triple `(ptr, generation, epoch)`:

- the **ptr** identifies the slot,
- the **generation** is `segment.base_generation + page.slot_generations[i]`,
- the **epoch** is the current value of `segment.epoch`.

A `ThinRef<T>` stores `(ptr, generation, epoch_caps)` in 16 bytes; on
deref, it re-reads the three atomics and fails the check if either
has advanced. Freeing a block increments its slot generation, so any
outstanding reference to it sees the mismatch on its next deref.

### Performance targets

| Operation                       | Target |
|---------------------------------|--------|
| small alloc, hot path           | < 20 ns |
| small alloc, cold (new page)    | < 100 ns |
| large alloc                     | < 5 µs |
| thread-local free               | < 15 ns |
| cross-thread free               | < 50 ns |
| CBGR deref validation           | < 5 ns |
| memory overhead                 | < 5 % |

Scalability: thread-local fast paths with no contention up to ~32
cores; beyond that, abandoned-segment reclamation dominates.

For the internals of CBGR, see **[CBGR](/docs/language/cbgr)** and
**[CBGR internals](/docs/architecture/cbgr-internals)**. For
allocator-level cost accounting across runtime tiers, see
**[Runtime tiers → memory costs](/docs/architecture/runtime-tiers#memory-costs-across-tiers)**.
