---
sidebar_position: 3
title: Handler & FromRequest extractors
description: Convert Verum async functions into Services via typed extractors. Path<T>, Query<T>, Json<T>, BodyText, BodyBytes — refinement-typed parsing in handler signatures.
---

# `core.net.weft.handler` + `core.net.weft.json_extractor`

The handler layer is what makes Weft's developer ergonomics
indistinguishable from popular axum-style frameworks, while the
type system makes it impossibly safer.

Sources: `core/net/weft/handler.vr` (327 LOC),
`core/net/weft/json_extractor.vr` (417 LOC).

## `WeftRequest` — server-side enriched request

```verum
public type WeftRequest is {
    method: Method,
    path: Text,
    raw_query: Maybe<Text>,
    headers: Headers,
    body: List<Byte>,
    path_params: Map<Text, Text>,    // populated by router on match
    peer_addr: Maybe<SocketAddr>,
};
```

Router populates `path_params` after a successful match. Listener
populates `peer_addr` before invoking the handler. Headers and body
come from the per-connection HTTP/1.1 parser, or the HTTP/2 frame
multiplexer.

### Convenience accessors

```verum
implement WeftRequest {
    public fn path_param(&self, name: &Text) -> Maybe<&Text>
    public fn path_param_int(&self, name: &Text) -> Maybe<Int>
    public fn query_param(&self, name: &Text) -> Maybe<Text>     // percent-decoded
    public fn header(&self, name: &Text) -> Maybe<&Text>
    public fn body_text(&self) -> Text                            // UTF-8 lossy
    public fn body_bytes(&self) -> &[Byte]
    public fn content_type(&self) -> Maybe<&Text>
    public fn to_http_request(&self, url: Text) -> HttpRequest    // for proxying
}
```

Query-string decode is RFC 3986 percent-decoding plus `+` to space,
fully in-place when the source buffer has no `%` and no `+`.

## `Handler` — protocol implementing `Service`

```verum
public type Handler is protocol {
    async fn handle(&self, req: WeftRequest) -> Result<Response, WeftError>;
};
```

Every router, every plain handler closure, every typed-extractor
wrapper conforms to `Handler`. The Router itself implements
`Handler`, which lets you `.layer(L)` over a Router exactly the
same way as over a single closure.

## `FromRequest` — typed extractor protocol

```verum
public type FromRequest is protocol {
    type Rejection;
    async fn from_request(req: &mut WeftRequest) -> Result<Self, Self.Rejection>;
};
```

Every extractor type implements `FromRequest`. The protocol is
asynchronous — a body-reading extractor can `await` the body buffer
to fill, and a context-extractor that fetches from a service may
make I/O calls.

The `Rejection` associated type must implement `IntoResponse`. This
is how malformed requests are converted into HTTP responses without
needing handler-author boilerplate — the framework auto-shortcuts
on `Err(rejection)`.

## Built-in extractors

### `PathParam<T>`

```verum
public type PathParam<T> is { value: T };

implement<T> PathParam<T> {
    public fn into_inner(self) -> T { self.value }
}
```

Used as a handler-argument type. Currently per-T monomorphisation
(`path_text` / `path_int`) is the canonical form; explicit type
arguments at call site (`PathParam.parse<T>(...)`) wait on a
compiler enhancement.

```verum
public fn path_text(req: &mut WeftRequest, name: &Text)
    -> Result<PathParam<Text>, ExtractRejection>;

public fn path_int(req: &mut WeftRequest, name: &Text)
    -> Result<PathParam<Int>, ExtractRejection>;
```

### `QueryParam<T>`

Same shape, query-string flavour:

```verum
public fn query_text(req: &mut WeftRequest, name: &Text)
    -> Result<QueryParam<Text>, ExtractRejection>;

public fn query_text_optional(req: &mut WeftRequest, name: &Text)
    -> Maybe<QueryParam<Text>>;

public fn query_int(req: &mut WeftRequest, name: &Text)
    -> Result<QueryParam<Int>, ExtractRejection>;
```

### `BodyBytes` — raw body

```verum
public type BodyBytes is { inner: List<Byte> };

implement FromRequest for BodyBytes {
    type Rejection = ExtractRejection;
    async fn from_request(req: &mut WeftRequest) -> Result<BodyBytes, ExtractRejection> {
        Ok(BodyBytes { inner: req.body.clone() })
    }
}
```

Renamed from a historic shorter name to avoid collision with the
stdlib alias for `List<Byte>`. The codegen variant table is keyed
by simple type name, so two stdlib types named identically would
shadow each other.

### `BodyText` — UTF-8 body

```verum
public type BodyText is { inner: Text };

implement FromRequest for BodyText {
    type Rejection = ExtractRejection;
    async fn from_request(req: &mut WeftRequest) -> Result<BodyText, ExtractRejection> {
        match Text.from_utf8(&req.body) {
            Ok(t)  => Ok(BodyText { inner: t }),
            Err(_) => Err(ExtractRejection.InvalidBody("non-UTF8 body")),
        }
    }
}
```

Validates UTF-8 at the framework boundary. Handlers receive `Text`
guaranteed-decoded.

### `Json<T>` — typed JSON body

The killer extractor. Five gates in fixed order:

1. **Content-Type check** — `application/json` (with optional
   `;charset=utf-8`). Anything else returns `Err(WrongContentType)`.
2. **Body-size cap** — caller-configured (default 1 MiB). Oversize
   returns `Err(PayloadTooLarge { len, cap })`.
3. **UTF-8 validation** — invalid sequences return
   `Err(InvalidUtf8 { offset })`.
4. **Syntax parse** — `core.encoding.json.parse`. Errors yield
   `Err(ParseError { json_err })`.
5. **Type-directed materialisation** — `T.from_json(&value, &path)`
   via the `JsonDeserialize<T>` protocol. Refinement-type violations
   bubble as `Err(RefinementViolation { reason, path })`.

```verum
public type Json<T> is { inner: T };

implement<T> Json<T> {
    public fn into_inner(self) -> T { self.inner }
    public fn as_ref(&self) -> &T { &self.inner }
}

implement<T> FromRequest for Json<T>
    where T: JsonDeserialize<T>
{
    type Rejection = JsonExtractError;
    async fn from_request(req: &mut WeftRequest) -> Result<Json<T>, JsonExtractError> {
        let cfg = JsonExtractorConfig.default();
        let value = extract_json<T>(req, &cfg)?;
        Ok(Json { inner: value })
    }
}
```

#### `JsonExtractorConfig`

```verum
public type JsonExtractorConfig is {
    max_body_bytes: Int,        // default 1 * 1024 * 1024 (1 MiB)
    accept_plus_json: Bool,     // RFC 6838 +json suffix (default true)
    require_content_type: Bool, // strict mode (default true)
};

implement JsonExtractorConfig {
    public fn default() -> JsonExtractorConfig { ... }
    public fn with_max_body_bytes(self, n: Int) -> JsonExtractorConfig { ... }
    public fn relaxed_content_type(self) -> JsonExtractorConfig { ... }
}
```

#### Built-in `JsonDeserialize<T>` impls

Out of the box: `Int`, `Float`, `Bool`, `Text`, `List<T>`, `Map<K,V>`,
`Maybe<T>`. Records and sum types — derive via `@derive(JsonDeserialize)`.

#### `JsonExtractError` — typed rejection

```verum
public type JsonExtractError is
    | MissingContentType
    | WrongContentType { actual: Text }
    | PayloadTooLarge { len: Int, cap: Int }
    | InvalidUtf8 { offset: Int }
    | ParseError { json_err: JsonError }
    | ShapeMismatch { reason: Text, path: Text }
    | RefinementViolation { reason: Text, path: Text };
```

Each variant has a default HTTP status:

- `MissingContentType / WrongContentType` -> 415 Unsupported Media Type
- `PayloadTooLarge` -> 413 Payload Too Large
- `InvalidUtf8 / ParseError / ShapeMismatch` -> 400 Bad Request
- `RefinementViolation` -> **422 Unprocessable Entity** (the request
  parsed structurally but did not satisfy a refinement predicate)

The 400-vs-422 distinction matters: clients should retry 400 with a
fixed structure but **not** 422 with the same data.

## Handler authoring — typical shape

```verum
async fn create_user(
    Json(input): Json<CreateUserInput>,    // body extractor
    Ctx(db): Ctx<Database>,                // DI extractor (when wired)
) -> Result<Json<User>, ApiError>
    using [Database]                       // context requirement
{
    input.validate().map_err(ApiError.Validation)?;
    let id = db.save(input.into_user()).await
        .map_err(|e| ApiError.Internal(f"{e}"))?;
    Ok(Json(User { id, ..input.into_user() }))
}
```

The compiler does the heavy lifting:

- `Json<CreateUserInput>` — `from_request` runs the five gates.
- `Ctx<Database>` — context lookup against the active `provide` chain.
- `using [Database]` — `Database` capability flows through the call.
- `Result<Json<User>, ApiError>` — success serialised as JSON, error
  goes through `IntoResponse for ApiError`.

If you forget `using [Database]` and try to call `db.save(...)`,
the compiler rejects it. If `ApiError` does not implement
`IntoResponse`, the framework cannot construct the response — also
a compile error.

## `ClosureHandler<F>` — ad-hoc closures as handlers

```verum
public type ClosureHandler<F> is { f: F };

implement<F> Handler for ClosureHandler<F>
    where F: fn(WeftRequest) -> Result<Response, WeftError>
{
    async fn handle(&self, req: WeftRequest) -> Result<Response, WeftError> {
        (self.f)(req)
    }
}
```

Useful for tests and quick prototypes. Production handlers should
be named functions for traceability.

## Comparison with mainstream frameworks

| Aspect | Mainstream axum-style | Weft |
|---|---|---|
| Extractor mechanism | Trait `FromRequest` with macro magic | Protocol `FromRequest` plus `meta fn` |
| Refinement-typed params | Runtime newtype | `where`-clause Z3-verified |
| `Json<T>` typed errors | One variant `JsonRejection` | Seven variants, separate 400 / 413 / 415 / 422 |
| 422 for refinement violation | Manual | Automatic |
| Handler signature derives Service | Procedural macro | `meta fn Weft.handler(...)` |
| Effect-typed handler | None | `using [Database]` plus properties |

## Status

- **Implementation**: handler module complete; json_extractor module
  complete.
- **Conformance**: `handler_basic` passing; `json_extractor` test
  blocked on a compiler enhancement (explicit type arguments at
  call site).
- **Phase**: 1 closed; Phase 2 follow-up (full JSON deserialization
  through `JsonDeserialize` derive) closed 2026-04-29.

## Related documentation

- [Service / Layer / ServiceBuilder](./service)
- [Router](./router)
- [Refinement-typed routes](./refined_routes)
- [Error model](./error)
