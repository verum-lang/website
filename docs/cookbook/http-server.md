---
title: HTTP server
description: A minimal typed HTTP server with context-based DI.
---

# HTTP server

```verum
async fn serve() using [IO, Database, Logger] {
    let listener = TcpListener::bind("0.0.0.0:8080").await?;
    Logger.info(&"listening on :8080");

    loop {
        let (stream, peer) = listener.accept_async().await?;
        spawn async move {
            handle(stream, peer).await.unwrap_or_else(|e| {
                Logger.error(&f"connection error: {e}");
            });
        };
    }
}

async fn handle(mut stream: TcpStream, peer: SocketAddr) -> Result<(), Error>
    using [Database, Logger]
{
    let req = read_request(&mut stream).await?;
    Logger.info(&f"{peer} {req.method:?} {req.uri}");

    let resp = route(req).await?;
    write_response(&mut stream, &resp).await?;
    Result.Ok(())
}

async fn route(req: Request) -> Result<Response, Error> using [Database] {
    match (req.method, req.uri.as_str()) {
        (Method.Get, "/health") => Result.Ok(Response::new(StatusCode::ok())
            .with_body(b"OK\n".to_vec())),

        (Method.Get, path) if path.starts_with("/users/") => {
            let id: Int = path.strip_prefix("/users/").unwrap().parse()?;
            match Database.find_user(id).await? {
                Maybe.Some(u) => {
                    let body = json#"""{"id": ${u.id}, "name": "${u.name}"}""".to_bytes();
                    Result.Ok(Response::new(StatusCode::ok()).with_body(body))
                }
                Maybe.None => Result.Ok(Response::new(StatusCode::not_found())),
            }
        }

        _ => Result.Ok(Response::new(StatusCode::not_found())),
    }
}
```

### What's going on

- **`using [IO, Database, Logger]`** makes every dependency explicit
  in the signature. Swap `Database` in tests without mocking.
- **Structured concurrency** via `spawn` inside the loop — every
  connection is its own task.
- **Context propagation**: the spawned task inherits `Database` and
  `Logger` automatically; no extra passing.

### Tests

```verum
@test
async fn test_health_endpoint() using [IO] {
    provide Database = MockDatabase::empty();
    provide Logger = NullLogger::new();

    let req = Request::new(Method.Get, "/health");
    let resp = route(req).await.unwrap();

    assert_eq(resp.status.code(), 200);
}
```

### Going further

- Use the `http` cog for a full handler framework (routing, middleware, TLS).
- Wrap with a `Layer` to wire Database / Logger / Metrics once at `main`.

### See also

- **[net → HTTP](/docs/stdlib/net#http)** — `Request`, `Response`, `StatusCode`.
- **[async → nursery](/docs/stdlib/async#nursery--structured-concurrency)** — structured shutdown.
- **[context → layer](/docs/stdlib/context)** — wiring many contexts at once.
