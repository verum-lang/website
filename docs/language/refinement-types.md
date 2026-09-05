---
sidebar_position: 4
title: Refinement Types
---

# Refinement Types

A **refinement type** is a type together with a predicate that every
value of that type must satisfy. Predicates are written in the
refinement fragment of Verum — a decidable subset that the SMT layer
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
:::info What names the value, and what happens to a typo
Three spellings bind the value under refinement, and they are
interchangeable:

- `self` — used throughout this page;
- `it` — the implicit binder, seen in `Int{ it >= 0 }`;
- the name a `where` form introduces, e.g. `T where |x| x > 0`.

**Every other name in a predicate must be in scope.** Since 2026-09-03 an
unknown one is `error<E100>: unbound variable in refinement predicate`.
Before that it was accepted, and the consequence was not a weaker type —
it was a different one:

    type P is Int { slef > 0 };   // a typo of `self`
    let x: P = -5;                // was ACCEPTED
    let x: P =  5;                // was REJECTED

An identifier in a predicate becomes a free variable of the solver
obligation, so an unknown name is not "no constraint", it is an
arbitrary one — and here it inverted the type, accepting exactly the
values the refinement was written to reject.

The check applies to a **type declaration's own** predicate. A
refinement on a parameter may name a sibling parameter — `fn
combinations(n: Int{>= 0}, k: Int{>= 0, <= n})` is correct — and those
names are function-local, so that position is left unjudged rather than
guessed at.
:::

- **Field access**: `self.field`, `self.field.subfield`.
- **Indexing**: `xs[i]`, `xs[i..j]`.
- **Calls to reflected functions**: a pure, single-expression
  user function is reflected into the solver as a definition (see
  [Refinement reflection](/docs/verification/refinement-reflection)).
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

### Which positions carry a check

"Anywhere a value flows into a refined type" is the intent. The
positions that carry it today are these:

| Where the refinement is written | Checked |
|---|---|
| A parameter's type | yes |
| A return type | yes |
| A record field's type | yes |
| A `let` annotation, including destructuring | yes |
| A variant payload — `Consistent(Int{it >= 0})` | yes |
| Behind a **named type** — `type Positive is Int{it > 0}` | yes |
| Inside a **generic argument** — `Result<Int{it >= 0}, E>`, `List<Int{it > 0}>` | **no** |

The named-type row is worth stating explicitly because it is the
spelling programs actually use — you name the domain type once
(`Positive`, `Port`, `NonEmpty`) and write the name everywhere after
that. It carries both halves: a value the compiler can disprove is
refused at compile time (`error<E500>: refinement constraint failed`),
and one it cannot decide is checked when the program runs.

That was not always true. Until 2026-09-02 the runtime half was lost
behind the name: the assert emitter matched the annotation's *syntax*
rather than asking the type for its predicate, so `let a: Int{it > 0}`
asserted and `let a: Positive` did not — the same predicate, two
verdicts, decided by the spelling. The static half worked through the
name the whole time, which is what made it hard to notice: a literal
`-1` behind `Positive` was refused, so the type looked enforced.

The last row is the one to know about, because nothing at the
declaration marks it: the refinement is accepted, reads as a guarantee,
and no check is emitted. It comes from *instantiating* a generic whose
own declaration (`Result<T, E>`) carries no refinement, so there is no
declaration site holding the predicate.

If you need the guarantee there, put it where it is carried — a named
type with a refined field, or a refined return type on the function that
produces the value:

```verum
// Not checked: the refinement rides on a type argument.
fn stored() -> Result<Int{it >= 0}, ImportError> { ... }

// Checked: the refinement is the return type.
fn count() -> Int{it >= 0} { ... }
```

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
type AtLeast<T, const N: Int>  is List<T> { self.len() >= N };
type ExactLen<T, const N: Int> is List<T> { self.len() == N };
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
        let nonempty: &NonEmpty<T> = xs;  // discharge: xs.len() > 0 ✓
        Maybe.Some(first(nonempty))
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
- **Discharged** by the SMT layer (capability router picks the adapter);
- **Erased** from the final binary.

When the solver cannot prove an obligation, `verum verify` reports it
per-function with a raw counter-example — not the source-anchored
`error[...]` transcript shown in earlier drafts of this page, which
did not match real output in either format or content.

**This example's transcript has been removed, not corrected, and the
underlying claim is now an open question rather than a documented
fact.** Tested directly: a function with `requires b != 0`, called
with a literal `0` argument, was checked with `verum verify` and
**did not fail** — both the callee and the caller reported `Proved`.
Whether caller-side obligations like `input != 0` above are actually
enforced at the call site is unconfirmed on the current binary; don't
rely on this page's specific claim until that's resolved.
```

## Limitations

- **Predicates outside the decidable fragment are reported, not
  rejected.** The compiler accepts the predicate, warns that the
  constraint is unenforced, and continues — which is gradual
  verification working as designed, but it is not the same thing as a
  rejection, and this page previously said "rejected". Measured on the
  current binary, with a field initialised to `1`:

  | predicate | result |
  |---|---|
  | `Int{it >= 10}` | `error<E500>` — decided, violated |
  | `Int{(it, 0).0 >= 10}` | `error<E500>` — decided through the projection |
  | `Int{twice(it) >= 10}` | `warning<W0500>` — solver returned unknown |
  | `Int{it \|> twice >= 10}` | `warning<W0500>` |
  | `Int{f"{it}" == "zz"}` | `warning<W0500>` |
  | `Int{[it][0] >= 10}` | `warning<W0500>` |

  The warning names the predicate and says what to do:

  > refinement `{twice(…) >= 10}` was NOT verified against a value known
  > at compile time (SMT solver returned unknown), so the constraint is
  > not enforced here — express the predicate in terms the solver decides
  > (comparisons, arithmetic, `&&`/`||`/`!`), or check it explicitly in
  > code

  Two things follow for anyone relying on a refinement. A predicate that
  compiles clean has been *checked*; a predicate that compiles with
  `W0500` has been *parsed*. And the warning only fires where the value
  is known at compile time — the solver answers `unknown` for any
  predicate over a value it has not seen yet, so a refinement on a
  function parameter carries no such signal at the declaration.

- **Recursive predicates do not reflect**: there is no
  `decreases`-checked recursive encoding, so a self-calling function
  stays uninterpreted and its goals stay unconstrained.
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
    requires from != to
    requires from.balance >= amount
    ensures  from.balance == old(from.balance) - amount
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
public pure fn is_sorted<T: Ord>(xs: &List<T>) -> Bool {
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
predicate }` constructor in `verum_kernel.CoreTerm`. The kernel's
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

## Configuration knobs

The `RefinementChecker` exposes four user-facing config fields,
all of which are honoured by the consumer (no inert defenses):

| Field            | Default | What it gates                                           |
|------------------|---------|---------------------------------------------------------|
| `enable_smt`     | `true`  | Master switch for SMT-based subsumption. When `false`, only the syntactic checker fires; SMT-only obligations return `Unknown`. |
| `timeout_ms`     | `100`   | Per-query SMT timeout, forwarded to the backend through the `SmtBackend::set_timeout_ms(ms)` trait method **before every `check` invocation**. Backends propagate the value to the underlying solver via `set_params({"timeout": ms})`. |
| `enable_cache`   | `true`  | Verification-condition memoization. Cache key is `hash(predicate, value)`; identical obligations short-circuit. |
| `max_cache_size` | `10000` | Evicts the lowest-1/10th when the cache reaches this many entries (LRU-style trim). |

Custom backends implement the `SmtBackend` trait and may
override `set_timeout_ms` to forward the per-query budget.
Backends that don't override it inherit a no-op default — the
trait extension is intentionally source-compatible so external
implementors compile without modification when new gates are
added.

## Cross-references

- **[Cookbook → refinement patterns](/docs/cookbook/refinements)** —
  the idioms you'll actually use.
- **[Cookbook → validation](/docs/cookbook/validation)** — refinements
  at system boundaries.
- **[Cookbook → reflection-friendly predicates](/docs/cookbook/logic-functions)**
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
  — the fragment that reflects, and the closure gate that keeps a
  bad leaf from poisoning the module.
- **[Verification → framework axioms](/docs/verification/framework-axioms)**
  — postulating refinement-relevant results from external
  mathematics (Petz quantum-metric monotonicity, Bures bounds, ...).
- **[Architecture → trusted kernel](/docs/architecture/trusted-kernel)**
  — the `Refine` rule and how SMT discharge stays out of the TCB.
