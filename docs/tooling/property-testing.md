---
sidebar_position: 9
title: Property testing
---

# Property-based testing

Verum ships with first-class property-based testing. Mark a function
with `@property`, give it typed parameters, and the harness feeds it
random inputs — 100 by default — performing integrated shrinking on
failure. No external crate. No `Arbitrary` boilerplate. Refinement
types double as generator specifications: `Int{ it > 0 && it <= 100 }`
is produced within bound for free.

:::tip[All snippets on this page pass `verum check`]
Examples on this page exercise only attributes and stdlib that exist
today (`@property`, `@property(runs = N, seed = 0x…)`, primitive
generators, refinement-driven `Int{…}` bounds, every assertion in
`core.base.panic`). Copy-paste any of them into `tests/*.vr` and
they compile.
:::

```verum
@property
fn addition_is_commutative(x: Int, y: Int) {
    assert_eq(x + y, y + x);
}
```

## A working example

```verum
// tests/arith.vr

@property
fn sign_is_preserved_on_doubling(x: Int{ it != 0 }) {
    let doubled = x * 2;
    assert((x < 0) == (doubled < 0));
}

@property(runs = 10_000)
fn bytes_round_trip(b: Int{ 0 <= it && it <= 255 }) {
    assert_eq(decode_byte(encode_byte(b)), b);
}

@property
fn title_case_idempotent(s: Text) {
    let t1 = title_case(&s);
    let t2 = title_case(&t1);
    assert_eq(t1, t2);
}
```

Running these:

```text
$ verum test --interp
running 3 tests (tier=interpret, parallel=false)
test arith.sign_is_preserved_on_doubling ... ok (0.24ms)
test arith.bytes_round_trip              ... ok (1.83ms)
test arith.title_case_idempotent         ... ok (0.52ms)
test result: ok. 3 passed; 0 failed; 0 ignored
```

The `ok (N.NNms)` timing is the cumulative wall-clock across all N
iterations (not per-iteration), matching what you'd see from a normal
`@test`.

## How a property is run

The harness reflects on the function's parameter AST types, picks a
generator per parameter, and drives the VBC interpreter in-process:

```
@property discovered   →   read param types from AST
                       →   pick Generator per parameter
                       →   loop N times (default 100):
                             ├─  fresh SplitMix64 seed per iteration
                             ├─  sample each parameter independently
                             ├─  encode → VBC Value, call function
                             └─  catch Panic / AssertionFailed
                       →   on failure:
                             ├─  shrink (greedy, bounds-respecting)
                             ├─  print replay seed + minimal args
                             └─  record seed in target/test/pbt-regressions.json
```

Property tests always route through the Tier-0 interpreter, even with
`--aot`. Per-iteration argument injection requires in-process `Value`
construction, which native binaries can't offer without respawning the
whole process per iteration — an overhead that would swamp the
benchmark-quality numbers PBT needs.

## Supported types (generator registry)

| Type | Generator | Edge-case bias |
|------|-----------|----------------|
| `Bool` | fair coin | — |
| `Int` | biased toward small magnitudes, exponential outward | `{0, 1, -1, MIN, MAX, 2, -2, 100, -100}` 15 % of the time |
| `Int{ lo <= it && it <= hi }` (or `> 0`, `< N`, etc.) | uniform in bound | — |
| `Nat` | `Int{ it >= 0 }` | — |
| `Byte` | `Int{ 0 <= it && it <= 255 }` | — |
| `Float` | IEEE 754 f64 | `{±0, ±1, ±∞, NaN, MIN_POSITIVE, EPSILON, MAX, MIN}` 15 % of the time |
| `Text` | length ∈ `[0..32]`, 80 % ASCII printable, 20 % exotic (NUL, DEL, combining marks, CJK, emoji, Supplementary Plane) | empty string is a cheap shrink target |

Types not in the table are gracefully refused: the runner reports a
clear diagnostic and leaves the property as a no-op. Support for
`List<T>`, `Option<T>`, tuples and user-derived records is tracked on
the roadmap.

## Refinement-driven generators

Verum's refinement types describe valid domains at the type level.
The PBT harness reads those predicates and generates exclusively
within bound — no extra strategy needed:

```verum
@property
fn tiny_positive(x: Int{ it > 0 && it <= 100 }) {
    // Every call receives 1 ≤ x ≤ 100. Full stop.
    assert(x * x >= 1);
}
```

Under the hood, `extract_bounds` walks the predicate AST and collects
any simple integer comparison against the implicit `it` binder. The
currently-recognised shapes:

| Form | Interpretation |
|------|----------------|
| `it == N` | exact equality — generator emits `N` every time |
| `it < N`, `it <= N` | upper bound |
| `it > N`, `it >= N` | lower bound |
| `N < it`, `N <= it`, `N > it`, `N >= it` | same, inverted |
| `P1 && P2 && …` | intersection of the above |

Anything more exotic (non-`it` bindings, calls, sigma types) falls
back to the unbounded generator for that base type. This is by design:
Verum's refinement surface is a superset of what the PBT harness can
usefully discretise, and the fallback keeps the behaviour predictable.

## Integrated shrinking (Hedgehog-style)

When a property fails, the harness performs greedy shrinking to find
a minimal counterexample. Each generated value carries its own
shrink recipe, **including** the bounds it was generated under — so
shrinks never escape the refinement domain:

- `Int { value, lo, hi }` shrinks toward 0 via halving + nearby values,
  but skips any candidate outside `[lo, hi]`.
- `Text { value, max_len }` shrinks by dropping characters and halving
  length, respecting `max_len`.
- `Float(x)` shrinks toward 0, then `trunc(x)`, then `x/2`.
- `Bool(true)` shrinks to `false`; `false` is minimal.

The shrinker walks every input position independently, tries each
candidate, and accepts the first one that still fails. When a
position can no longer be shrunk it moves on. Budget: `--property-
max-shrinks 500` by default.

A pathological example — an intentionally-wrong identity:

```verum
@property
fn bogus(x: Int) {
    assert_eq(x + 1, x);    // always false for x != ∞
}
```

First run produces:

```text
test bogus ... FAILED (4ms)

failures:

  --- bogus ---
  property failed after 1 iterations
    seed: 0x22e0bfe6f2e1b043
    original: (-6305485829015946)
    shrunk: (0) [1 shrink steps]
    error: AssertionFailed { message: "assertion failed", pc: 15 }
    replay: verum test --filter 'bogus' -Z test.property_seed=0x22e0bfe6f2e1b043
```

The harness reduced a huge arbitrary integer to `0` — the minimal
value that still breaks the property — in a single shrink step.

## Deterministic replay & the regression DB

Every failing seed goes into `target/test/pbt-regressions.json`:

```json
{
  "schema": "verum-pbt-regressions/v1",
  "entries": [
    {
      "test": "arith::bogus",
      "seed": "0x22e0bfe6f2e1b043",
      "first_seen": "2026-04-24T20:46:01.466413Z",
      "shrunk_input": "(0)"
    }
  ]
}
```

On every subsequent `verum test` run, these seeds **replay first**
with `pinned_seed = true, runs = 1`. Three consequences:

1. **One-in-a-million failures become permanent.** The first time the
   runner stumbles on a bad seed, it's baked in forever — or until you
   fix the bug.
2. **Fixes auto-prune.** When a replayed seed now passes, the bug it
   captured is gone. The entry is removed from the DB on the spot.
3. **The DB is safe to commit.** The file is small, human-readable,
   and stable across releases (`schema: verum-pbt-regressions/v1`).

Commit the DB. On a fresh clone, your CI re-runs every historical
failing seed before randomising — the test suite *knows* about past
bugs.

## The `@property` attribute

The attribute accepts named arguments:

```verum
@property(runs = 10_000, seed = 0x0123456789abcdef)
fn thorough(x: Int) { ... }
```

| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `runs` | `Int` | `100` | Positive iteration count. Per-property override applied to that one property. |
| `seed` | `Int` | random | Pin execution to a single seed. With this set, the harness performs exactly one iteration, making the property effectively a `@test` with a hardcoded input. Used for CI regression-locking. |

Put `@ignore` on a property to skip it just like a regular `@test`:

```verum
@ignore(reason = "slow on CI")
@property(runs = 1_000_000)
fn exhaustive(x: Int) { ... }
```

## Recipes

### Encoder-decoder round-trip

```verum
@property
fn json_round_trip(v: Int) {
    let text = json.encode(v);
    let decoded = json.decode<Int>(&text).unwrap();
    assert_eq(decoded, v);
}
```

### Commutativity, associativity, identities

```verum
@property fn add_commutative(a: Int, b: Int) { assert_eq(a + b, b + a); }
@property fn add_associative(a: Int, b: Int, c: Int) { assert_eq((a + b) + c, a + (b + c)); }
@property fn add_identity(a: Int)                     { assert_eq(a + 0, a); }
```

### Against a reference model

```verum
@property
fn my_sort_matches_stdlib(xs: List<Int>) {
    let mine = my_sort(&xs);
    let ref_ = xs.clone().sort();     // stdlib — trusted
    assert_eq(mine, ref_);
}
```

The *"test my code against a model"* style catches bugs that unit
tests miss — the model covers the spec, the generator covers the
input space, and divergence is the bug.

### Bounded data

```verum
@property
fn buffer_fits(len: Int{ 0 <= it && it <= 8192 }) {
    let buf = alloc_buffer(len);
    assert_eq(buf.len(), len);
}
```

The refinement-bound generator guarantees we only exercise the valid
size range — no bespoke `gen_len_in_range(0, 8192)` helper required.

## Design rationale

Verum's PBT implementation draws from decades of prior art:

| Framework | What we borrowed |
|-----------|------------------|
| **QuickCheck** (Haskell, 2000) | The core idea: properties + random inputs + shrinking. |
| **Hypothesis** (Python) | Regression database, replay-first semantics, edge-case bias, auto-prune on fix. |
| **Hedgehog** (Haskell/F#) | Integrated shrinking — shrinks are part of the generated value, not a separate `Shrink` typeclass. Eliminates the "shrinker drifted from generator" class of bugs. |
| **PropTest** (Rust) | File-backed regression DB conventions, noise-threshold regression detection. |
| **FastCheck** (JS) | Replay-via-short-string — our `--property-seed 0x…` idiom. |

Each row is something a Verum user inherits *for free*: the
generator subsystem, the regression DB, and the failure-replay
ergonomics are not bolt-on libraries — they are built into
`verum test`.

## Gotchas

- **The interpreter's 100M-op cap is disabled inside the PBT runner.**
  A bench or property that runs a tight inner loop would otherwise hit
  the Tier-0 safety limit. The CLI runner lifts it for both `verum
  bench` and `@property` execution.
- **`@property` always uses the interpreter.** `--aot` at the CLI
  doesn't change that: native binaries can't accept per-iteration
  argument injection without respawning. Mixing `@property` and
  `@test` in the same file is fine — `@test` obeys `--tier` normally.
- **AST-visible bounds only.** `Int{ it > 0 && it <= N }` with a named
  constant `N` works if the constant is inlined during parsing;
  otherwise the harness falls back to unbounded. Prefer inline literals
  for refinements used by `@property`.
- **Shrinks are greedy, not optimal.** For very large input trees the
  greedy walk can terminate at a local minimum that's still two shrinks
  away from the truly minimal case. Raise `--max-shrinks` if you
  suspect this — the default of 100 is enough for most failures.

## Related

- **[Tooling → Testing](/docs/tooling/testing)** — overall testing guide.
- **[Language → Refinement types](/docs/language/refinement-types)** — the types that the generator reads.
- **[Reference → Attribute registry](/docs/reference/attribute-registry)** — full attribute semantics including `@property`.
- **[Reference → CLI commands](/docs/reference/cli-commands)** — every `verum test` flag.
