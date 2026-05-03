---
sidebar_position: 3
title: QPACK header compression (RFC 9204)
description: Static + dynamic table, prefixed-integer encoding, Huffman codec, encoder / decoder stream instructions, and field sections.
---

# QPACK — RFC 9204

QPACK is the HPACK variant adapted for HTTP/3's out-of-order stream
delivery. Unlike HPACK's in-stream dynamic table updates, QPACK
isolates table mutations onto separate *encoder* and *decoder* streams
so field sections on request streams can reference the table without
creating head-of-line blocking.

`core.net.h3.qpack` modularity:

| Module | Role |
|--------|------|
| `qpack.static_table` | RFC 9204 Appendix A — the 99 static entries |
| `qpack.dynamic_table` | Size-bounded LRU insert window |
| `qpack.integer` | Prefixed-integer codec (§4.1.1) |
| `qpack.huffman` | Huffman encoder / decoder (RFC 7541 Appendix B) |
| `qpack.encoder` | Field-section emitter |
| `qpack.decoder` | Field-section parser + `HeaderField` |
| `qpack.instructions` | Encoder + decoder stream opcodes |
| `qpack.session` | Wrapper tying encoder/decoder to their streams |

## Prefixed integers (§4.1.1)

Integers are encoded with a variable-length prefix on the high bits
of the first byte plus continuation bytes with top bit set:

```
if value < 2^N - 1:
    emit [opcode | value]           ← N-bit-prefix + opcode
else:
    emit [opcode | (2^N - 1)]       ← mask overflow
    remaining = value - (2^N - 1)
    while remaining >= 128:
        emit [(remaining % 128) | 0x80]   ← continuation bit set
        remaining /= 128
    emit [remaining]                ← final byte, top bit clear
```

Examples (5-bit prefix with opcode 0x00):

| Value | Wire |
|------:|------|
| 10 | `0x0A` |
| 31 | `0x1F 0x00` (inline cap then 0 continuation) |
| 32 | `0x1F 0x01` |
| 1337 | `0xDF 0x9A 0x0A` (with opcode 0xC0, 5-bit prefix) |

See [`qpack_integer_kat`](#references).

## Static table (§3.2.2)

99 entries fixed at spec time. Key rows:

| Index | Name | Value |
|------:|------|-------|
| 0 | `:authority` | `` |
| 1 | `:path` | `/` |
| 17 | `:method` | `GET` |
| 21 | `:method` | `OPTIONS` |
| 23 | `:scheme` | `https` |
| 25 | `:status` | `200` |
| 29 | `:status` | `500` |
| 79 | `user-agent` | `` |

Full 99 rows in `core.net.h3.qpack.static_table.STATIC_TABLE` —
exhaustive pin in [`qpack_static_table_rfc9204`](#references).

## Dynamic table (§3.2.1)

Size-bounded by the `QPACK_MAX_TABLE_CAPACITY` SETTING the peer
advertised. Insertions via the *encoder stream*; each entry has an
absolute index assigned at insert time.

```verum
public type DynamicTable is { /* ring-buffer + size accounting */ };

public fn DynamicTable.new(max_capacity: UInt64) -> DynamicTable;
public fn DynamicTable.insert(&mut self, name: Text, value: Text)
    -> Result<Int, QpackError>;   ← returns absolute index
public fn DynamicTable.get(&self, abs_index: Int) -> Maybe<Entry>;
public fn DynamicTable.set_max_capacity(&mut self, new_cap: UInt64);
```

Entries evict from the oldest end when `current_size > max_capacity`.
`current_size = Σ (len(name) + len(value) + 32)` .1.

See [`qpack_dynamic_table`](#references).

## Encoder-stream instructions (§4.3.1)

Opcode taxonomy (high bits of first byte):

| Opcode | Instruction | Prefix width |
|:------:|-------------|:------------:|
| `001` | Set Dynamic Table Capacity | 5 bits |
| `1T`  | Insert with Name Reference (T = static flag) | 6 bits |
| `01H` | Insert with Literal Name (H = Huffman flag) | 5 bits |
| `000` | Duplicate (ref existing entry) | 5 bits |

Opcode byte layout:

```
Set Capacity:            0 0 1 x x x x x
Insert w/ Name Ref:      1 T x x x x x x     (T=1 → static, T=0 → dynamic)
Insert w/ Literal Name:  0 1 H x x x x x
Duplicate:               0 0 0 x x x x x
```

See [`qpack_instructions_kat`](#references).

## Decoder-stream instructions (§4.3.2)

| Opcode | Instruction | Prefix width |
|:------:|-------------|:------------:|
| `1`    | Section Acknowledgement | 7 bits |
| `01`   | Stream Cancellation | 6 bits |
| `00`   | Insert Count Increment | 6 bits |

```
Section Ack:             1 x x x x x x x     (stream_id)
Stream Cancel:           0 1 x x x x x x     (stream_id)
Insert Count Increment:  0 0 x x x x x x     (delta)
```

## Field sections (§4.5)

A field section is the payload of a `HEADERS` or `PUSH_PROMISE`
frame. Prefix:

```
[Encoded Required Insert Count (8-bit prefix, varint)]
[Sign-bit + Delta Base (7-bit prefix, varint)]
[field lines...]
```

For the `QPACK_MAX_TABLE_CAPACITY = 0` profile warp defaults to
(dynamic table disabled), both prefixes are 0 — wire prefix is
`0x00 0x00`.

Per-line opcodes:

| Opcode | Line | Prefix |
|:------:|------|:------:|
| `11T` | Indexed field line (T = static) | 6 bits |
| `0101T` | Literal field line with name ref (static only in this profile) | 4 bits |
| `0010NH` | Literal field line with literal name | 3 bits |

Example — `:method: GET` (static index 17):

```
[0x00 0x00]        ← RIC + Delta Base
[0xD1]             ← 0xC0 | 17 — indexed field line, static
```

Example — three-field request line for `GET https://example.com/`:

```
[0x00 0x00]
[0xD1]             ← :method GET (static 17)
[0xD7]             ← :scheme https (static 23)
[0xC1]             ← :path / (static 1)
```

See [`qpack_field_section_kat`](#references).

## Huffman codec (RFC 7541 Appendix B)

QPACK reuses the HPACK Huffman table. Strings inside field lines
carry a leading bit indicating Huffman-vs-literal encoding:

```
[H x x x x x x x]   ← H = Huffman flag, 7-bit prefix for length
[encoded bytes...]
```

Encoder chooses Huffman iff the encoded length is strictly shorter
than the raw byte length. See [`qpack_huffman_roundtrip`](#references)
and [`rfc9204_qpack_huffman`](#references).

## API surface

Symmetric client + server consumption:

```verum
mount core.net.h3.qpack.{HeaderField, encode_field_section, decode_field_section};

let headers: List<HeaderField> = [
    HeaderField { name: f":status",      value: f"200" },
    HeaderField { name: f"content-type", value: f"application/json" },
];
let wire: List<Byte> = encode_field_section(&headers);
// … send as a HEADERS frame payload …

let parsed = decode_field_section(wire.as_slice()).unwrap();
assert(parsed.len() == 2);
```

## References

- `vcs/specs/L2-standard/net/h3/qpack_integer_kat.vr`
- `vcs/specs/L2-standard/net/h3/qpack_static_table_rfc9204.vr`
- `vcs/specs/L2-standard/net/h3/qpack_static_table_coverage.vr`
- `vcs/specs/L2-standard/net/h3/qpack_dynamic_table.vr`
- `vcs/specs/L2-standard/net/h3/qpack_dynamic_table_surface.vr`
- `vcs/specs/L2-standard/net/h3/qpack_encode_decode_roundtrip.vr`
- `vcs/specs/L2-standard/net/h3/qpack_encoder_decoder_roundtrip.vr`
- `vcs/specs/L2-standard/net/h3/qpack_huffman_roundtrip.vr`
- `vcs/specs/L2-standard/net/h3/qpack_field_section_kat.vr`
- `vcs/specs/L2-standard/net/h3/qpack_instructions_kat.vr`
- `vcs/specs/L2-standard/net/h3/qpack_session_typecheck.vr`
- `vcs/specs/L2-standard/net/h3/qpack_error_variants.vr`
- `vcs/specs/L2-standard/net/kat/rfc9204_qpack_huffman.vr`
