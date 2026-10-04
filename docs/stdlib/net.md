---
sidebar_position: 1
title: net
description: TCP, UDP, HTTP, TLS and DNS through Verum networking and platform runtime interfaces.
status: partial
---

import StdlibStatus from '@site/src/components/StdlibStatus';

<StdlibStatus status="partial" />

Network APIs use Verum's system interface, but the current interpreter
network handlers still use Rust `std::net` and libc. See the
[no-libc contract and current implementation gaps](/docs/architecture/no-libc-architecture)
for the distinction between that interface and its runtime dependencies.

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
