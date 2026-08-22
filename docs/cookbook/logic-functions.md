---
title: "Reflection-friendly predicates"
description: "Writing pure functions the solver can unfold, and what to do when a predicate falls outside the fragment."
---

# Reflection-friendly predicates

Refinement types and theorem goals are more useful when they can call
the predicates your program already defines. That works when the
predicate is **reflected** — turned into an SMT definition the solver
unfolds. Reflection is automatic: there is no attribute to write. What
you control is whether a function *qualifies*.

The mechanism, the exact translated fragment and the emitted SMT-LIB
are documented in
**[Verification → Refinement reflection](/docs/verification/refinement-reflection)**.
This page is about writing code that lands on the right side of it.

## The shape that qualifies

```verum
public pure fn is_positive(n: Int) -> Bool {
    n > 0
}
```

Four requirements, all checked mechanically:

- **Pure** — no `using [...]` contexts. A function whose result can
  depend on injected state has no fixed meaning to axiomatise.
- **One expression** — the body is a single expression, or a block
  whose only content is a tail expression. A multi-statement body is
  not reflected.
- **Parameterised** — a nullary function is a constant, not a
  definition worth unfolding.
- **Inside the fragment** — arithmetic, comparisons, boolean
  connectives, `if`/`else`, calls to other reflected functions, `match`
  over nullary variants, field access, and protocol-method calls.

A function that misses any of these is not rejected — it simply stays
an uninterpreted symbol, and goals mentioning it stay unconstrained.
That silence is the thing to watch for.

## Predicates over records

Field access reflects, so a witness record's predicate is a normal
function:

```verum
type Witness is { pnt_asymptotic: Bool, zeta_bridge: Bool };

public pure fn pnt_predicate(w: &Witness) -> Bool {
    w.pnt_asymptotic
}

public pure fn chain_predicate(w: &Witness) -> Bool {
    pnt_predicate(w) && w.zeta_bridge
}
```

Both reflect: the first through a field projection, the second through
that projection plus a call to the first.

## Predicates over protocol receivers

Method calls reflect too, including chains — the receiver type of an
outer call is the return type of the inner one:

```verum
public pure fn admissible(c: &Candidate) -> Bool {
    c.cond_F_S().has_phi_X()
}
```

## Composing

Compose freely; each reflected function is an independent definition
and a composite is just a call from the solver's point of view.

```verum
public pure fn layer_predicate(p: &RefinedPrimitive) -> Bool {
    base_layer(p) && realisation_layer(p) && extension_layer(p)
}
```

Keep leaves small. A leaf that falls outside the fragment takes its
callers down with it — see below.

## When a leaf fails, the aggregate is reported

The reflection registry closes under its call graph: if a leaf is not
reflectable, every function that calls it is dropped too, because a
block naming an undeclared symbol makes the solver reject the whole
block. The warning names the **leaf**:

```
warning: refinement reflection: skipping `chain_predicate` — its body
references `helper`, which is neither a parameter nor another reflected
function; reflecting it would invalidate the module's entire SMT block.
Other reflections are unaffected.
```

Read it as a pointer to `helper`, not as a verdict on
`chain_predicate`. Make the leaf qualify and the aggregate follows.

## Recursion

Recursive predicates are **not** reflected today: there is no
`decreases`-checked recursive encoding, so a function that calls itself
stays uninterpreted. Structural properties over recursive data
(sortedness of a cons-list, tree balance) are therefore expressed as
protocol methods or record fields and reasoned about through their
projections.

Where the recursive formulation is what you need, keep the function
unreflected and state what it guarantees as explicit `requires` /
`ensures` on the theorem that consumes it. That is honest: the
obligation moves to a place a reader can see, instead of relying on an
unfolding that never happens.

## When a goal will not close

Ask the prover what it did:

```bash
$ VERUM_TRACE_PROOFS=1 verum verify path/to/file.vr
```

The trace names each tactic, the goal it faced, how a lemma was
instantiated, and both sides of a failed unification. Two failures look
alike from the outside and are opposite inside: a predicate that never
reflected (goal unconstrained) and a premise that is genuinely not
among the hypotheses.

## Pitfalls

- **The runtime function and the definition are the same thing.**
  Because reflection is automatic and reads the body you wrote, they
  cannot drift — but this also means editing a `pure fn` edits an
  axiom. Treat such edits as proof-affecting.
- **Higher-order predicates.** A reflected function cannot take a
  function argument; specialise it.
- **Unbounded existentials in negative position.** `!exists x: Int.
  P(x)` asks the solver to prove absence across all integers; bound the
  search or supply a proof.
- **Non-linear arithmetic under quantifiers.** Escalate the strategy —
  see **[gradual verification](/docs/verification/gradual-verification)**
  for the ladder and what each rung costs.

## See also

- **[Verification → refinement reflection](/docs/verification/refinement-reflection)**
  — the fragment, the sorts, the emitted SMT-LIB, the closure gate.
- **[Proof honesty](/docs/verification/proof-honesty)** — what a verdict
  may claim and how it must say where it came from.
- **[proof](/docs/stdlib/proof#refinement-reflection--reflectionvr)** —
  the internal data types.
