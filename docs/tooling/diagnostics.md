---
sidebar_position: 8
title: Crash diagnostics
description: How the Verum toolchain captures panics and fatal signals, and how to inspect the structured crash reports it produces.
---

# Crash diagnostics

The `verum` binary installs a crash reporter at process start. Every
panic and every fatal signal (`SIGSEGV`, `SIGBUS`, `SIGILL`, `SIGFPE`,
`SIGABRT` on Unix; `SetUnhandledExceptionFilter` on Windows) produces
a structured report on disk with:

- the command the user ran, its cwd, and a filtered view of the
  process environment (secret-looking keys redacted);
- the frozen build identity — `verum` version, git SHA,
  build profile, target triple, `rustc --version`;
- the compiler phase where the fault occurred, via an RAII
  **breadcrumb trail** maintained by the pipeline;
- a Rust backtrace, which resolves to `file:line` when the binary
  ships with DWARF line tables (see [profiles](#debug-info-profile)).

Reports live under `~/.verum/crashes/` as a matching `.log` (human)
and `.json` (schema-versioned) pair. The reporter keeps the last 50
by default and rotates older ones out.

The `verum diagnose` subcommand is the user-facing interface for the
report store — list, show, sanitise, bundle, and submit.

## Report layout

```
~/.verum/crashes/
  verum-2026-04-19T05-08-22-d6b3-abcdef-0.log   ← human-readable
  verum-2026-04-19T05-08-22-d6b3-abcdef-0.json  ← structured (schema v1)
```

Filenames sort chronologically (ISO-8601 date with `-` in place of
`:` for filesystem portability).

### `.log` example

```
=== Verum crash report ===========================================
Report ID:   1538d-19da2a45011-0
Timestamp:   1776550170641 (unix-ms)
Kind:        fatal signal SIGSEGV (11)
Thread:      verum-main
Message:     received fatal signal SIGSEGV (11)

Build:       verum 0.1.0 (release, aarch64-apple-darwin, rustc 1.93.0, git abc1234 clean)
Host:        macos aarch64 (16 cores)
PID:         86925
Cwd:         /Users/me/projects/demo
Args:        verum build ./src/main.vr

Context:
  command:    build
  input:      ./src/main.vr

Breadcrumbs (most recent last):
  [  1611ms] compiler.run_native_compilation     ./src/main.vr   [thread=verum-main]
  [   313ms] compiler.phase.generate_native      ./src/main.vr   [thread=verum-main]
  [    12ms] compiler.codegen.vbc_to_llvm        project          [thread=verum-main]

Backtrace:
   …

Environment (filtered):
  HOME=/Users/me
  LANG=en_US.UTF-8
  TMPDIR=/Users/me/.tmp
  RUST_BACKTRACE=1
===================================================================
```

### `.json` example

```json
{
  "schema_version": 1,
  "report_id": "1538d-19da2a45011-0",
  "timestamp_ms": 1776550170641,
  "kind": { "type": "signal", "name": "SIGSEGV", "signo": 11 },
  "message": "received fatal signal SIGSEGV (11)",
  "location": null,
  "backtrace": "…",
  "thread_name": "verum-main",
  "breadcrumbs": [
    { "phase": "compiler.run_native_compilation", "detail": "./src/main.vr", "thread": "verum-main", "age_ms": 1611 },
    { "phase": "compiler.phase.generate_native",  "detail": "./src/main.vr", "thread": "verum-main", "age_ms": 313  }
  ],
  "context": { "command": "build", "input_file": "./src/main.vr" },
  "environment": {
    "verum_version": "0.1.0",
    "build_profile": "release",
    "build_target":  "aarch64-apple-darwin",
    "build_rustc":   "rustc 1.93.0",
    "build_git_sha": "abc1234",
    "build_git_dirty": "clean",
    "os": "macos",
    "arch": "aarch64",
    "cpu_cores": 16,
    "pid": 86925,
    "cwd": "/Users/me/projects/demo",
    "argv": ["verum", "build", "./src/main.vr"],
    "env": { "HOME": "/Users/me", "RUST_BACKTRACE": "1", … }
  }
}
```

## Breadcrumbs

The pipeline instruments its major phases with RAII breadcrumbs — the
trail of phase names and per-phase details leading up to the crash.
Typical phases:

| Phase | When |
|-------|------|
| `compiler.run_native_compilation` | AOT build driver |
| `compiler.phase.stdlib_loading` | embedded stdlib |
| `compiler.phase.project_modules` | sibling modules |
| `compiler.phase.load_source` / `.parse` | front-end |
| `compiler.phase.type_check` | type inference |
| `compiler.phase.verify` | refinement / SMT |
| `compiler.phase.cbgr_analysis` | CBGR tier analysis |
| `compiler.phase.ffi_validation` | FFI boundary checks |
| `compiler.phase.rayon_fence` | wait for rayon workers before LLVM |
| `compiler.phase.generate_native` | LLVM codegen |
| `compiler.codegen.vbc_to_llvm` | inner VBC → LLVM lowering |
| `compiler.phase.interpret` | Tier 0 (VBC interpreter) |

Third-party code that embeds `verum_compiler` / `verum_vbc` can push
its own breadcrumbs:

```rust
let _bc = verum_error.breadcrumb::enter("mytool.stage", file_path);
// work happens here; breadcrumb is popped automatically on scope exit
```

The trail is bounded (64 entries) and mirrored to a
cross-thread snapshot so the signal handler can include it even
when the offending thread's TLS is unreachable.

## Sensitive data

The reporter is conservative about what it captures:

- `argv`, `cwd`, and the breadcrumb details are **preserved verbatim**
  in the on-disk report. They are intended for the developer who ran
  the build — the report is local, not uploaded.
- Environment variables are filtered. Only `VERUM_*`, `RUST*`,
  `CARGO*`, and a curated whitelist (`HOME`, `USER`, `LANG`,
  `TERM`, `TMPDIR`, `LLVM_*`, etc.) survive. Anything whose name
  contains `PASSWORD`, `SECRET`, `TOKEN`, `APIKEY`, `PRIVATE`,
  `SESSION`, `COOKIE`, `CREDENTIAL`, `AUTH`, or `PASSPHRASE` is
  replaced with `<redacted>` even if the name itself is whitelisted.

When sharing a report externally, use `--scrub-paths` to replace
`$HOME` with `~` and the current username with `<user>` in the
emitted output. The originals on disk are not modified.

## The `verum diagnose` command

```bash
verum diagnose <subcommand> [options]
```

### `list`

List recent reports in `~/.verum/crashes/`, newest first, with a
one-line summary of each (kind, message, build, last known phase).

```bash
verum diagnose list                # last 20
verum diagnose list --limit 50     # widen the window
```

### `show`

Print the full report to stdout. Defaults to the most recent.

```bash
verum diagnose show                                # newest .log
verum diagnose show path/to/report.log
verum diagnose show --json                         # structured form
verum diagnose show --scrub-paths                  # safe-to-share render
```

### `bundle`

Pack recent reports (both the `.log` and the `.json`) into a single
`.tar.gz` suitable for attaching to an issue. A README inside the
archive explains where to upload it.

```bash
verum diagnose bundle                              # last 5 → ./verum-crash-bundle-<ts>.tar.gz
verum diagnose bundle --recent 3 -o report.tgz
verum diagnose bundle --scrub-paths                # sanitise every file in the archive
```

`--scrub-paths` rewrites each bundled file — the originals under
`~/.verum/crashes` are untouched.

### `submit`

Open a new GitHub issue via the `gh` CLI. Paths are always scrubbed
before upload; the `.tar.gz` path is printed for the user to attach
manually (the `gh` CLI does not accept attachments at issue creation
time).

```bash
verum diagnose submit                                # verum-lang/verum
verum diagnose submit --repo my/fork --recent 3
verum diagnose submit --dry-run                      # print the gh invocation
```

Requires `gh auth login`.

### `env`

Print the build/host environment snapshot that the reporter captured
at install time — useful when diagnosing "which `verum` am I running"
questions without needing a crash.

```bash
verum diagnose env
verum diagnose env --json
```

### `clean`

Delete every report in `~/.verum/crashes/`.

```bash
verum diagnose clean          # prompts for confirmation
verum diagnose clean --yes    # unattended
```

## Debug-info profile

The primary `[profile.release]` stays stripped for binary size and
runtime stability (keeping DWARF in release re-introduces an LLVM
pass-registration race on macOS — see the note below). A dedicated
profile keeps line tables so crash-report backtraces resolve to
`file:line`:

```bash
cargo build --profile release-debug-tables --bin verum
```

This produces `target/release-debug-tables/verum` plus an external
`.dSYM` (macOS) or `.dwp` (Linux) bundle next to the binary. The main
binary size is unchanged; the extra data lives in the bundle, which
the `backtrace` crate consults automatically when resolving frames.

Ship the debug-tables build to users who are triaging a reported
bug; keep the primary `release` build on production paths. Do **not**
fold `debug = "line-tables-only"` into `[profile.release]` — the
extra DWARF-emitter passes expand the lazy-init surface that races
rayon worker wake paths, re-introducing a ~70 % SIGSEGV rate in the
`phase_generate_native` codegen step.

## Chaining your own panic hook

`crash.install` chains into whatever hook was set before it. If you
need custom panic metrics in addition to the crash report, install
your hook first:

```rust
fn main() {
    my_metrics.install_panic_hook();
    verum_error.crash::install(Default.default());
    …
}
```

The Verum CLI itself does **not** install the stock `PanicLogger`
from `verum_error.panic_handler` by default — benchmarking showed
the extra hook measurably increased the crash rate on the
`phase_generate_native` race path (0 / 50 → 11 / 50 release builds).
The structured report produced by the crash reporter already contains
everything `PanicLogger` would record plus the breadcrumb trail and
environment.

## Signal-safety caveats

The reporter is best-effort async-signal-safe, not strictly so. It:

- installs on an alternate signal stack (`sigaltstack`) so a stack
  overflow still reaches the handler;
- pre-creates the report directory at install time;
- uses the `backtrace` crate to capture frames from the signal path
  (pragmatic choice — not strictly sig-safe but works in practice for
  dev tools);
- re-raises the original signal after writing the report so the
  kernel still produces a core dump if `ulimit -c` allows.

A hard fault may leave the global allocator poisoned; in that case
the JSON write may fail and only the short stderr notice survives.
That notice still includes the report ID so a subsequent run can
correlate the two events.

## Configuration

All of the above is controlled by
`verum_error.crash::CrashReporterConfig`:

| Field | Default | Notes |
|-------|---------|-------|
| `app_name` | `"verum"` | |
| `app_version` | `env!("CARGO_PKG_VERSION")` | |
| `report_dir` | `~/.verum/crashes/` | `$HOME`-relative |
| `retention` | `50` | older reports rotated off |
| `capture_backtrace` | `true` | also forces `RUST_BACKTRACE=1` |
| `install_signal_handlers` | `true` | Unix + Windows |
| `redact_sensitive_env` | `true` | | 
| `issue_tracker_url` | `verum-lang/verum` | shown on crash |

Downstream tools that embed the compiler should install with an
`app_name` + `issue_tracker_url` appropriate to them so their crash
surfaces point users at the right bug tracker.

## See also

- **[Reference → CLI commands — `verum diagnose`](/docs/reference/cli-commands#verum-diagnose)** — full flag reference.
- **[Guides → Troubleshooting](/docs/guides/troubleshooting)** — common error recipes.
- **[Community → Contributing](/docs/community/contributing)** — how to report a compiler bug.
