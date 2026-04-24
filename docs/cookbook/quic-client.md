---
title: QUIC client
description: Dial a QUIC server with `core.net.quic.api.QuicClient`, open streams, and send datagrams.
---

# QUIC client

Warp's high-level QUIC client lives at `core.net.quic.api.QuicClient`.
It wraps the full TLS 1.3 handshake + packet-protection pipeline
behind an async `connect` that returns a ready-to-use handle.

## Minimum viable dial

```verum
using [Nursery]

mount core.*;
mount core.net.quic.api.{QuicClient, QuicClientOptions, QuicClientError};

pub async fn main() -> Result<(), QuicClientError> {
    // Default options with the system trust store + standard groups +
    // mandatory RFC 8446 §9.1 cipher suites.
    let opts = QuicClientOptions.with_system_trust();

    let mut client = QuicClient.connect(&f"example.com:443", opts).await?;
    print(f"Connected to {client.peer_addr()}");

    client.close(0_u64, &f"done").await?;
    Ok(())
}
```

The returned handle carries live 1-RTT keys; further calls use the
application keys set up during the handshake.

## Tuning options

```verum
let mut opts = QuicClientOptions.default();

// Only offer HTTP/3 for ALPN.
opts = opts.with_alpn([f"h3".as_bytes().to_list()]);

// Custom trust store — for pinned hosts or private CAs.
opts.trust = my_pinned_trust_store;

// Raise the initial per-connection flow-control window to 4 MiB.
opts.params.initial_max_data = 4_u64 * 1024_u64 * 1024_u64;

// Limit the handshake to 5 seconds.
opts.connect_timeout = Duration.from_secs(5);
```

All defaults tap sensible RFC 9000 §18.2 / RFC 8446 §9.1 floors:

| Field | Default |
|-------|---------|
| `alpn` | `[]` — server chooses |
| `groups` | `[X25519, Secp256r1]` |
| `suites` | `[AES_128_GCM_SHA256, CHACHA20_POLY1305_SHA256, AES_256_GCM_SHA384]` |
| `sig_schemes` | `SignatureScheme.default_offer_list()` (Ed25519-first) |
| `params.initial_max_data` | 1 MiB |
| `params.initial_max_streams_bidi` | 100 |
| `params.max_idle_timeout_ms` | 30 000 |
| `verify_hostname` | true |

## Opening streams

Bidirectional (request / response):

```verum
let mut stream = client.open_bidi_stream().await?;
stream.send.write_all(b"GET / HTTP/3\r\n\r\n").await?;
stream.send.close().await?;            // half-close our side

let mut buf: List<Byte> = [];
stream.recv.read_to_end(&mut buf).await?;
print(f"got {buf.len()} bytes");
```

Stream IDs are assigned per RFC 9000 §2.1:

- **Client bidi**: 0, 4, 8, … (low 2 bits = `00`)
- **Client uni**:  2, 6, 10, … (low 2 bits = `10`)
- **Server bidi**: 1, 5, 9, …
- **Server uni**:  3, 7, 11, …

`stream_id_allocation.vr` pins this exact pattern.

Unidirectional (send-only):

```verum
let mut uni = client.open_uni_stream().await?;
uni.send.write_all(&push_announcement_bytes).await?;
```

## Datagrams (RFC 9221)

For at-most-once best-effort delivery:

```verum
client.send_datagram(&encoded_frame).await?;
```

Requires both peers to have advertised `max_datagram_frame_size > 0`
in their transport parameters. Otherwise the call returns an error
without emitting bytes.

## Errors

```verum
public type QuicClientError is
    | Resolve(Text)       // DNS lookup failed
    | UdpBind(Text)       // couldn't bind a local socket
    | Handshake(Text)     // TLS or QUIC handshake failed
    | Timeout             // connect_timeout hit
    | StreamOpen(QuicStreamError)
    | Closed;
```

On `Timeout` or `Handshake`, the socket is torn down and any probe
state is cleaned up automatically (structured-concurrency rule —
`core.async.nursery` reaps everything spawned by `connect`).

## Observability

The client records every transport-level event into `core.net.quic.stats`:

```verum
let s = client.stats().snapshot();
print(f"rtt={s.smoothed_rtt_ms}ms, loss={s.packets_lost}, cwnd={s.cwnd}B");
```

Prometheus exporter is available via
`core.net.quic.stats_prometheus.expose` — expose per-connection
metrics or aggregate them at the listener level.

## See also

- [`core.net.quic`](/docs/stdlib/net/quic/) — module reference + V-theorem
  discharge matrix.
- [Packets](/docs/stdlib/net/quic/packets) — wire format each `open_bidi_stream`
  emits after negotiation.
- [`core.net.h3.client`](/docs/stdlib/net/http3/) — H3 request/response
  API built on top.
