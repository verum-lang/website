---
sidebar_position: 4
title: "Coherence anti-patterns (AP-019 .. AP-026)"
description: "The coherence band: capability laundering, foundation forgery, MSFS-coordinate drift, framework-axiom collision, proof-export round-trip break, transitive lifecycle regression, reflection-tower exhaustion."
slug: /architecture-types/anti-patterns/coherence
---

# Coherence anti-patterns (AP-019 .. AP-026)

The coherence band covers defects that arise *across cogs*, in
the cross-cog graph, the bidirectional reasoning system, and the
proof-export round-trip. These patterns require the full
project graph as input and fire at the **post-arch** or
**bundle** phase.

For the catalog's overall structure see
[Anti-pattern overview](./overview.md). For the bidirectional
discipline that motivates this band see
[Verification → α/ε bidirectional](../../verification/actic-dual.md).

---

## AP-019 — CapabilityLaundering {#ap-019}

**Severity:** error · **Phase:** post-arch

**Predicate.** A capability is *erased* by transit through an
unmarked boundary. Specifically: cog A exposes a capability that
cog B obtains via composition; B's `messages_out` does not list
the capability as `CapabilityTransfer`; downstream cogs receive
B's output and exercise the capability without ever declaring
it.

**What it catches.** The architectural analogue of "tainted-data
flow" — a capability that was declared at the source but
*disappeared* as it crossed module boundaries, surfacing
silently in downstream code.

**Worked example — defect.**

```verum
// A exposes the capability
@arch_module(
    exposes: [Capability.Network(Tcp, Outbound)],
)
module storage.s3_client;

// B uses A but does not declare the capability transit
@arch_module(
    composes_with: ["storage.s3_client"],
    exposes:       [],   // <-- claims to expose nothing
    // missing: messages_out should list CapabilityTransfer for Network
)
module app.avatar_store;

public fn fetch_avatar(uid: UserId) -> Bytes {
    storage.s3_client.fetch(format_path(uid))
    // <-- AP-019: returns network-derived data without capability marker
}
```

The `app.avatar_store.fetch_avatar` returns bytes obtained via
network — the capability *flowed through* but B's Shape erased
it. Any downstream cog using `fetch_avatar` is exercising
network capability without knowing it.

**Remediation.** Either:

1. Encapsulate the capability — confine the network call inside
   a private function that returns a non-network type
   (e.g., `Avatar` instead of `Bytes`), and add a
   `BoundaryInvariant` documenting the encapsulation.
2. Mark the capability transfer explicitly — add the network
   capability to B's `exposes` and let it propagate.

The pattern is the *transitive* form of [`AP-001
CapabilityEscalation`](./classical.md#ap-001).

---

## AP-020 — FoundationForgery {#ap-020}

**Severity:** error · **Phase:** post-arch

**Predicate.** A cog claims a `Foundation` value that the proof
corpus contradicts — typically claiming `Foundation.Hott` while
relying on classical principles only admissible in
`ZfcTwoInacc` + LEM.

**What it catches.** A cog that *claims* to be HoTT-grounded but
internally cites classical axioms (LEM, AC, choice principles)
that HoTT does not admit.

**Remediation.** Either weaken the foundation declaration to one
that admits the cited principles, or remove the cited
principles.

---

## AP-021 — TransitiveCoherenceFailure {#ap-021}

**Severity:** warning · **Phase:** bundle

**Predicate.** The α/ε bidirectional coherence check fails on a
*transitive chain* — three or more cogs whose pairwise coherence
is OK but whose end-to-end chain breaks coherence.

**What it catches.** A subtle drift in the bidirectional
reasoning system. See
[Verification → α/ε bidirectional](../../verification/actic-dual.md)
for the underlying discipline.

**Remediation.** Inspect the chain; introduce a coherence
bridge at the offending edge.

---

## AP-022 — MsfsCoordinateDrift {#ap-022}

**Severity:** error · **Phase:** post-arch

**Predicate.** Two cogs that compose declare incompatible MSFS
*coordinates* — i.e., their `(Foundation, Stratum)` pairs are
inadmissible under the project's discharge ladder.

**What it catches.** A cog at `(ZfcTwoInacc, LCls)` composing
with one at `(Hott, LFnd)` without a bridge — the Hott cog's
constructive content cannot be soundly imported into the
classical context.

**Remediation.** Either bridge the foundations, or align the
strata.

---

## AP-023 — FrameworkAxiomCollision {#ap-023}

**Severity:** error · **Phase:** post-arch

**Predicate.** Two cogs cite framework axioms whose published
proofs are *inconsistent* with each other.

**What it catches.** A cog citing `@framework(framework_a,
"Theorem 1: P holds")` and a sibling cog citing
`@framework(framework_b, "Theorem 2: ¬P holds")`. The two
together would let a third cog prove anything.

**Remediation.** Either remove one of the citations, or
introduce a bridge that explicitly reconciles the two
frameworks.

---

## AP-024 — ProofExportRoundTripBreak {#ap-024}

**Severity:** error · **Phase:** bundle

**Predicate.** `verum extract` produces an export, the export is
re-imported via `verum import`, and the resulting Shape differs
from the original.

**What it catches.** The proof-export pipeline introducing a
soundness drift — the exported form admits something the
original does not (or vice versa). This is the architectural
analogue of a faithful translation failing.

**Remediation.** This is a *Verum-internal* defect. The fix is in
the extraction pipeline; the audit reports the drift so the
project does not silently rely on the broken export.

---

## AP-025 — ReflectionTowerExhaustion {#ap-025}

**Severity:** warning · **Phase:** bundle

**Predicate.** The project's required meta-theory exceeds the
bound MSFS Theorem 8.2 licenses: more than ZFC + 2·κ + κ_inacc
(i.e., more than 3 strongly-inaccessibles total). The discharge
function `omega_bounded_discharges()` returns `false` for the
project's rule footprint.

**What it catches.** A project whose proof corpus requires a
fourth (or higher) inaccessible cardinal — beyond the bound
MSFS Theorem 8.2 makes available. By Theorem 8.2,
`Con(reflective tower over S) = Con(S) + κ_inacc`; exceeding
this is exceeding the *cited* discharge.

**Remediation.** Either:

1. Reduce the project's inaccessible requirement — typically by
   factoring out a cog whose proof uses excess universe ascent.
2. Provide a citation that admits a stronger bound (extending
   the discharge chain MSFS Theorem 8.2 ships).

The pattern signals that the project has reached the *honest
limit* of Verum's structured Gödel-2nd escape. The MSFS-grounded
reflection tower has no further headroom — there is no "REF^ω+1";
Theorem 5.1 (AFN-T α) closes the boundary. See
[Verification → reflection tower](../../verification/reflection-tower.md).

---

## AP-026 — TransitiveLifecycleRegression {#ap-026}

**Severity:** error · **Phase:** post-arch

**Predicate.** The composition graph contains a chain
`A → B → C → ...` where every direct edge is OK at
[`AP-009 LifecycleRegression`](./classical.md#ap-009) but the
end-to-end chain exposes a low-rank intermediate. Specifically:
the citing cog's Lifecycle has rank ≥ R, every direct edge
satisfies R ≥ R, but somewhere in the chain there is a cog
with rank < R.

**What it catches.** A `Lifecycle.Theorem` cog (rank 6) imports
a `Lifecycle.Definition` cog (rank 5) — direct edge OK. The
Definition cog imports a `Lifecycle.Hypothesis` cog (rank 2) —
direct edge appears OK because Definitions can cite Hypotheses
in development. But the *transitive* chain (Theorem → Definition
→ Hypothesis) means the Theorem is ultimately resting on a
Hypothesis.

**Worked example — defect.**

```verum
@arch_module(lifecycle: Lifecycle.Theorem("v1.0"))
module my_app.production;
mount my_app.helpers;

@arch_module(lifecycle: Lifecycle.Definition)
module my_app.helpers;
mount my_app.experimental;

@arch_module(lifecycle: Lifecycle.Hypothesis(ConfidenceLevel.Medium))
module my_app.experimental;
```

**Diagnostic.**

```text
error[ATS-V-AP-026]: transitive lifecycle regression
  --> chain: my_app.production → my_app.helpers → my_app.experimental
   |
   | my_app.production    Theorem    rank 6
   | my_app.helpers       Definition rank 5    OK direct
   | my_app.experimental  Hypothesis rank 2    ← end-to-end gap
   |
help: either
   1. mature my_app.experimental to rank ≥ 6, or
   2. demote my_app.production, or
   3. introduce a Lifecycle.Conditional intermediate that names
      "experimental_module is hypothetical" as a stated condition.
```

**Remediation.** See `AP-009`. The transitive form's diagnostic
identifies the offending intermediate so the team knows where to
intervene.

---

## Summary of severities

| AP | Severity | Phase |
|----|----------|-------|
| AP-019 | error | post-arch |
| AP-020 | error | post-arch |
| AP-021 | warning | bundle |
| AP-022 | error | post-arch |
| AP-023 | error | post-arch |
| AP-024 | error | bundle |
| AP-025 | warning | bundle |
| AP-026 | error | post-arch |

The coherence band's discipline: cross-cog inconsistencies
must surface as named, RFC-coded defects rather than as silent
audit-chronicle drift.

## Cross-references

- [Anti-pattern overview](./overview.md)
- [Classical anti-patterns](./classical.md) — AP-001 .. AP-009.
- [Articulation anti-patterns](./articulation.md) — AP-010 .. AP-018.
- [MTAC anti-patterns](./mtac.md) — AP-027 .. AP-032.
- [Verification → reflection tower](../../verification/reflection-tower.md)
  — the discharge ladder AP-025 references.
- [Verification → α/ε bidirectional](../../verification/actic-dual.md)
  — the bidirectional system AP-021 references.
- [Capability primitive](../primitives/capability.md) — the
  primitive AP-019 enforces.
- [Lifecycle primitive](../primitives/lifecycle.md) — the
  CVE taxonomy AP-026 enforces transitively.
