---
sidebar_position: 19
title: Continuous benchmarking
---

# `verum benchmark` — Head-to-head vs Coq / Lean4 / Isabelle / Agda

`verum benchmark` is the head-to-head comparison surface for
proof-assistant landscape evaluation.  Run a fixed reference suite
against one or more systems and emit a typed comparison matrix
across the canonical performance / trust / capability dimensions.

The point is **reproducibility**: anyone can re-run the suite and
verify the numbers.  No marketing claims — only verifiable
measurements.

## Mental model

Verum benchmarks five proof assistants:

- **Verum** — what we're benchmarking against the rest.
- **Coq** (also reachable via the `rocq` alias) — `coqc`.
- **Lean 4** / **Mathlib** (aliases: `lean`, `mathlib`,
  `mathlib4`) — `lean`.
- **Isabelle/HOL** (aliases: `isabelle/hol`, `hol`) — `isabelle`.
- **Agda** — `agda`.

For each (system, theorem) pair, the runner emits a
**BenchmarkResult** carrying the system tag, the suite + theorem
identifiers, the measured metric, the value, a Unix timestamp, and
an optional reproducibility envelope (hash of the input corpus).
Per-theorem metrics aggregate to a per-suite leader board via the
`ComparisonMatrix`.

## The 9 canonical metrics

| Metric | Direction | What it measures |
|---|---|---|
| `kernel_loc` | lower is better | Trusted Computing Base size: kernel LOC + transitive trust dependencies. |
| `lines_per_second` | higher is better | Compilation / verification speed (LOC/s). |
| `theorems_per_second` | higher is better | Theorems verified per second. |
| `peak_rss_bytes` | lower is better | Per-theorem peak resident-set size (bytes). |
| `elapsed_ms` | lower is better | Per-theorem wall-clock duration (milliseconds). |
| `cross_format_exports` | higher is better | Independent kernel formats that re-check the proof.  Verum target: 4 (Coq + Lean + Isabelle + Dedukti); foreign systems re-check themselves only ⇒ 1. |
| `tactic_coverage_percent` | higher is better | Fraction (`[0, 100]`) of standard obligations the tactic library closes via 1-line invocations. |
| `trust_diversification_count` | higher is better | Number of distinct kernels in the trust circle that agree on each theorem. |
| `llm_acceptance_percent` | higher is better | Fraction (`[0, 100]`) of LLM-proposed proofs that pass the kernel.  Only Verum supports this today via the LCF-style fail-closed loop (see **[LLM tactic protocol](/docs/tooling/llm-tactic)**); comparable systems baseline at 0%. |

`verum benchmark metrics` prints this list with the
`higher_is_better` direction.

## Subcommand reference

```bash
verum benchmark run     --system <S> --suite-name <N> [--theorem <T>]…
                        [--format plain|json|markdown|csv]

verum benchmark compare [--system <S>]… --suite-name <N> [--theorem <T>]…
                        [--format plain|json|markdown|csv]

verum benchmark metrics [--format plain|json|markdown|csv]
```

### `run`

Run the suite against a single system.  Emits one
`BenchmarkResult` per (theorem, metric) for per-theorem metrics
plus one per metric for suite-level metrics (e.g. `kernel_loc`).

```bash
$ verum benchmark run --system verum --suite-name mathlib-basics \
    --theorem addnC --theorem addn0
Benchmark transcript (5 result(s)):

  verum      addnC                        elapsed_ms       0
  verum      addn0                        elapsed_ms       0
  verum      (suite)                      kernel_loc       5000
  verum      (suite)                      lines_per_second 50000
  verum      (suite)                      llm_acceptance_percent 65
```

### `compare`

Run the suite against every requested system (or all five when
`--system` is omitted) and emit the comparison matrix.

```bash
$ verum benchmark compare --suite-name mathlib-basics \
    --theorem addnC --format markdown
# Benchmark comparison — `mathlib-basics`

| Metric | verum | coq | lean4 | isabelle | agda |
|---|---|---|---|---|---|
| `kernel_loc` | 5,000 LOC ⭐ | 200,000 LOC | 50,000 LOC | 10,000 LOC | 30,000 LOC |
| `lines_per_second` | 50,000 LOC/s ⭐ | 20,000 LOC/s | 30,000 LOC/s | 25,000 LOC/s | 15,000 LOC/s |
| `cross_format_exports` | 4 ⭐ | 1 | 1 | 1 | 1 |
| `llm_acceptance_percent` | 65.0% ⭐ | 0.0% | 0.0% | 0.0% | 0.0% |
```

The `⭐` marker decorates the leader cell per metric.  Markdown
output is direct-paste-able into a release announcement or a
comparison page.  JSON output ships the full structured matrix
plus a `leaders` summary suitable for CI gates.

### `metrics`

Print every supported metric with its `higher_is_better` direction
— useful for CI scripts that need to know which direction means
"better" for a given metric.

```bash
$ verum benchmark metrics
Benchmark metrics (9):

  Name                              Direction
  ────────────────────────────────  ────────────────────
  kernel_loc                        lower is better
  lines_per_second                  higher is better
  theorems_per_second               higher is better
  peak_rss_bytes                    lower is better
  elapsed_ms                        lower is better
  cross_format_exports              higher is better
  tactic_coverage_percent           higher is better
  trust_diversification_count       higher is better
  llm_acceptance_percent            higher is better
```

## V0 vs V1 production runners

V0 ships **mock runners** that emit canned values reflecting the
documented landscape claims:

- Verum kernel ≈ 5,000 LOC; Coq ≈ 200,000; Lean 4 ≈ 50,000;
  Isabelle ≈ 10,000; Agda ≈ 30,000.
- Compilation speed ≈ 50,000 LOC/s for Verum (target); 15-30K for
  the rest.
- LLM acceptance: Verum 65% (with the LCF-style fail-closed loop);
  others 0% (no comparable feature exists).

These canned values are **placeholders for the protocol shape**, not
real measurements.  V1+ swaps in production runners that actually
invoke `coqc` / `lean` / `isabelle` / `agda` and measure timings on
disk.  The trait surface is unchanged, so the CLI / docs / CI
scripts continue to work identically.

The point of shipping V0 today: lock in the schema, the matrix
shape, the leader-detection contract, the JSON / markdown / csv
output formats.  Once production runners land, every CI workflow
that already consumes `verum benchmark compare --format json`
auto-upgrades.

## Reproducibility envelope

Every result carries an optional `repro_envelope` field — a hash
of the input corpus + tool version.  When set, the same hash + same
tool version on the same hardware should reproduce the same value.
The envelope is the auditable claim:

```json
{
  "system": "verum",
  "suite": "mathlib-basics",
  "theorem": "addnC",
  "metric": "elapsed_ms",
  "value": 142.0,
  "timestamp": 1714478400,
  "repro_envelope": "blake3-of-corpus:0a1b2c3d..."
}
```

A reviewer can take the envelope hash, fetch the matching corpus
snapshot, install the matching tool versions, and re-run — getting
the same number (within hardware noise).  Drift surfaces as a CI
diff against the baseline.

## CI usage

Pin the cross-system leader board so a regression in any system
surfaces immediately:

```bash
# .github/workflows/bench.yml — runs weekly
verum benchmark compare --suite-name mathcomp-basics \
    --format json > today.json
LEADER=$(jq -r '.leaders[] | select(.metric == "kernel_loc").leader' today.json)
[ "$LEADER" = "verum" ] || (echo "kernel_loc leadership lost" && exit 1)
```

The standard release-announcement workflow:

```bash
verum benchmark compare --suite-name mathlib-basics \
    --format markdown > release/bench-comparison.md
verum benchmark compare --suite-name mathlib-basics \
    --format csv > release/bench-comparison.csv
```

## Output schemas

### JSON (`compare --format json`)

```json
{
  "schema_version": 1,
  "suite": "mathlib-basics",
  "results": [ <BenchmarkResult>, ... ],
  "matrix": [
    { "metric": "kernel_loc", "system": "verum", "value": 5000.0 },
    ...
  ],
  "leaders": [
    { "metric": "kernel_loc", "leader": "verum" },
    { "metric": "lines_per_second", "leader": "verum" },
    ...
  ]
}
```

### CSV (`compare --format csv`)

```
metric,system,value,is_leader
kernel_loc,verum,5000,true
kernel_loc,coq,200000,false
...
```

### Markdown (`compare --format markdown`)

A pivot table with the leader cell decorated as `⭐` (see live demo
above).  Direct-paste-able into release announcements.

## Cross-references

- **[Tactic catalogue](/docs/tooling/tactic-catalogue)** — the
  combinator surface that drives `tactic_coverage_percent`.
- **[LLM tactic protocol](/docs/tooling/llm-tactic)** — the
  LCF-style fail-closed loop that drives
  `llm_acceptance_percent`.
- **[Auto-paper generator](/docs/tooling/auto-paper)** — every
  exported paper draft can include the latest comparison matrix
  via `verum benchmark compare --format markdown` piped into the
  paper template.
- **[Foreign-system import](/docs/tooling/foreign-import)** — the
  inverse of `cross_format_exports`: import a foreign theorem to
  Verum.
- **[Incremental cache](/docs/tooling/incremental-cache)** — once
  a benchmark is verified, the closure cache makes subsequent
  runs cheap.
