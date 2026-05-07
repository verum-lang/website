---
sidebar_position: 7
title: "CVE — architectural revisions chronicle"
description: "The §20.4 self-application chronicle — how the CVE-architecture spec evolves under critique, how defects are registered, and how revisions land at L4 or L2 according to scope."
slug: /architecture-types/cve/architectural-revisions
---

# CVE — architectural revisions chronicle

## Document CVE self-application {#document-cve-declarations}

This page is L4-self-applicative by construction: it documents
the procedure by which the CVE-L4 architectural law evolves,
and the procedure operates on this very document.

```verum
ShapeDeclarations {
    purpose: Some(Purpose {
        role: "L4 chronicle of architectural revisions — record format + first/second entries + open invariants",
        k_min: CveThresholdK.FullWitness,        // every defect record carries §3 schema
        v_min: CveThresholdV.NamedCertification,
        e_min: CveThresholdE.StructurallyReady,
    }),
    substrate: Some(CognitiveSubstrate.AnalyticDecompositional),
    anchoring: Some(FormalAnchoring.CurryHowardLawvere),
    e_sense:   Some(ExecutabilitySense.StructuralReadiness),
    self_reference: Some(SelfReferenceWitness {
        operator:       "verum_kernel::arch::ArchitecturalDefect application",
        fixed_point:    "the CVE-L4 architectural law surviving repeated chronicle entries",
        fixpoint_class: fixpoint_class_custom_fixpoint(
            "CVE §20 self-application — the law's stable core under the revision operator"
        ),
    }),
}
```

`Lifecycle`: `[T]` Theorem (the chronicle's own §1 proves CVE
closure of the chronicle artefact — see §1 below). The
`self_reference` declaration is non-`None` because this
document **is** the operator's fixed point under itself.

A CVE-L4 architectural law without an explicit revision
mechanism becomes dogma at the rate at which its host knowledge
system evolves. To prevent ossification, the CVE-architecture
carries an **explicit revision procedure** at CVE-L4, symmetric
to the audit chronicle at CVE-L5 (per
[seven-layers](./seven-layers.md)) but operating on the
architectural law itself.
Defects are registered against the architecture, classified by
kind, and resolved at the appropriate stratum:

- **L4-revision** — modify the architectural law itself
  (rewrite a section, add a clarifying primitive, restate the
  axes).
- **L2-refinement** — refine the methodology layer of
  application without touching the architectural law (add an
  anti-pattern check, a kernel discharge, a cross-side pin,
  refine domain-specific criteria for an axis).

This page documents the chronicle's structure, the Verum-side
`ArchitecturalDefect` record that operationalises it, the
self-application at the first revision (seven defects of the
prior architecture, all resolved at L4 — see §4 below), and
the second revision (operationalisation of §16 articulation
hygiene as a typed declared property, closing the open
[open invariant 4](#open-invariant-4) — see §7 below).

## 1. The chronicle as a CVE-closed artefact

The architectural-revision chronicle is itself subject to CVE
closure:

- **K (Constructive)** — the record format is fully specified
  (see §3 below) and mirrored in the Verum-side
  `ArchitecturalDefect` record.
- **V (Verifiable)** — every registered revision validates
  against three load-bearing criteria of the architectural
  law's self-audit:
  1. **Productivity.** Does applying the principle yield
     artefacts that pass the CVE-audit? If corpora built per
     CVE systematically deliver `[T]`-mature artefacts, the
     principle demonstrates productivity. If systems pledging
     fidelity to CVE fill with `[I]` violators, the principle
     is not actually being applied or is poorly specified.
  2. **Antifragility under critique.** A series of independent
     audits and refutation attempts, recorded in this
     chronicle, must leave the architecture either unchanged
     or refined without destruction of the load-bearing core.
     If every critique destroys a substantial part, the
     principle is unstable.
  3. **Minimality of stratification.** Seven layers and three
     axes must give clean separation of artefacts without
     inter-layer leaks. If defects systematically fail to
     localise on a single layer, the principle carries
     redundant or missing categories.
- **E (Executable)** — the resolution procedure is executable
  via the L3 meta-methodological dispatch: defects classified
  L4-revision modify the architectural law; defects classified
  L2-refinement modify the methodology layer without touching
  L4. The Verum-side
  [`AntiPatternCode` roster](../anti-patterns/articulation.md#cve-articulation-hygiene-band-ap-033--ap-040)
  (`core/architecture/anti_patterns.vr:133`)
  + [`ArchitecturalDefect` record](#defect-record)
  (`core/architecture/types.vr:836`, mirrored in
  `crates/verum_kernel/src/arch.rs:1126`) make the procedure
  machine-tractable.

This closes the recursion of the architectural law: its
evolution is governed by itself, without appeal to an external
authority.

The verification of the architectural law belongs to a
different stratum than the verification of object-level
theorems. Object-level claims (theorems, programs, statutes)
are subject to full CVE⁺-closure. Architectural laws — the
laws **relative to which** other artefacts' closure is
measured — are subject to **operational verification**, not
formal verification: criteria 1–3 above. This is not an
exemption or loophole; it is a correct **self-localisation**
of the architecture on its own layer (L4). Inside L4 different
maturity criteria apply: operational productivity,
tool-invariance, ability to generate mature systems. The CVE
architecture meets these criteria.

Such operational verification is typical for architectural
laws (e.g., ISO/IEC/IEEE 15288 is verified through industrial
practice, not through a theorem). Future formalisation of CVE
as an L0-theorem in a sufficiently rich meta-category is
possible (a category-theoretic statement about morphisms
between categories of knowledge artefacts). Such a
formalisation would lift CVE from L4 to L0 in a richer system
without revoking its L4 role in the original system. It is the
typical pattern: meta-claims of one system become objects in a
richer system.

## 2. Defect kind classification {#defect-kinds}

Every registered defect carries one of four canonical kinds:

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

## 3. The `ArchitecturalDefect` record {#defect-record}

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

## 4. The first chronicle entry — self-application {#first-entry}

The architecture's own revision procedure was first applied to
the architecture itself. Seven defects were registered against
the prior revision (v0.3) and resolved through this chronicle,
producing v0.4. The first defect is given in full record form
to illustrate the discipline; the remaining six are given in
abbreviated form (the full record fields per §3 above are
recoverable from the abbreviated narrative in each case).

### Defect 1 — Semantic blur on the E axis

**Record (CVE-L4).**

| Field | Value |
|-------|-------|
| **Short name** | Semantic blur on the E axis |
| **Architecture version** | v0.3 |
| **Kind** | `OtherDefect("conflation across three senses of executability")` |
| **Witness artefact** | §2.3 of the prior revision; the bare phrase "working representation" without disambiguating the senses |
| **Application context** | CVE-audit of programs with a history of execution but no current structural readiness for redeployment |
| **Observed result** | Artefact gained "E-closed" status by virtue of past execution, while in its current form it was not deployable — the formal E axis did not reflect the actual operational state |
| **Expected result** | The E axis demands **structural readiness for deployment**, distinct from the fact of present execution and from the chronicle of past use |
| **Proposed resolution** | `L4Revision` — introduce explicit three-senses disambiguation, fix `StructuralReadiness` as the canonical reading of E |
| **Resolution landed** | New section disambiguating `StructuralReadiness` / `CurrentExecution` / `PostFactumChronicle`; propagation through the principle statement, the deciding rule, the audit-record format, the main result; new type `ExecutabilitySense` on both sides; soundness pin `executability_sense_canonical_unique` enforces the single canonical reading; ensures the three senses cannot be silently confused at audit time |

**Operationalisation (CVE-L0).**

- [`ExecutabilitySense`](./three-axes.md#three-senses) enum with
  three variants — `core/architecture/types.vr:532`, mirrored
  in `crates/verum_kernel/src/arch.rs:877`;
- soundness pin `executability_sense_canonical_unique` —
  `core/architecture/types.vr:1364`, cross-side asserted at
  `crates/verum_kernel/tests/k_arch_v_alignment.rs:515`;
- `ShapeDeclarations.e_sense: Maybe<ExecutabilitySense>` field
  — `core/architecture/types.vr:945`;
- audit-record format carries `e_sense` explicitly.

### Defect 2 — Audit termination missing

**Record (CVE-L4).**

**Kind.** `OtherDefect("no halting criterion for the audit
procedure")` — a missing operational element.

**Witness.** The deciding rule from §3.3 of the prior revision
fixed the actions to take with a defective artefact (replenish,
downgrade, delete) but no criterion for closing the audit
procedure itself.

**Observed.** The CVE-audit drifted into perennial polishing
without a halting point — the anti-pattern *boundless audit*.

**Resolution.** `L4Revision` — introduce an explicit
[audit-termination criterion via declared purpose](./overview.md#purpose-disclosure):
the audit closes when the artefact's configuration meets the
thresholds declared in its `Purpose`. The audit-record format
gained the fields `Purpose` and `audit_complete?`; the deciding
rule clarifies that none of the three actions applies when the
purpose is satisfied (the [fourth resolution](./seven-configurations.md#deciding-rule):
preservation without change).

**Operationalisation (CVE-L0).**

- new types
  `Purpose` (`core/architecture/types.vr:768`,
  `crates/verum_kernel/src/arch.rs:1054`),
  `CveThresholdK` (`types.vr:698`, `arch.rs:986`),
  `CveThresholdV` (`types.vr:712`, `arch.rs:1008`),
  `CveThresholdE` (`types.vr:727`, `arch.rs:1030`)
  on both sides;
- `ShapeDeclarations.purpose: Maybe<Purpose>` field —
  `core/architecture/types.vr:945`;
- [`AP-037 BoundlessAudit`](../anti-patterns/articulation.md#ap-037)
  fires on a strict-mode `[T]` cog without a declared purpose
  — predicate `check_boundless_audit` at
  `crates/verum_kernel/src/arch_anti_pattern.rs:2230`;
- the audit dispatcher's terminating function consults the
  declared thresholds before issuing a `verdict`.

### Defect 3 — Implicit cognitive-methodological universalism

**Record (CVE-L4).**

**Kind.** `FalseRejection` — the principle systematically
rejected mature artefacts in zones beyond analytical
articulability (the living experience of a master, idiosyncratic
style, holistic-relational practices).

**Witness.** §1 of the prior revision did not declare its own
substrate; it presented as the universal-neutral apparatus
without bounded zone.

**Observed.** Artefacts in non-articulable mastery zones were
formally classified as `[I]` violators, even though they are
mature in their own substrate (a different mode of
maturity-judgement than CVE's analytic-decompositional one).

**Resolution.** `L4Revision` — declare the
[analytic-decompositional substrate](./overview.md#substrate-disclosure)
explicitly; affirm co-equality of alternative substrates; bound
the CVE-zone to the *articulable contour* of every artefact;
make the [CVE-zone vs out-of-CVE-zone](./overview.md#cve-zone)
boundary explicit.

**Operationalisation (CVE-L0).**

- new type `CognitiveSubstrate` with four variants
  (`AnalyticDecompositional`, `HolisticRelational`,
  `ActionCentric`, `TraditionTransmitting`) —
  `core/architecture/types.vr:589`, mirrored in
  `crates/verum_kernel/src/arch.rs:910`;
- `ShapeDeclarations.substrate: Maybe<CognitiveSubstrate>` field
  — `core/architecture/types.vr:945`;
- [`AP-038 ImplicitSubstrate`](../anti-patterns/articulation.md#ap-038)
  fires on a strict-mode `[T]` cog without a declared substrate
  — predicate `check_implicit_substrate` at
  `crates/verum_kernel/src/arch_anti_pattern.rs:2264`.

### Defect 4 — Curry-Howard-Lawvere over-extrapolation

**Record (CVE-L4).**

**Kind.** `OtherDefect("the eponymous formal anchoring extrapolated beyond its current state of development")`.

**Witness.** §4 of the prior revision was titled "Formal base"
(not "anchoring"); it implied CHL is the universal anchoring of
CVE rather than the most-developed of several parallel
anchorings.

**Observed.** Domains without CHL formalisation (control
theory, distributed protocols, institutional design) silently
inherited CHL semantics they did not satisfy; their
domain-specific anchorings remained unrecognised.

**Resolution.** `L4Revision` — rename §4 to "Formal anchoring";
add §4.5 with parallel domain anchorings (automata theory,
control theory, distributed protocols, functional systems,
institutional design); distinguish *methodological CVE* (before
formal anchoring) from *anchored-formal CVE* (after).

**Operationalisation (CVE-L0).**

- new type `FormalAnchoring` with seven variants on both sides
  — `core/architecture/types.vr:652`, mirrored in
  `crates/verum_kernel/src/arch.rs:946`;
- `ShapeDeclarations.anchoring: Maybe<FormalAnchoring>` field
  — `core/architecture/types.vr:945`;
- [`AP-039 AnchoringOverextension`](../anti-patterns/articulation.md#ap-039)
  fires on a strict-mode `[T]` cog under a non-CHL foundation
  without a declared anchoring — predicate
  `check_anchoring_overextension` at
  `crates/verum_kernel/src/arch_anti_pattern.rs:2300`.

### Defect 5 — Culturally particular lineage

**Record (CVE-L4).**

**Kind.** `FalseRejection` — non-citing of mature parallel
traditions of strict knowledge work.

**Witness.** §19 of the prior revision listed five Western
foundational lines without declaring its cultural localisation.

**Observed.** Parallel traditions (Classical Indian Nyāya,
Mediaeval Islamic kalām/uṣūl al-fiqh, Chinese codification of
law, Buddhist conceptual analysis through Mādhyamika /
Dignāga–Dharmakīrti, Hellenistic syllogistic) were silently
omitted from the lineage as if absent or lesser.

**Resolution.** `L4Revision` — fix the choice as a constatation
of *current formal readiness* (the Western mathematico-engineering
line in which CHL has crystallised), not a preference; register
[parallel traditions](./overview.md#lineage-boundary) as an
open research direction; do **not** claim Western uniqueness;
welcome parallel anchorings as their formalisation matures.

**Operationalisation (CVE-L0).**

- the [lineage boundary section](./overview.md#lineage-boundary)
  documents the choice and the open directions;
- the `FormalAnchoring::CustomAnchoring(name)` variant
  (`core/architecture/types.vr:652`,
  `crates/verum_kernel/src/arch.rs:946`) supports user-registered
  anchorings from any tradition.

### Defect 6 — Stratification dogma

**Record (CVE-L4).**

**Kind.** `OtherDefect("operational choice presented as necessity")`.

**Witness.** §6 of the prior revision called the seven layers
"the minimal set", suggesting this is the only correct
stratification.

**Observed.** Coarser or finer stratifications were rejected
without examination; revising the number of layers was not
considered admissible.

**Resolution.** `L4Revision` — reformulate the seven layers as
a **working set** with explicit possibility of revision through
this very chronicle when systematic observations show
inter-layer leaks or tool duplication. Make explicit that the
choice is operational, not dogmatic.

**Operationalisation (CVE-L0).**

- the [seven layers introduction](./seven-layers.md) frames the
  stratification as a working set;
- the chronicle is the canonical mechanism for revising the
  number of layers when warranted.

### Defect 7 — Predictive over-investment in future-practices specification

**Record (CVE-L4).**

**Kind.** `OtherDefect("scenario-bound validity claim — methodological L3 specification confused with prediction of future practices")`.

**Witness.** §21 of the prior revision used the indicative mood
("AGI X will require CVE-closure Y") that bound CVE's validity
to the realisation of specific scenarios.

**Observed.** Discussion of future practices read as
prediction; if a scenario failed to materialise, CVE's
applicability appeared to be undermined.

**Resolution.** `L4Revision` — recast §21 in **conditional
mood**: "if domain X arises, its CVE-closure requires Y". The
specification stands as a methodological L3 statement about
what *would be required* for a not-yet-existing discipline,
not a prediction that the discipline will exist.

**Operationalisation (CVE-L0).** None at the type-system level
— the conditional-mood discipline is a writing convention for
the spec, not a checkable predicate over user code. Tracked as
[open invariant 6](#finding-r6) in
§7 below.

### Summary verdict of the first revision

All seven defects resolved at **L4 (architectural revision)** —
they concerned the architectural law itself, not the
methodology of its application in any particular domain. The
**load-bearing core** — the K/V/E triple closure, the
seven-layer stratification, the audit protocol, the status
taxonomy — was preserved unchanged. The revision **expanded
the explicit self-awareness** of the document:

- own cognitive substrate (analytic-decompositional);
- boundary of formal anchoring (CHL eponymous, parallel
  anchorings recognised);
- cultural localisation of lineage (Western
  mathematico-engineering as constatation, not preference);
- operationality of stratification (seven layers as working
  set);
- termination criterion of audit (declared purpose);
- conditional-mood status of anticipatory specifications.

The core was not reassembled. This is the **first public
demonstration** of the chronicle of architectural revisions in
operation on the architecture's own material — the transition
from L4-self-application as description to L4-self-application
as observable action.

The Verum-side operationalisation of these seven defects'
fixes landed in two layers:

- **Type-system layer** — new types in
  `core/architecture/types.vr`, mirrored in
  `crates/verum_kernel/src/arch.rs`:
  `ExecutabilitySense` (`types.vr:532` / `arch.rs:877`),
  `CognitiveSubstrate` (`types.vr:589` / `arch.rs:910`),
  `FormalAnchoring` (`types.vr:652` / `arch.rs:946`),
  `Purpose` (`types.vr:768` / `arch.rs:1054`),
  `ArchitecturalDefect` (`types.vr:836` / `arch.rs:1126`),
  `DefectKind` (`types.vr:795` / `arch.rs:1079`),
  `Resolution` (`types.vr:805` / `arch.rs:1104`).
- **Anti-pattern layer** — entries 037, 038, 039 of the
  canonical AP roster for purpose, substrate, and anchoring
  disclosure (AP-033..AP-036 already existed for citation /
  hypothesis / interpretation / observer-impersonation
  hygiene). AP-040 was added in the **second** chronicle
  entry — see §7 below.

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
critique** — every published audit, every adversarial-attack
analysis, every external review feeds back into the chronicle
and strengthens the architecture rather than displacing it.

## 7. Open invariants and acknowledged limitations {#7-open-invariants}

The architectural-revision procedure operates over a non-empty
set of **open invariants** — explicit limitations of the current
formulation, registered for future resolution. Each invariant
emerged during the L4 revision that landed the seven Defect 1–7
fixes (§4 above); each is a candidate for future revisions but
is deemed acceptable in the current formulation, with explicit
resolution.

### Open invariant 1 — `[P]` Postulate axis V wording {#open-invariant-1}

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

### Open invariant 2 — Definition's E axis "trivially executable" {#open-invariant-2}

Spec §3.5 describes `[D]` as "E есть"; our seven-symbols.md
renders this as "E.trivial — definitions reduce to themselves".
The two are equivalent: a definition's E witness is the type
itself in functor-of-Set sense. **Resolution:** consistent across
spec and implementation; no defect.

### Open invariant 3 — universal-claim wording vs substrate-bounded zone {#open-invariant-3}

Spec §22 declares CVE "the universal architectural law of
knowledge engineering"; spec §1.5 bounds CVE-zone to the
analytic-decompositional substrate. **Resolution:** "universal"
in spec §22 reads as "applicable to every artefact admitting
explicit articulation"; non-articulable mastery sits outside
the CVE-zone by construction. The boundary is operationalised by
[`AP-038 ImplicitSubstrate`](../anti-patterns/articulation.md#ap-038)
and disclosed via [substrate disclosure](./overview.md#substrate-disclosure).
No defect; the bounding is explicit.

### Open invariant 4 — articulation-hygiene self-reference discipline (CLOSED in v0.4) {#open-invariant-4}

**Original status (v0.3):** Spec §16 formalises "never self-X,
always operator + fixed point" as a methodological L2 protocol.
The canonical anti-pattern catalog had [`AP-006 RegisterMixing`](../anti-patterns/classical.md#ap-006)
(register collisions) and [`AP-036 ObserverImpersonation`](../anti-patterns/articulation.md#ap-036)
(role/register mismatches), both of which catch operational
violations of the §16 principle, but no AP fires specifically on
"self-X without operator + fixed point". The defect was deferred
with the rationale that §16 lives at L2 (methodological protocol)
and the existing two APs cover the operational manifestations.

**Resolution (v0.4).** Open invariant 4 is closed by
introducing two new
first-class types and one new anti-pattern:

1. **`FixpointClass`** — universal-property classifier of a
   fixed-point theorem, the record
   $(\mathrm{category}, \mathrm{endomorphism\_class}, \mathrm{theorem})$
   with three component enums (`FixpointCategory`,
   `EndomorphismClass`, `FixpointTheorem`) and four smart
   constructors (`fixpoint_class_banach`,
   `fixpoint_class_tarski`, `fixpoint_class_adamek`,
   `fixpoint_class_custom_fixpoint`). See
   [articulation-hygiene §8.1.fixpoint-class-universal](./articulation-hygiene.md#fixpoint-class-universal).
2. **`SelfReferenceWitness`** — record `{operator, fixed_point,
   fixpoint_class}` packaging the operator + fixed-point pair as a
   first-class declared property.
3. **`ShapeDeclarations.self_reference: Maybe<SelfReferenceWitness>`**
   — packages the witness alongside `purpose` / `substrate` /
   `anchoring` / `e_sense`.
4. **AP-040 `SelfReferenceWithoutOperator`** — fires when the cog's
   `Shape` exhibits a self-X pattern (self in `composes_with`,
   capability targeting cog's own path, custom-tag mentioning self)
   but `declarations.self_reference` is `None`.
5. **`@kernel_discharge("kernel_arch_self_reference_check")`** —
   kernel-discharge bridge in `core/architecture/anti_patterns.vr`.

The closure operationalises §16 as L4 (architectural law) rather
than just L2: legitimate self-reference is a **typed declared
property**, not just a methodological protocol; the bare self-X
assertion is rejected at deploy time, not just flagged by reviewer
discipline. See:

- [`AP-040` entry](../anti-patterns/articulation.md#ap-040) for the
  predicate, detection scope, and remediation recipe.
- [Articulation hygiene §8](./articulation-hygiene.md#self-reference-spec)
  for the operator+fixed-point discipline and worked examples.
- Kernel-side: `verum_kernel::arch::{FixpointClass,
  SelfReferenceWitness}` and
  `verum_kernel::arch_anti_pattern::check_self_reference_without_operator`.
- Cross-side pin: `pin_fixpoint_class_four_canonical` and
  `pin_self_reference_witness_format` in
  `crates/verum_kernel/tests/k_arch_v_alignment.rs`.

The promotion of §16 from "deferred at L2" to "first-class at L4"
is recorded as the **second** entry of the architectural-revision
chronicle (after the seven §20.5 defects of v0.3 → v0.4 were
landed in the prior chronicle entry).

### Open invariant 5 — L5 regenerability without explicit predicate {#open-invariant-5}

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

### Open invariant 6 — conditional-mood scenarios convention {#finding-r6}

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
**antifragility under critique**: every audit, every
adversarial-attack analysis, every external review feeds into
the chronicle and strengthens the architecture rather than
displacing it. A mature knowledge
system maintains a chronicle of attacks and responses (versioned
codes for legal corpora, replication studies in science,
post-mortems in software engineering, behavioural-regression
ledgers in trained models) — uniformly an instance of the same
principle: **fix the history of attacks on the artefact and the
responses to them**.

## 8. Cross-references

Relation markers per the convention introduced in
[three-axes §5](./three-axes.md#5-cross-references):

- *frame:* [CVE overview](./overview.md) — universal CVE
  architectural law (this page chronicles its evolution).
- *refinement:* [Articulation hygiene](./articulation-hygiene.md)
  — L6 register-prohibition discipline that the CVE-AH band
  operationalises.
- *operationalisation:* [Anti-pattern catalog — CVE articulation-hygiene band](../anti-patterns/articulation.md#cve-articulation-hygiene-band-ap-033--ap-040)
  — eight concrete anti-patterns implementing the
  architecture's load-bearing primitives (citation hygiene,
  hypothesis maturation, interpretation in mature corpus,
  observer impersonation, boundless audit, implicit substrate,
  anchoring overextension, self-reference without
  operator+fixed-point).
- *operationalisation:* [Adversarial threat modelling — AT-6..AT-10](../red-team.md#attack-vector-at-6--retracted-citation-laundering)
  — attack-vector closures against the CVE-AH primitives.
- *pin:* [Cross-side pin discipline](../cross-side-pin.md) —
  invariant that keeps spec, Verum surface, and kernel
  implementation aligned.
