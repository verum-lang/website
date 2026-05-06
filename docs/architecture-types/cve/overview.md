---
sidebar_position: 1
title: "CVE — Constructive / Verifiable / Executable"
description: "The universal correctness frame Verum applies to every proposition: types, theorems, architectural shapes, and proofs alike."
slug: /architecture-types/cve
---

# CVE — Constructive / Verifiable / Executable

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
| **Present** | The system carries an algorithmic check that runs in bounded time. | Refinement type `Int { self > 0 }` — the SMT backend decides instances. |
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
**analytic-decompositional** substrate. Per
[cve-architecture spec §1.5](../../../internal/cve/docs/cve-architecture.md),
operational hygiene requires that the framework knows its own
mode and does not masquerade as a universal neutral apparatus.
Alternative substrates exist and are co-equal in their proper
domains:

| Substrate | Operational mode | When CVE-zone applies |
|-----------|------------------|-----------------------|
| **`AnalyticDecompositional`** | The artefact decomposes into K/V/E projections, each evaluated separately, the verdict assembled. | Default for `@arch_module(...)`; the canonical CVE substrate. |
| **`HolisticRelational`** | The artefact is evaluated as a non-decomposable node in a network of relations. | Living tradition, professional-network maturity, historical ensemble — CVE captures only the *transmissible articulable contour*. |
| **`ActionCentric`** | The action IS the artefact (craft mastery, performance disciplines). | CVE captures the protocol + measurable markers; non-articulable mastery sits outside the CVE-zone. |
| **`TraditionTransmitting`** | The artefact's identity is in multi-generational reproduction. | CVE captures the transmission lineage's articulable invariants. |

The Verum-side `CognitiveSubstrate` enum exposes all four. In
strict-mode `[T]` cogs, omitting an explicit substrate
declaration triggers
[`AP-038 ImplicitSubstrate`](../anti-patterns/articulation.md#ap-038):
operationally indistinguishable from a vacuous claim of universality.

The CVE-zone vs out-of-CVE-zone boundary is made explicit per
[cve-architecture spec §13.4](../../../internal/cve/docs/cve-architecture.md):
mature practice **knows what is transmissible** (CVE-zone) and
what arises only in individual master work (outside CVE-zone),
and does not conflate the registers.

### 4.2 Formal anchoring boundary {#anchoring-disclosure}

The CVE tri-axis closure has an **eponymous** formal anchoring —
the **Curry-Howard-Lawvere** triad (logic ↔ types ↔ categories) —
which is the most-developed of all available anchorings.
Per [cve-architecture spec §4.5](../../../internal/cve/docs/cve-architecture.md),
parallel anchorings exist at various stages of formalisation:

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
triggers [`AP-039 AnchoringOverextension`](../anti-patterns/articulation.md#ap-039):
the artefact silently inherits CHL semantics it does not satisfy.

### 4.3 Audit termination via declared Purpose {#purpose-disclosure}

A naïve CVE audit has no built-in termination criterion: every
inspection might reveal a refinement, and the audit drifts into
infinite polishing. Per
[cve-architecture spec §14.6](../../../internal/cve/docs/cve-architecture.md),
the audit closes relative to the **declared purpose** of the
artefact: the role for which it is built, with explicit thresholds
on each of the three axes.

The Verum-side `Purpose` type captures this:

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
fires in strict mode: the audit becomes perennial critique rather
than a terminating procedure.

Termination through declared purpose is not a relaxation of
rigour — it is the load-bearing distinction between **purposeful
audit** and **infinite polishing** that, for Turing-complete
systems, is forbidden by Rice's theorem and, for trained models,
forbidden by the natural opacity of high-dimensional weights.

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
standards with explicit contractual design. This choice is not
neutral: per
[cve-architecture spec §19.7](../../../internal/cve/docs/cve-architecture.md),
the lineage is a constatation of formal readiness, not a
preference.

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
