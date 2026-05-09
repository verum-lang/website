---
sidebar_position: 8
title: Crate Map
---

# Crate Map

Every crate in the Verum compiler workspace, with purpose and
representative entry points. The workspace is a single Cargo
workspace under `crates/`; the `Layer 0 → Layer 4` partition
reflects build dependency order, not directory layout.

## Layer 0 — Foundation

| Crate | Purpose | Key files |
|-------|---------|-----------|
| `verum_common` | Shared semantic-type primitives (`List`, `Text`, `Map`, `Maybe`, …), heap layout constants, allocation-header offsets — depended on by everything else. | `core.rs`, `layout.rs` |
| `verum_error`  | Centralised error hierarchy: a single `VerumError` reachable from every crate, so cross-crate errors compose without `Box<dyn Error>`. | `error.rs` |

## Layer 1 — Parsing

| Crate | Purpose | Key files |
|-------|---------|-----------|
| `verum_lexer`        | Tokenisation via `logos`. | `token.rs`, `lexer.rs` |
| `verum_fast_parser`  | Main recursive-descent parser — direct-to-AST, no lossless overhead. The active parser used by every pipeline. | `decl.rs`, `expr.rs`, `ty.rs`, `stmt.rs`, `pattern.rs`, `proof.rs`, `parser.rs`, `recovery.rs`, `attr_validation.rs`, `safe_interpolation.rs` |
| `verum_parser`       | Legacy parser, partial coverage; retained for compatibility tooling. Not on the hot path. | — |
| `verum_ast`          | AST node definitions. | `expr.rs`, `ty.rs`, `pattern.rs`, `decl.rs` |
| `verum_syntax`       | Lossless (red–green) syntax tree infrastructure used by formatter, IDE, and structured-edit tooling. | `lib.rs` |

## Layer 1.5 — Shared protocol types

| Crate | Purpose | Key files |
|-------|---------|-----------|
| `verum_protocol_types` | Foundational protocol / GAT / CBGR-predicate / specialisation-lattice **type definitions only**, no verification logic. Sits between `verum_ast` and the type/SMT crates so `verum_types` and `verum_smt` can both depend on it without circularity. | `lib.rs` |

## Layer 2 — Type system & verification

| Crate | Purpose | Key files |
|-------|---------|-----------|
| `verum_types`        | Type inference, unification, refinement types, dependent types, cubical types, protocol coherence, exhaustiveness, context resolution, kind inference, variance, QTT usage tracking. | `infer/`, `unify.rs`, `refinement.rs`, `cubical.rs`, `cubical_bridge.rs`, `protocol.rs`, `exhaustiveness/`, `proof_checker.rs`, `core_metadata.rs`, `core_pipeline.rs` |
| `verum_cbgr`         | Three-tier reference-analysis suite (CBGR — Capability/Bounds/Generation/Region). All compile-time analyses that decide whether a `&T` reference can be promoted from Tier 0 (default, runtime-checked) to Tier 1 (proven safe). | `tier_analysis.rs`, `escape_analysis.rs`, `ownership_analysis.rs`, `concurrency_analysis.rs`, `lifetime_analysis.rs`, `nll_analysis.rs`, `polonius_analysis.rs`, `smt_alias_verification.rs`, `points_to_analysis.rs`, `predicate_abstraction.rs`, `dominance_analysis.rs` |
| `verum_smt`          | Capability-routed SMT layer: portfolio executor over a pluggable solver-adapter trait, certificate store, proof-replay bridge, refinement / dependent / exhaustiveness backends, cubical tactics, separation-kernel bridge. The backend interface is solver-agnostic; concrete adapters live behind feature flags. | `capability_router.rs`, `portfolio_executor.rs`, `solver_adapters.rs`, `solver_capability.rs`, `proof_search.rs`, `cubical_tactic.rs`, `cert_store.rs`, `refinement_backend.rs`, `dependent_backend.rs`, `exhaustiveness_backend.rs`, `separation_kernel_bridge.rs` |
| `verum_verification` | Hoare logic, VCGen, gradual verification levels, tactic evaluation, dependent verifier, certificate replay, kernel re-check entry point. | `hoare_logic.rs`, `vcgen.rs`, `level.rs`, `proof_validator.rs`, `tactic_evaluation.rs`, `dependent_verification.rs`, `cert_replay.rs`, `kernel_recheck.rs`, `passes/` |
| `verum_kernel`       | **LCF-style trusted kernel — sole member of the TCB.** Proof-term checker (`proof_checker.rs` + NbE / meta variants), axiom registry, IOU framework-citation registry, canonical-rule battery, intrinsic dispatch, soundness exporters for Lean / Coq / Isabelle / Agda, differential checker, separation logic, cubical primitives. Audit budget: a single reviewer in one session. | `proof_checker.rs`, `proof_checker_nbe.rs`, `proof_checker_meta.rs`, `proof_tree.rs`, `axiom.rs`, `kernel_registry.rs`, `canonical_battery.rs`, `intrinsic_dispatch.rs`, `differential.rs`, `soundness/` (lean / coq / isabelle / agda backends + corpus export) |
| `verum_core`         | Typed pipeline IR — the stable contract between `verum_ast` and `verum_kernel`. Was extracted so verification stages stop re-deriving the same IR-level facts from raw AST nodes. | `expr.rs`, `ty.rs`, `module.rs`, `obligation.rs` |
| `verum_diagnostics`  | Error formatting, spans, labels, code frames. | `diagnostic.rs` |
| `verum_modules`      | Module resolution, parallel loader, coherence checker, cog resolver, file-mount handling, refinement-info propagation, visibility & export tables. | `loader.rs`, `resolver.rs`, `coherence.rs`, `parallel.rs`, `cog_resolver.rs`, `file_mount.rs`, `exports.rs`, `imports.rs`, `visibility.rs` |

## Layer 3 — Execution (VBC-first)

| Crate | Purpose | Key files |
|-------|---------|-----------|
| `verum_vbc`     | Verum Bytecode: instruction set, serialiser/deserialiser, archive (`.vbca`) format, interpreter (Tier 0), per-target codegen from the typed IR, monomorphiser, intrinsics table, FFI shims, in-memory linker, CBGR runtime checks. | `instruction.rs`, `bytecode.rs`, `module.rs`, `archive.rs`, `serialize.rs`, `deserialize.rs`, `interpreter/`, `codegen/`, `intrinsics/`, `mono/`, `linker.rs`, `cbgr.rs`, `cbgr_analysis.rs`, `value.rs`, `validate.rs` |
| `verum_codegen` | LLVM (CPU, Tier 1) and MLIR (GPU, `@device(gpu)`) backends. Lowers VBC into either path; LLVM side covers syscall registry, target-triple gating, register/SIMD/MMIO/interrupt IR, codegen-side runtime helpers; MLIR side covers AOT, JIT, dialect plumbing, GPU binary emission. | `llvm/vbc_lowering.rs`, `llvm/instruction.rs`, `llvm/target_triple.rs`, `llvm/syscall_registry.rs`, `llvm/runtime.rs`, `mlir/vbc_lowering.rs`, `mlir/aot/`, `mlir/jit/`, `mlir/dialect/`, `link.rs`, `proof_export.rs` |

## Layer 4 — Orchestration & tools

| Crate | Purpose | Key files |
|-------|---------|-----------|
| `verum_compiler`    | Compilation pipeline orchestration: phases, derives, hygiene, archive context loader, embedded-stdlib bootstrap, content-addressed storage, incremental compiler, single-module path, staged pipeline, lint engine, semantic query, target spec, linker config, profile system. | `pipeline.rs`, `pipeline/`, `phases/`, `derives/`, `hygiene/`, `passes/`, `archive_ctx_loader.rs`, `archive_metadata.rs`, `embedded_stdlib.rs`, `precompile.rs`, `incremental_compiler.rs`, `staged_pipeline.rs`, `core_loader.rs`, `linker_config.rs`, `lint.rs`, `quote.rs` |
| `verum_stdlib_precompiler` | Standalone binary that produces `target/precompiled-stdlib/runtime.vbca` and its `core_metadata` companion. Invoked by `verum_compiler/build.rs` when the cached archive's blake3 checksum is stale. Stays out of `verum_cli` to avoid the chicken-and-egg of a CLI that needs an embedded archive in order to build. | `main.rs` |
| `verum_lsp`         | Language Server Protocol implementation (LSP 3.17): completion, diagnostics, hover, code actions, semantic tokens, refinement validation, exhaustiveness hints, CBGR hints, inline values, type hierarchy, workspace index, script-mode parsing. | `backend.rs`, `completion.rs`, `quick_fixes.rs`, `diagnostics.rs`, `hover.rs`, `exhaustiveness.rs`, `cbgr_hints.rs`, `refinement_validation.rs`, `semantic_tokens.rs`, `workspace_index.rs`, `script/` |
| `verum_dap`         | Debug Adapter Protocol server. | `adapter.rs`, `server.rs`, `session.rs`, `variables.rs` |
| `verum_interactive` | REPL and Playbook TUI; reuses the LSP analysis layer for interactive feedback. | `playbook/`, `execution/`, `discovery/`, `output/` |
| `verum_cli`         | Command-line frontend (binary `verum`). Houses every subcommand: `build`, `run`, `test`, `check`, `lint`, `fmt`, `lsp`, `dap`, `playbook`, `repl`, `bench`, `audit`, `audit_gate`, `cache`, `cog_*`, `cubical`, `doc`, `doctor`, `explain`, `export`, `extract`, `fuzz`, `import`, `init`, `lex_mask`, `lint_*`, `llm_tactic`, `owl2`, `proof_*`, `property`, `publish`, `search`, `smt_check`, … | `main.rs`, `commands/` |
| `verum_integration_tests` | Workspace-wide end-to-end integration suite. | — |

## External bindings

The `crates/llvm/` sub-workspace contains the in-tree LLVM/MLIR
bindings — Verum does **not** use `inkwell` or `melior`; the
LLVM/MLIR surface is owned in-tree so the compiler can pin
exactly the LLVM 21.x API it relies on.

| Crate | Purpose |
|-------|---------|
| `cvc5-sys`            | FFI bindings to one of the external SMT solver backends, with optional vendored static link. Solver-side adapters are feature-gated; the SMT layer itself is solver-agnostic. |
| `verum_llvm_sys`      | Low-level FFI bindings to LLVM and LLD, built from local sources. |
| `verum_llvm`          | Safe Rust wrapper over `verum_llvm_sys` with fine-grained optimisation control. |
| `verum_llvm_derive`   | Procedural macros for `verum_llvm`. |
| `verum_mlir_sys`      | Low-level FFI bindings to the MLIR C API. |
| `verum_mlir`          | Safe Rust bindings over `verum_mlir_sys`. |
| `verum_mlir_macro`    | Procedural macros for `verum_mlir`. |
| `verum_tblgen`        | Safe Rust bindings to TableGen. |

The current release ships solver adapters for two external SMT
backends in a portfolio configuration; this is an implementation
choice, not a language guarantee — a future release will move to
an in-tree solver and the adapter set may shrink accordingly.

## Build order

`cargo` resolves the dependency DAG automatically; the
conceptual order is:

```
1. verum_common, verum_error
2. verum_ast, verum_lexer, verum_syntax, verum_diagnostics
3. verum_protocol_types
4. verum_fast_parser, verum_parser
5. verum_core, verum_kernel
6. verum_types, verum_cbgr, verum_smt, verum_modules
7. verum_verification, verum_vbc
8. verum_codegen
9. verum_compiler
10. verum_stdlib_precompiler  (build-time tool, invoked by verum_compiler/build.rs)
11. verum_lsp, verum_dap, verum_interactive, verum_cli
```

The LLVM/MLIR sub-workspace under `crates/llvm/` builds in its
own internal order (`*_sys` → `*_derive` / `*_macro` → safe
wrappers) and is consumed by `verum_codegen`. `cvc5-sys` is
consumed by `verum_smt` and feature-gated so a build without the
CVC5 source tree still compiles in stub mode.

## See also

- **[Architecture overview](/docs/architecture/overview)** — how the
  crates compose into the five-layer pipeline.
- **[Compilation pipeline](/docs/architecture/compilation-pipeline)**
  — phases in execution order.
- **[Trusted kernel](/docs/architecture/trusted-kernel)** —
  what is and is not in the TCB, and how `verum_kernel` stays
  small in spite of supporting Lean / Coq / Isabelle / Agda
  re-checking.
- **[CBGR internals](/docs/architecture/cbgr-internals)** —
  the analysis suite inside `verum_cbgr`.
- **[VBC bytecode](/docs/architecture/vbc-bytecode)** —
  the format and interpreter at the heart of `verum_vbc`.
