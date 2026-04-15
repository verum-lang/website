---
sidebar_position: 3
title: text
---

# `core::text` — UTF-8 strings

`Text` is Verum's string type: UTF-8, immutable by default, with
**SSO** (small-string optimisation — up to 23 bytes stored inline).

## `Text`

```verum
let greeting: Text = "Hello, Verum!";
let formatted: Text = f"x = {x}, y = {y + 1}";
let raw: Text = """line 1
line 2 — no escapes""";
```

Key methods:

```verum
fn len(&self) -> Int;              // byte length
fn char_count(&self) -> Int;       // Unicode scalar count
fn is_empty(&self) -> Bool;
fn chars(&self) -> Chars;          // Iterator<Char>
fn bytes(&self) -> ByteIter;       // Iterator<UInt8>
fn lines(&self) -> Lines;
fn char_indices(&self) -> CharIndices;

fn starts_with(&self, prefix: &Text) -> Bool;
fn ends_with(&self, suffix: &Text) -> Bool;
fn contains(&self, needle: &Text) -> Bool;
fn find(&self, needle: &Text) -> Maybe<Int>;
fn rfind(&self, needle: &Text) -> Maybe<Int>;
fn matches(&self, pattern: Regex) -> Bool;

fn split(&self, sep: &Text) -> Split;
fn split_whitespace(&self) -> SplitWhitespace;
fn trim(&self) -> &Text;
fn trim_start(&self) -> &Text;
fn trim_end(&self) -> &Text;

fn to_uppercase(&self) -> Text;
fn to_lowercase(&self) -> Text;
fn replace(&self, from: &Text, to: &Text) -> Text;
fn reversed(&self) -> Text;

fn parse<T: FromStr>(&self) -> Result<T, ParseError>;
```

## Format strings

```verum
let msg = f"User {user.id}: {user.name.to_uppercase()}";
```

- `{expr}` — Display format.
- `{expr:?}` — Debug format.
- `{expr:10}` — width 10.
- `{expr:>10}` — right-align, width 10.
- `{expr:0>5}` — zero-padded, width 5.
- `{expr:.3}` — precision 3 (floats).
- `{expr:#x}` — hex with `0x` prefix.

## Char

```verum
type Char;   // Unicode scalar value

let c: Char = 'A';
c.is_alphabetic();
c.is_numeric();
c.is_whitespace();
c.to_uppercase();
c.to_lowercase();
c.general_category();   // GeneralCategory enum
c.encode_utf8();        // [UInt8; 1..4]
```

## Regex

```verum
let pattern = rx#"(\d{4})-(\d{2})-(\d{2})";
if let Maybe.Some(m) = pattern.captures(&input) {
    let (y, mo, d) = (m[1], m[2], m[3]);
}

for m in pattern.find_iter(&text) { ... }

let replaced = pattern.replace_all(&text, "$1/$2/$3");
```

Regex is compiled at the tag (`rx#"..."`) — invalid regex is a
**compile error**, not a runtime failure.

## Tagged literals

| Tag | Validates | Notes |
|-----|-----------|-------|
| `rx#"..."` | regex syntax | produces a `Regex` |
| `sql#"..."` | SQL syntax (via `Database` schema if present) | produces `Query` |
| `json#"..."` | JSON syntax | produces `JsonValue` |
| `url#"..."` | URL syntax | produces `Url` |
| `html#"..."` | HTML validity | produces `Html` |

Interpolated variants use `#"""..."""` with `${expr}` inside.

## Formatter

```verum
type Formatter;    // target for Display / Debug implementations

type Write is protocol {
    fn write_text(&mut self, s: &Text) -> Result<(), WriteError>;
    fn write_char(&mut self, c: Char) -> Result<(), WriteError>;
};
```

## Print functions

```verum
print(s: Text)    using [IO]
println(s: Text)  using [IO]
eprint(s: Text)   using [IO]
eprintln(s: Text) using [IO]

// Debug helpers
format_debug<T: Debug>(x: &T) -> Text
format_display<T: Display>(x: &T) -> Text
dbg(expr: T) -> T   // prints expr=<value> to stderr, returns value
```

## See also

- **[base](/docs/stdlib/base)** — `Display`, `Debug`, `FromStr` protocols.
- **[io](/docs/stdlib/io)** — `stdout`, `stderr`, the `Write` protocol at I/O level.
