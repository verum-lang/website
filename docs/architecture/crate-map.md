---
sidebar_position: 8
title: Crate Map
---

# Crate Map

Every crate in the Verum compiler workspace, with purpose and key
entry points.

## Layer 0 — Foundation

| Crate | Purpose | Key files |
|-------|---------|-----------|
| `verum_common` | Shared data structures, semantic-type primitives | `core.rs` |

## Layer 1 — Parsing

| Crate | Purpose | Key files |
|-------|---------|-----------|
| `verum_lexer` | Tokenisation via logos | `token.rs`, `lexer.rs` |
| `verum_fast_parser` | Main recursive-descent parser | `decl.rs`, `expr.rs`, `ty.rs`, `stmt.rs`, `pattern.rs`, `proof.rs` |
| `verum_parser` | Legacy parser, partial (superseded) | — |
| `verum_ast` | AST definitions | `expr.rs`, `ty.rs`, `pattern.rs`, `decl.rs` |
| `verum_syntax` | Red-green lossless syntax tree | — |

## Layer 2 — Type System

| Crate | Purpose | Key files |
|-------|---------|-----------|
| `verum_types` | Type inference + refinement + dependent + cubical | `infer.rs` (2.66 M LOC), `unify.rs`, `refinement.rs`, `cubical.rs`, `cubical_bridge.rs`, `protocol.rs` |
| `verum_cbgr` | Memory safety analysis | `analysis.rs`, `escape_analysis.rs`, `nll_analysis.rs`, `tier_analysis.rs` |
| `verum_smt` | SMT integration (Z3 + CVC5) | `z3_backend.rs`, `cvc5_backend.rs`, `capability_router.rs`, `portfolio_executor.rs`, `proof_search.rs`, `cubical_tactic.rs` |
| `verum_diagnostics` | Error formatting, reporting | `diagnostic.rs` |
| `verum_error` | Unified error hierarchy | `error.rs` |

## Layer 3 — Execution (VBC-first)

| Crate | Purpose | Key files |
|-------|---------|-----------|
| `verum_vbc` | Bytecode definitions + interpreter | `instruction.rs`, `bytecode.rs`, `interpreter/*`, `codegen/*`, `intrinsics/*` |
| `verum_codegen` | LLVM + MLIR backends | `llvm/instruction.rs`, `llvm/vbc_lowering.rs`, `mlir/vbc_lowering.rs`, `link.rs` |
| `verum_verification` | Hoare logic, WP, tactics | `hoare_logic.rs`, `vcgen.rs`, `proof_validator.rs`, `tactic_evaluation.rs`, `dependent_verification.rs` |
| `verum_modules` | Module resolution, loader | `loader.rs`, `resolver.rs` |

## Layer 4 — Tools

| Crate | Purpose | Key files |
|-------|---------|-----------|
| `verum_compiler` | Pipeline orchestration, derives, hygiene | `pipeline.rs` (592 K LOC), `phases/*`, `derives/*`, `quote.rs`, `hygiene/*` |
| `verum_lsp` | Language server (LSP 3.17) | `backend.rs`, `completion.rs`, `quick_fixes.rs`, `diagnostics.rs`, `hover.rs` |
| `verum_dap` | Debug adapter protocol | — |
| `verum_protocol_types` | LSP / DAP type definitions | — |
| `verum_interactive` | REPL + Playbook TUI | `playbook/app.rs`, `execution/pipeline.rs`, `discovery/*`, `output/*` |
| `verum_cli` | Command-line frontend | `commands/{build,run,test,verify,lsp,playbook,repl,publish,...}.rs` |

## External / bindings

| Crate | Purpose |
|-------|---------|
| `cvc5-sys` | CVC5 FFI bindings (static-linked) |
| `llvm` | LLVM bindings (custom fork, 21.x) |

## Key statistics

- **Total LOC**: ~800 K
- **Crates**: 33
- **Largest files**:
  - `verum_types/src/infer.rs` — 2.66 M LOC
  - `verum_codegen/src/llvm/instruction.rs` — 1.1 M LOC
  - `verum_compiler/src/pipeline.rs` — 592 K LOC
- **Test coverage**: 1,506 / 1,507 conformance checks pass (99.93%)

## Build order

```
1. verum_common
2. verum_cbgr, verum_std
3. verum_ast, verum_lexer, verum_parser, verum_diagnostics, verum_error
4. verum_types, verum_smt, verum_modules
5. verum_runtime, verum_codegen, verum_context, verum_resolve, verum_verification
6. verum_compiler (with derives), verum_lsp, verum_cli, verum_interactive
```

## See also

- **[Architecture overview](/docs/architecture/overview)** — how the
  crates compose.
- **[Compilation pipeline](/docs/architecture/compilation-pipeline)**
  — phases in execution order.
