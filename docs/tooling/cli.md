---
sidebar_position: 1
title: CLI
---

# `verum` — Command-line interface

The `verum` binary is self-contained: compiler, interpreter, linker,
package manager, LSP server, and formatter in one executable. It
exposes the following subcommands.

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
verum verify [FILE] --mode <runtime|proof|compare|cubical|dependent> \
                    --solver <z3|cvc5|auto|portfolio|capability> \
                    --timeout 120 [--cache] [--function NAME] \
                    [--profile] [--budget DURATION] [--export PATH] \
                    [--distributed-cache URL]
verum analyze [--escape] [--context] [--refinement] [--all]
verum audit [--details] [--direct-only]
verum lint [--fix] [--deny-warnings]
verum fmt [--check]
```

Verification modes map to strategies documented in **[Verification →
gradual verification](/docs/verification/gradual-verification)**.

### Verification profiling & budgets

| Flag | Purpose |
|------|---------|
| `--profile` | Collect per-function timings, bottleneck categories, and cache stats; prints the report at the end of the run. |
| `--budget DURATION` | Project-wide wall-clock budget — `120s`, `2m`, `1h`, or a bare number (seconds). Fails the build if the total time exceeds the budget; already-finished files are reported, the remainder are skipped. |
| `--export PATH` | Write the profile report as JSON to `PATH`. Implies `--profile`. Intended for CI/CD integration — trend tracking, dashboards, regression alerts. |
| `--distributed-cache URL` | Advertise a distributed verification cache (e.g. `s3://bucket/verify-cache`, `redis://host`). Plumbed through to the compiler via `CompilerOptions::distributed_cache_url`; actual wire-up is a server-side feature. |

Defaults for all four knobs can live in the `[verify]` block of
`verum.toml` (`total_budget`, `distributed_cache`, `profile_slow_functions`,
`profile_threshold`). CLI flags always override the manifest.

## Profiling

```bash
verum profile [FILE] [--compilation] [--memory] [--cpu] [--cache] [--all] \
                     [--hot-threshold 5.0] [--sample-rate PERCENT] \
                     [--functions NAME1,NAME2] [--precision us|ns] \
                     [--output OUT] [--suggest]
```

`--memory` reports CBGR tier distribution (Tier 0 / 1 / 2 breakdown);
`--cpu` shows runtime cost; `--cache` analyses cache behaviour;
`--compilation` shows compiler-phase timings. `--all` expands to every
slice and renders them in a single **unified dashboard** (spec §6) —
one header, correlated sections, ranked hot-spots, actionable
recommendations. `--suggest` emits optimisation hints.

### CBGR sampling knobs

| Flag | Purpose |
|------|---------|
| `--sample-rate PERCENT` | Sampling rate for the CBGR profiler, `0.0`–`100.0`. Smaller values reduce overhead; `1.0` is the safe default. |
| `--functions a,b,c` | Restrict the report to these exact function names. The filter is applied upstream, so every downstream section (hot-spots, breakdown, recommendations) sees the same population. |
| `--precision us\|ns` | Timer granularity. `us` renders timings in milliseconds (default); `ns` uses the native `Instant::now` resolution and dynamically picks `ns` / `µs` / `ms` per magnitude so sub-microsecond costs stay legible. |

## Docs & diagnostics

```bash
verum doc [--open] [--document-private-items] [--format html|markdown|json]
verum explain <code> [--no-color]      # e.g. verum explain E0312
verum info [--features] [--llvm] [--all]
verum smt-info [--json]                # verification backends
verum smt-stats [--json] [--reset]     # last-session routing telemetry
```

## Crash reports

The toolchain captures panics and fatal signals to structured reports
under `~/.verum/crashes/`. See
**[Tooling → Crash diagnostics](/docs/tooling/diagnostics)** for the
full workflow; the commands themselves are:

```bash
verum diagnose list [--limit N]
verum diagnose show [REPORT] [--json] [--scrub-paths]
verum diagnose bundle [-o OUT] [--recent N] [--scrub-paths]
verum diagnose submit [--repo owner/name] [--recent N] [--dry-run]
verum diagnose env [--json]
verum diagnose clean [--yes]
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
