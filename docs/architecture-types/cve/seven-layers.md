---
sidebar_position: 5
title: "CVE — seven layers (L0 .. L6)"
description: "The same three CVE questions yield different answers at object, proof, method, foundation, shape, communication, and frame layers. The seven-layer stratification organises Verum's audit gates."
slug: /architecture-types/cve/seven-layers
---

# CVE — seven layers (L0 .. L6)

The CVE frame asks three questions: *constructive? verifiable?
executable?* Asking these questions of *the same artefact* at
different layers of abstraction yields different answers — and
the layers must be kept distinct to avoid category errors.

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
runs the 32-pattern catalog against every annotated cog;
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

## 8. L6 — the frame itself

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

## 11. ATS-V's own L0..L7 sub-layers — clarification

ATS-V uses *internal sub-layers* L0..L7 (e.g., L0 architectural
primitives, L1 cog-level annotations, L2 cross-cog checks, L3
catalog patterns, ...) to organise its own implementation. These
sub-layers live *entirely within* CVE's layer **L4**.

The naming clash is unfortunate; the disambiguation rule is:

- When discussing the CVE frame, prefix with `CVE-Ln`: CVE-L0,
  CVE-L4, CVE-L6.
- When discussing ATS-V's internal organisation, prefix with
  `ATS-V-Ln`: ATS-V-L0, ATS-V-L4.

Documentation that mixes the two conventions without prefix is
a candidate for the L6 articulation-hygiene check —
[`AP-029 ObserverImpersonation`](../anti-patterns/mtac.md#ap-029)
in the MTAC band.

## 12. Cross-references

- [CVE overview](./overview.md) — the universal frame.
- [Three axes](./three-axes.md) — C / V / E in detail.
- [Seven configurations](./seven-configurations.md) — the
  truth-table.
- [Seven canonical symbols](./seven-symbols.md) — the glyph
  taxonomy.
- [Articulation hygiene](./articulation-hygiene.md) — CVE-L6
  register-prohibition discipline.
- [Audit protocol](../audit-protocol.md) — the gate runner that
  combines verdicts across layers.
