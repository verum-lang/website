---
sidebar_position: 1001
title: Changelog
description: Per-release notes and migration guidance.
slug: /changelog
---

# Changelog

Format: Keep a Changelog.
Version scheme: semver.

Prior release numbers (0.01.0 → 0.32.0) tracked internal phase
milestones during the pre-1.0 implementation; they are retained below
as historical record. The first public version is **0.1.0**.

## [0.1.0] — 2026-04-17 — runtime foundations, first public version

### Fixed — VBC + AOT byte-slice semantics

- `Text.as_bytes()` and `slice_from_raw_parts(ptr, len)` now produce
  proper slice values in both tiers. The VBC lowering previously
  emitted `Pack` (a heap tuple) for slices, so `.len()` returned 2
  (the tuple arity), `bytes[i]` returned an 8-byte NaN-boxed `Value`
  instead of a byte, and every CBGR slice op silently fell through
  its `is_fat_ref()` guard. New `CbgrSubOpcode::RefSliceRaw` (0x0A)
  builds a `FatRef` directly from (ptr, len) with `elem_size=1`.
  New `TextSubOpcode::AsBytes` (0x34) materialises a byte-slice
  `FatRef` from either the NaN-boxed small-string representation or
  the heap-allocated `[header][len:u64][bytes…]` layout; the codegen
  intercepts `.as_bytes()` on `Text` receivers and routes through
  this op so `self.ptr` via `GetF` (which reads the wrong offset
  for both representations) is never called at runtime.
- Matching AOT/LLVM handlers lower `TextExtended::AsBytes` (reads
  the pointer via `verum_text_get_ptr`, reads `len` from field 1 of
  the flat `{ptr, len, cap}` struct) and `CbgrSubOpcode::RefSliceRaw`
  into the standard 40-byte Pack-object slice layout, so the AOT
  `Len` / `GetE` / `IterNew` handlers already in place pick up the
  fix without further change.
- `CbgrSubOpcode::SliceGet`, `SliceGetUnchecked`, and
  `SliceSubslice` now honour `fat_ref.reserved` as the element
  stride (1/2/4/8 for raw integer arrays, 0 for NaN-boxed Values).
  Previously they hard-coded `sizeof(Value)` and walked 8 bytes per
  index, so indexing or subslicing a byte slice produced garbage.

### Fixed — variant-tag consistency

- `Maybe<T>` is declared `None | Some(T)`, so `register_type_constructors`
  assigns `None=0, Some=1` positionally. The hard-coded fallback
  table in `codegen/mod.rs` had `Some=0, None=1` — the stdlib-
  constants pass ran first and `register_function` overwrote by
  arity, so `None` ended up tagged as `1` while pattern matching
  (which derives tags from declaration order) expected `0`. Every
  `None` value silently matched `Some(x) =>` arms and bound `x` to
  uninitialised payload memory. Tags are now consistent across all
  three sites (`register_stdlib_constants`, builtin registration
  around `compile_program`, `register_type_constructors`) and the
  runtime helpers (`make_maybe_int`, `make_some_value`,
  `make_none_value`).
- Bare `None` identifiers were lowered through the `__const_` path
  to `LoadI 0` instead of `MakeVariant tag=0`. Zero-arity variant
  constructors now route through `MakeVariant` before the constant
  path.
- `TextExtended::AsBytes` handler auto-derefs both CBGR register
  references and `ThinRef` before inspecting the Text layout, so
  `s.as_bytes()` inside a function taking `s: &Text` no longer
  returns an empty slice.

### Fixed — slice method dispatch

- `implement<T> [T]` blocks register under the `Slice.*` prefix
  (because `extract_impl_type_name_from_type` maps
  `TypeKind::Slice(_)` to `"Slice"`), but the method-dispatch
  codegen was formatting `[Byte].method` as the lookup key (using
  `extract_type_name_from_ast`). The two halves of the pipeline
  disagreed; method names now get normalised so `[…].method` →
  `Slice.method` before interning.
- `core.collections.slice` was present in the AOT-retention list
  but not in the primary `ALWAYS_INCLUDE` that controls which
  stdlib modules get compiled into the VBC module at all. Added,
  so the normalised `Slice.*` lookups actually have bodies to find.
- Intercept `[T].slice(start, end)` at codegen and emit
  `CbgrSubOpcode::SliceSubslice` directly, bypassing the compiled
  stdlib body (which panics inside `Value::as_i64` when it receives
  a `FatRef` receiver via `CallM`).
- `extract_type_name` now handles `TypeKind::Slice(T) → "[T]"`
  instead of returning `None`, so method-chain inference carries
  slice-ness through calls like `s.as_bytes()` and downstream
  `.slice()` / `.get()` / `.is_empty()` dispatch can route
  correctly.

### Fixed — stdlib parsing and Text layout

- `Text.parse_int` / `Text.parse_float` route through the pure-Verum
  `parse_int_radix(10)` path instead of the legacy `text_parse_int` /
  `text_parse_float` intrinsics, whose runtime declarations returned
  `Maybe<T>` while the stdlib wrappers were typed as
  `Result<T, ParseError>`. Because `Maybe::Some(n)` has tag 1 and
  `Result::Err(e)` also has tag 1, every successful parse was read
  back as `Err(n)` — `"42".parse_int()` returned `Err`. The new
  implementation parses bytes directly with explicit error messages
  (`empty string`, `no digits`, `invalid character`, `digit out of
  range`, `trailing characters`, `missing exponent digits`).
- `Text` values have two coexisting runtime layouts under the same
  `TypeId::TEXT`:
  * static / intrinsic-built heap strings: `[header][len:u64][bytes…]`
  * stdlib builder `Text {ptr, len, cap}`: three NaN-boxed `Value`
    fields produced by `Text.new()` + `push_byte`.
  Both the `Len` opcode handler and the `TextExtended::AsBytes`
  lowering were decoding only the first case. For a fresh
  `Text.new()`, `.len()` read the null-pointer bit pattern as a u64
  and reported `9221120237041090560`; `.as_bytes()` produced a
  FatRef into random memory. Both now disambiguate by object size +
  field tags and report correct values for builder Text.

### Impact

Pure-Verum byte-level stdlib code (JSON, base64, URL, UUID, hex
decoders; regex engines; TLS framing; binary protocols) can now
parse numeric tokens and traverse bytes end-to-end in the VBC
interpreter and AOT builds. Prior to these fixes every such module
typechecked cleanly but crashed or silently corrupted data at run
time; the VCS `typecheck-pass` suites did not surface it because
they never executed the code.

Concrete known-working cases:

- `"42".parse_int()` → `Ok(42)`, `"-7".parse_int()` → `Ok(-7)`,
  `"abc".parse_int()` → `Err("digit out of range")`.
- `"hello".as_bytes().slice(1, 4)` → 3-byte slice at `"ell"`.
- `JSON.parse("42")`, `JSON.parse("true")`, `JSON.parse("\"hi\"")`,
  `JSON.parse("[1, 2, 3]")`, `JSON.parse("{}")` all return `Ok`.

### Fixed — byte-sized writes via `memset`

The generic `ptr_write<T>` intrinsic lowered to `DerefMut`, which
writes 8 bytes of a NaN-boxed `Value` regardless of `T`. Writing a
`Byte` this way corrupted seven bytes past the target. All byte-
granularity writes in the stdlib are now expressed as
`memset(ptr, byte, 1)` with an explicit 1-byte length:

- `Text.push_byte` — core of every Text builder path.
- `Text.from_utf8_unchecked` — null terminator after memcpy.
- `Text.grow()` — null-terminator maintenance when capacity expands.
- `Text.make_ascii_lowercase` / `make_ascii_uppercase` — in-place flips.

Also reconciled `core/encoding/json.vr` with the new
`Text.parse_int` / `parse_float` signatures (`Result<T, ParseError>`
after the parse-int fix). The JSON number parser was still pattern-
matching `Some(i) / None`; because `Result::Ok` and `Maybe::None`
share tag 0, every successful integer parse silently routed to the
"integer out of range" fallback. Now uses `Ok / Err` arms directly.

Known-working after this layer of fixes: `Text.new(); t.push_byte(b);`
round-trips; `t.as_bytes()` yields the written bytes.

Known-remaining: `Text == Text` returns `false` for two builder
Texts built from the same bytes — equality walks the struct
layout rather than byte content — so Map<Text, T> with built keys
(e.g. JSON object field names) crashes during hashing. Tracked as
the next task in the byte-level stdlib surface audit. Simple JSON
scalars / arrays / empty objects work end-to-end; `{"a": 1}` still
crashes at the `Map.insert` stage.

## [0.32.0] — 2026-04-15 — phase D complete

### Major

- **Cubical normaliser with computational univalence** landed. Eight
  reduction rules in `cubical.rs`; bridge into `unify.rs` for
  `Type.Eq`. Computational `transport(ua(e), x) ≡ e.to(x)`.
- **VBC cubical codegen**. New `CubicalExtended` opcode (0xDE) with
  17 sub-opcodes covering `PathRefl`, `PathLambda`, `Transport`,
  `Hcomp`, `Ua`, `Glue`, and friends. Proof erasure in release
  mode — cubical ops compile to identity / passthrough.
- **Proof-carrying bytecode**. VBC archives embed certificates via
  `verum_smt::proof_carrying_code`. Consumers can re-verify
  offline without running the full compiler.
- **Capability-based SMT router**. Obligations classified by theory
  use; Z3 handles LIA/bitvector/array; CVC5 handles strings /
  nonlinear / SyGuS / FMF. Portfolio mode cross-validates.
- **θ+ unified execution environment**. Memory + capabilities +
  recovery + concurrency form a single per-task context with
  spawn/await propagation.
- **Incremental compilation fingerprinting**. Function / type /
  dependency / config hashes; `target/.verum-cache/` per-project.
  Typical 10–15× incremental-edit speedup.

### Added

- `@verify(thorough)` and `@verify(certified)` — dual-solver
  execution.
- `@verify(certified)` — requires proof term; machine-checked.
- `is_reflectable()` gate for `@logic` functions (pure + total +
  closed).
- `Tensor<T, const S: Shape>` static shapes with shape-polymorphic
  operations; shape errors at compile time.
- `math.agent` — LLM-adjacent primitives (tokeniser, KV cache,
  speculative decoding, ReAct, guardrails, RAG).
- `math.mathesis` — ∞-topos of formal theories; Yoneda loading,
  Kan-extension-based translation, descent coherence.
- Terminal UI framework (`core::term`) — 7 layers from raw termios
  to Elm-architecture apps.
- 800+ runtime intrinsics documented in `core::intrinsics`.
- Contract literals (`contract#"..."`) with compile-time SMT
  verification.

### Changed

- CBGR dereference optimised to **11.8–14.5 ns** (measured on M3
  Max). Target < 15 ns — achieved.
- Stdlib collections: Swiss-table-backed `Map<K,V>` replaces
  open-addressing implementation.
- VBC opcode count reached 200+ (was ~150).
- Default SMT timeout raised from 2 s to 5 s for better portfolio
  convergence.
- Parser: switched to `verum_fast_parser` (recursive descent with
  lossless green tree) as default; `verum_parser` retained for
  backward compatibility.
- `@extern("C")` blocks now accept `calling_convention = "..."` for
  non-default ABIs.

### Fixed

- Generation wraparound race condition — epoch counter now advances
  cooperatively per-thread; hazard pointers protect in-flight reads
  during free.
- CVC5 1.3.3 integration — brings bug fixes to string operations.
- Refinement narrowing across control flow: `if x > 0 { ... }`
  correctly strengthens `x: Int` to `Int { self > 0 }` inside the
  branch.
- Proof cache invalidation triggers solver upgrade — previously
  cached results were trusted across solver versions, leading to
  stale verdicts.

### Deprecated

- `r#"..."#` Rust-style raw string — use `"""..."""` (triple-quote)
  for multiline raw text.
- `size_of<T>()` / `align_of<T>()` intrinsics — prefer type
  properties `T.size`, `T.alignment`.

### Tooling

- **LSP**: refinement-type diagnostics with counter-examples; CBGR
  reference-tier hints (`&T` / `&checked T` / `&unsafe T` shown
  inline); quick-fixes for auto-import, protocol method
  generation, `@verify` annotation.
- **Playbook TUI**: session replay; context binding; inline
  verification diagnostics.
- **CLI**: `verum analyze --escape | refinements | smt |
  capabilities`; `verum smt-stats`; `verum expand-macros`;
  `verum target install <triple>`.
- **Package registry**: `verum publish`, `verum search`,
  `registry.verum-lang.org`; content-addressed storage with
  IPFS support.

### Benchmarks

Measured on Apple M3 Max, Verum 0.32 release build:

| Operation | Cycles | ns |
|---|---|---|
| `&checked T` deref | 2 | 0.5 |
| `&T` CBGR check | 55 | 13.8 |
| `Shared.clone` (incr. strong) | 11 | 2.7 |
| `Map.insert` (single) | ~200 | ~50 |
| context-stack push | 32 | 8 |
| `current_env()` read | 8 | 2 |

### Verification statistics

Project-wide on the stdlib + conformance suite:

| Theory mix | Obligations | Median (ms) | p95 |
|---|---:|---:|---:|
| LIA only | 2,100 | 8 | 35 |
| LIA + bitvector | 940 | 14 | 60 |
| LIA + string | 110 | 45 | 180 |
| Nonlinear (NIA) | 42 | 320 | 1,800 |
| Cubical / path | 18 | 120 | 400 |

Cache hit rate: **68%** average on incremental builds.

### Migration notes

**From v0.31**:

- `r#"..."#` raw strings → `"""..."""`. Automated by `verum fmt`.
- `@verify(formal)` semantics unchanged. Portfolio / certified are
  new, opt-in.
- New type properties `T.size` / `T.alignment` are source-
  compatible; `size_of<T>()` still works but emits a deprecation
  warning.

**From v0.30 and earlier**: cubical types weren't available. No
migration needed for existing code; new `Path<A>(a,b)` type and
friends are additive.

### Contributors

43 contributors over the v0.32 cycle. Session 22 was the biggest —
CBGR optimisation to 11.8–14.5 ns shipped in that session.

---

## [0.31.0] — 2026-02-28 — cubical foundations

### Added

- Cubical type theory in `verum_types`: `Path<A>(a, b)`, interval
  endpoints `i0` / `i1`, `hcomp`, `transport`, `ua`.
- Higher-inductive type syntax: `type S1 is Base | Loop() = Base..Base`.
- `cofix fn` coinductive fixpoint; productivity analysis via
  `check_productivity`.

### Changed

- `verum_types::infer` 2.66 M LOC after cubical integration.

### Fixed

- Infinite loops in inference when HKT parameter unified against
  itself.

---

## [0.30.0] — 2025-12-15 — dual-solver portfolio

### Added

- CVC5 backend (`cvc5-sys` 1.3.2).
- Capability-based router in `verum_smt::capability_router`.
- `@verify(thorough)` attribute.

### Changed

- SMT obligation format standardised on SMT-LIB 2.6 across both
  solvers.

---

## [0.25.0] — 2025-10-07 — dependent types

### Added

- Σ-types via `type T is n: Int, data: [Int; n]`.
- Π-types (implicit — dependent return types over parameters).
- Higher-kinded type parameters: `F<_>`.
- `@verify(formal)` integration with dependent obligations.

---

## [0.20.0] — 2025-07-22 — refinement-type SMT

### Added

- Three refinement syntaxes: inline on type, on parameter, on field.
- Z3 integration via `verum_smt::z3_backend`.
- `@logic fn` reflection.
- `where requires` / `where ensures` / loop `invariant` / `decreases`.

---

## [0.15.0] — 2025-04-09 — VBC-first

### Added

- VBC bytecode with 150+ opcodes.
- VBC interpreter; `verum run` default.
- LLVM AOT backend via `verum_codegen`; `verum build --release`.

### Changed

- Compiler pipeline reorganised around VBC as the single IR.

---

## [0.10.0] — 2025-01-19 — three-tier references

### Added

- `&T`, `&checked T`, `&unsafe T` reference tiers.
- CBGR — capability-based generational references.
- Escape analysis; promotion to `&checked T`.

---

## [0.05.0] — 2024-10-12 — type system skeleton

### Added

- Bidirectional type inference.
- Protocol system (`type X is protocol { ... }`).
- `implement P for T` blocks.
- Semantic-honest types: `List<T>`, `Text`, `Map<K,V>`, etc.

---

## [0.01.0] — 2024-07-05 — initial public tag

### Added

- Lexer (via logos).
- EBNF grammar v0.1 (~800 lines).
- Parser shell; can tokenise `.vr` files.
- Executable compiles `main()` with `print("hello, world!")`.
