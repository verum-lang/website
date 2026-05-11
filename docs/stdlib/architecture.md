---
sidebar_position: 4
title: architecture
description: ATS-V Architectural Type System library — canonical types + 32-pattern anti-patterns + MTAC + counterfactual / adjunction / Yoneda / composition / corpus / phase orchestration.
---

# `core.architecture` — ATS-V Architectural Type System

`core.architecture` is the Verum-native side of the **Architectural
Type System v6.5 (ATS-V)**. It mirrors the kernel-side primitives
in `crates/verum_kernel::arch*` via the cross-side pin test in
`crates/verum_kernel/tests/k_arch_v_alignment.rs`, which fails CI on
any drift.

## Reuse-over-invention discipline

The ATS-V extension is intentionally NOT a separate type system. It
reuses the existing language surface:

1. **ONE typed attribute** — `@arch_module(...)` — recognised by
   compiler-internal dispatch. Follows the V8.1 META1 architectural
   principle and the generic `identifier(args)` form in
   `grammar/verum.ebnf`.
2. **THIS library** — Verum-native `type X is variant_list`
   declarations that mirror the kernel-side primitives.
3. **Per-module kernel-discharge bridges** declared as
   `@kernel_discharge(<intrinsic>)` axioms — one per architectural
   sub-system. Same pattern as `core.verify.separation_soundness`
   (#161) and `core.verify.codegen_soundness` (#162).

Zero new keywords; zero new compiler phases; everything reuses the
existing attribute + axiom + cross-side pin machinery.

## Module roster (12 files, 4 703 lines)

| File | Lines | What's in it |
|---|---:|---|
| `types.vr`              | 1767 | Canonical primitives — Capability / Boundary / Composition / Lifecycle / Foundation / Tier / MsfsStratum / CveClosure / Shape / CapabilitySchema |
| `anti_patterns.vr`      |  691 | 32-pattern roster — AntiPatternCode / AntiPatternViolation / Severity / DiagnosticContext + 12 kernel-discharge bridges |
| `mtac.vr`               |  458 | Modal-Temporal Architectural Calculus — modal/temporal/adjunction witnesses + canonical observer roster |
| `adjunction.vr`         |  294 | Adjunction analyzer for refactoring — CanonicalAdjunction / Refactoring / AdjunctionAnalysis / RefactoringChain |
| `counterfactual.vr`     |  283 | Non-destructive counterfactual reasoning — ArchMetric / MetricValue / InvariantStatus / CounterfactualReport |
| `yoneda.vr`             |  244 | Yoneda-equivalence checker — ShapeObservation / AgreementStatus / YonedaVerdict |
| `phase.vr`              |  183 | ATS-V phase 6.5 orchestrator — ModuleArchResult / ArchPhaseReport / CompositionStep / CompositionVerificationReport |
| `corpus.vr`             |  143 | Cross-cog invariants — CorpusInvariant / CorpusViolation / CorpusReport + 4 baseline checks |
| `composition.vr`        |  128 | A ⊗ B typed operation — CompositionResult + associativity pin |
| `parse.vr`              |  117 | `@arch_module(...)` parser error type — ArchParseError (5 variants) + canonical-field roster pin |
| `capability_ontology.vr`|  112 | Registered Custom capability names |
| `mod.vr`                |  283 | Re-exports + crate header |

## Canonical primitives (`types.vr`)

```verum
public type Capability is
      Identity
    | Composition
    | Encapsulation
    | Invariance
    | Persistence
    | Refinement
    | Replication
    | Reduction
    | Stratification
    | Custom(Text);          // user-defined; registered in capability_ontology

public type Foundation is
      ZfcStandard
    | ZfcOneInacc
    | ZfcTwoInacc
    | UnivalentZfc           // ZFC + Univalence axiom
    | HottCubical
    | DependentMltt
    | CubicalAgda;

public type MsfsStratum is
      LMeta
    | LFnd                   // foundational layer (most modules live here)
    | LBuild
    | LApp;

public type Lifecycle is
      Sketch(Text)            // unverified
    | Lemma(Text)              // partial proof
    | Theorem(Text)            // fully verified at level claimed
    | Deprecated { from: Text, replacement: Maybe<Text> };
```

The `@arch_module(...)` attribute on a module declares its
canonical position in this space:

```verum
@arch_module(
    foundation: Foundation.ZfcTwoInacc,
    stratum: MsfsStratum.LFnd,
    lifecycle: Lifecycle.Theorem("v0.1")
)
module core.architecture.mod;
```

## Anti-pattern roster (`anti_patterns.vr`)

32 canonical anti-patterns each with a stable AntiPatternCode (e.g.
`AP001_GodModule`, `AP017_FoundationDowngrade`,
`AP032_CorpusObservationGap`). Each violation surfaces with a
DiagnosticContext (module / span / severity / kernel-discharge
witness) that flows through the standard diagnostic pipeline — no
side-channel reporting.

Severity bands: `Hint | Info | Warning | Error | KernelBlock`. The
top band (`KernelBlock`) hard-fails the verification phase; the
others surface as diagnostics without halting.

## Modal-Temporal Architectural Calculus (`mtac.vr`)

MTAC formalises temporal evolution of architectural shapes:

```verum
public type ModalKind is Necessity | Possibility | Strict | Weak;
public type TemporalKind is Always | Eventually | Until | Since;

public fn modal_is_temporal(m: &ModalKind) -> Bool;
public fn modal_is_modal(m: &ModalKind) -> Bool;
public fn time_point_precedes(a: &TimePoint, b: &TimePoint) -> Bool;
public fn observer_full_canonical_roster() -> List<Observer>;
public fn adjunction_witness_is_adjoint_of(
    w: &AdjunctionWitness, f: &Functor, g: &Functor
) -> Bool;
```

## Counterfactual reasoning (`counterfactual.vr`)

Non-destructive "what if" analysis on architectural metrics:
"would this refactor preserve invariant X if I applied it?". The
engine never mutates the source-of-truth registries — every
counterfactual is computed against a temporary overlay and
discarded.

```verum
public type ArchMetric is
      CapabilityFootprint
    | BoundaryDepth
    | CompositionFanIn
    | LifecycleCoverage
    | CveClosureSize;

public type CounterfactualReport is {
    baseline:        Map<ArchMetric, MetricValue>,
    counterfactual:  Map<ArchMetric, MetricValue>,
    invariant_deltas: List<(InvariantId, InvariantStatus)>,
    is_safe:          Bool,
};
```

## Adjunction analyzer (`adjunction.vr`)

Identifies canonical adjunctions in the codebase and proposes
refactoring chains that preserve them. The pattern "F ⊣ G" is
detected structurally (Hom-set isomorphism witnessed at the call-
boundary); refactorings that disrupt the adjunction surface as
diagnostics.

## Yoneda-equivalence checker (`yoneda.vr`)

`YonedaVerdict::Equivalent | Distinguishable(ShapeObservation)`.
Two architectural shapes are Yoneda-equivalent iff they agree on
all observers; the checker enumerates the canonical observer
roster and surfaces the first disagreeing observer as a
counter-example.

## Composition (`composition.vr`)

A ⊗ B operation with an associativity pin: `(A ⊗ B) ⊗ C ≡ A ⊗ (B ⊗ C)`
must hold for every composable triple. The pin test fails CI on
any drift in `CompositionResult` semantics.

## Corpus invariants (`corpus.vr`)

Cross-cog invariants that hold across the entire dependency
graph — not per-module but at the corpus level. Four baseline
checks: foundation-monotonicity, lifecycle-monotonicity,
stratum-respect, cve-closure-conservation. Each violation carries
the two cogs involved + the witness.

## Phase orchestrator (`phase.vr`)

The entry point for ATS-V phase 6.5. Per-module compilation flows
through `phase::run_module(...)`; cross-module composition flows
through `phase::compose(...)`. Both return structured reports
with full diagnostic payloads.

## Status

| File | Status |
|---|---|
| `mod.vr` / `types.vr` | **stable** — canonical primitives + re-exports |
| `anti_patterns.vr` | **stable** — full 32-pattern roster |
| `mtac.vr` | **stable** — full MTAC primitives + helpers |
| `counterfactual.vr` | **stable** — full report surface |
| `adjunction.vr` | **stable** — analyzer + refactoring chain |
| `yoneda.vr` | **stable** — checker + observer roster |
| `composition.vr` | **stable** — ⊗ + associativity pin |
| `corpus.vr` | **stable** — 4 baseline invariants |
| `phase.vr` | **stable** — orchestrator surface |
| `parse.vr` | **stable** — parser error + roster pin |
| `capability_ontology.vr` | **stable** — Custom-capability registry |

## Cross-side alignment

The kernel-side primitives live in `crates/verum_kernel::arch*`.
`crates/verum_kernel/tests/k_arch_v_alignment.rs` is the cross-
side pin: any drift (new variant on one side, renamed field on the
other, severity-band reshuffle) fails CI before merge.

This is the same alignment discipline as `verum_common::well_known_types`
↔ `core/base/primitives.vr` — single canonical source-of-truth on
the kernel side, Verum-native projection on the library side, pin
test failing on drift.
