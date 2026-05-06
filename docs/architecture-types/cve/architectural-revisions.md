---
sidebar_position: 7
title: "CVE — architectural revisions chronicle"
description: "The §20.4 self-application chronicle — how the CVE-architecture spec evolves under critique, how defects are registered, and how revisions land at L4 or L2 according to scope."
slug: /architecture-types/cve/architectural-revisions
---

# CVE — architectural revisions chronicle

An architectural law that does not provide a mechanism for its
own evolution risks becoming dogma. Per
[cve-architecture spec §20.4](../../../internal/cve/docs/cve-architecture.md),
CVE carries an explicit **architectural-revision procedure**:
defects are registered against the architecture itself, classified
by kind, and resolved at the appropriate stratum (L4 — modify the
architectural law; L2 — refine the methodology layer).

This page documents the chronicle's structure, its self-application
at the first revision, and the Verum-side `ArchitecturalDefect`
record that operationalises it.

## 1. The chronicle as a CVE-closed artefact

The architectural-revision chronicle is itself subject to CVE
closure:

- **K (Constructive)** — the record format is specified in spec
  §20.4 and mirrored in the Verum-side `ArchitecturalDefect`
  record (see §3 below).
- **V (Verifiable)** — every registered revision validates against
  the three §20.2 criteria (productivity, antifragility,
  minimality of stratification).
- **E (Executable)** — the resolution procedure is executable
  via the L3 meta-methodological dispatch: defects classified
  L4-revision modify the architectural law; defects classified
  L2-refinement modify the methodology layer without touching L4.

This closes the recursion of the architectural law: its evolution
is governed by itself, without appeal to an external authority.

## 2. Defect kind classification

Every registered defect carries one of four canonical kinds, per
spec §20.4:

| Kind | Variant | Semantics |
|------|---------|-----------|
| **False rejection** | `DefectKind::FalseRejection` | The principle systematically rejects artefacts that practice has shown mature and durable. Evidence that the principle's predicates are over-strict. |
| **False acceptance** | `DefectKind::FalseAcceptance` | The principle systematically admits to mature status artefacts that subsequently proved unstable. Evidence that the principle's predicates are under-strict. |
| **Inter-layer leak** | `DefectKind::InterLayerLeak` | A defect not localisable on a single layer of the seven-layer stratification — evidence that the current stratification is too coarse, too fine, or wrongly partitioned. |
| **Other** | `DefectKind::OtherDefect(reason)` | Defects outside the three canonical kinds; carries free-form description for triage. |

The kind determines the resolution path. False rejection and
false acceptance defects typically resolve at L4 (the predicate
is wrong); inter-layer leak defects typically resolve at L2 (the
methodology layer's reading of layer boundaries is wrong) but
may escalate to L4 if the stratification itself needs revision.

## 3. The `ArchitecturalDefect` record

```verum
type ArchitecturalDefect is {
    short_name: Text,            // brief identifier
    arch_version: Text,          // architecture version filed against
    submitted_on: Text,          // absolute date (ISO format)
    submitter: Text,             // submitter identifier
    kind: DefectKind,            // FalseRejection | FalseAcceptance |
                                 // InterLayerLeak | OtherDefect(Text)
    witness_artefact: Text,      // pointer to a concrete artefact
                                 // demonstrating the defect
    application_context: Text,   // domain and task in which the
                                 // defect manifested
    observed_result: Text,       // what happened
    expected_result: Text,       // what would have been correct
    proposed_resolution: Resolution, // L4Revision | L2Refinement |
                                     // OtherResolution(Text)
};
```

The Rust-side mirror is `verum_kernel::arch::ArchitecturalDefect`,
pinned by the `pin_architectural_defect_format` cross-side test.

## 4. The first chronicle entry — self-application

[cve-architecture spec §20.5](../../../internal/cve/docs/cve-architecture.md)
documents the first chronicle entry: applying the architecture's
own revision procedure to the prior revision of itself. Seven
defects were registered and resolved at L4:

| # | Short name | Kind | Resolution |
|---|------------|------|------------|
| 1 | Semantic blur on E axis | OtherDefect("registry conflation across three senses of executability") | L4Revision — added §2.3.0 disambiguation |
| 2 | Audit termination missing | OtherDefect("no halting criterion") | L4Revision — added §14.6 + declared-purpose discipline |
| 3 | Implicit cognitive substrate | FalseRejection | L4Revision — added §1.5 substrate disclosure |
| 4 | CHL over-extrapolation | OtherDefect("eponym treated as universal anchoring") | L4Revision — added §4.5 anchoring boundary |
| 5 | Culturally particular lineage | FalseRejection | L4Revision — added §19.7 lineage boundary |
| 6 | Stratification dogma | OtherDefect("operational choice presented as necessity") | L4Revision — reformulated §6 as working set |
| 7 | Predictive over-investment in §21 | OtherDefect("scenario-bound validity claim") | L4Revision — recast §21 in conditional mood |

All seven defects resolved at **L4 (architectural revision)** — they
concerned the architectural law itself, not the methodology of its
application. The load-bearing core (the K/V/E triple closure, the
seven-layer stratification, the audit protocol, the status
taxonomy) was preserved; the revision expanded the architecture's
explicit self-awareness.

The Verum-side operationalisation of these seven defects' fixes
landed in two layers:

- **Type-system layer** — new types `ExecutabilitySense`,
  `CognitiveSubstrate`, `FormalAnchoring`, `Purpose`,
  `ArchitecturalDefect` in `core/architecture/types.vr`,
  mirrored in `verum_kernel::arch`.
- **Anti-pattern layer** — seven new entries in the canonical
  AP roster (AP-033..AP-039), forming the
  [CVE articulation-hygiene band](../anti-patterns/articulation.md#cve-articulation-hygiene-band-ap-033--ap-039).

## 5. How a new defect gets registered

The procedure mirrors spec §20.4:

1. **Observe.** A reviewer or external researcher demonstrates a
   case where the architecture's principle (a) systematically
   rejects an artefact that practice has shown mature, (b) admits
   to mature status an artefact that subsequently proved unstable,
   or (c) generates an inter-layer leak unresolved by the current
   stratification.
2. **Document.** Fill in the `ArchitecturalDefect` record with the
   witness artefact, application context, observed and expected
   results.
3. **Triage.** The L3 meta-methodological review classifies the
   defect: does it lie in the architectural law itself
   (L4-revision required) or in the methodology of its application
   (L2-refinement sufficient)? The `proposed_resolution` field
   captures the verdict.
4. **Resolve.** L4-revisions land in a new public version of the
   architecture document. L2-refinements land in the methodology
   layer (the `architecture-types/*.md` documentation under this
   site, the verum_kernel `check_*` predicates, etc.) without
   touching the spec text.
5. **Pin.** Each resolution is pinned by a cross-side pin test
   (kernel ↔ Verum) that prevents silent drift between the
   architecture's text and the operational implementation.

## 6. Self-application — the chronicle's chronicle

The chronicle of architectural revisions is itself an architectural
artefact subject to evolution. The
[`pin_architectural_defect_format`](../cross-side-pin.md)
cross-side test verifies the canonical format remains stable
across versions; the format itself is L4-revisable but only
through a documented chronicle entry.

This closes the recursion: the architecture's evolution mechanism
evolves through itself, with a documented procedure, no external
authority. The emergent property is **antifragility under
critique** (per spec §15) — every published audit, every red-team
attack, every external review feeds back into the chronicle and
strengthens the architecture rather than displacing it.

## 7. Open invariants — red-team findings against the post-revision architecture

The architectural-revision procedure is itself subject to red-team
review. The following findings emerged during the L4 revision that
landed the seven §20.5 defects' fixes; each is a candidate for
future revisions but was deemed acceptable in the current
formulation, with explicit resolution.

### Finding R1 — `[P]` Postulate axis V wording

Spec §3.5 describes `[P]` as "C accepted, V absent, E accepted",
but the operational reading (mirrored in our `Lifecycle::Postulate(citation)`
and rendered in [seven-symbols.md](./seven-symbols.md#34-p-postulate--accepted-via-citation))
treats the V axis as **delegated to an external trusted base**, not
absent. The two readings agree operationally — citation IS the
external V — but the spec text reads "absent" while the
implementation says "external". **Resolution:** the website doc
uses "external V" consistently; a future spec revision MAY clarify
the wording. No defect filed; the operational semantics are
unambiguous.

### Finding R2 — Definition's E axis "trivially executable"

Spec §3.5 describes `[D]` as "E есть"; our seven-symbols.md
renders this as "E.trivial — definitions reduce to themselves".
The two are equivalent: a definition's E witness is the type
itself in functor-of-Set sense. **Resolution:** consistent across
spec and implementation; no defect.

### Finding R3 — §22 universal claim vs §1.5 substrate-bounded zone

Spec §22 declares CVE "the universal architectural law of
knowledge engineering"; spec §1.5 bounds CVE-zone to the
analytic-decompositional substrate. **Resolution:** "universal"
in spec §22 reads as "applicable to every artefact admitting
explicit articulation"; non-articulable mastery sits outside
the CVE-zone by construction. The boundary is operationalised by
[`AP-038 ImplicitSubstrate`](../anti-patterns/articulation.md#ap-038)
and disclosed via [substrate disclosure](./overview.md#substrate-disclosure).
No defect; the bounding is explicit.

### Finding R4 — §16 articulation hygiene without dedicated AP

Spec §16 formalises "never self-X, always operator + fixed
point" as a methodological L2 protocol. The canonical
anti-pattern catalog has [`AP-006 RegisterMixing`](../anti-patterns/classical.md#ap-006)
(register collisions) and [`AP-036 ObserverImpersonation`](../anti-patterns/articulation.md#ap-036)
(role/register mismatches), both of which catch operational
violations of the §16 principle, but no AP fires specifically on
"self-X without operator + fixed point". **Resolution:**
deliberate. Spec §16 lives on L2 (methodological protocol), not
L0/L4 (object/architectural law); the operational manifestations
are caught by the existing two APs. A future revision MAY add
AP-040 `SelfReferenceWithoutOperator` if reviewer experience
shows a bypass surface.

### Finding R5 — §6.6 L5 regenerability without explicit predicate

Spec §6.6 lists "regenerability" (corpus restorable from
primitives + rules of inference) as a load-bearing L5 property.
Our `--bundle` audit gate aggregates per-cog verdicts but does
not predicate on **whole-corpus regenerability**. **Resolution:**
deferred. Regenerability is currently a documentary aspiration in
the canonical Verum stdlib; converting it to a predicate
requires specifying the primitive set + the inference rules
unambiguously. Filed as
`ArchitecturalDefect { kind: OtherDefect("regenerability predicate not yet operational"), proposed_resolution: L2Refinement }`
for the next revision cycle.

### Finding R6 — §21 conditional-mood scenarios

Spec §21 was rewritten in conditional mood per defect 7 of §20.5
("if domain X arises, its CVE-closure requires Y"). Our
implementation does not enforce this register on user-side
documentation; a developer writing prose claims "AGI X will
require CVE-closure Y" violates the conditional-mood rule but
does not trigger any AP. **Resolution:** deliberate. The §21
conditional-mood discipline is a writing convention for the spec
itself, not an architectural predicate over user code.
Operationalising it would require natural-language analysis,
which the audit pipeline does not provide.

These six findings, taken together, form the **open invariant
surface** of the post-revision architecture. The architecture is
sound for its declared purpose; the findings document the residual
work that future revisions may absorb. This is the discipline of
cve-architecture spec §15 antifragility: every audit, every
red-team, every external review feeds into the chronicle and
strengthens the architecture.

## 8. Cross-references

- [cve-architecture spec §20.4–20.5](../../../internal/cve/docs/cve-architecture.md)
  — the canonical text.
- [CVE overview](./overview.md) — the universal frame, including
  cognitive-substrate and formal-anchoring disclosures.
- [Articulation hygiene](./articulation-hygiene.md) — the L6
  register-prohibition discipline that the CVE-AH band
  operationalises.
- [Anti-pattern catalog — CVE articulation-hygiene band](../anti-patterns/articulation.md#cve-articulation-hygiene-band-ap-033--ap-039)
  — the seven concrete anti-patterns implementing the spec
  primitives.
- [Red-team — AT-6..AT-10](../red-team.md#attack-vector-at-6--retracted-citation-laundering)
  — attack-vector closures against the CVE-AH primitives.
- [Cross-side pin discipline](../cross-side-pin.md) — the
  invariant that keeps spec, Verum surface, and kernel
  implementation aligned.
