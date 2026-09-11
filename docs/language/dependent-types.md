---
sidebar_position: 5
title: Dependent Types
---

# Dependent Types

Verum supports full dependent types — types that depend on values.
Practical applications include length-indexed arrays, proof-carrying
APIs, and cubical higher-inductive types.

:::caution The path-type section is the intended surface, not a working one

Measured 2026-09-10. Σ-types, Π-types and the length-indexed examples
on this page work. The **path / HoTT** block further down has two
problems a reader meets immediately.

**Bringing in the shipped library stops at the type checker.**
`core/math/hott.vr` calls the type `HottPath`, not `Path`:

```
mount core.math.hott.{ HottPath, refl };
fn same_value<T>(x: T) -> HottPath<T>(x, x) { refl(x) }

error<E400>: Type mismatch: expected '@builtin_path', found 'Unit'
```

**Writing the declarations out yourself compiles and runs — and checks
nothing.** The `@builtin_*` calls do reach real `CubicalExtended`
bytecode, so a program built this way produces a value. The type it
produces, though, unifies with anything:

```verum
public type MyPath<A>(a: A, b: A) is @builtin_path;
public fn myrefl<A>(x: A) -> MyPath<A>(x, x) { @builtin_refl(x) }

fn main() { let x: Int = myrefl(7); }
```

That file checks clean, runs, and prints `x=nil` — a path type accepted
where an `Int` was demanded, and delivering nothing. It is not that the
checker cannot see this shape; an ordinary type in the same position is
refused:

```verum
public type Wrapped is { v: Int };
public fn wrap(x: Int) -> Wrapped { Wrapped { v: x } }

fn main() { let x: Int = wrap(7); }
// error<E400>: Type mismatch: expected 'Int', found 'Wrapped'
//   — this block is a counter-example; the refusal IS the point.
```

The refusal goes missing specifically for a type declared through
`@builtin_path`, and the reason is in the type checker rather than in
codegen. `@builtin_*` is an open namespace whose meaning lives at the
stdlib declaration site, so inference gives any name under it a *fresh
type variable* — which unifies with `Int`, with `Wrapped`, with anything
the surrounding signature happens to declare.

The `warning<E0410>: unknown meta-function` that used to accompany these
calls is gone as of 2026-09-11, and it was never the right diagnostic:
the parser lacked the prefix rule the type checker and the attribute
validator both carry, so it reported names the compiler deliberately
accepts. What replaced it speaks only when nothing implements a name, and
it speaks from codegen, where that is knowable.

So the VALUES are real now — `@builtin_refl(x)` reaches its
`CubicalExtended` arm rather than compiling to `nil`. The TYPE is still
the fresh variable above, which is why the example below type-checks
where it should not. Read the guarantee, not the acceptance, as design
intent.
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

### The two surface forms of Π

Verum lets you write a dependent function in two equivalent ways.
Both elaborate to the same core dependent-function (`Π`) type in the
kernel. Both were compiled before being written here.

**1. Value-dependent `fn` signature** — the everyday form:

```verum
fn replicate<T>(n: Int { self >= 0 }, x: T) -> [T; n] {
    [x; n]
}
```

**2. `where` / `ensures` clause** — preferred when the relation is
complex or when you want a separate name for the proof:

```verum
fn push<T>(v: List<T, n>, x: T) -> List<T, n + 1>
    where n: Nat
    ensures |result| == |v| + 1
{ ... }
```

:::caution There is no explicit `Pi` surface syntax
`Π` is the kernel's name for the dependent-function type, not
something you write. `type ReplicateOf<T> is Pi (n: Int) . [T; n];`
is a parse error — the parser stops at the `.`. Write the dependent
function itself, in one of the two forms above, and let it elaborate.

The same applies to the implicit-binder spelling described below:
`Pi { k: K } (m: Map<K, V>) . Maybe<V>` does not parse either.
Implicit parameters are written on the function's own generics.
:::

### Implicit parameters

A Π-binder written with curly braces is **implicit** — filled in by
inference at the call site, the way Agda and Lean handle them:

In Verum that binder is the function's own generic parameter list —
there is no separate `Pi` spelling to write it in:

```verum
fn lookup<K, V>(m: Map<K, V>) -> Maybe<V> { Maybe.None }
```

The caller writes `lookup(my_map)` and the compiler synthesises `K`
and `V` from the argument. Use implicit parameters for
proof-relevant indices that should not clutter the call site.

### Universe of a Π

A Π-type lives in `max(u_domain, u_codomain)` by default, where the
universes are those of the binder and the body. If the body lands in
`Prop`, the Π lands in `Prop` — this is the `imax` rule that makes
propositions impredicative. See [Universes](./universes.md) for the
full story.

### Relationship to refinement types

A refinement `T { P(self) }` is exactly a Σ (dependent pair)
`Σ (x: T) . P(x)` with `P(x) : Prop`. The dual, a refinement on a
function's *output*, is exactly a Π: `Π (x: A) . { y: B | Q(x, y) }`.
Both are written here in mathematical notation, not Verum syntax.
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

`@builtin_sym` and `@builtin_transport` draw `warning<E0410>: unknown meta-function` exactly as `@builtin_refl` does above; the block is the intended shape, not a working one.

The stdlib ships these in `core/math/hott.vr` under the name
`HottPath` — spelled `Path` here for readability, so copy the names
from the library rather than from this block. The `@builtin_*`
intrinsics on the right-hand side really are bound to the
`CubicalExtended` VBC opcode family by the compiler, one arm apiece in
`verum_vbc::codegen::expressions::try_compile_builtin`.

What is *not* yet in place is their TYPE — and the reason is more
specific than "no arm". Inference has a dedicated arm for the whole
`builtin_` prefix, and what that arm returns is a *fresh type variable*:
the name's real type lives at the stdlib declaration site, not in a table
inside the compiler, so bidirectional checking is meant to unify the
variable against the type the surrounding signature declares. A fresh
variable unifies with anything, which is exactly why the signature is
accepted without the body ever contradicting it — see the box at the top
of this page for what that costs you.

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
    const B: USize,          // batch
    const H: USize,          // heads
    const L: USize,          // sequence length
    const D: USize,          // per-head dimension
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
