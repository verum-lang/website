---
sidebar_position: 4
title: Contracts
---

# Contracts

Contracts attach preconditions, postconditions, and invariants to
functions and loops. They are the bridge between "I think this holds"
and "the compiler proved this holds."

## `where requires` — preconditions

```verum
fn divide(a: Int, b: Int) -> Int
    where requires b != 0
{
    a / b
}
```

Every caller must establish `b != 0`. Failure becomes:

```
error[V3401]: precondition not established
  --> src/foo.vr:5:5
   |
 5 |     divide(10, input);
   |     ^^^^^^^^^^^^^^^^^ requires `input != 0`
   = counter-example: input = 0
```

Preconditions compose naturally with refinement types. The above is
equivalent to:

```verum
fn divide(a: Int, b: Int { self != 0 }) -> Int { a / b }
```

Prefer the refinement form when the precondition concerns a single
parameter; prefer `where requires` when it spans several parameters or
references external state:

```verum
fn transfer(from: &mut Account, to: &mut Account, amount: Money)
    where requires from.balance >= amount,
          requires from != to
{ ... }
```

## `where ensures` — postconditions

```verum
fn abs(x: Int) -> Int
    where ensures result >= 0,
          ensures result == x || result == -x
{
    if x >= 0 { x } else { -x }
}
```

Multiple clauses are conjoined. `result` refers to the return value.

## Loop `invariant` and `decreases`

```verum
while lo < hi
    invariant 0 <= lo && hi <= xs.len()
    invariant forall i in 0..lo. xs[i] < key
    invariant forall i in hi..xs.len(). xs[i] > key
    decreases hi - lo
{
    ...
}
```

- **`invariant`** holds at entry and after every iteration.
- **`decreases`** is a well-founded measure that strictly decreases
  each iteration — proves termination.

Without an explicit `decreases`, the compiler tries to infer one from
the loop shape (`while i < n` with `i += 1`). When inference fails,
you supply it.

## `throw` and the error frame

A function with `throws(E)` commits to a contract on its error cases:

```verum
fn parse_u32(s: Text) -> Int throws(ParseError)
    where ensures result >= 0,
          ensures result <= U32_MAX
{
    let n: Int64 = s.parse()?;
    if n < 0 || n > U32_MAX {
        throw ParseError.OutOfRange;
    }
    n
}
```

## `forall` / `exists` in contracts

Bounded quantifiers are first class:

```verum
fn all_positive(xs: &List<Int>) -> Bool
    where ensures result == (forall i in 0..xs.len(). xs[i] > 0)
{
    xs.iter().all(|x| *x > 0)
}
```

Unbounded quantifiers (`forall i: Int. ...`) are allowed but may
degrade proof performance; the solver will often need triggers.

## `old()` — referring to prior state

In postconditions of methods that mutate, `old(self.field)` refers to
the field's value at call-entry:

```verum
fn push(&mut self, x: T)
    where ensures self.len() == old(self.len()) + 1,
          ensures self[old(self.len())] == x
{ ... }
```

## Contract inheritance

A protocol can declare contracts; implementations must satisfy them:

```verum
type Stack<T> is protocol {
    fn push(&mut self, x: T)
        where ensures self.len() == old(self.len()) + 1;

    fn pop(&mut self) -> Maybe<T>
        where ensures match result {
            Some(_) => self.len() == old(self.len()) - 1,
            None    => self.len() == 0 && old(self.len()) == 0,
        };
};
```

Every `implement Stack<T> for X` is required to satisfy the
contracts; the compiler emits one obligation per method per
implementation.

## Contracts as documentation

Contracts that pass verification double as documentation. The docgen
tool (`verum doc`) extracts them into the generated reference:

```verum
/// Transfers `amount` from `from` to `to`, assuming both accounts
/// are distinct and `from` has sufficient balance.
fn transfer(from: &mut Account, to: &mut Account, amount: Money)
    where requires from.balance >= amount,
          requires from != to,
          ensures  from.balance == old(from.balance) - amount,
          ensures  to.balance   == old(to.balance)   + amount
{ ... }
```

## Separation logic (selected cases)

When contracts need to talk about disjoint memory regions, Verum uses
a lightweight separation-logic fragment. This is handled under the
hood by `verum_verification::separation_logic` — user-facing cases are
limited to array partitioning and disjointness of mutable references:

```verum
fn swap_regions<'a>(a: &'a mut [Int], b: &'a mut [Int])
    where requires disjoint(a, b)
{ ... }
```

Most code does not need this; the common case is covered by mutable-
reference aliasing rules.

## See also

- **[Gradual verification](/docs/verification/gradual-verification)** —
  when each contract is checked.
- **[Refinement reflection](/docs/verification/refinement-reflection)**
  — extending the contract vocabulary with `@logic` functions.
- **[Proofs](/docs/verification/proofs)** — when contracts need a
  manual discharge.
