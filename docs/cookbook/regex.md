---
title: Regular-expression matching
description: Compile-time-checked regex — match, captures, replace, iterate, flags, Unicode.
---

# Regex

All regex in Verum lives behind the `rx#` tagged literal, which
validates the pattern at **compile time**. Invalid regex is a
compile error, not a runtime exception. The engine is RE2-class —
linear time, no catastrophic backtracking.

For the full lexical grammar of `rx#"..."`, see
[language/tagged-literals](/docs/language/tagged-literals#pattern-matching).

## Basic match

```verum
let email = rx#"^[^@\s]+@[^@\s]+\.[^@\s]+$";

if email.matches(&input) {
    print("valid");
}
```

`matches` tests whether the **entire** input satisfies the pattern
(equivalent to anchored match). For a partial match use `is_match`.

```verum
rx#"error".is_match(&line)          // true if the line contains "error"
rx#"^error".matches(&line)          // only if the line starts with "error"
rx#"error$".matches(&line)          // only if the line ends with "error"
```

## Find — first match

```verum
let date = rx#"(\d{4})-(\d{2})-(\d{2})";

if let Maybe.Some(m) = date.find(&text) {
    print(f"match at {m.start()}..{m.end()}: {m.as_str()}");
}
```

`find` returns `Maybe<Match>`; `Match` carries:

- `.start() -> Int` — byte offset of the match start.
- `.end() -> Int` — byte offset after the match.
- `.as_str() -> &Text` — the matched substring.
- `.range() -> Range<Int>` — shortcut for `start()..end()`.

## Captures

```verum
if let Maybe.Some(caps) = date.captures(&"Event on 2026-04-15 today") {
    let year  = caps.get(1).unwrap().as_str();      // "2026"
    let month = caps.get(2).unwrap().as_str();      // "04"
    let day   = caps.get(3).unwrap().as_str();      // "15"
}
```

Numbered groups:

- `caps.get(0)` — the entire match.
- `caps.get(n)` — the *n*-th capture group (1-based).
- `caps.len()` — number of groups + 1 (for the full match).

## Named captures

```verum
let pat = rx#"(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})";
let caps = pat.captures(&s).unwrap();
let year = caps.name("year").unwrap().as_str();
```

Named groups (`(?<name>...)`) make the code robust to group
reordering. Mix with numbered access: `caps.get(1)` still works.

## Iterate all matches

```verum
let tokens = rx#"\w+";
for m in tokens.find_iter(&text) {
    print(f"token: {m.as_str()}");
}

// With captures:
let pairs = rx#"(\w+)\s*=\s*(\w+)";
for caps in pairs.captures_iter(&config) {
    let key = caps.get(1).unwrap().as_str();
    let val = caps.get(2).unwrap().as_str();
    apply(key, val);
}
```

Both iterators are **lazy** — they produce matches on demand, not
eagerly.

## Replace

```verum
// Replace first occurrence:
let first = rx#"\bfoo\b".replace(&s, "bar");

// Replace all:
let all = rx#"\bfoo\b".replace_all(&s, "bar");

// Group references in replacement (numbered):
let reformat = rx#"(\d{4})-(\d{2})-(\d{2})".replace_all(&text, "$3/$2/$1");

// Named groups in replacement:
let rewritten = rx#"(?<year>\d{4})-(?<month>\d{2})"
    .replace_all(&text, "${month}-${year}");
```

### Replace with a function

For logic in the replacement:

```verum
let censored = rx#"\b\w{8,}\b".replace_all_with(&text, |m| {
    m.as_str().chars().map(|_| '*').collect::<Text>()
});
```

The closure receives each `Match` and returns the replacement `Text`.

## Split

```verum
let sep = rx#"[\s,]+";
let tokens: List<Text> = sep
    .split(&text)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_text())
    .collect();
```

`split` returns an iterator of substrings separated by the regex.

### Split with a limit

```verum
let first_three: List<Text> = sep.splitn(&text, 3).collect();
// At most 3 elements; any remaining text is in the last.
```

## As a type predicate

Regex literals compose naturally with refinement types:

```verum
type Email  is Text { self.matches(rx#"^[^@\s]+@[^@\s]+\.[^@\s]+$") };
type UUIDv4 is Text { self.matches(rx#"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$") };
type Slug   is Text { self.matches(rx#"^[a-z0-9]+(?:-[a-z0-9]+)*$") };
type Phone  is Text { self.matches(rx#"^\+?\d[\d\s-]{7,}$") };
```

The regex itself is validated at compile time; the refinement is
checked whenever a `Text` is promoted to `Email`, `UUIDv4`, etc.

## Flags

Inline regex flags at the start of the pattern:

```verum
let ci     = rx#"(?i)hello";         // case-insensitive
let multi  = rx#"(?m)^start";         // multiline: ^/$ match line boundaries
let dotall = rx#"(?s).";              // dot matches newline
let x      = rx#"(?x)                 // extended — ignore whitespace + comments
                 \d{4} -              # year
                 \d{2} -              # month
                 \d{2}";              # day
let bytes  = rx#"(?-u)\d+";           // byte-only (faster, no Unicode tables)
```

Combine flags:

```verum
rx#"(?im)^error.*$"        // case-insensitive, multiline
```

## Unicode support

By default, Verum regex is **Unicode-aware**:

- `\w` matches any Unicode letter/digit/underscore.
- `\d` matches any Unicode decimal digit.
- `\p{L}` matches any Unicode letter; `\p{Nd}` any decimal digit,
  `\p{Greek}` any Greek script, etc.
- `\P{...}` negates a Unicode category.
- Equivalences like `ß` matching `ss` are **not** auto-enabled;
  use `\b(?i)ß|ss\b` explicitly.

Disable Unicode with `(?-u)` for byte-level matches (e.g. parsing
binary protocols).

```verum
let greek_word = rx#"\p{Greek}+";
let decimal = rx#"\p{Nd}+";
let emoji = rx#"\p{Emoji}";
let non_ascii = rx#"\P{ASCII}";
```

## Non-capturing groups

Use `(?:...)` when you need grouping without capturing:

```verum
// Capturing: 3 groups
let words = rx#"(word1)|(word2)|(word3)";

// Non-capturing: 0 groups, same semantics
let words = rx#"(?:word1|word2|word3)";
```

Non-capturing is slightly faster and avoids cluttering the capture
list.

## Lookaround

Verum's regex engine supports **zero-width** lookaround:

```verum
rx#"\bfoo(?=\s)"          // foo followed by whitespace (not captured)
rx#"(?<=\$)\d+"           // digits preceded by $ (not captured)
rx#"foo(?!\d)"            // foo not followed by a digit
rx#"(?<!-)\b\w+"          // word not preceded by a hyphen
```

Lookaround keeps the engine linear (RE2-class) — no catastrophic
backtracking is possible.

## Substitution in a builder

For complex replacements with state:

```verum
let mut builder = RegexReplaceBuilder.new(rx#"\b(\w+)\b");
builder.with_closure(|m, out| {
    let word = m.as_str();
    out.push_str(&word.to_upper());
});
let result = builder.run(&input);
```

Useful for case transformations, surrounding markup, or
context-sensitive rewrites.

## Performance notes

- **Compiled once**: each `rx#"..."` is a compile-time constant — no
  runtime compilation cost.
- **Linear-time by default**: RE2-class engine. No backtracking, no
  catastrophic matches.
- **Unicode-aware**: opt into byte-only with `(?-u)` for speed.
- **Precompile once**: bind the regex to a `const` or a `static` if
  used in hot code:
  ```verum
  static EMAIL: Regex = rx#"^[^@\s]+@[^@\s]+\.[^@\s]+$";
  ```
- **Prefer literal matches**: if you just need "contains" or "starts
  with", `Text.contains` / `Text.starts_with` is 10× faster than
  `rx#"...".is_match(...)`.

## Pitfalls

### Metacharacter escaping

In raw-multiline (`rx#"""..."""`), backslashes don't need doubling:

```verum
rx#"""\d+"""                   // matches one or more digits
rx#"\d+"                        // same, single-line
```

In single-quoted `rx#"..."`, backslashes escape per normal string
rules, so `\\d+` is `\d+` after escape processing. Prefer triple-
quoted for complex patterns.

### Anchoring

- `rx#"\d+"` — matches **anywhere** digits appear.
- `rx#"^\d+$"` — matches **only** if the whole string is digits.
- `rx#"^\d+"` — matches only if digits appear at start.

Use `matches()` for full-string, `is_match()` for anywhere.

### Don't use regex for HTML/JSON/SQL parsing

Use the tagged literals (`html#`, `json#`, `sql#`) instead — they
parse with real grammars, handle nesting and comments correctly, and
provide typed access. Regex is for genuinely regular patterns.

### `\b` is Unicode-aware

By default `\b` uses Unicode word boundaries; this is slower than
ASCII-only. Use `(?-u)\b` if your input is known ASCII.

### Greedy by default

`rx#"<.+>"` matches *as much as possible* — in `<a><b>` it matches
the whole string. Use `<.+?>` for non-greedy, or `<[^>]+>` for
character-class exclusion.

## See also

- **[language/tagged-literals](/docs/language/tagged-literals)** —
  the `rx#` family.
- **[`stdlib/text`](/docs/stdlib/text)** — `Regex`, `Match`,
  `Captures`, `RegexBuilder`.
- **[Validation](/docs/cookbook/validation)** — refinement-based
  validation that embeds regex checks.
- **[Refinement patterns](/docs/cookbook/refinements)** — regex in
  refinements.
