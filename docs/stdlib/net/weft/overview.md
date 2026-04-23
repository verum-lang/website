---
sidebar_position: 1
title: Weft — reverse-proxy and middleware layer
description: Connection pooling, health checks, load balancing, circuit breakers, retries, rate limiting, arena pools, and SPIFFE identity plumbing.
---

# `core.net.weft` — reverse-proxy and middleware

`weft` is Verum's reverse-proxy / server-side-middleware subsystem.
It sits between the transport primitives in
[`core.net.tcp`](/docs/stdlib/net#tcp) /
[`core.net.quic`](/docs/stdlib/net/quic/) /
[`core.net.tls`](/docs/stdlib/net/tls/) and your application
handlers, providing the orthogonal "plumbing" concerns that every
production HTTP/HTTP2/HTTP3 server re-implements badly:

| Concern            | Module                                     | One-liner                                                          |
|--------------------|--------------------------------------------|--------------------------------------------------------------------|
| Connection pooling | [`core.net.weft.connection`](#connection)  | Keep-alive pools with health checks and graceful close.            |
| Load balancing     | [`core.net.weft.dst`](#dst)                | Destination resolution + weighted/round-robin/least-conn.          |
| Health probes      | [`core.net.weft.health`](#health)          | Active probing + passive circuit state.                            |
| Circuit breaker    | [`core.net.weft.adaptive`](#adaptive)      | Open/half-open/closed state with adaptive windowing.               |
| Retries + timeout  | [`core.net.weft.handler`](#handler)        | Exponential-backoff retries wrapped as middleware.                 |
| Rate limiter       | [`core.net.weft.backpressure`](#backpressure) | Token bucket + leaky bucket per-route / per-principal.          |
| Buffer pool        | [`core.net.weft.bufpool`](#bufpool)        | Lock-free per-size-class byte-buffer recycling.                    |
| Arena pool         | [`core.net.weft.arena_pool`](#arena-pool)  | Per-request arena lifetimes — tear down in one free call.         |
| SPIFFE identity    | [`core.net.weft.spiffe`](#spiffe)          | X.509-SVID / JWT-SVID identity retrieval + mTLS trust anchors.    |
| Metrics            | [`core.net.weft.metrics`](#metrics)        | Prometheus-shaped counters / histograms / summaries per route.     |

Weft is **deliberately unopinionated about HTTP version**: the
connection pool, health checker, circuit breaker, and retry
middleware are indistinguishable between HTTP/1.1, HTTP/2, and
HTTP/3. The HTTP-version-specific layer
([`http2`](/docs/stdlib/net#http) / [`http3`](/docs/stdlib/net/http3/))
plugs in as a protocol adapter on top of the Weft primitives.

:::info Status
Weft is staged for v1.1. The primitives listed above exist as
`core/net/weft/*.vr` today (see the
[crate map](/docs/architecture/overview)); this page consolidates the
API surface that's pinned to ship. Individual per-module pages will
follow the same pattern used for
[`stdlib/net/quic`](/docs/stdlib/net/quic/) and
[`stdlib/net/http3`](/docs/stdlib/net/http3/).
:::

## Connection {#connection}

`core.net.weft.connection` defines a generic connection-pool that
holds an inner transport (TCP, QUIC, mTLS-wrapped TCP) and exposes
`acquire` / `release` with configurable:

- per-endpoint and global concurrency caps,
- idle close timers,
- health-check integration (drop unhealthy endpoints),
- graceful shutdown (quiesce + drain to new requests).

## Destination resolution {#dst}

`core.net.weft.dst` — a destination is a named set of endpoints plus
a routing strategy:

- round-robin (static),
- weighted round-robin,
- least-connections (observed),
- consistent hashing (for sticky routing).

## Health {#health}

`core.net.weft.health` — active probers and passive observers. A
probe produces `Healthy | Degraded | Unhealthy` and feeds into both
the connection pool's eviction policy and the circuit breaker's
state machine.

## Adaptive circuit breaker {#adaptive}

`core.net.weft.adaptive` — three-state breaker (`closed` ↔ `half-open`
↔ `open`) with an adaptive failure-rate window. Trips from
`closed` to `open` on sustained errors; admits single trial calls
from `open` to `half-open`; closes when a trial succeeds.

## Handler / middleware {#handler}

`core.net.weft.handler` — the composable middleware core. Each
middleware is a `fn(Request, Next) -> Response` and can wrap retries,
timeouts, circuit-breaking, logging, and tracing around the inner
handler.

## Backpressure / rate limiting {#backpressure}

`core.net.weft.backpressure` — token-bucket and leaky-bucket
limiters keyed on per-route identifier, per-principal (from the
SPIFFE identity), or per-client-IP.

## Buffer pool {#bufpool}

`core.net.weft.bufpool` — lock-free pool of `[Byte; N]` buffers
segmented by size class (256B / 1KB / 4KB / 16KB / 64KB). Allocation
is `Shared<Buffer>` with refcount-free release on drop.

## Arena pool {#arena-pool}

`core.net.weft.arena_pool` — per-request bumping arena reused across
requests. Allocations during request handling go into the arena;
end-of-request triggers one bump reset (no individual free calls).
See [`stdlib/security/regions`](/docs/stdlib/security/regions) for
the integration with region-typed lifetimes.

## SPIFFE identity {#spiffe}

`core.net.weft.spiffe` — implements [SPIFFE](https://spiffe.io/) /
SPIRE client for X.509-SVID and JWT-SVID retrieval from a local
Workload API endpoint, caches identity + trust bundle, and exposes
a middleware layer that validates peer identities against an
allow-list of SPIFFE IDs or trust domains. Used by
[`stdlib/security/spiffe`](/docs/stdlib/security/spiffe).

## Metrics {#metrics}

`core.net.weft.metrics` — Prometheus-shaped counters, gauges,
histograms, and summaries keyed per-route. Integrates with
[`core.metrics`](/docs/stdlib/metrics) for scraping and
exposition format.

## See also

- [stdlib/net overview](/docs/stdlib/net) — the transport
  primitives Weft composes.
- [stdlib/security/spiffe](/docs/stdlib/security/spiffe) — the
  application-layer SPIFFE identity API.
- [stdlib/security/regions](/docs/stdlib/security/regions) — how
  `arena_pool` plugs into region-typed lifetimes.
