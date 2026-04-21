---
title: encoding
description: Data encoding and serialization (JSON, base64, hex)
---

# `core.encoding`

**Layer 4.7 — Data encoding and serialization**

Pure-Verum encoders / decoders for wire formats the stdlib needs
internally and that every Verum application tends to reach for:
strict JSON, URL-safe base64, lowercase hex.

## Submodules

| Submodule | Purpose |
|-----------|---------|
| `encoding.json` | RFC 8259 strict JSON reader + writer, zero-allocation parsing |
| `encoding.base64` | RFC 4648 base64 (+ url-safe variant) |
| `encoding.hex` | Lowercase hex encoder + decoder |
| `encoding.varint` | SQLite-style variable-length integers (1–9 bytes) |

Two sibling varint encodings live in the stdlib next to the wire
formats that need them and are not duplicated here: **LEB128** lives
at `core.protobuf.wire` (Protocol Buffers style, little-endian) and
**QUIC varint** lives at `core.net.http3.frame` (1/2/4/8-byte
length-prefixed, RFC 9000 §16).

## `json`

```verum
mount core.encoding.json.*;

public type JsonValue is
    | Null
    | Bool(Bool)
    | Number(Float)
    | Text(Text)
    | Array(List<JsonValue>)
    | Object(List<(Text, JsonValue)>);

public fn parse(input: &[Byte]) -> Result<JsonValue, JsonError>;
public fn serialize(value: &JsonValue, out: &mut Text);
public fn serialize_pretty(value: &JsonValue, out: &mut Text, indent: Int);
```

Strict RFC-8259 semantics — no trailing commas, no comments, no
single-quoted strings. The parser is zero-allocation for primitive
leaves; only `Array` / `Object` allocate to own their decoded
children.

## `base64`

```verum
mount core.encoding.base64.*;

public fn encode(input: &[Byte]) -> Text;              // RFC 4648 §4
public fn encode_url(input: &[Byte]) -> Text;          // §5 URL-safe alphabet
public fn decode(input: &Text) -> Result<List<Byte>, Base64Error>;
public fn decode_url(input: &Text) -> Result<List<Byte>, Base64Error>;
```

Default encoder emits `=` padding. URL-safe variant uses `-_`
instead of `+/` and omits padding (web-friendly).

## `hex`

```verum
mount core.encoding.hex.*;

public fn encode(input: &[Byte]) -> Text;                 // lowercase
public fn decode(input: &Text) -> Result<List<Byte>, HexError>;
```

Case-insensitive decoder, lowercase encoder (matches RFC 4648 §8).

## `varint` — SQLite-style

```verum
mount core.encoding.varint.*;

public fn sqlite_encoded_len(value: Int64) -> Int;
public fn sqlite_encode_into(out: &mut List<Byte>, value: Int64) -> Int;
public fn sqlite_encode(value: Int64) -> List<Byte>;
public fn sqlite_decode(buf: &[Byte], start: Int) -> Result<(Int64, Int), VarintError>;
public fn sqlite_decode_first(buf: &[Byte]) -> Result<(Int64, Int), VarintError>;
public fn sqlite_skip(buf: &[Byte], start: Int) -> Result<Int, VarintError>;
```

Big-endian 1–9 byte form used throughout the SQLite file format (see
[sqlite.org/fileformat2.html](https://www.sqlite.org/fileformat2.html)
under "Varint"). Bytes 1–8 carry 7 data bits + continuation bit in
the MSB; byte 9 (if present) holds the remaining 8 bits with no
continuation. The full signed i64 range is covered — negative values
use the 9-byte form because their top bit is always set, unlike
LEB128 which zig-zags first.

Errors (`VarintErrorKind`):

| Kind | When |
|------|------|
| `Truncated` | Input buffer ends mid-varint or before byte 9 |
| `Overflow` | Reserved for future extensions; no i64 input triggers it |

## Example — JSON round-trip

```verum
mount core.encoding.json.{parse, serialize, JsonValue};

fn round_trip() -> Result<(), json::JsonError> {
    let raw = b"{\"id\": 42, \"tags\": [\"a\", \"b\"]}";
    let value = parse(raw)?;
    let mut out = Text.new();
    serialize(&value, &mut out);
    Ok(())
}
```

## Example — bearer token encoding

```verum
mount core.encoding.base64.encode_url;
mount core.security.hash.sha256.Sha256;

fn bearer_from_secret(secret: &[Byte]) -> Text {
    let digest = Sha256.digest(secret);
    encode_url(&digest)
}
```
