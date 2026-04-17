---
sidebar_position: 8
title: Literal Handlers
description: Tagged literals (sql#"..."), suffixed literals (42_px), interpolation handlers, and how to register your own.
---

# Literal handlers

A literal handler is a meta function that receives the raw text of a
literal and returns a `TokenStream`. Verum's literal system is built
entirely on this primitive. There is no hardcoded list of "special"
literal forms — `sql#"..."`, `json#"..."`, `rx#"..."`, `42_px`,
`3.14_ft`, and everything else are user-extensible, implemented by
ordinary meta functions the compiler happens to dispatch on.

This page is the complete reference for the three literal handler
categories: **tagged literals**, **suffixed literals**, and
**interpolation handlers**. The fourth form — context-adaptive
literals — is a composition of the first three, covered at the end.

## Why literal handlers

The motivation: domain-specific data in program source looks wrong
as opaque strings.

```verum
// Without handlers — everything is Text, every error is runtime:
let q: Text = "SELECT * FROM users WHERE id = ?";
let re: Text = r"^[a-z]+@[a-z]+\.[a-z]+$";
let width: Int = 120;   // is that pixels, percent, columns?

// With handlers — typed at compile time, validated at compile time:
let q = sql#"SELECT * FROM users WHERE id = :id";   // SqlQuery<[id: Int]>
let re = rx#"^[a-z]+@[a-z]+\.[a-z]+$";             // CompiledRegex
let width = 120_px;                                 // Pixels
```

The literal text is parsed at compile time, typed precisely, and any
syntax error surfaces as a compile error pointing inside the literal.
The runtime carries the parsed representation, not the string.

## Tagged literals

Form: `tag#"content"` (single line) or `tag#"""content"""` (multi-line).
The tag is an identifier that names a registered handler; the content
is the text between the delimiters.

### Registering a handler

```verum
@tagged_literal("sql")
pub meta fn sql_literal(content: Text, span: Span) -> TokenStream
    using [AstAccess, CompileDiag]
{
    let parsed = match SqlParser.parse(&content) {
        Result.Ok(ast) => ast,
        Result.Err(e) => {
            CompileDiag.emit_error(&f"sql: {e.message}", e.span_within(span));
            return TokenStream.empty();
        }
    };

    let param_names = parsed.bind_params.iter().map(|p| p.name).collect();
    let param_types = parsed.infer_param_types();

    quote {
        SqlQuery::<[${lift(param_types)}]>::from_parsed(
            ${lift(parsed.to_canonical())},
            ${lift(param_names)}
        )
    }
}
```

### Usage

```verum
let q = sql#"SELECT id, name FROM users WHERE id = :id AND active = :active";
// q has type SqlQuery<[id: Int, active: Bool]>
// Compile-time errors:
//   - Malformed SQL
//   - Column/table not in schema (if Schema context is available)
//   - Bind parameter with no corresponding Verum binding
```

### Multi-line form

```verum
let html = html#"""
    <div class="card">
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
"""
```

The handler receives the raw content with leading indentation
stripped to the minimum common indent, which matches most pretty-
printing expectations.

### Standard tagged literals shipped with the compiler

| Tag       | Parsed as                         | Handler source        |
|-----------|-----------------------------------|-----------------------|
| `sql#`    | `SqlQuery<Params>`                | `core.tagged.sql`     |
| `rx#`     | `CompiledRegex`                   | `core.tagged.regex`   |
| `json#`   | `JsonValue` (validated)           | `core.tagged.json`    |
| `uri#`    | `Uri` (RFC 3986-validated)        | `core.tagged.uri`     |
| `time#`   | `Instant` / `Duration` (RFC 3339) | `core.tagged.time`    |
| `html#`   | `HtmlFragment`                    | `core.tagged.html`    |
| `css#`    | `CssRule`                         | `core.tagged.css`     |
| `shell#`  | `ShellCommand` (with escaping)    | `core.tagged.shell`   |
| `path#`   | `Path` (validated, no `..`)       | `core.tagged.path`    |
| `email#`  | `EmailAddress` (RFC 5322-lite)    | `core.tagged.email`   |
| `uuid#`   | `Uuid`                            | `core.tagged.uuid`    |
| `ipv4#`   | `Ipv4Addr`                        | `core.tagged.net`     |
| `ipv6#`   | `Ipv6Addr`                        | `core.tagged.net`     |
| `cidr#`   | `CidrBlock`                       | `core.tagged.net`     |
| `hex#`    | `Bytes` (hex-decoded)             | `core.tagged.bytes`   |
| `base64#` | `Bytes` (b64-decoded)             | `core.tagged.bytes`   |

The full handler source for each ships in `core.tagged.*`. A
project can replace a tagged handler by defining one with the same
tag in a higher-priority scope; see **Priority resolution** below.

### Context requirements

Tagged handlers may need extra contexts:

- Pure text validation (`rx#`, `email#`, `uuid#`) needs only
  `AstAccess` + `CompileDiag`.
- Schema-aware handlers (`sql#` against a typed schema, `json#`
  against a JSON schema) need `Schema`.
- Handlers that read external resources (e.g. an `import#"..."`
  handler that pulls a schema from disk) need `BuildAssets`.

The handler's `using [...]` clause declares these the same way any
other meta function does.

## Suffixed literals

Form: `value_suffix` — a numeric literal immediately followed by an
underscore and an identifier. The suffix names a registered handler.

### Registering a handler

```verum
@suffixed_literal("px")
pub meta fn pixels(value: Literal, span: Span) -> TokenStream
    using [CompileDiag]
{
    match value {
        Literal.Int(n, _) => quote { Pixels(${lift(n)}) },
        Literal.Float(n, _) => {
            CompileDiag.emit_error(
                "pixels must be integral — use `.round() as Int` if necessary",
                span
            );
            TokenStream.empty()
        }
        _ => {
            CompileDiag.emit_error("px suffix requires a numeric literal", span);
            TokenStream.empty()
        }
    }
}
```

### Usage

```verum
let width: Pixels = 120_px;       // → Pixels(120)
let height: Pixels = 1080_px;     // → Pixels(1080)
let scale: Pixels = 1.5_px;       // compile error — not integral
```

### Standard suffixed literals

Unit literals ship in `core.units`:

| Suffix family    | Examples                                            | Type                        |
|------------------|-----------------------------------------------------|----------------------------|
| Length           | `120_px`, `2_cm`, `100_mm`, `10_m`, `2.4_km`        | `Length<UnitKind>`         |
| Time             | `500_ms`, `30_s`, `5_min`, `2_h`, `7_days`          | `Duration<UnitKind>`       |
| Data size        | `1024_B`, `128_KiB`, `2_MiB`, `4_GiB`               | `DataSize<UnitKind>`       |
| Memory frequency | `100_Hz`, `2_kHz`, `5_MHz`, `3_GHz`                 | `Frequency<UnitKind>`      |
| Angle            | `90_deg`, `3.14_rad`, `100_gon`                     | `Angle<UnitKind>`          |
| Percent / ratio  | `50_pct`, `0.5_ratio`                               | `Percent` / `Ratio`        |
| Currency         | `100_usd`, `99.99_eur`, `150_gbp`                   | `Money<Currency>`          |

Unit arithmetic is type-checked: `2_km + 500_m` is valid,
`2_km + 500_ms` is a type error. The full unit protocol lives in the
`core.units` section of the standard library.

### Refinement-aware suffix handlers

A suffix handler can emit a refined type:

```verum
@suffixed_literal("port")
pub meta fn port_literal(v: Literal, span: Span) -> TokenStream
    using [CompileDiag]
{
    match v {
        Literal.Int(n, _) if n >= 1 && n <= 65535 => {
            quote { Port::<{1..=65535}>::unchecked(${lift(n)}) }
        }
        Literal.Int(n, _) => {
            CompileDiag.emit_error(
                &f"port number {n} out of range [1, 65535]",
                span
            );
            TokenStream.empty()
        }
        _ => {
            CompileDiag.emit_error("port suffix requires an integer", span);
            TokenStream.empty()
        }
    }
}

// Usage:
let p = 8080_port;        // Port { 1 <= self && self <= 65535 }
let bad = 70000_port;     // compile error: out of range
```

## Interpolation handlers

A format literal — written with the `f"..."` prefix or an
interpolation-handler prefix — can be parsed by a handler, not by
the default formatter. This is how `log.info(level"message {x}")`
or `assert(invariant"x > 0 && x < n")` gain domain-specific semantics.

### Registering a handler

```verum
@interpolation_handler("sql")
pub meta fn sql_interpolation(parts: List<InterpPart>, span: Span)
    -> TokenStream
    using [AstAccess, CompileDiag]
{
    let mut sql_text = Text.new();
    let mut bind_exprs = List.new();

    for part in parts.iter() {
        match part {
            InterpPart.Literal(s) => sql_text.append(&s),
            InterpPart.Interpolated(expr) => {
                sql_text.append(&f" ?{bind_exprs.len()+1} ");
                bind_exprs.push(expr.clone());
            }
        }
    }

    let parsed = SqlParser.parse(&sql_text)?;
    quote {
        Database.execute_prepared(
            ${lift(parsed.to_canonical())},
            &[$[for e in bind_exprs { ${e}, }]]
        )
    }
}
```

### Usage

```verum
let id = 42;
let user = sql"SELECT * FROM users WHERE id = {id} AND active = true";
// Compiles to a prepared statement with id bound as the first
// parameter. SQL injection is impossible by construction.
```

### `InterpPart`

The handler receives a list of parts:

```verum
type InterpPart is
    | Literal(Text)           // a run of plain text between braces
    | Interpolated(ExprAst);  // the contents of one {expr} group
```

The default `f"..."` handler concatenates parts via the `Display`
protocol; a custom handler can do whatever it likes with the pieces.

### Common interpolation handlers

| Prefix      | Purpose                                             | Handler source           |
|-------------|-----------------------------------------------------|--------------------------|
| `f"..."`    | Default formatter — `Display` per part              | `core.fmt`               |
| `sql"..."`  | Prepared SQL; interpolated values become bind params | `core.tagged.sql`       |
| `html"..."` | HTML; interpolated values HTML-escaped              | `core.tagged.html`       |
| `shell"..."`| Shell command; interpolated values shell-escaped    | `core.tagged.shell`      |
| `log"..."`  | Structured log record with extracted fields         | `core.tagged.log`        |
| `path"..."` | Path; interpolated values path-escaped              | `core.tagged.path`       |

The security-sensitive handlers (`sql`, `html`, `shell`, `path`)
perform escaping automatically at compile time. They are the
primary reason interpolation handlers exist — they close an entire
class of injection vulnerabilities by construction.

## Context-adaptive literals

The composition of tagged + interpolated literals with schema /
context awareness. Example: `color#"red"` resolves differently in a
`@ColorTheme(Dark)` context than in a `@ColorTheme(Light)` context,
picking the theme-appropriate shade.

```verum
@context_adaptive_literal("color")
pub meta fn color(content: Text, span: Span)
    -> TokenStream
    using [ProjectInfo, AstAccess, CompileDiag]
{
    let theme = ProjectInfo.get_feature("theme").unwrap_or(&"Light");
    let table = match theme {
        "Dark" => dark_palette(),
        "Light" => light_palette(),
        other => {
            CompileDiag.emit_error(&f"unknown theme: {other}", span);
            return TokenStream.empty();
        }
    };
    match table.get(&content) {
        Maybe.Some(rgb) => quote { Color::<{theme}>::new(${lift(rgb)}) },
        Maybe.None => {
            CompileDiag.emit_error(&f"no colour named `{content}` in theme", span);
            TokenStream.empty()
        }
    }
}
```

## Priority resolution

Multiple cogs in a dependency graph may define handlers for the
same tag or suffix. The compiler resolves with a deterministic
priority:

1. **Current-cog handlers** beat imported handlers.
2. Among imports, **explicit imports** (`mount core.tagged.sql;`)
   beat transitive re-exports.
3. Ties are broken by cog name alphabetically, with the conflict
   logged as a linter warning that names both contenders.

A project can opt a handler into cog-wide default by re-exporting
it under `core.tagged.*` or by listing it in `[meta.tagged_literals]`
in `Verum.toml`.

## Safety attributes

Interpolation handlers that accept user-controlled input should
document their safety class. The conventional attributes are:

| Attribute               | Meaning                                                   |
|-------------------------|-----------------------------------------------------------|
| `@safe`                 | Default. Handler escapes or rejects unsafe input.         |
| `@unsafe`               | Handler may emit input verbatim. Warned on use.           |

A handler without a safety attribute is conventionally treated as
`@safe` when it is itself pure string-level escaping and as `@unsafe`
when it emits any interpolated value verbatim. Security-sensitive
projects can elevate the unsafety-missing warning to error in
`Verum.toml` under `[lint]`.

## Debugging literals

Passing `--show-expansions` to `verum build` (or `verum check`)
emits the post-expansion form of every tagged and interpolated
literal in the build, so you can read exactly what the handler
produced.

## See also

- **[Tagged literals (language page)](/docs/language/tagged-literals)**
  — the user-facing documentation of the standard set.
- **[Macro kinds](./macro-kinds)** — how literal handlers fit among
  the four macro forms.
- **[Token-stream API](./token-api)** — `InterpPart`, `Literal`,
  `Span`.
- **[Compilation model](./compilation-model)** — when literal
  expansion runs.
- **[Diagnostics](./error-codes)** — how literal-handler
  diagnostics are structured.
