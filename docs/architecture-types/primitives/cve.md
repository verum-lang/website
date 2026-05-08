---
sidebar_position: 9
title: "CVE — Constructive / Verifiable / Executable primitives"
description: "The CVE-side of ATS-V: Purpose declarations with K/V/E thresholds, ShapeDeclarations carrier, CognitiveSubstrate / FormalAnchoring / ExecutabilitySense classifiers, SelfReferenceWitness with FixpointClass. Every value a cog can put under `declarations: ShapeDeclarations { ... }`."
slug: /architecture-types/primitives/cve
---

# CVE — Constructive / Verifiable / Executable primitives

ATS-V's eight per-cog primitives ([Capability](./capability.md) …
[Shape](./shape.md)) describe **what a cog does**.  The
**CVE primitives** described on this page describe **how the cog
attests to its discharge** — what it claims is constructively
*present*, what it claims is verifiably *checked*, and what it
claims is executably *demonstrable*.

The CVE machinery is what turns architectural intent into
auditable obligation.  A cog declaring `lifecycle: Theorem("v1.0")`
is making a claim; its `Purpose` plus its `ShapeDeclarations`
record exactly what threshold of K / V / E discharge underwrites
that claim.

This page is the **primitive entry point** for CVE — every
variant, every smart constructor, every threshold ladder.  For
the deeper philosophy (the seven-symbol Lifecycle taxonomy, the
seven-layer audit protocol, the three-axis CVE closure) see the
[`cve/`](../cve/overview.md) subdirectory.

## 1. The carrier — `ShapeDeclarations`

Every `@arch_module(...)` declaration may include a top-level
`declarations: ShapeDeclarations { ... }` field.  The carrier
record:

```verum
public type ShapeDeclarations is {
    purpose:        Maybe<Purpose>,
    substrate:      Maybe<CognitiveSubstrate>,
    anchoring:      Maybe<FormalAnchoring>,
    e_sense:        Maybe<ExecutabilitySense>,
    self_reference: Maybe<SelfReferenceWitness>,
};
```

All five fields are `Maybe<...>` — every CVE declaration is
**optional**.  Cogs in early Lifecycle stages (Hypothesis,
Postulate) may declare none of them; cogs at Theorem typically
declare at least `purpose` and `substrate`.  The audit gate
treats missing declarations as a downgrade signal in the K-axis
(no `purpose` → K-axis defaults to ReferenceImplBounded).

Five fields, five distinct concerns:

| Field | Question it answers |
|---|---|
| `purpose`        | What is this cog's role, and what minimum K/V/E thresholds does it commit to? |
| `substrate`      | Which cognitive style of explanation does the cog adopt — analytic / relational / action-centric / tradition-transmitting? |
| `anchoring`      | Which formal mathematical apparatus underwrites the proofs — Curry-Howard? Automata? Control theory? Distributed protocols? |
| `e_sense`        | Which sense of "executable" applies — structurally ready, currently executing, or post-factum chronicled? |
| `self_reference` | If the cog is self-referential, which fixed-point operator names the closure, and which canonical fixed-point theorem (Banach / Tarski / Adámek) discharges it? |

## 2. `Purpose` — role + K/V/E thresholds

```verum
public type Purpose is {
    role:   Text,
    k_min:  CveThresholdK,
    v_min:  CveThresholdV,
    e_min:  CveThresholdE,
};
```

A `Purpose` is the cog's **declarative contract** with the audit
gate.  The `role` field is human-prose ("OCSP client end-to-end:
request encode + HTTP fetch + signature verify + freshness
check"), and the three threshold fields say "the audit gate may
treat this cog as honoring at least these K/V/E levels."

### 2.1 The K-axis — Constructive

```verum
public type CveThresholdK is
    | FullWitness            // explicit constructive proof artefact
    | TypedSchema            // typed surface but proof externalised
    | ReferenceImplBounded;  // reference impl serves as witness
```

Reading: how *constructively present* is the artefact?

| K-threshold | Reading | Typical use |
|---|---|---|
| `FullWitness`            | A complete constructive proof or executable witness ships with the cog. | Theorem-grade cogs with formal proofs |
| `TypedSchema`            | The interface is fully typed, but the constructive proof lives outside the cog (e.g. in a sister `verification/` artefact). | Most production stdlib cogs |
| `ReferenceImplBounded`   | A reference implementation (possibly partial) serves as the witness; deviating implementations may exist. | Early-stage cogs, exploratory work |

### 2.2 The V-axis — Verifiable

```verum
public type CveThresholdV is
    | FullFormalProof
    | TypecheckPlusTests
    | NamedCertification;
```

Reading: by what means is the cog *verifiable*?

| V-threshold | Reading | Typical use |
|---|---|---|
| `FullFormalProof`     | A machine-checked proof artefact (Lean / Coq / Isabelle) discharges the cog's claims. | Cryptographic primitives, kernel soundness |
| `TypecheckPlusTests`  | Verum's typechecker plus the test suite are the verification authority. | Most stdlib cogs |
| `NamedCertification`  | An external certification body has audited the cog (FIPS, Common Criteria). | Compliance-grade primitives |

### 2.3 The E-axis — Executable

```verum
public type CveThresholdE is
    | StructurallyReady
    | DeployedInOneEnv
    | FunctorialOnly;
```

Reading: in what sense is the cog *executable*?

| E-threshold | Reading | Typical use |
|---|---|---|
| `StructurallyReady`  | The cog compiles cleanly and its types resolve, but it has not been deployed in production. | New cogs, library code |
| `DeployedInOneEnv`   | The cog has been deployed in at least one production environment. | Battle-tested production code |
| `FunctorialOnly`     | The cog exists only as a categorical functor; no execution semantics is claimed. | Pure theory cogs in `verification/` |

### 2.4 Composing the three thresholds

The three thresholds together form an **(K, V, E) triple** that
the audit gate compares against the cog's actual discharge
state.  A cog declaring
`Purpose { k_min: FullWitness, v_min: FullFormalProof, e_min: DeployedInOneEnv }`
has committed to the strongest discharge — the audit gate flags
it if the actual discharge falls below any single threshold.

Conventional compositions:

| Cog kind | Typical (K, V, E) |
|---|---|
| Stdlib production cog | `(TypedSchema, TypecheckPlusTests, StructurallyReady)` |
| Stdlib battle-tested  | `(TypedSchema, TypecheckPlusTests, DeployedInOneEnv)` |
| Cryptographic primitive | `(FullWitness, FullFormalProof, DeployedInOneEnv)` |
| Pure theory cog       | `(FullWitness, FullFormalProof, FunctorialOnly)` |
| Exploratory cog       | `(ReferenceImplBounded, TypecheckPlusTests, StructurallyReady)` |

## 3. `CognitiveSubstrate` — explanation style

```verum
public type CognitiveSubstrate is
    | AnalyticDecompositional
    | HolisticRelational
    | ActionCentric
    | TraditionTransmitting;
```

Four canonical substrates.  This isn't subjective philosophy —
it's a *consumption hint* for the audit-bundle and IDE: a cog
declaring `substrate: ActionCentric` is asking the auditor to
focus on its observable behaviour rather than its internal
ontology; a cog declaring `substrate: AnalyticDecompositional`
is asking for a structural review of its parts.

| Substrate | Reading | Audit focus |
|---|---|---|
| `AnalyticDecompositional` | "Understand this by breaking it into parts." | Type structure, decomposition discipline |
| `HolisticRelational`      | "Understand this by reading relationships between elements." | Cross-cog composition, observer agreement |
| `ActionCentric`           | "Understand this by what it does." | Capability discipline, runtime behaviour |
| `TraditionTransmitting`   | "Understand this by reading what it cites." | Citation discipline, framework alignment |

The default helper:

```verum
public fn cognitive_substrate_default() -> CognitiveSubstrate {
    AnalyticDecompositional
}
```

…reflecting Verum's bias toward decomposition-first reading of
the typed surface.

## 4. `FormalAnchoring` — proof-theoretic foundation

```verum
public type FormalAnchoring is
    | CurryHowardLawvere
    | AutomataTheory
    | ControlTheory
    | DistributedProtocols
    | FunctionalSystems
    | ProcessAlgebra
    | CustomAnchoring(Text);
```

Seven canonical anchorings.  Each names the formal apparatus the
cog's verification claims rest on.  The auditor uses this to pick
the right proof-checking discipline.

| Anchoring | Apparatus |
|---|---|
| `CurryHowardLawvere`  | Curry-Howard correspondence + Lawvere universals — the canonical Verum substrate |
| `AutomataTheory`      | Finite-state / pushdown / Turing machines |
| `ControlTheory`       | Stability, controllability, observability |
| `DistributedProtocols` | Quorum, consensus, total order, Byzantine resilience |
| `FunctionalSystems`   | Lambda calculus, type theory, monad theory |
| `ProcessAlgebra`      | π-calculus, CSP, CCS — concurrency-first |
| `CustomAnchoring(...)`| Escape hatch with citation |

Default:

```verum
public fn formal_anchoring_default() -> FormalAnchoring {
    CurryHowardLawvere
}
```

## 5. `ExecutabilitySense` — what "executable" means

```verum
public type ExecutabilitySense is
    | StructuralReadiness
    | CurrentExecution
    | PostFactumChronicle;
```

Three senses.  This is a finer-grained companion to the
E-threshold from `Purpose`: the threshold says "at least
DeployedInOneEnv"; the ExecutabilitySense says "and the way
this cog *means* executable is …".

| Sense | Reading |
|---|---|
| `StructuralReadiness`  | The cog is *structurally* ready to execute — types resolve, dependencies satisfy. The canonical default. |
| `CurrentExecution`     | The cog *is currently executing* in production at the time of the declaration. |
| `PostFactumChronicle`  | The cog *has been executed* in the past; the current declaration is a chronicle of that prior run. |

The helper `executability_sense_is_canonical_e(s) -> Bool`
returns `true` only for `StructuralReadiness` — the kernel
treats the canonical E-axis as *structural readiness* rather
than runtime presence.  A `CurrentExecution` claim is only
weakly checkable (a snapshot of `verum run` at a point in
time), and `PostFactumChronicle` is purely descriptive.

## 6. `SelfReferenceWitness` — fixed-point discharge

When a cog *refers to itself* in its functional commitment (the
registry that publishes the registry, the audit-bundle that
audits the audit-bundle), the cog must declare the fixed-point
operator and the canonical theorem that discharges the
recursion.  The witness:

```verum
public type SelfReferenceWitness is {
    operator:       Text,
    fixed_point:    Text,
    fixpoint_class: FixpointClass,
};

public type FixpointClass is {
    category:           FixpointCategory,
    endomorphism_class: EndomorphismClass,
    theorem:            FixpointTheorem,
};
```

Three sub-classifiers — the universal-property triple of any
fixed-point theorem:

```verum
public type FixpointCategory is
    | CompleteMetricSpace
    | CompleteLattice
    | CocompleteCategory
    | CustomCategory(Text);

public type EndomorphismClass is
    | Contracting
    | Monotone
    | ContinuousFunctor
    | CustomEndomorphismClass(Text);

public type FixpointTheorem is
    | Banach
    | Tarski
    | Adamek
    | Custom(Text);
```

### 6.1 The three canonical theorems

| Category | Endomorphism | Theorem | When to use |
|---|---|---|---|
| `CompleteMetricSpace` | `Contracting`        | `Banach`  | The recursion is a contraction in some metric (most engineering recursions: every iteration converges) |
| `CompleteLattice`     | `Monotone`           | `Tarski`  | The recursion is monotone in a lattice ordering (logic-style recursions: least / greatest fixed point) |
| `CocompleteCategory`  | `ContinuousFunctor`  | `Adamek`  | The recursion is a continuous functor on a cocomplete category (algebraic data types as initial algebras) |

When a cog ships `self_reference: Some(witness)`, the audit gate
verifies that the named theorem actually applies to the named
operator.  For example, the registry's self-publishing closure
("`registry.publish(registry-cog)` rebuilds `registry-cog`")
should declare `FixpointClass { CompleteMetricSpace,
Contracting, Banach }` because semver monotonicity makes every
republication a contraction — versions only grow forward.

### 6.2 Non-self-referential cogs

Non-self-referential cogs leave `self_reference: None`.  This is
the common case.  The anti-pattern AP-040
`SelfReferenceWithoutOperator` fires when a cog *implicitly*
self-references (composes_with reaches itself transitively or
captures its own publish surface) without providing the witness.

## 7. `CveAxisMode` — per-axis presence flag

```verum
public type CveAxisMode is
    | Positive
    | Partial
    | Absent;
```

Used in audit-bundle output to summarise per-cog discharge
status: each of K / V / E is reported as positively discharged,
partially discharged, or absent.  The audit gate reads three
`CveAxisMode` values per cog and applies the threshold ladder
from the cog's declared `Purpose`.

## 8. `CveClosure` — the dual-form record

```verum
public type CveClosure is {
    constructive:        Maybe<Text>,
    verifiable_strategy: Maybe<VerifyStrategy>,
    executable:          Maybe<Text>,
};
```

The discharge form for the three CVE axes.  Each field carries
the citation backing that axis:

| Field | Carries |
|---|---|
| `constructive`          | Citation of the constructive witness (e.g. proof artefact path) |
| `verifiable_strategy`   | Pointer to the `VerifyStrategy` arm that discharges V (one of nine: `BasicTypecheck`, `RefinementTypecheck`, `SmtBacked`, `KernelDischarge`, `MetaProgrammatic`, `RuntimeContract`, `ExternalProver`, `ManualReview`, `NoProof`) |
| `executable`            | Citation of the runtime artefact (deployment URL, binary hash, replay log) |

The `verifiable_strategy: Maybe<VerifyStrategy>` is the bridge
to Verum's existing nine-strategy verify ladder — see
[Audit protocol](../audit-protocol.md) §3.

## 9. Reading and writing CVE — full example

A registry handler cog that publishes packages:

```verum
@arch_module(
    foundation:    Foundation.ZfcTwoInacc,
    stratum:       MsfsStratum.LCls,
    lifecycle:     Lifecycle.Theorem("v3.0"),
    declarations:  ShapeDeclarations {
        purpose: Some(Purpose {
            role:   "Registry publish-flow handler — Sigstore keyless pathway".to_text(),
            k_min:  CveThresholdK.TypedSchema,
            v_min:  CveThresholdV.TypecheckPlusTests,
            e_min:  CveThresholdE.DeployedInOneEnv,
        }),
        substrate:      Some(CognitiveSubstrate.ActionCentric),
        anchoring:      Some(FormalAnchoring.DistributedProtocols),
        e_sense:        Some(ExecutabilitySense.CurrentExecution),
        self_reference: Some(SelfReferenceWitness {
            operator:    "registry.publish(registry-cog)".to_text(),
            fixed_point: "the registry republishing itself".to_text(),
            fixpoint_class: FixpointClass {
                category:           FixpointCategory.CompleteMetricSpace,
                endomorphism_class: EndomorphismClass.Contracting,
                theorem:            FixpointTheorem.Banach,
            },
        }),
    },
    exposes:       [...],
    requires:      [...],
)
module verum_registry.http.handlers.publish;
```

Reading the declaration:

- The cog's role is "publish-flow handler"; it commits to
  `(TypedSchema, TypecheckPlusTests, DeployedInOneEnv)`
  thresholds.
- Its substrate is `ActionCentric` — review focuses on what it
  does, not its internal types.
- Its anchoring is `DistributedProtocols` — proofs lean on
  Sigstore / OIDC protocol guarantees, not Curry-Howard.
- Its E-sense is `CurrentExecution` — the cog is in production at
  declaration time.
- Its self-reference witness is the registry-publishes-registry
  closure, discharged by Banach because semver monotonicity makes
  the operator contracting.

## 10. Stable diagnostic tags

Every CVE primitive ships a `_tag` helper for audit-bundle
emission:

```verum
public fn executability_sense_tag(s: ExecutabilitySense) -> Text;
public fn cognitive_substrate_tag(s: CognitiveSubstrate)   -> Text;
public fn formal_anchoring_tag(a: FormalAnchoring)         -> Text;
public fn cve_threshold_k_tag(t: CveThresholdK)            -> Text;
public fn cve_threshold_v_tag(t: CveThresholdV)            -> Text;
public fn cve_threshold_e_tag(t: CveThresholdE)            -> Text;
public fn cve_axis_mode_tag(m: CveAxisMode)                -> Text;
public fn fixpoint_category_tag(f: FixpointCategory)       -> Text;
public fn endomorphism_class_tag(e: EndomorphismClass)     -> Text;
public fn fixpoint_theorem_tag(t: FixpointTheorem)         -> Text;
public fn fixpoint_class_tag(f: FixpointClass)             -> Text;
```

Every tag is stable across Verum versions and pin-tested via
[`cross-side-pin`](../cross-side-pin.md).  The audit-bundle
JSON uses these tags directly — adding a new variant requires
updating the tag function in lockstep.

## 11. Defaults — what happens when CVE is omitted

A cog that declares `@arch_module(...)` without a `declarations:`
field at all gets:

| Field | Default |
|---|---|
| `purpose`        | `None` (audit gate: K-axis = ReferenceImplBounded floor) |
| `substrate`      | `None` (renders as AnalyticDecompositional default at audit time) |
| `anchoring`      | `None` (renders as CurryHowardLawvere default at audit time) |
| `e_sense`        | `None` (renders as StructuralReadiness default at audit time) |
| `self_reference` | `None` (audit gate: AP-040 fires only if implicit self-reference detected) |

This means a minimal `@arch_module(lifecycle: Theorem("v0.1"))`
declaration is auditable but conservative — every CVE axis
falls to its weakest default.  Cogs that want stronger discharge
must opt in by declaring the fields explicitly.

## 12. Self-application — the CVE machinery types itself

Like every ATS-V primitive, the CVE machinery types itself:
[`core.architecture.types`](https://github.com/verum-lang/verum/blob/main/core/architecture/types.vr)
declares `@arch_module(foundation: ZfcTwoInacc, stratum: LFnd,
lifecycle: Theorem("v0.1"))` — the cog that defines `Purpose`
*has* a `Purpose` of its own, the cog that defines
`CognitiveSubstrate` declares its own substrate.  The witness
discipline is the same machinery used to verify it.

See [self-application](../self-application.md) for the
recursive-operator framework that lets the verifier verify
itself.

## 13. Cross-reference

- [CVE seven-symbol Lifecycle taxonomy](../cve/seven-symbols.md)
- [CVE seven-layer audit protocol](../cve/seven-layers.md)
- [CVE seven configurations](../cve/seven-configurations.md)
- [CVE three-axis closure](../cve/three-axes.md)
- [Articulation hygiene — `FixpointClass` deep-dive](../cve/articulation-hygiene.md)
- [Architectural revisions chronicle](../cve/architectural-revisions.md)
- [Audit protocol — V-axis verification ladder](../audit-protocol.md)
- [Self-application](../self-application.md)
- [Cross-side pin tests](../cross-side-pin.md)
