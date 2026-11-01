---
sidebar_position: 6
title: Your First Hour
description: Open a Studio workspace, run a program and a script, and verify a bounded function contract.
---

# Your First Hour with Verum

Use Studio to edit and inspect your source, then use the same Verum toolchain
to run it and verify a function contract. Each example below is a complete file.

## Open a workspace

[Install Verum](/docs/getting-started/installation), create an empty directory,
and open it:

```bash
mkdir verum-experiments
cd verum-experiments
verum studio .
```

Open the URL printed by the command. Keep its session credential private.
If your installation does not include the Studio command, follow the
[standalone Studio build instructions](/docs/tooling/studio#start-a-workspace).

Studio presents a file explorer, an editor and a results panel. Hover an action
icon to see its label and shortcut. Open Settings to change the interface language
or keyboard bindings. Studio runs locally and executes programs with your account's
permissions; use a workspace whose code you trust.

## Run a complete program

Save the following as `main.vr` in your workspace, refresh Explorer and open it:

```verum
fn square(value: Int) -> Int {
    value * value
}

fn main() {
    print(square(7));
}
```

Choose **Check module**, then **Run**. The program prints `49`. With the editor
focused, Command/Ctrl + Shift + Enter checks the module and Command/Ctrl + Enter
runs it. Both actions use the submitted editor buffer, so an unsaved edit can have
its own result. Command/Ctrl + S saves the source to disk.

The equivalent terminal commands use the saved file:

```bash
verum check main.vr
verum run --interp main.vr
```

Change the argument to `8` and run again: the output becomes `64`. Review the
selected run's source identity and status in Results before using an earlier
result to assess your current code. A successful run establishes what happened
on that input; it does not prove the function for every integer.

## Experiment with a script

Save this as `experiment.vr` and open it in Studio:

```verum
#!/usr/bin/env verum
let answer = 6 * 7;
print(answer);
```

Choose **Run** to print `42`. The shebang selects script parsing, allowing
top-level statements without `fn main()`. The same saved script runs directly:

```bash
verum experiment.vr
```

Scripts share Verum's language and standard library with applications. See
[script mode](/docs/getting-started/script-mode) for arguments, permissions and
execution backends.

## Verify a bounded contract

Save this complete program as `increment.vr`:

```verum
@verify(formal)
fn increment(value: Int) -> Int
    requires value >= 0 && value <= 99
    ensures result > value
{
    value + 1
}

fn main() {
    print(increment(41));
}
```

The precondition limits the accepted input to `0` through `99`, where adding one
cannot overflow `Int`. The postcondition requires the returned value to be larger
than the input. In the terminal, request verification of this function:

```bash
verum verify increment.vr --function increment --timeout 15
```

The report should contain **1 proved, 0 failed, 0 timeout, 0 skipped**. This is a
solver-backed result for the selected function and its stated contract under the
verifier's model. It is not a proof of the entire application, the compiler or all
runtime behavior. A timeout or skipped obligation is not a successful proof.

Replace `value + 1` with `value - 1` and run the same verification command. The
postcondition fails; the report provides a counterexample and the command exits
unsuccessfully. Restore the original implementation before continuing.

Studio's **Check logical declaration** action serves the separate logical-proof
workflow. Use the CLI command above for this function-contract example; module
checking and successful execution do not replace it.

## Continue learning

- [Language tour](/docs/getting-started/tour) — types, functions and control flow.
- [Studio](/docs/tooling/studio) — project navigation, diagnostics, reviewed agent
  edits and source-bound results.
- [REPL](/docs/tooling/repl) — a terminal session for short experiments.
- [Gradual verification](/docs/verification/gradual-verification) — contracts and
  verification levels.
