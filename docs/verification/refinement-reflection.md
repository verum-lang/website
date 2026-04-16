---
sidebar_position: 2
title: Refinement Reflection
description: "@logic functions — extending the refinement vocabulary with user-defined predicates."
---

# Refinement Reflection

Refinement predicates can call user-defined functions — but only if the
functions are **reflected** into the SMT logic. Reflection is Verum's
mechanism for extending the refinement vocabulary.

This page explains:

- Why reflection is necessary.
- What kinds of functions can be `@logic`.
- How reflected functions are encoded for the solver.
- Best practices for writing reflection-friendly code.
- Limitations and workarounds.

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

## Best practices

### Keep `@logic` functions minimal

Large `@logic` bodies explode the SMT solver's context. Prefer many
small `@logic` helpers that compose — the solver handles a conjunction
of small definitions better than one complex one.

```verum
// Prefer this:
@logic fn is_balanced(t: &Tree) -> Bool { ... }
@logic fn is_ordered(t: &Tree) -> Bool { ... }
@logic fn is_bst(t: &Tree) -> Bool { is_balanced(t) && is_ordered(t) }

// Over this:
@logic fn is_bst(t: &Tree) -> Bool {
    /* 40-line predicate inlined */
}
```

### Bounded recursion over structures

Recursion over a finite structure (list, tree, natural number) with
a `decreases` clause is routinely supported. Recursion over an
unbounded type (e.g. `Int` without lower bound) can confuse the
termination checker; add `requires n >= 0`.

### Expose invariants as types, not as function preconditions

If `f(x: T)` needs `is_valid(x)` to reason, make `x: T { is_valid(self) }`
a refinement on the parameter. Callers prove it once at the boundary;
the body assumes it everywhere.

### Avoid non-linear arithmetic unless you need it

`x * y` with both sides symbolic forces the solver into non-linear
arithmetic (slower, sometimes incomplete). For `x * constant` or
`constant * y`, the goal remains linear. Multiply by concrete values
when possible.

### Cache-friendly signatures

`@logic` functions are memoised per-argument at the SMT level.
Large structural arguments (full trees, long lists) blow out the
cache. Prefer local invariants that reason about a subset.

## Writing a reflection-heavy module

A typical pattern for a data structure with invariants:

```verum
// --- invariants.vr --- reflective predicates only
@logic
fn has_no_red_red(t: &Tree) -> Bool { ... }

@logic
fn is_black_balanced(t: &Tree) -> Bool { ... }

@logic
fn is_bst_ordered(t: &Tree) -> Bool { ... }

@logic
fn is_rb(t: &Tree) -> Bool {
    has_no_red_red(t)
    && is_black_balanced(t)
    && is_bst_ordered(t)
}

// --- tree.vr --- types and operations
type RBTree is Tree { is_rb(self) };

@verify(formal)
fn insert(t: RBTree, k: Int) -> RBTree
    where ensures is_rb(result),
          ensures contains(result, k)
{ ... }

// --- proofs.vr --- optional, if `auto` can't close
lemma insert_preserves_rb(t: RBTree, k: Int)
    ensures is_rb(insert(t, k))
{
    proof by induction t
}
```

Three files:

1. `invariants.vr` — pure, `@logic`, reusable.
2. `tree.vr` — implementation using refined types.
3. `proofs.vr` — manual lemmas where automation falls short.

## Limitations

### First-order only

`@logic` functions cannot take higher-order arguments (no
function-typed parameters). A `@logic fn map<A, B>(f: fn(A) -> B,
xs: List<A>) -> List<B>` is rejected. Reason: SMT quantification
over function space is undecidable in general.

**Workaround**: specialise. Instead of `map(double, xs)`, write
`@logic fn double_all(xs: List<Int>) -> List<Int> { ... }`.

### No references

Refinements talk about values, not memory. A `@logic` function
cannot dereference `&T`. Workaround: define the predicate on the
owned value type; callers pass by value (costs a `Clone`).

### No effects

`@logic` cannot read the clock, environment, IO, or random. Makes
sense — the solver runs at compile time without those resources.

### No exceptions

`@logic` functions cannot `throw`, `panic`, or return `Result.Err`.
A total function that *might* fail should return `Maybe<T>`.

### No `async`

Obvious: the solver is synchronous. `async fn @logic` is rejected.

For invariants that need state (imperative loop invariants, heap
shapes), use loop `invariant` clauses or separation logic — see
**[Contracts](/docs/verification/contracts)**.

## Diagnostic cheatsheet

| Message                                     | Cause                                                     |
|---------------------------------------------|-----------------------------------------------------------|
| `V6100: @logic call of non-logic function`  | You called an ordinary function; mark it `@logic`.         |
| `V6101: @logic function cannot return unit` | `@logic` must produce a value; `()` is meaningless.        |
| `V6102: @logic body uses effects`           | Pure-only; remove the IO/mutation.                         |
| `V6103: @logic recursion without decreases` | Add `where decreases <measure>`.                           |
| `V6104: solvers disagreed on obligation`    | Rare SMT bug; manual review (above).                       |
| `V6105: refinement not decidable`           | Reflection failed — the function uses unreachable theory.  |
| `V6106: reflection cache stale`             | Rebuild with `verum clean` to invalidate.                   |

## Performance notes

Reflection adds compile time. On a 50k LOC project with ~500 refined
types and ~100 `@logic` functions, expect:

- **First build**: 3-10 s of SMT time total.
- **Incremental builds**: 50-500 ms, mostly cache hits.
- **`@verify(thorough)` on everything**: 30-90 s (parallel workers
  help).

If verification dominates your build, scope `formal` / `thorough` to
the files that need it; leave the rest at `static`.

## See also

- **[SMT routing](/docs/verification/smt-routing)** — how the router
  picks Z3 or CVC5 for your `@logic` function.
- **[Contracts](/docs/verification/contracts)** — `requires`,
  `ensures`, `invariant`.
