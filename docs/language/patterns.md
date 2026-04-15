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

`match` is exhaustive by default. The compiler computes reachable
patterns and rejects with a witness if anything is missing:

```
error[V4101]: non-exhaustive patterns
  --> src/foo.vr:12:5
   |
12 |     match result {
   |     ^^^^^^^^^^^^ pattern `Err(ConnectionError::Timeout { .. })` not covered
   |
note: add an arm covering the missing case, or use `_` to catch all.
```

## Irrefutable patterns

In `let` and function parameters, the pattern must match every value
of the type (irrefutable). `Point { x, y }` is irrefutable (records
have only one shape); `Shape.Circle { .. }` is not (it is one variant
of several).
