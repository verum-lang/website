---
sidebar_position: 3
title: A verified data structure
description: Implement a sorted list — and prove the sort invariant with SMT.
---

# A verified data structure

**Time: 60 minutes. Prerequisites: [Refinement types](/docs/language/refinement-types),
[Gradual verification](/docs/verification/gradual-verification).**

We'll build `SortedList<T>` — a list that the type system guarantees
is sorted. The compiler proves every mutation preserves the invariant.

## 1. The type

`src/sorted_list.vr`:

```verum
use core.collections.List;

/// A refinement-typed sorted list: every operation preserves
/// `xs[i] <= xs[i+1]`.
pub type SortedList<T: Ord> is List<T> { is_sorted(self) };

/// The named predicate — reflectable into SMT.
@logic
fn is_sorted<T: Ord>(xs: &List<T>) -> Bool {
    forall i in 0..xs.len() - 1. xs[i] <= xs[i + 1]
}
```

At this point `SortedList<T>` is a refinement of `List<T>` — the
compiler requires every value of this type to satisfy `is_sorted`.

## 2. Construction

```verum
fn empty<T: Ord>() -> SortedList<T>
    where ensures is_sorted(result)
{
    // Vacuously true: empty list has no adjacent pairs.
    List.new()
}

fn singleton<T: Ord>(x: T) -> SortedList<T>
    where ensures is_sorted(result)
{
    list![x]
}
```

The compiler checks both `ensures` clauses. Vacuous quantifiers
discharge immediately — the first proof takes Z3 ~8 ms.

## 3. Insertion

The hard case. We need to prove that inserting at the correct
position preserves sortedness.

```verum
@verify(formal)
fn insert<T: Ord>(xs: SortedList<T>, x: T) -> SortedList<T>
    where ensures is_sorted(result),
          ensures result.len() == xs.len() + 1
{
    let mut out: List<T> = xs.clone();
    // partition_point returns the first index i s.t. out[i] >= x.
    let pos = out.partition_point(|y| *y < x);
    out.insert(pos, x);
    out
}
```

**What the solver needs to prove**:

> ∀ i ∈ 0..out.len() - 1. out[i] ≤ out[i+1]

Z3 gets this from:

1. `pos` satisfies `∀ j < pos. xs[j] < x` and `∀ j ≥ pos. xs[j] ≥ x`
   (axioms of `partition_point`, reflected from `@logic`).
2. The original `xs` is sorted (from the input type).
3. Case-split on `i`: the only interesting case is when `i = pos - 1`
   or `i = pos`, where the new element is adjacent.

## 4. Removal

```verum
@verify(formal)
fn remove_at<T: Ord>(xs: SortedList<T>, index: Int { 0 <= self && self < xs.len() })
    -> (SortedList<T>, T)
    where ensures is_sorted(result.0),
          ensures result.0.len() == xs.len() - 1
{
    let mut out = xs.clone();
    let removed = out.remove(index);
    (out, removed)
}
```

The precondition `0 <= index < xs.len()` makes the indexing safe;
the solver proves that deleting one element preserves sortedness
(any remaining adjacent pair was already a pair in the input).

## 5. Merge

```verum
@verify(formal)
fn merge<T: Ord>(a: SortedList<T>, b: SortedList<T>) -> SortedList<T>
    where ensures is_sorted(result),
          ensures result.len() == a.len() + b.len()
{
    let mut out = List.with_capacity(a.len() + b.len());
    let mut i = 0;
    let mut j = 0;

    while i < a.len() && j < b.len()
        invariant 0 <= i && i <= a.len()
        invariant 0 <= j && j <= b.len()
        invariant out.len() == i + j
        invariant is_sorted(&out)
        invariant forall k in 0..out.len(). forall m in i..a.len(). out[k] <= a[m]
        invariant forall k in 0..out.len(). forall m in j..b.len(). out[k] <= b[m]
        decreases a.len() + b.len() - i - j
    {
        if a[i] <= b[j] {
            out.push(a[i]);
            i += 1;
        } else {
            out.push(b[j]);
            j += 1;
        }
    }
    while i < a.len()
        invariant is_sorted(&out)
        decreases a.len() - i
    {
        out.push(a[i]);
        i += 1;
    }
    while j < b.len()
        invariant is_sorted(&out)
        decreases b.len() - j
    {
        out.push(b[j]);
        j += 1;
    }
    out
}
```

The invariants are the real work. Each line encodes:
1. Loop indices are in bounds.
2. The output's length is the sum of consumed indices.
3. The output is sorted so far.
4. Every element in the output is ≤ every not-yet-consumed element
   from `a`.
5. Same for `b`.

With all five invariants, the solver can discharge the postcondition.
Without (4) and (5), it can't — the final element push would leave
unproven adjacency.

## 6. Tests

```verum
@cfg(test)
module tests {
    use .super.*;

    @test
    fn insert_preserves_sort() {
        let xs: SortedList<Int> = empty();
        let xs = insert(xs, 3);
        let xs = insert(xs, 1);
        let xs = insert(xs, 2);
        assert(is_sorted(&xs));
        assert_eq(xs, list![1, 2, 3]);
    }

    @test
    fn merge_produces_sorted() {
        let a: SortedList<Int> = list![1, 3, 5];
        let b: SortedList<Int> = list![2, 4, 6];
        let c = merge(a, b);
        assert_eq(c, list![1, 2, 3, 4, 5, 6]);
    }

    @property
    fn insert_preserves_sort_forall(xs: SortedList<Int>, x: Int) {
        let ys = insert(xs.clone(), x);
        assert(is_sorted(&ys));
        assert_eq(ys.len(), xs.len() + 1);
    }
}
```

Property tests are especially valuable for refinement-typed code —
they validate the solver's proofs against random inputs.

## 7. Run

```bash
$ verum test
   [verify] SortedList.insert      ✓ (formal/z3,  14 ms)
   [verify] SortedList.remove_at   ✓ (formal/z3,   9 ms)
   [verify] SortedList.merge       ✓ (formal/z3, 210 ms)
   test tests.insert_preserves_sort          ... ok
   test tests.merge_produces_sorted          ... ok
   test tests.insert_preserves_sort_forall   ... ok (100 cases)
   all 3 tests passed
```

## Troubleshooting

If `merge` takes > 5 s to verify, try:

- Escalate to `@verify(thorough)` on merge specifically — this races
  the SMT backend, and tactic-based proof search; CVC5's quantifier
  reasoning is often faster on nested foralls.
- Split invariants 4 and 5 into separate helper `@logic` lemmas
  that name the adjacency property.
- Let the proof cache persist across runs (on by default) and the
  first slow build won't recur.

## What you learned

- `SortedList<T>` as a refinement of `List<T>`.
- `@logic` functions — the predicates that become SMT axioms.
- `where ensures` postconditions.
- Loop invariants: **every** inductive step must be spelled out.
- `decreases` for termination.
- The SMT solver proves the invariants; you write them.

## Next

- **[Proofs](/docs/verification/proofs)** — when SMT isn't enough,
  write a proof term.
- **[SMT routing](/docs/verification/smt-routing)** — how the SMT backend
  decide what to dispatch.
- **[Refinement patterns](/docs/cookbook/refinements)** — the common
  idioms.
