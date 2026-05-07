---
sidebar_position: 30
title: "core.cli — declarative CLI framework"
description: "Build command-line tools the Verum way: typed argument protocols (FromArg / ValueEnum), fluent App.new builder, combinator-based parser, did-you-mean diagnostics, sysexits-aligned exit codes, and (Phase 1) declarative @command derive."
slug: /stdlib/cli
---

# `core.cli` — declarative CLI framework

`core.cli` is Verum's first-class toolkit for building command-line
tools.  It treats the CLI as a typed surface — every flag, argument,
and subcommand is a declarative spec the runtime resolves into a
parsed value with structured diagnostics — and it leaves Rust-style
ad-hoc `args.next()` parsing in the compiler-test corner where it
belongs.

> **One-line entry-point.** `mount core.cli.*;` imports everything
> a script needs: types, builder, runtime, error model, help
> renderer.  No second crate, no procedural-macro dance.

## 1. The mental model

A CLI program is a tree of commands.  Each command carries:

- **Flags** — long (`--verbose`) and / or short (`-v`) options
  that may take values (`--output FILE`).
- **Positional arguments** — required or optional, with an
  optional **arity** (single, repeated, all-remaining).
- **Subcommands** — child commands the parser recurses into.
- **A handler** — a Verum function that receives the parsed
  argument record and a context, and returns an `ExitCode`.

Everything else (help text, completions, man pages, JSON-schema
description, dry-run mode) is derived from this spec by the
runtime.

## 2. Declarative API — `@command` derive (Phase 1)

The terse, recommended form.  Annotate a record type with
`@command(...)` and let the compiler generate the spec:

```verum
mount core.cli.*;

@command(
    name: "wave",
    about: "Greet a value, the Verum way.",
    version: "0.1.0",
)
type Args is {
    /// Who to greet.
    @arg(positional, required) name: Text,

    /// Repeat the greeting N times.
    @flag(short: 'n', long: "count", default: 1)
    count: Int { self > 0 },

    /// Suppress trailing newline.
    @flag(long: "no-newline")
    no_newline: Bool,
};

fn main(args: Args) -> ExitCode {
    for _ in 0 .. args.count {
        if args.no_newline {
            print(&f"hello, {args.name}");
        } else {
            print(&f"hello, {args.name}\n");
        }
    }
    ExitCode.Success
}
```

The `@command` macro inspects the record's fields, classifies each
(flag / positional / subcommand) by its `@flag` / `@arg` /
`@subcommand` annotation, and emits an `App<Args>` builder chain
that drives `core.cli.runtime`.

## 3. Builder API — `App.new` (Phase 0)

When you need full control — programmatic spec generation, dynamic
subcommand registration, custom completion logic — drop down to the
builder.  This is what `@command` expands to:

```verum
let app = App.new("wave")
    .about("Greet a value, the Verum way.")
    .version("0.1.0")
    .arg(ArgSpec.required("name").help("Who to greet."))
    .flag(FlagSpec.new("count")
        .short('n')
        .takes_value()
        .default(1)
        .help("Repeat the greeting N times."))
    .flag(FlagSpec.new("no-newline")
        .help("Suppress trailing newline."))
    .build();
```

`App.new(...).build()` returns an `App<Args>` that can be invoked
several ways:

```verum
// Standard: parse argv from `env`, dispatch to `main`, exit.
ExitCode.exit(app.run(env.argv()));

// Test mode: parse a manufactured argv vector, return parsed
// args without dispatching.  Used in `@test` and golden-test
// harnesses.
let parsed = app.parse(List.from(["wave", "Maxim", "-n", "3"]));

// JSON-schema export: every spec serialises to a stable schema
// for editors / shells / completion engines.
let schema = app.to_json_schema();
```

## 4. The error model

Parsing failures surface as a `ParseError`.  Diagnostics are
empathetic — they include did-you-mean suggestions, the offending
argv slice, and (where applicable) the source `RfC` reference for
the rule that fired:

```
error[CLI-EARG]: missing required argument 'name'
  ┌─ wave
  │
1 │ wave
  │ ^^^^ expected `name` here

  did you mean: `wave Maxim`?
  see: --help
```

`ParseDiagnostic` exposes the same content as a structured value
when JSON output is requested:

```verum
match app.parse_with_errors(env.argv()) {
    Result.Ok(args)  => main(args),
    Result.Err(diag) => {
        if env.is_json_mode() {
            print(&diag.to_json());
        } else {
            diag.render_pretty();
        }
        ExitCode.Usage
    }
}
```

## 5. Layered modules

When you want to import only what you need, the framework exposes
each component as a sub-module of `core.cli`:

| Module | Purpose |
|---|---|
| `core.cli.spec`         | `CommandSpec`, `ArgSpec`, `FlagSpec`, `Group`, `Arity` |
| `core.cli.types`        | `FromArg`, `ValueEnum`, `ArgKind` protocols |
| `core.cli.error`        | `ParseError`, `ParseDiagnostic` |
| `core.cli.parser`       | combinator-based argv parser (`Parser<A>`) |
| `core.cli.help`         | adaptive help renderer (uses `core.term.style`) |
| `core.cli.builder`      | fluent `App.new(…)` chain |
| `core.cli.runtime`      | `App<E>` runtime + dispatcher |
| `core.cli.derive`       | `@command` derive macro support |
| `core.cli.completion`   | shell-completion script generation (bash, zsh, fish, powershell) |
| `core.cli.manpage`      | `man(1)`-format renderer |
| `core.cli.config`       | XDG-style config-file resolution |
| `core.cli.frontmatter`  | YAML / TOML frontmatter parsing for `verum`-script style |
| `core.cli.permissions`  | `--allow=…` / `--deny=…` capability resolution |
| `core.cli.repl`         | interactive REPL host |
| `core.cli.plugin`       | plugin discovery (drop-in `verum-foo` binaries) |
| `core.cli.json_schema`  | JSON-schema export of any `App` spec |
| `core.cli.refinement`   | refinement-typed arg validators (`Int { self > 0 }`, etc.) |
| `core.cli.testing`      | `@test`-mode harness for golden CLI tests |

## 6. Exit-code discipline

Verum CLIs follow the BSD `sysexits.h` family.  `ExitCode` carries
the canonical roster:

| Variant | Code | When |
|---|---:|---|
| `Success`        |   0 | clean termination |
| `Usage`          |  64 | bad invocation (missing arg, unknown flag) |
| `DataError`      |  65 | input data malformed |
| `NoInput`        |  66 | input file not found / unreadable |
| `Unavailable`    |  69 | service unavailable (network, daemon) |
| `Software`       |  70 | internal-software bug (panic surfaced) |
| `OsError`        |  71 | OS-level call failed |
| `IoError`        |  74 | I/O error |
| `Cancelled`      | 130 | SIGINT — `Ctrl-C` |
| `CapabilityDenied` | 143 | permission policy denied (`--allow=…`) |

Custom exit codes can be lifted via `ExitCode.from_raw(rc: Int)`
where the argument is in `[0, 255]`.

## 7. Permissions integration

`core.cli.permissions` implements the `--allow=<scope>[=<target>]`
flag family.  It reads the same policy spec the Verum runtime
honours (see [Script mode permissions](../getting-started/script-mode.md)),
so your CLI's surface is identical to a script's:

```bash
$ wave --allow=net=tcp:api.example.com:443 --count 3 Maxim
```

A capability denial exits `143` and the diagnostic names the
denied scope.

## 8. Testing

`core.cli.testing` provides a `@test`-mode harness:

```verum
@test
fn parses_count_flag() {
    let app = build_app();
    let parsed = app.parse(List.from([
        "wave", "Maxim", "--count", "3"
    ])).unwrap();
    assert_eq(parsed.count, 3);
    assert_eq(parsed.name, Text.from("Maxim"));
}
```

Golden CLI tests — diff a CLI invocation's stdout / stderr / exit
code against a checked-in reference — are supported via
`core.cli.testing.GoldenSession`.

## 9. Plugin discovery

Drop-in plugins follow the `verum-<name>` binary convention:
`verum foo` resolves to a `verum-foo` binary on `PATH` and forwards
arguments.  This is how `verum bench`, `verum playbook`, and the
Aletheia CLI integrate without modifying the main `verum` binary.

`core.cli.plugin.discover()` enumerates installed plugins and
their declared subcommand surface (via the JSON-schema export
above).

## 10. See also

- [Script mode](../getting-started/script-mode.md) — Verum's
  shebang-friendly single-file mode that uses `core.cli` under
  the hood.
- [`core.term`](./term.md) — terminal styling, the basis for
  `core.cli.help`'s rendering.
- [`internal/specs/cli-framework.md`](https://github.com/verum-lang/verum/blob/main/internal/specs/cli-framework.md)
  — the full design spec (Phase 0 → Phase 7).
- [Cookbook: building a CLI tool](../cookbook/cli-tool.md) — a
  complete worked example.
