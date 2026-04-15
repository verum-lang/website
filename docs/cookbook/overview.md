---
sidebar_position: 1
title: Cookbook
description: Task-oriented recipes — real code for common Verum tasks.
slug: /cookbook
---

# Cookbook

Short, focused recipes for tasks you actually do. Each recipe is
self-contained — copy it into your project as a starting point.

Looking for longer guided builds? See **[Tutorials](/docs/tutorials)**.

## Available recipes

- **[Read a file, line by line](/docs/cookbook/file-io)** —
  `BufReader`, async variants, writing safely.
- **[Parse JSON into typed records](/docs/cookbook/json)** —
  compile-time-validated JSON literals, `@derive(Deserialize)`,
  interpolated `json#"""..."""`, dynamic `Data` access.
- **[HTTP server](/docs/cookbook/http-server)** — a minimal typed
  server with routing, context-based DI, and test mocks.
- **[Structured concurrency with `nursery`](/docs/cookbook/nursery)**
  — parallel fetch, bounded parallelism via `Semaphore`,
  `Supervisor` for long-running tasks.
- **[Refinement patterns you'll actually use](/docs/cookbook/refinements)**
  — positive/nonzero/in-range, length-indexed collections,
  pattern-validated text, cross-parameter refinements.
- **[Building a CLI tool](/docs/cookbook/cli-tool)** — argument
  parsing, subcommands, config files, coloured errors, exit codes.

## Coming in future rounds

Recipes planned but not yet written. Track progress in the repo.

### Getting data in

- Parse TOML / YAML / CSV
- Validate input with refinement types
- Regular-expression matching

### Talking to the world

- HTTP client
- TCP echo server
- DNS lookup

### Running code

- Async / await basics
- Timeouts, retries, circuit breakers
- Channels (MPSC, broadcast, one-shot)
- Generators (sync and async)

### Collections & state

- Counting and grouping with `Map.entry`
- Interior mutability
- Sharing state across tasks

### Types that prove things

- Dependent types for shape-safe arrays
- Writing a small proof with `calc`

### Memory

- When to use `&checked T` vs `&T`
- Arenas for parser trees
- Sharing with `Shared<T>` and breaking cycles with `Weak<T>`

### Metaprogramming

- Writing a derive
- Validating an external DSL at compile time

### Systems

- Calling into a C library
- A simple TUI with the Elm loop
- Scheduling work with `Interval`

### Verification

- Adding `@verify(smt)` to an existing function
- Writing a `@logic` function for reflection
- Debugging an SMT failure
