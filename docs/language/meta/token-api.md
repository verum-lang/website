---
sidebar_position: 6
title: Token-Stream API
description: The `TokenStream`, `Ident`, `Literal`, `Span`, and AST-node types that macro bodies manipulate.
---

# The token-stream API

`quote { ... }` is the right tool for **building** code. When a
macro needs to **inspect** code it was given, or build output in a
programmatic shape that `quote` cannot express directly, it reaches
for the token-stream API.

This page documents the types and operations every non-trivial meta
function will touch. The API is provided by the `AstAccess`
meta-context.

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

Both views co-exist. An `FnAst` can always be reduced to a
`TokenStream` via `to_tokens()`; a `TokenStream` can be parsed into
an `FnAst` via `AstAccess.parse_fn(&tokens)` when the tokens really
are a function. The `TokenStream` form is more permissive, the
`FnAst` form catches more errors up front.

## `TokenStream`

The primary type. A `TokenStream` is an ordered sequence of
`TokenTree`s.

```verum
type TokenTree is
    | Ident(Ident)
    | Literal(Literal)
    | Punct(Punct)
    | Group(Delimiter, TokenStream);

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
let ts: TokenStream = AstAccess.tokenize(&raw)?;
```

`tokenize` is the lexer-only front end. It returns either the
token stream or a `ParseError` pointing at the first unexpected
character.

## `Ident`

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

## `Group`

A `Group` is a bracketed sub-stream:

```verum
type Delimiter is | Paren | Brace | Bracket | None;
type Group is { delim: Delimiter, inner: TokenStream, span: Span };
```

Use `Group.new(Delimiter.Paren, inner_ts)` to wrap. `Delimiter.None`
exists for invisible grouping — used by the expander to preserve
precedence without introducing visible parentheses.

## AST node types

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
if not TypeInfo.implements<T, Copy>() {
    CompileDiag.emit_error(
        &f"cannot derive TriviallyCopyable for {TypeInfo.name_of<T>()} — \
           one or more fields are not Copy",
        Span.current()
    );
    return TokenStream.empty();
}
```

## `Span`

A source position range. Every AST node and every token carries a
`Span`. Spans are used by diagnostics, by `verum expand-macros` to
trace provenance, and by the LSP to locate hover tooltips.

| Method                         | Returns         | Purpose                                 |
|--------------------------------|-----------------|-----------------------------------------|
| `Span.current()`               | `Span`          | the current call site                   |
| `span.file()`                  | `Text`          | the source file path                    |
| `span.line()`                  | `Int`           | 1-based line                            |
| `span.column()`                | `Int`           | 1-based column                          |
| `span.byte_range()`            | `(Int, Int)`    | byte offsets                            |
| `span.join(other: Span)`       | `Span`          | smallest containing range               |
| `span.source_text()`           | `Text`          | the source bytes at this span           |

Spans are mostly handled for you — any identifier, literal, or AST
node you receive already has one, and `to_tokens()` preserves them.

## Diagnostics — `CompileDiag`

The `CompileDiag` context is how macros emit diagnostics:

```verum
CompileDiag.emit_error(msg: Text, span: Span);
CompileDiag.emit_warning(msg: Text, span: Span);
CompileDiag.emit_note(msg: Text, span: Span);
CompileDiag.emit_help(msg: Text, span: Span);
CompileDiag.abort() -> !;   // stop expansion; returns to the compiler
```

Emitted diagnostics participate in the standard error pipeline.
They appear in `verum build`, the LSP, and CI test runners.

### Structured diagnostics

`CompileDiag.emit_diagnostic(d: Diagnostic)` takes a fully
structured diagnostic for complex cases:

```verum
let d = Diagnostic.error("unsupported variant")
    .with_primary_span(v.span, "this variant uses a tuple shape")
    .with_secondary_span(t.span, "but the derive only handles records")
    .with_help("add @derive(ClonePartial) or convert the variant to a record");

CompileDiag.emit_diagnostic(d);
```

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
                "@sql! expects a string literal argument",
                Span.current()
            );
            return TokenStream.empty();
        }
    };

    let parsed = match SqlParser.parse(&text) {
        Result.Ok(ast) => ast,
        Result.Err(err) => {
            CompileDiag.emit_diagnostic(
                Diagnostic.error(err.message.clone())
                    .with_primary_span(err.span, &err.hint)
                    .with_help("check the syntax against the project's SQL dialect")
            );
            return TokenStream.empty();
        }
    };

    // Validate that every bind parameter is available in the outer scope.
    for param in parsed.bind_params.iter() {
        if not AstAccess.name_in_scope(&param.name) {
            CompileDiag.emit_error(
                &f"sql bind parameter :{param.name} has no matching Verum binding",
                param.span
            );
        }
    }

    quote {
        Database.execute_prepared(${lift(parsed.to_canonical_sql())},
                                  &[${lift_params(parsed.bind_params)}])
    }
}
```

The macro (1) validates the input is a string literal, (2) parses
the SQL and emits a rich diagnostic on parse error, (3)
cross-validates bind parameters against the outer scope, and (4)
emits the call to `Database.execute_prepared` with parameters
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
