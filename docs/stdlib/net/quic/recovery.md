---
sidebar_position: 6
title: QUIC recovery (RFC 9002)
description: Loss detection, RTT estimation, PTO back-off, and the NewReno / CUBIC / BBR congestion controllers.
---

# QUIC recovery — RFC 9002

`core.net.quic.recovery` implements QUIC's loss-detection and
congestion-control discipline. It splits into three concerns:

- **Loss detection** — deciding which sent packets are lost.
- **RTT estimation** — smoothed RTT + variance + min RTT.
- **Congestion control** — bytes-in-flight budget and pacing.

The module structure mirrors the spec:

| File | Spec | Role |
|------|------|------|
| `recovery/pn_space.vr` | §2-§3 | Per-space PN state, in-flight set |
| `recovery/rtt.vr` | §5.3 | Exponential weighted RTT estimator |
| `recovery/loss_detection.vr` | §6 | PTO timer + lost-packet detection |
| `recovery/cc/mod.vr` | §7 | `CongestionCtrl` protocol |
| `recovery/cc/new_reno.vr` | §7 | RFC 9002 mandatory algorithm |
| `recovery/cc/cubic.vr` | RFC 9438 | Optional controller |
| `recovery/cc/bbr.vr` | draft-ietf-ccwg-bbr | Optional controller |

## Packet-number space

Each PN space (Initial, Handshake, Application) runs an independent
loss-detection + CC state:

```verum
public type PnSpaceState is {
    largest_acked: Maybe<UInt64>,
    sent_packets:  Map<UInt64, SentPacketInfo>,
    ack_ranges:    AckRanges,
    next_pn:       UInt64,
    keys:          Maybe<AeadKeys>,
    discarded:     Bool,
};
```

V4 theorem ([`v4_pn_monotonic_theorem`](#references)) proves
`next_pn > largest_acked` and that advance-by-one is strict per
space.

When a stage ends (Initial → Handshake on ServerHello, Handshake →
Application on Finished / HANDSHAKE_DONE), the older space is
*discarded*: its keys are zeroised, outstanding-packet map is
dropped, and further packets with its PN are silently ignored.

## RTT estimator (§5.3)

```verum
public type RttEstimator is {
    latest_us:     UInt64,
    smoothed_us:   UInt64,
    rttvar_us:     UInt64,
    min_rtt_us:    UInt64,
    has_sample:    Bool,
};
```

Initial state (`kInitialRtt`): smoothed = 333 ms, rttvar = 166 ms.
First sample overwrites both directly. Subsequent samples apply the
standard EWMA:

```
rttvar  = 3/4 * rttvar  + 1/4 * |smoothed - adjusted|
smoothed = 7/8 * smoothed + 1/8 * adjusted
```

where `adjusted = max(min_rtt, latest - ack_delay)`. See
[`rtt_ewma_progression`](#references).

## Loss detection (§6)

Two signals mark a packet lost:

1. **Threshold:** a newer packet with PN ≥ `pkt.pn + kPacketThreshold`
   has been acknowledged (default `kPacketThreshold = 3`).
2. **Time threshold:** `now - pkt.time_sent > max(kTimeThreshold *
   max(smoothed_rtt, latest_rtt), kGranularity)` with
   `kTimeThreshold = 9/8`.

PTO (Probe Timeout) fires when no ACK has arrived in the expected
RTT window:

```
pto_timeout = smoothed_rtt + max(4 * rttvar, kGranularity) + max_ack_delay
pto_deadline = time_of_last_ack_eliciting + pto_timeout * 2^pto_count
```

On fire, the sender emits one or two probe packets (at least one
`PING` frame to elicit an ACK), increments `pto_count`, and
re-arms. On any ACK receipt, `pto_count = 0`.

API:

```verum
mount core.net.quic.recovery.loss_detection.{LossDetection, SentPacketInfo};

let mut ld = LossDetection.new();
ld.on_packet_sent(PnSpace.Application, pn, SentPacketInfo { ... });
let processed = ld.on_ack_received(PnSpace.Application, &ack_frame)?;
if let Some(probe) = ld.on_timer(now) {
    // send probe packets
}
```

See [`loss_detection_surface`](#references) and
[`loss_detection_pto`](#references).

## Congestion control protocol

All three implementations satisfy a common interface:

```verum
public type CongestionCtrl is protocol {
    fn on_packet_sent(&mut self, bytes: UInt32);
    fn on_ack_received(&mut self, acked_bytes: UInt32,
                       rtt: Duration, now: Instant);
    fn on_packets_lost(&mut self, lost_bytes: UInt32, now: Instant);
    fn on_pto(&mut self, now: Instant);
    fn window(&self) -> UInt32;          // bytes-in-flight budget
    fn should_pace(&self) -> Bool;
    fn pacing_rate(&self) -> UInt64;     // bytes/sec
};
```

Selection happens through `QuicConfig.with_new_reno()` /
`with_cubic()` / `with_bbr()`; NewReno is the default.

### NewReno (§7)

Constants:

```
MAX_DATAGRAM_SIZE   = 1200
kInitialWindow      = 10 * MAX_DATAGRAM_SIZE = 12000
kMinimumWindow      = 2 * MAX_DATAGRAM_SIZE = 2400
kLossReductionFactor = 0.5
```

States: **slow start** grows `cwnd += acked_bytes` per ACK until the
first loss or PTO, then switches to **congestion avoidance** with
`cwnd += acked_bytes * max_datagram_size / cwnd`. Loss in any state
halves `cwnd` with a floor of `kMinimumWindow`.

V5 theorem ([`v5_newreno_window_theorem`](#references)) proves
`cwnd ≥ kMinimumWindow` holds across every state transition. The
tracer KATs ([`new_reno_state_machine`](#references),
[`rfc9002_newreno_traces`](#references)) replay the RFC 9002 Appendix A
scenarios byte-for-byte.

### CUBIC (RFC 9438)

Cubic growth function with β = 0.7. `W_cubic(t) = C*(t-K)^3 + W_max`
where `K = cbrt(W_max * (1-β) / C)` and `C = 0.4`. See
[`cubic_surface`](#references), [`cubic_typecheck`](#references),
[`rfc9438_cubic_traces`](#references).

### BBRv2 (draft-ietf-ccwg-bbr)

Probe-BW / Probe-RTT / Startup state machine driven by delivery-rate
measurements. See [`bbr_state_machine`](#references),
[`bbr_surface`](#references), [`bbr_typecheck`](#references).

## Pacer (§7.7)

Token-bucket rate limiter decouples "cwnd allows" from "send right
now". Prevents burst-driven queueing at bottleneck.

```verum
public type Pacer is {
    tokens:        UInt64,
    last_refill:   Instant,
    bytes_per_sec: UInt64,
    max_burst:     UInt64,
};

public type PacerDecision is Send | NotYet(Duration);

let decision = pacer.next_send(now, next_packet_size);
```

See [`pacer_surface`](#references) and
[`pacer_refill_progression`](#references).

## ACK ranges (§19.3.1)

`AckRanges` is refinement-typed — the type system guarantees:

- **Non-overlapping** between any two ranges.
- **Strictly descending** (largest-PN-first order).
- **Gap ≥ 2** between adjacent ranges (matches the wire encoding where
  `gap = prev.smallest − curr.largest − 2`).

V3 theorem ([`v3_ackranges_theorem`](#references)) proves `insert_pn`
preserves the invariant for every sequence of insertions.

## References

- `vcs/specs/L2-standard/net/quic/recovery_typecheck.vr`
- `vcs/specs/L2-standard/net/quic/rtt_ewma_progression.vr`
- `vcs/specs/L2-standard/net/quic/loss_detection_surface.vr`
- `vcs/specs/L2-standard/net/quic/loss_detection_pto.vr`
- `vcs/specs/L2-standard/net/quic/pn_space_monotonic.vr`
- `vcs/specs/L2-standard/net/quic/pn_space_ack_path.vr`
- `vcs/specs/L2-standard/net/quic/pn_space_discard.vr`
- `vcs/specs/L2-standard/net/quic/new_reno_state_machine.vr`
- `vcs/specs/L2-standard/net/quic/new_reno_window_min.vr`
- `vcs/specs/L2-standard/net/quic/rfc9002_newreno_traces.vr`
- `vcs/specs/L2-standard/net/quic/v5_newreno_window_theorem.vr`
- `vcs/specs/L2-standard/net/quic/cubic_surface.vr`
- `vcs/specs/L2-standard/net/quic/cubic_typecheck.vr`
- `vcs/specs/L2-standard/net/quic/rfc9438_cubic_traces.vr`
- `vcs/specs/L2-standard/net/quic/bbr_state_machine.vr`
- `vcs/specs/L2-standard/net/quic/bbr_surface.vr`
- `vcs/specs/L2-standard/net/quic/bbr_typecheck.vr`
- `vcs/specs/L2-standard/net/quic/pacer_surface.vr`
- `vcs/specs/L2-standard/net/quic/pacer_refill_progression.vr`
- `vcs/specs/L2-standard/net/quic/pacer_typecheck.vr`
- `vcs/specs/L2-standard/net/quic/ack_ranges_invariant.vr`
- `vcs/specs/L2-standard/net/quic/ack_ranges_insert_invariant.vr`
- `vcs/specs/L2-standard/net/quic/v3_ackranges_theorem.vr`
- `vcs/specs/L2-standard/net/quic/v4_pn_monotonic_theorem.vr`
