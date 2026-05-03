---
sidebar_position: 3
title: "CVE — seven configurations"
description: "The truth-table over the К/В/И axes that produces exactly the seven canonical CVE symbols. Why no other cells map to stable statuses."
slug: /architecture-types/cve/seven-configurations
---

# CVE — seven configurations

The three axes К / В / И each take three values (present /
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

| # | К | В | И | Glyph | Status |
|---|---|---|---|-------|--------|
| 1 | present | present | present | `[Т]` | Theorem |
| 2 | present | trivial | present | `[О]` | Definition |
| 3 | conditional | conditional | conditional | `[С]` | Conditional |
| 4 | present | external | present | `[П]` | Postulate |
| 5 | partial | absent | absent | `[Г]` | Hypothesis |
| 6 | absent | absent | absent | `[И]` | Interpretation |
| 7 | n/a | n/a | n/a | `[✗]` | Retracted |

Each productive cell answers a distinct *engineering question*.

## 2. Cell 1 — К∧В∧И = `[Т]` Theorem

**Question:** *is this artefact load-bearing?*

A `[Т]` Theorem is the strongest possible status. All three
axes are positive: a constructor exists, a check exists, and the
artefact reduces to executable code. Theorem-class artefacts may
be cited from any context and may be extracted to any target.

**Worked example:** `core.collections.list_reverse` proves that
reversing a list preserves length and inverts order, and the
function compiles to a runnable AOT binary that satisfies both
properties.

## 3. Cell 2 — К∧trivial(В)∧И = `[О]` Definition

**Question:** *is this a boundary or a theorem?*

A `[О]` Definition establishes a boundary by fiat. There is no
theorem to prove (the В axis is *trivial* — the artefact is its
own check). The constructor is present (the definition itself).
The И axis is present in the trivial sense (definitions reduce
to themselves).

**Worked example:** `type Probability is Float { 0.0 <= self &&
self <= 1.0 };`. The refinement establishes the boundary; no
theorem is being asserted at this layer.

The "trivial" cell on the В axis is what distinguishes
definitions from theorems. A definition's verifier is "the
definition matches its declared shape" — a tautology. A
theorem's verifier is a non-trivial decision procedure.

## 4. Cell 3 — cond(К)∧cond(В)∧cond(И) = `[С]` Conditional

**Question:** *under what assumptions does the artefact hold?*

A `[С]` Conditional is `[Т]`-class *relative to listed
assumptions*. Outside the assumptions, the artefact is undefined.
Inside, it reads as a `[Т]` Theorem.

**Worked example:** `fn realpath(path: &Text) -> Result<Text,
Error>` is a Theorem-class artefact *conditional on* the host OS
satisfying POSIX `realpath(3)` semantics. Outside POSIX, the
artefact is undefined.

The audit chronicle records the conditions verbatim, so an
auditor verifying the conditions externally can lift the cog's
verdict from `[С]` to `[Т]` for that audit's specific scope.

## 5. Cell 4 — К∧external(В)∧И = `[П]` Postulate

**Question:** *is this internally proved or externally cited?*

A `[П]` Postulate has the К and И axes positive (a constructor
exists, the artefact runs) but the В axis is *external* — the
verification is delegated to a trusted external base via
citation.

**Worked example:** the trusted-base kernel rule `K-Universe-Ascent`
is a `[П]` Postulate cited under `@framework(verum_internal_meta,
"K-Universe-Ascent")`. The verification is *external* in the
sense that the rule's soundness is admitted from the meta-theory
rather than internally re-derived.

The external/internal В distinction is real. A claim verified
*internally* by an SMT cert replay is `[Т]`; a claim verified
*externally* by citation is `[П]`. The two have different audit
chronicle treatments.

## 6. Cell 5 — partial(К)∧absent(В)∧absent(И) = `[Г]` Hypothesis

**Question:** *is this speculation, draft, or production?*

A `[Г]` Hypothesis has only *partial* К — the artefact is
*formulated* but not realised. The В and И axes are absent. A
Hypothesis MUST carry a maturation plan
([`@plan(...)`](../primitives/lifecycle.md#46-hypothesisconfidence-confidencelevel--г))
or the cog triggers
[`AP-016 HypothesisWithoutMaturationPlan`](../anti-patterns/articulation.md#ap-016).

**Worked example:** a research cog `my_app.experimental.zk_proof`
formulates a future zero-knowledge-proof feature but has no
implementation, no tests, and no proof. The cog is `[Г]
Hypothesis(High)` with a `@plan(target: "v0.5", ...)`.

## 7. Cell 6 — absent(К)∧absent(В)∧absent(И) = `[И]` Interpretation

**Question:** *is this anything more than prose?*

A `[И]` Interpretation has *all three axes absent*. It is descriptive
prose only — written down, but not realised, checked, or extracted.

`[И]` Interpretations are **transitional only**. Mature corpora
contain zero `[И]` entries; in `strict: true` mode, declaring a
cog `[И]` triggers
[`AP-017 InterpretationInMatureCorpus`](../anti-patterns/articulation.md#ap-017).

**Why the status exists at all:** during exploration, some
artefacts are written down before any of К/В/И is realised.
Naming the status `[И]` rather than "todo" or "draft" forces
explicit transition rather than silent decay.

## 8. Cell 7 — n/a = `[✗]` Retracted

**Question:** *what was tried and rejected?*

A `[✗]` Retracted is not a CVE configuration; it is the
*negation* of the configuration space. The artefact has been
deliberately withdrawn — refuted, deprecated, scope-removed.
The record is preserved as a *negative example* in the audit
chronicle.

Citing a `[✗]` cog is
[`AP-013 RetractedCitationUse`](../anti-patterns/articulation.md#ap-013).

**Worked example:** a cog implementing legacy DES encryption is
retracted with reason "weak primitive — deprecated by NIST SP
800-131A" and replacement `my_app.crypto.aes256_gcm`.

## 9. The non-productive cells

The 27-cell К/В/И space minus the seven productive cells is 20
cells. Why are they not in the canonical taxonomy?

- **Verifiable but not constructive (К-absent ∧ В-present).** A
  decision procedure with no witness construction. Operationally
  this is just a runtime assertion — useful but degenerate; in
  Verum it is rendered as `@verify(runtime)` rather than a
  Lifecycle status.
- **Executable but not verifiable (И-present ∧ В-absent).** Code
  that runs but has no spec — typical "TODO: prove later". In
  Verum this is rendered as a function annotated `@verify(static)`
  inside an otherwise `[О]` Definition cog.
- **Verifiable but not executable (В-present ∧ И-absent).** A
  pencil-and-paper proof in the corpus without extraction. This
  is rare in Verum because the extraction pipeline is integrated;
  when it occurs, the cog is rendered as `[С]` with a condition
  "this proof is not extractable, see `verum extract --target=…`".
- **Constructive but neither verifiable nor executable.** A
  pencil-and-paper construction documented as an attribute on a
  `[Г]` Hypothesis. The cog itself remains `[Г]`.

In every non-productive cell, the artefact migrates to one of
the seven canonical configurations within the project's
lifetime. The seven cells are the *stable attractors* of the
configuration space.

## 10. The truth-table is *closed*

Adding a new productive configuration would require either a new
combination of К/В/И modes or a new mode on one of the axes
(beyond present / partial / conditional / external / absent).
Verum's design constraint is that the seven configurations are
*closed*: no new variant is admitted without a corresponding
extension to the К/В/И modes.

This closure is the *frame's К-positiveness at L6* — the CVE
framework, asked of itself, answers "the seven canonical
configurations are exactly the productive cells of the truth
table". A new configuration would falsify the answer.

## 11. Cross-references

- [CVE overview](./overview.md) — the universal frame.
- [Three axes](./three-axes.md) — the К / В / И dimensions.
- [Seven canonical symbols](./seven-symbols.md) — the glyph
  reference.
- [Seven layers](./seven-layers.md) — the layered application.
- [Articulation hygiene](./articulation-hygiene.md) — CVE-L6
  register-prohibition discipline.
- [Lifecycle primitive](../primitives/lifecycle.md) — the ATS-V
  primitive that carries the seven glyphs.
