---
sidebar_position: 8
title: Algebraic Data Types
---

# Algebraic Data Types

Verum's verification layer encodes declared variant types
(`type T is A | B | C;`) with two complementary families of SMT
axioms: **pairwise disjointness** and **exhaustiveness**. Together
they give Z3/CVC5 complete information about inhabitants of the
variant sort without introducing a dedicated ADT datatype to the
solver context — the encoding rides entirely on uninterpreted
integer constants, keeping every SMT query in a theory combination
the backends handle well.

This page describes the encoding, the claims it supports, and the
axioms the verifier emits on your behalf.

## The encoding contract

For every module-scope variant declaration

```verum
public type Color is Red | Green | Blue;
```

the verifier emits — before checking any theorem in the module —
two families of facts:

### 1. Pairwise disjointness

One axiom per distinct pair of constructors:

```
Color.Red   != Color.Green
Color.Red   != Color.Blue
Color.Green != Color.Blue
```

*N* constructors yield *N·(N−1)/2* axioms. These are asserted on
the solver in `ProofSearchEngine::try_smt_discharge` alongside
user-level requires and stdlib invariants.

### 2. Exhaustiveness

For every theorem parameter `p: Color`, the hypothesis

```
p == Color.Red || p == Color.Green || p == Color.Blue
```

is added to the obligation's hypothesis set before the goal is
sent to the solver. Combined with pairwise disjointness, this
means Z3 knows:

* `p` takes exactly one of the declared constructor values, and
* those values are mutually distinct.

Exhaustiveness is emitted on a per-parameter basis — parameters
typed as non-variant types receive nothing additional.

## What you can prove

The encoding supports every claim expressible over nullary
variants (enums):

### Reflexivity and identity

```verum
theorem ctor_reflex(): Color.Red == Color.Red { proof by auto }
```

### Distinctness

```verum
theorem red_ne_green(): Color.Red != Color.Green { proof by auto }
```

Uses a disjointness axiom.

### Exhaustiveness

```verum
theorem color_enum(c: Color):
    c == Color.Red || c == Color.Green || c == Color.Blue
{ proof by auto }
```

Uses the exhaustiveness hypothesis for `c`.

### Negation-based case elimination

```verum
theorem non_red_implies(c: Color) requires c != Color.Red:
    c == Color.Green || c == Color.Blue
{ proof by auto }
```

Derives from exhaustiveness plus the `requires`.

### Pattern matching over variants

```verum
fn color_to_int(c: Color) -> Int
    ensures result == 1 || result == 2 || result == 3
{
    match c {
        Color.Red => 1,
        Color.Green => 2,
        Color.Blue => 3,
    }
}
```

The match translator lowers to an `ite`-chain using the
disjointness axioms to propagate constructor identity through
each branch.

## Scope and limits

**In scope** (full automation):

* Nullary variants — `type T is A | B | C;` with no payload.
* Pairwise equality / distinctness claims.
* Exhaustiveness claims over declared constructors.
* Match expressions with literal or constructor-reference
  discriminators.
* Combinations of the above — `requires`/`ensures` chains,
  conjunctions, disjunctions, implications.

**Out of scope** (planned in the ADT-datatype follow-up):

* Variants with payload arguments — `Some(T)`, `Cons(T, List<T>)`.
  The current encoding can state `None != Some` because the
  constructor references are distinct Z3 symbols, but it cannot
  decompose a `Some(v)` term and reason over `v`.
* Structural equality modulo constructor arguments — two
  `Cons(1, [2,3])` terms being equal because their components
  are.
* Inductive recursion principles — `∀c: T. P(c)` reduced to
  case-by-case reasoning.

For those claims use the `@verify(certified)` strategy or a
`proof by induction` body with explicit case bodies; the
underlying CVC5 backend has ADT datatype support (activated
via the SyGuS path at `@verify(synthesize)`). Verum also
emits real Z3 datatypes for `Type::Variant` via the type
translator — each variant becomes a Z3 constructor with
payload-typed fields, and structurally identical variant
types cache to the same sort.

## How the registry is populated

At the start of each verify pass, `verify_cmd::verify_module`
walks every `ItemKind::Type` with a `TypeDeclBody::Variant` body
and collects two things:

1. A list of **disjointness axioms** (N·(N−1)/2 per variant type).
   Passed to the proof engine via `register_axiom`; asserted on
   every `try_smt_discharge` solver context.
2. A **(type-name, ctor-names)** registry. Registered on the
   engine via `register_variant_type`; consulted by the
   hypothesis-elaboration pass (`variant_exhaustiveness_hypotheses`)
   when a theorem parameter is typed as a variant.

No stdlib hardcoding — the same machinery applies to user-defined
types, stdlib types (`Maybe`, `Result`), and UHM-corpus types
indistinguishably.

## Soundness

The encoding is conservative by construction:

* Disjointness axioms state `T.A != T.B` — this is sound for
  any interpretation that uses distinct values for distinct
  syntactic constructors, which is the language's declared
  semantics.
* Exhaustiveness axioms state a disjunction over the declared
  constructors — sound for any closed variant type. Verum does
  not have open/extensible variants at this layer.
* False claims fail: `theorem c: Color => c == Red || c == Green`
  (missing Blue) correctly reports a counterexample `c = Blue`.

Every commit that touched this encoding was accompanied by a
false-theorem soundness regression test confirming the rejection
behaviour.

## Implementation pointers

* `crates/verum_compiler/src/phases/proof_verification.rs`:
  * `variant_disjointness_axioms(module)` — axiom emission.
  * `variant_exhaustiveness_hypotheses(theorem, map)` — per-theorem
    hypothesis elaboration.
* `crates/verum_smt/src/proof_search.rs`:
  * `ProofSearchEngine::register_axiom` — module-level axiom
    channel.
  * `ProofSearchEngine::register_variant_type` — variant registry.
  * `try_smt_discharge` — assertion site.
* `crates/verum_smt/src/translate.rs`:
  * Field-access arm disambiguates `Type.Variant` (uppercase
    receiver) from record field access, so both sides of
    `c == Color.Red` denote the same Z3 symbol.

## Further reading

* [SMT routing](smt-routing.md) — how Z3 and CVC5 are dispatched.
* [Refinement reflection](refinement-reflection.md) — user function
  unfolding at the solver level.
* [Proofs](proofs.md) — tactic surface and proof-body forms.
