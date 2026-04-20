---
sidebar_position: 10
title: Row polymorphism
description: Extensible records with structural, inference-friendly "more fields allowed" typing.
---

# Row polymorphism

> **TL;DR.** A closed record `{ x: Int, y: Int }` must match *exactly*
> those fields. An **open** record `{ x: Int | r }` means "a record
> with at least `x: Int`, and `r` captures whatever else is there."
> The row variable `r` is propagated by inference, makes functions
> reusable across record shapes, and costs nothing at runtime.

```verum
// A function that works for ANY record having an `x: Int` field.
fn get_x<r>(p: { x: Int | r }) -> Int { p.x }

let p3d = { x: 1, y: 2, z: 3 };
let p2d = { x: 1, y: 2 };
let px  = { x: 1, color: "red" };

get_x(p3d);  // ok, r = { y: Int, z: Int }
get_x(p2d);  // ok, r = { y: Int }
get_x(px);   // ok, r = { color: Text }
```

:::info Status
Fully wired end-to-end:
`Type::ExtensibleRecord { fields, row_var }` in
`crates/verum_types/src/ty.rs`; parser constructs the extension in
`verum_fast_parser/src/ty.rs`; unification implemented in
`crates/verum_types/src/unify.rs`. Lacks-constraints and row-based
dispatch are maturing — see [Implementation status](#implementation-status).
:::

## Why row polymorphism?

Real programs pass records around that carry *more* information
than any one function needs. Three alternatives exist:

1. **Sum types for every shape.** Forces you to name each
   combination — combinatorial explosion.
2. **Dynamic dispatch (Python dict / TS `any`).** Throws away
   static checking.
3. **Structural subtyping without row variables** (Go interfaces,
   TypeScript object types). Information loss: the compiler can't
   remember the *extra* fields.

Row polymorphism solves all three by treating "the rest of the
fields" as a *variable the type system tracks*. You keep full
static checking, full information, and a natural API.

### What it gives you

| Without rows | With rows |
|---|---|
| `fn draw(p: Point)` — caller must convert to `Point` | `fn draw<r>(p: { x: Int, y: Int \| r })` — takes any record with x,y |
| Strip fields to fit a type | Preserve all fields; compiler tracks the remainder |
| Information-losing upcasts | Row-preserving operations |
| Copy-paste handlers for each event shape | One handler with `{ type: EventType \| r }` |

## The syntax

```ebnf
record_type   = '{' , [ field_list ] , [ row_extension ] , '}' ;
row_extension = '|' , row_expr ;
row_expr      = identifier | identifier , { ',' , identifier } ;
```

Reading conventions:

- `{ x: Int, y: Int }` — **closed** record. Exactly these fields.
- `{ x: Int | r }` — **open** record. At least `x`; `r` is the
  remainder.
- `{ | r }` — open record with no known fields. Everything lives in `r`.
- `{ x: Int | r, s }` — (rare) two row variables, used when you
  want to split a record in two.

## A first example

```verum
type Point is { x: Float, y: Float };

// Works for Point, for 3D points, for colored points, anything.
fn distance_to_origin<r>(p: { x: Float, y: Float | r }) -> Float {
    sqrt(p.x * p.x + p.y * p.y)
}

let p2  = Point { x: 3.0, y: 4.0 };
let p3  = { x: 3.0, y: 4.0, z: 5.0 };
let pc  = { x: 3.0, y: 4.0, color: "red" };

distance_to_origin(p2);  // 5.0
distance_to_origin(p3);  // 5.0
distance_to_origin(pc);  // 5.0
```

No casts, no wrappers, no overloads.

## The lacks predicate

Row variables are not just "the rest of the record" — they are
**fresh** fields. Verum enforces the following rule:

> A row variable `r` in `{ x: T | r }` is statically guaranteed
> *not* to contain an `x` field of its own.

This is the **lacks predicate** `r # x` (read: "r lacks x").
Without it, unification would be ambiguous: does `{ x: Int, x: Int
| r }` mean duplicate fields, or conflict?

The compiler threads lacks predicates through inference:

```verum
fn rename_x_to_y<r>(p: { x: Int | r }) -> { y: Int | r }
    where r # y    // r must lack y
{
    let { x: v | rest } = p;
    { y: v | ..rest }
}
```

You rarely write `where r # y` by hand. The compiler infers it
from the target record. You *see* the predicate only in error
messages when unification fails.

## Row-preserving transformations

The signature `fn f<r>(p: { x: Int | r }) -> { x: Int, y: Int | r }`
promises: "whatever extra fields came in, come back out." This is
what makes row polymorphism usable for lens-like APIs.

```verum
fn with_default_y<r>(p: { x: Float | r }) -> { x: Float, y: Float | r }
    where r # y
{
    { x: p.x, y: 0.0 | ..p }
}

let p     = { x: 1.0, color: "red" };
let p_xy  = with_default_y(p);
// p_xy : { x: Float, y: Float, color: Text }
```

Field updates, field additions, and field removals all become
**row-preserving** operations.

## The splat operator `..r`

Splatting copies the fields of a record (or row-typed piece) into
another record literal:

```verum
let base  = { a: 1, b: 2 };
let plus  = { c: 3 | ..base };      // { a: 1, b: 2, c: 3 }
let over  = { b: 20 | ..base };     // compile error: b already in base
```

You can also splat from a captured row variable:

```verum
fn add_color<r>(p: { | r }) -> { color: Text | r }
    where r # color
{
    { color: "black" | ..p }
}
```

## Removing fields

```verum
fn drop_password<r>(u: { name: Text, password: Text | r }) -> { name: Text | r }
    where r # password
{
    let { password: _ | rest } = u;
    rest
}
```

The destructuring pattern binds `rest : { name: Text | r }` —
precisely the input record minus `password`.

## Interaction with generics

Row variables are ordinary type parameters — they live alongside
type parameters in generic lists:

```verum
fn map_field<T, U, r>(
    p: { field: T | r },
    f: fn(T) -> U,
) -> { field: U | r } {
    { field: f(p.field) | ..p }
}
```

Multiple row variables are allowed:

```verum
fn merge<r, s>(
    a: { | r },
    b: { | s },
) -> { | r, s }
    where r # s   // no overlapping fields
{
    { | ..a, ..b }
}
```

## Interaction with protocols

A protocol method that returns the record type often wants to
preserve rows:

```verum
type HasId<r> is protocol {
    fn id_of(self: { id: Int | r }) -> Int;
};
```

Implementations are automatic for any record containing an `id: Int`.

## Inference tour

```verum
let user  = { id: 1, email: "a@b", age: 33 };
let admin = { id: 2, email: "c@d", age: 40, role: "admin" };

fn email<r>(u: { email: Text | r }) -> Text { u.email }

let e1 = email(user);   // r inferred as { id: Int, age: Int }
let e2 = email(admin);  // r inferred as { id: Int, age: Int, role: Text }
```

At every call site the compiler synthesizes a fresh row variable
and binds it to whatever the caller supplies.

## Row polymorphism and refinements

Refinements can reference any field mentioned in the row head, but
not fields hidden in `r`:

```verum
type Valid<r> is { x: Int, y: Int | r } { self.x > 0, self.y > 0 };
```

The record is "a record with at least `x, y`, both positive, plus
anything else." The refinement predicate sees `x` and `y`.

## Row polymorphism and linearity

A row variable inherits the linearity of the fields it holds:

- If every known field is ordinary, the row is ordinary.
- If any field inside `r` is linear, the full record (including
  `r`) is linear.

This propagates correctly without extra annotation because
linearity is a property of the concrete record type at each call
site, not of the row variable itself.

## Multiple rows — splitting a record

Verum supports two row variables to express splits:

```verum
fn partition<r, s>(rec: { a: Int, b: Int | r, s }) -> ({ a: Int | r }, { b: Int | s }) {
    ({ a: rec.a | ..rec }, { b: rec.b | ..rec })
}
```

This form is rare; a single row variable covers most use cases.

## Comparison with other languages

| Language | Model | Verdict |
|---|---|---|
| **PureScript** | Row polymorphism is the default record model. Syntax: `{ x :: Int \| r }`. | Same model; Verum borrows the notation. |
| **Elm** | Row polymorphism on records (`{ e \| x : Int }`). | Same idea; Elm has no row lacks predicate by syntax. |
| **TypeScript** | Structural subtyping, but no row variables — extra fields are silently ignored, not tracked. | Verum's tracking is stronger. |
| **Haskell `record`** | Nominal by default; `GHC.Records` / `hlistify` simulate rows. | Verum makes rows first-class. |
| **OCaml objects** | Row polymorphism on object types (`< x : int; .. >`). | Same mechanism in Verum's record syntax. |

## Cookbook

### Middleware chain with carried context

```verum
type Req<r> is { method: Text, path: Text | r };

fn add_trace_id<r>(req: Req<r>) -> Req<{ trace_id: Text | r }>
    where r # trace_id
{
    { trace_id: new_trace_id() | ..req }
}

fn add_user<r>(req: Req<r>, u: User) -> Req<{ user: User | r }>
    where r # user
{
    { user: u | ..req }
}

// Pipeline preserves every enrichment.
let final_req: Req<{ trace_id: Text, user: User }> =
    add_user(add_trace_id(initial), current_user);
```

### Lens-lite getter/setter

```verum
fn get<K, V, r>(rec: { K: V | r }) -> V { rec.K }

fn set<K, V, W, r>(rec: { K: V | r }, v: W) -> { K: W | r }
{
    { K: v | ..rec }
}
```

(where `K` is a compile-time field name; see meta for binding
names as values.)

### Config flattening

```verum
fn apply_defaults<r, s>(user: { | r }, defaults: { | s }) -> { | r, s }
    where r # s   // user fields take priority, defaults only fill gaps
{ ... }
```

## Common pitfalls

### "The compiler won't let me unify two rows"

Usually a missing lacks predicate. Read the error: if it says

```
row `r` must lack field `x`, but may contain `x`
```

you need `where r # x` on the generic.

### "I see `r` in the type, where did that come from?"

Fresh row variables appear when you destructure an open record or
call a row-polymorphic function. You can pin them by annotating
the input type, or let the compiler infer and display the solution.

### "How do I express 'no extra fields allowed'?"

Drop the row variable. `{ x: Int, y: Int }` is a closed record.

### "Can I test whether a field is in `r`?"

Statically, no — `r` is arbitrary at compile time. At runtime the
question doesn't arise (the concrete record is monomorphised).
When you truly need dynamic extensibility, use a map.

### "Why can't I return `{ x: Int | r }` from a function whose input didn't have `r`?"

Because row variables are **generic** — every occurrence must be
tied to a parameter or be locally inferred. If `r` is not bound in
the signature, there's nothing to instantiate.

## Implementation status

| Feature | Status | Backing |
|---|---|---|
| Row syntax parsing | **Stable** | `verum_fast_parser/src/ty.rs` |
| `ExtensibleRecord` in type AST | **Stable** | `verum_types/src/ty.rs:637-680` |
| Row unification | **Stable** | `verum_types/src/unify.rs:1587-1632` |
| Splat `..r` in literals | **Stable** | parser + checker |
| Lacks predicates (`r # x`) | **Maturing** | inference records them; diagnostics in progress |
| Row-aware structural subtyping | **Experimental** | unify-based; no separate subtype relation |
| Row-based protocol dispatch | Planned | — |

## FAQ

**Does row polymorphism have runtime cost?** No. At each call
site the type is concrete; the layout is known.

**Does it interact with serialization?** Yes: `@derive(Serialize)`
on a row-polymorphic record works per-instantiation. Generic
serialization uses the concrete shape at the call site.

**What about row *type* polymorphism (rows whose *kind* varies)?**
That's kind polymorphism on rows; Verum's kind system supports it
via `r: Row`, but you'll rarely write that directly.

**Is `..p` a copy or a move?** It moves each field. For Copy
fields that's just a bit-copy; for affine/linear fields the source
can't be used after splat. The rule is: a splat consumes its
source.

**How does this compare to TypeScript intersection types?**
TypeScript intersections *compute* a combined type but don't
remember where fields came from. Verum row polymorphism *tracks*
the remainder symbolically.

## See also

- [Types](./types.md) — records and their closed form.
- [Generics](./generics.md) — type/row parameters side by side.
- [Destructuring](./destructuring.md) — `let { x | rest } = r` patterns.
- Source: `crates/verum_types/src/ty.rs`,
  `crates/verum_types/src/unify.rs`,
  `grammar/verum.ebnf` (§2.5 record_type).
