---
sidebar_position: 2
title: Compilation Pipeline
---

# Compilation Pipeline

The compiler runs in 9 phases, orchestrated by
`verum_compiler::pipeline::Pipeline`.

## Phase 0 — Stdlib bootstrap

Loads `core` modules and builds stdlib metadata for the type checker.
Delegated to `phase0_stdlib.rs`.

## Phase 1 — Lexical & parsing

- Tokenisation via `verum_lexer` (logos-generated DFA).
- Parsing via `verum_fast_parser` (recursive descent) — produces AST.
- Macro expansion (procedural macros, `@derive`, quote/unquote) via
  `verum_compiler::macro_expansion`.
- Literal desugaring (tagged literals `sql#`, `rx#`, `json#`, etc.).
- Entry-point discovery.

## Phase 2 — Module resolution

- `mount` statements resolved.
- Dependency graph built across cogs.
- Orphan-rule enforcement.

## Phase 3 — Bidirectional inference

- `verum_types::infer` runs.
- Type unification, constraint solving.
- GATs, specialisation, higher-kinded inference.
- Cubical bridge integrates path types with unification.

## Phase 4 — Type checking

- Refinement typing checked syntactically where possible.
- Context clauses resolved.
- Affine / linear tracking.
- CBGR tier analysis: escape, NLL, points-to.

## Phase 4.4 — Refinement reflection collection

- `@logic` functions collected.
- SMT-LIB axioms generated via `verum_smt::expr_to_smtlib`.
- Refinement reflection registry populated for phase 5.

## Phase 5 — Verification

- Obligations collected from refinement boundaries, contracts, loop
  invariants.
- SMT routing: Z3 / CVC5 / portfolio per obligation classification.
- Proof terms machine-checked (`@verify(certified)`).
- Cubical / category tactics for HoTT obligations.
- Proof erasure: cubical terms marked for VBC identity lowering.

## Phase 6 — MIR lowering & optimisation

- AST lowered to MIR (mid-level IR).
- Optimisation passes: inlining (budget-driven), dead-code elimination,
  constant folding, loop optimisations, CBGR tier promotion.
- Monomorphisation for generics.

## Phase 7 — Code generation

- MIR → VBC bytecode (always).
- VBC → LLVM IR (AOT mode) via `verum_codegen::llvm::vbc_lowering`.
- VBC → MLIR (JIT mode, optional).
- GPU kernels: MLIR → Metal IR (Apple M-series).

## Phase 8 — Linking

- Static: musl (Linux), MSVC CRT (Windows), dynamic system libs (macOS).
- Per-target: x86_64, aarch64, riscv64, wasm32.
- LTO: thin by default, full optionally.

## Phase 9 — Artefact emission

- Binaries (`target/{debug,release}/`).
- Libraries (`.cog` archives).
- Proof certificates (optional).
- Debug info (DWARF, PDB).

## Incremental mode

`verum_compiler::incremental_compiler` + `content_addressed_storage`
keep per-function artefacts keyed on their fingerprint. An edit only
invalidates functions whose source or dependencies changed. Typical
incremental rebuild: ~20× faster than a clean build.

## Parallelism

- Inference and type checking: per-module parallel via `rayon`.
- MIR optimisation: per-function parallel.
- Codegen: per-translation-unit parallel, LLVM-internal parallelism.
- SMT verification: per-obligation parallel, shared solver cache.

## Pipeline diagnostics

```bash
$ verum build --timings
phase 1 (parse)         245 ms
phase 2 (resolve)        18 ms
phase 3 (infer)         612 ms
phase 4 (type-check)    201 ms
phase 4.4 (reflection)    7 ms
phase 5 (verify)      1,480 ms   (SMT: 1,402 ms)
phase 6 (mir + opt)     534 ms
phase 7 (codegen)     2,112 ms
phase 8 (link)          318 ms
total                 5,527 ms
```

## See also

- **[VBC bytecode](/docs/architecture/vbc-bytecode)** — phase 7 output.
- **[SMT integration](/docs/architecture/smt-integration)** — phase 5.
- **[Codegen](/docs/architecture/codegen)** — phase 7 in detail.
