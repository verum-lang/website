---
sidebar_position: 1
title: Architecture Overview
---

# Architecture Overview

Verum is a **VBC-first** compiler: every program lowers to Verum
Bytecode, and VBC is either interpreted (Tier 0) or compiled to
native code via LLVM (Tier 1). A separate MLIR path emits GPU binaries
for `@device(gpu)` code. The compiler is a 24-crate Rust workspace
(~1.36 M LOC) organised into five layers.

## The big picture

```
Source (.vr)
  │
  ▼
┌──────────────────────────────────────────────────────────┐
│ Layer 0 — Foundation                                     │
│   verum_common, verum_error                              │
└──────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────┐
│ Layer 1 — Parsing                                        │
│   verum_lexer (logos) → verum_fast_parser                │
│   verum_ast · verum_syntax (lossless tree)               │
└──────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────┐
│ Layer 2 — Type system + verification                     │
│   verum_types  (infer, unify, refinement, cubical)       │
│   verum_cbgr   (11-module reference-analysis suite)      │
│   verum_smt    (Z3 + CVC5, capability router)            │
│   verum_verification (VCGen, Hoare, tactics)             │
│   verum_modules (resolver, coherence, parallel loader)   │
└──────────────────────────────────────────────────────────┘
  │ TypedAST
  ▼
┌──────────────────────────────────────────────────────────┐
│ Layer 3 — Execution (VBC-first)                          │
│   verum_vbc      (bytecode, interpreter, codegen)        │
│   verum_codegen  (LLVM for CPU, MLIR for GPU)            │
└──────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────┐
│ Layer 4 — Orchestration & tools                          │
│   verum_compiler (pipeline, derives, hygiene)            │
│   verum_toolchain · verum_cli · verum_lsp · verum_dap   │
│   verum_interactive (REPL + Playbook TUI)                │
└──────────────────────────────────────────────────────────┘
  │
  ▼
Executable / interpreted result
```

## Key crates at a glance

Numbers are measured from `verum-lang/verum/crates/`.

| Crate | Role | LOC |
|-------|------|----:|
| `verum_types` | Type system (inference, refinement, cubical) | 221 K |
| `verum_vbc` | Bytecode, interpreter, VBC codegen, monomorphization | 192 K |
| `verum_compiler` | Phase orchestration, derives, linker config | 161 K |
| `verum_smt` | Z3 + CVC5, capability router, portfolio executor | 139 K |
| `verum_cbgr` | 11-module reference-tier analysis suite | 103 K |
| `verum_fast_parser` | Main recursive-descent parser | 89 K |
| `verum_codegen` | LLVM (CPU) + MLIR (GPU) backends | 81 K |
| `verum_verification` | VCGen, Hoare logic, tactic evaluator | 59 K |
| `verum_parser` | Legacy parser (partial, being phased out) | 49 K |
| `verum_ast` | AST definitions | 47 K |
| `verum_lsp` | Language server (LSP 3.17) | 33 K |
| `verum_cli` | Command-line frontend (35 commands) | 32 K |

See **[crate map](/docs/architecture/crate-map)** for every crate with
LOC and key files.

## Pipeline summary

```
0  stdlib  →  1 parse  →  2 meta registry  →  3 expand
                                              ↓
          3a contracts (SMT)  ←───────────────┘
                  ↓
          4 semantic + CBGR  →  4a autodiff  →  4b context
                  ↓
          5 VBC codegen  →  6 monomorphization
                  ↓
          7 execute (Tier 0 interp  ·  Tier 1 AOT)
                  ↓
          7.5 link (AOT only)
```

MIR is **not** in the main pipeline — it exists only to serve the SMT
verifier and advanced optimisation passes. Full phase detail:
**[compilation pipeline](/docs/architecture/compilation-pipeline)**.

## What's implemented today

### Production-ready

- Bidirectional type inference with dataflow-sensitive narrowing.
- Refinement types with SMT discharge; `@verify(formal|thorough|certified)`.
- Dependent types — Π, Σ, path types, computational univalence.
- Cubical normaliser with HoTT primitives and HITs.
- Z3 + CVC5 dual-backend SMT with a capability router that classifies
  by theory and picks the right solver.
- VBC bytecode with ~350 opcodes (primary + extended tables) and a
  37-file dispatch-table interpreter.
- LLVM AOT codegen with tier-aware CBGR lowering
  (`Ref` / `RefChecked` / `RefUnsafe`).
- CBGR memory safety — 11 analysis modules (escape, NLL, Polonius,
  points-to, SMT-alias, …) feeding per-reference tier decisions.
- Module system: 5-level visibility, coherence (orphan + overlap +
  specialisation), cycle-break strategy ranking, parallel loading.
- Structured concurrency: `async`, `await`, `spawn`, `nursery`,
  work-stealing executor.
- LSP 3.17 server, DAP debug server, Playbook notebook TUI, REPL.
- 35 CLI commands covering the full project lifecycle.

### Newer but validated

- MLIR GPU path (verum.tensor → linalg → gpu → PTX / HSACO / SPIR-V /
  Metal) triggered by `@device(gpu)`.
- Proof-carrying VBC archives with Coq / Lean / Dedukti / Metamath
  export.
- Autodiff (VJP) generation for `@differentiable` functions.
- Coinductive types with productivity analysis.

### Experimental

- CPU path through MLIR (LLVM remains the default for CPU).
- Advanced refinement reflection with quantifier instantiation hints.
- Separation-logic extensions in `verum_verification`.

## What's next

- Parallel-compilation orchestrator end-to-end (per-phase work stealing).
- Proof-carrying modules at the cog-distribution boundary.
- WASM target for the browser playground.
- Incremental proof replay (edit one function, revalidate only the
  affected obligations).

See **[roadmap](/docs/roadmap)** for the full plan.

## Documents in this section

- **[Compilation pipeline](/docs/architecture/compilation-pipeline)**
  — phases 0 through 7.5 in detail.
- **[VBC bytecode](/docs/architecture/vbc-bytecode)** — opcode map,
  module format, interpreter.
- **[Runtime tiers](/docs/architecture/runtime-tiers)** — Tier 0
  interpreter vs Tier 1 AOT, GPU dual-path, async scheduler.
- **[CBGR internals](/docs/architecture/cbgr-internals)** — header
  layout, capability bits, VBC tier opcodes, MLIR dialect.
- **[Codegen](/docs/architecture/codegen)** — LLVM (CPU) and MLIR
  (GPU) backends.
- **[SMT integration](/docs/architecture/smt-integration)** — how Z3
  and CVC5 are wired in.
- **[Verification pipeline](/docs/architecture/verification-pipeline)**
  — Phase 3a + Phase 4 solver internals.
- **[Incremental compilation](/docs/architecture/incremental-compilation)**
  — fingerprinting and cache strategy.
- **[Execution environment (θ+)](/docs/architecture/execution-environment)**
  — per-task unified memory / capabilities / recovery / concurrency.
- **[Crate map](/docs/architecture/crate-map)** — every crate with a
  one-line summary.
