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

The stdlib's `core/math/hott.vr` declares the type and its
introduction / elimination forms. These are the canonical
signatures — the compiler binds each `@builtin_*` to a
`CubicalExtended` VBC sub-op (see
`verum_vbc/src/codegen/expressions.rs` §4077+).

```verum
// Path in type A from a to b. Conceptually a function from the
// interval [0, 1] to A such that p(i0) = a and p(i1) = b.
public type Path<A>(a: A, b: A) is @builtin_path;

// Reflexivity
public fn refl<A>(x: A) -> Path<A>(x, x) {
    @builtin_refl(x)
}

// Inverse (symmetry)
public fn sym<A>(a: A, b: A, p: Path<A>(a, b)) -> Path<A>(b, a) {
    @builtin_sym(p)
}

// Concatenation (transitivity)
public fn trans<A>(a: A, b: A, c: A, p: Path<A>(a, b), q: Path<A>(b, c)) -> Path<A>(a, c) {
    @builtin_trans(p, q)
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
`ua` is declared as a Verum axiom in `core/math/hott.vr`:

```verum
public axiom ua<A, B>(e: Equiv<A, B>) -> Path<Type>(A, B);
```

Because `ua` is an axiom rather than a meta-intrinsic, every use of
it is visible to `verum audit --framework-axioms` tooling at the
proof-corpus level. With a concrete equivalence, transport along
`ua(e)` reduces by the cubical normaliser's rules (five of them,
implemented in `verum_smt/src/cubical_tactic.rs`):

```verum
let p = ua(int_to_nat_equiv);
let n: Nat = transport(p, 42);
// transport(ua(e), x)        ↦ e.forward(x)
// transport(sym(ua(e)), x)   ↦ e.inverse(x)
// transport(refl, x)         ↦ x
// hcomp(φ, const, base)      ↦ base
// Path(i, body)[endpoint]    ↦ body[i/endpoint]
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

The grammar exposes three cubical-specific tactics in its
`tactic_name` production: `cubical`, `category_simp`, and
`category_law`, plus the descent verifier `descent_check`.

```verum
theorem circle_loop_squared_is_refl() ->
    Path<Circle>(trans(Base, Base, Base, Loop, Loop), refl(Base))
{
    by cubical;
}
```

`by cubical` dispatches to the cubical normaliser
(`verum_smt::cubical_tactic`) which implements:

- path reduction (the five bullet-listed rules above);
- transport normalisation along `refl` / `ua(e)` / `sym(ua(e))`;
- HIT coherence checking for path-case branches;
- glue / unglue simplifications when Glue types land fully.

See `verum_smt/src/cubical_tactic.rs` for the routing.

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
  at the surface level; how they interleave with the rest of the
  language.
- **[Proofs](/docs/verification/proofs)** — tactic DSL and the
  kernel's role in re-checking every cubical proof term.
- **[Framework axioms](/docs/verification/framework-axioms)** —
  postulating external HoTT-adjacent results (Lurie HTT ∞-topoi,
  Baez–Dolan coherence, Schreiber DCCT super-cohesion) whose
  machinisation is out of scope.
- **[Architecture → SMT integration](/docs/architecture/smt-integration)**
  — cubical tactic dispatch.
- **[Architecture → trusted kernel](/docs/architecture/trusted-kernel)**
  — the typing rules for `PathTy`, `Refl`, `HComp`, `Transp`, and
  `Glue` that the kernel actually checks.
