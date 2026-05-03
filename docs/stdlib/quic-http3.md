---
title: QUIC and HTTP/3 — redirect
description: The pure-Verum QUIC v1 (RFC 9000/9001/9002) + HTTP/3 (RFC 9114) + QPACK (RFC 9204) stack now lives under dedicated sections.
---

# QUIC and HTTP/3

The QUIC + HTTP/3 documentation has moved into dedicated stack sections
that mirror the real implementation layout:

- **[`core.net.quic`](/docs/stdlib/net/quic/)** — QUIC v1 transport (RFC
  9000 / 9001 / 9002) with deep-dive pages for
  [frames](/docs/stdlib/net/quic/frames),
  [packets](/docs/stdlib/net/quic/packets),
  [cryptography](/docs/stdlib/net/quic/crypto),
  [transport parameters](/docs/stdlib/net/quic/transport-params), and
  [recovery](/docs/stdlib/net/quic/recovery).
- **[`core.net.tls13`](/docs/stdlib/net/tls/)** — TLS 1.3 handshake that
  QUIC Initial + Handshake packets carry inside CRYPTO frames; pages
  for the [handshake state machine](/docs/stdlib/net/tls/handshake),
  [extension catalogue](/docs/stdlib/net/tls/extensions),
  [key schedule](/docs/stdlib/net/tls/keyschedule), and
  [record layer](/docs/stdlib/net/tls/record-layer).
- **[`core.net.h3`](/docs/stdlib/net/http3/)** — HTTP/3 + QPACK on top
  of QUIC, with pages for [frames](/docs/stdlib/net/http3/frames),
  [QPACK](/docs/stdlib/net/http3/qpack),
  [priority](/docs/stdlib/net/http3/priority), and
  [server push](/docs/stdlib/net/http3/server-push).

## Why the split

The earlier single-page layout documented an intrinsic-backed version
that delegated to quiche / msquic / lsquic. The current implementation
is **pure Verum** end-to-end: frame codec, packet crypto (AEAD +
header protection), loss-detection + congestion control (NewReno /
CUBIC / BBR), QPACK encoder / decoder, and the TLS 1.3 handshake that
drives the key schedule. Each layer has its own byte-exact KAT suite
mirrored in `vcs/specs/L2-standard/net/`.

The high-level facade is still `core.net.quic.api.{QuicClient,
QuicServer}`; the semantics have not changed.

## Where the high-level facade lives

See the cookbook recipes
[`quic-client`](/docs/cookbook/quic-client),
[`quic-server`](/docs/cookbook/quic-server),
[`h3-client`](/docs/cookbook/h3-client), and
[`h3-server`](/docs/cookbook/h3-server) for runnable client and
server examples that use `core.net.quic.api` + `core.net.h3.client` +
`core.net.h3.server` directly.

## Status (2026-04-25)

| Layer | L2 tests | Pass | V-theorems |
|-------|---------:|------|------------|
| `core.net.tls13` | 76 | 100 % | V1, V2, V8 |
| `core.net.quic` | 128 | 100 % | V3, V4, V5, V6, V7, V9 |
| `core.net.h3` | 24 | 100 % | — |
| `core.security.x509` | 31 | 100 % | V10 |
| RFC 8448 + 9001 KATs | 6 | 100 % | — |

All ten refinement-typed verification obligations (V1–V10) are
discharged by the SMT backend as `verify-pass` theorems. Build green via
`cd vcs && make test-l2` against the full suite.
