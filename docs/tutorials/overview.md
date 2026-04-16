---
sidebar_position: 1
title: Tutorials
description: Multi-step guided builds. Go from zero to a working program.
slug: /tutorials
---

# Tutorials

Longer, step-by-step builds. Each tutorial produces a runnable program
and teaches a coherent slice of the language. They are designed to be
read **in any order** — each one lists its prerequisites and covers
one conceptual slice well.

**Prerequisites for all tutorials**:
[Installation](/docs/getting-started/installation) and
[Language tour](/docs/getting-started/tour).

Looking for short task-oriented snippets?
See **[Cookbook](/docs/cookbook)**.

## Picking a track

| If you want to learn…                                    | Start with                                                            |
|----------------------------------------------------------|-----------------------------------------------------------------------|
| The language end-to-end via a small project              | **[Typed CLI tool](/docs/tutorials/cli-tool)**                        |
| Refinement types and SMT verification                    | **[Refinement types](/docs/tutorials/refinement-types)**              |
| Pattern matching, `match`, active patterns               | **[Pattern matching](/docs/tutorials/pattern-matching)**              |
| Protocols and trait-like generic programming             | **[Protocols](/docs/tutorials/protocols)**                            |
| Context injection (DI)                                   | **[Context system](/docs/tutorials/context-system)**                  |
| Async runtime, nursery, select                           | **[Async pipeline](/docs/tutorials/async-pipeline)**                  |
| Memory model and the three-tier reference system         | **[Memory safety](/docs/tutorials/memory-safety)**                    |
| Building a non-trivial program (parser, ML)              | **[Parser](/docs/tutorials/parser)** / **[Small NN](/docs/tutorials/small-nn)** |

## For beginners

### [Build a typed CLI tool](/docs/tutorials/cli-tool) — 30 min

Build a small command-line log analyser that reads a config file and
emits a JSON report.

- **Teaches**: `Result`, `?` error propagation, file I/O, context
  injection (`using [FileSystem, IO]`), format strings, unit tests.
- **Assumes**: none.
- **See also**: [cookbook/file-io](/docs/cookbook/file-io),
  [cookbook/json](/docs/cookbook/json),
  [language/error-handling](/docs/language/error-handling).

### [Pattern matching](/docs/tutorials/pattern-matching) — 30 min

Walk through every form of pattern matching by writing a tiny Scheme
interpreter: lex, parse, evaluate.

- **Teaches**: `match`, record patterns, variant destructuring,
  guards (`if` / `where`), `or` and `and` patterns, `is` type tests.
- **Assumes**: none.
- **See also**: [language/patterns](/docs/language/patterns),
  [language/active-patterns](/docs/language/active-patterns),
  [language/destructuring](/docs/language/destructuring).

## For type-theory

### [Refinement types](/docs/tutorials/refinement-types) — 45 min

Implement a ring buffer whose invariants — non-empty, bounded, sorted —
are checked by the SMT solver at compile time, not at runtime.

- **Teaches**: `Int { self > 0 }`, `ensures`, `old(x)`, `@verify(formal)`,
  `invariant` / `decreases` on loops.
- **Assumes**: basic familiarity with `match`.
- **See also**: [language/refinement-types](/docs/language/refinement-types),
  [verification/smt-routing](/docs/verification/smt-routing),
  [cookbook/refinements](/docs/cookbook/refinements).

### [Protocols](/docs/tutorials/protocols) — 45 min

Build a small serialisation framework: define a `Serialize` protocol,
implement it for core types, derive it for user types.

- **Teaches**: `type X is protocol { ... }`, `implement ... for ...`,
  associated types, generic bounds, protocol extension via `extends`,
  `@derive`.
- **Assumes**: generics.
- **See also**: [language/protocols](/docs/language/protocols),
  [language/generics](/docs/language/generics),
  [cookbook/write-a-derive](/docs/cookbook/write-a-derive).

## For applications

### [Build a verified HTTP service](/docs/tutorials/http-service) — 60 min

A tiny URL shortener with refinement-typed routes, context-injected
storage, and structured concurrency.

- **Teaches**: routing, refinements, `nursery`, `Semaphore`-bounded
  workers, testing with provided mocks, `@verify(formal)` with loop
  invariants.
- **Assumes**: CLI tutorial (for project structure).
- **See also**: [cookbook/http-server](/docs/cookbook/http-server),
  [language/async-concurrency](/docs/language/async-concurrency).

### [Context system](/docs/tutorials/context-system) — 30 min

Take an existing function and progressively refactor it from
implicit-global-state to fully-explicit `using [...]`.

- **Teaches**: `context`, `provide`, conditional contexts
  (`if cfg.feature`), named/aliased contexts, negative contexts for
  purity proofs.
- **Assumes**: CLI tutorial.
- **See also**: [language/context-system](/docs/language/context-system),
  [`stdlib/context`](/docs/stdlib/context).

## For libraries

### [Write a parser from scratch](/docs/tutorials/parser) — 45 min

Combinator-style parsing for a small arithmetic DSL.

- **Teaches**: function types, `Maybe`-based success/failure,
  combinator composition, recursive AST with `Heap<T>`, property
  testing.
- **Assumes**: generics, patterns.
- **See also**: [cookbook/regex](/docs/cookbook/regex),
  [language/functions](/docs/language/functions).

## For systems

### [A verified data structure](/docs/tutorials/verified-data-structure) — 60 min

Implement a sorted list and prove the sort invariant with
`@verify(formal)`.

- **Teaches**: refinement reflection, invariants, `@logic` functions,
  loop invariants, `decreases` for termination.
- **Assumes**: refinement-types tutorial.
- **See also**: [language/refinement-types](/docs/language/refinement-types),
  [language/proof-dsl](/docs/language/proof-dsl),
  [cookbook/calc-proofs](/docs/cookbook/calc-proofs).

### [Memory safety](/docs/tutorials/memory-safety) — 45 min

Build a self-referential data structure (a doubly-linked list) three
times: with `&T` (tier 0 default), with `&checked T` where escape
analysis admits it, and with `&unsafe T` where you write the proof
obligation yourself.

- **Teaches**: the three-tier reference model, CBGR, generation tags,
  `ThinRef` / `FatRef`, safe interior mutability via `Cell` / `RefCell`,
  escape analysis, when tier 1 is automatic.
- **Assumes**: none (but the ownership story is dense).
- **See also**: [language/memory-model](/docs/language/memory-model),
  [language/references](/docs/language/references),
  [language/cbgr](/docs/language/cbgr),
  [cookbook/arenas](/docs/cookbook/arenas).

## For concurrency

### [An async pipeline with backpressure](/docs/tutorials/async-pipeline) — 55 min

Fan-out-fan-in with bounded channels, retry logic, and graceful
shutdown on a kill signal.

- **Teaches**: channels, `select`, `Semaphore`, supervisor pattern,
  signal-handling, refinement-typed stage contracts, structured
  cancellation, timeout handlers on `nursery`.
- **Assumes**: context-system tutorial.
- **See also**: [language/async-concurrency](/docs/language/async-concurrency),
  [cookbook/channels](/docs/cookbook/channels),
  [cookbook/scheduler](/docs/cookbook/scheduler),
  [cookbook/resilience](/docs/cookbook/resilience).

## For ML / numerics

### [Train a small neural net](/docs/tutorials/small-nn) — 45 min

MNIST classifier using `math.nn` with autodiff.

- **Teaches**: tensors, static shapes, `autodiff::value_and_grad`,
  `nn::Linear`, `AdamW`, training loop, shape verification via
  dependent types.
- **Assumes**: refinement types are helpful but not required.
- **See also**: [`stdlib/math`](/docs/stdlib/math),
  [cookbook/shape-safe](/docs/cookbook/shape-safe).

## What's next after tutorials?

- **[Cookbook](/docs/cookbook)** — short, focused recipes for common
  tasks.
- **[Language reference](/docs/language/overview)** — normative
  descriptions of each feature.
- **[Standard library](/docs/stdlib/overview)** — the complete API
  catalogue.
- **[Architecture](/docs/architecture/overview)** — how the compiler,
  VBC, runtime tiers, and SMT backends fit together.
