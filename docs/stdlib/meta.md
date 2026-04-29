---
sidebar_position: 1
title: meta
description: Compile-time programming — tokens, AST, reflection, quote, capability contexts.
---

# `core.meta` — Compile-time programming

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
is in **[Language → Metaprogramming](/docs/language/meta/overview)**.
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

All fourteen meta-contexts below are shipped with the standard
library and provided to user code by the compiler.

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

### `TypeInfo` — type introspection (36 methods)

The largest context — full compile-time reflection over the type
registry.

```verum
context TypeInfo {
    // Identity
    fn name_of<T>() -> Text;                          // fully-qualified name
    fn simple_name_of<T>() -> Text;                   // terminal segment only
    fn module_of<T>() -> Text;
    fn kind_of<T>() -> TypeKind;
    fn type_id<T>() -> UInt64;

    // Structure
    fn fields_of<T>() -> List<FieldInfo>;
    fn variants_of<T>() -> List<VariantInfo>;
    fn generics_of<T>() -> List<GenericParam>;
    fn bounds_of<T>() -> List<TraitBound>;
    fn lifetime_params_of<T>() -> List<LifetimeParam>;
    fn where_clause_of<T>() -> List<TraitBound>;

    // Protocols
    fn protocols_of<T>() -> List<ProtocolInfo>;
    fn implements<T, P>() -> Bool;
    fn associated_types_of<T, P>() -> List<(Text, TypeKind)>;

    // Methods
    fn functions_of<T>() -> List<FunctionInfo>;
    fn method_of<T>(name: Text) -> Maybe<MethodResolution>;
    fn static_functions_of<T>() -> List<FunctionInfo>;
    fn instance_methods_of<T>() -> List<FunctionInfo>;

    // Attributes & docs
    fn attributes_of<T>() -> List<Attribute>;
    fn has_attribute<T>(name: Text) -> Bool;
    fn get_attribute<T>(name: Text) -> Maybe<Attribute>;
    fn doc_of<T>() -> Maybe<Text>;

    // Marker protocol checks
    fn is_copy<T>() -> Bool;
    fn is_send<T>() -> Bool;
    fn is_sync<T>() -> Bool;
    fn is_sized<T>() -> Bool;
    fn needs_drop<T>() -> Bool;
    fn ownership_of<T>() -> OwnershipInfo;

    // Memory layout
    fn field_offset<T>(field_name: Text) -> Maybe<FieldOffset>;
    fn memory_layout_of<T>() -> List<FieldOffset>;
    fn stride_of<T>() -> Int;
    @deprecated fn size_of<T>() -> Int;                // use T.size
    @deprecated fn align_of<T>() -> Int;               // use T.alignment

    // Composition / inner types
    fn super_types_of<T>() -> List<Text>;
    fn inner_type_of<T>() -> Maybe<Text>;              // newtype inner
    fn element_type_of<T>() -> Maybe<Text>;            // List<T> → T
    fn key_value_types_of<T>() -> Maybe<(Text, Text)>; // Map<K,V> → (K,V)
}
```

### `AstAccess` — parse, visit, and emit AST fragments (18 methods)

```verum
context AstAccess {
    // Parse source text / token streams into typed AST nodes
    fn parse_expr(tokens: TokenStream) -> MetaResult<Expr>;
    fn parse_type(tokens: TokenStream) -> MetaResult<Type>;
    fn parse_item(tokens: TokenStream) -> MetaResult<Item>;
    fn parse_pattern(tokens: TokenStream) -> MetaResult<Pattern>;
    fn parse_statement(tokens: TokenStream) -> MetaResult<Statement>;
    fn parse_block(tokens: TokenStream) -> MetaResult<Block>;

    // Emit / splice code at the invocation site
    fn emit<T: ToTokens>(node: T) -> TokenStream;
    fn validate(tokens: TokenStream) -> MetaResult<()>;

    // Span constructors
    fn call_site() -> Span;
    fn def_site() -> Span;
    fn mixed_site() -> Span;

    // Macro input access
    fn input() -> TokenStream;
    fn attr_args() -> Maybe<TokenStream>;

    // Visitor combinators — walk and transform AST nodes
    fn visit_expr(expr: Expr, visitor: fn(Expr) -> Expr) -> Expr;
    fn visit_type(ty: Type, visitor: fn(Type) -> Type) -> Type;
    fn visit_pattern(pat: Pattern, visitor: fn(Pattern) -> Pattern) -> Pattern;
    fn visit_statement(stmt: Statement, visitor: fn(Statement) -> Statement) -> Statement;
    fn visit_item(item: Item, visitor: fn(Item) -> Item) -> Item;
    fn visit_all_exprs(item: Item, visitor: fn(Expr) -> Expr) -> Item;
}
```

### `CompileDiag` — emit diagnostics (10 methods)

```verum
context CompileDiag {
    fn emit_error(message: Text, span: Span);
    fn emit_warning(message: Text, span: Span);
    fn emit_note(message: Text, span: Span);
    fn emit_help(message: Text, span: Span);
    fn emit_error_with_code(code: Text, message: Text, span: Span);
    fn emit_warning_with_code(code: Text, message: Text, span: Span);
    fn diagnostic() -> DiagnosticBuilder;      // fluent builder
    fn has_errors() -> Bool;
    fn error_count() -> Int;
    fn warning_count() -> Int;
}
```

### `MetaRuntime` — build config and execution limits (18 methods)

```verum
context MetaRuntime {
    // Crate identity
    fn crate_name() -> Text;
    fn module_path() -> Text;
    fn crate_version() -> (Int, Int, Int);
    fn runtime_config() -> Text;               // "full" | "embedded" | ...
    fn compiler_version() -> (Int, Int, Int);

    // Execution limits (from verum.toml [meta])
    fn recursion_limit() -> Int;
    fn iteration_limit() -> Int;
    fn memory_limit() -> Int;
    fn timeout_ms() -> Int;

    // Build configuration
    fn config_get(key: Text) -> Maybe<Text>;
    fn config_get_int(key: Text) -> Maybe<Int>;
    fn config_get_bool(key: Text) -> Maybe<Bool>;
    fn config_get_array(key: Text) -> Maybe<List<Text>>;
    fn env(key: Text) -> Maybe<Text>;          // reads env vars at compile time
    fn is_ci() -> Bool;
}
```

### `MacroState` — cross-invocation caching (16 methods)

Persists state between invocations of the same macro within a build.
Essential for derive macros that need deduplication.

```verum
context MacroState {
    // Key-value cache
    fn cache_get<T>(key: Text) -> Maybe<T>;
    fn cache_set<T>(key: Text, value: T);
    fn cache_has(key: Text) -> Bool;
    fn cache_remove(key: Text);
    fn cache_clear();
    fn cache_keys() -> List<Text>;
    fn cache_stats() -> CacheStats;

    // Memoization helpers
    fn memo<T>(key: Text, compute: fn() -> T) -> T;
    fn memo_typed<K, V>(suffix: Text, compute: fn() -> V) -> V;

    // Invocation tracking
    fn invocation_count() -> Int;
    fn invocation_id() -> UInt64;
    fn current_macro_name() -> Text;
    fn call_depth() -> Int;

    // Dependency tracking (trigger re-expansion on change)
    fn depend_on_file(path: Text);
    fn depend_on_type<T>();
    fn depend_on_env(var: Text);
}
```

### `StageInfo` — N-level staged metaprogramming (15 methods)

Information about the current stage level in multi-stage `meta(N)`
code. See **[language → metaprogramming → multi-stage](/docs/language/meta/staging)**.

```verum
context StageInfo {
    fn current_stage() -> UInt32;
    fn max_stage() -> UInt32;
    fn is_runtime() -> Bool;                   // stage 0
    fn is_compile_time() -> Bool;              // stage >= 1
    fn is_max_stage() -> Bool;
    fn is_valid_stage(level: UInt32) -> Bool;
    fn is_valid_transition(from: UInt32, to: UInt32) -> Bool;
    fn quote_target_stage() -> UInt32;
    fn quote_depth() -> UInt32;
    fn stage_unique_ident(base: Text) -> Text;

    // Inspect which functions live at which stage
    fn function_stage(function_path: Text) -> Maybe<UInt32>;
    fn functions_at_stage(level: UInt32) -> List<Text>;
    fn is_staged_enabled() -> Bool;
    fn stage_config(key: Text) -> Maybe<Text>;
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
**[metaprogramming → hygiene](/docs/language/meta/quote-and-hygiene)**.

### `CodeSearch` — search the whole codebase (17 methods)

Implemented in `builtins/code_search.rs` (~1 000 lines). Queries the
type registry, usage indices, and module registry at compile time.

```verum
context CodeSearch {
    // Function search
    fn find_functions_with_attr(attr_name: Text) -> List<FunctionSearchResult>;
    fn find_functions_by_pattern(pattern: Text) -> List<FunctionSearchResult>;
    fn find_functions_in_module(module_path: Text) -> List<FunctionSearchResult>;
    fn find_functions_by_return_type(type_name: Text) -> List<FunctionSearchResult>;

    // Type search
    fn find_types_implementing(protocol_name: Text) -> List<TypeSearchResult>;
    fn find_types_with_attr(attr_name: Text) -> List<TypeSearchResult>;
    fn find_types_by_pattern(pattern: Text) -> List<TypeSearchResult>;
    fn find_types_in_module(module_path: Text) -> List<TypeSearchResult>;

    // Usage search
    fn find_function_usages(function_path: Text) -> List<UsageInfo>;
    fn find_type_usages(type_path: Text) -> List<UsageInfo>;
    fn find_const_usages(const_path: Text) -> List<UsageInfo>;
    fn find_pattern(pattern: Text) -> List<PatternMatch>;
    fn find_string_literal(text: Text) -> List<UsageInfo>;

    // Module queries
    fn all_modules() -> List<Text>;
    fn module_public_items(module_path: Text) -> List<ItemInfo>;
    fn module_dependencies(module_path: Text) -> List<Text>;
    fn module_dependents(module_path: Text) -> List<Text>;
}
```

### `ProjectInfo` — manifest metadata (26 methods)

```verum
context ProjectInfo {
    // Package identity
    fn package_name() -> Text;
    fn package_version() -> Text;
    fn package_authors() -> List<Text>;
    fn package_description() -> Maybe<Text>;
    fn package_license() -> Maybe<Text>;
    fn package_repository() -> Maybe<Text>;

    // Dependencies
    fn dependencies() -> List<DependencyInfo>;
    fn dev_dependencies() -> List<DependencyInfo>;
    fn has_dependency(name: Text) -> Bool;
    fn dependency_version(name: Text) -> Maybe<Text>;

    // Features
    fn enabled_features() -> List<Text>;
    fn is_feature_enabled(feature: Text) -> Bool;
    fn default_features() -> List<Text>;

    // Target
    fn target_triple() -> Text;
    fn target_os() -> Text;
    fn target_arch() -> Text;
    fn target_pointer_width() -> Int;
    fn target_endian() -> Text;
    fn target_has_feature(feature: Text) -> Bool;

    // Build mode
    fn is_debug() -> Bool;
    fn is_release() -> Bool;
    fn opt_level() -> UInt32;

    // Paths
    fn project_root() -> Text;
    fn source_dir() -> Text;
    fn output_dir() -> Text;
    fn manifest_path() -> Text;
}
```

### `SourceMap` — track generated-code provenance (10 methods)

```verum
context SourceMap {
    fn enter_generated(name: Text);
    fn exit_generated();
    fn current_scope() -> Maybe<Text>;
    fn scope_path() -> Text;
    fn map_span_to_generator(generated_span: Span);
    fn map_span_to_source(generated_span: Span, source_span: Span);
    fn get_source_span(generated_span: Span) -> Maybe<Span>;
    fn synthetic_span(message: Text) -> Span;
    fn add_line_directive(source_file: Text, source_line: UInt32);
    fn get_mappings() -> List<SpanMapping>;
}
```

Error messages from generated code trace back through the source map
to point at the macro invocation rather than the emitted tokens.

### `Schema` — validate generated code (11 methods)

Implemented in `builtins/schema.rs` (~1 000 lines). Structural
constraint checking for generated token streams.

```verum
context Schema {
    fn function_schema() -> FunctionSchemaBuilder;
    fn type_schema() -> TypeSchemaBuilder;
    fn expr_schema() -> ExprSchemaBuilder;
    fn module_schema() -> ModuleSchemaBuilder;
    fn validate(code: TokenStream, schema: CodeSchema)
        -> Result<(), List<SchemaError>>;
    fn validate_and_fix(code: TokenStream, schema: CodeSchema)
        -> Result<TokenStream, List<SchemaError>>;
    fn is_function(code: TokenStream) -> Bool;
    fn is_type(code: TokenStream) -> Bool;
    fn is_expression(code: TokenStream) -> Bool;
    fn is_statement(code: TokenStream) -> Bool;
    fn is_item(code: TokenStream) -> Bool;
}
```

### `DepGraph` — module dependency graph (12 methods)

Implemented in `builtins/dep_graph.rs` (~1 000 lines).

```verum
context DepGraph {
    fn dependencies_of(mod_name: Text) -> List<Text>;
    fn transitive_dependencies(mod_name: Text) -> List<Text>;
    fn dependents_of(mod_name: Text) -> List<Text>;
    fn transitive_dependents(mod_name: Text) -> List<Text>;
    fn find_cycles() -> List<List<Text>>;
    fn in_cycle_with(module_a: Text, module_b: Text) -> Bool;
    fn topological_order() -> List<Text>;
    fn compilation_order() -> List<Text>;
    fn depth(mod_name: Text) -> UInt32;
    fn strongly_connected_components() -> List<List<Text>>;
    fn leaf_modules() -> List<Text>;
    fn root_modules() -> List<Text>;
}
```

### `MetaBench` — micro-benchmark macro expansions (11 methods)

```verum
context MetaBench {
    fn start(name: Text) -> BenchTimer;
    fn now_ns() -> UInt64;
    fn report(name: Text, duration_ns: UInt64);
    fn report_with_context(name: Text, duration_ns: UInt64, context: Text);
    fn memory_usage() -> UInt64;
    fn peak_memory() -> UInt64;
    fn report_memory(name: Text, bytes: UInt64);
    fn count(name: Text);
    fn count_by(name: Text, amount: UInt64);
    fn get_count(name: Text) -> UInt64;
    fn all_results() -> List<BenchResult>;
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

## Tier 0 — always-available builtins

These functions need no `using` declaration. Implemented in
`builtins/arithmetic.rs`, `builtins/collections.rs`, and
`builtins/code_gen.rs`.

### Arithmetic (13 functions)

```verum
abs(x: Numeric) -> Numeric
min(a: T, b: T) -> T
max(a: T, b: T) -> T
clamp(x: T, lo: T, hi: T) -> T
pow(base: T, exp: Int) -> T
int_to_text(x: Int) -> Text
text_to_int(s: Text) -> Int
bitwise_and(a: Int, b: Int) -> Int
bitwise_or(a: Int, b: Int) -> Int
bitwise_xor(a: Int, b: Int) -> Int
bitwise_not(x: Int) -> Int
shift_left(x: Int, n: Int) -> Int
shift_right(x: Int, n: Int) -> Int
```

### Collections (36+ functions)

**Lists**: `list_len`, `list_push`, `list_get`, `list_map`,
`list_filter`, `list_fold`, `list_concat`, `list_reverse`,
`list_first`, `list_last`.

**Maps**: `map_new`, `map_len`, `map_get`, `map_insert`, `map_remove`,
`map_contains`, `map_keys`, `map_values`, `map_entries`.

**Sets**: `set_new`, `set_len`, `set_insert`, `set_remove`,
`set_contains`, `set_to_list`, `set_union`, `set_intersection`,
`set_difference`.

**Maybe**: `maybe_unwrap`, `maybe_unwrap_or`, `maybe_is_some`,
`maybe_is_none`.

**Text**: `text_concat`, `text_len`, `text_split`, `text_join`,
`text_to_upper`, `text_to_lower`, `text_trim`, `text_replace`,
`text_starts_with`, `text_ends_with`, `text_contains`, `text_eq`,
`text_substring`, `text_index_of`, `text_char_at`, `text_repeat`,
`text_is_empty`, `text_lines`.

### Code generation (7 Tier-0 functions)

```verum
quote(expr) -> Ast                             // construct an AST fragment
unquote(ast) -> Expr                           // unwrap an AST fragment
stringify(value) -> Text                       // any value → source representation
concat_idents(parts: ...Text) -> Text          // join identifiers
format_ident(fmt: Text, args: ...) -> Text     // format an identifier
gensym(prefix: Text) -> Text                   // (Tier 0 variant — for Tier 1 see Hygiene)
ident(text: Text) -> Ident                     // text → Ident token
```

---

## `TokenStream` and friends

```verum
@compiler_type
type TokenStream is {
    tokens: List<TokenTree>,
    span: Span,
};

TokenStream.empty()
TokenStream.from_token(t)
TokenStream.from_tree(tree)
TokenStream.from_trees(&trees)
TokenStream.from_str(&source) -> Result<TokenStream, LexError>
TokenStream.ident(&name) -> TokenStream

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
QuoteBuilder.new() -> Self
QuoteBuilder.with_span(span: Span) -> Self

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

Span.call_site() -> Span
Span.def_site() -> Span
Span.mixed_site() -> Span

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

### Defaults (override in `verum.toml [meta]`)

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
    let name = TypeInfo.name_of<T>();
    let fields = TypeInfo.fields_of<T>();
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

## Tactic metaprogramming algebra — `tactic.vr`

A small, well-typed term algebra for **modeling** tactic combinators
as Verum data. Distinct from the AST-quasi-quotation surface above:
that one operates on actual compiler AST nodes; `tactic.vr` is the
abstract calculus over an opaque `MetaTerm` — useful for *modeling*
tactic combinators, *reasoning about* meta-language reductions, and
serving as the user-facing surface for the tactic-meta analysis core
in `verum_types.tactic_meta`.

### Term shape

```verum
public type MetaTerm is
    | Quote   { payload: Text }                    // ⌜e⌝
    | Splice  { inner: Heap<MetaTerm> }            // ▸M
    | Reflect { goal_name: Text }                  // reflect(g)
    | Custom  { name: Text, arg: Heap<MetaTerm> }  // F(arg)
    | Seq     { first: Heap<MetaTerm>, second: Heap<MetaTerm> }
    | Const   { payload: Text };
```

### Reduction rules

```text
splice(quote(e))      ↦ quote(e)            (β-cancellation)
custom(F, arg)        ↦ F(arg)              (analyzer-side, when F registered)
reflect(g)            ↦ cached(g)           (analyzer-side, when cached)
seq(M₁, M₂)           ↦ M₂                  (after M₁ reaches a value)
```

### Surface

```verum
public fn meta_quote(payload: Text) -> MetaTerm;
public fn meta_splice(inner: MetaTerm) -> MetaTerm;
public fn meta_reflect(goal_name: Text) -> MetaTerm;
public fn meta_custom(name: Text, arg: MetaTerm) -> MetaTerm;
public fn meta_seq(first: MetaTerm, second: MetaTerm) -> MetaTerm;
public fn meta_const(payload: Text) -> MetaTerm;

public fn is_meta_value(t: MetaTerm) -> Bool;
public fn references_elaborator(t: MetaTerm, name: Text) -> Bool;

// One-step β-cancellation at the outermost position.
public fn beta_cancel(t: MetaTerm) -> MetaTerm;

// Recursive bottom-up normaliser: applies β-cancel and
// seq-elimination at every position. Idempotent.
public fn meta_normalise(t: MetaTerm) -> MetaTerm;

// True iff `t` admits no further reduction inside this surface
// module. (External Custom-elaborator dispatch and Reflect
// caching may still alter the term in the analyzer core.)
public fn meta_is_normal(t: MetaTerm) -> Bool;
```

The Custom-elaborator and Reflect rewrites depend on external state
(elaborator registry, goal cache) held by the analyzer core; they
remain analyzer-side. The library half — β-cancel and seq-elim —
runs purely on the `MetaTerm` data and is the building block for
tactic-combinator equivalence proofs.

---

## See also

- **[Language → metaprogramming](/docs/language/meta/overview)** — user surface.
- **[Language → attributes](/docs/language/attributes)** — the `@` forms this module supports.
- **[proof](/docs/stdlib/proof)** — proof reflection consumes `TypeInfo` / `FunctionInfo`.
- **[reference → tactics](/docs/reference/tactics)** — names of the registered tactics that `Custom` resolves to.
