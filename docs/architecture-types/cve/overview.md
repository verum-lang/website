---
sidebar_position: 1
title: "CVE — Constructive / Verifiable / Executable"
description: "The universal correctness frame Verum applies to every proposition: types, theorems, architectural shapes, and proofs alike."
slug: /architecture-types/cve
---

# CVE — Constructive / Verifiable / Executable

## Document CVE self-application {#document-cve-declarations}

This page is itself a CVE-L0 artefact subject to the discipline
it documents. Per [§4.3 audit termination](#purpose-disclosure),
the page declares its purpose and thresholds explicitly so its
own audit terminates:

```verum
ShapeDeclarations {
    purpose: Some(Purpose {
        role: "canonical statement of the CVE architectural law",
        k_min: CveThresholdK.FullWitness,        // every concept defined explicitly
        v_min: CveThresholdV.NamedCertification, // builds clean under Docusaurus
        e_min: CveThresholdE.StructurallyReady,  // page is read-deployable on the website
    }),
    substrate:      Some(CognitiveSubstrate.AnalyticDecompositional),
    anchoring:      Some(FormalAnchoring.CurryHowardLawvere),
    e_sense:        Some(ExecutabilitySense.StructuralReadiness),
    self_reference: None,
}
```

`Lifecycle`: `[P]` Postulate of the CVE architectural law
(this page **states** the law; the law is **applied** by
downstream pages and operationalised by the
[CVE-AH band](../anti-patterns/articulation.md#cve-articulation-hygiene-band-ap-033--ap-040)).

CVE — **C**onstructive / **V**erifiable / **E**xecutable — is
the universal correctness frame Verum applies to every
proposition the system can carry. It is not a Verum-specific
feature; it is a *meta-discipline* the language imports, applies
to itself recursively, and uses to render the trust boundary of
every artefact in a single, machine-readable form.

The motivating intuition is this: any claim worth making is worth
asking three questions about.

1. **Is there a constructor?** — is there a procedure that
   produces an instance of the thing being claimed (a witness, a
   proof term, a value)?
2. **Is there a check?** — is there an effective procedure that,
   given a candidate, decides whether it is actually an instance?
3. **Does it execute?** — does the constructor reduce to runnable
   machine code, or remain a pencil-and-paper artefact?

The three questions form orthogonal axes. Different combinations
produce qualitatively different statuses, captured by the
[seven canonical CVE symbols](./seven-symbols.md).

## 1. Why a universal frame?

Engineering teams routinely use ad-hoc terminology — "this is a
draft", "we'll verify it later", "it works but isn't proved",
"it's a stub" — without a precise mapping from prose to
machine-checkable status. The cost of this slack accumulates:

- A "draft" function may be cited from production code without
  anyone noticing the chain of dependence.
- A "stub" theorem may be the foundation of an audit claim without
  anyone realising that the audit reduces to a circular reference.
- A "deprecated" type may be referenced from a "verified" boundary
  without producing an obvious diagnostic — the verifier sees the
  type, doesn't see the deprecation, and signs the claim.

CVE eliminates this slack by giving every artefact a single
canonical status drawn from a finite, exhaustive vocabulary. There
is no "kind-of-verified" or "almost-a-theorem". Every artefact is
in exactly one CVE configuration, surfaced by exactly one CVE
glyph, and that glyph is part of the artefact's externally
observable interface.

### 1.1 Knowledge engineering as the object {#knowledge-engineering}

CVE addresses a class of artefacts wider than any single
discipline: mathematical theories and theorems, physical models
and predictions, software systems and specifications, neural
networks and their training, legal acts and their application,
standards and protocols, courses and curricula, organisational
structures, and **any other artefact in which knowledge is
expressed for use**. The class is open: as new disciplines
emerge — programmable law, machine-checkable science, autonomous
agent ecosystems, civilisational durability infrastructures —
each requires the same architectural discipline. CVE is the
universal architectural law applicable across all of them.

### 1.2 The three erosions a knowledge system must survive {#three-erosions}

Every knowledge system at CVE-L5 (corpus-level) whose declared
purpose includes a lifetime exceeding one generation experiences
three classes of erosion. The CVE frame at CVE-L4 defends
against all three simultaneously when applied through CVE-L0
to CVE-L6:

1. **Lexical erosion.** Terms drift in meaning. What reads
   precisely at the moment of authorship becomes ambiguous,
   multivalent, or inapplicable decades later. This affects
   mathematical theorems (changes in meta-mathematical
   convention), legal acts (evolution of juridical doctrine),
   software interfaces (version incompatibilities), scientific
   models (paradigm change).

2. **Instrumental erosion.** Verification systems, computational
   models, measurement instruments, programming languages
   succeed each other. A proof in one system, when the toolchain
   changes, requires re-derivation. A program compiled for one
   format requires porting; a measurement taken with one
   instrument requires recalibration on the next generation. A
   knowledge system bound to specific implementations diverges
   from its execution environment.

3. **Register erosion.** Without an explicit criterion, the
   boundary between formal assertion, methodological principle,
   descriptive observation, and rhetorical gesture blurs. The
   knowledge system fills with assertions whose status is
   indistinguishable: what is checkable, what is taken on faith,
   what is executable, what is mere rhetorical accompaniment?

CVE's tri-axis closure — constructive witness (defends against
ungrounded claims), verifiable check (defends against
inscrutable claims), executable representation (defends against
purely verbal claims) — defeats all three erosions
simultaneously. Every CVE-L5 corpus built CVE-closed survives
generations of tooling change; every CVE-L5 corpus not CVE-closed
is dissolved by erosion at a rate proportional to the missing
axes.

### 1.3 The principle in one sentence {#cve-principle}

Every knowledge artefact $A$ — theorem, theoretical model,
program, law, protocol, neural-network architecture, simulation,
specification, educational programme, organisational structure
— must simultaneously satisfy three axes:

1. **Constructiveness (C).** $A$ has an explicit constructive
   witness: a concrete object realising $A$, or a formal
   procedure that produces such an object.
2. **Verifiability (V).** $A$ has a formal check of its
   declared properties, executable mechanically — be it a proof
   in a verification system, a test battery with stated
   coverage, formal contract conformance, or passage through a
   stipulated certification protocol.
3. **Executability (E).** $A$ has a working representation in
   the sense of **structural readiness for execution**: a
   program deployable in a suitable environment; a functor
   acting between categories; a protocol deployable between
   parties; an instruction for an executor; a law with a
   procedure of application; a trained model ready to accept
   inputs; a simulation scenario. Readiness as a property of
   the artefact, distinct from the fact of present execution
   and from the post-factum chronicle of past execution — see
   the [three senses of E](./three-axes.md#three-senses).

Violation of any one axis **relative to the artefact's declared
purpose** (see [audit termination](#purpose-disclosure))
qualifies $A$ as defective and triggers one of three actions:
replenishment of the missing component, downgrade of status,
deletion. CVE is **architectural**, not subject-matter
specific: it is not derived from within any one domain, it is
**chosen** as a law of construction. The justification is
operational — when applied consistently, CVE protects any
knowledge system from the three erosions of §1.2, ensures
compatibility with toolchain evolution, and supports
durability.

CVE is **one** possible architectural law of knowledge
engineering, not the only one conceivable. Alternative
tri-partitions are imaginable and may be rational under
different goals. The advantage of CVE is operational closure on
three axes chosen so that they cover the full cycle from
artefact construction through its verification to its
executable use. Adopting CVE is adopting it for these
properties, not as dogma. Disclosing the cognitive substrate
(see §4.1 below) is part of that operational honesty.

## 2. The three axes in detail

### 2.1 Constructive (C)

A claim is **constructive** when there is a procedure that produces
an instance — a value, a proof term, a witness — that the system
can manipulate as a first-class object.

| Mode | Meaning | Example |
|------|---------|---------|
| **Present** | A constructor is realised in the language; the witness is computable. | `fn id<T>(x: T) -> T { x }` — a constructor for the polymorphic identity. |
| **Partial** | A constructor is *formulated* but not realised; the witness type exists but no inhabitant is exhibited. | `type Halts(p: Program)` declared without any constructor. |
| **Absent** | No constructor, even partial; the claim is purely descriptive. | "X is a hard problem." |

Constructiveness is not a binary; it is the claim that you can
*hand someone* an instance. A theorem proved by classical reductio
without a witness construction is *less* constructive than one
proved by exhibiting the witness — even if both are equally true.

### 2.2 Verifiable (V)

A claim is **verifiable** when there is an effective procedure
(decision procedure, type checker, kernel re-checker, SMT replay)
that, given a candidate witness, decides whether it satisfies the
claim.

| Mode | Meaning | Example |
|------|---------|---------|
| **Present** | The system carries an algorithmic check that runs in bounded time. | Refinement type `Int { self > 0 }` — the SMT layer decides instances. |
| **Conditional** | The check is effective only under stated assumptions. | "Halting on terminating inputs" — checkable only if termination is given. |
| **Absent** | No check, even partial; the claim is asserted without a procedure. | A `[P]` Postulate cited from an external corpus. |

Verifiability is the *audit substrate*. A claim that is constructive
but not verifiable can still be useful (the witness exists), but
no third party can confirm it without re-deriving the witness from
scratch.

### 2.3 Executable (E)

A claim is **executable** when the constructor reduces to runnable
code on a target machine — bytecode, native, GPU kernel — without
losing the property the claim asserts.

| Mode | Meaning | Example |
|------|---------|---------|
| **Present** | Constructor extracts to a binary that runs at native or near-native speed. | A `@verify(formal)` function with `@extract(rust)`. |
| **Trivial** | Executability is not at issue; the claim is a definition or boundary marker. | A `type X is …` declaration. |
| **Absent** | Constructor exists in the meta-theory but does not reduce to runnable code. | Many classical-mathematics theorems whose proofs use AC. |

Executability is what makes verification *land* in production.
Verum aggressively prefers C-and-V-and-E-positive proofs because
those are the ones that ship code; classical-only reasoning is
permitted but marked.

## 3. The orthogonality of the three axes

The three axes are *independent*. Every combination of present /
absent across the three is a meaningful status, and the
[seven canonical CVE symbols](./seven-symbols.md) cover exactly the
combinations that arise in practice. A few illustrative cells:

| C | V | E | Glyph | Status name |
|---|---|---|-------|-------------|
| ✓ | ✓ | ✓ | `[T]` | **Theorem** — full closure; the strongest claim Verum can make. |
| ✓ | trivial | ✓ | `[D]` | **Definition** — a boundary set by fiat; nothing to prove. |
| cond. | cond. | cond. | `[C]` | **Conditional** — proven under listed hypotheses. |
| ✓ | ext. | ✓ | `[P]` | **Postulate** — accepted via external citation. |
| partial | absent | absent | `[H]` | **Hypothesis** — speculative, with a maturation plan. |
| absent | absent | absent | `[I]` | **Interpretation** — descriptive only; transitional status. |
| n/a | n/a | n/a | `[✗]` | **Retracted** — withdrawn, kept for record. |

The full table with every cell's interpretation lives in
[Seven configurations](./seven-configurations.md).

## 4. CVE applies recursively — to itself

CVE is *self-applicable*. The CVE framework is itself a proposition
that the framework asks the same three questions about:

- Is the framework **constructive**? Yes — the seven symbols are
  realised as variants of a Verum `type Lifecycle is …`; the
  configuration table is realised as a static dispatch.
- Is the framework **verifiable**? Yes — the kernel-side
  manifest of CVE-symbol-to-axiom-roster is enumerable and
  cross-checked against the source manifest at every audit run.
- Is the framework **executable**? Yes — every audit gate that
  consumes CVE statuses is a runnable subcommand of `verum audit`.

This recursion is not decorative. It is the **L6
articulation-hygiene** discipline: a frame that cannot articulate
itself in its own vocabulary is, by construction, weaker than the
artefacts it claims to classify. CVE survives self-application.

### 4.1 Cognitive substrate disclosure {#substrate-disclosure}

CVE operates under a specific cognitive mode — the
**analytic-decompositional** substrate. The CVE decomposition
relies on a concrete way of reading a knowledge artefact: the
unity of $A$ is decomposed into three distinguishable
projections (C, V, E), and its maturity reads as the simultaneous
satisfaction of all three. The operations are: differentiating
the projections, checking each separately, assembling the
verdict. This is the working cognitive substrate of the
principle.

The analytic-decompositional mode is **not the only** way to
work with knowledge artefacts. Alternative substrates exist:
**holistic-relational** modes evaluate an artefact as a
non-decomposable node in a network of relations (e.g.,
liveness of a craft ensemble, maturity of a professional
network, durability of a tradition through multi-generational
reproduction); **action-centric** modes treat the action itself
as the artefact (craft mastery, performance disciplines);
**tradition-transmitting** modes locate identity in
multi-generational reproduction.

Operational hygiene requires the framework to **know its own
mode** and not masquerade as a universal-neutral apparatus.
CVE does not subsume these substrates; it claims only that its
decomposition is operationally productive and applicable to
**every artefact admitting explicit articulation**. Artefacts
that exist in a mode of principled non-articulability (the
living experience of a master, an idiosyncratic style, a fine
sense of situation) are not covered by CVE-audit — that is an
explicit boundary of applicability, the
[CVE-zone vs out-of-CVE-zone distinction](#cve-zone).

Alternative substrates remain compatible with CVE under
explicit boundary marking: where their objects intersect the
articulable contour, CVE applies; beyond that, their own
maturity criteria govern. Compatibility, not concession.

| Substrate | Operational mode | When CVE-zone applies |
|-----------|------------------|-----------------------|
| **`AnalyticDecompositional`** | The artefact decomposes into K/V/E projections, each evaluated separately, the verdict assembled. | Default for `@arch_module(...)`; the canonical CVE substrate. |
| **`HolisticRelational`** | The artefact is evaluated as a non-decomposable node in a network of relations. | Living tradition, professional-network maturity, historical ensemble — CVE captures only the *transmissible articulable contour*. |
| **`ActionCentric`** | The action IS the artefact (craft mastery, performance disciplines). | CVE captures the protocol + measurable markers; non-articulable mastery sits outside the CVE-zone. |
| **`TraditionTransmitting`** | The artefact's identity is in multi-generational reproduction. | CVE captures the transmission lineage's articulable invariants. |

The Verum-side `CognitiveSubstrate` enum
(`core/architecture/types.vr:589`, mirrored in
`crates/verum_kernel/src/arch.rs:910`) exposes all four. In
strict-mode `[T]` cogs, omitting an explicit substrate
declaration triggers
[`AP-038 ImplicitSubstrate`](../anti-patterns/articulation.md#ap-038):
operationally indistinguishable from a vacuous claim of universality.

#### CVE-zone vs out-of-CVE-zone {#cve-zone}

CVE captures the **transmissible articulable contour** of every
artefact — the part that survives change of executor without
loss of identity. There exist aspects of mastery that are not
transmissible by instruction and arise only through individual
work: a craftsman's aesthetic, an original solution in a novel
situation, a recognisable hand. These are **not** an outer
shell wrapped around a formalisable kernel and **not** an
extra-formal essence of the practice — they are a **separate
object** with which CVE does not work by construction, just as
with any non-regularly-individual phenomenon. Their presence is
legitimate; they simply do not fall in the CVE-zone of the
transmissible contour and are not subject to CVE-audit. Mature
practice **knows clearly** what of itself is transmitted
(CVE-zone) and what arises in individual master work (outside
CVE-zone), and does not conflate the registers.

CVE-critique of *naïve* action-centric or tradition-centric
modes targets unaddressed L6 register violations: appeals to
"the individual intuition of the master", "untransmissible
experience", "qualities accessible only to the initiated" —
these violate the C axis (no transmissible procedure) and the V
axis (no checkable criterion). A mature action-centric practice
removes these appeals through explicit protocols, measurable
markers, certification procedures. This does not make the
practice less "deep" — it makes it **verifiably transmissible**.

### 4.2 Formal anchoring boundary {#anchoring-disclosure}

> **Section declarations.** `FormalAnchoring`:
> `CurryHowardLawvere` — this section IS the canonical
> formulation of CHL anchoring. `Substrate`:
> `AnalyticDecompositional`. `Lifecycle`: `[D]` Definition (CHL
> anchoring is defined here; not a theorem to be proved).

In the mathematical foundations tradition the CVE tri-axis
closure has a developed **formal anchoring** — the
**Curry-Howard-Lawvere** (CHL) triad:

| CVE axis | Register | Formal correspondence |
|----------|----------|------------------------|
| **C** — Constructiveness | type theory | programs as terms (BHK interpretation: a proposition is a type, a proof is a term) |
| **V** — Verifiability | formal logic | propositions as types (Curry-Howard) |
| **E** — Executability | category theory | functors as transformations (Lawvere categorical semantics) |

**Curry-Howard correspondence** (CVE-L4): there exists a
bijection $\Phi : \mathrm{Proof}(P) \xrightarrow{\sim} \mathrm{Term}(P)$
between natural-deduction proofs of proposition $P$ and terms
of type $P$ in simply-typed lambda calculus, and similarly for
richer type theories. In dependently-typed systems (Idris,
Lean 4, Agda, Coq) the correspondence is operational:
type-checking implements formal verification through this
bijection.

**Lawvere categorical semantics** (CVE-L4): for each logical
system $\mathcal{L}$ there is a category $\mathsf{Syn}(\mathcal{L})$
in which derivability $\Gamma \vdash \varphi$ corresponds to
existence of morphisms $\Gamma \to \varphi$. A functor
$F : \mathsf{Syn}(\mathcal{L}_1) \to \mathsf{Syn}(\mathcal{L}_2)$
transports derivations canonically between systems.

**Univalent foundations (Voevodsky)** (CVE-L4): in homotopy
type theory the univalence axiom $(A \simeq B) \simeq (A = B)$
identifies equivalent types with equal types. Under this
identification, propositions, proofs, and programs become
three projections of one object; structural compatibility of
the three CVE registers is guaranteed by univalence.

CHL is the **eponymous and most-developed** anchoring. It is
**not** the only valid one. Other domains have their own
tri-registers at varying stages of formalisation. The Verum
`FormalAnchoring` enum makes this explicit:

| Anchoring | Tri-register | Formalisation stage |
|-----------|--------------|---------------------|
| **`CurryHowardLawvere`** | logic ↔ types ↔ categories | Most developed; canonical for math/SE |
| **`AutomataTheory`** | grammars ↔ automata ↔ languages | Mature, formalisable |
| **`ControlTheory`** | state equations ↔ transfer functions ↔ realisations | Mature in classical settings |
| **`DistributedProtocols`** | specifications ↔ execution models ↔ observable traces | Active research |
| **`FunctionalSystems`** | afferent synthesis ↔ action program ↔ result acceptor | Behavioural biology, cognitive physiology |
| **`InstitutionalDesign`** | normative structure ↔ decision procedure ↔ stabilised practices | Social institutions |
| **`CustomAnchoring(name)`** | user-registered | Open catalog |

CHL is the eponym, **not** the only valid anchoring. CVE applies
in two regimes: **methodological CVE** (before formal anchoring in
a domain) and **anchored-formal CVE** (after). A `[T]` Theorem cog
under a non-CHL foundation without a declared `FormalAnchoring`
(`core/architecture/types.vr:652`, mirrored in
`crates/verum_kernel/src/arch.rs:946`)
triggers [`AP-039 AnchoringOverextension`](../anti-patterns/articulation.md#ap-039)
(predicate `check_anchoring_overextension` at
`crates/verum_kernel/src/arch_anti_pattern.rs:2300`):
the artefact silently inherits CHL semantics it does not satisfy.

The formal anchoring does **not** assert CVE applies only where
CHL is directly derivable. CVE-principle applies **before**
and **after** establishing complete formal anchoring in a
domain. *Before* — as a methodological discipline with
domain-specific C/V/E criteria. *After* — as a formal theorem
about triple closure, with toolchain-invariance guarantees
analogous to Yoneda-invariance in categorical mathematics.
Distinguishing the two regimes is essential: the CHL paradigm
should not be extrapolated onto domains in which the
corresponding formalisation has not yet been built.

### 4.3 Audit termination via declared Purpose {#purpose-disclosure}

A naïve CVE audit has no built-in termination criterion: every
inspection might reveal a refinement, and the audit drifts into
infinite polishing. The deciding rule (replenish / downgrade /
delete; see [seven-configurations §3.3](./seven-configurations.md#deciding-rule))
answers *what to do with a defective artefact* but not *when
the audit is complete*. Without an explicit termination
criterion the audit loops forever — every inspection finds a
refinement, the artefact "improves" but never closes as
mature, and audit resources burn on perennial polishing. This
is a form of silent decay: the audit appears to be working,
but it never terminates.

The audit closes relative to the **declared purpose** of each
artefact: the role for which it is built, with explicit
thresholds on each of the three axes. The declaration is fixed
**before** work begins:

- which **level of axis C** suffices (full constructive
  witness / scheme of construction with typed parameters /
  reference implementation in a bounded domain);
- which **depth of axis V** is required (full formal
  verification / typecheck plus test battery with stated
  coverage / passage of a named certification);
- which **form of axis E** must be reached (structural
  readiness for deployment in any environment of the declared
  class / readiness in one specific environment / functorial
  representation in one category).

The Verum-side `Purpose` type
(`core/architecture/types.vr:768`, mirrored in
`crates/verum_kernel/src/arch.rs:1054`)
captures this; the threshold enums
(`CveThresholdK` at `types.vr:698` / `arch.rs:986`,
`CveThresholdV` at `types.vr:712` / `arch.rs:1008`,
`CveThresholdE` at `types.vr:727` / `arch.rs:1030`)
enumerate the per-axis levels:

```verum
type Purpose is {
    role: Text,
    k_min: CveThresholdK,  // FullWitness | TypedSchema | ReferenceImplBounded
    v_min: CveThresholdV,  // FullFormalProof | TypecheckPlusTests | NamedCertification
    e_min: CveThresholdE,  // StructurallyReady | DeployedInOneEnv | FunctorialOnly
};
```

When configuration meets thresholds, the audit closes —
**no further action is taken**, the artefact is sound for its
declared role. Without a declared purpose,
[`AP-037 BoundlessAudit`](../anti-patterns/articulation.md#ap-037)
(predicate `check_boundless_audit` at
`crates/verum_kernel/src/arch_anti_pattern.rs:2230`)
fires in strict mode: the audit becomes perennial critique rather
than a terminating procedure.

Termination through declared purpose is not a relaxation of
rigour — it is the load-bearing distinction between **purposeful
audit** and **infinite polishing** that, for Turing-complete
systems, is forbidden by Rice's theorem and, for trained models,
forbidden by the natural opacity of high-dimensional weights.

#### Four functions of every audit round

Each complete audit round runs four operationally distinct
functions:

1. **Differentiating** — determine on which axis the artefact
   is closed and on which it is not.
2. **Goal-directing** — compare observed configuration against
   the declared thresholds.
3. **Translating** — convert observed defects into one of the
   three deciding actions:
   [replenish, downgrade, delete](./seven-configurations.md#deciding-rule).
4. **Terminating** — issue "audit complete" or "another round
   needed" based on the comparison.

The first three operate every round; the fourth determines
whether there is a next round. Without an explicit terminating
function the first three run idle. A CVE-audit that does not
arrive at "complete" or "incomplete, the following action is
required" is not an audit but **perennial critique**.

#### The fourth resolution — preserve unchanged

The deciding rule (§3.3 of the spec, mirrored in
[seven-configurations](./seven-configurations.md#deciding-rule))
applies the three actions when configuration **fails to reach**
the declared thresholds. When configuration **does reach**
them, none of the three actions applies: the artefact is
preserved in its current form, and the audit closes. This
fourth resolution — **preservation without change** — is the
normal outcome of a successful audit; it is not listed as a
separate action because it is the *non-application* of the
three, not a fourth alternative.

### 4.4 Stability under tool evolution {#tool-stability}

CVE survives generations of tooling change through three
overlapping safeguards:

1. **Per-axis tool-invariance.**
   - **Axis C** is not bound to any specific constructive
     paradigm. BHK, Martin-Löf type theory, cubical type
     theory, any future constructive paradigm — all satisfy
     the requirement of an explicit constructive witness.
   - **Axis V** is not bound to a specific verification
     system. Lean, Coq, Agda, Isabelle, test frameworks,
     certification procedures, or their successors all
     deliver mechanical checkability.
   - **Axis E** is not bound to a specific computational
     model. Turing machine, lambda calculus, monadically
     structured programs, homotopical computation, neural
     architectures, deployable protocols, statutes — each
     supplies an executable representation in its domain.

   When the toolchain changes, CVE **re-anchors** onto the new
   instruments. The architectural principle is not bound to
   specific implementations.

2. **Yoneda-invariance of universal definitions.** Concepts
   defined through universal properties transport canonically
   between categories — this is the second safeguard. Renaming
   the categorical apparatus does not lose the meaning of
   universal characterisations.

3. **Stratification meta-insurance.** At CVE-L1 (meta-language)
   every space of formal systems sufficiently rich to encode
   primitive recursive arithmetic stratifies by formalisation
   strength: effective systems, foundations of sufficient
   completeness, classifiers, maximal classifiers, a hypothetical
   absolute class. Existing
   no-go theorems (Gödel, Tarski, Lawvere and their
   generalisations) show: the upper absolute class is empty.
   This stratum-invariance survives changes in concrete
   formalisms — only the system within a stratum changes.

The composite effect of the three safeguards is that a corpus
built CVE-closed survives generations of toolchain change
without loss of content. A corpus **not** built CVE-closed
does not survive instrumental evolution; one built CVE-closed
does. This is the load-bearing reason to choose CVE as an
architectural principle.

## 5. CVE and the seven layers

CVE is layered. The same three questions yield different answers
when asked at the *object* level versus the *meta* level versus the
*meta-meta* level. Verum uses a seven-layer stratification:

| Layer | Subject | Example asker |
|-------|---------|---------------|
| **L0** | The object — code, value, theorem statement | "Is `add(2, 3) = 5` C-V-E?" |
| **L1** | The proof — the proof term or certificate | "Is the proof of `add(2, 3) = 5` C-V-E?" |
| **L2** | The proof method — the tactic / strategy / SMT call | "Is the *tactic* used C-V-E?" |
| **L3** | The proof method's foundation — the meta-theory | "Is ZFC + 2-inacc C-V-E?" |
| **L4** | The architectural shape carrying the proof | "Is the cog's `Shape` C-V-E?" |
| **L5** | The communication of the proof to a reader | "Is the audit report C-V-E?" |
| **L6** | The frame itself — CVE applied to CVE | "Is CVE C-V-E?" |

Every audit `verum audit --bundle` runs aggregates verdicts
*per layer*. A bundle that is "L4-load-bearing" means the L4
verdict — *the architectural shape carrying the proof is itself
C-V-E* — is materially checked, not assumed.

The full discussion is in [Seven layers](./seven-layers.md). A
companion discussion of the **L6 register prohibitions** — the
specific anti-philosophical traps that L6 forbids — is in
[Articulation hygiene](./articulation-hygiene.md).

## 6. Why this matters in code review

Suppose you are reviewing a PR. The PR adds a function that calls
into a module marked `Lifecycle.Hypothesis(High)`. The reviewer
asks three CVE questions:

- C: does the hypothesis have a constructor? — usually no, that is
  what makes it a hypothesis.
- V: is there a check? — usually no.
- E: does it execute? — usually no.

The PR is therefore citing `[H]` from a context that the function
type claims is at least `[C]`. ATS-V's
[`AP-009 LifecycleRegression`](../anti-patterns/classical.md#ap-009)
recognises this pattern statically and rejects the build. The
reviewer does not need to *remember* that `Hypothesis` is below
`Conditional` in the lifecycle poset; the type checker handles it
automatically.

This is the practical payoff of CVE: every code-review question
that previously required tribal knowledge becomes a stable RFC
diagnostic with a single canonical name.

## 7. CVE is not Verum-specific

The three axes C / V / E are a *meta-discipline*. They apply to:

- **Mathematics** — a constructive proof of a classical theorem
  is C-positive; a non-constructive existence proof is C-absent.
- **Software engineering** — a "TODO" comment is C-absent /
  V-absent / E-absent (canonical `[I]`); a property test that
  passes 1000 random inputs is C-partial / V-partial / E-positive.
- **Documentation** — a citation to an external source is
  C-external / V-external / E-trivial (canonical `[P]`).
- **Architectural design** — a hand-drawn diagram is C-partial /
  V-absent / E-absent; an ATS-V `Shape` annotation is C-positive /
  V-positive (the type checker is the decision procedure) /
  E-trivial (definitions don't execute).

Verum's contribution is not the framework — the framework is older
than Verum — but the *mechanisation* of the framework: every
artefact's CVE status is computed by the compiler, surfaced by the
tooling, and load-bearing in the audit gates.

### 7.1 Lineage boundary {#lineage-boundary}

Verum's CVE inherits five formal lines from the **Western
mathematico-engineering tradition** of foundations and systems
design — the line in which CHL (see §4.2 above) is most developed
and engineering disciplines reach the level of international
standards with explicit contractual design.

| Lineage | Axis covered | Contribution |
|---------|--------------|--------------|
| **Hilbert programme** | V | required complete verifiability of mathematics through reduction to a finite formal rule set; attacked by Gödel's incompleteness, but the methodological contribution — explicit verification — became the standard of every mature formal system |
| **Brouwer–Bishop constructivism** | C | required constructive witnesses for every existential claim; CVE inherits primacy of constructive witnessing but does not require it exclusively (classical moves are admissible under explicit status marking) |
| **Curry–Howard correspondence** | C ↔ V | first systematic example of two-axis closure; foundation of dependent-type systems (Idris, Lean 4, Agda) |
| **Lawvere categorical semantics** | V ↔ E | second bridge: each logical system has a categorical semantics; systematic use of categorical apparatus for executable representation |
| **Univalent foundations (Voevodsky)** | C ↔ V ↔ E | first systematic triple closure in homotopy type theory; univalence axiom guarantees structural compatibility of three registers in the univalent context |

CVE also inherits engineering programmes: **Hoare** (formal
program semantics, contracts, invariants — C and V in software);
**Alexander's pattern language** (proto-formal realisation of
all three axes in architecture); **systems engineering**
(ISO/IEC/IEEE 15288, V-model, contract-based design — three
axes at the level of large systems); **cryptographic security
proofs** (adversary model, formal proof, implementation audit —
three axes in cryptography). CVE is the systematic
generalisation of all these programmes — a law inheriting the
best practices of formal and engineering disciplines, not a
doctrine and not a philosophical stance.

The choice of Western mathematico-engineering lineage is **not
neutral**: it is the line in which CHL has crystallised in
modern form and engineering disciplines have reached the level
of international standards with explicit contractual design.
The lineage is a *constatation of current formal readiness*,
not a preference.

Parallel traditions of strict knowledge work exist in other
cultural-formal contexts and remain open directions:

- **Classical Indian logic (Nyāya)** — formal theory of inference
  via five-membered syllogistics, systematic typology of
  reasoning errors, the *pramāṇas* (criteria of valid
  cognition).
- **Mediaeval Islamic methodology (kalām, uṣūl al-fiqh)** —
  systematic foundations work, hierarchy of sources, formalised
  procedure for reconciling precedents; mature status taxonomy
  paralleling the seven-symbol scheme.
- **Chinese codification of law** — Tang/Song/Ming/Qing systemic
  codes with explicit application procedure, precedential
  discipline, integrated meta-administrative protocols.
- **Buddhist conceptual analysis** — Mādhyamika tetralemma as
  formal refutation procedure, abhidharma dharma taxonomy,
  Dignāga–Dharmakīrti epistemology.
- **Ancient and Hellenistic syllogistic** — Peripatetic /
  Stoic logic transmitted through Arabic and Latin commentators;
  partially absorbed into the Western line and partially
  preserved as a parallel lineage.

These traditions are **not** cited as foundational anchorings
because their formal correspondences with the K/V/E axes
require independent systematic work not yet completed in this
documentation. Establishing such correspondences is an open
research direction; CVE does not claim Western uniqueness, and
parallel anchorings (per §4.2) are welcome as their formalisation
matures.

## 8. How to read a CVE-classified codebase

Every Verum cog declares its `Shape.lifecycle` as one of the
[seven canonical glyphs](./seven-symbols.md). A glance at
`@arch_module(lifecycle: …)` tells you the cog's CVE status at a
single layer (L4 — the architectural shape). To get the full
seven-layer picture you ask `verum audit --bundle`, which runs
the per-layer gates and produces a structured report:

```
$ verum audit --bundle
        --> Bundle audit · L4 load-bearing aggregator

  L0 — kernel rules                            ✓ 7 / 7   load-bearing
  L1 — proof bodies                            ✓ 1024    proved
  L2 — tactic + SMT certs                      ✓ replayed
  L3 — meta-theory (ZFC + 2-inacc)             ✓ cited
  L4 — architectural shapes                    ✓ 267 / 267
  L5 — audit-report self-consistency           ✓ schema-pinned
  L6 — articulation hygiene                    ✓ no register-prohibition triggered
```

Every check at every layer is auditable, deterministic, and
non-vacuous (a liveness-pin synthetic kernel proves the check is
not silently tautologous).

## 9. CVE in three sentences

If this page is too long, here is the kernel:

> A claim is real to the degree that it is **constructive**
> (someone can produce a witness), **verifiable** (a procedure
> decides the witness), and **executable** (the witness reduces to
> runnable code). Every Verum artefact carries one of seven
> canonical CVE statuses, surfaced as a glyph and load-bearing in
> every audit gate. The CVE frame is recursively self-applied —
> it survives being classified by itself, which is the property
> that makes it suitable as a foundation rather than a convention.

For the technical mechanics see
[seven-axes](./three-axes.md), [seven-configurations](./seven-configurations.md),
[seven-symbols](./seven-symbols.md), [seven-layers](./seven-layers.md),
[articulation-hygiene](./articulation-hygiene.md). For the way
CVE plumbs into ATS-V's `Lifecycle` primitive see
[primitives/lifecycle](../primitives/lifecycle.md).
