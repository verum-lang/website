---
sidebar_position: 8
title: Counterexamples
---

# Counterexamples

> When the solver cannot prove an obligation, it returns `sat` on
> the negated goal — a concrete assignment of values that violates
> the claim. Verum turns those raw models into **actionable
> counterexamples** that point at real values in the user's code.

Counterexamples are the proof system's equivalent of a test
failure with a recorded input. Understanding what's in one, how
it's extracted, and how it's minimized is the difference between
a quick fix and a morning spent squinting at Z3 model dumps.

---

## 1. When a counterexample is emitted

Any of these strategies produce counterexamples on failure:

| Strategy     | On failure emits counterexample?                                        |
|--------------|--------------------------------------------------------------------------|
| `Runtime`    | No — runtime assertion panics with the violating value directly.         |
| `Static`     | Yes — build error with counterexample.                                   |
| `Formal`     | Yes — build error with counterexample.                                   |
| `Fast`       | Yes — but minimization is skipped (keep build times low).                |
| `Thorough`   | Yes — with minimization and hypothesis-reduction pass.                   |
| `Certified`  | Yes — with minimization and a note indicating which backends agreed.     |
| `Synthesize` | The synthesizer returns no candidate; "counterexample" is a class of inputs for which no closed-form body exists. |

Obligations that return `unknown` (solver timed out or hit its
resource limit) do NOT produce counterexamples — the solver could
not decide, so no violating instance was constructed. A
`unknown` outcome is reported separately with a diagnostic
distinguishing it from `sat`.

---

## 2. Anatomy of a counterexample

A full counterexample (at `--counterexample=full`) contains:

```text
error<E500>: contract violation — ensures clause failed
  --> core/math/arith.vr:42:5
   |
40 | fn safe_div(a: Int, b: Int) -> Int
41 |     requires b != 0
42 |     ensures result == a / b
   |     ^^^^^^^^^^^^^^^^^^^^^^^ this ensures clause is falsifiable
43 | {
44 |     a / b
45 | }
   |

Counterexample:
    a = -3
    b = 2
    result = -1   (expected: -2 for floor division, got -1 for truncation)

Contradiction:
    a / b computes via truncation: -3 / 2 == -1
    The ensures clause reads a / b symbolically as floor: -3 / 2 == -2
    The two disagree at negative dividends.

Source chain:
    - `result == a / b`   at line 42:13 (ensures clause)
    - body evaluates `a / b` via Int.div(a, b)  at line 44
    - Int.div is truncating; floor_div available as separate intrinsic

Suggested fixes:
  1. Use `a.floor_div(b)` if you meant floor division.
  2. Weaken the ensures to `a / b == result && (a < 0 && b > 0 ⇒ result * b >= a)`.
  3. Add `@logic` attribute to a helper that models truncation correctly.

help: run `verum verify --counterexample=minimal core/math/arith.vr`
      for the single-page version without source-chain detail.
```

The four fields (free-variable assignments, contradiction,
source chain, suggested fixes) are produced in order by distinct
pipeline stages; see §4 for the implementation path.

---

## 3. Modes

### 3.1 `none`

Suppresses counterexample printing; still emits the error. Use
for CI pipelines where artefacts are collected separately.

### 3.2 `minimal` (default in `Fast`)

Only the free-variable assignments. One or two lines per variable:

```text
Counterexample:
    a = -3, b = 2, result = -1
```

### 3.3 `standard` (default in `Static`, `Formal`)

Free-variable assignments + a one-line contradiction statement.
No source chain, no fix suggestions.

### 3.4 `full` (default in `Thorough`, `Certified`)

All four fields as shown in §2.

### 3.5 `json`

Machine-readable. The shape is stable across versions (schema
versioned). Useful for IDE integrations and CI dashboards.

```json
{
  "schema_version": 1,
  "file": "core/math/arith.vr",
  "span": { "start": { "line": 42, "col": 5 }, "end": { "line": 42, "col": 28 } },
  "clause": "ensures",
  "assignments": [
    { "name": "a", "value": -3, "type": "Int" },
    { "name": "b", "value": 2, "type": "Int" },
    { "name": "result", "value": -1, "type": "Int" }
  ],
  "contradiction": "a / b computes via truncation; ensures reads a / b as floor division",
  "source_chain": [
    { "file": "core/math/arith.vr", "line": 42, "col": 13, "reason": "ensures clause body" },
    { "file": "core/math/arith.vr", "line": 44, "col": 5,  "reason": "body evaluates via Int.div" }
  ],
  "suggested_fixes": [ "use .floor_div", "weaken ensures", "add @logic helper" ]
}
```

---

## 4. Extraction pipeline

A counterexample is built in five stages. Each stage reads from
the previous and may be skipped (per mode).

### 4.1 Stage 1 — Raw model extraction

When the SMT backend returns `sat`, the translator asks for the
model via the solver's native API (`(get-model)` in SMT-LIB). The
model is a mapping from SMT constants to concrete values
(integers, booleans, reals, bit-vectors, arrays, sequences). This
is the starting substrate.

Implementation: `verum_smt::model::extract_model(solver) ->
RawModel`.

### 4.2 Stage 2 — De-SMT translation

Each SMT constant is mapped back to its Verum name (parameter,
local binding, or synthesized `skol_<n>` for Skolem constants).
Values are converted to Verum types (`Int`, `Bool`, `Text`,
`List<_>`, etc.) using the translator's inverse encoding tables.

Implementation: `verum_smt::model::desmtify(raw, trans_ctx)`.

### 4.3 Stage 3 — Contradiction synthesis

The raw model is plugged into the original obligation's goal; the
places where the evaluation diverges from expected are identified
by running the goal expression's abstract interpretation against
the model. A contradiction statement is produced in plain English
referencing the actual divergence.

Implementation: `verum_verification::counterexample::synthesize_contradiction`.

### 4.4 Stage 4 — Minimization

Verum applies minimization in two phases — one pure, one
solver-backed:

**Phase 4a: syntactic minimization** (always applied). Pure
zero-callback pass that drops every
assignment whose variable name doesn't appear in the violated
constraint string. Z3 frequently reports helper-predicate
constants the user never wrote; the syntactic pass removes
those so the counterexample mentions only the variables the
violation actually depends on.

Word-boundary matching: `x` is kept only when the constraint
contains `x` as a whole identifier token — substring match in
`xyz` does NOT count. This keeps the pruner conservative on
false negatives (false positives are cheap — we keep an
unused variable; false negatives are bugs — we'd hide a
relevant one).

**Phase 4b: semantic minimization** (on `Thorough` /
`Certified`). Delta-debugging pass that requires solver
re-invocation:

- **Value reduction.** For each integer parameter,
  binary-search toward zero while the obligation remains
  falsifiable.
- **Collection reduction.** For each `List<T>`, repeatedly
  remove elements and retest.
- **Constraint pruning.** Drop hypotheses from the context
  one at a time; those that don't change the outcome are
  extraneous and are omitted from the report.

Pipeline composition: `extract → minimize_syntactic →
minimize_semantic`. The syntactic pass reduces the input
domain for the semantic pass; on Fast-strategy verification,
only the syntactic pass runs (no re-solve cost).

Semantic minimization is capped at 30s by default, tunable
via `--minimize-timeout`.

### 4.5 Stage 5 — Fix suggestion

A pattern-matching pass over the minimized counterexample and the
AST emits fix suggestions from a curated rule base. Common rules:

- Integer division: suggest `floor_div` vs `truncating_div`.
- Unsigned overflow: suggest saturating or widening variants.
- Off-by-one: suggest `.len() - 1` vs `.len()`.
- Refinement too strong: suggest the minimal refinement that
  passes.

Fix rules are defined in `verum_verification::fix_suggestions` and
are plugin-extensible (see [Tactic DSL](./tactic-dsl.md) for
authoring).

---

## 5. Counterexamples for quantified obligations

Universal claims (`forall x in domain. P(x)`) need special care.
The solver returns a single `x` that falsifies `P`; the
counterexample framework elaborates:

```text
Counterexample (universal):
    forall x in 0..n. sorted[x] <= sorted[x+1]

    Falsifying x = 3, n = 5
    sorted[3] = 7
    sorted[4] = 2
    Contradiction: 7 <= 2 is false.

Source chain:
    - sorted comes from quicksort(arr)  at line 12
    - arr had no partial-order invariant on input
```

Existential claims (`exists x. P(x)`) report "no witness found
within search depth" with the search depth used; the claim may
still be true beyond that depth — the report says so explicitly.

---

## 6. Counterexamples and framework axioms

If the proof uses a `@framework(id, "citation")` axiom, and the
proof fails, the diagnostic lists the framework dependency:

```text
error<E500>: theorem proof failed
    bridge_to_n_7
    proof required framework axiom: baez_dolan_hda::aut_o_is_g2

  note: the framework axiom itself was trusted;
        the failure is in the non-axiom portion of the proof.
```

This helps the user distinguish "I'm missing a step" from "I
cited the wrong axiom."

See [Framework axioms](./framework-axioms.md).

---

## 7. When the solver returns `unknown`

Not a counterexample: the solver could not decide. Typical
causes and diagnostics:

| Cause                              | Mitigation                                                        |
|------------------------------------|-------------------------------------------------------------------|
| Timeout                            | `--timeout 120` (or `Thorough` strategy).                         |
| Nonlinear arithmetic explosion     | Switch to CVC5 via `--solver cvc5`; or decompose manually.        |
| Unbounded quantifier instantiation | Add `@trigger` to help the solver pick patterns.                  |
| Reflection unfolding loop          | Bound recursion depth with `@logic(depth=N)`.                     |
| Theory combination at a hard boundary | Use the Certified strategy to race both backends.              |

The diagnostic for `unknown` is distinct from a counterexample —
it does NOT assert the claim is false, only that the solver could
not conclude either way.

---

## 8. Interactive counterexample exploration

The `verum verify --interactive` mode enters a REPL-style
counterexample explorer for failed obligations:

```text
> load core/math/arith.vr
Loaded. 4 obligations; 1 failed.

> show failed
1. safe_div (ensures, line 42)

> explain 1
<full counterexample as §2>

> reduce a
reducing 'a' via binary search...
a = -1, b = 2 still falsifies.

> reduce b
b = 1: claim holds. b = 2: fails. Minimal b = 2.

> trace
Executes the body on the minimized input, showing each intermediate value.
```

Implementation pointer:
`verum_cli::commands::verify::interactive_explore`.

---

## 9. What counterexamples are NOT

- **Not tests.** Running the function on the counterexample
  value may or may not crash; the counterexample is a logical
  counterexample to the *specification*, not necessarily a
  runtime crash.
- **Not guaranteed minimal.** Minimization is bounded (30s
  default). For large obligations the reported instance may
  still be reducible.
- **Not a proof of `P(x)` for all other `x`.** A counterexample
  proves `¬∀ P`, i.e. there exists one falsifier. It does NOT
  say "almost all inputs falsify."
- **Not stable across solver versions.** Z3 and CVC5 may pick
  different models for the same unsat query; the reported
  counterexample is whichever came first in the portfolio race.

---

## 10. Extensions

- **Delta-debugging at the AST level**: minimize the
  program, not just the inputs, to isolate the contradiction.
- **Counterexample diffing**: when a proof starts failing, diff
  the new counterexample against the last-known-good one.
- **Counterexample replay**: treat the counterexample as a
  property-test seed; plug it into `cargo run` / `verum run` to
  exercise the concrete machine.
- **Counterexamples for quantifier-heavy goals**: improved
  Skolemization reporting so "exists x" failures name the
  quantifier bound rather than a synthetic Skolem constant.
- **IDE integration**: counterexamples as inline hover tooltips
  in VS Code (see [LSP](../tooling/lsp.md)).

---

## See also

- [SMT routing](./smt-routing.md) — which backend produced the
  `sat` verdict.
- [Proofs](./proofs.md) — when you write a proof, the failing
  tactic and its residual goal are shown instead.
- [Performance tuning](./performance.md) — how to
  profile and accelerate verification.
- [CLI workflow](./cli-workflow.md) — counterexample flags in
  context.
