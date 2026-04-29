---
sidebar_position: 2
title: HTTP/3 frames (RFC 9114 §7)
description: Byte-exact wire layout of every HTTP/3 frame type on request, response, and control streams.
---

# HTTP/3 frames — RFC 9114 §7

Every HTTP/3 frame has the common shape:

```
HTTP/3 Frame Format {
    Type (i),              ← QUIC varint
    Length (i),            ← QUIC varint: payload byte-count
    Frame Payload (..),
}
```

Frames are carried on:

- **Control stream** — server-initiated uni stream 0x03; SETTINGS,
  CANCEL_PUSH, GOAWAY, MAX_PUSH_ID.
- **Request / response streams** — bidi streams 0x00–0xFFFFFFFC;
  DATA, HEADERS, PUSH_PROMISE.
- **Push stream** — server-initiated uni stream 0x01; HEADERS, DATA.

Both Type and Length are QUIC varints (§16). Unknown frame types on
request or control streams MUST be ignored (§7.2.8). GREASE frame
types `0x1F × N + 0x21` from RFC 8701 exercise that discipline.

## Frame catalogue

| Type | Name | Control | Request | Semantics |
|-----:|------|:-------:|:-------:|-----------|
| 0x00 | `DATA` | — | ✓ | Body byte stream |
| 0x01 | `HEADERS` | — | ✓ | QPACK-encoded field section |
| 0x03 | `CANCEL_PUSH` | ✓ | — | Reject a server push (push_id varint) |
| 0x04 | `SETTINGS` | ✓ | — | Parameter list (id, value) varint pairs |
| 0x05 | `PUSH_PROMISE` | — | ✓ | Server push announce (push_id + headers) |
| 0x07 | `GOAWAY` | ✓ | — | Graceful shutdown (stream_id or push_id) |
| 0x0D | `MAX_PUSH_ID` | ✓ | — | Raise push budget (max_push_id) |
| any | `ReservedFrame` | both | both | Pass-through, ignore per §7.2.8 |

## SETTINGS frame body (§7.2.4)

```
SETTINGS Frame {
    Type (i) = 0x04,
    Length (i),
    Settings Entries (..) {
        Identifier (i),
        Value (i),
    }
}
```

Registered identifiers:

| ID | Name | Default | RFC |
|---:|------|--------:|-----|
| 0x01 | `QPACK_MAX_TABLE_CAPACITY` | 0 | RFC 9204 §5 |
| 0x06 | `MAX_FIELD_SECTION_SIZE` | u64.MAX | RFC 9114 §7.2.4.1 |
| 0x07 | `QPACK_BLOCKED_STREAMS` | 0 | RFC 9204 §5 |
| 0x08 | `ENABLE_CONNECT_PROTOCOL` | 0 (off) | RFC 9220 |
| 0x33 | `H3_DATAGRAM` | 0 (off) | RFC 9297 |

`core.net.h3.settings.H3Settings.defaults()` matches the spec
defaults. `from_entries` / `to_entries` round-trips the wire form.

Byte-exact SETTINGS with `qpack_max_table_capacity=4`,
`max_field_section_size=8`:

```
[0x04]        ← SETTINGS type
[0x04]        ← length = 4
[0x01 0x04]   ← qpack_max_table_capacity = 4
[0x06 0x08]   ← max_field_section_size = 8
```

See [`frame_encode_kat`](#references) and
[`settings_codepoints`](#references).

## Frame legality (§7.2)

| Frame | On control | On request | On push |
|-------|:---:|:---:|:---:|
| DATA | ✗ | ✓ | ✓ |
| HEADERS | ✗ | ✓ | ✓ |
| CANCEL_PUSH | ✓ | ✗ | ✗ |
| SETTINGS | first only | ✗ | ✗ |
| PUSH_PROMISE | ✗ | ✓ (client → server) | ✗ |
| GOAWAY | ✓ | ✗ | ✗ |
| MAX_PUSH_ID | ✓ | ✗ | ✗ |
| ReservedFrame | ✓ | ✓ | ✓ |

The ADT carries this in two predicate methods:

```verum
impl H3Frame {
    public fn is_control_stream_legal(&self) -> Bool;
    public fn is_request_stream_legal(&self) -> Bool;
}
```

Illegal frame on the wrong stream triggers `H3Error.FRAME_UNEXPECTED`.

## Connection establishment

First byte on the control stream must be the stream-type prefix
(varint `0x00` for control), followed immediately by a SETTINGS frame:

```
[0x00]                                ← control stream type (varint)
[0x04] [len] [settings entries...]    ← SETTINGS frame
[further control frames...]
```

Other server-initiated uni streams:

- **QPACK encoder stream** — type `0x02`
- **QPACK decoder stream** — type `0x03`

Client emits its own encoder / decoder streams mirroring the roles.
See [QPACK](./qpack).

## Server push flow

Client permits push by advertising `MAX_PUSH_ID`; server opens a
PUSH_PROMISE on a request stream referencing a pushed-resource
`push_id`; server subsequently opens a push uni-stream carrying the
response headers + body.

PUSH_PROMISE wire:

```
[0x05]                          ← type
[length]                        ← varint: push_id_len + encoded_headers_len
[push_id]                       ← varint
[encoded_headers ...]           ← QPACK field section
```

Flow control:

- `CANCEL_PUSH(push_id)` — either side rejects an outstanding push.
- `MAX_PUSH_ID(id)` — client raises the server's push allowance.

See [server push](./server-push).

## GOAWAY

Graceful-shutdown signal on the control stream. Payload is a single
varint:

- **From server:** the last `stream_id` the server will process.
- **From client:** the last `push_id` the client will accept.

Further streams above that id must be reset with
`H3_REQUEST_CANCELLED`.

## References

- `core/net/h3/frame.vr`
- `vcs/specs/L2-standard/net/h3/frame_encode_kat.vr`
- `vcs/specs/L2-standard/net/h3/frame_roundtrip.vr`
- `vcs/specs/L2-standard/net/h3/frame_type_codepoints.vr`
- `vcs/specs/L2-standard/net/h3/settings_codepoints.vr`
- `vcs/specs/L2-standard/net/h3/frame_qpack_typecheck.vr`
- `vcs/specs/L2-standard/net/h3/h3_error_variants.vr`
