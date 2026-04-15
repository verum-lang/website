---
sidebar_position: 1
title: Tutorials
description: Multi-step guided builds. Go from zero to a working program.
slug: /tutorials
---

# Tutorials

Longer, step-by-step builds. Each tutorial produces a runnable
program and teaches a coherent slice of the language.

**Prerequisites**: [Installation](/docs/getting-started/installation)
and [Language tour](/docs/getting-started/tour).

Looking for short task-oriented snippets? See **[Cookbook](/docs/cookbook)**.

## For beginners

- **[Build a typed CLI tool](/docs/tutorials/cli-tool)** —
  parse arguments, read a config file, generate output. **30 min.**
  *Covers: `Result`, context, file I/O, error reporting, testing.*

## For applications

- **[Build a verified HTTP service](/docs/tutorials/http-service)** —
  a tiny URL shortener with refinement-typed routes,
  context-injected storage, and structured concurrency. **60 min.**
  *Covers: routing, refinements, `nursery`, `Semaphore`-bounded
  workers, testing with provided mocks, `@verify(formal)` with loop
  invariants.*

## For libraries

- **[Write a parser from scratch](/docs/tutorials/parser)** —
  combinator-style parsing for a small arithmetic DSL. **45 min.**
  *Covers: function types, `Maybe`-based success/failure,
  combinator composition, recursive AST with `Heap<T>`, property
  testing.*

## For systems

- **[A verified data structure](/docs/tutorials/verified-data-structure)** —
  implement a sorted-list and prove the sort invariant with
  `@verify(formal)`. **60 min.**
  *Covers: refinement reflection, invariants, `@logic`, loop invariants.*

## For concurrency

- **[An async pipeline with backpressure](/docs/tutorials/async-pipeline)** —
  fan-out-fan-in with bounded channels, retry, and graceful shutdown.
  **55 min.**
  *Covers: channels, `select`, `Semaphore`, supervisor,
  signal-handling, refinement-typed stage contracts.*

## For ML / numerics

- **[Train a small neural net](/docs/tutorials/small-nn)** —
  MNIST classifier using `math.nn` with autodiff. **45 min.**
  *Covers: tensors, static shapes, `autodiff::value_and_grad`,
  `nn::Linear`, `AdamW`, training loop, shape verification.*
