---
sidebar_position: 5
title: "CVE — seven layers (L0 .. L6)"
description: "The same three CVE questions yield different answers at object, proof, method, foundation, shape, communication, and frame layers. The seven-layer stratification organises Verum's audit gates."
slug: /architecture-types/cve/seven-layers
---

# CVE — seven layers (L0 .. L6)

## Document CVE self-application {#document-cve-declarations}

```verum
ShapeDeclarations {
    purpose: Some(Purpose {
        role: "stratification of CVE application into seven layers + Verum-to-spec mapping",
        k_min: CveThresholdK.FullWitness,
        v_min: CveThresholdV.NamedCertification,
        e_min: CveThresholdE.StructurallyReady,
    }),
    substrate: Some(CognitiveSubstrate.AnalyticDecompositional),
    anchoring: Some(FormalAnchoring.CurryHowardLawvere),
    e_sense:   Some(ExecutabilitySense.StructuralReadiness),
    self_reference: None,
}
```

`Lifecycle`: `[D]` Definition of the seven-layer stratification
(layers are defined here; revision goes through the
[architectural-revisions chronicle](./architectural-revisions.md)).

The CVE frame asks three questions: *constructive? verifiable?
executable?* Asking these questions of *the same artefact* at
different layers of abstraction yields different answers — and
the layers must be kept distinct to avoid category errors.

Stratification has operational meaning: a CVE-closure check at
one layer uses one set of tools, at another a different set.
**Mixing layers** is a typical source of elusive defects that
hide in the unclarity of *at what level* an assertion lives.
The seven-layer set is a **working set** that gives clean
separation between artefact types each operational tool
addresses; coarser stratifications mix tool classes inside one
layer, finer stratifications generate cross-layer duplicates.
The choice is operational, not dogmatic; a revision of the
number of layers is registered through the
[chronicle of architectural revisions](./architectural-revisions.md)
when systematic observations show the current stratification
generates inter-layer leaks or tool duplication.

Verum stratifies the application of CVE into **seven layers**,
L0 through L6. Each audit gate is positioned at a specific
layer; the bundle aggregator combines verdicts across layers
into a single **L4 load-bearing** claim.

This page lays out the seven layers, what each layer asks, and
which audit gate operates at each layer.

## 1. The seven layers at a glance

| Layer | Subject of the CVE question | Example asker |
|-------|----------------------------|---------------|
| **L0** | The object itself — code, value, theorem statement | "Is `add(2, 3) = 5` C-V-E?" |
| **L1** | The proof — the proof term or certificate | "Is the *proof* of `add(2, 3) = 5` C-V-E?" |
| **L2** | The proof method — the tactic / strategy / SMT call | "Is the *tactic* used C-V-E?" |
| **L3** | The proof method's foundation — the meta-theory | "Is ZFC + 2-inacc C-V-E?" |
| **L4** | The architectural shape carrying the proof | "Is the cog's `Shape` C-V-E?" |
| **L5** | The communication of the proof to a reader | "Is the audit report C-V-E?" |
| **L6** | The frame itself — CVE applied to CVE | "Is CVE C-V-E?" |

Every audit gate has a layer. Combining a gate's verdict with
gates at different layers without normalising is a category error.

## 2. L0 — the object

**Subject:** the artefact whose correctness is at stake — a
function body, a value, a theorem statement, a configuration
constant.

**C question:** does the artefact have a constructor — is there a
procedure that produces it?

**V question:** does the artefact have a check — is there a
procedure that verifies it?

**E question:** does the artefact reduce to runnable code?

**Audit gate at this layer:** `verum check` and `verum verify`
operate on L0. The type checker confirms C; the SMT discharger
confirms V; the AOT compiler confirms E.

**Example:** a `@verify(formal)` function in a payment-processing
cog. L0 asks: *is this function constructively defined,
SMT-checkable, and AOT-compilable?* The compiler answers all
three.

## 3. L1 — the proof

**Subject:** not the artefact, but its proof — the proof term, the
SMT certificate, the kernel discharge witness.

**C question:** does the proof have a constructive proof term?

**V question:** is the proof term re-checkable?

**E question:** does the proof term reduce to a (typically
no-op) computational artefact?

**Audit gate at this layer:** `verum audit --kernel-recheck`
walks every theorem and re-checks its proof term against the
trusted base.

**Why this layer is distinct from L0:** a function may be
correct (L0) without an explicit proof being shipped (L1). A
function may have a proof (L1 C-positive) that the kernel does
not re-check (L1 V-absent).

## 4. L2 — the proof method

**Subject:** *how* the proof was produced — the tactic, the
SMT solver, the synthesis search.

**C question:** is the tactic constructive?

**V question:** is the tactic re-checkable in the absence of the
specific solver?

**E question:** does the tactic execute (e.g., the SMT solver
runs)?

**Audit gate at this layer:** `verum audit --kernel-soundness`
exports the kernel rule list to Coq / Lean / Dedukti for
independent re-checking; `verum smt-stats` enumerates the
per-theory tactic dispatch.

**Why this layer is distinct from L1:** an SMT certificate
(L1) may be re-checkable (L1 V-positive) only because the
specific solver runs (L2 E-positive). If the solver
becomes unavailable, the L1 verdict is unaffected but the L2
verdict changes.

## 5. L3 — the meta-theory

**Subject:** the meta-theoretic base under which the proof
method is sound — ZFC, ZFC + N inaccessibles, HoTT, etc.

**C question:** is the meta-theory itself constructive (e.g.,
CIC) or classical (e.g., ZFC + LEM)?

**V question:** is the meta-theory's consistency provable from a
stronger system?

**E question:** does the meta-theory admit program extraction?

**Audit gate at this layer:** `verum audit --reflection-tower`
walks the ordinal-indexed meta-soundness tower and confirms each
finite level discharges. `verum audit --framework-axioms`
enumerates the citations to external corpora.

**Why this layer is distinct from L2:** a tactic (L2) may use
LEM internally; the soundness of LEM is an L3 question (does
the meta-theory admit it?), not an L2 question (does the tactic
execute?).

## 6. L4 — the architectural shape

**Subject:** the cog's `@arch_module(...)` Shape — its
capabilities, lifecycle, foundation, tier, stratum.

**C question:** is the Shape constructively realised?

**V question:** does the architectural type checker admit the
Shape against the body?

**E question:** does the Shape erase cleanly at compile time
without runtime artefacts?

**Audit gate at this layer:** `verum audit --arch-discharges`
runs the 40-pattern catalog (AP-001..AP-040) against every annotated cog;
`verum audit --counterfactual` evaluates the architectural
invariants under counterfactual scenarios; `verum audit
--adjunctions` recognises the four canonical adjunctions.

**Why this is the load-bearing aggregate layer:** L4 is where
the architectural commitments meet the body. A project that
passes L4 has its architectural shape consistent with its code,
its anti-pattern catalog clean, its counterfactual invariants
stable. A project's `verum audit --bundle` reports
"L4-load-bearing" when L4 is fully verified.

## 7. L5 — the communication

**Subject:** how the verdict is communicated to a reader — the
audit JSON output, the LSP hover text, the diagnostic message.

**C question:** is the report constructively producible?

**V question:** is the report self-consistent (schema-valid,
fields cross-referenced)?

**E question:** does the report execute, in the sense of being
parseable by downstream tooling?

**Audit gate at this layer:** the JSON schema validator runs at
the bundle phase; downstream tooling that consumes the report
serves as additional verification.

**Why this layer matters:** a project may be load-bearing at L4
yet produce inconsistent audit JSON (missing fields, wrong
verdicts). L5 catches the *audit's* errors, not the project's.

## 8. L6 — the frame itself {#9-l6--the-frame-itself}

**Subject:** CVE applied to CVE. *Is the CVE framework C-V-E?*

**C question:** can the framework be realised in code? (Yes —
Verum's `Lifecycle` enum, the audit dispatcher, the gate runner.)

**V question:** does the framework admit re-checking? (Yes —
the manifest of CVE-status-to-glyph is enumerable and audited.)

**E question:** does the framework execute? (Yes — every audit
gate is a runnable subcommand.)

**Audit gate at this layer:** `verum audit --bundle` itself,
plus the *articulation hygiene* register-prohibition check.
A frame that cannot answer its own three questions is, by
construction, weaker than the artefacts it classifies. The L6
check protects against this category error.

## 9. The L4 load-bearing claim

When `verum audit --bundle` reports `verdict: load-bearing`, it
makes a precise claim across all seven layers:

- L0 — every annotated cog's body type-checks and verifies.
- L1 — every proof in the corpus re-checks against the trusted
  base.
- L2 — every tactic / SMT certificate replays cleanly.
- L3 — the meta-theory hierarchy discharges every required level.
- L4 — every Shape is consistent with its body, every
  anti-pattern is clean, every counterfactual invariant is
  stable.
- L5 — the audit report is schema-consistent.
- L6 — the audit framework's articulation-hygiene check passes
  (no register prohibitions triggered).

This is the strongest aggregate verdict ATS-V issues. The phrase
"L4-load-bearing" is shorthand: L0..L3 are *implied* (they are
prerequisites), L4 is the *aggregate*, and L5..L6 are
*self-checks*.

## 10. Why a stratification at all?

A natural objection: *"if every layer asks the same three
questions, why not flatten?"* The reasons:

1. **Different verdicts at different layers.** A function may be
   sound at L0 (the body is correct) but unsound at L1 (the
   proof shipped is buggy). Flattening would lose the
   distinction.
2. **Different gates at different layers.** Each gate's input
   and output is layer-specific. A flattened frame would not
   know how to combine `kernel-recheck` (L1) with
   `arch-discharges` (L4).
3. **Different responsibility at different layers.** L0 is the
   developer's responsibility; L1 is the verifier's; L3 is the
   meta-theory's; L6 is the framework designer's. Flattening
   would conflate responsibilities.

The seven-layer stratification is the *minimal* number of layers
that keeps every axis-of-responsibility distinct. Adding a
layer is permitted; merging two layers is a category error.

## 11. Mapping to the universal CVE-architecture stratification

> **Section declarations.** `FormalAnchoring`:
> `CurryHowardLawvere` — the universal stratification is
> framed in CHL-categorical terms. `Substrate`:
> `AnalyticDecompositional`. `Lifecycle`: `[D]` Definition
> (defines the mapping; not a theorem).

Verum's seven layers above are an **operational refinement** of
the universal seven-layer CVE-architecture stratification. The
universal stratification, applicable to every knowledge system
(mathematical theories, scientific corpora, legal systems,
neural architectures), distinguishes seven object classes by
abstraction level:

| Universal CVE layer | Object class | What lives here |
|---------------------|--------------|-----------------|
| **CVE-L0 — Object** | concrete claims with subject content | theorems, definitions, executable programs with checked specifications, physical models with stated predictions, working laws, trained models with fixed weights |
| **CVE-L1 — Meta-language** | claims ABOUT L0 objects | metatheorems (Gödel, Tarski, Lawvere), classifications of formal systems, no-go theorems, theorems on the limits of algorithmic learning |
| **CVE-L2 — Methodological** | protocols of producing L0/L1 | the [seven-symbol status taxonomy](./seven-symbols.md), articulation hygiene, declared-purpose discipline, code-review protocols, peer-review standards |
| **CVE-L3 — Meta-methodological** | discipline of building L2 | architecture-revision procedure, the chronicle of revisions, anticipatory specifications for not-yet-existing disciplines |
| **CVE-L4 — Architectural** | the formal anchoring of CVE itself | [Curry-Howard-Lawvere](./overview.md#anchoring-disclosure), Yoneda-invariance, parallel domain anchorings (automata theory, control theory, distributed protocols, functional systems, institutional design) |
| **CVE-L5 — Structural** | corpus-level invariants | regenerability, antifragility, minimality, stratified access, the audit chronicle as a corpus property |
| **CVE-L6 — Anti-philosophical** | structural register prohibitions | onto-declarations, traditional appeals as justifications, phenomenological appeals, authoritative appeals, interpretative gestures (see [articulation hygiene](./articulation-hygiene.md)) |

The two stratifications are **compatible refinements** of the
same architectural law:

| Verum layer | Universal CVE layer it operates inside | Relationship |
|-------------|----------------------------------------|--------------|
| Verum L0 (the object — code, value, theorem statement) | CVE-L0 | concrete-claim refinement |
| Verum L1 (the proof term / SMT certificate) | CVE-L0 | concrete-claim refinement (the proof is also an object) |
| Verum L2 (the proof method — tactic / SMT call) | CVE-L2 (methodological) | Verum's tactic IS a methodological protocol |
| Verum L3 (the meta-theory) | CVE-L4 (architectural) | the meta-theory is part of the formal anchoring |
| Verum L4 (the architectural shape) | CVE-L4 (architectural) | name match: Verum's shape is the architectural law operationalised |
| Verum L5 (the audit report) | CVE-L5 (structural) | the report IS a corpus-level structural artefact |
| Verum L6 (the frame itself) | CVE-L6 (anti-philosophical) | name match: self-application of CVE to itself |

The **load-bearing alignment** is at L4: both stratifications
agree that L4 is the *architectural shape* layer, and Verum's
audit gates report `verdict: load-bearing` at L4 when the
architectural commitments meet the body. Discrepancies elsewhere
are presentation conventions, not architectural disagreement.

For most Verum-engineering work the local stratification is the
operational vocabulary; for cross-domain CVE-architecture work
(e.g., applying CVE to a non-Verum knowledge system) the
universal mapping is canonical.

## 12. ATS-V's own L0..L7 sub-layers — clarification

ATS-V uses *internal sub-layers* L0..L7 (e.g., L0 architectural
primitives, L1 cog-level annotations, L2 cross-cog checks, L3
catalog patterns, ...) to organise its own implementation. These
sub-layers live *entirely within* CVE-L4 — they are
implementation-level granularity for the architectural-shape
layer.

The naming clash is unfortunate; the disambiguation rule is:

- When discussing the universal CVE frame, prefix with `CVE-Ln`:
  CVE-L0, CVE-L4, CVE-L6.
- When discussing Verum's verification stack (this page's
  primary stratification), prefix with `Verum-Ln`: Verum-L0,
  Verum-L4 (matches CVE-L4 by name).
- When discussing ATS-V's internal organisation (sub-layers
  inside Verum-L4 = CVE-L4), prefix with `ATS-V-Ln`: ATS-V-L0,
  ATS-V-L4.

Documentation that mixes the conventions without prefix is a
candidate for the L6 articulation-hygiene check —
[`AP-036 ObserverImpersonation`](../anti-patterns/articulation.md#ap-036)
in the MTAC band.

## 13. Cross-references

Relation markers per the convention introduced in
[three-axes §5](./three-axes.md#5-cross-references):

- *frame:* [CVE overview](./overview.md) — universal CVE
  architectural law.
- *frame:* [Three axes](./three-axes.md) — C/V/E axes that
  this stratification organises.
- *refinement:* [Seven configurations](./seven-configurations.md)
  — truth-table specialising the same axes.
- *refinement:* [Seven canonical symbols](./seven-symbols.md)
  — glyph taxonomy specialising the same axes.
- *specialisation:* [Articulation hygiene](./articulation-hygiene.md)
  — CVE-L6 register-prohibition discipline at the topmost
  layer.
- *operationalisation:* [Audit protocol](../audit-protocol.md)
  — gate runner combining verdicts across layers.
