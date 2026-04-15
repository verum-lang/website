---
sidebar_position: 2
title: Refinement Reflection
---

# Refinement Reflection

Refinement predicates can call user-defined functions — but only if the
functions are **reflected** into the SMT logic. Reflection is Verum's
mechanism for extending the refinement vocabulary.

## The problem

The refinement language is decidable: arithmetic, booleans, bounded
quantifiers, indexing. This is deliberately restrictive so that `self.
len() > 0` and `xs[i] < xs[i+1]` are provable without heroics.

But realistic invariants often need domain predicates. Is a matrix
symmetric? Is a tree balanced? Does a parser state accept empty input?
These are user-defined; the solver does not know them unless we tell
it.

## `@logic` functions

A function marked `@logic` is **reflected** — its body becomes an SMT
axiom.

```verum
@logic
fn is_sorted(xs: &List<Int>) -> Bool {
    forall i in 0..xs.len() - 1. xs[i] <= xs[i + 1]
}

// Now usable in refinements:
type Sorted is List<Int> { is_sorted(self) };

@verify(formal)
fn merge(a: &Sorted, b: &Sorted) -> Sorted { ... }
// The SMT solver knows what `is_sorted` means.
```

## What can be `@logic`

A `@logic` function must be:
- **Pure** — no IO, no mutation, no context.
- **Total** — every input produces a value (termination checked).
- **Expressible** — its body is in the refinement fragment
  (comparisons, arithmetic, quantifiers, calls to other `@logic`
  functions).

Calls to non-`@logic` functions are rejected. Recursion is allowed if
there is a `decreases` clause the compiler can validate.

```verum
@logic
fn tree_depth(t: &Tree) -> Int
    where decreases t.size()
{
    match t {
        Tree.Leaf => 0,
        Tree.Node { left, right, .. } =>
            1 + max(tree_depth(left), tree_depth(right)),
    }
}
```

## How reflection works

At compile time:

1. The compiler collects all `@logic` functions reachable from the
   refinements being checked.
2. Each function is translated to SMT-LIB as a recursive / quantified
   definition, using the solver's native support (Z3's `define-fun-rec`,
   CVC5's `define-fun-rec` with fmf for termination).
3. The axiom is asserted before the obligation is solved.

The translator lives in `verum_smt::expr_to_smtlib`.

## Example — red-black tree invariant

```verum
@logic
fn is_rb(t: &Tree) -> Bool {
    no_red_red(t) && black_balanced(t) && root_is_black(t)
}

@logic
fn no_red_red(t: &Tree) -> Bool {
    match t {
        Tree.Leaf => true,
        Tree.Node { color: Red, left: Heap(Tree.Node { color: Red, .. }), .. } => false,
        Tree.Node { color: Red, right: Heap(Tree.Node { color: Red, .. }), .. } => false,
        Tree.Node { left, right, .. } => no_red_red(left) && no_red_red(right),
    }
}

type RBTree is Tree { is_rb(self) };

fn insert(t: RBTree, k: Int) -> RBTree
    where ensures is_rb(result)
{ ... }
```

The SMT solver proves the postcondition using the `@logic` axioms
directly. No manual proof needed for linear arithmetic cases; for
nonlinear or string-heavy cases, CVC5 is dispatched (see
**[SMT routing](/docs/verification/smt-routing)**).

## Inspecting the generated SMT-LIB

```bash
$ verum verify --emit-smtlib src/tree.vr
```

Produces `target/smtlib/*.smt2` — the exact queries sent to the solver.
Useful for debugging obligations that mysteriously fail.

## Reflection + portfolio

When `@verify(thorough)` is set, both Z3 and CVC5 receive the same
reflected axioms. A disagreement indicates a bug in one of the solvers
and is reported:

```
warning[V6104]: solvers disagreed on obligation
  obligation:  is_rb(insert(t, k))
  z3:          proved (230 ms)
  cvc5:        sat (counter-example: t = Leaf, k = 0)
  action:      downgraded proof to sat=unknown; manual review required
```

Disagreements are rare but diagnostic.

## Limitations

- **First-order only**: `@logic` functions cannot take higher-order
  arguments (no function-typed parameters).
- **No references**: refinements talk about values, not memory.
- **No effects**: `@logic` cannot read the clock or the environment.

For invariants that need state (imperative loop invariants, heap
shapes), use loop `invariant` clauses or separation logic — see
**[Contracts](/docs/verification/contracts)**.

## See also

- **[SMT routing](/docs/verification/smt-routing)** — how the router
  picks Z3 or CVC5 for your `@logic` function.
- **[Contracts](/docs/verification/contracts)** — `requires`,
  `ensures`, `invariant`.
