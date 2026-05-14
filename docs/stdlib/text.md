---
sidebar_position: 3
title: text
description: Text, Char, format strings, regex, tagged literals, case-fold, TextBuilder, numeric text representations.
status: partial
status_detail: 128/130 protocol-conformance tests pass on 2026-05-14 (Iterator, IntoIterator, Default, Length, Eq, Clone, From, AddAssign, Add, AsRef, FromStr, capacity, mutation, truncate/clear/pop, repeat/reverse, predicates, trim, starts_with/ends_with, from_int/bool, concat/join, padding, count_matches, cmp, Hash, rfind). §T (capacity) + §U (join) + §V (Hash — hasher_runtime intercept + canonical indexed-while in Hasher.write + Formatter.write_bytes) + §A (rfind — closed transitively when the broken `for x in slice` patterns left the stdlib precompile chain) closed this session. §I + §R pinned closed. Remaining open: §B (Char.encode_utf8 receiver-kind), §D (function-id collision), §N (List.extend_from_slice).
---

# `core.text` — UTF-8 text, Char, formatting, regex

import StdlibStatus from '@site/src/components/StdlibStatus';

<StdlibStatus
  status="partial"
  detail="128/130 protocol-conformance tests pass on 2026-05-14.  Closed this session: §A (rfind — LLVM SmallVectorBase::grow_pod SIGSEGV closed transitively when the broken `for x in slice` patterns left the stdlib precompile chain), §T (Text.capacity), §U (Text.join), §V (DefaultHasher + canonical indexed-while slice iter in Hasher.write / Formatter.write_bytes), §I (cmp), §R (count_matches), §C from_digit hex (char).  Remaining open: §B (Char.encode_utf8 receiver-kind), §D (function-id collision), §N (List.extend_from_slice)."
  defects={[
    {area: 'text', summary: '§B Char.encode_utf8 receiver-kind / §D function-id collision / §N List.extend_from_slice.  Closed: §A / §C / §E / §F / §G / §H / §I / §J / §K / §L / §M / §O / §P / §Q / §R / §T / §U / §V.'},
    {area: 'char', summary: '4 defect classes — &mut Char mutation, eq_ignore_ascii_case, general_category misroute, AnyChar.matches (§E now closes via shared root with text/text §C).  §C (from_digit hex case) closed 2026-05-14.'},
    {area: 'builder', summary: 'Int.BAnd / Int.BNeq dispatch broken — every push fails'},
    {area: 'regex', summary: 'Verum/Rust intrinsic ABI bridge defects — find_all SetIdx NullPointer, Maybe<Text> shape mismatch'},
    {area: 'tagged_literals', summary: 'Runtime dispatcher reads CallM key from wrong register slot — random Text values surface as missing method names'},
  ]}
  sweepDate="2026-05-14"
/>

> **Status legend.** See [stdlib status badge system](/docs/stdlib/overview#stdlib-status-badge-system).
>
> The Text receiver is the most-used type in the standard library after `Int`,
> so any defect in Text propagates broadly. The conformance suite at
> `core-tests/text/` pins every public API behaviour with `@test`, every
> algebraic law with `@property`/exhaustive sweeps, every cross-stdlib
> integration with `@test`, and every active defect with an `@ignore`d
> regression test. When a defect closes, removing the `@ignore` should
> immediately turn the test green.

`Text` is Verum's string type: UTF-8, mutable in-place via `&mut`, with
**SSO** (small-string optimisation — up to 23 bytes stored inline,
no allocation). The flat layout `{ptr: &unsafe Byte, len: Int, cap: Int}`
is 24 bytes; `cap == 0` indicates a static / immutable string literal.

| File | What's in it | Status |
|---|---|---|
| [`text.vr`](#text) | `Text` + 100+ method API surface | **regression-only** |
| [`char.vr`](#char) | `Char` + classification, conversion, `CharPattern`, `GeneralCategory` | **partial** |
| [`format.vr`](#formatting--write) | `Formatter`, `FormatSpec`, `Alignment`, `Sign`, `DebugStruct`/`Tuple`/`List`/`Map`, `Write`, `print`/`println`/`eprint`/`eprintln`, `dbg`, `format_display`, `format_debug` | **partial** |
| [`regex.vr`](#regex) | `Regex`, `RegexError`, 7 intrinsics (is_match, find, find_all, replace, replace_all, split, captures) | **regression-only** |
| [`tagged_literals.vr`](#tagged-literals) | `validate_json` / `validate_sql` / `validate_uri` runtime validators | **regression-only** |
| [`case_fold.vr`](#case-folded-comparison) | `fold_char_ascii` / `fold_byte_ascii` / `fold_text_ascii` / `compare_ascii_nocase` / `equal_ascii_nocase` (SQLite NOCASE) | **complete** |
| [`builder.vr`](#textbuilder) | `TextBuilder` — incremental string construction | **regression-only** |
| [`numeric/`](#numeric-text-representations) | `Decimal`, `BigInt`, `BigDecimal`, `Rational`, `Modular` | **partial** |

`Text` implements: `Clone`, `Drop`, `Eq`, `Ord`, `Hash`, `Default`,
`Length`, `Debug`, `Display`, `AsRef<[Byte]>`, `Add`, `Add<&Text>`,
`AddAssign<Text>`, `AddAssign<&Text>`, `From<&str>`, `From<Char>`,
`FromStr` (and FromStr for every primitive type via Text), `FromIterator<Char>`,
`Extend<Char>`, `Extend<Text>`.

---

## `Text`

### Construction

```verum
let s: Text = "hello";                 // static literal (cap = 0)
let s2 = Text.new();                   // empty
let s3 = Text.with_capacity(64);       // pre-allocate; len() == 0
let s4 = Text.try_with_capacity(1024); // fallible counterpart
let s5 = Text.from_utf8(bytes)?;       // Result<Text, Utf8Error>
let s5a = Text.from_bytes(bytes)?;     // alias for from_utf8 (compat alias)
let s6 = Text.from_utf8_lossy(bytes);  // replaces invalid bytes with U+FFFD
let s7 = Text.from_utf16(units)?;      // Result<Text, Utf16Error>
let s8 = Text.from_utf16_lossy(units); // U+FFFD on unpaired surrogates
let s9 = Text.from_char('A');          // single-char Text
let sa = Text.from_int(42);            // "42"
let sb = Text.from_float(3.14);        // "3.14"
let sc = Text.from_bool(true);         // "true"
let sd = f"x={x}, y={y + 1}";          // format literal
```

### Length & Capacity

```verum
s.len()              -> Int            // byte length
s.is_empty()         -> Bool
s.char_count()       -> Int            // Unicode-scalar count (iterates)
s.capacity()         -> Int            // capacity (see "Capacity tracking" below)
s.as_str()           -> &Text          // borrow as &Text
s.as_bytes()         -> &[Byte]        // raw UTF-8 byte view
s.as_ptr()           -> &unsafe Byte   // raw pointer (unsafe APIs)
```

#### Capacity tracking

`capacity()` reports the byte budget the buffer can hold without
reallocating. The semantics differ by underlying representation:

| Representation | `capacity()` |
|----------------|--------------|
| Static literal `"..."` (cap = 0, immutable) | `len()` |
| Small-string (NaN-boxed inline, ≤6 bytes) | `len()` |
| Heap-allocated flat `[hdr][len:u64][bytes…]` | `len()` |
| Builder layout `{ptr, len, cap}` (from `with_capacity` / `try_with_capacity` / `reserve`) | the `cap` field |

The first three are immutable views — pushing past `len()` requires
migrating to a builder layout, so the reported capacity equals the
current byte length. Only the builder layout carries a separate `cap`
field that can exceed `len()`.

**Tier-0 caveat (open — task #5):** the Tier-0 interpreter materialises
`Text.with_capacity` / `try_with_capacity` results into a representation
that preserves the cap field, but earlier revisions of the runtime
collapsed them to a small-string and reported capacity == 0. Tests pin
the contract at `core-tests/text/text/regression_test.vr::
regression_with_capacity_reports_capacity` (+ siblings).

### Indexing (byte- and char-based)

```verum
s.byte_at(i)         -> Maybe<Byte>            // raw byte
s.char_at(byte_idx)  -> Maybe<Char>            // char starting at byte_idx
s.nth_char(n)        -> Maybe<Char>            // n-th Unicode scalar
s.byte_index_of_char(n) -> Maybe<Int>          // byte offset of n-th char
s.is_char_boundary(idx) -> Bool                // safe byte-split point
```

`Text` is **not** character-indexed — `s[i]` would be ambiguous over UTF-8
and is deliberately not provided.

### Iteration

```verum
s.chars()         -> Chars         // Iterator<Char>
s.bytes()         -> ByteIter      // Iterator<Byte>
s.char_indices()  -> CharIndices   // Iterator<(Int, Char)>
s.lines()         -> Lines         // Iterator<&Text> (split on '\n')
s.matches(pat)    -> TextMatches
s.match_indices(pat) -> TextMatchIndices
s.to_chars()     -> List<Char>     // collect-to-list shortcut
```

All four iterator types implement `Iterator`, `IntoIterator`, and
`FusedIterator`.

### Slicing

```verum
s.slice(start_byte, end_byte) -> Text          // byte range
s.substring(start_char, end_char) -> Text      // char range
s.split_at(mid: Int) -> (Text, Text)           // byte split
```

### Predicates

```verum
s.starts_with(prefix: &Text) -> Bool
s.ends_with(suffix: &Text) -> Bool
s.contains(needle: &Text) -> Bool
s.contains_any(chars: &List<Char>) -> Bool
s.is_empty() -> Bool
s.is_ascii() -> Bool
s.is_numeric() -> Bool                 // every char is_numeric
s.is_alphabetic() -> Bool              // every char is_alphabetic
s.is_alphanumeric() -> Bool
s.is_whitespace() -> Bool              // every char is_whitespace; "" → false
s.is_blank() -> Bool                   // empty or whitespace-only
s.is_uppercase() -> Bool
s.is_lowercase() -> Bool
```

### Searching

```verum
s.find(needle: &Text) -> Maybe<Int>            // first byte index (KMP)
s.rfind(needle: &Text) -> Maybe<Int>           // last byte index
s.find_char(ch: Char) -> Maybe<Int>            // first byte of char
s.index_of(needle: &Text) -> Maybe<Int>        // alias for find
s.index_of_any(chars: &List<Char>) -> Maybe<Int>
s.count(needle: &Text) -> Int                  // non-overlapping count
s.count_matches(pattern: &Text) -> Int         // alias of count
```

### Splitting

```verum
s.split(sep: &Text) -> List<Text>
s.splitn(n: Int, sep: &Text) -> List<Text>
s.rsplit(sep: &Text) -> List<Text>
s.rsplitn(n: Int, sep: &Text) -> List<Text>
s.split_whitespace() -> List<Text>
s.split_ascii_whitespace() -> List<Text>
s.split_inclusive(sep: &Text) -> List<Text>    // keep separator
s.split_once(sep: &Text) -> Maybe<(Text, Text)>
s.rsplit_once(sep: &Text) -> Maybe<(Text, Text)>
s.words() -> List<Text>                        // split_whitespace alias
s.lines() -> Lines
```

### Trimming & Stripping

```verum
s.trim() -> Text
s.trim_start() -> Text
s.trim_end() -> Text
s.trim_matches(pattern: &Text) -> Text
s.trim_start_matches(pattern: &Text) -> Text
s.trim_end_matches(pattern: &Text) -> Text
s.strip_prefix(prefix: &Text) -> Maybe<Text>   // Some(rest) on match, None otherwise
s.strip_suffix(suffix: &Text) -> Maybe<Text>
s.remove_prefix(prefix: &Text) -> Text         // rest on match, self otherwise
s.remove_suffix(suffix: &Text) -> Text
```

### Case Conversion

```verum
s.to_uppercase() -> Text                       // full Unicode
s.to_lowercase() -> Text
s.to_upper() -> Text                           // alias
s.to_lower() -> Text
s.to_ascii_uppercase() -> Text                 // faster; ASCII-only
s.to_ascii_lowercase() -> Text
s.capitalize() -> Text                         // first char uppercase
s.to_title_case() -> Text                      // every word uppercase
s.swapcase() -> Text                           // upper↔lower
s.eq_ignore_case(other: &Text) -> Bool

s.make_ascii_uppercase()                       // in-place, &mut self
s.make_ascii_lowercase()
```

### Replacement

```verum
s.replace(pattern: &Text, replacement: &Text) -> Text       // all matches
s.replacen(pattern: &Text, replacement: &Text, count: Int) -> Text
s.replace_range(start: Int, end: Int, replacement: &Text)   // &mut self
s.remove_matches(pattern: &Text)                            // &mut self
```

### Mutation (`&mut self`)

```verum
s.push(ch: Char)
s.push_byte(b: Byte)                  // assumes valid UTF-8 context
s.push_str(other: &Text)
s.insert(idx: Int, ch: Char)
s.insert_str(idx: Int, other: &Text)
s.truncate(new_len: Int)
s.clear()
s.pop() -> Maybe<Char>
s.remove(idx: Int) -> Char
s.retain(predicate: fn(Char) -> Bool)
s.reserve(additional: Int)
s.shrink_to_fit()
s.shrink_to(min_capacity: Int)
```

### Padding & Centering

```verum
s.pad_left(width: Int, fill: Char) -> Text     // right-align, fill on left
s.pad_right(width: Int, fill: Char) -> Text    // left-align, fill on right
s.pad_start(width: Int, fill: Char) -> Text    // alias for pad_left
s.pad_end(width: Int, fill: Char) -> Text      // alias for pad_right
s.center(width: Int, fill: Char) -> Text
s.zfill(width: Int) -> Text                    // zero-pad numerically
s.expand_tabs(tab_size: Int) -> Text           // '\t' → tab_size spaces
```

### Concat / Join / Repeat / Reverse

```verum
s.concat(other: &Text) -> Text
Text.join(parts: &[Text], sep: &Text) -> Text
s.repeat(n: Int) -> Text
s.reverse() -> Text                            // by Unicode scalar
```

### Parsing & Conversion

```verum
s.parse_int() -> Result<Int, ParseError>
s.parse_int_radix(radix: Int) -> Result<Int, ParseError>
s.parse_float() -> Result<Float, ParseError>
s.parse_bool() -> Result<Bool, ParseError>

s.try_to_int() -> Maybe<Int>
s.try_to_float() -> Maybe<Float>
s.to_int() -> Int                              // panics on invalid
s.to_float() -> Float

s.into_bytes() -> List<Byte>                   // consumes
s.encode_utf16() -> List<Int>
```

`FromStr` is implemented for every primitive: `Int`, `Int8`, `Int16`,
`Int32`, `Int64`, `Int128`, `UInt8`, `UInt16`, `UInt32`, `UInt64`,
`UInt128`, `ISize`, `USize`, `Float`, `Float32`, `Float64`, `Bool`,
`Text` itself.

### Building (incremental)

```verum
let mut s = Text.with_capacity(128);
s.push_str(&"hello ");
s.push('w');
s.push_str(&"orld");
s += "!";                                      // via AddAssign

// Heavy concatenation: prefer TextBuilder (see below)
```

### Pitfalls

- **byte index ≠ char index** — `s.find("…") -> Maybe<Int>` returns a
  byte offset. Slicing by a char offset requires `byte_index_of_char`
  or `char_indices()`.
- **Static literals have `cap == 0`** — mutating methods like
  `truncate`/`clear` on a `let mut s: Text = "hello"` need the
  null-pointer guard documented in `core-tests/text/text/audit.md §E`.
- **Inserting / popping on a mutable Text invokes `&mut Char` deref** —
  see `core-tests/text/char/audit.md §A` for the active defect class.

### Error types

```verum
public type Utf8Error  is { valid_up_to: Int };       // implements Display, Debug, Eq
public type Utf16Error is { index: Int };             // implements Display, Debug, Eq
public type ParseError is { message: Text };          // implements Display, Debug, Eq
```

---

## `Char`

`Char` is a Unicode scalar value (up to `U+10FFFF`, excluding
surrogates).

### ASCII Classification

```verum
c.is_ascii()                c.is_ascii_alphabetic()    c.is_ascii_uppercase()
c.is_ascii_lowercase()      c.is_ascii_digit()         c.is_ascii_hexdigit()
c.is_ascii_alphanumeric()   c.is_ascii_whitespace()    c.is_ascii_control()
c.is_ascii_punctuation()    c.is_ascii_graphic()
```

### Unicode Classification

```verum
c.is_alphabetic()      c.is_numeric()      c.is_alphanumeric()
c.is_whitespace()      c.is_control()
c.is_uppercase()       c.is_lowercase()
c.is_digit(radix)
c.is_valid_unicode()
```

### Conversion

```verum
c.to_ascii_uppercase()       c.to_ascii_lowercase()
c.to_uppercase()             c.to_lowercase()                   // full Unicode
c.make_ascii_uppercase()                                        // &mut self, in-place
c.make_ascii_lowercase()
c.eq_ignore_ascii_case(other: &Char) -> Bool

c.to_digit(radix: Int) -> Maybe<Int>
Char.from_digit(digit: Int, radix: Int) -> Maybe<Char>
```

### UTF-8 / UTF-16 Encoding

```verum
c.len_utf8() -> Int                  // 1, 2, 3, or 4
c.len_utf16() -> Int                 // 1 or 2
c.encode_utf8(buf: &mut [Byte]) -> Int      // returns bytes written
c.encode_utf16(buf: &mut [Int])  -> Int     // returns code units written
```

### Unicode Categories

```verum
c.general_category() -> GeneralCategory
c.escape_debug() -> Text
c.escape_unicode() -> Text
c.escape_default() -> Text
```

### `GeneralCategory`

29 variants matching Unicode UCD categories:

```verum
type GeneralCategory is
    | Lu | Ll | Lt | Lm | Lo                      // Letter
    | Mn | Mc | Me                                // Mark
    | Nd | Nl | No                                // Number
    | Pc | Pd | Ps | Pe | Pi | Pf | Po            // Punctuation
    | Sm | Sc | Sk | So                           // Symbol
    | Zs | Zl | Zp                                // Separator
    | Cc | Cf | Cs | Co | Cn;                     // Other
```

Group predicates: `is_letter()`, `is_mark()`, `is_number()`,
`is_punctuation()`, `is_symbol()`, `is_separator()`, `is_other()`.
Implements `Debug`.

### `CharPattern` — predicate trait

`CharPattern` is implemented by `Char` (matches itself), `fn(Char) -> Bool`
(arbitrary predicate), `AnyChar` (built from `char_any_of(&[c1, c2, ...])`),
and `CharRange` (built from `char_range(start, end)`).

```verum
type AnyChar is { chars: List<Char> };
type CharRange is { start: Char, end: Char };

public fn char_any_of(chars: &[Char]) -> AnyChar;
public fn any_of(chars: &[Char]) -> AnyChar;        // alias
public fn char_range(start: Char, end: Char) -> CharRange;

pattern.matches(c: Char) -> Bool

// Used by Text.trim_matches, Text.split, etc.
s.trim_matches(char_any_of(&[' ', '\t', '\n']))
```

---

## Format strings — `f"..."`

```verum
let msg = f"x = {x}, y = {y + 1}";
let deb = f"{value:?}";                  // Debug format
let hex = f"{byte:02X}";                 // 2-char uppercase hex
let pct = f"{ratio:.2%}";                // 2-decimal percent
let pad = f"{name:>20}";                 // right-align width 20
let lz  = f"{n:05}";                     // zero-padded width 5
```

### Format specifier grammar

```
[fill][align][sign][#][0][width][.precision][type]
```

| Field | Values |
|---|---|
| `fill` | any char (default: space) |
| `align` | `<` left, `>` right, `^` centre |
| `sign` | `+` always, `-` only negative (default), space for leading space |
| `#` | alternate form (`0x` for hex, `0b` for binary, ...) |
| `0` | zero-pad numerics |
| `width` | integer; or `*` to read from next argument |
| `precision` | integer; controls float digits / string truncation |
| `type` | `?` Debug, `x`/`X` hex, `o` octal, `b` binary, `e`/`E` scientific, `%` percent |

### Examples

```verum
f"{123:+}"         // "+123"
f"{-5:+}"          // "-5"
f"{0xFF:#x}"       // "0xff"
f"{0xFF:#X}"       // "0xFF"
f"{255:08b}"       // "11111111"
f"{3.14159:.3}"    // "3.142"
f"{0.85:.1%}"      // "85.0%"
f"{42:>10}"        // "        42"
f"{name:.5}"       // truncate to 5 chars
```

---

## Formatting & `Write`

### `Write` protocol

Where formatting writes to.

```verum
public type Write is protocol {
    fn write(&mut self, bytes: &[Byte]) -> Result<Int, WriteError>;
    fn write_str(&mut self, s: &Text)   -> Result<(), WriteError>;       // default impl
    fn write_char(&mut self, c: Char)   -> Result<(), WriteError>;       // default impl
    fn flush(&mut self)                 -> Result<(), WriteError>;
};
```

### `WriteError` & `WriteErrorKind`

```verum
public type WriteError      is { kind: WriteErrorKind };
public type WriteErrorKind  is Io | BufferFull | Encoding;

WriteError.io()           -> WriteError
WriteError.buffer_full()  -> WriteError
```

`WriteErrorKind` implements `Eq`, `Display`, `Debug`. `WriteError`
implements `Eq`, `Display`, `Debug`.

### `TextAlignment` / `Sign`

```verum
public type TextAlignment is Left | Center | Right;       // default Left
public type Sign is Minus | Plus | Space;                 // default Minus
```

### `FormatSpec`

```verum
public type FormatSpec is {
    fill: Char,
    align: TextAlignment,
    sign: Sign,
    width: Maybe<Int>,
    precision: Maybe<Int>,
    alternate: Bool,
    format_type: Maybe<Char>,
};

FormatSpec.default()                   // (' ', Left, Minus, None, None, false, None)
FormatSpec.new()                       // alias of default()
spec.with_width(w)
spec.with_precision(p)
spec.with_align(a)
spec.with_fill(c)
```

### `Formatter` / `TextFormatter`

The receiver in every `Display` / `Debug` impl. Implements `Write`.

```verum
implement Display for Point {
    fn fmt(&self, f: &mut Formatter) -> Result<(), FormatError> {
        f.write_str(&f"({self.x}, {self.y})")
    }
}

implement Debug for Point {
    fn fmt_debug(&self, f: &mut Formatter) -> Result<(), FormatError> {
        f.debug_struct("Point")
            .field("x", &self.x)
            .field("y", &self.y)
            .finish()
    }
}
```

### Debug helpers

```verum
f.debug_struct("Name").field("x", &x).field("y", &y).finish()
f.debug_tuple("Name").field(&a).field(&b).finish()
f.debug_list().entries(iter).finish()
f.debug_map().entries(iter).finish()
```

### Print functions (require `[IO]`)

```verum
print(s: &Text)
println(s: &Text)
println_empty()
eprint(s: &Text)
eprintln(s: &Text)

format_debug<T: Debug>(value: &T) -> Text             // pure
format_display<T: Display>(value: &T) -> Text         // pure
dbg<T: Debug>(value: T) -> T                          // prints to stderr, passes through
```

`FormatResult` is `Result<(), FormatError>` — the canonical return type of
`Display.fmt` and `Debug.fmt_debug`.

---

## Regex

```verum
public type Regex is { pattern: Text };
public type RegexError is { message: Text };
```

### API

```verum
Regex.new(pattern: Text) -> Result<Regex, RegexError>
                                       // today: always Ok (compile is deferred)

r.is_match(text: Text) -> Bool                    // any match
r.find(text: Text) -> Maybe<Text>                 // first match
r.find_all(text: Text) -> List<Text>              // every match
r.replace(text: Text, repl: Text) -> Text         // first match
r.replace_all(text: Text, repl: Text) -> Text     // every match
r.split(text: Text) -> List<Text>                 // split on every match
r.captures(text: Text) -> Maybe<List<Text>>       // ordered capture groups,
                                                  // index 0 = whole match,
                                                  // missing groups = ""
r.as_str() -> Text                                // recover raw pattern
```

All seven runtime ops are wired end-to-end through the VBC interpreter
and the AOT MLIR lowering path:

| Surface | Intrinsic | Sub-opcode |
|---------|-----------|------------|
| `is_match` | `regex_is_match` | `TensorSubOpcode 0xE2` |
| `find_all` | `regex_find_all` | `TensorSubOpcode 0xE0` |
| `replace_all` | `regex_replace_all` | `TensorSubOpcode 0xE1` |
| `split` | `regex_split` | `TensorSubOpcode 0xE3` |
| `find` | `regex_find` | `TensorExtSubOpcode 0x0A` |
| `replace` | `regex_replace` | `TensorExtSubOpcode 0x0B` |
| `captures` | `regex_captures` | `TensorExtSubOpcode 0x0C` |

The single-match / capture variants live in the ext-extended opcode space
because the bulk variants pre-empted the regex-dedicated `0xE0..=0xE3`
slot before they landed.

### Replacement syntax

`replace` / `replace_all` honour the `regex` crate's
[replacement syntax](https://docs.rs/regex/latest/regex/struct.Regex.html#replacement-string-syntax):

- `$0` — whole match
- `$1`, `$2`, … — numbered capture groups
- `${name}` — named groups (when the pattern uses `(?<name>…)`)
- `$$` — literal `$`

### Capture groups

```verum
let r = Regex.new("(\\d+)-(\\w+)").unwrap();
match r.captures("id-42-foo extra") {
    Some(groups) => {
        // groups[0] = "42-foo" (whole match)
        // groups[1] = "42"     (first group)
        // groups[2] = "foo"    (second group)
    },
    None => panic("no match"),
}
```

Non-participating groups appear as empty strings — re-checking group
membership against the pattern is the caller's responsibility for now.
A future `Maybe<Text>` per-group surface is on the v2 list.

---

## Tagged literals

Compile-time and runtime validators for tagged string literals.
Recognised tags (each compiles to a `validate_<tag>(literal_text)`
runtime check; panic on `false`):

```verum
json#"{ \"x\": 1 }"                            // → JsonValue
sql#"""SELECT * FROM users WHERE id = ${id}""" // → SqlQuery
html#"""<div>${content}</div>"""               // → Html (escape-by-default)
url#"https://example.com/search?q=${q}"        // → Url (URL-encoded)
yaml#"..."   toml#"..."   xml#"..."
rx#"..."     re#"..."     // Regex
```

### Runtime validators

```verum
public fn validate_json(s: Text) -> Bool   // must start { } / [ ] / " "
public fn validate_sql(s: Text)  -> Bool   // must start with SELECT/INSERT/UPDATE/DELETE/CREATE/DROP/ALTER/WITH (case-insensitive)
public fn validate_uri(s: Text)  -> Bool   // must contain ://
```

These validators are **structural shape** checks, not full parsers —
they reject obviously-malformed input but do not guarantee
syntactic validity. For full validation, route the value through a
purpose-built parser (`json.parse(&t)`, `sql.parse(&t)`, ...).

Unknown tags become user-defined via `@meta_macro` — see
[metaprogramming](/docs/language/meta/overview).

---

## `TextBuilder`

Incremental text construction without repeated allocation. Backed by a
single growing `Text` buffer; amortised O(1) per byte.

```verum
let mut b = TextBuilder.new();
b.push(&"hello ");
b.push_char('w');
b.push(&"orld");
b.push_line(&"!");                       // appends '\n'

let s = b.build();                       // clones the buffer (builder reusable)
let s2 = b.into_text();                  // consumes the builder
```

### API

```verum
TextBuilder.new()                          -> TextBuilder
TextBuilder.with_capacity(cap: Int)        -> TextBuilder
TextBuilder.default()                      -> TextBuilder

b.push(text: &Text)                        // &mut self
b.push_char(ch: Char)
b.push_line(text: &Text)                   // appends text + '\n'
b.clear()
b.len()       -> Int
b.is_empty()  -> Bool
b.build()     -> Text                      // clone
b.into_text() -> Text                      // consume
b.clone()     -> TextBuilder
```

Implements `Debug`, `Display`, `Clone`, `Default`, `Length`.

---

## Case-folded comparison

ASCII-subset case folding — matches SQLite's documented `NOCASE`
collation semantics. Non-ASCII bytes pass through unchanged; for full
Unicode case folding (`CaseFolding.txt`, status = C+S+T) opt in to
the `cog.verum.collation-icu` package.

```verum
mount core.text.case_fold.{
    fold_char_ascii, fold_byte_ascii, fold_text_ascii,
    compare_ascii_nocase, equal_ascii_nocase,
};

// Folding
let lower: Char = fold_char_ascii('A'.into());          // 'a'
let lb: Byte    = fold_byte_ascii(0x41 as Byte);        // 0x61
let ls: Text    = fold_text_ascii(&"Hello".into());     // "hello"

// Comparison — does not allocate; byte-wise case-insensitive
let cmp: Ordering = compare_ascii_nocase(&a, &b);
let eq:  Bool     = equal_ascii_nocase(&a, &b);
```

| Function | Behaviour |
|----------|-----------|
| `fold_char_ascii(c)` | `A..Z` → `a..z`; identity otherwise |
| `fold_byte_ascii(b)` | Byte variant — caller pre-verified ASCII (`b < 0x80`) |
| `fold_text_ascii(s)` | Whole-string ASCII lowercase; non-ASCII untouched |
| `compare_ascii_nocase(a, b)` | `Ordering` — lexicographic over folded bytes |
| `equal_ascii_nocase(a, b)` | Boolean equality, early-exit |

Used by `core.database.sqlite.native.l2_record.collation.NOCASE`,
which is the collation the native SQLite port exposes out-of-the-box.

---

## Numeric text representations

Five sub-modules under `core.text.numeric`:

| Module | Type | Purpose |
|---|---|---|
| `decimal` | `Decimal { coefficient: Int, scale: Int }` | Fixed-precision (scale 0..=18, i64 coefficient). PG `NUMERIC` codec. Financial workloads. |
| `bigint` | `BigInt { sign: Bool, digits: List<Int> }` | Arbitrary-precision signed integer (base `10^9` chunks, little-endian). |
| `bigdecimal` | `BigDecimal { coefficient: BigInt, scale: Int }` | Sibling of Decimal with BigInt coefficient. Scale up to 1024. |
| `rational` | `Rational { num: BigInt, den: BigInt }` | Exact-rational arithmetic in canonical reduced form (Euclidean GCD). |
| `modular` | (free fns) | gcd, lcm, ext_gcd, mod_pow, mod_inverse, mod_sqrt, is_probable_prime, crt, crt2 |

### `Decimal`

```verum
mount core.text.numeric.decimal.{
    Decimal, DecimalError, RoundingMode, MAX_SCALE,
    HalfEven, HalfUp, HalfDown, Truncate,
    parse_decimal,
};

Decimal.zero()                                  // (0, 0)
Decimal.one()                                   // (1, 0)
Decimal.from_int(n)                             // (n, 0)
Decimal.from_parts(coef, scale) -> Result<Decimal, DecimalError>

d.is_zero()    d.is_negative()    d.is_positive()
d.abs()    d.neg()
d.add(other)  -> Result<Decimal, DecimalError>
d.sub(other)  -> Result<Decimal, DecimalError>
d.mul(other)  -> Result<Decimal, DecimalError>
d.div(other, precision: Int, mode: RoundingMode) -> Result<Decimal, DecimalError>

parse_decimal(text: &Text) -> Result<Decimal, DecimalError>
```

`MAX_SCALE = 18`. `RoundingMode` is `HalfEven | HalfUp | HalfDown | Truncate`.

`DecimalError` is one of:
`ParseEmpty | ParseInvalidChar { byte_offset, byte } | ParseInvalidShape { reason } | ScaleOutOfRange { scale } | Overflow { op } | DivByZero`.

### `BigInt`

```verum
mount core.text.numeric.bigint.{
    BigInt, BigIntError, BIGINT_BASE, BIGINT_DIGITS_PER_CHUNK,
    parse_bigint,
};

BigInt.zero()                          // (sign=false, digits=[])
BigInt.one()                           // (sign=false, digits=[1])
BigInt.from_int(n)

b.is_zero()  b.is_negative()  b.is_positive()
b.is_even()  b.is_odd()
b.abs()  b.neg()
b.add(other)  b.sub(other)  b.mul(other)
b.div_rem(other) -> Result<(BigInt, BigInt), BigIntError>

parse_bigint(text: &Text) -> Result<BigInt, BigIntError>
```

Constants: `BIGINT_BASE = 10^9`, `BIGINT_DIGITS_PER_CHUNK = 9`.
Multiplication is schoolbook O(N×M); division uses Knuth Algorithm D.

### `BigDecimal`

Same surface as `Decimal` but with BigInt coefficient. `MAX_SCALE_BIG = 1024`.

### `Rational`

Exact-rational arithmetic. Always canonical (gcd-reduced). API includes
`add` / `sub` / `mul` / `div` / `inv` plus `parse_rational`.

### `modular`

Number-theoretic free functions over BigInt:

```verum
gcd(a: &BigInt, b: &BigInt) -> BigInt
lcm(a: &BigInt, b: &BigInt) -> BigInt
ext_gcd(a: &BigInt, b: &BigInt) -> (BigInt, BigInt, BigInt)   // (g, x, y) with a*x + b*y = g
mod_pow(base: &BigInt, exp: &BigInt, modulus: &BigInt) -> Result<BigInt, ModularError>
mod_inverse(a: &BigInt, m: &BigInt) -> Result<BigInt, ModularError>
mod_sqrt(a: &BigInt, p: &BigInt) -> Result<BigInt, ModularError>
is_probable_prime(n: &BigInt, witnesses: &List<BigInt>) -> Bool
crt(residues: &List<BigInt>, moduli: &List<BigInt>) -> Result<BigInt, ModularError>
crt2(r1: &BigInt, m1: &BigInt, r2: &BigInt, m2: &BigInt) -> Result<BigInt, ModularError>
```

---

## Implementation notes

- **SSO**: 23 bytes stored inline. Transitions to heap silently; no
  user-visible type change.
- **UTF-8 invariants**: `Text` never contains invalid UTF-8. APIs that
  could introduce invalidity (byte manipulation) are `unsafe`.
- **`&Text` vs `Text`**: `&Text` is the borrowed form (cheap to pass);
  `Text` is owned. Protocols like `AsRef<Text>` let most APIs take either.
- **Concatenation cost**: `s + &t` allocates a new `Text`. For heavy
  building, use `TextBuilder`.

## Example — word-frequency counter

```verum
fn word_freq(text: &Text) -> Map<Text, Int> {
    let mut freq = Map.new();
    for w in text.split_whitespace() {
        let k = w.to_ascii_lowercase();
        *freq.entry(k).or_insert(0) += 1;
    }
    freq
}
```

## Conformance & defects

The `core-tests/text/` suite pins the contract; each submodule has its
own `audit.md` cataloguing open defects + drift surfaces.

| Submodule | Tests pass | Audit |
|---|---:|---|
| `text/text` | 121 / 218 (55%) | [audit.md](https://github.com/verum-lang/verum/tree/main/core-tests/text/text/audit.md) |
| `text/char` | 75 / 86 (87%) | [audit.md](https://github.com/verum-lang/verum/tree/main/core-tests/text/char/audit.md) |
| `text/case_fold` | 25 / 30 (83%) | [audit.md](https://github.com/verum-lang/verum/tree/main/core-tests/text/case_fold/audit.md) |
| `text/builder` | 4 / 23 (17%) | [audit.md](https://github.com/verum-lang/verum/tree/main/core-tests/text/builder/audit.md) |
| `text/format` | 39 / 41 (95%) | [audit.md](https://github.com/verum-lang/verum/tree/main/core-tests/text/format/audit.md) |
| `text/regex` | 8 / 31 (26%) | [audit.md](https://github.com/verum-lang/verum/tree/main/core-tests/text/regex/audit.md) |
| `text/tagged_literals` | 1 / 29 (3.4%) | [audit.md](https://github.com/verum-lang/verum/tree/main/core-tests/text/tagged_literals/audit.md) |
| `text/numeric/decimal` | 27 / 45 (60%) | [audit.md](https://github.com/verum-lang/verum/tree/main/core-tests/text/numeric/decimal/audit.md) |
| `text/numeric/{bigint, bigdecimal, rational, modular}` | partial | [subtree audit](https://github.com/verum-lang/verum/tree/main/core-tests/text/numeric/audit.md) |

The single highest-leverage closure across this entire surface is the
**Iterator.next dispatch defect** (text/text §C) — a primitive iterator
panic that owns ~30 downstream test failures across text, builder,
char, and numeric. Closing it is the unblock-everything change.

## See also

- [`base`](/docs/stdlib/base) — `Display`, `Debug`, `FromStr`, `ToString` protocols.
- [`io`](/docs/stdlib/io) — `Read` / `Write` for streaming text I/O.
- [`collections`](/docs/stdlib/collections) — `Map<Text, V>`, `Set<Text>`.
- [Language → refinement types](/docs/language/refinement-types) — e.g. `Email is Text { self.matches(rx#"^[^@]+@[^@]+$") }`.
