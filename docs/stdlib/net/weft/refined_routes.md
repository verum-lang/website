---
sidebar_position: 7
title: Refinement-typed routes
description: Type-level URL parameter constraints verified by SMT. PathRefinement<T> bridges the language refinement system into the router so handler signature monotonicity becomes a compile-time guarantee.
---

# `core.net.weft.refined_routes`

Refinement types are Verum's killer feature for web servers.
A refined type carries a predicate, evaluated at compile time, that
constrains the value space.

```verum
type ValidApiVersion is Text where |s| {
    s == "v1" || s == "v2" || s == "v3"
};

type UserId is Int where |n| { n >= 1 && n <= 1_000_000_000 };

type SlugText is Text where |s| {
    s.len() > 0 && s.len() <= 64 &&
    s.all_chars(|c| c.is_alphanumeric() || c == '-')
};
```

The router applies the predicate at request time and the type system
verifies, at compile time, that handler parameters are assignment-
compatible with the URL pattern's refinement. Handler authors write
`Path<UserId>` and the compiler proves the value reaching the handler
satisfies the refinement.

Source: `core/net/weft/refined_routes.vr` (169 LOC).

## `PathRefinement<T>` — the bridge

```verum
public type PathRefinement<T> is {
    name: Text,
    parse: fn(Text) -> Maybe<T>,
};
```

A `PathRefinement` is a typed parser plus a name (used in error
diagnostics). The parser returns `None` if the input fails the
refinement; the framework converts `None` into a 422 Unprocessable
Entity response.

## Built-in factories

### `int_between(min, max)`

```verum
public fn int_between(name: Text, min: Int, max: Int) -> PathRefinement<Int>
```

Parses an integer and rejects values outside `[min, max]`.

```verum
let user_id = int_between("user_id", 1, 1_000_000_000);
```

### `text_one_of(set)`

```verum
public fn text_one_of(name: Text, set: List<Text>) -> PathRefinement<Text>
```

Accepts only values present in the set.

```verum
let api_version = text_one_of("version", ["v1", "v2", "v3"]);
```

### `slug(name)`

```verum
public fn slug(name: Text) -> PathRefinement<Text>
```

Slug rules: 1..=64 characters, ASCII alphanumeric or hyphen.

```verum
let slug_param = slug("article_slug");
```

## Extraction in a handler

Combined with the language refinement system, the handler can declare
a refined parameter directly:

```verum
type UserId is Int where |n| { n >= 1 && n <= 1_000_000_000 };

async fn get_user(Path(id): Path<UserId>) -> Json<User> {
    // SMT has proved: id is in [1, 10^9]. No defensive check needed.
}

let app = Router.new()
    .route("/users/:id", Method.Get, get_user);
```

The compiler verifies, at type-check time, that `Path<UserId>` can
absorb the value of `:id`:

1. The router's pattern declares `:id` as an unbound `Text` segment.
2. The handler signature requires `Path<UserId>`.
3. SMT discharges the obligation `forall s: Text. parse_int(s) in [1, 10^9]`
   for the parser used by `int_between`.
4. If the obligation fails (e.g. the handler expected
   `UserId where n >= 1`, but the route's parser allows `0`), the
   compiler rejects the route registration with an SMT counterexample.

## Composition rules

The composition rules guarantee monotonic narrowing through the
extractor / middleware / handler chain.

### Narrowing

A handler parameter with refinement `P` accepts an extractor value
with refinement `Q` only if `Q ⊆ P`:

```
Q ⊆ P  ≡  forall x. Q(x) -> P(x)
```

The compiler dispatches this to the SMT backend. If SMT proves the
implication, the route compiles. Otherwise the compiler emits the
counterexample value:

```
error: refinement mismatch at /users/:id
  handler expects: UserId where |n| { n >= 1 && n <= 1_000_000_000 }
  extractor allows: Int where |n| { n >= 0 }
  counterexample: n = 0
  hint: tighten the extractor or relax the handler refinement.
```

### Widening

The reverse is forbidden without an explicit `refinement_cast` with
runtime check. This is the rare case (legacy interop, external API
that does not match your invariants).

```verum
let user_id: UserId = refinement_cast::<UserId>(raw_int)?;
```

`refinement_cast` returns `Result` — the runtime check enforces the
predicate even though the type system cannot statically prove it.

### Chain narrowing

If an extractor produces `Foo where P1`, a middleware narrows to
`Foo where P1 && P2`, and the handler parameter requires
`Foo where P2`, the chain composes — the SMT obligation is
`P1 && P2 -> P2` which holds trivially.

## SMT budget

Each refinement obligation has a `@verify` annotation that bounds
its solving time:

| Strategy | Timeout | Used for |
|---|---|---|
| `runtime` | 0 | Pure runtime check, no compile-time reasoning. |
| `fast` | 20 ms | Cheap predicates, stays in dev-loop. |
| `static` | 200 ms (default) | Production refinement obligations. |
| `formal` | 2 s | Complex protocol invariants. |
| `thorough` | 5 s + parallel strategies | Critical sites (TLS handshake, auth). |
| `certified` | unlimited, requires `.vproof` artefact | HACL*-wrapper boundary, FFI crypto. |

CI normally runs `static`; nightly runs `formal`; release-candidate
runs `certified` for a curated subset.

## Caching

Verified obligations are memoised by hash (predicate plus context).
A 500-endpoint project's `static` verification typically completes
in under 30 seconds with a warm cache.

## Incremental verification

The CI verifier compares the current refinement set with the
git-blame-derived set from the merge base, and only re-verifies
predicates whose AST changed. Full verification is a nightly job.

## Examples

### Versioned API

```verum
type ApiVersion is Text where |s| {
    s == "v1" || s == "v2" || s == "v3"
};

async fn handle_v(
    Path(version): Path<ApiVersion>,
    Path(action): Path<Text>,
) -> Response {
    match version {
        "v1" => v1_handle(action),
        "v2" => v2_handle(action),
        "v3" => v3_handle(action),
        // No need for catch-all — refinement guarantees coverage.
    }
}
```

If a developer adds `"v4"` to the refinement set without adding the
`match` arm, the compiler emits a `non_exhaustive_match` warning
pointing exactly at the missing case.

### Bounded ID

```verum
type UserId is Int where |n| { n >= 1 && n <= 1_000_000_000 };

let app = Router.new()
    .route("/users/:id", Method.Get, get_user);

async fn get_user(Path(id): Path<UserId>) -> Result<Json<User>, ApiError> {
    // id is guaranteed positive and within the database's index space.
    // No need for a defensive `if id < 1 { return ... }`.
    db.find_user(id).await
}
```

### Nested refinements

```verum
type VerifiedUser is User where |u| { u.email_verified };
type PremiumUser is VerifiedUser where |u| { u.subscription.is_active };

async fn premium_only(
    Path(id): Path<UserId>,
    Ctx(user): Ctx<PremiumUser>,
) -> Response {
    // SMT has chained: id valid AND user.email_verified AND user.subscription.is_active.
    premium_features(id, &user)
}
```

`premium_features` itself has the contract
`where user.subscription.is_active` — the compiler propagates the
guarantee from the handler call down to the inner function without
adding any runtime check.

## Status

- **Implementation**: complete (per-T factories, narrowing rule,
  SMT bridge).
- **Conformance**: `refined_routes_basic` test passing.
- **Phase**: 1 closed; SMT obligations on `meta fn`-built routers
  are Phase 6 (compile-time decision tree).

## Related documentation

- [Router](./router)
- [Handler & extractors](./handler)
- [Service / Layer / ServiceBuilder](./service)
