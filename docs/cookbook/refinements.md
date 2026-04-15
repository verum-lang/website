---
title: Refinement patterns you'll actually use
description: Domain-modelling with refinement types — the common idioms.
---

# Refinement patterns

### Positive / nonzero / in-range

```verum
type Positive<T: Numeric>  is T { self > T::zero() };
type NonZero<T: Numeric>   is T { self != T::zero() };
type NonNeg<T: Numeric>    is T { self >= T::zero() };
type Percentage            is Float { 0.0 <= self && self <= 100.0 };
type UnitInterval          is Float { 0.0 <= self && self <= 1.0 };
type Probability           is UnitInterval;
type Octet                 is Int { 0 <= self && self <= 255 };
type Port                  is Int { 1 <= self && self <= 65535 };
```

### Length-indexed collections

```verum
type NonEmpty<T>           is List<T> { self.len() > 0 };
type AtLeast<T, const N>   is List<T> { self.len() >= N };
type ExactLen<T, const N>  is List<T> { self.len() == N };

fn first<T: Copy>(xs: &NonEmpty<T>) -> T {
    xs[0]                                    // indexing is safe
}
```

### Structural invariants

```verum
type Sorted<T: Ord>        is List<T> { self.is_sorted() };
type Unique<T: Eq + Hash>  is List<T> { self.is_unique() };
type Palindrome            is Text   { self == self.reversed() };
```

### Pattern-validated text

```verum
type Email is Text { self.matches(rx#"^[^@\s]+@[^@\s]+\.[^@\s]+$") };
type IPv4  is Text { self.matches(rx#"^(\d{1,3}\.){3}\d{1,3}$") };
type UUID  is Text { self.len() == 36 && self.matches(rx#"^[0-9a-f-]+$") };
type ISBN  is Text { self.matches(rx#"^\d{9}[\dX]$") || self.matches(rx#"^\d{13}$") };
```

### Cross-parameter refinements

When one parameter constrains another:

```verum
fn clamp(lo: Int, hi: Int { self >= lo }, x: Int) -> Int { self >= lo, self <= hi } {
    if x < lo { lo }
    else if x > hi { hi }
    else { x }
}
```

### Record-level invariants

```verum
type BankAccount is {
    balance: Float { self >= 0.0 },
    account_number: Text { self.len() == 10 },
    owner: NonEmpty<Char>,
};
```

### Invariants that survive operations

Use `where ensures` to preserve refinements across mutations:

```verum
fn insert_sorted<T: Ord>(xs: &mut Sorted<T>, x: T)
    where ensures self.is_sorted()
{
    let pos = xs.partition_point(|y| *y < x);
    xs.insert(pos, x);
}
```

### Using refinements without the @logic overhead

Sometimes a refinement **predicate** is already an SMT-native
expression — arithmetic, indexing, bounded quantifiers — and doesn't
need `@logic` reflection:

```verum
type NonNegative is Float { self >= 0.0 };      // SMT-native
```

`is_sorted()` or `is_palindrome()` do need reflection — mark the
helper `@logic`:

```verum
@logic
fn is_sorted(xs: &List<Int>) -> Bool {
    forall i in 0..xs.len() - 1. xs[i] <= xs[i + 1]
}
```

### Pitfalls

- **Overconstraining refinements make your code hard to call.**
  A function taking `NonEmpty<T>` means every caller has to prove
  the list is non-empty at compile time. Reserve refinements for
  genuinely load-bearing invariants.
- **Non-monotone refinements** are harder. `Sorted<T>` is preserved
  by `.push` only if you prove the new element is >= the last one —
  use `.insert_sorted(x)` or similar.

### See also

- **[Verification → refinement reflection](/docs/verification/refinement-reflection)**
  — when and how to use `@logic`.
- **[Language → refinement types](/docs/language/refinement-types)**
  — the syntax reference.
