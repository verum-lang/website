---
sidebar_position: 11
title: Tactic catalogue
---

# `verum tactic` — Industrial-grade tactic combinator catalogue

Verum's proof surface is built around a **single, typed catalogue**
of 15 canonical tactic combinators with 12 algebraic laws.  The
catalogue is what your IDE completes against, what your `.vr`
proof bodies compose, what the documentation generator renders,
and what the proof simplifier canonicalises.

The `verum tactic` subcommand surfaces this catalogue
programmatically — your shell, your CI scripts, and your
documentation pipeline all read the same data.

## Mental model

A **combinator** is a tactic-shape: it composes other tactics into
a richer one.  Verum ships 15 combinators grouped into 5 categories:

| Category | Members | Role |
|---|---|---|
| **identity** | `skip`, `fail` | Identity elements for `seq` / `orelse` (algebraic neutrality). |
| **composition** | `seq`, `orelse`, `first_of` | Combine multiple tactics into one. |
| **control** | `repeat`, `repeat_n`, `try`, `solve` | Control evaluation flow (loops, soft-fail, total-discharge guard). |
| **focus** | `all_goals`, `index_focus`, `named_focus`, `per_goal_split` | Direct attention across the open-goal stack. |
| **forward** | `have`, `apply_with` | Lean / SSReflect-style forward chaining. |

`verum tactic list --category <C>` filters by category.  `verum
tactic explain <name>` prints the full structured doc for a single
combinator.

## Subcommand reference

```bash
verum tactic list    [--category <C>] [--format plain|json]
verum tactic explain <name>           [--format plain|json]
verum tactic laws                     [--format plain|json]
```

### `verum tactic list`

Prints every combinator in the canonical catalogue with a one-line
semantics summary.  JSON output ships a stable schema:

```json
{
  "schema_version": 1,
  "count": 15,
  "entries": [
    {
      "name": "solve",
      "category": "control",
      "signature": "solve(body: Tactic)",
      "semantics": "Total-discharge guard. Runs `body`; if any open goal remains, the whole tactic FAILS.",
      "example": "solve { intro ; auto }   // commits to fully closing the goal",
      "doc_anchor": "tactic-solve",
      "laws": ["solve-of-skip-fails-when-open"]
    }
  ]
}
```

The JSON `count` always equals 15 (without `--category`); when a
category filter is applied, `count` is the cardinality of that
category and the sum across all five categories equals 15.

### `verum tactic explain <name>`

Full doc for a single combinator: signature, semantics, example
expression, the algebraic laws this combinator participates in (with
their `lhs ≡ rhs` rendering and rationale), and a stable
`doc_anchor` used by the auto-paper generator for cross-format
hyperlinks.

```bash
$ verum tactic explain seq
seq — composition category
─────────────────────────

Signature : seq(first: Tactic, then: Tactic)
Semantics : Sequential composition: run `first`, then run `then`
            on every resulting subgoal.

Example:
    intro ; split ; auto

Algebraic laws:
  • seq-left-identity
      skip ; t ≡ t
  • seq-right-identity
      t ; skip ≡ t
  • seq-associative
      (t ; u) ; v ≡ t ; (u ; v)

Doc anchor: #tactic-seq
```

JSON output mirrors this structure verbatim.  Every law name listed
in `laws` resolves to a full record in the `verum tactic laws`
endpoint.

Unknown names produce a non-zero exit and an actionable error
message:

```text
unknown tactic 'X' — run `verum tactic list` for the full catalogue
```

### `verum tactic laws`

The 12 canonical algebraic laws — the simplifier's normalisation
rule-set:

```
seq-left-identity        skip ; t                ≡ t
seq-right-identity       t ; skip                ≡ t
seq-associative          (t ; u) ; v             ≡ t ; (u ; v)
orelse-left-identity     fail || t               ≡ t
orelse-right-identity    t || fail               ≡ t
orelse-associative       (t || u) || v           ≡ t || (u || v)
repeat-zero-is-skip      repeat_n(0, t)          ≡ skip
repeat-one-is-body       repeat_n(1, t)          ≡ t
try-equals-orelse-skip   try { t }               ≡ t || skip
solve-of-skip-fails-when-open  solve { skip }    ≡ fail   (when goals are non-empty)
first-of-singleton-collapses   first_of([t])     ≡ t
all-goals-of-skip-is-skip      all_goals { skip } ≡ skip
```

Each entry in JSON output carries `name`, `lhs`, `rhs`, `rationale`,
and `participants` (the combinators the law touches).  Every law
referenced from a combinator entry MUST exist in this inventory —
the catalogue is the single source of truth for both the
docs generator and the proof simplifier.

## The 15 canonical combinators

### Identity

#### `skip`

Identity tactic.  Always succeeds, leaves the proof state
unchanged.  Identity element for `seq`: `skip ; t ≡ t ≡ t ; skip`.

Idiomatic use:

```verum
if has_hypothesis(h) { intro } else { skip }
```

#### `fail`

Always-failing tactic.  Identity element for `orelse`: `fail || t ≡
t`.  Forces the user to provide a successful branch in
`first { specialised_tactic | fail }`-style chains.

### Composition

#### `seq` (`t1 ; t2`)

Sequential composition: run `t1`, then run `t2` on every resulting
subgoal.  Associative; the simplifier canonicalises to
right-association.

```verum
intro ; split ; auto
```

#### `orelse` (`t1 || t2`)

Choice: try `primary`; if it fails, try `fallback`.  The first
success wins.  Used heavily in dispatch chains like
`ring || nlinarith`.

#### `first_of` (`first { t1; t2; … }`)

First-success choice over a list.  Equivalent to nested `orelse`
but reads better at three+ alternatives.  Singleton form collapses:
`first_of([t]) ≡ t`.

```verum
first { refl | assumption | auto | smt }
```

### Control

#### `repeat`

Unbounded repetition.  Stops at fixpoint or when the body fails /
makes no progress.  Termination is guaranteed by the proof-state
manager's "goal-unchanged" detector — any tactic that doesn't
advance the state halts the loop.

```verum
repeat { simp ; rewrite_with(assoc) }
```

#### `repeat_n` (`repeat_n(count, body)`)

Bounded repetition; runs `body` at most `count` times.  Two
algebraic shortcuts the simplifier exploits:

- `repeat_n(0, t) ≡ skip` — zero iterations cannot perform any
  work, so they collapse.
- `repeat_n(1, t) ≡ t` — single iteration is just the body; the
  loop overhead is observable only at `n ≥ 2`.

#### `try` (`try { t }`)

Soft-fail.  Runs `body`; if it fails, the proof state is
unchanged and `try` still succeeds.  Desugars to `t || skip`.

```verum
try { norm_num } ; auto
```

#### `solve` (`solve { t }`)

**Total-discharge guard.** Runs `body`; if any goal remains open,
FAILS the whole tactic.  This is the strongest contract a
combinator can declare: it commits to fully closing the focused
goal.

```verum
solve { intro ; auto }   // commits to fully closing the goal
```

Algebraic law: `solve { skip } ≡ fail` whenever goals remain
non-empty.

### Focus

#### `all_goals` (`all_goals { t }`)

Apply `body` to every open goal independently.  Fails if `body`
fails on any goal.  Often paired with branching tactics:

```verum
split ; all_goals { auto }
```

`all_goals { skip } ≡ skip` — applying skip to every goal is
operationally a no-op.

#### `index_focus` (`i: t`)

Focus on the `i`-th goal (1-based).  Runs `body` on that goal alone;
other goals are preserved for later.

```verum
split ; 1: { auto } ; 2: { ring }
```

#### `named_focus` (`case label => t`)

Focus on the goal labelled `label`.  Goal labels come from
`intro_as` / `case` introductions.

```verum
destruct h ;
  case left  => { auto } ;
  case right => { contradiction }
```

#### `per_goal_split` (`[t1; t2; t3]`)

Distribute branches across the open goals one-to-one.  Fails if the
goal count differs from the branch count — the strict match is
intentional: silently dropping a branch when the goal count is less
than expected hides logic errors.

```verum
split ; [ auto ; ring ]
```

### Forward

#### `have` (`have h : T := { proof }`)

Forward-style hypothesis introduction.  Proves `T` via `proof`,
binds it as `h`, and continues with the original goal.

```verum
have h : x > 0 := { norm_num } ; rewrite_with(h)
```

Fails if `proof` does not discharge `T` — the bound name only
enters scope on success.

#### `apply_with` (`apply X with [a, b, …]`)

Explicit-instantiation lemma application.  Used when type inference
can't pick the right witness.  The arguments substitute into the
lemma's type variables in declaration order; mismatched arity fails
immediately.

```verum
apply add_comm with [a, b]
```

## Standard-library mount tree

The Verum standard library ships seven topic-specific modules
under `core.proof.tactics`.  Each module exports `tactic`
declarations that wrap the canonical combinators in
domain-specific names:

```verum
mount core.proof.tactics.basic;        // refl, assumption, trivial, exact, by_axiom
mount core.proof.tactics.arithmetic;   // ring, omega, linarith, nlinarith, field, norm_num
mount core.proof.tactics.logical;      // intro, split, left, right, witness, auto, smt, blast
mount core.proof.tactics.structural;   // induction, destruct, case_analysis, cases
mount core.proof.tactics.rewrite;      // rewrite, simp, unfold, fold, change
mount core.proof.tactics.combinators;  // skip, fail, seq, orelse, repeat_n,
                                       // repeat_until_done, first_of, all_goals,
                                       // focus, try_tactic, solve, case_focus,
                                       // per_goal_split
mount core.proof.tactics.forward;      // have, apply_with
mount core.proof.tactics.meta;         // quote, unquote, goal_intro
```

A glob mount brings the whole library into scope:

```verum
mount core.proof.tactics.*;
```

## Composing your own combinators

User-defined tactics declared with `tactic` are first-class — they
can take other tactics as arguments and call any combinator from
the catalogue:

```verum
// Domain-specific shortcut: try ring, then linarith, then auto.
tactic algebra_try() {
    first { ring | linarith | auto }
}

// Solve-or-fail variant of auto.
tactic auto_solve() {
    solve { auto }
}
```

The simplifier applies the 12 algebraic laws to every tactic
expression before execution, so `algebra_try() ; skip` collapses to
just `algebra_try()` automatically.

## CI usage

Pinning the catalogue's shape is the standard CI gate:

```bash
# Block any future commit that adds / removes a combinator without
# updating the rest of the toolchain.
verum tactic list --format json | jq '.count' | grep -q '^15$'
verum tactic laws --format json | jq '.count' | grep -q '^12$'
```

## Cross-references

- **[Verification → tactic DSL](/docs/verification/tactic-dsl)** —
  the surface syntax and macro-level semantics.
- **[Reference → tactics](/docs/reference/tactics)** — full
  per-tactic reference.
- **[Auto-paper generator](/docs/tooling/auto-paper)** — uses
  every combinator's `doc_anchor` for stable cross-format
  cross-references.
- **[Proof drafting](/docs/tooling/proof-drafting)** — when you're
  stuck, ask the suggestion engine which combinator to apply next.
