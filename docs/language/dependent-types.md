---
sidebar_position: 5
title: Dependent Types
---

# Dependent Types

Verum supports full dependent types — types that depend on values.
Practical applications include length-indexed arrays, proof-carrying
APIs, and cubical higher-inductive types.

:::note Status
Dependent type support is **production**. Cubical and HoTT features
are implemented and tested — 1 506 / 1 507 conformance checks pass.
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

## Tensors — shape in the type

The stdlib's `Tensor<T: Numeric, meta Shape: [USize]>` is the
production use of dependent types. The shape is a compile-time list
of sizes; the compiler checks every operation against it.

```verum
mount std.tensor.{Tensor, matmul, softmax, reshape};

fn attention<
    T: Numeric,
    meta B: USize,          // batch
    meta H: USize,          // heads
    meta L: USize,          // sequence length
    meta D: USize,          // per-head dimension
>(
    q: &Tensor<T, [B, H, L, D]>,
    k: &Tensor<T, [B, H, L, D]>,
    v: &Tensor<T, [B, H, L, D]>,
) -> Tensor<T, [B, H, L, D]> {
    let kt = k.transpose::<[0, 1, 3, 2]>();              // [B, H, D, L]
    let scores: Tensor<T, [B, H, L, L]> = matmul(q, &kt);
    let probs = softmax::<_, _, 3>(&scores);             // softmax on last dim
    matmul(&probs, v)
}
```

Everything load-bearing is *type-checked*:

- `matmul(a: [M, K], b: [K, N]) -> [M, N]` — a dimensions mismatch
  would be a compile error, not a runtime `DimensionError`.
- `transpose::<Perm>` carries `where meta Perm.is_permutation_of(0..ndim)`.
- `softmax::<_, _, Dim>` carries `where meta Dim < ndim`.
- `reshape<NewShape>` carries `where meta Shape.product() == NewShape.product()`.

The same `Tensor` type is the code path for CPU SIMD, GPU (MLIR),
and autodiff (`@differentiable`). Dropping down to runtime shapes is
explicit — `DynTensor<T>` with a `try_static::<Shape>() ->
Maybe<Tensor<T, Shape>>` conversion at boundaries.

## Worked example — a shape-safe matrix API

```verum
type Matrix<const R: Int, const C: Int, T: Numeric> is
    { data: [[T; C]; R] };

fn zeros<const R: Int, const C: Int, T: Numeric>() -> Matrix<R, C, T> {
    Matrix { data: [[T.zero(); C]; R] }
}

fn identity<const N: Int, T: Numeric>() -> Matrix<N, N, T> {
    let mut m = zeros::<N, N, T>();
    for i in 0..N { m.data[i][i] = T.one(); }
    m
}

fn mul<const A: Int, const B: Int, const C: Int, T: Numeric>(
    x: &Matrix<A, B, T>,
    y: &Matrix<B, C, T>,
) -> Matrix<A, C, T> {
    let mut out = zeros::<A, C, T>();
    for i in 0..A {
        for j in 0..C {
            let mut acc = T.zero();
            for k in 0..B { acc = acc + x.data[i][k] * y.data[k][j]; }
            out.data[i][j] = acc;
        }
    }
    out
}

fn caller() {
    let a: Matrix<3, 4, Float> = zeros();
    let b: Matrix<4, 2, Float> = zeros();
    let c: Matrix<3, 2, Float> = mul(&a, &b);   // OK
    // let d = mul(&a, &a);                     // compile error: 4 != 3
}
```

The shape error is a type mismatch, not a runtime `DimensionError`.
See **[Cookbook → shape-safe tensors](/docs/cookbook/shape-safe)**
for the stdlib `Tensor<Dims, T>` that generalises this pattern.

## See also

- **[Cubical & HoTT](/docs/verification/cubical-hott)** — deeper
  treatment of cubical features.
- **[Proofs](/docs/verification/proofs)** — theorem/lemma/proof DSL.
- **[Cookbook → shape-safe tensors](/docs/cookbook/shape-safe)**
- **[Cookbook → calc proofs](/docs/cookbook/calc-proofs)** — writing
  equational proofs with `Path` and the proof DSL.
- **[Verified data structure tutorial](/docs/tutorials/verified-data-structure)**
  — dependent types meet SMT-verified invariants.
