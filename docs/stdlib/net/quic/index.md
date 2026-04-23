# QUIC v1 (`core.net.quic`) — pure-Verum

Pure-Verum implementation of QUIC v1 (RFC 9000 / RFC 9001 / RFC 9002).
Part of the **warp** stack.

## Quick map

| Concern | Module | Doc |
|---------|--------|-----|
| Packet layer | `core.net.quic.packet` | packet.md |
| Frame codec (20+ frame types) | `core.net.quic.frame` | frame.md |
| ACK ranges (refined) | `core.net.quic.ack_ranges` | ack_ranges.md |
| Crypto layer | `core.net.quic.crypto` | crypto.md |
| Transport params | `core.net.quic.transport_params` | transport_params.md |
| Connection IDs | `core.net.quic.{connection_id,cid_pool}` | cid.md |
| Path validation | `core.net.quic.path` | path.md |
| Recovery (loss + RTT) | `core.net.quic.recovery` | recovery.md |
| Congestion control | `core.net.quic.recovery.cc.{new_reno,cubic,bbr}` | cc.md |
| Stream SM | `core.net.quic.stream_sm` | streams.md |
| Typed connection SM | `core.net.quic.connection_sm` | connection.md |
| Stateless reset | `core.net.quic.stateless_reset` | stateless_reset.md |
| Key update | `core.net.quic.key_update` | key_update.md |
| Transport abstraction (+SimNet) | `core.net.quic.transport` | transport.md |

## Architecture

QUIC runs three concurrent concerns per connection (TX, RX, timer
driver) — Verum wires them as nursery-scoped actors so no task can
outlive its connection (structured concurrency, spec §4.4).

```
┌──────────────── QuicConnection<Established> ────────────────┐
│   TX loop ──▶ packet builder ──▶ UdpTransport.send()         │
│      ▲                                                         │
│      │                                                         │
│      ├─ loss-detection timer ─┐                               │
│      │                         ▼                              │
│   RX loop ◀── UdpTransport.recv() ──▶ frame dispatch ──▶ SM   │
│                                                               │
│   Stream FC ──▶ {MAX_DATA, MAX_STREAM_DATA, MAX_STREAMS}     │
└──────────────────────────────────────────────────────────────┘
```

## Refinement contracts (V1–V10)

The following invariants are encoded at type level and formally
proved via `verum verify`:

| # | Invariant | Proof |
|---|-----------|-------|
| V3 | AckRanges: non-overlapping + strictly descending + gap ≥ 2 | `vcs/specs/L2-standard/net/quic/v3_ackranges_theorem.vr` |
| V4 | next_pn > largest_acked_sent | `v4_pn_monotonic_theorem.vr` |
| V5 | cwnd ≥ 2·MAX_DATAGRAM_SIZE | `v5_newreno_window_theorem.vr` |
| V6 | active_count ≤ active_connection_id_limit | `v6_cid_cap_theorem.vr` |
| V7 | sent ≤ 3·received before validated | `v7_anti_amp_theorem.vr` |
| V9 | transport-params bounds (§18.2) | `v9_transport_params_theorem.vr` |

See the dedicated theorems.md page for the full list
and Z3 discharge notes.

## Spec alignment

Full specification: `internal/specs/tls-quic.md` §7 (QUIC design).
