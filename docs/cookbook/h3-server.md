---
title: HTTP/3 server
description: Serve HTTP/3 requests with `core.net.h3.server.H3Server` on top of QuicServer.
---

# HTTP/3 server

`core.net.h3.server.H3Server` is the request handler above the QUIC
transport. Each accepted QUIC connection runs an `H3Connection` that
dispatches incoming request streams to user-supplied handlers.

## Minimum viable server

```verum
using [Nursery]

mount core.*;
mount core.net.h3.server.{H3Server, ServerOptions};
mount core.net.h3.request.{H3Request, H3Response, H3Status};

pub async fn main() -> Result<(), core.net.h3.server.H3ServerError> {
    let cert_chain = load_der_chain("/etc/ssl/certs/server.pem");
    let signer     = load_signer("/etc/ssl/private/server.key");

    let opts = ServerOptions.from_cert(cert_chain, signer);

    let server = H3Server.bind(&f"[::]:443", opts).await?;
    print(f"HTTPS listening on {server.local_addr()}");

    server.serve(|req: H3Request| async move {
        match req.path().as_str() {
            "/health" =>
                H3Response.ok().text(f"ok"),
            "/metrics" =>
                H3Response.ok().bytes(prometheus_expose()),
            _ =>
                H3Response.status(H3Status.NotFound).text(f"404"),
        }
    }).await?;
    Ok(())
}
```

`H3Server.serve(handler)` spawns one task per accepted stream into
the caller's nursery. The handler receives `H3Request`, returns
`H3Response`; the server serialises the response through QPACK + the
H3 frame layer.

## Router pattern

For non-trivial routing, compose on top of `core.net.weft.router`:

```verum
use core.net.weft.router.{Router};

let router = Router.new()
    .get(f"/health",   |_| async move { H3Response.ok().text(f"ok") })
    .get(f"/users/:id", handle_user_get)
    .post(f"/users",    handle_user_post)
    .middleware(weft::cors::permissive())
    .middleware(weft::rate_limit::token_bucket(100, Duration.from_secs(1)));

server.serve(router.handler()).await?;
```

## Streaming responses

For chunked bodies — server-sent events, large downloads — use the
async writer form:

```verum
server.serve(|req: H3Request| async move {
    if req.path() == f"/stream" {
        H3Response.ok()
            .header(&f"content-type", &f"text/event-stream")
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
        H3Response.status(H3Status.NotFound)
    }
}).await?;
```

## Server push (RFC 9114 §4.6)

The push_emitter manages the client's `MAX_PUSH_ID` budget + tracks
outstanding promises:

```verum
use core.net.h3.push.{PushEmitter};

server.serve(|mut req: H3Request| async move {
    if req.path() == f"/" {
        // Promise a related asset the client is likely to fetch.
        if let Some(push_id) = req.try_push(&f"/style.css").await {
            req.emit_pushed(push_id,
                H3Response.ok()
                    .header(&f"content-type", &f"text/css")
                    .text(f"body { font-family: sans-serif; }")).await?;
        }
        H3Response.ok().html(&load_index_html())
    } else {
        // Serve directly.
        H3Response.ok().bytes(fs.read("/var/www" + req.path()).await?)
    }
}).await?;
```

If the client sent `MAX_PUSH_ID = 0` (push disabled), `try_push`
returns `None` and the server proceeds without pushing.

## Graceful shutdown

```verum
nursery.spawn(async {
    server.serve(handler).await.unwrap();
});

// Later — graceful shutdown.
shutdown_signal.await;
server.shutdown(Duration.from_secs(30)).await?;   // GOAWAY + drain
```

`shutdown` emits `GOAWAY` on every live connection, stops accepting
new requests, and waits up to the deadline for in-flight requests
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
