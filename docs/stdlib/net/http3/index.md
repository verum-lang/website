# HTTP/3 + QPACK (`core.net.h3`) — pure-Verum

Pure-Verum implementation of HTTP/3 (RFC 9114) + QPACK (RFC 9204).
Part of the **warp** stack.

## Quick map

| Concern | Module | Doc |
|---------|--------|-----|
| H3 frames (DATA / HEADERS / ...) | `core.net.h3.frame` | [frames.md](frames.md) |
| Settings | `core.net.h3.settings` | [settings.md](settings.md) |
| Request / response | `core.net.h3.{request,client,server}` | [request.md](request.md) |
| Connection | `core.net.h3.connection` | [connection.md](connection.md) |
| Priority (RFC 9218) | `core.net.h3.priority` | [priority.md](priority.md) |
| QPACK encoder | `core.net.h3.qpack.encoder` | [qpack_encoder.md](qpack_encoder.md) |
| QPACK decoder | `core.net.h3.qpack.decoder` | [qpack_decoder.md](qpack_decoder.md) |
| QPACK static table (99 entries) | `core.net.h3.qpack.static_table` | [qpack_static.md](qpack_static.md) |
| QPACK dynamic table | `core.net.h3.qpack.dynamic_table` | [qpack_dynamic.md](qpack_dynamic.md) |
| Huffman (RFC 7541 App B) | `core.net.h3.qpack.huffman` | [huffman.md](huffman.md) |

## v0.1 scope

- HTTP/3 client + server over pure-Verum QUIC.
- QPACK at `QPACK_MAX_TABLE_CAPACITY = 0` (no dynamic table) — the
  baseline every major client negotiates; full dynamic-table mode
  lands in v1.1 (tracked in the warp roadmap).

## KAT coverage

| Test | Location |
|------|----------|
| Static table: 99 entries + out-of-range rejection | `vcs/specs/L2-standard/net/h3/qpack_static_table_coverage.vr` |
| Huffman round-trip (RFC 7541 §C.4 + 256-byte stress) | `vcs/specs/L2-standard/net/h3/qpack_huffman_roundtrip.vr` |
| Encoder/decoder round-trip (4 representation variants) | `vcs/specs/L2-standard/net/h3/qpack_encoder_decoder_roundtrip.vr` |
