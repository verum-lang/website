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

## Available tutorials

### For beginners

- **[Build a typed CLI tool](/docs/tutorials/cli-tool)** —
  parse arguments, read a config file, generate output. 30 minutes.
  *Covers: `Result`, context, file I/O, error reporting, testing.*

### For systems

- **[A verified data structure](/docs/tutorials/verified-data-structure)** —
  implement a sorted-list and prove the sort invariant with
  `@verify(smt)`. 60 minutes.
  *Covers: refinement reflection, invariants, `@logic`, loop invariants.*

## Planned

Tutorials mapped out but not yet written:

- **Build a verified HTTP service** — a tiny URL shortener with
  refinement-typed routes, context-injected storage, and structured
  concurrency. *Covers: routing, refinements, `nursery`, testing with
  provided mocks.*
- **Write a parser from scratch** — combinator-style parsing with
  `&Text` slices and refinement-typed return values.
  *Covers: pattern matching, active patterns, error types.*
- **Train a small neural net** — MNIST classifier using `math.nn`
  with autodiff. *Covers: tensors, `autodiff`,
  `nn::Linear`/`Sequential`, optimiser loop.*
- **An async pipeline with backpressure** — fan-out-fan-in with
  bounded channels, retry, and graceful shutdown. *Covers: channels,
  `select`, `Semaphore`, supervisor.*
