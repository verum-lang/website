---
title: "`@logic` functions for reflection"
description: "Extending the refinement vocabulary with named predicates the SMT solver understands."
---

# `@logic` functions

`@logic` tells the compiler: "reflect this function into the SMT
solver as an axiom, so refinements can use it."

### When you need one

Refinement types are expressive but decidable. Complex predicates
— sortedness, tree balance, graph connectivity — are expensive or
undecidable for the solver in raw form. Extracting them as named
`@logic` functions makes them **reusable axioms**.

### Anatomy

```verum
@logic
fn is_sorted<T: Ord>(xs: &List<T>) -> Bool {
    forall i in 0..xs.len() - 1. xs[i] <= xs[i + 1]
}
```

Rules:

- **Pure**: no mutation, no IO, no context.
- **Total**: every input produces an answer; termination provable.
- **Closed**: no free variables (captured from environment).
- **Decidable body**: the body must be expressible in the refinement
  fragment (comparisons, arithmetic, bounded quantifiers, `@logic`
  function calls, indexing, member access).

If any rule is violated, the compiler rejects reflection:

```
error[V6201]: @logic function violates purity
  --> src/logic.vr:3:5
   |
 3 |     print(&f"checking {xs:?}");
   |     ^^^^^ call to side-effecting `print`
```

### Use in refinement types

```verum
type Sorted<T: Ord>       is List<T> { is_sorted(self) };
type Unique<T: Eq + Hash> is List<T> { is_unique(self) };
type Balanced<T>           is Tree<T> { is_balanced(self) };
```

### Use in contracts

```verum
@verify(formal)
fn insert_sorted<T: Ord>(xs: &mut Sorted<T>, x: T)
    where ensures is_sorted(self),
          ensures self.len() == old(self.len()) + 1
{ ... }
```

### Composing `@logic` functions

```verum
@logic
fn is_valid_rbtree<T: Ord>(t: &RBTree<T>) -> Bool {
    is_bst(t) && has_proper_colours(t) && balanced_black_depth(t)
}

@logic fn is_bst<T: Ord>(t: &RBTree<T>) -> Bool                  { /*...*/ }
@logic fn has_proper_colours<T: Ord>(t: &RBTree<T>) -> Bool       { /*...*/ }
@logic fn balanced_black_depth<T: Ord>(t: &RBTree<T>) -> Bool     { /*...*/ }
```

Each `@logic` is reflected independently; composed predicates are
just function calls from the solver's point of view.

### Recursive `@logic` — termination

```verum
@logic
fn tree_depth<T>(t: &Tree<T>) -> Int
    where decreases t.size()
{
    match t {
        Tree.Leaf                       => 0,
        Tree.Node { left, right, .. }   => 1 + max(tree_depth(left), tree_depth(right)),
    }
}
```

`decreases` is required for recursive `@logic` functions so the
compiler can prove termination. Common well-founded measures:

- `xs.len()` for lists.
- `t.size()` for trees.
- `n - i` in loops.
- Lexicographic pair: `(outer.len(), inner.len())`.

### Inside the solver

`is_sorted` becomes an SMT axiom that looks like:

```
(define-fun-rec is_sorted ((xs (List T))) Bool
  (forall ((i Int))
    (=> (and (>= i 0) (< i (- (List.len xs) 1)))
        (<= (List.get xs i) (List.get xs (+ i 1))))))
```

See the actual query with:

```bash
$ verum verify --emit-smtlib path/to/file.vr
# writes target/smtlib/*.smt2
```

### Performance

- **Reflected predicates are memoised**: the solver handles
  repeated calls once.
- **Reuse across obligations**: a single `is_sorted` definition is
  used by many theorems — no redundant work.
- **Small = fast**: prefer short `@logic` functions that decompose
  complex predicates into smaller ones. `is_sorted && all_positive`
  reuses two independent facts.

### When the solver still can't prove

Even with `@logic`, some predicates are too hard:

- **Unbounded existential in negative position**: `!exists x: Int. P(x)`
  forces the solver to prove absence across all integers. Either bound
  the search or supply a manual proof.
- **Non-linear arithmetic with quantifiers**: escalate to
  `@verify(thorough)` — races CVC5 (whose cylindrical algebraic
  decomposition handles these well) with Z3 and tactics.
- **Higher-order**: `@logic` functions can't take function arguments.
  Specialise or use a tactic.

### Pitfalls

- **Shadowing the solver's view**: a `@logic` definition can make the
  solver "know" things your runtime function doesn't. Keep them in
  sync — ideally the `@logic` **is** the runtime implementation
  (the compiler can verify this alignment).
- **Complex recursion**: avoid mutual recursion unless necessary;
  the solver handles structural recursion but struggles with
  measure-based recursion on multi-argument functions.

### See also

- **[Verification → refinement reflection](/docs/verification/refinement-reflection)**
- **[Verified data structure tutorial](/docs/tutorials/verified-data-structure)**
  — real `@logic` use.
- **[proof](/docs/stdlib/proof#refinement-reflection--reflectionvr)** —
  internal data types.
