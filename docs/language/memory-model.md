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
   **1.2–1.7 ns** on the `production_targets` bench, well under the
   ≤ 15 ns design target.
3. **Escape analysis** that promotes CBGR references to zero-cost
   checked references whenever it can prove the check is unnecessary.

## Ownership and values

Copying a value, borrowing it and transferring a resource have different
contracts. `Heap<T>` declares unique ownership of an allocation;
`Shared<T>` provides multiple owning handles to the same allocation.
A reference borrows access and does not become an owner when copied.

### Copy depth

The [value-copy contract](https://github.com/verum-lang/verum/blob/main/docs/architecture/value-copy-contract.md)
defines a copy at one level. Copying an outer value does not recursively
duplicate everything reachable through its fields.

| Value being copied | Copy-depth contract |
|---|---|
| Scalar | The same scalar value. |
| Record, variant or tuple | Fresh outer storage containing shallow copies of its fields or payload. |
| `List`, `Map`, `Set` or `Deque` | Fresh container storage and backing array; nested element values are not recursively cloned. |
| Reference or raw pointer | Another alias to the same referent; copying it does not extend the referent's lifetime. |
| `Shared<T>` | Another owning handle to the same cell, with a strong-reference count increment. |

For example, copying a record that contains a list does not by itself
copy that nested list's backing array. Copying the list itself has a
different boundary: it copies the backing array, while nested values
inside that array remain shallow. A fresh outer value is therefore not
a deeply isolated snapshot.

Resource use follows the type's [affine or linear discipline](/docs/language/linearity).
These copy-depth rules do not authorize duplicating an exclusive resource
or creating a second destruction obligation. Collection and backend
support must be checked separately; see the
[copy limitations](#move-vs-copy) below.

## References: the three tiers

### `&T` — managed (default)

```verum
fn process(x: &User) { ... }
```

- **What it is**: a CBGR-checked reference.
- **Size**: 16 bytes (`ThinRef`) for sized types, 32 bytes (`FatRef`) for unsized.
- **Runtime cost**: one generation-check per deref — **1.2–1.7 ns**
  in `cargo bench -p verum_cbgr --bench production_targets`, against a ≤ 15 ns design target.
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

These are aliasing requirements. A generation check establishes liveness
for the access it validates; it does not by itself establish exclusive
access or correct resource cleanup. See
[references](/docs/language/references#resource-lifetime) for the current
lifetime limitations.

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
- `Shared<T>` — atomically reference-counted, CBGR-tracked.

:::note Status (0.1.0)

`Shared<T>` runtime construction works in both the Tier 0 interpreter
and AOT, including `Shared<Int>.new(42)`, `Shared<Bool>.new(true)`,
and `Shared<Text>.new("hello")`. The earlier interpreter bootstrap
crash was traced to two compounded codegen bugs (TypeExpr layout
property + static method dispatch on `Foo<T>.method(...)` receivers)
and is fixed.

:::

## Drops and destructors

The `Drop` protocol defines cleanup for an owned value:

```verum
implement Drop for File {
    fn drop(&mut self) {
        unsafe { close(self.fd); }
    }
}
```

Correct resource ownership must determine which scope or consuming call
is responsible for cleanup. Copying a value or passing an argument by
value does not by itself establish a fresh owner with an independent
destructor. The bytecode compiler supports explicit affine returns from a
proven direct local and from supported fresh aggregate constructors. An
ownership transfer into a function or method argument does not prove ownership
of its result: returning that result, including inside another constructor,
is refused until the resource-bearing result producer is established. An
unrestricted result can still be returned while the caller cleans up its
remaining locals. Deferred or escaping
cleanup also restricts these return paths. General native owned-object
destruction remains subject to the
[resource-lifetime limitations](/docs/language/references#resource-lifetime).

## Move vs copy

For ordinary copyable values, a supported copy from a named place leaves
the source available: `let b = a` gives `b` its own outer value. A
temporary can be used directly without an extra copy. This distinction
is separate from the `Copy` protocol and from affine or linear resource
transfer; absence of `Copy` does not mean every assignment or argument
automatically moves ownership.

An explicit `.clone()` follows the selected type's clone contract.
Field-by-field cloning still preserves any sharing specified by those
fields: a `Shared<T>` clone retains the same cell, and a copied reference
retains the same referent. See [derives](/docs/language/meta/derives#clone)
for the separate generator status and semantics.

**Implementation limits:** the copy-depth contract is not evidence that
every copy expression or backend implements it correctly. Copying from an
explicit dereference, `.clone()` dispatch and native copying require
separate validation. Do not use a dereferenced borrow or a generic clone
as proof of deep snapshot isolation. An API that promises isolation must
define how its mutable nested values are reconstructed.

## Summary

| Concept | Syntax | Cost |
|---------|--------|------|
| Managed reference | `&T` | 1.2–1.7 ns CBGR check (target ≤ 15 ns) |
| Checked reference | `&checked T` | 0 ns |
| Unsafe reference | `&unsafe T` | 0 ns |
| Mutable variants | `&mut T`, `&checked mut T`, ... | same as above |
| Raw pointer | `*const T`, `*mut T` | 0 ns, requires `unsafe` |
| Heap | `Heap<T>` | 1 allocation, CBGR header |
| Shared | `Shared<T>` | 1 allocation, atomic refcount |

## Allocation internals

The native allocation design uses a **mimalloc-inspired allocator** with
three hierarchical scales for `Heap<T>`, `Shared<T>` and collection
backing storage. Generated AOT allocation must follow the
[no-libc contract](/docs/architecture/no-libc-architecture), which still
requires checking the complete native executable. The host interpreter
may use host libraries while preserving the same value and lifetime
semantics. The structure below describes the allocation model rather
than a stable representation ABI.

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
