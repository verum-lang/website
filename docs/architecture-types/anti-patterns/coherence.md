---
sidebar_position: 4
title: "Coherence anti-patterns — merged into ontology band"
description: "Redirect notice + full AP-001..AP-040 catalog index. The coherence band has been consolidated with the articulation band into a single ontology page; the CVE articulation-hygiene band (AP-033..AP-040) also lives there. This page is the canonical pattern → page mapping."
slug: /architecture-types/anti-patterns/coherence
---

# Coherence anti-patterns — merged

The previous four-band catalog (classical / articulation /
coherence / MTAC) has been consolidated to match the canonical
anti-pattern catalog, which uses three bands:

1. **Capability / composition core** (AP-001 .. AP-010) —
   see [classical](./classical.md).
2. **Boundary / lifecycle / capability ontology + CVE
   articulation-hygiene** (AP-011 .. AP-026 + AP-033 .. AP-040) —
   see [articulation](./articulation.md). This page consolidates
   the previous "articulation" + "coherence" + "CVE
   articulation-hygiene" bands.
3. **Modal-temporal architectural calculus** (AP-027 .. AP-032) —
   see [mtac](./mtac.md).

The renaming is *not* an architectural change — it brings the
documentation surface in line with the kernel's source of truth.
Tooling that referenced specific AP-NNN codes is unaffected;
the codes themselves are stable.  This page exists as a
permanent redirect with a complete pattern → page mapping so
external links and grep-based tools continue to resolve.

## 1. Full catalog index

The 40-pattern catalog lives across three pages.  Every
`AP-NNN` code below links directly to its definition, including
legacy `coherence.md#ap-XXX` anchors that were redirected when
the bands consolidated.

### 1.1 Capability / composition core (AP-001..AP-010)

Page: [classical.md](./classical.md)

| Code | Pattern | Anchor |
|---|---|---|
| AP-001 | CapabilityEscalation         | [#ap-001](./classical.md#ap-001) |
| AP-002 | CapabilityLeak               | [#ap-002](./classical.md#ap-002) |
| AP-003 | DependencyCycle              | [#ap-003](./classical.md#ap-003) |
| AP-004 | TierMixing                   | [#ap-004](./classical.md#ap-004) |
| AP-005 | FoundationDrift              | [#ap-005](./classical.md#ap-005) |
| AP-006 | RegisterMixing               | [#ap-006](./classical.md#ap-006) |
| AP-007 | TxStraddling                 | [#ap-007](./classical.md#ap-007) |
| AP-008 | ResourceStraddling           | [#ap-008](./classical.md#ap-008) |
| AP-009 | LifecycleRegression          | [#ap-009](./classical.md#ap-009) |
| AP-010 | CveIncomplete                | [#ap-010](./classical.md#ap-010) |

### 1.2 Boundary / lifecycle / capability ontology (AP-011..AP-026)

Page: [articulation.md](./articulation.md)

| Code | Pattern | Anchor |
|---|---|---|
| AP-011 | AbsoluteBoundaryAttempt      | [#ap-011](./articulation.md#ap-011) |
| AP-012 | InvariantViolation           | [#ap-012](./articulation.md#ap-012) |
| AP-013 | DanglingMessageType          | [#ap-013](./articulation.md#ap-013) |
| AP-014 | UnauthenticatedCrossing      | [#ap-014](./articulation.md#ap-014) |
| AP-015 | DeterministicViolation       | [#ap-015](./articulation.md#ap-015) |
| AP-016 | CapabilityDuplication        | [#ap-016](./articulation.md#ap-016) |
| AP-017 | OrphanCapability             | [#ap-017](./articulation.md#ap-017) |
| AP-018 | MissingHandoff               | [#ap-018](./articulation.md#ap-018) |
| AP-019 | FoundationDowngrade          | [#ap-019](./articulation.md#ap-019) |
| AP-020 | TimeBoundLeakage             | [#ap-020](./articulation.md#ap-020) |
| AP-021 | PersistenceMismatch          | [#ap-021](./articulation.md#ap-021) |
| AP-022 | CapabilityLaundering         | [#ap-022](./articulation.md#ap-022) |
| AP-023 | FoundationForgery            | [#ap-023](./articulation.md#ap-023) |
| AP-024 | TransitiveLifecycleRegression| [#ap-024](./articulation.md#ap-024) |
| AP-025 | DeclarationDrift             | [#ap-025](./articulation.md#ap-025) |
| AP-026 | FoundationContentMismatch    | [#ap-026](./articulation.md#ap-026) |

### 1.3 Modal-temporal architectural calculus (AP-027..AP-032)

Page: [mtac.md](./mtac.md)

| Code | Pattern | Anchor |
|---|---|---|
| AP-027 | TemporalInconsistency        | [#ap-027](./mtac.md#ap-027) |
| AP-028 | CounterfactualBrittleness    | [#ap-028](./mtac.md#ap-028) |
| AP-029 | MissedAdjoint                | [#ap-029](./mtac.md#ap-029) |
| AP-030 | UniversalPropertyViolation   | [#ap-030](./mtac.md#ap-030) |
| AP-031 | PhantomEvolution             | [#ap-031](./mtac.md#ap-031) |
| AP-032 | YonedaInequivalentRefactor   | [#ap-032](./mtac.md#ap-032) |

### 1.4 CVE articulation-hygiene (AP-033..AP-040)

Page: [articulation.md](./articulation.md) (consolidated)

| Code | Pattern | Anchor |
|---|---|---|
| AP-033 | RetractedCitationUse              | [#ap-033](./articulation.md#ap-033) |
| AP-034 | HypothesisWithoutMaturationPlan   | [#ap-034](./articulation.md#ap-034) |
| AP-035 | InterpretationInMatureCorpus      | [#ap-035](./articulation.md#ap-035) |
| AP-036 | ObserverImpersonation             | [#ap-036](./articulation.md#ap-036) |
| AP-037 | BoundlessAudit                    | [#ap-037](./articulation.md#ap-037) |
| AP-038 | ImplicitSubstrate                 | [#ap-038](./articulation.md#ap-038) |
| AP-039 | AnchoringOverextension            | [#ap-039](./articulation.md#ap-039) |
| AP-040 | SelfReferenceWithoutOperator      | [#ap-040](./articulation.md#ap-040) |

## 2. Band-history note

The merge happened in two steps:

1. The original four-band split (classical / articulation /
   coherence / MTAC) was reduced to three when the kernel side
   `AntiPatternCode` enum was reorganised: the post-AP-018
   patterns previously labelled "coherence" were re-classified
   as boundary/lifecycle ontology variants, and the page header
   changed from "AP-019..AP-026" to "AP-011..AP-026" with
   coherence content folded into articulation.

2. The CVE articulation-hygiene band (AP-033..AP-040) was added
   in commit `e1cd9cd6` (2026-05) and slotted into the same
   articulation page rather than receiving its own band — the
   patterns describe how cogs articulate their CVE discharge,
   which is structurally close to the existing articulation
   discipline.

The kernel's `AntiPatternCode` enum maintains its 40-variant
canonical surface; this page exists to keep doc-side anchors
stable across both moves.

## 3. Cross-reference

- [Anti-pattern catalog overview](./overview.md) — the canonical
  high-level summary
- [Cross-side pin tests](../cross-side-pin.md) — variant-set
  alignment across kernel/Verum
- [CVE articulation-hygiene deep-dive](../cve/articulation-hygiene.md)
- [Audit-protocol surface](../audit-protocol.md)
