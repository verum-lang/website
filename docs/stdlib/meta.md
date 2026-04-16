---
sidebar_position: 1
title: meta
description: Compile-time programming — tokens, AST, reflection, quote, capability contexts.
---

# `core::meta` — Compile-time programming

The stdlib side of metaprogramming. Defines the **14 capability
contexts** a `meta fn` may request (declared via `using [...]`), the
`TokenStream` / `TokenTree` types, reflection data, the
`QuoteBuilder`, and the `Span` / `SourceLocation` / `SourceFile`
types. ~335 methods across all contexts.

| File | What's in it |
|---|---|
| `contexts.vr` (3 317 lines) | 14 compiler-provided meta contexts |
| `reflection.vr` | `TypeKind`, `FieldInfo`, `VariantInfo`, `GenericParam`, `ProtocolInfo`, `FunctionInfo`, `TraitBound`, `LifetimeParam`, `OwnershipInfo`, `MethodResolution`, `MethodSource` |
| `token.vr` | `TokenStream`, `Token`, `TokenTree`, `TokenKind`, `Delimiter`, `Spacing`, `LiteralKind`, `Keyword` |
| `span.vr` | `Span`, `SourceLocation`, `SourceFile`, `SpanRange` |
| `quote.vr` | `QuoteBuilder` |
| `attribute.vr` | `Attribute`, `AttributeArg` |
| `mod.vr` (460 lines) | re-exports, `MetaError` (11 variants), composite context groups |

User-level syntax (`meta fn`, `quote { … }`, `@derive(…)`, `lift(x)`)
is in **[Language → Metaprogramming](/docs/language/metaprogramming)**.
This page enumerates the types and contexts those constructs map to.

---

## Isomorphism with runtime contexts

Meta contexts follow the **same `using [...]` syntax** as runtime
contexts (see **[language → context system](/docs/language/context-system)**),
but execute at compile time with zero runtime cost:

| Aspect | Runtime | Meta |
|--------|---------|------|
| Syntax | `fn f() -> T using [Database]` | `meta fn f() -> T using [TypeInfo]` |
| Provider | explicit `provide C = v` | compiler-provided (implicit) |
| Overhead | ~2–30 ns (slot lookup) | 0 ns (compile time only) |
| Groups | `using WebRequest = [Database, Logger, ...]` | `using MetaCore = [TypeInfo, AstAccess, CompileDiag]` |
| Negative | `using [!IO]` | `using [!BuildAssets]` |
| Purity | need `pure fn` | implicit — every `meta fn` is pure |

---

## The 14 capability contexts

All defined in `core/meta/contexts.vr` and implemented by the
compiler in `crates/verum_compiler/src/meta/builtins/`.

### Tier model

| Tier | Access | Examples |
|------|--------|---------|
| **0** | Always available — no `using` needed | arithmetic, text ops, collections, `quote`/`unquote`, `stringify`, `concat_idents` |
| **1** | Requires `using [Context]` | all 14 contexts below |

The compiler enforces Tier 1 gating: calling a `TypeInfo` function
without `using [TypeInfo]` in the signature is a compile error.

### `BuildAssets` — read compile-time assets

```verum
context BuildAssets {
    fn load(path: Text) -> MetaResult<List<Byte>>;
    fn load_text(path: Text) -> MetaResult<Text>;
    fn exists(path: Text) -> Bool;
    fn list_dir(path: Text) -> MetaResult<List<Text>>;
    fn metadata(path: Text) -> MetaResult<AssetMetadata>;
    fn project_root() -> Text;
    fn asset_dirs() -> List<Text>;
}

type AssetMetadata is {
    size: UInt64,
    modified_ns: UInt64,
    is_directory: Bool,
    is_file: Bool,
    is_symlink: Bool,
};
```

### `TypeInfo` — type introspection

```verum
context TypeInfo {
    fn name_of<T>() -> Text;                   // fully-qualified
    fn simple_name_of<T>() -> Text;            // just the terminal segment
    fn module_of<T>() -> Text;
    fn kind_of<T>() -> TypeKind;
    fn fields_of<T>() -> List<FieldInfo>;
    fn variants_of<T>() -> List<VariantInfo>;
    fn generics_of<T>() -> List<GenericParam>;
    fn protocols_of<T>() -> List<ProtocolInfo>;
    fn implements<T, P>() -> Bool;

    @deprecated fn size_of<T>() -> Int;        // use T.size
    @deprecated fn align_of<T>() -> Int;       // use T.alignment
}
```

### `AstAccess` — parse and emit AST fragments

```verum
context AstAccess {
    fn parse_expr(source: Text) -> MetaResult<TokenStream>;
    fn parse_type(source: Text) -> MetaResult<TokenStream>;
    fn parse_item(source: Text) -> MetaResult<TokenStream>;
    fn parse_pattern(source: Text) -> MetaResult<TokenStream>;
    fn emit(tokens: TokenStream);              // insert into surrounding module
    fn splice_here(tokens: TokenStream);       // splice at the invocation site
}
```

### `CompileDiag` — emit diagnostics

```verum
context CompileDiag {
    fn emit_error(span: Span, message: Text);
    fn emit_warning(span: Span, message: Text);
    fn emit_note(span: Span, message: Text);
    fn abort() -> !;                           // stop compilation
}
```

### `MetaRuntime` — meta-execution limits

```verum
context MetaRuntime {
    fn recursion_limit() -> Int;
    fn iteration_limit() -> Int;
    fn memory_limit_bytes() -> Int;
    fn timeout_ms() -> Int;
    fn current_stage() -> Int;
    fn target_family() -> Text;                // "unix" | "windows" | "wasm"
    fn target_os() -> Text;                    // "linux" | "macos" | "windows" | ...
    fn target_arch() -> Text;                  // "x86_64" | "aarch64" | ...
    fn target_pointer_width() -> Int;
}
```

### `MacroState` — caching across invocations

```verum
context MacroState {
    fn cache_get(key: Text) -> Maybe<TokenStream>;
    fn cache_put(key: Text, value: TokenStream);
    fn record_dependency(path: Text);          // trigger re-expansion on change
}
```

### `StageInfo` — staged metaprogramming

```verum
context StageInfo {
    fn current_stage() -> Int;
    fn target_stage() -> Int;
    fn can_lower_to(stage: Int) -> Bool;
}
```

### `Hygiene` — hygienic identifier generation

```verum
context Hygiene {
    fn gensym(base: Text) -> Ident;        // unique ident per invocation
    fn call_site() -> Span;                // caller's source location
    fn def_site() -> Span;                 // macro definition's location
    fn mixed_site() -> Span;               // Rust-style mixed resolution
    fn is_inside_quote() -> Bool;
    fn current_expansion_id() -> UInt64;
}
```

The gensym'd identifiers are guaranteed not to collide with user
code or other macro expansions. See
**[metaprogramming → hygiene](/docs/language/metaprogramming#hygiene)**.

### Analysis & productivity contexts

All of these are fully implemented in
`crates/verum_compiler/src/meta/builtins/` (~1 000 lines each).

```verum
context CodeSearch {        // search the whole codebase
    fn find_items(name: Text) -> List<Path>;
    fn find_implementations(protocol: Path) -> List<Path>;
    fn find_callers(function: Path) -> List<Path>;
}

context ProjectInfo {       // manifest metadata
    fn cog_name() -> Text;
    fn cog_version() -> Text;
    fn features_enabled() -> List<Text>;
    fn dependencies() -> List<DependencyInfo>;
}

context SourceMap {         // map span ↔ source
    fn source_of(span: Span) -> &SourceFile;
    fn source_between(from: Span, to: Span) -> Text;
}

context Schema {            // validate generated code
    fn validate(tokens: &TokenStream, schema: Text) -> MetaResult<()>;
}

context DepGraph {          // inspect cog dependency graph
    fn direct_deps() -> List<Text>;
    fn transitive_deps() -> List<Text>;
}

context MetaBench {         // micro-benchmark macro expansions
    fn measure(name: Text, thunk: fn() -> TokenStream) -> BenchReport;
}
```

---

## Composite context groups

Predefined unions from `core/meta/mod.vr`. Using a group is identical
to listing its members individually.

| Group | Expands to |
|---|---|
| `MetaCore` | `TypeInfo, AstAccess, CompileDiag` |
| `MetaSafe` | `TypeInfo, AstAccess, CompileDiag` |
| `MetaFull` | every standard context |
| `MetaDerive` | `TypeInfo, AstAccess, CompileDiag, MacroState` |
| `MetaAttr` | `BuildAssets, TypeInfo, AstAccess, CompileDiag, MacroState` |
| `MetaNoIO` | `TypeInfo, AstAccess, CompileDiag, MetaRuntime, MacroState, StageInfo` |
| `MetaStaged` | `StageInfo, TypeInfo, AstAccess, CompileDiag, MacroState` |
| `MetaAnalysis` | `CodeSearch, TypeInfo, AstAccess, CompileDiag` |
| `MetaProject` | `ProjectInfo, TypeInfo, AstAccess, CompileDiag` |
| `MetaSourced` | `SourceMap, TypeInfo, AstAccess, CompileDiag` |
| `MetaValidated` | `Schema, TypeInfo, AstAccess, CompileDiag` |
| `MetaDeps` | `DepGraph, ProjectInfo, CompileDiag` |
| `MetaProfiled` | `MetaBench, TypeInfo, AstAccess, CompileDiag` |
| `MetaTooling` | all analysis and productivity contexts |

`MetaCore` is the typical minimum for derives: type reflection, AST
parsing, and diagnostic output. `MetaFull` is for unrestricted meta
fns that may touch any part of the build environment.

---

## `TokenStream` and friends

```verum
@compiler_type
type TokenStream is {
    tokens: List<TokenTree>,
    span: Span,
};

TokenStream::empty()
TokenStream::from_token(t)
TokenStream::from_tree(tree)
TokenStream::from_trees(&trees)
TokenStream::from_str(&source) -> Result<TokenStream, LexError>
TokenStream::ident(&name) -> TokenStream

ts.append(&other)           ts.prepend(&other)
ts.concat(&others)          ts.iter() -> Iterator<&TokenTree>
ts.is_empty() / ts.len() / ts.get(i) / ts.drain(range)
ts.as_bytes() -> &[Byte]
```

```verum
type Token is { kind: TokenKind, span: Span };

type TokenTree is Leaf(Token) | Group(Delimiter, TokenStream);

type TokenKind is
    | Literal(LiteralKind)
    | Ident(Text)
    | Keyword(Keyword)
    | Punct(Char, Spacing)
    | Whitespace
    | LineComment
    | BlockComment
    | Error(Text);

type Delimiter is Paren | Brace | Bracket;
type Spacing   is Joint | Alone;
```

---

## Reflection data

### `TypeKind`

```verum
@repr(UInt8)
type TypeKind is
    | Struct | Enum | Newtype | Unit | Protocol | Tuple
    | Array | Slice | Reference | Pointer | Function
    | TypeParam | Associated | Primitive | Never | Infer | Unknown;

k.is_compound() -> Bool       k.is_reference() -> Bool       k.is_primitive() -> Bool
k.name() -> Text
```

### `FieldInfo`

```verum
type FieldInfo is {
    name: Text,
    index: Int,
    type_name: Text,
    type_kind: TypeKind,
    visibility: Visibility,
    is_mutable: Bool,
    attributes: List<Attribute>,
    doc: Maybe<Text>,
    span: Span,
};

f.has_attribute(&name) -> Bool      f.get_attribute(&name) -> Maybe<&Attribute>
f.is_public() / is_private() -> Bool
f.is_tuple_field() -> Bool
f.accessor() -> Text               // ".0", ".name", etc.
```

### `VariantInfo`

```verum
type VariantInfo is {
    name: Text,
    index: Int,
    payload: VariantPayload,
    discriminant: Maybe<Int>,
    attributes: List<Attribute>,
    doc: Maybe<Text>,
};
type VariantPayload is
    | Unit
    | Tuple(List<FieldInfo>)
    | Record(List<FieldInfo>);
```

### `GenericParam`

```verum
type GenericParam is {
    name: Text,
    kind: GenericKind,
    bounds: List<TraitBound>,
    default: Maybe<Text>,
};
type GenericKind is TypeParam | ConstParam | LifetimeParam | ContextParam | UniverseParam;
```

### `ProtocolInfo`

```verum
type ProtocolInfo is {
    name: Text,
    module: Text,
    methods: List<FunctionInfo>,
    associated_types: List<Text>,
    supertraits: List<Text>,
};
```

### `FunctionInfo`

```verum
type FunctionInfo is {
    name: Text,
    generics: List<GenericParam>,
    parameters: List<FieldInfo>,       // field-shaped (name + type)
    return_type: Text,
    contexts: List<Text>,              // using [...]
    throws: List<Text>,
    attributes: List<Attribute>,
    doc: Maybe<Text>,
    is_async: Bool,
    is_pure: Bool,
    is_unsafe: Bool,
};
```

### `TraitBound`, `LifetimeParam`, `OwnershipInfo`, `MethodResolution`, `MethodSource`

Further reflection data for advanced macros.

### `Visibility`

```verum
type Visibility is Public | Internal | Protected | Private;
```

---

## `QuoteBuilder`

The surface syntax `quote { … }` desugars to a sequence of builder
calls. You can build quotes imperatively too:

```verum
QuoteBuilder::new() -> Self
QuoteBuilder::with_span(span: Span) -> Self

b.ident(&name)               b.keyword(&kw)
b.punct_joint(c)             b.punct(c)
b.operator(&op)              // ->, =>, ::, |>
b.int_lit(n)                 b.float_lit(f)
b.text_lit(&t)               b.char_lit(c)               b.byte_lit(b)

b.brace_open() / b.brace_close()
b.paren_open() / b.paren_close()
b.bracket_open() / b.bracket_close()

b.group(Delimiter.Brace, inner_stream)
b.interpolate(ts: TokenStream)
b.lift<T: ToTokens>(value: T)

b.build() -> TokenStream
```

---

## `Span` and source metadata

```verum
type Span is { /* compiler-internal */ };

Span::call_site() -> Span
Span::def_site() -> Span
Span::mixed_site() -> Span

sp.line() -> UInt32
sp.column() -> UInt32
sp.source_file() -> Maybe<&SourceFile>
sp.start_byte() / sp.end_byte() -> Int
sp.join(&other) -> Span
sp.located_within(&parent) -> Bool

type SourceLocation is { file: Text, line: UInt32, column: UInt32 };
type SourceFile is { path: Text, source: Text, lines: List<Text> };
type SpanRange is { start: Span, end: Span };
```

---

## Attributes

```verum
type Attribute is {
    name: Text,
    args: List<AttributeArg>,
    span: Span,
};
type AttributeArg is
    | Literal(LiteralValue)
    | Ident(Text)
    | KeyValue(Text, Heap<AttributeArg>)
    | List(List<AttributeArg>);

attr.get(&key) -> Maybe<&AttributeArg>
attr.is_present(&key) -> Bool
```

---

## `MetaError` and `MetaResult`

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

### Defaults (override in `Verum.toml [meta]`)

```verum
const DEFAULT_RECURSION_LIMIT: Int = 256;
const DEFAULT_ITERATION_LIMIT: Int = 1_000_000;
const DEFAULT_MEMORY_LIMIT:    Int = 64 * 1024 * 1024;   // 64 MiB
const DEFAULT_TIMEOUT_MS:      Int = 30_000;              // 30 s
```

---

## End-to-end: writing `@derive(Debug)`

```verum
@meta_macro
meta fn derive_debug<T>() -> TokenStream using [TypeInfo, AstAccess, CompileDiag] {
    let name = TypeInfo.name_of::<T>();
    let fields = TypeInfo.fields_of::<T>();
    quote {
        implement Debug for ${name} {
            fn fmt_debug(&self, f: &mut Formatter) -> FmtResult {
                f.debug_struct(${lift(name)})
                    $[for field in fields {
                        .field(${lift(field.name)}, &self.${field.name})
                    }]
                    .finish()
            }
        }
    }
}
```

---

## See also

- **[Language → metaprogramming](/docs/language/metaprogramming)** — user surface.
- **[Language → attributes](/docs/language/attributes)** — the `@` forms this module supports.
- **[proof](/docs/stdlib/proof)** — proof reflection consumes `TypeInfo` / `FunctionInfo`.
