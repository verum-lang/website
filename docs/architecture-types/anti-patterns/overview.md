---
sidebar_position: 1
title: "Anti-pattern catalog — overview"
description: "Thirty-two canonical architectural defects ATS-V detects at compile time, organised in four bands: classical, articulation, coherence, modal-temporal."
slug: /architecture-types/anti-patterns
---

# Anti-pattern catalog — overview

The Architectural Type System for Verum maintains a **canonical
catalog of architectural defects**, each registered as a
refinement-level predicate the compiler checks. This page indexes
the catalog and explains its structure. Each anti-pattern has its
own deep entry in one of the four band-specific pages.

The catalog is *enumerable* — `verum audit --arch-discharges`
prints every entry with its current verdict for the project at
hand. The catalog is also *append-only*: a future Verum version
may add patterns; existing patterns are never renumbered or
removed.

## 1. The four bands

The thirty-two patterns split into four bands by *what kind of
architectural concern they address*. The bands are documentary
categories — they all share the same diagnostic infrastructure,
the same RFC code format (`ATS-V-AP-NNN`), and the same audit
pipeline.

| Band | Range | Concern | Page |
|------|-------|---------|------|
| **Classical** | AP-001 .. AP-009 | Capability discipline, composition algebra, lifecycle ordering, foundation drift | [classical](./classical.md) |
| **Articulation hygiene** | AP-010 .. AP-018 | Self-reference, ungrounded assumption, retracted citation, hypothesis without plan | [articulation](./articulation.md) |
| **Coherence** | AP-019 .. AP-026 | α/ε bidirectional coherence, framework-axiom collision, transitive lifecycle, reflection-tower exhaustion | [coherence](./coherence.md) |
| **Modal-temporal** | AP-027 .. AP-032 | Premature observation, decision-without-context, observer impersonation, modal collision, temporal cycle, counterfactual divergence | [mtac](./mtac.md) |

## 2. The catalog at a glance

| Code | Name | Band | Triggered by |
|------|------|------|--------------|
| AP-001 | CapabilityEscalation | Classical | body uses capability not in `exposes` |
| AP-002 | BoundaryViolation | Classical | message crosses cog edge without satisfying `BoundaryInvariant` |
| AP-003 | DependencyCycle | Classical | `composes_with` graph contains a cycle |
| AP-004 | TierMixing | Classical | tier-1 cog calls tier-0 without bridge |
| AP-005 | FoundationDrift | Classical | tier mismatch without explicit functor-bridge |
| AP-006 | RegisterMixing | Classical | mixing two MSFS registers in a single proof |
| AP-007 | StratumAdmissibility | Classical | mentioning `LAbs` content without admissibility check |
| AP-008 | CompositionAssociativityBreak | Classical | non-associative composition emitted by macro |
| AP-009 | LifecycleRegression | Classical | citing a strictly-lower-rank Lifecycle |
| AP-010 | CircularSelfReference | Articulation | self-reference without operator |
| AP-011 | UngroundedAssumption | Articulation | claim without К or В content |
| AP-012 | OverQuantifiedScope | Articulation | universal quantifier outside its register |
| AP-013 | RetractedCitationUse | Articulation | citing a `[✗]` artefact |
| AP-014 | UndisclosedDependency | Articulation | proof relies on uncited framework axiom |
| AP-015 | DeclarationBodyDrift | Articulation | `Shape` claim contradicts cog body |
| AP-016 | HypothesisWithoutMaturationPlan | Articulation | `[Г]` cog without `@plan(...)` |
| AP-017 | InterpretationInMatureCorpus | Articulation | `[И]` cog in `strict: true` |
| AP-018 | DefinitionShadowing | Articulation | two `[О]` definitions of same name in scope |
| AP-019 | CapabilityLaundering | Coherence | capability erased by transit through unmarked boundary |
| AP-020 | FoundationForgery | Coherence | claiming a Foundation the proof corpus contradicts |
| AP-021 | TransitiveCoherenceFailure | Coherence | α-coherence failure on a transitive chain |
| AP-022 | MsfsCoordinateDrift | Coherence | MSFS coord disagrees across cogs |
| AP-023 | FrameworkAxiomCollision | Coherence | two cogs cite incompatible axiom systems |
| AP-024 | ProofExportRoundTripBreak | Coherence | `verum extract` + re-import yields different shape |
| AP-025 | ReflectionTowerExhaustion | Coherence | proof requires meta-theory beyond MSFS Theorem 8.2's bound (Con(S) + 1·κ_inacc) |
| AP-026 | TransitiveLifecycleRegression | Coherence | citation chain exposes low-rank link |
| AP-027 | PrematureObservation | MTAC | observer reads a value before its decision point |
| AP-028 | DecisionWithoutContext | MTAC | decision lacks observer or modality |
| AP-029 | ObserverImpersonation | MTAC | role A asserts in role B's register |
| AP-030 | ModalCollision | MTAC | two incompatible modals attached to same proposition |
| AP-031 | TemporalCycle | MTAC | `before` / `after` graph contains a cycle |
| AP-032 | CounterfactualDivergence | MTAC | counterfactual report contradicts base scenario invariant |

## 3. The anatomy of an anti-pattern

Each entry in the catalog is structured identically. The catalog
*is* a refinement-type-level specification — every pattern is a
predicate, every diagnostic is a counterexample.

```text
┌─ AP-NNN — name ──────────────────────────────────────────────┐
│                                                               │
│  Severity:    error / warning / hint                          │
│  Band:        classical | articulation | coherence | mtac     │
│  Phase:       arch-check | post-arch | bundle                 │
│  Stable:      yes (RFC-locked)                                │
│                                                               │
│  Predicate:   forall Shape s, Body b. P(s, b) → defect        │
│                                                               │
│  Diagnostic:  [error tem template with span pointers]         │
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
   table.
3. **The pin test exists.** Every catalog entry has a
   regression-pin synthetic example. The audit gate would surface
   a *false negative* if the pattern stopped triggering on its
   pin — the pin protects the catalog against silent degradation.

## 4. Severity levels

Patterns trigger at one of three severity levels:

- **Error** — the build fails. Most classical and articulation
  patterns are errors. The compiler refuses to emit code.
- **Warning** — the build proceeds but `verum audit` reports the
  pattern. Used for patterns that may have legitimate
  workarounds (e.g., `AP-005 FoundationDrift` with an explicit
  `@bridge(...)` attribute).
- **Hint** — informational only; the pattern is a *candidate*,
  pending confirmation by additional context. Used for inference
  hints (e.g., "consider declaring this capability explicitly").

The default severity is per-pattern; `verum.toml` allows project
overrides via `[ats_v.severity]`:

```toml
[ats_v.severity]
ap_005_foundation_drift = "warning"   # ← demote from error
ap_019_capability_laundering = "error" # ← always error
```

Some patterns *cannot* be demoted below "warning" — those that
would compromise soundness if silenced (most coherence and MTAC
patterns).

## 5. Phases

Patterns trigger in three phases of the build:

- **arch-check** — during the architectural type-checking phase,
  cog-by-cog. Most classical patterns fire here.
- **post-arch** — after every cog has been arch-checked,
  walking the cross-cog graph. Coherence patterns and transitive
  patterns (e.g., `AP-026 TransitiveLifecycleRegression`) fire
  here.
- **bundle** — at audit time, when `verum audit --bundle` walks
  the entire project. MTAC patterns and counterfactual patterns
  fire here, because they require the full project graph as
  input.

A pattern's phase is fixed; the audit pipeline runs phases in
order and aggregates verdicts.

## 6. Suppressions and exceptions

ATS-V provides a single, audit-visible suppression mechanism:

```verum
@arch_module(
    exposes: [...],
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
      "code": "AP-001",
      "name": "CapabilityEscalation",
      "severity": "error",
      "verdict": "ok",
      "occurrences": []
    },
    {
      "code": "AP-009",
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

## 9. Severity matrix at a glance

A common question: *"how many of the thirty-two are errors by
default?"*

| Severity | Count | Patterns |
|----------|-------|----------|
| Error | 22 | AP-001..AP-009, AP-013, AP-015, AP-016, AP-017, AP-018, AP-019, AP-020, AP-022, AP-023, AP-024, AP-026, AP-029, AP-030, AP-031 |
| Warning | 8 | AP-010, AP-011, AP-012, AP-014, AP-021, AP-025, AP-027, AP-028 |
| Hint | 2 | AP-032 (informational), one capability-inference hint shared across the catalog |

A clean default-mode build emits zero warnings; a clean strict-mode
build also has zero hints. Many codebases adopt strict mode
incrementally per cog (via `Shape.strict = true`).

## 10. Cross-references

- [Classical anti-patterns (AP-001 .. AP-009)](./classical.md)
- [Articulation anti-patterns (AP-010 .. AP-018)](./articulation.md)
- [Coherence anti-patterns (AP-019 .. AP-026)](./coherence.md)
- [Modal-temporal anti-patterns (AP-027 .. AP-032)](./mtac.md)
- [Audit protocol](../audit-protocol.md) — running the gates.
- [Three orthogonal axes](../orthogonality.md) — why `AP-001`
  catches a different class of defect than the property system.
