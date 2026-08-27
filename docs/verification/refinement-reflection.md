---
sidebar_position: 2
title: Refinement Reflection
description: "Pure functions become SMT definitions, so refinements and theorems can speak the vocabulary your program already uses."
---

# Refinement Reflection

Refinement predicates and theorem goals can call your own functions —
but the solver only knows what a call *means* if the function has been
**reflected** into the SMT logic. Reflection is how Verum extends the
refinement vocabulary with the predicates a program already defines.

This page explains what gets reflected, what a reflected function turns
into, and where the boundary currently sits.

## The problem

The refinement language is decidable on purpose: arithmetic, booleans,
comparisons. That is why `self.len() > 0` needs no heroics.

Realistic invariants need domain predicates. Is a witness complete? Is
a tree balanced? Does a configuration satisfy its layer conditions?
These are yours; the solver does not know them unless it is told.

Told *how* matters. An unreflected `p(w)` reaches the solver as an
opaque application with no defining axiom: goals mentioning it are
neither true nor false, they are unconstrained — which shows up as an
unproved goal even when the fact is available verbatim as a hypothesis.

## What gets reflected

Reflection is automatic — there is no attribute to write. Every
function in the module is offered to the reflector, and one is admitted
when it is:

- **Pure** — declares no contexts (`using [...]` makes a function
  ineligible; its result may depend on injected state).
- **Straight-line** — the body is one expression, or a block built from
  `let` bindings and early-return guards ending in a tail expression.
  Anything else — a loop, a `match` with payload patterns, a mutation —
  declines the whole reflection rather than reflecting part of it.
- **Parameterised** — nullary functions are constants, not definitions
  worth unfolding.
- **Expressible** — the body translates into the SMT fragment below.

A function that fails any of these is simply not reflected: it stays an
uninterpreted symbol. No incorrect axiom is ever emitted — the
translator refuses rather than approximates.

```verum
// Reflected: pure, one expression, parameterised.
public pure fn is_positive(n: Int) -> Bool {
    n > 0
}

// Reflected: `let` bindings fold into the tail.
public pure fn doubled_differs(n: Int) -> Bool {
    let d = n + n;
    d != n + 1
}

// Reflected: early-return guards become nested `if … else`, which is
// what a lexicographic comparison is written as.
public pure fn older(a: &Version, b: &Version) -> Bool {
    if a.major != b.major {
        return a.major < b.major;
    }
    if a.minor != b.minor {
        return a.minor < b.minor;
    }
    a.patch < b.patch
}

// Reflected: field access over a record witness.
public pure fn pnt_predicate(w: &Witness) -> Bool {
    w.pnt_asymptotic
}

// Reflected: an aggregate over other reflected functions.
public pure fn chain_predicate(w: &Witness) -> Bool {
    pnt_predicate(w) && w.zeta_bridge
}
```

## What the translator expresses

`verum_smt::expr_to_smtlib` covers:

| Verum | SMT-LIB |
|---|---|
| integer / boolean / float literals | `42`, `true`, `3.5` |
| parameters and variables | bare symbols |
| `+ - * / %` | `+ - * div mod` |
| `== != < <= > >=` | `= (not (= …)) < <= > >=` |
| `&& \|\| ! =>` | `and or not =>` |
| `if c { t } else { e }` | `(ite c t e)` |
| `f(a, b)` | `(f a b)` |
| `match k { K.A => …, K.B => … }` over nullary variants | right-to-left `ite` chain guarded by `(= k path_K.A)` |
| `let x = e; …` | substituted into what follows |
| `if c { return t; } rest` | `(ite c t rest)` |
| `w.field` | `(Verum!proj!W!field w)` |
| `p.method(args)`, including chains | `(Verum!method!P!method p args…)` |

The last two rows are what let a predicate over a **record witness** or
a **protocol receiver** reflect at all. Both lower to uninterpreted
projection symbols over the receiver's sort: the solver learns nothing
about the field's *value*, only that one receiver always projects to
one value — which is exactly what a field-conjunction body and a
hypothesis about the same receiver need in order to meet.

Anything else — loops, variant patterns with payloads, guarded match
arms, an `if` whose block does more than return one value — makes the
function unreflected rather than mistranslated.

The `let` and guard rows are substitutions into a body the solver then
trusts, so their ORDER is part of the contract: a guard is folded with
the bindings written before it and none of those after, because a
binding that follows a guard is only reached when the guard did not
fire — which is exactly the else-branch that guard becomes.

## Sorts

A reflected signature must name the same sorts the goal side names, or
the two emit conflicting symbols and the solver treats them as
unrelated. Both translators therefore answer from one authority:

| Verum type | Sort |
|---|---|
| `Int` and the integer family | `Int` |
| `Float` family | `Real` |
| `Bool` | `Bool` |
| `Text` | `String` |
| `&T` | the sort of `T` — a reference carries its referent's facts |
| a record or variant type declared in the program | `Verum!<Name>`, uninterpreted |
| a variant CONSTANT `K.A` | `Verum!K` — the same sort its parameters carry |
| anything else, including a generic like `List<T>` | `Int` |

A type the program declares is opaque **under its own name**, never a
scalar. That distinction is load-bearing: substituting `Int` for a
record turns a projection into arithmetic that means nothing, and a
solver can then "prove" things about it.

The last row is the other half. `List<Authority>` is not a name the
verifier knows a shape for, and every generic would collapse into the
same opaque sort if it got one — so it stays `Int`, which is what the
goal side gives such a value, and the two agree.

Types a module MOUNTS count as declared: the shapes come from every
module the check loaded, not only from the file being verified.

## What a reflected function becomes

Two lines per function, plus whatever declarations its body needs:

```smt2
; declarations the body depends on
(declare-sort Verum!Witness 0)
(declare-fun Verum!proj!Witness!pnt_asymptotic (Verum!Witness) Bool)

; the function itself
(declare-fun pnt_predicate (Verum!Witness) Bool)
(assert (forall ((w Verum!Witness))
  (= (pnt_predicate w) (Verum!proj!Witness!pnt_asymptotic w))))
```

Sort declarations are emitted before the functions that use them, and
identical declarations coming from several functions are emitted once.

## The closure gate

A body that names a symbol the block never declares makes the solver
reject the **entire** block — every reflection in the module, not just
the offending one. The registry therefore closes itself under its call
graph: an entry whose body references something neither declared nor
reflected is dropped, iterating to a fixpoint because dropping one
entry can open its callers.

Each drop is reported, never silent:

```
warning: refinement reflection: skipping `chain_predicate` — its body
references `helper`, which is neither a parameter nor another reflected
function; reflecting it would invalidate the module's entire SMT block.
Other reflections are unaffected.
```

Reading this warning as "the aggregate is unreflectable" is the wrong
conclusion — it names the *leaf* that failed. Make the leaf reflectable
and the aggregate follows.

## Seeing what happened

When a goal will not close, the prover explains itself:

```bash
$ VERUM_TRACE_PROOFS=1 verum verify src/witness.vr
[proof-trace] apply_with lemma=`grounding` args=["w"] goal=`pnt_predicate(w)`
[proof-trace] instantiate_lemma `grounding` args=["w"] targets=["w"]: premises=0 conclusion=`pnt_predicate(w)`
[proof-trace] apply_with unified; emitting 0 premise subgoal(s)
[proof-trace] tactic Apply { … } on `pnt_predicate(w)` -> OK, 0 subgoal(s)
```

The trace names the tactic, the goal it faced, how a lemma was
instantiated, and — when unification fails — both sides of the failure.
See **[Proof honesty](/docs/verification/proof-honesty)** for the wider
discipline this belongs to.

## Current boundary

Reflection today is **non-recursive**: a function whose body calls
itself is not admitted, and there is no `decreases`-checked recursive
encoding. Structural predicates over recursive data (tree balance,
sortedness of a cons-list) are therefore stated as protocol methods or
record fields and reasoned about through their projections, rather than
unfolded.

Multi-statement bodies, loops and payload-carrying variant patterns are
likewise outside the fragment. Where a predicate needs them, the honest
shape is to keep the function unreflected and state the facts it
guarantees as explicit `requires` / `ensures` on the theorem that uses
it.

## Related

- **[Gradual verification](/docs/verification/gradual-verification)** —
  the thirteen strategies and where the SMT layer sits in the ladder.
- **[SMT routing](/docs/verification/smt-routing)** — which solver
  receives an obligation, and why.
- **[Proof honesty](/docs/verification/proof-honesty)** — what a verdict
  is allowed to claim, and how it must say where it came from.
