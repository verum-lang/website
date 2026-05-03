---
sidebar_position: 18
title: Articulation Hygiene
---

# Articulation Hygiene

> Every "self-X" surface in Verum factorises as `(Φ, Φ^κ, t)` where
> Φ is an explicit endofunctor, Φ^κ its κ-iteration, and t a terminal
> or fixed object. The depth witness blocks the Yanofsky paradox
> schema at compile time without requiring per-paradox tricks.

Articulation Hygiene is the surface-syntax companion to the kernel's
[`K-Refine`](trusted-kernel.md) depth check. Where `K-Refine` enforces
strict M-iteration depth-stratification at the level of CoreTerms,
Articulation Hygiene lifts the same discipline up to the surface
syntax of Verum: every recursive type, corecursive observation, HIT
path-cell, recursive function, or `self`-bearing protocol body is
required to admit a `(Φ, κ, t)` factorisation, where Φ is an explicit
endofunctor and κ a depth witness.

This page is normative for [VVA](../architecture/verification-pipeline.md)
§13.

---

## 1. Principle (NO-19)

The hygiene principle is a single rewriting law:

> **NO-19.** Every Verum surface form that names itself reflexively
> (`Self`, `This`, `Same`, `Own`, the type's own name in a
> constructor argument, `@recursive` / `@corecursive` markers,
> path-cell variants of HITs, quote-syntax inside meta) must be
> reducible to a triple `(Φ, Φ^κ, t)` where:
>
> - **Φ** is an *explicit* endofunctor on the carrier category;
> - **Φ^κ** is its κ-iteration with κ a definite ordinal (1, ω,
>   ω^op, …);
> - **t** is a *named* terminal or fixed object reached by the
>   iteration.

The triple is a *depth witness*: the existence of `(Φ, κ, t)` means
the self-reference goes through a definite number of M-iteration
steps, and the kernel can refuse any reflexive use that would force
`dp(self) ≥ dp(carrier) + 1`. This is exactly the inequality
[Yanofsky 2003](https://arxiv.org/abs/math/0305282) shows is required
for the universal paradox schema; blocking it at the surface closes
Russell, Curry, Cantor, Burali-Forti, Tarski, Lawvere, Girard,
Gödel-style diagonals, Löb, Grelling–Nelson — all at once.

Verum sits between two extremes here:

- **Coq / Lean / Agda**: forbid impredicativity with a strict
  positivity check on inductive constructors, then patch around the
  remaining problems case-by-case (Coq's `Set` impredicative-Prop
  toggle, Lean's quotient-axiom soundness proof, Agda's
  `--without-K`). Each system internalises a *different* set of
  paradox-blockers.
- **Haskell / OCaml**: do not block paradoxes at all (System F admits
  Russell-typing if `forall a. a` is inhabited; soundness comes from
  the runtime).

Verum's stance: a single rule (`K-Refine` + Articulation Hygiene as
its surface lift) closes every paradox schema simultaneously, and
the implementation cost is bounded by the size of the §13.2
factorisation table — eight rows.

---

## 2. The hygiene table (§13.2)

| Surface form | Factorisation `(Φ, κ, t)` |
|---|---|
| `Self` (in protocol body) | `(Id, 1, receiver_object)` |
| `Self::Item` | `(AssocProj<Item>, 1, receiver_type)` |
| `@recursive fn f(... -> Self) ...` | `(unfold_f, ω, fix_f)` |
| Mutable `&mut self` | `(Id_via_write, 1, current)` |
| Inductive `Rec(...)` in `type T is Base \| Rec(T)` | `(T_succ, ω, least_fp)` |
| Coinductive `Stream<A> = Cons(A, Stream<A>)` | `(T_prod_A, ω^op, greatest_fp)` |
| HIT `S1` with `Loop() = Base..Base` | `(loop_action, ω, base)` |
| Quote `` `expr `` (meta) | `(Meta_lift, 1, expr_ast)` |

**Reading the triples.** Each triple is to be read as: the surface
form denotes the κ-th iterate of Φ applied to t.

- `(Id, 1, receiver_object)` — the trivial factorisation: `self`
  in a protocol body is the receiver, after one application of the
  identity functor.
- `(T_succ, ω, least_fp)` — the inductive type is the least
  fixed-point of the *successor functor* `T_succ(X) = Base + Rec(X)`,
  reached after ω iterations from `Base`.
- `(T_prod_A, ω^op, greatest_fp)` — the coinductive type is the
  *greatest* fixed-point (ω^op = inverse-limit construction) of
  `T_prod_A(X) = A × X`.
- `(loop_action, ω, base)` — a HIT path-cell variant `Loop() =
  Base..Base` denotes the action of a loop `Loop : base = base` after
  ω iterations.
- `(Meta_lift, 1, expr_ast)` — quoting an expression in the
  meta-system is one application of `Meta_lift`, the syntax-to-AST
  promotion functor.

The factorisations matter in two places: **as documentation** they
let a reader understand the categorical structure of each construct;
**as compiler discipline** they give the kernel a definite κ to
substitute into `K-Refine`'s `dp` calculation.

---

## 3. Compiler enforcement

Hygiene is staged across two layers — a *reporter* that surfaces the
profile of a corpus and a binding *kernel pass* that turns
unfactorable self-references into compile-time errors.

### 3.1 The audit reporter

```bash
verum audit --hygiene src/
verum audit --hygiene --format json src/   # CI-friendly
```

The reporter walks every type and function declaration in the
project and classifies each self-referential surface form per the
§13.2 table. It is non-binding — its goal is to surface the
hygiene profile of the corpus so authors can review it.

Recognised surfaces:

| Surface detected | Hygiene class | Factorisation |
|---|---|---|
| `type T is Base \| Rec(T)` (Path self-reference) | `inductive` | `(T_succ, ω, least_fp)` |
| `type Tree<A> is Branch(Tree<A>, Tree<A>)` (Generic self-reference) | `inductive` | as above |
| `type Stream<A> is coinductive { ... }` | `coinductive` | `(T_prod, ω^op, greatest_fp)` |
| `type S1 is Base \| Loop() = Base..Base` (path-cell variant) | `higher-inductive` | `(path_action, ω, base)` |
| `type X is (Y)` (newtype body) | `newtype` | `(Id, 1, base)` |
| `@recursive fn f(...) -> Self` | `recursive-fn` | `(unfold_f, ω, fix_f)` |
| `@corecursive fn g(...)` | `corecursive-fn` | `(corec_g, ω^op, fix_g)` |

The recursion walker is deliberately conservative: it descends
through `TypeKind::{Path, Generic, Tuple, Array, Slice, Function,
Reference, DependentApp, PathType}` so that recursion through any
nested type position is detected, but it does not follow type
aliases. Conservativity in this direction (false negatives) is
acceptable; the alternative direction (over-flagging) would block
valid code.

**Sample output:**

```text
Articulation Hygiene factorisations 
──────────────────────────────────────────────────
  Parsed 1 .vr file(s), skipped 0 unparseable file(s).

  Found 7 self-referential surface(s) across 5 hygiene class(es):

  ▸ coinductive  factorisation=(T_prod, ω^op, greatest_fp)
    · Stream  —  src/lib.vr

  ▸ corecursive-fn  factorisation=(corec_g, ω^op, fix_g)
    · naturals  —  src/lib.vr

  ▸ higher-inductive  factorisation=(path_action, ω, base)
    · S1  —  src/lib.vr

  ▸ inductive  factorisation=(T_succ, ω, least_fp)
    · Nat  —  src/lib.vr
    · IntList  —  src/lib.vr
    · Tree  —  src/lib.vr

  ▸ recursive-fn  factorisation=(unfold_f, ω, fix_f)
    · ackermann  —  src/lib.vr
```

JSON output mirrors the same data with `schema_version: 1` for
deterministic CI consumption.

### 3.2 The kernel pass

```bash
verum check --hygiene src/
```

The kernel pass promotes the hygiene profile from advisory metadata
to a binding invariant. It:

1. Walks *raw* `self` occurrences inside function bodies (the
   reporter looks only at the AST surface — the kernel pass needs
   an expression-tree walker).
2. Resolves the §13.2 entries that require typed name resolution:
   `Self::Item` (associated-type projection), `&mut self`
   (reference-mode-aware factorisation), and `self` in protocol
   *body* positions where the receiver type is determined by the
   protocol declaration.
3. Emits `E_HYGIENE_UNFACTORED_SELF` for any self-reference whose
   factorisation cannot be reconstructed from the §13.2 table.

When the kernel pass is enabled, hygiene is enforced mechanically;
without it, the reporter output remains a useful corpus-wide signal
that authors and reviewers can act on.

---

## 4. Worked examples

### 4.1 `Nat` — the canonical inductive

```verum
public type Nat is Zero | Succ(Nat);
```

Reporter classification: `inductive`, factorisation `(T_succ, ω,
least_fp)`. The successor functor `T_succ(X) = 1 + X` has its least
fixed-point at ω iterations from `Zero` — the well-known
construction of ℕ as the initial algebra of the maybe-monad.

In `K-Refine` terms: `dp(Nat) = 1` (one M-iteration step beyond the
universe of its constructors), so any predicate over `Nat` must
satisfy `dp(P) < 2` — i.e. `P` lives at universe ≤ 1. A predicate
like `Nat.eq` lives at universe 0 and satisfies the inequality;
the diagonal predicate `λ n. ¬(P_n n)` (Russell-style) would push
`dp(P)` past the threshold and is rejected.

### 4.2 `Stream<A>` — the canonical coinductive

```verum
public type Stream<A> is coinductive {
    fn head(&self) -> A;
    fn tail(&self) -> Stream<A>;
};
```

Reporter classification: `coinductive`, factorisation `(T_prod,
ω^op, greatest_fp)`. The functor `T_prod_A(X) = A × X` has its
greatest fixed-point as the inverse limit — the categorical dual of
the inductive case. Productivity (each observation step terminates)
is the corecursion side of `K-Refine`.

### 4.3 `S1` — a circle (HIT)

```verum
public type S1 is Base | Loop() = Base..Base;
```

Reporter classification: `higher-inductive`, factorisation
`(path_action, ω, base)`. The path-cell variant `Loop() =
Base..Base` denotes the action of a loop in the carrier — the
homotopy-theoretic content that distinguishes a HIT from an
ordinary inductive type. The factorisation κ = ω indicates that
arbitrarily-many iterations of the loop action are admissible
(`Loop ∘ Loop ∘ Loop = Loop` in homotopy).

### 4.4 `@recursive` and `@corecursive` functions

```verum
@recursive
public fn ackermann(m: Int, n: Int) -> Int { ... }

@corecursive
public fn naturals() -> Stream<Int> { ... }
```

`@recursive` factorises as `(unfold_f, ω, fix_f)` — explicit
unfolding of the function up to its fixed-point. `@corecursive`
factorises dually as `(corec_g, ω^op, fix_g)`. The attribute is the
surface marker that the reporter classifies; the kernel pass
additionally checks termination / productivity inside the body.

---

## 5. Relation to other systems

| System | How it blocks the Yanofsky paradox schema |
|---|---|
| Coq | Strict positivity check on `Inductive`; impredicative-`Prop` toggle; per-axiom soundness review (`Acc` for well-founded recursion). |
| Lean 4 | Strict positivity; quotient-axiom soundness baked into the kernel; no impredicative `Type`. |
| Agda | `--without-K` flag; positivity checker; no impredicativity; sized types as opt-in. |
| Idris 2 | Quantitative Type Theory; totality checker rejects non-productive corecursion. |
| F* | Refinement subtypes with SMT discharge; no built-in HIT support. |
| Verum (this) | Single kernel rule `K-Refine` (`dp(P) < dp(A) + 1`) + Articulation Hygiene as its surface lift. The §13.2 table is the *complete* enumeration of self-referential surface forms; every form maps to a triple that the kernel can substitute into the depth check. |

The trade-off Verum makes is *uniformity over breadth*: a single rule
covers all paradox shapes, at the cost of requiring every self-
referential construct to have a §13.2 entry. New self-referential
constructs need a hygiene-table extension before they can be
surface-syntax legal.

---

## 6. Where to look in the codebase

| Surface | Source |
|---------|--------|
| Reporter — `verum audit --hygiene` | `audit` module |
| Surface-form regression suite | `vcs/specs/L1-core/hygiene/articulation_hygiene_classes.vr` |
| Kernel pass — `verum check --hygiene` | the `kernel` module, `verum_types::hygiene_check` |
| `E_HYGIENE_UNFACTORED_SELF` diagnostic | emitted by the kernel pass when no §13.2 factorisation matches |
| Hygiene-table extension API | Open | for user-defined self-referential constructs |

---

## 7. Implementation surface — the kernel-side primitives

The articulation-hygiene discipline lives in three kernel
modules (catalogued in [kernel-module-map](./kernel-module-map.md)):

| Module | Role |
|--------|------|
| `verum_kernel::factorisation` | `FactorisationSystem` + `Factorisation` data types, `is_orthogonal` decidable predicate, `factorise` algorithmic builder, `build_epi_mono_factorisation` (HTT 5.2.8.4), `build_n_truncation_factorisation` (HTT 5.2.8.16), `build_localisation_factorisation` (HTT 5.2.7.5), `factorisation_uniqueness`, `closure_under_composition` |
| `verum_kernel::depth` | `m_depth(term)` for finite M-iteration depth (Diakrisis T-2f*); `m_depth_omega(term) -> OrdinalDepth` for ordinal-valued modal-depth (Theorem 136.T transfinite stratification); `check_refine_omega` kernel-rule entry point gating refinement-type formation on `md^ω(P) < md^ω(A) + 1` |
| `verum_kernel::truncation` | n-truncation `τ_{≤n}` (Lurie HTT 5.5.6) used in the `(loop_action, ω, base)` HIT path-cell factorisation |

The `(Φ, κ, t)` triple from §1 corresponds directly to:
- `Φ` ↔ a `FactorisationSystem.left` class generator,
- `κ` ↔ an `OrdinalDepth` Cantor-normal-form value,
- `t` ↔ a `truncation::Truncated<n>` terminal object.

The compiler's audit pass walks each annotated declaration,
extracts the witness via the kernel API, and emits the
`E_HYGIENE_*` diagnostic family on rejection.

## 8. Further reading

- [Kernel module map](./kernel-module-map.md) — full inventory of
  the kernel modules used by this discipline.
- [Trusted kernel](./trusted-kernel.md) — the `K-Refine` rule and its
  metatheory.
- [Cubical / HoTT primer](./cubical-hott.md) — HIT path-cells, the
  source of the `(loop_action, ω, base)` factorisation.
- [Framework axioms](./framework-axioms.md) — how axiom-bound surfaces
  interact with the hygiene check.
- [Reflection tower](./reflection-tower.md) — the MSFS-grounded
  meta-soundness layer the hygiene discipline lives under.
- Yanofsky N.S. 2003. *A Universal Approach to Self-Referential
  Paradoxes, Incompleteness and Fixed Points.* Bulletin of Symbolic
  Logic 9(3):362–386. <https://arxiv.org/abs/math/0305282>
