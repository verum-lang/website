---
sidebar_position: 12
title: "Modal-Temporal Architectural Calculus (MTAC)"
description: "Reasoning about WHEN architectural decisions are made, WHO observes them, and under WHICH modality they hold. Six modal operators, five observer roles, six anti-patterns."
slug: /architecture-types/mtac
---

# Modal-Temporal Architectural Calculus (MTAC)

Static architectural typing answers *what is permitted right now*.
Real systems also need answers to *when was this decided?*, *who
saw it?*, and *under what modality does it hold?*. The
**Modal-Temporal Architectural Calculus (MTAC)** is ATS-V's
extension into time, observer-roles, and modal qualification.

MTAC adds primitives the static checker uses to enforce a *new
class* of anti-patterns — defects that involve *when* and *by
whom* rather than *what*. The six MTAC anti-patterns
(AP-027 .. AP-032) live in this layer.

This page covers the primitives, the modal operators, the five
canonical observer roles, and how the audit gates consume them.

## 1. Why a temporal/modal layer?

Three concrete bug classes that pure static typing cannot catch:

### 1.1 Premature observation

A capability is logged or recorded *before* the decision to grant
it has been made. The architectural shape says "the capability is
exposed" but the temporal order says "the observation happened
before the grant".

Example: a request is logged before authentication completes —
the log includes data the authenticator should have rejected.
This is [`AP-027 PrematureObservation`](./anti-patterns/mtac.md#ap-027).

### 1.2 Decision without context

A decision is recorded without specifying which observer made it
or under which modality it applies. "We will adopt strict mode" —
on whose authority? for which subset of the codebase?

This is [`AP-028 DecisionWithoutContext`](./anti-patterns/mtac.md#ap-028).

### 1.3 Modal collision

Two incompatible modal qualifications attached to the same
proposition. "X must hold ◇ (possibly)" and "X must hold □
(necessarily)" — the two modal qualifications have different
strengths; using both is a category error.

This is [`AP-030 ModalCollision`](./anti-patterns/mtac.md#ap-030).

## 2. The MTAC primitive set

Verum's kernel ships seven MTAC primitives:

```verum
public type TimePoint is { value: Int };

public type Decision is {
    point:           TimePoint,
    by_observer:     Observer,
    proposition:     ArchProposition,
    modality:        ModalAssertion,
};

public type Observer is
    | Architect
    | Auditor
    | Developer
    | Operator
    | Adversary;

public type ModalAssertion is
    | Necessarily(prop: ArchProposition)        // □ P
    | Possibly(prop: ArchProposition)           // ◇ P
    | Before(point: TimePoint, prop: ArchProposition)
    | After(point: TimePoint, prop: ArchProposition)
    | Counterfactually(prop: ArchProposition)
    | Intentionally(prop: ArchProposition);

public type ArchProposition is
    | InvariantHolds(name: Text)
    | CapabilityGranted(cap: Capability)
    | LifecycleAt(stage: Lifecycle)
    | Composes(a: Text, b: Text);

public type ArchEvolution is {
    decisions: List<Decision>,
};

public type CounterfactualPair is {
    base:           ArchEvolution,
    counterfactual: ArchEvolution,
};

public type AdjunctionWitness is {
    left:  Text,
    right: Text,
    proof: Text,
};
```

Seven primitives — together they form the vocabulary for
expressing *when, by whom, under which modality*.

## 3. The five-roster observer set

MTAC's five canonical observer roles are exhaustive. Every
architectural decision is attributable to exactly one of:

| Observer | What they do |
|----------|--------------|
| **Architect** | Makes top-level architectural decisions; sets the canonical Shape policy. |
| **Auditor** | Verifies decisions against the audit protocol; produces sign-off chronicles. |
| **Developer** | Implements code under the architecture; refines invariants in working scope. |
| **Operator** | Runs the deployed system; observes runtime state. |
| **Adversary** | Attempts to violate invariants; the threat model's persona. |

The roles are *not* a permission system — they are a
*narrative* discipline. A decision tagged "by Operator" is
distinguishable from a decision tagged "by Architect" even when
they assert the same proposition; the audit chronicle records
*who* made each call so reviewers can attribute responsibility.

[`AP-029 ObserverImpersonation`](./anti-patterns/mtac.md#ap-029)
fires when role A asserts in role B's register — for example,
when a Developer-level decision claims Architect-level authority
without an explicit promotion.

## 4. The six modal operators

The six modal operators correspond to a small fragment of modal
logic plus two architectural-domain operators:

| Operator | Reading | Operational meaning |
|----------|---------|---------------------|
| `Necessarily(P)` (□P) | "P must hold in every world" | Strong invariant; load-bearing across all execution paths. |
| `Possibly(P)` (◇P) | "P holds in some world" | Reachability; useful for "this design accommodates X". |
| `Before(t, P)` | "P holds before time t" | Temporal precedence. |
| `After(t, P)` | "P holds after time t" | Temporal successor. |
| `Counterfactually(P)` | "P would hold under the counterfactual" | Bridges to the [counterfactual engine](./counterfactual.md). |
| `Intentionally(P)` | "P holds by design" | Distinguishes intentional from incidental properties. |

The first four are standard modal logic. The last two are
domain-specific: `Counterfactually` integrates MTAC with the
counterfactual engine, and `Intentionally` distinguishes
"deliberate design" from "accidental observation".

## 5. The diagnostic context

Verum's `DiagnosticContext` carries seven MTAC-specific fields
beside the existing diagnostic state:

| Field | What it tracks |
|-------|----------------|
| `current_observer` | Which observer is currently driving the diagnostic. |
| `time_point_lower_bound` | Earliest time the diagnostic applies to. |
| `time_point_upper_bound` | Latest time the diagnostic applies to. |
| `modal_assertion` | The modal qualification active at this site. |
| `proposition` | The proposition the diagnostic concerns. |
| `arch_evolution` | The decision sequence being checked. |
| `counterfactual_pair` | The (base, counterfactual) pair if any. |

These fields are consumed by the six MTAC anti-pattern checks:

| Anti-pattern | Fields consumed |
|--------------|-----------------|
| AP-027 PrematureObservation | `current_observer`, `time_point_*`, `proposition` |
| AP-028 DecisionWithoutContext | `current_observer`, `modal_assertion` |
| AP-029 ObserverImpersonation | `current_observer` |
| AP-030 ModalCollision | `modal_assertion`, `proposition` |
| AP-031 TemporalCycle | `arch_evolution`, `time_point_*` |
| AP-032 CounterfactualDivergence | `counterfactual_pair`, `proposition` |

## 6. Adjunctions — `Counterfactually` made systematic

The `Counterfactually(P)` modal operator is the entry point to
the [adjunction analyzer](./adjunctions.md), which recognises
**four canonical architectural adjunctions** and reports their
preservation/gain manifests:

- **Inline ⊣ Extract** — folding a function inline (left adjoint)
  vs extracting a method to its own module (right adjoint).
- **Specialise ⊣ Generalise** — making a generic interface
  concrete (left) vs lifting a concrete one to generic (right).
- **Decompose ⊣ Compose** — splitting a cog into sub-cogs (left)
  vs merging sub-cogs into one (right).
- **Strengthen ⊣ Weaken** — tightening a precondition (left) vs
  relaxing one (right).

For each recognised pair, the analyzer produces a
**preservation/gain manifest**: which invariants are conserved
across the move, which obligations are lifted, which are
acquired. Audit chronicles archive these manifests so the
project's architectural-evolution history is itself
auditable.

## 7. The MTAC anti-pattern band

The six MTAC anti-patterns (AP-027 .. AP-032) all fire at the
**bundle phase** — they require the full project graph as
input, including the temporal order of decisions in the audit
chronicle. They cannot fire during incremental compilation.

A summary:

- **AP-027 PrematureObservation** — a decision is observed
  (logged, audited, broadcast) before the time point at which it
  was made.
- **AP-028 DecisionWithoutContext** — a decision lacks a `Decision.by_observer`
  attribution or `Decision.modality` qualification.
- **AP-029 ObserverImpersonation** — observer role A asserts in
  role B's register without an explicit promotion certificate.
- **AP-030 ModalCollision** — two incompatible modals
  (`Necessarily(P)` and `Possibly(¬P)`) attached to the same
  proposition.
- **AP-031 TemporalCycle** — the decision graph has a `Before` /
  `After` cycle (a decision claims to be both before and after
  another).
- **AP-032 CounterfactualDivergence** — the counterfactual report
  contradicts a base-scenario invariant.

Each is fully specified in [Modal-temporal anti-patterns](./anti-patterns/mtac.md).

## 8. Worked example — a temporal contract

A real example: a key-rotation system declares that *every key
must be rotated within 90 days of its creation*. The MTAC
encoding:

```verum
@arch_module(
    lifecycle: Lifecycle.Theorem("v1.0"),
    @mtac(
        decision: Decision {
            point:       TimePoint { value: 0 },           // creation time
            by_observer: Observer.Operator,
            proposition: ArchProposition.InvariantHolds("key_rotated"),
            modality:    ModalAssertion.Before(
                point: TimePoint { value: 90 * 86400 },    // 90 days later
                prop:  ArchProposition.InvariantHolds("key_rotated"),
            ),
        }
    ),
)
module my_app.crypto.key_rotation;
```

The annotation reads: *the Operator is responsible for ensuring
that the `key_rotated` invariant holds before the 90-day
deadline*. The audit gate checks:

- The Decision has a `by_observer` (it does — `Operator`). ✓
  AP-028 doesn't fire.
- The modal is `Before(90d, P)` — temporally well-founded. ✓
  AP-031 doesn't fire.
- The proposition is consistent across the project. ✓
  AP-030 doesn't fire.

If the Operator fails to rotate within 90 days, runtime
observation will show the invariant violated *after* the
deadline — but the architectural type system has already
documented the obligation. The temporal contract is part of
the audit chronicle.

## 9. Why MTAC is part of ATS-V, not the property system

A natural question: *why is MTAC architectural rather than per-
function?* Two reasons:

1. **Granularity.** MTAC tracks decisions across the *project's
   lifetime* — a decision made at v1.0 may still be load-bearing
   at v3.5. Per-function modal annotations would multiply the
   annotation burden without adding precision.
2. **Observer-attribution.** The five-roster observer set is a
   narrative concept that applies at the *cog* level (or
   project level), not the function level. The Architect role
   does not vary per function.

MTAC therefore lives in the architectural surface, where
decisions are *declared once per cog* and *attributed once per
decision*. The narrative discipline scales.

## 10. Cross-references

- [MTAC anti-patterns (AP-027 .. AP-032)](./anti-patterns/mtac.md)
- [Counterfactual reasoning](./counterfactual.md) — the engine
  the `Counterfactually` modal feeds.
- [Adjunctions](./adjunctions.md) — the four canonical
  architectural adjunctions.
- [Audit protocol](./audit-protocol.md) — the gate that consumes
  MTAC primitives.
- [Three orthogonal axes](./orthogonality.md) — why MTAC is
  architectural, not per-function.
