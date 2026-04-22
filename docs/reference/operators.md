---
sidebar_position: 3
title: Operators
description: Complete operator table — precedence, associativity, overload protocol.
---

# Operators

Every operator in Verum, by category, with precedence, associativity,
and the protocol you overload to change its behaviour.

## Precedence table

From **tightest** (evaluated first) to **loosest**.

| Prec | Operators                                                        | Associativity | Overload protocol         |
|-----:|------------------------------------------------------------------|---------------|---------------------------|
| 1    | `.field`, `.method()`, `?.`, `[idx]`, `()` — method/index/call    | left          | —                         |
| 2    | `.await`, `?` (postfix)                                          | left          | —                         |
| 3    | `as` (cast)                                                      | left          | `From`, `Into`            |
| 4    | `is` (pattern test)                                              | left          | —                         |
| 5    | `-x`, `!x`, `~x` (prefix unary)                                  | prefix        | `Neg`, `Not`, `BitNot`    |
| 6    | `&x`, `&mut x`, `&checked x`, `&unsafe x`, `*x` (ref/deref)       | prefix        | — / `Deref`               |
| 7    | `**` (exponent)                                                  | right         | `Pow`                     |
| 8    | `*`, `/`, `%`                                                    | left          | `Mul`, `Div`, `Rem`       |
| 9    | `+`, `-`                                                         | left          | `Add`, `Sub`              |
| 10   | `<<`, `>>`                                                       | left          | `Shl`, `Shr`              |
| 11   | `&` (bitand)                                                     | left          | `BitAnd`                  |
| 12   | `^` (bitxor)                                                     | left          | `BitXor`                  |
| 13   | `\|` (bitor)                                                     | left          | `BitOr`                   |
| 14   | `..`, `..=` (range)                                              | none          | —                         |
| 15   | `==`, `!=`, `<`, `<=`, `>`, `>=`                                 | none          | `Eq`, `Ord` / `PartialOrd`|
| 16   | `&&` (logical and)                                                | left          | short-circuit             |
| 17   | `\|\|` (logical or)                                               | left          | short-circuit             |
| 18   | `??` (null coalesce)                                              | left          | —                         |
| 19   | `\|>` (pipe)                                                      | left          | —                         |
| 20   | `=`, `+=`, `-=`, `*=`, `/=`, `%=`, `&=`, `\|=`, `^=`, `<<=`, `>>=` | right         | `AddAssign`, `SubAssign`, …|

**Lower number = tighter binding.** `a + b * c` parses as
`a + (b * c)` because `*` (8) binds tighter than `+` (9).

Non-associative operators (range, comparison) do **not chain**:
`a < b < c` is a parse error; use `a < b && b < c`.

## Overloadable operators

Implement the listed protocol to make an operator work on your type.

| Operator       | Protocol                 | Method signature                                      |
|----------------|--------------------------|-------------------------------------------------------|
| `a + b`        | `Add<Rhs = Self>`        | `fn add(self, rhs: Rhs) -> Self.Output`               |
| `a - b`        | `Sub`                    | `fn sub(self, rhs: Rhs) -> Self.Output`               |
| `a * b`        | `Mul`                    | `fn mul(self, rhs: Rhs) -> Self.Output`               |
| `a / b`        | `Div`                    | `fn div(self, rhs: Rhs) -> Self.Output`               |
| `a % b`        | `Rem`                    | `fn rem(self, rhs: Rhs) -> Self.Output`               |
| `a ** b`       | `Pow`                    | `fn pow(self, rhs: Rhs) -> Self.Output`               |
| `-a`           | `Neg`                    | `fn neg(self) -> Self.Output`                         |
| `!a`           | `Not`                    | `fn not(self) -> Self.Output`                         |
| `~a`           | `BitNot`                 | `fn not(self) -> Self.Output`                         |
| `a & b`        | `BitAnd`                 | `fn bitand(self, rhs: Rhs) -> Self.Output`            |
| `a \| b`       | `BitOr`                  | `fn bitor(self, rhs: Rhs) -> Self.Output`             |
| `a ^ b`        | `BitXor`                 | `fn bitxor(self, rhs: Rhs) -> Self.Output`            |
| `a << b`       | `Shl`                    | `fn shl(self, rhs: Rhs) -> Self.Output`               |
| `a >> b`       | `Shr`                    | `fn shr(self, rhs: Rhs) -> Self.Output`               |
| `a += b`       | `AddAssign`              | `fn add_assign(&mut self, rhs: Rhs)`                  |
| `a -= b`       | `SubAssign`              | `fn sub_assign(&mut self, rhs: Rhs)`                  |
| (similarly for `*=`, `/=`, `%=`, `&=`, `\|=`, `^=`, `<<=`, `>>=`)                                   |
| `a == b`       | `Eq`, `PartialEq`        | `fn eq(&self, other: &Self) -> Bool`                  |
| `a < b`        | `Ord`, `PartialOrd`      | via `cmp(&Self) -> Ordering`                          |
| `a[i]`         | `Index<Idx>`             | `fn index(&self, i: Idx) -> &Self.Output`             |
| `a[i] = v`     | `IndexMut<Idx>`          | `fn index_mut(&mut self, i: Idx) -> &mut Self.Output` |
| `*a`           | `Deref<Target = T>`      | `fn deref(&self) -> &Self.Target`                     |
| `a()`          | `FnOnce` / `FnMut` / `Fn`| (closure protocols — see below)                       |

## Closure protocols

Function types come in three flavours:

- **`FnOnce`** — consumes captured values; callable once.
- **`FnMut`** — may mutate captures; callable many times.
- **`Fn`** — immutable captures only; callable many times and
  re-entrantly.

`FnMut: FnOnce` and `Fn: FnMut: FnOnce` — a more capable closure
type subsumes a less capable one.

## Non-overloadable operators

These operators have fixed semantics:

| Operator  | Meaning                                                 |
|-----------|---------------------------------------------------------|
| `&&`      | Logical AND, short-circuit (right side skipped if left is false). |
| `\|\|`    | Logical OR, short-circuit.                              |
| `=`       | Assignment.                                             |
| `..`      | Exclusive range.                                        |
| `..=`     | Inclusive range.                                        |
| `?`       | Propagate `Result.Err` / `Maybe.None`.                  |
| `.await`  | Future suspension.                                      |
| `is`      | Pattern test (`value is Pattern`, `x is Type`).         |
| `as`      | Type cast (`x as Int`, `&x as *unsafe mut T`).          |
| `\|>`     | Pipe — `a \|> f(args)` desugars to `f(a, args)`.        |
| `??`      | Null-coalesce — `a ?? b` = `a.unwrap_or(b)`.            |
| `.`       | Field / method access.                                  |
| `?.`      | Optional chaining — `a?.b` = `a.and_then(\|x\| x.b)`.   |
| `..`      | Rest / struct-update (in patterns and record exprs).    |
| `@`       | Pattern alias binding; `x @ Pattern` binds `x` *and* tests. |
| `::`      | Turbofish (expression-position type args).              |
| `->`      | Function type / return type arrow.                      |
| `=>`      | Match-arm arrow / closure / lambda.                     |

## Range operators

```verum
0..10         // exclusive:  0, 1, ..., 9       Range<Int>
0..=10        // inclusive:  0, 1, ..., 10      RangeInclusive<Int>
..10          // prefix:     anything up to 10  RangeTo<Int>
0..           // suffix:     0 and above        RangeFrom<Int>
..            // unbounded                      RangeFull
```

Ranges are values. They implement `Iterator` when the element type
is ordered and incrementable (integers, characters). Float ranges
*don't* iterate — use `stride(0.0, 1.0, 0.1)` or a manual `for`.

## Unary reference operators

```verum
&x              // tier-0 managed (CBGR ~0.93 ns measured)
&checked x      // tier-1 compiler-proven (0 ns)
&unsafe x       // tier-2 programmer-proven (0 ns), needs `unsafe` block
&mut x          // mutable reference
&checked mut x
&unsafe mut x
*x              // dereference — safe for &T/&checked T; unsafe for &unsafe T and raw pointers
```

See [language/references](/docs/language/references).

## Compound assignment

`a += b` is sugar for `a = a + b`, but the compiler calls the
`AddAssign` protocol when implemented, avoiding a temporary copy:

```verum
let mut xs = vec![1, 2, 3];
xs += 4;                        // desugars to xs.add_assign(4)
```

Every binary arithmetic/bitwise operator has a `*Assign` counterpart.

## The `is` operator

```verum
if value is Maybe.Some(x)    { ... }                 // pattern test
while result is Pending()    { poll(); }             // loop condition
if x is not None             { use(x); }             // negation
let flag = value is Int;                             // type-test pattern
```

`is` has the same precedence as `==`/`<`/`>` (level 15). It's a
pattern **test**; bindings introduced by the pattern scope outside
the test expression where accessible.

See [language/patterns](/docs/language/patterns) and
[language/active-patterns](/docs/language/active-patterns).

## The `as` operator

`as` performs a **value conversion** — not a raw reinterpret:

```verum
let n: Int = 3.7 as Int;        // truncates to 3 (via Float.to_int)
let s: Int = "42" as Int;       // parses — error at compile time if impossible
let p: *unsafe mut Byte = slice.as_ptr();
let b: Byte = (n as u8);
```

`as` dispatches to the `From`/`Into` protocol when implemented, or
to a compiler-built-in conversion for primitives.

## Pipe `|>` and method pipe `|> .method()`

```verum
let sum =
    list
    |> .filter(|x| x > 0)
    |> .map(|x| x * 2)
    |> .sum();

// equivalent to:
let sum = list.filter(|x| x > 0).map(|x| x * 2).sum();
```

For ordinary functions:

```verum
value |> transform(extra_arg)
// desugars to:
transform(value, extra_arg)
```

The method-pipe form (`|> .method(args)`) is grammar-level sugar
for chainable pipelines; see
[language/syntax](/docs/language/syntax).

## Optional chaining `?.`

```verum
user?.address?.city?.name       // returns `Maybe.None` if any step is None

// Equivalent to:
user.and_then(|u| u.address)
    .and_then(|a| a.city)
    .and_then(|c| c.name)
```

Each `?.method()` short-circuits on `Maybe.None`; the result type is
`Maybe<Final>`.

## Null coalesce `??`

```verum
let name = preferred ?? default ?? "anonymous";
// preferred and default are Maybe<Text>; "anonymous" is the final fallback
```

`a ?? b` returns `a.unwrap()` if `a.is_some()`, else `b`. Chains
left-associatively.

## Error propagation `?`

```verum
fn load() -> Result<Config, Error> {
    let text = read_file(path)?;                     // propagate IoError → Error
    let cfg  = parse(&text)?;                        // propagate ParseError → Error
    Result.Ok(cfg)
}
```

`?` is postfix. On `Result.Ok(v)` it evaluates to `v`; on
`Result.Err(e)` it returns early with `Result.Err(From.from(e))`,
which converts the inner error type via `From`.

Also works on `Maybe`:

```verum
fn first(xs: &List<Int>) -> Maybe<Int> {
    let head = xs.first()?;                          // None propagates
    Maybe.Some(*head * 2)
}
```

## Precedence examples

```verum
a + b * c == b * c + a          // parses as:  ((a + (b * c)) == ((b * c) + a))
let v = x ?? y |> .foo();       // parses as:  let v = (x ?? y) |> .foo();
a && b || c                     // parses as:  ((a && b) || c)
match x is Some(v) && v > 0 { ... }   // parses as: match (x is Some(v) && v > 0)
-x.y                             // parses as:  -(x.y)
```

For ambiguous-looking code, parenthesise.

## See also

- **[Syntax](/docs/language/syntax)** — how operators fit into the
  grammar.
- **[Protocols](/docs/language/protocols)** — `Add`, `Ord`,
  `Display`, …
- **[Patterns](/docs/language/patterns)** — the `is` pattern test.
- **[Error Handling](/docs/language/error-handling)** — `?` in
  context.
- **[References](/docs/language/references)** — `&T` / `&checked T`
  / `&unsafe T`.
