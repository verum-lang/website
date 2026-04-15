---
sidebar_position: 5
title: Dependent Types
---

# Dependent Types

Verum supports full dependent types — types that depend on values.
Practical applications include length-indexed arrays, proof-carrying
APIs, and cubical higher-inductive types.

:::note Status
Dependent type support is **production** (phase D complete as of v0.32).
Cubical and HoTT features are in **active development** but tested:
1506 / 1507 conformance checks pass.
:::

## Sigma types (dependent pairs)

```verum
// A vector whose length is part of its type.
type Vec is n: Int, data: [Int; n];

fn push(v: Vec, x: Int) -> Vec {
    (v.n + 1, v.data.push(x))
}
```

The syntax `name: Type` in a `type ... is` position introduces a
dependent binding. The second and later components can refer to earlier
names.

## Pi types (dependent functions)

```verum
// A function whose return type depends on its argument.
fn replicate<T>(n: Int { self >= 0 }, x: T) -> [T; n] {
    [x; n]
}

// Consumer
fn main() {
    let xs: [Int; 10] = replicate(10, 0);
}
```

Π-types arise naturally from refined types: the return type `[T; n]`
depends on the _value_ `n`, not on a type-level numeral.

## Type-level computation

```verum
type Apply<F<_>, A> = F<A>;

type Matrix<const R: Int, const C: Int, T> is
    { data: [[T; C]; R] };

fn mul<const A: Int, const B: Int, const C: Int, T: Numeric>(
    m1: &Matrix<A, B, T>,
    m2: &Matrix<B, C, T>,
) -> Matrix<A, C, T> {
    // shape is checked at the type level
    ...
}
```

Calling `mul` with incompatible shapes is a compile error, not a
runtime panic.

## Path types (cubical)

A `Path<A>(a, b)` is a proof that `a` and `b` are equal as elements of
`A`. Path types are computationally meaningful in Verum — equality
proofs are _data_ you can transport along.

```verum
// Reflexivity: every value is path-equal to itself.
fn refl<A>(x: A) -> Path<A>(x, x) {
    @builtin_refl(x)
}

// Symmetry.
fn sym<A>(p: Path<A>(x, y)) -> Path<A>(y, x) {
    @builtin_path_lambda(|i| p(1 - i))
}

// Transport along a path: moves a value from one equal type to another.
fn transport<A: Type -> Type>(
    p: Path<Type>(A, B),
    x: A,
) -> B {
    @builtin_transport(p, x)
}
```

## Interval type

The interval `I` is the domain of paths: `I` has two endpoints
`i0, i1` and a continuous structure.

```verum
type PathLike<A> = fn(i: I) -> A;
// where p(i0) = a and p(i1) = b
```

Primitive operations:
- `i0, i1` — the endpoints.
- `meet(i, j)` — minimum.
- `join(i, j)` — maximum.
- `rev(i)` — reversal (`1 - i`).

## Higher-inductive types

HITs allow you to declare **path constructors** — not just values, but
equalities between them.

```verum
type Circle is
    | Base
    | Loop() = Base..Base;   // path from Base to Base

type Interval is
    | Zero
    | One
    | Seg()  = Zero..One;
```

Pattern matching on a HIT must handle both point and path constructors
(checked for coherence by the compiler).

## Univalence (computational)

Verum's cubical normaliser implements **computational univalence** —
an equivalence between types becomes a path between them, and
transport along that path behaves operationally.

```verum
fn ua<A, B>(e: Equiv<A, B>) -> Path<Type>(A, B) {
    @builtin_ua(e)
}

// Now we can transport a value along the equivalence:
let a: A = ...;
let b: B = transport(ua(e), a);
// And the compiler computes what transport does — no runtime proxy.
```

## Proof erasure

Dependent-type machinery is **erased** during the VBC codegen phase.
Path values, univalence applications, and transports become no-ops or
identity operations in the bytecode. The cost model:

- Type-level computation: compile time only.
- Proof terms: compiled to identity functions that the optimiser
  eliminates.
- Dependent pattern matching: same code as ordinary matching.

## When to reach for dependent types

- **Array operations where shape matters**: matrix multiplication,
  tensor reshape, static broadcasting.
- **Protocol invariants**: "this state machine returns to `Idle`
  before it can accept another request".
- **Zero-cost validation**: `Vec` with length in the type means no
  bounds check is ever needed.
- **HoTT-style reasoning**: quotient types, localisations, effect
  handlers expressed as equivalences.

## When not to

- Plain CRUD code. Refinement types usually suffice.
- First-time reading of Verum. Start with refinements, graduate when
  you have a reason.

See also:
- **[Cubical & HoTT](/docs/verification/cubical-hott)** — deeper
  treatment of cubical features.
- **[Proofs](/docs/verification/proofs)** — theorem/lemma/proof DSL.
