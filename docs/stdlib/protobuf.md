---
title: core.protobuf — Protocol Buffers wire-format codec
description: Low-level encoder / decoder for the canonical Protocol Buffers wire format (Google's google.protobuf). Tag / varint / fixed / length-delimited encoding with a streaming Cursor reader and zero-copy view helpers.
---

# `core.protobuf` — Protocol Buffers wire-format codec

Low-level encoder / decoder for the canonical Protocol Buffers wire
format. Sufficient to hand-build message layouts for gRPC or Connect
clients and servers, to integrate with external services that speak
protobuf, or to implement ad-hoc binary protocols that reuse the
varint / length-delimited framing vocabulary.

Schema-driven code generation (from `.proto` files) is a separate
meta-programming follow-up; this crate stays deliberately at the
wire layer so that callers can compose it with any ADT of their
choosing.

## Spec alignment

| Concern | Authority |
|---------|-----------|
| Wire format | [Google Protocol Buffers Wire-Format Spec](https://protobuf.dev/programming-guides/encoding/) |
| Varint encoding | Little-endian base-128; MSB = continuation bit |
| ZigZag signed-int encoding | `(n << 1) ^ (n >> 31)` (32-bit), `(n << 1) ^ (n >> 63)` (64-bit) |
| Fixed32 / Fixed64 | IEEE 754 `bitcast` for `float` / `double`; little-endian |
| Length-delimited | Varint length prefix, then `len` raw bytes |
| Group wire types (3, 4) | Rejected — proto2-only, deprecated by spec |

## Module layout

| Submodule | Purpose |
|-----------|---------|
| `core.protobuf.wire` | `WireType`, varint / ZigZag / fixed / length-delim codecs, `Cursor` |
| `core.protobuf.error` | `ProtobufError`, `DecodeResult<T> = Result<T, ProtobufError>` |

## Wire types

| Wire value | Variant | Used for |
|------------|---------|----------|
| 0 | `WireType.Varint` | `int32`, `int64`, `uint32`, `uint64`, `bool`, `enum`, `sint32`, `sint64` |
| 1 | `WireType.Fixed64` | `fixed64`, `sfixed64`, `double` |
| 2 | `WireType.LengthDelim` | `string`, `bytes`, embedded message, packed repeat |
| 3 | `WireType.StartGroup` *(rejected)* | (proto2 legacy, not emitted; decoders reject with `UnsupportedGroup`) |
| 4 | `WireType.EndGroup` *(rejected)* | (as above) |
| 5 | `WireType.Fixed32` | `fixed32`, `sfixed32`, `float` |

```verum
public type WireType is
    | Varint
    | Fixed64
    | LengthDelim
    | StartGroup      // decoder-only variant; encoder never emits
    | EndGroup        // decoder-only variant; encoder never emits
    | Fixed32;
```

## Tag encoding

A tag is a varint equal to `(field_number << 3) | wire_type`:

```verum
public fn tag_value(field_number: UInt32, wire_type: WireType) -> UInt32;
public fn write_tag(out: &mut List<Byte>, field_number: UInt32, wire_type: WireType);
```

Field number `0` is reserved (decoding rejects it with
`ProtobufError.InvalidFieldNumber(0)`).

## Encoder API

```verum
public fn write_varint(out: &mut List<Byte>, value: UInt64);

public fn write_sint32(out: &mut List<Byte>, value: Int32);   // ZigZag + varint
public fn write_sint64(out: &mut List<Byte>, value: Int64);

public fn write_fixed32(out: &mut List<Byte>, value: UInt32);
public fn write_fixed64(out: &mut List<Byte>, value: UInt64);

public fn write_float32(out: &mut List<Byte>, value: Float);
public fn write_float64(out: &mut List<Byte>, value: Float);

public fn write_bool(out: &mut List<Byte>, value: Bool);

public fn write_string(out: &mut List<Byte>, value: &Text);
public fn write_bytes(out: &mut List<Byte>, value: &[Byte]);
```

Rules:

- `write_string` / `write_bytes` prepend a length varint, then append
  raw bytes (no UTF-8 re-validation on write — the `Text` surface
  guarantees UTF-8 by construction).
- `write_float32` / `write_float64` emit the IEEE 754 bit pattern
  via `to_bits` + `write_fixed32 / _64` — zero-aliasing, no round-
  trip through `Text`.
- Composing a full message is strictly tag-then-payload:

```verum
// message M { int32 f1 = 1; string f2 = 2; fixed64 f3 = 3; }
let mut out: List<Byte> = [];
write_tag(&mut out, 1, WireType.Varint);       write_varint(&mut out, 150_u64);
write_tag(&mut out, 2, WireType.LengthDelim);  write_string(&mut out, &"hello");
write_tag(&mut out, 3, WireType.Fixed64);      write_fixed64(&mut out, 0xDEAD_BEEF_u64);
```

## ZigZag signed-varint encoding

```text
encoded = (n << 1) ^ (n >> 31)     // sint32
encoded = (n << 1) ^ (n >> 63)     // sint64
```

Implemented by the four pure helpers:

```verum
public fn encode_zigzag_32(n: Int32) -> UInt32;
public fn encode_zigzag_64(n: Int64) -> UInt64;
public fn decode_zigzag_32(n: UInt32) -> Int32;
public fn decode_zigzag_64(n: UInt64) -> Int64;
```

`write_sint32` / `write_sint64` compose `encode_zigzag_*` with
`write_varint`; `read_sint32` / `read_sint64` compose the inverse.

## Decoder API (low-level)

```verum
public fn read_varint(buf: &[Byte], pos: Int) -> Result<(UInt64, Int), ProtobufError>;
public fn read_sint32(buf: &[Byte], pos: Int) -> Result<(Int32, Int), ProtobufError>;
public fn read_sint64(buf: &[Byte], pos: Int) -> Result<(Int64, Int), ProtobufError>;
public fn read_fixed32(buf: &[Byte], pos: Int) -> Result<(UInt32, Int), ProtobufError>;
public fn read_fixed64(buf: &[Byte], pos: Int) -> Result<(UInt64, Int), ProtobufError>;
```

Each returns `(decoded_value, new_pos)` so that callers can chain
reads off the same buffer without managing an explicit position
variable. `new_pos - pos` is the bytes consumed.

## Streaming reader — `Cursor`

```verum
public type Cursor is {
    buf: &[Byte],
    pos: Int,
};

let mut cursor = Cursor.new(&buf);
while !cursor.at_end() {
    let (field, wire_type) = cursor.read_tag()?;
    match (field, wire_type) {
        (1, WireType.Varint)      => handle_f1(cursor.read_varint()?),
        (2, WireType.LengthDelim) => handle_f2(cursor.read_string()?),
        (3, WireType.Fixed64)     => handle_f3(cursor.read_fixed64()?),
        (_, wt)                   => cursor.skip(wt)?,   // forward unknown fields
    }
}
```

Cursor method reference:

| Method | Returns |
|--------|---------|
| `read_tag()` | `(field_number: UInt32, wire_type: WireType)` |
| `read_varint()` / `read_sint32` / `read_sint64` | decoded integer |
| `read_fixed32` / `read_fixed64` | little-endian decoded |
| `read_bool()` | `Bool` from varint (`0` ↔ `false`, non-zero ↔ `true`) |
| `read_string()` | UTF-8-validated `Text` (produces `InvalidUtf8` on bad input) |
| `read_bytes()` | owned `List<Byte>` |
| `read_length_delim_view()` | `(offset: Int, len: Int)` — zero-copy view into `buf` |
| `skip(wire_type)` | advances past a field of unknown shape |
| `at_end()` | `Bool` — true when `pos == buf.len()` |

The `read_length_delim_view` shape is the performance-critical path
for zero-copy gRPC / Connect decoders — callers slice directly into
the source buffer rather than allocating a fresh `List<Byte>`.

## Error model

```verum
public type ProtobufError is
    | UnexpectedEof
    | VarintOverflow
    | InvalidWireType { bits: Byte }
    | InvalidLength { declared: Int, available: Int }
    | InvalidUtf8
    | InvalidFieldNumber(UInt32)
    | UnsupportedGroup;

public type DecodeResult<T> is Result<T, ProtobufError>;
```

| Variant | When |
|---------|------|
| `UnexpectedEof` | Reader hit end of buffer mid-field |
| `VarintOverflow` | Varint continuation chain exceeded 10 bytes (spec cap) |
| `InvalidWireType { bits }` | Non-`{0,1,2,3,4,5}` low-3 bits |
| `InvalidLength { declared, available }` | Length-delim prefix > remaining buffer |
| `InvalidUtf8` | `read_string` failed Unicode scalar-value validation |
| `InvalidFieldNumber(0)` | Field number 0 (reserved by spec) |
| `UnsupportedGroup` | Wire type 3 or 4 (deprecated proto2 groups) |

## Performance notes

- Varint read / write is a tight loop bounded by 10 bytes (the spec
  cap that prevents `UInt64` overflow). `VarintOverflow` fires if a
  malicious input keeps the continuation bit set past 10 bytes.
- Fixed-width reads / writes are single little-endian load / stores;
  on x86-64 they compile to a `MOV` (AOT path) or a 4/8-byte memcpy
  (interpreter).
- `read_length_delim_view` returns `(offset, len)` pairs so the
  caller can slice into the input buffer with no copy — the hot
  path for zero-copy gRPC.
- UTF-8 validation in `read_string` uses the same DFA as
  `core.text.text.from_utf8`; valid ASCII fast-paths.

## Unknown-field forwarding

A gRPC server implementing schema version N must forward unknown
fields from incoming requests unchanged to upstream services. The
`Cursor.skip(wire_type)` call advances past an arbitrary field
without inspecting its payload — paired with a running buffer-range
capture, this lets the caller re-emit the raw unknown bytes in the
response.

```verum
fn forward_unknown(cursor: &mut Cursor, out: &mut List<Byte>, field: UInt32, wt: WireType) -> DecodeResult<()> {
    let start = cursor.pos;
    cursor.skip(wt)?;
    let raw = &cursor.buf[start..cursor.pos];
    write_tag(out, field, wt);
    for b in raw { out.push(*b); }
    Ok(())
}
```

## See also

- [`stdlib/encoding`](/docs/stdlib/encoding) — JSON / CBOR /
  MessagePack / Base64 / varint codecs when the wire format isn't
  protobuf.
- [`stdlib/http2`](/docs/stdlib/http2) — the transport gRPC /
  Connect rides on.
- Google's [protobuf language guide](https://protobuf.dev/programming-guides/proto3/)
  for the `.proto`-schema conventions.
