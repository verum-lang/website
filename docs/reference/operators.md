---
sidebar_position: 3
title: Operators
---

# Operators

All operators, grouped by category, with their associativity,
precedence, and overload protocol (if any).

## Precedence table

From tightest-binding (evaluated first) to loosest.

| Precedence | Operators | Associativity | Protocol |
|-----------:|-----------|---------------|----------|
| 1 | `.field`, `.method()`, `?.`, `[idx]`, `()` | left | — |
| 2 | `.await`, `?` (postfix) | left | — |
| 3 | `as` (cast), `is` (type test) | left | — |
| 4 | `-x`, `!x`, `~x`, `&x`, `*x` | prefix | `Neg`, `Not`, `BitNot` |
| 5 | `**` (exponent) | right | `Pow` |
| 6 | `*`, `/`, `%` | left | `Mul`, `Div`, `Rem` |
| 7 | `+`, `-` | left | `Add`, `Sub` |
| 8 | `<<`, `>>` | left | `Shl`, `Shr` |
| 9 | `&` (bitand) | left | `BitAnd` |
| 10 | `^` (bitxor) | left | `BitXor` |
| 11 | `|` (bitor) | left | `BitOr` |
| 12 | `..`, `..=` (range) | none | — |
| 13 | `==`, `!=`, `<`, `<=`, `>`, `>=` | none | `Eq`, `Ord` |
| 14 | `&&` (logical and) | left | short-circuit |
| 15 | `||` (logical or) | left | short-circuit |
| 16 | `??` (null coalesce) | left | — |
| 17 | `|>` (pipe) | left | — |
| 18 | `=`, `+=`, `-=`, `*=`, `/=`, `%=`, `&=`, `|=`, `^=`, `<<=`, `>>=` | right | `AddAssign`, ... |

## Overloadable operators

| Operator | Protocol | Signature |
|----------|----------|-----------|
| `a + b` | `Add<Rhs=Self>` | `fn add(self, rhs: Rhs) -> Self.Output` |
| `a - b` | `Sub` | similar |
| `a * b` | `Mul` | similar |
| `a / b` | `Div` | similar |
| `a % b` | `Rem` | similar |
| `a ** b` | `Pow` | similar |
| `-a` | `Neg` | `fn neg(self) -> Self.Output` |
| `!a` | `Not` | `fn not(self) -> Self.Output` |
| `~a` | `BitNot` | similar |
| `a & b` | `BitAnd` | similar |
| `a \| b` | `BitOr` | similar |
| `a ^ b` | `BitXor` | similar |
| `a << b` | `Shl` | similar |
| `a >> b` | `Shr` | similar |
| `a == b` | `Eq`, `PartialEq` | `fn eq(&self, other: &Self) -> Bool` |
| `a < b` | `Ord`, `PartialOrd` | via `cmp` |
| `a[i]` | `Index<Idx>` | `fn index(&self, i: Idx) -> &Self.Output` |
| `a[i] = v` | `IndexMut<Idx>` | similar |
| `a()` | `FnOnce` / `FnMut` / `Fn` | — |

## Non-overloadable

| Operator | Meaning |
|----------|---------|
| `&&` | logical AND (short-circuit) |
| `\|\|` | logical OR (short-circuit) |
| `=` | assignment |
| `..`, `..=` | range literals |
| `?` | `Result` / `Maybe` propagation |
| `.await` | future suspension |
| `is` | type test |
| `as` | type cast |
| `\|>` | pipe (`a \|> f` = `f(a)`) |
| `??` | null coalesce (`a ?? b` = `if a.is_some() { a.unwrap() } else { b }`) |
| `.` | field / method access |
| `?.` | optional chaining (`a?.b` = `a.and_then(|x| x.b)`) |
| `..` | rest / struct update |

## Bitwise

All standard C-style: `&`, `|`, `^`, `~`, `<<`, `>>`. Each has a
corresponding protocol for overloading (`BitAnd`, `BitOr`, `BitXor`,
`BitNot`, `Shl`, `Shr`).

## Unary `&` and `*`

`&x` takes a reference (tier matches the context).
`&checked x` — explicit checked reference.
`&unsafe x` — explicit unsafe reference.
`&mut x` — mutable reference.
`*x` — dereference (requires `unsafe` for raw pointers).

## Compound assignment

`a += b` is syntactic sugar for `a = a + b`, but the compiler emits
the in-place `add_assign` form when the protocol `AddAssign` is
implemented (avoiding unnecessary copies).

## Range operators

```verum
0..10      // exclusive: 0, 1, ..., 9
0..=10     // inclusive: 0, 1, ..., 10
..10       // prefix: anything up to 10 (exclusive)
0..        // suffix: anything 0 and above
..         // unbounded
```

Ranges are values (types `Range`, `RangeInclusive`, etc.) and
implement `Iterator` where the element type is ordered and
incrementable.

## See also

- **[Syntax](/docs/language/syntax)** — how operators fit into the
  grammar.
- **[Protocols](/docs/language/protocols)** — the `Add`, `Ord`, etc.
  protocols.
