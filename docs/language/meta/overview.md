---
sidebar_position: 1
title: Metaprogramming
description: The Verum metaprogramming system — a single language used at compile time and run time, unifying attributes, derives, macros, quotes, literal handlers, and compile-time reflection.
---

# Metaprogramming

Metaprogramming in Verum is not a separate dialect. **The language
you use at compile time is the same language you use at run time**,
with the same type system, the same module resolution, the same
contexts, and the same tooling — just executed at an earlier stage.
There is no second grammar, no `macro_rules!`-vs-procedural split,
no quasi-quote that parses differently from ordinary expressions.

This page is the map of the subsystem. Every surface form in Verum
that runs at compile time — `@attribute`, `@derive`, `@sql_query!`,
`sql#"..."`, `120_px`, `f"..."`, `@cfg(...)`, `@const`, custom
`meta fn`s, proof tactics — resolves through the machinery
described here. The deeper pages elaborate each component.

## What compile-time Verum gives you

Four capabilities, in increasing order of expressiveness:

1. **Compile-time evaluation** — `@const`, constant folding,
   compile-time arithmetic. Values computed during compilation and
   folded into the output.
2. **Code generation** — attribute macros, derives, function-like
   macros, declarative macros. Turn a declaration or an input token
   tree into generated source.
3. **Compile-time reflection** — inspect types, fields, variants,
   protocol implementations, attributes, the project manifest, the
   dependency graph. Drive code generation from what already exists.
4. **Literal extension** — tagged (`sql#"..."`, `rx#"..."`),
   suffixed (`120_px`, `100_ms`), interpolation (`sql"... {id}"`),
   and context-adaptive literals, all built on the same primitive.

All four run in a deterministic, sandboxed compile-time environment
with explicit capability requirements declared through the same
`using [...]` clause you use for runtime dependency injection.

## Mental model in one picture

```
source (.vr)
    │
    │  pass 1: parse every file, register every item
    ▼
meta registry  ────────┐
    │                  │
    │  pass 2:         │  macros invoked with:
    │  expand macros   │  • full type info
    │                  │  • AST of what they annotate
    │  ◄──────────────┘  • hygiene context
    ▼
expanded AST
    │
    │  pass 3: type checking, CBGR, contexts, verification
    ▼
VBC bytecode → interpreter / AOT
```

The multi-pass architecture solves the chicken-and-egg problem:
macros need types to inspect; types need macros to expand first.
Verum sidesteps it by **registering everything before expanding
anything**, so both passes see a coherent picture of the program.
See [Compilation model](./compilation-model) for the detail.

## The surface forms, at a glance

### Attributes — compile-time invocations

Every `@`-prefixed construct in Verum is an attribute invocation,
dispatched to a registered meta function:

```verum
@derive(Clone, Debug, Serialize)
@verify(formal)
@repr(C)
pub type User is {
    id: Int,
    name: Text,
    email: Text,
};
```

- `@derive(P)` — synthesise an `implement P for T`. See
  [Derives](./derives) for the shipped derives and how to
  write your own.
- `@verify(strategy)` — set verification strategy for the annotated
  item.
- `@repr(C)` / `@repr(transparent)` / `@repr(align(N))` — control
  memory layout.
- `@cfg(feature = "x")` — conditional compilation.
- `@differentiable` — autodiff instrumentation.
- `@specialize(shape = [...])` — generate shape-specialised
  variants.
- Forty-plus standard attributes ship; every one of them is a
  `meta fn` you could have written yourself.

### `meta fn` — the workhorse

A `meta fn` is a compile-time function. Its inputs may be token
trees or typed AST nodes; its output is a token stream to splice
back into the program.

```verum
meta fn square<T: Numeric>() -> TokenStream
    using [TypeInfo]
{
    let name = TypeInfo.simple_name_of<T>();
    quote {
        pub fn ${Ident.from(&f"square_{name.to_lower()}")}(x: ${lift_type(&TypeInfo.name_of<T>())})
            -> ${lift_type(&TypeInfo.name_of<T>())}
        {
            x * x
        }
    }
}
```

A `meta fn` follows every rule of an ordinary Verum function:
declared contexts, typed parameters, generic bounds, refinements.
The only differences are that it runs at stage 1 (compile time) and
that its body is subject to the [meta sandbox](./compilation-model#the-meta-sandbox).

### `quote { ... }` — structured AST construction

Verum's quasi-quote. Tokens inside the braces are the output AST;
splice operators reach out to meta-time values:

```verum
quote {
    pub fn ${name}(${params}) -> ${ret_type} {
        ${body}
    }
}
```

- `${expr}` splices a value (`Ident`, `Literal`, `TokenStream`,
  anything `Quotable`).
- `$var` is the shorthand for `${var}` when `var` is an identifier.
- `$[for x in xs { ... }]` iterates.
- `$(stage N){ expr }` evaluates at a specific stage.
- `$$var` crosses a stage boundary (advanced; see [Staging](./staging)).
- `lift(value)` is syntactic sugar for splicing a quotable value.

Full reference: [Quote and hygiene](./quote-and-hygiene).

### Token streams and AST nodes

The imperative face of the same thing. When a macro needs to
inspect its input structurally (it was given a function, and the
macro needs to know its return type), it receives a typed AST node
(`FnAst`, `TypeAst`, `ExprAst`, …) rather than a raw `TokenStream`.
The full API is documented on the [Token-stream API](./token-api)
page.

### Literal handlers

Tagged (`sql#"..."`, `rx#"..."`), suffixed (`120_px`, `2_MiB`), and
interpolated (`sql"SELECT * FROM t WHERE id = {x}"`) literals are
all just meta functions registered to a literal form. You can add
new ones; the standard ones ship as ordinary `core.tagged.*`
modules. See [Literal handlers](./literal-handlers) for the full
taxonomy.

### The four macro kinds

Verum provides four surface forms for macros — derive, attribute,
function-like, and declarative. They differ in where they appear
syntactically, what inputs they receive, and what output shape is
expected. The dedicated [Macro kinds](./macro-kinds) page covers
each in depth; the one-paragraph version:

- **Derive** — `@derive(P)` on a type; receives the type's AST;
  emits `implement` blocks.
- **Attribute** — `@name(args)` on any item; receives the item's
  AST; emits transformed / wrapped items.
- **Function-like** — `@name!(tokens)` in expression position;
  receives arbitrary tokens; emits an expression or block.
- **Declarative** — `macro vec3 { ... }` pattern-rule form;
  receives pattern-matched tokens; emits pattern-substituted
  tokens. Fastest to expand, most restricted in power.

## The fourteen compile-time contexts

Every meta function's capabilities are declared with `using [...]`
using the same syntax as runtime contexts. Fourteen compile-time
meta-contexts ship with the language:

| Context         | Primary role                                           |
|-----------------|--------------------------------------------------------|
| `TypeInfo`      | Type reflection — name, fields, variants, size, align  |
| `AstAccess`     | AST inspection and emission; token manipulation        |
| `CompileDiag`   | Errors, warnings, notes, help, structured diagnostics  |
| `Hygiene`       | `gensym`, call-site / def-site spans, mark management  |
| `BuildAssets`   | Project-scoped file reads (`load_text`, `load_bytes`)  |
| `MetaRuntime`   | Build config (target OS/arch, feature flags, limits)   |
| `MacroState`    | Cross-invocation caching, per-build state              |
| `SourceMap`     | Span manipulation, provenance tracking                 |
| `StageInfo`     | Current meta-stage, target stage, stage-crossing info  |
| `ProjectInfo`   | Manifest fields, workspace members, features enabled   |
| `CodeSearch`    | Find definitions / callers / uses by pattern          |
| `Schema`        | Structural validation of generated code                |
| `DepGraph`      | Dependency graph between items                         |
| `MetaBench`     | Micro-benchmark macro expansions                       |

Each is a typed protocol with documented methods. Use the minimum
set you need; the linter warns (`ML605 unused meta context`) about
contexts declared but never used. Full API surfaces at
**[stdlib → meta](/docs/stdlib/meta)**.

## Hygiene, in one sentence

Identifiers introduced inside a `quote { ... }` cannot accidentally
resolve to bindings in the caller's scope, and identifiers *spliced*
into a quote retain their original binding site. The full rule —
marks, syntax contexts, explicit capture escape hatches — lives on
the [Quote and hygiene](./quote-and-hygiene) page.

## Staging, in one paragraph

An ordinary `meta fn` is at stage 1; its body can contain
`quote { ... }` blocks that target stage 0 (the program proper).
When you need a meta function that produces another meta function —
for library-generating libraries, staged specialisation, or tactic
generation — reach for `meta(2)` with nested `quote(2) { ... }`.
Cross-stage references require `lift(value)` or `$(stage N){ expr }`.
Details: [Staging](./staging).

## The meta sandbox, in one paragraph

Every `meta fn` runs in a sandbox that rejects I/O, clock, random,
process spawning, and mutable globals. The only permitted
"external" operation is reading files inside the project via the
`BuildAssets` context. The sandbox guarantees that compilation is a
pure function of its inputs, which in turn makes proof-carrying
cogs, the incremental-compilation cache, and reproducible builds
all work. Details: [Compilation model → sandbox](./compilation-model#the-meta-sandbox).

## When to reach for what

| Problem                                              | Tool                                                |
|------------------------------------------------------|-----------------------------------------------------|
| Add `Clone` / `Debug` to a type                      | `@derive(...)`                                      |
| Generate getters / setters                           | custom derive (`@proc_macro_derive(Accessors)`) |
| Trace every call to a function                       | attribute macro (`@traced`)                         |
| Inline compile-time computation into a constant      | `@const(expr)` or a short `meta fn`                 |
| Introduce a typed SQL / regex / URI literal          | tagged literal handler                              |
| Introduce a unit-bearing numeric literal             | suffixed literal handler                            |
| Escape interpolated values automatically (SQL, HTML) | interpolation handler                               |
| Pattern-match syntax into simpler syntax             | declarative macro (`macro name { rule => ... }`)    |
| Build a DSL that needs type reflection               | function-like macro with `TypeInfo`                 |
| Generate code from an external schema file           | attribute macro with `BuildAssets` + `Schema`       |
| Ship a library that exports derivable protocols      | `@meta_macro(derive = "...")` + publish             |
| Produce a meta function from another meta function   | `meta(2) fn ... -> quote(2) { ... }`                |

## A complete small example

A `@derive(UrlLike)` that synthesises `to_url_query()` and
`from_url_query()` for a record type, mapping each field through
the `UrlEncode` protocol:

```verum
@proc_macro_derive(UrlLike)
pub meta fn derive_url_like<T>() -> TokenStream
    using [TypeInfo, AstAccess, Hygiene, CompileDiag]
{
    let name = TypeInfo.name_of<T>();
    let fields = TypeInfo.fields_of<T>();

    if fields.is_empty() {
        CompileDiag.emit_error(
            &f"@derive(UrlLike) requires at least one field on {name}",
            Span.current()
        );
        return TokenStream.empty();
    }

    let tmp = Hygiene.gensym("parts");

    quote {
        implement UrlLike for ${name} {
            fn to_url_query(&self) -> Text {
                let mut $tmp = List<Text>::new();
                $[for f in fields.iter() {
                    $tmp.push(&f"{${lift(f.name.to_text())}}={self.${f.name}.url_encode()}");
                }]
                $tmp.join(&"&")
            }

            fn from_url_query(q: &Text) -> Result<Self, UrlError> {
                let map = parse_url_query(q)?;
                Result.Ok(Self {
                    $[for f in fields.iter() {
                        ${f.name}: map.get(${lift(f.name.to_text())})
                            .ok_or(UrlError.missing(${lift(f.name.to_text())}))?
                            .url_decode()?,
                    }]
                })
            }
        }
    }
}
```

Usage:

```verum
@derive(UrlLike)
type SearchRequest is { q: Text, page: Int, per_page: Int };

let r = SearchRequest { q: "verum", page: 1, per_page: 20 };
let qs = r.to_url_query();           // "q=verum&page=1&per_page=20"
let back = SearchRequest.from_url_query(&qs)?;
```

Everything on this page — hygiene, `TypeInfo`, `CompileDiag`,
quote splicing, field iteration, escape-sensitive diagnostics —
is working in this single 30-line meta function.

## Observability

- `verum expand-macros [--filter "@name"] [--show-hygiene] [--stages]`
  prints the post-expansion source, optionally annotated.
- The LSP surfaces the same information inline, per-cursor.
- `CompileDiag` diagnostics participate in the standard error
  pipeline (`verum build`, LSP, CI).
- Every meta invocation's time and memory usage are visible with
  `verum build --timings` and fed into `MetaBench` if requested.

## Further reading

The rest of the metaprogramming section:

- **[Compilation model](./compilation-model)** — multi-pass
  architecture, sandbox, determinism guarantees, budgets.
- **[Macro kinds](./macro-kinds)** — the four surface forms, when
  to pick each, composition rules.
- **[Quote and hygiene](./quote-and-hygiene)** — `quote { ... }`,
  splice operators, mark-based hygiene, capture attributes.
- **[Staging](./staging)** — multi-stage quoting, `lift`, cross-
  stage references, `$$` escape.
- **[Token-stream API](./token-api)** — `TokenStream`, `Ident`,
  `Literal`, `FnAst`, `TypeAst`, `CompileDiag`, `Span`.
- **[Derives catalogue](./derives)** — the nine shipped derives
  with exact generated-code semantics.
- **[Literal handlers](./literal-handlers)** — tagged, suffixed,
  interpolation, context-adaptive literals.
- **[Error codes](./error-codes)** — every `M4xx`, `M5xx`,
  `ML6xx`, and `E4xxx` emitted by the meta subsystem.

And in related sections:

- **[Attributes](/docs/language/attributes)** — the user-facing
  attribute reference.
- **[Reference → meta functions](/docs/reference/meta-functions)**
  — the `@`-prefix built-ins (`@const`, `@cfg`, `@stringify`, …).
- **[Reference → attribute registry](/docs/reference/attribute-registry)**
  — every standard `@` with target and semantics.
- **[stdlib → meta](/docs/stdlib/meta)** — the API surface of every
  meta context.
- **[Cookbook → write a derive](/docs/cookbook/write-a-derive)** —
  task-oriented walkthrough.
- **[Proof DSL](/docs/language/proof-dsl)** — how the tactic system
  composes with meta.
