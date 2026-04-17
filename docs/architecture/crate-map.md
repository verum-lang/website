---
sidebar_position: 8
title: Crate Map
---

# Crate Map

Every crate in the Verum compiler workspace, with purpose, size,
and representative entry points. Line counts reflect the current
release.

## Layer 0 — Foundation

| Crate | LOC | Purpose | Key files |
|-------|----:|---------|-----------|
| `verum_common` | 17 K | Shared data structures, semantic-type primitives | `core.rs` |
| `verum_error`  | 8 K  | Unified error hierarchy | `error.rs` |

## Layer 1 — Parsing

| Crate | LOC | Purpose | Key files |
|-------|----:|---------|-----------|
| `verum_lexer`        | 14 K | Tokenisation via logos | `token.rs`, `lexer.rs` |
| `verum_fast_parser`  | 89 K | Main recursive-descent parser | `decl.rs`, `expr.rs`, `ty.rs`, `stmt.rs`, `pattern.rs`, `proof.rs` |
| `verum_parser`       | 49 K | Legacy parser (partial, being phased out) | — |
| `verum_ast`          | 47 K | AST definitions | `expr.rs`, `ty.rs`, `pattern.rs`, `decl.rs` |
| `verum_syntax`       | 6 K  | Lossless (red-green) syntax tree infrastructure | `lib.rs` |

## Layer 2 — Type system & verification

| Crate | LOC | Purpose | Key files |
|-------|----:|---------|-----------|
| `verum_types`        | 221 K | Type inference, refinement, dependent + cubical types, protocol coherence | `infer.rs` (53 K lines), `unify.rs`, `refinement.rs`, `cubical.rs`, `cubical_bridge.rs`, `protocol.rs`, `exhaustiveness/` |
| `verum_cbgr`         | 103 K | Three-tier reference analysis suite | `tier_analysis.rs`, `escape_analysis.rs`, `ownership_analysis.rs`, `concurrency_analysis.rs`, `lifetime_analysis.rs`, `nll_analysis.rs`, `polonius_analysis.rs`, `smt_alias_verification.rs` |
| `verum_smt`          | 139 K | SMT integration (Z3 + CVC5) | `z3_backend.rs`, `cvc5_backend.rs`, `capability_router.rs`, `portfolio_executor.rs`, `proof_search.rs`, `cubical_tactic.rs` |
| `verum_verification` | 59 K  | Hoare logic, VCGen, dependent verifier, tactics | `hoare_logic.rs`, `vcgen.rs`, `proof_validator.rs`, `tactic_evaluation.rs`, `dependent_verification.rs` |
| `verum_diagnostics`  | 19 K  | Error formatting, spans, labels | `diagnostic.rs` |
| `verum_modules`      | 17 K  | Module resolution, loader, coherence checker | `loader.rs`, `resolver.rs`, `coherence.rs`, `parallel.rs` |

## Layer 3 — Execution (VBC-first)

| Crate | LOC | Purpose | Key files |
|-------|----:|---------|-----------|
| `verum_vbc`     | 192 K | Bytecode format, interpreter, VBC codegen, monomorphization | `instruction.rs`, `bytecode.rs`, `interpreter/dispatch_table/handlers/` (37 files), `codegen/`, `intrinsics/` |
| `verum_codegen` | 81 K  | LLVM (CPU) + MLIR (GPU) backends | `llvm/instruction.rs` (22 K lines), `llvm/vbc_lowering.rs`, `mlir/vbc_lowering.rs`, `link.rs`, `runtime.rs` |

## Layer 4 — Orchestration & tools

| Crate | LOC | Purpose | Key files |
|-------|----:|---------|-----------|
| `verum_compiler`    | 161 K | Pipeline orchestration, derives, hygiene, linker config | `pipeline.rs` (14 K lines), `phases/*`, `derives/*`, `quote.rs`, `hygiene/*`, `linker_config.rs` |
| `verum_toolchain`   | 2 K   | Toolchain management (`~/.verum/toolchains/`, stdlib bytecode) | `lib.rs` |
| `verum_lsp`         | 33 K  | Language server (LSP 3.17) | `backend.rs`, `completion.rs`, `quick_fixes.rs`, `diagnostics.rs`, `hover.rs`, `exhaustiveness.rs` |
| `verum_dap`         | 2 K   | Debug adapter protocol | — |
| `verum_protocol_types` | 2 K | Shared LSP / DAP type definitions | — |
| `verum_interactive` | 13 K  | REPL + Playbook TUI | `playbook/app.rs`, `execution/pipeline.rs`, `discovery/`, `output/` |
| `verum_cli`         | 32 K  | Command-line frontend | `main.rs`, `commands/{build,run,test,verify,lsp,playbook,repl,profile,...}.rs` (35 commands), `config.rs`, `cog.rs` |
| `verum_integration_tests` | — | End-to-end integration suite | workspace-wide |

## External bindings

| Crate | Purpose |
|-------|---------|
| `cvc5-sys` | CVC5 1.3.3 FFI bindings (statically linked) |
| `llvm`     | LLVM 21.x bindings (custom fork) |

## Totals

- **Internal crates**: 24 (22 `verum_*` + `verum_integration_tests` + `verum_parser` legacy).
- **External crates**: 2 (`cvc5-sys`, `llvm`).
- **Workspace LOC**: ~1.36 M Rust lines across the 24 internal crates.
- **Largest files**:
  - `verum_types/src/infer.rs` — 52 845 lines
  - `verum_codegen/src/llvm/instruction.rs` — 21 502 lines
  - `verum_compiler/src/pipeline.rs` — 14 358 lines
- **Conformance coverage**: 1 506 / 1 507 VCS checks pass (99.93 %).

## Build order

`cargo` resolves the DAG automatically; the conceptual dependency
order is:

```
1. verum_common, verum_error
2. verum_ast, verum_lexer, verum_syntax, verum_diagnostics
3. verum_fast_parser, verum_parser
4. verum_types, verum_cbgr, verum_smt, verum_modules
5. verum_verification, verum_vbc, verum_codegen, verum_toolchain
6. verum_compiler
7. verum_lsp, verum_dap, verum_interactive, verum_cli
```

## See also

- **[Architecture overview](/docs/architecture/overview)** — how the
  crates compose.
- **[Compilation pipeline](/docs/architecture/compilation-pipeline)**
  — phases in execution order.
- **[CBGR internals](/docs/architecture/cbgr-internals#compile-time-analysis-suite)**
  — the 11-module analysis suite inside `verum_cbgr`.
