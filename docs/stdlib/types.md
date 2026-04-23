---
title: core.types — advanced type-system primitives
description: Polymorphic kinds, quantitative type theory (QTT), and two-level type theory (2LTT) — the research-grade vocabulary on which the verification layer and higher-kinded libraries build.
---

# `core.types` — advanced type-system primitives

This module is the user-facing surface of the compiler's research
machinery. It exposes three orthogonal vocabularies:

| Submodule | Theory | Primary citation |
|-----------|--------|------------------|
| `core.types.poly_kinds` | Polymorphic kinds + kind unification | Weirich, Hsu, Eisenberg. *System FC with Explicit Kind Equality*. ICFP 2013. |
| `core.types.qtt` | Quantitative type theory (resource-aware) | Atkey. *Syntax and Semantics of Quantitative Type Theory*. LICS 2018. |
| `core.types.two_level` | Two-level type theory (phase separation) | Annenkov, Capriotti, Kraus, Sattler. *Two-Level Type Theory and Applications*. MSCS 2023. |

Most application code never touches these modules — they are the
vocabulary that formal-verification extensions, resource-aware
libraries, and staged-evaluation macro authors speak. Everyone else
stays one layer up in `core.base.*` where `Maybe`, `Result`, `List`,
`Iterator`, `Heap`, and `Shared` already deliver the ergonomic
surface.

## Relationship to the compiler

`core.types.*` IS the authoritative definition of these vocabularies;
the compiler crate `verum_types` consumes the stdlib declarations.
There is no parallel hardcoded list of kinds / usage tags / layers
in `verum_types` — extending the stdlib types here extends the
compiler's reasoning directly.

```text
┌──────────────────────────┐      ┌──────────────────────────┐
│  core.types.poly_kinds   │      │  verum_types             │
│  (Kind ADT, unifier)     │─────▶│  ::poly_kinds            │
│                          │      │  (kind inference         │
│                          │      │   during type checking)  │
└──────────────────────────┘      └──────────────────────────┘
┌──────────────────────────┐      ┌──────────────────────────┐
│  core.types.qtt          │      │  verum_types             │
│  (Quantity, add,         │─────▶│  ::qtt_usage             │
│   UsageCount, violation) │      │  ::qtt_walker            │
└──────────────────────────┘      └──────────────────────────┘
┌──────────────────────────┐      ┌──────────────────────────┐
│  core.types.two_level    │      │  verum_types             │
│  (Layer, Stratified      │─────▶│  ::two_level             │
│   Universe, flow rules)  │      │  (staging separation)    │
└──────────────────────────┘      └──────────────────────────┘
```

## `core.types.poly_kinds` — polymorphic kinds

Kind-level Hindley-Milner: kind variables, three kind constructors
(`Type`, `Constraint`, `→`), and kind unification with the
occurs-check. Consumed by the type checker when inferring the kinds
of user-declared type constructors (generic types, protocols, and
higher-kinded parameters).

### Surface

```verum
public type Kind is
    | KType                                                    // *
    | KConstraint                                              // the typeclass arrow
    | KArrow { domain: Heap<Kind>, codomain: Heap<Kind> }      // K₁ → K₂
    | KVar { name: Text };                                     // κ, quantifiable

public fn k_type() -> Kind;
public fn k_constraint() -> Kind;
public fn k_arrow(a: Kind, b: Kind) -> Kind;
public fn k_var(name: Text) -> Kind;
```

### Unification

`kind_occurs(k, var_name) -> Bool` is the occurs-check; the stdlib's
unifier returns a `KindUnifyResult` discriminated as `KindOk {
bindings: List<KindBinding> }` or `KindError { reason: Text }`.

```verum
mount core.types.poly_kinds.{k_type, k_arrow, k_var, kind_occurs};

// Kind of `Functor<F<_>>` ≈ (* → *) → Constraint
let k_functor = k_arrow(k_arrow(k_type(), k_type()), k_constraint());

// Is κ₀ free in `* → κ₀`?  Yes — occurs check triggers on substitution.
assert(kind_occurs(k_arrow(k_type(), k_var("κ₀")), "κ₀"));
```

### Typical consumers

- **Higher-kinded protocols**: `protocol Functor { type F<_>; … }` —
  the `F<_>` type parameter is inferred at kind `* → *`.
- **Typeclass coherence** over type constructors: e.g., `Monad<M<_>>
  extends Applicative<M<_>>` requires both `M` at kind `* → *`.
- **Heterogeneous containers**: `HList` / `HMap` encode their
  element-kind list at kind level and unify per-element kinds against
  `* → *` when the container maps over its elements.

## `core.types.qtt` — quantitative type theory

Every binding carries a *quantity* — an element of the semiring
`{0, 1, ω}` (erased / linear / unrestricted). The type system
enforces these counts at compile time, preventing *resource leaks*
(linear binding used zero times) and *aliasing violations* (linear
binding used twice).

### Surface

```verum
public type Quantity is
    | Zero                            // erased (compile-time only)
    | One                             // exactly once at runtime
    | Many                            // unrestricted reuse
    | AtMost { n: Int{>= 0} };        // affine (at most n uses)

public fn allows(q: Quantity, uses: Int{>= 0}) -> Bool;
public fn add_quantity(a: Quantity, b: Quantity) -> Quantity;
```

`add_quantity` is the sequential-composition operation: when a
binding flows through both branches of a sequence, the observed
usage is summed. The implementation is total — the `AtMost` ladder
keeps exact counts rather than collapsing to `Many` prematurely,
which preserves useful refinement feedback.

### Usage tracking

```verum
public type UsageCount is { runtime: Int{>= 0} };
public type TrackedBinding is { name: Text, declared: Quantity };

public type QttViolation is
    | Underuse { binding: Text, declared: Quantity, observed: UsageCount }
    | Overuse  { binding: Text, declared: Quantity, observed: UsageCount };
```

The compiler walks a function body and produces a `List<QttViolation>`
under refinement: `Underuse` fires when `declared = One` and
`observed.runtime != 1`; `Overuse` fires when `declared = AtMost { n }`
and the sum exceeds `n`.

### Typical consumers

- **File handles, sockets, channels** — linear bindings prevent
  use-after-close, double-close, and leak-without-close.
- **One-shot futures** (`oneshot::Sender`) — the `send` operation
  consumes the sender at quantity `One`.
- **Capability tokens** — secrets, session-scoped authorisation,
  cryptographic nonces; `Zero` quantity makes the token erasable
  after verification.

See [`language/linearity`](/docs/language/linearity) for the surface
syntax that builds on QTT (the `affine` modifier and `linear`
protocol constraint).

## `core.types.two_level` — 2LTT phase separation

Voevodsky and the Annenkov–Capriotti–Kraus–Sattler group stratify
universes into two layers:

- **Fibrant** — supports HoTT / cubical type theory; UIP does *not*
  hold; paths are first-class objects.
- **Strict** — satisfies the uniqueness-of-identity-proofs principle;
  equality is decidable; no path computation.

The stdlib's surface lets the compiler decide which layer each
universe lives in and enforces the one-way coercion rule.

### Surface

```verum
public type Layer is
    | Fibrant                         // HoTT / cubical — UIP fails
    | Strict;                         // UIP holds — decidable equality

public fn layer_flows_to(lo: Layer, hi: Layer) -> Bool;   // Fib ≼ Strict
public fn layer_mix(a: Layer, b: Layer) -> Layer;         // strictness contagion

public type StratifiedUniverse is {
    layer: Layer,
    level: Int{>= 0},
};

public fn stratified_fibrant(level: Int{>= 0}) -> StratifiedUniverse;
public fn stratified_strict(level: Int{>= 0}) -> StratifiedUniverse;

public fn universe_coerces_to(from: StratifiedUniverse,
                              to:   StratifiedUniverse) -> Bool;

public type LayerVerdict is
    | LayerOk
    | StrictInFibrant { universe: StratifiedUniverse }
    | LevelMismatch { from_level: Int, to_level: Int };

public fn check_layer_flow(actual: StratifiedUniverse,
                           expected: StratifiedUniverse) -> LayerVerdict;
```

### The two invariants

1. **Layer flow** — `Fibrant ≼ Strict`. A fibrant universe coerces
   *into* a strict universe at the same level, but not the other
   way. `universe_coerces_to` enforces this with an equal-level
   requirement (layers live in a grade-separated sequence; there's
   no level change at the layer boundary).

2. **Strictness contagion** — if any component of a sum/product/Σ
   carries the Strict layer, the whole carries Strict. `layer_mix`
   is commutative and computes the join in the
   `Strict > Fibrant` lattice.

### Soundness gate

`check_layer_flow(actual, expected)` returns `LayerVerdict.LayerOk`
only when the actual universe can legally appear where `expected`
is required. The two failure modes surface separately so the
compiler diagnostic can distinguish "wrong universe level" from
"tried to use a strict type where fibrant was required."

### Typical consumers

- **Refinement types** — refinement predicates evaluate in the
  Strict layer (their index arithmetic must terminate and respect
  UIP). `core.types.two_level` is how the compiler keeps
  refinement-normalised indices out of the path-polymorphic layer.
- **Cubical HoTT stdlib** (`core.math.hott.*`) — path types,
  `transport`, `hcomp`, `Glue` live entirely in Fibrant; proofs
  imported from decidable-equality libraries (e.g., finite-set
  lemmas) are strict and coerced in via `universe_coerces_to`.
- **Meta-programming phases** — staged `@meta` expressions live in
  Strict (compile-time reduction respects UIP); the runtime universe
  hosting the expanded code is Fibrant.

## How these three interact

The three vocabularies are deliberately orthogonal:

| | Kind | Quantity | Layer |
|-|------|----------|-------|
| What it parameterises | Type constructors | Bindings | Universes |
| Examples | `*`, `* → *`, `Constraint` | `0`, `1`, `ω`, `AtMost n` | `Fibrant`, `Strict` |
| Checked at | Type inference | Usage walk | Universe-flow check |

A binding can simultaneously carry all three annotations. For
example, a linear file handle used in a refinement-typed function
inside a fibrant universe has:

- Kind `*` (the type is an ordinary value-level type).
- Quantity `One` (the handle is used exactly once — write then close).
- Layer `Fibrant` (the enclosing function's universe participates in
  the homotopy structure of the module).

The three checks are independent and commute — the compiler runs
kind inference first (it determines whether types are even
well-formed), then QTT usage analysis, then layer flow. An error in
any phase is reported as a separate diagnostic.

## When to reach here

Almost never from application code. Libraries that need:

- **Typeclass dispatch over kinds other than `Type`** — e.g., a
  generic `Traversable` abstracted over the container-kind.
- **Linear-resource tracking beyond `affine` types** — e.g., a
  session-typed protocol where exactly one message per state must
  be sent.
- **Staged computation** where compile-time values have distinct
  types from runtime values — e.g., a compiled regex whose compiled
  form lives in Strict and whose matcher lives in Fibrant.

…pull these modules in. Everyone else stays one layer up in
`core.base.*`.

## See also

- [`language/dependent-types`](/docs/language/dependent-types) — how
  Σ, Π, and path types compose with these primitives.
- [`language/linearity`](/docs/language/linearity) — the surface
  syntax that consumes `core.types.qtt`.
- [`verification/cubical-hott`](/docs/verification/cubical-hott) —
  the fibrant-layer proof DSL.
- [`language/meta/overview`](/docs/language/meta/overview) —
  staged / two-level meta-programming.
