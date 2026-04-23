---
sidebar_position: 1
title: core.net.quic — QUIC v1 transport
description: Pure-Verum implementation of RFC 9000 / 9001 / 9002 with refinement-typed invariants and structured-concurrency pump architecture.
---

# `core.net.quic` — QUIC v1 transport

A pure-Verum implementation of QUIC version 1 covering the transport,
cryptographic, and recovery specifications:

| Spec | Title | Scope |
|------|-------|-------|
| [RFC 9000](https://datatracker.ietf.org/doc/html/rfc9000) | QUIC: A UDP-Based Multiplexed and Secure Transport | Packet framing, streams, flow control, path validation, CID rotation |
| [RFC 9001](https://datatracker.ietf.org/doc/html/rfc9001) | Using TLS to Secure QUIC | Initial / Handshake / 1-RTT packet protection, key update |
| [RFC 9002](https://datatracker.ietf.org/doc/html/rfc9002) | QUIC Loss Detection and Congestion Control | ACK-eliciting packet accounting, PTO, NewReno, CUBIC, BBR |
| [RFC 9218](https://datatracker.ietf.org/doc/html/rfc9218) | Extensible Prioritization Scheme for HTTP | Consumed by `core.net.h3.priority` |
| [RFC 8999 §15](https://datatracker.ietf.org/doc/html/rfc8999) | Version-Independent Properties of QUIC | `version.vr` constants and GREASE handling |

The stack is self-contained: no C dependency, no intrinsic escape
hatches. `core.net.quic.transport` abstracts over a UDP socket, and
`core.net.quic.connection_sm` drives the per-connection state machine
through `nursery`-scoped actors so that TX, RX, and the loss-detection
timer cannot outlive the connection (Verum's structured-concurrency
rule, spec §4.4).

## Module map

The crate is organised by RFC-section boundary. Each module has an
[invariant budget](#refinement-contracts): when the type system can
express a safety property, it does so via refinement — these columns
are the compiled `verum verify` discharge pointers.

| Concern | Module | Key types |
|---------|--------|-----------|
| Versioning | `core.net.quic.version` | `VERSION_1`, `VERSION_2`, `is_supported`, `is_greased` |
| Connection IDs | `core.net.quic.connection_id` | `ConnectionId { bytes: [Byte; ≤ 20] }`, `CidError` |
| CID pool | `core.net.quic.cid_pool` | `CidPool`, `CidIssuer`, NEW/RETIRE plumbing |
| Packet layer | `core.net.quic.packet` | `LongHeader`, `LongBody`, `ShortHeader`, `parse_long`, `parse_short` |
| Frame codec | `core.net.quic.frame` | `Frame` (27 variants), `decode_frame`, `encode_frame` |
| ACK ranges | `core.net.quic.ack_ranges` | `AckRanges{ranges: List<Range> refined}` — non-overlapping, descending |
| Transport parameters | `core.net.quic.transport_params` | `TransportParams` (RFC §18), `encode`, `decode` |
| Crypto | `core.net.quic.crypto` | Initial/Handshake/1-RTT AEAD, header protection, Retry integrity tag |
| Path validation | `core.net.quic.path` | `PathManager`, PATH_CHALLENGE / PATH_RESPONSE, anti-amplification |
| Stream state machine | `core.net.quic.stream_sm` | `SendStream`, `RecvStream`, `ConnFlowControl` |
| Connection SM | `core.net.quic.connection_sm` | Typed phases (`Initial → Handshake → OneRtt → Closing`) |
| Stateless reset | `core.net.quic.stateless_reset` | `StatelessResetKey`, `ResetTokenSet` |
| Loss & recovery | `core.net.quic.recovery` | `LossDetector`, RTT sampling, PTO scheduling |
| Congestion control | `core.net.quic.recovery.cc.{new_reno,cubic,bbr}` | `CongestionCtrl` protocol + three concrete algorithms |
| Key update (RFC 9001 §6) | `core.net.quic.key_update` | `KeyUpdateSm`, confidentiality/integrity limits |
| Pacer (RFC 9002 §7.7) | `core.net.quic.pacer` | Token-bucket `Pacer`, `PacerDecision` |
| Idle timer (§10.1) | `core.net.quic.idle_timeout` | `IdleTimeoutTracker` |
| Address tokens (§8.1.3) | `core.net.quic.address_token` | Opaque `Token`, AES-GCM sealed |
| Transport / UDP pump | `core.net.quic.transport` | `UdpTransport`, `SimNetwork`, `ConnectionPump` |
| High-level facade | `core.net.quic.api` | `QuicClient`, `QuicServer`, user-facing builders |
| Observability | `core.net.quic.stats`, `core.net.quic.stats_prometheus` | Counters, exposition format |

## Architecture

Per connection, QUIC runs three concurrent concerns. The pure-Verum
pump models them as cooperative actors inside a single `nursery`
scope — nothing else can legally outlive the connection, which is
what makes the structured-concurrency proof go through.

```text
┌──────────────────────── QuicConnection<Established> ───────────────────────┐
│                                                                             │
│                    ┌─────────────────────┐                                  │
│                    │ loss-detection timer │◀─── PTO / OnAck callbacks       │
│                    └──────────┬───────────┘                                 │
│                               │                                              │
│                               ▼                                              │
│    app writes ──▶ ┌─────────────────┐   pacing   ┌───────────────┐          │
│                   │  TX: pump        │──────────▶│ UdpTransport   │          │
│                   │  ┌─ coalesce ────│            │ .send(dgram)   │          │
│                   │  ├─ header prot. │            └───────────────┘          │
│                   │  ├─ AEAD seal    │                                       │
│                   │  └─ build_packet │            ┌───────────────┐          │
│                   └─────────────────┘            │ UdpTransport   │          │
│                                                   │ .recv()        │          │
│                                                   └───────┬────────┘          │
│                                                           │                    │
│                    ┌─────────────────┐                   │                    │
│    app reads ◀── ──│  RX: pump        │◀─── datagram ────┘                    │
│                   │  ┌─ header open  │                                       │
│                   │  ├─ AEAD open    │                                       │
│                   │  ├─ frame decode │                                       │
│                   │  └─ SM dispatch  │                                       │
│                   └────────┬─────────┘                                       │
│                            │                                                  │
│                            ▼                                                  │
│          Connection SM (typed)  ──▶ stream FC ──▶ {MAX_DATA, MAX_STREAM_DATA}│
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

Three design commitments shape every layer:

1. **Refinement-typed invariants** wherever machine-checkable (§4.6
   ACK ranges, §8.1.3 anti-amplification, §5.1.1 active CID cap,
   RFC 9002 §7.2 cwnd floor). Violations fail at the constructor,
   not at the peer.
2. **Typed phase transitions** (`Initial → Handshake → OneRtt →
   Closing`) encoded as the connection state machine's type
   parameter — the compiler forbids sending 1-RTT frames before the
   handshake completes.
3. **No shared mutable state outside a single `nursery`**. The TX
   queue, RX dispatcher, and loss-detection timer are siblings in the
   connection's scope; cancellation of the connection cancels all
   three atomically.

## Refinement contracts

Ten invariants (V1–V10, `internal/specs/tls-quic.md` §7) are encoded
in the types and discharged by `verum verify`:

| # | Invariant | Module | Theorem file |
|---|-----------|--------|--------------|
| V1 | Version constants mutually exclusive | `version` | `v1_version_theorem.vr` |
| V2 | `ConnectionId.bytes.len() ∈ [0, 20]` | `connection_id` | `v2_cid_len_theorem.vr` |
| V3 | `AckRanges` non-overlapping, strictly descending, gap ≥ 2 | `ack_ranges` | `v3_ackranges_theorem.vr` |
| V4 | `next_pn > largest_acked_sent` (PN monotonicity) | `recovery.pn_space` | `v4_pn_monotonic_theorem.vr` |
| V5 | `cwnd ≥ 2·MAX_DATAGRAM_SIZE` (RFC 9002 §7.2) | `recovery.cc.new_reno` | `v5_newreno_window_theorem.vr` |
| V6 | `active_cid_count ≤ active_connection_id_limit` | `cid_pool` | `v6_cid_cap_theorem.vr` |
| V7 | `sent ≤ 3 · received` before path validated | `path` | `v7_anti_amp_theorem.vr` |
| V8 | Transport-param peer_addr valid (IPv4/IPv6) | `transport_params` | `v8_peer_addr_theorem.vr` |
| V9 | Transport-param bounds (§18.2) | `transport_params` | `v9_transport_params_theorem.vr` |
| V10 | Idle-timer monotonic | `idle_timeout` | `v10_idle_monotonic_theorem.vr` |

Run `verum audit --framework-axioms` on a project that transitively
imports `core.net.quic` to see the full trusted boundary of these
proofs; every theorem's external citations (RFC numbers, theorem
provers consulted) surface in that audit.

## Using the high-level facade

`core.net.quic.api` exposes builders that wrap the connection SM. Use
this surface when you don't need to customise individual layers.

```verum
mount core.net.quic.api.{QuicClient, QuicClientConfig};
mount core.net.addr.{SocketAddr};
mount core.time.duration.{Duration};

async fn fetch_example() -> Result<(), QuicError> {
    let peer = SocketAddr.from_text("203.0.113.10:4433").unwrap();

    let config = QuicClientConfig.new()
        .with_server_name("example.test")
        .with_alpn(b"h3")
        .with_initial_max_data(1 << 20)
        .with_initial_max_stream_data_bidi_local(1 << 16)
        .with_idle_timeout(Duration.from_secs(30));

    let mut conn = QuicClient.connect(peer, config).await?;
    let mut stream = conn.open_bidi_stream().await?;
    stream.write_all(b"GET /\r\n").await?;
    let mut buf: [Byte; 4096] = [0; 4096];
    let n = stream.read(&mut buf).await?;
    let _ = buf[..n];
    conn.close(0x00_u64, b"done").await
}
```

## Dropping down to the connection SM

The typed SM at `core.net.quic.connection_sm` is the right entry
point when a custom transport (e.g., a non-UDP datagram layer or an
in-memory `SimNetwork`) sits under it. The SM owns encryption levels,
packet-number spaces, and the loss detector; the caller supplies
datagrams via `on_inbound_datagram` and drains outbound frames via
`drain_outbound`.

```verum
mount core.net.quic.connection_sm.{ClientSm, SmError};
mount core.net.quic.transport.{SimNetwork};

fn drive_client(net: &mut SimNetwork, mut sm: ClientSm) -> Result<(), SmError> {
    while !sm.is_established() {
        while let Some(dgram) = sm.drain_outbound() {
            net.send(dgram);
        }
        if let Some(dgram) = net.recv() {
            sm.on_inbound_datagram(dgram)?;
        }
        sm.on_tick();
    }
    Ok(())
}
```

`SimNetwork` provides a deterministic, in-memory packet-loss injector
for unit-testing the SM under arbitrary loss patterns
(`vcs/specs/L2-standard/net/quic/` — every RFC compliance point has a
SimNetwork-driven scenario).

## Congestion control

Three algorithms ship against the same `CongestionCtrl` protocol:

```verum
type CongestionCtrl is protocol {
    fn on_packet_sent(&mut self, bytes: UInt32);
    fn on_ack_received(&mut self, acked_bytes: UInt32, rtt: Duration, now: Instant);
    fn on_packets_lost(&mut self, lost_bytes: UInt32, now: Instant);
    fn on_pto(&mut self, now: Instant);
    fn window(&self) -> UInt32;
    fn bytes_in_flight(&self) -> UInt32;
    fn should_pace(&self) -> Bool;
    fn pacing_rate(&self) -> UInt64;
};
```

- **NewReno** (`core.net.quic.recovery.cc.new_reno`) — the RFC 9002
  reference controller. Default choice for conformance testing.
  Invariant V5 (`cwnd ≥ 2·MAX_DATAGRAM_SIZE`) is machine-checked at
  every window update.
- **CUBIC** (`core.net.quic.recovery.cc.cubic`) — RFC 9438
  implementation, matches the BSD/Linux deployed algorithm. The
  cubic-growth window function is refined so the tangent line is
  evaluated in fixed-point arithmetic only.
- **BBR** (`core.net.quic.recovery.cc.bbr`) — BBRv1 phases (Startup,
  Drain, ProbeBw, ProbeRtt) with bandwidth / min-RTT filters.

Swap controllers by constructing the connection SM with a different
`CongestionCtrl` implementation — the SM is generic over it.

## Observability

Every connection exposes a `QuicStats` record (RTT samples, CC state,
packet counters, loss-detection state). The endpoint-level
`EndpointStats` aggregates across connections and flushes to Prometheus
via `core.net.quic.stats_prometheus`:

```verum
mount core.net.quic.stats_prometheus.{render_endpoint};
mount core.net.quic.api.{QuicServer};

fn metrics_endpoint(server: &QuicServer) -> Text {
    render_endpoint(&server.stats())
}
```

## Testing scaffolding

- `core.net.quic.transport.SimNetwork` — deterministic in-memory UDP
  replacement with configurable loss rate, reorder window, and delay
  distribution.
- RFC 9001 §A.1–§A.5 known-answer tests (Initial secrets, Retry
  integrity tag, header-protection masks for AES-128 and ChaCha20)
  all live in `vcs/specs/L2-standard/net/quic/rfc9001_*_kat.vr`.
- RFC 9000 §A.1 variable-length integer encoding round-trip — see
  `vcs/specs/L2-standard/encoding/run_quic_varint.vr`.

## See also

- [`core.net.h3`](/docs/stdlib/net/http3/) — HTTP/3 + QPACK sits on top of this.
- [`core.net.tls13`](/docs/stdlib/net/tls/) — TLS 1.3 handshake driver that
  `connection_sm` consumes via the CRYPTO frame path.
- [`core.net.weft`](/docs/stdlib/net/weft/overview) — connection pools, health
  checks, and circuit breakers sit on top of this (transport-agnostic).

## Status (2026-04)

All twenty-plus modules listed above are shipped. The L2 typecheck
suite is at 41/41 (100 %). L3 (integration scenarios with simulated
network) is wired end-to-end; the remaining gap is CUBIC's aggressive
slow-start window which is being tuned against the reference
implementation.
