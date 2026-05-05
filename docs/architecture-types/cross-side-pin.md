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
  `@arch_module(...)`, builds Shapes, runs the 32-pattern
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
code** for the architectural type system.  Concretely:

| Element | Verum side | Kernel side |
|---|---|---|
| `Tier`         | `core.architecture.types.Tier` (5 variants) | `verum_kernel::arch::Tier` |
| `Lifecycle`    | `core.architecture.types.Lifecycle` (9 variants) | `verum_kernel::arch::Lifecycle` |
| `Foundation`   | `core.architecture.types.Foundation` (7 variants) | `verum_kernel::arch::Foundation` |
| `MsfsStratum`  | `core.architecture.types.MsfsStratum` (4 variants) | `verum_kernel::arch::MsfsStratum` |
| `Capability`   | `core.architecture.types.Capability` (9 variants) | `verum_kernel::arch::Capability` |
| `BoundaryInvariant` | `core.architecture.types.BoundaryInvariant` (5 variants) | `verum_kernel::arch::BoundaryInvariant` |
| `WireEncoding` | `core.architecture.types.WireEncoding` (5 variants) | `verum_kernel::arch::WireEncoding` |
| `BoundaryPhysicalLayer` | `core.architecture.types.BoundaryPhysicalLayer` (4 variants) | `verum_kernel::arch::BoundaryPhysicalLayer` |
| `MessageType`  | `core.architecture.types.MessageType` (4 variants) | `verum_kernel::arch::MessageType` |
| `VerifyStrategy` | `core.architecture.types.VerifyStrategy` (9 strategies) | `verum_kernel::arch::VerifyStrategy` |
| `TimePoint`    | `core.architecture.mtac.TimePoint` (4 variants) | `verum_kernel::arch_mtac::TimePoint` |
| `Observer`     | `core.architecture.mtac.Observer` (5 canonical) | `verum_kernel::arch_mtac::Observer` |
| `ModalAssertion` | `core.architecture.mtac.ModalAssertion` (6 operators) | `verum_kernel::arch_mtac::ModalAssertion` |
| `ArchProposition` | `core.architecture.mtac.ArchProposition` (4 baseline) | `verum_kernel::arch_mtac::ArchProposition` |
| `ComplexityClass` | `core.architecture.mtac.ComplexityClass` (5 levels) | `verum_kernel::arch_mtac::ComplexityClass` |
| `Reversibility` | `core.architecture.mtac.Reversibility` (3 kinds) | `verum_kernel::arch_mtac::Reversibility` |
| `AntiPatternCode` | `core.architecture.anti_patterns.AntiPatternCode` (32 codes) | `verum_kernel::arch_anti_pattern::AntiPatternCode` |
| `Severity`     | `core.architecture.anti_patterns.Severity` (3 levels) | `verum_kernel::arch_anti_pattern::Severity` |
| `CorpusInvariant` | `core.architecture.corpus.CorpusInvariant` (4 invariants) | `verum_kernel::arch_corpus::CorpusInvariant` |
| `CompositionResult` | `core.architecture.composition.CompositionResult` (2 arms) | `verum_kernel::arch_composition::CompositionResult` |
| `ArchParseError` | `core.architecture.parse.ArchParseError` (5 variants) | `verum_kernel::arch_parse::ArchParseError` |
| `CanonicalAdjunction` | `core.architecture.adjunction.CanonicalAdjunction` (5 arms) | `verum_kernel::arch_adjunction::CanonicalAdjunction` |
| `AdjunctionVerdict` | `core.architecture.adjunction.AdjunctionVerdict` (4 arms) | `verum_kernel::arch_adjunction::AdjunctionVerdict` |
| `ArchMetric`   | `core.architecture.counterfactual.ArchMetric` (12 baseline + Custom) | `verum_kernel::arch_counterfactual::ArchMetric` |
| `MetricValue`  | `core.architecture.counterfactual.MetricValue` (4 arms) | `verum_kernel::arch_counterfactual::MetricValue` |
| `InvariantStatus` | `core.architecture.counterfactual.InvariantStatus` (4 arms) | `verum_kernel::arch_counterfactual::InvariantStatus` |
| `ShapeObservation` | `core.architecture.yoneda.ShapeObservation` (5 observer-views) | `verum_kernel::arch_yoneda::ShapeObservation` |
| Canonical-field roster | `arch_module_canonical_fields()` (13 names) | `verum_kernel::arch_parse::parse_arch_module` field switch |

Helper functions tracked: `tier_compatible_with`,
`lifecycle_rank`, `lifecycle_cve_glyph`, `foundation_directly_subsumed_by`,
`stratum_is_admissible`, `cve_closure_degree`, `verify_strategy_rank`,
`time_point_precedes`, `decision_is_resolved`,
`observer_full_canonical_roster`, `modal_is_temporal`, `modal_is_modal`,
`adjunction_witness_is_adjoint_of`, `anti_pattern_full_roster`,
`corpus_invariant_full_list`, `arch_module_canonical_fields`.

## 2. The pin test contract

The cross-side pin test lives at
`crates/verum_kernel/tests/k_arch_v_alignment.rs`.  It enforces
three invariants:

1. **Variant set equality.** For every enum tracked above, the
   set of variant tags computed by the kernel-side `tag()` /
   `code()` / `name()` methods equals the set of variant tags
   computed by the Verum-side helper of the same name.
2. **Roster size pin.** Every full-roster helper
   (`observer_full_canonical_roster`, `anti_pattern_full_roster`,
   `corpus_invariant_full_list`, `arch_module_canonical_fields`)
   has its size hard-pinned in the test.  A change to roster
   size requires explicit test update — a guard against
   silently extending the catalog.
3. **Helper presence.** Every helper listed above must exist on
   both sides with the same name and signature.  A grep over
   `core/architecture/*.vr` checks for `pub fn <helper_name>` and
   the kernel side enforces presence via the Rust type system.

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

## 5. Diagnostic-bundle integration

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

## Cross-reference

- [Operationalisation surface](./operationalisation.md)
- [Red-team — closed attack vectors](./red-team.md)
- [Anti-pattern catalog overview](./anti-patterns/overview.md)
