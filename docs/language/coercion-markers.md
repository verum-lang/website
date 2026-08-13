---
title: Coercion markers
description: How a type opts into the compiler's cross-type coercions — and why containers must never opt in.
---

# Coercion markers

Verum's unifier does **not** guess which of your types may stand in for
another. A type opts in, explicitly, by implementing a marker protocol from
`core/base/coercion.vr`. The markers are empty protocols — no methods, no
runtime cost — so that the coercion surface is a **declaration you can
read**, not a table buried in the compiler.

```verum
mount core.base.coercion.{IntCoercible};

type Fd is (Int);

implement IntCoercible for Fd {}   // Fd may now stand in for Int

fn takes_int(n: Int) -> Int { n + 1 }

takes_int(Fd(7))   // 8
```

Markers work for your own types, not only for the standard library's.

## The markers

| Marker | What implementing it buys | Implement it for |
|--------|---------------------------|------------------|
| `IntCoercible` | The type unifies with `Int` in both directions. | A newtype whose runtime representation **is** an integer: `FileDesc`, `Port`, `Duration` (nanoseconds), `MachPort`, `VmAddress`. |
| `SizedNumeric` | Sized integer types cross-coerce with each other (`USize` ↔ `UInt64`, `Int32` ↔ `I32`). | Sized numeric aliases. Rarely needed in user code. |
| `TensorLike` | `Float ↔ Tensor<Float>` in arithmetic, so `tensor + 1.0` needs no lift. | Tensor-shaped values: `DynTensor`, `Vector`. |
| `RangeLike` | The type unifies with a `(start, end)` tuple, so slice notation composes. | Types presenting an interval shape: `Range`, `RangeInclusive`. |
| `ArrayCoercible` | Array literals (`[1, 2, 3]`) unify with the type at use sites. | Sequence containers: `List`, `Deque`. |
| `BytewiseFfi` | The type unifies with `[Byte]` / `[UInt8]` for FFI. | Types whose in-memory layout **is** a packed C-struct byte mirror: `Sockaddr`. Never a higher-level wrapper like `SocketStream`. |

`Indexable` also lives in `core/base/coercion.vr`, but it is a **declarative
marker only** — the unifier does not read it, and implementing it buys no
compiler behaviour today. Indexing (`xs[i]`) works without it.

## The rule that matters

> Implement a marker only for a type that **is** the thing it coerces with.

`IntCoercible` says "a value of this type may be used where an `Int` is
declared, and vice versa". That is true of a file descriptor. It is not true
of a `Maybe`, a `List`, or a range — those *contain* things, they are not
integers.

The distinction is not stylistic. A marker on a container disables type
checking for every value of that type, and the failure is silent:

```verum
// If Maybe<T> were IntCoercible:
let m: Maybe<Int> = xs.first();
let z: Int = m;        // accepted — nothing converts anything
print(z + 1);          // prints a large number that differs on every run
```

`z` holds the `Maybe`'s raw representation, and `z + 1` adds one to a
pointer. No panic, no warning, exit status 0. A test that *runs* this code
passes; only a test that checks the output catches it.

The same shape applies to `let y: Int = xs;` for a list, and to a
constructor argument: `Maybe.Some(xs.first())` builds `Maybe<Maybe<Int>>`
where `Maybe<Int>` is promised.

All three are rejected today:

```
error<E400>: Type mismatch: expected 'Int', found 'List<Int>'
error<E400>: Type mismatch: expected 'Int', found 'None(Unit) | Some(Int)'
error<E400>: Type mismatch: expected 'Int', found 'Maybe<Int>'
```

## Indexing does not need a coercion

A common mistake is to reason: "`xs[i]` yields a sized integer, so the
container must coerce with `Int`". It does not follow. An index expression
produces the **element**, and element-vs-`Int` widening — `slice[i] + 1`
where the element is a `USize` — is what `IntCoercible` and `SizedNumeric`
already cover on the element type. The container never enters the
comparison:

```verum
let mut xs: List<Int> = List.new();
xs.push(10); xs.push(20); xs.push(30);

let e: Int = xs[1];      // element, no container coercion involved
let n: Int = xs.len();
for i in 0..3 { ... }    // ranges likewise
```

## Marker checklist

Before adding `implement <Marker> for MyType {}`, answer these:

1. **Is the runtime representation the same thing?** A newtype over `Int`
   qualifies for `IntCoercible`; a struct holding an `Int` among other
   fields does not.
2. **Would the coercion ever produce a value nobody converted?** If yes, the
   marker is wrong — coercion markers assert *sameness*, they do not insert
   conversions.
3. **Is a method clearer?** `fd.as_int()` costs one call and cannot be
   applied by accident. Prefer it when the coercion is convenience rather
   than identity.

## See also

- [Types](./types.md) — declaration forms, newtypes, aliases
- [Generics](./generics.md) — how type parameters unify
- [FFI](./ffi.md) — `BytewiseFfi` and the byte-buffer boundary
