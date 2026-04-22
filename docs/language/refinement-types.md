---
sidebar_position: 4
title: Refinement Types
---

# Refinement Types

A **refinement type** is a type together with a predicate that every
value of that type must satisfy. Predicates are written in the
refinement fragment of Verum — a decidable subset that the SMT backend
can reason about directly.

## Syntax

Three equivalent forms:

```verum
// 1. Inline, on a type definition
type Positive is Int { self > 0 };

// 2. On a type expression
fn sqrt(x: Float { self >= 0.0 }) -> Float { ... }

// 3. On a field
type User is {
    age: Int { 0 <= self && self <= 150 },
};
```

All three desugar to the same core construct: a base type `B` plus
predicate `P(x)`, written in the literature `{x: B | P(x)}`.

## What can go in a predicate

The refinement language is intentionally small and decidable:

- **Comparisons**: `==`, `!=`, `<`, `<=`, `>`, `>=`.
- **Boolean connectives**: `&&`, `||`, `!`.
- **Arithmetic**: `+`, `-`, `*`, `/`, `%` (with nonlinearity routed to the backend with the stronger nonlinear core).
- **Bitwise**: `&`, `|`, `^`, `<<`, `>>`.
- **Field access**: `self.field`, `self.field.subfield`.
- **Indexing**: `xs[i]`, `xs[i..j]`.
- **Calls to `@logic` functions**: user-written functions marked `@logic`
  are reflected into the solver verbatim (see [Refinement reflection](/docs/verification/refinement-reflection)).
- **Quantifiers** (bounded): `forall i in 0..n. P(i)`, `exists i in xs. P(i)`.
- **Built-in predicates**: `self.is_sorted()`, `self.is_empty()`,
  `self.contains(x)`, etc.

General function calls, recursion, mutation, and I/O are **not** allowed
in predicates.

## Where refinements get checked

Anywhere a value flows from an unrefined type to a refined one.

```verum
fn divide(a: Int, b: Int { self != 0 }) -> Int { a / b }

fn caller(x: Int) {
    divide(10, x);      // error: cannot prove x != 0
    if x != 0 {
        divide(10, x);  // OK: flow-sensitive refinement strengthens x
    }
}
```

The compiler's flow-sensitive analysis narrows `x` inside the `if`
branch from `Int` to `Int { self != 0 }`, so the second call succeeds.

## Common patterns

### Nonzero / positive

```verum
type NonZero<T: Numeric>  is T { self != T.zero() };
type Positive<T: Numeric> is T { self > T.zero() };
type NonNeg<T: Numeric>   is T { self >= T.zero() };
```

### Bounded intervals

```verum
type Percentage   is Float { 0.0 <= self && self <= 100.0 };
type Probability  is Float { 0.0 <= self && self <= 1.0 };
type Octet        is Int   { 0 <= self && self <= 255 };
```

### Length-refined collections

```verum
type NonEmpty<T>          is List<T> { self.len() > 0 };
type AtLeast<T, const N>  is List<T> { self.len() >= N };
type ExactLen<T, const N> is List<T> { self.len() == N };
```

### Sortedness / structure

```verum
type Sorted<T: Ord>       is List<T> { self.is_sorted() };
type Unique<T: Eq + Hash> is List<T> { self.is_unique() };
type Palindrome           is Text   { self == self.reversed() };
```

### Textual shape

```verum
type Email is Text { self.matches(rx#"^[^@]+@[^@]+\.[^@]+$") };
type IPv4  is Text { self.matches(rx#"^(\d{1,3}\.){3}\d{1,3}$") };
type UUID  is Text { self.len() == 36 && self.matches(rx#"^[0-9a-f-]+$") };
```

## Proving the refinement at construction

When you create a refined value, the SMT solver must prove the
predicate holds.

```verum
fn first<T: Copy>(xs: &NonEmpty<T>) -> T {
    xs[0]   // safe: xs.len() > 0, so xs[0] is well-defined
}

fn try_first<T: Copy>(xs: &List<T>) -> Maybe<T> {
    if xs.len() > 0 {
        // Refinement of xs promoted inside this branch.
        let view: &NonEmpty<T> = xs;  // discharge: xs.len() > 0 ✓
        Maybe.Some(first(view))
    } else {
        Maybe.None
    }
}
```

## Postconditions as refinements

`where ensures P` is a refinement on the return type:

```verum
fn abs(x: Int) -> Int { self >= 0 }
    where ensures result == if x >= 0 { x } else { -x }
{
    if x >= 0 { x } else { -x }
}
```

The `self` in the return type refinement refers to the return value;
`result` can also be used in the `ensures` clause.

## Relation to SMT

Refinements are:
- **Written** in Verum's expression syntax;
- **Translated** to SMT-LIB at compile time;
- **Discharged** by the SMT backend (capability router picks);
- **Erased** from the final binary.

When the solver cannot prove an obligation, the compiler prints the
counter-example the solver returned:

```
error[V3402]: refinement violated at call site
  --> src/main.vr:23:12
   |
23 |     divide(10, input);
   |            ^^^^^^^^^^
   |
   = obligation: input != 0
   = counter-example: input = 0
   = help: guard the call with `if input != 0 { ... }` or
           change `input`'s type to `Int { self != 0 }`.
```

## Limitations

- **Undecidable predicates are rejected**: the refinement language is
  deliberately a decidable fragment.
- **Recursion in `@logic` functions** requires a termination metric
  (`decreases`) — the SMT backend cannot prove termination automatically.
- **Mutation is not expressible**: refinement predicates are pure;
  `self.is_sorted()` talks about a snapshot, not an ongoing invariant.

For invariants that span mutation, see
**[Contracts](/docs/verification/contracts)** and loop invariants in
**[Functions](/docs/language/functions)**.

## Worked examples

### A refined bank-account record (system boundaries)

```verum
type Positive  is Float { self >= 0.0 };
type BankAccount is {
    balance: Positive,
    account_number: Text { self.len() == 10 },
    owner: Text { !self.is_empty() },
};

fn transfer(from: &mut BankAccount, to: &mut BankAccount, amount: Positive)
    where requires from != to,
          requires from.balance >= amount,
          ensures  from.balance == old(from.balance) - amount,
          ensures  to.balance   == old(to.balance)   + amount
{
    from.balance -= amount;
    to.balance   += amount;
}
```

The SMT solver discharges the postconditions — provided the caller
establishes `from != to` and `from.balance >= amount`.

### A verified sorted-list invariant

```verum
@logic
fn is_sorted<T: Ord>(xs: &List<T>) -> Bool {
    forall i in 0..xs.len() - 1. xs[i] <= xs[i + 1]
}

type Sorted<T: Ord> is List<T> { is_sorted(self) };

@verify(formal)
fn insert<T: Ord>(xs: Sorted<T>, x: T) -> Sorted<T>
    where ensures is_sorted(result)
{
    let mut out = xs.clone();
    let pos = out.partition_point(|y| *y < x);
    out.insert(pos, x);
    out
}
```

The [Verified data structure tutorial](/docs/tutorials/verified-data-structure)
walks this full example with loop invariants and merge.

## Relation to the trusted kernel

Refinement types reach the kernel as the `Refine { base, binder,
predicate }` constructor in `verum_kernel::CoreTerm`. The kernel's
rule is:

> `base` inhabits some `Universe(u)`; `predicate` is well-typed under
> the extended context ctx ∪ `binder : base`; the refinement lives in
> `Universe(u)` too.

When the predicate is not syntactically trivial, the SMT discharge
happens outside the TCB: `verum_smt` produces a `SmtCertificate`
that the kernel's `replay_smt_cert` re-derives into a checkable
`CoreTerm` witness. A solver bug cannot accept a false refinement.

See **[Architecture → trusted kernel](/docs/architecture/trusted-kernel)**
for the `Refine` rule and the surrounding trust story.

## Cross-references

- **[Cookbook → refinement patterns](/docs/cookbook/refinements)** —
  the idioms you'll actually use.
- **[Cookbook → validation](/docs/cookbook/validation)** — refinements
  at system boundaries.
- **[Cookbook → `@logic` functions](/docs/cookbook/logic-functions)**
  — extending the refinement vocabulary.
- **[Cookbook → SMT debugging](/docs/cookbook/smt-debug)** — when the
  solver can't prove your obligation.
- **[Verified data structure tutorial](/docs/tutorials/verified-data-structure)**
  — end-to-end use with loop invariants.
- **[Verification → gradual verification](/docs/verification/gradual-verification)**
  — the nine operational strategies (`runtime`, `static`, `formal`,
  `proof`, `fast`, `thorough`, `reliable`, `certified`, `synthesize`)
  and the two-layer dispatch architecture.
- **[Verification → refinement reflection](/docs/verification/refinement-reflection)**
  — soundness gate for `@logic`.
- **[Verification → framework axioms](/docs/verification/framework-axioms)**
  — postulating refinement-relevant results from external
  mathematics (Petz quantum-metric monotonicity, Bures bounds, ...).
- **[Architecture → trusted kernel](/docs/architecture/trusted-kernel)**
  — the `Refine` rule and how SMT discharge stays out of the TCB.
