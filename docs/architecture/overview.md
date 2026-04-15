---
sidebar_position: 1
title: Architecture Overview
---

# Architecture Overview

The Verum compiler is a 33-crate workspace organised into five layers.
This section describes how the pieces fit together.

## The big picture

```
Source (.vr)
  │
  ▼
┌────────────────────────────────────────────────────┐
│ Layer 1 — Parsing                                  │
│   verum_lexer (logos) → verum_fast_parser          │
│                      ↓                             │
│                   AST                              │
└────────────────────────────────────────────────────┘
  │
  ▼
┌────────────────────────────────────────────────────┐
│ Layer 2 — Type System                              │
│   verum_types (infer, unify, refinement, cubical)  │
│   verum_cbgr  (escape, NLL, tier analysis)         │
│   verum_smt   (Z3/CVC5 routing, proof search)      │
└────────────────────────────────────────────────────┘
  │
  ▼
┌────────────────────────────────────────────────────┐
│ Layer 3 — Execution (VBC-first)                    │
│   verum_vbc          (bytecode, interpreter)       │
│   verum_codegen      (VBC → LLVM / MLIR)           │
│   verum_verification (Hoare, WP, tactics)          │
└────────────────────────────────────────────────────┘
  │
  ▼
┌────────────────────────────────────────────────────┐
│ Layer 4 — Tools                                    │
│   verum_cli, verum_lsp, verum_interactive          │
└────────────────────────────────────────────────────┘
```

Layer 0 is `verum_common` — shared data structures.

## Key crates

| Crate | Role | LOC |
|-------|------|-----|
| `verum_compiler` | Orchestrates all phases | 134 K |
| `verum_types` | Type system (2.66 M in `infer.rs` alone) | 166 K |
| `verum_vbc` | Bytecode + interpreter | 183 K |
| `verum_smt` | SMT integration (Z3 + CVC5) | 101 K |
| `verum_codegen` | LLVM / MLIR | 79 K |
| `verum_fast_parser` | Main parser | 1.3 M |
| `verum_cbgr` | Memory safety analysis | 38 K |
| `verum_verification` | Hoare logic, tactics | 47 K |
| `verum_cli` | Command-line tool | 24 K |
| `verum_lsp` | Language server | 24 K |

## What's implemented

**Production-ready**:
- Bidirectional type inference, refinement types, dependent types,
  cubical / HoTT.
- Z3 + CVC5 dual SMT backends with capability routing.
- VBC bytecode with 200+ opcodes; interpreter with 39 handler files.
- LLVM AOT codegen (1.1 M LOC in `instruction.rs`).
- CBGR memory safety with escape analysis.
- Full LSP feature set; Playbook TUI; REPL.
- 33 CLI commands.

**Phase D (complete but newer)**:
- Cubical normaliser with computational univalence.
- VBC cubical codegen (`CubicalExtended` opcode, 17 sub-ops).
- Coinductive productivity analysis.
- Proof-carrying bytecode.

**Experimental** (implemented, not default):
- MLIR JIT backend.
- Exotic type theories (linear logic, modal types, SDG).
- Full separation logic in verification.

## Documents in this section

- **[Compilation pipeline](/docs/architecture/compilation-pipeline)**
  — the 9 phases from source to binary.
- **[VBC bytecode](/docs/architecture/vbc-bytecode)** — the
  intermediate representation.
- **[Runtime tiers](/docs/architecture/runtime-tiers)** — interpreter
  vs AOT, GPU path, async scheduler.
- **[CBGR internals](/docs/architecture/cbgr-internals)** — the
  memory-safety runtime.
- **[Codegen](/docs/architecture/codegen)** — LLVM and MLIR backends.
- **[SMT integration](/docs/architecture/smt-integration)** — how Z3
  and CVC5 are wired in.
- **[Crate map](/docs/architecture/crate-map)** — every crate with a
  one-line summary.
