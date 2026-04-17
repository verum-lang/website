---
sidebar_position: 5
title: CLI Commands
---

# CLI Commands

Complete `verum` command reference. For a usage-first overview, see
**[Tooling → CLI](/docs/tooling/cli)**.

## Project

### `verum new <name>`

Create a new project.

### `verum init [path]`

Initialise an existing directory.

### `verum deps add <name>`

Add a dependency. Flags:
- `--version <version>` — pin the version.
- `--dev` — dev-only dependency.
- `--build` — build-only dependency.

### `verum deps remove <name>`

Remove a dependency.

Flags: `--dev`, `--build` — remove from the dev/build section.

### `verum deps update [<package>]`

Update dependencies (all, or a specific one).

### `verum deps list`

Flags:
- `--tree` — render as a tree.

## Build & run

### `verum build`

Compile the project.

Flags:
- `--release` — release profile.
- `--target <triple>` — cross-compile.
- `--features <list>` — enable features.
- `--all-features`, `--no-default-features`.
- `-j <N>` / `--jobs <N>` — parallel jobs.
- `--timings` — per-phase timing report.
- `--verify <strategy>` — override the verification strategy
  (`runtime | static | formal | fast | thorough | certified | synthesize`).
- `--smt-stats` — print SMT routing telemetry after compilation.
- `--lto <thin|full>`, `--static-link`, `--strip`, `--strip-debug`.
- `--emit-asm`, `--emit-llvm`, `--emit-bc`, `--emit-types`, `--emit-vbc`.
- `--keep-temps` — keep intermediate artefacts.
- `--deny-warnings`, `--strict-intrinsics`.
- `-D <lint>`, `-W <lint>`, `-A <lint>`, `-F <lint>`.

### `verum run [FILE]`

Run a project or a single `.vr` file.

Flags:
- `--interp` — interpreter (default).
- `--aot` — LLVM AOT, mutually exclusive with `--interp`.
- `--release`.
- `--timings`.
- Arguments after `--` are forwarded to the program.

### `verum check [PATH]`

Type-check only.

Flags:
- `--workspace` — check every workspace member.
- `--parse-only` — stop after parsing (for parse-pass regression tests).

### `verum test`

Flags:
- `--filter <regex>`.
- `--release`.
- `--nocapture` — don't suppress stdout/stderr.
- `--test-threads <N>`.
- `--coverage` — enable coverage instrumentation.

### `verum bench`

Flags:
- `--filter <regex>`.
- `--save-baseline <name>` — save results as a baseline.
- `--baseline <name>` — compare against a saved baseline.

### `verum fmt`

Flags:
- `--check` — error if unformatted (CI mode).
- `--verbose`.

### `verum lint`

Flags:
- `--fix` — apply autofixes where available.
- `--deny-warnings`.

### `verum doc`

Flags:
- `--open` — open docs in the default browser.
- `--document-private-items`.
- `--no-deps`.
- `--format <html|markdown|json>` (default `html`).

### `verum clean`

Flags:
- `--all` — wipe caches too, not just `target/`.

### `verum watch [COMMAND]`

Rebuild on source change. `COMMAND` defaults to `build`.

Flags:
- `--clear` — clear the terminal between runs.
- `--skip-verify`.

## Verification

### `verum verify [FILE]`

Run the formal-verification pipeline.

Flags:
- `--mode <strategy>` — `runtime | static | formal | fast | thorough | certified | synthesize`
  (aliases: `none → runtime`, `proof → formal`).
- `--profile` — include timing breakdown.
- `--show-cost` — print the SMT obligation cost model.
- `--compare-modes` — run several modes and compare.
- `--solver <z3|cvc5|auto|portfolio|capability>` — default `z3`.
  Unknown values error with the accepted-values list. CVC5 / portfolio /
  capability routing ships in stub mode in the default build (transparent
  Z3 fallback); build with `--features cvc5-ffi` to link real libcvc5.
- `--timeout <seconds>` (default 30).
- `--cache` — populate / read the proof cache.
- `--interactive` — step through obligations.
- `--function <name>` — verify a single function.

### `verum analyze`

Run a static analysis suite.

Flags:
- `--escape` — CBGR escape analysis.
- `--context` — capability context analysis.
- `--refinement` — refinement-type analysis.
- `--all` — run them all.

### `verum audit`

Scan dependencies against the security advisory DB.

Flags:
- `--details` — per-advisory details.
- `--direct-only` — skip transitive deps.

### `verum smt-info`

Diagnose the verification toolchain — linked backends, advanced
capability matrix (interpolation, synthesis, abduction), and suggested
feature activations. Does not touch user code.

Flags: `--json`.

### `verum smt-stats`

Read routing statistics from the most recent verification session.

Flags:
- `--json`.
- `--reset` — clear statistics after printing.

## Profiling

### `verum profile [FILE]`

Performance profiling with CBGR overhead analysis.

Flags:
- `--memory` — Tier 0 / 1 / 2 reference distribution, per-function
  heap-allocation report.
- `--cpu` — hot-function profile.
- `--cache` — proof-cache performance.
- `--compilation` — phase-level compilation timings.
- `--hot-threshold <pct>` (default `5.0`) — percent CPU considered hot.
- `--output <path>`.
- `--suggest` — print actionable optimisation hints.

## Documentation & diagnostics

### `verum explain <code>`

Print the extended explanation for an error code (e.g. `E0312`, or
`0312` without the prefix).

Flags: `--no-color`.

### `verum info`

Compiler info.

Flags:
- `--features` — enabled build features.
- `--llvm` — LLVM version / features.
- `--all`.

## Services

### `verum lsp`

Language server.

Flags:
- `--transport <stdio|socket>` (default `stdio`).
- `--port <N>` (required for `socket`).
- Language-feature overrides.

### `verum dap`

Debug adapter.

Flags: same shape as `lsp`.

## Interactive

### `verum repl`

Flags:
- `--preload <file>`.
- `--skip-verify`.

### `verum playbook [FILE]`

Notebook-style TUI.

Flags:
- `--tier <0|1>` — `0` is the interpreter (safe), `1` is AOT (fast).
- `--vim`.
- `--preload <file>`.
- `--tutorial` — start with the interactive language tour.
- `--profile` — live performance display.
- `--export <out.vr>` — on exit.
- `--no-color`.

### `verum playbook-convert to-script <IN>`

Convert a `.vrbook` playbook to a `.vr` script.

Flags:
- `-o, --output <path>`.
- `--include-outputs` — keep cell outputs as comments.

### `verum playbook-convert from-script <IN>`

Convert a `.vr` script to a `.vrbook` playbook.

Flags: `-o, --output <path>`.

## Packaging

### `verum package publish`

Publish to the registry.

Flags:
- `--dry-run`.
- `--allow-dirty` — publish with uncommitted changes.

### `verum package search <query>`

Flags: `--limit <N>` (default 10).

### `verum package install <name>`

Flags: `--version <version>`.

### `verum tree`

Dependency tree.

Flags:
- `--duplicates`.
- `--depth <N>`.

## Workspace

### `verum workspace list`

### `verum workspace add <path>`

### `verum workspace remove <name>`

### `verum workspace exec -- <command>`

Run a command in every workspace member.

## Configuration

### `verum config show`

Print the resolved feature set.

Flags: `--json`.

### `verum config validate`

Validate `Verum.toml` without building. Exits 0 on success, non-zero
with diagnostics on invalid values (including "did you mean"
suggestions for enum typos).

### `verum completions <SHELL>`

Generate shell completion scripts.

```bash
verum completions bash  > ~/.bash_completion.d/verum
verum completions zsh   > ~/.zfunc/_verum
verum completions fish  > ~/.config/fish/completions/verum.fish
```

Shells: `bash`, `zsh`, `fish`, `powershell`, `elvish`.

## Version

### `verum version`

Flags: `--verbose`.

## Language-feature overrides

All commands that compile or check code (`build`, `run`, `check`,
`test`, `bench`, `verify`, `fmt`, `lint`, `doc`, `repl`, `dap`,
`lsp`, `config show`, `config validate`) accept the same set of
language-feature overrides:

**High-level flags:**

| Flag | Verum.toml equivalent |
|------|----------------------|
| `--tier <interpret\|aot\|check>` | `[codegen] tier` |
| `--gpu` / `--no-gpu` | `[codegen] mlir_gpu` |
| `--gpu-backend <metal\|cuda\|…>` | `[codegen] gpu_backend` |
| `--cbgr <managed\|checked\|mixed\|unsafe>` | `[runtime] cbgr_mode` |
| `--scheduler <…>` | `[runtime] async_scheduler` |
| `--no-refinement` | `[types] refinement = false` |
| `--no-cubical` | `[types] cubical = false` |
| `--no-dependent` | `[types] dependent = false` |
| `--universe-poly` | `[types] universe_polymorphism = true` |
| `--no-unsafe` | `[safety] unsafe_allowed = false` |
| `--capabilities` | `[safety] capability_required = true` |
| `--mls <public\|secret\|top_secret>` | `[safety] mls_level` |
| `--no-compile-time` | `[meta] compile_time_functions = false` |
| `--no-derive` | `[meta] derive = false` |
| `--dap` / `--no-dap` | `[debug] dap_enabled` |
| `--dap-port <N>` | `[debug] port` |

**Generic escape hatch:**

```
-Z <section>.<field>=<value>
```

Any dotted path into the manifest (e.g., `-Z types.cubical=false`,
`-Z test.timeout_secs=120`, `-Z safety.mls_level=secret`).

**Precedence** (low → high): defaults < `Verum.toml` < high-level
flags < `-Z` overrides.

Invalid `-Z` keys produce a descriptive error listing all valid
prefixes. Typos trigger "did you mean" suggestions.

## Environment variables

```
VERUM_HOME              # toolchain root (default ~/.verum)
VERUM_LOG               # log level (trace|debug|info|warn|error)
VERUM_SMT_TELEMETRY     # emit SMT routing telemetry
VERUM_TARGET_DIR        # default output directory
VERUM_TOKEN             # registry authentication
```

## See also

- **[Tooling → CLI](/docs/tooling/cli)** — usage-oriented overview.
- **[Verification → gradual verification](/docs/verification/gradual-verification)** — verify `--mode` strategies.
- **[Architecture → SMT integration](/docs/architecture/smt-integration)** — `smt-info` / `smt-stats` internals.
