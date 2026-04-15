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
2. **CBGR** — Capability-Based Generational References — a ~15 ns
   runtime check that prevents use-after-free.
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
| Managed reference | `&T` | ~15 ns deref |
| Checked reference | `&checked T` | 0 ns |
| Unsafe reference | `&unsafe T` | 0 ns |
| Mutable variants | `&mut T`, `&checked mut T`, ... | same as above |
| Raw pointer | `*const T`, `*mut T` | 0 ns, requires `unsafe` |
| Heap | `Heap<T>` | 1 allocation, CBGR header |
| Shared | `Shared<T>` | 1 allocation, atomic refcount |

For the internals of CBGR, see **[CBGR](/docs/language/cbgr)** and
**[CBGR internals](/docs/architecture/cbgr-internals)**.
