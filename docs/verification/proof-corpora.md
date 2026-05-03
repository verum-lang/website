---
sidebar_position: 8
title: Proof Corpora
description: How large-scale proof corpora are structured on Verum — layout, stratification, status tracking, release-gate CI.
---

# Proof corpora

Verum's verification infrastructure — the layered
`@verify(...)` dispatch, `@framework(name, "citation")`
axiom attribution, the LCF-style `verum_kernel`,
`verum audit --framework-axioms`, and `verum export
--to {dedukti, coq, lean, metamath}` — is designed to
support **any** large-scale proof corpus.

This page describes what a proof corpus on Verum looks
like: its cog layout, the way it stratifies theorems by
trust, the status-tracking map the CI gate enforces, and
the publication workflow that turns a corpus into a
cross-tool-verifiable artefact.

## What a proof corpus is

A proof corpus is an external project — a cog in Verum's
package registry — that:

1. Declares a collection of theorems, lemmas, and
   corollaries spanning a defined mathematical or
   scientific subject.
2. Stratifies its theorems by `@framework(name, …)` tags
   so the trusted boundary is enumerable via
   `verum audit --framework-axioms`.
3. Opts into the `@verify(certified)` strategy for
   release-gate theorems and lower strategies (Fast /
   Static / Formal / Thorough) for internal lemmas.
4. Emits kernel-replayed certificates that cross-check
   against at least one external proof assistant (Lean /
   Coq / Dedukti / Metamath).

A corpus is not a stdlib extension — it's a *consumer* of
Verum. Verum's stdlib provides the primitives
(`core.math`, `core.theory_interop`, `core.proof.tactics`,
`core.verify`); corpora assemble them into
discipline-specific theorem libraries.

## Typical layout

A Verum proof corpus is an ordinary cog with extra
organisational conventions:

- a `verum.toml` with a research-profile manifest
  (timeouts, `@verify` defaults, allowed framework-axiom
  set);
- `src/` split into layered subdirectories, from
  foundations toward increasingly stratified content.
  Typical layer names used by physical / categorical
  corpora:
    - **foundations** — the corpus's atomic types,
      invariants, balance equations;
    - **combinatorial** — enumerative or finite-structure
      content that underwrites the analytical layer;
    - **analytical** — exponents, asymptotics,
      convergence (Banach or stronger);
    - **statistical** — entropy, metric, information-
      theoretic content;
    - **categorical** — Grothendieck site, cohesive
      modalities, ∞-topos closure (framework-conditional);
    - **hott** — Lawvere fixed-point–style self-reference,
      path-valued theorems, HoTT-specific identity
      reasoning;
    - **core_theorems** — top-level results the corpus
      is organised around;
    - **fundamental_closures** — the release-gated
      headline theorems that consumers cite downstream;
- a `tests/` tree with regression + numerical-reference
  cross-checks;
- a `certificates/` tree with `coq/`, `lean/`,
  `dedukti/`, and `metamath/` sub-directories populated
  by `verum export --to {coq, lean, dedukti, metamath}`;
- a `theorem_index.md` auto-regenerated status map —
  every theorem with its rigour tag and framework-axiom
  dependencies.

Any corpus that follows this layout qualifies for the
release-gate CI treatment described below.

## Stratification

Corpora that mix rigorous-core and framework-conditional
content stratify theorems into four tiers:

| Stratum                       | Description |
|-------------------------------|-------------|
| **Rigorous core**             | Provable from first principles inside Verum's dependent / refinement / cubical type theory. The highest-rigour tier; no `@framework` tags on the theorem itself. |
| **Framework-conditional**     | Relies on postulated results from external mathematical frameworks (e.g. Lurie HTT, Schreiber DCCT, Connes reconstruction, Petz classification, Arnold–Mather catastrophe, Baez–Dolan coherence). Every such dependency is declared via `@framework(name, "citation")`. |
| **Stratified / interpretive** | Mixed-rigour content — partially rigorous, partially interpretive; deferred to future formalisation. |
| **Miscellaneous**             | Historical notes, corollaries, definitional unpackings. |

The `@framework` markers make the strata machine-checkable:
`verum audit --framework-axioms` enumerates every
framework-conditional theorem in the corpus along with its
citations.

## Why every Verum feature matters for a corpus

| Verum feature           | Corpus use-site |
|-------------------------|-----------------|
| **Refinement types**    | `type FiniteDim is Dimension { self == 7 };` pins a domain constraint at the type level — SMT discharges compatibility at every call site without run-time checks. |
| **Dependent Σ / Π**     | Length-indexed arrays (e.g. of Kraus operators); Π-types for tower constructions; Σ-types for spectral-triple data. |
| **Cubical HoTT**        | Path-valued theorems (`Path<A>(ρ*, φ(ρ*))` is computational, not axiomatic). Hard-problem meta-arguments (Gödel-Lawvere positivity) require path types. |
| **`@framework(...)`**   | Every citation from Lurie / Schreiber / Connes / Petz / Arnold–Mather / Baez–Dolan is a typed attribute. `verum audit --framework-axioms` enumerates the exact set. |
| **`verum verify`**      | Discharges refinement + `ensures` obligations via multiple SMT backends capability router. Counterexamples surface automatically in the diagnostic when a step fails. |
| **`verum export`**      | Emits Lean / Coq / Dedukti / Metamath certificates with every framework-axiom marker carried inline as a comment — external reviewers can replay the proof under their own axiomatization. |
| **`verum audit`**       | The release-gate auditor. Lists the full set of framework axioms used by any theorem reachable from the corpus's public API. |

## Status tracking

A mechanisation-status map at `docs/theorem_index.md` is
auto-regenerated by a `verum audit`-backed script and
tracks, per theorem:

- rigour tier (one of the four strata above);
- `@framework` dependencies (if any);
- verification strategy it closes under
  (`fast` / `static` / `formal` / `thorough` / `certified`);
- export status per target prover.

The release-gate CI fails the build if any *rigorous-core*
theorem regresses to `@verify(fast)` or below, and warns
when a *framework-conditional* theorem loses a framework
tag (indicating the proof accidentally depends on something
outside its declared framework).

## Release-gate CI integration

A typical CI pipeline for a proof corpus on Verum runs
four gates:

1. **Parse + type-check** — `verum check --strict`. Fails
   on any type error.
2. **Full verification** — `verum verify --mode proof
   --strategy certified`. Fails on any unproved
   obligation or kernel-replay mismatch.
3. **Framework-axiom audit** — `verum audit
   --framework-axioms --format json`. Output is compared
   against a committed baseline; CI fails if the axiom
   set drifts silently.
4. **Cross-tool export round-trip** — `verum export --to
   lean`, then invoke `lean` on the exported file. Runs
   weekly on a dedicated matrix; failures reported but
   not blocking.

The whole sequence completes in under 30 minutes for
corpora up to ~300 theorems on a stock GitHub Actions
runner; larger corpora need distributed verification
cache (`--distributed-cache`) to stay inside one-hour CI
budgets.

## Publication and re-check

A corpus ships as three artefacts:

1. **The Verum source** (the cog itself). Anyone with a
   Verum toolchain can re-run the verification and
   expect the same `sat/unsat/verified` verdict.
2. **The exported certificates** (the `certificates/`
   tree). Anyone with the target prover's kernel can
   re-check the statement set without running Verum.
3. **The audit report** (from `verum audit
   --framework-axioms --format json`). Anyone reading
   it sees the full trusted boundary at a glance.

The combination makes the corpus's claims checkable at
three independent layers: Verum's kernel, each target
prover's kernel, and the human-reviewable axiom
enumeration.

## Promotion progress: `@axiom` → `@theorem`

A corpus's headline metric is how much of it is *honest @theorem*
with kernel-rechecked structured proof body, versus how much is still
`() -> Bool ensures true` placeholder. `verum audit --proof-honesty`
classifies every public theorem / axiom into one of five kinds and
emits per-row + by-lineage totals to `audit-reports/proof-honesty.json`.

The promotion pattern that converts a tautological `@axiom` into a
witness-parameterised `@theorem` is:

1. **Find the natural carrier protocol** the axiom is *about* — the
   verum-msfs-corpus exercises this on `&LAbsCandidate`,
   `&DualLAbsCandidate`, `&DiakrisisPrimitive`, `&SSMembership`,
   `&StrictInclusionWitness`, `&OpenQuestion`.
2. **Strengthen the axiom signature** to take `(p: &Carrier) -> Bool
   [requires <prereq>] ensures p.<accessor>()`.
3. **Promote downstream theorems** to `@theorem` with structured proof
   bodies: `proof { apply <ax_n>(p); apply <ax_m>(p); }`. The kernel-
   recheck trail walks every cited axiom at every site.

See **[Proof-honesty audit](./proof-honesty.md)** for the audit walker,
classification semantics, JSON schema, and the full carrier-protocol
inventory shipped under `core.math.*`.

## See also

- **[Trusted kernel](./trusted-kernel.md)** — the LCF
  core every corpus's theorems pass through.
- **[Framework axioms](./framework-axioms.md)** — how
  `@framework(name, "citation")` surfaces stratification.
- **[Proof export](./proof-export.md)** — per-target
  certificate formats and round-trip verification.
- **[Proof-honesty audit](./proof-honesty.md)** — `verum
  audit --proof-honesty` walker + `core.math.*` carrier-
  protocol surface for `@axiom` → `@theorem` promotions.
- **[CLI workflow](./cli-workflow.md)** — `verum audit`,
  `verum verify`, `verum export` command reference.
