---
sidebar_position: 3
title: text
description: Text, Char, format strings, regex, tagged literals — every string utility.
---

# `core.text` — UTF-8 strings

`Text` is Verum's string type: UTF-8, immutable by default, with
**SSO** (small-string optimisation — up to 23 bytes stored inline,
no allocation).

| File | What's in it |
|---|---|
| `text.vr` | `Text` + method suite, `StringBuilder` |
| `char.vr` | `Char` + classification, case conversion, `CharPattern`, `GeneralCategory` |
| `format.vr` | `Formatter`, `FormatSpec`, `Alignment`, `Sign`, `DebugStruct`, `DebugTuple`, `DebugList`, `DebugMap`, `Write` (buffer writer), `print`/`println`/`eprint`/`eprintln`, `dbg` |
| `regex.vr` | `Regex` — compile-time checked patterns |
| `tagged_literals.vr` | `sql#`, `json#`, `html#`, `url#`, … validators |
| `builder.vr` | `StringBuilder` — incremental text construction |

`Text` implements: `Clone`, `Debug`, `Display`, `Eq`, `Ord`, `Hash`,
`Default`, `AsRef<[Byte]>`, `FromStr`, `ToString`, `From<&str>`,
`Deref<Target=str>`, `Serialize`, `Deserialize`.

---

## `Text`

### Construction

```verum
let s: Text = "hello";                         // static literal
let s2 = Text.new();                          // empty
let s3 = Text.with_capacity(64);              // pre-allocated
let s4 = Text::from("literal");                // from &str
let s5 = Text.from_utf8(bytes)?;              // Result<Text, Utf8Error>
let s6 = Text.from_utf8_lossy(bytes);         // replaces invalid bytes
let s7 = Text::from_chars(iter)                // from Iterator<Char>
let s8 = Int::to_text(42);                     // from integer
let s9 = Float::to_text(3.14);
let s10 = f"x={x}, y={y + 1}";                 // format literal
```

### Length & capacity

```verum
s.len()              // byte length
s.char_count()       // Unicode scalar count (iterates!)
s.is_empty()         // len() == 0
s.capacity()         // heap capacity (after SSO transition)
```

### Indexing (byte-based)

```verum
s.as_bytes() -> &[Byte]
s.bytes() -> ByteIter
s.chars() -> Chars                    // Iterator<Char>
s.char_indices() -> CharIndices       // (byte_offset, Char)
s.lines() -> Lines
```

`Text` is **not** character-indexed — `s[i]` would be ambiguous over
UTF-8 and is deliberately not provided. Use `.chars().nth(i)` for
character access, `.as_bytes()[i]` for byte access.

### Substring

```verum
s.slice(start_byte, end_byte) -> &Text            // byte range
s.substring(start_char, end_char) -> Text         // char range (slower)
s.split_at(i) -> (&Text, &Text)                   // byte split
s.split_once(sep: &Text) -> Maybe<(&Text, &Text)>
s.rsplit_once(sep: &Text) -> Maybe<(&Text, &Text)>
```

### Predicates

```verum
s.starts_with(&prefix) -> Bool
s.ends_with(&suffix) -> Bool
s.contains(&needle) -> Bool
s.matches(pattern: Regex) -> Bool
s.is_empty()
s.is_ascii() -> Bool
```

### Searching

```verum
s.find(&needle) -> Maybe<Int>            // first byte index
s.rfind(&needle) -> Maybe<Int>           // last byte index
s.find_any(patterns: &[&Text]) -> Maybe<(Int, Int)>   // (position, pattern index)
```

### Splitting

```verum
s.split(&sep) -> Split
s.rsplit(&sep) -> RSplit
s.splitn(n, &sep) -> SplitN              // limit number of splits
s.rsplitn(n, &sep) -> RSplitN
s.split_whitespace() -> SplitWhitespace
s.split_ascii_whitespace() -> SplitAsciiWhitespace
s.split_terminator(&term) -> SplitTerminator
s.lines() -> Lines
```

### Trimming

```verum
s.trim() -> &Text                        // leading + trailing whitespace
s.trim_start() -> &Text
s.trim_end() -> &Text
s.trim_matches(pat: CharPattern) -> &Text
s.trim_start_matches(pat) / s.trim_end_matches(pat)
```

### Case

```verum
s.to_uppercase() -> Text
s.to_lowercase() -> Text
s.to_ascii_uppercase() -> Text           // faster; Unicode-safe for ASCII only
s.to_ascii_lowercase() -> Text
```

### Replacement

```verum
s.replace(&from, &to) -> Text            // all occurrences
s.replacen(&from, &to, n) -> Text        // first n
s.replace_first(&from, &to) -> Text
```

### Regex integration

```verum
s.matches(pattern: Regex) -> Bool
s.find_regex(&pattern) -> Maybe<Match>
s.find_iter(&pattern) -> TextMatches
s.captures_iter(&pattern) -> TextMatchIndices
s.replace_regex(&pattern, &replacement) -> Text      // uses $1, $2, etc.
s.split_regex(&pattern) -> RegexSplit
```

### Parsing

```verum
s.parse::<T>() -> Result<T, ParseError>         // T: FromStr
s.parse_int() -> Result<Int, ParseError>
s.parse_float() -> Result<Float, ParseError>
s.parse_bool() -> Result<Bool, ParseError>
```

### Transformations

```verum
s.reversed() -> Text                     // by Unicode scalar
s.repeat(n) -> Text
s.to_chars() -> List<Char>
s.collect_chars<C>() -> C                // C: FromIterator<Char>
s.escape_default() -> Text
s.escape_debug() -> Text
s.escape_unicode() -> Text
```

### Building

```verum
let mut s = Text.with_capacity(128);
s.push_str("hello ");
s.push('w');
s.push_str("orld");
s += "!";                        // via AddAssign

// Or with StringBuilder for heavy concatenation:
let mut b = StringBuilder.new();
for x in items {
    b.push_str(&x.to_string());
    b.push_str(", ");
}
let result = b.into_text();
```

### Example — word-frequency counter

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

### Pitfall — byte index ≠ char index

`s.find("…") -> Maybe<Int>` returns a **byte** offset. Slicing by a
char offset requires walking `.char_indices()`.

---

## `Char`

`Char` is a Unicode scalar value (up to U+10FFFF, excluding surrogates).

### Classification

```verum
c.is_alphabetic()            c.is_numeric()            c.is_alphanumeric()
c.is_whitespace()            c.is_control()
c.is_uppercase()             c.is_lowercase()
c.is_digit(radix)            c.is_ascii()              c.is_ascii_digit()
c.is_ascii_alphabetic()      c.is_ascii_alphanumeric() c.is_ascii_whitespace()
c.is_ascii_punctuation()     c.is_ascii_graphic()
```

### Conversion

```verum
c.to_uppercase()             c.to_lowercase()
c.to_ascii_uppercase()       c.to_ascii_lowercase()
c.to_digit(radix) -> Maybe<Int>
c.encode_utf8() -> [UInt8; N]       // 1..=4 bytes, via fixed array + len
```

### Unicode data

```verum
c.general_category() -> GeneralCategory
c.escape_debug() -> EscapeDebug
c.escape_unicode() -> EscapeUnicode
c.len_utf8() -> Int                   // 1, 2, 3, or 4
c.len_utf16() -> Int                  // 1 or 2
```

### `GeneralCategory`

```verum
type GeneralCategory is
    | LetterUppercase | LetterLowercase | LetterTitlecase
    | LetterModifier  | LetterOther
    | MarkNonspacing | MarkSpacing | MarkEnclosing
    | NumberDecimalDigit | NumberLetter | NumberOther
    | PunctuationConnector | PunctuationDash | PunctuationOpen
    | PunctuationClose | PunctuationInitial | PunctuationFinal
    | PunctuationOther
    | SymbolMath | SymbolCurrency | SymbolModifier | SymbolOther
    | SeparatorSpace | SeparatorLine | SeparatorParagraph
    | OtherControl | OtherFormat | OtherSurrogate | OtherPrivateUse
    | OtherNotAssigned;
```

### `CharPattern`, `AnyChar`, `CharRange`

Predicates built from `Char`:

```verum
AnyChar                                  // matches anything
char_any_of(&['a', 'b', 'c'])            // matches one of these
char_range('a', 'z')                     // matches inclusive range
pattern.matches(c) -> Bool               // apply

// Passed to trim_matches, split, etc.
s.trim_matches(char_any_of(&[' ', '\t', '\n']))
```

### Constants

```verum
Char::MIN = '\0'
Char::MAX = '\u{10FFFF}'
Char::UNICODE_LIMIT = 0x10FFFF
REPLACEMENT_CHARACTER = '\u{FFFD}'
```

---

## Format strings — `f"..."`

```verum
let msg = f"x = {x}, y = {y + 1}";
let deb = f"{value:?}";                   // Debug format
let hex = f"{byte:02X}";                  // 2-char uppercase hex
let pct = f"{ratio:.2%}";                 // 2-decimal percent
let pad = f"{name:>20}";                  // right-align width 20
let lz  = f"{n:05}";                      // zero-padded width 5
```

### Format specifier grammar

```
[fill][align][sign][#][0][width][.precision][type]
```

| Field | Values / notes |
|---|---|
| `fill` | any char (default: space) |
| `align` | `<` left, `>` right, `^` centre |
| `sign` | `+` always show, `-` only for negative (default), space for leading space |
| `#` | alternate form (`0x` for hex, `0b` for binary, etc.) |
| `0` | zero-pad (for numerics) |
| `width` | integer; or `*` to read from next argument |
| `precision` | integer; or `*`; controls float digits / string truncation |
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
f"{"hi":*<10}"     // "hi********"
f"{name:.5}"       // truncate to 5 chars
```

### Implementing `Display` and `Debug` yourself

```verum
implement Display for Point {
    fn fmt(&self, f: &mut Formatter) -> FmtResult {
        f.write_str(&f"({self.x}, {self.y})")
    }
}

implement Debug for Point {
    fn fmt_debug(&self, f: &mut Formatter) -> FmtResult {
        f.debug_struct("Point")
            .field("x", &self.x)
            .field("y", &self.y)
            .finish()
    }
}
```

### Format-building helpers

```verum
f.debug_struct("Name").field("x", &x).field("y", &y).finish()
f.debug_tuple("Name").field(&a).field(&b).finish()
f.debug_list().entries(iter).finish()
f.debug_map().entries(iter).finish()
```

---

## `Formatter` & `Write`

```verum
type Write is protocol {
    fn write_text(&mut self, s: &Text) -> Result<(), WriteError>;
    fn write_char(&mut self, c: Char) -> Result<(), WriteError>;
}

type Formatter is { ... }
// Implements Write; carries FormatSpec; passed to Display/Debug impls.
```

### Spec components

```verum
type FormatSpec is {
    fill: Char,
    align: Alignment,
    sign: Sign,
    alt: Bool,
    zero_pad: Bool,
    width: Maybe<Int>,
    precision: Maybe<Int>,
    type_hint: FormatType,
};
type Alignment is Left | Right | Centre | Default;
type Sign is Default | Plus | Space;
type FormatType is Display | Debug | LowerHex | UpperHex | Octal | Binary | Exponent | ExponentUpper | Percent;
```

---

## Regex — `core.text.regex`

Regex values forward to a Verum intrinsic backed by the `regex`
1.x crate inside the VBC interpreter (and the same engine after
AOT lowering). Pattern compilation happens **per call** — a
v2 cached-handle migration is tracked but not yet shipped.

### API

```verum
type Regex is { pattern: Text };
type RegexError is { message: Text };

Regex.new(pattern: Text) -> Result<Regex, RegexError>   // today: always Ok
                                                        // (compile is deferred)

r.is_match(text: Text) -> Bool                    // any match anywhere
r.find_all(text: Text) -> List<Text>              // every match, in order
r.replace_all(text: Text, repl: Text) -> Text     // replace every match
r.split(text: Text) -> List<Text>                 // split on every match

r.find(text: Text) -> Maybe<Text>                 // first match only
r.replace(text: Text, repl: Text) -> Text         // replace first match only
r.captures(text: Text) -> Maybe<List<Text>>       // ordered capture groups
                                                  // of the first match;
                                                  // index 0 = whole match,
                                                  // missing groups = ""

r.as_str() -> Text                                // recover the raw pattern
```

All seven runtime ops are wired end-to-end through the VBC
interpreter and the AOT MLIR lowering path:

| Surface | Intrinsic | Sub-opcode |
|---------|-----------|------------|
| `is_match` | `regex_is_match` | `TensorSubOpcode 0xE2` |
| `find_all` | `regex_find_all` | `TensorSubOpcode 0xE0` |
| `replace_all` | `regex_replace_all` | `TensorSubOpcode 0xE1` |
| `split` | `regex_split` | `TensorSubOpcode 0xE3` |
| `find` | `regex_find` | `TensorExtSubOpcode 0x0A` |
| `replace` | `regex_replace` | `TensorExtSubOpcode 0x0B` |
| `captures` | `regex_captures` | `TensorExtSubOpcode 0x0C` |

The single-match / capture variants live in the ext-extended
opcode space because the bulk variants pre-empted the
regex-dedicated `0xE0..=0xE3` slot before they landed.

### Replacement syntax

`replace` / `replace_all` honour the `regex` crate's
[replacement syntax](https://docs.rs/regex/latest/regex/struct.Regex.html#replacement-string-syntax):

- `$0` — whole match
- `$1`, `$2`, … — numbered capture groups
- `${name}` — named groups (when the pattern uses `(?<name>…)`)
- `$$` — literal `$`

### Capture groups

`captures` returns each `(group)` as a positional entry:

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

Non-participating groups (e.g. inside an `?` optional clause
that did not match) appear as empty strings — re-checking
group membership against the pattern is the caller's
responsibility for now. A future `Maybe<Text>` per-group
surface is on the v2 list.

### Pattern errors

`Regex.new` is fallible by signature so a v2 cached-handle
migration can surface compile errors at construction time. In
the current build every `Regex.new` returns `Ok` and a
malformed pattern becomes a runtime fall-through (the bulk
variants return empty results, the single-match variants return
`None`). Pre-validate patterns at protocol boundaries that
need stronger guarantees.

---

## Tagged literals

```verum
json#"{ "x": 1 }"                  // compile-validated JSON -> JsonValue
json#"""{ "x": ${value} }"""       // with interpolation
sql#"""SELECT * FROM users WHERE id = ${id}"""   // validated SQL -> SqlQuery
html#"""<div>${content}</div>"""    // HTML with escape-by-default -> Html
url#"https://example.com/search?q=${q}"   // URL-encoded -> Url
yaml#"..."   toml#"..."    xml#"..."
rx#"..."     (Regex — covered above)
```

Each tag has a validator in the compiler; content is parsed at compile
time, and the result is typed (`JsonValue`, `SqlQuery`, `Html`, `Url`,
etc.). Interpolated expressions are automatically escaped for the
format.

Unknown tags become user-defined via `@meta_macro` — see
[metaprogramming](/docs/language/meta/overview).

---

## `StringBuilder`

Incremental text construction without repeated allocation.

```verum
let mut b = StringBuilder.new();
b.push_str("hello ");
b.push('w');
b.push_text(&other);
b.push_int(42);
b.push_float(3.14, 3);                // precision 3
b.push_char(' ');
b.push_repeat(' ', 4);                // 4 spaces

let s = b.into_text();                // consumes builder
```

```verum
StringBuilder.new()
StringBuilder::with_capacity(n)

b.len()  b.capacity()  b.is_empty()  b.clear()
b.as_text() -> &Text
b.into_text() -> Text
```

---

## Print functions

All require `[IO]` in the current context.

```verum
print(s: &Text)                
println(s: &Text)              
eprint(s: &Text)               
eprintln(s: &Text)             
format_debug<T: Debug>(x: &T)   -> Text          // pure
format_display<T: Display>(x: &T) -> Text        // pure
dbg<T: Debug>(x: T) -> T              // prints to stderr, passes through
```

---

## Case-folded comparison — `core.text.case_fold`

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
let lower: Char = fold_char_ascii('A'.into());            // 'a'
let lb: Byte    = fold_byte_ascii(0x41 as Byte);          // 0x61
let ls: Text    = fold_text_ascii(&"Hello".into());       // "hello"

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

## Implementation notes

- **SSO**: 23 bytes stored inline. Transitions to heap silently; no
  user-visible type change.
- **UTF-8 invariants**: `Text` never contains invalid UTF-8. APIs that
  could introduce invalidity (byte manipulation) are `unsafe`.
- **`&Text` vs `Text`**: `&Text` is the borrowed form (cheap to pass);
  `Text` is owned. Protocols like `AsRef<Text>` let most APIs take
  either.
- **Concatenation cost**: `s + &t` allocates a new `Text`. For heavy
  building, use `StringBuilder`.

---

## See also

- **[base](/docs/stdlib/base)** — `Display`, `Debug`, `FromStr`, `ToString` protocols.
- **[io](/docs/stdlib/io)** — `Read` / `Write` for streaming text I/O.
- **[Language → refinement types](/docs/language/refinement-types)** — e.g. `Email is Text { self.matches(rx#"^[^@]+@[^@]+$") }`.
