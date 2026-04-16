---
sidebar_position: 1
title: Architecture Overview
description: The five-layer architecture of the Verum compiler — VBC-first, dual-backend SMT, three-tier runtime.
---

# Architecture Overview

Verum is a **VBC-first** compiler: every program lowers to Verum
Bytecode, and VBC is either interpreted (Tier 0) or compiled to
native code via LLVM (Tier 1). A separate MLIR path emits GPU binaries
for `@device(gpu)` code. The compiler is a 24-crate Rust workspace
(~1.36 M LOC) organised into five layers.

## Reading paths

Depending on why you're here:

- **Just want to use Verum?** Skip this section. Go to
  [language/overview](/docs/language/overview).
- **Curious about the internals?** Read this page, then
  [compilation pipeline](/docs/architecture/compilation-pipeline),
  then [VBC bytecode](/docs/architecture/vbc-bytecode).
- **Contributing to the compiler?** Read this page, then
  [crate map](/docs/architecture/crate-map),
  then the crate whose area you're touching.
- **Debugging a compiler issue?** Find the likely crate in the
  [crate map](/docs/architecture/crate-map) and follow its `Key files`
  column.
- **Writing a tool (fuzzer, linter, translator)?** Read
  [VBC bytecode](/docs/architecture/vbc-bytecode) — VBC is the
  stable intermediate.

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

## Invariants of the system

These invariants hold across every code path and every phase. If you
find an exception, it is almost certainly a bug:

### 1. VBC is the single intermediate

Every source program compiles to VBC. Nothing — not the interpreter,
not LLVM, not the verifier — looks at the AST to produce output.
Bypassing VBC would fragment semantics and is a hard-banned design
direction.

### 2. Verification is monotone up the ladder

If a function passes `@verify(formal)`, it passes every looser
strategy (`static`, `runtime`). Upgrading a function's strategy never
makes it suddenly valid — only invalid. Callers can safely rely on
the tighter guarantees of their callees.

### 3. CBGR demotions are explicit

The compiler may **promote** `&T` to `&checked T` silently (escape
analysis succeeded). It may never **demote** silently — a tier-2
`&unsafe T` always requires an `unsafe` block at the source level.

### 4. Contexts propagate; they are never ambient

A function's `using [...]` clause is authoritative. A callee cannot
acquire a context the caller didn't provide. A spawned task
inherits the parent's context stack by default, but explicit forward
(`spawn using [...]`) drops everything else.

### 5. No hidden allocation

Every allocation is explicit: `Heap(x)`, `Shared.new(x)`, collections
with a `with_capacity(n)` form, or the arena pool API. The compiler
does not insert allocations behind the scenes.

### 6. Exhaustiveness is checked

Every `match` is exhaustive. Non-exhaustive patterns are compile
errors, not runtime panics. Active patterns are opaque — a
catch-all `_ => ...` is required when they're the only alternatives.

### 7. Effects are visible in the type

`async fn`, `throws(E)`, `using [IO]` — all effects appear in the
function type. A call site can tell exactly what a function does
without opening the body. The type system refuses to hide them.

## Data flow across layers

```
.vr source
   │
   │  lex + parse (Layer 1)
   ▼
Red-green tree (lossless syntax) ─────┐
   │                                  │
   │  AST extraction                  │ preserved for LSP,
   ▼                                  │ rename, format, and
Abstract syntax tree ─┐               │ structured edits
   │                  │               │
   │  resolve +       │               │
   │  modules         │               │
   ▼                  │               │
Name-resolved AST ────┼───────────────┘
   │                  │
   │  type inference  │
   ▼                  │
TypedAST ─────────────┼── CBGR analysis
   │                  │   (parallel with typecheck)
   │  refinement +    │
   │  SMT discharge   │
   ▼                  │
VerifiedAST           │
   │                  │
   │  macro expansion │
   │  + hygiene       │
   ▼                  │
Expanded AST ─────────┼── monomorphisation
   │                  │   (parallel)
   │  VBC lowering    │
   ▼                  │
VBC modules ──────────┼── Tier 0: interpret directly
   │                  │   Tier 1: LLVM IR → native
   │                  │
   ▼                  │
Executable / .cog archive
```

Each arrow is a compiler phase implemented in the corresponding
crate. The arrows on the right are **parallel passes** that feed
into the main lowering.

## Key design decisions (and why)

### Why VBC as the stable IR?

A stable bytecode gives:
- A **single lowering** from source to execution; no fork between
  interpreted and compiled paths.
- A **tooling surface** for inspectors, disassemblers, fuzzers, and
  cross-crate caches.
- **Proof-carrying distribution** — cogs ship as `.cog` archives
  containing VBC plus optional proof certificates; validators can
  recheck without re-parsing Verum source.

### Why dual-backend SMT?

Z3 excels at linear arithmetic, arrays, and quantifier-free
fragments. CVC5 excels at strings, bitvectors with interpretation,
and theory combinations. The capability router classifies each
obligation's theory and dispatches — better coverage than either
solver alone.

### Why three CBGR tiers?

A single tier forces a trade-off: either pay the 15 ns per-deref
(Rust-style lifetimes + runtime checks) or lean on the programmer
(raw pointers). Three tiers let the compiler promote automatically
where safe, ask the programmer where it can't prove safety, and
charge for safety only where it's actually needed.

### Why unified `verum_compiler` phase orchestrator?

Phases have non-trivial dependencies — CBGR needs types but also
narrowed types from guards; macro expansion can produce new types
that restart inference. A single orchestrator with a declarative
phase DAG is easier to reason about than per-crate phase
implementations.

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
