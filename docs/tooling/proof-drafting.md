---
sidebar_position: 12
title: Proof drafting
---

# `verum proof-draft` — Zero-friction proof drafting

`verum proof-draft` is the IDE / REPL / CI surface for Verum's
**ranked tactic-suggestion engine**.  Given a theorem name + a
focused-goal description + a list of available lemmas, it emits
ranked next-step tactic suggestions with rationales, scores, and
categories — the exact data your IDE shows when you hover over an
open proof goal.

## Mental model

A focused proof state has:

- A **goal** — the proposition you're trying to prove right now.
- A **theorem name** — the proof body's owner, used for diagnostic
  attribution.
- A set of **available lemmas** in scope, each with a name,
  signature, and lineage (`core` / `corpus` / project-local).

The suggestion engine projects this state to a ranked list of
**suggestions**.  Each suggestion carries:

- `snippet` — a drop-in tactic invocation (e.g. `apply succ_pos`).
- `rationale` — one-line justification.
- `score` — likelihood in `[0, 1]`.
- `category` — `lemma` / `tactic` / `navigation` / `rewriting` / `llm`.

The CLI is the transport layer: your editor / build script /
shell shells out and reads the structured output.  The same
suggestions appear in IDE hover panels, code-action lists, and
completion items.

## Subcommand

```bash
verum proof-draft --theorem <T> --goal <G> \
                  [--lemma name:::signature[:::lineage]]… \
                  [--max <N>] [--format plain|json]
```

The `--lemma` flag is repeatable and uses `:::` as the
multi-component separator (chosen to avoid collision with
identifiers, types, and any common shell metacharacter):

```text
--lemma name:::signature[:::lineage]

  name      — stable identifier (the name you'd cite via `apply name`)
  signature — pretty-printed type / proposition rendering
  lineage   — provenance tag, defaults to "corpus" if absent
```

Example:

```bash
$ verum proof-draft \
    --theorem thm \
    --goal "forall x. x > 0 -> succ(x) > 0" \
    --lemma "succ_pos:::forall x. x > 0 -> succ(x) > 0:::core" \
    --max 5
Goal: forall x. x > 0 -> succ(x) > 0
Theorem: thm
Suggestions (3):

  1. [1.00 | lemma]      apply succ_pos;
     ↪ direct match — lemma's conclusion unifies with the goal
  2. [0.60 | navigation] intro h;
     ↪ Π-shaped goal — introducing the antecedent simplifies further dispatch
  3. [0.20 | tactic]     apply auto;
     ↪ fallback portfolio dispatch
```

`--max` truncates the ranked list (default 5).  `--format json`
emits a structured payload suitable for IDE integration:

```json
{
  "schema_version": 1,
  "theorem": "thm",
  "goal": "forall x. x > 0 -> succ(x) > 0",
  "suggestion_count": 3,
  "suggestions": [
    { "snippet": "apply succ_pos;", "rationale": "...",
      "score": 1.0, "category": "lemma" },
    { "snippet": "intro h;",         "rationale": "...",
      "score": 0.6, "category": "navigation" },
    { "snippet": "apply auto;",      "rationale": "...",
      "score": 0.2, "category": "tactic" }
  ]
}
```

## Ranking contract

The default engine follows three rules:

1. **Direct unification wins.** A lemma whose conclusion structurally
   matches the goal scores 1.0 and is ranked first.
2. **Π-shaped goals offer `intro`.** When the goal is a quantifier or
   implication, the engine surfaces the corresponding navigation
   step (`intro h`, `witness e`, etc.) at score ≥ 0.6.
3. **Always-offer fallback.** Even when no direct match exists, the
   engine emits at least `apply auto;` at score 0.2 so the user is
   never left with an empty list.

Zero-score suggestions are filtered: lemmas whose signatures don't
share any structural elements with the goal are dropped (no
`apply unrelated_lemma;` clutter).

## Validation contract

The handler validates inputs up front and surfaces actionable
errors:

| Rule | Error message |
|---|---|
| `--theorem` empty | `--theorem must be non-empty` |
| `--goal` empty | `--goal must be non-empty` |
| `--max 0` | `--max must be > 0` |
| `--format` not `plain` / `json` | `--format must be 'plain' or 'json'` |
| `--lemma` malformed (no `:::`) | `--lemma must be name:::signature[:::lineage]` |
| `--lemma` empty `name` | `--lemma name component must be non-empty` |
| `--lemma` empty `signature` | `--lemma signature component must be non-empty` |

Each rule produces a non-zero exit so CI pipelines can rely on the
contract.

## Typical IDE integration

A simple shell loop pulled from any editor's "show suggestions"
hook:

```bash
verum proof-draft \
  --theorem "$THEOREM" \
  --goal "$FOCUSED_GOAL" \
  --lemma "$LEMMA1:::$SIG1:::$LINEAGE1" \
  --lemma "$LEMMA2:::$SIG2:::$LINEAGE2" \
  --format json \
| jq -r '.suggestions[] | "\(.score)\t\(.snippet)"'
```

Per-IDE caching is the consumer's concern; the CLI itself is
stateless.

## Using suggestions in your proofs

When the IDE returns a ranked list, the natural workflow is to
apply the top suggestion to the open proof body and repeat:

```verum
@verify(formal)
theorem succ_strictly_positive(x: Int)
    requires x > 0
    ensures succ(x) > 0
    proof by {
        // suggestion #1: apply succ_pos;
        apply succ_pos
    };
```

If suggestion #1 doesn't close the goal, the engine ran on the
**original** state — re-invoke `verum proof-draft` on the new
goal that the partial proof produced.  Most IDE integrations
auto-refresh on every keystroke.

## Composing custom suggestion engines

Project-local engines can run alongside the default engine: an
LLM-tactic adapter that asks a language model for completions, a
registry-search adapter that fuzzy-matches lemma names, etc.  The
CLI consumes whichever engine the project configures; merged
suggestions are re-ranked by score with ties broken by source order.

## Cross-references

- **[Tactic catalogue](/docs/tooling/tactic-catalogue)** — the
  underlying combinator surface every suggestion is built from.
- **[Proof repair](/docs/tooling/proof-repair)** — when a goal
  *failed*, ask the repair engine for ranked structured fixes.
- **[Verification → tactic DSL](/docs/verification/tactic-dsl)** —
  the proof-script syntax suggestions compile into.
- **[Verification → proofs](/docs/verification/proofs)** — full
  proof-body grammar and execution model.
