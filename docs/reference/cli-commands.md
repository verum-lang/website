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

Discovers `@test`, `@property`, and `@test_case` functions in `tests/`
and runs them. Tier is controlled by `--interp` / `--aot` (default:
AOT; property tests always route through the interpreter regardless
— see **[Tooling → Property testing](/docs/tooling/property-testing)**).

Filtering:
- `--filter <STR>` — substring match on test name.
- `--exact` — require full-match instead of substring.
- `--skip <PATTERN>` — exclude tests whose name contains `PATTERN`; repeatable.
- `--include-ignored` — run all tests, including `@ignore`d.
- `--ignored` — run ONLY `@ignore`d tests.
- `--list` — print discovered tests and exit without running.

Tier:
- `--interp` — Tier 0 interpreter (in-process, fast iteration).
- `--aot` — Tier 1 native binary per test (default).
- `--tier interpret|aot` — same, long form.

Runtime:
- `--release`.
- `--nocapture` — don't suppress stdout/stderr.
- `--test-threads <N>` — parallel-worker count (requires `[test] parallel = true` in `verum.toml`). Honoured by a dedicated rayon pool.
- `--coverage` — enable coverage instrumentation (pass-through to llvm-cov).

Output:
- `--format pretty|terse|json|junit|tap|sarif` (default `pretty`).
  `json` is NDJSON (one event per test plus a summary). `junit`, `tap`,
  and `sarif` suppress the preamble and emit a single parseable
  document for CI ingest.

### `verum bench`

Discovers `@bench` functions and measures per-function timing using
time-budget–driven sampling (Criterion convention).

Filtering:
- `--filter <STR>`.

Tier:
- `--interp` / `--aot` / `--tier interpret|aot` — default AOT.
  Interpreter is in-process (no `fn main()` needed); AOT synthesises
  one driver binary per `@bench` function.

Sampling:
- `--warm-up-time <SECS>` (default `3.0`).
- `--measurement-time <SECS>` (default `5.0`).
- `--min-samples <N>` (default `10`).
- `--max-samples <N>` (default `100`).
- `--sample-size <N>` — fixed iteration count (overrides time budget).

Output:
- `--format table|json|csv|markdown` (default `table`).
  Statistics reported: median, mean, stddev, MAD, bootstrap 95 % CI,
  Tukey 1.5×IQR outlier count.

Baselines:
- `--save-baseline <NAME>` → `target/bench/<NAME>.json`.
- `--baseline <NAME>` — diff current run against the saved baseline.
- `--noise-threshold <PCT>` (default `2.0`) — percentage below which
  a regression is classified as noise.

### `verum fmt`

Flags:
- `--check` — error if unformatted (CI mode).
- `--verbose`.

### `verum lint`

Verum's static-analysis suite. Configurable via the `[lint]` block
in `verum.toml`; see **[Reference → Lint configuration](/docs/reference/lint-configuration)**
for the full schema (severity per rule, profiles, per-file overrides,
architecture layering, naming conventions, plus refinement /
capability / context / CBGR-tier / verification policy blocks unique
to Verum).

Flags (extending the existing `--fix` / `--deny-warnings`):

- `--fix` — apply autofixes where available; honours `[lint.policy].auto_fix`
  (`safe-only` by default).
- `--deny-warnings` — every warning becomes an error (CI gate).
- `--profile <NAME>` — apply `[lint.profiles.<NAME>]`. Selectable
  also via `VERUM_LINT_PROFILE` env var.
- `--explain <RULE>` — print the rule's documentation, examples of
  violations, and the recommended fix.
- `--list-rules` — every known rule + its category and default
  severity.
- `--validate-config` — run only the config-loader's validator;
  exits 0 / non-zero. Use in pre-commit hooks.
- `--since <GIT_REF>` — lint only files changed since the ref
  (`HEAD~1`, `origin/main`, `abc123`, …).
- `--severity <LEVEL>` — report at this level or higher
  (`error | warn | info | hint`).
- `--format <FMT>` — `pretty` (default) | `json` | `sarif` |
  `github-actions` | `tap`.
- `-D <RULE>` / `-W <RULE>` / `-A <RULE>` / `-F <RULE>` — single-rule
  override (deny / warn / allow / forbid). Same convention as the
  build-time flags.
- `--watch` — re-lint on file changes. Initial scan runs, then
  the watcher debounces FS events (300 ms) and re-runs the
  pipeline. Banner lines (`Watching for changes`, `change detected`)
  go to stderr.
- `--watch-clear` — like `--watch` but clears the screen before
  each re-run (ANSI `2J` + cursor home).
- `--threads <N>` — rayon worker count for the per-file phase.
  `0` = sequential (debugging aid). Defaults to logical-CPU count.
- `--no-cache` — bypass the per-file digest cache for this run
  (also `VERUM_LINT_NO_CACHE=1`).
- `--clean-cache` — wipe `target/lint-cache/` and exit. Idempotent.
- `--baseline <FILE>` — read a pre-recorded suppression set; live
  issues that match an entry are silenced (with a count line).
- `--write-baseline` — snapshot the current run's issue set to
  `.verum/lint-baseline.json` (or the path passed via `--baseline`)
  and exit 0 regardless of issue count.
- `--no-baseline` — disable the baseline-read path even when a
  default-path file exists.
- `--max-warnings <N>` — fail the run if warnings exceed `N`
  (supersedes `--deny-warnings` when both are set; `N=0` is
  identical to `--deny-warnings`).
- `--new-only-since <GIT_REF>` — like `--since`, but additionally
  filters out issues that were also present at `<GIT_REF>` —
  surfaces only issues introduced by the current branch.
- `--list-groups` — list every preset / group (`verum::strict`,
  `verum::pedantic`, etc.) and the rules each contains.

#### Output ordering with `--format json`

When `--format json` is in effect AND none of `--baseline` /
`--write-baseline` / `--fix` are set, `verum lint` runs in
**streaming mode**: each file's diagnostics flush to stdout as
soon as that file's per-file phase completes. Order is
non-deterministic (worker-thread completion). Schema-stable
identity is `(rule, file, line, column)`; consumers that need a
sorted list sort post-hoc on those keys. Other formats (pretty /
human / sarif / tap / gha) and the baseline / fix paths buffer
to a single block in the existing sorted order.

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

Run the formal-verification pipeline on the given file (or the whole
project, when `FILE` is omitted). See also
**[Verification → CLI workflow](/docs/verification/cli-workflow)**.

**Strategy**:
- `--mode <strategy>` / `-m <strategy>` — `runtime | static | formal |
  fast | thorough | certified | synthesize` (aliases: `none → runtime`,
  `proof → formal`). **Default `proof`** (= `formal`).
- `--solver <z3|cvc5|auto|portfolio|capability>` — default `z3`.
  Unknown values error with the accepted-values list. CVC5 / portfolio /
  capability routing ships in stub mode in the default build (transparent
  Z3 fallback); build with `--features cvc5-ffi` to link real libcvc5.
- `--timeout <SECONDS>` — base solver timeout (default `120`).
  Strategy-specific multipliers apply: `fast 0.3×`, `thorough 2×`,
  `certified 3×`, `synthesize 5×`.
- `--smt-proof-preference <BACKEND>` — backend used when the `Certified`
  strategy exports a proof certificate. Default `cvc5` (ALETHE proofs
  are more stable across releases than Z3 native proofs). Only affects
  export; does not change which solver closes an obligation.

**Scope**:
- `--function <NAME>` — verify a single function.
- `--diff <GIT_REF>` — verify only the functions whose source has changed
  since the given ref (`HEAD~1`, `main`, `origin/main`, `abc123`, …).
  Ideal for CI: `verum verify --diff origin/main`.
- `--verify-profile <NAME>` — apply a named `[verify.profiles.<NAME>]`
  profile from `verum.toml`. CLI flags still win over the profile; the
  profile wins over the top-level `[verify]` block.

**Budget & cache**:
- `--budget <DURATION>` — project-wide wall-clock budget; build fails
  past this. Accepts `120s`, `5m`, `1h`, or a bare number (seconds).
- `--cache` — populate and read the on-disk proof cache (default at
  `.verum/verify-cache`).
- `--distributed-cache <URL>` — advertise a shared cache, e.g.
  `s3://bucket/path` or `redis://host/`. Plumbed through for CI proof
  reuse across runs.

**Profiling**:
- `--profile` — per-function timings, bottleneck categories, cache
  stats, ranked recommendations. Printed at end of run.
- `--profile-obligation` — break each function's time into individual
  proof obligations (preconditions, postconditions, refinement checks,
  loop invariants, …). Implies `--profile`.
- `--export <PATH>` — write the profile report as JSON to `PATH`.
  Implies `--profile`. Intended for CI trend tracking.

**Debugging**:
- `--dump-smt <DIR>` — dump every generated SMT-LIB query, one file per
  obligation (`<function>-<idx>.smt2`). Verifier still runs; dumping is a
  side-effect. Replay a dumped query with `--check-smt-formula`.
- `--check-smt-formula <SMT_FILE>` — bypass the verifier, dispatch a
  raw SMT-LIB 2 file to the configured solver and print
  `sat | unsat | unknown`. Incompatible with the positional `FILE`.
- `--solver-protocol` — log every solver send/recv on stderr (prefixed
  `[→]` / `[←]`). Useful for diagnosing cross-solver quirks.
- `--show-cost` — print the SMT obligation cost model.
- `--compare-modes` — run several modes on the same goals and diff.

**Interactive / integration**:
- `--interactive` — step through obligations one at a time.
- `--interactive-tactic` — Ltac2-style tactic REPL, prints goal +
  accepts tactics one line at a time.
- `--lsp-mode` — emit diagnostics as newline-delimited JSON LSP
  `Diagnostic`s on stdout (suppresses the human report). For IDE
  integrations piping `verum verify` through JSON-RPC.

### `verum analyze`

Run a static analysis suite.

Flags:
- `--escape` — CBGR escape analysis.
- `--context` — capability context analysis.
- `--refinement` — refinement-type analysis.
- `--all` — run them all.

### `verum audit`

Multi-modal trust-boundary auditor — one command, many orthogonal
audits gated by explicit flags. Default mode (no flag) runs
**dependency advisories** + **per-theorem coord audit**.

Flags (specific audit modes; pick one):
- `--framework-axioms` — enumerate every `@framework(name, "citation")`
  marker grouped by framework. Non-zero on malformed markers.
- `--kernel-rules` — print the 18 primitive inference rules implemented
  by `verum_kernel` (auditor-facing TCB enumeration).
- `--epsilon` — every `@enact(epsilon = …)` marker grouped by
  ε-primitive (dual to `--framework-axioms`).
- `--coord` — per-theorem `(Framework, ν, τ)` MSFS coordinate
  (default-on; `--no-coord` opts out of bare-`audit`'s default coord pass).
- `--accessibility` — `@enact` / `EpsilonOf` markers without
  `@accessibility(λ)` annotation (Diakrisis Axi-4 closure check).
- `--hygiene` — V1 advisory: surface every recognised self-referential
  surface form (per the §13.2 hygiene table).
- `--hygiene-strict` — V2 enforcement: walks every top-level free
  function body for raw `self`; non-method functions cannot legally
  bind `self`. Non-zero exit on `E_HYGIENE_UNFACTORED_SELF` violations.
- `--owl2-classify` — OWL 2 classification audit (subclass closure +
  cycle / disjointness violations).
- `--framework-conflicts` — known-incompatible framework pairs
  (uip ⊥ univalence etc.) — non-zero on any conflict.
- `--round-trip` — per-theorem 108.T round-trip status
  (Decidable / SemiDecidable / Undecidable).
- `--coherent` — per-theorem `@verify(coherent*)` α-cert ⟺ ε-cert
  correspondence status.
- `--proof-honesty` — per-theorem proof-body shape classification
  (`axiom-placeholder` / `theorem-no-proof-body` / `theorem-trivial-true`
  / `theorem-axiom-only` / `theorem-multi-step`) plus by-lineage totals.
- `--framework-soundness` (M4.A) — per-axiom K-FwAx classification
  (`sound` / `trivial-placeholder`). Mirror of kernel-side
  `SubsingletonRegime::ClosedPropositionOnly` gate at audit time.
- `--coord-consistency` (M4.B) — per-theorem (Fw, ν, τ) supremum
  invariant (`consistent` / `verify-lift` / `missing-framework`).
  Mirror of V8.1 #232 kernel-side `check_coord_cite` at audit time.
  Non-zero on any `missing-framework` violation.

Common flags:
- `--details` — per-advisory full details.
- `--direct-only` — skip transitive deps.
- `--no-coord` — opt out of default-on per-theorem coord audit.
- `--format <plain|json>` — default `plain`. `json` is stable-schema
  output for CI enforcement (e.g. fail the build if a PR adds a new
  framework-axiom dependency).

Each audit mode emits one of:
`audit-reports/{coord,accessibility,framework-footprint,coherent,round-trip,framework-soundness,coord-consistency,proof-honesty}.json`
when invoked with `--format json`.

For details on individual audits:
- [Proof-honesty audit](/docs/verification/proof-honesty)
- [Coord-consistency + framework-soundness](/docs/verification/coord-consistency-audit)
- [MSFS coordinate](/docs/verification/msfs-coord)

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

Performance profiling — CBGR overhead, hot-function CPU, cache
behaviour, and compilation phases. Report is printed to stdout unless
`--output` redirects it.

**Slice selection** (pick one or more; `--all` short-circuits the lot):
- `--memory` — Tier 0 / 1 / 2 reference distribution, per-function
  heap-allocation report.
- `--cpu` — hot-function profile.
- `--cache` — proof-cache performance.
- `--compilation` — phase-level compilation timings.
- `--all` — enable all four slices and render the unified dashboard.
  Conflicts with the individual slice flags.

**Thresholds & sampling**:
- `--hot-threshold <PCT>` (default `5.0`) — percent CPU considered
  "hot" for ranking.
- `--sample-rate <PERCENT>` (default `1.0`) — CBGR sampling rate.
  Lower reduces overhead on hot paths; `1.0` is safe for production.
- `--precision <UNIT>` (default `us`) — timing resolution, `us`
  (microseconds) or `ns` (RDTSC-based, more expensive, distinguishes
  sub-microsecond checks).

**Scope**:
- `--functions <NAMES>` — comma-separated function-name allowlist; only
  samples from these functions are reported.

**Output**:
- `--output <PATH>` / `-o <PATH>` — write the report to a file instead
  of stdout.
- `--suggest` — print actionable optimisation hints alongside the
  numbers.

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

### `verum diagnose`

Inspect and export the crash reports captured by the `verum` crash
reporter (panics + fatal signals, persisted under
`~/.verum/crashes/`). See
**[Tooling → Crash diagnostics](/docs/tooling/diagnostics)** for the
full format, redaction policy, and retention rules.

All subcommands read from `~/.verum/crashes/` unless
`VERUM_HOME` overrides it.

#### `verum diagnose list`

List recent reports, newest first.

Flags:
- `--limit <N>` (default 20) — cap the number of entries shown.

#### `verum diagnose show [REPORT]`

Print a single report to stdout. Defaults to the most recent.

Flags:
- `REPORT` — path to a `.log` or `.json` file.
- `--json` — print the structured form instead of the human log.
- `--scrub-paths` — replace `$HOME` with `~` and the current
  username with `<user>` in the printed output. The on-disk report
  is not modified.

#### `verum diagnose bundle`

Package recent reports (paired `.log` + `.json`) into a single
`.tar.gz` suitable for attaching to an issue.

Flags:
- `-o, --output <path>` (default `./verum-crash-bundle-<ts>.tar.gz`).
- `--recent <N>` (default 5).
- `--scrub-paths` — sanitise every file placed into the archive.
  Originals in `~/.verum/crashes/` are untouched.

#### `verum diagnose submit`

Open a new GitHub issue with the most recent reports via the `gh`
CLI. Paths are always scrubbed before upload; the bundle path is
printed so the user can attach it manually (the `gh` CLI does not
accept attachments at issue creation time).

Flags:
- `--repo <owner/name>` (default `verum-lang/verum`).
- `--recent <N>` (default 3).
- `--dry-run` — print the `gh` command without running it.

Requires `gh auth login`. Exits with a clear error if `gh` is not
installed.

#### `verum diagnose env`

Print the build/host environment snapshot the reporter captured at
install time — `verum` version, git SHA, build profile, target
triple, `rustc --version`, OS, arch, CPU-core count.

Flags: `--json`.

#### `verum diagnose clean`

Delete every report in the crash directory.

Flags:
- `--yes` — skip confirmation.

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

Load `verum.toml`, apply any CLI `-Z …` / language-feature overrides,
run the validator, and print the resolved effective configuration.
Useful for debugging flag interactions — "what's actually being
compiled" is one command away.

Flags:
- `--json` — machine-readable output (stable schema across releases).
- `-Z key=val` — any manifest value (shown in the result).
- `--tier interpret|aot` — preview effect of overriding the tier.
- All other language-feature overrides (`--cbgr MODE`, `--scheduler`,
  `--no-cubical`, `--no-refinement`, …) are honoured.

### `verum config validate`

Validate `verum.toml` without building. Exits 0 on success, non-zero
with diagnostics on invalid values (including "did you mean"
suggestions for enum typos).

Flags:
- `-Z key=val` and language-feature overrides — validation runs
  against the merged effective config, so unsupported combinations
  from CLI flags are caught too.

## Proof export

### `verum export --to <FORMAT>` / `verum export-proofs --to <FORMAT>`

Walks every `.vr` file in the project, collects every top-level
axiom / theorem / lemma / corollary, and emits a statement-only file
for the chosen external proof assistant. `@framework(name, "citation")`
markers ride along so the trusted boundary is visible in the
exported artefact.

`verum export-proofs` is an exact alias for `verum export --to <F>` —
it matches the wording in docs/verification/proof-export.md and
docs/verification/cli-workflow.md §12.

Flags:
- `--to <FORMAT>` — `dedukti | coq | lean | metamath`.
- `-o <PATH>` / `--output <PATH>` — output file path (default:
  `certificates/<format>/export.<ext>`).

Full proof-term export through `verum_kernel` is a follow-up and lands
per-backend; today's output is statement-only with proofs admitted.

### `verum extract [FILE] [--output DIR]`

Walks `@extract` / `@extract_witness` / `@extract_contract` markers
across the project and emits per-target program files (Verum, OCaml,
Lean, or Coq) at `<DIR>/<decl>.<ext>` (default `extracted/`).

This is *program* extraction (the Curry-Howard computational
content), distinct from `verum export` which emits *proof
certificates* for external provers.

Flags:
- `[FILE]` — optional explicit `.vr` input. Without it, all `.vr`
  files under the manifest dir are scanned.
- `--output <DIR>` — output directory (default `extracted/`).

Behaviour:
- Each marker emits one file per target. A declaration carrying
  multiple `@extract(<target>)` attributes produces one file per
  target.
- The `realize="<fn_name>"` keyword on any `@extract*` attribute
  short-circuits body synthesis and emits a thin wrapper that
  delegates to the named native function — useful for binding a
  verified surface to a runtime intrinsic.

See **[Verification → Program extraction](/docs/verification/program-extraction)**
for the full guide.

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

| Flag | verum.toml equivalent |
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

**Precedence** (low → high): defaults < `verum.toml` < high-level
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
