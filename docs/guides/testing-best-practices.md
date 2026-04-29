---
sidebar_position: 7
title: Testing best practices
---

# Testing best practices

A comprehensive guide to writing maintainable, fast, and *trustworthy*
test suites in Verum. Every recommendation here is calibrated to the
shipped runner — every example compiles, every flag in every code
block exists in `crates/verum_cli/src/main.rs` today.

:::tip[Verified against the current `verum` binary]
All assertion calls, attributes, and CLI flags shown below have been
checked against the implementation in
`crates/verum_cli/src/commands/{test.rs,property.rs,bench.rs}` and
`core/base/panic.vr`. The DI-mock and snapshot recipes are explicitly
flagged as Stage-2; copy-pasting those today will *not* compile.
:::

For the user-facing surface (commands, output formats, regression DB),
see **[Tooling → Testing](/docs/tooling/testing)** and **[Tooling →
Property testing](/docs/tooling/property-testing)**. This page is
about *how to use them well*.

## TL;DR

1. Default to `@property` over `@test` whenever the function takes
   typed inputs — refinement-driven generators are free coverage.
2. One assertion per test path; let the harness's per-test reporting
   tell you which path failed.
3. Pin slow tests with `@ignore(reason = "…")` rather than commenting
   them out — `--include-ignored` keeps them runnable.
4. Use `@test_case` for table-driven tests; resist a `for` loop
   inside one test — an `[N]` suffix gives precise failure addresses.
5. Pin float comparisons with `assert_approx_eq`. Always.
6. Commit `target/test/pbt-regressions.json` — it makes flakes
   permanent and CI saves you from each one again.
7. Default tier is AOT for a reason; `--interp` for fast inner-loop
   iteration, `--aot` for the build the user will run.
8. Prefer `--format junit` in CI; pretty/terse for humans. JSON is for
   when you want a bespoke dashboard.

## Naming, layout, scope

### Where files live

```
my_cog/
├── src/
│   └── lib.vr           # production code
├── tests/
│   ├── arith.vr         # one .vr file per cohesive area
│   ├── parser.vr
│   └── fixtures/        # golden files, snapshots, JSON fixtures
└── verum.toml
```

`verum test` walks `tests/*.vr` recursively. Each file is parsed and
compiled independently. The file's basename becomes the module label
in test output: `tests/arith.vr` → `arith.test_name`.

### Naming tests

Pick names that read like statements *about the system*, not commands
*to the test runner*:

```verum
// good — reads as a claim
@test fn empty_list_has_length_zero() { … }
@test fn cache_invalidates_on_write() { … }

// avoid — restates the obvious
@test fn test_list() { … }
@test fn check_thing() { … }
```

Group related claims in one file. A single test name hidden in a sea
of unrelated tests is hard to find later.

### One concern per file

If `tests/parser.vr` grows past ~20 tests covering disjoint concerns
(e.g. lexer + parser + AST diffing), split it. The runner is
file-granular for compilation; smaller files iterate faster on edits.

## Assertions — pick the right one

| Situation | Use this | Not this |
|-----------|----------|----------|
| Boolean predicate | `assert(cond, "msg")` | a custom panic |
| Equality on `Eq` types | `assert_eq(left, right)` | `assert(left == right, …)` (worse error) |
| Inequality | `assert_ne(a, b)` | `assert(a != b, …)` |
| Float comparison | `assert_approx_eq(a, b, tol)` | `assert_eq(a, b)` (NEVER on Float) |
| Range check | `assert_between(v, lo, hi)` | two `assert`s |
| List in ascending order | `assert_is_sorted(&xs)` | hand-rolled loop |
| Membership | `assert_contains(&xs, &needle)` | linear search by hand |
| Expecting a panic | `assert_panics(\|\| risky())` | `catch_unwind` + match |
| Optional/Result success | `assert_some(opt)`, `assert_ok(res)` | `match` with `panic` arms |
| Optional/Result failure | `assert_none`, `assert_err` | manual checks |

### Float comparison — the one bug to never write

```verum
// Wrong. 0.1 + 0.2 != 0.3 on IEEE 754. This test fails on real CPUs.
@test fn add() { assert_eq(0.1 + 0.2, 0.3); }

// Right.
@test fn add() { assert_approx_eq(0.1 + 0.2, 0.3, 1e-12); }
```

Default tolerance is `1e-9`; tighten or loosen per test based on the
operation's expected error.

### Custom messages — say what's wrong, not what failed

```verum
// noise — the assertion macro tells me X != Y already
assert_eq(a, b, "values not equal");

// signal — I now know why it might have happened
assert_eq(a, b, f"after compaction we expected idempotent merge: {a} vs {b}");
```

## `@test` vs `@property` — a decision tree

```
Does the function take typed parameters that map to PBT generators
(Bool, Int, Float, Text, refined Int)?
├── Yes
│   ├── Is the property "for ALL inputs in domain X, P holds"?  →  @property
│   ├── Just a few specific cases?                              →  @test_case (parametrise)
│   └── A single hand-picked case?                              →  @test
└── No (state-mutating, IO-bound, async, type not yet supported by PBT)
    └── @test
```

**Examples:**

```verum
// claim about all integers — @property
@property
fn add_commutes(a: Int, b: Int) {
    assert_eq(a + b, b + a);
}

// hand-picked corner cases — @test_case (one per row)
@test
@test_case(0, 0, 0)
@test_case(1, 2, 3)
@test_case(i64.MAX, 1, i64.MIN)   // overflow wraps
fn add(a: Int, b: Int, expected: Int) {
    assert_eq(a + b, expected);
}

// state-mutating, no params — plain @test
@test
fn cache_grows_with_writes() {
    let mut c = Cache.new();
    c.put(&"a", 1);
    c.put(&"b", 2);
    assert_eq(c.size(), 2);
}
```

## Property tests — designing for shrinking

The harness shrinks every counterexample to a minimum. To get useful
shrinks, write properties so that **smaller failing inputs are still
valid**:

```verum
// Good — every Int is a valid input, shrinks freely.
@property fn double_is_even(x: Int) { assert((x * 2) % 2 == 0); }

// Bad — the property only fires for non-empty lists; shrinker can't
// shrink xs to [] because of the early return, so failures land on
// whatever-len-the-RNG-drew, not the minimal failing one.
@property fn first_unique(xs: List<Int>) {
    if xs.is_empty() { return; }
    let head = xs[0];
    assert_eq(xs.iter().filter(|x| *x == head).count(), 1);
}

// Good — encode the constraint in the parameter type, not the body.
// Stage 2 will support `List<Int>{ it.len() > 0 }` natively.
```

When in doubt, run `verum test --filter your_prop` twice and look at
the seeds in the regression DB. If repeated failures shrink to the
same minimal value, your property is well-formed.

### Picking `runs` and `seed`

```verum
// Default. Fast feedback during dev.
@property fn fast(x: Int) { … }

// Suspect rare edge case? Crank it up. Comes free in CI.
@property(runs = 10_000)
fn nightly(x: Int) { … }

// CI regression-lock — exact same input every time, tied to a known
// historical bug. Often paired with a comment naming the bug.
@property(seed = 0xDEADBEEFCAFEBABE)
fn issue_42_repro(x: Int) { … }
```

## `@test_case` — table-driven tests done right

Each `@test_case` invocation generates one `name[N]` test. The runner
reports each independently — failures point at the exact row.

```verum
@test
@test_case("",        0)
@test_case("a",       1)
@test_case("ab",      2)
@test_case("abc",     3)
@test_case("ąść",     3)        // unicode — count chars not bytes
@test_case("a\u{0301}", 2)      // composed: a + combining accent
fn char_count(s: Text, expected: Int) {
    assert_eq(s.chars().count(), expected);
}
```

Output:

```text
test text.char_count[0] ... ok
test text.char_count[1] ... ok
test text.char_count[2] ... ok
test text.char_count[3] ... ok
test text.char_count[4] ... ok
test text.char_count[5] ... FAILED  ← composed-char row
```

**Anti-pattern: a `for` loop inside one test:**

```verum
@test
fn char_counts() {
    let cases = [("", 0), ("a", 1), ("ab", 2), ("ąść", 3)];
    for (s, expected) in &cases {
        assert_eq(s.chars().count(), *expected);
    }
}
```

The first failure halts the loop; you don't learn about subsequent
rows until you fix the first. With `@test_case` every row runs
independently and you see the full failure surface in one go.

## Ignoring tests — leave a paper trail

```verum
@test
@ignore(reason = "flaky on macOS — see #1234")
fn deletes_directory_recursively() { … }
```

Run all tests including ignored:
```bash
verum test --include-ignored
```

Run *only* ignored (e.g. when you're triaging the flaky pile):
```bash
verum test --ignored
```

The `reason` arg isn't enforced today — it's prose. Use it. A naked
`@ignore` is a future maintainer's nightmare.

## Filtering, exact-match, and the `--skip` escape hatch

```bash
# substring match — quick and lossy
verum test --filter parser

# exact match — when filter is too lossy
verum test --filter "parser::handles_empty_input" --exact

# negative filter — exclude something that's substring-matching too
# enthusiastically. Repeatable.
verum test --filter parser --skip slow_parse --skip wip_parser
```

Filter logic:
1. `--filter` keeps any name containing the string (or matching exactly with `--exact`).
2. `--skip <PAT>` removes any remaining name containing `PAT`.
3. `--ignored` / `--include-ignored` further refine the active set.

## Tier choice — when to use which

`verum test --interp` (Tier 0):

| Use it for | Don't use it for |
|------------|------------------|
| Inner-loop iteration during development | Integration tests that exec subprocesses |
| Reproducing a `@property` failure with full diagnostics | Anything coverage-related (no LLVM instrumentation) |
| Tests that hit FFI primitives heavily | Final pre-merge sanity |

`verum test --aot` (Tier 1, default):

| Use it for | Don't use it for |
|------------|------------------|
| CI gates | Quick local feedback (LLVM warmup is real) |
| Coverage runs | One-test reproductions during debugging |
| Real-world performance assertions | When AOT path is unstable for your code path |

When AOT and interpreter disagree, the disagreement *is the bug*. File
a report.

## Test parallelism

In `verum.toml`:

```toml
[test]
parallel     = true        # default: false (deterministic order)
timeout_secs = 30          # 0 = no timeout per test
```

CLI override for thread count when `parallel = true`:

```bash
verum test --test-threads 4    # cap at 4 workers
verum test --test-threads 1    # serialize despite [test].parallel
```

Parallel tests should not share global state. If yours do, set
`parallel = false` *and* document why in `verum.toml`. The default is
serial precisely so that "did parallel break this?" stops being a
debugging hypothesis.

### Async tests

A regular `@test` on an `async fn` works — the runner awaits the
returned future on the test thread:

```verum
@test
async fn fetches_user_profile() {
    let profile = client.get_profile(42).await?;
    assert_eq(profile.name, "Alice");
}
```

Need a fake clock or test-only context? See **[Cookbook → Resilience
patterns](/docs/cookbook/resilience)** for fake-clock test patterns.

## CI integration

### GitHub Actions

```yaml
- name: Run tests
  run: verum test --aot --format junit > results.xml
- name: Publish results
  if: always()
  uses: dorny/test-reporter@v1
  with:
    name: Verum tests
    path: results.xml
    reporter: java-junit
```

For Code Scanning / SARIF:

```yaml
- run: verum test --aot --format sarif > results.sarif
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

### GitLab

```yaml
test:
  script:
    - verum test --aot --format junit > results.xml
  artifacts:
    reports:
      junit: results.xml
```

### Classic / TAP-aware CI (Jenkins, BuildKite, etc.)

```bash
verum test --aot --format tap | tee results.tap | prove -e cat -
```

### Custom dashboards (NDJSON)

```bash
verum test --aot --format json \
  | jq -c 'select(.event == "test")' \
  > test-events.ndjson

verum bench --aot --format json > bench.json
```

The JSON schema is stable and follows `verum-pbt-regressions/v1` for
the regression DB and an analogous bench-result schema. Diff between
runs in CI to flag regressions before they land.

## Coverage

```bash
verum test --aot --coverage
```

Writes LLVM `.profraw` files under `target/coverage/`. Today this is
a pass-through — generate the report with:

```bash
llvm-profdata merge -sparse target/coverage/*.profraw -o merged.profdata
llvm-cov report   ./target/test/test_*  --instr-profile=merged.profdata
llvm-cov show     ./target/test/test_*  --instr-profile=merged.profdata --format=html -o target/coverage/html
```

Stage-2 will fold this behind a single `verum coverage` command.

### What to track

Track **branch coverage**, not line coverage. A `match` arm with a
single statement *can* be covered by one input but still hide a
mistyped pattern. `llvm-cov` reports both — read the branch column.

For verification-aware projects: branch coverage is the *floor*, not
the ceiling. The roadmap (Stage 3) adds "refinement coverage" — the
fraction of refinement-predicate space that the test suite explored.

## Benchmarking — when, what, how

### When to write a `@bench`

- The function is hot — it's on a `--profile` flame graph or a
  measurable percentage of a benchmark you care about.
- The function has a known-bad alternative you want to demonstrate
  outranks (e.g. "string-concat is 5× slower than a Builder").
- You're guarding against regressions in a particular hot path with a
  CI baseline check.

### When NOT to write a `@bench`

- The function isn't a hotspot. Bench effort = noise.
- The variance is high enough that the headline ±CI95 is wider than
  the regression you want to detect. Lower variance first.
- The function does I/O or syscalls — those swamp anything we measure
  in the function body. Use micro-benches for pure compute.

### Conventions

```verum
const ITERS: Int = 10_000;       // amortise per-iter overhead

@bench
fn parse_tiny_json() {
    let mut n: Int = 0;
    while n < ITERS {
        let _ = json.decode<Int>(&"42").unwrap();
        n = n + 1;
    }
}
```

Pick `ITERS` so a single `@bench` invocation runs in ~1-10 ms. Too
short and timer noise dominates; too long and you can't iterate the
edit-bench cycle quickly.

For interpreter-mode benches (`--interp`) the harness disables the
100M VBC instruction cap — see **[Tooling → Property
testing](/docs/tooling/property-testing#gotchas)**.

### Baselines

```bash
# Commit a baseline that everyone can diff against
verum bench --aot --save-baseline main

# After your change, compare
verum bench --aot --baseline main

# CI: fail if any bench regressed by more than 5 %
verum bench --aot --baseline main --noise-threshold 5.0 \
  --format json > diff.json
jq -e '.results[] | select(.regressed == true) | empty' diff.json
```

Significance test: a regression is flagged only when (a) the median
moved more than the noise threshold AND (b) the 95 % CIs of current
and baseline don't overlap. Both conditions must hold.

## Regression DB workflow

Commit `target/test/pbt-regressions.json` (it's small, stable JSON).
A CI run on a fresh clone re-runs every historical failing seed
**first** before drawing fresh ones — your test suite *knows* about
past bugs.

When a regression-DB seed passes (because the bug is fixed), the
entry is auto-pruned. Bug fix = one fewer DB row, no manual upkeep.

If the DB has grown unwieldy after a refactor:
```bash
rm target/test/pbt-regressions.json   # nuke; regenerate from next failure
```

## Mocks and fakes (today's recipe)

Verum's context system handles dependency injection. Mocks today are
hand-rolled — Stage-2 ships `test_provide` for first-class mocking.

```verum
// production
fn fetch_profile(id: UserId) using [Database] -> Result<Profile, Error> {
    let row = Database.query(f"select … from users where id = {id}")?;
    Profile.from_row(&row)
}

// test
@test
fn parses_full_profile() {
    let fake = FakeDatabase.with_rows([("alice", 30)]);
    provide [Database = fake] {
        let p = fetch_profile(UserId(1)).unwrap();
        assert_eq(p.name, "alice");
    }
}
```

`provide [...]` blocks scope the mock; on exit the production
`Database` is restored. Use this for deterministic tests that
exercise `using [Logger]`, `using [Clock]`, `using [Random]`, etc.

## Common anti-patterns

### Test = production code with `assert` sprinkled in

```verum
// BAD — coupling: this lock-step rewrite of production won't catch
// the very class of bugs production has.
@test
fn bigsum() {
    let mut total: Int = 0;
    for x in &xs { total = total + x; }
    assert_eq(total, big_sum(&xs));
}
```

A test must be *independent* of the production. Test against a
**model** — a slow-but-obvious reference, a hand-computed expected,
or a mathematical invariant. If you find yourself implementing
production logic inside the test, you're not testing.

### Sleeping in tests

```verum
@test async fn flushes_eventually() {
    spawn_writer();
    sleep_ms(500);
    assert_eq(read_back(), expected);
}
```

A `sleep` is a hidden race condition pinned to whatever your machine
is doing. Drive the system to a known state (a synchronisation
primitive, a poll loop with a timeout, a fake clock) and check the
state.

### Disabling a flaky test by deletion

The test is the canary. Don't kill it. `@ignore(reason = "flaky on
macOS — see #1234")` keeps the failure visible in `--list` and in
`--include-ignored` runs without breaking CI. Then *fix the bug.*

### Hiding logic in a test helper

```verum
fn make_request(...) { /* 60 lines of setup */ }

@test fn handles_redirect() { let r = make_request(…); assert_eq(r.status, 301); }
@test fn handles_404()      { let r = make_request(…); assert_eq(r.status, 404); }
```

Helpers are fine; helpers that hide branching logic from the test
body are not. If `make_request` has its own decision tree, the tests
above test the helper, not your system.

## Performance tips for the test suite itself

- **Compile each tests file once.** The runner does this automatically;
  don't `mount` huge transitive trees just to call one helper.
- **`--release`-only assertions** belong in `@cfg(debug_assertions)`,
  not in tests. Keep tests fast in dev.
- **Big fixture data** lives in `tests/fixtures/`, loaded with
  `fs.read_to_string`. Don't paste a 10K-line JSON literal into a
  test file — the parser pays for it on every recompile.
- **Group related tests** so the file has a small number of imports.
  20 tests sharing one mounted module compile faster than 20 files
  each mounting their own copy.
- **`@property(runs = …)` per-test, not project-wide.** Crank up only
  the ones that benefit; default 100 is fast and good enough for most.

## See also

- **[Tooling → Testing](/docs/tooling/testing)** — flag-level reference.
- **[Tooling → Property testing](/docs/tooling/property-testing)** — PBT deep dive.
- **[Reference → CLI commands](/docs/reference/cli-commands#verum-test)** — every flag.
- **[Reference → Attribute registry](/docs/reference/attribute-registry#testing)** — every attribute.
- **[Reference → verum.toml](/docs/reference/verum-toml)** — `[test]` schema.
- **[Migrating from Rust → testing](/docs/migrating/from-rust#testing)** — `cargo test` ↔ `verum test` cheatsheet.
