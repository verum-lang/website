---
sidebar_position: 2
title: Syntax
---

# Syntax

Verum's concrete syntax is defined by [`grammar/verum.ebnf`](/docs/reference/grammar-ebnf).
This page is the reader-friendly tour.

## Lexical structure

### Keywords

Only three are **reserved**: `let`, `fn`, `is`. These cannot be used
as identifiers under any circumstance.

The remaining ~60 keywords are **contextual** — they are keywords where
the grammar expects them and ordinary identifiers elsewhere. The full
list lives in **[Keywords](/docs/reference/keywords)**.

### Identifiers

```
identifier  = letter { letter | digit | "_" } ;
letter      = unicode-letter | "_" ;
```

Verum identifiers are Unicode letters, digits, and underscores, starting
with a letter or underscore. Type names and constructors conventionally
use `UpperCamelCase`; values and functions use `snake_case`.

### Literals

| Category  | Examples |
|-----------|----------|
| Integer   | `42`, `0xFF`, `0o77`, `0b1010`, `1_000_000`, `42i32`, `10u64` |
| Float     | `3.14`, `2.7e-3`, `0.5f32` |
| Boolean   | `true`, `false` |
| Char      | `'a'`, `'\n'`, `'\u{1F600}'` |
| String    | `"hello"`, `"""raw\nmultiline"""` |
| Byte string | `b"raw bytes"` |
| Format    | `f"x = {x}, y = {y + 1}"` |
| Tagged    | `json#"{...}"`, `sql#"""..."""`, `rx#"[0-9]+"`, `url#"https://..."` |
| Contextual | `@tag`, `$var`, `#RRGGBB` |

Tagged literals are validated at compile time by the literal's tag.
`sql#"..."` runs the SQL parser; `rx#"..."` compiles the regex;
`json#"..."` validates JSON syntax. Mismatches are compile errors.

### Comments

```verum
// line comment
/* block
   comment */
/// doc comment (attached to the following item)
//! inner doc comment (attached to the enclosing item)
```

### Operators

See **[Operators](/docs/reference/operators)** for the complete
precedence table.

## Top-level items

A file (module) is a sequence of items.

```verum
mount std.io;                        // import
pub type Color is Red | Green | Blue;// type definition
const MAX: Int = 1024;               // constant
@derive(Debug)
fn main() using [IO] { ... }         // function
implement Display for Color { ... }  // protocol impl
extern "C" { fn c_fn(x: Int) -> Int; } // FFI
```

### Visibility

- `pub` — exported from the cog.
- `internal` — visible within the cog.
- (none) — visible within the defining module.
- `protected` — visible to subtypes (types and impl blocks only).

## Expression-oriented

Almost everything is an expression. `if`, `match`, `{}`, and loops all
produce values.

```verum
let status = if code < 300 {
    "ok"
} else if code < 500 {
    "client-error"
} else {
    "server-error"
};

let count = match classify(msg) {
    Priority.High   => 10,
    Priority.Normal => 1,
    Priority.Low    => 0,
};
```

A block `{ s1; s2; expr }` returns `expr`. Trailing `;` makes the block
return `()`.

## Statements

```verum
let x = 42;                      // binding
let (a, b) = pair;               // destructuring binding
let mut counter = 0;             // mutable binding
counter += 1;                    // assignment
foo();                           // expression statement
```

## Pattern-positions

Patterns appear in `match` arms, `let` bindings, function parameters,
`if let` and `while let` guards, and `for` loops.

```verum
for User { id, name, email: _ } in users { ... }
if let Maybe.Some(x) = opt && x > 0 { ... }
while let Maybe.Some(line) = reader.next() { ... }
```

See **[Patterns](/docs/language/patterns)** for the full pattern grammar.

## Line endings and semicolons

Semicolons separate statements. The last expression in a block is
its value and is **not** followed by `;`. Adding a `;` turns it into
a statement that evaluates to `()`.

```verum
fn two() -> Int { 1 + 1 }     // returns 2
fn unit() -> ()  { 1 + 1; }   // returns ()
```
