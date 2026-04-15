---
sidebar_position: 11
title: References
---

# References

Verum has three reference tiers plus raw pointers. This page gives the
precise semantics and usage patterns for each.

## Tier 0 — `&T` (managed)

The default. A 16-byte reference (`ThinRef<T>`) consisting of:

- an 8-byte pointer to the object;
- a 4-byte generation tag;
- 4 bytes of epoch/capability metadata.

For unsized types (slices, `dyn Protocol`), the reference is a 32-byte
`FatRef<T>` carrying an additional length or vtable pointer.

**Each dereference** performs one CBGR check against the object's
header (~15 ns on typical x86_64). If the generation has advanced, the
check aborts with a `UseAfterFreeError`.

```verum
fn first<T>(xs: &List<T>) -> &T { &xs[0] }
```

**When the compiler can prove the reference cannot dangle**, escape
analysis rewrites the function signature from `&T` to `&checked T`
automatically — the 15 ns disappears. This is a compile-time decision;
no runtime logic changes.

## Tier 1 — `&checked T` (zero-cost)

A raw 8-byte pointer with a **compile-time proof** that the pointer is
live for the duration it is used.

```verum
fn tight_loop(data: &checked List<Int>) -> Int {
    data.iter().fold(0, |acc, x| acc + x)
}
```

You ask for `&checked T` when you want a guarantee from the compiler
that the CBGR check is eliminable. If the compiler cannot prove it, the
function is rejected:

```
error[V5201]: cannot prove reference is safe for `&checked T`
  --> src/foo.vr:7:14
   |
 7 | fn run(x: &checked Config) -> Int { ... }
   |            ^^^^^^^^ `x` may escape into a stored location
   |
   = help: use `&T` (CBGR-checked) if escape is intentional,
           or refactor to prevent storage of `x`.
```

`&checked T` is typically used:
- on hot paths where ~15 ns per deref compounds;
- at function boundaries where the caller naturally provides a short-lived reference;
- in generic numeric / iterator code where the compiler's escape
  analysis is robust.

## Tier 2 — `&unsafe T` (you prove it)

```verum
fn fast_copy(dst: &unsafe mut Byte, src: &unsafe Byte, n: Int) {
    unsafe { memcpy(dst, src, n); }
}
```

`&unsafe T` has the same 8-byte layout as `&checked T` but requires no
compiler proof. Creating one, passing it, and storing it is safe;
**dereferencing** it requires an `unsafe { ... }` block.

You use `&unsafe T` when:
- interfacing with C code;
- the compiler genuinely cannot verify a property you know to hold
  (e.g., a pointer sourced from a memory-mapped region);
- writing primitives inside `core::mem`.

In application code, `&unsafe T` should be rare — typically confined
to a single function with a comment explaining the obligation.

## Coercion rules

```
&checked T   ≤   &T             (automatic widening)
&unsafe T    ≤   &checked T     (requires `unsafe`)
&T           ↛   &checked T     (requires proof)
&T           ↛   &unsafe T      (requires `unsafe`)
```

## Mutable references

Each tier has a mutable variant.

```verum
&mut T            // exclusive, CBGR-checked
&checked mut T    // exclusive, zero-cost
&unsafe mut T     // exclusive, you prove it
```

The standard aliasing rules apply at each tier: while a mutable
reference exists, no other reference to the same value (of any tier)
may coexist.

## Interior mutability

Sometimes you need mutation through an immutable reference (caching,
lazy initialisation). The standard library exposes this via:

- `Cell<T>` — copy-based interior mutability, `!Sync`.
- `RefCell<T>` — borrow-checked at runtime, `!Sync`.
- `OnceCell<T>` — write-once, `!Sync`.
- `AtomicCell<T>` — atomic, `Sync`.
- `Mutex<T>` / `RwLock<T>` — locked, `Sync`.

These types carry the mutation API; their reference is still `&T` on
the outside.

## References in data structures

Storing a reference in a struct commits you to its lifetime. In Verum,
this is usually done via `Shared<T>` (ref-counted) or a borrow-checker
approved `&'a T` when the compiler can track the scope:

```verum
type Cache<'a> is {
    hot: &'a Map<Key, Value>,
    ...
};
```

In practice, most Verum code avoids lifetime-parameterised structs —
CBGR makes `Shared<Map<Key, Value>>` a cheap and safe alternative.

## Taking addresses

```verum
let x = 42;
let r: &Int         = &x;
let c: &checked Int = &checked x;   // requires proof
let u: &unsafe Int  = &unsafe x;    // explicit
```

Address-of operators follow the tier of the storage. `&x` of a local
is always taken as `&T`; the compiler may promote it to `&checked T`
if the analysis succeeds.

## Raw pointers

```verum
*const T        *mut T        *volatile T        *volatile mut T
```

Raw pointers are produced via `ptr::addr_of!`, `ptr::addr_of_mut!`, or
FFI boundary casts. They do not carry lifetime; dereferencing them is
`unsafe`.

Use raw pointers for:
- FFI with C APIs that take `void*` / `T*`;
- memory-mapped I/O (the `*volatile` variant forbids compiler reorderings);
- implementation of the memory subsystem itself.

## See also

- **[Memory model](/docs/language/memory-model)** — ownership,
  mutability, drops.
- **[CBGR](/docs/language/cbgr)** — how the generational check works.
- **[CBGR internals](/docs/architecture/cbgr-internals)** — the
  runtime data structures.
