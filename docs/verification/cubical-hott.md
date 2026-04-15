---
sidebar_position: 6
title: Cubical & HoTT
---

# Cubical Type Theory and HoTT

Verum's type system includes a **cubical** fragment — path types,
higher-inductive types, and computational univalence. This allows
equational reasoning that plain SMT cannot express.

:::note Status
Production. The cubical normaliser implements 8 reduction rules
including computational univalence. See
**[architecture → overview](/docs/architecture/overview)** for the
feature inventory and **[roadmap](/docs/roadmap)** for what's next.
:::

## Why cubical

Traditional equality is either:
- **Propositional**: `a == b` is a proposition; proofs live in a
  separate universe.
- **Definitional**: `a ≡ b` if they reduce to the same normal form;
  too coarse.

**Path equality** is better: `Path<A>(a, b)` is a _continuous path_
from `a` to `b` in type `A`. Paths compose, invert, and transport
values — and they are computational, meaning `transport refl x` really
does reduce to `x`.

## Path types

```verum
// Path in type A from a to b.
type Path<A> is (a: A, b: A) -> I -> A;

// Conceptually: a function from the interval [0,1] to A such that
// p(0) = a and p(1) = b.

// Reflexivity
fn refl<A>(x: A) -> Path<A>(x, x) {
    @builtin_refl(x)
}

// Inverse (symmetry)
fn sym<A>(p: Path<A>(x, y)) -> Path<A>(y, x) {
    @builtin_path_lambda(|i| p(rev(i)))
}

// Concatenation (transitivity)
fn trans<A>(p: Path<A>(x, y), q: Path<A>(y, z)) -> Path<A>(x, z) {
    @builtin_hcomp(p, q)
}
```

## The interval `I`

```verum
type I = /* primitive: the unit interval with endpoints i0, i1 */;

// Operations
i0, i1     : I                      // endpoints
meet(i, j) : I                      // minimum
join(i, j) : I                      // maximum
rev(i)     : I                      // reversal (1 - i)
```

The interval obeys the axioms of a De Morgan algebra with `0` and `1`.

## Transport

Transport moves a value along a type-level path:

```verum
fn transport<A: Type, B: Type>(p: Path<Type>(A, B), x: A) -> B {
    @builtin_transport(p, x)
}
```

Key property: `transport(refl(A), x) ≡ x` reduces definitionally.
Transport along a non-refl path performs the computation encoded in
the path — for univalence paths, this is the equivalence function.

## Higher-inductive types

HITs allow path constructors:

```verum
// Circle: one point and one non-trivial loop.
type Circle is
    | Base
    | Loop() = Base..Base;

// Interval: two endpoints and one path between them.
type Interval is
    | Zero
    | One
    | Seg() = Zero..One;

// Propositional truncation: any two elements are path-equal.
type Truncate<A> is
    | inj(A)
    | squash(x: Truncate<A>, y: Truncate<A>) = x..y;
```

Pattern matching on a HIT must handle both value and path
constructors; the compiler checks coherence.

```verum
fn circle_map<B>(base: B, loop_proof: Path<B>(base, base), c: Circle) -> B {
    match c {
        Circle.Base   => base,
        Circle.Loop() => loop_proof,
    }
}
```

## Computational univalence

The univalence axiom says: _type equivalence implies type equality_.
Verum's cubical normaliser implements this computationally.

```verum
fn ua<A, B>(e: Equiv<A, B>) -> Path<Type>(A, B) {
    @builtin_ua(e)
}

// Now:
let p = ua(int_to_nat_equiv);
let n: Nat = transport(p, 42);
// `transport` along `ua(e)` computes as `e.to(x)` — no opaque proxy.
```

Applications:
- **Quotient types**: express `Q = A / R` as a HIT, prove universal
  property, use it computationally.
- **Effect encodings**: free monads and effect handlers as
  equivalences between program fragments.
- **Formalising mathematics**: groups, rings, categories where
  "equivalent" and "equal" should not diverge.

## Proof erasure

Cubical machinery is **erased** during VBC codegen
(`verum_compiler::proof_erasure`). Paths, transports, and HIT path
cases compile to identity / passthrough operations. Your code runs at
full speed; the types are a compile-time tool.

## `Equiv<A, B>`

An equivalence is a function `A -> B` together with a two-sided
inverse:

```verum
type Equiv<A, B> is {
    to:       fn(A) -> B,
    from:     fn(B) -> A,
    left_id:  (x: A) -> Path<A>(from(to(x)), x),
    right_id: (y: B) -> Path<B>(to(from(y)), y),
    coh:      /* coherence condition */,
};
```

Constructing an `Equiv` is non-trivial; tactics (`by equiv`) handle
common cases.

## Tactics for cubical

```verum
theorem circle_loop_squared_is_refl() ->
    Path<Circle>(trans(Loop, Loop), refl(Base))
{
    by cubical_tactic;
}
```

The `cubical_tactic` combinator dispatches to specialised proof search
including:
- path reduction;
- HIT coherence;
- transport normalisation;
- glue / unglue simplifications.

See `verum_smt::cubical_tactic` for the routing.

## Limitations

- **Decidable equality** in the cubical fragment is not universal;
  some path goals require proof terms, not `by auto`.
- **HIT pattern matching** requires coherence proofs for branches on
  path constructors — the compiler emits them when the obligation is
  syntactic, otherwise asks the user.
- **Performance**: cubical reduction can be expensive at compile time
  for heavily quotient-typed code. Caching mitigates.

## When to use

- Formalising algebraic structures (groups, monoids, rings).
- Quotient types that must actually compute.
- Effect / program equivalences you want to use as rewrites.
- Research — HoTT applications in your domain.

For most Verum code — CRUD, protocols, systems logic — refinement and
dependent types are enough. Cubical is there when you need it.

## See also

- **[Dependent types](/docs/language/dependent-types)** — Σ, Π, paths
  at the surface level.
- **[Proofs](/docs/verification/proofs)** — tactic DSL.
- **[Architecture → SMT integration](/docs/architecture/smt-integration)**
  — cubical tactic dispatch.
