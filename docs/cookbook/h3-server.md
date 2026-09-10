---
title: HTTP/3 server
description: Serve HTTP/3 requests with `core.net.h3.server.H3Server` on top of QuicServer.
---

# HTTP/3 server

:::caution `using [Nursery]` does not compile

Every listing on this page opens with `using [Nursery]`, and that line
does not work today. Measured:

```
error<E605>: undefined context: Nursery
```

`Nursery` is declared as a **type** — `public type Nursery is { … }` in
`core/async/nursery.vr` — and `using [...]` takes a **context**, which
the grammar spells `public context Name { … }`. `core/context/` declares
five of those (`Random`, `Logger`, `Database`, `Auth`, `Config`);
`Nursery` is not among them.

Mounting the type is not the fix. It quiets the checker and leaves the
program wrong: with `mount core.async.nursery.{Nursery};` added, the
listing type-checks, and running it warns

```
WARN Context 'Nursery' in function 'main' has no matching context
     declaration
```

before hanging. The loud `E605` is the honest answer, so the listings
are left as they are until structured concurrency has a real context to
name.

Below the `using` line the QUIC surface has its own gap: `QuicConnection`
is backed entirely by `@intrinsic("verum.quic.…")`, and all seventeen of
those keys sit in the frozen unimplemented set, so a dial would stop
there with a panic naming the key — the form measured on sibling
families, for example
[`pq`](/docs/stdlib/security/pq). Read rather than run here: the
`using` line stops the listing before the dial is reached.

This note stops being true when `Nursery` becomes a context, or when the
listings stop claiming one.

:::


`core.net.h3.server.H3Server` is the request handler above the QUIC
transport. Each accepted QUIC connection runs an `H3Connection` that
dispatches incoming request streams to user-supplied handlers.

## Minimum viable server

:::caution `serve` is the HANDLER's method, not the server's
`H3Server` declares `bind`, `run` and `run_with` (`core/net/h3/server.vr:188,
205, 223`) — no `serve`. The name exists one type over: `H3Handler` is a
protocol whose single method is `async fn serve(&self, req: H3Request) ->
H3Response`, which is why `server.serve(...)` reads correctly and is not.

The two forms differ in more than the name. `run<F>` is bounded
`where F: fn(H3Request) -> H3Response` — SYNCHRONOUS — so an `async move`
closure does not satisfy it as written; `run_with(Heap<dyn H3Handler>)`
is the asynchronous form, and the protocol's own method is the `async
fn serve` above. The blocks below use the closure spelling for
readability; an async body needs `run_with` and a handler object.
:::

```verum
using [Nursery]

mount core.*;
mount core.net.h3.server.{H3Server, ServerOptions};
mount core.net.h3.request.{H3Request, H3Response};

pub async fn main() -> Result<(), core.net.h3.server.H3ServerError> {
    let cert_chain = load_der_chain("/etc/ssl/certs/server.pem");
    let signer     = load_signer("/etc/ssl/private/server.key");
    // ^ YOURS TO WRITE. Neither helper exists in `core/`; the standard
    //   library ships no certificate loader. Read the file with
    //   `core.io.file` and build the signer from the bytes.

    let opts = ServerOptions.from_cert(cert_chain, signer);

    let server = H3Server.bind(&f"[::]:443", opts).await?;
    // `local_addr` is a FIELD of `H3Server` (server.vr:138), not an
    // accessor — no parentheses. `QuicServer` next door DOES have a
    // `local_addr()` method, which is why the parenthesised form
    // reads correctly and is not.
    print(f"HTTPS listening on {server.local_addr}");

    server.run(|req: H3Request| async move {
        match req.path().as_str() {
            "/health" =>
                H3Response.ok(f"ok".as_bytes().to_list()),
            "/metrics" =>
                H3Response.ok(prometheus_expose()),
            _ =>
                H3Response.status(404_u16),
        }
    }).await?;
    Ok(())
}
```

:::warning `H3Response.ok()` takes the body; `.text` / `.bytes` / `.html` do not exist
Measured 2026-09-03 against `core/net/h3/request.vr:138`. The whole
surface is four methods:

```verum
H3Response.ok(body: List<Byte>) -> H3Response
H3Response.status(code: UInt16) -> H3Response
H3Response.with_header(name: Text, value: Text) -> H3Response   // chainable
H3Response.to_field_list(&self) -> List<QpackHeaderField>
```

So `H3Response.ok()` with no argument does not compile, and the
`.text(…)` / `.bytes(…)` / `.html(…)` builders these examples chain
onto it are not defined — `no method named \`text\` found for type
\`H3Response\``. The spelling that does compile today:

```verum
let body: List<Byte> = "ok".as_bytes().to_list();
H3Response.ok(body);
H3Response.status(404 as UInt16).with_header("x-k", "v");
```

The examples below are left in their original form rather than
rewritten: the shape they show — a body-carrying `ok` and a builder
chain — is the intended API, and a mechanical substitution would make
them compile while teaching a design that is not settled.
:::

`H3Server.run(handler)` spawns one task per accepted stream into
the caller's nursery. The handler receives `H3Request`, returns
`H3Response`; the server serialises the response through QPACK + the
H3 frame layer.

## Router pattern

For non-trivial routing, compose on top of `core.net.weft.router`:

```verum
mount core.net.weft.router.{Router};

let router = Router.new()
    .get(f"/health",    handle_health)
    .get(f"/users/:id", handle_user_get)
    .post(f"/users",    handle_user_post)
    .fallback(handle_404);

server.run(|req| router.dispatch(req)).await?;
```

:::caution No middleware layer, and no CORS or rate-limit module

`Router` is real and rich — `new` / `get` / `post` / `put` / `patch` /
`delete` / `route` / `nest` / `fallback` / `dispatch` / `match_request`
/ `handle`. What it does not have is `middleware`, and there is no
`weft.cors` and no `weft.rate_limit` module in `core/net/weft` for one
to take. `permissive()` and `token_bucket(...)` do not exist anywhere.

`router.handler()` is also absent — `dispatch` is the entry point, and
`nest` plus `fallback` are how composition is expressed today. Wrap
cross-cutting concerns in your own handler, or in a `nest`ed sub-router.

`H3Response` is `ok` / `status` / `with_header` / `to_field_list`;
there is no `.text(...)` body builder, so a handler assembles the body
itself.

:::

## Streaming responses

:::warning Every builder below is one of the four that do not exist

Same measurement as the warning under **Minimum viable
server** above, re-checked 2026-09-08:
`H3Response` has `ok(body)`, `status(code)`, `with_header(name, value)`
and `to_field_list()`. The examples from here to the end of the page
chain `.streaming(…)`, `.html(…)`, `.bytes(…)`, `.text(…)` and
`.header(…)` — none of which is declared on `H3Response`.

`.header` is the sharpest of them: it IS real, on `Request` and
`Response` in `core/net/http.vr`, just not on this type. A name existing
somewhere is not the same as existing here, which is why the page-level
warning is repeated rather than assumed to carry this far down.

These sections describe an interface the library does not have yet; read
them as intent, not as instructions.

:::

For chunked bodies — server-sent events, large downloads — use the
async writer form:

```verum
// INTENT, not instructions — `.header` and `.streaming` are not declared
// on `H3Response`; see the warning above. What compiles today is
// `H3Response.ok(body)` / `.status(code)` / `.with_header(n, v)`.
server.run(|req: H3Request| async move {
    if req.path() == f"/stream" {
        // NOT SHIPPED. `H3Response` has four methods — `ok`, `status`,
        // `with_header`, `to_field_list` — and no `.streaming(…)`. A
        // response body is a `List<Byte>` handed to `ok` up front, so
        // there is no writer to hand a closure. The block below is the
        // shape a streaming surface WOULD take; it does not compile.
        H3Response.ok()
            .with_header(f"content-type", f"text/event-stream")
            .streaming(|mut writer| async move {
                let mut i: Int = 0;
                while i < 100 {
                    writer.write_all(f"data: tick {i}\n\n".as_bytes()).await?;
                    Delay(Duration.from_secs(1)).await;
                    i = i + 1;
                }
                writer.finish().await
            })
    } else {
        H3Response.status(404_u16)
    }
}).await?;
```

## Server push (RFC 9114 §4.6)

The push_emitter manages the client's `MAX_PUSH_ID` budget + tracks
outstanding promises:

```verum
// INTENT, not instructions — the `req.try_push` / `req.emit_pushed`
// pair below does not exist, and neither do `.header` / `.text` /
// `.html` / `.bytes` on `H3Response`. The real push surface is named in
// the comment inside.
mount core.net.h3.push.{PushEmitter};

server.run(|mut req: H3Request| async move {
    if req.path() == f"/" {
        // Promise a related asset the client is likely to fetch.
        // `req.try_push` / `req.emit_pushed` do not exist. Server push
        // goes through `core.net.h3.push.PushEmitter` — `reserve`,
        // `grant`, `is_cancelled`, `mark_cancelled`,
        // `mark_client_goneaway` — and `reserve(encoded_headers)`
        // answers `Result<PushReservation, PushError>`. The headers go
        // in ENCODED, so you build the field list first.
        if let Some(push_id) = req.try_push(&f"/style.css").await {
            req.emit_pushed(push_id,
                H3Response.ok(f"body {{ font-family: sans-serif; }}"
                                  .as_bytes().to_list())
                    .with_header(f"content-type", f"text/css")).await?;
        }
        H3Response.ok(load_index_html().as_bytes().to_list())
    } else {
        // Serve directly.
        H3Response.ok(fs.read("/var/www" + req.path()).await?)
    }
}).await?;
```

If the client sent `MAX_PUSH_ID = 0` (push disabled), `try_push`
returns `None` and the server proceeds without pushing.

## Graceful shutdown

```verum
nursery.spawn(async {
    server.run(handler).await.unwrap();
});

// Later — graceful shutdown.
shutdown_signal.await;
server.shutdown(Duration.from_secs(30)).await?;   // GOAWAY + drain
```

`shutdown` emits `GOAWAY` on every live connection, stops accepting
new requests, and waits up to the deadline for available requests
to complete before closing.

## Observability

```verum
let stats = server.stats();
print(f"active_conns={stats.active_connections} requests_handled={stats.requests_total}");
```

Full Prometheus exposition via `core.net.h3.stats_prometheus.expose`
— aggregates QUIC transport stats + H3 request counters + QPACK
table hit/miss rates.

## See also

- [HTTP/3 frames](/docs/stdlib/net/http3/frames) — what the server emits.
- [Server push](/docs/stdlib/net/http3/server-push) — push_id lifecycle.
- [QUIC server](/docs/cookbook/quic-server) — the transport layer
  below.
- [`core.net.weft`](/docs/stdlib/net/weft/overview) — middleware
  stack.
