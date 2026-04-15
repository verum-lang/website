---
sidebar_position: 1000
title: Roadmap
description: Where Verum is today, what ships next, what's further out.
slug: /roadmap
---

# Roadmap

Verum is **version 0.32** (phase-D complete) — production-ready for
the core language. This page describes what's shipped, what's in
progress, and what's on the horizon.

## Design principle

The roadmap is **dependency-driven**, not calendar-driven. Each
milestone unblocks a specific class of users; dates are estimates.

## Current state — v0.32 (phase D)

Production-ready:

- **Type system**: bidirectional inference, refinement types (three
  syntactic forms), dependent types (Σ / Π / path), cubical HoTT
  normaliser with computational univalence, higher-kinded types,
  protocol specialisation, existentials, GATs.
- **Memory**: three-tier CBGR with generation + epoch tracking,
  11.8–14.5 ns per check, escape analysis, promotion to
  `&checked T`.
- **Verification**: gradual from `@verify(runtime)` through
  `@verify(thorough)` to `@verify(certified)`; Z3 + CVC5 with
  capability-based routing; proof extraction; cache with 60–70%
  hit rate.
- **Concurrency**: `async fn`, `.await`, structured concurrency via
  `nursery`, supervision trees, channels (MPSC / broadcast / oneshot),
  work-stealing executor.
- **VBC bytecode**: 200+ opcodes, full interpreter, LLVM AOT path
  (0.85–1.00× of C), MLIR JIT path (experimental).
- **Stdlib**: ~800 K LOC across `core/` — `base`, `collections`,
  `text`, `mem`, `async`, `sync`, `runtime`, `io`, `time`, `sys`,
  `term`, `net`, `math`, `simd`, `meta`, `proof`, `mathesis`,
  `context`, `security`, foundations (`eval` / `control` /
  `concurrency` / `logic`).
- **Tooling**: CLI (33+ commands), LSP 3.17 with refinement hints,
  DAP debugger, Playbook TUI, REPL, `verum fmt`, `verum lint`,
  package registry.

Conformance: **1506 / 1507** VCS checks pass (99.93%).

## Currently shipping (next minor)

Near-term items already underway for **v0.33**:

- **Parallel compilation orchestrator** — Phase 1–9 coordinator
  runs on a worker pool (currently per-phase parallel within a
  serial outer loop). Target: 2–4× cold-build speedup on large
  projects.
- **Stdlib lazy loading** with persistent disk cache — `core/` is
  currently parsed from source on every build start; the cache
  materialises parsed ASTs but in-memory reloading remains O(stdlib).
- **GPU production path end-to-end** — MLIR + GPU dialect
  infrastructure is complete; production deployment requires
  finalising device selection + runtime dispatch.
- **`.cog` archive format v2** — streaming load, incremental
  verification.

## Medium-term (6–12 months)

- **Proof-carrying modules at the ecosystem scale** — cogs carry
  machine-checked certificates across the registry; consumers can
  audit or re-verify without running the full compiler.
- **IDE-driven proof authoring** — inline solver interaction,
  proof-of-the-day for unproved obligations, visual counter-examples.
- **Deterministic replay** for `@verify(certified)` builds —
  byte-identical binaries across machines given the same toolchain
  version.
- **WebAssembly as a first-class target** — WASM component-model
  output, browser-native debugging via DAP, stdlib profile for
  WASM (no threads, no filesystem).
- **Embedded profile maturation** — tested on Cortex-M33, RV32IMAC;
  `no_async` runtime with cooperative scheduling.
- **Distributed compilation cache** — shared `.verum-cache/` across
  team members, with content-addressed deduplication.

## Long-term (1–3 years)

- **Incremental proof** — proof fragments reuse across edits so
  re-verification is proportional to the delta, not the whole
  obligation.
- **Effect-polymorphic protocol methods** — fine-grained effect
  rows that unify with context clauses.
- **Quantum-safe cryptography in `core::crypto`** — ML-KEM / ML-DSA
  as first-class primitives alongside ECDSA / Ed25519.
- **Self-hosting** — Verum compiler written in Verum. Currently
  Rust + LLVM; self-hosting requires a mature meta-compilation
  path. This is not a priority for ergonomic reasons but is
  technically tractable.
- **Formalised operational semantics** in the `mathesis` module —
  the language semantics expressed as a theory object that
  Mathesis tooling can translate.

## Research directions (exploratory)

- **Cubical agda-style sub-proofs** inside SMT queries — a hybrid
  tactic that dispatches the decidable fragment to the solver and
  the equational remainder to the cubical normaliser.
- **Graded modalities for resource types** — beyond linear /
  affine, general graded substructural types (e.g., "use up to N
  times").
- **Algebraic effects** as syntactic sugar over the context system.
- **Dependent pattern matching with unification** à la Agda's
  forced patterns.

## Explicit non-goals

- **Fully automated verification of arbitrary specifications** —
  undecidability is real; `@verify(certified)` will always require
  user intervention for hard theorems.
- **Garbage collection** — CBGR is the memory model. Pauses are
  unacceptable in systems contexts.
- **Implicit everything** — the language's core premise is that
  hidden state is harmful. We will not add reflection that
  reaches into private state, ambient globals, or async "just
  works" magic.
- **C++ ABI** — C is the FFI boundary. C++ wrapping via shim libraries.

## How to influence the roadmap

- **Use cases & pain points**: open issues / discussions on
  [GitHub](https://github.com/verum-lang/verum).
- **RFCs**: for anything touching the language or stdlib surface.
  Template at `docs/rfcs/TEMPLATE.md`.
- **Pull requests**: see [Contributing](/docs/community/contributing).

## Version history

- **v0.32** — phase D complete. Documented here.
- **v0.31** — cubical HoTT normaliser; VBC `CubicalExtended` opcode.
- **v0.30** — portfolio verification (Z3 + CVC5).
- **v0.25** — dependent types; Σ / Π surface syntax.
- **v0.20** — refinement-type SMT integration.
- **v0.15** — VBC-first architecture; LLVM AOT path.
- **v0.10** — three-tier reference model; CBGR.
- **v0.05** — type system skeleton; parser.
- **v0.01** — lexer; initial grammar; `main` prints "hello".

See [Changelog](/docs/changelog) for per-release detail.
