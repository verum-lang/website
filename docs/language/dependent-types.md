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

### The three surface forms of Π

Verum lets you write a dependent function in three equivalent ways.
All three elaborate to the same core `Ty.Pi` node in
`crates/verum_types/src/ty.rs`.

**1. Value-dependent `fn` signature** — the everyday form:

```verum
fn replicate<T>(n: Int { self >= 0 }, x: T) -> [T; n] {
    [x; n]
}
```

**2. `where` / `ensures` clause** — preferred when the relation is
complex or when you want a separate name for the proof:

```verum
fn push<T>(v: Vec<T, n>, x: T) -> Vec<T, n + 1>
    where n: Nat
    ensures |result| == |v| + 1
{ ... }
```

**3. Explicit `Pi` form** — for type aliases, protocol methods, and
proof terms where no function definition is yet at hand:

```verum
// As a type alias.
type ReplicateOf<T> is Pi (n: Int) . [T; n];

// As a protocol method signature.
type Indexed<T> is protocol {
    fn at : Pi (i: Int) (s: Self) . T
        where i < s.length;
};

// As an argument type.
fn fold<T, U>(xs: Vec<T, n>, z: U, step: Pi (i: Int) . fn(U, T) -> U) -> U { ... }
```

All three forms carry identical semantics; the compiler normalises
them to the same internal representation.

### Implicit parameters

A Π-binder written with curly braces is **implicit** — filled in by
inference at the call site, the way Agda and Lean handle them:

```verum
type Lookup<K, V> is Pi { k: K } (m: Map<K, V>) . Maybe<V>;
```

The caller writes `lookup(my_map)` and the compiler synthesises `k`.
Use implicit parameters for proof-relevant indices that should not
clutter the call site.

### Universe of a Π

A Π-type lives in `max(u_domain, u_codomain)` by default, where the
universes are those of the binder and the body. If the body lands in
`Prop`, the Π lands in `Prop` — this is the `imax` rule that makes
propositions impredicative. See [Universes](./universes.md) for the
full story.

### Relationship to refinement types

A refinement `T { P(self) }` is exactly a Σ (dependent pair)
`Σ (x: T) . P(x)` with `P(x) : Prop`. The dual, a refinement on a
function's *output*, is exactly a Π: `Pi (x: A) . { y: B | Q(x, y) }`.
Refinements and dependent types are **two syntaxes for one machinery**.

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

// Symmetry: flip a path.
fn sym<A>(a: A, b: A, p: Path<A>(a, b)) -> Path<A>(b, a) {
    @builtin_sym(p)
}

// Transport along a path: moves a value from one equal type to another.
fn transport<A, B>(p: Path<Type>(A, B), x: A) -> B {
    @builtin_transport(p, x)
}
```

These are the exact signatures the stdlib ships in
`core/math/hott.vr` — the `@builtin_*` intrinsics on the RHS are
bound to `CubicalExtended` VBC opcodes by the compiler
(`verum_vbc/src/codegen/expressions.rs` §4077+), and their return
types are carried by the surrounding signature through the generic
opaque-intrinsic rule in `verum_types.infer`.

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

Verum accepts two equivalent spellings for the endpoint metadata on a
path constructor. The range form is concise:

```verum
type Circle is
    | Base
    | Loop() = Base..Base;   // path from Base to Base

type Interval is
    | Zero
    | One
    | Seg()  = Zero..One;
```

The **type-annotation form** mirrors the mathematical `Path<C>(a, b)`
presentation and is the spelling used throughout `core/math/hott.vr`:

```verum
type S1 is
    | base
    | loop: Path<S1>(base, base);

type Susp<A> is
    | north
    | south
    | merid(a: A): Path<Susp<A>>(north, south);

type Pushout<A, B, C>(f: fn(C) -> A, g: fn(C) -> B) is
    | inl(a: A)
    | inr(b: B)
    | push(c: C): Path<Pushout<A, B, C>(f, g)>(inl(f(c)), inr(g(c)));
```

Both forms lower to the same `PathConstructor` metadata on the
variant, and both support unit, tuple, and record payloads on the
constructor. Variant names may be drawn from Verum's keyword space
(`loop`, `merid`, etc.) — variant constructors live in their own
namespace and never collide with reserved identifiers.

Pattern matching on a HIT must handle both point and path constructors
(checked for coherence by the compiler).

## Univalence (computational)

Verum's cubical normaliser implements **computational univalence** —
an equivalence between types becomes a path between them, and
transport along that path behaves operationally.

`ua` is postulated as a Verum axiom (the canonical univalence
postulate) and lives in `core/math/hott.vr`:

```verum
public axiom ua<A, B>(e: Equiv<A, B>) -> Path<Type>(A, B);
```

Because it's an axiom rather than a meta-intrinsic, any use of `ua`
is visible to downstream trusted-boundary tooling. With a concrete
equivalence you can then transport:

```verum
// Now we can transport a value along the equivalence:
let p: Path<Type>(A, B) = ua(e);
let b: B = transport(p, a);
// And the cubical normaliser computes what transport does —
//   transport(ua(e), x)       ↦ e.forward(x)
//   transport(sym(ua(e)), x)  ↦ e.inverse(x)
//   transport(refl, x)        ↦ x
// — so there is no runtime proxy; the equivalence is computationally
// eliminated by the cubical reduction rules in
// verum_smt.cubical_tactic.
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
mount core.math.tensor.{Tensor, matmul, softmax, reshape};

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
    let kt = k.transpose<[0, 1, 3, 2]>();              // [B, H, D, L]
    let scores: Tensor<T, [B, H, L, L]> = matmul(q, &kt);
    let probs = softmax<_, _, 3>(&scores);             // softmax on last dim
    matmul(&probs, v)
}
```

Everything load-bearing is *type-checked*:

- `matmul(a: [M, K], b: [K, N]) -> [M, N]` — a dimensions mismatch
  would be a compile error, not a runtime `DimensionError`.
- `transpose<Perm>` carries `where meta Perm.is_permutation_of(0..ndim)`.
- `softmax<_, _, Dim>` carries `where meta Dim < ndim`.
- `reshape<NewShape>` carries `where meta Shape.product() == NewShape.product()`.

The same `Tensor` type is the code path for CPU SIMD, GPU (MLIR),
and autodiff (`@differentiable`). Dropping down to runtime shapes is
explicit — `DynTensor<T>` with a `try_static<Shape>() ->
Maybe<Tensor<T, Shape>>` conversion at boundaries.

## Worked example — a shape-safe matrix API

```verum
type Matrix<const R: Int, const C: Int, T: Numeric> is
    { data: [[T; C]; R] };

fn zeros<const R: Int, const C: Int, T: Numeric>() -> Matrix<R, C, T> {
    Matrix { data: [[T.zero(); C]; R] }
}

fn identity<const N: Int, T: Numeric>() -> Matrix<N, N, T> {
    let mut m = zeros<N, N, T>();
    for i in 0..N { m.data[i][i] = T.one(); }
    m
}

fn mul<const A: Int, const B: Int, const C: Int, T: Numeric>(
    x: &Matrix<A, B, T>,
    y: &Matrix<B, C, T>,
) -> Matrix<A, C, T> {
    let mut out = zeros<A, C, T>();
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

## Relation to the trusted kernel

Π, Σ, Path, HComp, Transp, Glue, and the inductive elimination
principle each have a dedicated typing rule in `verum_kernel`.
Dependent-type proofs reach the kernel as `CoreTerm` values with
the exact domain / codomain structure preserved, so the kernel's
App rule substitutes arguments into codomains capture-avoidingly
and the Path rule checks endpoint types against the carrier.

The kernel is the **sole** trusted checker — a bug in the cubical
NbE evaluator, the dependent elaborator, or a tactic cannot accept
a false theorem; it can only fail to construct a valid proof term
or fail at the kernel gate.

See **[Architecture → trusted kernel](/docs/architecture/trusted-kernel)**
for the full typing-rule table.

## See also

- **[Cubical & HoTT](/docs/verification/cubical-hott)** — deeper
  treatment of cubical features.
- **[Proofs](/docs/verification/proofs)** — theorem/lemma/proof DSL.
- **[Framework axioms](/docs/verification/framework-axioms)** —
  postulating dependent results from external mathematics
  (Lurie HTT ∞-topos results, Connes reconstruction, etc.) so
  stratified corpora stay audit-able.
- **[Architecture → trusted kernel](/docs/architecture/trusted-kernel)**
  — the LCF-style check loop and the 18 active typing rules.
- **[Cookbook → shape-safe tensors](/docs/cookbook/shape-safe)**
- **[Cookbook → calc proofs](/docs/cookbook/calc-proofs)** — writing
  equational proofs with `Path` and the proof DSL.
- **[Verified data structure tutorial](/docs/tutorials/verified-data-structure)**
  — dependent types meet SMT-verified invariants.
