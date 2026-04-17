---
sidebar_position: 2
title: Syntax
description: The complete lexical and syntactic surface of Verum.
---

# Syntax

Verum's concrete syntax is defined by the
[grammar reference](/docs/reference/grammar-ebnf). This page is the
reader-friendly tour, one layer below the grammar and one layer above
the per-feature documentation.

## Lexical structure

### Keywords

Only three are **reserved** and cannot be used as identifiers:

```
let   fn   is
```

The remaining ~60 keywords are **contextual** — they are keywords where
the grammar expects them and ordinary identifiers elsewhere. For
example, `async` is a keyword only before `fn` or at the start of
a block expression; it is a valid variable name otherwise.

Contextual keyword categories (see [Keywords](/docs/reference/keywords)
for the full list):

| Category            | Members (partial)                                                    |
|---------------------|----------------------------------------------------------------------|
| **Primary**         | `type`, `where`, `using`                                             |
| **Control**         | `if`, `else`, `match`, `for`, `while`, `loop`, `break`, `continue`, `return`, `in` |
| **Async**           | `async`, `await`, `spawn`, `defer`, `errdefer`, `yield`, `throws`, `select`, `nursery`, `biased`, `try`, `recover`, `finally`, `on_cancel` |
| **Modifiers**       | `pub`, `mut`, `const`, `unsafe`, `pure`, `static`, `meta`, `cofix`, `extern`, `move`, `ref`, `default` |
| **Visibility**      | `public`, `internal`, `protected`, `private`                         |
| **Module**          | `module`, `mount`, `implement`, `context`, `protocol`, `extends`, `self`, `super`, `crate`, `as`, `provide`, `ffi` |
| **Contracts**       | `ensures`, `requires`, `invariant`, `decreases`, `result`, `some`    |
| **Proof**           | `theorem`, `lemma`, `axiom`, `corollary`, `proof`, `calc`, `have`, `show`, `suffices`, `obtain`, `by`, `qed`, `induction`, `cases`, `contradiction`, `forall`, `exists`, `tactic` |
| **Types**           | `affine`, `linear`, `stream`, `tensor`, `dyn`, `checked`, `view`, `Self`, `Type`, `Level`, `universe` |
| **Values**          | `true`, `false`, `null`                                              |

The complete enumeration is normative and lives in
**[Keywords](/docs/reference/keywords)**.

### Identifiers

```ebnf
ident_start    = letter | '_' ;
ident_continue = letter | digit | '_' ;
identifier     = ident_start , { ident_continue } ;
```

Identifiers are sequences of Unicode letters, digits, and underscores,
starting with a letter or underscore. Type names and constructors
conventionally use `UpperCamelCase`; functions and variables use
`snake_case`; constants use `SCREAMING_SNAKE_CASE`. These conventions
are not enforced by the compiler.

### Numeric literals

Integer and float literals may include underscores as digit separators
and optional type suffixes.

```verum
42             // Int (default)
42i32          // i32
42u64          // u64
1_000_000      // underscore separator
0xFF           // hex
0o77           // octal
0b1010         // binary
0xDEAD_BEEF    // hex with separator
0xFFu8         // hex with suffix

3.14           // Float (default, f64)
3.14f32        // f32
2.7e-3         // scientific
1.5e10f64      // explicit f64
```

Integer suffixes:

```
i8  i16  i32  i64  i128  isize
u8  u16  u32  u64  u128  usize
```

Float suffixes:

```
f32  f64
```

### String literals

Four forms:

```verum
"hello"                           // plain, escapes processed
"""raw
multiline
no \n escapes"""                  // raw multiline

b"bytes only, ASCII"              // byte string — produces &[Byte]
f"interpolated {expr}"            // format literal — splices checked
```

The **only** doubled-quote rule for raw multiline:

```verum
r1 = """content with " inside""";        // fine — single quote ok
r2 = """""value""""";                    // """ inside: doubled as """"
```

Triple-quoted content is raw (`\n`, `\t`, `\x00` are literal characters)
except for `${...}` interpolation, which always interpolates.

### Tagged literals

```verum
json#"{...}"           sql#"""SELECT..."""
rx#"[0-9]+"            url#"https://example.com"
d#"2026-04-17"         ip#"2001:db8::1"
```

Tagged literals are **compile-time validated** by the tag's grammar
and produce typed values (`JsonValue`, `SqlQuery`, `Regex`, `Url`,
`DateTime`, `IpAddress`…). See
**[Tagged Literals](/docs/language/tagged-literals)** for the full
registry.

### Character literals

```verum
'a'          // simple
'\n'         // escape
'\\'         // backslash
'\''         // apostrophe
'\x7F'       // hex
'\u{1F600}'  // Unicode scalar by hex code point
```

### Escape sequences

| Escape        | Meaning               |
|---------------|-----------------------|
| `\n`          | newline               |
| `\r`          | carriage return       |
| `\t`          | tab                   |
| `\0`          | null byte             |
| `\a`          | bell                  |
| `\b`          | backspace             |
| `\f`          | form feed             |
| `\v`          | vertical tab          |
| `\\`          | backslash             |
| `\'`          | apostrophe            |
| `\"`          | double quote          |
| `\xNN`        | hex byte              |
| `\u{NN..NN}`  | Unicode code point    |

Escapes process in `"..."` and `f"..."` but **not** in `"""..."""` or
tagged raw literals.

### Boolean literals

```verum
true   false
```

### Context-adaptive literals

A small set of non-string literals have dedicated syntax:

```verum
#FF0000             // hex colour (RGB — 6 hex)
#FF0000FFu8         // RGBA — 8 hex
@tag                // at-literal (tag value)
$identifier         // dollar literal (shell/macro variable)
```

### Comments

```verum
// line comment
/* block comment, no nesting — terminates on first */ */
/// doc comment — attaches to the following item
//! inner doc comment — attaches to the enclosing item
```

### Operators

Full precedence table in
**[Operators](/docs/reference/operators)**. The high-level families:

| Family              | Operators                                        |
|---------------------|--------------------------------------------------|
| Arithmetic          | `+` `-` `*` `/` `%` `**`                         |
| Comparison          | `==` `!=` `<` `>` `<=` `>=`                      |
| Logical             | `&&` `\|\|` `!`                                  |
| Bitwise             | `&` `\|` `^` `<<` `>>` `~`                       |
| Assignment          | `=` `+=` `-=` `*=` `/=` `%=` `&=` `\|=` `^=` `<<=` `>>=` |
| Range               | `..` `..=`                                       |
| Pipe                | `\|>`                                            |
| Compose             | `>>` `<<`                                        |
| Arrow               | `->` `=>`                                        |
| Optional            | `?.` `??` `?`                                    |
| Path/member         | `.` `::`                                         |

Special operators with keyword-like behaviour:

- `is` — pattern test (`value is Some(x)`, `x is Int`).
- `as` — type ascription (`x as Int`, `x as &T`).
- `.await` — future awaiting (`fut.await`).

## Top-level items

A file (module) is a sequence of items. An **item** is any of:

```verum
mount std.io;                              // import
pub type Color is Red | Green | Blue;      // type definition
pub const MAX: Int = 1024;                 // constant
pub static mut LOG_LEVEL: Int = 0;         // mutable static
module net { /* nested module */ }         // submodule
fn main() using [IO] { ... }               // function
implement Display for Color { ... }        // protocol implementation
context Database { ... }                   // context definition
protocol Serializable { ... }              // protocol (inside type_def)
extern "C" { fn c_fn(x: Int) -> Int; }     // FFI
ffi OpenSSL extends Crypto { ... }         // FFI boundary
pattern Even(n: Int) -> Bool = n%2==0;     // active pattern
meta fn sql_query(input: tt) { ... }       // meta (macro) definition
theorem add_comm(...) { proof by auto }    // theorem
@verify(formal) fn critical() { ... }      // attributed item
```

### Visibility

Five levels:

- `pub` — exported from the cog (alias: `public`).
- `pub(super)` — visible in the parent module and descendants.
- `pub(in path)` — visible within the named subtree.
- `internal` — visible within the cog but not to dependents.
- *(none)* — private to the defining module.

Plus `protected` as a protocol-local refinement (visible to subtypes
and implementations). Details in
**[modules → visibility](/docs/language/modules#visibility)**.

### Attributes on items

Items can be prefixed with one or more `@`-attributes:

```verum
@derive(Debug, Clone, Eq)
@repr(C)
pub type Point is { x: Float, y: Float };

@verify(formal)
fn transfer(from: &mut Account, to: &mut Account, amount: Money)
    where requires from.balance >= amount
    where ensures  to.balance - old(to.balance) == amount
{
    from.balance -= amount;
    to.balance   += amount;
}
```

See **[Attributes](/docs/language/attributes)** and
**[reference/attribute-registry](/docs/reference/attribute-registry)**.

## Expression-oriented

Almost everything is an expression. `if`, `match`, `{}`, `loop`, and
control-flow keywords all produce values.

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

A block `{ s1; s2; expr }` returns `expr`. A trailing `;` converts
`expr` to a statement whose value is `()`.

```verum
fn two() -> Int { 1 + 1 }       // returns 2
fn unit() -> ()  { 1 + 1; }     // returns ()
```

### Divergent expressions

Expressions that never return have type `!` (never). The compiler
treats any expression following them as unreachable.

```verum
fn choose(x: Int) -> Int {
    if x < 0 { panic("negative") }     // panic : !
    else     { x }
}
```

`panic`, `unreachable`, `unimplemented`, `todo`, `return`, `break`,
`continue`, and `throw` are divergent.

## Statements

```verum
let x = 42;                        // binding
let (a, b) = pair;                 // destructuring binding
let mut counter = 0;               // mutable binding
let Some(user) = find(id) else {   // `let else` — diverge on pattern fail
    return not_found();
};
counter += 1;                      // assignment
(a, b) = (b, a);                   // destructuring assignment
defer cleanup();                   // always runs at scope exit
errdefer log_error();              // runs only on error exit
provide Clock = SystemClock.new(); // context provision
foo();                             // expression statement
```

Statements end with `;` except for block-like expressions in statement
position (`if`, `match`, `loop`, `{}`) which auto-terminate.

### Pattern positions

Patterns appear in:

- `match` arms
- `let` bindings
- function parameters
- `if let` / `while let` guards
- `for` loop bindings
- `let else` (refutable)
- destructuring assignment targets

```verum
for User { id, name, email: _ } in users { ... }
if let Maybe.Some(x) = opt && x > 0 { ... }
while let Maybe.Some(line) = reader.next() { ... }
```

See **[Patterns](/docs/language/patterns)** for the full grammar.

## Line endings and semicolons

Semicolons separate statements. The last expression in a block is its
value and is **not** followed by `;`. Adding a `;` turns it into a
statement evaluating to `()`.

```verum
fn two() -> Int { 1 + 1 }          // returns 2
fn unit() -> ()  { 1 + 1; }        // returns ()
```

Line endings are not significant — a Verum program is insensitive to
whether statements span one line or many.

## Paths

A **path** is a dotted sequence of identifiers that names an item:

```verum
std.io.print
core.collections.Map
self.field
super.function
crate.types.User
```

Roots:

- `crate` — the root of the current cog.
- `self` — the current module.
- `super` — the parent module.

## Generics and type arguments

Type parameters are written in angle brackets after the item name:

```verum
fn identity<T>(x: T) -> T { x }

type Pair<A, B> is (A, B);

implement<T: Ord> SortedList for List<T> { ... }
```

Invocation with explicit types uses the same angle brackets:

```verum
List.new<Int>()
identity::<Text>("hi")            // Rust-style turbofish on expression position
```

The turbofish `::<...>` disambiguates in expression positions where
`<` could parse as a comparison. In type positions, bare `<...>` is
unambiguous.

## `using` context clauses

The `using [...]` clause appears after the return type of a function
or a function type:

```verum
fn fetch(url: &Url) -> Response using [Http];

fn send_to_all(msg: &Text) -> ()
    using [Database, Logger, Metrics]
{
    ...
}
```

A single context can drop the brackets:

```verum
fn read(path: &Path) -> Text using FileSystem;
```

The full syntax supports **negative**, **conditional**, **transformed**,
and **aliased** context specifications:

```verum
fn pure() using [!IO, !Random, !State<_>]            // negative — must not use
fn maybe_track() using [Analytics if cfg.prod]       // conditional
fn tx() using [Database.transactional()]             // transformed
fn dual() using [Database as primary,                // aliased
                 Database as replica]
```

See **[Context System](/docs/language/context-system)** for details.

## Where clauses

```verum
fn sort<T>(xs: &mut List<T>) where T: Ord { ... }

fn process<T, U>(xs: &List<T>) -> List<U>
    where T: Clone + Debug,
          U: From<T>,
          type U.Item: Display
{ ... }

@verify(formal)
fn transfer(from: &mut Account, to: &mut Account, amount: Money)
    where requires amount > 0 && from.balance >= amount,
          ensures  to.balance == old(to.balance) + amount,
          ensures  from.balance == old(from.balance) - amount
{ ... }
```

Three `where` flavours:

- `where T: Bound` — generic constraints.
- `where requires ...` / `where ensures ...` — contract specifications.
- `where meta ...` — compile-time invariants over generic parameters.

## Annotations and refinements

Types and functions can carry refinements (predicates that must hold):

```verum
type Probability is Float { 0.0 <= self && self <= 1.0 };

fn safe_divide(a: Int, b: Int { self != 0 }) -> Int { a / b }
```

See **[Refinement Types](/docs/language/refinement-types)**.

## Assignments

Destructuring assignment reuses the pattern grammar. See
**[Destructuring](/docs/language/destructuring)** for the full matrix
of forms.

```verum
(a, b) = (b, a);
[first, ..rest] = items;
Point { x, y, .. } = origin();
(x, y) += (dx, dy);
```

## What this page omits

Many features have their own dedicated pages. This page only covers the
**structural** surface — the shape of the grammar and the rules for
terminals. Semantics and details:

- Types: **[Types](/docs/language/types)**
- Functions: **[Functions](/docs/language/functions)**
- Patterns: **[Patterns](/docs/language/patterns)**
- Memory: **[References](/docs/language/references)**
- Async: **[Async & Concurrency](/docs/language/async-concurrency)**
- Contexts: **[Context System](/docs/language/context-system)**
- Proofs: **[Proof DSL](/docs/language/proof-dsl)**

## See also

- **[Grammar (EBNF)](/docs/reference/grammar-ebnf)** — normative grammar.
- **[Keywords](/docs/reference/keywords)** — full keyword list.
- **[Operators](/docs/reference/operators)** — precedence table.
- **[Tagged Literals](/docs/language/tagged-literals)** — tag registry.
