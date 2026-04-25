---
slug: warp-stack
title: "Pure-Verum TLS 1.3 + QUIC + HTTP/3 — the warp stack ships"
authors: [verum-team]
tags: [networking, verification, tls, quic, http3, warp]
---

We re-implemented the modern transport security and HTTP stack in
pure Verum, with byte-exact wire conformance to RFCs 8446 / 9000 /
9001 / 9002 / 9114 / 9204 / 5280, ten Z3-discharged refinement
theorems on top, and zero dependencies on rustls / quiche / msquic /
BoringSSL. Codename: **warp**. Status: shipping.

<!-- truncate -->

## What ships

| Stack | Module | RFC | L2 tests |
|-------|--------|-----|---------:|
| TLS 1.3 | `core.net.tls13` | 8446 + 8449 + 8879 | 76 |
| QUIC v1 | `core.net.quic` | 9000 + 9001 + 9002 + 9221 + 9287 | 128 |
| HTTP/3 + QPACK | `core.net.h3` | 9114 + 9204 + 9218 + 9220 + 9297 | 24 |
| X.509 PKIX | `core.security.x509` | 5280 + 6066 + 6125 + 6960 + 6962 | 31 |
| RFC 8448 + 9001 KATs | `vcs/specs/L2-standard/net/kat/` | — | 6 |

Every line of wire-format code is mirrored by a byte-exact
known-answer test. Every refinement-typed invariant has a Z3
discharge under `@verify(z3)`. The CI gate has been green
continuously since the Phase 8 closeout last week.

## Why this matters

`rustls` + `quiche` are excellent and we use them in production
elsewhere. They are also the existence proof that one can write a
correct TLS 1.3 / QUIC stack in a memory-safe language. What they
do **not** do — and what no other production-grade implementation in
any language does today — is **prove** the protocol invariants at
compile time.

Take ACK ranges. RFC 9000 §19.3.1 requires every ACK range list to
be non-overlapping, strictly descending, with gaps ≥ 2. In rustls's
`quiche` companion, this is two `debug_assert`s plus a property
test that fires on `cargo test`. In warp, this is a refinement type
on `AckRanges` plus a Z3 obligation V3 that proves
`AckRanges.insert(pn)` preserves the invariant for every possible
sequence of insertions. The Z3 query takes 3.1 seconds at compile
time and never has to run again. If you change `insert`'s body in a
way that breaks the invariant, the compiler rejects the change.

Multiply that by ten — the spec at
`internal/specs/tls-quic.md §9` enumerates V1 through V10 — and
you have a stack where:

- TLS 1.3 `derive_secret` is proven label-injective (V1).
- KeyUpdate is proven monotonic with peer-gap ≤ 1 (V2).
- ACK-range invariants hold across every insertion (V3).
- PN spaces are proven monotonic per direction (V4).
- NewReno cwnd is proven ≥ 2× MAX_DATAGRAM_SIZE (V5).
- Active CID count never exceeds the negotiated limit (V6).
- Path amplification budget is proven 3×-bounded (V7).
- AEAD record sequence is proven strictly monotonic (V8).
- Transport-params bounds (RFC 9000 §18.2) are proven (V9).
- X.509 chain validation has a structural-completeness proof (V10).

These are not test cases. They are **theorems**.

## Architecture sketch

```
┌────────────────────────────────────────────────────────┐
│ APPLICATION                                             │
│   core.net.h3.client / .server  (RFC 9114 + 9204)      │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ TRANSPORT                                               │
│   core.net.quic.api.{QuicClient, QuicServer}           │
│   ├── packet  (RFC 9000 §17 wire codec)                │
│   ├── frame   (RFC 9000 §19 — all 20 types)            │
│   ├── crypto  (RFC 9001 — AEAD + HP + Retry)           │
│   ├── recovery (RFC 9002 — NewReno / CUBIC / BBR)      │
│   └── transport (UDP + SimNetwork + batch_io)          │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ HANDSHAKE                                               │
│   core.net.tls13.handshake.{client_sm, server_sm}      │
│   ├── extension (RFC 8446 §4.2 — every registered ext) │
│   ├── keyschedule (RFC 8446 §7 — Early/HS/Master)      │
│   ├── transcript (RFC 8446 §4.4.1 + HRR reseed)        │
│   └── psk + resumption + 0-RTT                         │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ RECORD LAYER                                            │
│   core.net.tls13.record.{plaintext, aead}              │
│   AEAD seal/open with V8-monotonic sequence            │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ PRIMITIVES                                              │
│   core.security.{aead, ecc, sig, hash, kdf, mac}       │
│   AES-128/256-GCM, ChaCha20-Poly1305, X25519, Ed25519, │
│   ECDSA-P-256/384, RSA-PSS, SHA-2, HKDF, HMAC          │
└────────────────────────────────────────────────────────┘
```

Zero unsafe blocks anywhere in the stack. Zero `verum.tls.*` or
`verum.quic.*` intrinsic escapes. The connection-state machine is
**typed** — `QuicConnection<Initial>`, `QuicConnection<Handshake>`,
`QuicConnection<OneRtt>`, `QuicConnection<Closing>` — so calling
`write_application_data` on a connection that hasn't completed the
handshake is a type error, not a runtime check.

## Performance

Warp targets parity with rustls + quiche, not "best in class". On a
c5n.4xlarge:

| Metric | warp | rustls/quiche | Δ |
|--------|------|---------------|----|
| TLS 1.3 1-RTT handshake (ms) | 1.8 | 1.6 | +12 % |
| AES-128-GCM seal (no AES-NI) | 3.1 GB/s | 3.0 GB/s | ≈ |
| QUIC packet process (1350 B) | 1.5 µs | 1.3 µs | +15 % |
| Mem per idle connection | 4.0 KiB | 3.2 KiB | +25 % |

We are 12-25 % heavier on every hot path. That gap will close to
single digits once the AES-NI / AVX-512 / io_uring intrinsics land
(Phase 7 of the spec roadmap, in flight). For now the trade is
intentional: every byte of wire format goes through code with proof
artifacts attached.

## Try it

```bash
$ git clone https://github.com/oldman/verum
$ cd verum/vcs
$ make test-l2-net
[…]
ALL TESTS PASS — 265/265 (100.0%)
```

Then dial:

```verum
mount core.net.h3.client.{H3Client, ClientOptions};

let opts = ClientOptions.with_system_trust();
let mut client = H3Client.connect(&f"https://example.com", opts).await?;
let resp = client.get(&f"/").await?;
print(f"status={resp.status()}");
```

[Cookbook recipes](/docs/cookbook/h3-client) for client + server,
[deep-dive pages](/docs/stdlib/net/quic/) for every RFC sub-section,
and the [verified HTTP/3 service tutorial](/docs/tutorials/h3-service)
walk through end-to-end.

## What's next

- **Phase 7 — performance.** AES-NI / ARM Crypto / AVX-512 ChaCha20
  intrinsics, io_uring registered buffers on Linux, BBRv2 tuning
  against full QUIC Interop Runner matrix.
- **Post-quantum.** ML-KEM-768 hybrid key exchange — `core.security.pq`
  ships the primitive; integration into the TLS 1.3 key schedule is
  P1 once IANA codepoints stabilise.
- **DTLS 1.3.** Separate branch when there's demand.
- **QUIC v2** (RFC 9369). After v1 has soaked in production at scale.

## Acknowledgements

The IETF working groups that wrote the RFCs are doing the world's
work. The rustls + quiche teams are the existence proof that we
could even attempt this. Florian and Reinhard's PSI book is what
made the type-level proofs tractable.

The whole stack is on `main` at `oldman/verum` and the spec at
[`internal/specs/tls-quic.md`](https://github.com/oldman/verum/blob/main/internal/specs/tls-quic.md).
