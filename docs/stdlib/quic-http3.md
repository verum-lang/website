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

## Pure-Verum QUIC sub-modules (warp stack)

The `core.net.quic.*` tree also ships a pure-Verum QUIC v1 stack
(progress tracked as warp). Beyond the packet/frame codec and
crypto layer, the following user-facing pieces landed:

### `stateless_reset` — RFC 9000 §10.3

```verum
let key   = StatelessResetKey.generate();            // 32-byte secret
let token = key.token_for_cid(&issued_cid[..]);      // HMAC-SHA256(key, cid)[..16]

// Server: emit when a datagram doesn't match any connection.
let packet = build_stateless_reset(&token, min_size);

// Client: scan incoming datagrams for a known reset token.
let mut known = ResetTokenSet.new();
known.insert(token);
if let Some(i) = try_match_stateless_reset(datagram, &known) {
    tear_down_connection(i);
}
```

Short-header packet with bit7=0 / bit6=1 + random bytes +
trailing 16-byte token. Constant-time token comparison via
diff-accumulator.

### `cid_pool` — RFC 9000 §5.1

```verum
let mut pool = CidPool.new(active_connection_id_limit);
pool.seed_initial(first_cid, first_token);

let retired = pool.on_new_connection_id(seq, retire_prior_to, cid, token)?;
// → caller emits RETIRE_CONNECTION_ID for every seq in `retired`.

pool.on_retire_connection_id(seq)?;

let cid = pool.pick_next_for_migration();    // round-robin per path
```

Typed error surface (`LimitExceeded`, `DuplicateSequence`,
`UnknownSequence`, `RetirePriorRegression`) so invalid peer
frames get rejected with protocol-grade error codes.
Companion `CidIssuer` tracks the server's outgoing sequence +
retire-prior-to watermark.

### `key_update` — RFC 9001 §6 + §6.6

```verum
let mut sm = KeyUpdateSm.new(
    AeadKind.Aes128Gcm,
    rx_traffic_secret, tx_traffic_secret,
)?;

// TX:
sm.note_outbound_encrypted()?;
if sm.should_initiate_update() && sm.can_initiate() {
    sm.initiate_update()?;
}

// RX:
match sm.on_inbound_phase(first_byte_phase) {
    InboundPhaseAction.NoChange              => decrypt with current keys,
    InboundPhaseAction.TryDecryptWithNextKeys => {
        // aead.open with next_rx_keys; on success:
        sm.commit_inbound_phase_flip()?;
    },
    InboundPhaseAction.MustDiscardKeys        => abort connection,
}
```

Enforces §6.1 (ACK required before re-initiation), §6.2 (two-
step receiver commit), §6.6 per-cipher confidentiality + integrity
limits (2^23 encrypts for AES-GCM, 2^36 integrity-fails for
ChaCha20-Poly1305, etc.). Keys pre-computed one rotation ahead
for zero-latency flips.

### `address_token` — RFC 9000 §8.1.3

```verum
let key = AddressTokenKey.generate();    // 16-byte AES-128 + 8-byte key_id

// Retry token (short-lived, DCID-bound).
let wire = issue(&key, &TokenPlaintext {
    kind: TokenKind.Retry,
    issued_unix: now_secs,
    client_ip: ip_bytes_from(&peer.ip()),
    orig_dcid: client_first_dcid,
})?;

let decoded = verify(&key, received, now_secs, &VerifyOptions {
    max_age_sec: 30,
    expected_client_ip: Some(peer_ip_bytes),
    required_kind: Some(TokenKind.Retry),
})?;
```

AES-128-GCM envelope. Key-ID prefix enables key rotation
windows. `kind` + `client_ip` + `issued_unix` all bound into
the AAD so Retry / NEW_TOKEN can't be swapped.

### `pacer` — RFC 9002 §7.7

```verum
let mut pacer = Pacer.new(2400);                     // ~2 MSS bucket
pacer.set_rate(cc.pacing_rate_bps());                // update on CC tick

match pacer.check(bytes, Instant.now()) {
    PacerDecision.Send         => { emit(); pacer.on_packet_sent(n, now); },
    PacerDecision.NotYet(delay) => schedule_wakeup_after(delay),
}
```

Token-bucket send-pacer with bucket capacity ≈ 2 MSS. Zero-rate
(unlimited) mode never empties. Integer arithmetic over μs ×
bytes; overflow-guarded to 100 Gbps × 1-s windows.

### `stats` + `stats_prometheus`

```verum
let body: Text = stats_prometheus.render_endpoint(&endpoint_stats);
// 35+ metrics in OpenMetrics text format — feed to /metrics.
```

`QuicStats` struct — 35+ fields covering datagrams / bytes /
packets-per-space / recovery / congestion / streams / 0-RTT /
key-updates / migration / CID issuance. `EndpointStats` adds
stateless-reset count, version-negotiation count, retry count,
amplification-limit hits, plus an aggregate `QuicStats` over
all live connections.

### `batch_io` — UDP GSO / GRO / sendmmsg

```verum
let socket = RealBatchUdp.bind(&local_addr).await?;
socket.enable_gso(1200_u16).await?;    // segment size
socket.enable_gro().await?;

let batch: List<OutboundDatagram> = [...];
let sent = socket.send_batch(&batch).await?;
let rx = socket.recv_batch(DEFAULT_BATCH_SIZE).await?;
```

Protocol-based — `BatchTransport` sits alongside `UdpTransport`
so deployments on Linux 4.18+ get GSO+GRO+ECN, while macOS /
Windows fall back to per-datagram send.

## TLS 1.3 sub-modules (warp stack)

### `sni_resolver` — RFC 6066 SNI dispatch

```verum
let mut r = ExactMatchResolver.new();
r.add(Text.from("api.example.com"), cert_chain_and_signer());
r.add_wildcard(Text.from("*.example.com"), fallback_identity());
r.set_default(default_identity());
```

Exact match → leftmost-wildcard match → default fallback.
Dynamic reload = rebuild + swap (atomic from the server SM's
perspective).

### `zero_rtt_antireplay` — RFC 8446 §8

```verum
let mut guard = ReplayCache.with_defaults();      // 2^20 / 0.1% / 10 s

if guard.try_admit(psk_id, truncated_ch_hash, Instant.now()) {
    accept_0rtt_flight();
} else {
    reject_0rtt_but_accept_1rtt();
}
```

Two-bucket rotating Bloom filter with HMAC-SHA256-keyed
Kirsch-Mitzenmacher double hashing. `ReplayGuard` protocol
lets distributed deployments swap in a Redis/memcached-backed
impl behind the same surface.

### `resume_verify` + `resumption` — RFC 8446 §4.2.11.2

Server-side PSK verification pipeline; AES-128-GCM STEK ticket
format; NST → ClientSession helper closing the client-side
resumption loop. See the [warp roadmap](/docs/roadmap) for
integration status.

## Deferred

- The @intrinsic bindings (`verum.quic.*`, `verum.qpack.*`,
  `verum.h3.*`) are declared but the runtime-level FFI to quiche/
  msquic/lsquic is scheduled for a separate PR.
- Server push + push-promise flow for HTTP/3 is tracked under §7.
- Connection migration across network paths (§9) wire bits are
  landed (cid_pool + path validation); end-to-end integration in
  the connection state machine is ongoing.
