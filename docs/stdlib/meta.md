---
sidebar_position: 1
title: meta
description: Compile-time programming — tokens, AST, reflection, quote, capability contexts.
status: partial
status_detail: 2026-07-06 meta wave (commits bfca381db + fe1d0b4ba) — full test hierarchy for all 11 submodules; `verum test --interp --filter meta/` = 711 passed / 0 failed / 37 pinned (748 total; baseline was 476/35). Six language-level defect classes CLOSED (catalogue §46-§51: cross-module simple-name type-registry collision, bare `type X is Y;` alias mis-classification, refined-field float-compare loss, no-typechecker interp harness, dotted-wanted-key squatting, `for x in &rec.field` zero-iteration) + REFL-LIST-CONTAINS-TEXT SSO fix. Open pins: META-INTRINSIC-NILSTUB-1 (runtime Span/from_str intrinsic surface → nil; dominates quote runtime coverage), REFL-CLOSURE-XREC-1, COLLECT-FROMITER-2, AttributeArg legacy collision + AOT Maybe-accessor divergences, GENERIC-CTOR-FRESHNESS-1 (catalogue §52). AOT (final sweep, 2dad8c593): 627 passed / 93 failed / 37 ignored — from 360/151 pre-fix; REFFIELD-AOT-DEREF-1 closed the &field-return crash class (all Group canaries green under AOT); residue = 77 native-crash (dominated by TEXT-AOT-CHARS-PUSH-1: chars() zero-iteration, Text.push empty, to_lowercase crash — standalone repros pinned) + 16 mod/integration timeouts; tracked in META-AOT-PARITY-1.
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

## Module status

Each `core.meta.*` module carries an explicit conformance status — same
contract as [`core.base`](./base.md#module-status),
[`core.time`](./time.md#module-status), and
[`core.context`](./context.md#module-status). The status row is the
truth-table over the module's public API exercised by
`core-tests/meta/<module>/` under both Tier 0 (interpreter) and Tier 2
(AOT). Disagreement between tiers is itself a test failure.

| Status | Meaning |
|---|---|
| **complete** | Every public method conformance-tested under interp + AOT; algebraic laws pinned. |
| **partial** | Subset stable; remainder gated by upstream defects, documented per-module. |
| **regression-only** | Tests gate on language-level defects (cross-module record-return field-access OOB, AOT-pipeline blockers, etc). |
| **undocumented** | Snapshot from source; no runtime conformance pin yet. |

(Keywords follow the site-wide [status convention](./status-convention.md);
this table previously used a non-canonical "stable" spelling for the top
tier — fixed 2026-07-06.)

| Module | Status | Conformance suite |
|---|---|---|
| `span.vr`              | **partial** | [core-tests/meta/span](https://github.com/verum-lang/verum/tree/main/core-tests/meta/span) — 67 tests GREEN under `--interp` (25 unit + 25 property + 12 integration + 5 regression). MetaSpan Eq laws (eq by `(id, hygiene)`, flags-exclusion pinned) + SpanFlags 2³ exhaustive + SourceLocation Eq (offset-exclusion pinned) + SpanRange/MultiSpan. **§3.1 cross-module fn-return OOB CLOSED 2026-07-06** — the 5 regressions un-ignored and green. **META-SPAN-ALIAS-1 CLOSED** (catalogue §47): bare `type Span is MetaSpan;` now classifies as an alias at the parse funnel. Runtime `@compiler_intrinsic` ctors remain nil-stubs (META-INTRINSIC-NILSTUB-1, open). |
| `token.vr`             | **partial** | [core-tests/meta/token](https://github.com/verum-lang/verum/tree/main/core-tests/meta/token) — 115 tests GREEN under `--interp` (86 unit + 25 property + 4 regression). Delimiter open/close pair laws, Literal ctor→variant matrix, Token ctor/predicate coherence, TokenKind 6-variant partition. **META-GROUP-XMODULE-1 CLOSED** (catalogue §46): `Group` record construction no longer collides with `math.algebra.Group`/`cli.spec.Group`; regression canaries pinned. **DELIM-FANOUT-SQUAT-1 CLOSED** (catalogue §50): `Delimiter.open/close` no longer devirtualize to unrelated bare `open`/`close` FFI fns. |
| `reflection.vr`        | **partial** | [core-tests/meta/reflection](https://github.com/verum-lang/verum/tree/main/core-tests/meta/reflection) — 123/129 GREEN under `--interp` (84 unit + 29 property + 10 integration), 6 `@ignore` pins. TypeKind 17-variant classifier partition + PrimitiveType 18-variant coherence matrix + VariantInfo/Visibility/GenericParam/SelfKind laws + FieldInfo/VariantInfo attribute-carrying integration. Open pins: REFL-CLOSURE-XREC-1 (closure param over cross-module record = size-0 view) + COLLECT-FROMITER-2 (`.map().collect()` → receiver-less `FFIAbi.from_iter`). |
| `quote.vr`             | **partial** | [core-tests/meta/quote](https://github.com/verum-lang/verum/tree/main/core-tests/meta/quote) — 29/41 GREEN under `--interp` (22 unit + 7 property), 12 regression pins. QuotePart 3-variant + the runtime-safe QuoteBuilder subset. The `quote { … }` compile-time surface (MetaQuote 0xB9) is implemented compiler-side; the RUNTIME builder surface is dominated by META-INTRINSIC-NILSTUB-1 (`Span.call_site`-backed ctor cascade) — 12 pins document exactly which chains degrade. |
| `attribute.vr`         | **partial** | [core-tests/meta/attribute](https://github.com/verum-lang/verum/tree/main/core-tests/meta/attribute) — 46/65 GREEN under `--interp` (31 unit + 13 property + 2 regression), 19 pins (8 legacy `AttributeArg.positional` collision + 11 new: COLLECT-FROMITER on `positional_args`/`named_args`/`as_ident_list`/`as_key_values`/`DeriveInfo.from_attribute`, `has_arg` Maybe<Text>-compare OOB, `is_builtin` const-slice `.contains` SIGSEGV, AOT Maybe-accessor divergences). MetaAttributeValue 8-variant matrix + Attribute ctor/predicate coherence + CfgPredicate/DeriveInfo/ReprInfo laws. |
| `diakrisis_attrs.vr`   | **partial** | [core-tests/meta/diakrisis_attrs](https://github.com/verum-lang/verum/tree/main/core-tests/meta/diakrisis_attrs) — 80 tests GREEN under `--interp` (39 unit + 41 integration incl. all 5 `parse_*` happy paths + 24 rejection modes). **REFFIELD-LIST-FORITER-EMPTY-1 CLOSED** (catalogue §51): `parse_autopoietic`'s `for arg in &attr.args` iterates again — both-present + order-independent green. Attr-arg lists rebuilt as list literals (META-TEST-TYPECHECK-1, catalogue §49). |
| `framework_hygiene.vr` | **partial** | [core-tests/meta/framework_hygiene](https://github.com/verum-lang/verum/tree/main/core-tests/meta/framework_hygiene) — 55 tests GREEN under `--interp` (40 unit + 15 property). R1 brand-prefix matrix + R2 ε-coordinate admissible/inadmissible matrices + R3 uniqueness monotonicity + `run_all_hygiene_rules` end-to-end count law + severity_as_text totality/injectivity. |
| `oracle.vr`            | **partial** | [core-tests/meta/oracle](https://github.com/verum-lang/verum/tree/main/core-tests/meta/oracle) — 44 tests GREEN under `--interp` (30 unit + 14 property). **META-REFINED-FIELD-FLOATCMP-1 CLOSED** (catalogue §48): refined `Float{0..1}` config-field compares are float compares on both the local and BAKED-archive legs; filter/count monotonicity + has_viable coherence laws all green. Candidate lists rebuilt as list literals; `List.concat` added to stdlib as the expression-position companion to `append`. |
| `tactic.vr`            | **partial** | [core-tests/meta/tactic](https://github.com/verum-lang/verum/tree/main/core-tests/meta/tactic) — 75 tests GREEN under `--interp` (44 unit + 16 property + 15 integration). MetaTerm 6-variant algebra: β-cancellation, normalise idempotence + `meta_is_normal ∘ meta_normalise` cross-law over 6 shapes, references_elaborator through 5-level nests. Cleanest meta submodule (no intrinsics, no cross-module records). |
| `contexts.vr`          | **partial** | [core-tests/meta/contexts](https://github.com/verum-lang/verum/tree/main/core-tests/meta/contexts) — 32 tests GREEN under `--interp` over the pure-data payload types (DiagnosticSeverity/SuggestionKind/UsageContext/ItemKind/SchemaErrorSeverity/BraceStyle variant sets). The 14 capability contexts themselves are compile-time (provisioned by `verum_compiler/src/meta/` — evaluator + per-context builtins); the runtime-testable payload-record surface (CacheStats/BenchStats/ParseResult/DiagnosticBuilder…) is the largest remaining coverage gap in `core.meta`. |
| `mod.vr`               | **partial** | [core-tests/meta/mod](https://github.com/verum-lang/verum/tree/main/core-tests/meta/mod) — 45 tests GREEN under `--interp` (21 unit + 4 property + 20 integration). MetaError 13-variant `.message()` payload round-trips, MetaResult<T> Ok/Err flows through fn params/returns, DEFAULT_* limit constants + ordering invariants, VERSION/VERSION_INFO. |

The status table is the runtime truth, not the file's `lifecycle`
annotation. They align only when the status reads **stable**.

### Open upstream defects gating meta test runs

* **Cross-module record-return field-access OOB** — `let x = Foo.new(...); x.field`
  panics at runtime with `field access out of bounds: field index N
  (offset M+8 = K) exceeds object data size S`. Field index N is the
  global-intern position of the field-name literal (typically &gt; 10),
  not the actual struct field index. Same defect class as
  `[[enactment_field_access_oob_2026-05-24]]` and
  `[[btree_pattern_match_ref_generic_class]]`. **Partial mitigation
  landed 2026-05-26 (commit f506212eb)**: defence-in-depth Self →
  concrete substitution at three READ-sites in `extract_expr_type_name`
  / `infer_expr_type_name`, closing the Self-literal-leakage failure
  mode (when registration-path drift left `return_type_name = "Self"`
  in the function table). **Residual root** for the OOB panic itself
  is `type_name_to_id` propagation through archive loading — the
  test compilation unit has no descriptor entry for the cross-mounted
  record type, so `resolve_field_index` falls through to the global
  interned-name fallback even when `variable_type_names` carries the
  correct type name. Fix path: `verum_vbc/src/codegen/expressions.rs::compile_field_access`
  + `merge_archive_function_bodies` to populate `type_name_to_id` /
  `type_field_layouts` from the archive's TypeDescriptor table.
  Multi-day VBC work. Workaround discipline pinned at every meta test
  header: **direct record literal at the test site, never the cross-
  module `.new(...)` ctor**.
* **Task #17/#39** — mount-scope-aware `lookup_function`. Bare-name
  static-method dispatch first-wins collisions. `AttributeArg.positional`
  is the meta/attribute manifestation (8 `@ignore` pins). The
  architectural close-out unblocks ~25 sister regressions across
  every meta submodule that constructs payload records via static
  helpers.
* **AOT stdlib build broken** — same gate as
  [`core.context`](./context.md). Blocks cross-tier validation
  for every meta test until task #7 closes.

### Closed defects (historic)

* ~~**`core/meta/quote.vr` variant-name drift**~~ — CLOSED 2026-05-25
  (commit 563badeea). 17 sites realigned: `TokenTree.Token` → `Leaf`,
  `TokenKind.Keyword` → `Kw`, `TokenTree.Group` → `Grouped`. The
  full QuoteBuilder API surface is now syntactically valid; runtime
  testing gated only on the cross-module-ctor return-value fix above.
* ~~**`core/meta/diakrisis_attrs.vr` AttributeArg schema drift**~~ —
  CLOSED 2026-05-25 (commit 563badeea). All 5 parse_* functions
  realigned against the record-form `AttributeArg { name, value, span }`
  + canonical `MetaAttributeValue` enum. 45 new parse_* integration
  tests landed.
* ~~**`core/meta/framework_hygiene.vr` R2 no-op**~~ — CLOSED 2026-05-25
  (commit 563badeea). `ordinal_char_admissible(ch: Char) -> Bool`
  helper + per-Char loop in `validate_epsilon_canonicalisable` now
  accepts digits + `+` + `ω` + `Ω` + `·` + `²`, emits R2 Warning on
  inadmissible input. 12 new R2 tests in Section 8 of unit_test.vr.

---

## Compiler-side implementation map (audit 2026-07-06)

Where each `core.meta` construct actually executes, per the
2026-07-06 architecture audit (path refs into `crates/`):

| Construct | Status | Implementation |
|---|---|---|
| `meta fn` execution | **implemented, bifurcated** | Registered in Phase 2 (`phases/meta_registry_phase.rs:153`); REAL execution via the staged pipeline (`pipeline/compile_orchestration.rs:250` → `staged_pipeline.rs:1592` → `meta/vbc_executor.rs:191` — the actual Tier-0 interpreter). Zero-arg codegen meta fns auto-run; arg-taking macro-style fns run at call sites via `resolve_meta_call` (`phases/macro_expansion.rs:778/:1171`). A SECOND tree-walk engine (`meta/evaluator.rs`, ~238 KB) serves @const/tagged-literal/interpolation — convergence tracked (META-EXEC-CONVERGENCE-1). |
| The 14 capability contexts | **implemented** | Rust provisioning layer: `meta/contexts/` (execution_state / type_introspection / diagnostics / build_config / security sandbox) + per-context builtins in `meta/builtins/` (build_assets, stage_info, runtime, code_gen, reflection, …); `MacroState` in `meta/subsystems/macro_state.rs`. `Hygiene` is the thinnest (quote-layer only). |
| `quote { … }` | **implemented** | Parses at `verum_fast_parser/src/expr.rs:2262`; lowers via `verum_vbc/codegen/expressions.rs::compile_quote_expr` → `MetaQuote (0xB9)`; interp handler materialises a real TokenStream (`interpreter/dispatch_table/handlers/meta.rs:40`; siblings MetaEval/MetaSplice/MetaReflect 0xB8/0xBA/0xBB). |
| `@derive(…)` | **implemented; drift risk** | `macro_expansion.rs::expand_type_derives:1596` → `DeriveRegistry` (13 derives). Consumes RUST-side reflection mirrors (`derives/common.rs`), NOT `reflection.vr`; a THIRD mirror set lives in `meta/reflection/`. No drift-pin test across the three — META-REFLECTION-DRIFT-1. |
| `@compiler_intrinsic` span/token ctors | **nil-stub at runtime** | Bodiless declarations get no dispatch registration (`verum_vbc/codegen/mod.rs:7172-7180` inherits only pre-registered intrinsic names) → empty body → nil. Cascades through every `TokenStream` ctor (`Span.call_site` internal calls) — META-INTRINSIC-NILSTUB-1 is the dominant runtime-coverage blocker for quote/token. |
| `theorem … proof by auto;` | **implemented** | `fast_parser/src/proof.rs::parse_theorem:71` → SMT-dispatched via `phases/proof_verification.rs` (`ProofSearchEngine::execute_tactic`) — genuinely discharged, then erased pre-codegen (`phases/proof_erasure.rs:41-61`). |
| `@arch_module(…)` | **implemented** | Conformance phase (`pipeline/ats_v_phase.rs:64`), invoked at `pipeline.rs:2152`; non-annotated modules skip silently. |
| Lenient SKIP discipline | **implemented** | `verum_vbc/codegen/mod.rs::compile_item_lenient:3751` — error → warn + panic-stub, `SkipClass` taxonomy in `codegen/error.rs`; strictness via `LintConfig.strict_codegen`. This is why several meta defects surfaced as runtime panics instead of compile errors. |
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
