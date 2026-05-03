---
sidebar_position: 25
title: "core.action — DC-side Diakrisis enactments"
description: "The Dependency-Centric half of the AC/OC duality. Articulations, enactments, ε-primitives, monads, ludics, and the gauge canonicalisation."
slug: /stdlib/action
---

# `core.action` — the DC-side Diakrisis enactments

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
    | Math       // articulate a mathematical claim
    | Compute    // perform a computation
    | Observe    // record an observation
    | Prove      // construct a proof
    | Decide     // make a decision (algorithmic)
    | Translate  // map between presentations
    | Construct; // build a witness
```

Every action in the system lifts to *exactly one* primitive. The
audit gate `verum audit --epsilon` enumerates every
`@enact(epsilon = ...)` marker grouped by primitive — the
DC-side counterpart of `--framework-axioms`.

## 2. The four core types

```verum
public type Enactment is {
    primitive: Primitive,
    target:    Articulation,
    cert:      Maybe<Text>,         // optional verification certificate
    gauge:     GaugeCanonical,      // canonicalisation witness
}

public type Articulation is {
    framework: Text,                // e.g. "lurie_htt"
    citation:  Text,                // e.g. "HTT 6.2.2.7"
    payload:   Text,                // the articulation's content
}

public type EffectKind is
    | PureMath
    | Computation
    | RuntimeIo
    | UserPrompted
    | NondetSampling;

public type GaugeCanonical is {
    equiv_class: Text,              // canonical-form identifier
    rep:         Maybe<Text>,       // representative if requested
}
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

public type StrongMonad is protocol {
    extends Monad;
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

public type LazyDesign is {
    initial:   Locus,
    schedule:  fn(Locus) -> Design,
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

```verum
public fn gauge_canonical(e: Enactment) -> GaugeCanonical;

public fn gauge_equivalent(a: Enactment, b: Enactment) -> Bool {
    gauge_canonical(a).equiv_class == gauge_canonical(b).equiv_class
}
```

The audit gate `verum audit --round-trip` walks every theorem's
α ⊣ ε round-trip and reports the gauge-canonical equivalence-class
membership.

## 6. ConsistencyReport + CoherenceMonitor

Two further data types surface the DC-side *audit* surface:

```verum
public type ConsistencyReport is {
    enactments_total:   Int,
    primitive_counts:   List<(Primitive, Int)>,
    framework_counts:   List<(Text, Int)>,
    gauge_violations:   List<Text>,
}

public type CoherenceMonitor is {
    alpha_certs:   List<Text>,
    epsilon_certs: List<Text>,
    verdicts:      List<CoherenceVerdict>,
}
```

`ConsistencyReport` is the structured output of
`verum audit --epsilon`. `CoherenceMonitor` is the runtime
companion for `@verify(coherent_runtime)` — it records α-cert and
ε-cert pairs at runtime and reports per-pair verdicts.

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
