---
sidebar_position: 32
title: Quantifiers
description: "forall and exists — universally and existentially quantified expressions."
---

# Quantifiers

Verum has **first-class quantifier expressions** — `forall` and
`exists` — usable anywhere an expression is expected: inside refinements,
`ensures` / `requires` clauses, `@verify` checks, and theorem
statements. They are **not** runtime primitives; the compiler lowers
them to SMT terms for the verifier.

## The three binding forms

```ebnf
forall_expr =
    'forall' , quantifier_binding , { ',' , quantifier_binding } , '.' , expression ;

exists_expr =
    'exists' , quantifier_binding , { ',' , quantifier_binding } , '.' , expression ;

quantifier_binding =
    pattern , [ ':' , type_expr ] , [ 'in' , expression ]
    , [ 'where' , expression ] ;
```

The grammar unifies three styles:

### Type-based — *the set is the type*

```verum
forall x: Int. x + 0 == x
exists y: Float. y * y == 2.0
```

Read: "for every integer `x`, `x + 0 == x`", "there exists a float `y`
with `y² = 2`".

### Collection-based — *the set is a value*

```verum
forall x in xs. x > 0
exists u in users. u.is_admin()
```

Read: "every element of `xs` is positive", "there is an admin in
`users`".

The collection expression must implement `IntoIterator` and its item
type is inferred.

### Combined — *explicit type, explicit domain*

```verum
forall x: Int in 0..100. x * 2 < 200
```

Useful when the type of the domain is ambiguous (generics, literals,
slice ranges).

## Guards — `where Q(x)`

An optional `where` clause filters the domain:

```verum
forall x in items where x.is_valid(). x.score > 0
exists n: Int in 0..1000 where n % 7 == 0. n > 500
```

Semantically, `forall x in S where Q(x). P(x)` is `∀ x∈S. Q(x) ⇒ P(x)`;
`exists x in S where Q(x). P(x)` is `∃ x∈S. Q(x) ∧ P(x)`.

## Multiple binders

Quantifiers take a comma-separated list of bindings:

```verum
forall x: Int, y: Int. x + y == y + x

exists i in 0..xs.len(), j in 0..xs.len()
    where i != j. xs[i] == xs[j]     // list has a duplicate
```

Later binders can reference earlier ones — they are nested left to
right:

```verum
forall i in 0..n, j in 0..i. a[i] >= a[j]    // sorted array
```

Equivalent to the explicit nesting `forall i. forall j. ...`.

## Where they are allowed

### In refinements

Quantifiers on a field's refinement constrain every value:

```verum
type SortedList is List<Int>
    where forall i in 0..self.len()-1. self[i] <= self[i+1];

type UniqueIds is List<Id>
    where forall i in 0..self.len(),
                 j in 0..self.len()
           where i != j. self[i] != self[j];
```

### In `requires` / `ensures`

Function pre- and post-conditions:

```verum
fn dedup<T: Eq>(xs: &List<T>) -> List<T>
    where ensures forall x in result.
                    (xs.contains(x)) &&
                    count(result, x) == 1
{
    ...
}
```

### In `@verify`

SMT-backed spec checks:

```verum
@verify(formal)
fn all_positive(xs: &List<Int>) -> Bool
    where ensures result == (forall x in xs. x > 0)
{
    xs.iter().all(|x| x > 0)
}
```

### In theorems and lemmas

The proof DSL uses them routinely — see
[proof-dsl](/docs/language/proof-dsl):

```verum
theorem sum_nonneg(xs: &List<Int>)
    requires forall x in xs. x >= 0
    ensures  xs.sum() >= 0
{
    proof by induction xs
}
```

## Patterns as binders

The binder is a **pattern**, not just an identifier, so you can
destructure:

```verum
forall (k, v) in map. v > 0
forall Entry { id, priority } in queue. priority >= 0
```

This works because the quantifier binding clause uses the `pattern`
production of the grammar.

## The `.` separator

A quantifier's body is introduced by `.` (a literal dot). It is
always required — it keeps parsing unambiguous between the binder
list and the body:

```verum
forall x: Int. x * 2 == x + x        // ok
forall x: Int x * 2 == x + x         // parse error — need `.`
```

## Semantics and termination

Quantifiers are **pure logic**: they have no runtime execution model.
Verum does not attempt to evaluate them — it checks them.

- Over a **finite** collection (the `in` form), an SMT solver will
  typically unfold the quantifier into a conjunction or disjunction.
- Over an **infinite** type (e.g. `Int`), the verifier relies on the
  SMT theory (`QF_LIA`, `QF_NIA`, `QF_LRA`, arrays, etc.) to discharge
  the goal.

If the SMT router gives up, consider switching to `@verify(thorough)`
(parallel portfolio) or writing an explicit proof via
[proof-dsl](/docs/language/proof-dsl).

## Writing quantifiers that the SMT solver can solve

A few rules of thumb:

1. **Prefer bounded domains.** `forall i in 0..n. ...` is almost always
   easier than `forall i: Int. 0 <= i < n => ...`.
2. **Unfold nested quantifiers.** `forall i. exists j. P` is harder
   than `exists j. forall i. P` when the choice is independent of `i`.
   Reorder if the math allows.
3. **Use refinement types to elide quantifiers.** A type like
   `List<Int> { forall x in self. x > 0 }` pushes the quantifier to
   the type boundary, letting every callsite drop the precondition.
4. **Avoid `exists` in postconditions.** An `ensures` with `exists` is
   a **skolemisation** — the solver must produce a witness. Provide
   one when possible.

## Notation cheatsheet

| ∀ / ∃ form                     | Verum syntax                             |
|--------------------------------|------------------------------------------|
| `∀x: T. P(x)`                  | `forall x: T. P(x)`                      |
| `∃x: T. P(x)`                  | `exists x: T. P(x)`                      |
| `∀x ∈ S. P(x)`                 | `forall x in S. P(x)`                    |
| `∃x ∈ S. P(x)`                 | `exists x in S. P(x)`                    |
| `∀x ∈ S. Q(x) ⇒ P(x)`          | `forall x in S where Q(x). P(x)`         |
| `∃x ∈ S. Q(x) ∧ P(x)`          | `exists x in S where Q(x). P(x)`         |
| `∀x y. P(x, y)`                | `forall x, y. P(x, y)`                   |
| `∀i. ∀j. 0 ≤ j < i < n ⇒ …`    | `forall i in 0..n, j in 0..i. ...`       |

## See also

- **[Refinement Types](/docs/language/refinement-types)**.
- **[Proof DSL](/docs/language/proof-dsl)** — theorems, tactics.
- **[Dependent Types](/docs/language/dependent-types)** — Π/Σ.
- **[verification/smt-routing](/docs/verification/smt-routing)**.
