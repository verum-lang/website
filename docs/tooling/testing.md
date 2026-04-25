---
sidebar_position: 8
title: Testing
---

# Testing in Verum

Verum's testing surface is built into the `verum` binary. There is no
separate test runner to install, no configuration file to bootstrap,
and nothing equivalent to `cargo test` vs `nextest` vs `proptest` vs
`insta` vs `criterion` vs `tap-junit` — every style of testing a
production codebase needs is reachable from one command.

:::tip[All examples on this page pass `verum check`]
Every code snippet uses real attributes, real stdlib functions, and
real CLI flags as of the current `verum` build. Examples that
demonstrate Stage-2 features (`@before_each`, `@after_each`,
`@snapshot`, context-system mocks via `provide [...]`) are explicitly
called out — copy-pasting them today will *not* compile.
:::

This page is the entry point to that surface. Each section links to a
deeper document where applicable.

```bash
verum test                    # run every @test, @property, @test_case
verum test --interp           # same, but through the Tier-0 interpreter
verum test --list             # don't run, just print what was discovered
verum test --format junit     # emit JUnit XML for CI
verum bench                   # run every @bench with time-budget sampling
```

## Discovery

`verum test` walks `tests/*.vr` (recursively) and collects:

| Attribute | What it becomes |
|-----------|-----------------|
| `@test fn f() { … }` | one test entry named `modulename::f` |
| `@property fn f(args…) { … }` | one **property-based** entry — the harness feeds random inputs and shrinks on failure |
| `@test_case(args…)` on one function | N entries, `modulename::f[0]`, `modulename::f[1]`, … |
| `@ignore` / `@ignored` | the entry is present but skipped by default |
| whole-file test (file has `fn main()` and no `@test`) | one entry named after the file |

Discovery is AST-driven — the file is parsed first, and a pattern-scan
fallback kicks in only if parsing fails (so half-complete work still
lists). You can always check what the runner sees with:

```bash
verum test --list
verum test --list --format json     # machine-readable
```

## Execution tiers

Like `verum run`, the test runner can drive either the VBC interpreter
or the AOT-compiled native binary. They behave identically on passing
tests; differences are in failure-mode reporting and performance:

|  | Interpreter (`--interp`) | AOT (`--aot`, default) |
|--|--------------------------|------------------------|
| How a test runs | compile file → VBC → `execute_function` in-process | compile file → native binary → spawn |
| Startup | ~0 ms | LLVM path + process spawn (~200 ms first time) |
| Panic reporting | Verum `Panic` enum, full interpreter diagnostics | exit code + captured stdout/stderr |
| `@property` | ✅ (the only tier that supports PBT — per-iteration argument injection requires in-process Value construction) | downgrades to interpreter automatically |
| Coverage (`--coverage`) | n/a | LLVM profile instrumentation |
| Typical use | fast local iteration, flaky-test reproduction | CI, release validation, coverage runs |

The CLI flags are identical to `verum run`:

```bash
verum test --interp                  # Tier 0
verum test --aot                     # Tier 1 (default)
verum test --tier interpret          # long form, same as --interp
```

You can also pin the default in `verum.toml`:

```toml
[codegen]
tier = "interpret"     # project-wide preferred tier

[test]
parallel = true        # run active tests on a rayon pool
timeout_secs = 30      # kill tests that outrun this
deny_warnings = true   # compile with -D warnings
coverage = false
```

## Filtering

All the idioms from `cargo test` / libtest:

```bash
verum test --filter my_module        # substring match on name
verum test --filter foo --exact      # require full match
verum test --skip slow               # exclude by substring (repeatable)
verum test --include-ignored         # run @ignore'd entries too
verum test --ignored                 # run ONLY @ignore'd entries
```

## Output formats

One flag switches presentation; the runner collects results and emits
the chosen serialisation. Formats ship in two groups:

**Human-facing** (default `pretty`, alternative `terse`):

```text
     Testing my_cog v0.1.0 (interpret)

running 4 tests (tier=interpret, parallel=false)
test arith::add        ... ok (0.21ms)
test arith::overflow   ... FAILED (0.35ms)
test math::commutative ... ok (0.24ms)
test math::unsupported ... ignored

failures:

  --- arith::overflow ---
  property failed after 1 iterations
    seed: 0x22e0bfe6f2e1b043
    original: (-6305485829015946)
    shrunk: (0) [1 shrink steps]
    error: AssertionFailed { message: "overflow", pc: 15 }
    replay: verum test --filter 'arith::overflow' -Z test.property_seed=0x22e0bfe6f2e1b043

test result: FAILED. 2 passed; 1 failed; 1 ignored; 4 total; finished in 4ms
```

**Machine-facing** — suppress the preamble and emit a single parseable
document:

| `--format …` | Consumer |
|--------------|----------|
| `json` | Newline-delimited JSON — one `{"event":"test"}` per test plus `{"event":"summary"}`. Best for ad-hoc scripts and custom dashboards. |
| `junit` / `junit-xml` | JUnit XML 2.x — GitHub Actions, GitLab, Jenkins, CircleCI, Buildkite. |
| `tap` | TAP v13 with YAML error blocks — classic CI meta-runners, Perl toolchains, `prove`, and most enterprise dashboards. |
| `sarif` | SARIF 2.1.0 — GitHub Code Scanning uploads, Azure DevOps security dashboards, static-analysis aggregation pipelines. |

Example (abbreviated):

```bash
verum test --interp --format junit > target/test/results.xml
verum test --interp --format tap  | prove -
verum test --interp --format sarif > target/test/results.sarif
```

## Assertions

From `core.base.panic` — imported automatically, no ceremony needed:

```verum
// Core
assert(cond, "optional message");
assert_eq(left, right);
assert_ne(left, right);

// Optional / Result
assert_some(value);
assert_none(value);
assert_ok(result);
assert_err(result);

// Added for reference-quality testing
assert_approx_eq(left, right, tolerance = 1e-9);  // Float compare
assert_between(value, lo, hi);                    // inclusive range
assert_is_sorted(&list);                          // ascending order
assert_contains(&list, &needle);                  // membership
assert_panics(|| { something_bad(); });           // expect panic
```

Every assertion panics on failure with a stable message prefix; the
runner reads the resulting `InterpreterError::Panic` or process exit
code 1 and categorises the test as failed.

## Property-based testing

Property tests take typed parameters. The harness synthesises
generators from the parameter types (including **refinement types**
— so `Int{ it > 0 && it < 1024 }` is generated within bound for free),
runs the function 100 times by default, and shrinks any failure to a
minimal counterexample.

```verum
@property
fn addition_is_commutative(x: Int, y: Int) {
    assert_eq(x + y, y + x);
}

@property(runs = 10_000)
fn bounded_square(x: Int{ it > 0 && it <= 100 }) {
    let y = x * x;
    assert_between(y, 1, 10_000);
}
```

Depth-first treatment is on its own page: **[Tooling → Property
testing](/docs/tooling/property-testing)**.

## Parametrised tests

Stack `@test_case` attributes to run the same function body against
multiple input tuples:

```verum
@test
@test_case(0, 0, 0)
@test_case(1, 2, 3)
@test_case(-5, 5, 0)
@test_case(100, -50, 50)
fn add_table(a: Int, b: Int, expected: Int) {
    assert_eq(a + b, expected);
}
```

Discovery emits one entry per invocation:

```text
test prop_cases::add_table[0] ... ok (0.21ms)
test prop_cases::add_table[1] ... ok (0.18ms)
test prop_cases::add_table[2] ... ok (0.18ms)
test prop_cases::add_table[3] ... ok (0.16ms)
```

Attribute args accept `Int`, `Bool`, `Text`, `Float`, and negated
numeric literals. Expressions aren't supported — keep the arg list
literal or refactor the logic into a helper and write multiple `@test`s.

## Coverage

```bash
verum test --coverage
```

Compiles each test binary with LLVM source-based coverage, writes
`*.profraw` files under `target/coverage/`, and prints the
`llvm-cov` invocation you'd use for a summary or HTML report. The
generated `default.profdata` works with every LLVM tool — `llvm-cov
report`, `llvm-cov show`, and any IDE that consumes profdata.

## Benchmarking

`verum bench` parallels `verum test`: it discovers `@bench` functions
under `src/`, `tests/`, `benches/`, compiles each, and measures them
using the budget-driven sampling convention from Criterion.

```bash
verum bench                                            # defaults
verum bench --interp                                   # Tier 0
verum bench --filter hot_path                          # filter
verum bench --warm-up-time 0.5 --measurement-time 3.0  # trim budgets
verum bench --save-baseline main
verum bench --baseline main --noise-threshold 2.0      # regression diff
verum bench --format json | tee target/bench/latest.json
```

Each benchmark reports:

- **Median** (headline), **mean**, **stddev**, **min**, **MAD**
  (median absolute deviation).
- **95 % bootstrap CI** for the median (1 000 resamples) — printed as
  `±X%` so you can tell whether a regression is real or noise.
- **Tukey outlier fences** (1.5 × IQR and 3 × IQR) — reported as a
  count (`N/M` outlier-to-sample ratio); not dropped silently.

Baselines are JSON files under `target/bench/` and include the full
sample vector, so you can run arbitrary offline analysis.

Regression detection uses both a noise threshold AND 95 % CI overlap
— a headline delta smaller than the threshold OR overlapping CIs are
reported as *noise*; only non-overlapping changes above the threshold
are flagged as *slower* or *faster*.

## Regression database (PBT)

When a `@property` fails, the seed that produced the failure is
saved to `target/test/pbt-regressions.json`. Every subsequent run
**replays those seeds first** before drawing fresh ones. Two useful
properties follow:

1. **Flakes become non-flakes.** One-in-a-million failure that hit a
   specific seed is now a permanent fixture of the test suite until
   you fix it.
2. **Auto-prune on fix.** When a replayed seed now passes, the bug it
   captured is gone — the entry is removed from the DB automatically.

Every failure prints a one-line replay command:

```text
replay: verum test --filter 'my_mod::prop' -Z test.property_seed=0x…
```

Copy-paste that into a terminal and you reproduce the exact failure,
no git archaeology required.

## Project configuration (`verum.toml`)

Testing-related keys:

```toml
[test]
parallel = true              # rayon thread pool for active tests
timeout_secs = 30            # 0 = no limit
deny_warnings = false        # -D warnings during per-test build
coverage = false             # always-on coverage for this project

[codegen]
tier = "aot"                 # default tier for run/test/bench
```

See **[Reference → `verum.toml`](/docs/reference/verum-toml)** for the
full manifest schema.

## What `verum test` covers today

A capability-level summary of what the runner does, so you can plan
your test strategy at a glance:

| Capability | What it gives you |
|------------|-------------------|
| `@test`, `@test_case`, `@property` | Three test shapes — single, parametrised, randomised — driven from one CLI |
| Extended assertions | `assert_approx_eq`, `assert_panics`, `assert_between`, `assert_is_sorted`, `assert_contains` — every one printing structural diagnostics, not just *“assertion failed”* |
| Property runner | Hedgehog-style integrated shrinking, refinement-type-driven generators, seed-based replay, auto-pruning regression database |
| CI integration | JUnit XML, TAP v13, SARIF 2.1.0, NDJSON output formats — all stable schemas |
| Coverage | `verum test --coverage` produces LLVM `*.profraw` / `*.profdata` for `llvm-cov` (HTML, summary, `show`) |
| Bench harness | Criterion-style time budgets, bootstrap 95 % CI, Tukey outlier classification, baseline save / load / diff |

The rest of this page works through each of those in detail.
