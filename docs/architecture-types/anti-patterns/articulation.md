---
sidebar_position: 3
title: "Boundary / lifecycle / capability ontology + CVE articulation-hygiene (AP-011..AP-026 + AP-033..AP-040)"
description: "The middle band of ATS-V anti-patterns plus the CVE articulation-hygiene band: stratum admissibility, boundary invariants, wire encoding, authentication, capability flavours, lifecycle transitivity, declaration drift, foundation-content alignment, retracted-citation use, hypothesis-without-plan, observer impersonation, boundless audit, implicit substrate, anchoring overextension, self-reference without operator."
slug: /architecture-types/anti-patterns/articulation
---

# Boundary / lifecycle / capability ontology + CVE articulation-hygiene (AP-011..AP-026 + AP-033..AP-040)

This page covers **24 anti-patterns** drawn from two adjacent
bands:

  - **AP-011..AP-026 (16 patterns)** — boundary/lifecycle/capability
    ontology proper.  These touch the **capability ontology**
    (linear / affine / relevant / unrestricted flavours),
    **boundary discipline** (wire encoding, authentication,
    invariants), and **lifecycle / foundation transitivity**
    (transitive citation chains, declaration vs body drift,
    foundation-content mismatch).
  - **AP-033..AP-040 (8 patterns)** — CVE articulation-hygiene.
    These touch how cogs *articulate* their Constructive /
    Verifiable / Executable discharge — retracted-citation use,
    hypothesis without maturation plan, interpretation in mature
    corpus, observer impersonation, boundless audit, implicit
    substrate, anchoring overextension, self-reference without
    operator.

The two bands consolidated onto a single page because the CVE
articulation patterns describe how cogs articulate their
discharge — structurally close to the existing articulation
discipline of the AP-011..026 band.  See
[anti-patterns/coherence](./coherence.md) §2 for the full
band-history note.

Patterns in this combined band fire either at **arch-check**
(per-cog predicates that touch only `Shape` plus the
[`DiagnosticContext`](../../reference/glossary)) or at
**post-arch** (transitive predicates that walk the cog graph).

This page paraphrases each entry's predicate from
the canonical anti-pattern catalog and its per-pattern predicates. For the
catalog's overall structure see
[Anti-pattern overview](./overview.md).

---

## AP-011 — AbsoluteBoundaryAttempt {#ap-011}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `Shape.stratum ≠ MsfsStratum::LAbs`. A cog
declaring `stratum: LAbs` violates AFN-T α (MSFS Theorem 5.1):
the absolute foundation stratum is uniformly empty by
construction.

**Why it matters.** `LAbs` is the MSFS hierarchy's "outside-the-
hierarchy" marker; an algorithm that *claims* membership in
`LAbs` claims something AFN-T α refutes. The check protects the
[reflection tower](../../verification/reflection-tower) from
silent stratum corruption.

**Remediation.** Change the stratum to one of
`{LFnd, LCls, LClsTop}` per the cog's actual position in the
moduli space.

---

## AP-012 — InvariantViolation {#ap-012}

**Severity:** error · **Phase:** post-arch · **Stable since:** v0.2

**Predicate.** `forall b : Boundary.
forall i ∈ b.invariants. preserves(traffic(b), i)`. Every
declared `BoundaryInvariant` (`AllOrNothing`,
`DeterministicSerialisation`, `AuthenticatedFirst`,
`BackpressureHonoured`, `Custom { name }`) must be preserved by
the boundary's actual traffic.

**Why it matters.** Boundary invariants are the contract two
sides pin. A boundary that *declares* `AllOrNothing` but admits
partial-state traffic has unsound transactional semantics —
downstream consumers rely on the contract being honoured.

**Remediation.** Either remove the invariant from the boundary
declaration (admit the relaxed contract), or restructure the
traffic to honour it (typically by wrapping in a coordinator or
two-phase commit).

---

## AP-013 — DanglingMessageType {#ap-013}

**Severity:** warning · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `forall m : MessageType ∈ boundary.messages.
exists e : WireEncoding ∈ boundary.wire_encoding. e.supports(m)`.
Every message-type carried across a boundary must have a
configured wire encoding.

**Why it matters.** A message-type without an encoding is
unimplementable: at runtime, the boundary cannot serialise the
message, and the auditor cannot inspect what crosses.

**Remediation.** Set
`@arch_module(boundary: { wire_encoding: ProtoBuf { schema_path: "..." } })`
or one of the other four canonical encodings (`VerumNative`,
`Json`, `MsgPack`, `RawBytes` — note `RawBytes` is itself an
anti-pattern unless explicitly justified).

---

## AP-014 — UnauthenticatedCrossing {#ap-014}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `boundary.physical_layer = Network ⇒
BoundaryInvariant::AuthenticatedFirst ∈ boundary.invariants`.
Every `Network` boundary must declare the
`AuthenticatedFirst` invariant.

**Why it matters.** Network traffic without authenticated-first
is the canonical anti-pattern from a security-architecture
perspective: it admits unauthenticated commands and is the root
cause of most breach categories. The check makes the contract
visible at the architectural layer.

**Remediation.** Add `BoundaryInvariant::AuthenticatedFirst` to
the boundary's invariants and wire the corresponding
authentication mechanism (TLS client cert, OAuth2 bearer token,
mTLS, etc.).

---

## AP-015 — DeterministicViolation {#ap-015}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `Shape.tag = "dst_test" ⇒ ∀ deps. deterministic(deps)`.
A deterministic-simulation-test (DST) cog must not depend on
non-deterministic primitives (system time, random, network
ordering, file-system enumeration order).

**Why it matters.** DST tests are reproducibility-critical: their
verdict must be a function of the seed alone. A test that uses
`Time::now()` or `Random::default()` produces flaky results that
the audit chronicle cannot trust.

**Remediation.** Inject the non-determinism source as a
[context](../../language/context-system) (`using [Clock, Rng]`)
and wire a deterministic implementation in the test harness.

---

## AP-016 — CapabilityDuplication {#ap-016}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `forall c : Linear ∈ Shape.requires.
multiplicity(c, Shape.exposes ∪ uses(cog)) ≤ 1`. A linear
capability may be used at most once.

**Why it matters.** Linearity is multiplicity-1; using a linear
capability twice violates the substructural-logic discipline that
backs Verum's safety story.

**Remediation.** Either consume the capability exactly once, or
weaken its `@quantity(1)` to `@quantity(omega)` if duplication
is acceptable for that capability.

---

## AP-017 — OrphanCapability {#ap-017}

**Severity:** warning · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `forall c : Relevant ∈ Shape.requires.
exercised(c, body(cog))`. A relevant capability declared in
`requires` must actually be exercised somewhere in the cog
body.

**Why it matters.** Relevant capabilities (substructural
multiplicity ≥ 1) are *required to be used*. An orphan
relevant capability is either an over-declared surface
(remove it) or a missing implementation (fix the body). Either
way, the architecture lies about what the cog does.

**Remediation.** Either remove the capability from `requires`
or add the missing usage in the body.

---

## AP-018 — MissingHandoff {#ap-018}

**Severity:** error · **Phase:** post-arch · **Stable since:** v0.2

**Predicate.** `forall composition c. c.passes_capability ⇒
c.target ∈ Shape.composes_with`. A cog that hands off a
capability to another cog must list that cog in
`composes_with`.

**Why it matters.** Capability handoff is composition with
side-effects: the receiving cog now holds something the
auditor cannot trace from the source cog's `composes_with`
list. The check ensures every handoff is architecturally
visible.

**Remediation.** Add the receiving cog's identifier to the
sending cog's `composes_with` list.

---

## AP-019 — FoundationDowngrade {#ap-019}

**Severity:** error · **Phase:** post-arch · **Stable since:** v0.2

**Predicate.** `forall (A → ... → B) ∈ proof_chain.
A.foundation.strength ≥ B.foundation.strength ∨
exists bridge(A, B)`. A proof chain — direct or transitive —
must not silently downgrade the foundation between steps
without an explicit functor-bridge.

**Why it matters.** Foundation strength is monotone under proof
composition: a Cubical proof can be imported into a HoTT
context, but the reverse needs a bridge that proves the
preservation contract. Silent downgrade hides the fact that the
proof is no longer load-bearing in the upstream foundation. The
*transitive* case is subtler: a chain `Cubical → HoTT → ZFC`
can pass each adjacent edge under a local bridge claim while
the end-to-end composition still drops two strata.

**Implementation.** As of 2026-05-06 the check runs on two
layers — the direct one-hop edge surface (already present in
the `peer_resolution` band) plus the transitive layer composed
against `verum_kernel::arch_transitive::for_each_transitive_peer`.
Indirect violations surface in `PhaseInputs.foundation_downgrades`
with `depth ≥ 2`; the regular AP-019 emitter consumes both
sources.  See
[Audit protocol → Transitive peer-resolution layer](../audit-protocol#10-the-transitive-peer-resolution-layer).

**Remediation.** Add a functor-bridge cited via
`@framework(bridge_corpus, ...)`, or align the proof chain to
work in the weaker foundation throughout.

---

## AP-020 — TimeBoundLeakage {#ap-020}

**Severity:** warning · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `forall c : TimeBound ∈ Shape.requires.
exercised_within(c.until, c)`. A time-bound capability must be
exercised before its declared expiry.

**Why it matters.** A time-bound capability whose deadline can
elapse before exercise is dead code at the architecture level —
it consumes auditing budget without protecting any boundary.

**Remediation.** Either tighten the issuing scope so the
capability is exercised before expiry, or extend the expiry
policy so it covers the actual usage window.

---

## AP-021 — PersistenceMismatch {#ap-021}

**Severity:** warning · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `forall c : Persist ∈ Shape.requires.
durable(operations_under(c))`. A `Persist` capability must
guard operations that actually have durable semantics.

**Why it matters.** Declaring `Persist { medium: Disk { path } }`
for an operation that only writes to a buffer is a category
error: the audit chronicle records "persisted" but the
operation evaporates on process exit.

**Remediation.** Either move the operation to a durable medium
(actual disk write, database commit, distributed-log append)
or downgrade the capability to a non-persistent flavour.

---

## AP-022 — CapabilityLaundering {#ap-022}

**Severity:** error · **Phase:** post-arch · **Stable since:** v0.2

**Predicate.** `forall (A → B → C) ∈ capability_chain.
A.privilege ≤ C.privilege ⇒ visible_handoff(A, B) ∧ visible_handoff(B, C)`.
Multi-hop privilege escalation must trace through visible
boundaries at every step.

**Why it matters.** Capability laundering is the architectural
analogue of privilege escalation in a security context: the
final cog ends up with elevated privilege the auditor cannot
attribute to a specific source. Every hop must declare what it
hands off, so the chronicle reconstructs the full chain.

**Remediation.** Make every privilege-elevating handoff explicit
in the sending cog's `composes_with` list and the receiving
cog's `requires` list.

---

## AP-023 — FoundationForgery {#ap-023}

**Severity:** error · **Phase:** post-arch · **Stable since:** v0.2

**Predicate.** `Shape.foundation.consistent_with(cited_axioms)`.
A cog declaring `foundation: Hott` must not cite
`@framework(corpus, ...)` axioms from a foundation Hott cannot
interpret.

**Why it matters.** Foundation forgery is one of the most subtle
architectural defects: the auditor reading the Shape sees
"this cog uses HoTT" but the body relies on axioms that need
ZFC + extra inaccessibles. The audit verdict would be
load-bearing-on-paper but not in fact.

**Remediation.** Either align the cited corpus to the declared
foundation, or change the declared foundation to one that
admits all cited axioms.

---

## AP-024 — TransitiveLifecycleRegression {#ap-024}

**Severity:** error · **Phase:** post-arch · **Stable since:** v0.2

**Predicate.** `forall path = (A_1 → ... → A_n) ∈ citation_chain.
∀ i. A_i.lifecycle.rank() ≥ A_{i+1}.lifecycle.rank()`. The
direct-citation regression rule (AP-009) lifted to transitive
chains.

**Why it matters.** A theorem `[T]` may legitimately cite a
postulate `[P]`, which legitimately cites another theorem
`[T]`, but if the chain ever passes through a hypothesis `[H]`,
the original theorem inherits the hypothesis's strength even
though no single citation regresses. Transitive walking
surfaces this.

**Implementation.** As of 2026-05-06 the predicate is checked
through `verum_kernel::arch_transitive::resolve_transitive_lifecycle_regressions`
— a depth-first walker over `Session.arch_shape_registry` with
built-in cycle prevention and `MAX_TRANSITIVE_DEPTH = 32`.  The
filter is `depth ≥ 2`: depth-1 (direct) regressions are caught
by AP-009.  Violations surface in
`PhaseInputs.transitive_lifecycle_regressions` with the full
intermediate-cog path so audit output preserves the chain.

**Remediation.** Mature every link in the chain to at least the
citing artefact's rank, or insert an explicit downgrade marker
that breaks the transitive claim.

---

## AP-025 — DeclarationDrift {#ap-025}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `Shape == infer_shape(body(cog))`. The declared
`@arch_module(...)` shape must match the inferred shape from
the cog body.

**Why it matters.** Declaration drift is the catch-all
architectural defect: anything the body does that the
declaration doesn't capture (and vice-versa) is a lie at the
architecture level. Auditors reading attributes must be reading
truth.

**Remediation.** Either update the declaration to match the
body (the audit's preferred fix) or remove the body content
the declaration doesn't admit.

---

## AP-026 — FoundationContentMismatch {#ap-026}

**Severity:** warning · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `forall construct ∈ body(cog).
construct.foundation ⊆ Shape.foundation.admitted_constructs()`.
The cog's body must not invoke language constructs that belong
to a different foundation than the declared one.

**Why it matters.** Cubical-only constructs (`Path`, `hcomp`,
`transp`) inside a ZFC-foundation cog mean either the cog is
mis-declared or the construct is being used informally. Either
way, the auditor's foundation-strength reasoning is wrong.

**Remediation.** Either change `Shape.foundation` to one that
admits the construct, or rewrite the body to avoid the
foreign-foundation construct.

---

## CVE articulation-hygiene band (AP-033 .. AP-040) {#cve-articulation-hygiene-band-ap-033--ap-040}

The CVE-AH band operationalises the
[CVE-architecture](../cve/overview.md)
load-bearing concepts that ATS-V was missing on its first
canonical release: the [three senses of the E axis](../cve/three-axes.md#three-senses),
the [seven-symbol articulation discipline](../cve/seven-symbols.md),
the [cognitive substrate disclosure](../cve/overview.md#substrate-disclosure),
the [formal anchoring boundary](../cve/overview.md#anchoring-disclosure),
the [audit termination via declared purpose](../cve/overview.md#purpose-disclosure),
the L6 register
prohibitions (§16), and the operator+fixed-point discipline for
self-reference (§16). AP-040 closes
[architectural-revision invariant **R4**](../cve/architectural-revisions.md).

Patterns in this band fire either at **arch-check** (per-cog
predicates touching `Shape.declarations`) or at **post-arch**
(transitive predicates that walk the cog graph).

---

## AP-033 — RetractedCitationUse {#ap-033}

**Severity:** error · **Phase:** post-arch · **Stable since:** v0.3

**Predicate.** `forall c ∈ Shape.composes_with. ¬ matches(lifecycle(c), Lifecycle::Retracted{..})`
unless the citing cog is itself `Lifecycle::Retracted`.

**Why it matters.** Distinct from
[AP-009 LifecycleRegression](./classical.md#ap-009): AP-009 fires
on rank regression generally; AP-033 fires specifically on `[✗]`
citation regardless of citing rank. The retraction's `reason`
field is meant to be load-bearing — silent citation defeats the
**negative-example** role of the audit chronicle per
[cve-architecture spec §3.5](../cve/seven-symbols.md#37-retracted--withdrawn).

**Remediation.** Either remove the citation, or migrate to the
`replacement` artefact declared in the retraction record.

---

## AP-034 — HypothesisWithoutMaturationPlan {#ap-034}

**Severity:** error in strict mode, warning otherwise · **Phase:** arch-check · **Stable since:** v0.3

**Predicate.**
`matches(Shape.lifecycle, Lifecycle::Hypothesis{..}) ⇒ has_attribute(@plan(...))`.

**Why it matters.** Per
[cve-architecture spec §3.5](../cve/seven-symbols.md#35-h-hypothesis--speculative-with-a-plan),
a `[H]` Hypothesis is the structural commitment to an articulated
maturation path. Without `@plan(...)` the cog degrades to `[I]`
Interpretation — a hidden CVE-violator — without naming the
degradation. AP-034 closes this silent-degradation defect.

**Remediation.** Add `@plan(target: "v0.X", milestones: [...])` to
the cog, or downgrade to `Lifecycle::Interpretation { reason: "..." }`
explicitly.

---

## AP-035 — InterpretationInMatureCorpus {#ap-035}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.3

**Predicate.**
`matches(Shape.lifecycle, Lifecycle::Interpretation{..}) ⇒ ¬ Shape.strict ∧ ¬ in_mature_corpus(cog)`.

**Why it matters.** Per
[cve-architecture spec §3.4 + §6.7 L6](../cve/seven-layers.md#9-l6--the-frame-itself),
mature corpora must contain ZERO `[I]` entries. The `[I]` status
is the canonical CVE-violator: all three axes absent and no plan
to formalise. Mature practice closes every `[I]` by one of three
transformations: prove → `[T]`/`[C]`, downgrade → `[H]` with
`@plan(...)`, or remove the cog.

**Remediation.** Apply one of the three transformations above.
Naming the status `[I]` rather than "todo" or "draft" forces
the choice rather than allowing silent decay.

---

## AP-036 — ObserverImpersonation {#ap-036}

**Severity:** error · **Phase:** post-arch · **Stable since:** v0.3

**Predicate.** Every observer-tagged emit in the audit chronicle
must have its assertion register match the observer role.

**Why it matters.** Per
[cve-architecture spec §6.7 L6 + §16](../cve/articulation-hygiene.md),
a register collision across observer roles (e.g. an `EndUser`
assertion attached to an architectural-shape claim that lives in
the `Architect` register) is a silent defect in the audit
chronicle. Distinct from
[AP-029 MissedAdjoint](./mtac.md#ap-029): AP-029 fires on
architectural decisions; AP-036 fires on audit-chronicle prose.

**Remediation.** Either narrow the observer role to one matching
the assertion content, or qualify the assertion to specify the
layer it ranges over. Both Verum's `verum audit --bundle` L6
self-application gate and the LSP hover surface flag the
mismatch.

---

## AP-037 — BoundlessAudit {#ap-037}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.3

**Predicate.**
`Shape.strict ⇒ Shape.declarations.is_some() ∧ Shape.declarations.purpose.is_some()`.

**Why it matters.** Per
[cve-architecture spec §14.6](../audit-protocol.md#purpose-termination),
the audit terminates relative to a declared `Purpose`. Without
one, the protocol has no halting criterion and degenerates into
infinite polishing — for Turing-complete systems forbidden by
Rice's theorem, for trained models forbidden by the natural
opacity of high-dimensional weights.

**Remediation.** Add to `@arch_module(...)`:

```verum
declarations: ShapeDeclarations {
    purpose: Some(Purpose {
        role: "...",
        k_min: CveThresholdK.FullWitness,        // or TypedSchema, ReferenceImplBounded
        v_min: CveThresholdV.TypecheckPlusTests, // or FullFormalProof, NamedCertification
        e_min: CveThresholdE.StructurallyReady,  // or DeployedInOneEnv, FunctorialOnly
    }),
    ..ShapeDeclarations::empty()
}
```

---

## AP-038 — ImplicitSubstrate {#ap-038}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.3

**Predicate.**
`(matches(Shape.lifecycle, Lifecycle::Theorem{..}) ∧ Shape.strict) ⇒ Shape.declarations.substrate.is_some()`.

**Why it matters.** Per
[cve-architecture spec §1.5](../cve/overview.md#substrate-disclosure),
declaring the cognitive substrate is part of operational hygiene —
CVE knows its mode and does not masquerade as a universal neutral
apparatus. A strict-mode `[T]` cog without explicit substrate is
operationally indistinguishable from a vacuous claim of
universality.

**Remediation.** Add to `@arch_module(...)`:

```verum
declarations: ShapeDeclarations {
    substrate: Some(CognitiveSubstrate.AnalyticDecompositional),
    // ... or HolisticRelational, ActionCentric, TraditionTransmitting
    //     for cogs in non-default substrate domains
    ..ShapeDeclarations::empty()
}
```

---

## AP-039 — AnchoringOverextension {#ap-039}

**Severity:** error in strict mode, warning otherwise · **Phase:** arch-check · **Stable since:** v0.3

**Predicate.**
`(matches(Shape.lifecycle, Lifecycle::Theorem{..}) ∧ ¬ in_chl_domain(Shape.foundation))
⇒ Shape.declarations.anchoring.is_some()`.

The CHL domain is `{ZfcTwoInacc, Cic, Mltt, Hott, Cubical, Eff}`;
`CustomFoundation { ... }` is **outside** the CHL domain.

**Why it matters.** Per
[cve-architecture spec §4.5](../cve/overview.md#anchoring-disclosure),
the CHL anchoring is the most-developed of the seven anchorings;
extending the CVE law to other domains (automata theory, control
theory, distributed protocols, functional systems, institutional
design) requires explicit declaration. Without it, the artefact
silently inherits CHL semantics it does not satisfy.

**Remediation.** Add to `@arch_module(...)`:

```verum
declarations: ShapeDeclarations {
    anchoring: Some(FormalAnchoring.AutomataTheory),
    // ... or ControlTheory, DistributedProtocols, FunctionalSystems,
    //     InstitutionalDesign, CustomAnchoring("..."), depending on
    //     the actual domain of formalisation
    ..ShapeDeclarations::empty()
}
```

---

## AP-040 — SelfReferenceWithoutOperator {#ap-040}

**Severity:** error in strict mode, warning otherwise · **Phase:** arch-check · **Stable since:** v0.4

**Predicate.**
`(self_path ∈ shape.composes_with
   ∨ ∃ c ∈ shape.exposes ∪ shape.requires.
       capability_target_text(c) ⊇ self_path)
⟹ shape.declarations.self_reference.is_some()`,
where `self_path` is the cog's fully-qualified module path.

**Why it matters.** Per
[cve-architecture spec §16](../cve/articulation-hygiene.md#self-reference-spec)
articulation hygiene, every self-X claim must be re-articulated
as `(operator T_X, fixed point Fix(T_X))` with a cited fixpoint-
class theorem. A bare self-X assertion (cog citing itself in
`composes_with`, capability targeting the cog's own holon,
constitution ratifying its own amendment process) is operationally
indistinguishable from a Russell-paradox construction: the
chain's auditor cannot distinguish a legitimate fixed-point from
a circular self-reference without the witness. AP-040 closes the
[architectural-revision open invariant **R4**](../cve/architectural-revisions.md#7-open-invariants).

**Detection scope.** The check inspects three textual surfaces:

1. `shape.composes_with` — direct self-citation (most common).
2. `shape.exposes` and `shape.requires` — capability targets
   (`Read`/`Write` resource tags, `Custom` capability tags) whose
   target text contains the cog's own path. Examples:
   - `Capability.Read(ResourceTag.Database("synarc.governance.constitution"))`
     declared by the `synarc.governance.constitution` cog →
     self-X via capability target.
   - `Capability.Custom { tag: "synarc:holon/<self>" }` declared by
     the cog whose path matches `<self>` → self-X via custom tag.
3. The check is **string-level**, not semantic; it catches the
   bare assertion. Subtle semantic self-reference (e.g., a cog
   that references another cog which references the first) is
   bounded by AP-003 `DependencyCycle`.

**Remediation.** Add `declarations.self_reference: Some(...)` to
the `@arch_module(...)`:

```verum
declarations: ShapeDeclarations {
    self_reference: Some(SelfReferenceWitness {
        operator:       "path.to.operator_cog",     // T_X
        fixed_point:    "path.to.fixed_point_cog",  // Fix(T_X)
        fixpoint_class: FixpointClass.Banach,
        //          // or Tarski / Adamek / CustomFixpoint("...")
    }),
    ..ShapeDeclarations::empty()
}
```

The operator cog must have lifecycle ≥ `Conditional` and
discharge the cited fixpoint-class obligation. The fixpoint
class names which theorem closes existence (and uniqueness where
applicable) of `Fix(T_X)`:

| Class | Theorem | When to cite |
|-------|---------|--------------|
| `Banach` | Banach fixed-point | contracting operator on complete metric space |
| `Tarski` | Tarski-Knaster | monotone operator on complete lattice |
| `Adamek` | Adamek's theorem on initial algebras | continuous functor on cocomplete category |
| `CustomFixpoint(citation)` | user-cited theorem | requires `@framework(...)` attribute |

**Worked example.** A constitution amendment cog without a
witness vs. with a witness:

```verum
// Triggers AP-040 in strict mode:
@arch_module(
    composes_with: ["synarc.governance.constitution"],  // SELF
    strict:        true,
    // declarations omitted
)
module synarc.governance.constitution;
```

```verum
// Admitted (constitution as fixed point of amendment operator):
@arch_module(
    composes_with: ["synarc.governance.constitution"],
    strict:        true,
    declarations: ShapeDeclarations {
        self_reference: Some(SelfReferenceWitness {
            operator:       "synarc.governance.amendment_operator",
            fixed_point:    "synarc.governance.constitution",
            fixpoint_class: FixpointClass.Banach,
        }),
        ..ShapeDeclarations::empty()
    },
)
module synarc.governance.constitution;
```

The second form re-articulates the bare self-X as «the
constitution is the unique fixed point of the amendment operator
under Banach's theorem». The amendment-operator cog discharges
the contraction-coefficient bound; AP-040 admits the cog because
the witness is present.

---

## See also

- [Anti-pattern catalog overview](./overview.md) — the indexing
  page with the full 40-entry table.
- [Capability / composition core (AP-001..AP-010)](./classical.md)
- [Modal-temporal anti-patterns (AP-027..AP-032)](./mtac.md)
- [Reflection tower](../../verification/reflection-tower) — for
  the AP-011 `LAbs` claim's MSFS Theorem 5.1 backing.
- [Three-tier reference model](../../language/memory-model) — for
  AP-016 `CapabilityDuplication`'s linearity discipline.
- [CVE overview](../cve/overview.md) — the cve-architecture
  spec primitives that the CVE-AH band (AP-033..AP-040)
  operationalises.
- [Audit protocol — termination through Purpose](../audit-protocol.md#purpose-termination)
  — the CVE-AH band's load-bearing concept for AP-037.
- [Articulation hygiene §8 — self-reference](../cve/articulation-hygiene.md#self-reference-spec)
  — the operator+fixed-point discipline behind AP-040.
- [Architectural revisions chronicle §7 — R4 closure](../cve/architectural-revisions.md)
  — the open invariant that AP-040 closes.
