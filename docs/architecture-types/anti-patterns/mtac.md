---
sidebar_position: 5
title: "Modal-temporal anti-patterns (AP-027 .. AP-032)"
description: "The MTAC band: premature observation, decision without context, observer impersonation, modal collision, temporal cycle, counterfactual divergence."
slug: /architecture-types/anti-patterns/mtac
---

# Modal-temporal anti-patterns (AP-027 .. AP-032)

The MTAC band covers defects in the modal-temporal layer:
*when* an architectural decision was made, *who* made it, and
*under which modal qualification* it holds. These patterns fire
at the **bundle** phase because they require the full project
graph including the audit chronicle as input.

For the underlying primitives (Decision, Observer, ModalAssertion,
TimePoint, ArchProposition) see [MTAC](../mtac.md). For the
five-roster observer set and six modal operators see
[MTAC § 3-4](../mtac.md#3-the-five-roster-observer-set).

---

## AP-027 — PrematureObservation {#ap-027}

**Severity:** warning · **Phase:** bundle

**Predicate.** A `Decision` is observed (logged, audited,
broadcast) at a `TimePoint` strictly before the decision's own
`TimePoint`.

**What it catches.** The audit chronicle records that "the
capability was logged at T1" but the decision granting the
capability happened at T2 > T1 — the observation predates the
decision.

**Worked example.** A request is logged before authentication
completes. The log contains data the authenticator should have
rejected.

**Remediation.** Reorder the operations: complete the decision
*before* the observation.

---

## AP-028 — DecisionWithoutContext {#ap-028}

**Severity:** warning · **Phase:** bundle

**Predicate.** A `Decision` is recorded without specifying the
`by_observer` or `modality` field.

**What it catches.** Decisions that float in the audit chronicle
without attribution. "We adopt strict mode" — on whose
authority? for which subset of the codebase?

**Remediation.** Always specify the observer and modality:

```verum
@mtac(decision: Decision {
    point:       TimePoint { value: 0 },
    by_observer: Observer.Architect,
    proposition: ArchProposition.InvariantHolds("strict_mode"),
    modality:    ModalAssertion.Necessarily(...),
})
```

---

## AP-029 — ObserverImpersonation {#ap-029}

**Severity:** error · **Phase:** bundle

**Predicate.** Observer A asserts a proposition in observer B's
canonical register without an explicit promotion certificate.

**What it catches.** A Developer-level cog asserting an
Architect-level invariant. The five-roster observer set is a
*narrative* discipline: each role has its canonical register,
and impersonation undermines the audit chronicle's
attribution.

The five canonical registers:

| Observer | Register |
|----------|----------|
| Architect | top-level architectural decisions, canonical Shape policy |
| Auditor | sign-off chronicles, verification verdicts |
| Developer | implementation-level invariants, working-scope refinements |
| Operator | runtime state observations, deployment configuration |
| Adversary | threat-model assertions |

**Remediation.** Either move the assertion to a cog whose
declared observer matches, or add an explicit promotion
certificate citing the authority for the role transition.

---

## AP-030 — ModalCollision {#ap-030}

**Severity:** error · **Phase:** bundle

**Predicate.** Two incompatible modal qualifications are attached
to the same `ArchProposition`. Examples:

- `Necessarily(P)` and `Possibly(¬P)` — directly contradictory.
- `Before(t1, P)` and `After(t2, P)` with `t2 < t1` —
  temporally inconsistent.
- `Intentionally(P)` and `Counterfactually(¬P)` admitted on the
  same site — the project is asserting both that P is by-design
  and that ¬P would still be true counterfactually, which is
  paradoxical.

**Remediation.** Resolve the collision: one modal must be
weakened or removed.

---

## AP-031 — TemporalCycle {#ap-031}

**Severity:** error · **Phase:** bundle

**Predicate.** The decision graph contains a `Before` / `After`
cycle. A decision asserts it is both before and after another
decision.

**What it catches.** A self-inconsistent audit chronicle. The
chronicle's `TimePoint` values are *user-asserted*, not
machine-clock-derived; a project that mis-orders its own
chronicle produces a temporal cycle.

**Remediation.** Inspect the chronicle, identify the offending
edge, fix the user-asserted timeline.

---

## AP-032 — CounterfactualDivergence {#ap-032}

**Severity:** hint · **Phase:** bundle

**Predicate.** The counterfactual report (from
[`verum audit --counterfactual`](../counterfactual.md))
contradicts a base-scenario invariant — i.e., the engine reports
`HoldsBaseOnly` for an invariant the project's audit chronicle
asserts to hold *unconditionally*.

**What it catches.** A fragile invariant that the project has
declared as load-bearing. The counterfactual engine reports the
fragility; the AP-032 pattern surfaces the contradiction
between the assertion and the reality.

**Remediation.** Either:

1. Weaken the invariant declaration to `Possibly(P)` rather
   than `Necessarily(P)`.
2. Document the fragility — list the unchanged primitive as a
   *condition* in the cog's `Lifecycle.Conditional(...)`.
3. Strengthen the cog's body so the invariant becomes stable
   under the counterfactual.

The pattern is informational — it identifies the *gap* between
declared and actual stability without forcing a specific
remediation.

---

## Summary of severities

| AP | Severity | Phase |
|----|----------|-------|
| AP-027 | warning | bundle |
| AP-028 | warning | bundle |
| AP-029 | error | bundle |
| AP-030 | error | bundle |
| AP-031 | error | bundle |
| AP-032 | hint | bundle |

The MTAC band's discipline: temporal and modal claims must be
*attributable* (who? when? under what modality?) and must form
a self-consistent graph in the audit chronicle.

## Cross-references

- [Anti-pattern overview](./overview.md)
- [MTAC primitives](../mtac.md) — TimePoint, Decision, Observer,
  ModalAssertion, ArchProposition.
- [Counterfactual reasoning](../counterfactual.md) — the engine
  AP-032 cooperates with.
- [Adjunctions](../adjunctions.md) — the analyzer that feeds
  `Counterfactually(P)`.
- [CVE — articulation hygiene](../cve/articulation-hygiene.md)
  — the L6 register-prohibition discipline AP-029 enforces at
  the architectural layer.
