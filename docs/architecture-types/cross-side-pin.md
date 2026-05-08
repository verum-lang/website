---
sidebar_position: 92
title: "Cross-side alignment — kernel ↔ Verum pin tests"
description: "How the Verum-side `core.architecture.*` declarations stay aligned with the Rust-side `verum_kernel::arch::*` enums and helpers across releases. Pin discipline, drift detection, and the alignment-test contract."
slug: /architecture-types/cross-side-pin
---

# Cross-side alignment — kernel ↔ Verum pin tests

ATS-V splits its implementation across two sides:

- The **Verum side** (`core/architecture/*.vr`) is the surface
  cogs see when they write `@arch_module(...)`.  Types,
  variants, helper functions, kernel-discharge axioms.
- The **kernel side** (`crates/verum_kernel/src/arch*.rs`) is
  the Rust implementation that actually parses
  `@arch_module(...)`, builds Shapes, runs the 40-pattern
  catalog, and discharges architectural invariants through
  intrinsics.

Both sides must agree.  The parser accepts the variant string
`"Check"` to build `Tier::Check`; if the Verum-side type is named
`Tier.TierCheck`, no cog can ever produce a parseable
declaration.  The cross-side pin test eliminates this category of
silent drift.

## 1. What stays in sync

The pin discipline covers **every variant, every variant tag,
every helper function, every roster size, and every stable RFC
code** for the architectural type system.  Concretely (all variant
counts as of the 53-pin baseline, see §10 for the full bidirectional
inventory):

### 1.1 Capability/boundary primitives

| Element | Verum side | Kernel side | Variants |
|---|---|---|---|
| `Capability`            | `core.architecture.types.Capability`            | `verum_kernel::arch::Capability`            | 9 |
| `ResourceTag`           | `core.architecture.types.ResourceTag`           | `verum_kernel::arch::ResourceTag`           | 7 |
| `ExecTarget`            | `core.architecture.types.ExecTarget`            | `verum_kernel::arch::ExecTarget`            | 4 |
| `PrivilegeRealm`        | `core.architecture.types.PrivilegeRealm`        | `verum_kernel::arch::PrivilegeRealm`        | 4 |
| `TaskLifetime`          | `core.architecture.types.TaskLifetime`          | `verum_kernel::arch::TaskLifetime`          | 3 |
| `ExpirationPolicy`      | `core.architecture.types.ExpirationPolicy`      | `verum_kernel::arch::ExpirationPolicy`      | 3 |
| `PersistenceMedium`     | `core.architecture.types.PersistenceMedium`     | `verum_kernel::arch::PersistenceMedium`     | 3 |
| `NetProtocol`           | `core.architecture.types.NetProtocol`           | `verum_kernel::arch::NetProtocol`           | 12 |
| `NetDirection`          | `core.architecture.types.NetDirection`          | `verum_kernel::arch::NetDirection`          | 3 |
| `Boundary` (record)     | `core.architecture.types.Boundary`              | `verum_kernel::arch::Boundary`              | 6 fields |
| `MessageType`           | `core.architecture.types.MessageType`           | `verum_kernel::arch::MessageType`           | 4 |
| `BoundaryInvariant`     | `core.architecture.types.BoundaryInvariant`     | `verum_kernel::arch::BoundaryInvariant`     | 5 |
| `WireEncoding`          | `core.architecture.types.WireEncoding`          | `verum_kernel::arch::WireEncoding`          | 5 |
| `BoundaryPhysicalLayer` | `core.architecture.types.BoundaryPhysicalLayer` | `verum_kernel::arch::BoundaryPhysicalLayer` | 4 |
| `CapabilitySchema`      | `core.architecture.types.CapabilitySchema`      | `verum_kernel::arch::CapabilitySchema`      | record |

### 1.2 Lifecycle / foundation / tier / stratum

| Element | Verum side | Kernel side | Variants |
|---|---|---|---|
| `Lifecycle`        | `core.architecture.types.Lifecycle`        | `verum_kernel::arch::Lifecycle`        | 9 (7 canonical + 2 legacy) |
| `ConfidenceLevel`  | `core.architecture.types.ConfidenceLevel`  | `verum_kernel::arch::ConfidenceLevel`  | 3 |
| `Foundation`       | `core.architecture.types.Foundation`       | `verum_kernel::arch::Foundation`       | 7 |
| `Tier`             | `core.architecture.types.Tier`             | `verum_kernel::arch::Tier`             | 5 |
| `MsfsStratum`      | `core.architecture.types.MsfsStratum`      | `verum_kernel::arch::MsfsStratum`      | 4 |
| `VerifyStrategy`   | `core.architecture.types.VerifyStrategy`   | `verum_kernel::arch::VerifyStrategy`   | 9 |

### 1.3 CVE primitives (Constructive / Verifiable / Executable)

| Element | Verum side | Kernel side | Variants |
|---|---|---|---|
| `Purpose` (record)     | `core.architecture.types.Purpose`             | `verum_kernel::arch::Purpose`             | 4 fields (role + K/V/E) |
| `ShapeDeclarations`    | `core.architecture.types.ShapeDeclarations`   | `verum_kernel::arch::ShapeDeclarations`   | 5 fields |
| `Shape`                | `core.architecture.types.Shape`               | `verum_kernel::arch::Shape`               | record |
| `ExecutabilitySense`   | `core.architecture.types.ExecutabilitySense`  | `verum_kernel::arch::ExecutabilitySense`  | 3 |
| `CognitiveSubstrate`   | `core.architecture.types.CognitiveSubstrate`  | `verum_kernel::arch::CognitiveSubstrate`  | 4 |
| `FormalAnchoring`      | `core.architecture.types.FormalAnchoring`     | `verum_kernel::arch::FormalAnchoring`     | 7 |
| `CveThresholdK`        | `core.architecture.types.CveThresholdK`       | `verum_kernel::arch::CveThresholdK`       | 3 |
| `CveThresholdV`        | `core.architecture.types.CveThresholdV`       | `verum_kernel::arch::CveThresholdV`       | 3 |
| `CveThresholdE`        | `core.architecture.types.CveThresholdE`       | `verum_kernel::arch::CveThresholdE`       | 3 |
| `CveAxisMode`          | `core.architecture.types.CveAxisMode`         | `verum_kernel::arch::CveAxisMode`         | enum |
| `CveClosure` (record)  | `core.architecture.types.CveClosure`          | `verum_kernel::arch::CveClosure`          | record |
| `SelfReferenceWitness` | `core.architecture.types.SelfReferenceWitness`| `verum_kernel::arch::SelfReferenceWitness`| 3 fields |
| `FixpointClass`        | `core.architecture.types.FixpointClass`       | `verum_kernel::arch::FixpointClass`       | 3 fields |
| `FixpointCategory`     | `core.architecture.types.FixpointCategory`    | `verum_kernel::arch::FixpointCategory`    | 4 |
| `EndomorphismClass`    | `core.architecture.types.EndomorphismClass`   | `verum_kernel::arch::EndomorphismClass`   | 4 |
| `FixpointTheorem`      | `core.architecture.types.FixpointTheorem`     | `verum_kernel::arch::FixpointTheorem`     | 4 |

### 1.4 Defect taxonomy

| Element | Verum side | Kernel side | Variants |
|---|---|---|---|
| `ArchitecturalDefect`  | `core.architecture.types.ArchitecturalDefect`         | `verum_kernel::arch::ArchitecturalDefect`            | record |
| `DefectKind`           | `core.architecture.types.DefectKind`                  | `verum_kernel::arch::DefectKind`                     | 4 |
| `Resolution`           | `core.architecture.types.Resolution`                  | `verum_kernel::arch::Resolution`                     | 3 |
| `AntiPatternCode`      | `core.architecture.anti_patterns.AntiPatternCode`     | `verum_kernel::arch_anti_pattern::AntiPatternCode`   | 40 |
| `AntiPatternViolation` | `core.architecture.anti_patterns.AntiPatternViolation`| `verum_kernel::arch_anti_pattern::AntiPatternViolation` | record |
| `Severity`             | `core.architecture.anti_patterns.Severity`            | `verum_kernel::arch_anti_pattern::Severity`          | 3 |
| `DiagnosticContext`    | `core.architecture.anti_patterns.DiagnosticContext`   | `verum_kernel::arch_anti_pattern::DiagnosticContext` | record |

### 1.5 Corpus-level

| Element | Verum side | Kernel side | Variants |
|---|---|---|---|
| `CorpusInvariant`   | `core.architecture.corpus.CorpusInvariant`   | `verum_kernel::arch_corpus::CorpusInvariant`   | 4 |
| `CorpusViolation`   | `core.architecture.corpus.CorpusViolation`   | `verum_kernel::arch_corpus::CorpusViolation`   | record |
| `CorpusReport`      | `core.architecture.corpus.CorpusReport`      | `verum_kernel::arch_corpus::CorpusReport`      | record |

### 1.6 Helper-function alignment

The pin test enforces that every kernel `tag()` / `code()` /
`name()` method has a matching Verum-side `public fn <tag>` arm:

  - `tier_compatible_with`, `lifecycle_rank`, `lifecycle_cve_glyph`
  - `foundation_directly_subsumed_by`, `stratum_is_admissible`
  - `cve_closure_degree`, `verify_strategy_rank`
  - `executability_sense_tag`, `executability_sense_is_canonical_e`
  - `cognitive_substrate_tag`, `cognitive_substrate_default`
  - `formal_anchoring_tag`, `formal_anchoring_default`
  - `cve_threshold_k_tag`, `cve_threshold_v_tag`, `cve_threshold_e_tag`
  - `fixpoint_category_tag`, `endomorphism_class_tag`,
    `fixpoint_theorem_tag`, `fixpoint_class_tag`
  - `anti_pattern_code_str`, `anti_pattern_full_roster`
  - `corpus_invariant_full_list`, `corpus_invariant_tag`
  - `arch_module_canonical_fields`
  - 13 ergonomic capability constructors
    (`capability_time_bounded`, `capability_spawn_structured`, …)
  - 2 ergonomic ExpirationPolicy constructors
    (`expiration_after_duration`, `expiration_at_seconds`)

## 2. The pin test contract

The cross-side pin test lives at
`crates/verum_kernel/tests/k_arch_v_alignment.rs` and enforces
**53 pin tests as of the 2026-05-08 baseline** (FV-9 38-rule
real-Typing across all three foundations + AP-040 closure +
transitive multi-hop closure).  The pin tests fall into eight
bands:

| Band | Pin count | Coverage |
|---|---|---|
| Variant alignment      | 14 | every shared enum's variant set ↔ Verum twin |
| Roster sizes           |  5 | full-roster helpers pinned to exact integer |
| Module presence        |  4 | composition / corpus / phase / parse modules exist on Verum side |
| Helper presence        |  6 | typed-attribute parsers / aux-attribute / red-team / counterfactual / adjunction / yoneda helpers |
| Universal coverage     |  6 | every cog under `core/`, `core/math/`, `core/verify/`, `core/proof/` carries `@arch_module(...)` |
| Compiler wiring        |  9 | phase inputs, session helpers, audit-bundle plumbing |
| Capability ontology    |  3 | AT-1 closure registry; canonical 7-tag roster |
| Transitive walker      |  4 | walker present + phase-input fields + session resolver + functional-correctness liveness |

**The three structural invariants:**

1. **Variant set equality.** For every enum tracked in §1, the
   set of variant tags computed by the kernel-side `tag()` /
   `code()` / `name()` methods equals the set of variant tags
   computed by the Verum-side helper of the same name.
2. **Roster size pin.** Every full-roster helper
   (`observer_full_canonical_roster`, `anti_pattern_full_roster`,
   `corpus_invariant_full_list`, `arch_module_canonical_fields`,
   `seven_configurations_closure_exhaustive`) has its size
   hard-pinned to the exact integer in the test.  A change to
   roster size requires explicit test update — a guard against
   silently extending the catalog.
3. **Helper presence.** Every helper listed above must exist on
   both sides with the same name and signature.  A grep over
   `core/architecture/*.vr` checks for `public fn <helper_name>`
   and the kernel side enforces presence via the Rust type system.

When CI runs the pin test, drift in any direction fails with a
concrete message naming the missing or mismatched element.

## 3. Why a real test rather than a comment

Earlier drafts of `core.architecture.types` carried a comment
asserting "cross-side alignment is pinned by the kernel test
suite."  That comment was a *lying invariant* — no such test
existed.  The Verum-side variant `Tier.TierCheck` did not match
the kernel's `Tier::Check` for months without anyone noticing,
because the parser silently rejected `TierCheck` declarations
that no cog actually wrote.

The pin test makes the comment true.  Lying invariants are
themselves architectural defects: they create a false sense of
safety that prevents the team from investing in real safety.

## 4. Adding a new variant — the workflow

Adding a new architectural concept (a new Capability variant, a
new Lifecycle stage, a new anti-pattern code) follows a
fixed-shape change-set:

1. **Update the kernel side first.**  Add the Rust enum variant
   in `crates/verum_kernel/src/arch*.rs`, plus its `tag()` /
   `code()` / `name()` arm, plus any `impl` method extensions.
2. **Update the Verum side.**  Add the variant to the matching
   `core/architecture/*.vr` file, plus any `public fn` helper
   arm.
3. **Update the pin test.**  Bump the expected roster size and
   add the new tag to the canonical lists in
   `k_arch_v_alignment.rs`.
4. **Update the documentation.**  Extend the relevant catalog
   page (anti-patterns, primitives, MTAC, …) to describe the
   new variant.

A change-set missing any of these steps fails CI: either the pin
test catches the drift, or the type-checker catches it because
the Verum side and the kernel side disagree.

## 5. Stdlib-discipline pins

In addition to the kernel ↔ Verum surface alignment, the pin test
file enforces three discipline-level invariants over the Verum
stdlib (`core/`):

### `pin_math_cogs_have_arch_module`

Every `.vr` file directly under `core/math/` must carry an
`@arch_module(foundation, stratum, lifecycle)` self-attestation
declaration.  This was the closing of an ATS-V annotation gap
where four files (`distributed.vr`, `guardrails.vr`,
`examples.vr`, `stack_model.vr`) lacked the attribute despite
the surrounding 60+ siblings carrying it.  The pin reads each
`.vr` directly under the directory and asserts presence;
sub-directories (`frameworks/`, `foundations/`) are checked by
their own pins.

### `pin_registry_covers_mod_mounts`

Every public `mount core.math.frameworks.X` declaration in
`frameworks/mod.vr` must have a matching `framework_record_new(...)`
call somewhere in `frameworks/registry.vr`.  Concretely:

- The 15 mount targets (lurie_htt, schreiber_dcct, …,
  diakrisis*, msfs, bounded_arithmetic, …) all appear in mod.vr.
- The 29 registered frameworks (15 Standard tier — 7 citation
  packages + 6 foundational impls + meta-classifier + special
  actic.raw — plus 14 VerifiedExtension entries — 4 diakrisis
  extensions + 4 MSFS catalogues + 6 bounded-arithmetic entries)
  all appear in registry.vr as `registry_register(r,
  framework_record_new(...))` invocations.
- The advertised `expected_full_canonical_count()` returns
  exactly 29, matching the literal-count audit.

This pin closes the prior docstring drift where registry.vr
claimed "Standard frameworks: ZFC, HoTT, MLTT, CIC, NCG,
∞-topos, cohesive" but never registered them.  The Standard
tier now genuinely contains foundational implementation entries
for `zfc_two_inacc`, `hott`, `cubical`, `mltt`, `cic`, `eff`,
each pointing at the matching `core/math/<tag>.vr` cog.

### `pin_no_internal_references_in_arch_vr`

`core/architecture/*.vr` must not contain `internal/specs/...`
or `internal/holon/...` cross-references — every such reference
has been replaced with detailed inline exposition during the
ATS-V hardening sweep.

### `pin_capability_ontology_aligned`

The kernel-static `arch::canonical_capability_registry()`
returns the same 7 canonical capability tags (logger / metrics /
tracing / config_read / config_admin / supervisor_spawn /
kernel_intrinsic) that the Verum-side
`core/architecture/capability_ontology.vr::ATS_V_CANONICAL_CAPABILITIES`
declares.  Adding a new canonical capability requires updating
both sides AND this pin in the same change-set.

### `pin_phase_inputs_wires_red_team_data`

`run_arch_phase_one_with` (the entry the compiler pipeline
calls) populates `DiagnosticContext.capability_ontology_registry`
from the kernel-static canonical roster.  This activates the
AT-1 closure in real builds — without this wiring, the closure
only fires in unit tests (silent regression risk).

### `pin_compiler_phase_wires_foreign_foundation_constructs`

The compiler-side `verum_compiler::pipeline::ats_v_phase` calls
`run_arch_phase_one_with` (not bare `run_arch_phase_one`) and
constructs `PhaseInputs` with `foreign_foundation_constructs`
populated from `@framework(corpus, "...")` body annotations.
This activates the AP-026 FoundationContentMismatch check in
real builds.

### `pin_verify_cogs_have_arch_module` / `pin_proof_cogs_have_arch_module`

The `@arch_module(...)` annotation discipline applies to
`core/verify/*.vr` and `core/proof/*.vr`.  Each cog in the
verification stack self-attests.

### `pin_universal_arch_module_coverage_in_core`

**Universal pin.** Every `.vr` file under `core/` (recursive,
2158 cogs as of writing) must carry `@arch_module(...)`.  This
is the strongest architectural promise the stdlib makes: ATS-V
annotation discipline is not opt-in, not directory-scoped — it
is the universal contract every cog signs.

The pin walks `core/` recursively (excluding `target/` build
artifacts), counts cogs by their `^module core.X.Y;` declaration,
and asserts every cog carries the attribute.  A floor of 1500
cogs is also asserted as a sanity boundary against accidental
directory deletion.

Adding a new cog requires either annotating it with
`@arch_module(...)` OR adding an explicit exemption to the pin
with rationale.  Files without a `module` declaration (auxiliary
helpers, fixtures) are exempted automatically.

### `pin_counterfactual_helpers_present` / `pin_adjunction_helpers_present` / `pin_yoneda_helpers_present`

Three operationalisation pins assert each cog ships its full
helper surface (tag functions, predicate helpers, soundness
pins).  Adding a new variant or removing a helper requires
updating the matching pin in lockstep.

## 7. Transitive peer-walker pins

The transitive-multi-hop closure (AP-019 + AP-024) introduces
its own pin band — four additional pins that lock in the kernel
↔ compiler boundary for cross-cog DFS traversal.

The walker itself lives in `crates/verum_kernel/src/arch_transitive.rs`.
Two policy adapters
(`resolve_transitive_lifecycle_regressions`,
`resolve_transitive_foundation_downgrades`) compose against
`for_each_transitive_peer` and filter visits by `depth ≥ 2` —
the direct one-hop band is already covered by the standard
peer-resolution surface.  The compiler-side `Session` exposes
two helpers
(`resolve_transitive_lifecycle_regressions`,
`resolve_foundation_downgrades`) that snapshot the
`arch_shape_registry` and dispatch into the kernel.
`PhaseInputs` gained two corresponding fields
(`transitive_lifecycle_regressions`, `foundation_downgrades`)
that propagate into `DiagnosticContext`.

### `pin_transitive_walker_present`

Asserts that `crates/verum_kernel/src/arch_transitive.rs` ships
the canonical surface:

- `pub fn for_each_transitive_peer`
- `pub fn resolve_transitive_lifecycle_regressions`
- `pub fn resolve_transitive_foundation_downgrades`
- `pub const MAX_TRANSITIVE_DEPTH`
- `pub struct PeerVisit`

Renaming the walker, dropping the depth bound, or removing the
public adapters fails the pin.  `MAX_TRANSITIVE_DEPTH = 32` is
the default cycle-prevention floor — sufficient for every
real-world graph observed in the corpus.

### `pin_phase_inputs_transitive_fields_present`

Asserts both that `PhaseInputs` exposes the two new fields
(`transitive_lifecycle_regressions`, `foundation_downgrades`)
and that `run_arch_phase_one_with` propagates them into
`DiagnosticContext`.  Without this propagation the resolvers
populate the inputs but the diagnostic emitters never see them,
so the violations would surface only in unit tests.

### `pin_session_transitive_resolvers_present`

Asserts that the compiler crate exposes the two `Session`
helpers and that `verum_compiler/src/pipeline/ats_v_phase.rs`
calls them.  This closes the "wired in unit tests but not in
real builds" failure mode.  The pin reads
`crates/verum_compiler/src/session.rs` for
`resolve_transitive_lifecycle_regressions` /
`resolve_foundation_downgrades` declarations and
`ats_v_phase.rs` for matching call sites plus the populated
field references.

### `pin_transitive_resolver_correctness`

A small functional pin that constructs a three-cog registry
(theorem `start` → theorem `A` → hypothesis `B`), invokes
`resolve_transitive_lifecycle_regressions`, and asserts exactly
one regression chain is reported with `intermediate = "A"` and
`terminal = "B"`.  The direct edge `start → A` does not regress
(both are theorems); only the depth-2 chain through `A` to `B`
violates.

This pin is the *liveness pin* for the resolver: it would fail
if the depth-`≥2` filter were inverted, the cycle prevention
were over-eager, or the recursion bottomed out incorrectly.

The four pins together raised the cross-side alignment count
from **39 → 43**, and subsequent FV-9 38-rule real-Typing closure
plus AP-040 articulation-hygiene pins brought the total to **53
as of 2026-05-08**.  Adding a new resolver in the same band
(e.g. the future AP-018 `CompositionPathDeception` adapter,
which will also need depth-`≥2` semantics) requires composing
against `for_each_transitive_peer` — re-implementing DFS in a
separate file fails review.

## 8. Diagnostic-bundle integration

The audit-bundle aggregator (`verum audit --bundle`) walks every
ATS-V kernel-discharge axiom and summarises per-cog and
per-corpus discharge status.  After this release, the bundle
covers all twelve canonical kernel-discharge intrinsics:

- `kernel_arch_capability_discipline`
- `kernel_arch_boundary_check`
- `kernel_arch_composition_check`
- `kernel_arch_lifecycle_check`
- `kernel_arch_foundation_consistency`
- `kernel_arch_anti_pattern_check`
- `kernel_arch_cve_closure`
- `kernel_arch_soundness_v0`
- `kernel_arch_capability_ontology_check` (AT-1 closure)
- `kernel_arch_yoneda_canonical_roster_complete` (AT-3 closure)
- `kernel_arch_theorem_cve_required` (AT-2 closure)
- `kernel_arch_consumes_format_check` (AT-5 closure)

The pin test verifies that every dispatch entry in the kernel's
intrinsic table has a matching Verum-side `axiom` declaration,
preventing kernel-only discharges from leaking past the Verum
declarations.

## 9. Cross-reference

- [Operationalisation surface](./operationalisation.md)
- [Adversarial threat modelling — closed attack vectors](./red-team.md)
- [Anti-pattern catalog overview](./anti-patterns/overview.md)

## 10. Full bidirectional inventory diff

The pin tests cover the *aligned surface* — types and helpers that
must agree across the kernel/Verum boundary.  But the
architectural-type ecosystem also has zones that intentionally
live on only one side.  This section enumerates the three zones.

### 10.1 Shared zone (47 types) — alignment-pinned

Both `pub enum` / `pub struct` (Rust) and `public type` (Verum)
declarations exist; every variant or field is pinned by a test in
`k_arch_v_alignment.rs`.  Any drift fails CI with a concrete
diagnostic.

The 47 shared types are listed in §1 above, partitioned into the
five semantic bands (capability/boundary, lifecycle/foundation,
CVE primitives, defect taxonomy, corpus-level).

### 10.2 Kernel-only zone (9 types) — parser-internal attributes

These Rust types exist only on the kernel side because they are
**internal attribute representations** — the kernel parses the
inline `@arch_module(...)` / `@arch_corpus(...)` /
`@framework(...)` syntax INTO these structs, runs analysis
against them, then discards them.  They never appear in user-
written Verum code; they have no `public type` twin in
`core/architecture/*.vr` because there is nothing for the user
to reference.

| Kernel-only type | File | Role |
|---|---|---|
| `ArchCorpusAttr`        | `arch.rs`              | Parsed `@arch_corpus(...)` payload |
| `MtacDecisionAttr`      | `arch.rs`              | Parsed `@mtac_decision(...)` payload |
| `BridgeTier`            | `arch.rs`              | Tier-bridge declaration parsed from `@framework(bridge_tier, ...)` |
| `DeterministicMarker`   | `arch.rs`              | `@deterministic` marker |
| `ShapeDelta`            | `arch_anti_pattern.rs` | Diff between declared shape and inferred shape — feeds AP-025 |
| `ForbiddenCitation`     | `arch_anti_pattern.rs` | Citation-graph entry for AP-009 / AP-024 violations |
| `ForbiddenRegisterKind` | `arch_anti_pattern.rs` | Register-mixing classifier for AP-006 |
| `MtacModality`          | `arch.rs`              | Parser-internal modality tag (□ / ◇ / etc.) before `ModalAssertion` is built |
| `PeerVisit`             | `arch_transitive.rs`   | Per-step state of the DFS walker; never escapes the walker |

**Rationale for not exposing.** Each of these types is either
(a) a parser intermediate that the kernel mints from source text,
(b) an internal walker state that should not be observable from
user code, or (c) a defect-detection artefact whose lifetime is
bounded by a single `arch_phase_one` invocation.  Exposing them
would require committing to wire-format stability for transient
state — a maintenance burden with no compensating user value.

### 10.3 Verum-only zone (37 types) — analysis libraries

These `public type` declarations exist only on the Verum side
because they are **stdlib analysis libraries** built on top of
the shared primitives.  They are pure userland code: a cog that
wants to compute counterfactual evaluations, audit observer
agreement, or verify adjunction witnesses uses these types
without the kernel needing to know about them.

| Module | Verum-only types | Purpose |
|---|---|---|
| `core.architecture.composition`     | `CompositionResult` | Two-arm Ok/Err return for `compose_cogs(a, b)` |
| `core.architecture.adjunction`      | `CanonicalAdjunction`, `RefactoringDirection`, `Refactoring`, `RefactoringChain`, `AdjunctionVerdict`, `AdjunctionAnalysis`, `AdjunctionWitness`, `Reversibility`, `PreservedCoverage`, `GainedCoverage`, `ChainAnalysis` | Adjunction-as-refactor calculus per [`adjunctions.md`](./adjunctions.md) |
| `core.architecture.capability_ontology` | `CapabilityRegistration` | Per-cog ontology entry for AT-1 closure |
| `core.architecture.counterfactual`  | `ArchMetric`, `MetricValue`, `InvariantStatus`, `MetricComparison`, `InvariantEvaluation`, `CounterfactualPair`, `CounterfactualReport`, `ArchEvolution` | Modal-counterfactual reasoning per [`counterfactual.md`](./counterfactual.md) |
| `core.architecture.mtac`            | `TimePoint`, `DecisionOption`, `Decision`, `Observer`, `ArchProposition`, `ModalAssertion`, `ComplexityClass` | Modal-temporal architectural calculus per [`mtac.md`](./mtac.md) |
| `core.architecture.parse`           | `ArchParseError` | Five-arm Verum-side mirror of kernel parse errors (the kernel returns its own internal error type; this re-publishes a stable surface for consumers) |
| `core.architecture.phase`           | `ModuleArchResult`, `ArchPhaseReport`, `CompositionStep`, `CompositionVerificationReport` | Per-cog and per-corpus phase results emitted by `arch_phase_one` |
| `core.architecture.yoneda`          | `ShapeObservation`, `AgreementStatus`, `ObserverAgreement`, `YonedaVerdict` | Yoneda-style observer cross-check per [`audit-protocol.md`](./audit-protocol.md) |

**Rationale for not pinning.** Each of these types operates
**downstream** of the kernel boundary.  The kernel emits a
shared-zone value (a `Shape`, an `ArchitecturalDefect`, an
`AntiPatternViolation`); the Verum-only types ingest that value
and produce higher-level analytical artefacts (counterfactual
metric series, adjunction witness chains, observer-agreement
verdicts).  Adding a kernel-side twin would create a circular
dependency: the analysis library would have to live in the
kernel, and the kernel would lose its kernel/userland separation.

The pin discipline still applies *transitively*: every
Verum-only type that consumes a shared-zone value is checked at
typecheck time against the variant set of that shared value.  If
the kernel adds a new `Lifecycle` variant, the
`counterfactual.ArchEvolution` Verum type's `match` arms break
until they handle it — exhaustiveness checking enforces drift
detection without an explicit pin.

### 10.4 Reading the inventory

To audit alignment health for a given concept (e.g. "is
`ResourceTag` properly synchronised?"):

1. Look up the type in the §1 sub-tables to confirm it is in
   the shared zone with N variants pinned.
2. Open `crates/verum_kernel/tests/k_arch_v_alignment.rs` and
   search for a `pin_<name>_variants_aligned` test.  If present,
   variant alignment is enforced.
3. If no specific pin exists, the type is covered by the
   universal coverage pins (`pin_universal_arch_module_coverage_in_core`,
   `pin_mod_re_exports_full_surface`) — the `mod.vr` re-export
   pin will fail if the public surface drifts.

To audit a Verum-only analysis library (e.g.
`core.architecture.mtac.ModalAssertion`):

1. Open the corresponding analysis-library file under
   `core/architecture/`.
2. Confirm the file is included in the `pin_<module>_module_present`
   roster in §2 band 3.
3. Confirm the helper-presence pin
   (`pin_<helper>_helpers_present` for `counterfactual` /
   `adjunction` / `yoneda`) covers the cog's exported helpers.
