---
sidebar_position: 1
title: core.net.h3 — HTTP/3 + QPACK
description: Pure-Verum HTTP/3 (RFC 9114) + QPACK (RFC 9204) + extensible priorities (RFC 9218) — client and server facades over the core.net.quic transport.
---

# `core.net.h3` — HTTP/3 + QPACK

A pure-Verum implementation of HTTP/3, QPACK header compression, and
the extensible-priorities scheme:

| Spec | Title | Scope |
|------|-------|-------|
| [RFC 9114](https://datatracker.ietf.org/doc/html/rfc9114) | HTTP/3 | Frame layer, SETTINGS, streams, requests, responses |
| [RFC 9204](https://datatracker.ietf.org/doc/html/rfc9204) | QPACK: Field Compression for HTTP/3 | Static + dynamic tables, encoder and decoder state |
| [RFC 9218](https://datatracker.ietf.org/doc/html/rfc9218) | Extensible Prioritization Scheme for HTTP | `priority` header / `PRIORITY_UPDATE` frame |
| [RFC 7541 App B](https://datatracker.ietf.org/doc/html/rfc7541) | Huffman table | Reused by QPACK string encoding |

`core.net.h3` sits on top of [`core.net.quic`](/docs/stdlib/net/quic/). The QUIC
layer provides the streams; HTTP/3 frames flow inside them. Header
compression (QPACK) uses a pair of reserved unidirectional streams
per direction, exactly as the RFC prescribes.

## Module map

| Concern | Module | Key types |
|---------|--------|-----------|
| Frame layer (DATA / HEADERS / SETTINGS / CANCEL_PUSH / …) | `core.net.h3.frame` | `H3Frame`, `H3FrameError` |
| Settings | `core.net.h3.settings` | `H3Settings`, `H3SettingsId` |
| Requests / responses | `core.net.h3.request` | `H3Request`, `H3Response`, `H3Method`, `H3Status` |
| Client facade | `core.net.h3.client` | `H3Client`, `ClientOptions`, `H3ClientError` |
| Server facade | `core.net.h3.server` | `H3Server`, `ServerOptions`, `H3Handler`, `H3ServerError` |
| Connection driver | `core.net.h3.connection` | `H3Connection`, `new_client`, `new_server`, `on_bidi_stream` |
| Priority (RFC 9218) | `core.net.h3.priority` | `Priority`, `Urgency`, `Incremental` |
| QPACK encoder | `core.net.h3.qpack.encoder` | `Encoder`, `EncoderInstruction` |
| QPACK decoder | `core.net.h3.qpack.decoder` | `Decoder`, `DecoderInstruction`, `HeaderField` |
| QPACK static table (99 entries) | `core.net.h3.qpack.static_table` | `STATIC_TABLE`, `lookup` |
| QPACK dynamic table | `core.net.h3.qpack.dynamic_table` | `DynamicTable`, capacity + eviction |
| Huffman (RFC 7541 App B) | `core.net.h3.qpack.huffman` | `encode`, `decode`, canonical table |
| Errors | `core.net.h3.error` | `H3Error`, `H3ErrorCode` |

## Client flow

```verum
mount core.net.h3.client.{H3Client, ClientOptions};
mount core.time.duration.{Duration};

async fn fetch_example() -> Result<(), H3ClientError> {
    let opts = ClientOptions.default()
        .with_alpn(b"h3")
        .with_idle_timeout(Duration.from_secs(30))
        .with_max_field_section_size(64 * 1024);

    let mut client = H3Client.connect(&"https://example.test/", opts).await?;
    let response = client.get(&"/api/users/42").await?;

    let status: H3Status = response.status();
    for header in response.headers().iter() {
        let _ = (header.name, header.value);
    }
    let body: List<Byte> = response.body();
    let _ = (status, body);
    Ok(())
}
```

`H3Client.connect` performs QUIC connect + TLS 1.3 handshake + ALPN
negotiation + H3 unistream setup (control, qpack encoder, qpack
decoder) before returning. By the time `.get(...)` / `.post(...)` is
called, the connection is in 1-RTT and HEADERS frames can be issued
immediately.

## Server flow

```verum
mount core.net.h3.server.{H3Server, ServerOptions, H3Handler};
mount core.net.h3.request.{H3Request, H3Response, H3Status, H3Method};

type MyHandler is { /* app state */ };

implement H3Handler for MyHandler {
    async fn handle(&mut self, req: H3Request) -> H3Response {
        match (req.method(), req.path().as_str()) {
            (H3Method.Get, "/health") =>
                H3Response.new(H3Status.Ok)
                    .with_header("content-type", "text/plain")
                    .with_body(b"ok".to_list()),

            _ => H3Response.new(H3Status.NotFound)
                    .with_body(b"".to_list()),
        }
    }
}

async fn serve() -> Result<(), H3ServerError> {
    let handler = MyHandler { /* ... */ };
    let opts = ServerOptions.default()
        .with_cert_pem(load_cert_pem())
        .with_key_pem(load_key_pem());
    let server = H3Server.bind(&"0.0.0.0:443".parse()?, opts).await?;
    server.serve(handler).await
}
```

The `H3Handler` protocol is `async fn(H3Request) -> H3Response`; the
server handles connection setup, stream multiplexing, and QPACK
state in the background.

## QPACK

QPACK is HPACK-for-HTTP/3 — header compression with the wrinkle that
encoder state updates flow on a unidirectional stream so that the
receiver can process header blocks out of order.

- **Static table** — 99 entries per RFC 9204 Appendix A. Constant
  lookups; always safe to reference by index.
- **Dynamic table** — bounded by `max_field_section_size` and
  `qpack_max_table_capacity` negotiated via SETTINGS. The decoder
  maintains "known-received" indices via the
  QPACK_DECODER stream; the encoder blocks on insertions whose
  acknowledgement hasn't been observed.
- **Huffman** — RFC 7541 Appendix B table, reused verbatim. String
  literals are encoded Huffman-compressed when that strictly
  decreases byte count.

### Encoder / decoder pair

```verum
mount core.net.h3.qpack.{encoder, decoder};
mount core.net.h3.qpack.encoder.{Encoder};
mount core.net.h3.qpack.decoder.{Decoder, HeaderField};

fn roundtrip(headers: &List<HeaderField>) -> Result<List<HeaderField>, QpackError> {
    let mut enc = Encoder.new(/* capacity */ 0);
    let wire = enc.encode_field_section(headers)?;

    let mut dec = Decoder.new();
    let parsed = dec.decode_field_section(wire.as_slice())?;
    Ok(parsed)
}
```

With dynamic table capacity 0 (the v0.1 default), the encoder runs in
"static + literal" mode — no inter-stream coordination needed. This
matches what every major HTTP/3 client negotiates today. Dynamic-table
mode lands in a v1.1 followup and requires wiring the encoder's
blocking/unblocking queue into the QUIC stream scheduler.

### Known-answer test coverage

| Test | File |
|------|------|
| Static table — 99 entries + out-of-range rejection | `vcs/specs/L2-standard/net/h3/qpack_static_table_coverage.vr` |
| Huffman round-trip (RFC 7541 §C.4 + 256-byte stress) | `vcs/specs/L2-standard/net/h3/qpack_huffman_roundtrip.vr` |
| Encoder/decoder round-trip (4 representation variants) | `vcs/specs/L2-standard/net/h3/qpack_encoder_decoder_roundtrip.vr` |

## Priorities

`core.net.h3.priority` parses the `priority` header (RFC 9218
§4) and the `PRIORITY_UPDATE` frame (§6). Priorities carry two
parameters:

- `u` — **urgency**, integer 0–7 (0 is highest), default 3.
- `i` — **incremental**, boolean, default `false`. When `true`, the
  server can interleave DATA chunks from multiple concurrent
  requests at the same urgency.

```verum
mount core.net.h3.priority.{Priority, Urgency};

let p = Priority.parse("u=1, i").unwrap_or(Priority.default());
let _ = (p.urgency(), p.incremental());
```

Priorities are hints — the server-side scheduler uses them to order
outbound DATA frames but is not obligated to obey (per §5).

## Refinement contracts

H3 invariants (the bulk of H3 is byte-level shuffling, but the QPACK
dynamic table carries one):

| Invariant | Module |
|-----------|--------|
| Dynamic table size ≤ negotiated capacity | `qpack.dynamic_table` |
| HEADERS frame Huffman tree well-formed (RFC 7541 Appendix B) | `qpack.huffman` |
| Control stream id < 4 (reserved) | `connection` |

## Status (2026-04)

Client + server facades are shipping; QPACK operates in
`max_table_capacity = 0` mode (the baseline every client negotiates).
The L2 typecheck suite exercises every frame variant; the QPACK test
suite is complete for the static + literal path.

## See also

- [`core.net.quic`](/docs/stdlib/net/quic/) — the transport HTTP/3 sits on.
- [`core.net.tls13`](/docs/stdlib/net/tls/) — TLS 1.3 handshake consumed by QUIC.
- [`core.net.weft`](/docs/stdlib/net/weft/overview) — middleware (circuit
  breakers, retries, rate limiters) sits above H3 on the server side.
