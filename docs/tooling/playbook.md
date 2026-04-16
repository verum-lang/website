---
sidebar_position: 5
title: Playbook
---

# Playbook TUI

`verum playbook` launches a terminal UI for interactive exploration of
a Verum project — a faster-feedback alternative to REPL + editor
cycling.

## What it does

- **Discover**: auto-indexes functions, types, protocols in your project.
- **Invoke**: call functions interactively with typed argument prompts.
- **Inspect**: view results with pretty-printing for every stdlib type.
- **Profile**: measure execution time, allocations, SMT time.
- **Verify**: run `@verify(formal)` on the function at cursor; see
  obligations discharged live.
- **Replay**: re-run prior invocations with modified arguments.

## Layout

```
┌─ Explorer ──┬────────────── Editor / Result ─────────────┐
│ src/        │ fn search(xs: &Sorted, key: Int)            │
│ ├ lib.vr    │                                              │
│ ├ search.vr │ Result:                                      │
│ └ tests/    │   Maybe.Some(42)                             │
│             │   ─── CBGR: 3 checks, 2 promoted ──────      │
│             │   ─── SMT:  2 obligations, 0.04 s ──────     │
├─────────────┼──────────────────────────────────────────────┤
│ Prompt:                                                   │
│ > xs := [1, 2, 3, 42, 100]                                │
│ > key := 42                                               │
│ > search(&xs, key)                                        │
└────────────────────────────────────────────────────────────┘
```

## Navigation

- **Tab** — switch between explorer, editor, prompt.
- **Ctrl-P** — command palette.
- **Ctrl-F** — find function / type.
- **F5** — re-run current invocation.
- **F7** — open function's source.
- **F9** — toggle profiling panel.

## Command palette

Common actions:

- `Run test module`
- `Verify selected function`
- `Explain refinement failure`
- `Open CBGR report`
- `Toggle proof search trace`
- `Export session as test`

## Session persistence

Playbook sessions are saved to `.verum/playbook/sessions/`. A session
records every invocation; you can export one as a `@test` module:

```
> export session tests/playbook_session.vr
```

The result is a runnable test file derived from your exploration.

## Context bindings

Contexts can be bound interactively:

```
> bind Database = postgres://localhost/dev
> bind Logger   = ConsoleLogger.new(LogLevel.Debug)
> fetch_user(UserId(42))
```

The bindings persist for the session and propagate through every call.

## Integration with LSP

Playbook uses the same indexing as the LSP server — no duplicate
parsing. Changes to source files invalidate cached call results
automatically.

## See also

- **[REPL](/docs/tooling/repl)** — line-oriented interactive mode.
- **[LSP](/docs/tooling/lsp)** — language server (same indexer).
- **[Stdlib → term](/docs/stdlib/term)** — the 7-layer TUI framework
  Playbook uses.
