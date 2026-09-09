---
sidebar_position: 25
title: "core.action — DC-side Diakrisis enactments"
description: "The Dependency-Centric half of the AC/OC duality. Articulations, enactments, ε-primitives, monads, ludics, and the gauge canonicalisation."
status: regression-only
slug: /stdlib/action
---

import StdlibStatus from '@site/src/components/StdlibStatus';

# `core.action` — the DC-side Diakrisis enactments

<StdlibStatus status="regression-only" />

The `core.action` module is the **Dependency-Centric (DC)** half
of Verum's AC/OC duality. Where `core.math` ships the *objects* —
articulations, theorems, mathematical structures — `core.action`
ships the *actions*: the operational record of *which ε-primitive
was activated* for each articulation.

The two halves are connected by Diakrisis Theorem 108.T (the
AC/OC Morita-duality): every articulation `α` has a canonical
enactment `ε(α)`, and every enactment carries a unique
articulation. The α ⊣ ε adjunction is realised in Verum via the
`epsilon` / `alpha_of` operator pair, with the unit identity
enforced by the kernel and the counit identity witnessed up to
gauge canonicalisation.

For the conceptual story see
[Verification → actic-dual](../verification/actic-dual.md). This
page documents the actual stdlib surface.

## 1. The seven ε-primitives

The DC-side recognises seven canonical ε-primitives — the
operational verbs an articulation can be activated through:

```verum
public type Primitive is
    EpsilonMath        // articulate a mathematical claim
  | EpsilonCompute     // perform a computation
  | EpsilonObserve     // record an observation
  | EpsilonProve       // construct a proof
  | EpsilonDecide      // make a decision (algorithmic)
  | EpsilonTranslate   // map between presentations
  | EpsilonConstruct   // build a witness
  | EpsilonClassify;   // place a thing in a taxonomy
```

Every variant carries the `Epsilon` prefix, and there are EIGHT —
`EpsilonClassify` is easy to miss when writing an exhaustive `match`.

Every action in the system lifts to *exactly one* primitive. The
audit gate `verum audit --epsilon` enumerates every
`@enact(epsilon = ...)` marker grouped by primitive — the
DC-side counterpart of `--framework-axioms`.

## 2. The four core types

```verum
// An enactment is a NAMED SEQUENCE of primitives with an activation
// rank and the articulation it discharges — not a single primitive plus
// a certificate.
public type Enactment is {
    name:            Text,
    steps:           List<Primitive>,
    activation_rank: Int,
    articulation:    Articulation,
};

// The third field is `lineage`, not `payload`.
public type Articulation is {
    framework: Text,                // e.g. "lurie_htt"
    citation:  Text,                // e.g. "HTT 6.2.2.7"
    lineage:   Text,
};

// Eight effects named after the MONAD each denotes.
public type EffectKind is
    PureEffect
  | ReaderEffect
  | WriterEffect
  | ProbabilityEffect
  | ListEffect
  | StateEffect
  | ExceptionEffect
  | IoEffect;
```

`Enactment` ties an `Articulation` (what is being claimed) to a
`Primitive` (how it is being activated) plus an optional
verification certificate and a gauge-canonical equivalence-class
witness for the counit identity.

## 3. Monad protocols — the categorical infrastructure

`core.action` ships a small set of monad protocols used by the
ε-primitives to compose:

```verum
public type Monad is protocol {
    type T<A>;
    fn pure<A>(x: A) -> Self.T<A>;
    fn bind<A, B>(m: Self.T<A>, f: fn(A) -> Self.T<B>) -> Self.T<B>;
};

public type StrongMonad is protocol extends Monad {
    fn strength<A, B>(a: A, m: Self.T<B>) -> Self.T<(A, B)>;
};

public type Commutative is protocol {};
```

Plus a per-primitive monad in `core/action/monads/`:

| File | Monad | What it does |
|------|-------|--------------|
| `monads/state.vr` | `StateM<S>` | thread state through enactment chains |
| `monads/writer.vr` | `WriterM<W>` | accumulate a log over enactment chains |
| `monads/reader.vr` | `ReaderM<R>` | thread environment through enactments |
| `monads/io.vr` | `IoM` | runtime I/O effect |
| `monads/either.vr` | `EitherM<E>` | failure-handling monad |

## 4. Ludics — interactive proof structure

`core.action` ships a **ludics** layer (Girard's interaction-based
proof theory) that surfaces *games* as first-class objects:

```verum
public type Locus is protocol { ... };
public type Design is protocol { ... };
public type Dessein is protocol {};

// Two loci and the corecursion sites a productivity check walks.
public type LazyDesign is {
    source_locus: Text,
    target_locus: Text,
    corec_calls:  List<CorecursiveCall>,
};
```

Three associated verdicts:

| Verdict | Meaning |
|---------|---------|
| `CutElimVerdict` | does cut-elimination terminate on this design? |
| `OrthogonalityVerdict` | is the design orthogonal to its dual? |
| `AuditVerdict` | does the design respect the audit invariant? |

The ludics layer is used by the `coherent` verification strategy
([gradual-verification](../verification/gradual-verification.md))
to recognise α/ε bidirectional games.

## 5. Gauge canonicalisation — the counit witness

The Morita-duality counit identity holds *up to gauge*. Two
enactments that target the same articulation may use different
primitives or different cert payloads — they are equivalent if
their gauge-canonical forms agree:

There is no `GaugeCanonical` type: the canonical form of an enactment
is another `Enactment`, and equivalence is decided by comparing the two
canonicalised values.

```verum
public fn canonicalise(e: Enactment) -> Enactment;
public fn gauge_equivalent(a: Enactment, b: Enactment) -> Bool;
public fn is_canonical(e: Enactment) -> Bool;
public fn canonical_size(e: Enactment) -> Int;
public fn canonicalise_idempotent(e: Enactment) -> Bool;
```

The audit gate `verum audit --round-trip` walks every theorem's
α ⊣ ε round-trip and reports the gauge-canonical equivalence-class
membership.

## 6. ConsistencyReport + CoherenceMonitor

Two further data types surface the DC-side *audit* surface:

```verum
// Both are scoped to ONE epsilon, and both count rather than collect.
public type ConsistencyReport is {
    epsilon:          Text,
    declared_count:   Int,
    consistent_count: Int,
    divergent_count:  Int,
};

public type CoherenceMonitor is {
    epsilon:        Primitive,
    representative: Maybe<Enactment>,   // the first consistent enactment
    consistent:     Int,
    divergent:      Int,
};

public fn gauge_consistency(epsilon: Primitive, observed: List<Enactment>)
    -> ConsistencyReport;
public fn monitor_new(epsilon: Primitive) -> CoherenceMonitor;
```

Neither type aggregates across primitives: a report is about a single
ε, named in its own `epsilon` field, and the counts are `Int`s rather
than lists of per-primitive or per-framework tallies. There is no
`gauge_violations` list — a divergence increments `divergent_count`,
and the enactment kept is the `representative`, the first consistent one
against which the rest were judged.

## 7. Cross-references

- [Verification → actic-dual](../verification/actic-dual.md) —
  the duality theorem.
- [Verification → gradual-verification](../verification/gradual-verification.md)
  — the `coherent_static` / `coherent_runtime` / `coherent`
  strategies that consume `core.action`.
- [Tooling → CLI](../tooling/cli.md#audit-subcommands) — the
  `--epsilon` and `--coherent` audit gates.
- [Verification → coherence](../verification/coherence.md) — the
  operational coherence layer.
- [Stdlib → math](./math.md) — the AC-side companion (the
  *objects* the enactments target).
