---
sidebar_position: 5
title: QUIC transport parameters (RFC 9000 §18)
description: Wire layout, full parameter catalogue, V9 bounds theorem, and encode/decode discipline.
---

# QUIC transport parameters — RFC 9000 §18

Transport parameters are exchanged inside the TLS 1.3
`quic_transport_parameters` extension (ID 57). Each parameter is:

```
Transport Parameter {
    Parameter ID (i),
    Parameter Length (i),     ← byte length of value
    Parameter Value (..),
}
```

Scalar parameters encode their value as a QUIC varint inside the
value region; flag parameters have a zero-length value; complex
parameters (preferred_address) carry a sub-structure.

## Parameter catalogue

| ID | Name | Type | Default | Carrier |
|----:|------|------|---------|---------|
| 0x00 | `original_destination_connection_id` | CID (≤ 20 bytes) | absent | server only |
| 0x01 | `max_idle_timeout` | varint ms | 0 (disabled) | both |
| 0x02 | `stateless_reset_token` | 16 bytes | absent | server only |
| 0x03 | `max_udp_payload_size` | varint | 65527 | both (≥ 1200) |
| 0x04 | `initial_max_data` | varint | 0 | both |
| 0x05 | `initial_max_stream_data_bidi_local` | varint | 0 | both |
| 0x06 | `initial_max_stream_data_bidi_remote` | varint | 0 | both |
| 0x07 | `initial_max_stream_data_uni` | varint | 0 | both |
| 0x08 | `initial_max_streams_bidi` | varint | 0 | both (≤ 2⁶⁰) |
| 0x09 | `initial_max_streams_uni` | varint | 0 | both (≤ 2⁶⁰) |
| 0x0A | `ack_delay_exponent` | varint u8 | 3 | both (≤ 20) |
| 0x0B | `max_ack_delay` | varint ms | 25 | both |
| 0x0C | `disable_active_migration` | flag | absent | both |
| 0x0D | `preferred_address` | struct | absent | server only |
| 0x0E | `active_connection_id_limit` | varint | 2 | both (≥ 2) |
| 0x0F | `initial_source_connection_id` | CID | required | both |
| 0x10 | `retry_source_connection_id` | CID | absent | server only after Retry |
| 0x20 | `max_datagram_frame_size` | varint | absent | both (RFC 9221) |
| 0x2AB2 | `grease_quic_bit` | flag | absent | both (RFC 9287) |

The type is `core.net.quic.transport_params.TransportParams`:

```verum
public type TransportParams is {
    original_destination_connection_id: Maybe<ConnectionId>,
    max_idle_timeout_ms:                 UInt64,
    stateless_reset_token:               Maybe<[Byte; 16]>,
    max_udp_payload_size:                UInt64,
    initial_max_data:                    UInt64,
    initial_max_stream_data_bidi_local:  UInt64,
    initial_max_stream_data_bidi_remote: UInt64,
    initial_max_stream_data_uni:         UInt64,
    initial_max_streams_bidi:            UInt64,
    initial_max_streams_uni:             UInt64,
    ack_delay_exponent:                  UInt8,
    max_ack_delay_ms:                    UInt64,
    disable_active_migration:            Bool,
    preferred_address:                   Maybe<PreferredAddress>,
    active_connection_id_limit:          UInt64,
    initial_source_connection_id:        Maybe<ConnectionId>,
    retry_source_connection_id:          Maybe<ConnectionId>,
    max_datagram_frame_size:             Maybe<UInt64>,
    grease_quic_bit:                     Bool,
};
```

`TransportParams.defaults()` returns RFC 9000 §18.2 defaults.

## Bounds theorem (V9)

`core.net.quic.transport_params.TransportParams.bounds_ok()` enforces
the §18.2 constraints that MUST hold for every valid parameter set:

```
initial_max_streams_bidi     ≤ 2^60    (MAX_STREAMS_LIMIT)
initial_max_streams_uni      ≤ 2^60
ack_delay_exponent           ≤ 20      (MAX_ACK_DELAY_EXPONENT)
active_connection_id_limit   ≥ 2       (MIN_ACTIVE_CID_LIMIT)
max_udp_payload_size         ≥ 1200    (MIN_MAX_UDP_PAYLOAD_SIZE)
```

The call site treats a `false` return as fatal
(`TransportError.ProtocolViolation`). the SMT backend discharges V9 at compile
time ([`v9_transport_params_theorem`](#references)).

## Wire encoding

Each scalar parameter is three nested varints: id, length, value.
Byte-exact example for a minimum server parameter block with
`max_idle_timeout=0 ms`, `max_udp_payload_size=1200 B`, and
`initial_max_data=5`:

```
0x01 0x01 0x00                ← max_idle_timeout = 0
0x03 0x02 0x44 0xB0           ← max_udp_payload_size = 1200
0x04 0x01 0x05                ← initial_max_data = 5
```

The 1200-byte `max_udp_payload_size` spills into a 2-byte varint:
top 2 bits `01` (14-bit prefix) + 14-bit value 0x4B0 → wire bytes
`0x44 0xB0` (0x4000 | 0x04B0).

Empty-body parameters (`disable_active_migration`, `grease_quic_bit`)
emit `[id_varint, 0x00]`:

```
0x0C 0x00                     ← disable_active_migration present
0x6A 0xB2 0x00                ← grease_quic_bit (id 0x2AB2 → 2-byte varint)
```

The greased `grease_quic_bit` ID (0x2AB2) encodes as a 2-byte QUIC
varint: top 2 bits `01` (14-bit prefix) plus value 0x2AB2 → wire
bytes `0x6A 0xB2`. See [`transport_params_encode_kat`](#references)
and [`rfc9000_transport_params_roundtrip`](#references).

## Preferred address

Server-only parameter 0x0D carrying a migration hint:

```
PreferredAddress {
    ipv4_addr: [Byte; 4],
    ipv4_port: UInt16,
    ipv6_addr: [Byte; 16],
    ipv6_port: UInt16,
    connection_id: ConnectionId,            ← length byte + CID bytes
    stateless_reset_token: [Byte; 16],
}
```

Either IPv4 or IPv6 may be all-zero meaning "not offered". The CID
length is a single byte followed by the CID bytes. See
[`preferred_address_roundtrip`](#references).

## API

```verum
mount core.net.quic.transport_params.{TransportParams, encode, decode};

let mut tp = TransportParams.defaults();
tp.max_udp_payload_size = 1200_u64;
tp.initial_max_data = 1_048_576_u64;
tp.initial_max_streams_bidi = 100_u64;

// Encode into scratch buffer.
let mut wire: List<Byte> = [];
encode(&tp, &mut wire);

// Decode + validate bounds (callers treat `!bounds_ok()` as fatal).
let parsed = decode(wire.as_slice()).unwrap();
assert(parsed.bounds_ok());
```

## References

- `vcs/specs/L2-standard/net/quic/transport_params_defaults.vr`
- `vcs/specs/L2-standard/net/quic/transport_params_bounds.vr`
- `vcs/specs/L2-standard/net/quic/transport_params_encode_kat.vr`
- `vcs/specs/L2-standard/net/quic/transport_params_optionals_roundtrip.vr`
- `vcs/specs/L2-standard/net/quic/rfc9000_transport_params_roundtrip.vr`
- `vcs/specs/L2-standard/net/quic/preferred_address_roundtrip.vr`
- `vcs/specs/L2-standard/net/quic/v9_transport_params_theorem.vr`
