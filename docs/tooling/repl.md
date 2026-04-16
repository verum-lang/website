---
sidebar_position: 6
title: REPL
---

# REPL

`verum repl` is a classic read-eval-print loop backed by the VBC
interpreter.

## Launching

```bash
$ verum repl
Verum REPL
:help for commands, :quit to exit.

>>>
```

## Basic usage

```
>>> let xs = list![1, 2, 3, 4, 5]
List<Int> (len=5)

>>> xs.iter().map(|x| x * x).sum()
55 : Int

>>> fn greet(name: Text) -> Text { f"Hello, {name}!" }

>>> greet("Verum")
"Hello, Verum!" : Text
```

## Commands

```
:help               show this help
:type  <expr>       print the type of an expression
:load  <path>       load a .vr file into the REPL
:reload             reload previously loaded files
:use   <module>     import a module
:bind  <name> = <expr>   bind a value for the session
:context                 show current context bindings
:verify <fn>        verify a function at SMT level
:disasm <fn>        show VBC bytecode for a function
:cbgr   <fn>        show CBGR analysis
:mem                show allocator stats
:time   <expr>      time the evaluation
:clear              clear session bindings
:save   <path>      save the session as a .vr file
:quit               exit
```

## Multi-line input

The REPL detects incomplete expressions and waits for more:

```
>>> fn factorial(n: Int { self >= 0 }) -> Int {
...     if n == 0 { 1 } else { n * factorial(n - 1) }
... }

>>> factorial(10)
3628800 : Int
```

## Context binding

```
>>> :use std.io
>>> :bind Logger = ConsoleLogger.new(LogLevel.Info)
>>> :bind Clock  = SystemClock.new()

>>> fn log_now() using [Logger, Clock] { Logger.info(f"now: {Clock.now()}") }
>>> log_now()
[info] now: 2026-04-15T20:47:00.000Z
```

## Verification in the REPL

```
>>> fn abs(x: Int) -> Int { self >= 0 } { if x >= 0 { x } else { -x } }
>>> :verify abs
obligation abs/postcond          discharged  (z3, 4 ms)
```

## Session replay

```bash
$ verum repl --session my-session.vr
# loads my-session.vr, replays each expression, drops into REPL at the end
```

## Line editing

- **Ctrl-R** — reverse history search.
- **Ctrl-A** / **Ctrl-E** — start / end of line.
- **Alt-Backspace** — delete previous word.
- **Tab** — completion (names in scope, method chains, protocol methods).

## Colour and formatting

Result pretty-printing uses `core::text::format`. Lists, maps, and
nested records wrap with indentation; `Maybe` / `Result` variants
show inline.

## Running a script

A non-interactive variant:

```bash
verum file my_script.vr              # evaluate as a script
```

## See also

- **[Playbook](/docs/tooling/playbook)** — richer TUI for project
  exploration.
- **[CLI](/docs/tooling/cli)** — all commands.
