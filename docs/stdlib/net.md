---
sidebar_position: 1
title: net
description: TCP, UDP, HTTP, TLS, DNS — V-LLSI-native networking with zero FFI.
status: partial
status_detail: >-
  2026-07-05 round 19: 9 submodules stable; addr/dns/http/tls partial; 12 transport modules regression-only pending a network test harness; deep codegen crashers pinned. History: core-tests/INVENTORY.md.
---

## See also

- **[io](/docs/stdlib/io)** — `Read`/`Write`/`AsyncRead`/`AsyncWrite` protocols.
- **[async](/docs/stdlib/async)** — the executor driving network I/O.
- **[sys](/docs/stdlib/sys)** — V-LLSI syscalls beneath the network stack.
- **[encoding](/docs/stdlib/encoding)** — JSON / CBOR / MessagePack /
  Base64 / Base32 / Base58 / hex / PEM / JCS / JSON Pointer /
  varint / DER.
- **[security/auth-primitives](/docs/stdlib/security/auth-primitives)**
  — JWT / COSE / TOTP / password hashing / CSPRNG tokens /
  HPKE / Merkle.
- **[Weft reverse proxy](/docs/stdlib/net/weft/overview)** —
  connection-pool, health-check, load-balancer, circuit-breaker,
  retry, and rate-limiter middleware.
