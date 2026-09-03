---
sidebar_position: 10
title: Row polymorphism
description: Open record types parse today; what they check, and what is not implemented yet.
---

# Row polymorphism

> **TL;DR.** The **type** `{ x: Int | r }` — "a record with at least
> `x: Int`, where `r` stands for the rest" — is part of the grammar and
> parses today. It does **not** yet constrain anything: a record without
> `x` is accepted where one is required. The expression-level half of the
> design (anonymous record literals, the pipe-splat, lacks predicates) is
> not implemented at all.

:::warning Status — measured, not planned
Every row in the table at the end of this page was measured with
`verum check` on 2026-09-03, each probe differing from its control in one
value. Three things this page previously called **Stable** do not work.
Read the table before building on the feature.
:::

## The idea

A closed record type `{ x: Int, y: Int }` names exactly two fields. An
**open** one, `{ x: Int | r }`, is meant to say "at least `x: Int`; `r`
captures whatever else is there", so one function serves every record
that carries the fields it actually reads:

```verum
fn get_x<r>(p: { x: Int | r }) -> Int { p.x }
```

That is the design. What follows is where the implementation stands.

## What parses and works

**Open record types in a signature.** `grammar/verum.ebnf:1403` gives

```ebnf
record_type = '{' , [ field_list ] , [ '|' , identifier ] , '}' ;
```

so `{ x: Float, y: Float | r }` is grammatical in any type position, and
the parser builds it (`TypeKind::Record { fields, row_var }`). A function
declared that way compiles, and a `Point` passed to it is accepted.

Note the grammar admits **one** row variable, not a list: `{ x: Int | r, s }`
is not the language.

**Record update, with the comma spelling.** A functional update exists —
`field_inits` ends with an optional `'..' , expression`:

```verum
type P is { a: Int, b: Int };

let base = P { a: 1, b: 2 };
let plus = P { a: 5, ..base };     // ok: b comes from base
```

It requires the **named type** in front and a **comma** before `..`.

## What does not work yet

**The open record type constrains nothing.** Both of these are accepted:

```verum
type Point is { x: Float, y: Float };
type Only  is { z: Float };

fn dist<r>(p: { x: Float, y: Float | r }) -> Float { p.x }

dist(Point { x: 3.0, y: 4.0 });   // accepted — correct
dist(Only { z: 1.0 });            // ALSO accepted — should be refused
```

The second call passes a record that has neither `x` nor `y`. The row type
is currently syntax without a check, so it documents intent rather than
enforcing it.

**Anonymous record literals do not exist.** `record_expr = path , '{' ,
field_inits , '}'` requires a named type, so

```verum
let base = { a: 1, b: 2 };        // error<E100>: unbound variable: a
```

the braces are parsed as a **block**, and `a` as an expression.

**The pipe-splat is not the update syntax — and it silently means
something else.** This page used to show `{ c: 3 | ..base }`. With a named
type in front it parses, but as a *bitwise or* of `3` with the *range*
`..base`:

```verum
let plus = P { a: 5 | ..base };
// error<E400>: Type mismatch in field 'a' of 'P':
//              expected 'Range<P>', found 'Int'
```

Use the comma spelling above.

**Lacks predicates are a parse error.** `where r # y` — the constraint
this page described as threaded through inference — is not in the grammar
and not in the parser:

```verum
fn rename<r>(p: { x: Int | r }) -> Int where r # y { p.x }
// error<E032>: Parse error: expected `{` to start function body
```

Consequently the error message this page quoted (``row `r` must lack field
`x` ``) is not one the compiler can produce.

## Status

| Feature | Status | Measured |
|---|---|---|
| Open record type parses (`{ x: T \| r }`) | **Works** | in a signature, accepted |
| Open record type *checks* | **Not implemented** | a record lacking the named fields is accepted |
| Record update `P { a: 5, ..base }` | **Works** | 0 errors |
| Anonymous record literal `{ a: 1 }` | **Not implemented** | E100 — parsed as a block |
| Pipe-splat `{ a: 5 \| ..base }` | **Not implemented** | parses as bit-or with a range |
| Lacks predicate `where r # y` | **Not implemented** | E032 parse error |
| Two row variables `{ x: T \| r, s }` | **Not in the grammar** | one row variable only |
| Row-based protocol dispatch | Planned | — |

## See also

- [Types](./types.md) — records and their closed form.
- [Generics](./generics.md) — type parameters.
- [Grammar reference — Types](../reference/grammar-ebnf.md#27-types) — the
  formal `record_type` production, which is the authority here.
