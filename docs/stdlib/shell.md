---
sidebar_position: 26
title: "core.shell — typed shell scripting"
description: "Verum's shell-scripting framework — sh#\"...\" tagged literals, typed Pipeline / Transducer, GitCmd / DockerCmd DSLs, CBGR-managed FDs, permission-typed shell context."
status: regression-only
slug: /stdlib/shell
---

import StdlibStatus from '@site/src/components/StdlibStatus';

# `core.shell` — typed shell scripting

<StdlibStatus status="regression-only" />

`core.shell` is Verum's shell-scripting framework. It is the
practical equivalent of `bash` / `zsh` / `fish` plus the typed
discipline Verum brings to system tasks: every command is a
typed `ShellResult`, every file descriptor is a CBGR-managed
resource, every permission is a typed capability, every
external command admits a `MockLayer` for tests.

The framework targets shell-grade scripts (`bash`-replacement
work) without compromising the verification guarantees that
distinguish Verum as a systems language. A 20-line `core.shell`
script gets refinement types, capability discipline, and
formal-verification opt-in alongside the usual shell ergonomics.

## 1. Single-import surface

```verum
mount core.shell.*;
```

After this one mount line, the caller has access to:

- `sh#"..."` — tagged-literal shell dispatch (parser-level)
- `sh()` / `sh_check()` / `run()` — function-level executors
- `Executor` — timeout / retry / cancel-aware command runner
- `background()` / `parallel()` / `fanout()` / `fail_fast()` — concurrency
- `stream_lines()` / `stream_lines_bounded()` / `LineStream` — streaming
- `Pipeline<A,B>` — typed builder for fluent pipelines
- `Transducer<A,B>` — composable stream operators
- `GitCmd` / `DockerCmd` — typed command DSLs
- `cp` / `mv` / `rm` / `mkdir_p` / `cat` / `write` / `which` — built-ins
- `Fd` / `TempFile` / `FileLock` — CBGR-managed resources
- `ShellContext` / `PermissionSet` / `MockLayer` — DI primitives
- `Escaper` / `ShellEscape` / `ShellRaw` — escape protocol
- `ShellResult` / `ShellError` — return / error types

## 2. The three executor functions

```verum
public fn sh(cmd: Text) -> ShellResult<Text>          using [ShellContext];
public fn sh_check(cmd: Text) -> ShellResult<Text>    using [ShellContext];
public fn run(cmd: Text) -> ShellResult<ProcessExit>  using [ShellContext];
```

| Function | Returns | Behaviour |
|----------|---------|-----------|
| `sh(cmd)` | `ShellResult<Text>` | run command, capture stdout, return text |
| `sh_check(cmd)` | `ShellResult<Text>` | as `sh` but fail on non-zero exit code |
| `run(cmd)` | `ShellResult<ProcessExit>` | run command, return full `ProcessExit` (exit code + stdout + stderr + duration) |

Every executor takes the surrounding `ShellContext` via the
context system — there is no global `cwd` or `env`; the context
is explicit.

## 3. Tagged-literal shell dispatch

```verum
let users = sh#"awk -F: '{print $1}' /etc/passwd"?;
let count = sh#"echo {users.len()} users"?;
```

`sh#"..."` is parser-level — the contents are validated against
the project's escape policy *at compile time*, and interpolation
(`{expr}`) is type-checked through the surrounding scope. There
is no runtime string-concatenation; injection is structurally
impossible.

## 4. Typed pipelines + transducers

```verum
let result: Pipeline<Text, List<Int>> = pipeline()
    | filter(|line| !line.starts_with("#"))
    | map(|line| parse_int(line))
    | collect();

result.run(stdin)?
```

Each stage carries its input/output types in the `Pipeline<A,B>`
parameter. `Transducer<A,B>` is the composable operator form
(rank-2 polymorphic per the `core.collections.Transducer` shape).
Composition is type-checked.

## 5. Typed command DSLs — `GitCmd`, `DockerCmd`

```verum
let log = GitCmd.log()
    .since("1 week ago")
    .author("alice")
    .format("oneline")
    .run()?;

let img = DockerCmd.build("./Dockerfile")
    .tag("myapp:latest")
    .build_arg("VERSION", "1.2.3")
    .run()?;
```

The DSLs surface command-specific options as fluent methods.
Each method maps to a flag; misspelled flags do not exist as
methods, so typos surface at compile time.

## 6. CBGR-managed resources

`Fd`, `TempFile`, `FileLock` are CBGR-tier-0 references:
opening allocates, going out of scope deallocates with the
correct cleanup primitive (`close(2)`, `unlink(2)`, `flock(LOCK_UN)`).
There is no `defer` ceremony.

```verum
{
    let lock: FileLock = file_lock("/var/lock/myapp")?;
    // exclusive lock held for the lifetime of `lock`
    do_critical_work();
}  // // lock released here, automatically
```

## 7. Permission-typed shell context

```verum
public type PermissionSet is {
    /// `Maybe.None` = unrestricted. `Maybe.Some([])` = deny-all.
    /// `Maybe.Some([..])` = explicit allow-list.
    run:      Maybe<List<Text>>,
    fs_read:  Maybe<List<Text>>,
    fs_write: Maybe<List<Text>>,
    net:      Maybe<List<Text>>,
    env:      Maybe<List<Text>>,
    /// Deny when no allow-list is set. Default `false`, so a script
    /// without permission frontmatter still runs.
    strict:   Bool,
};

public type ShellContext is {
    cwd:           Maybe<Text>,          // None = inherit parent's cwd
    env_overrides: List<(Text, Text)>,   // additive, per spawn
    flavour:       ShellFlavour,
    shell_program: Maybe<Text>,          // None = autodetect $SHELL / COMSPEC
    permissions:   PermissionSet,
    mock:          Maybe<MockLayer>,
    verbose:       Bool,                 // log every dispatched command
    dry_run:       Bool,                 // print, don't spawn
};
```

A `ShellContext` declares what the script *may* do. A command outside
`permissions.run` produces `ShellError.PermissionDenied` *before* the
command runs.

**The three-state permission field is the part to read carefully.**
Each entry is a `Maybe<List<Text>>` and the two "empty" values mean
opposite things: `Maybe.None` is *unrestricted*, `Maybe.Some([])` is
*deny everything*. A gate written as "if the list is empty, allow"
inverts the deny-all case.

Transcribed from `core/shell/context.vr`. Both blocks above were
previously written with invented field names — `can_exec`, `can_read`,
`can_write`, `can_network: Bool`, `env: Map<Text, Text>`,
`mock_layer` — and omitted `strict`, `flavour`, `shell_program`,
`verbose` and `dry_run` entirely. `can_network: Bool` is the one worth
naming: the real `net` is an allow-LIST, so the page described a
coarser permission model than the library implements.

## 8. MockLayer — testable shell scripts

The mock layer is built from a list of `MockResponse`s and handed to a
`ShellContext` by a static constructor — there is no chainable
`.mock(pattern, output)` builder:

```verum
mount core.shell.context.{ShellContext, MockResponse};

let ctx = ShellContext.mock([
    MockResponse.success("git status".into(),
                         "On branch main\nnothing to commit\n".into()),
    MockResponse.success("docker ps".into(), "".into()),
]);
```

`MockResponse.success(pattern, stdout)` and
`MockResponse.failure(pattern, stderr, code)` are the two constructors.
A pattern matches exactly first, then by substring; `"*"` is a
catch-all. `ShellContext.lenient_mock([..])` is the same thing with
`strict_no_match` off, so an unmatched command falls through to a real
shell instead of raising.

:::caution Not wired to the context system yet
`provide ShellContext = ctx;` does not yet reach `sh()` / `sh_check()`.
Both resolve their context by calling `ShellContext.default()`
INTERNALLY (`core/shell/exec.vr`), so a provided mock context is
constructed and then ignored — the command still spawns for real.

`vcs/specs/L2-standard/shell/mock_context_integration.vr` says the same
thing in its own comment and is a `typecheck-pass` spec for exactly
that reason: it pins the construction surface, which IS shipped, and
does not claim the dispatch, which is not.

Until that wiring lands, use the mock layer through a `ShellContext`
you pass explicitly, and read results off `ShellResult` —
`.stdout()`, `.text()`, `.lines()`, `.code()`, `.success()`.
:::

## 9. Concurrency primitives

```verum
let (alice, bob) = parallel(
    || sh#"curl -s https://alice.example/profile",
    || sh#"curl -s https://bob.example/profile",
)?;

fanout(["a.txt", "b.txt", "c.txt"], |path| sh#"shasum {path}")?
```

| Primitive | Use case |
|-----------|----------|
| `background(f)` | run `f` in a child task, returns `JobHandle` |
| `parallel(a, b, ...)` | run several closures in parallel, await all |
| `fanout(items, f)` | apply `f` to each item in parallel |
| `fail_fast(items, f)` | as `fanout` but cancel siblings on first failure |

## 10. Streaming — bounded line readers

```verum
let mut lines = stream_lines_bounded(input, max_line_bytes: 4096);
while let Some(line) = lines.next()? {
    process(line);
}
```

`stream_lines_bounded` reads line-by-line with an explicit upper
bound on per-line size — protects against unbounded memory growth
on adversarial input. The unbounded `stream_lines` exists but is
discouraged outside trusted inputs.

## 11. Cross-references

- [Cookbook → CLI tool](../cookbook/cli-tool.md) — building
  a complete CLI app with `core.shell`.
- [Cookbook → Shell scripting](../cookbook/shell-scripting.md) —
  `core.shell` recipes.
- [Tutorials → CLI tool](../tutorials/cli-tool.md) — guided
  walkthrough.
- [Stdlib → io](./io.md) — the file-I/O foundation.
- [Stdlib → context](./context.md) — the DI mechanism for
  `ShellContext`.
- [Language → context system](../language/context-system.md) —
  the underlying language surface.
- [Architecture-types → Capability](../architecture-types/primitives/capability.md)
  — the architectural counterpart to `PermissionSet`.
