---
sidebar_position: 5
title: CLI Commands
---

# CLI Commands

Complete `verum` command reference. For a friendlier overview, see
**[Tooling → CLI](/docs/tooling/cli)**.

## Project

### `verum new <name>`

Create a new project. Flags:
- `--lib` — library instead of application.
- `--profile <application|systems|research>` — starter profile.
- `--git` / `--no-git` — initialise git.

### `verum init [path]`

Initialise an existing directory.

### `verum add <dep>[@version]`

Add a dependency. Flags:
- `--dev` — dev-only dependency.
- `--optional` — optional dependency behind a feature.
- `--features "a,b"` — enable features.

### `verum remove <dep>`

Remove a dependency.

## Build & run

### `verum build`

Compile the project.

Flags:
- `--release` — release profile.
- `--profile <name>` — specific profile.
- `--target <triple>` — cross-compile.
- `--features <list>` — enable features.
- `--no-default-features`, `--all-features`.
- `--out-dir <path>` — override output directory.
- `--message-format <human|json>` — diagnostics format.
- `--timings` — emit per-phase timing report.
- `-j <N>` — parallel jobs.

### `verum run`

Build and execute. Pass arguments to the program after `--`:

```bash
verum run -- --port 8080 config.toml
```

### `verum check`

Type-check only. Fast (no codegen).

### `verum test`

Run tests. Flags:
- `--filter <regex>` — test name filter.
- `--verify <level>` — override verify level.
- `--nocapture` — don't suppress test output.
- `--bench` — run benchmarks instead of tests.

### `verum bench`

Run benchmarks.

### `verum watch`

Watch source files and re-build on change. Flags:
- `--cmd <command>` — run after each successful build (`test`, `run`, etc.).

## Verification & analysis

### `verum verify`

Run the verification pipeline.

Flags:
- `--level <runtime|static|smt|portfolio|certified>` — minimum level.
- `--timeout <ms>` — per-obligation timeout.
- `--emit-smtlib` — dump SMT-LIB queries to `target/smtlib/`.

### `verum analyze`

Run a static analysis.

Flags:
- `--report <cbgr|refinements|capabilities|smt|all>` — pick a report.
- `--format <human|json>` — output format.

### `verum audit`

Scan dependencies against the advisory database.

### `verum lint`

Run the linter.

### `verum fmt`

Format all files.

Flags:
- `--check` — error if unformatted; don't modify.
- `--write` — modify in place (default).

## Documentation

### `verum doc`

Generate docs.

Flags:
- `--open` — open generated docs in the browser.
- `--private` — include private items.
- `--search <query>` — search docs.

### `verum explain <code>`

Print the extended explanation for an error code.

### `verum api`

Query the API surface.

```bash
verum api --signature "fn map"
verum api --type "Iterator"
```

## Interactive

### `verum repl`

Launch the REPL. See **[REPL](/docs/tooling/repl)**.

### `verum playbook`

Launch the Playbook TUI. See **[Playbook](/docs/tooling/playbook)**.

### `verum file <path.vr>`

Run a single `.vr` file as a script.

## Services

### `verum lsp`

Run the language server over stdin/stdout. See **[LSP](/docs/tooling/lsp)**.

### `verum dap`

Run the debug adapter over stdin/stdout.

## Packaging

### `verum publish`

Publish to the registry.

Flags:
- `--dry-run` — build artefacts, don't upload.
- `--registry <name>` — alternate registry.
- `--token <token>` — authentication token.
- `--allow-dirty` — publish even with uncommitted changes (discouraged).

### `verum search <query>`

Search the registry.

### `verum tree`

Print the dependency tree.

### `verum deps`

Dependency analysis. Flags:
- `--duplicates` — find duplicate dependencies.
- `--unused` — find unused dependencies.
- `--outdated` — show dependencies with newer versions.

## Package lifecycle

### `verum cog-manager install <cog>`

Install a cog to the user's library.

### `verum cog-manager update`

Update installed cogs.

### `verum cog-manager list`

List installed cogs.

## Utilities

### `verum clean`

Remove `target/`.

### `verum update`

Update dependencies per `Verum.toml` constraints.

### `verum version`

Print version info.

### `verum config get <key>` / `verum config set <key> <value>`

Read / write configuration.

### `verum proof-cache stats`

Statistics on the SMT proof cache.

### `verum proof-cache clear`

Clear the SMT proof cache.

### `verum disasm <artefact>`

Disassemble a VBC artefact.

### `verum vbc-stats <artefact>`

Statistics on a VBC artefact.

### `verum expand-macros [path]`

Show post-macro-expansion source.

### `verum target install <triple>`

Install a cross-compilation target.

## Global flags

Available on every command:

```
--verbose, -v          # increase verbosity
--quiet, -q            # reduce verbosity
--offline              # don't hit the network
--frozen               # error on lockfile mismatch
--locked               # use lockfile exactly
--manifest-path <path> # override Verum.toml
--color <always|auto|never>
```

## Environment variables

```
VERUM_HOME              # toolchain root (default ~/.verum)
VERUM_LOG               # log level (trace|debug|info|warn|error)
VERUM_SMT_TELEMETRY     # emit SMT routing telemetry
VERUM_PROFILE           # default profile
VERUM_TARGET_DIR        # default output directory
VERUM_TOKEN             # registry authentication
```

## See also

- **[Tooling → CLI](/docs/tooling/cli)** — usage-oriented overview.
