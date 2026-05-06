---
sidebar_position: 90
title: "Operationalisation — pure-data helpers and soundness pins"
description: "How ATS-V methodological concepts are exposed as `public fn` on the Verum side: lifecycle ranks, stratum admissibility, foundation subsumption, modal classifications, observer rosters. Plus the soundness-pin discipline that catches drift before CI."
slug: /architecture-types/operationalisation
---

# Operationalisation — pure-data helpers and soundness pins

ATS-V lives at three layers:

1. **Declarative surface** — `@arch_module(...)`, `Capability`,
   `Lifecycle`, … the syntax cogs use to annotate themselves.
2. **Operationalisation** — `public fn` helpers in `.vr` files
   that compute methodologically meaningful properties from the
   surface types: `lifecycle_rank`, `tier_compatible_with`,
   `foundation_directly_subsumed_by`, …
3. **Kernel-discharge** — `@kernel_discharge(...)` axioms for
   invariants the declarative surface cannot decide locally
   (capability-flow inference, body-level analysis, SMT).

This page enumerates the layer-2 surface and the **soundness
pins** — Verum-side functions that catch drift between the
helpers themselves.

## 1. Why a third layer

A property that is decidable from surface types alone — like
`lifecycle_rank`, a match expression with nine arms — does not
belong behind a kernel axiom.  Hiding pure-data computations
behind FFI breaks three things:

1. **Discoverability.** LSP cannot complete fields the editor
   cannot evaluate.  `@arch_module(lifecycle = …)` should let the
   editor compute the rank inline.
2. **Verum-side proofs.** Theorems over lifecycle ordering /
   foundation subsumption / etc. need Verum predicates, not
   Rust functions.
3. **Cross-side drift.** Without a Verum-side counterpart there
   is nothing to compare against — the Rust function silently
   becomes the source of truth.

The operationalisation layer fixes this: helpers live in `.vr`
next to their types; cogs prove properties over them; the
cross-side pin test compares both sides.

## 2. Helpers exposed by `core.architecture`

### 2.1 `core.architecture.types`

| Helper | Type | Purpose |
|---|---|---|
| `tier_tag(t)`                          | `Tier → Text`                        | Stable single-token tag for audit JSON. |
| `tier_compatible_with(a, b)`           | `Tier → Tier → Bool`                 | Caller-callee compatibility — identity, MultiTier set-membership, or explicit bridge. |
| `stratum_tag(s)`                       | `MsfsStratum → Text`                 | Stable audit tag. |
| `stratum_is_admissible(s)`             | `MsfsStratum → Bool`                 | True iff `s ≠ LAbs` (AFN-T α boundary closure). |
| `foundation_tag(f)`                    | `Foundation → Text`                  | Stable audit tag. |
| `foundation_directly_subsumed_by(a, b)`| `Foundation → Foundation → Bool`     | Reflexive + canonical inclusions: `Mltt → Cic`, `Hott → Cubical`. |
| `lifecycle_tag(lc)`                    | `Lifecycle → Text`                   | Stable audit tag. |
| `lifecycle_cve_glyph(lc)`              | `Lifecycle → Text`                   | Single-character CVE glyph (`H`, `P`, `D`, `C`, `T`, `I`, `✗`, `O`, plus legacy `Plan`). |
| `lifecycle_rank(lc)`                   | `Lifecycle → Int`                    | Rank poset for AP-009 LifecycleRegression. |
| `lifecycle_is_mature_corpus_forbidden` | `Lifecycle → Bool`                   | True iff lifecycle is `[I]` Interpretation (forbidden in mature corpus). |
| `executability_sense_tag(s)`           | `ExecutabilitySense → Text`          | Stable tag for §2.3.0 three senses (`structural_readiness` is canonical for E). |
| `executability_sense_is_canonical_e(s)`| `ExecutabilitySense → Bool`          | True iff sense is the canonical content of CVE-E (only `StructuralReadiness`). |
| `cognitive_substrate_tag(s)`           | `CognitiveSubstrate → Text`          | Stable tag for §1.5 substrate variants. |
| `cognitive_substrate_default()`        | `() → CognitiveSubstrate`            | Default for ATS-V annotations: `AnalyticDecompositional`. |
| `formal_anchoring_tag(a)`              | `FormalAnchoring → Text`             | Stable tag for §4.5 anchoring variants. |
| `formal_anchoring_default()`           | `() → FormalAnchoring`               | Default for Verum-native artefacts: `CurryHowardLawvere`. |
| `cve_threshold_k_tag(t)`               | `CveThresholdK → Text`               | Stable tag for the K threshold in declared `Purpose`. |
| `cve_threshold_v_tag(t)`               | `CveThresholdV → Text`               | Stable tag for the V threshold. |
| `cve_threshold_e_tag(t)`               | `CveThresholdE → Text`               | Stable tag for the E threshold (in `StructuralReadiness` sense). |
| `purpose_default()`                    | `() → Purpose`                       | Default unspecified purpose; `[T]` strict-mode cogs SHOULD override. |
| `defect_kind_tag(k)`                   | `DefectKind → Text`                  | Stable tag for §20.4 architectural-defect kind. |
| `resolution_tag(r)`                    | `Resolution → Text`                  | Stable tag for §20.4 resolution path. |
| `shape_declarations_empty()`           | `() → ShapeDeclarations`             | Empty declarations record; defaults filled at audit time. |
| `cve_closure_degree(cve)`              | `CveClosure → Int`                   | 0..=3 — number of CVE axes present. |
| `cve_closure_is_fully_closed(cve)`     | `CveClosure → Bool`                  | True iff all three axes present. |
| `verify_strategy_tag(s)`               | `VerifyStrategy → Text`              | Stable audit tag. |
| `verify_strategy_rank(s)`              | `VerifyStrategy → Int`               | Strict order on the Diakrisis ν-ladder (Runtime=0 .. Synthesize=8). |
| `capability_tag(c)`                    | `Capability → Text`                  | Stable audit tag. |
| `capability_schema_inferred_default()` | `() → CapabilitySchema`              | Conservative schema for unresolved Custom capabilities. |
| `shape_default_for_unannotated()`      | `() → Shape`                         | Vacuous Shape for cogs without `@arch_module`. |

### 2.2 `core.architecture.mtac`

| Helper | Type | Purpose |
|---|---|---|
| `time_point_tag(tp)`               | `TimePoint → Text`               | Stable audit tag. |
| `time_point_precedes(a, b)`        | `TimePoint → TimePoint → Bool`   | Chronological partial order; `false` for incomparable pairs. |
| `decision_is_resolved(d)`          | `Decision → Bool`                | True iff `d.chosen` is `Some(_)`. |
| `observer_tag(o)`                  | `Observer → Text`                | Stable audit tag. |
| `observer_full_canonical_roster()` | `() → List<Observer>`            | The canonical 5-roster (EndUser / PeerCog / Stakeholder / Auditor / Adversary). |
| `modal_assertion_tag(m)`           | `ModalAssertion → Text`          | Stable audit tag. |
| `modal_is_temporal(m)`             | `ModalAssertion → Bool`          | True iff Eventually / Always / Until. |
| `modal_is_modal(m)`                | `ModalAssertion → Bool`          | True iff Necessity / Possibility. |
| `arch_proposition_tag(p)`          | `ArchProposition → Text`         | Stable audit tag. |
| `adjunction_witness_is_adjoint_of` | `AdjunctionWitness → AdjunctionWitness → Bool` | Mirror equality of (forward, backward) name pairs. |

### 2.3 `core.architecture.anti_patterns`

| Helper | Type | Purpose |
|---|---|---|
| `anti_pattern_code_str(c)`        | `AntiPatternCode → Text`         | Stable RFC code `ATS-V-AP-NNN`. |
| `anti_pattern_name(c)`            | `AntiPatternCode → Text`         | Canonical short name. |
| `anti_pattern_full_roster()`      | `() → List<AntiPatternCode>`     | All 32 codes for runtime walks. |
| `severity_tag(s)`                 | `Severity → Text`                | Stable audit tag. |
| `diagnostic_context_default()`    | `() → DiagnosticContext`         | Default-init for caller-supplied context. |

### 2.4 `core.architecture.composition`

| Helper | Type | Purpose |
|---|---|---|
| `composition_result_is_composed(r)`     | `CompositionResult → Bool` | True iff composition succeeded. |
| `composition_result_tag(r)`             | `CompositionResult → Text` | Stable audit tag (`composed` or `rejected`). |
| `composition_result_violation_count(r)` | `CompositionResult → Int`  | Number of violations in a Rejected result. |

### 2.5 `core.architecture.corpus`

| Helper | Type | Purpose |
|---|---|---|
| `corpus_invariant_tag(c)`              | `CorpusInvariant → Text`         | Stable audit tag. |
| `corpus_invariant_name(c)`             | `CorpusInvariant → Text`         | Canonical short name. |
| `corpus_invariant_full_list()`         | `() → List<CorpusInvariant>`     | The four baseline invariants. |
| `corpus_report_empty()`                | `() → CorpusReport`              | Empty initial accumulator. |
| `corpus_report_is_load_bearing(r)`     | `CorpusReport → Bool`            | True iff `r.violations` is empty. |

### 2.6 `core.architecture.phase`

| Helper | Type | Purpose |
|---|---|---|
| `module_arch_result_is_load_bearing(r)`        | `ModuleArchResult → Bool`     | True iff no parse errors AND no violations. |
| `arch_phase_report_empty()`                    | `() → ArchPhaseReport`        | Empty initial accumulator. |
| `arch_phase_report_is_load_bearing(r)`         | `ArchPhaseReport → Bool`      | True iff every module is load-bearing. |
| `arch_phase_report_total_violations(r)`        | `ArchPhaseReport → Int`       | Sum of violations across all modules. |
| `arch_phase_report_total_parse_errors(r)`      | `ArchPhaseReport → Int`       | Sum of parse errors across all modules. |
| `arch_phase_report_annotated_count(r)`         | `ArchPhaseReport → Int`       | Count of modules with explicit `@arch_module(...)`. |
| `composition_verification_is_load_bearing(r)`  | `CompositionVerificationReport → Bool` | True iff every composition step succeeded. |

### 2.7 `core.architecture.parse`

| Helper | Type | Purpose |
|---|---|---|
| `arch_parse_error_tag(e)`              | `ArchParseError → Text`        | Stable audit tag. |
| `arch_module_canonical_fields()`       | `() → List<Text>`              | The 13 field names the parser recognises. |
| `arch_module_field_count_invariant()`  | `() → Bool`                    | Pin: roster size is exactly 13. |

### 2.8 `core.architecture.counterfactual`

| Helper | Type | Purpose |
|---|---|---|
| `arch_metric_tag(m)`                              | `ArchMetric → Text`           | Stable audit tag (12 arms). |
| `metric_value_tag(v)`                             | `MetricValue → Text`          | Stable arm tag for serialisation without leaking inner payload. |
| `invariant_status_tag(s)`                         | `InvariantStatus → Text`      | Stable audit tag (4 arms). |
| `invariant_status_is_stable(s)`                   | `InvariantStatus → Bool`      | True iff arm is `HoldsBoth` — the unique stable arm. |
| `report_overall_stable_predicate(r)`              | `&CounterfactualReport → Bool`| Aggregate stability — empty list yields `false` (refusal of stability from absence of evidence). |
| `report_diverging_metric_count_predicate(r)`      | `&CounterfactualReport → Int` | Counts entries where `diverges == true`. |

### 2.9 `core.architecture.adjunction`

| Helper | Type | Purpose |
|---|---|---|
| `canonical_adjunction_tag(a)`            | `CanonicalAdjunction → Text`     | Stable audit tag (5 arms). |
| `refactoring_direction_tag(d)`           | `RefactoringDirection → Text`    | Stable audit tag. |
| `adjunction_verdict_tag(v)`              | `AdjunctionVerdict → Text`       | Stable audit tag (4 arms). |
| `adjunction_verdict_is_accepted(v)`      | `AdjunctionVerdict → Bool`       | True iff `Accepted` arm. |
| `all_preservation_holds(coverages)`      | `List<PreservedCoverage> → Bool` | True iff every preserved-coverage entry has `held_before ∧ held_after ∧ preserved_actual`. |
| `all_gain_holds(coverages)`              | `List<GainedCoverage> → Bool`    | True iff every gained-coverage entry has `¬held_before ∧ held_after ∧ gained_actual`. |
| `chain_acceptance_predicate(c)`          | `&ChainAnalysis → Bool`          | True iff every step accepted AND chain non-empty. |

### 2.10 `core.architecture.yoneda`

| Helper | Type | Purpose |
|---|---|---|
| `observation_observer_tag(o)`             | `ShapeObservation → Text`         | Stable observer-kind tag for the Shape projection. |
| `agreement_status_tag(s)`                 | `AgreementStatus → Text`          | Stable audit tag. |
| `all_agreements_agree(agreements)`        | `List<ObserverAgreement> → Bool`  | True iff every entry is `Agree`. |
| `count_disagreements(agreements)`         | `List<ObserverAgreement> → Int`   | Mirror of `YonedaVerdict.disagreement_count`. |
| `yoneda_verdict_equivalent_predicate(v)`  | `&YonedaVerdict → Bool`           | Verdict.equivalent is sound iff non-empty AND all agreements agree.  AT-3 closure additionally requires full canonical-5 roster. |

## 3. Soundness pins

A **soundness pin** is a Verum-side function that asserts a
non-trivial property of the helpers, derivable from the helpers
alone.  Pins serve as executable specification — they fail loudly
if the helper implementations drift from their contract, and they
form the natural foundation for stronger Verum-level proofs.

### 3.1 Pins in `core.architecture.types`

```verum
public fn lifecycle_rank_strict_order_holds() -> Bool
public fn stratum_l_abs_unique_inadmissible() -> Bool
public fn foundation_canonical_inclusions_hold() -> Bool
public fn tier_check_runs_nothing() -> Bool
// CVE-architecture spec primitives (AP-033..AP-039 closure)
public fn executability_sense_canonical_unique() -> Bool   // §2.3.0 — only StructuralReadiness
public fn cognitive_substrate_default_is_analytic() -> Bool // §1.5 — AnalyticDecompositional
public fn formal_anchoring_default_is_chl() -> Bool         // §4.5 — CurryHowardLawvere
public fn purpose_default_is_complete() -> Bool             // §14.6 — all three thresholds set
```

Each evaluates to `true` on a correct implementation; the
cross-side pin test exercises them.

### 3.2 Pins in `core.architecture.mtac`

```verum
public fn observer_roster_size_invariant() -> Bool
public fn modal_temporal_disjoint() -> Bool
public fn time_counterfactual_branches_isolated() -> Bool
public fn adjunction_mirror_symmetry() -> Bool
```

### 3.3 Pins in `core.architecture.anti_patterns` / `corpus` / `parse`

```verum
public fn anti_pattern_roster_size_invariant() -> Bool   // 39 (32 base + 7 CVE-AH band)
public fn corpus_invariant_roster_size_invariant() -> Bool  // 4
public fn arch_module_field_count_invariant() -> Bool    // 13
```

### 3.4 Pins in `core.architecture.counterfactual` / `adjunction` / `yoneda`

```verum
// counterfactual.vr
public fn invariant_status_uniqueness_pin() -> Bool      // HoldsBoth uniquely stable
public fn empty_invariants_unstable_pin() -> Bool        // empty list ⇒ unstable

// adjunction.vr
public fn verdict_acceptance_uniqueness_pin() -> Bool    // Accepted unique success
public fn empty_chain_rejected_pin() -> Bool             // empty chain rejected

// yoneda.vr
public fn empty_agreements_not_equivalent_pin() -> Bool  // empty ⇒ ¬equivalent
public fn agreement_status_disjoint_pin() -> Bool        // Agree / Disagree distinct
```

## 4. Cross-side alignment guarantee

The Verum-side helpers mirror Rust-side computations in
`verum_kernel::arch::*`.  Drift breaks the architectural type
checker, so [`crates/verum_kernel/tests/k_arch_v_alignment.rs`](./cross-side-pin.md)
pins both sides — variant counts, tag strings, helper presence —
and fails CI on any divergence.

## 5. Why the helpers are pure data

A property is *decidable on pure data* if its evaluation requires
only the values of the input — no kernel state, no FFI, no SMT
solver, no AST traversal beyond the input itself.  The helpers
above all satisfy this:

- `lifecycle_rank` matches on the variant — 9 arms, constant time.
- `stratum_is_admissible` matches on the variant — 4 arms.
- `foundation_directly_subsumed_by` matches on the pair —
  finite case analysis.
- `tier_compatible_with` is essentially the same shape with a
  bounded inner `tier_list_contains` walk.
- `cve_closure_degree` counts `Some` discriminants on a
  three-field record.
- `time_point_precedes` matches on the pair — branching futures
  are explicitly incomparable.

What is *not* pure data:

- **Capability-flow inference.** Determining the capability set
  a function body actually exercises requires walking the typed
  AST.  This stays in the kernel (AP-001 CapabilityEscalation).
- **Boundary invariant verification.** Whether the cog's actual
  message-passing code preserves the declared invariants is a
  body-level property, not a Shape-level one.
- **Composition graph cycle detection.** Requires the full
  module-graph view, not a single Shape.

These remain `@kernel_discharge(...)` axioms.  The discipline:
*if* a property is decidable from the surface types alone, it
becomes a `public fn`; otherwise, it stays a kernel-discharge
axiom.

## 6. Auxiliary typed attributes

Beyond `@arch_module(...)`, the ATS-V surface ships four auxiliary
typed attributes that complement the main carrier with focused,
orthogonal annotations.  All four use the same generic
`attribute_args = named_arg_list` grammar form — no new grammar
production was introduced.  The kernel parser dispatches on
attribute name through dedicated functions in `arch_parse.rs`.

### 6.1 `@bridge_tier(from: Tier.X, to: Tier.Y)`

Lifts the AP-004 TierMixing ban for the annotated function.  A
bridge does not eliminate the cost of the cross-tier transition;
it merely declares it intentional.  The runtime inserts the
appropriate transition (Interp call from Aot, GPU launch from Aot,
etc.) at the call site, and the audit chronicle records every
bridge for review.

```verum
@bridge_tier(from: Tier.Aot, to: Tier.Interp)
public fn dump_for_debug(tx: Tx) -> ()
```

The kernel-side type is `verum_kernel::arch::BridgeTier`; the
parser is `verum_kernel::arch_parse::parse_bridge_tier`.  A
no-op bridge (`from == to`) is parseable but flagged by the
architectural type-checker.

### 6.2 `@deterministic`

A marker attribute (no args) declaring that a function must
produce identical output on identical inputs across runs / hosts /
clock domains.  Consumed by AP-015 DeterministicViolation:
invocations of non-deterministic primitives (Random, SystemTime,
FilesystemMtime, network) within the marked function raise the
violation.

```verum
@deterministic
public fn hash_block(block: &Block) -> Bytes32
```

Determinism is the foundation of replay verification and DST
testing.

### 6.3 `@mtac_decision { point, by_observer, proposition, modality }`

Attaches a typed Modal-Temporal Architectural Calculus claim to a
function or cog.  Each MtacDecision is a dated, observer-witnessed,
modally-typed architectural commitment — the unit of historical
record in the MTAC corpus.

```verum
@mtac_decision {
    point: TimePoint.Now,
    by_observer: Observer.Auditor,
    proposition: ArchProposition.FoundationStable,
    modality: ModalAssertion.Necessity,
}
public fn checkout_payment(amount: Money) -> Result<...>
```

The four fields are required; missing any raises
`ArchParseError::MissingRequired`.  The ATS-V phase records the
claim for the MTAC anti-pattern checks (AP-027 TemporalInconsistency,
AP-028 CounterfactualBrittleness, AP-031 PhantomEvolution).

### 6.4 `@arch_corpus(invariants, foundation_bridges)`

Scope attribute for cross-cog invariants.  Where `@arch_module(...)`
describes a single cog's Shape, `@arch_corpus(...)` describes
properties holding over the entire corpus.

```verum
@arch_corpus(
    invariants: [
        CorpusInvariant.NoCircularDependencies,
        CorpusInvariant.FoundationConsistency,
        CorpusInvariant.NoLAbsClaim,
        CorpusInvariant.CapabilityClosure,
    ],
    foundation_bridges: [
        ("legacy.zfc_module", "zfc_to_hott_bridge_corpus"),
    ],
)
module my_app.corpus_root;
```

Both fields are optional; missing fields default to "use the
canonical 4-roster" / "no bridges declared".  The
`foundation_bridges` declarations suppress AP-005 FoundationDrift
for the named pairs.

## 7. Foundation tag — usage convention

The `Foundation` enum has seven inhabitants but only one
(`ZfcTwoInacc`) is in active use across the corpus.  This is
**not an oversight** — the others have a precise role defined by
the meta-theory.

| Tag | When to use |
|---|---|
| `Foundation.ZfcTwoInacc` | **DEFAULT.**  The cog's `.vr` source is implemented in Verum's standard meta-theory (ZFC + 2 strongly-inaccessibles).  Every current `core/` cog uses this tag, including `core/math/hott.vr` and `core/math/cubical.vr` which EXPOSE HoTT/cubical primitives but are themselves implemented in ZFC. |
| `Foundation.Hott`, `.Cubical`, `.Mltt`, `.Cic`, `.Eff` | **RESERVED.**  For future cogs whose `.vr` source SEMANTICS requires the named foundation to be sound — i.e. cogs that (a) use constructs unique to that foundation (e.g. univalence as definitional equality, not an axiom), and (b) have refinement predicates whose truth values depend on the foundation's own axioms.  No such cog exists in the current corpus; the variants are kept for the subsumption graph (`foundation_directly_subsumed_by`) and for future extensibility. |
| `Foundation.CustomFoundation(name, framework_corpus)` | For user-defined foundations admitted via the `@framework(corpus, ...)` registration mechanism. |

**Architectural pin (AP-023 FoundationForgery)**: tagging a cog
with `Foundation.Hott` (or any non-ZfcTwoInacc variant) when the
`.vr` source is actually implemented in ZFC is itself a defect.
The architectural type-checker raises AP-023 in that case —
declared foundation does not match cited axioms.

The `Foundation.ZfcTwoInacc` tag therefore correctly applies to
`core/math/hott.vr` (and friends) because the implementation is
ZFC-sound; downstream cogs CITING HoTT axioms via
`@framework(hott, "...")` annotations do not change that — they
simply add citation metadata for trusted-boundary audit.

## 8. Migration note — `Tier::TierCheck` → `Tier::Check`

Earlier drafts of `core.architecture.types.Tier` exposed a
variant named `TierCheck`.  The kernel-side parser in
`verum_kernel::arch_parse` accepts only the bare name `Check`
(matching the Rust enum's `Tier::Check` variant).  Code written
as `@arch_module(at_tier = Tier.TierCheck)` therefore never
compiled — the parser raised `UnknownVariant{kind: "Tier", value:
"TierCheck"}`.

The variant has been renamed to `Tier.Check` to match the parser.
The cross-side pin test now asserts both sides use the same
identifier.  If you have existing code referencing `Tier.TierCheck`,
rename it to `Tier.Check`.
