---
sidebar_position: 5
title: Build a verified HTTP/3 service
description: End-to-end walkthrough — TLS 1.3 cert setup, QUIC server bind, request handling, observability — on the pure-Verum warp stack.
---

# Build a verified HTTP/3 service

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
$ mkdir -p tls
$ openssl req -x509 -newkey ed25519 -noenc \
    -keyout tls/key.pem -out tls/cert.pem \
    -days 365 -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

This drops `tls/cert.pem` (single-cert chain) and `tls/key.pem`
(Ed25519 private key). Verify with
`openssl x509 -in tls/cert.pem -noout -text` — the signature algorithm
reads `ED25519` and both SANs are listed. For real deployments swap to
a Let's Encrypt ACME flow via `core.security.x509.acme`; for this
tutorial the self-signed pair is enough.

:::note Why openssl and not a verum subcommand
This step read `verum cert gen --algorithm ed25519 …`. The toolchain
has no certificate-generation command — `verum --help` lists
`check-proof`, `elaborate-proof` and `cert-replay`, all of which are
about SMT and kernel proof certificates, not X.509. The `openssl`
invocation above was run on 2026-09-07 and produces exactly the two
files the rest of the tutorial expects.
:::

## 3. Domain types

Subscriptions are addressed by a topic name. Topics MUST be
lowercase ASCII slugs ≤ 64 chars — model that as a refinement type
so impossible strings literally don't compile:

```verum
mount core.*;

public type TopicName is Text where
    Text.len(self) >= 1
    && Text.len(self) <= 64
    && self.chars().all(|c|
        (c >= 'a' && c <= 'z')
        || (c >= '0' && c <= '9')
        || c == '-'
        || c == '_');
```

The SMT backend rejects any construction where the predicate fails;
unit tests don't need to validate the type's invariant — the type
system did.

## 4. Server scaffold

:::danger The TLS half of this tutorial cannot be written today
Measured 2026-09-08 against `core/`, the same finding as
[cookbook/quic-server](/docs/cookbook/quic-server):

| written here | reality |
|---|---|
| `core.security.x509.parse.{parse_cert_chain_pem}` | no `parse.vr` module, no such function |
| `core.security.x509.sign.{FileSigner}` | no `sign.vr` module, no such type |
| `ServerOptions.from_cert(chain, Heap(signer))` | **exists** — `core/net/h3/server.vr:85` |

PEM parsing does exist, under a different name:
`Certificate.from_pem_chain(&Text) -> Result<List<Certificate>, LegacyTlsError>`
(`core/security/x509/credential.vr:81`), with `TrustStore.from_pem_bundle`
for a trust bundle.

The signer has no substitute. `from_cert` wants a `Heap<dyn CertSigner>`;
`CertSigner` is declared at
`core/net/tls13/handshake/server_sm.vr:83` with two methods —

    fn sign(&self, scheme: SignatureScheme, signed_input: &[Byte])
        -> Result<List<Byte>, TlsError>;
    fn scheme(&self) -> SignatureScheme;

— and **nothing in `core/` implements it**. A reader who supplies their
own implementation of those two methods can use everything else on this
page; a reader expecting to load a key from a file cannot.
:::

```verum
using [Nursery]

mount core.*;
mount core.net.quic.api.{QuicServerOptions};
mount core.net.h3.server.{H3Server, ServerOptions, H3ServerError};
mount core.net.h3.request.{H3Request, H3Response};
// DOES NOT COMPILE. Measured against `core/`: there is no `parse.vr`
// and no `sign.vr` under `core.security.x509`, no `parse_cert_chain_pem`
// and no `FileSigner` anywhere. See the note after this listing.
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
            H3Response.ok(f"ok".as_bytes().to_list()),

        (H3Method.Get, "/metrics") =>
            H3Response.ok(prometheus_expose())
                .with_header(f"content-type", f"text/plain; version=0.0.4"),

        (H3Method.Post, "/subscribe") =>
            handle_subscribe(req).await,

        _ =>
            H3Response.status(404_u16),
    }
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
```

| | |
|---|---|
| `H3Response.ok(body)` |  |
| `H3Response.status(404 as UInt16).with_header("x-k", "v")` |  |

The examples below are left in their original form rather than
rewritten: the shape they show — a body-carrying `ok` and a builder
chain — is the intended API, and a mechanical substitution would make
them compile while teaching a design that is not settled.
:::

## 6. Streaming subscribe

:::caution Not shipped — `H3Response` has no `.streaming(...)`
Measured against `core/`, the same finding as the warning in §5:
`H3Response` carries four methods — `ok(body)`, `status(code)`,
`with_header(name, value)` and `to_field_list()`. A body is a
`List<Byte>` handed to `ok` up front, so there is no writer to hand a
closure to, and no cancellation to translate `STOP_SENDING` into.

The block below is the shape such a surface WOULD take. It is here
because the design question — where the writer comes from and who owns
it — is the interesting part of the tutorial; it does not compile.
:::

A successful `/subscribe` upgrades the stream to a long-lived
event source. The server emits `data: {...}\n\n` chunks until the
client closes its half:

```verum
async fn handle_subscribe(mut req: H3Request) -> H3Response {
    let body = &req.body;          // a `List<Byte>` field, not a method
    let topic_text = match Text.from_utf8(body.as_slice()) {
        Ok(t) => t,
        Err(_) => return H3Response.status(400_u16),
    };
    let topic: TopicName = match TopicName.from_text(topic_text) {
        Ok(t) => t,
        Err(_) => return H3Response.status(400_u16),
    };

    // NOT SHIPPED — see the caution above. `H3Response` carries no
    // `.streaming(…)`: a body is a `List<Byte>` passed to `ok` up
    // front. This block is the shape such a surface would take.
    H3Response.ok()
        .with_header(f"content-type", f"text/event-stream")
        .with_header(f"cache-control", f"no-cache")
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

Such a `streaming` callback WOULD run to completion or until the peer
reset the stream, and `core.net.h3.server` WOULD translate the client's
QUIC `STOP_SENDING` into a cancellation that unwound this `async fn`
cleanly. Neither happens today; the tense is deliberate.

## 7. Backpressure

`writer` is bounded by the peer's flow-control window. If the
client is slow, `write_all` awaits `MAX_STREAM_DATA` — which is
exactly what we want: the server does not buffer indefinitely.

When the per-connection `initial_max_streams_uni` cap is hit, the
server's stream allocator returns `StreamError.StreamLimitReached`
and the handler can surface a 429 instead of blocking.

## 8. Observability

:::caution No per-connection stats on the server
`H3Server` has no `stats()`, and there is no stats record anywhere under
`core/net/h3` — measured: the string `Stats` does not occur in the
module. `active_connections`, `requests_total` and
`qpack_static_hit_ratio` were invented with it. What `H3Server` carries
is `ServerOptions` (`from_cert`, `with_alpn`, `with_idle_timeout`) and
the serve loop; counting is weft's registry, below.
:::

Prometheus scrape endpoint:

There is no `core.net.h3.stats_prometheus` — HTTP/3 ships no metrics
module of its own. The Prometheus surface is weft's registry, and a
`MetricsLayer` is what feeds it:

```verum
mount core.net.weft.metrics.{WeftMetricsRegistry, MetricsLayer};

fn prometheus_expose(registry: &WeftMetricsRegistry) -> Text {
    registry.render_prometheus()
}
```

`WeftMetricsRegistry` also gives you `counter(name)`, `histogram(name)`
and their `_snapshot` readers directly, for anything the layer does not
record for you.

Wire-level traces fan out through `core.tracing` — every QUIC packet
processed, every TLS handshake flight, every QPACK dynamic-table
insert is a span you can ship to Jaeger / OTEL without instrumenting
your handler code.

## 9. Test it

```bash
$ verum run src/main.vr &
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
