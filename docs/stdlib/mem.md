---
sidebar_position: 4
title: mem
description: Capability-Based Generational References — Heap, Shared, allocator, raw ops.
---

# `core.mem` — Memory management

The implementation of CBGR (Capability-Based Generational References),
the three-tier reference model, and the allocator stack. User code
typically interacts with `Heap`, `Shared`, and references via
[`base`](/docs/stdlib/base); this page documents the full `mem` API
for systems programmers.

| File | What's in it |
|---|---|
| `allocator.vr` | `Allocator` protocol, `cbgr_alloc`/`cbgr_dealloc`/`cbgr_realloc`, `Layout`, `AllocError` |
| `header.vr` | `AllocationHeader` (32-byte CBGR metadata) |
| `thin_ref.vr` | `ThinRef<T>` (16 bytes) |
| `fat_ref.vr` | `FatRef<T>` (32 bytes) |
| `hazard.vr` | `HazardGuard<T>` — concurrent-safe deref protection |
| `epoch.vr` | `EpochManager` — generation wraparound safety |
| `capability.vr` | `Capability` bits — read/write/admin/etc. |
| `arena.vr` | `GenerationalArena<T>` — O(1) mass invalidation |
| `segment.vr` | `Segment` — 32 MiB virtual regions |
| `size_class.vr` | 73-bin size class table (Mimalloc-style) |
| `heap.vr` | `LocalHeap` — thread-local allocation |
| `raw_ops.vr` | `memcpy`, `memmove`, `memset`, `memcmp`, `strlen`, `strcmp` |

---

## References — three tiers

### `ThinRef<T>` — 16 bytes

```verum
type ThinRef<T> is {
    ptr: *unsafe T,
    generation: UInt32,
    epoch_caps: UInt32,       // high 16 bits: epoch; low 16: capability flags
};
```

Used for `&T` when `T: Sized`. The `generation` and `epoch_caps` are
fixed at reference creation; the CBGR check compares them against the
allocation's `AllocationHeader` on every deref.

### `FatRef<T>` — 32 bytes

```verum
type FatRef<T> is {
    ptr: *unsafe T,
    generation: UInt32,
    epoch_caps: UInt32,       // epoch in high 16 bits, capabilities in low 16
    metadata: UInt64,         // slice length, dyn-protocol vtable pointer, etc.
    offset:   UInt32,         // non-zero for interior references
    reserved: UInt32,         // padding + room for future fields
};
```

Used when `T` is unsized — slices (`[T]`) and trait objects (`dyn P`) —
and for interior references that need an offset into a larger allocation.

### `AllocationHeader` — 32 bytes, cache-aligned

```verum
type AllocationHeader is {
    generation: UInt32,       // incremented on free
    epoch:      UInt32,       // wraparound-safety
    flags:      UInt32,       // drop impl, pinned, capabilities
    layout_size: UInt32,      // for realloc / sanity
    _padding:   UInt64,       // align to 32 bytes
    layout:     Layout,       // size, align
};
```

Prepended to every CBGR-tracked allocation. The header lives in the
same cache line as (or adjacent to) the object, so the CBGR check is
typically a hot L1 hit.

### CBGR check sequence (conceptual)

```verum
fn deref<T>(r: ThinRef<T>) -> &T {
    let hdr = header_of(r.ptr);
    if hdr.generation != r.generation {
        handle_use_after_free(&r, &hdr);
    }
    if (r.epoch_caps >> 16) != hdr.epoch {
        handle_epoch_mismatch(&r, &hdr);
    }
    unsafe { &*r.ptr }
}
```

Measured: **~0.93 ns** on the `production_targets` bench
(x86_64 release build), well under the ≤ 15 ns design target.

---

## `Heap<T>` — unique owned allocation

```verum
Heap.new(value) -> Heap<T>                      // panics on OOM
Heap.new_default() -> Heap<T>                   // T: Default
Heap.new_zeroed() -> Heap<T>
Heap.try_new(value) -> Result<Heap<T>, AllocError>
Heap.from_raw(ptr) -> Heap<T>                   // unsafe
```

### Introspection

```verum
h.as_ref() -> &T                   h.as_mut() -> &mut T
h.into_inner() -> T                h.into_raw() -> &unsafe T   (leaks)
h.leak() -> &mut T                 // leaks; returns static-lifetime mut ref
h.generation() -> UInt32
h.epoch() -> UInt16
h.capabilities() -> UInt16
h.is_valid() -> Bool
h.is_allocated() / h.is_freed() -> Bool
h.header_generation() / h.header_epoch() / h.header_size()
```

### Implements

`Deref`, `DerefMut`, `Drop`, `Clone` (deep-copy if `T: Clone`),
`Debug`, `Eq`, `Ord`, `Hash`, `Default` (if `T: Default`).

---

## `Shared<T>` — atomically ref-counted

```verum
Shared.new(value) -> Shared<T>
s.clone() -> Shared<T>              // bumps refcount
s.weak() -> Weak<T>                 // does not bump strong count
Shared.strong_count(&s) -> Int
Shared.weak_count(&s) -> Int
Shared.try_unwrap(s) -> Result<T, Shared<T>>   // succeeds if strong_count == 1
Shared.get_mut(&mut s) -> Maybe<&mut T>         // Some if unique
```

`Weak<T>.upgrade() -> Maybe<Shared<T>>` — returns `Some` if the target
is still live. Used to break reference cycles.

---

## Allocator protocol

```verum
type Allocator is protocol {
    fn alloc(&self, layout: Layout) -> Result<*mut Byte, AllocError>;
    fn dealloc(&self, ptr: *mut Byte, layout: Layout);
    fn realloc(&self, ptr: *mut Byte, old: Layout, new: Layout)
        -> Result<*mut Byte, AllocError>;
}

type Layout is { size: Int, align: Int };
type AllocError is OutOfMemory | InvalidLayout | Refused;
```

### Default allocator — `cbgr_alloc`

```verum
unsafe fn cbgr_alloc(layout: Layout) -> *mut Byte
unsafe fn cbgr_alloc_zeroed(layout: Layout) -> *mut Byte
unsafe fn cbgr_dealloc(ptr: *mut Byte, layout: Layout)
unsafe fn cbgr_realloc(ptr: *mut Byte, old: Layout, new: Layout) -> *mut Byte
```

### Context-scoped allocator

```verum
set_context_allocator(alloc: &dyn Allocator)
ctx_alloc(layout: Layout) -> Result<*mut Byte, AllocError>       using [Allocator]
ctx_dealloc(ptr, layout)                                          using [Allocator]
```

Using an arena or slab allocator for a task tree:

```verum
let arena = GenerationalArena.new(capacity: 1 << 20);
provide Allocator = arena in {
    build_parse_tree(source).await
};
// Dropping the scope drops all arena memory in O(1).
```

---

## Alignment

```verum
fn align_up(x: Int, align: Int) -> Int
fn align_down(x: Int, align: Int) -> Int
fn is_aligned(x: Int, align: Int) -> Bool
```

---

## Hazard pointers

```verum
type HazardGuard<T> is { ... };
HazardGuard.acquire(slot: Int, ptr: *const T) -> HazardGuard<T>
guard.release()                       // explicit drop also works
```

Used internally to keep reads safe against a concurrent `free`. A
reader installs its target in a hazard slot before the CBGR check; a
freer scans all hazard slots before returning memory to the pool.

---

## Epoch manager

```verum
type EpochManager is { ... };

EpochManager.global() -> &EpochManager
mgr.current() -> UInt32
mgr.advance()                         // bump epoch (typically timer-driven)
mgr.register_thread()
mgr.retire(callback: fn())
```

Epochs are the safety net for 32-bit generation wraparound: each
thread carries an epoch that advances periodically (~1 kHz), and a
reference with a stale epoch fails the check even if the generation
field collided.

---

## Capabilities

```verum
type Capability is UInt16;           // bitflags

const CAP_READ:   UInt16 = 0x0001;
const CAP_WRITE:  UInt16 = 0x0002;
const CAP_ADMIN:  UInt16 = 0x0004;
const CAP_DELEGATE: UInt16 = 0x0008;
const CAP_REVOKE:   UInt16 = 0x0010;
// Application-defined: bits 5..15
```

Embedded in the low 16 bits of the `epoch_caps` field of references.
`Database with [Read]` compiles to a reference with only `CAP_READ`
set; attempts to call a write method hit a compile-time check against
the method's required capability set.

---

## `GenerationalArena<T>`

```verum
type GenerationalArena<T> is { ... };

GenerationalArena.new(capacity) -> GenerationalArena<T>
a.insert(value) -> ArenaHandle<T>
a.get(handle) -> Maybe<&T>
a.get_mut(handle) -> Maybe<&mut T>
a.remove(handle) -> Maybe<T>
a.clear()                     // O(1) mass invalidation via epoch bump
a.len() / a.is_empty() / a.capacity()
```

Arenas are the idiomatic choice for:
- AST trees (parser lifetimes)
- Game engine objects (frame-scoped)
- Request-scoped data (web-server tasks)

---

## Segment allocator (internal)

```verum
const SEGMENT_SIZE:  Int = 32 * 1024 * 1024;   // 32 MiB
const SLICE_SIZE:    Int = 512 * 1024;         // 512 KiB
const BIN_COUNT:     Int = 73;                 // size classes

type Segment is { ... };
type PageKind is Small | Medium | Large | Huge;
type SizeClass is { bin: Int, size: Int };

fn size_to_bin(size: Int) -> Int
fn bin_to_size(bin: Int) -> Int
fn size_class(size: Int) -> SizeClass
```

Allocations are grouped into 73 size classes spaced at ~12.5%
intervals. Small objects (< 8 KiB) come from thread-local segments;
medium / large allocations are bookkept separately.

---

## `LocalHeap`

```verum
type LocalHeap is { ... };

LocalHeap.current() -> &LocalHeap
heap.alloc(layout) -> Result<*mut Byte, AllocError>
heap.free(ptr, layout)
heap.stats() -> AllocStats
```

Thread-local heap. Lock-free fast path; spills into the global heap
for cross-thread frees.

---

## Raw memory operations

```verum
unsafe fn memcpy(dst: *mut Byte, src: *const Byte, n: Int)
unsafe fn memmove(dst: *mut Byte, src: *const Byte, n: Int)   // overlap-safe
unsafe fn memset(dst: *mut Byte, byte: Byte, n: Int)
unsafe fn memcmp(a: *const Byte, b: *const Byte, n: Int) -> Int
unsafe fn strlen(ptr: *const Byte) -> Int                      // NUL-terminated
unsafe fn strcmp(a: *const Byte, b: *const Byte) -> Int
```

These bypass CBGR. Use only in allocator implementations, FFI
boundaries, or when you can prove safety by other means.

---

## Constants

```verum
const GEN_INITIAL:     UInt32 = 1;
const GEN_MAX:         UInt32 = 0xFFFF_FFFE;
const GEN_UNALLOCATED: UInt32 = 0;

const EPOCH_INITIAL:   UInt32 = 1;
const EPOCH_INTERVAL_MS: Int = 1;             // advance 1000×/s

const SSO_CAPACITY:    Int = 23;              // Text inline capacity
const PAGE_SIZE:       Int = 4096;            // architecture-dependent
```

---

## Errors

```verum
type UseAfterFreeError is {
    ptr: *unsafe Byte,
    gen_expected: UInt32,
    gen_actual:   UInt32,
    epoch_expected: UInt32,
    epoch_actual:   UInt32,
};

type RevocationError is { ptr: *unsafe Byte, revoker: Text };
type AllocError      is OutOfMemory | InvalidLayout | Refused;
```

On a CBGR violation, the runtime:
1. Constructs a `UseAfterFreeError` with full diagnostic context.
2. Invokes the installed panic handler (default: abort with stack
   trace).

---

## CBGR execution tiers

```verum
type ExecutionMode is Interpreter | Aot;

fn current_mode() -> ExecutionMode
fn is_interpreted() -> Bool
```

Execution mode affects how the CBGR check is produced, not whether
it runs:

- **Interpreter**: software check every deref, via the VBC
  `Deref` / `DerefMut` opcodes — the safe-by-default path, because
  the interpreter validates every reference regardless of the
  reference's static CBGR tier.
- **AOT**: each CBGR tier lowers to a distinct code sequence in
  LLVM IR. Tier-0 references emit the load-compare-branch pattern;
  tier-1 references proven safe by escape analysis are elided to a
  direct load (0 ns); tier-2 `&unsafe T` references compile to a
  direct load with no check.

There is no JIT tier in between; a Verum program runs either in
the interpreter or as AOT-compiled native code.

---

## Cross-references

- **[Language → memory model](/docs/language/memory-model)** — the user-level story.
- **[Language → references](/docs/language/references)** — `&T` / `&checked T` / `&unsafe T`.
- **[Language → CBGR](/docs/language/cbgr)** — conceptual model.
- **[Architecture → CBGR internals](/docs/architecture/cbgr-internals)** — data structures + algorithms.
- **[intrinsics](/docs/stdlib/intrinsics)** — `ptr_read`, `ptr_write`, `volatile_load/store`.
- **[sys](/docs/stdlib/sys)** — OS-level `os_alloc` / `os_free` under the segment allocator.
