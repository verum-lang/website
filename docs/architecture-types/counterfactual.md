---
sidebar_position: 11
title: "Counterfactual reasoning engine"
description: "Non-destructive 'what if?' reasoning over architectural Shapes — drop a primitive, change a Foundation, demote a Lifecycle, see which invariants hold under both scenarios."
slug: /architecture-types/counterfactual
---

# Counterfactual reasoning engine

ATS-V ships a **non-destructive counterfactual evaluator** — a
reasoning engine that answers *"what would happen to this
project's invariants if we changed one architectural primitive?"*
without modifying any source code, without recompiling the project,
and without disturbing the running audit.

The engine is part of the audit pipeline (`verum audit
--counterfactual`) and produces structured reports suitable for
archival in audit chronicles. The reports drive design
decisions: *is this invariant fragile? does dropping a Foundation
constraint break our soundness story? would lifting a `[Г]`
Hypothesis to `[Т]` Theorem stabilise our import graph?*

This page explains the engine's primitives, what kinds of
counterfactual it handles, and how to read the reports.

## 1. The motivating use cases

Three concrete questions the engine answers.

### 1.1 *"Is this invariant fragile?"*

A project declares an invariant — for example, "no cog at
`Tier.Aot` may import a cog at `Tier.Interp`". The invariant
holds today. The engineer wants to know: *if we relax the
constraint by introducing one new tier-bridge, does the
invariant still hold under the relaxed scenario?*

The engine evaluates the invariant under both base scenario and
counterfactual scenario, classifies the result, and reports.

### 1.2 *"What if we dropped a primitive?"*

The Verum project considers retiring a deprecated primitive — say,
the legacy `Lifecycle.Plan` variant. Before removing it, the
engineer wants to know: *which invariants currently hold thanks
to the existence of `Plan`? would removing it cause downstream
regressions?*

The engine simulates a project where `Plan` does not exist,
re-evaluates every invariant, and reports the deltas.

### 1.3 *"Is the audit non-vacuous?"*

A skeptical reviewer wonders: *the audit reports 31 of 32
anti-patterns as `ok` — but do those `ok` verdicts actually
reflect substance, or are they tautological?*

The engine constructs counterfactual scenarios designed to
*violate* each anti-pattern and confirms that the audit reports
the violation. A tautologically-passing audit would report all
counterfactuals as still-passing; a substantive audit reports
each violation correctly. This is the audit's *liveness pin*.

## 2. The four-arm verdict

For every counterfactual evaluation, the engine emits one of four
verdicts:

| Verdict | Meaning |
|---------|---------|
| **HoldsBoth** | The invariant holds in both base and counterfactual scenarios. ✓ — the invariant is *stable*. |
| **HoldsBaseOnly** | The invariant holds in base but breaks in counterfactual. ✗ — the invariant is *fragile* (depends on the unchanged primitive). |
| **HoldsVarOnly** | The invariant holds in counterfactual but not in base. ⚠ — the invariant is an *unrealised improvement*; the change would *fix* something. |
| **HoldsNeither** | The invariant fails in both scenarios. ✗✗ — the invariant is *fundamentally unstable*; the project's claim is wrong. |

A *stable* project has every counterfactual report `HoldsBoth`.
A project with `HoldsBaseOnly` results has fragile invariants;
the engineer reads each fragile invariant and decides whether
the dependency is intentional (e.g., "yes, this invariant
requires Tier.Aot — that is part of the design") or accidental
(refactor to remove the dependency).

## 3. Primitive types — `ArchProposition` and `ArchMetric`

The engine works at two levels:

### 3.1 `ArchProposition` — symbolic invariants

`ArchProposition` is the symbolic form of an architectural
invariant. The canonical battery covers propositions like:

- "every cog with `[Т]` Lifecycle composes only with `[Т]/[О]/[С]`
  cogs" (lifecycle regression).
- "no cog imports across foundations without a bridge" (foundation
  drift).
- "every framework axiom is enumerated" (axiom inventory
  completeness).
- "every codegen pass is either discharged or has a published
  IOU" (codegen attestation).

A proposition is evaluated against a project state — the union
of every annotated cog's `Shape` plus the cross-cog graph.

### 3.2 `ArchMetric` — quantitative baseline

`ArchMetric` is a per-project numeric baseline. The default
battery includes 11 metrics:

| Metric | What it counts |
|--------|----------------|
| `total_annotated_cogs` | Cogs with `@arch_module(...)` |
| `theorem_cogs` | Cogs with `Lifecycle.Theorem(...)` |
| `definition_cogs` | Cogs with `Lifecycle.Definition` |
| `conditional_cogs` | Cogs with `Lifecycle.Conditional(...)` |
| `postulate_cogs` | Cogs with `Lifecycle.Postulate(...)` |
| `hypothesis_cogs` | Cogs with `Lifecycle.Hypothesis(...)` |
| `interpretation_cogs` | Cogs with `Lifecycle.Interpretation(...)` |
| `framework_axioms` | Distinct `@framework(...)` markers |
| `composes_with_edges` | Total edges in the composition graph |
| `cross_foundation_edges` | Edges spanning incompatible Foundations |
| `boundary_invariant_count` | Distinct `BoundaryInvariant` declarations |

The metrics are *deltas* under counterfactual: the report shows
how many cogs change Lifecycle, how many edges are added/removed,
how many framework axioms are introduced.

## 4. The CounterfactualReport schema

Every evaluation produces a `CounterfactualReport`:

```json
{
  "schema_version": 1,
  "verum_version": "0.x.y",
  "generated_at": "2026-05-02T15:30:00Z",
  "scenario": {
    "base":          { "name": "current", "primitives_dropped": [], "primitives_added": [] },
    "counterfactual":{ "name": "without-Plan", "primitives_dropped": ["Lifecycle.Plan"] }
  },
  "propositions": [
    {
      "proposition": "lifecycle_regression_zero",
      "verdict": "HoldsBoth",
      "base_witness":         { "regressions": 0 },
      "counterfactual_witness":{ "regressions": 0 }
    },
    {
      "proposition": "no_legacy_plan_in_strict",
      "verdict": "HoldsBaseOnly",
      "base_witness":         { "violations": 0, "reason": "Plan exists" },
      "counterfactual_witness":{ "violations": 4, "offending_cogs": [...] }
    }
  ],
  "metrics": [
    {
      "metric": "total_annotated_cogs",
      "base":           267,
      "counterfactual": 263,
      "delta":          -4
    }
  ]
}
```

Schema version 1 is the current schema; future schema versions
will preserve forward compatibility.

## 5. Empty-invariant handling

A subtle correctness question: *what does the engine report when
the invariant set is empty?* The default policy is **"empty
invariants → unstable by default"**. An empty invariant set
indicates the engineer has forgotten to specify what they want
to be true; reporting `HoldsBoth` would be vacuous.

This default surfaces as `HoldsNeither` in the report — both
scenarios fail the empty-invariant check. The fix: declare
explicit invariants. The default protects against silent
tautology.

## 6. The five-entry default battery

The default `--counterfactual` invocation runs a five-entry
battery designed to exercise every `InvariantStatus` arm:

| # | Battery name | Designed verdict |
|---|--------------|------------------|
| 1 | `lifecycle_regression_zero_base` | `HoldsBoth` (✓) |
| 2 | `legacy_plan_removal` | `HoldsBaseOnly` (fragile) |
| 3 | `tier_bridge_introduction` | `HoldsVarOnly` (improvement) |
| 4 | `empty_invariant_pin` | `HoldsNeither` (sentinel) |
| 5 | `foundation_drift_recovery` | `HoldsBoth` after bridge |

Every verdict arm is exercised. A bug in the engine that conflated
two arms would surface immediately because at least one entry's
verdict would change.

## 7. Reading a `HoldsBaseOnly` report

`HoldsBaseOnly` is the most informative arm — it identifies
fragile invariants. A typical workflow:

1. The engineer runs `verum audit --counterfactual` and notices
   a `HoldsBaseOnly` entry.
2. The entry's `counterfactual_witness` lists the cogs / edges
   that would fail under the counterfactual.
3. The engineer asks: *is this dependency intentional?*
   - **Yes** — the invariant is architecturally bound to the
     unchanged primitive. Document the dependency in the
     proposition's annotation.
   - **No** — refactor to remove the dependency, then re-run.
4. Re-run; the entry now reports `HoldsBoth`.

The discipline turns "we hope the architecture is stable" into
"we have explicit reports of every fragility, with documentation
of which fragilities are intentional".

## 8. Custom counterfactual scenarios

The default battery is not exhaustive. Custom scenarios are
declared in `verum.toml`:

```toml
[ats_v.counterfactual.scenarios.demote-research]
description = "What if research cogs lose [Т] status?"
primitives_dropped = []
primitives_modified = [
    { cog = "research.*", lifecycle = "Lifecycle.Hypothesis(Medium)" }
]
invariants = [
    "no_research_cited_from_production",
    "production_audit_remains_load_bearing"
]
```

Custom scenarios run alongside the default battery. The combined
report is archived as a single bundle.

## 9. The dispatch table — invariant predicates

Every proposition the engine evaluates is registered in a
**dispatch table** — a static mapping from proposition name to
predicate function:

| Proposition | Predicate |
|-------------|-----------|
| `lifecycle_regression_zero` | walk every composition edge, count rank-violations |
| `no_legacy_plan_in_strict` | walk every cog with `strict: true`, count `Plan(...)` |
| `tier_bridge_present_for_mixing` | walk every Tier.Aot ↔ Tier.Interp edge, check bridge attribute |
| `framework_axiom_inventory_complete` | enumerate `@framework(...)` markers, check audit-side roster matches |
| `codegen_attestation_no_orphans` | enumerate codegen passes, check every entry has Discharged/AdmittedWithIou |
| `kernel_v0_roster_filesystem_match` | walk kernel_v0 manifest, check filesystem |
| `differential_kernel_zero_disagreements` | run diff-kernel on canonical certificates |

The dispatch table is itself an architectural artefact — adding
a proposition requires adding a predicate, registering it in the
table, and adding a battery entry that exercises it. The audit
chronicle then carries the new proposition's verdict.

## 10. Cross-references

- [Anti-pattern overview](./anti-patterns/overview.md) — the
  catalog of architectural defects the propositions express.
- [Adjunctions](./adjunctions.md) — a related engine that
  recognises *recoverable* counterfactual moves.
- [MTAC](./mtac.md) — the modal-temporal vocabulary that
  formalises observer roles in counterfactual reasoning.
- [Audit protocol](./audit-protocol.md) — the gate runner.
- [Verification → soundness gates](../verification/soundness-gates.md)
  — the predicate-level formalisation.
