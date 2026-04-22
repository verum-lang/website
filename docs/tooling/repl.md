---
sidebar_position: 6
title: REPL
description: Interactive REPL backed by the VBC interpreter — bind values, define functions, verify, inspect bytecode.
---

# REPL

`verum repl` is a line-oriented read-eval-print loop. It's the fastest
way to validate Verum syntax interactively.

:::note Current status (0.1.0)

The REPL is **VBC-backed**: each prompt is compiled and executed via
the Tier 0 interpreter. `let x = 42` desugars into a session-level
`const x = 42;` (or `static x: T = 42;` with a type annotation),
`fn`, `type`, `protocol`, `implement`, `static`, and `const` items
are appended to the session source after a compile-only validation,
and bare expressions are wrapped in a synthetic `__repl_main_<n>()`
that prints the value via the f-string formatter.

`:source` shows the accumulated session source, `:reset` clears it.
Commands that depend on bytecode-level instrumentation (`:bench`,
`:time`, `:profile`, `:mem`) remain follow-ups.

:::

For richer project-level exploration with source panes and
verification panels, see [Playbook](/docs/tooling/playbook).

## Launching

```bash
$ verum repl
Verum REPL
:help for commands, :quit to exit.

>>>
```

The REPL auto-loads the current project's modules if launched from a
project root; otherwise it starts with only the prelude.

```bash
$ verum repl --no-project         # start clean, no project context
$ verum repl --session prev.vr    # load session
```

## Expressions and definitions

```
>>> let xs = list![1, 2, 3, 4, 5]
List<Int> (len=5)

>>> xs.iter().map(|x| x * x).sum()
55 : Int

>>> fn greet(name: Text) -> Text { f"Hello, {name}!" }
fn greet : fn(Text) -> Text

>>> greet("Verum")
"Hello, Verum!" : Text
```

Every expression is evaluated and its value + type shown. Definitions
(`fn`, `type`, `const`) persist for the session.

## Multi-line input

The REPL detects incomplete input and waits for more:

```
>>> fn factorial(n: Int { self >= 0 }) -> Int {
...     if n == 0 { 1 } else { n * factorial(n - 1) }
... }
fn factorial : fn(Int { self >= 0 }) -> Int

>>> factorial(10)
3628800 : Int
```

Paste a multi-line definition and it auto-collects until balanced.

## Commands (`:`)

| Command                | What it does                                     |
|------------------------|--------------------------------------------------|
| `:help`                | Show command list.                                |
| `:type <expr>`         | Print the type of an expression without running it. |
| `:load <path>`         | Load a `.vr` file into the REPL.                 |
| `:reload`              | Reload previously loaded files.                   |
| `:use <module>`        | Import a module (equivalent to `mount`).          |
| `:bind <name> = <expr>`| Bind a value for the session.                     |
| `:context`             | Show current context bindings.                    |
| `:verify <fn>`         | Verify a function at SMT level.                   |
| `:disasm <fn>`         | Show VBC bytecode for a function.                 |
| `:cbgr <fn>`           | Show CBGR analysis.                               |
| `:mem`                 | Show allocator stats.                             |
| `:time <expr>`         | Time the evaluation.                              |
| `:bench <expr>`        | Criterion-style micro-benchmark.                  |
| `:clear`               | Clear session bindings.                           |
| `:save <path>`         | Save the session as a `.vr` file.                 |
| `:profile <expr>`      | Profile (allocations, SMT, CBGR, wall time).      |
| `:expand <expr>`       | Expand macros in the expression.                  |
| `:history`             | Show command history.                             |
| `:quit` / `Ctrl-D`     | Exit.                                             |

## Context bindings

Context types injected into the session persist across calls:

```
>>> :use std.io
>>> :bind Logger = ConsoleLogger.new(LogLevel.Info)
>>> :bind Clock  = SystemClock.new()

>>> fn log_now() using [Logger, Clock] {
...     Logger.info(f"now: {Clock.now()}")
... }

>>> log_now()
[info] now: 2026-04-17T20:47:00.000Z
```

View what's currently bound:

```
>>> :context
  Logger  = ConsoleLogger.new(LogLevel.Info)
  Clock   = SystemClock.new()
  IO      = <runtime>
```

Call a function that needs an unbound context and the REPL prompts:

```
>>> fetch("https://api.example.com/users")
? Http context not bound. Options:
  (n) provide NullHttp (always returns 404)
  (r) provide RealHttp
  (a) abort the call
> r
```

## Verification in the REPL

Define a function, verify it:

```
>>> fn abs(x: Int) -> Int { self >= 0 } { if x >= 0 { x } else { -x } }
fn abs : fn(Int) -> Int { self >= 0 }

>>> :verify abs
obligation abs/postcond          ✓ discharged  (z3, 4 ms)

>>> :verify abs --strategy certified
obligation abs/postcond          ✓ discharged  (z3, 4 ms)
cross-validation                ✓ checked      (kernel, 18 ms)
certificate                     → target/proof-cache/abs.verum-cert
```

## Inspecting the compiler

```
>>> :disasm abs
fn abs:
  00  LOAD_ARG    r0   ; x
  01  LOAD_CONST  r1 = 0
  02  COMPARE_LT  r2 = r0 < r1
  03  JUMP_IF     r2, label_neg
  04  MOVE        r3 = r0
  05  RETURN      r3
  06 label_neg:
  07  NEG         r3 = r0
  08  RETURN      r3

>>> :cbgr abs
CBGR analysis for `abs`:
  T0 refs: 0, T1 refs: 1 (promoted), T2 refs: 0
  escape analysis: no parameters escape
```

## Timing and profiling

```
>>> :time xs.iter().map(|x| x * x).sum()
result: 55
wall:   1.2 µs

>>> :bench fibonacci(30)
fibonacci(30)
  mean:    12.4 ms  (1000 iters, σ 0.3 ms)
  min:     11.9 ms
  median:  12.3 ms
  p99:     13.6 ms
```

## Session replay

```bash
$ verum repl --session my-session.vr
```

Loads `my-session.vr`, replays each expression, drops into the REPL
at the end. Useful for iterating on a long session that benefits
from starting partway through.

Save a session for later:

```
>>> :save my-session.vr
Saved 18 expressions to my-session.vr
```

## Line editing

| Key                  | Action                                     |
|----------------------|--------------------------------------------|
| `Ctrl-R`             | Reverse history search.                    |
| `Ctrl-A` / `Ctrl-E`  | Start / end of line.                       |
| `Alt-Backspace`      | Delete previous word.                      |
| `Alt-D`              | Delete next word.                          |
| `Ctrl-U`             | Clear line.                                |
| `Ctrl-K`             | Kill to end of line.                       |
| `Ctrl-Y`             | Yank (paste from kill ring).               |
| `Tab`                | Completion (names in scope, method chains, protocol methods). |
| `Ctrl-C`             | Cancel current input (not a running call).  |
| `Ctrl-\`             | Cancel a running call.                     |
| `Up` / `Down`        | History navigation.                        |
| `Ctrl-L`             | Clear screen (keeps input).                |
| `Ctrl-D`             | EOF — exits REPL if input is empty.        |

## Completion

Tab-completes identifiers in scope, method names after `.`, protocol
methods with `:`, commands, file paths for `:load`.

```
>>> xs.ma<TAB>
   → map     manganese   (... etc.)
```

## Running a script (no REPL)

A non-interactive mode evaluates a file without the prompt:

```bash
verum run my_script.vr              # run as a main program
verum eval "1 + 2 + 3"              # eval a single expression
verum check my_script.vr            # just type-check (no eval)
```

## Using the REPL programmatically

Verum's REPL ships with an embeddable API in
`core.eval::repl`:

```verum
mount core.eval.repl;

fn my_tool() {
    let mut repl = Repl.new()
        .with_project_root(".")
        .with_bind("Logger", ConsoleLogger.new(LogLevel.Info));

    let result = repl.eval("greet(\"world\")").await?;
    print(f"got: {result}");
}
```

Useful for building custom tool REPLs (e.g. a domain-specific
shell).

## Pitfalls

### Slow startup with large projects

A project with 100+ source files takes 1-3 s to index. Use
`--no-project` if you're just testing a snippet.

### SMT cache in REPL

Verification results are cached per-session. `:verify abs` twice is
the second call nearly-instant. Restart the REPL to clear.

### `:load` does not type-check imports

`:load foo.vr` loads the file; if `foo.vr` mounts a module, the REPL
loads it too. A mount of a missing module is reported as a warning,
not an error — you can still use items that *don't* depend on it.

## See also

- **[Playbook](/docs/tooling/playbook)** — TUI alternative with
  project panes.
- **[LSP](/docs/tooling/lsp)** — same indexer, for editors.
- **[CLI](/docs/tooling/cli)** — all commands.
- **[`stdlib/eval`](/docs/stdlib/eval)** — CBPV underneath the
  evaluator.
