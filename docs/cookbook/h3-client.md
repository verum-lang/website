---
title: HTTP/3 client
description: Issue HTTP/3 requests with `core.net.h3.client.H3Client` on top of the pure-Verum QUIC stack.
---

# HTTP/3 client

`core.net.h3.client.H3Client` wraps QUIC + TLS 1.3 + QPACK into an
ergonomic request/response surface. Its `connect` drives the same
pipeline as [`core.net.quic.api.QuicClient`](/docs/cookbook/quic-client),
then wires the H3 connection (control stream + QPACK encoder/decoder
streams + SETTINGS negotiation) on top.

## Minimum GET

```verum
using [Nursery]

mount core.*;
mount core.net.h3.client.{H3Client, ClientOptions, H3ClientError};

pub async fn main() -> Result<(), H3ClientError> {
    let opts = ClientOptions.with_system_trust();
    let mut client = H3Client.connect(&f"https://example.com", opts).await?;

    let resp = client.get(&f"/").await?;
    print(f"status={resp.status()} body_len={resp.body().len()}");
    Ok(())
}
```

`connect` fails early with:

- `UrlParse` — malformed URL.
- `UnsupportedScheme` — anything other than `https://`.
- `Resolve` — DNS lookup failed.
- `Trust` — no usable trust store (empty + `verify_hostname = true`).
- `Handshake` — QUIC / TLS 1.3 handshake aborted.
- `Timeout` — exceeded `opts.connect_timeout` (default 10 s).

## Tuning options

```verum
let mut opts = ClientOptions.default();

// Offer both h3 and h3-29 for intermediate peers.
opts.alpn = [b"h3".to_list(), b"h3-29".to_list()];

// Cap inbound response headers at 32 KiB.
opts.max_field_section_size = 32_u64 * 1024_u64;

// Longer timeouts for latency-heavy regions.
opts.connect_timeout = Duration.from_secs(20);
opts.idle_timeout    = Duration.from_secs(120);
```

Defaults (from `ClientOptions.default`):

| Field | Default |
|-------|---------|
| `alpn` | `[b"h3"]` |
| `max_field_section_size` | `u64.MAX` (no cap) |
| `idle_timeout` | 30 s |
| `connect_timeout` | 10 s |
| `verify_hostname` | true |
| `trust` | empty (call `with_system_trust()` to populate) |

## POST with body

```verum
mount core.net.h3.request.{H3Method};

let resp = client.post(&f"/api/v1/upload",
                       &core.text.content_type.APPLICATION_JSON,
                       body_bytes.as_slice()).await?;
if resp.status() != 200_u16 {
    return Err(H3ClientError.H3Layer(H3Error.StreamError));
}
```

## Custom request builder

For full control over headers, use `H3Request.new` + `client.send`:

```verum
mount core.net.h3.request.{H3Request, H3Method};

let req = H3Request.new(H3Method.Post, &f"example.com", &f"/api/v2")
    .header(&f"content-type",   &f"application/json")
    .header(&f"authorization", &f"Bearer ...")
    .body(body_bytes);

let resp = client.send(&req).await?;
```

Headers are emitted as a QPACK field section — see
[QPACK](/docs/stdlib/net/http3/qpack). Common static-table hits
(`:method GET`, `:status 200`, `:scheme https`) compress to 1 byte
each.

## Response handling

`H3Response` fields:

- `status()` — `UInt16` HTTP status code.
- `headers()` — `&List<HeaderField>` in emission order.
- `body()` — fully-buffered `List<Byte>` of the response body.
- `trailers()` — trailing header section if the server emitted one.

## 0-RTT resumption

For repeat connections to the same origin:

```verum
// First connection — save the resumption ticket.
let (mut client, ticket) = H3Client.connect(&f"https://example.com", opts).await?;
let resp = client.get(&f"/").await?;
save_ticket(&ticket);

// Later process — resume with 0-RTT early data.
let ticket = load_ticket()?;
let mut client = H3Client.connect_resumed(&f"https://example.com", opts, &ticket).await?;
let resp = client.get(&f"/dashboard").await?;     // rides in 0-RTT
```

`connect_resumed` encodes the first request into the client's early
data flight. The server MAY or MAY NOT accept 0-RTT — if rejected, the
request is retried transparently after the full handshake.

Limits per RFC 8446 §4.2.10 are enforced via
`opts.max_field_section_size` and the ticket's `max_early_data_size`.

## Errors

```verum
public type H3ClientError is
    | UrlParse(UrlError)
    | UnsupportedScheme(Text)
    | Resolve(Text)
    | Trust(TrustError)
    | Transport(Text)
    | Handshake(Text)
    | H3Layer(H3Error)
    | Timeout
    | EarlyDataTooLarge(Int)
    | Closed;
```

`H3Layer(_)` wraps the RFC 9114 §8.1 error codes — see
[`h3_error_variants`](/docs/stdlib/net/http3/).

## Cancellation and shutdown

Every request runs inside the caller's nursery. Cancelling the outer
task cleanly closes all outstanding streams and the underlying QUIC
connection:

```verum
nursery.spawn(async {
    let _ = client.get(&f"/slow").await;
});
Delay(Duration.from_secs(2)).await;
nursery.cancel();   // in-flight request is aborted, QUIC closes
```

## See also

- [HTTP/3 frames](/docs/stdlib/net/http3/frames) — the wire layer
  `H3Client` emits.
- [QPACK](/docs/stdlib/net/http3/qpack) — how request headers compress.
- [`core.net.quic.api.QuicClient`](/docs/cookbook/quic-client) — the
  transport under the hood.
