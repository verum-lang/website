---
sidebar_position: 1000
title: Roadmap
description: Where Verum is today, what ships next, what's further out.
slug: /roadmap
---

# Roadmap

Verum is distributed as a **single self-contained binary** per
platform — compiler, interpreter, linker, LSP, formatter, package
manager included. This page describes what has shipped, what is in
progress, and what is planned.

## Design principle

The roadmap is **dependency-driven**, not calendar-driven. Each
milestone unblocks a specific class of users; dates are estimates.

## Current state — v0.32

Production-ready:

- **Type system**: bidirectional inference, refinement types (three
  syntactic forms), dependent types (Σ / Π / path), cubical HoTT
  normaliser with computational univalence, higher-kinded types,
  protocol specialisation, existentials, GATs.
- **Memory**: three-tier CBGR with generation + epoch tracking,
  **1.2–1.7 ns per check** (re-measured 2026-09-05, `verum_cbgr`'s
  `production_targets` bench: 1.61 ns valid, 1.69 ns
  `generation_and_epoch_check`, 1.20 ns invalid, 1.25 ns per check in a
  100-check batch; target is ≤ 15 ns), escape analysis, promotion to
  `&checked T`.

  Two superseded figures, kept named so neither reappears: this line
  carried **~0.93 ns** until 2026-09-06, which the re-measurement above
  contradicts on the very bench it cited, and **11.8–14.5 ns** before
  that, which is the figure from the optimisation the changelog records
  and is still correct there as history. The 2026-09-05 run was taken on
  a loaded machine, so these are floors rather than clean numbers —
  stated rather than hidden, and worth re-running before quoting
  anywhere a reader will act on them.
- **Verification**: gradual from `@verify(runtime)` through
  `@verify(thorough)` to `@verify(certified)`; SMT layer with
  capability-based routing; proof extraction; a subsumption cache.

  The **60–70% hit rate** this line carried is removed rather than
  updated. It cites no run, and the only figure in the tree —
  `verum_verification/src/subsumption.rs` — is `> 90%` written as a
  TARGET in a module comment, not a measurement. Two numbers that
  disagree and neither of which came from a run is worse than none.
- **Concurrency**: `async fn`, `.await`, structured concurrency via
  `nursery`, supervision trees, channels (MPSC / broadcast / oneshot),
  work-stealing executor.
- **VBC bytecode**: 250 primary opcodes plus 863 sub-ops across 20
  extended tables (1113 total, counted 2026-09-06),
  full interpreter (**62**-file dispatch table, counted 2026-09-06 —
  this line said 37), LLVM AOT path (native-C parity bar), MLIR GPU
  path.
- **Stdlib**: a substantial `.vr` tree across `core/` — `base`,
  `collections`, `text`, `mem`, `async`, `sync`, `runtime`, `io`,
  `time`, `sys`, `term`, `net`, `math`, `simd`, `meta`, `proof`,
  `theory_interop`, `context`, `security`, foundations
  (`eval` / `control` / `concurrency` / `logic`).
- **Single binary**: all tools ship in one `verum` executable — LSP
  3.17 with refinement hints, DAP debugger, Playbook TUI, REPL,
  formatter, linter, package manager.

Conformance: the suite is **7136 spec files** as of 2026-09-06 —
3129 L0-critical, 1528 L2-standard, 702 L1-core, 345 L3-extended,
91 L4-performance, and 1341 outside the level tree.

**The pass RATE on this page was stale and is not replaced with a
guess.** It read "1506 / 1507 checks pass (99.93%)", a denominator that
matches no level and no total the suite now has; it was true of a
smaller suite and has not been re-run since. A percentage carried
forward past the corpus it was measured on is worse than no percentage,
because it reads as current.

The living truth is `docs/architecture/tech-debt-register.md` plus
`core-tests/INVENTORY.md` in the repository, and a fresh figure belongs
here only with the date of the run that produced it.

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
- **Quantum-safe cryptography in `core.crypto`** — ML-KEM / ML-DSA
  as first-class primitives alongside ECDSA / Ed25519.
- **Self-hosting** — Verum compiler written in Verum. Currently
  Rust + LLVM; self-hosting requires a mature meta-compilation
  path. This is not a priority for ergonomic reasons but is
  technically tractable.
- **Formalised operational semantics** exposed through
  `core.theory_interop` — the language semantics expressed as
  a theory object that interoperability tooling can translate
  between proof assistants.

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
  the project repository.
- **RFCs**: for anything touching the language or stdlib surface.
  Template at `docs/rfcs/TEMPLATE.md` — not present yet.
- **Pull requests**: see [Contributing](/docs/community/contributing).

## Version history

- **v0.32** — current stable release. Documented here.
- **v0.31** — cubical HoTT normaliser; VBC `CubicalExtended` opcode.
- **v0.30** — portfolio verification across multiple solver adapters.
- **v0.25** — dependent types; Σ / Π surface syntax.
- **v0.20** — refinement-type SMT integration.
- **v0.15** — VBC-first architecture; LLVM AOT path.
- **v0.10** — three-tier reference model; CBGR.
- **v0.05** — type system skeleton; parser.
- **v0.01** — lexer; initial grammar; `main` prints "hello".

See [Changelog](/docs/changelog) for per-release detail.
