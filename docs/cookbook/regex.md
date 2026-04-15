---
title: Regular-expression matching
description: Compile-time-checked regex; extract captures; replace; iterate.
---

# Regex

All regex in Verum lives behind the `rx#` tagged literal, which
validates the pattern at **compile time**. Invalid regex is a
compile error, not a runtime exception.

### Basic match

```verum
let email = rx#"^[^@\s]+@[^@\s]+\.[^@\s]+$";

if email.matches(&input) {
    print(&"valid");
}
```

### Find (first match)

```verum
let date = rx#"(\d{4})-(\d{2})-(\d{2})";

if let Maybe.Some(m) = date.find(&text) {
    print(&f"match at {m.start()}..{m.end()}: {m.as_str()}");
}
```

### Captures

```verum
if let Maybe.Some(caps) = date.captures(&"Event on 2026-04-15 today") {
    let year  = caps.get(1).unwrap().as_str();    // "2026"
    let month = caps.get(2).unwrap().as_str();    // "04"
    let day   = caps.get(3).unwrap().as_str();    // "15"
}
```

### Named captures

```verum
let pat = rx#"(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})";
let caps = pat.captures(&s).unwrap();
let year = caps.name(&"year").unwrap().as_str();
```

### Iterate all matches

```verum
let tokens = rx#"\w+";
for m in tokens.find_iter(&text) {
    print(&f"token: {m.as_str()}");
}

// With captures
let pairs = rx#"(\w+)\s*=\s*(\w+)";
for caps in pairs.captures_iter(&config) {
    let key = caps.get(1).unwrap().as_str();
    let val = caps.get(2).unwrap().as_str();
    apply(key, val);
}
```

### Replace

```verum
let first = rx#"\bfoo\b".replace(&s, &"bar");
let all   = rx#"\bfoo\b".replace_all(&s, &"bar");

// Use group references in replacement
let reformat = rx#"(\d{4})-(\d{2})-(\d{2})"
    .replace_all(&text, &"$3/$2/$1");

// Named groups
let rewritten = rx#"(?<year>\d{4})-(?<month>\d{2})"
    .replace_all(&text, &"${month}-${year}");
```

### Split

```verum
let sep = rx#"[\s,]+";
let tokens: List<Text> = sep.split(&text)
    .filter(|s| !s.is_empty())
    .map(|s| s.to_string())
    .collect();
```

### As a type predicate

```verum
type Email  is Text { self.matches(rx#"^[^@\s]+@[^@\s]+\.[^@\s]+$") };
type UUIDv4 is Text { self.matches(rx#"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$") };
type Slug   is Text { self.matches(rx#"^[a-z0-9]+(?:-[a-z0-9]+)*$") };
```

### Flags

```verum
let ci     = rx#"(?i)hello";         // case-insensitive
let multi  = rx#"(?m)^start";        // multiline: ^/$ match line boundaries
let dotall = rx#"(?s).";             // dot matches newline
let x      = rx#"(?x) \d{4} -        // extended: ignore whitespace in pattern
                    \d{2} - \d{2}";
```

### Performance notes

- **Compiled once**: each `rx#"..."` is a constant — no runtime
  compilation cost.
- **Linear-time by default**: the default engine is RE2-class, no
  backtracking, no catastrophic explosions.
- **Unicode-aware**: character classes like `\w`, `\d`, and `\p{L}`
  match Unicode by default; opt into byte-only with `(?-u)`.

### Pitfalls

- **Escape metacharacters carefully**: `.`, `*`, `+`, `?`, `(`, `)`,
  `{`, `}`, `[`, `]`, `\`, `|`, `^`, `$`. In raw-multiline, backslashes
  don't need doubling: `rx#"""\d+"""`.
- **Anchor where you mean to**: `rx#"\d+"` matches any run of digits
  anywhere; `rx#"^\d+$"` matches only when the whole string is digits.
- **Don't use regex for HTML/JSON/SQL parsing**. Use the tagged
  literals (`html#`, `json#`, `sql#`) — they parse with real grammars.

### See also

- **[text → regex](/docs/stdlib/text#regex--rx-tagged-literal)**
- **[Validation](/docs/cookbook/validation)** — refinement-based
  validation that embeds regex checks.
