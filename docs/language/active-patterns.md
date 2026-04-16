---
sidebar_position: 33
title: Active Patterns
description: F#-style user-defined patterns — total, partial, and parameterised.
---

# Active Patterns

An **active pattern** is a user-defined match arm. It looks and feels
like a constructor pattern, but the match logic is an ordinary function
body — which means the matcher can compute, parse, or probe the input
before deciding whether (and how) it matches.

This page documents:

- How to **declare** an active pattern (`pattern …`).
- How to **use** one in `match` arms.
- The difference between **total** and **partial** patterns.
- Pattern combinators (`&`, `|`).

## A first example

The idiomatic F# "even numbers" pattern:

```verum
pattern Even(n: Int) -> Bool = n % 2 == 0;

fn describe(n: Int) -> Text {
    match n {
        0 => "zero",
        Even() => f"{n} is even",
        _ => f"{n} is odd",
    }
}
```

The declaration `pattern Even(n: Int) -> Bool = n % 2 == 0;` reads:
*"`Even` is a pattern that takes an `Int` and matches when `n % 2 == 0`."*

In the match arm, `Even()` carries no parentheses arguments because
`n` is the match subject itself. The empty parens are the signal that
this is a **total** pattern — it always reaches a yes/no decision and
does not extract sub-values.

## Declaration grammar

```ebnf
pattern_def         = visibility , 'pattern' , identifier
                    , [ pattern_type_params ]
                    , '(' , pattern_params , ')'
                    , '->' , type_expr , '=' , expression , ';' ;

pattern_type_params = '(' , param_list , ')' ;   (* parameters for the pattern *)
pattern_params      = [ param , { ',' , param } ] ;  (* the match subject(s) *)
```

The pattern's **result type** determines its category:

| Result type  | Kind    | Meaning                                       |
|--------------|---------|-----------------------------------------------|
| `Bool`       | Total   | Does the subject match? No extraction.        |
| `Maybe<T>`   | Partial | If the subject matches, extract a `T`.        |

## Total patterns

Return `Bool`. Use them to test a condition as a pattern:

```verum
pattern Positive(n: Int) -> Bool = n > 0;
pattern Empty(t: &Text) -> Bool  = t.is_empty();

match number {
    Positive() => handle_positive(number),
    _ => handle_nonpositive(number),
}
```

Combined with the `&` pattern-AND, they compose:

```verum
match number {
    Positive() & Even() => "positive even",
    Positive() & _      => "positive odd",
    _                   => "nonpositive",
}
```

`&` matches when **both** patterns match. Unlike `|` (or-pattern),
`&` does not introduce any branch; it threads the same subject through
two conditions.

## Parameterised patterns

A pattern can take **pattern parameters** — values provided at the
match site — in addition to the match subject. The grammar uses two
parenthesised groups:

```verum
//                      pattern parameters     match subject
//                           ↓                     ↓
pattern InRange(lo: Int, hi: Int)(n: Int) -> Bool = lo <= n && n <= hi;

match temperature {
    InRange(60, 72)() => "comfortable",
    InRange(0, 32)() => "freezing",
    InRange(90, 130)() => "hot",
    _ => "extreme",
}
```

The **first** parenthesised group is the pattern parameters;
the **second** is the match subject. Total parameterised patterns
always use double parens in match arms: `InRange(0, 100)()`.

## Partial patterns

A pattern that returns `Maybe<T>` is **partial**: on match, it produces
a `T` that the match arm can bind:

```verum
pattern ParseInt(s: &Text) -> Maybe<Int> = s.parse_int();

match input {
    ParseInt()(n) => print(f"parsed {n}"),
    _ => print("not a number"),
}
```

The second parens `(n)` contain a **binding pattern** — an ordinary
pattern that binds whatever the partial pattern extracted.

Parameterised partial patterns work the same way:

```verum
pattern RegexMatch(re: Regex)(s: &Text) -> Maybe<List<Text>> =
    re.captures(s).map(|caps| caps.groups());

match email {
    RegexMatch(rx#"^([^@]+)@([^@]+)$")(groups) =>
        print(f"user = {groups[0]}, domain = {groups[1]}"),
    _ => print("invalid email"),
}
```

Or the lean form without parameters:

```verum
pattern HeadTail<T>(xs: &List<T>) -> Maybe<(T, List<T>)> =
    if xs.is_empty() { Maybe.None }
    else { Maybe.Some((xs[0], xs.slice_from(1))) };

match items {
    HeadTail()((h, t)) => process(h, t),
    _ => handle_empty(),
}
```

## Using patterns in nested positions

Active patterns appear **anywhere a pattern can appear** — not just
top level in `match`:

```verum
let [Positive() & Even() & first, ..] = numbers
    else { fallback() };

for (InRange(0, 255)(byte), offset) in stream.enumerate() {
    write_at(offset, byte);
}

if let ParseInt()(n) = text.trim() && n > 100 {
    print(f"big number: {n}");
}
```

They compose with destructuring, `let else`, if-let chains, and
stream patterns.

## Interaction with guards

Active patterns replace most uses of `if` guards in match arms. The
two forms are interchangeable but carry different intent:

```verum
// Guard form: condition is ad hoc, local to this arm.
match n {
    x if x > 0 && x % 2 == 0 => "positive even",
    _ => "other",
}

// Active pattern form: condition is named, reusable, compositional.
match n {
    Positive() & Even() => "positive even",
    _ => "other",
}
```

Prefer active patterns when the condition is reusable or appears in
multiple sites; prefer guards for one-off checks.

## Visibility

A `pub pattern` is exported like any other item. Private patterns are
module-local. Patterns can be defined in protocol impls and inherit
the implementer's generic parameters.

```verum
implement<T: Ord> List<T> {
    pub pattern Sorted(xs: &Self) -> Bool =
        forall i in 0..xs.len()-1. xs[i] <= xs[i+1];
}

match numbers {
    List.Sorted() => "already sorted",
    _ => "needs sort",
}
```

## Generic patterns

Patterns can be generic over their subject's type:

```verum
pattern NonEmpty<T>(xs: &List<T>) -> Bool = !xs.is_empty();
pattern First<T>(xs: &List<T>) -> Maybe<T> = xs.first().copied();

match list {
    First()(hd) => process(hd),
    _ => handle_empty(),
}
```

Type parameters are declared with the ordinary generic syntax
(angle brackets).

## Exhaustiveness

Active patterns are **opaque** to the exhaustiveness checker — the
compiler cannot, in general, prove that a set of active patterns
covers all cases. You **must** include a catch-all `_ =>` arm when
active patterns are the only alternatives:

```verum
match n {
    Even() => "even",
    Odd()  => "odd",
    _ => unreachable(),      // required even though Even & Odd logically cover Int
}
```

The `unreachable()` body is optimised away if the solver can prove the
arms are complete under an `@verify(formal)` function — see
[Proof DSL](/docs/language/proof-dsl).

## Declaration cheatsheet

| Shape                                | Declaration                                               | Match-site usage         |
|--------------------------------------|-----------------------------------------------------------|--------------------------|
| Total, no params                     | `pattern Even(n) -> Bool = n%2==0;`                       | `Even()`                 |
| Total, with params                   | `pattern InRange(lo, hi)(n) -> Bool = lo<=n<=hi;`          | `InRange(0, 100)()`      |
| Partial, no params                   | `pattern Parse(s) -> Maybe<Int> = s.parse_int();`          | `Parse()(n)`             |
| Partial, with params                 | `pattern Match(re)(s) -> Maybe<...> = re.match(s);`        | `Match(rx#"...")(g)`     |
| Generic partial                      | `pattern First<T>(xs) -> Maybe<T> = xs.first().copied();`  | `First()(h)`             |

## Grammar

```ebnf
pattern_def     = visibility , 'pattern' , identifier , [ pattern_type_params ]
                , '(' , pattern_params , ')' , '->' , type_expr , '=' , expression , ';' ;

active_pattern  = identifier , active_pattern_tail ;
active_pattern_tail
    = '(' , ')'                                             (* total, no params *)
    | '(' , ')' , '(' , pattern_list_nonempty , ')'         (* partial, no params *)
    | '(' , expression_list , ')' , '(' , [ pattern_list ] , ')' ;   (* with params *)
```

## See also

- **[Patterns](/docs/language/patterns)** — the full pattern grammar.
- **[Destructuring](/docs/language/destructuring)** — pattern forms in bindings.
- **[Tagged Literals](/docs/language/tagged-literals)** — `rx#"..."`, the natural
  input to `RegexMatch`.
