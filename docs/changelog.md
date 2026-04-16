---
sidebar_position: 1001
title: Changelog
description: Per-release notes and migration guidance.
slug: /changelog
---

# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Version scheme: [semver](https://semver.org/).

## [0.32.0] — 2026-04-15 — phase D complete

### Major

- **Cubical normaliser with computational univalence** landed. Eight
  reduction rules in `cubical.rs`; bridge into `unify.rs` for
  `Type::Eq`. Computational `transport(ua(e), x) ≡ e.to(x)`.
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
| `Shared::clone` (incr. strong) | 11 | 2.7 |
| `Map::insert` (single) | ~200 | ~50 |
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
