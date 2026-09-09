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
    // `status`, `headers`, `body` and `trailers` are FIELDS of
    // `H3Response` (core/net/h3/request.vr:82), not accessor methods.
    print(f"status={resp.status} body_len={resp.body.len()}");
    Result.Ok(())
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
// `post(path, content_type, body)` — the content type is a plain
// `&Text` and the body a `List<Byte>`. There is no
// `core.text.content_type` module and no `APPLICATION_JSON` constant
// anywhere in `core/`; write the media type out.
let resp = client.post(&f"/api/v1/upload",
                       &f"application/json",
                       body_bytes).await?;
if resp.status != 200_u16 {
    return Result.Err(H3ClientError.H3Layer(H3Error.StreamError));
}
```

## Custom request builder

For full control over headers, use `H3Request.new` + `client.send`:

```verum
mount core.net.h3.request.{H3Request};

// The builders are `H3Request.get(authority, path)` and
// `H3Request.post(authority, path, body)` — there is no
// `H3Request.new`, no `.header(...)` (it is `.with_header`), and no
// `.body(...)`: the body is an argument to `post`.
let req = H3Request.post(client.authority(), Text.from("/api/v2"), body_bytes)
    .with_header(Text.from("content-type"),  Text.from("application/json"))
    .with_header(Text.from("authorization"), Text.from("Bearer ..."));

let resp = client.send(&req).await?;
```

Headers are emitted as a QPACK field section — see
[QPACK](/docs/stdlib/net/http3/qpack). Common static-table hits
(`:method GET`, `:status 200`, `:scheme https`) compress to 1 byte
each.

## Response handling

`H3Response` is a record (`core/net/h3/request.vr:82`) and these are
FIELDS, read without parentheses:

- `status` — `UInt16` HTTP status code.
- `headers` — `List<QpackHeaderField>` in emission order.
- `body` — fully-buffered `List<Byte>` of the response body.
- `trailers` — trailing header section, empty if the server sent none.

The only methods on it are the two constructors `H3Response.ok(body)` /
`H3Response.status(code)`, the chaining `with_header(name, value)`, and
`to_field_list()`.

## 0-RTT resumption

For repeat connections to the same origin:

:::caution The ticket half is not an H3 API
`connect` returns `Result<H3Client, H3ClientError>` — a client, not a
`(client, ticket)` pair — and there is no `save_ticket` / `load_ticket`
in `core/`. The session `connect_resumed` wants is a
`core.net.tls13.handshake.ClientSession`, produced and carried by the
TLS layer, and the early data is a `&[Byte]` you pass separately. The
signature is
`connect_resumed(url: &Text, opts: ClientOptions, session: ClientSession, early_data: &[Byte])`
(`core/net/h3/client.vr:266`). How a `ClientSession` is obtained and
persisted between processes is the TLS stack's story, not this page's,
and it is not written down anywhere yet.
:::

```verum
// SHAPE ONLY for the resumption half — see the caution above.
let mut client = H3Client.connect_resumed(
    &f"https://example.com", opts, session, early_data).await?;
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
nursery.cancel();   // available request is aborted, QUIC closes
```

## See also

- [HTTP/3 frames](/docs/stdlib/net/http3/frames) — the wire layer
  `H3Client` emits.
- [QPACK](/docs/stdlib/net/http3/qpack) — how request headers compress.
- [`core.net.quic.api.QuicClient`](/docs/cookbook/quic-client) — the
  transport under the hood.
