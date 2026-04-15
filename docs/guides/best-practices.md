---
sidebar_position: 3
title: Best practices
description: Patterns the stdlib and production Verum code converge on.
---

# Best practices

Idioms and organising principles that experienced users converge on.
Short, opinionated, with reasons.

## Model your domain, then your data

Verum gives you refinement types, sum types, records, and newtypes.
Use them in that order when shaping a new domain.

1. **Refinement types** capture invariants: `Port is Int { 1..=65535 }`,
   `NonEmpty<T> is List<T> { self.len() > 0 }`.
2. **Sum types** capture alternatives that must be handled exhaustively:
   `type Outcome is Success(Data) | Failure(Reason)`.
3. **Records** bundle named fields: `type User is { id, name, email }`.
4. **Newtypes** distinguish structurally-identical primitives:
   `type UserId is (Int) { self > 0 }`.

Don't reach for a plain `Int` / `Text` when a newtype would do.

## Make invalid states unrepresentable

The compiler can only prevent mistakes you've typed out. Exchange
defensive runtime checks for type-level encoding:

```verum
// Weak — every caller must remember to check
fn process(user: User, is_authenticated: Bool) { ... }

// Strong — the type says the check happened
fn process(user: AuthenticatedUser) { ... }
```

## Keep refinements small

A short decidable predicate costs the SMT solver milliseconds; a
complex one with quantifiers, string manipulation, and cross-parameter
refs can cost seconds. If a refinement grows, extract a named
`@logic` helper — it reuses proof fragments and speeds up the solver.

## Start with `@verify(static)`, upgrade where it pays

Every function gets static verification for free. Reach for
`@verify(formal)` on functions where the contracts actually reason
about values. Use `@verify(thorough)` for safety-critical: crypto,
protocol invariants, kernels.

## Prefer structured concurrency

Any `spawn` that should finish before the caller returns belongs
inside a `nursery`. Fire-and-forget tasks (metric publishers,
long-running loops) belong under a `Supervisor`. Bare `spawn` is for
very short-lived "go run this now, we don't care" work.

## Make contexts part of the type signature

If your function uses `Database`, say so: `using [Database]`. Don't
hide it behind a "global config". The compiler propagates the
declaration across `spawn` and `.await`; tests can `provide` a mock
without any mocking framework.

Group common sets into `using Name = [...]`:

```verum
using WebRequest = [Database, Logger, Cache, Clock, Metrics];

fn handle(req: Request) -> Response using [WebRequest] { ... }
```

## Prefer `&T` to `&checked T` to `&unsafe T`

- **Default to `&T`.** Escape analysis promotes most of them.
- **Ask for `&checked T` explicitly** when the 15 ns matters and
  you want the compiler to prove you can skip it.
- **Reach for `&unsafe T` only** when you need FFI or primitives; pair
  it with a `// SAFETY: ...` comment.

## Return `Result<T, E>`, propagate with `?`

Don't panic on recoverable errors. A library that panics on invalid
input is harder to compose than one that returns `Result`.

## Use typed error enums for library boundaries

```verum
type ApiError is
    | NotFound
    | Unauthorized
    | RateLimited { retry_after: Duration }
    | Upstream(Error);
```

Callers can `match` precisely; downstream changes don't break
call-site handling.

## Embrace `Maybe` over sentinel values

`Maybe.None` is clearer than `-1`, `""`, or `Vec::new()` as
placeholder values. The compiler forces handling; sentinels rot.

## Keep functions short; extract ruthlessly

Verum's verbose type signatures make long functions painful. That's
a feature — it nudges you toward small composable units. Aim for
functions with obvious contracts; let the type system document them.

## Prefer iterators to index-based loops

```verum
// Don't
let mut i = 0;
while i < xs.len() {
    process(&xs[i]);
    i += 1;
}

// Do
for x in xs.iter() {
    process(x);
}
```

Iterators compose, are bounds-safe, and enable parallel / lazy
variants without refactoring.

## Write `@test` near the code under test

Unit tests with `@test` live in the same file as the tested code (or
a co-located `_test.vr`). Integration tests go in `tests/`. Don't
accumulate test-only code in the main source without an `@cfg(test)`
gate.

```verum
pub fn parse_date(s: &Text) -> Result<Date, ParseError> { ... }

@cfg(test)
module tests {
    @test fn parses_iso_8601() { ... }
    @test fn rejects_invalid() { ... }
}
```

## Property tests for anything algebraic

```verum
@test(property)
fn sort_is_idempotent(xs: List<Int>) {
    assert_eq(xs.sorted().sorted(), xs.sorted());
}

@test(property)
fn reverse_reverse_is_identity(xs: List<Int>) {
    assert_eq(xs.reversed().reversed(), xs);
}
```

Verum's VCS has a property-testing framework built in. Use it for
data-structure invariants, parser round-trips, and anything else
whose spec is a mathematical identity.

## Benchmarks belong next to the code they measure

```verum
@bench
fn bench_fibonacci_iter(b: &mut Bencher) {
    b.iter(|| fibonacci_iterative(30));
}
```

Run with `verum bench`. Keep benchmarks meaningful: don't compare
constructor-heavy code unless that's what you're measuring.

## Documentation is a first-class deliverable

`///` on every `pub` item. Include a short example when the signature
isn't self-explanatory. The docgen (`verum doc`) extracts these into
a navigable site.

## Organising a cog

```
my-cog/
├── Verum.toml
├── README.md
├── src/
│   ├── lib.vr             # public API re-exports
│   ├── types.vr           # core types
│   ├── parser.vr          # one concept per file
│   ├── serde.vr
│   └── internal/          # non-public helpers
│       ├── mod.vr
│       └── util.vr
├── tests/
│   └── integration.vr
├── benches/
│   └── perf.vr
└── examples/
    └── quickstart.vr
```

## Naming surface — in order

1. **Nouns** — `User`, `Request`, `Connection`.
2. **Adjectives** — `Sorted<T>`, `Validated`, `NonEmpty<T>`.
3. **Verbs** — `process`, `validate`, `connect`.
4. **Adverbs** (rare) — `eagerly_collect`, `lazily_map`. Only when
   there's a cheap and a costly variant both worth keeping.

## Don't over-parameterise

A function that takes `Collection<Display + Hash + Ord>` is probably
doing too much. Bias toward concrete types until the polymorphism
pays for itself. Add generics when you have two concrete callers.

## Optimise after profiling

`verum profile` and `verum bench` are your sources of truth. Don't
hand-optimise before measuring — CBGR escape analysis is surprisingly
good, and LLVM even better. The combination often beats hand-written
"fast" code.

## See also

- **[Style guide](/docs/guides/style-guide)** — the lower-level
  rules.
- **[Refinement patterns](/docs/cookbook/refinements)**.
- **[Nursery](/docs/cookbook/nursery)**.
