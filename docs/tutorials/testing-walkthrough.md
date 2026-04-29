---
sidebar_position: 12
title: Testing walkthrough
---

# Testing walkthrough — from zero to a mature suite

A hands-on tutorial: we'll build a small text-utility crate and grow
its test suite from one trivial assertion through property-based
tests, parametrised cases, regression locking, benchmarks, and CI
output. Every snippet compiles against the shipped `verum` binary —
no hypothetical syntax.

If you want the reference instead of the journey, jump to **[Tooling
→ Testing](/docs/tooling/testing)**.

## Setup

```bash
verum new tx --profile application
cd tx
```

We'll build a tiny text manipulation library: `reverse`, `is_palindrome`,
`title_case`. Replace `src/lib.vr` (or create it) with:

```verum
// src/lib.vr
module tx;

public fn reverse(s: &Text) -> Text {
    let mut chars: List<Char> = [];
    for c in s.chars() {
        chars.push(c);
    }
    chars.reverse();
    let mut out = Text.with_capacity(s.len());
    for c in chars.iter() {
        out.push(*c);
    }
    out
}

public fn is_palindrome(s: &Text) -> Bool {
    let r = reverse(s);
    *s == r
}

public fn title_case(s: &Text) -> Text {
    let mut out = Text.new();
    let mut start_of_word = true;
    for c in s.chars() {
        if c.is_whitespace() {
            out.push(c);
            start_of_word = true;
        } else if start_of_word {
            for cu in c.to_uppercase() { out.push(cu); }
            start_of_word = false;
        } else {
            for cl in c.to_lowercase() { out.push(cl); }
        }
    }
    out
}
```

We need a tiny `main` so `verum build` is happy:

```verum
// src/main.vr
fn main() {
    print("tx — text utilities\n");
}
```

## Step 1 — the first `@test`

Create `tests/reverse.vr`:

```verum
// tests/reverse.vr
mount tx.{reverse};

@test
fn reverse_hello() {
    assert_eq(reverse(&"hello"), "olleh");
}
```

Run it:

```bash
$ verum test
     Testing tx v0.1.0 (aot)

running 1 test (tier=aot, parallel=false)
test reverse.reverse_hello ... ok (210ms)

test result: ok. 1 passed; 0 failed; 0 ignored; 1 total; finished in 220ms
```

Two things to know:

- The runner found `reverse_hello` because of the `@test` attribute,
  named it `reverse.reverse_hello` (file.fn).
- `(210ms)` is **wall-clock including AOT compile**. For inner-loop
  iteration use `--interp`:

```bash
$ verum test --interp
test reverse.reverse_hello ... ok (0.21ms)
```

Two orders of magnitude faster on a tiny test — keep this in mind
during development.

## Step 2 — many cases with `@test_case`

We could write `reverse_world`, `reverse_empty`, … as separate
functions. Better: stack `@test_case` on one function and let the
runner expand them.

```verum
@test
@test_case("",        "")
@test_case("a",       "a")
@test_case("ab",      "ba")
@test_case("hello",   "olleh")
@test_case("racecar", "racecar")
fn reverse_table(input: Text, expected: Text) {
    assert_eq(reverse(&input), expected);
}
```

Each case becomes its own test name:

```text
test reverse.reverse_table[0] ... ok
test reverse.reverse_table[1] ... ok
test reverse.reverse_table[2] ... ok
test reverse.reverse_table[3] ... ok
test reverse.reverse_table[4] ... ok
```

If row 3 fails, you see `reverse_table[3] ... FAILED` — you don't
have to read the failure to know which row is broken. Compare with
the anti-pattern of one big `for` loop: the first failure halts the
loop and hides every subsequent row.

Filtering one row works as expected:

```bash
verum test --filter "reverse_table\[3\]" --exact
```

## Step 3 — the first property test

We notice that `reverse(reverse(x)) == x` *for every Text*. That's a
property — let the harness drive 100 random inputs:

```verum
mount tx.{reverse};

@property
fn reverse_is_involutive(s: Text) {
    assert_eq(reverse(&reverse(&s)), s);
}
```

```bash
$ verum test --interp --filter reverse_is_involutive
test reverse.reverse_is_involutive ... ok (0.94ms)
```

A hundred inputs in under a millisecond. The harness picked random
strings from the Text generator (mix of ASCII printable + Unicode
exotics — emoji, combining marks, BMP).

If you want more thorough exploration:

```verum
@property(runs = 10_000)
fn reverse_is_involutive(s: Text) { … }
```

## Step 4 — find a bug with PBT

Now `is_palindrome` and `title_case`. Add:

```verum
mount tx.{is_palindrome, title_case};

@property
fn palindrome_after_reverse(s: Text) {
    if is_palindrome(&s) {
        assert_eq(reverse(&s), s);
    }
}

@property
fn title_case_idempotent(s: Text) {
    let t1 = title_case(&s);
    let t2 = title_case(&t1);
    assert_eq(t1, t2);
}
```

Run:

```bash
$ verum test --interp
running 7 tests (tier=interpret, parallel=false)
test reverse.reverse_hello                    ... ok
test reverse.reverse_table[0]                 ... ok
test reverse.reverse_table[1]                 ... ok
test reverse.reverse_table[2]                 ... ok
test reverse.reverse_table[3]                 ... ok
test reverse.reverse_table[4]                 ... ok
test reverse.reverse_is_involutive            ... ok
test props.palindrome_after_reverse           ... ok
test props.title_case_idempotent              ... FAILED (3ms)

failures:

  --- props.title_case_idempotent ---
  property failed after 7 iterations
    seed: 0xa1b2c3d4e5f6a7b8
    original: ("É̀😀a")           ← random Unicode pulled the bug out
    shrunk: ("É̀")                ← shrunk to two combining-mark codepoints
    error: AssertionFailed { message: "assertion failed", pc: 73 }
    replay: verum test --filter 'props.title_case_idempotent' \
            -Z test.property_seed=0xa1b2c3d4e5f6a7b8

test result: FAILED. 8 passed; 1 failed; 0 ignored; 9 total
```

The harness:

1. Drew random strings until one broke the property (iter 7).
2. Shrunk the input down to a 2-codepoint case-mapping edge case.
3. Saved the seed in `target/test/pbt-regressions.json`.
4. Printed a one-liner replay command.

Inspect the saved seed:

```bash
$ cat target/test/pbt-regressions.json
{
  "schema": "verum-pbt-regressions/v1",
  "entries": [
    {
      "test": "props::title_case_idempotent",
      "seed": "0xa1b2c3d4e5f6a7b8",
      "first_seen": "2026-04-25T08:11:33Z",
      "shrunk_input": "(\"É̀\")"
    }
  ]
}
```

Commit this file. Every CI run from now on **replays this seed first**;
if the bug ever comes back, your suite catches it immediately.

## Step 5 — fix the bug, watch the DB prune

The shrunk input pointed us at the `to_lowercase().next()` call —
`É̀` (E with grave + combining grave above) is two codepoints, but
`to_lowercase()` returns an iterator that may yield more than one
char. Fix:

```verum
public fn title_case(s: &Text) -> Text {
    let mut out = Text.new();
    let mut start_of_word = true;
    for c in s.chars() {
        if c.is_whitespace() {
            out.push_char(c);
            start_of_word = true;
        } else if start_of_word {
            for cu in c.to_uppercase() { out.push_char(cu); }
            start_of_word = false;
        } else {
            for cl in c.to_lowercase() { out.push_char(cl); }
        }
    }
    out
}
```

Re-run:

```bash
$ verum test --interp --filter title_case
test props.title_case_idempotent ... ok (1ms)
```

The regression-DB seed was replayed first (still pinned to the buggy
input), the fix passed it, and the entry is **auto-pruned**:

```bash
$ cat target/test/pbt-regressions.json
{ "schema": "verum-pbt-regressions/v1", "entries": [] }
```

The DB only carries *currently-failing* seeds. Bug fixes don't
require any manual upkeep.

## Step 6 — bounded refinement-driven generators

Add a length-bounded test:

```verum
@property
fn reverse_preserves_length(s: Text) {
    assert_eq(reverse(&s).len(), s.len());
}
```

That's already concise. But suppose you want to test a function that
*requires* small inputs. Refinement types feed the generator:

```verum
fn fast_path_only(n: Int{ it >= 1 && it <= 64 }) -> Int {
    // … hand-tuned for small n; bounds-checked by type
    n * n
}

@property
fn small_squares_in_bound(n: Int{ it >= 1 && it <= 64 }) {
    let y = fast_path_only(n);
    assert_between(y, 1, 4096);
}
```

The generator reads `Int{ it >= 1 && it <= 64 }` and emits values in
that bound; the shrinker stays in the bound too. Zero boilerplate.

## Step 7 — locking down a regression with `seed`

Suppose the title-case bug returned in a refactor. After fixing, you
want the *exact* historic input baked into the suite forever:

```verum
// regression test for issue #1234 — combining marks in title_case
@property(seed = 0xa1b2c3d4e5f6a7b8)
fn title_case_idempotent_for_combining_marks(s: Text) {
    let t1 = title_case(&s);
    let t2 = title_case(&t1);
    assert_eq(t1, t2);
}
```

With `seed` set, the harness runs *exactly one iteration* on that
seed. It's effectively a `@test` with a documented historic input.

## Step 8 — pick a tier on purpose

Default tier is AOT. Use `--interp` for fast feedback during dev,
`--aot` for the build CI runs:

```bash
verum test --interp                       # dev cycle
verum test --interp --filter title_case   # focus on one area
verum test --aot                          # pre-merge sanity
verum test --aot --coverage               # generate profraw files
```

Property tests **always** run through the interpreter regardless of
`--tier` — see **[Tooling → Property testing](/docs/tooling/property-testing#how-a-property-is-run)**.

## Step 9 — wire it into CI

```yaml
# .github/workflows/test.yml
name: tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: verum-lang/setup-verum@v1
      - run: verum test --aot --format junit > target/test/results.xml
      - uses: dorny/test-reporter@v1
        if: always()
        with:
          name: Verum tests
          path: target/test/results.xml
          reporter: java-junit
```

For Code Scanning (failures appear inline on PR diffs):

```yaml
      - run: verum test --aot --format sarif > results.sarif
      - uses: github/codeql-action/upload-sarif@v3
        with: { sarif_file: results.sarif }
```

For TAP-aware infra:

```bash
verum test --aot --format tap | prove -e cat -
```

Don't forget to commit `target/test/pbt-regressions.json` —
it's a small JSON file that locks every historical PBT failure into
the suite forever.

## Step 10 — write a benchmark

Hot path detection: `verum profile --cpu` says `reverse` is taking
9 % of a workload. Lock it down:

```verum
// benches/reverse_bench.vr
mount tx.{reverse};

const ITERS: Int = 10_000;

@bench
fn reverse_short() {
    let mut n: Int = 0;
    while n < ITERS {
        let _ = reverse(&"hello");
        n = n + 1;
    }
}

@bench
fn reverse_long() {
    let mut n: Int = 0;
    while n < ITERS {
        let _ = reverse(&"a long enough string that the inner loop dominates");
        n = n + 1;
    }
}
```

```bash
$ verum bench --aot --warm-up-time 0.5 --measurement-time 1.5
```

Save a baseline before the optimisation:

```bash
verum bench --aot --save-baseline pre-opt
```

After the change, diff against it:

```bash
verum bench --aot --baseline pre-opt --noise-threshold 5.0
```

The harness only flags a regression when the change exceeds 5 % AND
the 95 % CIs of current and baseline don't overlap — both conditions
must hold, so single noisy runs don't fire false alarms.

## Step 11 — debugging a specific failure

The seed printed on every failure makes debugging a one-liner:

```bash
verum test --filter 'props.title_case_idempotent' \
  -Z test.property_seed=0xa1b2c3d4e5f6a7b8
```

Step further with the interactive interpreter — print intermediate
values, narrow down:

```verum
@property(seed = 0xa1b2c3d4e5f6a7b8)
fn title_case_idempotent_repro(s: Text) {
    let t1 = title_case(&s);
    print(f"first pass: {t1:?}\n");          // single iteration → safe to print
    let t2 = title_case(&t1);
    print(f"second pass: {t2:?}\n");
    assert_eq(t1, t2);
}
```

```bash
verum test --interp --filter repro --nocapture
```

`--nocapture` lets the prints reach your terminal.

## Step 12 — summary of muscle memory

| Task | Command |
|------|---------|
| Quick local feedback | `verum test --interp` |
| Just one test | `verum test --interp --filter foo` |
| Just one property failure replay | `verum test --filter foo -Z test.property_seed=0x…` |
| Pre-merge | `verum test --aot` |
| List discovered tests | `verum test --list` |
| Run only ignored | `verum test --ignored` |
| All including ignored | `verum test --include-ignored` |
| CI: JUnit | `verum test --aot --format junit > results.xml` |
| CI: SARIF | `verum test --aot --format sarif > results.sarif` |
| Coverage | `verum test --aot --coverage` |
| Save bench baseline | `verum bench --aot --save-baseline main` |
| Diff vs baseline | `verum bench --aot --baseline main` |

## What next

- **[Tooling → Testing](/docs/tooling/testing)** — full reference.
- **[Tooling → Property testing](/docs/tooling/property-testing)** — generator/shrinker deep dive.
- **[Guides → Testing best practices](/docs/guides/testing-best-practices)** — design conventions, anti-patterns.
- **[Reference → CLI commands](/docs/reference/cli-commands#verum-test)** — every flag.
- **[Reference → Attribute registry](/docs/reference/attribute-registry#testing)** — every attribute.
