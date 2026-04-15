---
sidebar_position: 1
title: Cookbook
description: Task-oriented recipes — real code for common Verum tasks.
slug: /cookbook
---

# Cookbook

Short, focused recipes for the things you actually do. Each recipe
is self-contained — copy it into your project as a starting point.

Looking for longer guided builds? See **[Tutorials](/docs/tutorials)**.

## Getting data in

- **[Read a file, line by line](/docs/cookbook/file-io)** — `BufReader`,
  async variants, write safely.
- **[Parse JSON into typed records](/docs/cookbook/json)** —
  compile-time-validated JSON literals, `@derive(Deserialize)`,
  interpolated `json#"""..."""`, dynamic `Data` access.
- **[Validate at boundaries](/docs/cookbook/validation)** — refinement
  types at system edges; typed error responses.
- **[Regular expressions](/docs/cookbook/regex)** — compile-time-
  validated `rx#"..."` literals, capture groups, anchoring.

## Talking to the world

- **[HTTP client](/docs/cookbook/http-client)** — typed responses,
  retries, TLS config.
- **[HTTP server](/docs/cookbook/http-server)** — minimal typed
  server with routing, context-based DI, and test mocks.
- **[TCP sockets](/docs/cookbook/tcp)** — echo server, framing,
  half-close handling.
- **[DNS lookups](/docs/cookbook/dns)** — A/AAAA records, SRV, MX,
  timeouts.

## Running code

- **[Async basics](/docs/cookbook/async-basics)** — `spawn`, `.await`,
  `select`, cancellation.
- **[Channels](/docs/cookbook/channels)** — MPSC, broadcast, one-shot
  with back-pressure.
- **[Generators](/docs/cookbook/generators)** — sync `fn*` and async
  `async fn*` iterators.
- **[Structured concurrency with `nursery`](/docs/cookbook/nursery)** —
  parallel fetch, bounded parallelism, cancellation semantics.
- **[Resilience](/docs/cookbook/resilience)** — retries, circuit
  breakers, supervision policies.
- **[Scheduler](/docs/cookbook/scheduler)** — intervals, cron-like
  triggers, priority queues.

## Collections & state

- **[Collections idioms](/docs/cookbook/collections)** — grouping,
  counting, sorting, `Map.entry` patterns.
- **[Interior mutability](/docs/cookbook/interior-mutability)** —
  `Cell` / `RefCell` / `OnceCell` / `LazyCell` decision tree.
- **[Sharing state across tasks](/docs/cookbook/shared-state)** —
  `Shared<Mutex<T>>`, avoiding deadlocks, atomic alternatives.
- **[Shared ownership](/docs/cookbook/shared-ownership)** — `Shared<T>`
  vs `Rc<T>`, breaking cycles with `Weak<T>`.

## Types that prove things

- **[Refinement patterns](/docs/cookbook/refinements)** — positive /
  nonzero / in-range, length-indexed collections, pattern-validated
  text, cross-parameter refinements.
- **[Shape-safe tensors](/docs/cookbook/shape-safe)** —
  `Tensor<T, Shape>` with compile-time matmul / conv shape checks.
- **[`calc` proofs](/docs/cookbook/calc-proofs)** — equational
  reasoning inside a function body.
- **[Adding `@verify(formal)`](/docs/cookbook/adding-verification)** —
  promoting runtime checks into SMT-proven invariants.
- **[`@logic` functions](/docs/cookbook/logic-functions)** — extending
  the solver's vocabulary soundly.
- **[Debugging SMT failures](/docs/cookbook/smt-debug)** — counter-
  example diagnostics, timeouts, strategy escalation.

## Memory

- **[References in practice](/docs/cookbook/references)** — when to
  use `&T` vs `&checked T` vs `&unsafe T`.
- **[Arenas](/docs/cookbook/arenas)** — `GenerationalArena<T>`, bulk
  free, parser trees.

## Metaprogramming

- **[Writing a `@derive(...)`](/docs/cookbook/write-a-derive)** — a
  full walk-through of `@derive(DisplayAll)` with `verum expand-macros`.

## Systems

- **[CLI tool](/docs/cookbook/cli-tool)** — argument parsing,
  subcommands, config files, coloured errors, exit codes.
- **[TUI with the Elm loop](/docs/cookbook/tui)** — 7-layer terminal
  framework, scenes, event handling.
- **[FFI](/docs/cookbook/ffi)** — calling C libraries, boundary
  contracts, ownership transfer.

## See also

- **[Tutorials](/docs/tutorials)** — longer end-to-end builds
  for a URL shortener, parser combinator, verified data structure,
  ETL pipeline, and MNIST classifier.
- **[Guides](/docs/category/guides)** — FAQ, performance, security,
  troubleshooting.
