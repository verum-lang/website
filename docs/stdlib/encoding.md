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
