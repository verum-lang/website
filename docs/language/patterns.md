---
sidebar_position: 9
title: Patterns
---

# Patterns

Patterns appear in `match` arms, `let` bindings, function parameters,
`if let`, `while let`, and `for`.

## Simple patterns

| Pattern | Matches |
|---------|---------|
| `42`, `"str"`, `true`, `'c'` | exact literal |
| `x`, `name` | binds the value |
| `_` | anything, no binding |
| `..` | rest (in tuples / arrays / records) |
| `mut x` | binds and marks as mutable |
| `ref x` | binds a reference instead of moving |

## Tuples and arrays

```verum
match point {
    (0, 0)       => "origin",
    (0, _)       => "on y-axis",
    (_, 0)       => "on x-axis",
    (x, y) if x == y => "diagonal",
    _            => "elsewhere",
}

match items {
    []             => "empty",
    [only]         => f"one: {only}",
    [first, ..]    => f"first is {first}",
    [first, .., last] => f"{first}..{last}",
}
```

## Records

```verum
match user {
    User { age: 0..18, .. }           => "minor",
    User { email, age: 18..=120, .. } => f"adult: {email}",
    User { .. }                       => "other",
}

// Also available: field shorthand
let User { id, email, .. } = user;
```

## Variants

```verum
match shape {
    Shape.Circle   { radius }       => 3.14 * radius * radius,
    Shape.Square   { side }         => side * side,
    Shape.Triangle (a, b, c)        => heron(a, b, c),
}
```

## Ranges

```verum
match code {
    0..100     => "low",
    100..=999  => "mid",
    _          => "high",
}
```

`..` is exclusive; `..=` is inclusive.

## Or-patterns

```verum
match event {
    Key.Up | Key.W     => move_up(),
    Key.Down | Key.S   => move_down(),
    Key.Q | Key.Escape => quit(),
    _ => (),
}
```

## And-patterns

```verum
match value {
    (x & 1..100) => ...,   // x bound, constrained to [1, 100)
}
```

## Guards

Arbitrary boolean expressions extending a pattern:

```verum
match n {
    x if x < 0        => "negative",
    0                  => "zero",
    x if x.is_prime() => "prime",
    _                 => "composite",
}

// `where` is a synonym for guard:
match xs {
    [x, ..] where x > 0 => ...,
}
```

## Type tests

```verum
match value {
    x is Int   => process_int(x),
    x is Text  => process_text(x),
    _          => reject(),
}
```

`x is T` is a pattern that matches values of the compile-time type `T`
and narrows the binding. It also exists as an expression for boolean
predicates:

```verum
if value is Maybe.Some(x) && x > 0 { ... }
```

## Reference patterns

```verum
match &pair {
    &(a, b)      => ...,     // dereference then destructure
    &(ref a, _)  => ...,     // keep `a` as a reference
}
```

## Active patterns

Active patterns are named, user-defined matchers. They come in two flavours:

### Total (boolean return)

```verum
fn is_even(n: Int) -> Bool { n % 2 == 0 }
pattern Even(n: Int) = is_even(n);

match n {
    Even()  => "even",
    _       => "odd",
}
```

### Partial (`Maybe` return — extracts a value)

```verum
fn parse_int(s: Text) -> Maybe<Int> { ... }
pattern ParseInt(n: Int)(s: Text) = parse_int(s);

match input {
    ParseInt(n) => f"got {n}",
    _           => "not a number",
}
```

## Rest

`..` skips fields or elements:

```verum
let Point { x, .. } = p;              // ignore other fields
let [first, .., last] = xs;           // first and last, ignore middle
match tuple { (a, _, _, d) => ..., }  // position-based (for tuples)
```

## Exhaustiveness

`match` is exhaustive by default. The compiler runs a Maranget-style
*usefulness* analysis on a coverage matrix derived from the arms and
either accepts the match or prints a concrete witness for the missing
case.

```
error[E0601]: non-exhaustive patterns: `Err(Timeout { .. })` not covered
  --> src/foo.vr:12:5
   |
12 |     match result {
   |     ^^^^^^^^^^^^
   |
   = note: the following pattern is not covered: `Err(Timeout { .. })`
   = help: add an arm covering the missing case, or use `_`.
```

### How exhaustiveness is decided

Each arm becomes a row in a coverage matrix; each column corresponds to
one component of the scrutinee. The algorithm asks two questions:

1. **Is every value reachable?** — for each constructor of the
   scrutinee type, check that some row covers it. Missing constructors
   produce `E0601`.
2. **Is every arm useful?** — a later row is *useful* only if it
   matches something none of the earlier rows do. Redundant rows
   produce `W0602 unreachable pattern`.

Coverage for each pattern kind:

| Pattern kind | Treatment |
|--------------|-----------|
| Wildcard / identifier | Covers everything (terminates analysis) |
| Literal | Covers exactly one value |
| Variant / record / tuple | Recursive: product or sum decomposition |
| Range | Interval arithmetic — gaps and overlaps detected |
| Or | Union of alternatives |
| And | Conservative intersection (more restrictive than either) |
| Guard | **Conservative** — treated as *may fail* |
| Active (`Bool`) | Conservative, like a guard |
| Active (`Maybe<T>`) | Constructor match, like `Some/None` |
| Active (variant-returning) | Full exhaustiveness on return variants |
| TypeTest (`x is T`) | Coverage over the tested type's variants |
| Stream | Nil / single / two-or-more cases |

### Guards never prove exhaustiveness (by default)

Because a guard can evaluate to false, a match whose arms are all
guarded is **not** exhaustive:

```verum
match n {
    x if x > 0 => positive(),
    x if x < 0 => negative(),
    // E0601: `0` not covered — both guards are false for x == 0
}
```

Add an unguarded arm (`0 => zero()` or `_ => other()`) to close the
match.

### Guard verification with SMT

Opt in to Z3 verification of boolean/arithmetic guards with
`@verify(exhaustiveness)`:

```verum
@verify(exhaustiveness)
fn classify(n: Int) -> Text {
    match n {
        x if x > 0   => "pos",
        x if x < 0   => "neg",
        x if x == 0  => "zero",   // SMT proves the three guards partition Int
    }
}
```

The solver proves (or refutes) that the guard disjunction covers the
scrutinee type. Unprovable cases degrade to `W0603 match with all
guarded patterns (may fail)` rather than silently passing.

### Variant-returning active patterns

A custom active pattern that returns a *sum type* lets the compiler
prove exhaustiveness even though the match looks user-defined:

```verum
type Parity is Even | Odd;
pattern Parity(n: Int) -> Parity =
    if n % 2 == 0 { Parity.Even } else { Parity.Odd };

match Parity(x) {
    Parity.Even => "even",
    Parity.Odd  => "odd",   // proven exhaustive — no wildcard needed
}
```

### Range overlap detection

Overlapping ranges trigger `W0606`, and the compiler suggests a
partition:

```
warning[W0606]: range patterns `1..=10` and `5..=15` overlap in `5..=10`
  --> src/main.vr:12:9
   |
11 |         1..=10  => "low",
12 |         5..=15  => "medium",
   |         ^^^^^^^
   |
   = help: consider non-overlapping ranges: 1..=4, 5..=10, 11..=15
```

### Error and warning codes

| Code  | Severity | Meaning |
|-------|----------|---------|
| E0601 | error    | non-exhaustive pattern match |
| W0602 | warning  | unreachable pattern |
| W0603 | warning  | all arms guarded — match may fail |
| E0604 | error    | invalid pattern for the scrutinee's type |
| W0605 | warning  | `is T` on a concrete type (redundant) |
| W0606 | warning  | overlapping range patterns |
| W0607 | warning  | range fully covered by earlier arms |

## Witness generation

For every non-exhaustive match, the compiler produces a *concrete*
example of an uncovered value — not just "incomplete." Witnesses
recurse into constructors and pick literal values that no arm covers:

```
error[E0601]: non-exhaustive patterns: `Some(3)` and `None` not covered
   --> src/main.vr:10:5
    |
10  |     match x {
    |     ^^^^^^^
    |
    = help: add `Some(3) | None => ...` or use `_`.
```

The IDE surfaces the witness in real time through the LSP.

## Performance

The usefulness algorithm is O(n²) typical and memoised across match
expressions via an LRU cache. Target budgets: under 10 ms for typical
matches, under 100 ms for deeply-nested ones with dozens of
or-patterns.

## Irrefutable patterns

In `let` and function parameters, the pattern must match every value
of the type (irrefutable). `Point { x, y }` is irrefutable (records
have only one shape); `Shape.Circle { .. }` is not (it is one variant
of several).

## See also

- **[Functions](/docs/language/functions)** — how exhaustiveness
  interacts with `ensures` and totality.
- **[Refinement types](/docs/language/refinement-types)** — narrowing
  a binding via its guard pattern.
- **[Dependent types](/docs/language/dependent-types)** — length- and
  shape-indexed pattern matching.
- **[Cookbook → refinement patterns](/docs/cookbook/refinements)**.
