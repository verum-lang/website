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
| `Float32` | 32-bit IEEE 754 — **as declared; see the note below** |
| `Char` | Unicode scalar value (4 bytes, U+0000..U+10FFFF) |
| `Text` | UTF-8 string (heap-backed, in `core.text`) |
| `Byte` | alias for `UInt8` |
| `()` | unit (0 bytes) |
| `!` / `Never` | never (uninhabited bottom) |
| `unknown` | top |

:::warning `Float32` does not narrow at Tier 0
Measured 2026-09-09 on the interpreter. A `Float32` carries the **f64**
bit pattern and dispatches to `Float`'s methods:

```verum
let a: Float32 = 1.0;
print(f"{a.to_bits()}");        // 4607182418800017408 = 0x3FF0000000000000
                                // the f64 encoding; f32's is 1065353216

let y: Float32 = 16777217.0;    // 2^24+1, not representable in f32
print(f"{y}");                  // 16777217 — a real f32 prints 16777216

let small: Float32 = 1e-40;     // subnormal as an f32
print(f"{small.is_normal()}");  // true — the answer for a DOUBLE
```

The annotation is checked and carried through the type system; what is
missing is the runtime width. Every `Float32` method whose answer
differs by width — `to_bits`, `from_bits`, `is_normal`, `is_subnormal`,
and every rounding boundary — answers for 64 bits. Methods that agree at
both widths (`is_finite`, `is_nan`) are correct, which is why this stayed
invisible. Tracked as T1322.
:::

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
field set; row-polymorphic code is meant to be strictly more permissive.
Note that the open form currently *parses* without *checking*: a record
missing the named fields is accepted today. See
[Row polymorphism](/docs/language/row-polymorphism) for the measured
status.

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

`[T; N]` is a **fixed-size** type: `N` is part of it, so `xs.len()` is a
compile-time constant and cannot change under a binding.

A reference to an array **unsizes to a slice**. All four spellings below
produce the same length-carrying reference, so a function that takes
`&[T]` accepts an array directly:

```verum
fn total(v: &[Int]) -> Int {
    let mut s: Int = 0;
    let mut i: Int = 0;
    while i < v.len() { s = s + v[i]; i = i + 1; }
    s
}

let xs: [Int; 5] = [1, 2, 3, 4, 5];
total(&xs);         // bare reference — unsizes
total(&xs[..]);     // explicit whole-range subslice
total(&xs[1..3]);   // a narrower window: length 2
```

Writing through `&mut [T]` writes through to the caller's array:

```verum
fn fill(v: &mut [Int]) {
    let mut i: Int = 0;
    while i < v.len() { v[i] = i * 10; i = i + 1; }
}

let mut ys: [Int; 4] = [0; 4];
fill(&mut ys);
// ys is now [0, 10, 20, 30]
```

### Byte buffers and FFI

A `[Byte; N]` **with the annotation** is a packed buffer — `N`
contiguous bytes, which is what a C `void*` expects. Without the
annotation, `[0; N]` is a general `List` whose elements are 8-byte
slots, and handing that to C corrupts it.

```verum
let mut buf: [Byte; 128] = [0; 128];   // packed, ABI-contiguous
let ptr = buf.as_ptr();                 // addresses buf[0], not a header
```

`.as_ptr()` / `.as_mut_ptr()` answer the address of the first element,
whether you call them on the array or on a subslice of it. Indexing
arithmetic holds: the pointer of `&buf[1..]` is exactly one byte past
the pointer of `&buf[..]`.

## Function types

```verum
type Pred<T>      is fn(T) -> Bool;
type Reducer<A,R> is fn(R, A) -> R;
type AsyncHandler is async fn(Request) -> Response using [Http];
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
type UserId  is Int { self > 0 };
type UserMap is Map<UserId, User>;
```

Aliases are transparent — the compiler treats `UserId` and the
underlying refined `Int` as the same type for unification.

> **Note:** Top-level type definitions use `is`, not `=`. The `=` form is
> reserved for **associated-type bindings inside `implement` / `protocol`
> blocks** (e.g. `type Item = WatchEvent<T>;` inside an
> `implement Iterator for Watch { … }`). See the
> [Grammar reference — Type definitions](../reference/grammar-ebnf.md#24-type-definitions--unified-is-syntax)
> for the full rules.

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

## Dynamic (protocol) objects

```verum
let shapes: List<dyn Drawable> = [Circle(1.0), Square(2.0)];
```

`dyn P` is a runtime-polymorphic pointer. `List<T>` is constructed
from a literal array with the canonical `[a, b, c]` syntax — no
`list!` macro, no `List.from_array`; the compiler coerces the
array literal at the let-binding boundary. See
**[Protocols](/docs/language/protocols)** for when to prefer a generic bound.

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

// Path type constructor (cubical HoTT): the type of paths
// from `a` to `b` in carrier `A`.
mount core.math.hott.HottPath;
type SelfLoop<A> is fn(x: A) -> HottPath<A>(x, x);
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
type DatabaseReadOnly is Database with [READ];
type DatabaseFull     is Database with [READ, WRITE];

fn analyse(db: Database with [READ]) -> Stats { ... }
```

A capability set restricts which methods are callable on the value;
reducing the set (`db.readonly()`) is always allowed, but expanding
it is not — the compiler enforces monotonic attenuation across every
conversion. See
**[architecture → CBGR internals](/docs/architecture/cbgr-internals#capability-bits)**
for the full 8-bit table.
