---
sidebar_position: 6
title: Error model — IntoResponse, WeftError, ExtractRejection
description: Typed errors that always render. Five-axis classification (Transient / Permanent / Security / Client / Upstream) drives retry, circuit-breaker, and load-shed policy automatically.
---

# `core.net.weft.error`

Verum's error model makes "every error must render to a response"
a typed contract, not a runtime hope.

Source: `core/net/weft/error.vr` (261 LOC).

## `IntoResponse` — every error renders

```verum
public type IntoResponse is protocol {
    fn into_response(self) -> Response;
};
```

Any `Service.Error` in Weft must implement `IntoResponse`. If a
handler returns `Err`, the framework calls `into_response` on the
error and ships the resulting `Response` to the client. There is
no path through Weft where an error becomes a connection abort,
a 500 with a leaked stack trace, or a hung request.

Built-in impls cover the common cases:

```verum
implement IntoResponse for Response {
    fn into_response(self) -> Response { self }
}

implement IntoResponse for StatusCode {
    fn into_response(self) -> Response { resp_status(self) }
}

implement IntoResponse for Text {
    fn into_response(self) -> Response { resp_text(self) }
}

implement IntoResponse for () {
    fn into_response(self) -> Response { resp_ok() }
}
```

So returning `Ok("hello")` from a handler is enough — `Text`
implements `IntoResponse`. Returning `Ok(())` returns 200 with
empty body. Returning `Err(StatusCode.new(404))` returns 404 with
an empty body.

## `WeftErrorCategory` — taxonomy that drives policy

```verum
public type WeftErrorCategory is
    | ErrTransient
    | ErrPermanent
    | ErrSecurity
    | ErrClient
    | ErrUpstream;
```

Five axes, each with a default HTTP status and a retryability bit:

| Variant | Default status | Retryable | When |
|---|---|---|---|
| `ErrTransient` | 503 Service Unavailable | yes | Capacity exhaustion, pacing, transient network blip. |
| `ErrPermanent` | 500 Internal Server Error | no | Internal invariant violation, unhandled state. |
| `ErrSecurity` | 403 Forbidden | no | Auth failure, capability mismatch — never echo to client. |
| `ErrClient` | 400 Bad Request | no | Malformed input, validation failure. |
| `ErrUpstream` | 502 Bad Gateway | yes | Downstream service error, upstream timeout. |

Accessors:

```verum
implement WeftErrorCategory {
    public fn default_status(&self) -> StatusCode
    public fn is_retryable(&self) -> Bool
}
```

This taxonomy directly drives middleware behaviour:

- `RetryLayer` reads `category()` on the inner service's error.
  Only `Transient` and `Upstream` get retried — retrying a
  `Client` error (400) is a meaningless waste of capacity.
- `CircuitBreakerLayer` only counts `Transient` and `Upstream`
  toward the breaker's failure rate. A handler that raises
  `Client` 1000x in a row does not trip the breaker.
- `TracingLayer` and `MetricsLayer` may dim the verbosity of
  `Client` errors (expected) and amplify `Permanent` errors
  (always interesting).

## `WeftError` — base error for framework-internal failures

```verum
public type WeftError is
    | BadRequest(Text)
    | RouteNotFound
    | MethodNotAllowed
    | ExtractionRejected(Text)
    | Timeout
    | Overloaded
    | UpstreamIo(Text)
    | Internal(Text);
```

Each variant has:

- A `category()` mapping to one of the five `WeftErrorCategory`
  values (e.g. `Timeout` is `ErrTransient`, `Internal` is `ErrPermanent`).
- A `status()` returning a specific `StatusCode` (e.g. `Timeout` is
  504, `Overloaded` is 503).
- A `public_message()` — the safe-to-echo message for the response
  body. Internal errors deliberately do **not** include the
  developer-side reason in the public message.
- An `IntoResponse` impl that ships `status()` plus
  `public_message()` to the client.

```verum
implement WeftError {
    public fn category(&self) -> WeftErrorCategory
    public fn status(&self) -> StatusCode
    public fn public_message(&self) -> Text
}

implement IntoResponse for WeftError {
    fn into_response(self) -> Response {
        let status = self.status();
        let msg = self.public_message();
        resp_with_body_text(resp_status(status), msg)
    }
}
```

## `ExtractRejection` — typed extractor errors

```verum
public type ExtractRejection is
    | MissingParam(Text)
    | InvalidParam { name: Text, value: Text, expected: Text }
    | MissingHeader(Text)
    | InvalidBody(Text)
    | PayloadTooLarge(Int)
    | MissingContext(Text);
```

Every extractor's `Rejection` is either `ExtractRejection` directly
or another type that implements `IntoResponse`. Default mappings:

- `PayloadTooLarge` -> 413
- everything else -> 400

`public_message()` formats the structured detail into a
human-readable message: `parameter \`id\` = \`abc\` is not a valid integer`.

## Application-error pattern

A typical application defines its own taxonomy on top of the framework
errors:

```verum
type ApiError is
    | NotFound(Text)
    | ValidationError(List<FieldError>)
    | InternalError(Text)
    | Unauthorized;

implement IntoResponse for ApiError {
    fn into_response(self) -> Response {
        match self {
            NotFound(what) =>
                Response.not_found(f"{what} not found"),
            ValidationError(errors) =>
                Response.bad_request(Json(errors)),
            InternalError(msg) => {
                // To the log: full detail.
                Logger.error(f"internal: {msg}");
                // To the client: minimum.
                Response.internal_server_error("internal error")
            },
            Unauthorized =>
                Response.unauthorized(),
        }
    }
}
```

Handlers return `Result<T, ApiError>`. Compiler checks every path
returns either `Ok(T)` (which implements `IntoResponse` via `T`)
or `Err(ApiError)` (which implements it via the impl above).
There is no path that does not render.

## Error chains and source

A future enhancement adds `Error` as a first-class protocol:

```verum
public type Error is protocol {
    fn message(&self) -> Text;
    fn source(&self) -> Maybe<&dyn Error>;
    fn backtrace(&self) -> Maybe<&Backtrace>;
    fn category(&self) -> ErrorCategory;
}
```

`source()` provides the chain — `HandlerError -> RepositoryError ->
DbError -> IoError`. The logging middleware unrolls the whole chain
into a structured JSON record; the client sees only the top-level
`public_message()`.

A normative rule for `Layer::wrap` is that it must not lose `source()`
of the wrapped error — `TimeoutLayer` wraps `S.Error` in
`TimeoutError.Inner(err)` and `into_response` on the outer recursively
calls `source().into_response()`. Compiler enforces this via an
`@ownership(preserve_source)` annotation on `wrap`.

## `errdefer` — error-path cleanup

Verum's `errdefer` registers a block that runs only if the function
returns `Err`:

```verum
async fn acquire_and_process(pool: &Pool) -> Result<Data, E> {
    let conn = pool.acquire().await?;
    errdefer { pool.release(conn); }     // cleanup only on error
    let data = conn.query().await?;
    pool.release(conn);                   // normal path
    Ok(data)
}
```

Weft uses this on hot paths (acquire buffer -> errdefer release ->
use -> release on success). No `try-finally` boilerplate needed.

## Status

- **Implementation**: complete.
- **Conformance**: `error_shape` test passing.
- **Phase**: 1 closed; first-class `Error` protocol with `source()`
  / `backtrace()` is a Phase 6 follow-up.

## Related documentation

- [Service / Layer / ServiceBuilder](./service) — error flows through layer composition.
- [Handler & extractors](./handler) — `ExtractRejection` is the typed extractor error.
- [Backpressure](./backpressure) — uses `category().is_retryable()`.
