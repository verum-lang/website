---
sidebar_position: 2
title: QUIC frames (RFC 9000 §19)
description: Byte-exact wire layout and classification of every QUIC frame type in core.net.quic.frame.
---

# QUIC frames — RFC 9000 §19

Every QUIC packet carries a sequence of frames. The frame layer lives in
`core.net.quic.frame` and exposes a single `Frame` sum type with 22
variants (20 core frame types from RFC 9000 + `DATAGRAM` variants from
RFC 9221). Each frame is serialised as:

```
Type (QUIC varint) || [frame-specific fields]
```

## Frame catalogue

| Type | Name | Ack-eliciting | Probing | Module | KAT |
|-----:|------|:---:|:---:|--------|-----|
| 0x00 | `PADDING` | — | ✓ | §19.1 | [`misc_frames_kat`](#references) |
| 0x01 | `PING` | ✓ | — | §19.2 | [`misc_frames_kat`](#references) |
| 0x02/03 | `ACK` / `ACK_ECN` | — | — | §19.3 | [`ack_frame_encode_kat`](#references), [`ack_frame_large_values_kat`](#references) |
| 0x04 | `RESET_STREAM` | ✓ | — | §19.4 | [`misc_frames_kat`](#references) |
| 0x05 | `STOP_SENDING` | ✓ | — | §19.5 | [`misc_frames_kat`](#references) |
| 0x06 | `CRYPTO` | ✓ | — | §19.6 | [`crypto_stream_frame_encode_kat`](#references) |
| 0x07 | `NEW_TOKEN` | ✓ | — | §19.7 | [`misc_frames_kat`](#references), [`new_token_datagram_surface`](#references) |
| 0x08–0x0F | `STREAM` (8 flag combinations) | ✓ | — | §19.8 | [`crypto_stream_frame_encode_kat`](#references), [`stream_frame_large_varint_kat`](#references) |
| 0x10 | `MAX_DATA` | ✓ | — | §19.9 | [`flow_control_frames_kat`](#references) |
| 0x11 | `MAX_STREAM_DATA` | ✓ | — | §19.10 | [`flow_control_frames_kat`](#references) |
| 0x12/13 | `MAX_STREAMS` (bidi/uni) | ✓ | — | §19.11 | [`flow_control_frames_kat`](#references) |
| 0x14 | `DATA_BLOCKED` | ✓ | — | §19.12 | [`flow_control_frames_kat`](#references) |
| 0x15 | `STREAM_DATA_BLOCKED` | ✓ | — | §19.13 | [`flow_control_frames_kat`](#references) |
| 0x16/17 | `STREAMS_BLOCKED` (bidi/uni) | ✓ | — | §19.14 | [`flow_control_frames_kat`](#references) |
| 0x18 | `NEW_CONNECTION_ID` | ✓ | ✓ | §19.15 | [`new_retire_cid_frame_kat`](#references) |
| 0x19 | `RETIRE_CONNECTION_ID` | ✓ | — | §19.16 | [`new_retire_cid_frame_kat`](#references) |
| 0x1A | `PATH_CHALLENGE` | ✓ | ✓ | §19.17 | [`misc_frames_kat`](#references) |
| 0x1B | `PATH_RESPONSE` | ✓ | ✓ | §19.18 | [`misc_frames_kat`](#references) |
| 0x1C | `CONNECTION_CLOSE` (transport) | — | — | §19.19 | [`connection_close_datagram_kat`](#references) |
| 0x1D | `CONNECTION_CLOSE` (app) | — | — | §19.20 | [`connection_close_datagram_kat`](#references) |
| 0x1E | `HANDSHAKE_DONE` | ✓ | — | §19.21 | [`misc_frames_kat`](#references) |
| 0x30/31 | `DATAGRAM` (no-len / with-len) | ✓ | — | RFC 9221 | [`connection_close_datagram_kat`](#references) |

The "Ack-eliciting" column drives whether the peer must send an ACK
within `max_ack_delay`. "Probing" marks frames that MAY travel on a
path that hasn't yet been validated (RFC 9000 §9.1). Both attributes
are public predicates on `Frame`: `Frame.is_ack_eliciting()` and
`Frame.is_probing()`.

## Variable-length integer encoding

Every frame field tagged `(i)` in RFC 9000 is a QUIC varint (§16). The
top 2 bits of the first byte encode the total length:

| Prefix | Length | Value range |
|:------:|:------:|-------------|
| `00` | 1 byte | 0 ..= 63 |
| `01` | 2 bytes | 0 ..= 16,383 |
| `10` | 4 bytes | 0 ..= 2³⁰ − 1 |
| `11` | 8 bytes | 0 ..= 2⁶² − 1 |

The primitive lives in `core.encoding.varint` as `quic_encode` /
`quic_decode`. Every RFC 9000 §A.1 worked example is pinned byte-exact
in [`varint_examples_errors_kat`](#references):

```verum
mount core.encoding.varint.{quic_decode};

// RFC 9000 §A.1: 0x25 → 37
let (v, _) = quic_decode(&[0x25_u8], 0).unwrap();
assert(v == 37_u64);

// 0x7b 0xbd → 15293
let (v, _) = quic_decode(&[0x7B_u8, 0xBD_u8], 0).unwrap();
assert(v == 15_293_u64);

// 0xc2 0x19 0x7c 0x5e 0xff 0x14 0xe8 0x8c → 151_288_809_941_952_652
let wire: List<Byte> = [
    0xC2_u8, 0x19_u8, 0x7C_u8, 0x5E_u8,
    0xFF_u8, 0x14_u8, 0xE8_u8, 0x8C_u8,
];
let (v, _) = quic_decode(wire.as_slice(), 0).unwrap();
assert(v == 151_288_809_941_952_652_u64);
```

## STREAM frame type byte

`STREAM` (§19.8) encodes three flag bits in the type byte itself:

```
Type = 0b00001OLF   where
  O = OFF bit (offset field present)
  L = LEN bit (length field present)
  F = FIN bit (final frame on this stream)
```

`core.net.quic.frame.encode_frame` always sets `L`, sets `O` iff
`offset > 0`, and sets `F` per the frame's `fin` field. The resulting
type byte values are:

| Type | Condition |
|:----:|-----------|
| 0x0A | offset = 0, fin = false |
| 0x0B | offset = 0, fin = true |
| 0x0E | offset > 0, fin = false |
| 0x0F | offset > 0, fin = true |

Values 0x08, 0x09, 0x0C, 0x0D are valid on the wire (LEN bit clear —
length derived from the enclosing packet). warp emits only the `L`-set
forms because it coalesces multiple frames per packet.

## ACK frame layout

```
ACK Frame {
    Type (i) = 0x02..0x03,
    Largest Acknowledged (i),
    ACK Delay (i),
    ACK Range Count (i),
    First ACK Range (i),       ← length of first range
    ACK Range (..) ... ,       ← (gap, range_length) pairs
    [ECN Counts (..)],         ← three varints when type = 0x03
}
```

Ranges are stored in descending PN order. The gap between range `i`
and range `i+1` satisfies `prev.smallest = curr.largest + gap + 2`
(§19.3.1). The `ECN Counts` trailer is present iff Type = 0x03 and
carries three varints for ECT(0), ECT(1), and CE counters.

`AckRanges` is a refinement-typed `List<AckRange>` where every sequence
of `insert_pn` calls is proven by Z3 to preserve non-overlapping +
strictly-descending + gap ≥ 2 (V3 theorem).

## CONNECTION_CLOSE

Two distinct type bytes encode transport-level vs application-level
errors (§19.19 / §19.20):

```
Transport (0x1C):  type(i) | error_code(i) | frame_type(i) | reason_len(i) | reason_bytes
Application (0x1D): type(i) | error_code(i) | reason_len(i) | reason_bytes
```

The `frame_type` field on transport variants identifies the source
frame that triggered the error (0 = generic). Neither variant is
ack-eliciting (§13.2.1) — the peer MUST NOT ACK a `CONNECTION_CLOSE`.
`core.net.quic.error.TransportErrorCode` catalogues the 17 registered
transport errors plus the `CRYPTO_ERROR_BASE = 0x0100` range used for
TLS Alert relay.

## DATAGRAM (RFC 9221)

Two type bytes distinguish length-less vs length-prefixed datagrams:

```
0x30: type | data (consumes rest of packet)
0x31: type | length(i) | data
```

Use the with-length form when the datagram is not the last frame in
the packet; the no-length form is lighter but must be terminal.
`max_datagram_frame_size` (transport parameter 0x20) advertises peer
support.

## References

KAT files, all typecheck-pass:

- `vcs/specs/L2-standard/net/quic/ack_frame_encode_kat.vr`
- `vcs/specs/L2-standard/net/quic/ack_frame_large_values_kat.vr`
- `vcs/specs/L2-standard/net/quic/crypto_stream_frame_encode_kat.vr`
- `vcs/specs/L2-standard/net/quic/stream_frame_large_varint_kat.vr`
- `vcs/specs/L2-standard/net/quic/flow_control_frames_kat.vr`
- `vcs/specs/L2-standard/net/quic/misc_frames_kat.vr`
- `vcs/specs/L2-standard/net/quic/new_retire_cid_frame_kat.vr`
- `vcs/specs/L2-standard/net/quic/connection_close_datagram_kat.vr`
- `vcs/specs/L2-standard/net/quic/new_token_datagram_surface.vr`
- `vcs/specs/L2-standard/net/quic/varint_kat.vr`
- `vcs/specs/L2-standard/net/quic/varint_examples_errors_kat.vr`
- `vcs/specs/L2-standard/net/quic/frame_type_codepoints.vr`
