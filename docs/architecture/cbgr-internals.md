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

32 bytes, prepended to every CBGR-tracked allocation, cache-aligned.

```c
struct AllocationHeader {
    uint32_t generation;  // incremented on free
    uint32_t epoch;       // wraparound-safety counter
    uint32_t flags;       // drop impl, pinned, capabilities
    uint32_t layout_size; // for realloc / sanity check
    uint64_t _padding;    // align to 32 bytes
    Layout   layout;      // size, align
};
```

### ThinRef\<T\>

16 bytes. Used for sized `T`.

```c
struct ThinRef<T> {
    T*        ptr;
    uint32_t  generation;
    uint32_t  epoch_caps;  // 16 bits epoch + 16 bits capabilities
};
```

### FatRef\<T\>

32 bytes. Used when `T` is unsized (slices, `dyn`).

```c
struct FatRef<T> {
    T*        ptr;
    uint32_t  generation;
    uint32_t  epoch_caps;
    size_t    len_or_vtable;
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

16 bits of the `epoch_caps` word encode the reference's capabilities:

- `Read` (always set)
- `Write`
- `Admin`
- 13 application-defined.

A method dispatch for `Database.write(...)` emits a capability check:

```c
assert((r.epoch_caps & CAP_WRITE) != 0);
```

The check is one AND + one branch — ~1 ns, dominated by the branch
predictor.

## Escape analysis

`verum_cbgr::analysis` runs a whole-function points-to analysis:

1. **Build the pointer-flow graph**: every reference assignment, return,
   parameter-pass, field-store is an edge.
2. **Classify escape**: each reference is tagged with one of six
   categories — `Heap`, `Stack`, `Return`, `Param`, `Field`, `Indirect`.
3. **Promote**: references that never escape the function body (or
   escape into known-safe locations) are promoted from `&T` to `&checked T`.
4. **Emit**: the VBC uses `DerefUnchecked` instead of `DerefChecked`.

Typical promotion rate: 60–95% of `&T` occurrences.

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
