---
sidebar_position: 5
title: Build a verified HTTP/3 service
description: End-to-end walkthrough — TLS 1.3 cert setup, QUIC server bind, request handling, observability — on the pure-Verum warp stack.
---

# Build a verified HTTP/3 service

**Time: 75 minutes. Prerequisites: [Hello, World](/docs/getting-started/hello-world),
[HTTP/3 server recipe](/docs/cookbook/h3-server), [Refinement patterns](/docs/cookbook/refinements).**

We'll build `tickr` — a tiny event-stream service that accepts a
client subscription on `POST /subscribe`, then streams `Server-Sent
Events` over a single QUIC stream. Along the way we'll:

- Generate a self-signed TLS 1.3 certificate and configure the server
  trust chain.
- Bring up `H3Server` over `core.net.quic.api.QuicServer`.
- Use refinement types for the subscription topic (not strings).
- Stream responses through a `nursery`-bounded fanout.
- Inspect the QUIC + H3 stats Prometheus endpoint.

The whole stack is pure Verum — no rustls, no quiche. Every wire byte
goes through `core.net.tls13.handshake`, `core.net.quic.frame`, and
`core.net.h3.qpack`, all backed by V1–V10 verification theorems.

## 1. Scaffold

```bash
$ verum new tickr
$ cd tickr
```

`verum.toml`:

```toml
[cog]
name    = "tickr"
version = "0.1.0"
edition = "2026"
profile = "application"

[dependencies]
core = { path = "../verum/core" }
```

## 2. Self-signed certificate

Generate a TLS 1.3 cert + key pair signed with Ed25519 — the modern
default that warp's signature_algorithms list offers first:

```bash
$ verum cert gen \
    --algorithm ed25519 \
    --subject "CN=localhost" \
    --san "DNS:localhost,IP:127.0.0.1" \
    --validity 365d \
    --out tls/
```

This drops `tls/cert.pem` (single-cert chain) and `tls/key.pem`
(Ed25519 private key). For real deployments swap to a Let's Encrypt
ACME flow via `core.security.x509.acme`; for this tutorial the
self-signed pair is enough.

## 3. Domain types

Subscriptions are addressed by a topic name. Topics MUST be
lowercase ASCII slugs ≤ 64 chars — model that as a refinement type
so impossible strings literally don't compile:

```verum
mount core.*;

public type TopicName is Text where
    Text.len(self) >= 1
    && Text.len(self) <= 64
    && Text.all_chars(self, |c|
        (c >= 'a' && c <= 'z')
        || (c >= '0' && c <= '9')
        || c == '-'
        || c == '_');
```

The Z3 backend rejects any construction where the predicate fails;
unit tests don't need to validate the type's invariant — the type
system did.

## 4. Server scaffold

```verum
using [Nursery]

mount core.*;
mount core.net.quic.api.{QuicServerOptions};
mount core.net.h3.server.{H3Server, ServerOptions, H3ServerError};
mount core.net.h3.request.{H3Request, H3Response, H3Status};
mount core.security.x509.parse.{parse_cert_chain_pem};
mount core.security.x509.sign.{FileSigner};

pub async fn main() -> Result<(), H3ServerError> {
    // Load cert chain + signer.
    let chain_pem = fs.read_text("tls/cert.pem").await
        .map_err(|e| H3ServerError.Bind(f"read cert: {e}"))?;
    let chain = parse_cert_chain_pem(&chain_pem)?;
    let signer = FileSigner.from_pem_path("tls/key.pem").await?;

    // Compose options. Defaults are production-ready; override only
    // what we need.
    let mut opts = ServerOptions.from_cert(chain, Heap(signer));
    opts.alpn_prefs = [b"h3".to_list()];
    opts.idle_timeout = Duration.from_secs(120);
    opts.params.initial_max_streams_bidi = 1024_u64;

    // Bind + serve.
    let server = H3Server.bind(&f"[::]:8443", opts).await?;
    print(f"tickr listening on {server.local_addr()}");

    server.serve(handle).await
}
```

`H3Server.bind` opens the UDP socket, `H3Server.serve(handler)`
spawns one task per accepted stream into the implicit nursery.

## 5. Request handling

```verum
async fn handle(req: H3Request) -> H3Response {
    match (req.method(), req.path().as_str()) {
        (H3Method.Get, "/healthz") =>
            H3Response.ok().text(f"ok"),

        (H3Method.Get, "/metrics") =>
            H3Response.ok()
                .header(&f"content-type", &f"text/plain; version=0.0.4")
                .bytes(prometheus_expose()),

        (H3Method.Post, "/subscribe") =>
            handle_subscribe(req).await,

        _ =>
            H3Response.status(H3Status.NotFound).text(f"404"),
    }
}
```

## 6. Streaming subscribe

A successful `/subscribe` upgrades the stream to a long-lived
event source. The server emits `data: {...}\n\n` chunks until the
client closes its half:

```verum
async fn handle_subscribe(mut req: H3Request) -> H3Response {
    let body = req.body_bytes().await;
    let topic_text = match Text.from_utf8(body.as_slice()) {
        Ok(t) => t,
        Err(_) => return H3Response.status(H3Status.BadRequest).text(f"bad utf8"),
    };
    let topic: TopicName = match TopicName.from_text(topic_text) {
        Ok(t) => t,
        Err(_) => return H3Response.status(H3Status.BadRequest).text(f"bad topic"),
    };

    H3Response.ok()
        .header(&f"content-type", &f"text/event-stream")
        .header(&f"cache-control", &f"no-cache")
        .streaming(|mut writer| async move {
            let bus = subscribe(&topic).await;
            while let Some(event) = bus.next().await {
                let payload = f"data: {event.to_json()}\n\n";
                writer.write_all(payload.as_bytes()).await?;
            }
            writer.finish().await
        })
}
```

The `streaming` callback runs to completion or until the peer
resets the stream. `core.net.h3.server` automatically translates
QUIC `STOP_SENDING` from the client into a cancellation that
unwinds this `async fn` cleanly.

## 7. Backpressure

`writer` is bounded by the peer's flow-control window. If the
client is slow, `write_all` awaits `MAX_STREAM_DATA` — which is
exactly what we want: the server does not buffer indefinitely.

When the per-connection `initial_max_streams_uni` cap is hit, the
server's stream allocator returns `StreamError.StreamLimitReached`
and the handler can surface a 429 instead of blocking.

## 8. Observability

Per-connection stats:

```verum
let stats = server.stats();
let active = stats.active_connections;
let req_total = stats.requests_total;
let qpack_hit_rate = stats.qpack_static_hit_ratio();
```

Prometheus scrape endpoint:

```verum
pub fn prometheus_expose() -> List<Byte> {
    use core.net.h3.stats_prometheus;
    stats_prometheus.expose(&server)
}
```

Wire-level traces fan out through `core.tracing` — every QUIC packet
processed, every TLS handshake flight, every QPACK dynamic-table
insert is a span you can ship to Jaeger / OTEL without instrumenting
your handler code.

## 9. Test it

```bash
$ cargo run --bin tickr &
tickr listening on [::]:8443

# In another terminal — using curl with HTTP/3.
$ curl --http3-only -k https://localhost:8443/healthz
ok

$ curl --http3-only -k -X POST -d "weather" https://localhost:8443/subscribe
data: {"topic":"weather","value":12.5,"ts":1714000000}
data: {"topic":"weather","value":12.7,"ts":1714000005}
…
```

The `--http3-only` flag forces the QUIC + H3 path. With our pure-Verum
stack, every wire byte goes through code that has been byte-exact
KAT'd against RFC 9001 Appendix A — interop with OpenSSL's `s_client`,
quiche, msquic, and ngtcp2 holds.

## 10. What's verified, what isn't

The pieces with first-class theorem coverage:

| Theorem | What it proves |
|---------|----------------|
| V1 | `derive_secret(s, L1, c) ≠ derive_secret(s, L2, c)` for distinct labels |
| V2 | KeyUpdate generation counter is monotonic, peer gap ≤ 1 |
| V3 | `AckRanges.insert(pn)` preserves non-overlap + descending |
| V4 | PN space `next_pn > largest_acked` always holds |
| V5 | NewReno `cwnd ≥ 2 × MAX_DATAGRAM_SIZE` invariant |
| V6 | Active CID count ≤ `active_connection_id_limit` |
| V7 | Anti-amplification budget ≤ 3× received bytes |
| V8 | AEAD record `seq` strictly monotonic per direction |
| V9 | Transport params bounds (RFC 9000 §18.2) |
| V10 | X.509 chain validation: nonempty + signature-edge complete |

What you still own as the application author:

- Topic + payload schema validation (refinement types help — but you
  define them).
- Authorization (`@cap` on the handler signature).
- Storage semantics if you persist subscription state.

## See also

- [HTTP/3 server cookbook](/docs/cookbook/h3-server) — terser version
  of this example.
- [QUIC packets](/docs/stdlib/net/quic/packets) — the wire format
  every emitted byte conforms to.
- [TLS 1.3 handshake](/docs/stdlib/net/tls/handshake) — what runs on
  the first flight.
- [Verification → refinement reflection](/docs/verification/refinement-reflection)
  — how the theorems above are checked.
