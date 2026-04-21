---
title: compress
description: Compression codecs (gzip / deflate / zlib / brotli / zstd / lz4)
---

# `core.compress`

**Layer 4.9 — Compression codecs**

Unified protocol-based interface over the compression codecs that
the Verum network stack needs: HTTP `Content-Encoding`, WebSocket
permessage-deflate, TLS certificate-compression, QUIC / RDMA payload
paths.

## Submodules

| Submodule | Purpose |
|-----------|---------|
| `compress.mod_gzip` | `Gzip`, `Deflate`, `Zlib` (RFC 1950–1952) |
| `compress.mod_brotli` | `Brotli` (RFC 7932) with configurable window |
| `compress.mod_zstd` | `Zstd` with optional dictionaries |
| `compress.mod_lz4` | `Lz4` (speed-priority) with raw-frame variant |

## Common surface — `core.compress`

```verum
public type Algorithm is
    | Gzip | Deflate | Zlib
    | Brotli | Zstd | Lz4 | Identity;

public type CompressError is
    | OutputTooLarge { limit: Int }
    | MalformedInput(Text)
    | BackendUnavailable;

public type Codec is protocol {
    fn encode(input: &[Byte], level: Int, out: &mut List<Byte>) -> Result<Int, CompressError>;
    fn decode(input: &[Byte], max_output_bytes: Int, out: &mut List<Byte>)
        -> Result<Int, CompressError>;
};

public fn encode(algo: Algorithm, input: &[Byte], level: Int,
                 out: &mut List<Byte>) -> Result<Int, CompressError>;
public fn decode(algo: Algorithm, input: &[Byte], max_output_bytes: Int,
                 out: &mut List<Byte>) -> Result<Int, CompressError>;
```

## HTTP `Content-Encoding` helpers

```verum
Algorithm.from_content_encoding(token: &Text) -> Maybe<Algorithm>
Algorithm.content_encoding(&self) -> &'static Text
```

Parses / formats the `Content-Encoding` header token (`gzip`,
`deflate`, `br`, `zstd`, `identity`). HTTP servers and proxies
dispatch through `encode` / `decode` after the content-type
negotiation step.

## Backend plugability

All four codecs are backed by `@intrinsic` calls — the runtime
wires them to the chosen backend (zlib-ng, brotli, libzstd, lz4)
at build time via a feature flag. The Verum-level surface never
changes when swapping backends.

## Example — gzip a payload

```verum
mount core.compress.*;
mount core.compress.mod_gzip.Gzip;

fn compress_body(raw: &[Byte]) -> Result<List<Byte>, CompressError> {
    let mut out = List.new();
    Gzip.encode(raw, 6 /* balanced level */, &mut out)?;
    Ok(out)
}
```

## Example — dictionary-based zstd

```verum
mount core.compress.mod_zstd.Zstd;

fn compress_log_line(dict: &[Byte], line: &[Byte])
    -> Result<List<Byte>, CompressError>
{
    let mut out = List.new();
    Zstd.encode_with_dict(line, dict, 3, &mut out)?;
    Ok(out)
}
```

## Example — dispatch via algorithm tag

```verum
fn encode_with_negotiated(algo: Algorithm, body: &[Byte])
    -> Result<List<Byte>, CompressError>
{
    let mut out = List.new();
    core.compress.encode(algo, body, 6, &mut out)?;
    Ok(out)
}
```
