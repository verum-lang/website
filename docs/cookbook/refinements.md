---
title: Refinement patterns you'll actually use
description: Domain-modelling with refinement types — the common idioms and their trade-offs.
---

# Refinement patterns

Refinement types attach a predicate to a type: every value of the
refinement must satisfy the predicate. The SMT solver checks this at
compile time; there is no runtime cost unless the refinement
escapes through a dynamic boundary (deserialization, FFI).

For the grammar and formal details, see
[language/refinement-types](/docs/language/refinement-types). This
page is the menu of recipes.

## Numeric bounds

```verum
type Positive<T: Numeric>  is T { self > T.zero() };
type NonZero<T: Numeric>   is T { self != T.zero() };
type NonNeg<T: Numeric>    is T { self >= T.zero() };
type Negative<T: Numeric>  is T { self < T.zero() };

type Percentage            is Float { 0.0 <= self && self <= 100.0 };
type UnitInterval          is Float { 0.0 <= self && self <= 1.0 };
type Probability           is UnitInterval;
type Octet                 is Int   { 0 <= self && self <= 255 };
type Port                  is Int   { 1 <= self && self <= 65535 };
type HttpStatus            is Int   { 100 <= self && self <= 599 };
type UnixTimestamp         is Int   { 0 <= self && self <= 253_402_300_799 };
```

Arithmetic preserves refinements where the SMT solver can prove it:

```verum
fn double(p: Positive<Int>) -> Positive<Int> {
    p * 2                                // still positive; compiler verifies
}
```

For operations that don't obviously preserve, the compiler asks for
a proof — usually one `@verify(formal)` or an explicit `ensures`.

## Length-indexed collections

```verum
type NonEmpty<T>           is List<T> { self.len() > 0 };
type AtLeast<T, const N>   is List<T> { self.len() >= N };
type AtMost<T, const N>    is List<T> { self.len() <= N };
type ExactLen<T, const N>  is List<T> { self.len() == N };

fn first<T: Copy>(xs: &NonEmpty<T>) -> T {
    xs[0]                                // indexing is safe — the refinement proves it
}

fn average(xs: &NonEmpty<Float>) -> Float {
    let sum: Float = xs.iter().sum();
    sum / (xs.len() as Float)            // division safe — len > 0
}
```

### Length-indexed vectors

For static-sized vectors, use an array type, not a refined list:

```verum
type Vec3 is [Float; 3];

fn dot(a: &Vec3, b: &Vec3) -> Float {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]   // no length check
}
```

`[Float; 3]` is a distinct type from `List<Float>`; the length is in
the type, not a predicate.

## Structural invariants

```verum
type Sorted<T: Ord>        is List<T> { self.is_sorted() };
type Unique<T: Eq + Hash>  is List<T> { self.is_unique() };
type Palindrome            is Text   { self == self.reversed() };
type UpperCase             is Text   { self == self.to_upper() };
type NoWhitespace          is Text   { !self.contains_whitespace() };
type AsciiOnly             is Text   { self.chars().all(|c| c.is_ascii()) };
```

Some of these predicates (`is_sorted`, `is_unique`) are not SMT-native —
they require `@logic` reflection; see
[verification/refinement-reflection](/docs/verification/refinement-reflection).

## Pattern-validated text

```verum
type Email    is Text { self.matches(rx#"^[^@\s]+@[^@\s]+\.[^@\s]+$") };
type IPv4Text is Text { self.matches(rx#"^(\d{1,3}\.){3}\d{1,3}$") };
type UUIDText is Text { self.len() == 36 && self.matches(rx#"^[0-9a-f-]{36}$") };
type ISBN     is Text { self.matches(rx#"^\d{9}[\dX]$") || self.matches(rx#"^\d{13}$") };
type Slug     is Text { self.matches(rx#"^[a-z0-9][a-z0-9-]*$") };
type Hex64    is Text { self.len() == 16 && self.matches(rx#"^[0-9a-f]+$") };
```

`rx#` tagged literals are compile-time validated (see
[language/tagged-literals](/docs/language/tagged-literals)); the regex
itself is known to be well-formed, and the SMT solver reasons about
membership using the regex theory.

## Cross-parameter refinements

When one parameter constrains another:

```verum
fn clamp(lo: Int, hi: Int { self >= lo }, x: Int) -> Int { self >= lo && self <= hi } {
    if x < lo { lo }
    else if x > hi { hi }
    else { x }
}
```

`hi: Int { self >= lo }` says "`hi` must not be less than `lo`". The
return refinement is the clamped result.

For complex cross-parameter constraints, use `requires`:

```verum
fn substring(s: &Text, start: Int, len: Int) -> &Text
    requires 0 <= start
    requires start + len <= s.len()
{
    &s[start..start + len]
}
```

The SMT obligation at each call site is `0 ≤ start ∧ start + len ≤ s.len()`;
fail to satisfy either and the compile fails.

## Record-level invariants

A refinement on a record type constrains the whole value, tying
fields together:

```verum
type BankAccount is {
    balance:       Float { self >= 0.0 },
    account_number: Text  { self.len() == 10 },
    owner:         NonEmpty<Char>,
}
where self.balance == 0.0 || self.last_activity.is_some();
```

The trailing `where` is a whole-record predicate: "if balance is
zero, there must be a last_activity recorded" — the kind of
invariant that can only be stated over multiple fields.

### Tuple refinements

```verum
type TimeRange is (Instant, Instant) { self.0 <= self.1 };

fn duration(r: TimeRange) -> Duration {
    r.1 - r.0                            // non-negative by refinement
}
```

## Invariants that survive operations

Use `where ensures` on mutating methods to preserve refinements:

```verum
fn insert_sorted<T: Ord>(xs: &mut Sorted<T>, x: T)
    where ensures self.is_sorted(),
          ensures self.len() == old(self.len()) + 1
{
    let pos = xs.partition_point(|y| *y < x);
    xs.insert(pos, x);
}
```

The SMT solver discharges the proof: insertion at `partition_point`
preserves sortedness, and the length grows by 1.

### Read-only observation

Methods that merely *observe* a refined value are free:

```verum
implement Sorted<T: Ord> {
    fn max(&self) -> Maybe<&T> where self.len() > 0 {
        self.last()                      // last element is max (sorted)
    }
}
```

## Refinement on function results

Tag the return type:

```verum
fn abs(x: Int) -> Int { self >= 0 } {
    if x < 0 { -x } else { x }
}

fn is_valid(u: &User) -> Bool {
    u.email.is_some() && u.age >= 0
}

fn validate(u: &User) -> Bool { self => u.email.is_some() } {
    is_valid(u)
}
```

The `{ self => u.email.is_some() }` refinement on a `Bool` return
says: "if the result is true, `u.email.is_some()` holds." Useful for
*refined predicates* — returning a flag and an invariant.

## Using refinements without `@logic` overhead

Sometimes the predicate is already SMT-native — arithmetic, indexing,
bounded quantifiers — and doesn't need `@logic` reflection:

```verum
type NonNegative is Float { self >= 0.0 };              // SMT-native
type Bounded     is Int   { 0 <= self && self <= 100 }; // SMT-native
type Power2      is Int   { self & (self - 1) == 0 };   // bitwise, SMT-native
```

`is_sorted()`, `is_palindrome()`, `is_cyclic()` do need reflection —
mark the helper `@logic`:

```verum
@logic
fn is_sorted<T: Ord>(xs: &List<T>) -> Bool {
    forall i in 0..xs.len() - 1. xs[i] <= xs[i + 1]
}

type Sorted<T: Ord> is List<T> { is_sorted(self) };
```

See [verification/refinement-reflection](/docs/verification/refinement-reflection).

## Conversion and coercion

Refined types are **subtypes** of their base. You can narrow on
pattern match:

```verum
fn demote(p: Positive<Int>) -> Int {
    p                                   // automatic widening
}
```

To widen (Int → Positive), you must prove the predicate:

```verum
fn try_positive(x: Int) -> Maybe<Positive<Int>> {
    if x > 0 { Maybe.Some(x) }          // verified by the solver
    else     { Maybe.None }
}
```

The `if x > 0` branch gives the SMT solver the fact it needs to
prove `x` satisfies the `self > 0` predicate.

## Pitfalls

### Overconstraining is expensive

A function taking `NonEmpty<T>` demands every caller prove the list
is non-empty at compile time. Reserve refinements for genuinely
load-bearing invariants.

Prefer refinements when:
- The invariant is a precondition for safety (indexing, division).
- The invariant is load-bearing for correctness (balance ≥ 0).
- The type boundary is where the invariant matters.

Avoid refinements when:
- The invariant is opportunistic (performance hint).
- The invariant is easy to prove locally but hard to prove globally.
- The check has negligible cost at runtime (`if` + early return).

### Non-monotone refinements

`Sorted<T>` is preserved by `.push` only if the new element is `>=`
the last one. If you frequently add arbitrary elements, use
`List<T>` and convert with `.sort()` only when sortedness is needed.

### Refinements on mutable shared state

Refinements on `&mut T` track invariants across observations, but a
`Shared<Mutex<T>>` holding a refined `T` only verifies the refinement
when the lock is released — between `lock().await` and `drop(guard)`,
the value can be transiently off-spec. Design refinements to hold at
**release points**, not mid-mutation.

### Cost at compile time

Heavy refinements slow the SMT engine. If compile times bloat,
annotate hot spots with `@verify(fast)` or use `@verify(runtime)` on
non-critical paths.

## See also

- **[language/refinement-types](/docs/language/refinement-types)** —
  the syntax reference.
- **[verification/refinement-reflection](/docs/verification/refinement-reflection)** —
  when and how to use `@logic`.
- **[language/dependent-types](/docs/language/dependent-types)** —
  when a refinement needs a value in the type.
- **[verification/smt-routing](/docs/verification/smt-routing)** —
  how hard refinements are dispatched.
- **[tutorials/refinement-types](/docs/tutorials/refinement-types)** —
  a worked example.
- **[tutorials/verified-data-structure](/docs/tutorials/verified-data-structure)** —
  refinements that survive mutations.
