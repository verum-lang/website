---
sidebar_position: 35
title: Testing recipes
---

# Testing recipes

Short, copy-paste-ready snippets for the testing patterns that come
up most often. For the longer exposition see **[Guides → Testing
best practices](/docs/guides/testing-best-practices)**.

## Round-trip property (encode → decode = identity)

```verum
mount tx.{encode, decode};

@property
fn encode_decode_round_trip(v: Int) {
    let bytes = encode(v);
    let back = decode(&bytes).unwrap();
    assert_eq(back, v);
}
```

Use this for every serialiser: JSON, BSON, Protobuf, your own binary
formats. The harness will throw negatives, MAX, MIN, and edge cases at
you for free.

## Algebraic laws

```verum
@property fn add_commutative(a: Int, b: Int)              { assert_eq(a + b, b + a); }
@property fn add_associative(a: Int, b: Int, c: Int)      { assert_eq((a + b) + c, a + (b + c)); }
@property fn add_identity(a: Int)                         { assert_eq(a + 0, a); }
@property fn mul_distributes(a: Int, b: Int, c: Int)      { assert_eq(a * (b + c), a * b + a * c); }
```

Algebraic identities are the cheapest property tests in the world —
and they catch refactor regressions instantly.

## Reference-model differential

```verum
mount my_sort.{quicksort};
mount stdlib.collections.{List};

@property
fn matches_stdlib_sort(xs: List<Int>) {
    let mine = quicksort(xs.clone());
    let ref_ = xs.clone().sort();      // stdlib — trusted
    assert_eq(mine, ref_);
}
```

Test your code against a slow-but-obvious reference. Divergence is
the bug; the property covers the entire input space.

## Bounded refinement-driven inputs

```verum
fn buffer_for(len: Int{ 0 <= it && it <= 8192 }) -> Bytes {
    Bytes.of_capacity(len)
}

@property
fn buffer_size_matches_request(len: Int{ 0 <= it && it <= 8192 }) {
    let buf = buffer_for(len);
    assert_eq(buf.len(), len);
}
```

The generator reads the refinement and stays in `[0, 8192]`; shrinker
respects the bound too. No `gen_len_in_range(...)` helper needed.

## Idempotence

```verum
@property
fn normalize_is_idempotent(s: Text) {
    let n1 = normalize(&s);
    let n2 = normalize(&n1);
    assert_eq(n1, n2);
}
```

Anything that should converge to a canonical form: case folding,
URL normalisation, JSON canonicalisation, AST simplification.

## Inverse pairs

```verum
@property fn parse_unparse(t: Text) {
    if let Ok(ast) = parse(&t) {
        // parse(unparse(parse(t))) == parse(t) — round-trip via AST
        let again = parse(&unparse(&ast)).unwrap();
        assert_eq(ast, again);
    }
}
```

Whenever you have `f` and `f_inv`, the property `f_inv(f(x)) == x`
(or `f(f_inv(y)) == y`) is free coverage.

## Async test with timeout

```verum
mount stdlib.time.{timeout};

@test
async fn fetch_completes_quickly() {
    let result = timeout(100.ms(), fetch_user(42)).await;
    let user = assert_ok(result);
    assert_eq(user.name, "Alice");
}
```

The runner handles `async fn` automatically; the `[test].timeout_secs`
manifest setting is the outer guardrail.

## Mocked context (DI)

```verum
fn process_order(id: OrderId) using [Database, Logger] -> Result<Order, Error> {
    Logger.info(f"processing {id}");
    let row = Database.query(f"select … where id = {id}")?;
    Order.from_row(&row)
}

@test
fn process_logs_and_returns_order() {
    let mock_db  = FakeDatabase.with_rows([("0042", "alice")]);
    let mock_log = RecordingLogger.new();
    provide [Database = mock_db, Logger = &mock_log] {
        let o = process_order(OrderId(42)).unwrap();
        assert_eq(o.id, OrderId(42));
        assert_contains(&mock_log.entries(), &"processing");
    }
}
```

`provide [...]` blocks scope the mocks; production wiring is restored
on exit. Anything `using [X]` in production becomes injectable in
tests.

## Testing a panic path

```verum
@test
fn divide_by_zero_panics() {
    assert_panics(|| { let _ = 10 / 0; });
}
```

`assert_panics` is the right primitive — `catch_unwind` works too,
but the assertion form gives a cleaner failure message.

## Parametrised regression

```verum
@test
@test_case("",        true)
@test_case("a",       true)
@test_case("ab",      false)
@test_case("aba",     true)
@test_case("racecar", true)
@test_case("hello",   false)
@test_case("É̀É̀É̀",  true)        // historic Unicode bug
fn is_palindrome_table(input: Text, expected: Bool) {
    assert_eq(is_palindrome(&input), expected);
}
```

Add a row whenever a bug surfaces; `[6]` becomes the historic record.

## Snapshot via stdout

Capture rendered output and diff against a golden file checked into
the repo. Useful for any code whose contract is *“produce this exact
text”* — error formatters, codegen, pretty-printers, CLI help screens:

```verum
mount stdlib.fs;

@test
fn renders_greeting_matches_golden() {
    let out = render_greeting(&"Alice");
    let golden = fs.read_to_string("tests/fixtures/greeting.golden").unwrap();
    assert_eq(out, golden);
}
```

Update the golden when the output is intentionally changed:
`fs.write("tests/fixtures/greeting.golden", &actual)`.

## Locking down a flake

```verum
@test
@ignore(reason = "depends on network — manual run only")
fn fetches_real_data() { … }
```

```bash
verum test                          # skips it
verum test --include-ignored        # runs it manually
verum test --ignored                # only the flaky/skip pile
```

Don't delete flaky tests — they're the only signal something is
wrong. Mark them, fix them later.

## Bench regression check in CI

```bash
# pre-change: lock in current numbers
verum bench --aot --save-baseline main

# post-change: diff
verum bench --aot --baseline main --noise-threshold 5.0 --format json > diff.json

# CI gate: fail iff any bench actually regressed
jq -e '[.results[] | select(.regressed == true)] | length == 0' diff.json
```

Regression = median moved more than the threshold AND the 95 % CIs
don't overlap. Both conditions must hold.

## See also

- **[Guides → Testing best practices](/docs/guides/testing-best-practices)** — design rules and anti-patterns.
- **[Tutorials → Testing walkthrough](/docs/tutorials/testing-walkthrough)** — full developer journey.
- **[Tooling → Property testing](/docs/tooling/property-testing)** — generator and shrinker reference.
- **[Cookbook → Logic functions](/docs/cookbook/logic-functions)** — proofs over invariants vs PBT.
