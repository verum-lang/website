---
sidebar_position: 6
title: Cubical & HoTT
---

# Cubical Type Theory and HoTT

Verum's type system includes a **cubical** fragment — path types,
higher-inductive types, and computational univalence. This allows
equational reasoning that plain SMT cannot express.

:::caution What on this page runs

The machinery below the surface is real: each `@builtin_*` binds to a
`CubicalExtended` VBC sub-op, the interpreter implements twelve of
them, LLVM lowers them, and `verum_smt.cubical_tactic` reasons about
the types. What is missing sits above all of that — type inference has
no arm for these names.

**Mounting the shipped library fails.** `core.math.hott` is what
declares the signatures shown on this page, and a file that brings
them in stops at the type checker:

```
mount core.math.hott.{ HottPath, refl };
fn same_value<T>(x: T) -> HottPath<T>(x, x) { refl(x) }

error<E400>: Type mismatch: expected '@builtin_path', found 'Unit'
```

**Declaring them yourself compiles and runs — and checks nothing.**
The same shape written into your own file is accepted, executes, and
also accepts `let x: Int = myrefl(7);` — which prints `x=nil`. The
checker has no trouble with the shape in general: an ordinary record in
that position is refused with `error<E400>: Type mismatch: expected
'Int', found 'Wrapped'`. The refusal goes missing specifically for a
type declared through `@builtin_path`. The compiler's only remark is a
warning:

```
warning<E0410>: unknown meta-function `@builtin_refl`; @ prefix is
reserved for compile-time constructs
```

So the reduction rules, univalence and the tactic surface described
below are implemented — but the path types in front of them are not
yet enforced. This box stops being true when the two examples above
swap places: the mount succeeding, and the `Int` binding refused.
:::

## Why cubical

Traditional equality is either:
- **Propositional**: `a == b` is a proposition; proofs live in a
  separate universe.
- **Definitional**: `a ≡ b` if they reduce to the same normal form;
  too coarse.

**Path equality** is better: `HottPath<A>(a, b)` is a _continuous
path_ from `a` to `b` in type `A`. Paths compose, invert, and
transport values — and they are computational, meaning
`transport refl x` really does reduce to `x`.

## Path types

The stdlib's `core/math/hott.vr` declares the type and its
introduction / elimination forms. These are the canonical
signatures — the compiler binds each `@builtin_*` to a
`CubicalExtended` VBC sub-op via the
`@builtin_refl` / `@builtin_transport` / `@builtin_sym` /
`@builtin_trans` arms in
`verum_vbc::codegen::expressions::try_compile_builtin`.

```verum
// Path in type A from a to b. Conceptually a function from the
// interval [0, 1] to A such that p(i0) = a and p(i1) = b.
public type HottPath<A>(a: A, b: A) is @builtin_path;

// Reflexivity
public fn refl<A>(x: A) -> HottPath<A>(x, x) {
    @builtin_refl(x)
}

// Inverse (symmetry)
public fn sym<A>(a: A, b: A, p: HottPath<A>(a, b)) -> HottPath<A>(b, a) {
    @builtin_sym(p)
}

// Concatenation (transitivity)
public fn trans<A>(a: A, b: A, c: A, p: HottPath<A>(a, b), q: HottPath<A>(b, c)) -> HottPath<A>(a, c) {
    @builtin_trans(p, q)
}
```

Both forms reach their codegen arms and emit the corresponding
`CubicalExtended` sub-op. The type checker accepts the `builtin_` namespace;
lowering must preserve the selected operation.

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
fn transport<A: Type, B: Type>(p: HottPath<Type>(A, B), x: A) -> B {
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
fn circle_map<B>(base: B, loop_proof: HottPath<B>(base, base), c: Circle) -> B {
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
public axiom ua<A, B>(e: Equiv<A, B>) -> HottPath<Type>(A, B);
```

Because `ua` is an axiom rather than a meta-intrinsic, every use of
it is visible to `verum audit --framework-axioms` tooling at the
proof-corpus level. With a concrete equivalence, transport along
`ua(e)` reduces by the cubical normaliser's rules (eight of them,
implemented in `verum_smt/src/cubical_tactic.rs`):

```verum
let p = ua(int_to_nat_equiv);
let n: Nat = transport(p, 42);
// 1. transport(refl, x)        ↦ x
// 2. transport(ua(e), x)       ↦ e.fwd(x)
// 3. transport(sym(ua(e)), x)  ↦ e.bwd(x)
// 4. hcomp(base, refl(sides))  ↦ base
// 5. (λi. body) @ endpoint     ↦ body[i := endpoint]
// 6. refl(x) @ _               ↦ x
// 7. sym(refl(x))              ↦ refl(x)
// 8. ua(id_equiv)              ↦ refl(Type)
```

The named kernel implements ordinary `Transport` over reflexivity and
reflexive `PathOver` reduction in
`crates/verum_kernel/src/support.rs::normalize_core`. These rules do not
establish the full Kan-fibrancy obligations.

Named `HComp` and `Glue` are refused with an `UnsupportedCubical` error.
Their syntax is retained for diagnostics, but neither typing nor normalization
interprets variable names as face evidence. A supported implementation requires
typed interval contexts, partial elements, boundary agreement and checked
gluing equivalences. An abstract exported rule schema or a catalogue entry
does not establish acceptance by the named kernel.

The face algebra in `crates/verum_kernel/src/cofibration.rs` supplies canonical
finite joins, meets, implication and endpoint restriction. Its immutable
normal forms remove contradictions, duplicate clauses and absorbed clauses.
The verification parser lowers into this shared algebra only after checking
all mentioned dimensions against an explicit scope, including dimensions
whose occurrences disappear during simplification. This checks the face
formula; it does not discharge the cubical term's remaining obligations.
In particular, `(i = 0) ∨ (i = 1)` is not the whole interval.

`crates/verum_kernel/src/interval.rs` provides a separate De Morgan interval
algebra: endpoints, dimensions, meet, join, involution and substitution.
Its canonical expressions preserve `i ∧ ~i ≠ 0` and `i ∨ ~i ≠ 1`; treating
intervals as Boolean values would invalidate cubical reasoning. Endpoint
projection maps an interval expression into the shared face algebra.
`Context::extend_dimension` and `Context::check_interval` check a separate
dimension namespace. `Context::assume_face` adds scoped face assumptions;
`entails_face` checks coverage and `intervals_equal` checks interval equality
under every disjunct of the assumption. Free dimensions retain their full
De Morgan structure: agreement at their endpoints alone is insufficient.
Scope errors are rejected even under contradictory assumptions. General
interval substitution on faces commutes with endpoint projection.

Interval expressions are not ordinary terms in a fibrant universe. These
library judgments do not yet provide cubical path binders, partial elements
or equality of term-valued boundaries required to admit `HComp` and `Glue`.

The named term `Transport(p, x)` requires `p : Path(Type(u), A, B)`
and `x : A`, and returns a term of `B`. It reduces to `x` only when `p`
normalizes to `Refl(A)`. Neutral paths remain explicit. Local names such as
`i1`, `true` or `1` carry no computational authority. The serialized named
term uses the `Transport` tag with `path` and `value` fields; legacy `Transp`
payloads with a regularity argument are rejected.

This operation does not implement generalized cubical `transp`. That operation
requires a typed interval and a constancy judgment on the specified face,
as described in the [Cubical Agda transport rules](https://agda.readthedocs.io/en/latest/language/cubical.html#transport).
The named kernel does not currently provide that judgment. Its reflexivity
rule belongs to ordinary identity elimination and must not be presented as
Cubical Agda's definitional equality.

For `PathOver(M, p, x, y)`, the named kernel requires evidence
`p : Path(B, a, b)`, a family `M : B → U`, and endpoints
`x : M(a)` and `y : M(b)`. A path-type annotation cannot substitute for
path evidence. `PathOver(M, Refl(a), x, y)` reduces to the homogeneous
path `Path(M(a), x, y)`. Coincident endpoints of an otherwise neutral loop
do not authorize this reduction. This is the reflexive case of dependent
paths described in [A Cubical Approach to Synthetic Homotopy Theory](https://dlicata.wescreates.wesleyan.edu/pubs/lb15cubicalsynth/lb15cubicalsynth.pdf).
Higher inductive elimination remains refused until its path-coherence
evidence is checked; see [current limitations](/docs/architecture/verification-pipeline#current-limitations).

## External-prover cross-check via Cubical Agda

The kernel-soundness export ships a **Cubical Agda** theory file
alongside the Lean / Coq / Isabelle exports. Cubical Agda is the
only major prover with native CCHM cubical support
(`{-# OPTIONS --cubical #-}`) — it natively reduces `transport`,
`hcomp`, and `Glue` primitives instead of treating them as
opaque postulates. The export at
`verification/external/agda/KernelSoundness.agda` is re-checked
by `agda --cubical KernelSoundness.agda` as part of the
`verum audit --external-prover-replay` gate; see
[external-prover-verification](/docs/architecture/external-prover-verification)
for the four-foundation cross-export pipeline.

Applications:
- **Quotient types**: express `Q = A / R` as a HIT, prove universal
  property, use it computationally.
- **Effect encodings**: free monads and effect handlers as
  equivalences between program fragments.
- **Formalising mathematics**: groups, rings, categories where
  "equivalent" and "equal" should not diverge.

## Proof erasure

Cubical machinery is **erased** during VBC codegen
(`verum_compiler::phases::proof_erasure`). Paths, transports, and HIT path
cases compile to identity / passthrough operations. Your code runs at
full speed; the types are a compile-time tool.

## `Equiv<A, B>`

An equivalence is a function `A → B` paired with a two-sided
inverse plus the full HoTT coherence package. The stdlib's
`core/math/hott.vr` declares the type as:

```verum
public type Equiv<A, B> is {
    forward:  fn(A) -> B,
    backward: fn(B) -> A,
    fwd:      fn(A) -> B,
    bwd:      fn(B) -> A,
    proof:    IsEquiv<A, B>,
};
```

`forward` / `backward` are the canonical pair; `fwd` / `bwd` are
short aliases the cubical-tactic dispatcher pattern-matches on. The
`proof` field carries the full quasi-inverse witness `IsEquiv<A, B>`:

```verum
public type IsEquiv<A, B> is {
    forward:    fn(A) -> B,
    inverse:    fn(B) -> A,
    section:    fn(b: B) -> HottPath<B>(forward(inverse(b)), b),
    retraction: fn(a: A) -> HottPath<A>(inverse(forward(a)), a),
    coherence:  /* HoTT coherence — the two ways of showing
                   f(g(f(a))) = f(a) agree */
};
```

All four function fields must be supplied at construction so the
struct layout stays predictable. Constructing an `Equiv` is
non-trivial; the `by cubical` tactic handles common cases.

## Tactics for cubical

The grammar exposes three cubical-specific tactics in its
`tactic_name` production: `cubical`, `category_simp`, and
`category_law`, plus the descent verifier `descent_check`.

```verum
theorem circle_loop_squared_is_refl():
    HottPath<Circle>(trans(Base, Base, Base, Loop, Loop), refl(Base))
{
    proof by cubical
}
```

`by cubical` dispatches to the cubical normaliser
(`verum_smt::cubical_tactic`) which implements:

- path reduction (the eight bullet-listed rules above);
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
- **The shipped stdlib surface reports `Unit`.** The declarations above
  work when you write them out yourself — a local `type MyPath<A>(a, b)
  is @builtin_path;` with its `@builtin_refl` constructor compiles and
  runs. Calling the ARCHIVED ones does not: `mount core.math.hott.{refl};
  let x: Int = refl(7);` answers `expected 'Int', found 'Unit'`, so the
  archive did not keep `refl`'s declared return type. Everything else in
  this page — the axiom, the normaliser, the sub-ops — is present and
  checked.

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
  — supported path rules and the boundaries of native proof acceptance.
