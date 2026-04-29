---
sidebar_position: 11
title: Tactic catalogue
---

# `verum tactic` — Industrial-grade tactic combinator catalogue

This page is the complete reference for Verum's tactic system —
written for a developer who has never proved a theorem before.
We start from first principles (what *is* a tactic? why do we need
them?), build up the goal-stack mental model, and only then dive
into the 15 canonical combinators and their algebraic laws.

By the end you will know:

- What a proof goal is and how Verum represents it.
- Why proofs are built one tactic at a time, with the kernel
  checking every step.
- The 15 canonical combinators that compose into any Verum proof.
- The 12 algebraic laws the proof simplifier uses to canonicalise
  tactic expressions.
- How `verum tactic list / explain / laws` surfaces the catalogue
  programmatically.

If you already know Coq / Lean / Isabelle, skim straight to
**[The 15 canonical combinators](#the-15-canonical-combinators)**.
If you've never written a proof, start here.

---

## What is a tactic?

A **theorem** is a claim: "for every integer `x`, if `x > 0` then
`succ(x) > 0`".  A **proof** is the construction that justifies
the claim.

In a programming language without proof support, the claim is just
a comment.  In Verum, you write the theorem alongside its proof,
and the **kernel** — Verum's small, trusted core — accepts the
proof only if every inference step is valid.  When the kernel
accepts, the theorem is part of the corpus forever and no future
edit can undermine it.

But how do you *build* the proof?  You could write the entire
proof term by hand — every variable binding, every type ascent,
every kernel-rule invocation.  For a one-line theorem this is
fine; for a real corpus it is unwriteable.  A typical Verum
theorem produces dozens of kernel-rule applications under the
hood.

A **tactic** is a small instruction that says "run this proof step
on the current goal."  Examples:

- `intro` — "if the goal is `forall x. P(x)`, introduce `x` and
  reduce the goal to `P(x)`."
- `apply succ_pos` — "the lemma `succ_pos` proves something whose
  conclusion matches my goal; use it."
- `auto` — "try the standard automation: simplification,
  reflexivity, decision procedures, etc."

You write proofs as **sequences of tactics**.  The kernel walks
each tactic, verifies its effect, and either accepts (the goal is
discharged) or rejects (an error tells you what went wrong).  You
never construct kernel terms directly — the tactics do that for
you.

```verum
@verify(formal)
public theorem succ_pos(x: Int)
    requires x > 0
    ensures succ(x) > 0
    proof by {
        intro                    // introduce x and the hypothesis x > 0
        apply add_pos_pos        // succ(x) = x + 1; both summands positive
        auto                     // discharge any leftover trivial goals
    };
```

Three tactics → kernel-accepted theorem.  No raw proof terms in
sight.

---

## The goal-stack model

When the kernel starts checking a proof, it presents you with one
**goal**: the theorem you're trying to prove (the `ensures` clause
combined with the local context — variables, hypotheses, lemmas in
scope).

Each tactic does one of three things:

1. **Closes the goal** — the kernel marks the proof complete for
   this goal.  No new work.
2. **Replaces the goal with a smaller goal** — e.g. `intro` on
   `P -> Q` reduces the goal to `Q` (with `P` moved into the
   hypothesis context).
3. **Splits the goal into multiple goals** — e.g. `split` on
   `A ∧ B` produces two goals: `A` and `B`.  Each must be
   discharged separately.

So at any moment your proof state is a **stack of open goals**.
The proof body must end with the stack empty.  If a tactic closes
one of three goals, you have two left; the next tactic operates on
the top of the stack.

This is the foundation of the **focus combinators** below
(`all_goals`, `index_focus`, `named_focus`, `per_goal_split`):
they let you direct attention across the open-goal stack instead of
just the top.

---

## What does "kernel-checked" mean?

Verum follows the **LCF principle**: only a small core (the kernel)
is trusted to construct proof terms.  Every tactic, no matter how
clever, eventually emits a kernel-rule application that the kernel
checks.  If the kernel rejects, the tactic fails — there is no way
to commit a bogus proof.

This means:

- A buggy user-defined tactic can fail loudly, but cannot produce a
  false theorem.
- An LLM-generated proof step (see **[LLM tactic
  protocol](/docs/tooling/llm-tactic)**) gets re-checked by the
  kernel; LLM hallucinations cannot pollute the corpus.
- A misconfigured automation (`auto` returning a wrong term) is
  caught at the boundary, not after the proof is committed.

The kernel is small (a fixed set of inference rules — 18 in
Verum's V0 surface).  Everything you read about in this page is
**outside** the kernel: tactics, combinators, simplifiers, proof
search.  The kernel doesn't care which tactic produced a term; it
only checks that the term is well-formed.  This separation is what
makes Verum's trust boundary tight.

---

## Why combinators?

A small set of tactics handles individual goals, but you need to
compose them: "do this, then that"; "try this, fall back to that";
"repeat this until the goal stops changing"; "do this on every
remaining goal".  These compositions are the **combinators**.

Verum ships exactly 15 canonical combinators because they cover
every composition pattern with no overlap and no gap:

| Need | Combinator |
|---|---|
| run two tactics in order | `seq` (`a ; b`) |
| try `a`; if it fails, try `b` | `orelse` (`a \|\| b`) |
| try several alternatives, keep the first that works | `first_of` (`first { … }`) |
| run a tactic up to a fixed point | `repeat` |
| same but bounded by a count | `repeat_n` |
| try a tactic; do nothing if it fails | `try` |
| commit to fully closing the goal | `solve` |
| a tactic that always succeeds without doing anything | `skip` |
| a tactic that always fails | `fail` |
| run a tactic on every open goal | `all_goals` |
| focus on the i-th open goal | `index_focus` |
| focus on a goal by label | `named_focus` |
| split branches one-to-one across the open goals | `per_goal_split` |
| introduce a forward-style intermediate fact | `have` |
| apply a lemma with explicit arguments | `apply_with` |

Together they form a small, complete algebra.  The proof
simplifier uses the algebraic laws below to canonicalise tactic
expressions before the kernel sees them — `skip ; t` becomes `t`,
`(t || u) || v` becomes `t || (u || v)`, and so on.

---

## End-to-end worked example

Let's prove a theorem from scratch using only the canonical
combinators.

The claim: **for every integer x, if x is positive, then x + 1 is
also positive**.

```verum
mount core.proof.tactics.*;          // bring the standard tactics into scope

@verify(formal)
public theorem succ_pos_explicit(x: Int)
    requires x > 0
    ensures x + 1 > 0
    proof by {
        // Step 1: introduce the hypothesis `x > 0` into the
        // local context as a named hypothesis `h`.
        intro h

        // Step 2: rewrite the goal using simple arithmetic.
        // `linarith` is a decision procedure for linear arithmetic
        // over integers — it sees `h : x > 0` and proves
        // `x + 1 > 0`.
        linarith
    };
```

Two tactics.  The kernel walks them:

- `intro h` — sees `forall x. x > 0 -> x + 1 > 0` (the elaborated
  goal); introduces `x` and binds `x > 0` as `h`; new goal: `x + 1 > 0`.
- `linarith` — sees the goal `x + 1 > 0` with `h : x > 0` in
  scope; runs the linear-arithmetic decision procedure; produces a
  closed proof; the goal stack is now empty.

Proof complete.  The kernel emits the certificate, the closure
hash is recorded (see **[Incremental
cache](/docs/tooling/incremental-cache)**), and the theorem is
permanently part of the corpus.

If you write a wrong tactic — say `apply some_nonsense_lemma` —
the kernel produces a structured rejection telling you which step
failed and why.  See **[Proof repair](/docs/tooling/proof-repair)**
for the structured-suggestion engine that turns those rejections
into actionable fixes.

---

## The 15 canonical combinators

The catalogue is the **single source of truth** for Verum's
tactic system.  IDE completion, the documentation generator, the
proof simplifier, and CI shape-pinning all read from it.  The
`verum tactic` subcommand surfaces the catalogue programmatically.

### Categories

The 15 combinators group into 5 conceptual categories:

| Category | Members | Role |
|---|---|---|
| **identity** | `skip`, `fail` | Identity elements for `seq` / `orelse` (algebraic neutrality). |
| **composition** | `seq`, `orelse`, `first_of` | Combine multiple tactics into one. |
| **control** | `repeat`, `repeat_n`, `try`, `solve` | Control evaluation flow (loops, soft-fail, total-discharge guard). |
| **focus** | `all_goals`, `index_focus`, `named_focus`, `per_goal_split` | Direct attention across the open-goal stack. |
| **forward** | `have`, `apply_with` | Lean / SSReflect-style forward chaining. |

`verum tactic list --category <C>` filters by category; `verum
tactic explain <name>` gives the full doc for a single combinator.

### Identity

#### `skip`

Identity tactic.  Always succeeds, leaves the proof state
unchanged.  Identity element for `seq`: `skip ; t ≡ t ≡ t ; skip`.

You'd never write `skip` standalone, but it's load-bearing in
conditional combinators:

```verum
if has_hypothesis(h) { intro } else { skip }
```

If `h` is in scope, `intro` runs; otherwise the conditional
collapses to a no-op.

#### `fail`

Always-failing tactic.  Identity element for `orelse`: `fail || t
≡ t`.  Forces the user to provide a successful branch in
chains where falling through to "do nothing" would be a bug:

```verum
first { specialised_tactic | fail }
//      ^^^^^^^^^^^^^^^^^^   ^^^^
//      MUST close the goal; no fallback.
```

### Composition

#### `seq` (`t1 ; t2`)

Sequential composition: run `t1`, then run `t2` on every resulting
subgoal.  Associative; the simplifier canonicalises to
right-association.

```verum
intro ; split ; auto
```

This runs `intro`, then on each open goal runs `split`, then on
each resulting goal runs `auto`.

#### `orelse` (`t1 || t2`)

Choice: try `primary`; if it fails, try `fallback`.  The first
success wins.  Used heavily in dispatch chains:

```verum
ring || nlinarith
```

`ring` is fast but only handles ring identities; `nlinarith` is
slower but more general.  Try `ring` first; on failure, fall back.

#### `first_of` (`first { t1; t2; … }`)

First-success choice over a list.  Equivalent to nested `orelse`
but reads better at three+ alternatives.  Singleton form
collapses: `first_of([t]) ≡ t`.

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

This keeps simplifying and rewriting until the term stabilises.

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

Run `norm_num` if it applies; otherwise leave the state alone and
move on.  Useful as a "nice-to-have" prefix.

#### `solve` (`solve { t }`)

**Total-discharge guard.** Runs `body`; if any goal remains open,
FAILS the whole tactic.  This is the strongest contract a
combinator can declare: it commits to fully closing the focused
goal.

```verum
solve { intro ; auto }   // commits to fully closing the goal
```

Algebraic law: `solve { skip } ≡ fail` whenever goals remain
non-empty.  Use `solve` at proof leaves where you expect total
discharge — if your "automation" leaves a goal open by mistake,
`solve` surfaces it instead of letting the proof silently
half-succeed.

### Focus

#### `all_goals` (`all_goals { t }`)

Apply `body` to every open goal independently.  Fails if `body`
fails on any goal.  Often paired with branching tactics:

```verum
split ; all_goals { auto }
```

After `split` produces two goals (`A` and `B`), `all_goals { auto
}` runs `auto` on each.

`all_goals { skip } ≡ skip` — applying skip to every goal is
operationally a no-op.

#### `index_focus` (`i: t`)

Focus on the `i`-th goal (1-based).  Runs `body` on that goal
alone; other goals are preserved for later.

```verum
split ; 1: { auto } ; 2: { ring }
```

After `split` produces two goals, run `auto` on the first and
`ring` on the second.

#### `named_focus` (`case label => t`)

Focus on the goal labelled `label`.  Goal labels come from
`intro_as` / `case` introductions.

```verum
destruct h ;
  case left  => { auto } ;
  case right => { contradiction }
```

When `destruct h` produces two named goals (`left` and `right`),
each handler runs only on its labelled branch.

#### `per_goal_split` (`[t1; t2; t3]`)

Distribute branches across the open goals one-to-one.  Fails if
the goal count differs from the branch count — the strict match is
intentional: silently dropping a branch when the goal count is
less than expected hides logic errors.

```verum
split ; [ auto ; ring ]
```

The first branch handles the first goal, the second branch
handles the second.  If `split` produced three goals instead of
two, the tactic fails immediately.

### Forward

Forward-style combinators introduce intermediate facts the rest of
the proof can cite by name.  This contrasts with backward chaining
(`intro` / `apply`) which works backwards from the goal.

#### `have` (`have h : T := { proof }`)

Forward-style hypothesis introduction.  Proves `T` via `proof`,
binds it as `h`, and continues with the original goal.

```verum
have h : x > 0 := { norm_num } ; rewrite_with(h)
```

After this, `h` is a hypothesis you can cite later in the proof.
Fails if `proof` does not discharge `T` — the bound name only
enters scope on success.

#### `apply_with` (`apply X with [a, b, …]`)

Explicit-instantiation lemma application.  Used when type
inference can't pick the right witness.  The arguments substitute
into the lemma's type variables in declaration order; mismatched
arity fails immediately.

```verum
apply add_comm with [a, b]
```

Equivalent in spirit to `apply add_comm; instantiate(a); instantiate(b)`,
but in one line.

---

## The 12 algebraic laws

The proof simplifier exploits these identities to canonicalise
tactic expressions before evaluation.  Understanding them is
useful when you read or debug a proof term — the simplifier may
have rewritten what you wrote.

| Law | Statement |
|---|---|
| `seq-left-identity` | `skip ; t                     ≡ t` |
| `seq-right-identity` | `t ; skip                     ≡ t` |
| `seq-associative` | `(t ; u) ; v                  ≡ t ; (u ; v)` |
| `orelse-left-identity` | `fail \|\| t                  ≡ t` |
| `orelse-right-identity` | `t \|\| fail                  ≡ t` |
| `orelse-associative` | `(t \|\| u) \|\| v            ≡ t \|\| (u \|\| v)` |
| `repeat-zero-is-skip` | `repeat_n(0, t)               ≡ skip` |
| `repeat-one-is-body` | `repeat_n(1, t)               ≡ t` |
| `try-equals-orelse-skip` | `try { t }                    ≡ t \|\| skip` |
| `solve-of-skip-fails-when-open` | `solve { skip }               ≡ fail (when goals open)` |
| `first-of-singleton-collapses` | `first_of([t])                ≡ t` |
| `all-goals-of-skip-is-skip` | `all_goals { skip }           ≡ skip` |

Every law is keyed to its participating combinators in the JSON
schema below.

---

## CLI surface

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

Without `--category`, `count` is always 15.  With `--category <C>`,
`count` is the cardinality of that category.  The five categories
sum to 15.

### `verum tactic explain <name>`

Full doc for a single combinator: signature, semantics, example,
the algebraic laws this combinator participates in (with `lhs ≡
rhs` rendering and rationale), and a stable `doc_anchor` used by
the documentation generator.

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

Unknown names produce a non-zero exit:

```text
unknown tactic 'X' — run `verum tactic list` for the full catalogue
```

### `verum tactic laws`

The 12 canonical algebraic laws as a structured list.  Every law
referenced from a combinator entry MUST appear in this inventory —
the catalogue is the single source of truth for both the docs
generator and the proof simplifier.

```json
{
  "schema_version": 1,
  "count": 12,
  "laws": [
    {
      "name": "seq-left-identity",
      "lhs": "skip ; t",
      "rhs": "t",
      "rationale": "skip is the left identity for sequential composition...",
      "participants": ["skip", "seq"]
    }
  ]
}
```

---

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

For every wrapped tactic the underlying combinator is documented
on this page; for the wrappers themselves see the per-module
reference under **[Reference → tactics](/docs/reference/tactics)**.

---

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

// Apply a lemma with up to two arguments inferred.
tactic apply_or_apply_with(lemma: Tactic) {
    apply(lemma) || try { apply_with(lemma, []) }
}
```

The simplifier applies the 12 algebraic laws to every tactic
expression before execution, so `algebra_try() ; skip` collapses to
just `algebra_try()` automatically.

---

## CI usage

Pinning the catalogue's shape is the standard CI gate:

```bash
# Block any future commit that adds / removes a combinator without
# updating the rest of the toolchain.
verum tactic list --format json | jq '.count' | grep -q '^15$'
verum tactic laws --format json | jq '.count' | grep -q '^12$'
```

This catches a class of bugs where a tactic surface evolves
without the simplifier or documentation pipelines being updated to
match.

---

## Mental-model summary

- A **tactic** is a small instruction for one proof step.
- A **proof body** is a sequence of tactics that walks the open-
  goal stack to empty.
- The **kernel** verifies every step; tactics outside the kernel
  cannot construct false theorems.
- A **combinator** composes tactics: sequencing, choice,
  iteration, focus, forward chaining.
- Verum ships 15 canonical combinators and 12 algebraic laws, all
  surfaced via `verum tactic`.
- The catalogue is the single source of truth — IDE / docs /
  simplifier / CI all read from it.

---

## Cross-references

- **[Verification → tactic DSL](/docs/verification/tactic-dsl)** —
  surface syntax and macro-level semantics for *writing* custom
  tactics.
- **[Verification → proofs](/docs/verification/proofs)** — the
  proof-body grammar and how tactics relate to the kernel.
- **[Reference → tactics](/docs/reference/tactics)** — full
  per-tactic reference for every `tactic` in
  `core.proof.tactics.*`.
- **[Auto-paper generator](/docs/tooling/auto-paper)** — uses the
  `doc_anchor` field for stable cross-format hyperlinks.
- **[Proof drafting](/docs/tooling/proof-drafting)** — when you're
  stuck on a goal, ask the suggestion engine which tactic to apply
  next.
- **[Proof repair](/docs/tooling/proof-repair)** — when the kernel
  rejects a tactic, ask the repair engine for ranked structured
  fixes.
- **[LLM tactic protocol](/docs/tooling/llm-tactic)** — the
  LCF-style fail-closed loop that lets LLMs propose tactics
  without compromising the kernel's trust boundary.
- **[Incremental cache](/docs/tooling/incremental-cache)** — once
  a proof is accepted, its closure hash is cached so subsequent
  runs skip the kernel re-check.
