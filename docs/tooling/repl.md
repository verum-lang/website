---
sidebar_position: 6
title: REPL
description: A terminal session for Verum declarations and explicit program output.
---

# REPL

`verum repl` provides a line-oriented terminal session backed by the VBC
compiler and interpreter. Use [Studio](/docs/tooling/studio) for a graphical
workspace with project navigation, editor diagnostics and recorded results.

## Launching

```bash
verum repl
```

Type a declaration, then use it in a later prompt:

```text
verum[1]> fn twice(value: Int) -> Int { value * 2 }
✓ 1 item(s) defined
verum[2]> print(twice(21));
42
verum[3]> :quit
Goodbye!
```

Use explicit `print(...)` statements to inspect results. Bare expressions
currently execute without automatically displaying their value.

## Expressions and definitions

Declarations are accumulated as source and compiled again for subsequent
operations. A successful declaration becomes available to later prompts.
A failed declaration is not added to the session.

A prompt-level `let` is lifted into a session declaration: an unannotated binding
becomes `const`, while a binding with an explicit type becomes `static`.
This does not provide an ordinary mutable local variable spanning prompts.
Use a script or application when execution order and persistent runtime state
matter.

## Multi-line input

The prompt changes to `...` while delimiters remain open. Complete the input
to submit it, or use `:clear` to discard the pending buffer. This is basic
line input rather than a full editor; Studio provides the graphical editing
workflow.

## Commands (`:`)

| Command | Action |
| --- | --- |
| `:help`, `:h` | Show command help. |
| `:quit`, `:q`, `:exit` | End the session. |
| `:clear`, `:c` | Discard the pending multiline buffer. |
| `:reset`, `:r` | Clear accumulated declarations and the pending buffer. |
| `:source` | Print accumulated declaration source. |
| `:status` | Show pipeline and session information. |

There are no `:verify`, `:load`, `:save`, `:type` or profiling commands in this
terminal REPL. Save a complete program and use [CLI verification](../verification/gradual-verification.md)
for function contracts. A successful REPL evaluation is execution evidence,
not a proof.

## Session replay

To load declarations before the first prompt, save this as `helpers.vr`:

```verum
fn twice(value: Int) -> Int {
    value * 2
}
```

```bash
verum repl --preload helpers.vr
```

Then enter `print(twice(21));` to print `42`. Preloading validates and adds the
module's declarations; it is not a notebook replay or a record of earlier runs.

## Running a script (no REPL)

Use `verum script.vr` for a file beginning with a script shebang, or
`verum run --interp app.vr` for an application declaring `fn main()`.
See [script mode](../getting-started/script-mode.md) and
[Your First Hour](../getting-started/first-hour.md) for complete examples.

## Using the REPL programmatically

The terminal REPL is implemented by the Rust `verum_compiler::Repl` component.
There is no standard-library `core.eval.repl` module for a Verum program to mount.

## See also

- [Studio](./studio.md)
- [CLI reference](../reference/cli-commands.md)
- [Script mode](../getting-started/script-mode.md)
