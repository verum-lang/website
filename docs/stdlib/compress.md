---
title: core.compress — compression codecs
description: Bounded gzip and raw DEFLATE decoding, codec selection, and implementation limits.
status: regression-only
---

# `core.compress` — compression codecs

`Gzip.decode`, `Gzip.decode_single` and `Deflate.decode` implement bounded
decoding in Verum. `Identity` copies bytes without compression. Encoding and the
Zlib, Brotli, Zstd and Lz4 codecs still call unavailable runtime intrinsics.
Selecting one of those unavailable operations stops execution; it does not
silently choose another codec.

## Decode one gzip member

This complete program decodes a fixed gzip member and verifies its output.
Run it with `verum run --tier interpret` in a project.

```verum
mount core.compress.mod_gzip.Gzip;

fn main() {
    // One complete gzip member containing the UTF-8 bytes of "hello\n".
    let wire: List<Byte> = [
        31_u8, 139_u8, 8_u8, 0_u8, 0_u8, 0_u8, 0_u8, 0_u8, 2_u8, 19_u8, 203_u8, 72_u8, 205_u8, 201_u8, 201_u8, 231_u8, 2_u8, 0_u8, 32_u8, 48_u8, 58_u8, 54_u8, 6_u8, 0_u8, 0_u8, 0_u8,
    ];
    let mut output: List<Byte> = List.new();
    let count = Gzip.decode_single(wire.as_slice(), 1024, &mut output).unwrap();
    assert_eq(count, 6);
    assert_eq(Text.from_utf8(output.as_slice()).unwrap(), "hello\n");
    print("gzip verified");
}
```

The example verifies interpreter execution. It does not establish native AOT
support for every compression operation.

## Decoding contract

All three supported decoding methods take `input: &[Byte]`, a positive
`max_output_bytes: Int` and `out: &mut List<Byte>`. They return
`Result<Int, CompressError>`; the integer is the number of bytes appended.

| Method | Accepted input |
|---|---|
| `Gzip.decode` | One or more consecutive complete gzip members. |
| `Gzip.decode_single` | Exactly one complete gzip member. |
| `Deflate.decode` | One complete raw DEFLATE stream, without a container. |

The limit caps the bytes appended by this call, including all gzip members.
Previously existing output bytes are retained. Failure leaves `out` unchanged,
including when a later member fails after an earlier member decoded correctly.
The decoder stages its output before appending it, so budget memory for both
the decoded buffer and the destination rather than treating the API as a
streaming reader.

Gzip decoding validates headers, optional header fields, header CRC when
present, payload CRC32 and ISIZE. DEFLATE supports stored, fixed-Huffman and
dynamic-Huffman blocks. Invalid code trees, reserved symbols, impossible
back-references and truncated input are rejected. Trailing bytes, including
zero padding, are rejected; `decode_single` also rejects a second gzip member.
CRC and length checks detect corruption. They do not authenticate the sender.

## Limits and errors

Bound compressed input before calling a decoder and choose a realistic output
budget for the application. A positive expansion limit does not replace limits
on incoming request size, concurrent requests or the format inside the decoded
bytes. For a gzip-compressed tar archive, decode first, then call the
[strict tar reader](/docs/stdlib/archive#strict-complete-stream-reading) with its
own resource policy.

| Error | Meaning |
|---|---|
| `CorruptInput(Text)` | Invalid framing, truncation, checksum or compressed data. |
| `OutputTooLarge { limit }` | Nonpositive output limit or expansion exceeding the budget. |
| `UnsupportedAlgorithm(Algorithm)` | Declared error for an unavailable algorithm. |
| `BufferTooSmall { need, have }` | Declared error for insufficient fixed output storage. |
| `InvalidLevel { algo, level }` | Declared error for an invalid encoder level. |
| `DictionaryMismatch` | Declared dictionary incompatibility error. |
| `IoFailure(Text)` | Declared I/O error carrier. |

Unavailable intrinsic-backed codecs currently panic when called; their declared
`UnsupportedAlgorithm` variant is not a guarantee that those calls return it.
Do not use unavailable encoders to produce bytes for a decoding example.

## Module layout

| Module | Types and operations |
|---|---|
| `core.compress` | `Algorithm`, `CompressError`, `Codec`, `encode`, `decode`. |
| `core.compress.mod_gzip` | `Gzip`, `Deflate`, `Zlib`. Only gzip/raw-DEFLATE decoding is implemented. |
| `core.compress.mod_brotli` | Declared `Brotli` API; backend unavailable. |
| `core.compress.mod_zstd` | Declared `Zstd` and dictionary API; backend unavailable. |
| `core.compress.mod_lz4` | Declared `Lz4` API; backend unavailable. |

The implemented decoders use Verum arithmetic and the shared CRC32 code. They
do not select a system zlib or a bundled C decoder. This implementation fact
alone does not establish AOT dependency conformance for a compiled application.

## Algorithm selection

`Algorithm` contains `Gzip`, `Deflate`, `Zlib`, `Brotli`, `Zstd`, `Lz4` and
`Identity`. `content_encoding()` returns an HTTP token;
`Algorithm.from_content_encoding(&Text)` parses tokens case-insensitively and
returns `Maybe.None` for an unknown token.

| Algorithm | Token |
|---|---|
| `Gzip` | `gzip` |
| `Deflate`, `Zlib` | `deflate` |
| `Brotli` | `br` |
| `Zstd` | `zstd` |
| `Lz4` | `lz4` |
| `Identity` | `identity` |

The helper maps the ambiguous `deflate` token to raw `Deflate`; it does not
inspect zlib framing. An HTTP integration must apply its protocol's framing
rules rather than assuming that this token helper implements negotiation or
zlib decoding.

## Protocol and dispatch

`Codec` declares an `ALGORITHM` associated constant plus `encode` and `decode`
methods. Encoding takes a level; decoding takes an output limit. Both accept a
byte slice and mutable output list and return the number of appended bytes
through `Result<Int, CompressError>`.

The free functions in `core.compress` add an initial `Algorithm` argument and
dispatch to the selected codec. `decode` rejects a nonpositive output limit
before dispatch. `Identity` preserves input bytes and applies that bound;
selecting an unavailable codec does not make its backend available.

## See also

- [Archive packaging](/docs/stdlib/archive) — named entries inside decoded bytes.
- [Encoding formats](/docs/stdlib/encoding) — data representation, including JSON and Base64.
- [Networking](/docs/stdlib/net) — HTTP integrations and transport.
- [Decoder implementation](https://github.com/verum-lang/verum/blob/main/core/compress/mod_gzip.vr)
