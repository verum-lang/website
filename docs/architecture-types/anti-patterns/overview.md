---
sidebar_position: 1
title: "Anti-pattern catalog — overview"
description: "Thirty-two canonical architectural defects ATS-V detects at compile time, organised in three bands matching the canonical anti-pattern catalog."
slug: /architecture-types/anti-patterns
---

# Anti-pattern catalog — overview

The Architectural Type System for Verum maintains a **canonical
catalog of architectural defects**, each registered as a
refinement-level predicate the compiler checks. This page indexes
the catalog and explains its structure. Each anti-pattern has its
deep entry in one of the three band-specific pages.

The catalog itself — the closed enumeration of canonical
anti-patterns — is the canonical source. The website mirrors
the catalog exactly; adding a new pattern is the only way to
extend the surface, and the docs follow the catalog, never the
other way round.

The catalog is *enumerable* — `verum audit --arch-discharges`
prints every entry with its current verdict for the project at
hand. The catalog is also *append-only*: a future Verum version
may add patterns; existing patterns are never renumbered or
removed.

## 1. The three bands

The thirty-two patterns split into three bands by *what kind of
architectural concern they address*. The bands are documentary
categories — they all share the same diagnostic infrastructure,
the same RFC code format (`ATS-V-AP-NNN`), and the same audit
pipeline.

| Band | Range | Concern | Page |
|------|-------|---------|------|
| **Capability / composition core** | AP-001 .. AP-010 | Capability discipline, composition algebra, lifecycle ordering, foundation drift, register mixing, transaction / resource straddling, CVE-closure completeness | [classical](./classical.md) |
| **Boundary / lifecycle / capability ontology** | AP-011 .. AP-026 | Stratum admissibility, boundary invariants, wire encoding, authentication, deterministic-test discipline, linear / affine / relevant capability flavours, persistence and time-bound contracts, transitive lifecycle, declaration vs body drift, foundation-content alignment | [ontology](./articulation.md) |
| **Modal-temporal architectural calculus** | AP-027 .. AP-032 | Temporal stability, counterfactual brittleness, refactoring adjunctions, universal-property uniqueness, evolution-trigger satisfiability, Yoneda observer-functor invariance | [mtac](./mtac.md) |

The `classical` and `ontology` bands together cover what the
ATS-V specification calls *static-architecture defects* —
violations the compiler can decide without simulating time or
counterfactuals. The MTAC band handles the modal-temporal
surface (per spec §20–§23): time as a non-linear lattice,
counterfactuals as paired decision swaps, refactorings as
adjunctions, observers as Yoneda functors.

## 2. The catalog at a glance

| Code | Name | Band | Triggered by |
|------|------|------|--------------|
| AP-001 | CapabilityEscalation | core | body uses capability not declared in `requires` |
| AP-002 | CapabilityLeak | core | linear / affine capability passed beyond its declared scope |
| AP-003 | DependencyCycle | core | `composes_with` graph contains a cycle |
| AP-004 | TierMixing | core | tier-N cog calls into tier-M without a bridge |
| AP-005 | FoundationDrift | core | composing cogs with incompatible foundations and no bridge |
| AP-006 | RegisterMixing | core | proof / discharge mixes incompatible MSFS registers |
| AP-007 | TxStraddling | core | transaction lives across an `await` boundary without scope |
| AP-008 | ResourceStraddling | core | linear resource (file handle, db connection) outlives its scope |
| AP-009 | LifecycleRegression | core | citation chain regresses to a strictly-lower lifecycle rank |
| AP-010 | CveIncomplete | core | strict-mode cog with at least one missing CVE-closure axis |
| AP-011 | AbsoluteBoundaryAttempt | ontology | cog declares `MsfsStratum::LAbs` (AFN-T α violation) |
| AP-012 | InvariantViolation | ontology | declared `BoundaryInvariant` is not preserved by the boundary's traffic |
| AP-013 | DanglingMessageType | ontology | message type declared without a wire encoding |
| AP-014 | UnauthenticatedCrossing | ontology | `Network` boundary without `BoundaryInvariant::AuthenticatedFirst` |
| AP-015 | DeterministicViolation | ontology | DST / replay test depends on non-deterministic primitives |
| AP-016 | CapabilityDuplication | ontology | `Linear` capability used twice (multiplicity violation) |
| AP-017 | OrphanCapability | ontology | `Relevant` capability declared but never exercised |
| AP-018 | MissingHandoff | ontology | composition capability not listed in `composes_with` |
| AP-019 | FoundationDowngrade | ontology | strong foundation passed through a weaker one without bridge |
| AP-020 | TimeBoundLeakage | ontology | `TimeBound` capability outlives its declared TTL |
| AP-021 | PersistenceMismatch | ontology | `Persist` capability for an operation that is not actually durable |
| AP-022 | CapabilityLaundering | ontology | multi-hop privilege escalation through unmarked boundary |
| AP-023 | FoundationForgery | ontology | declared foundation contradicts the cited axiom corpus |
| AP-024 | TransitiveLifecycleRegression | ontology | transitive `[Т] → … → [Г]` citation chain |
| AP-025 | DeclarationDrift | ontology | declared `@arch_module(...)` shape diverges from inferred shape |
| AP-026 | FoundationContentMismatch | ontology | code body uses constructs from a foreign foundation |
| AP-027 | TemporalInconsistency | mtac | invariant fails to hold across two sampled time-points |
| AP-028 | CounterfactualBrittleness | mtac | verdict is fragile under counterfactual decision swap |
| AP-029 | MissedAdjoint | mtac | refactoring claimed without its inverse adjoint pair |
| AP-030 | UniversalPropertyViolation | mtac | universal-property uniqueness claim with no witness |
| AP-031 | PhantomEvolution | mtac | declared evolution path passes through an unsatisfiable trigger |
| AP-032 | YonedaInequivalentRefactor | mtac | refactor changes the observer-functor (Yoneda inequivalent) |

## 3. The anatomy of an anti-pattern

Each entry in the catalog is structured identically. The catalog
*is* a refinement-type-level specification — every pattern is a
predicate, every diagnostic is a counterexample.

```text
┌─ AP-NNN — name ──────────────────────────────────────────────┐
│                                                               │
│  Severity:    error / warning / hint                          │
│  Band:        core | ontology | mtac                          │
│  Phase:       arch-check | post-arch | bundle                 │
│  Stable:      yes (RFC-locked)                                │
│                                                               │
│  Predicate:   forall Shape s, DiagnosticContext ctx.          │
│               P(s, ctx) → defect                              │
│                                                               │
│  Diagnostic:  [error template with span pointers]             │
│                                                               │
│  Remediation: [canonical fix recipe]                          │
│                                                               │
│  Pin test:    smallest synthetic Shape that reproduces        │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

Three properties are load-bearing:

1. **The RFC code is stable.** `AP-001` always means
   `CapabilityEscalation`, even if the prose explanation is
   rewritten. Tooling that consumes audit reports can rely on
   the code as a permanent identifier.
2. **The predicate is published.** Every anti-pattern's predicate
   is part of the catalog's externally observable surface. There
   are no hidden patterns that fire without an entry in this
   table. The catalog's predicate is the canonical reference;
   the docs paraphrase it.
3. **The pin test exists.** Every catalog entry has a
   regression-pin synthetic example. The audit gate would surface
   a *false negative* if the pattern stopped triggering on its
   pin — the pin protects the catalog against silent degradation.

## 4. Severity levels

Patterns trigger at one of three severity levels:

- **Error** — the build fails. Most core and ontology patterns
  are errors when the cog is in `strict` mode. The compiler
  refuses to emit code.
- **Warning** — the build proceeds but `verum audit` reports the
  pattern. Used for patterns that may have legitimate
  workarounds in soft mode (e.g., `AP-001 CapabilityEscalation`
  is a warning when `strict = false`, error in strict mode).
- **Hint** — informational only; the pattern is a *candidate*,
  pending confirmation by additional context. Used for inference
  hints (e.g., "consider declaring this capability explicitly").

Severity is per-pattern × per-cog: many patterns escalate to
error in `strict: true` and remain warnings in soft mode. The
escalation is encoded in each `check_*` function's
`Severity` selection. `verum.toml` allows project overrides via
`[ats_v.severity]`:

```toml
[ats_v.severity]
ap_005_foundation_drift = "warning"   # ← demote from error
ap_019_foundation_downgrade = "error" # ← always error
```

Some patterns *cannot* be demoted below "warning" — those that
would compromise soundness if silenced (most ontology patterns
that touch the trusted base, all MTAC patterns).

## 5. Phases

Patterns trigger in three phases of the build:

- **arch-check** — during the architectural type-checking phase,
  cog-by-cog. Most core patterns fire here.
- **post-arch** — after every cog has been arch-checked,
  walking the cross-cog graph. Transitive patterns
  (`AP-024 TransitiveLifecycleRegression`,
  `AP-022 CapabilityLaundering`) and corpus-level invariants
  fire here.
- **bundle** — at audit time, when `verum audit --bundle` walks
  the entire project. MTAC patterns fire here, because they
  require the full project graph plus the temporal / counterfactual
  / observer samples as input
  (see `DiagnosticContext::temporal_samples` /
  `counterfactual_pairs` / `yoneda_observer_diff`).

A pattern's phase is fixed; the audit pipeline runs phases in
order and aggregates verdicts.

## 6. Suppressions and exceptions

ATS-V provides a single, audit-visible suppression mechanism:

```verum
@arch_module(
    requires: [...],
    @suppress(AP_005_foundation_drift, "explicitly bridged via core.proof.bridges")
)
module my_app.cross_foundation_proof;
```

The `@suppress` attribute:

- Names the specific RFC code (no wildcards).
- Carries a *mandatory rationale string*. The rationale is
  preserved in the audit chronicle.
- Does *not* hide the pattern from `verum audit`; the audit
  report shows suppressed patterns separately, with their
  rationale.

There is no global suppression flag. There is no `#[allow(...)]`.
Architectural defects are always observable.

## 7. Catalog growth

The catalog is append-only:

- New patterns may be added in any release. They take the next
  unused RFC code.
- Existing patterns may have their *prose* rewritten or their
  diagnostic improved.
- Existing patterns may be *split* into two more-precise patterns
  (the original code is preserved as a *deprecated alias*).
- Existing patterns may be *demoted in severity* but never
  removed.
- Existing patterns may be *promoted from warning to error* only
  in major releases, and only with a deprecation cycle.

This discipline gives downstream codebases a stable target. A
build that passes `verum audit --arch-discharges` today will
continue to pass under future versions, modulo strict
opt-in patterns.

## 8. The audit gate

`verum audit --arch-discharges` runs the catalog and emits a
structured JSON report:

```json
{
  "schema_version": 2,
  "verum_version": "0.x.y",
  "patterns": [
    {
      "code": "ATS-V-AP-001",
      "name": "CapabilityEscalation",
      "severity": "error",
      "verdict": "ok",
      "occurrences": []
    },
    {
      "code": "ATS-V-AP-009",
      "name": "LifecycleRegression",
      "severity": "error",
      "verdict": "violations",
      "occurrences": [
        {
          "citing": "my_app.checkout",
          "cited":  "my_app.experimental.zk_proof",
          "citing_lifecycle": "Theorem(\"v1.0\")",
          "cited_lifecycle":  "Hypothesis(Medium)",
          "rank_diff": 4
        }
      ]
    }
  ],
  "summary": {
    "total_patterns": 32,
    "ok": 31,
    "violations": 1,
    "suppressed": 0
  }
}
```

The report is suitable for archival in audit chronicles. Schema
version 2 is the current schema; older schema versions are
preserved as adapters.

## 9. Default severity at a glance

A common question: *"how many of the thirty-two are errors by
default?"* The default is encoded in each `check_*` function;
many patterns escalate when `Shape.strict == true`. The summary
below is the *strict-mode* picture:

| Severity | Count | Patterns |
|----------|-------|----------|
| Error | 24 | AP-001..AP-009 (core), AP-011, AP-012, AP-014, AP-015, AP-016, AP-018, AP-019, AP-022, AP-023, AP-024, AP-025, AP-027, AP-028, AP-029, AP-031 |
| Warning | 6 | AP-010 (CveIncomplete in soft mode), AP-013, AP-017, AP-020, AP-021, AP-026 |
| Hint | 2 | AP-030 (UniversalPropertyViolation candidate), AP-032 (YonedaInequivalentRefactor candidate) |

A clean default-mode build emits zero warnings; a clean strict-mode
build also has zero hints. Many codebases adopt strict mode
incrementally per cog (via `@arch_module(strict: true)`).

## 10. Cross-references

- [Capability / composition core (AP-001 .. AP-010)](./classical.md)
- [Boundary / lifecycle / capability ontology (AP-011 .. AP-026)](./articulation.md)
- [Modal-temporal anti-patterns (AP-027 .. AP-032)](./mtac.md)
- [Audit protocol](../audit-protocol.md) — running the gates.
- [Three orthogonal axes](../orthogonality.md) — why `AP-001`
  catches a different class of defect than the property system.
