---
sidebar_position: 3
title: QUIC packets (RFC 9000 §17)
description: Long-header and Short-header packet layouts, Version Negotiation, Retry, and the parse/build pipeline.
---

# QUIC packets — RFC 9000 §17

The packet layer is `core.net.quic.packet`. It exposes a `Packet` sum
with three variants — `Long(LongPacket)`, `Short(ShortHeader)`,
`VersionNegotiation { dcid, scid, versions }` — plus the parse and
build functions that sit between the UDP transport and the frame
decoder.

## Long-header packets (§17.2)

```
+-+-+-+-+-+-+-+-+
|1|1|T T|R R|P P|    ← first byte: long(1) | fixed(1) | type(2) | reserved(2) | pn_len-1(2)
+-+-+-+-+-+-+-+-+
|     Version (32)   |
+-------------------+
| DCID Length (8)    |
| DCID (0..160)      |
| SCID Length (8)    |
| SCID (0..160)      |
+-------------------+
| [Initial only]     |
|   Token Length (i) |
|   Token (..)       |
+-------------------+
| Length (i)         |  ← covers PN bytes + payload + 16-byte AEAD tag
| Packet Number (1..4) |
| Payload (..)         |
+-------------------+
```

Long type bits `TT` select the sub-type:

| Type bits | Subtype | First byte (post-HP) |
|:---------:|---------|----------------------|
| `00` | Initial | `0xC0 \| pn_len−1` |
| `01` | 0-RTT | `0xD0 \| pn_len−1` |
| `10` | Handshake | `0xE0 \| pn_len−1` |
| `11` | Retry | `0xF0` (no PN) |

The reserved bits `RR` MUST be 0 after header-protection removal; if
set, the receiver MUST close the connection with PROTOCOL_VIOLATION.

### Initial packet (§17.2.2)

Initial packets carry the first CRYPTO frame of the handshake
(ClientHello / ServerHello) plus ACKs. The Token field echoes a server
Retry token (after Retry) or a `NEW_TOKEN` token (on resumed
connections); empty otherwise.

Wire layout for an empty-token minimum-DCID Initial:

```
0xC0                                       ← first byte, pn_len=1
0x00 0x00 0x00 0x01                        ← VERSION_1
0x04 0xAA 0xBB 0xCC 0xDD                   ← 4-byte DCID
0x00                                       ← empty SCID
0x00                                       ← empty token length
0x04                                       ← Length = 4 (1 pn + 3 payload)
0x02                                       ← packet_number = 2
0x01 0x02 0x03                             ← payload
```

[`initial_handshake_parse_kat`](#references) exercises this exact
layout plus a 4-byte token ("tokn") variant and truncated-token
rejection.

### Handshake and 0-RTT (§17.2.3 / §17.2.4)

Identical to Initial minus the Token fields. Type bits only change.
Handshake packets are encrypted with the handshake-stage AEAD keys
derived from `handshake_secret`; 0-RTT uses the early-data keys
derived during resumption.

### Retry (§17.2.5)

Retry packets have no PN field and no encrypted payload. Instead the
trailing 16 bytes carry an AEAD integrity tag that authenticates
(odcid || retry_header_without_tag):

```
0xF0                                       ← first byte, type=11 (Retry)
0x00 0x00 0x00 0x01                        ← VERSION_1
[DCID length + DCID]
[SCID length + SCID]
[Retry Token (variable)]
[Integrity Tag (16 bytes fixed)]
```

The tag is AEAD_AES_128_GCM with the RFC 9001 §5.8 fixed key/nonce:

```
RETRY_INTEGRITY_KEY_V1   = 0xbe0c690b9f66575a1d766b54e368c84e
RETRY_INTEGRITY_NONCE_V1 = 0x461599d35d632bf2239825bb
```

The AAD is the original DCID (length-prefixed) followed by every byte
of the Retry packet up to but excluding the tag. RFC 9001 §A.4
known-answer is pinned in [`rfc9001_retry_integrity_kat`](#references).

### Version Negotiation (§17.2.1)

Special first byte form — Version field = `0x00000000` selects the VN
branch regardless of type bits. Body is a list of 4-byte supported
versions:

```
[first byte: any]
0x00 0x00 0x00 0x00                        ← version = 0 → VN sentinel
[DCID length + DCID]
[SCID length + SCID]
[Supported Versions: 4 bytes each, N ≥ 1]
```

`parse_long` dispatches to VN parsing when it observes `version == 0`.
RFC 9369 QUIC v2 (0x6B3343CF) appears alongside v1 (0x00000001) plus
greased versions conforming to RFC 8701 (each byte has low nibble
0xA — e.g. `0xAABAAAAA` is greased per spec). See
[`version_greased_predicate`](#references) and
[`retry_vn_parse_kat`](#references).

## Short-header packets (§17.3)

1-RTT packets use a compact header where the DCID length is *not on
the wire* — the receiver knows it from the CID issuance context.

```
+-+-+-+-+-+-+-+-+
|0|1|S|R R|K|P P|    ← form(0) | fixed(1) | spin | reserved(2) | key_phase | pn_len-1(2)
+-+-+-+-+-+-+-+-+
| Destination CID (dcid_len bytes)      |
| Packet Number (1..4 bytes)            |
| Payload (..)                           |
```

Bit semantics:

- **Bit 7 (form)** = 0 for short header.
- **Bit 6 (fixed)** = 1; if received 0 without GREASE negotiation,
  the receiver MUST close with PROTOCOL_VIOLATION.
- **Bit 5 (spin)** — RFC 9000 §17.4 latency-spin bit; optional passive
  RTT signal.
- **Bits 4-3 (reserved)** — MUST be 0 post-HP.
- **Bit 2 (key phase)** — RFC 9001 §6 key update signal (toggles on
  each rotation).
- **Bits 1-0 (pn_len-1)** — 00→1B, 01→2B, 10→3B, 11→4B.

Header protection masks bits 0-4 (low 5 bits) and the PN bytes; bits
5-7 (spin / fixed / form) stay observable. See
[`short_header_fields`](#references) and
[`short_header_parse_roundtrip`](#references).

## Packet number encoding (§17.1)

Packet numbers are full 62-bit values, but the wire form is truncated
to 1–4 bytes per the flag bits. `encode_packet_number_len(pn,
largest_acked)` picks the minimum width that keeps the truncated form
unambiguous:

```
range_of_interest = 2 × (pn - largest_acked)
pn_nbits = ceil(log2(range_of_interest))
pn_len = (pn_nbits + 7) / 8
```

The decoder reverses this via `decode_packet_number(largest_pn,
truncated_pn, pn_nbits)` using the standard window-recovery
algorithm (RFC 9000 §A.3). See [`pn_encoding_kat`](#references).

## Build pipeline

```
frames: List<Frame>
  → encode_frame for each (→ payload bytes)
  → build header (first byte | version | CIDs | [token] | length | pn)
  → AEAD-seal(aead_key, nonce = iv XOR pn, aad = header, payload)
  → apply HP mask from sample = ciphertext[4..20]
  → wire datagram
```

[`build_long_packet_integration_kat`](#references) drives the whole
pipeline with RFC 9001 §A.1 initial keys and asserts the post-HP
structural invariants (form/fixed bits, version big-endian, DCID
preserved, AEAD expansion bounded).
[`build_short_packet_integration_kat`](#references) is the 1-RTT
analog.

## References

- `vcs/specs/L2-standard/net/quic/initial_handshake_parse_kat.vr`
- `vcs/specs/L2-standard/net/quic/retry_vn_parse_kat.vr`
- `vcs/specs/L2-standard/net/quic/short_header_fields.vr`
- `vcs/specs/L2-standard/net/quic/short_header_parse_roundtrip.vr`
- `vcs/specs/L2-standard/net/quic/long_packet_type_bits.vr`
- `vcs/specs/L2-standard/net/quic/pn_encoding_kat.vr`
- `vcs/specs/L2-standard/net/quic/build_long_packet_integration_kat.vr`
- `vcs/specs/L2-standard/net/quic/build_short_packet_integration_kat.vr`
- `vcs/specs/L2-standard/net/quic/version_greased_predicate.vr`
- `vcs/specs/L2-standard/net/quic/version_negotiation_parse.vr`
- `vcs/specs/L2-standard/net/quic/rfc9001_retry_integrity_kat.vr`
