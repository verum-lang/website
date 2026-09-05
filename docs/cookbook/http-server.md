---
title: HTTP server
description: A minimal typed HTTP server — routing, context DI, graceful shutdown, middleware, TLS.
---

# HTTP server

A compact but real HTTP server: typed routes, context-injected
dependencies, graceful shutdown, JSON responses, and hooks for
middleware and TLS. Build on top of [`stdlib/net`](/docs/stdlib/net).

## Minimum working example

```verum
mount core.net.tcp.*;
mount core.net.http.*;
mount core.io.*;
mount core.async.*;

async fn serve() using [Database, Logger, Network] {
    let listener = TcpListener.bind("0.0.0.0:8080").await?;
    Logger.info("listening on :8080");

    nursery(on_error: wait_all) {
        loop {
            let (stream, peer) = listener.accept_async().await?;
            spawn handle(stream, peer);
        }
    }
    Result.Ok(())
}

async fn handle(mut stream: TcpStream, peer: SocketAddr)
    -> Result<(), Error>
    using [Database, Logger]
{
    let req = read_request(&mut stream).await?;
    Logger.info(f"{peer} {req.method} {req.uri}");
    let resp = route(req).await.unwrap_or_else(error_response);
    write_response(&mut stream, &resp).await?;
    Result.Ok(())
}

fn error_response(e: Error) -> Response {
    Response.new(StatusCode.internal_error())
        .with_body(f"error: {e}".into_bytes())
}
```

The `nursery` wraps the accept loop so that every spawned handler
completes before `serve` returns. See
[cookbook/nursery](/docs/cookbook/nursery).

## Routing

```verum
async fn route(req: Request) -> Result<Response, Error>
    using [Database]
{
    match (req.method, req.uri.path()) {
        // Static routes
        (Method.Get, "/health") =>
            Response.new(StatusCode.ok()).with_body(b"OK\n".into()).into_ok(),

        (Method.Get, "/version") =>
            Response.json(VersionInfo { version: VERSION }).into_ok(),

        // Dynamic routes
        (Method.Get, path) if path.starts_with("/users/") => {
            let id: Int = path.strip_prefix("/users/").unwrap()
                .parse_int()
                .ok_or(Error.BadRequest)?;
            handle_get_user(id).await
        }

        (Method.Post, "/users") => handle_create_user(req).await,

        (Method.Delete, path) if path.starts_with("/users/") => {
            let id: Int = path.strip_prefix("/users/").unwrap()
                .parse_int()
                .ok_or(Error.BadRequest)?;
            handle_delete_user(id).await
        }

        _ => Result.Ok(Response.new(StatusCode.not_found())),
    }
}
```

For anything beyond trivial routing, use a router library (e.g. the
`http_router` cog) that supports path parameters, middleware, and
regex routes.

## JSON responses with tagged literals

`find_user` is a helper of your own — the `Database` context is
deliberately narrow (`query`, `execute`, `begin`, `commit`,
`rollback`, `is_connected`), and domain queries live above it:

```verum
fn find_user(id: Int) -> Result<Maybe<User>, Text> using [Database] {
    let rows = Database.query("SELECT id, name, email FROM users WHERE id = $1",
                              [f"{id}"])?;
    Result.Ok(rows.first().map(User.from_row))
}
```

```verum
async fn handle_get_user(id: Int) -> Result<Response, Error>
    using [Database]
{
    match find_user(id)? {
        Maybe.Some(u) => {
            let body = json#"""
                {
                    "id":    ${u.id},
                    "name":  ${u.name},
                    "email": ${u.email}
                }
            """.into_bytes();
            Response.new(StatusCode.ok())
                .with_header("content-type", "application/json")
                .with_body(body)
                .into_ok()
        }
        Maybe.None => Result.Ok(Response.new(StatusCode.not_found())),
    }
}
```

`json#"""..."""` interpolates `${…}` with injection-safe splicing —
the JSON validator knows where a value position is versus a key
position. See
[language/tagged-literals](/docs/language/tagged-literals#interpolation-expr-inside-tagged-literals).

## Request parsing

### Query parameters

```verum
let filter = req.uri.query_param("filter").unwrap_or("all");
let limit: Int = req.uri.query_param("limit")
    .and_then(|s| s.parse_int())
    .unwrap_or(100);
```

### JSON body

```verum
async fn handle_create_user(req: Request) -> Result<Response, Error>
    using [Database]
{
    let body = req.read_body_limited(1024 * 64).await?;
    let payload: CreateUserRequest = json.parse(&body)?;
    let user = create_user(&payload)?;      // your helper, over Database.execute
    Response.json(user).into_ok()
}

@derive(Deserialize)
type CreateUserRequest is {
    name:  Text { !self.is_empty() && self.len() <= 128 },
    email: EmailAddr,
};
```

The refinement on `name` validates at deserialization time — bodies
with an empty or too-long name are rejected before they reach the
handler.

### Header reading

```verum
let ua = req.headers.get("user-agent").unwrap_or("unknown");
let auth = req.headers.get("authorization")
    .and_then(|h| h.strip_prefix("Bearer "))
    .ok_or(Error.Unauthorized)?;
```

## Graceful shutdown

Wait for SIGINT or SIGTERM and stop accepting new connections while
letting available handlers complete:

```verum
mount core.signal.{signal_stream};
mount core.sys.signal.{Signal};

async fn serve_graceful() using [Database, Logger, Network] {
    let listener = TcpListener.bind("0.0.0.0:8080").await?;
    Logger.info("listening on :8080");

    let shutdown = Shared.new(AtomicBool.new(false));
    let s = shutdown.clone();
    spawn async move {
        let mut sigs = signal_stream(&[Signal.Int, Signal.Term]);
        let _ = sigs.next().await;
        Logger.info("shutdown requested");
        s.store(true, MemoryOrdering.Release);
    };

    nursery(on_error: wait_all) {
        while !shutdown.load(MemoryOrdering.Acquire) {
            match select {
                accept = listener.accept_async().await => accept,
                _ = sleep(100.millis()).await => continue,
            } {
                Result.Ok((stream, peer)) => {
                    spawn handle(stream, peer);
                }
                Result.Err(e) => Logger.warn(f"accept: {e}"),
            }
        }
        Logger.info("stopped accepting, draining connections");
    }
    Logger.info("all connections drained");
    Result.Ok(())
}
```

The nursery's scope guarantees that even after the accept loop
exits, outstanding handlers complete before `serve_graceful` returns.

## Backpressure

Cap concurrent connections with a `Semaphore`:

```verum
let sem = Semaphore.new(1000);

nursery {
    loop {
        let (stream, peer) = listener.accept_async().await?;
        let permit = sem.acquire().await;      // blocks when full
        spawn async move {
            handle(stream, peer).await
                .unwrap_or_else(log_error);
            drop(permit);
        };
    }
}
```

With 1000 slots, request 1001 queues in the TCP `SYN` backlog until
the semaphore frees a permit.

## Middleware

A simple middleware chain pattern:

```verum
type Middleware = fn(Request, Next) -> Future<Output = Result<Response, Error>>
    using [Database, Logger];

type Next = fn(Request) -> Future<Output = Result<Response, Error>>
    using [Database, Logger];

async fn with_logging(req: Request, next: Next) -> Result<Response, Error>
    using [Logger]
{
    let start = Clock.now();
    let resp = next(req.clone()).await;
    let elapsed = Clock.now() - start;

    match &resp {
        Result.Ok(r)  => Logger.info(f"{req.method} {req.uri.path()} {r.status} {elapsed}"),
        Result.Err(e) => Logger.error(f"{req.method} {req.uri.path()} error: {e}"),
    }
    resp
}

async fn with_auth(req: Request, next: Next) -> Result<Response, Error> {
    let auth = req.headers.get("authorization")
        .ok_or(Error.Unauthorized)?;
    if !validate_token(auth) {
        return Result.Ok(Response.new(StatusCode.unauthorized()));
    }
    next(req).await
}
```

Compose by folding the list of middlewares around a core handler:

```verum
let middlewares = List.from([with_logging, with_auth]);
let handler = middlewares.iter().rfold(
    route as Next,
    |inner, mw| Next.from(move |req| mw(req, inner.clone())),
);
```

Verum uses `List<T>` (not Rust's `Vec<T>`) and constructs lists via
`List.from([...])` or `[a, b, c]` literals — never the `vec!` macro.

## TLS

There is no `TlsListener` and no `TlsConfig.new()`. The server side is
`TlsConfig.server()` for the config and `TlsAcceptor` for the socket,
and the identity goes in as parsed values rather than paths:

```verum
mount core.net.tls.{TlsConfig, TlsAcceptor};
mount core.security.x509.credential.{Certificate, PrivateKey};

let cert = Certificate.from_pem(&fs.read_text("/etc/tls/cert.pem").await?)?;
let key  = PrivateKey.from_pem(&fs.read_text("/etc/tls/key.pem").await?)?;

let tls_config = TlsConfig.server()
    .with_identity(cert, key)
    .with_alpn(["h2", "http/1.1"]);

let acceptor = TlsAcceptor.from_config(tls_config);
```

`with_cert_file` / `with_key_file` / `with_alpn_protocols` do not exist;
the real names are `with_identity` and `with_alpn`, and the config also
carries `with_min_version` / `with_max_version` / `with_verify_mode`.

The rest of the loop is identical — `acceptor.accept(stream)` returns
a `TlsStream` that implements the same read/write interface.

## Tests

```verum
@test
async fn test_health_endpoint() {
    let mock_db = MockDatabase.empty();
    let mock_log = NullLogger.new();

    provide Database = mock_db,
            Logger = mock_log {
        let req = Request.new(Method.Get, "/health");
        let resp = route(req).await.unwrap();
        assert_eq(resp.status.code(), 200);
        assert_eq(resp.body, b"OK\n");
    }
}

@test
async fn test_user_not_found() {
    let mock_db = MockDatabase.empty();
    provide Database = mock_db,
            Logger = NullLogger.new() {
        let req = Request.new(Method.Get, "/users/999");
        let resp = route(req).await.unwrap();
        assert_eq(resp.status.code(), 404);
    }
}
```

## Production checklist

| Concern                | What to do                                       |
|------------------------|--------------------------------------------------|
| **Backpressure**       | `Semaphore.new(max_connections)`.                |
| **Read limits**        | `read_body_limited(max_bytes)` on every handler. |
| **Timeouts**           | `timeout(30.secs(), req.parse())` around IO.  |
| **Graceful shutdown**  | SIGINT → stop accepting → drain nursery.         |
| **TLS**                | `TlsAcceptor.from_config(TlsConfig.server()…)`.  |
| **CORS**               | Middleware that sets `Access-Control-*` headers.  |
| **Metrics**            | Wrap every handler; emit `Metrics.observe(...)`. |
| **Logging**            | Structured — `Logger.info(f"...")` with request id.|
| **Auth**               | Middleware — verify before routing.              |
| **Rate limiting**      | `RateLimiter` in [cookbook/resilience](/docs/cookbook/resilience).|

## See also

- **[`stdlib/net`](/docs/stdlib/net)** — `Request`, `Response`,
  `TcpStream`, `TlsAcceptor`, `TlsStream`.
- **[Nursery](/docs/cookbook/nursery)** — structured shutdown.
- **[Resilience](/docs/cookbook/resilience)** — retry, circuit
  breaker, rate limiter.
- **[TCP](/docs/cookbook/tcp)** — the underlying socket layer.
- **[Tagged Literals](/docs/language/tagged-literals)** — `json#`,
  `url#`, `d#`.
- **[HTTP client](/docs/cookbook/http-client)** — the counterpart.
- **[tutorials/http-service](/docs/tutorials/http-service)** —
  a step-by-step build of a real service.
