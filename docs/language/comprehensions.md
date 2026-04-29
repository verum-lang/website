---
sidebar_position: 26
title: Comprehensions
description: List, stream, map, set, and generator comprehensions with unified clause syntax.
---

# Comprehensions

Verum has five forms of comprehension, all sharing the same clause
grammar. The only thing that differs is the **container** — what the
expression produces.

| Form                              | Syntax                                 | Result type         |
|-----------------------------------|----------------------------------------|---------------------|
| List comprehension                | `[expr for p in iter …]`               | `List<T>`           |
| Stream comprehension              | `stream[expr for p in iter …]`         | `Stream<T>`         |
| Map comprehension                 | `{key: val for p in iter …}`           | `Map<K, V>`         |
| Set comprehension                 | `set{expr for p in iter …}`            | `Set<T>`            |
| Generator expression              | `gen{expr for p in iter …}`            | `impl Iterator<T>`  |

The clause grammar is shared:

```verum
for pattern in iterable         // draw elements
let pattern [: Type] = expr     // bind an intermediate
if condition                    // filter
```

Any number of clauses can chain, in any order, after the first `for`.

## Lists — `[expr for ... ]`

Eager. Produces a materialised `List<T>`.

```verum
let squares: List<Int> = [x * x for x in 0..10];

let evens = [n for n in 0..20 if n % 2 == 0];

let cartesian = [(a, b)
                for a in 1..=3
                for b in 1..=3
                if a != b];
```

The compiler unifies the expression type to determine the element type;
annotate the target binding to disambiguate if inference fails.

## Streams — `stream[expr for ...]`

Lazy, pull-based. Returns a `Stream<T>` that produces elements on
demand. Use when the input is infinite or large.

```verum
let primes = stream[n for n in 2.. if is_prime(n)];
let first_ten = primes.take(10).collect();     // -> List<Int>
```

Stream comprehensions compose with stream-producing methods:

```verum
let lines = file.byte_stream()
               |> .utf8_chunks()
               |> .lines();

let errors = stream[l for l in lines if l.starts_with("ERROR")];
```

See [`stdlib/async`](/docs/stdlib/async) for `Stream` combinators
(`take`, `filter`, `map`, `chunk`, `throttle`, …).

## Maps — `{key: val for ... }`

Produces a `Map<K, V>`. Disambiguated from a map literal by the `for`
keyword after the value expression.

```verum
let by_id = {user.id: user for user in users};

let word_lengths = {w: w.len() for w in words if !w.is_empty()};

// Swap keys/values:
let inverse = {v: k for (k, v) in original};
```

The key expression is evaluated first, then the value; duplicate keys
follow the map's documented behaviour (see [`stdlib/collections`](/docs/stdlib/collections)).

## Sets — `set{expr for ... }`

Prefix `set` disambiguates from a block and a map literal. Produces a
`Set<T>`.

```verum
let unique_domains = set{
    email.after_at()
    for email in addresses
    if email.is_valid()
};
```

## Generators — `gen{expr for ... }`

Returns a generic `impl Iterator<Item = T>`. Laziest of the container
forms — no materialisation, no stream plumbing, just an iterator
protocol.

```verum
fn window_pairs<T: Clone>(xs: &List<T>) -> impl Iterator<(T, T)> {
    gen{(xs[i].clone(), xs[i + 1].clone())
        for i in 0..xs.len() - 1}
}
```

A generator expression is the simplest way to return an iterator
without defining a named iterator type. For stateful iterators — those
with `yield` points — define a generator function (`fn*`) instead. See
**[Generators in functions](/docs/language/functions#generator-functions)**.

## Clauses in detail

### `for` clause

Draws elements by pattern. The pattern follows the normal pattern
grammar and can destructure tuples, records, and variants:

```verum
[user.name for User { name, active: true, .. } in users]
```

Multiple `for` clauses nest (leftmost is outermost):

```verum
[(a, b)
    for a in xs
    for b in ys]       // Cartesian product of xs × ys
```

### `let` clause

Binds an intermediate — avoids recomputing a value in the body and
subsequent clauses:

```verum
[point
    for raw in readings
    let point: Point = parse_point(&raw)
    if point.is_finite()]
```

### `if` clause

Filters. Runs after all preceding `for`/`let` clauses are in scope:

```verum
[(x, y)
    for x in 0..n
    for y in 0..n
    if x * x + y * y <= r * r]     // disc of radius r
```

## Stream literals

Beyond comprehensions, streams have **literal** syntax for common
shapes:

```verum
let fives  = stream[5, 5, 5, ...];       // infinite cycle of 5
let nats   = stream[0, 1, 2, ...];       // pattern detected: 0, 1, 2, 3, ...
let counts = stream[0..];                // infinite upward range
let lazy_r = stream[0..100];             // lazy [0, 100)
let inc    = stream[0..=100];            // lazy [0, 100]
```

Stream literals are desugared to constructors in [`stdlib/async`](/docs/stdlib/async);
they are strictly convenience over `Stream.from_iter`, `Stream.range`,
and friends.

## Stream patterns

The companion to stream literals and comprehensions is **pattern
matching** on stream prefixes:

```verum
match incoming_events {
    stream[]                     => no_events(),
    stream[ev]                   => single(ev),
    stream[a, b, ...rest]        => pair_plus(a, b, rest),
    stream[...all]               => consume_all(all),
}
```

`...rest` is an identifier that captures the remaining stream (still
lazy). `stream[...all]` binds the entire stream without consuming.

Stream patterns consume elements **lazily**: `stream[a, b, ...rest]`
pulls exactly two values and leaves `rest` available for further
iteration.

## Desugaring (for the curious)

A comprehension is equivalent to nested calls on the underlying
iterator protocol. For example:

```verum
[f(x) for x in xs if p(x)]
```

desugars to:

```verum
xs.iter()
  .filter(|&x| p(x))
  .map(|x| f(x))
  .collect<List<_>>()
```

The compiler emits the nested form directly for the non-list
containers: `Stream`, `Map`, `Set`, and `impl Iterator`. There is no
intermediate `List` allocated.

## When to choose which

| If you need                                              | Use                     |
|----------------------------------------------------------|-------------------------|
| An in-memory collection now                              | **list comprehension**  |
| Infinite or expensive inputs                             | **stream comprehension**|
| A lookup structure keyed by computed keys                | **map comprehension**   |
| Deduplication                                            | **set comprehension**   |
| An iterator to hand to another combinator                | **generator expression**|

## Grammar

From the [grammar reference](/docs/reference/grammar-ebnf):

```ebnf
comprehension_expr = '[' , expression , 'for' , pattern , 'in' , expression
                   , { comprehension_clause } , ']' ;
map_comprehension  = '{' , expression , ':' , expression
                   , 'for' , pattern , 'in' , expression
                   , { comprehension_clause } , '}' ;
set_comprehension  = 'set' , '{' , expression , 'for' , pattern , 'in' , expression
                   , { comprehension_clause } , '}' ;
generator_expr     = 'gen' , '{' , expression , 'for' , pattern , 'in' , expression
                   , { comprehension_clause } , '}' ;
stream_comprehension_expr = 'stream' , '[' , stream_body , ']' ;

comprehension_clause = 'for' , pattern , 'in' , expression
                     | 'let' , pattern , [ ':' , type_expr ] , '=' , expression
                     | 'if' , expression ;
```

## See also

- **[Patterns](/docs/language/patterns)** — destructuring in `for`/`let` clauses.
- **[Functions → generators](/docs/language/functions#generator-functions)** — the `fn*` form.
- **[`stdlib/async`](/docs/stdlib/async)** — `Stream` API.
- **[`stdlib/collections`](/docs/stdlib/collections)** — `List`, `Map`, `Set`.
