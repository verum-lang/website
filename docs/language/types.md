---
sidebar_position: 3
title: Types
---

# Types

Verum has a single type-definition form: `type T is ...`. What
follows the `is` determines what kind of type you get.

## Primitives

| Type | Description |
|------|-------------|
| `Bool` | `true` or `false` (1 byte) |
| `Int` | canonical 64-bit signed integer |
| `Int8`, `Int16`, `Int32`, `Int64`, `Int128` | sized signed |
| `UInt8..UInt128` | sized unsigned |
| `ISize`, `USize` | platform-pointer-sized |
| `Float` / `Float64` | canonical 64-bit IEEE 754 |
| `Float32` | 32-bit IEEE 754 |
| `Char` | Unicode scalar value (4 bytes, U+0000..U+10FFFF) |
| `Text` | UTF-8 string (heap-backed, in `std`) |
| `Byte` | alias for `UInt8` |
| `()` | unit (0 bytes) |
| `!` / `Never` | never (uninhabited bottom) |
| `unknown` | top |

## Records (product types)

```verum
type Point is { x: Float, y: Float };
type User  is { id: UserId, email: EmailAddr, age: Int { 0 <= self && self <= 150 } };
```

Record literals:

```verum
let p = Point { x: 1.0, y: 2.0 };
let u = User   { id: my_id, email: em, age: 28 };
```

Struct update:

```verum
let p2 = Point { x: 3.0, ..p };    // same y as p
```

### Row polymorphism

Record types can be *extensible* — specify some fields, leave the rest
open via a trailing row variable. Row-polymorphic functions work with
any record that has at least the listed fields:

```verum
// Accepts any record with an `x: Int` field, regardless of what else
// it contains. The row variable `r` captures the remaining fields.
fn get_x<r>(p: { x: Int | r }) -> Int { p.x }

let p2d = Point   { x: 1, y: 2 };
let p3d = Point3D { x: 1, y: 2, z: 3 };

get_x(p2d);  // OK — r unifies with {y: Int}
get_x(p3d);  // OK — r unifies with {y: Int, z: Int}
```

Multiple known fields + a row variable:

```verum
fn greet<r>(u: { name: Text, age: Int | r }) -> Text {
    f"Hello, {u.name}!"
}
```

Nested row polymorphism — each inner record can carry its own row
variable:

```verum
fn get_inner_name<r, s>(n: { inner: { name: Text | s } | r }) -> Text {
    n.inner.name
}
```

A closed record — no row variable — requires an exact match on the
field set; row-polymorphic code is strictly more permissive.

## Sum types (variants)

```verum
type Color is Red | Green | Blue;

type Shape is
    | Circle   { radius: Float }
    | Square   { side:   Float }
    | Triangle (Float, Float, Float);
```

Variants with no data, with named fields, or with tuple payloads are
all supported in the same declaration.

Constructors are namespaced under the type name:

```verum
let s = Shape.Circle { radius: 1.5 };
let c = Color.Red;
```

## Tuples

```verum
let pair: (Int, Text) = (42, "hello");
let (n, s) = pair;
let triple: (Int, Int, Int) = (1, 2, 3);
let unit: () = ();
```

Single-element tuples: `(x,)` — the trailing comma distinguishes them
from parenthesised expressions.

## Arrays and slices

```verum
let xs: [Int; 5]     = [1, 2, 3, 4, 5];        // fixed-size array
let zeros: [Int; 10] = [0; 10];                // repeated element
let ys: &[Int]       = &xs[..];                // slice (length-carrying reference)
```

## Function types

```verum
type Pred<T>     = fn(T) -> Bool;
type Reducer<A,R> = fn(R, A) -> R;
type AsyncHandler = async fn(Request) -> Response using [Http];
```

Function **types** include:
- parameter types,
- return type,
- `using [...]` context clause,
- `throws(E)` (if any),
- rank-2 / universal quantification for higher-rank types:
  `fn<R>(Reducer<B, R>) -> Reducer<A, R>` (the caller does _not_
  choose `R` — the function must work for every `R`).

## Type aliases

```verum
type UserId  = Int { self > 0 };
type UserMap = Map<UserId, User>;
```

Aliases are transparent — the compiler treats `UserId` and the
underlying refined `Int` as the same type for unification.

## Newtypes

A newtype is a distinct nominal type over a single payload:

```verum
type Celsius    is (Float);
type Fahrenheit is (Float);

fn boil() -> Celsius { Celsius(100.0) }
// `Celsius(100.0)` is NOT assignable to `Fahrenheit` without a conversion.
```

Newtypes cost nothing at runtime; they exist purely for the type
checker's benefit.

## Unit type

```verum
type Marker is ();
let m: Marker = Marker;
```

## Existential (opaque) types

```verum
fn make_iter() -> some I: Iterator<Item = Int> { 0..100 }
```

The caller sees _some_ type implementing `Iterator<Item = Int>` without
the concrete type leaking into the signature.

## Dynamic (trait) objects

```verum
let shapes: List<dyn Drawable> = list![Circle(1.0), Square(2.0)];
```

`dyn P` is a runtime-polymorphic pointer. See
**[Protocols](/docs/language/protocols)** for when to prefer `impl P`.

## Generics

```verum
type Pair<A, B> is { first: A, second: B };
type Identity<T: Clone + Eq> is (T);
```

Bounds are written with `:` and combined with `+`. Negative bounds
use `!`:

```verum
fn send_to<T: Send + !Sync>(x: T) { ... }
```

See **[Generics](/docs/language/generics)** for full type-parameter syntax.

## Refinement types (preview)

```verum
type Positive<T: Numeric> is T { self > T.zero() };
type SortedList<T: Ord>   is List<T> { self.is_sorted() };
```

Covered in **[Refinement types](/docs/language/refinement-types)**.

## Dependent types (preview)

```verum
// Sigma type — length-indexed vector
type Vec is n: Int, data: [Int; n];

// Path type (cubical HoTT)
type Loop<A> is Path<A>(x, x);
```

Covered in **[Dependent types](/docs/language/dependent-types)**.

## Where clauses

Constraints that are more natural at the end:

```verum
type Grid<T> is { cells: List<List<T>> }
    where self.cells.all(|row| row.len() == self.cells[0].len());
```

## Affine types

```verum
type affine Resource is { handle: Int, ... };
// A `Resource` value must be used exactly zero or one times — never
// duplicated. The compiler enforces this.
```

## Capability-restricted types

CBGR references carry a monotonically-attenuating capability set
drawn from the eight bits `READ | WRITE | EXECUTE | DELEGATE |
REVOKE | BORROWED | MUTABLE | NO_ESCAPE`. A capability-restricted
reference declares which subset it carries:

```verum
type Database.ReadOnly is Database with [READ];
type Database.Full     is Database with [READ, WRITE];

fn analyse(db: Database with [READ]) -> Stats { ... }
```

A capability set restricts which methods are callable on the value;
reducing the set (`db.readonly()`) is always allowed, but expanding
it is not — the compiler enforces monotonic attenuation across every
conversion. See
**[architecture → CBGR internals](/docs/architecture/cbgr-internals#capability-bits)**
for the full 8-bit table.
