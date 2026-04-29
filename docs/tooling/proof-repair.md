---
sidebar_position: 13
title: Proof repair
---

# `verum proof-repair` — Structured repair suggestions

When the kernel rejects a term or the type-checker fails on an
obligation, downstream tooling (IDE / REPL / CLI) needs more than
just an error message — it needs **actionable repair suggestions**
ranked by likelihood, with related-theorem hints, deep-link
documentation, and structured fields suitable for IDE
code-actions.

`verum proof-repair` is the CLI surface for that engine.

## Mental model

A proof / kernel failure is classified as one of nine typed
**failure kinds**:

| Kind | Cause |
|---|---|
| `refine-depth`  | K-Refine rejected: depth-strict comprehension fails `dp(P) < dp(A) + 1`. |
| `positivity`    | K-Pos rejected: strict-positivity violation in an inductive. |
| `universe`      | K-Univ rejected: universe-level inconsistency. |
| `fwax-not-prop` | K-FwAx rejected: framework-axiom body is not in `Prop`. |
| `adjunction`    | K-Adj-Unit / K-Adj-Counit rejected: round-trip failure. |
| `type-mismatch` | Type unification failed. |
| `unbound-name`  | Unbound name reference. |
| `apply-mismatch`| Apply-target's signature does not match the goal. |
| `tactic-open`   | Tactic returned `Open` — could not close the obligation. |

For each kind the engine emits 1–4 ranked **repair suggestions**.
Each suggestion carries:

- `snippet` — drop-in code fragment (an IDE applies as a code-action).
- `rationale` — one-line justification.
- `applicability` — `machine_applicable` / `maybe_incorrect` /
  `has_placeholders` / `speculative`.
- `score` — likelihood in `[0, 1]`.
- `doc_link` — optional deep-link.

## Subcommand

```bash
verum proof-repair --kind <K> [--field key=value]… \
                   [--max <N>] [--format plain|json]
```

`--field` is repeatable.  Required fields per kind are validated
up front and the error message names the missing key.

### Field schema per kind

| Kind | Required `--field` keys |
|---|---|
| `refine-depth`  | `refined_type`, `predicate_depth` |
| `positivity`    | `type_name`, `constructor`, `position` |
| `universe`      | `source_universe`, `expected_universe` |
| `fwax-not-prop` | `axiom_name`, `body_sort` |
| `adjunction`    | `side` (must be `unit` or `counit`) |
| `type-mismatch` | `expected`, `actual` |
| `unbound-name`  | `name` |
| `apply-mismatch`| `lemma_name`, `actual_conclusion`, `goal` |
| `tactic-open`   | `tactic`, `reason` |

### Examples

```bash
$ verum proof-repair --kind unbound-name --field name=foo_lemma
Failure kind: unbound-name
Suggestions (2):

  1. [0.80 | has_placeholders] mount <module>.{foo_lemma};
     ↪ unbound name — add a `mount` declaration importing the symbol from its defining module
     📖 https://docs.verum.lang/kernel/module-system
  2. [0.50 | speculative]      // `foo_lemma` is undefined.  Did you mean a lemma in scope?
     ↪ unbound name — query the suggestion engine for near-miss alternatives
```

```bash
$ verum proof-repair --kind refine-depth \
    --field refined_type=CategoricalLevel \
    --field predicate_depth=ω·2 \
    --format json
{
  "schema_version": 1,
  "kind": "refine-depth",
  "suggestion_count": 2,
  "suggestions": [
    { "snippet": "// reduce the predicate's modal depth ...",
      "rationale": "K-Refine kernel rule requires the refinement predicate's depth to be strictly below the carrier-type's depth + 1",
      "applicability": "has_placeholders",
      "score": 0.85,
      "doc_link": "https://docs.verum.lang/kernel/k-refine" },
    { "snippet": "@require_extension(vfe_7) ...",
      "rationale": "Opt into the K-Refine-omega rule (ordinal-valued depth) when finite-depth refinement is too restrictive",
      "applicability": "speculative",
      "score": 0.45,
      "doc_link": "https://docs.verum.lang/kernel/k-refine-omega" }
  ]
}
```

## Validation contract

| Rule | Error message |
|---|---|
| `--kind` unknown | `unknown --kind 'X' (valid: refine-depth, positivity, …)` |
| Required `--field` missing | `--kind X requires --field <key>=<value>` |
| `--field` malformed (no `=`) | `--field must be 'key=value', got '...'` |
| `--field` empty key | `--field key must be non-empty` |
| `adjunction --field side=garbage` | `--field side must be 'unit' or 'counit'` |
| `--max 0` | `--max must be > 0` |
| `--format` not `plain`/`json` | `--format must be 'plain' or 'json'` |

## Ranking contract

Suggestions are sorted by descending score; ties broken by source
order.  Every kind produces ≥ 1 suggestion so IDE consumers never
see an empty list.

## Per-kind suggestion catalogue

### `refine-depth`

K-Refine rejects depth-strict refinement when the predicate's
modal depth is not strictly below the carrier-type's depth + 1.
The repair offers:

1. **Reduce predicate depth** (score 0.85, `has_placeholders`) —
   the principled fix; reformulate the predicate so it satisfies
   `dp(P) < dp(A) + 1`.
2. **Opt into K-Refine-omega** (score 0.45, `speculative`) — when
   finite depth is genuinely too restrictive, request the
   ordinal-valued depth rule via `@require_extension(vfe_7)`.

### `positivity`

K-Pos rejects non-strictly-positive recursion (Berardi 1998 derives
`False` from any negative occurrence).

1. **Reposition the recursive reference** (score 0.9,
   `has_placeholders`) — move the recursive type to a strictly-
   positive position (right of every arrow, never inside a
   function-typed argument).
2. **Convert to `@coinductive`** (score 0.35, `speculative`) — if
   you want a productive (rather than well-founded) self-reference,
   declare the type coinductive instead.

### `universe`

K-Univ requires the source's universe to be ≤ expected.

1. **Add explicit universe ascent** (score 0.8) — wrap in `Lift<T>(_)`
   or annotate the type to bump the universe level.

### `fwax-not-prop`

K-FwAx admits only `Prop`-typed framework-axiom bodies.  Anything
else lets users postulate arbitrary computable functions.

1. **Reformulate as `Prop`-valued predicate** OR
2. **Downgrade to `@def`** if you want a definitional binding.

### `adjunction`

K-Adj-Unit / K-Adj-Counit enforce the α ⊣ ε round-trip identity.

1. **Check round-trip identity** (score 0.7) — verify
   `alpha_of(epsilon(α)) ≡ α` (or the dual on the counit side) up
   to gauge equivalence.

### `type-mismatch`

The inferred type and the expected type differ.

1. **Add explicit conversion / coercion** (score 0.75) or fix the
   surrounding term.

### `unbound-name`

The cited identifier doesn't resolve in the current scope.

1. **Add a `mount`** (score 0.8) — `mount <module>.{name};`.
2. **Query the suggestion engine** for near-miss alternatives via
   `verum proof-draft --suggest`.

### `apply-mismatch`

The applied lemma's conclusion does not unify with the current goal.

1. **Instantiate the lemma with explicit arguments** (score 0.78,
   `has_placeholders`) — see `apply X with [a, b]`.
2. **Fall back to `apply auto;`** (score 0.35, `maybe_incorrect`) —
   portfolio SMT search may discharge the goal automatically.

### `tactic-open`

The tactic could not close the goal; chain alternatives or step
into a manual proof.

1. **Chain stricter strategy** (score 0.55, `speculative`) —
   `apply <tactic> || apply auto || apply lia`.

## Typical IDE integration

```bash
# When a verify run fails with a kernel-rule rejection, IDE shells
# out with the structured failure data and renders the top
# suggestions as code-actions.
verum proof-repair --kind unbound-name --field name=foo_lemma --format json \
| jq '.suggestions[0]'
```

The doc-link in each suggestion opens in-browser when the user
selects "More info" on the code-action.

## Composing custom repair engines

Project-local engines plug in alongside the default catalogue —
LLM-repair adapters, MSFS-corpus-aware adapters, project-local
shortcut catalogues.  The CLI surface stays the same; merged
suggestions are re-ranked by score with ties broken by source
order.

## Future integration

The current CLI requires the user to supply `--kind` + structured
fields manually.  The natural production path is automatic
projection: every kernel rejection during `verum verify` maps to a
typed failure kind, the diagnostic emitter calls the repair engine
inline, and IDE consumers see ranked repair suggestions in every
type-error / refinement-failure / kernel-rejection diagnostic
without opt-in.

That projection is in flight; the CLI surface ships now so external
tooling can be wired against the stable JSON schema today.

## Cross-references

- **[Verification → counterexamples](/docs/verification/counterexamples)**
  — when SMT returns SAT, the model is the failure detail; this
  repair engine is the *constructive* complement.
- **[Tactic catalogue](/docs/tooling/tactic-catalogue)** — many
  repair snippets cite a tactic invocation (`apply auto;`,
  `mount X;`); the catalogue is the source of truth for tactic
  shapes.
- **[Reference → glossary](/docs/reference/glossary)** —
  cross-link to error-code descriptions.
