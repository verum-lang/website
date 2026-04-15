---
sidebar_position: 4
title: mem
---

# `core::mem` — Memory management

The `mem` module is the implementation of CBGR and the allocator
stack. Most code does not import it directly — `Heap`, `Shared`, and
references are in `base`. This page is for the internals.

## `Heap<T>`

Owned, single-owner heap allocation. Dropped when the owner is dropped.

```verum
let x: Heap<Tree> = Heap(Tree.Leaf);
```

Layout: `pointer + CBGR header` (32 bytes of metadata).

## `Shared<T>`

Atomically reference-counted. `Send` if `T: Send + Sync`.

```verum
let cfg = Shared(Config::default());
let clone = cfg.clone();    // bump refcount
```

## `Rc<T>`

Non-atomic reference-counted (`!Send`). Cheaper than `Shared` when
single-threaded.

## Allocators

```verum
type Allocator is protocol {
    fn alloc(&self, layout: Layout) -> Result<*mut Byte, AllocError>;
    fn dealloc(&self, ptr: *mut Byte, layout: Layout);
    fn realloc(&self, ptr: *mut Byte, old: Layout, new: Layout) -> Result<*mut Byte, AllocError>;
};

type Layout is { size: Int, align: Int };
```

The default allocator is `cbgr_alloc` — a Mimalloc-style segmented
allocator with generation tracking.

## CBGR primitives

```verum
type AllocationHeader is {       // 32 bytes, cache-aligned
    generation: UInt32,
    epoch:      UInt32,
    flags:      UInt32,
    layout:     Layout,
};

type ThinRef<T> is {             // 16 bytes
    ptr: *unsafe T,
    generation: UInt32,
    epoch_caps: UInt32,
};

type FatRef<T>  is {             // 32 bytes (for unsized T)
    ptr: *unsafe T,
    generation: UInt32,
    epoch_caps: UInt32,
    len_or_vtable: Int,
};
```

User code rarely constructs these directly; the compiler emits them
for `&T`.

## Hazard pointers

```verum
type HazardGuard<T> is { ... };
// Protects a `*mut T` from concurrent revocation while held.
```

Used internally by the allocator to prevent race conditions between
free and concurrent deref.

## Generational arenas

```verum
let arena: GenerationalArena<Node> = GenerationalArena::new(capacity: 1024);
let h1 = arena.insert(Node::new());
// Drop the entire arena in O(1) by advancing the generation;
// all outstanding handles are invalidated atomically.
```

Useful for game loops, parser ASTs, request-scoped allocation.

## Segment allocator

```
Segment: 32 MiB chunk, lazy-committed.
PageHeader: metadata per page within a segment.
LocalHeap: thread-local heap, lock-free fast path.
```

73 size classes spaced at 12.5% intervals. Allocations under the page
size go through the thread-local heap; larger allocations use mmap
directly.

## `os_alloc` / `os_free`

```verum
unsafe fn os_alloc(layout: Layout) -> *mut Byte;
unsafe fn os_free(ptr: *mut Byte, layout: Layout);
```

Platform-direct allocation. Bypasses CBGR entirely. Used for the
segment allocator's backing store and for allocations that must never
have generation bookkeeping (e.g., memory passed to the kernel for DMA).

## Alignment

```verum
fn align_up(x: Int, align: Int) -> Int;
fn align_down(x: Int, align: Int) -> Int;
fn is_aligned(x: Int, align: Int) -> Bool;
```

## Errors

```verum
type UseAfterFreeError is { ptr: *unsafe Byte, gen_expected: UInt32, gen_actual: UInt32 };
type RevocationError   is { ptr: *unsafe Byte };
type AllocError        is
    | OutOfMemory
    | InvalidLayout
    | Refused;
```

## Performance constants

```verum
const GEN_INITIAL:     UInt32 = 1;
const GEN_MAX:         UInt32 = 0xFFFF_FFFE;
const GEN_UNALLOCATED: UInt32 = 0;
const PAGE_SIZE:       Int    = 4096;    // architecture-dependent
```

## See also

- **[Language → CBGR](/docs/language/cbgr)** — the user-level
  semantics.
- **[Architecture → CBGR internals](/docs/architecture/cbgr-internals)**
  — the full implementation.
- **[sys](/docs/stdlib/sys)** — the V-LLSI layer underlying `mem`.
