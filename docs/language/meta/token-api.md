---
sidebar_position: 6
title: Token-Stream API
description: The `TokenStream`, `Token`, `Literal` and `Span` types that macro bodies manipulate — and which parts of this page are not shipped.
---

# The token-stream API

`quote { ... }` is the right tool for **building** code. When a
macro needs to **inspect** code it was given, or build output in a
programmatic shape that `quote` cannot express directly, it reaches
for the token-stream API.

This page documents the types and operations every non-trivial meta
function will touch.

:::caution Half of this page is a design, not an API
Measured against `core/meta/` on 2026-09-06, name by name. WHAT IS
SHIPPED, all in `core/meta/token.vr` unless noted: `TokenStream`,
`TokenTree`, `Token`, `TokenKind`, `TokenGroup`, `Delimiter`,
`Spacing`, `Keyword`, `Literal`, `StringKind`, `LexError`; `Span` and
`MetaSpan` (`span.vr`); `QuoteBuilder`, `GroupBuilder`, `QuotePart`
(`quote.vr`); `TypeKind`, `FieldInfo`, `VariantInfo`, `GenericParam`,
`ProtocolInfo`, `FunctionInfo` (`reflection.vr`).

WHAT IS NOT, anywhere in `core/`: `Ident`, `Punct`, `Group`,
`HygieneMark`, `Hygiene`, `AstAccess`, and every `*Ast` type —
`FnAst`, `TypeAst`, `ImplAst`, `ExprAst`, `StmtAst`, `PatternAst`,
`ProtocolAst`, `ContextAst`, `AttributeAst`, `BlockAst` — along with
`TypeInfo`, `CompileDiag`, `Quotable` and `Param`. Sections that rest
on them carry their own marker below.

The shipped half is corrected against the source in this pass: the
token tree is `| Leaf(Token) | Grouped(TokenGroup)`, not four variants;
the group type is `TokenGroup`, not `Group`; and `Delimiter`'s variants
are `Parenthesis` / `Brace` / `Bracket` / `Invisible`, not `Paren` /
… / `None` (`core/meta/token.vr:409`).
:::

## The data model

Metaprogramming works at two levels of granularity:

1. **Token trees** — the parser's pre-semantic representation of
   source code. Closest to raw syntax. Produced by `quote { ... }`,
   consumed by function-like macros, emitted back into the
   compilation pipeline.

2. **AST nodes** — semantically structured types (`FnAst`, `TypeAst`,
   `ExprAst`, …) with named fields. Produced by parsing or
   reflection, consumed by attribute and derive macros that want to
   treat the input as "a function" or "a type", not as a bag of
   tokens.

Both views are intended to co-exist, with a reduction in each
direction. ONLY THE FIRST IS SHIPPED: token trees are real and the
`*Ast` layer is not, so today the second level is reached through
`core/meta/reflection.vr`'s `FunctionInfo`, `FieldInfo` and their kin
rather than through a parsed `FnAst`. The caution above lists what
exists; the sections below say so where it matters.

## `TokenStream`

The primary type. A `TokenStream` is an ordered sequence of
`TokenTree`s.

```verum
// core/meta/token.vr:436 — two variants, not four. A single token
// carries its own kind; only a delimited run needs its own type.
type TokenTree is
    | Leaf(Token)
    | Grouped(TokenGroup);

type TokenStream is {
    tokens: List<TokenTree>,
};
```

### Core operations

| Method                                 | Returns             | Purpose                                         |
|----------------------------------------|---------------------|------------------------------------------------|
| `TokenStream.empty()`                  | `TokenStream`       | an empty stream                                |
| `TokenStream.of(tt: TokenTree)`        | `TokenStream`       | single-token stream                            |
| `ts.push(&mut self, tt: TokenTree)`    | `()`                | append a token tree                            |
| `ts.append(&mut self, other: TokenStream)` | `()`            | concatenate                                     |
| `ts.len()`                             | `Int`               | number of tokens                               |
| `ts.is_empty()`                        | `Bool`              | test                                           |
| `ts.iter()`                            | `Iterator<TokenTree>` | walk                                         |
| `ts.to_text()`                         | `Text`              | the source form, whitespace-normalised         |
| `ts.to_pretty()`                       | `Text`              | the source form, pretty-printed                |

### Concatenation shorthand

`TokenStream` implements `Quotable`, so you can splice one into
another quote with `${ts}`:

```verum
let preamble = quote { let _start = Clock.now(); };
let body = quote { compute(x) };
let full = quote { ${preamble} ${body} };
```

### Parsing a text literal into tokens

Occasionally a macro receives a string (from a build asset, a
config file, or a tagged literal) and needs to parse it as Verum
tokens:

```verum
let raw: Text = BuildAssets.load_text("codegen/fragment.vr")?;
let ts: TokenStream = TokenStream.from_str(raw)?;
```

`from_str` is the lexer-only front end — `TokenStream.from_str(source: Text)
-> Result<TokenStream, LexError>`. It stops at the first character it
cannot lex; it does not parse, so a stream that comes back clean can
still fail `AstAccess.parse_item`.

## `Ident`

:::caution `Ident` is not shipped
There is no `Ident` type in `core/`, and no `Hygiene` or `HygieneMark`
either. A single token is `Token { kind: TokenKind, … }`
(`core/meta/token.vr:505`), and an identifier is a `TokenKind`, not a
type of its own. Everything in this section — the factories, the
rename helpers, `Hygiene.gensym` — describes the API this design
wants, not one a `.vr` program can call today.
:::

An identifier carries a name, a span, and a hygiene context.

```verum
type Ident is {
    name: Text,
    span: Span,
    hygiene_mark: HygieneMark,
};
```

### Constructing identifiers

| Factory                              | Semantics                                     |
|--------------------------------------|-----------------------------------------------|
| `Ident.from(text)`                   | parse as identifier; default call-site hygiene |
| `Ident.with_span(text, span)`        | as above, with an explicit span                |
| `Hygiene.gensym(prefix)`             | fresh identifier, fresh mark                   |
| `Hygiene.from_caller(name)`          | reuse the caller's hygiene context             |

### Common operations

| Method                           | Returns       | Purpose                            |
|----------------------------------|---------------|------------------------------------|
| `id.name()`                      | `&Text`       | the source form                    |
| `id.span()`                      | `Span`        | the source position                |
| `id.is_keyword()`                | `Bool`        | true for `let`, `fn`, `is`         |
| `id.to_pascal_case()`            | `Ident`       | rename convention                  |
| `id.to_snake_case()`             | `Ident`       | rename convention                  |
| `id.prefix_with(&Text)`          | `Ident`       | derive a new identifier            |
| `id.suffix_with(&Text)`          | `Ident`       | derive a new identifier            |

Creating a setter from a field identifier:

```verum
let setter = Ident.from(&f"set_{field.name}");
```

## `Literal`

Wraps numeric, string, and boolean literals with their source-level
representation.

```verum
type Literal is
    | Int(Int, Span)
    | Float(Float, Span)
    | Text(Text, Span)
    | Bool(Bool, Span)
    | Char(Char, Span)
    | Byte(u8, Span)
    | ByteString(List<u8>, Span)
    | Tagged(tag: Text, content: Text, Span);
```

Use `Literal.int(42)` / `Literal.text("hello")` / etc. to construct,
and pattern-match on the variants to inspect. `Literal` is quotable:
`${Literal.int(42)}` splices `42`.

## `Punct`

:::caution `Punct` is not shipped
`Spacing` IS real (`core/meta/token.vr:700`, variants `Joint` and
`Alone`), and the distinction this section draws is the right one. The
`Punct` type that carries it is not: punctuation reaches a macro body
as a `Token` whose `kind` says so.
:::

A punctuation token — `+`, `->`, `::`, `{`, etc. Rarely
hand-constructed; usually emerges from `quote { ... }` or
`tokenize(...)` and is consumed by pattern-matching.

```verum
type Punct is { char: Char, spacing: Spacing, span: Span };
type Spacing is | Joint | Alone;
```

`Spacing` tells the parser whether this punctuation is joined with
the next one (like `-` followed by `>` to form `->`). Hand-written
punctuation usually wants `Spacing.Alone`; multi-character operators
use `Joint`.

## `TokenGroup`

A `TokenGroup` is a bracketed sub-stream:

```verum
// core/meta/token.vr:409 and :420
type Delimiter is
    | Parenthesis   // ( ... )
    | Brace         // { ... }
    | Bracket       // [ ... ]
    | Invisible;    // no delimiter

type TokenGroup is {
    delimiter: Delimiter,
    tokens: TokenStream,
    span: Span,
};
```

`Delimiter.Invisible` is the one worth knowing: it exists for grouping
that the expander needs and the reader must not see — preserving
precedence without introducing visible parentheses. It is the variant
this page previously called `None`, which is also the name of a
`Maybe` variant, so the rename is worth more than a spelling
correction.

## AST node types

:::caution Everything from here to the worked example is a design
`AstAccess` and every `*Ast` type below — `FnAst`, `TypeAst`,
`ImplAst`, `ExprAst`, `StmtAst`, `PatternAst`, `ProtocolAst`,
`ContextAst`, `AttributeAst`, `BlockAst` — occur nowhere in `core/`,
and neither do `TypeInfo`, `CompileDiag`, `Quotable` or `Param`. The
sections that follow are worth reading as the shape the macro layer is
being built towards; none of them compiles.

WHAT DOES EXIST for the two jobs these sections describe. For
reflection: `core/meta/reflection.vr` declares `TypeKind`,
`FieldInfo`, `VariantInfo`, `VariantKind`, `GenericParam`,
`ProtocolInfo`, `AssociatedTypeInfo` and `FunctionInfo` — structured,
and reachable — so the "what fields does this type have" question has
an answer; it is simply not spelled `TypeInfo.of<T>()`. For building
output: `core/meta/quote.vr` has `QuoteBuilder`, `GroupBuilder` and the
`quote { … }` form, which is where the `Building code` page starts.
:::

`AstAccess.parse_*` functions turn a `TokenStream` into a typed AST
node. The structured types are:

| Type             | What it represents                             |
|------------------|------------------------------------------------|
| `FnAst`          | A function declaration                         |
| `TypeAst`        | A `type ... is ...` declaration                |
| `ImplAst`        | An `implement ... for ...` block               |
| `ProtocolAst`    | A `type ... is protocol { ... }` declaration   |
| `ContextAst`     | A `context ... { ... }` declaration            |
| `ExprAst`        | Any expression                                 |
| `StmtAst`        | Any statement                                  |
| `BlockAst`       | A `{ ... }` block                              |
| `PatternAst`     | A match/destructure pattern                    |
| `AttributeAst`   | A single `@...(...)` attribute                 |

### `FnAst` — the most common

```verum
type FnAst is {
    name: Ident,
    generics: List<GenericParam>,
    params: List<Param>,
    return_type: Maybe<TypeAst>,
    contexts: Maybe<List<ContextRef>>,
    throws: Maybe<TypeAst>,
    where_clauses: List<WhereClause>,
    attributes: List<AttributeAst>,
    body: BlockAst,
    span: Span,
};
```

Every field is quotable, so you can build a new `FnAst` by starting
from an existing one and substituting one field:

```verum
@proc_macro_attribute(memoize)
pub meta fn memoize(f: FnAst) -> TokenStream using [AstAccess, Hygiene] {
    let cache = Hygiene.gensym(&f"_{f.name}_cache");
    let new_body = quote {
        let cache_key = ${f.params.to_cache_key()};
        if let Maybe.Some(hit) = $cache.get(&cache_key) {
            return hit.clone();
        }
        let result = ${f.body};
        $cache.insert(cache_key, result.clone());
        result
    };
    quote {
        static $cache: Map<Text, ${f.return_type}> = Map.new();
        fn ${f.name}(${f.params}) -> ${f.return_type}
            using ${f.contexts} where throws(${f.throws})
        {
            ${new_body}
        }
    }
}
```

### `TypeAst`, `ImplAst`, …

Each AST node type has a constructor family (`FnAst.builder()`,
`TypeAst.builder()`, …), a pattern for deconstruction, and
`to_tokens()` for re-serialisation. See [`stdlib →
meta`](/docs/stdlib/meta) for the per-type method surface.

## Reflection — `TypeInfo`

The `TypeInfo` context reflects on types without going through the
AST. Use `AstAccess` when you have source tokens; use `TypeInfo`
when you have a type parameter.

| Method                                  | Returns                  |
|-----------------------------------------|--------------------------|
| `TypeInfo.name_of<T>()`                 | canonical dotted path    |
| `TypeInfo.simple_name_of<T>()`          | last component           |
| `TypeInfo.fields_of<T>()`               | `List<FieldInfo>` (records) |
| `TypeInfo.variants_of<T>()`             | `List<VariantInfo>` (sums) |
| `TypeInfo.kind_of<T>()`                 | `TypeKind` enum           |
| `TypeInfo.size_of<T>()`                 | bytes                     |
| `TypeInfo.alignment_of<T>()`            | bytes                     |
| `TypeInfo.implements<T, P>()`           | `Bool` — compile-time    |
| `TypeInfo.impls_of<T>()`                | `List<ProtocolRef>`      |
| `TypeInfo.attributes_of<T>()`           | `List<AttributeAst>`     |
| `TypeInfo.generic_params_of<T>()`       | `List<GenericParam>`     |

```verum
type FieldInfo is {
    name: Ident,
    ty: TypeAst,
    attributes: List<AttributeAst>,
    offset: Int,
    span: Span,
};

type VariantInfo is
    | Unit(Ident)
    | Tuple(Ident, List<TypeAst>)
    | Record(Ident, List<FieldInfo>);
```

### Checking before emitting

The canonical pattern inside a derive:

```verum
if !TypeInfo.implements<T, Copy>() {
    CompileDiag.emit_error(
        &f"cannot derive TriviallyCopyable for {TypeInfo.name_of<T>()} — \
           one or more fields are not Copy",
        Span.call_site()
    );
    return TokenStream.empty();
}
```

## `Span`

A source position range. Every AST node and every token carries a
`Span`. Spans are used by diagnostics, by the (unimplemented)
`verum expand-macros` to
trace provenance, and by the LSP to locate hover tooltips.

`Span` is a public alias for `MetaSpan` (`core/meta/span.vr:101`), and
it is an OPAQUE HANDLE — `{ id, hygiene, flags }` — not a file, line and
column. That is the shape worth understanding before the table: a span
identifies a position, and resolving it to a human-readable location is
a separate, fallible step.

| Method                          | Returns                 | Purpose                                        |
|---------------------------------|-------------------------|------------------------------------------------|
| `Span.call_site()`              | `Span`                  | the caller's span — the usual choice           |
| `Span.def_site()`               | `Span`                  | the macro definition's own span                 |
| `Span.mixed_site()`             | `Span`                  | call-site hygiene, def-site resolution          |
| `Span.synthetic()`              | `Span`                  | no source position at all                       |
| `span.location()`               | `Maybe<SourceLocation>` | file, line and column — MAYBE, see below        |
| `span.start()` / `span.end()`   | `Int`                   | byte offsets                                    |
| `span.len()` / `span.is_empty()`| `Int` / `Bool`          | width                                           |
| `span.join(other)`              | `Span`                  | smallest containing range                       |
| `span.subspan(start, end)`      | `Maybe<Span>`           | a narrower span inside this one                 |
| `span.source_text()`            | `Maybe<Text>`           | the source bytes, when there are any            |
| `span.overlaps` / `.contains`   | `Bool`                  | range relations                                  |
| `span.is_expansion()` / `.is_synthetic()` | `Bool`        | where this span came from                       |
| `span.resolved_at_call_site()` / `.resolved_at_def_site()` | `Span` | re-hygiene an existing span          |

THE TWO `Maybe`s ARE THE POINT. `location()` and `source_text()` both
return `Maybe` because a synthetic span — one a macro invented — has no
file and no source bytes, and a macro that assumes otherwise crashes on
its own output. `SourceLocation` (`span.vr:295`) is where `file`, `line`
and `column` actually live:

```verum
match span.location() {
    Maybe.Some(loc) => print(loc.display()),
    Maybe.None      => print("<synthetic>"),
}
```

Spans are mostly handled for you — any identifier, literal, or AST
node you receive already has one, and `to_tokens()` preserves them.

## Diagnostics — `CompileDiag`

The `CompileDiag` context is how macros emit diagnostics:

```verum
CompileDiag.emit_error(message: Text, span: Span);
CompileDiag.emit_warning(message: Text, span: Span);
CompileDiag.emit_note(message: Text, span: Span);
CompileDiag.emit_help(message: Text, span: Span);
CompileDiag.emit_error_with_code(code: Text, message: Text, span: Span);
CompileDiag.emit_warning_with_code(code: Text, message: Text, span: Span);
CompileDiag.has_errors() -> Bool;
CompileDiag.error_count() -> Int;
CompileDiag.warning_count() -> Int;
```

Emitted diagnostics participate in the standard error pipeline.
They appear in `verum build`, the LSP, and CI test runners.

There is no `abort`. A macro that cannot proceed emits its
diagnostic and returns `TokenStream.empty()`; the compilation
fails because an error was emitted, not because expansion was
cut short. This is deliberate — a macro that aborts on the first
problem reports one error per build, and the worked example below
finishes checking every bind parameter before giving up.

### Structured diagnostics

For anything richer than a message and a span, `CompileDiag`
hands out a builder. Each method returns the builder, and `emit`
consumes it:

```verum
CompileDiag.diagnostic()
    .error("unsupported variant")
    .code("E9001")
    .primary_span(v.span, "this variant uses a tuple shape")
    .secondary_span(t.span, "but the derive only handles records")
    .help("convert the variant to a record")
    .emit();
```

`suggest(message, span, replacement)` adds a machine-applicable
fix, which is what the LSP offers as a code action; `warning`
replaces `error` for a non-fatal diagnostic.

## Worked example — an SQL DSL with a proper error path

```verum
@proc_macro(sql)
pub meta fn sql(tokens: TokenStream) -> TokenStream
    using [AstAccess, CompileDiag]
{
    let text = match tokens.as_text_literal() {
        Maybe.Some(t) => t,
        Maybe.None => {
            CompileDiag.emit_error(
                "@sql expects a string literal argument",
                Span.current()
            );
            return TokenStream.empty();
        }
    };

    let parsed = match SqlParser.parse(&text) {
        Result.Ok(ast) => ast,
        Result.Err(err) => {
            CompileDiag.diagnostic()
                .error(err.message.clone())
                .primary_span(err.span, err.hint.clone())
                .help("check the syntax against the project's SQL dialect")
                .emit();
            return TokenStream.empty();
        }
    };

    // Validate every bind parameter, and report ALL the bad ones —
    // a macro that returns on the first error costs the caller a
    // build per mistake.
    //
    // NOTE the limit: the meta API has no scope query. Nothing in
    // `AstAccess` or `Hygiene` can answer "is this name bound at the
    // call site", so a macro cannot check that `:user_id` matches a
    // Verum binding — that error surfaces later, when the expansion
    // is type-checked. What a macro CAN check is the shape of what
    // it was handed.
    for param in parsed.bind_params.iter() {
        if TokenStream.from_str(param.name.clone()) is Result.Err(_) {
            CompileDiag.emit_error(
                &f"sql bind parameter :{param.name} does not lex as Verum",
                param.span
            );
        }
    }

    quote {
        Database.execute(${lift(parsed.to_canonical_sql())},
                         ${lift_params(parsed.bind_params)})
    }
}
```

The macro (1) validates the input is a string literal, (2) parses
the SQL and emits a rich diagnostic on parse error, (3)
cross-validates bind parameters against the outer scope, and (4)
emits the call to `Database.execute` with parameters
properly marshalled. The error path is just as important as the
success path; production macros rarely have fewer diagnostics than
quote-lines.

## See also

- **[Compilation model](./compilation-model)** — when macro bodies
  run.
- **[Macro kinds](./macro-kinds)** — which inputs each macro form
  receives.
- **[Quote and hygiene](./quote-and-hygiene)** — the declarative
  side of code construction.
- **[`stdlib → meta`](/docs/stdlib/meta)** — the full API surface
  for every meta-context method.
- **[Diagnostics](./error-codes)** — diagnostic categories and
  the shape of every message.
