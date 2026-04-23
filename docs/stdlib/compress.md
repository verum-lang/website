---
title: core.compress — compression codecs
description: Unified Codec protocol over gzip, raw deflate, zlib, brotli, zstd, and lz4. Used by HTTP Content-Encoding, WebSocket permessage-deflate, TLS certificate-compression, and QUIC / RDMA payload paths.
---

# `core.compress` — compression codecs

A single `Codec` protocol with six concrete implementations. Used by
every Verum layer that touches external byte streams:

- HTTP `Content-Encoding` negotiation and round-tripping
- WebSocket `permessage-deflate` extension
- TLS 1.3 certificate compression (RFC 8879)
- QUIC payload paths (`datagram` and `stream` frames)
- Log-pipeline code for archival compression
- RDMA zero-copy payload paths (`lz4` speed-priority)

## Spec alignment

| Codec | RFC / spec |
|-------|------------|
| Gzip | [RFC 1952](https://datatracker.ietf.org/doc/html/rfc1952) |
| Deflate (raw) | [RFC 1951](https://datatracker.ietf.org/doc/html/rfc1951) |
| Zlib | [RFC 1950](https://datatracker.ietf.org/doc/html/rfc1950) |
| Brotli | [RFC 7932](https://datatracker.ietf.org/doc/html/rfc7932) |
| Zstd | [RFC 8878](https://datatracker.ietf.org/doc/html/rfc8878) |
| Lz4 | [lz4 frame format v1.6.3](https://github.com/lz4/lz4/blob/v1.6.3/doc/lz4_Frame_format.md) |

## Module layout

| Submodule | Purpose |
|-----------|---------|
| `core.compress` (mod) | `Algorithm`, `CompressError`, `Codec` protocol, dispatch entry points |
| `core.compress.mod_gzip` | `Gzip`, `Deflate`, `Zlib` — the three RFC-195x formats |
| `core.compress.mod_brotli` | `Brotli` with configurable window |
| `core.compress.mod_zstd` | `Zstd` with optional dictionary support |
| `core.compress.mod_lz4` | `Lz4` speed-priority codec |

## `Algorithm` — runtime-dispatchable identifier

```verum
public type Algorithm is
    | Gzip        // RFC 1952 (deflate + header/footer)
    | Deflate     // RFC 1951 raw deflate (headerless)
    | Zlib        // RFC 1950 container around deflate
    | Brotli      // RFC 7932 — dense, text-optimised
    | Zstd        // RFC 8878 — tunable; negative levels = fast mode
    | Lz4         // pure speed, modest ratio
    | Identity;   // no-op fallback for negotiation
```

### HTTP `Content-Encoding` token helpers

```verum
implement Algorithm {
    public fn content_encoding(self) -> &'static Text;   // "gzip" | "deflate" | "br" | "zstd" | "lz4" | "identity"
    public fn from_content_encoding(token: &Text) -> Maybe<Algorithm>;
}
```

- `Zlib` shares the HTTP token `"deflate"` with raw `Deflate` (both
  appear as `deflate` on the wire; the distinguishing byte-level
  framing is settled by the zlib header `0x78 0x9C …`).
- `from_content_encoding` is case-insensitive and returns `None` for
  unknown tokens (server must respond with 415 Unsupported Media
  Type or fall back to `Identity`).

## `Codec` protocol

Every algorithm-specific wrapper implements:

```verum
public type Codec is protocol {
    const ALGORITHM: Algorithm;

    fn encode(input: &[Byte], level: Int, out: &mut List<Byte>)
        -> Result<Int, CompressError>;

    fn decode(input: &[Byte], max_output_bytes: Int, out: &mut List<Byte>)
        -> Result<Int, CompressError>;
};
```

- `encode` appends the compressed payload to `out`, returning the
  number of bytes appended.
- `decode` appends the decompressed payload, bounded by
  `max_output_bytes` — exceeding the bound surfaces as
  `CompressError.OutputTooLarge` to defend against zip-bomb inputs.
- The `ALGORITHM` associated const pins each implementation to its
  `Algorithm` variant; dispatch tables use it as the lookup key.

## Dispatch entry points

```verum
public fn encode(algo: Algorithm, input: &[Byte], level: Int,
                 out: &mut List<Byte>) -> Result<Int, CompressError>;
public fn decode(algo: Algorithm, input: &[Byte], max_output_bytes: Int,
                 out: &mut List<Byte>) -> Result<Int, CompressError>;
```

These two functions are the recommended surface for HTTP middleware
and proxy layers. They branch on the `Algorithm` variant to call the
correct concrete codec:

```verum
mount core.compress.{Algorithm, CompressError, encode, decode};

fn encode_with_negotiated(algo: Algorithm, body: &[Byte])
    -> Result<List<Byte>, CompressError>
{
    let mut out: List<Byte> = [];
    encode(algo, body, 6 /* balanced level */, &mut out)?;
    Ok(out)
}
```

## Error model

```verum
public type CompressError is
    | UnsupportedAlgorithm(Algorithm)            // backend feature-flag off
    | CorruptInput(Text)                         // bad header, premature EOF, etc.
    | BufferTooSmall { need: Int, have: Int }    // fixed-output encoder was short
    | InvalidLevel { algo: Algorithm, level: Int }   // level out of range
    | DictionaryMismatch                         // zstd dict ID/hash mismatch
    | OutputTooLarge { limit: Int }              // zip-bomb defence
    | IoError(Text);                             // I/O propagation from inner reader/writer
```

All variants are purely data; no I/O happens inside the error path
other than the caller's own propagation.

### Level ranges

| Algorithm | Valid level range | Typical default |
|-----------|-------------------|-----------------|
| `Gzip` / `Deflate` / `Zlib` | 0–9 | 6 |
| `Brotli` | 0–11 | 4 |
| `Zstd` | −(2²²)..22 | 3 |
| `Lz4` | 0–16 | 0 (fast) |
| `Identity` | any (ignored) | — |

`InvalidLevel { algo, level }` surfaces when the range check fails.

## Per-codec examples

### Gzip (HTTP bodies)

```verum
mount core.compress.mod_gzip.{Gzip};

fn compress_body(raw: &[Byte]) -> Result<List<Byte>, CompressError> {
    let mut out: List<Byte> = [];
    Gzip.encode(raw, 6 /* balanced */, &mut out)?;
    Ok(out)
}

fn decompress_body(wire: &[Byte]) -> Result<List<Byte>, CompressError> {
    let mut out: List<Byte> = [];
    // 10 MiB output cap is a typical HTTP-body defence.
    Gzip.decode(wire, 10 * 1024 * 1024, &mut out)?;
    Ok(out)
}
```

### Brotli (text-heavy payloads)

```verum
mount core.compress.mod_brotli.{Brotli};

let mut out: List<Byte> = [];
Brotli.encode(html.as_bytes(), 11 /* max quality */, &mut out)?;
```

Brotli at quality 11 is slow on the encode side but produces notably
smaller output for HTML / JSON / CSS than gzip-9; use brotli for
static assets and gzip / zstd for dynamic traffic.

### Zstd with dictionary

```verum
mount core.compress.mod_zstd.{Zstd};

fn compress_log_line(dict: &[Byte], line: &[Byte])
    -> Result<List<Byte>, CompressError>
{
    let mut out: List<Byte> = [];
    Zstd.encode_with_dict(line, dict, 3, &mut out)?;
    Ok(out)
}
```

Zstd dictionaries produce dramatic savings on log / metrics streams
where lines share a common vocabulary (e.g., repeated field names,
service tags, timestamps) — a 4-KiB trained dictionary typically
halves the per-line compressed size at zstd level 3.

### Lz4 (speed-priority)

```verum
mount core.compress.mod_lz4.{Lz4};

let mut out: List<Byte> = [];
Lz4.encode(payload, 0 /* fast */, &mut out)?;
```

`Lz4` at level 0 compresses at roughly network-cable throughput on
modern CPUs (≈ 3–5 GiB/s on a single thread) — the right choice for
zero-copy RDMA payloads and in-process cache tiers.

## DoS / security discipline

Two defences every decoder respects:

1. **`max_output_bytes` cap** — a small malicious input can expand to
   gigabytes if the decoder has no bound. Every `decode` call takes
   an explicit cap; exceeding it returns `OutputTooLarge { limit }`
   rather than a best-effort OOM.
2. **Header validation** — all decoders reject malformed headers /
   magic bytes immediately, before allocating the output buffer. A
   corrupt gzip header surfaces as `CorruptInput(reason)` within the
   first 10 bytes of input.

## Backend plugability

All six codecs are backed by `@intrinsic` calls — the runtime wires
them to the chosen native backend (zlib-ng, brotli-go, libzstd, lz4)
at build time via a feature flag. The Verum-level surface never
changes when swapping backends; `UnsupportedAlgorithm(a)` indicates
the compile-time feature flag for that codec is off.

## See also

- [`stdlib/encoding`](/docs/stdlib/encoding) — JSON / CBOR /
  MessagePack / Base64 — codec-shaped but for data format, not
  payload compression.
- [`stdlib/net`](/docs/stdlib/net) — HTTP `Content-Encoding`
  negotiation sits above this layer.
- [`stdlib/net/tls`](/docs/stdlib/net/tls/) — RFC 8879 certificate
  compression uses `Brotli` / `Zstd` backends through this API.
