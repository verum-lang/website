---
sidebar_position: 13
title: CLI Workflow
---

# CLI Workflow

> Every verification capability documented in this section is
> reachable from the command line. This page is the single
> reference: every flag, every subcommand, every interaction
> between them.

If you're new to the Verum CLI, read
[Tooling → CLI](../tooling/cli.md) first for the overall command
set. This page assumes you know how to run `verum` and focuses on
the **verification subset**.

---

## 1. Command overview

Five CLI entry points touch verification:

| Command           | Purpose                                                        | Covered here? |
|-------------------|----------------------------------------------------------------|---------------|
| `verum check`     | Type-check only (no code-gen, optionally refinement check).    | §2            |
| `verum verify`    | Full verification; the flagship command.                       | §3, §4        |
| `verum analyze`   | Static analysis suite (escape, context, refinement coverage).  | §5            |
| `verum smt-stats` | Telemetry dump from the session statistics cache.              | §6            |
| `verum smt-info`  | SMT backend linkage / version / capability report.             | §7            |
| `verum audit`     | Trusted-boundary enumeration (framework axioms, admits, kernel rules). | §8    |

Every flag, subcommand, and output format described in
this document is part of the shipping CLI surface.

---

## 2. `verum check` — type-check with optional refinement

```bash
verum check [FILE] [OPTIONS]
```

### Flags

| Flag            | Default | Effect                                                     |
|-----------------|---------|-------------------------------------------------------------|
| `--strict`      | off     | Also invoke SMT for refinement obligations. Fast strategy. |
| `--verbose`     | off     | Print per-module timing and cache hits.                    |
| `--no-stdlib`   | off     | Skip stdlib compilation (for compiler debugging).          |

### Exit codes

| Code | Meaning                                                                  |
|------|---------------------------------------------------------------------------|
| 0    | Type-check passed; if `--strict`, all refinement obligations discharged. |
| 1    | Type error.                                                               |
| 2    | `--strict` refinement proof failure.                                      |

`check` is ~10-100× faster than `verify` because it skips the
full verification pipeline (SMT invoked only for refinements when
`--strict`). Use it in CI fast loops.

---

## 3. `verum verify` — flagship verification

```bash
verum verify [TARGET] [OPTIONS]
```

`TARGET` can be a file, a directory (recursively verified), or a
project root.

### Mode flags (layer 1: `VerificationLevel`)

| Flag                  | Maps to                | Meaning                                                      |
|-----------------------|------------------------|---------------------------------------------------------------|
| `--mode runtime`      | `Runtime`              | No SMT; compile runtime assertions. (`check` is usually better.) |
| `--mode static`       | `Static` (default)     | SMT; fail build on unprovable obligations.                   |
| `--mode proof`        | `Proof`                | SMT + kernel replay; emit certificates to `target/proofs/`.  |
| `--mode cubical`      | cubical kernel rules   | Enable HComp / Transp / Glue / PathTy kernel rules for path-type reasoning. |
| `--mode dependent`    | Π/Σ tactics            | Enable dependent-type tactics over Π / Σ / Inductive types. |

### Strategy flags (layer 2: `VerifyStrategy`)

| Flag                          | Maps to                | Timeout | Extras                              |
|-------------------------------|------------------------|---------|-------------------------------------|
| `--strategy fast`             | `Fast`                 | 3 s     | Static encoding only.               |
| `--strategy static` (default) | `Static`               | 30 s    | Single solver call.                 |
| `--strategy formal`           | `Formal`               | 60 s    | Full tactic library.                |
| `--strategy thorough`         | `Thorough`             | 300 s   | Portfolio race (Z3 + CVC5).         |
| `--strategy certified`        | `Certified`            | 300 s   | Portfolio + kernel replay + cross-validation. |
| `--strategy synthesize`       | `Synthesize`           | 600 s   | CVC5 SyGuS body synthesis (requires `synth-fun` in the obligation). |

### Solver selection

| Flag                | Meaning                                                     |
|---------------------|-------------------------------------------------------------|
| `--solver auto`     | Capability-router decides (default).                        |
| `--solver z3`       | Force Z3 for every obligation.                              |
| `--solver cvc5`     | Force CVC5 for every obligation.                            |
| `--solver portfolio`| Parallel race, first `unsat` wins.                          |
| `--solver capability`| Explicit capability-router invocation (diagnostic).        |

### Timeout and budget

| Flag                     | Meaning                                                      |
|--------------------------|---------------------------------------------------------------|
| `--timeout 60`           | Per-obligation timeout (seconds). Overrides strategy default. |
| `--budget 5m`            | Total time budget for the entire `verify` run.                |
| `--budget-policy {fail,skip}` | What happens when budget exhausts.                       |

### Counterexamples

See also [Counterexamples](./counterexamples.md).

| Flag                               | Meaning                                                     |
|------------------------------------|-------------------------------------------------------------|
| `--counterexample {none,minimal,standard,full,json}` | Per-failure counterexample verbosity.    |
| `--minimize-timeout 30`            | Delta-debugging budget per counterexample.                  |

### Profiling

| Flag                  | Meaning                                                                        |
|-----------------------|--------------------------------------------------------------------------------|
| `--profile`           | Emit per-function time to stderr.                                              |
| `--show-costs`        | Emit theory-taxonomy cost per obligation.                                      |
| `--profile-obligation` | Per-obligation breakdown table (slowest 10 obligations, time-ms + share-%). Implies `--profile`. |

### Export

| Flag                              | Meaning                                                  |
|-----------------------------------|----------------------------------------------------------|
| `verum export --to lean -o PATH`  | Lean 4 statement-only certificates (`axiom` / `theorem … := sorry`). |
| `verum export --to coq -o PATH`   | Coq statement-only certificates (`Axiom` / `Theorem … Admitted.`). |
| `verum export --to dedukti -o PATH` | Neutral exchange-format `name : type.` statements.     |
| `verum export --to metamath -o PATH` | Metamath `$a` / `$p … $= ? $.` scaffold.             |
| `verum export-proofs --to FMT`    | Alias for `verum export --to FMT`.                       |

Cross-tool re-check runs weekly via the
`cert-interop.yml` GitHub Actions workflow — exports all
four formats, pipes them through `lean4` / `coqc` /
`dkcheck` / `mmverify.py`, and posts a Markdown matrix
summary.

### Comparison and interactive modes

| Flag                | Meaning                                                     |
|---------------------|-------------------------------------------------------------|
| `--compare-modes`   | Run Fast/Static/Formal/Thorough side-by-side; report deltas. |
| `--interactive`     | Enter REPL after first failure; use `help` for commands.     |

### Debug flags

| Flag                       | Meaning                                                           |
|----------------------------|-------------------------------------------------------------------|
| `--dump-smt DIR`           | Dump every solver query as `DIR/<prefix>-<NNNNN>.smt2`.           |
| `--check-smt-formula FILE` | Re-check a raw SMT-LIB 2 file through the current solver — short-circuits the Verum pipeline. |
| `--solver-protocol`        | Stream `[→]`-/`[←]`-prefixed solver commands + verdicts to stderr. |
| `--lsp-mode`               | Emit one JSON diagnostic per line on stdout (LSP-consumable).     |
| `--profile-obligation`     | Per-obligation timing breakdown under the main profile report.    |
| `--diff GIT_REF`           | Limit verification to `.vr` files changed since `GIT_REF`.        |
| `--interactive-tactic`     | Drop into a per-goal tactic console instead of the whole-program REPL. |
| `--verify-profile NAME`    | Apply a `[verify.profiles.<name>]` block from `verum.toml`.       |
| `--smt-proof-preference`   | `cvc5` | `z3` — backend to prefer for proof export.               |

The three SMT debug flags speak to env-var side channels
(`VERUM_DUMP_SMT_DIR`, `VERUM_SOLVER_PROTOCOL`) that the solver
backends consume at their `assert` / `check_sat` boundaries.
`VERUM_LSP_MODE=1` is the env-var equivalent of `--lsp-mode`
for non-CLI callers.

### Exit codes

| Code | Meaning                                                                  |
|------|---------------------------------------------------------------------------|
| 0    | All obligations discharged (or all failures soft-fell to runtime, if configured). |
| 1    | Type error.                                                               |
| 2    | At least one obligation failed (error-level policy).                      |
| 3    | Budget exceeded.                                                          |
| 4    | Solver crash / backend unavailable.                                       |

---

## 4. Typical invocations

### 4.1 CI fast loop

```bash
verum check --strict
```

Just type-check, invoke SMT only for refinements, 3s timeout each.

### 4.2 Pre-commit full proof

```bash
verum verify --mode static --strategy formal --timeout 60 \
             --counterexample=minimal --export target/verify-ci.json
```

Every refinement + ensures clause proven; short counterexamples on
failure; JSON export for dashboard.

### 4.3 Release-grade certification

```bash
verum verify --mode proof --strategy certified \
             --export-proofs target/proofs/ \
             --budget 30m \
             --profile --show-costs
```

Full kernel replay, portfolio race, cross-validation, certificates
written for archival. Budget-capped.

### 4.4 Targeted debug

```bash
verum verify --mode static --strategy thorough \
             core/math/arith.vr::safe_div \
             --counterexample=full --interactive
```

Single obligation, maximum detail, drop into interactive explorer
on failure.

### 4.5 Migration audit

```bash
verum verify --compare-modes core/
```

For every obligation in `core/`, run Fast / Static / Formal /
Thorough and report timing deltas — useful for deciding what
level to fix a given file at.

---

## 5. `verum analyze` — static analysis suite

```bash
verum analyze [OPTIONS]
```

Separate from the SMT verification path; these checks run on the
typed AST and CBGR reachability graph.

| Flag              | Default | Effect                                                     |
|-------------------|---------|-------------------------------------------------------------|
| `--escape`        | on      | CBGR tier-promotion escape analysis.                       |
| `--context`       | on      | Context-system usage (missing `using [...]`, unused ctx).  |
| `--refinement`    | on      | Refinement coverage ("which functions have refinements, which don't"). |
| `--lifetime`      | on      | Lifetime-graph acyclicity.                                 |
| `--all`           | off     | Enable every sub-analysis.                                 |
| `--json`          | off     | JSON output.                                               |

`analyze` is complementary to `verify`. `verify` proves what you
wrote; `analyze` reports what you could write to get better
guarantees.

---

## 6. `verum smt-stats` — telemetry

```bash
verum smt-stats [OPTIONS]
```

Reads from the session statistics cache at
`target/smt_stats.json`. Useful after a CI run to see where time
went.

| Flag       | Effect                                             |
|------------|----------------------------------------------------|
| `--json`   | JSON output.                                       |
| `--reset`  | Clear the cache.                                   |
| `--top N`  | Top N slowest obligations.                         |
| `--by-theory` | Group by theory taxonomy.                       |

Sample output:

```text
SMT statistics — session 2026-04-24 11:32:17
Total obligations: 4,821
Total time:        18m 42s
Cache hits:        2,314  (48%)

By theory:
    LIA                   1,822   avg 11 ms
    nonlinear arith         412   avg 187 ms
    strings                  83   avg 402 ms
    bitvector               301   avg 9 ms
    arrays + LIA            645   avg 24 ms
    quantifiers (FMF)        89   avg 1,201 ms
    mixed theories          152   avg 88 ms

By backend:
    z3         3,945  (82%)   avg 18 ms
    cvc5         612  (13%)   avg 142 ms
    portfolio    264   (5%)   avg 98 ms

Top 5 slowest:
    1. core/math/real.vr::integral_convergence     12,400 ms
    2. core/math/linalg.vr::eigen_decomp             8,920 ms
    3. ...
```

---

## 7. `verum smt-info` — backend diagnostics

```bash
verum smt-info [OPTIONS]
```

Prints linked solver versions, available theories, tactics, and
build configuration.

| Flag      | Effect          |
|-----------|-----------------|
| `--json`  | JSON output.    |

Use this when reporting bugs — solver version is the single most
important piece of context.

---

## 8. `verum audit` — trusted-boundary enumeration

```bash
verum audit [OPTIONS]
```

| Flag                        | Effect                                                    |
|-----------------------------|-----------------------------------------------------------|
| `--framework-axioms`        | List all `@framework`-tagged axioms reachable from public API. |
| `--admits`                  | List all `admit` / `sorry` uses.                           |
| `--kernel-rules`            | List the 18 primitive kernel rules (for audit).            |
| `--cone MODULE`             | Restrict to the transitive dependency cone of a module.    |
| `--format {plain,json}`     | Output format.                                            |
| `--since GIT_REF`           | Diff mode: show framework deps added since a git ref.     |

Example:

```bash
verum audit --framework-axioms --cone core.math --format json | jq .
```

Emits JSON listing every framework axiom used transitively in
`core.math`, with citations and framework IDs. Useful for
supply-chain review.

---

## 9. Configuration file reference

`verum.toml` at project root sets defaults. Any CLI flag can be
overridden at the file level with
`#[verify(attr = value)]` at the top of the file, or at the
declaration level with `#[verify(...)]` on the decl.

```toml
[verify]
mode       = "static"
strategy   = "formal"
timeout    = 60
counterexample = "standard"
budget     = "10m"

[verify.profiles.release]
mode       = "proof"
strategy   = "certified"
timeout    = 300
counterexample = "full"
budget     = "30m"
export-proofs = "target/release/proofs/"

[verify.exclude]
paths = [ "tests/fixtures/**" ]
```

`verum verify --profile release` picks the `release` override
block; CLI flags on top of that override individual settings.

---

## 10. Interoperability

### 10.1 Exit-code contract

All `verum verify` / `verum check` runs respect the exit-code
contract in §3. CI scripts should distinguish exit 1 (user type
error, cannot proceed) from exit 2 (proof failed, may be known
flaky) from exit 3 (budget exhausted, retry with more budget).

### 10.2 JSON schema stability

`--json` output has a schema version (`"schema_version": 1`).
The schema is stable; inspect the emitted structure by
running `verum verify --json` on a small project. A
consolidated reference lives under `docs/architecture/`
alongside the other tooling schemas.

### 10.3 LSP

The [LSP server](../tooling/lsp.md) runs `verify --mode static
--strategy fast --counterexample=minimal --json` behind the
scenes for in-editor diagnostics. Users can tune the LSP
verification mode in editor settings without touching
`verum.toml`.

---

## 11. Troubleshooting quick table

| Symptom                                      | First thing to try                                    |
|----------------------------------------------|--------------------------------------------------------|
| "Solver timeout"                             | `--strategy thorough` or `--timeout 120`               |
| "Solver returned unknown"                    | `--solver portfolio` (race Z3 + CVC5)                  |
| "Counterexample not minimal"                 | `--minimize-timeout 60`                                |
| "Verification is slow"                       | `verum smt-stats` → pick the theory bucket that dominates |
| "Proof works locally, fails in CI"           | `verum smt-info` both sides; check solver version drift |
| "Failure diagnostic is cryptic"              | `--counterexample=full --interactive`                  |
| "Framework-axiom count rising"               | `verum audit --framework-axioms --since HEAD~50`       |
| "Certificates absent after `--mode proof`"   | Ensure `target/proofs/` exists; confirm `--strategy certified` |

---

## 12. See also

- [Gradual verification](./gradual-verification.md) — the two
  layers behind `--mode` and `--strategy`.
- [Trusted kernel](./trusted-kernel.md) — what `Certified` strategy
  does under the hood.
- [SMT routing](./smt-routing.md) — how `--solver auto` picks
  backends.
- [Counterexamples](./counterexamples.md) — interpreting the
  `--counterexample` output.
- [Tooling → CLI](../tooling/cli.md) — the rest of the Verum CLI
  surface.
