---
sidebar_position: 3
title: "CVE — seven configurations"
description: "The truth-table over the C/V/E axes that produces exactly the seven canonical CVE symbols. Why no other cells map to stable statuses."
slug: /architecture-types/cve/seven-configurations
---

# CVE — seven configurations

## Document CVE self-application {#document-cve-declarations}

```verum
ShapeDeclarations {
    purpose: Some(Purpose {
        role: "C/V/E truth-table specification + deciding rule + universal-removal predicate",
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

`Lifecycle`: `[T]` Theorem of seven-cell closure — the
27-cell configuration space $\mathcal{M}^3$ where
$\mathcal{M} = \{\checkmark, \blacklozenge, \times\}$ collapses
under the migration map to exactly the seven productive
configurations of §1 plus `[✗]` Retracted. Constructive
witness: §9 below enumerates all 27 cells with explicit
migration target. Verifier: cross-side pin
`pin_seven_configurations_closure_exhaustive` re-runs the
case analysis at build time. Executable: the witness function
`seven_configurations_closure_witness(c, v, e)` in
`core/architecture/types.vr` returns the canonical productive
glyph for any input cell.

The three axes C / V / E each take three values (present /
partial-or-conditional / absent), producing a 27-cell space.
Of those 27 cells, only **seven are productive** in practice —
the rest are either incoherent (a verifiable claim with no
constructor is degenerate) or unstable (an executable claim
that has no constructor is operationally a stub).

The seven productive cells are the seven canonical CVE
configurations. This page lays out the truth-table semantics,
shows why the non-productive cells are filtered, and gives a
worked example for each productive cell.

## 1. The seven productive configurations

| # | C | V | E | Glyph | Status |
|---|---|---|---|-------|--------|
| 1 | present | present | present | `[T]` | Theorem |
| 2 | present | trivial | present | `[D]` | Definition |
| 3 | conditional | conditional | conditional | `[C]` | Conditional |
| 4 | present | external | present | `[P]` | Postulate |
| 5 | partial | absent | absent | `[H]` | Hypothesis |
| 6 | absent | absent | absent | `[I]` | Interpretation |
| 7 | n/a | n/a | n/a | `[✗]` | Retracted |

Each productive cell answers a distinct *engineering question*.

## 2. Cell 1 — C∧V∧E = `[T]` Theorem

**Question:** *is this artefact load-bearing?*

A `[T]` Theorem is the strongest possible status. All three
axes are positive: a constructor exists, a check exists, and the
artefact reduces to executable code. Theorem-class artefacts may
be cited from any context and may be extracted to any target.

**Worked example:** `core.collections.list_reverse` proves that
reversing a list preserves length and inverts order, and the
function compiles to a runnable AOT binary that satisfies both
properties.

## 3. Cell 2 — C∧trivial(V)∧E = `[D]` Definition

**Question:** *is this a boundary or a theorem?*

A `[D]` Definition establishes a boundary by fiat. There is no
theorem to prove (the V axis is *trivial* — the artefact is its
own check). The constructor is present (the definition itself).
The E axis is present in the trivial sense (definitions reduce
to themselves).

**Worked example:** `type Probability is Float { 0.0 <= self &&
self <= 1.0 };`. The refinement establishes the boundary; no
theorem is being asserted at this layer.

The "trivial" cell on the V axis is what distinguishes
definitions from theorems. A definition's verifier is "the
definition matches its declared shape" — a tautology. A
theorem's verifier is a non-trivial decision procedure.

## 4. Cell 3 — cond(C)∧cond(V)∧cond(E) = `[C]` Conditional

**Question:** *under what assumptions does the artefact hold?*

A `[C]` Conditional is `[T]`-class *relative to listed
assumptions*. Outside the assumptions, the artefact is undefined.
Inside, it reads as a `[T]` Theorem.

**Worked example:** `fn realpath(path: &Text) -> Result<Text,
Error>` is a Theorem-class artefact *conditional on* the host OS
satisfying POSIX `realpath(3)` semantics. Outside POSIX, the
artefact is undefined.

The audit chronicle records the conditions verbatim, so an
auditor verifying the conditions externally can lift the cog's
verdict from `[C]` to `[T]` for that audit's specific scope.

## 5. Cell 4 — C∧external(V)∧E = `[P]` Postulate

**Question:** *is this internally proved or externally cited?*

A `[P]` Postulate has the C and E axes positive (a constructor
exists, the artefact runs) but the V axis is *external* — the
verification is delegated to a trusted external base via
citation.

**Worked example:** the trusted-base kernel rule `K-Universe-Ascent`
is a `[P]` Postulate cited under `@framework(verum_internal_meta,
"K-Universe-Ascent")`. The verification is *external* in the
sense that the rule's soundness is admitted from the meta-theory
rather than internally re-derived.

The external/internal V distinction is real. A claim verified
*internally* by an SMT cert replay is `[T]`; a claim verified
*externally* by citation is `[P]`. The two have different audit
chronicle treatments.

## 6. Cell 5 — partial(C)∧absent(V)∧absent(E) = `[H]` Hypothesis

**Question:** *is this speculation, draft, or production?*

A `[H]` Hypothesis has only *partial* C — the artefact is
*formulated* but not realised. The V and E axes are absent. A
Hypothesis MUST carry a maturation plan
([`@plan(...)`](../primitives/lifecycle.md#46-hypothesisconfidence-confidencelevel--h))
or the cog triggers
[`AP-034 HypothesisWithoutMaturationPlan`](../anti-patterns/articulation.md#ap-034).

**Worked example:** a research cog `my_app.experimental.zk_proof`
formulates a future zero-knowledge-proof feature but has no
implementation, no tests, and no proof. The cog is `[H]
Hypothesis(High)` with a `@plan(target: "v0.5", ...)`.

## 7. Cell 6 — absent(C)∧absent(V)∧absent(E) = `[I]` Interpretation

**Question:** *is this anything more than prose?*

A `[I]` Interpretation has *all three axes absent*. It is descriptive
prose only — written down, but not realised, checked, or extracted.

`[I]` Interpretations are **transitional only**. Mature corpora
contain zero `[I]` entries; in `strict: true` mode, declaring a
cog `[I]` triggers
[`AP-035 InterpretationInMatureCorpus`](../anti-patterns/articulation.md#ap-035).

**Why the status exists at all:** during exploration, some
artefacts are written down before any of C/V/E is realised.
Naming the status `[I]` rather than "todo" or "draft" forces
explicit transition rather than silent decay.

## 8. Cell 7 — n/a = `[✗]` Retracted

**Question:** *what was tried and rejected?*

A `[✗]` Retracted is not a CVE configuration; it is the
*negation* of the configuration space. The artefact has been
deliberately withdrawn — refuted, deprecated, scope-removed.
The record is preserved as a *negative example* in the audit
chronicle.

Citing a `[✗]` cog is
[`AP-033 RetractedCitationUse`](../anti-patterns/articulation.md#ap-033).

**Worked example:** a cog implementing legacy DES encryption is
retracted with reason "weak primitive — deprecated by NIST SP
800-131A" and replacement `my_app.crypto.aes256_gcm`.

## 9. Closure theorem — exhaustive case analysis {#closure-theorem}

> **Theorem (CVE seven-cell closure).** Let
> $\mathcal{M} = \{\checkmark, \blacklozenge, \times\}$ denote
> the per-axis modes (positive, partial, absent). The
> configuration space $\mathcal{M}^3$ has 27 cells. Every cell
> migrates uniquely to one of the seven productive
> configurations of §1, plus a special-case eighth glyph
> `[✗]` Retracted that lies outside $\mathcal{M}^3$ by being a
> meta-state (deliberate withdrawal).

The proof is by exhaustive case analysis on $\mathcal{M}^3$.
Case modes:
- $\checkmark$ — axis positive (constructor present, verifier
  present, executable);
- $\blacklozenge$ — axis partial (formulated witness, conditional
  verification, external delegation, or trivial-by-definition);
- $\times$ — axis absent.

The migration map is operational: each cell either *coincides*
with a productive cell or *migrates* to one when the artefact
is matured (per the
[deciding rule §10](#deciding-rule)).

| # | C | V | E | Migrates to | Reason |
|---|---|---|---|-------------|--------|
| 1 | $\checkmark$ | $\checkmark$ | $\checkmark$ | `[T]` Theorem | full closure — coincides with cell 1 of §1 |
| 2 | $\checkmark$ | $\checkmark$ | $\blacklozenge$ | `[C]` Conditional | partial E lifts to E-conditional under stated environment, the trio reads as $\blacklozenge \blacklozenge \blacklozenge$ |
| 3 | $\checkmark$ | $\checkmark$ | $\times$ | `[C]` Conditional with E="not extractable" | pencil-and-paper proof; condition records the missing extractor |
| 4 | $\checkmark$ | $\blacklozenge$ | $\checkmark$ | `[D]` Definition (V trivial) or `[P]` Postulate (V external) or `[C]` Conditional (V conditional) | partial V triages by the kind of partiality — see the V-partial sub-classification below |
| 5 | $\checkmark$ | $\blacklozenge$ | $\blacklozenge$ | `[C]` Conditional | both V and E partial; the conjunction reads as conditional closure |
| 6 | $\checkmark$ | $\blacklozenge$ | $\times$ | `[C]` Conditional with E-condition | dropped to conditional; the conditions record the V-partial and E-absent state |
| 7 | $\checkmark$ | $\times$ | $\checkmark$ | `[C]` with V="TODO: prove" *(transitional only)* or downgrade to `[H]` Hypothesis with `@plan(...)` | code that runs but has no spec; transitional cell, must mature into `[T]` or be downgraded |
| 8 | $\checkmark$ | $\times$ | $\blacklozenge$ | `[H]` Hypothesis | constructor present, no V, partial E — speculative implementation with no spec |
| 9 | $\checkmark$ | $\times$ | $\times$ | `[H]` Hypothesis | constructor without V or E — bare formulation that compiles |
| 10 | $\blacklozenge$ | $\checkmark$ | $\checkmark$ | `[C]` Conditional | partial C reads as conditional construction (typed schema or bounded reference impl) |
| 11 | $\blacklozenge$ | $\checkmark$ | $\blacklozenge$ | `[C]` Conditional | all three axes partial — canonical conditional |
| 12 | $\blacklozenge$ | $\checkmark$ | $\times$ | `[C]` Conditional | partial C, present V, absent E — proof with no execution |
| 13 | $\blacklozenge$ | $\blacklozenge$ | $\checkmark$ | `[C]` Conditional | partial C and V, present E — running prototype |
| 14 | $\blacklozenge$ | $\blacklozenge$ | $\blacklozenge$ | `[C]` Conditional | all-partial = canonical conditional state |
| 15 | $\blacklozenge$ | $\blacklozenge$ | $\times$ | `[H]` Hypothesis | partial C+V, no E — the artefact is a *bet* with maturation plan |
| 16 | $\blacklozenge$ | $\times$ | $\checkmark$ | `[H]` Hypothesis | partial C, no V, present E — running prototype without spec, bet with plan |
| 17 | $\blacklozenge$ | $\times$ | $\blacklozenge$ | `[H]` Hypothesis | partial C, no V, partial E — canonical hypothesis state |
| 18 | $\blacklozenge$ | $\times$ | $\times$ | `[H]` Hypothesis | partial C alone — canonical hypothesis state, coincides with cell 5 of §1 |
| 19 | $\times$ | $\checkmark$ | $\checkmark$ | `[I]` Interpretation *(transitional only)* — must mature: add C-witness or downgrade | V and E without C is operationally a runtime assertion (`@verify(runtime)`) that does not produce a witness; the assertion is a degenerate cell on the path to `[T]` or removal |
| 20 | $\times$ | $\checkmark$ | $\blacklozenge$ | `[I]` *(transitional only)* | same as cell 19, with weaker E — must mature or be removed |
| 21 | $\times$ | $\checkmark$ | $\times$ | `[I]` *(transitional only)* | V alone is empty operationally; transitional |
| 22 | $\times$ | $\blacklozenge$ | $\checkmark$ | `[I]` *(transitional only)* | E without C is a black-box artefact; must mature into `[H]` (with C-plan) or be removed |
| 23 | $\times$ | $\blacklozenge$ | $\blacklozenge$ | `[I]` *(transitional only)* | partial V and E without C — descriptive only |
| 24 | $\times$ | $\blacklozenge$ | $\times$ | `[I]` *(transitional only)* | partial V alone — descriptive |
| 25 | $\times$ | $\times$ | $\checkmark$ | `[I]` *(transitional only)* | running code without spec or witness — must mature into `[H]` with `@plan(...)` |
| 26 | $\times$ | $\times$ | $\blacklozenge$ | `[I]` *(transitional only)* | partial E alone — descriptive |
| 27 | $\times$ | $\times$ | $\times$ | `[I]` Interpretation | empty cell — coincides with cell 6 of §1 |
| ⊥ | n/a | n/a | n/a | `[✗]` Retracted | meta-state outside $\mathcal{M}^3$: deliberate withdrawal; record preserved as negative example |

**V-partial sub-classification (used in cell 4):**

| V-partial mode | Migrates to |
|----------------|-------------|
| `trivial` (definition by fiat) | `[D]` Definition (cell 2 of §1) |
| `external` (delegated to a trusted citation) | `[P]` Postulate (cell 4 of §1) |
| `conditional` (under stated assumptions) | `[C]` Conditional (cell 3 of §1) |

**Closure (proof end).** Every cell of $\mathcal{M}^3$ has been
assigned a unique productive migration target (column "Migrates
to"). Cells coinciding with productive ones are stable
attractors (cells 1, 3, 5, 9, 14, 17, 18, 27 of the case
analysis); the remaining 19 cells are *transitional* and the
deciding rule (§10) drives them either to a productive cell
(via Action A — replenishment) or to retracted state (via
Action C — deletion). The seven configurations of §1 plus
`[✗]` are the **stable attractors** of the entire
configuration space. ∎

The Verum-side closure witness is the function
`seven_configurations_closure_witness(c, v, e)` declared in
`core/architecture/types.vr` (returns the canonical
`Lifecycle` glyph for any input cell), cross-side mirrored at
`crates/verum_kernel/src/arch.rs::seven_configurations_closure_witness`,
pin-tested by `pin_seven_configurations_closure_exhaustive` in
`crates/verum_kernel/tests/k_arch_v_alignment.rs`.

## 10. The deciding rule — three actions {#deciding-rule}

When CVE-closure is **violated relative to the artefact's
declared purpose** (see
[audit termination](./overview.md#purpose-disclosure)) the
audit applies one of three deciding actions. If the declared
purpose is satisfied and there is no defect relative to it, no
action is applied — the artefact is preserved as-is and the
audit closes (the [fourth resolution](./overview.md#purpose-disclosure):
preservation without change).

### Action A — Replenishment of the missing component

If the missing component can be built in reasonable time, it
is built.

- **Mathematics example.** *"There exists a fixed point of the
  operator $\mathcal{T}$"* with contracting $\mathcal{T}$
  satisfies axis V (Banach's theorem) but not axis C (no
  explicit witness). Replenish: state the iterative procedure
  $x_{n+1} = \mathcal{T}(x_n)$ and prove convergence; the limit
  point is the constructive witness, and axis E follows
  automatically. Configuration V → CVE⁺.
- **Software engineering example.** A specification asserts an
  API without a reference implementation: axis C is violated.
  Replenish: write a reference implementation, validate via the
  test battery. Configuration V → CVE⁺.
- **Legal system example.** A statute declares a right without a
  procedure of realisation: axis E is violated. Replenish:
  develop an application procedure, ratify via subordinate
  legislation. Configuration CV → CVE⁺.

### Action B — Status downgrade

If replenishment is not possible in reasonable time, the
artefact's status is downgraded to one that reflects the actual
configuration. A hypothesis without proof or counterexample
goes to status [H] (or its domain analogue: a backlog item, an
open scientific question, a pending bill).

### Action C — Deletion

If neither replenishment nor downgrade yields a sensible
outcome, the artefact is deleted. The canonical case: a
metaphysical assertion *"X is Y"* without specifying the
category in which the identification occurs and without a
formal functor between the concepts has no CVE configuration.
Delete.

### Universal removal of unclear-status assertions

Every CVE-L5 corpus claiming `[T]`-mature aggregate status
eliminates assertions **without a definite CVE-L0 configuration**.
The mechanism specialises by domain: in mathematical theory,
CVE-L0 assertions of status `[I]` are removed before the canonical
edition; in software engineering, *"TODO: figure out"* comments
are cleared before release; in legal systems, norms lacking a
definite application procedure are removed at codification; in
standards, vague phrasings are removed at finalisation. The
CVE-L5 maturity predicate is: **every CVE-L0 artefact in the
corpus has a precisely determined CVE configuration, fixed by an
explicit status from the
[seven-symbol taxonomy](./seven-symbols.md)**.

### Solving rule, in tabular form

Per the audit protocol's [§14.2 deciding table](../audit-protocol.md):

| Configuration of K₁/V₁/E₁ answers | Action |
|------------------------------------|--------|
| All three "yes" | CVE-closed, mature status, preserve |
| Two "yes" + one "no" or "partial" | Action A (replenish) or Action B (downgrade) |
| One "yes" + two "no" or "partial" | Action B (downgrade to hypothesis) or Action C (delete) |
| All three "no" | Action C (delete) |

The deciding rule is uniform across domains; only the
"yes" / "partial" / "no" criteria for each axis vary by domain.

## 11. The truth-table is *closed*

Adding a new productive configuration would require either a new
combination of C/V/E modes or a new mode on one of the axes
(beyond present / partial / conditional / external / absent).
Verum's design constraint is that the seven configurations are
*closed*: no new variant is admitted without a corresponding
extension to the C/V/E modes.

This closure is the *frame's C-positiveness at L6* — the CVE
framework, asked of itself, answers "the seven canonical
configurations are exactly the productive cells of the truth
table". A new configuration would falsify the answer.

## 12. Cross-references

Relation markers per the convention introduced in
[three-axes §5](./three-axes.md#5-cross-references):

- *frame:* [CVE overview](./overview.md) — the universal frame.
- *frame:* [Three axes](./three-axes.md) — the C / V / E
  dimensions whose truth-table this page enumerates.
- *specialisation:* [Seven canonical symbols](./seven-symbols.md)
  — glyph reference for the seven cells.
- *refinement:* [Seven layers](./seven-layers.md) — layered
  application of CVE through the same configurations.
- *refinement:* [Articulation hygiene](./articulation-hygiene.md)
  — CVE-L6 register-prohibition discipline.
- *operationalisation:* [Lifecycle primitive](../primitives/lifecycle.md)
  — the ATS-V primitive that carries the seven glyphs.
