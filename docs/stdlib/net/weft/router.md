---
sidebar_position: 4
title: Router — radix-tree dispatcher
description: O(k) path matching on a radix tree. Static / param / wildcard segments. Sub-router nesting with prefix stripping. Method-aware dispatch. Refinement-typed parameter monotonicity verified by SMT.
---

# `core.net.weft.router`

The router is a radix-tree dispatcher that turns `(method, path)`
to handler lookups into roughly 200-nanosecond constant-time tree
walks. It implements `Handler` itself, so a Router can be composed
inside another Router via `.nest()`, can be wrapped in `.layer()`,
and can serve as the root `WeftApp` handler.

Source: `core/net/weft/router.vr` (367 LOC).

## Path patterns

Three segment types:

| Form | Match | Stored |
|---|---|---|
| `/literal` | `"literal"` exactly | `Segment.Static(Text)` |
| `/:name` | any single segment | `Segment.Param(Text)` |
| `/*name` | tail (one or more segments) | `Segment.Wildcard(Text)` |

Wildcard must be the **last** segment of the pattern. A wildcard in
the middle is a compile-time `Router.route` panic.

Static segments take priority over `:param`, which takes priority
over `*wildcard`. Within static, the longest exact match wins —
this is the standard radix-tree disambiguation.

```verum
let app = Router.new()
    .route("/users",          Method.Get, list_users)        // exact
    .route("/users/:id",      Method.Get, get_user)          // param
    .route("/users/admin",    Method.Get, get_admin_user)    // exact wins
    .route("/static/*path",   Method.Get, serve_static);     // wildcard
```

`/users/admin` matches `get_admin_user`, not `get_user(/users/:id)`.

## Method-aware dispatch

```verum
implement Router {
    public fn route<H: Handler + 'static>(
        mut self, pattern: Text, method: Method, handler: H,
    ) -> Router

    public fn get<H: Handler + 'static>(self, pattern: Text, handler: H) -> Router
    public fn post<H: Handler + 'static>(self, pattern: Text, handler: H) -> Router
    public fn put<H: Handler + 'static>(self, pattern: Text, handler: H) -> Router
    public fn delete<H: Handler + 'static>(self, pattern: Text, handler: H) -> Router
    public fn patch<H: Handler + 'static>(self, pattern: Text, handler: H) -> Router
}
```

The five method shortcuts are sugar over
`.route(pattern, Method.X, handler)`. For `PUT`-with-conditional
or `OPTIONS` handling, use `.route` directly.

When the path matches but the method does not, the router responds
`405 Method Not Allowed` — translated from `WeftError.MethodNotAllowed`
through the `IntoResponse` chain.

## Nesting — `.nest()`

```verum
let api_v1 = Router.new()
    .get("/users",      list_users_v1)
    .post("/users",     create_user_v1);

let api_v2 = Router.new()
    .get("/users",      list_users_v2)
    .post("/users",     create_user_v2);

let app = Router.new()
    .nest("/api/v1", api_v1)
    .nest("/api/v2", api_v2)
    .fallback(static_fallback);
```

The path prefix is **stripped** before the inner router sees the
request — `list_users_v1` sees its path as `/users`, matching the
inner pattern.

Nested registration order matters: the **first** nested prefix that
matches wins. The main tree is checked first; nested only run on
main miss; finally `.fallback` runs on no match in any tree.

A nested prefix must:

- start with `/`,
- not end with `/` (except for root `/`, which is a special case).

`/api/v1/` is normalised to `/api/v1` at registration.

## Fallback — `.fallback()`

```verum
public fn fallback<H: Handler + 'static>(mut self, handler: H) -> Router
```

Catch-all when no route matches. Typical usage:

```verum
let app = Router.new()
    .get("/", index)
    .nest("/api", api_router)
    .fallback(serve_static);  // last resort: try to serve a static file
```

Without `.fallback`, an unmatched request gets `WeftError.RouteNotFound`
which renders as 404 Not Found.

## Layer attachment

Router itself is a `Handler`, so:

```verum
let app = Router.new()
    .get("/", index)
    .layer(TracingLayer.new())     // outermost first; wraps the whole router
    .layer(TimeoutLayer.ms(5000))
    .layer(RateLimitLayer.new(rps = 1000));
```

You can also layer **on individual sub-routers**:

```verum
let admin = Router.new()
    .get("/dashboard", admin_dashboard)
    .layer(AuthLayer.admin_only());

let app = Router.new()
    .nest("/admin", admin)        // auth applies only to /admin/*
    .nest("/api", public_api)
    .layer(TracingLayer.new());   // tracing applies to everything
```

## `match_request` — direct matching API

```verum
public fn match_request(&self, req: &mut WeftRequest)
    -> Maybe<&Heap<dyn Handler>>
```

For tools (LSP, route-introspection) that need to find the matching
handler without dispatching. Populates `req.path_params` on match.

## Refinement-typed routes

The killer feature. A route can declare type-level constraints on
its parameters, and the compiler proves at type-check time that the
handler signature is compatible with the URL pattern.

```verum
type ValidApiVersion is Text where |s| {
    s == "v1" || s == "v2" || s == "v3"
};

type UserId is Int where |n| { n >= 1 && n <= 1_000_000_000 };

async fn get_user(
    Path(version): Path<ValidApiVersion>,
    Path(id): Path<UserId>,
) -> Json<User> {
    // SMT has already proved: version is one of v1/v2/v3,
    // id is in [1, 10^9]. Defensive checks are provably unnecessary.
}

let app = Router.new()
    .route("/api/:version/users/:id", Method.Get, get_user);
```

If you forget to update `ValidApiVersion` to add `"v4"`, the route
`/api/v4/users/42` returns 400 (refinement violation). If you
register a handler for `/api/:version/users/:id` that expects
`Path<DifferentRefinement>`, the compiler rejects the registration
with an SMT-derived counterexample.

This is the **monotonic refinement composition** rule:

1. **Narrowing**: handler parameter `P` accepts an extractor value
   `Q` only if `Q ⊆ P` (SMT proves implication).
2. **Widening**: forbidden without explicit `refinement_cast` (rare,
   for legacy interop).
3. **Chain**: extractor → middleware narrowing → handler param —
   SMT walks the chain.
4. **SMT budget**: each obligation has a `@verify` timeout (default
   200 ms `static`, 20 ms `fast` mode, 5 s `thorough`).
5. **Caching**: results memoised so repeated builds re-use proofs.

See [refined_routes](./refined_routes) for the bridge between the
language refinement system and the router.

## Compile-time decision tree

A future enhancement: the router pattern set is converted into a
static decision tree at compile time via `meta fn`. The result is a
constant `dispatch` function that compiles to a jump table — zero
runtime hash-map lookup, zero allocation per request.

```verum
@const
fn build_router(routes: List<RouteSpec>) -> CompiledRouter {
    // SMT-checked for ambiguity. Output is a static dispatch tree.
}

meta fn expand_router_macro(input: tt) -> TokenStream
    using [AstAccess, TypeInfo, CompileDiag]
{
    let routes = parse_route_list(input)?;
    verify_no_ambiguities(&routes)?;       // SMT: do any patterns overlap?
    verify_handler_signatures(&routes)?;   // SMT: extractor superset of route refinement?
    let static_table = build_router(routes);
    quote {
        const COMPILED_ROUTER: CompiledRouter = ${lift(static_table)};
        fn dispatch(req: Request) -> Response { COMPILED_ROUTER.dispatch(req) }
    }
}
```

Status: not yet implemented (Phase 6 work).

## Status

- **Implementation**: complete (radix tree, nest, fallback, layer).
- **Conformance**: `router_basic` and `router_nest` tests passing.
- **Phase**: 1 closed; Phase 2 closed (`.nest()`); compile-time
  dispatch tree — Phase 6.
- **Performance**: roughly 200 nanoseconds per match measured on
  x86-64. Compile-time tree (Phase 6) targets zero-cost.

## Related documentation

- [Handler & extractors](./handler)
- [Service / Layer / ServiceBuilder](./service)
- [Refinement-typed routes](./refined_routes)
- [Listener](./listener)
