---
title: Regular-expression matching
description: Compile-time-checked regex — match, captures, replace, iterate, flags, Unicode.
---

# Regex

:::danger `rx#"..."` does not work today — use `Regex.new`

Measured 2026-09-12, with the two spellings of the same pattern in one
program:

```verum
Regex.new("abc")?.find("xabcy")     // Some(abc)   correct
rx#"abc".find("xabcy")              // None        WRONG, and silent
rx#"abc".is_match("xabcy")          // crashes: null pointer dereference
```

The literal type-checks as a `Regex` and is a plain `Text` at run time,
so `.find` resolves to `Text.find` and searches the PATTERN for the
SUBJECT. The giveaway is that swapping the two makes it "work":
`rx#"xabcy".find("abc")` answers `Some(1)`, byte-identical to
`"xabcy".find("abc")` on an ordinary string.

**It is silent on the common call.** A pattern tested against input that
should NOT match returns the right answer for the wrong reason; the
failure only appears on input that should match.

Until it is fixed, build regexes through the constructor, which returns
a `Result`:

```verum
mount core.text.regex.{Regex};

match Regex.new("^[^@\s]+@[^@\s]+\.[^@\s]+$") {
    Result.Ok(rx)  => { if rx.is_match(input) { print("valid"); } }
    Result.Err(e)  => { print("bad pattern"); }
}
```

Every `rx#` block on this page is written in the intended syntax and is
kept as such; read them as the shape the API wants, and reach for
`Regex.new` in code you run.
:::

All regex in Verum is meant to live behind the `rx#` tagged literal,
which validates the pattern at **compile time**. Invalid regex is a
compile error, not a runtime exception.

For the full lexical grammar of `rx#"..."`, see
[language/tagged-literals](/docs/language/tagged-literals#pattern-matching).

## Basic match

```verum
let email = rx#"^[^@\s]+@[^@\s]+\.[^@\s]+$";

if email.is_match(input) {
    print("valid");
}
```

`matches` tests whether the **entire** input satisfies the pattern
(equivalent to anchored match). For a partial match use `is_match`.

```verum
rx#"error".is_match(line)           // true if the line contains "error"
rx#"^error".is_match(line)          // only if the line starts with "error"
rx#"error$".is_match(line)          // only if the line ends with "error"
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

:::danger Not accepted by the parser — use positional groups

Measured 2026-09-12: both `(?P<name>...)` and `(?<name>...)` are
rejected at compile time, while `([0-9]{4})` is accepted. The engine
declares positional capture groups only, with group 0 as the whole
match.

```verum
// intended, and rejected today
let pat = rx#"(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})";

// accepted
let pat = rx#"(\d{4})-(\d{2})-(\d{2})";
```

`captures` returns the groups in order, so read them by position.
:::

## Iterate all matches

```verum
// `find_all` answers a `List<Text>`, EAGERLY — there is no
// `find_iter`, and the matches are already Texts, so no `.as_str()`.
let tokens = rx#"\w+";
for m in tokens.find_all(text) {
    print(f"token: {m}");
}

// `captures` answers `Maybe<List<Text>>` for the FIRST match only —
// group 0 is the whole match, 1.. are the groups. There is no
// `captures_iter` and no `Captures` object with `.get(i)`.
let pairs = rx#"(\w+)\s*=\s*(\w+)";
match pairs.captures(config) {
    Maybe.Some(caps) => apply(caps[1], caps[2]),
    Maybe.None       => {}
}
```

:::caution Neither is lazy, and there is no all-matches captures

`Regex` is `as_str` / `captures` / `find` / `find_all` / `is_match` /
`new` / `replace` / `replace_all` / `split`. `find_all` builds the
whole `List<Text>` before returning, so on a large input it allocates
every match whether you consume them or not — this section previously
claimed both forms were lazy, which was a performance promise about
methods that do not exist.

To walk the captures of EVERY match you currently loop yourself:
`find_all` for the match texts, then `captures` on each.

:::

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
    m.as_str().chars().map(|_| '*').collect<Text>()
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

This is the shape the design intends, and it is written here as such:

```verum
type Email  is Text { self.matches(rx#"^[^@\s]+@[^@\s]+\.[^@\s]+$") };
type UUIDv4 is Text { self.matches(rx#"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$") };
type Slug   is Text { self.matches(rx#"^[a-z0-9]+(-[a-z0-9]+)*$") };
type Phone  is Text { self.matches(rx#"^\+?\d[\d\s-]{7,}$") };
```

:::warning None of that is enforced today, and this page used to say it was

Measured 2026-09-12, three separate reasons, any one of which is enough:

* `Text.matches(&self, pattern: &Text) -> TextMatches` takes a **`Text`**
  and returns an **iterator**, not a `Bool`. It is not a predicate, and
  it does not take a regex.
* `rx#"..."` is a `Text` at run time (see the box at the top), so the
  argument is not a regex either.
* A refinement predicate that CALLS a function is not decided by the
  solver — it compiles with a `W0500` saying the constraint is not
  enforced. That warning is the honest signal; the type still admits
  every value.

The `Slug` line above also lost its `(?:`: non-capturing groups are
rejected by the engine's parser. An ordinary `(` group does the same job
here and is accepted.

Check the first reason for yourself — the declaration says what it
takes and what it returns:

```bash
grep -n 'public fn matches' core/text/text.vr
```

Validate in code until this lands — construct the regex with
`Regex.new` and check its `is_match` at the boundary where the value
enters your program.
:::

## Flags

:::danger The engine accepts no inline flags at all

Every one of these is REJECTED by the pattern parser — measured
2026-09-12 through `Regex.new`, with an unflagged pattern as the control:

| written | verdict |
|---|---|
| `(?i)hello` | rejected at compile |
| `(?m)^start` | rejected at compile |
| `(?s).` | rejected at compile |
| `(?x)…` | rejected at compile |
| `(?-u)\d+` | rejected at compile |
| `hello` (control) | matches |

Run it yourself — the control in the last row is what separates "the
flag is unsupported" from "the harness is broken":

```verum
mount core.text.regex.{Regex};

fn probe(pat: Text, subj: Text) {
    match Regex.new(pat) {
        Result.Ok(r)  => { print(f"{pat} -> {r.is_match(subj)}"); }
        Result.Err(_) => { print(f"{pat} -> rejected at compile"); }
    }
}

fn main() {
    probe("(?i)hello", "HELLO");
    probe("hello", "hello");       // the control
}
```

Non-capturing groups `(?:…)` are rejected too; a plain `(…)` group is
accepted and does the same work when you do not need the capture.

What the engine does support, from its own declaration: literals and
escaped literals, character classes with ranges and negation, the
greedy quantifiers `*` `+` `?` `{m}` `{m,}` `{m,n}` over any atom
including groups, alternation `|` at top level and inside groups,
the anchors `^` and `$`, and positional capture groups. `\d` `\w` `\s`
and their negations are **ASCII**, and `.` matches any byte except a
newline.

For case-insensitivity, lower-case the subject before matching, or
spell the alternatives into the class: `[Hh]ello`.
:::

## Unicode support

:::danger There is none — the engine is byte-oriented and its classes are ASCII

This section used to say the opposite. Measured 2026-09-12:

```verum
Regex.new("\\w+")?.is_match("привет")   // false
Regex.new("\\w+")?.is_match("abc")      // true   — the control
Regex.new("\\p{L}+")                    // rejected at compile
```

`\d` `\w` `\s` and their negations are ASCII; `.` matches any byte
except a newline. Every `\p{...}` / `\P{...}` form is rejected by the
parser, as is `(?-u)` — there is no Unicode mode to turn off.

Match non-ASCII text by spelling the bytes or the characters you want
into a class, or by narrowing the input before it reaches the regex.
:::

## Non-capturing groups

:::danger `(?:...)` is rejected by the parser

Measured 2026-09-12: `(?:abc)+` is refused at compile time while
`(abc)+` is accepted. Where you do not need the capture, use an
ordinary group and ignore it — the alternation and the quantifier
behave the same.

```verum
// intended, and rejected today
let words = rx#"(?:word1|word2|word3)";

// accepted
let words = rx#"(word1|word2|word3)";
```
:::

## Lookaround

:::danger No lookaround is accepted, and the linearity claim was wrong too

Measured 2026-09-12: `(?=...)`, `(?!...)`, `(?<=...)` and `(?<!...)` are
all rejected at compile time.

This section also said lookaround "keeps the engine linear (RE2-class) —
no catastrophic backtracking is possible". The engine's own declaration
says the opposite: it is a backtracking matcher whose worst case is
exponential, like every backtracker. Treat any pattern you run over
untrusted input accordingly.

Both halves are one command each:

```bash
# the parser's verdict — run the probe from the Flags box with "foo(?=bar)"
# the engine's own words about its complexity:
grep -n 'backtrack' core/text/regex_engine.vr
```

Express the surrounding context as part of the match and trim it
afterwards, or split the decision into two matches.
:::

## Substitution in a builder

:::caution Closure replacement is not available
There is no `RegexReplaceBuilder`, no `with_closure` and no
`replace_all_with`. `Regex` offers two replacements and both take a
replacement **string**:

```verum
rx.replace(text, replacement)        // first match
rx.replace_all(text, replacement)    // every match
```

For a per-match computation, iterate the matches yourself and build the
output — the engine will not call back into your code.
:::

Useful for case transformations, surrounding markup, or
context-sensitive rewrites.

## Performance notes

Re-measured 2026-09-12 against the engine's own declaration and against
`core/text/regex.vr`. Three of the five claims this section used to
carry were wrong, and all three were wrong in the direction that would
cost a reader.

- **Compilation is per call, not once.** Every method passes the raw
  pattern to the engine, which re-parses it. Binding the regex to a
  `const` or a `static` stores the pattern, not a compiled program —
  the section used to recommend that as a speed-up and it buys nothing.
- **It is a BACKTRACKER, not RE2.** The engine declares "worst-case
  exponential like every backtracker"; the conformance corpus and
  ordinary validation patterns are linear-ish, which is not a
  guarantee. **Do not run a pattern from an untrusted source, and be
  careful with nested quantifiers over untrusted input.**
- **ASCII, not Unicode.** See the Unicode section above.
- **Prefer literal matches**: if you just need "contains" or "starts
  with", reach for `Text.contains` / `Text.starts_with`. That advice
  stands; the "10× faster" figure that used to sit beside it is
  withdrawn, because nothing in the repository measures it.

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
