---
title: encoding
description: Data encoding and serialization (JSON, CBOR, MessagePack, Base64/32/58, hex, PEM, JCS, JSON Pointer, varint, DER)
---

# `core.encoding`

**Layer 4.7 — Data encoding and serialization**

Pure-Verum encoders and decoders for every wire format production
code typically reaches for. The module covers textual encodings
(JSON, Base64/32/58, hex, PEM), binary wire formats (CBOR,
MessagePack, DER, varint), and the interoperability-critical
"canonical" / "pointer" sub-formats layered on top.

## Submodules

| Submodule | Purpose | Reference |
|-----------|---------|-----------|
| `encoding.json` | JSON reader + writer, zero-allocation parsing | RFC 8259 |
| `encoding.jcs` | JSON Canonicalization Scheme (signing-deterministic) | RFC 8785 |
| `encoding.json_pointer` | Path syntax for JSON sub-value lookup | RFC 6901 |
| `encoding.cbor` | Concise Binary Object Representation | RFC 8949 |
| `encoding.msgpack` | MessagePack binary encoder/decoder | spec.md |
| `encoding.base64` | Base64 (+ URL-safe variant) | RFC 4648 §4 / §5 |
| `encoding.base32` | Base32 (case-insensitive, trailing-bits validation) | RFC 4648 §6 |
| `encoding.base58` | Bitcoin-style Base58 + Base58Check | Satoshi |
| `encoding.hex` | Lowercase hex encoder + decoder | RFC 4648 §8 |
| `encoding.pem` | PEM textual envelope for DER blobs | RFC 7468 |
| `encoding.varint` | SQLite-style 1–9 byte varints | sqlite.org |
| `encoding.der` | ASN.1 Distinguished Encoding Rules | X.690 |

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

## `jcs` — JSON Canonicalization Scheme (RFC 8785)

```verum
mount core.encoding.jcs.{canonicalize_value, canonicalize_str};

public fn canonicalize_value(v: &JsonValue) -> Result<Text, JcsError>;
public fn canonicalize_str(input: &Text) -> Result<Text, JcsError>;
```

The deterministic JSON serialisation signing workflows require —
byte-identical output regardless of map-key insertion order so
signer and verifier produce the same input.

| Rule | §   | Effect |
| ---- | --- | ------ |
| Keys sorted by UTF-16 code unit | 3.2.3 | `{"b":1,"a":2}` → `{"a":2,"b":1}` |
| No whitespace | 3.2.4 | compact form |
| Integer-valued floats collapse | 3.2.2.1 | `1.0` → `1` |
| Minimal string escapes | 3.2.1 | only `"`, `\`, U+0000..U+001F |

Used by JWS-on-JSON, W3C Verifiable Credentials, DIDs, Matrix
room events, signed build manifests.

```verum
let canonical = jcs.canonicalize_str(&raw_json)?;
let digest = sha256(canonical.as_bytes());
```

Astral-plane characters (U+10000+) are decoded into UTF-16
surrogate pairs before comparison so the sort order matches the
`JSON.stringify(sorted)` form used by other JCS implementations.
`NaN` / ±Inf values return `UnsupportedValue` — JSON cannot
represent them.

## `json_pointer` — JSON Pointer (RFC 6901)

```verum
mount core.encoding.json_pointer.{
    JsonPointer, parse, format_json_pointer, resolve,
};

public fn parse(s: &Text) -> Result<JsonPointer, JsonPointerError>;
public fn format_json_pointer(p: &JsonPointer) -> Text;
public fn resolve(p: &JsonPointer, doc: &JsonValue) -> Maybe<JsonValue>;
```

Path syntax for referencing a specific sub-value inside a JSON
document. The building block behind JSON Patch (RFC 6902),
OpenAPI `$ref`, JSON Schema traversal, and CRDT operational
transforms.

| Token | Example | Meaning |
| ----- | ------- | ------- |
| `""` | root | whole document |
| `"/foo"` | `document["foo"]` | property by name |
| `"/foo/0"` | `document["foo"][0]` | array index |
| `"/a~1b"` | `document["a/b"]` | `/` escaped |
| `"/m~0n"` | `document["m~n"]` | `~` escaped |

Builder API for programmatic construction:

```verum
let p = JsonPointer.root()
    .push(Text.from("users"))
    .push(Text.from("0"))
    .push(Text.from("name"));
let s = json_pointer.format_json_pointer(&p);   // "/users/0/name"
```

## `cbor` — Concise Binary Object Representation (RFC 8949)

```verum
mount core.encoding.cbor.{CborValue, encode, decode, encode_canonical};

public fn encode(v: &CborValue) -> List<Byte>;
public fn decode(bytes: &[Byte]) -> Result<CborValue, CborError>;
public fn encode_canonical(v: &CborValue) -> List<Byte>;   // §4.2
```

Compact self-describing binary format used by COSE (RFC 9052),
CWT (RFC 8392), WebAuthn attestation, IoT / CoAP payloads, and
Verum's own stdlib disk-cache header.

Type coverage: unsigned/negative ints, byte strings, text
strings, arrays, maps, tagged values, bool/null/undefined,
half/single/double-precision floats. Decoder accepts definite
and indefinite-length forms; encoder emits only definite (per
§4.1 recommendation). f16/f32 payloads widen to f64 via bit-
exact manual conversion — no float-cast intrinsic dependency.

`encode_canonical` sorts map keys by encoded byte-lex order for
deterministic signing (the form required by COSE).

## `msgpack` — MessagePack

```verum
mount core.encoding.msgpack.{MsgPackValue, encode, decode};
```

Binary alternative to JSON used by Redis RESP3, Pinterest MySQL
adapter, PyPy, Erlang / Ruby / Python msgpack libraries. Full
type coverage: nil / bool / int (u64 / i64 range with smallest-
container encoding) / float32 / float64 / str / bin / array /
map / ext. Encoder auto-selects the most compact wire form for
each value; decoder handles every fixed + 8/16/32 length
variant.

Nesting guarded at `MAX_MSGPACK_NESTING = 128`; pathological
inputs return `NestingTooDeep` rather than overflowing the
stack. Trailing bytes after a complete value return
`TrailingBytes` — no silent partial-parse.

## `base32` — RFC 4648 §6

```verum
mount core.encoding.base32.{encode, decode, decode_no_pad};
```

Alphabet `A-Z` + `2-7`, case-insensitive on decode, `=` padded
to a multiple of 8 chars. Trailing-bits validation per §3.5
(the unused low bits of the last quintet MUST be zero; non-zero
→ `TrailingBits`). `decode_no_pad` accepts QR-code-style inputs
that drop padding — used for TOTP secret sharing (Google
Authenticator).

## `base58` — Bitcoin-style

```verum
mount core.encoding.base58.{
    encode, decode, encode_check, decode_check, BASE58_ALPHABET,
};
```

Alphabet `123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz`
(omits `0`, `O`, `I`, `l` to avoid human-confusion during copy-
paste). Zero-prefix bytes map to leading `1`s (the classic
Bitcoin rule). `encode_check` / `decode_check` append a 4-byte
double-SHA256 suffix — a one-character flip has probability
2^-32 of passing.

Used by Bitcoin legacy addresses (P2PKH / P2SH), Solana public
keys, Stellar StrKey, IPFS v0 CIDs, Monero subaddresses.

## `pem` — RFC 7468

```verum
mount core.encoding.pem.{
    PemBlock, encode_block, encode_bundle, decode_one, decode_all,
};
```

Textual envelope for DER blobs. Label-agnostic — callers dispatch
on `block.label` to pick the parser (`"CERTIFICATE"`,
`"PRIVATE KEY"`, `"RSA PRIVATE KEY"`, `"CERTIFICATE REQUEST"`,
`"X509 CRL"`, etc.).

```verum
let text = pem.encode_block("CERTIFICATE", der.as_slice());
let blocks = pem.decode_all(&text)?;     // concatenated-bundle aware
```

Line-wraps at 64 base64 chars per §2. Preamble text before the
first `-----BEGIN` is ignored per §2 (the `openssl x509 -text`
headers pass through). Label-mismatch on begin/end returns
`MismatchedLabels` — the RFC-required rejection.

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
