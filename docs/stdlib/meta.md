---
sidebar_position: 1
title: meta
---

# `core::meta` — Compile-time programming

`meta` provides the types and capabilities for writing `meta fn`s —
functions that run at compile time.

## Capabilities (context groups)

Meta functions are pure by default. To access build assets, emit
diagnostics, or introspect source, request a capability:

```verum
meta fn load_schema() -> quote using [meta.BuildAssets] {
    let sql = BuildAssets.load("schema.sql")?;
    quote { const SCHEMA: Text = ${lift(sql)}; }
}
```

Available capabilities:

| Capability | Purpose |
|------------|---------|
| `BuildAssets` | read build-time assets |
| `TypeInfo` | introspect types, fields, variants |
| `AstAccess` | parse / emit AST nodes |
| `CompileDiag` | emit errors / warnings |
| `MetaRuntime` | configure meta recursion / timeout limits |
| `MacroState` | cross-invocation caching |
| `StageInfo` | staged metaprogramming info |
| `CodeSearch` | query the codebase |
| `ProjectInfo` | read `Verum.toml` metadata |
| `SourceMap` | access source locations |
| `Schema` | validate generated code |
| `DepGraph` | dependency graph |
| `MetaBench` | compile-time benchmarking |

Context groups combine these: `MetaCore`, `MetaSafe`, `MetaFull`, etc.

## Tokens and AST

```verum
type Token;
type TokenKind is Ident | Literal | Punct | Group | ... ;
type TokenTree is Token | Group;
type TokenStream;

type Span;                   // source location
type SourceLocation is { file: Text, line: Int, column: Int };
```

## Reflection

```verum
@type_fields(T)     -> List<FieldInfo>
@variants_of(T)     -> List<VariantInfo>
@type_name(T)       -> Text
@implements(T, P)   -> Bool

type FieldInfo    is { name: Text, ty: TypeKind, attributes: List<Attribute> };
type VariantInfo  is { name: Text, payload: VariantPayload };
type ProtocolInfo is { name: Text, methods: List<FunctionInfo>, ... };
```

## `quote` / splice

```verum
let ast: TokenStream = quote { fn foo() -> Int { 42 } };
let name_tokens = quote { foo };
let call = quote { ${name_tokens}() };

// In a macro expansion:
quote {
    @derive(Debug)
    pub type ${struct_name} is {
        $[for f in fields { ${f.name}: ${f.ty}, }]
    }
}
```

## `lift`

```verum
meta fn inline_const(x: meta Int) -> quote {
    quote { const X: Int = ${lift(x)}; }
}
```

## Errors

```verum
type MetaError is
    | AssetNotFound(Text)
    | AssetReadError(Text)
    | SyntaxError(Text, Span)
    | ParseFailed
    | TypeError(Text, Span)
    | RecursionLimit
    | IterationLimit
    | MemoryLimit
    | Timeout
    | InvalidOperation(Text)
    | CacheError(Text)
    | MethodNotFound(Text)
    | Other(Text);

type MetaResult<T> = Result<T, MetaError>;
```

## Limits

```verum
const DEFAULT_RECURSION_LIMIT: Int = 256;
const DEFAULT_ITERATION_LIMIT: Int = 1_000_000;
const DEFAULT_MEMORY_LIMIT:    Int = 64 * 1024 * 1024;     // 64 MiB
const DEFAULT_TIMEOUT_MS:      Int = 30_000;               // 30 s
```

Override in `Verum.toml`:

```toml
[meta]
recursion_limit = 512
memory_limit_mb = 128
timeout_ms      = 60000
```

## See also

- **[Language → metaprogramming](/docs/language/metaprogramming)** —
  user-level guide.
- **[Language → attributes](/docs/language/attributes)** — `@derive`
  and friends.
