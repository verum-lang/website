---
sidebar_position: 4
title: Attribute Registry
---

# Attribute Registry

All standard attributes, organised by purpose. Each row lists the
attribute, its valid targets, and a one-line semantics.

## Derive

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@derive(Clone)` | type | generate `Clone` impl |
| `@derive(Copy)` | type | mark as `Copy` (requires all fields `Copy`) |
| `@derive(Debug)` | type | generate `Debug::debug` |
| `@derive(Display)` | type | generate `Display::format` |
| `@derive(Eq, PartialEq)` | type | generate equality |
| `@derive(Ord, PartialOrd)` | type | generate ordering (lexical) |
| `@derive(Hash)` | type | generate `Hash` |
| `@derive(Default)` | type | generate `Default` (fields must impl `Default`) |
| `@derive(Serialize)` | type | generate serialisation |
| `@derive(Deserialize)` | type | generate deserialisation |
| `@derive(Builder)` | type | generate fluent builder |
| `@derive(Error)` | type | generate `Error` impl with `Display` delegation |
| `@derive(From<T>)` | type | generate `From<T>` conversion (one-field newtypes) |
| `@derive(Into<T>)` | type | dual of `From<T>` |

## Layout

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@repr(C)` | type | C-compatible layout, no reordering |
| `@repr(transparent)` | type (one field) | identical layout to inner |
| `@repr(align(N))` | type | force alignment to N |
| `@repr(packed)` | type | no padding between fields |
| `@repr(u8/u16/u32/u64)` | variant | sum-type discriminant size |

## Verification

The `@verify` attribute takes a **semantic strategy** — the underlying
solver (the SMT backend, portfolio, …) is an implementation detail picked by
the capability router. The full set admitted by the grammar:

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@verify(runtime)`    | fn, type | runtime assertion check only; no formal proof |
| `@verify(static)`     | fn, type | static type-level verification only |
| `@verify(formal)`     | fn, type | formal verification with the default strategy (recommended) |
| `@verify(proof)`      | fn, type | alias of `formal`, emphasising proof extraction |
| `@verify(fast)`       | fn, type | optimise for fast verification; may sacrifice completeness on hard goals |
| `@verify(thorough)`   | fn, type | maximum completeness; races multiple strategies, returns the first success |
| `@verify(reliable)`   | fn, type | alias of `thorough`, emphasising result reliability |
| `@verify(certified)`  | fn, type | independently cross-verified; required for proof-certificate export (Coq/Lean/Dedukti/Metamath) |
| `@verify(synthesize)` | fn, type | synthesis mode — generate a term satisfying the spec rather than checking it |
| `@framework(name, "citation")` | axiom, theorem, lemma | Mark a statement as a trusted axiom borrowed from an external framework. `name` is the framework identifier (identifier syntax); the string is a human-readable citation (paper / URL / section). Surfaced by `verum audit --framework-axioms` for supply-chain review. |

Project-wide defaults and per-module overrides live in the `[verify]`
section of `verum.toml` — see **[reference → verum.toml](/docs/reference/verum-toml#verify--formal-verification)**.

## FFI

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@extern("C")` | fn, extern block | C linkage |
| `@extern("C", calling_convention = "X")` | fn | override calling convention |
| `@ownership(transfer_to = "caller" \| "callee")` | ffi item | ownership transfer at boundary |
| `@ownership(borrow = [...])` | ffi item | params are borrowed, not transferred |

## Target & dispatch

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@device(cpu)` | fn | run on CPU (default, usually implicit) |
| `@device(gpu)` | fn | route through MLIR GPU pipeline — triggers `VbcToMlirGpuLowering` in Phase 7 |
| `@gpu.kernel` | fn | mark as a GPU kernel (implies `@device(gpu)`) with kernel-launch semantics |
| `@differentiable` | fn | synthesise a VJP companion in Phase 4a autodiff |
| `@thread_local` | static | per-thread storage |
| `@naked` | fn | no prologue / epilogue (assembly trampolines only) |
| `@intrinsic("name")` | fn | compiler-provided primitive (forward decl) |

## Optimisation

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@inline` | fn | suggest inlining |
| `@inline(always)` | fn | force inlining |
| `@inline(never)` | fn | forbid inlining |
| `@hot` | fn | mark as hot path; bias optimisation / layout |
| `@cold` | fn | mark as cold path; bias away |
| `@vectorize(lanes = N)` | fn | request SIMD vectorisation |
| `@unroll(factor = N)` | fn | request loop unrolling |
| `@multiversion` | fn | emit multiple versions for CPU feature dispatch |
| `@link_section("name")` | fn, static | place into a named section |
| `@no_mangle` | fn, static | disable name mangling |
| `@vbc_direct_lowering` | fn (intrinsic) | Intrinsic function lowers directly to a VBC opcode without a regular call frame. Used on time/CPU/sleep primitives in `core/intrinsics/runtime/`; users should not hand-apply this attribute. |

## Testing

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@test` | fn (no args) | register as a unit test; passes iff it returns without panicking |
| `@property` | fn (typed params) | property-based test — harness feeds N random inputs per invocation (default 100) and performs integrated shrinking on failure. See **[Tooling → Property testing](/docs/tooling/property-testing)**. |
| `@property(runs = N)` | fn | override per-property iteration count (positive integer). |
| `@property(seed = 0x…)` | fn | pin a single deterministic seed — useful for CI and reproducing a specific failure. |
| `@test_case(args…)` | fn (positional params) | parametrise a test. Repeating the attribute expands the function into `fn_name[0]`, `fn_name[1]`, … Each case runs as a separate test entry. Args accept `Int`, `Bool`, `Text`, `Float` literals (and negated forms). |
| `@ignore` / `@ignored` | fn | skip in normal runs. Surfaces in `--format pretty` with `… ignored`. Re-enable with `--include-ignored` (all) or `--ignored` (only ignored). |
| `@bench` | fn | register as a benchmark — see **[Tooling → Benchmarking](/docs/tooling/testing#benchmarking)** for the harness flags (`--warm-up-time`, `--measurement-time`, baselines, etc.). |
| `@bench(group)` | fn | associate the bench with a named group (shown in the report and preserved in JSON/CSV output). |
| `@fuzz` | fn | register as a fuzz target (VCS fuzz infra — distinct from PBT). |

Reserved for Stage 2 (tracked in `docs/testing/reference-quality-roadmap.md`):
`@before_each`, `@after_each`, `@snapshot`, `@timeout(ms)`.

## Conditional compilation

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@cfg(feature = "X")` | any | include if feature X is enabled |
| `@cfg(target_os = "X")` | any | OS guard |
| `@cfg(target_arch = "X")` | any | architecture guard |
| `@cfg(debug_assertions)` | any | debug-only |
| `@cfg(not(X))`, `@cfg(any(...))`, `@cfg(all(...))` | any | compose |

## Parameters & fields

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@unused` | param | silence unused-param warnings |
| `@must_use` | fn, type, field | warn if result is discarded |
| `@validate(min = X, max = Y)` | field | derive a refinement |
| `@validate(matches = rx#"...")` | field | regex validation |
| `@serialize(rename = "...", skip, skip_if_null)` | field | serialisation control |
| `@deserialize(default, alias = "...")` | field | deserialisation control |

## Meta

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@const expr` | expr | force compile-time evaluation |
| `@meta_macro` | meta fn | expose as a callable `@name(...)` macro |
| `@tactic` | meta fn | expose as a proof tactic |
| `@logic` | fn | mark as reflection-eligible |
| `@llvm_only` | fn | cannot run in VBC interpreter |
| `@requires_runtime` | fn | needs a specific runtime feature |

## Documentation

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@doc("...")` | any | documentation comment |
| `@doc(hidden)` | any | exclude from generated docs |
| `@deprecated(since = "...", note = "...")` | any | mark deprecated |

## Miscellaneous

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@std` | any | standard library marker |
| `@internal` | any | internal-only (ignored by `verum doc`) |
| `@specialize` | impl | specialisation instance |
| `@universe_poly` | fn, type | enable universe polymorphism |
| `@cap(name = "X", domain = "Y")` | fn | declares a capability it holds |

## Lint suppression / promotion

In-source severity overrides for `verum lint`. The first arg is the
**string-literal** rule name (kebab-case, matches `[lint.severity]`
keys exactly); `reason = "..."` is optional today but recommended.

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@allow("rule", reason = "...")` | fn, type, theorem/lemma/corollary, axiom, module-level | suppress diagnostics of the named rule for everything inside the item's source span |
| `@deny("rule")` | same | force the rule to **error** for everything inside the item's span |
| `@warn("rule")` | same | force the rule to **warning** |

Examples:

```verum
@allow("redundant-refinement", reason = "kept for documentation")
type Always is Int{ true };

@deny("todo-in-code")
public fn release_critical() { … }

@warn("deprecated-syntax")
fn experimental() { … }
```

Most-specific (smallest source-span) suppression wins on overlap;
in-source attributes always beat `[lint.severity]` and CLI flags.
See **[Reference → Lint configuration → precedence stack](/docs/reference/lint-configuration#precedence-stack)**.

## Custom attributes

User-defined via `@meta_macro` (see
**[Language → metaprogramming](/docs/language/meta/overview)**).

## See also

- **[Language → attributes](/docs/language/attributes)** — usage-level
  guide.
- **[Language → metaprogramming](/docs/language/meta/overview)** —
  writing your own.
