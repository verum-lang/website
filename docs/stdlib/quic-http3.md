---
title: QUIC and HTTP/3
description: RFC 9000 QUIC transport + RFC 9114 HTTP/3 + RFC 9204 QPACK
---

# `core.net.quic` / `core.net.http3`

**Layer 5 — QUIC transport (RFC 9000) + HTTP/3 (RFC 9114) + QPACK (RFC 9204)**

QUIC is the UDP-based, multiplexed, secure transport shipped as the
next-generation transport by browsers and CDNs. HTTP/3 maps HTTP
semantics onto QUIC streams; QPACK replaces HPACK with a
head-of-line-blocking-resistant design.

The Verum surface delegates all packet-processing to a runtime-level
implementation (typically Cloudflare quiche, Microsoft msquic, or
LiteSpeed lsquic) via the `verum.quic.*` / `verum.qpack.*` /
`verum.h3.*` intrinsic families. The API shape below is stable across
backend swaps.

## Module layout

```
core.net.quic
├── mod.vr          — QuicConfig builder + re-exports
├── error.vr        — QuicError / TransportErrorCode / ApplicationErrorCode
├── connection.vr   — Connection, QuicListener, ConnectionEvent
└── stream.vr       — QuicStream (bidirectional / unidirectional)

core.net.http3
├── mod.vr          — re-exports
├── error.vr        — Http3Error / Http3ErrorCode (§8.1 codes + QPACK codes)
├── frame.vr        — H3FrameType / H3Frame + QUIC varint codec
├── qpack.vr        — QpackEncoder / QpackDecoder (intrinsic-backed)
├── client.vr       — Http3Client high-level request API
└── server.vr       — Http3Server + Http3RequestHandle
```

## QuicConfig

```verum
let config = QuicConfig.client(&"example.com".into())
    .with_alpn(&["h3".into()])
    .with_initial_max_data(16 * 1024 * 1024)
    .with_initial_max_stream_data_bidi_local(1 * 1024 * 1024)
    .with_initial_max_streams_bidi(500)
    .with_max_idle_timeout(Duration.from_secs(30))
    .with_early_data(true)       // 0-RTT
    .with_datagrams(true);        // RFC 9221
```

| Field | Default | Purpose |
|-------|---------|---------|
| `initial_max_data` | 16 MiB | Connection-level flow-control window |
| `initial_max_stream_data_*` | 1 MiB | Per-stream flow-control window |
| `initial_max_streams_bidi` | 100 | Concurrent bidi streams from peer |
| `max_idle_timeout` | 30s | Disconnect after this long idle |
| `max_recv/send_udp_payload_size` | 1350 | PMTU-friendly default |
| `initial_congestion_window_packets` | 10 | CUBIC / NewReno start |
| `enable_early_data` | false | 0-RTT resume |
| `enable_datagrams` | false | RFC 9221 unreliable datagrams |
| `enable_hystart` | true | HyStart++ RFC 9406 slow-start |

## QUIC client / server

```verum
// Client
let config = QuicConfig.client(&host.into()).with_alpn(&["h3".into()]);
let conn = Connection.connect(&peer_addr, config).await?;
let stream = conn.open_bidi_stream().await?;
stream.write_all(&request_bytes).await?;
let n = stream.read(&mut buf).await?;
stream.finish().await?;

// Server
let listener = QuicListener.bind(&local_addr, server_config).await?;
let (conn, peer) = listener.accept().await?;
loop {
    match conn.next_event().await? {
        ConnectionEvent.IncomingStream(s) => { spawn_detached(async move { serve(s).await }); }
        ConnectionEvent.DatagramReceived(d) => handle_datagram(d),
        ConnectionEvent.HandshakeCompleted => continue,
        ConnectionEvent.PeerClosed { .. } | ConnectionEvent.Closed => break,
    }
}
```

## HTTP/3 client

```verum
let client = Http3Client.connect(&peer, config).await?;
let response = client.request(
    Method.Get,
    &"/api/orders".into(),
    &headers,
    b"",
).await?;
println(&f"status: {response.status.code()}");
println(&response.body.len().to_string());
```

## HTTP/3 server

```verum
let server = Http3Server.bind(&local, config).await?;
loop {
    let (request, handle) = server.accept().await?;
    spawn_detached(async move {
        let resp_headers: List<HeaderField> = List.new();
        handle.send_response_headers(StatusCode.new(200), &resp_headers).await?;
        handle.write_body(b"{\"ok\":true}").await?;
        handle.finish().await?;
    });
}
```

## QPACK

```verum
let encoder = QpackEncoder.new(
    4096 /* max_table_capacity */,
    100  /* max_blocked_streams */,
);

// On each request
let mut block = List.new();
let mut encoder_updates = List.new();
encoder.encode(stream_id, &headers, &mut block, &mut encoder_updates)?;
// Send `encoder_updates` on the encoder-stream, `block` on the
// request stream.

let decoder = QpackDecoder.new(4096, 100);
match decoder.decode(stream_id, &block)? {
    DecodeOutput.Ready(headers) => dispatch(headers),
    DecodeOutput.Blocked => park_until_encoder_stream_arrives(),
}
```

## Varint codec (RFC 9000 §16)

QUIC / HTTP/3 use a variable-length integer encoding — 1 / 2 / 4 /
8 bytes picked by the top two bits of the first byte. Exposed via
`core.net.http3.frame.{write_varint, read_varint}`.

| First-byte prefix | Bytes | Max value |
|-------------------|-------|-----------|
| `0b00` | 1 | 63 |
| `0b01` | 2 | 16383 |
| `0b10` | 4 | 2^30 - 1 |
| `0b11` | 8 | 2^62 - 1 |

## Error model

- `QuicError` — transport-level: `ConnectionRefused`, `HandshakeFailed`,
  `TransportError { code, frame_type, reason }` per §20.1,
  `ApplicationError { code, reason }`, `StreamReset`, `IdleTimeout`,
  `StatelessReset`, `VersionMismatch`, `InvalidTransportParameter`.
- `Http3Error` — HTTP/3-level: `ConnectionError`, `StreamError`,
  `FrameError`, `QpackError`, `NeedMore`. 21 RFC 9114 §8.1 error codes
  plus the 3 RFC 9204 §6 QPACK codes.

## Deferred

- The @intrinsic bindings (`verum.quic.*`, `verum.qpack.*`,
  `verum.h3.*`) are declared but the runtime-level FFI to quiche/
  msquic/lsquic is scheduled for a separate PR.
- Server push + push-promise flow for HTTP/3 is tracked under §7.
- Connection migration across network paths (§9) is backend-implementation
  dependent.
