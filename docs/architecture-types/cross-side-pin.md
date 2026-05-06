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

The four pins together raise the cross-side alignment count from
**39 → 43**.  Adding a new resolver in the same band (e.g. the
future AP-018 `CompositionPathDeception` adapter, which will
also need depth-`≥2` semantics) requires composing against
`for_each_transitive_peer` — re-implementing DFS in a separate
file fails review.

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
- [Red-team — closed attack vectors](./red-team.md)
- [Anti-pattern catalog overview](./anti-patterns/overview.md)
