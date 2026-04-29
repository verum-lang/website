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
verum test  [--filter STR] [--exact] [--skip PAT] [--include-ignored] \
            [--ignored] [--list] [--interp | --aot] \
            [--format pretty|terse|json|junit|tap|sarif] \
            [--test-threads N] [--nocapture] [--coverage]
verum bench [--filter STR] [--interp | --aot] \
            [--warm-up-time SECS] [--measurement-time SECS] \
            [--min-samples N] [--max-samples N] [--sample-size N] \
            [--save-baseline NAME | --baseline NAME] \
            [--noise-threshold PCT] [--format table|json|csv|markdown]
verum watch [<command>] [--clear] [--skip-verify]
```

`verum run` is interpreter-first. Add `--aot` for LLVM native
execution when latency matters (LLVM warmup adds ~200 ms).

### Script invocation

Verum has a third execution mode reserved for **single-file
scripts** with a `#!` shebang line. Bare `verum file.vr` (no
`run` subcommand) and `./file.vr` direct exec both route into
script mode, where top-level statements are accepted without an
enclosing `fn main()`:

```bash
$ cat hello.vr
#!/usr/bin/env verum
print("hello");
$ ./hello.vr        # OS-level shebang exec (chmod +x first)
$ verum hello.vr    # bare invocation, no `run`
```

A `.vr` file lacking the shebang must use the explicit `verum
run` form — the bare shorthand surfaces an actionable advisory
that points back at `verum run`. Full contract, exit-code
propagation, and roadmap live in **[Getting Started → Script
mode](/docs/getting-started/script-mode)**.

#### Permission flags

`verum run` and the bare script invocation accept three
permission CLI flags that augment frontmatter declarations:

```bash
verum --allow=<scope>[=<target>]   # add a single grant
verum --allow-all                   # universal grant set
verum --deny-all                    # empty grant set (drops every grant)
```

`--allow` is repeatable: `--allow=net=api.example.com:443
--allow=fs:read=./data` installs both. `--allow-all` and
`--deny-all` are mutually exclusive and override repeated
`--allow` flags.

Either flag installs a permission policy even if the script's
frontmatter is silent — opt-in to sandboxing without editing
the source. The resolved policy mixes into the script's VBC
and AOT cache keys, so two runs with different policies never
share a cached binary. The interpreter and AOT-compiled binary
**enforce the resolved policy identically**: every gated FFI
call (`open`, `connect`, `socket`, `_exit`, …) lands in the
same `(scope, target_id)` decision table whether the script is
running under Tier 0 or as a native executable. Full mechanism,
diagnostics, exit-code contract (143 = capability denied,
1 = logic), and the wire-format scope-tag mapping live in
**[Getting Started → Script mode → Sandboxing scripts with
permissions](/docs/getting-started/script-mode#sandboxing-scripts-with-permissions)**.

`verum test` and `verum bench` form the developer-facing testing
surface — property-based testing with integrated shrinking,
parametrised tests, deterministic seed replay, CI output formats
(JUnit / TAP / SARIF), and Criterion-style time-budget benchmarks.
Full guide in **[Tooling → Testing](/docs/tooling/testing)**;
PBT deep dive in **[Tooling → Property testing](/docs/tooling/property-testing)**.

## Verification & analysis

```bash
verum verify [FILE] --mode <runtime|static|formal|fast|thorough|certified|synthesize> \
                    --solver <z3|cvc5|auto|portfolio|capability> \
                    --timeout 120 [--cache] [--function NAME] [--diff GIT_REF] \
                    [--verify-profile NAME] [--smt-proof-preference z3|cvc5] \
                    [--profile] [--profile-obligation] [--budget DURATION] \
                    [--export PATH] [--distributed-cache URL] \
                    [--closure-cache] [--closure-cache-root PATH] \
                    [--ladder] [--ladder-format plain|json] \
                    [--dump-smt DIR] [--check-smt-formula FILE] \
                    [--solver-protocol] [--show-cost] [--compare-modes] \
                    [--interactive] [--interactive-tactic] [--lsp-mode]
verum analyze [--escape] [--context] [--refinement] [--all]
verum audit [--details] [--direct-only] [--framework-axioms] \
             [--kernel-rules] [--epsilon] [--coord] [--no-coord] \
             [--hygiene] [--hygiene-strict] [--owl2-classify] \
             [--framework-conflicts] [--accessibility] \
             [--round-trip] [--coherent] [--proof-honesty] \
             [--framework-soundness] [--coord-consistency] \
             [--format plain|json]
verum lint [--fix] [--deny-warnings] [--profile NAME] [--explain RULE] \
            [--list-rules] [--validate-config] [--since GIT_REF] \
            [--severity error|warn|info|hint] \
            [--format pretty|json|sarif|github-actions|tap]
verum fmt [--check]
```

`verum lint` runs two cooperating engines: a fast text-scan path
(20 rules — Rust-isms, missing context decls, CBGR hot paths, …)
and an AST-driven path (refinement-type and other Verum-unique
rules whose evidence is structural). See **[Reference →
Lint rules](/docs/reference/lint-rules)** for every rule shipped
today, **[Architecture → Lint engine](/docs/architecture/lint-engine)**
for the design, and **[Cookbook → Linter recipes](/docs/cookbook/linter-recipes)**
for pre-commit / CI / migration recipes.

Verification modes map to strategies documented in **[Verification →
gradual verification](/docs/verification/gradual-verification)**.

### Audit subcommands

`verum audit` is the project-wide trust-boundary tool. It enumerates
the framework axioms, kernel-rule footprint, ε-distribution,
intensional-extensional coordinate, hygiene status, OWL 2
classification, framework-compatibility matrix, accessibility
annotations, 108.T round-trip status, and operational coherence —
each surface gated by an explicit flag.

| Flag | Output | Use case |
|---|---|---|
| `--framework-axioms` | every `@framework(name, "citation")` marker, grouped | enumerate the trusted boundary |
| `--kernel-rules` | the 18 primitive inference rules implemented in `verum_kernel` | auditor verifying kernel TCB |
| `--epsilon` | every `@enact(epsilon = …)` marker grouped by ε-primitive | dual of `--framework-axioms` |
| `--coord` | per-theorem `(Framework, ν, τ)` MSFS coordinate (default-on; `--no-coord` to skip) | verification-pipeline projection |
| `--hygiene` | self-referential surface-form classification | factorisation report |
| `--hygiene-strict` | reject raw `self` in free functions (CI gate) | `E_HYGIENE_UNFACTORED_SELF` |
| `--owl2-classify` | OWL 2 subclass closure + cycle / disjointness violations | ontology audit |
| `--framework-conflicts` | known-incompatible framework pairs (uip ⊥ univalence, etc.) | axiom-bundle consistency |
| `--accessibility` | enact / EpsilonOf without `@accessibility(λ)` | Diakrisis Axi-4 closure |
| `--round-trip` | per-theorem 108.T round-trip status (Decidable / SemiDecidable / Undecidable) | corpus acceptance gate |
| `--coherent` | per-theorem `@verify(coherent*)` α-cert ⟺ ε-cert correspondence status | operational coherence layer |
| `--proof-honesty` | per-theorem proof-body shape classification (`axiom-placeholder` / `theorem-no-proof-body` / `theorem-trivial-true` / `theorem-axiom-only` / `theorem-multi-step`) plus by-lineage totals | corpus promotion-progress gate; emits `audit-reports/proof-honesty.json` (schema_v=1) |
| `--framework-soundness` | per-axiom K-FwAx classification (`sound` if proposition has propositional content / `trivial-placeholder` if just `true` literal) | corpus-side mirror of kernel-side `SubsingletonRegime.ClosedPropositionOnly` gate at audit time; emits `audit-reports/framework-soundness.json` (schema_v=1) |
| `--coord-consistency` | per-theorem (Fw, ν, τ) supremum-of-cited-coords gate (`consistent` / `verify-lift` / `missing-framework`); fails CI on any `missing-framework` (theorem has `@verify(...)` but no `@framework(...)` citation) | corpus-side mirror of kernel-side V8.1 #232 `check_coord_cite` at audit time; emits `audit-reports/coord-consistency.json` (schema_v=1); non-zero exit on violation |

`--format plain` (default) emits human-readable output. `--format json`
emits a stable machine-parseable schema suitable for CI dashboards
and `audit-reports/*.json` archival. Each subcommand may be passed
solo (e.g. `verum audit --framework-axioms`) or, for the default
dispatch, the dependency audit + per-theorem coord audit run together.

### Verification profiling & budgets

| Flag | Purpose |
|------|---------|
| `--profile` | Per-function timings, bottleneck categories, cache stats; printed at end of run. |
| `--profile-obligation` | Break each function's time into individual obligations (pre/postconditions, refinements, loop invariants). Implies `--profile`. |
| `--budget DURATION` | Project-wide wall-clock budget — `120s`, `2m`, `1h`, or bare integer (seconds). Fails the build past the limit. |
| `--export PATH` | Write profile report as JSON to `PATH`. Implies `--profile`. |
| `--distributed-cache URL` | S3 / Redis shared proof cache (e.g. `s3://bucket/verify-cache`). |
| `--verify-profile NAME` | Apply `[verify.profiles.<NAME>]` from `verum.toml`. CLI flags still win over the profile. |
| `--diff GIT_REF` | Only verify functions whose source has changed since the ref (`HEAD~1`, `origin/main`, `abc123`). |
| `--dump-smt DIR` | Dump every SMT-LIB query to `DIR/<function>-<idx>.smt2`. |
| `--check-smt-formula FILE` | Dispatch a raw `.smt2` file to the configured solver; prints `sat/unsat/unknown`. Ignores `FILE` argument. |
| `--solver-protocol` | Log every solver send/recv on stderr, prefixed `[→]` / `[←]`. |
| `--lsp-mode` | Emit LSP `Diagnostic` JSON on stdout, one per line. Suppresses human output. |
| `--interactive-tactic` | Ltac2-style tactic REPL — prints the goal, accepts tactics one line at a time. |
| `--smt-proof-preference BACKEND` | Which backend exports proof traces for `Certified` strategy. Default `cvc5` (ALETHE, more stable). |
| `--closure-cache` | Opt in to per-theorem closure-hash incremental verification. Theorem proofs whose fingerprint + Ok-verdict are cached are skipped without invoking the SMT/kernel re-check. See **[Tooling → Incremental cache](/docs/tooling/incremental-cache)**. |
| `--closure-cache-root PATH` | Override the cache root (default `<input.parent>/target/.verum_cache/closure-hashes/`). Implies `--closure-cache`. Standard CI use is to point this at a shared NFS path. |
| `--ladder` | Route every `@verify(strategy)` annotation through the typed 13-strategy ladder dispatcher. Emits per-theorem verdicts (Closed / Open / DispatchPending / Timeout) plus a totals summary. Non-zero exit on Open / Timeout (real failures); DispatchPending is advisory. See **[Verification → CLI workflow → Ladder](/docs/verification/cli-workflow)**. |
| `--ladder-format plain\|json` | Output format for `--ladder`. JSON suitable for CI / IDE consumption. |

Manifest equivalents in `[verify]`: `total_budget`, `slow_threshold`,
`distributed_cache`, `cache_dir`, `cache_max_size`, `cache_ttl`,
`profile_slow_functions`, `profile_threshold`, `profiles.<name>.*`.
CLI flags always override the manifest.

## Tactic catalogue

```bash
verum tactic list    [--category identity|composition|control|focus|forward] [--format plain|json]
verum tactic explain <name> [--format plain|json]
verum tactic laws    [--format plain|json]
```

Surfaces the canonical 15-combinator catalogue + 12 algebraic laws.
Used by IDE completion, the docs generator, and CI shape-pinning.
Full guide in **[Tooling → Tactic catalogue](/docs/tooling/tactic-catalogue)**.

## Proof drafting

```bash
verum proof-draft --theorem <T> --goal <G> \
                  [--lemma name:::signature[:::lineage]]… \
                  [--max <N>] [--format plain|json]
```

Ranked next-step tactic suggestions for a focused proof state.
Drives LSP / REPL hover panels.
Full guide in **[Tooling → Proof drafting](/docs/tooling/proof-drafting)**.

## Proof repair

```bash
verum proof-repair --kind <K> [--field key=value]… \
                   [--max <N>] [--format plain|json]
```

Where `<K>` is one of: `refine-depth`, `positivity`, `universe`,
`fwax-not-prop`, `adjunction`, `type-mismatch`, `unbound-name`,
`apply-mismatch`, `tactic-open`.

Structured repair-suggestion engine for typed proof / kernel
failures.  Full guide in **[Tooling → Proof repair](/docs/tooling/proof-repair)**.

## Closure-hash incremental cache

```bash
verum cache-closure stat   [--root <P>] [--format plain|json]
verum cache-closure list   [--root <P>] [--format plain|json]
verum cache-closure get    <theorem> [--root <P>] [--format plain|json]
verum cache-closure clear  [--root <P>] [--format plain|json]
verum cache-closure decide <theorem> --signature <s> --body <s> \
                           [--cite <c>]… [--kernel-version <v>] \
                           [--root <P>] [--format plain|json]
```

Inspector / control surface for the per-theorem closure-hash cache
(`target/.verum_cache/closure-hashes/`).  The `verum verify
--closure-cache` flag is the production reader/writer; this
subcommand is for ad-hoc inspection + CI scripts.  Full guide in
**[Tooling → Incremental cache](/docs/tooling/incremental-cache)**.

## Foreign-system theorem import

```bash
verum foreign-import --from <coq|lean4|mizar|isabelle> <FILE> \
                     [--out <PATH>] [--format skeleton|json|summary]
```

Reads a Coq / Lean4 / Mizar / Isabelle source file and emits a
Verum `.vr` skeleton with one `@axiom`-bodied declaration per
imported theorem, attributed back to the source via
`@framework(<system>, "<source>:<line>")`.  The inverse of
`verum export`.  Full guide in **[Tooling → Foreign-system
import](/docs/tooling/foreign-import)**.

## Auto-paper documentation

```bash
verum doc-render render     [--format md|markdown|tex|latex|html] \
                            [--out <PATH>] [--public]
verum doc-render graph      [--format dot|json] [--public]
verum doc-render check-refs [--format plain|json] [--public]
```

Walks every public `@theorem` / `@lemma` / `@corollary` / `@axiom`
declaration and renders Markdown / LaTeX / HTML directly from the
corpus.  Eliminates the duplicate-source problem (paper.tex +
verum-corpus): the corpus IS the paper draft.  Full guide in
**[Tooling → Auto-paper generator](/docs/tooling/auto-paper)**.

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
| `--precision us\|ns` | Timer granularity. `us` renders timings in milliseconds (default); `ns` uses the native `Instant.now` resolution and dynamically picks `ns` / `µs` / `ms` per magnitude so sub-microsecond costs stay legible. |

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
verum config show [--json] [-Z key=val] [--tier interpret|aot]
verum config validate [-Z key=val]    # typo-check verum.toml

verum export --to <dedukti|coq|lean|metamath> [-o PATH]
verum export-proofs --to <dedukti|coq|lean|metamath> [-o PATH]  # alias

verum clean [--all]
verum version [--verbose]
```

`config show` resolves `verum.toml` + CLI overrides and prints the
effective configuration — the source of truth for "what's actually
compiled". See **[Reference → verum.toml](/docs/reference/verum-toml)**
for the manifest schema.

`verum export` walks every theorem / lemma / axiom in the project and
emits a statement-only certificate file; proofs are admitted. See
**[Verification → proof export](/docs/verification/proof-export)**.

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
