---
sidebar_position: 1
title: CLI
---

# `verum` — Command-line interface

The toolchain exposes 31 top-level commands. Everything below lists
real subcommands — if it isn't here, it doesn't exist.

## Project lifecycle

```bash
verum new <name>                     # create a new project
verum init [path]                    # initialise an existing directory
verum deps add <pkg> [--version X] [--dev] [--build]
verum deps remove <pkg> [--dev] [--build]
verum deps update [<pkg>]
verum deps list [--tree]
```

## Build, run, test

```bash
verum build [--release] [--target TRIPLE] [--lto thin|full] [--timings]
verum run [--interp | --aot] [-- args...]
verum check [PATH] [--workspace] [--parse-only]
verum test [--filter REGEX] [--coverage] [--nocapture]
verum bench [--filter REGEX] [--save-baseline NAME | --baseline NAME]
verum watch [<command>] [--clear] [--skip-verify]
```

`verum run` is interpreter-first. Add `--aot` for LLVM native
execution when latency matters (LLVM warmup adds ~200 ms).

## Verification & analysis

```bash
verum verify [FILE] --mode <runtime|static|formal|fast|thorough|certified|synthesize> \
                    --solver z3 --timeout 30 [--cache] [--function NAME]
verum analyze [--escape] [--context] [--refinement] [--all]
verum audit [--details] [--direct-only]
verum lint [--fix] [--deny-warnings]
verum fmt [--check]
```

Verification modes map to strategies documented in **[Verification →
gradual verification](/docs/verification/gradual-verification)**.

## Profiling

```bash
verum profile [FILE] [--compilation] [--memory] [--cpu] [--cache] \
                     [--hot-threshold 5.0] [--output OUT] [--suggest]
```

`--compilation` shows phase timings; `--memory` reports CBGR tier
distribution (Tier 0 / 1 / 2 breakdown); `--suggest` emits actionable
optimisation hints.

## Docs & diagnostics

```bash
verum doc [--open] [--document-private-items] [--format html|markdown|json]
verum explain <code> [--no-color]      # e.g. verum explain E0312
verum info [--features] [--llvm] [--all]
verum smt-info [--json]                # verification backends
verum smt-stats [--json] [--reset]     # last-session routing telemetry
```

## Interactive

```bash
verum repl [--preload FILE] [--skip-verify]
verum playbook [FILE] [--tier 0|1] [--vim] [--preload FILE] [--tutorial] \
                       [--profile] [--export OUT] [--no-color]
verum playbook-convert to-script <IN> [-o OUT] [--include-outputs]
verum playbook-convert from-script <IN> [-o OUT]
```

## Packaging

```bash
verum package publish [--dry-run] [--allow-dirty]
verum package search <query> [--limit 10]
verum package install <name> [--version X]
verum tree [--duplicates] [--depth N]
```

## Workspace

```bash
verum workspace list
verum workspace add <path>
verum workspace remove <name>
verum workspace exec -- <command> [args...]
```

## Services

```bash
verum lsp --transport stdio|socket [--port N]
verum dap --transport stdio|socket [--port N]
```

## Configuration

```bash
verum config show [--json]
verum config get <key>
verum config set <key> <value>
verum clean [--all]
verum version [--verbose]
```

## Global flags

```
--tier 0|1|2|3          # override execution tier
-Z <flag=value>         # unstable / experimental feature flag
-D <lint>               # deny lint
-W <lint>               # warn on lint
-A <lint>               # allow lint
-F <lint>               # forbid lint
```

`-Z`, `-D/-W/-A/-F` are accepted wherever a command compiles code
(build, run, test, check, fmt, lint, doc, lsp, dap, playbook).

## Environment variables

```
VERUM_HOME=~/.verum               # toolchain root
VERUM_LOG=debug                   # log level
VERUM_SMT_TELEMETRY=1             # emit SMT routing telemetry
VERUM_TARGET_DIR=target           # build-output directory
VERUM_TOKEN=...                   # registry token for package publish
```

## Configuration files

- **`verum.toml`** — project manifest (see [verum.toml](/docs/reference/verum-toml)).
- **`.verum/config.toml`** — user-level config.
- **`target/.verum-cache/`** — build / VBC / proof cache.

## See also

- **[Build system](/docs/tooling/build-system)** — how invocations
  feed the pipeline.
- **[Cog packages](/docs/tooling/cog-packages)** — `verum package`
  flows.
- **[Reference → CLI commands](/docs/reference/cli-commands)** — full
  per-command reference with all flags.
