---
sidebar_position: 4
title: Comparisons
---

# How Verum compares

A brief, honest positioning against languages whose ideas Verum borrows
from and whose users Verum is most likely to attract.

## Verum vs Rust

**Shared DNA**: systems focus, strong types, no GC pauses, ownership.

**Verum differs in**:
- **Refinement types**: `Int { self > 0 }` is first class. Rust's
  nearest equivalent is runtime assertions or crates like `typed-builder`.
- **Dependent types**: `type Vec is n: Int, data: [Int; n]` works. Rust has
  only const generics, with significant limitations.
- **SMT-backed verification**: dedicated solver integration. Rust has `kani`
  and `creusot` as external tools; Verum treats the SMT solver as a first-class compiler phase.
- **Three-tier references**: `&T`, `&checked T`, `&unsafe T`. Rust has one
  tier (`&T`), with `unsafe` for escape.
- **No lifetimes in signatures**: CBGR absorbs most of what lifetimes
  encode; signatures are shorter.
- **Semantic type names**: `List`, `Text`, `Map` — not `Vec`, `String`,
  `HashMap`.
- **`@` macros, no `!`**: `@derive(Clone)` replaces `#[derive(Clone)]`.
  `print("x")` is a function; `f"{x}"` is a literal, not a macro.
- **Explicit contexts**: `using [Database]` replaces ambient state /
  thread locals / `once_cell` globals.

**Rust is probably the right choice when**: you need the crates.io
ecosystem today, or you are doing embedded work with a mature
`no_std` story in Rust.

## Verum vs Idris / Agda / Coq / Lean

**Shared DNA**: dependent types, proofs as programs, SMT or tactic-based
verification.

**Verum differs in**:
- **Systems focus**: produces native binaries via LLVM with C-level
  performance, not primarily an interactive theorem prover.
- **Gradual**: a Verum program is not 100% proved; it's proved where it
  needs to be.
- **SMT-first**: many obligations are discharged automatically; tactics
  are reserved for the genuinely hard ones.
- **No built-in termination requirement**: functions need not be total
  by default; `cofix` is explicit for coinduction.

**A proof assistant is probably the right choice when**: you are doing
pure formal mathematics, or you need a total language for a safety kernel.

## Verum vs F\* / Dafny

**Shared DNA**: refinement types, SMT-driven verification, practical
ergonomics.

**Verum differs in**:
- **Dual-solver portfolio**: Z3 and CVC5, with capability-based
  routing. F* is Z3-only; Dafny is Z3-first.
- **Memory model**: CBGR with three-tier references is built into the
  language; Dafny compiles to C#/Java/JS with their GCs.
- **Cubical HoTT**: available for advanced equational reasoning.
- **Structured concurrency**: first-class async with context
  propagation.

## Verum vs Go / Java / Kotlin / Swift

Verum is not competing here. These languages target different
priorities — fast iteration, managed runtimes, broad ecosystems.
Verum will be harder to learn and slower to write initially. The
question is whether the invariants you ship with are worth that cost.

## When Verum is the right call

- Safety-critical systems (kernels, hypervisors, crypto, consensus).
- Protocol implementations where off-by-one means CVE.
- Financial systems where correctness beats time-to-market.
- Research projects that need real compile performance _and_ real proofs.
- Anywhere you currently comment `// SAFETY: ...` and wish a solver
  would check.
