---
sidebar_position: 30
title: "core.cli — declarative CLI framework"
description: "Build command-line tools the Verum way: typed argument protocols (FromArg / ValueEnum), fluent App.new builder, combinator-based parser, did-you-mean diagnostics, sysexits-aligned exit codes, and (Phase 1) declarative @command derive."
status: regression-only
slug: /stdlib/cli
---

import StdlibStatus from '@site/src/components/StdlibStatus';

# `core.cli` — declarative CLI framework

<StdlibStatus status="regression-only" />

`core.cli` is Verum's first-class toolkit for building command-line
tools.  It treats the CLI as a typed surface — every flag, argument,
and subcommand is a declarative spec the runtime resolves into a
parsed value with structured diagnostics — and it leaves Rust-style
ad-hoc `args.next()` parsing in the compiler-test corner where it
belongs.

> **One-line entry-point.** `mount core.cli.*;` imports everything
> a script needs: types, builder, runtime, error model, help
> renderer.  No second cog, no procedural-macro dance.

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

:::caution Not shipped
The derive does not run yet — measured, not guessed. The library says so
itself, and says it in a place you can read without leaving the shell:

```
grep -nE 'Status: Phase 1|macro pass lands' core/cli/derive.vr
#  7:// Status: Phase 1 — semantic-only, scaffolding for the meta1 macro pass
# 18:// Until the macro pass lands, hand-written code uses `cli.builder` to
```

Copying the block below and
running it today gives `error: No main function found in VBC module`,
because the entry point Verum recognises is `fn main()` or
`fn main(args: List<Text>)` — a typed `fn main(args: Args) -> ExitCode`
is part of the desugaring that has not landed.

Two smaller differences from the library while you read: the derive's own
contract spells its arguments with `=` (`@command(name = "tool", version
= "1.0")`), and the handler is a named function taking a
`&HandlerContext`, not `main`.  `core/cli/derive_example.vr` is the
end-to-end shape the library itself maintains.

**What works today** is §1 above — `App.new`, the fluent builder, and the
combinator parser.  `ExitCode.Ok` and `ExitCode.ok()` are both real
(`core/cli/error.vr`); everything else in this section describes the
planned surface.
:::

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
    ExitCode.Ok
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

The builder is `AppBuilder`, and it takes the name AND the one-line
description together — there is no `.about(…)` step. A flag's
value-or-switch nature is chosen by its CONSTRUCTOR (`FlagSpec.value` vs
`FlagSpec.switch`), not by a `.takes_value()` builder, and every spec
constructor takes its help text as the second argument.

```verum
mount core.cli.builder.{AppBuilder, FlagBuilder};
mount core.cli.spec.{ArgSpec, FlagSpec, CommandSpec};
mount core.cli.runtime.{App};

let spec: CommandSpec = AppBuilder.new("wave", "Greet a value, the Verum way.")
    .version("0.1.0")
    .arg(ArgSpec.required("name", "Who to greet."))
    .flag(FlagBuilder.value("count", "Repeat the greeting N times.")
        .short('n')
        .default("1")
        .build())
    .flag(FlagSpec.switch("no-newline", "Suppress trailing newline."))
    .build();

let app = App.from_spec(spec);
```

`AppBuilder.build()` returns a **`CommandSpec`** — the description of
the command — and `App.from_spec` turns that into the runnable `App`.
`App` is not generic: it is `{ spec, registry, style }`, and handlers
are attached with `.register(name, handler)`.

The per-argument builders are `ArgBuilder` and `FlagBuilder`; each ends
in `.build()` and yields the corresponding spec. Use the `ArgSpec` /
`FlagSpec` constructors directly when you need no extra steps:

    ArgSpec.required(name, help)   ArgSpec.optional(name, help)
    ArgSpec.variadic(name, help)
    FlagSpec.switch(long, help)    FlagSpec.value(long, help)

:::caution Does not run yet at Tier 0
`CommandSpec.new` initialises its `settings` field with
`Default.default()`, and that call dispatches by NAME across the whole
program rather than by the field's declared type — it lands on
`GitRevision.default` and panics. So `AppBuilder.new(…)` cannot return
in the interpreter today. Tracked as T1272; the shapes above are read
off the `implement` blocks and are what the API will be once the
dispatch is fixed.
:::

An `App` can be invoked several ways:

```verum
// Standard: parse argv from `env`, dispatch, and exit the process.
// `run_or_exit` returns `!` — it does not come back. Internally it
// reads `env.args()`, calls `try_run`, and passes `code.code()` to
// `env.exit`.
app.run_or_exit();

// Test mode: parse a manufactured argv vector and get the exit code
// back instead of exiting. Used in `@test` and golden-test harnesses.
let outcome: Result<ExitCode, ParseError> =
    app.try_run(List.from(["wave", "Maxim", "-n", "3"]));

// JSON-schema export: a spec serialises to a stable schema for
// editors / shells / completion engines. It is a free function over
// the SPEC, not a method on the app —
// `core.cli.json_schema.{render, render_compact}`.
let schema = json_schema.render(&spec);
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
// `try_run` is the entry that hands the error back; `run_or_exit`
// calls it with `env.args()` and exits for you. There is no
// `parse_with_errors`, no `env.argv()` and no `env.is_json_mode()`.
match app.try_run(env.args()) {
    Result.Ok(code) => code,
    Result.Err(err) => {
        // `ParseError` is a RECORD carrying the structured hints:
        //   { kind, field: Maybe<Text>, value: Maybe<Text>,
        //     message: Text, diagnostics: List<ParseDiagnostic> }
        eprint(&err.message);
        for d in &err.diagnostics {
            // `ParseDiagnostic` is a SUM — DidYouMean(Text) |
            // ExpectedOneOf(List<Text>) | ValidRange(Text) |
            // SeeHelp(Text) — and `to_text` renders one hint line.
            // There is no `render_pretty` and no `to_json`.
            eprint(&d.to_text());
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
| `Ok` | 0 | success |
| `GenericError` | 1 | generic error |
| `Usage` | 2 | bad argv / parse error |
| `DataErr` | 65 | invalid input data |
| `NoInput` | 66 | input file unreadable |
| `NoUser` | 67 | addressee unknown |
| `NoHost` | 68 | host unknown |
| `Unavailable` | 69 | service unavailable |
| `Software` | 70 | internal software error |
| `OsErr` | 71 | OS-level error |
| `CantCreate` | 73 | cannot create output |
| `IoErr` | 74 | generic I/O failure |
| `TempFail` | 75 | temporary failure (try again) |
| `NoPerm` | 77 | permission denied |
| `ConfigErr` | 78 | configuration error |
| `SigInt` | 130 | interrupted (Ctrl-C) |
| `SigTerm` | 143 | terminated |
| `Custom(Int)` | *n* | any code the roster above does not name |

`ExitCode` converts in one direction only: `code(&self) -> Int` gives
the POSIX number (`Ok` → 0, `Usage` → 2, `DataErr` → 65, …). There is no
`from_raw`; to exit with a number the enum does not name, call
`env.exit(n)` directly.

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

`core.cli.plugin` models plugins rather than finding them:
`PluginManifest.new(name, version)`, and a `PluginRegistry` you
`install` into, ask `count` of, and `attach_to` a `CommandSpec`.
Enumerating what is actually on `PATH` is not part of it — there is no
`discover()`, and the registry is populated by the caller.

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
