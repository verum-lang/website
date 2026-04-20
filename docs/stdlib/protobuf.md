---
title: protobuf
description: Protocol Buffers wire-format codec
---

# `core.protobuf`

**Layer 4.7.5 — Protocol Buffers wire-format codec**

Low-level protobuf encoder + decoder. Sufficient to hand-build message
layouts for gRPC / Connect clients and servers. Schema-driven
code-generation (from `.proto` files) is a meta-programming follow-up.

## Module layout

| Submodule | Purpose |
|-----------|---------|
| `protobuf.wire` | Varint, tag, wire-type, ZigZag, fixed32/64, Cursor |
| `protobuf.error` | `ProtobufError`, `DecodeResult<T>` |

## Wire types

| Wire | Kind | Used for |
|------|------|----------|
| 0 | `Varint` | int32/int64/uint32/uint64/bool/enum/sint32/sint64 |
| 1 | `Fixed64` | fixed64, sfixed64, double |
| 2 | `LengthDelim` | string, bytes, embedded message, packed repeat |
| 5 | `Fixed32` | fixed32, sfixed32, float |

Wire types 3 and 4 (start-group / end-group) are rejected with
`UnsupportedGroup` — proto2 groups are deprecated.

## Tag format

`tag = (field_number << 3) | wire_type`, encoded as a varint.

```verum
// Write a { f1: int32 = 150 } message
let mut out = List.new();
write_tag(&mut out, 1, WireType.Varint);
write_varint(&mut out, 150);
```

## ZigZag signed-varint encoding

```
encoded = (n << 1) ^ (n >> 31)     // sint32
encoded = (n << 1) ^ (n >> 63)     // sint64
```

Encoders `encode_zigzag_32 / 64` and decoders `decode_zigzag_32 / 64`
handle the bit twiddling. `write_sint32` / `write_sint64` combine
ZigZag + varint for the proto3 `sint32` / `sint64` types.

## Streaming reader — `Cursor`

```verum
let mut cursor = Cursor.new(&buf);
while !cursor.at_end() {
    let (field, wire_type) = cursor.read_tag()?;
    match (field, wire_type) {
        (1, WireType.Varint) => handle_f1(cursor.read_varint()?),
        (2, WireType.LengthDelim) => handle_f2(cursor.read_string()?),
        (3, WireType.Fixed64) => handle_f3(cursor.read_fixed64()?),
        (_, wt) => cursor.skip(wt)?,  // unknown fields are forwarded
    }
}
```

`Cursor` methods:

| Method | Returns |
|--------|---------|
| `read_tag()` | `(field_number, wire_type)` |
| `read_varint() / read_sint32 / read_sint64` | decoded integer |
| `read_fixed32 / read_fixed64` | little-endian decoded |
| `read_bool()` | boolean from varint |
| `read_string()` | UTF-8-validated `Text` |
| `read_bytes()` | owned `List<Byte>` |
| `read_length_delim_view()` | `(offset, len)` — zero-copy view into buffer |
| `skip(wire_type)` | advance past a field of unknown shape |

## Error variants

| Variant | When |
|---------|------|
| `UnexpectedEof` | Reader hit end of buffer mid-field |
| `VarintOverflow` | Varint exceeded 10 bytes |
| `InvalidWireType(b)` | Non-0/1/2/5 wire-type bits |
| `InvalidLength { declared, available }` | Length-delim claims more bytes than available |
| `InvalidUtf8` | `read_string` encountered invalid UTF-8 |
| `InvalidFieldNumber(n)` | Field number 0 (reserved) |
| `UnsupportedGroup` | Wire type 3 or 4 |

## Performance notes

- Varint read / write is a tight loop bounded by 10 bytes.
- Fixed-width reads / writes are single little-endian loads / stores.
- `read_length_delim_view` returns `(offset, len)` pairs so the caller
  can slice into the input buffer with no copy — used heavily in
  zero-copy gRPC / Connect decoders.
