---
sidebar_position: 1
title: Weft — verifiable server framework
description: Service / Layer / Handler / Router, transports, refinement-typed routes, supervisor integration, deterministic simulation, WASM filters, SPIFFE identity. Production-grade Verum web framework.
---

# `core.net.weft`

Weft (from the weaver's *weft* — the cross-thread that binds the warp into
fabric) is the Verum server framework. It is designed to be ergonomic
like axum, performant like Pingora, resilient like an OTP-supervised
Cowboy — **and verifiable**: refinement-typed routes, effect-checked
middleware, dependent-typed protocol state machines, structurally
concurrent connection nurseries.

This page is the framework's navigational reference. Every section
maps a feature area to the actual `core/net/weft/*.vr` module that
implements it and its conformance status.

## Architectural pyramid

```
+-------------------------------------------------------------+
| L6  APPLICATION       user code: handlers, DI, business     |
+-------------------------------------------------------------+
| L5  HANDLER / EXTRACT async fn(...) using [...] + extractors|
+-------------------------------------------------------------+
| L4  SERVICE           Service<Req, Resp> + Layer            |
+-------------------------------------------------------------+
| L3  PROTOCOL          HTTP/1.1 / HTTP/2 / HTTP/3 / WS / RPC |
+-------------------------------------------------------------+
| L2  CONNECTION        nursery wrapping Transport + FSM      |
+-------------------------------------------------------------+
| L1  TRANSPORT         TcpStream / TlsStream / QuicStream    |
+-------------------------------------------------------------+
| L0  REACTOR           IoEngine: io_uring / kqueue / IOCP    |
+-------------------------------------------------------------+
| S   SUPERVISION       supervisor-tree wraps L0..L5          |
+-------------------------------------------------------------+
```

Layer `S` is not another stratum but an orthogonal axis: any node
from L0 (reactor) to L6 (business) can be a supervised child of an
OTP tree. The tree is described declaratively in the root `fn main()`
and validated by types at compile time.

## Module map

| Module | File | LOC | Purpose |
|---|---|---|---|
| `service` | `core/net/weft/service.vr` | 60 | `Service<Req,Resp>` + `Layer<Inner>` + `ServiceBuilder<S>` + `Identity` layer. |
| `error` | `core/net/weft/error.vr` | 261 | `IntoResponse` protocol, `WeftError` taxonomy, `WeftErrorCategory`, `ExtractRejection`. |
| `response_ext` | `core/net/weft/response_ext.vr` | 101 | Response builders: `resp_status`, `resp_text`, `resp_with_header`, `resp_with_body_text`, `resp_ok`. |
| `handler` | `core/net/weft/handler.vr` | 327 | `WeftRequest`, `Handler` protocol, extractors (`PathParam<T>`, `QueryParam<T>`, `BodyBytes`, `BodyText`), `ClosureHandler`. |
| `json_extractor` | `core/net/weft/json_extractor.vr` | 417 | `Json<T>` extractor with five gates (content-type / size cap / UTF-8 / parse / materialise) plus `JsonDeserialize<T>` protocol. |
| `router` | `core/net/weft/router.vr` | 367 | Radix-tree router: `route()`, `get()`, `post()`, `put()`, `delete()`, `patch()`, `nest()`, `fallback()`. |
| `transport` | `core/net/weft/transport.vr` | 90 | `WeftTransport` byte-duplex protocol with blanket `TcpStream` impl. |
| `connection` | `core/net/weft/connection.vr` | 458 | Per-connection HTTP/1.1 pipeline (keep-alive, chunked, drain, `serve_http1`). |
| `listener` | `core/net/weft/listener.vr` | 309 | `Server<H>` plus accept loop, `ConnectionRunner` protocol, `PlainHttp1Runner`, `SO_REUSEPORT`, two-phase shutdown. |
| `app` | `core/net/weft/app.vr` | 117 | `WeftApp.new(handler).bind(addr).serve()` plus `child_spec()` for supervisor integration. |
| `tls` | `core/net/weft/tls.vr` | 224 | `TlsTransport` + `TlsHttp1Runner` + `Server<H>.serve_tls(cfg)`, zero crypto duplicated. |
| `http2` | `core/net/weft/http2.vr` | 484 | `Http2Limits` (Rapid-Reset hard defaults), `Http2cRunner`, `Server.serve_h2c()`. |
| `http3` | `core/net/weft/http3.vr` | 359 | `WeftQuicConfig`, `Http3WeftServer<H>`, post-quantum hybrid TLS defaults. |
| `h3` | `core/net/weft/h3.vr` | 316 | WebTransport / Datagrams / Multipath QUIC server adapter. |
| `h3_priority` | `core/net/weft/h3_priority.vr` | 122 | RFC 9218 Extensible Priorities — urgency 0..7 + incremental flag. |
| `zero_rtt_gate` | `core/net/weft/zero_rtt_gate.vr` | 188 | 0-RTT replay-safe handler annotation enforcement (`@allow_0rtt(idempotent_only=true)`). |
| `websocket` | `core/net/weft/websocket.vr` | 723 | RFC 6455 full handshake, CONT re-assembly, auto-PONG, Close-echo, `WsServer<H>`. |
| `rpc` | `core/net/weft/rpc.vr` | 369 | Connect-RPC (wire-compatible with gRPC) — 17 status codes plus HTTP mapping plus `Router.rpc_unary()`. |
| `arena_pool` | `core/net/weft/arena_pool.vr` | 270 | Per-request arena lease with RAII reset-on-drop; CBGR-backed O(1) generational invalidation. |
| `bufpool` | `core/net/weft/bufpool.vr` | 344 | Buffer pool shaped for io_uring registered-buffer optimisation (runtime intrinsic is a follow-up). |
| `backpressure` | `core/net/weft/backpressure.vr` | 517 | `ConcurrencyLimitLayer`, `RateLimitLayer`, `LoadShedLayer`, `CoDelLayer` (sojourn-time admission), tenant-fair WFQ. |
| `adaptive` | `core/net/weft/adaptive.vr` | 184 | `AdaptiveConcurrencyLayer` — Vegas algorithm port. |
| `timeout` | `core/net/weft/timeout.vr` | 89 | `TimeoutLayer.ms(N)` per-request deadline propagation. |
| `tracing` | `core/net/weft/tracing.vr` | 217 | W3C Trace Context propagation, `TracingLayer`. |
| `metrics` | `core/net/weft/metrics.vr` | 271 | Prometheus-text registry, standard RPS / latency-histogram / connection-count metrics. |
| `metrics_otlp` | `core/net/weft/metrics_otlp.vr` | 540 | OTLP/gRPC + OTLP/HTTP+JSON push exporter, tail-based sampling hooks, exemplar attach. |
| `health` | `core/net/weft/health.vr` | 226 | `/_health/live` + `/_health/ready` plus supervisor-state probe and dep-readiness aggregator. |
| `refined_routes` | `core/net/weft/refined_routes.vr` | 169 | `PathRefinement<T>` plus factories (`int_between`, `text_one_of`, `slug`); bridge to the language refinement system. |
| `spiffe` | `core/net/weft/spiffe.vr` | 281 | `Principal`, `SpiffeAuthLayer<P>` (JWT / mTLS), `TrustBundleProvider`. |
| `dst` | `core/net/weft/dst.vr` | 418 | Deterministic Simulation Testing primitives — `TestClock`, `SeededRng`, `SimNetworkConfig`, `TaskSchedule`, `WeftSimulator`. |
| `wasm_filter` | `core/net/weft/wasm_filter.vr` | 327 | Proxy-Wasm 0.2.1 sandbox plus `WasmCapabilities` plus CPU / memory / instruction caps. |

**Total:** 32 modules, ~10,000 LOC. Plus `core/net/proxy/` (L7
reverse-proxy kit) — another ~1,600 LOC.

## `core.net.proxy` — L7 reverse-proxy kit

| File | Purpose |
|---|---|
| `core/net/proxy/upstream_pool.vr` | Connection-reuse pool with retire policy. |
| `core/net/proxy/health_check.vr` | Active and passive probing through `HEAD /healthz`. |
| `core/net/proxy/loadbalancer.vr` | Round-robin / Random / Weighted Least-Conn. |
| `core/net/proxy/circuit_breaker.vr` | Three-state Hystrix-style breaker. |
| `core/net/proxy/retry.vr` | Bounded retry with budget. |
| `core/net/proxy/rate_limit.vr` | Tenant-aware token bucket. |

## Hello world in 20 lines

```verum
@runtime(work_stealing)
mount core.net.weft.{Router, Method, Response, WeftApp};
mount core.net.http.{Request};

async fn hello() -> Response {
    Response.ok("Hello from Weft!")
}

async fn echo_name(Path(name): Path<Text>) -> Response {
    Response.ok(f"Hello, {name}!")
}

fn main() {
    let app = Router.new()
        .route("/", Method.Get, hello)
        .route("/hello/:name", Method.Get, echo_name);

    WeftApp.new(app)
        .bind("0.0.0.0:8080")
        .serve()
        .await
}
```

## REST API with DI, validation, errors

```verum
@runtime(work_stealing)
mount core.net.weft.*;

type UserId is Int where |n| { n >= 1 };

context Database {
    async fn find(id: UserId) -> Maybe<User>;
    async fn save(user: User) -> Result<UserId, DbError>;
}

type ApiError is
    | NotFound | Validation(Text) | Internal(Text) | Unauthorized;

implement IntoResponse for ApiError {
    fn into_response(self) -> Response { /* ... */ }
}

async fn get_user(Path(id): Path<UserId>)
    -> Result<Json<User>, ApiError>
    using [Database]
{
    let user = Database.find(id).await
        .map_err(|e| ApiError.Internal(f"{e}"))?;
    match user {
        Some(u) => Ok(Json(u)),
        None    => Err(ApiError.NotFound),
    }
}

fn main() using [Config] {
    let app = Router.new()
        .route("/users/:id", Method.Get, get_user)
        .layer(TracingLayer.new())
        .layer(TimeoutLayer.ms(5000))
        .layer(RateLimitLayer.new(RateConfig { rps: 1000, burst: 100 }))
        .layer(AuthLayer.jwt(Config.jwt_secret));

    let root = Supervisor.new(supervisor_config());
    root.add_child(ChildSpec.permanent("db")
        .with_start(|| Database.connect(Config.db_url)));
    root.add_child(ChildSpec.permanent("http")
        .with_start(|| WeftApp.new(app).bind("0.0.0.0:8080").serve()));

    root.run().await
}
```

## Five distinguishing capabilities

These five architectural pillars exist individually in other ecosystems;
**their intersection exists nowhere else**.

### 1. Refinement-typed routes

```verum
type ValidApiVersion is Text where |s| { s == "v1" || s == "v2" || s == "v3" };
type UserId is Int where |n| { n >= 1 && n <= 1_000_000_000 };

async fn get_user(
    Path(version): Path<ValidApiVersion>,
    Path(id): Path<UserId>,
) -> Json<User> {
    // The SMT solver has already proved version is one of v1/v2/v3
    // and id is in [1, 10^9]. Defensive checks become provably
    // unnecessary; unwrap()-style panics become structurally impossible.
}
```

If anyone forgets to extend `ValidApiVersion` to include a new
version, an old endpoint `/api/v4/...` breaks **at compile time**,
not as a 4xx in production.

### 2. Effect-typed middleware

Computational properties (`Pure`, `IO`, `Async`, `Fallible`,
`Mutates`, `Spawns`, `FFI`) are inferred by the compiler. `TracingLayer`
must be `Pure` in its composition logic — silently performing a DB call
inside `wrap` leaks into the effect set and is rejected at compile time.

### 3. CBGR arena as the request-path standard

`core.net.weft.arena_pool` simultaneously provides:

- Zero-allocation request path (Netty class).
- Memory safety (Rust class).
- Runtime diagnostics through CBGR — using a stale reference is a
  controlled error, not undefined behaviour.
- O(1) destruction through generation bump.

This is not an optimisation; it is a semantic. The user writes
handlers in the style of "allocate freely, do not think about it".

### 4. Supervision tree as the root architecture

`core.runtime.supervisor` ships full OTP strategies (OneForOne /
OneForAll / RestForOne) with type-safe `ChildSpec` API. Outside the
BEAM ecosystem, no other server framework provides this — Tokio /
Hyper / Seastar / Netty rely on `JoinError::Panic` plus manual handling.

### 5. Nursery-scoped connections

A connection is a `core.async.nursery`. All related tasks (reader,
writer, heartbeat, multiplex per stream) are its children. The
cancellation tree guarantees: no detached tasks can outlive the
connection by construction.

## Performance targets

| Workload | Target |
|---|---|
| Plaintext RPS (1 core, 1 conn) | >= 180k RPS |
| Plaintext RPS (56 core, 5000 conn) | >= 20 M RPS |
| Echo TCP latency p50 / p99 | <= 20 us / <= 80 us |
| TLS 1.3 handshake (cold) | <= 2.5 ms |
| TLS 1.3 resumption (0-RTT) | <= 500 us |
| HTTP/2 multiplex (1000 streams) | >= 1.5 M req/s |
| WebSocket fan-out (100k subs, 1 msg/sec) | <= 50 ms p99 end-to-end |
| Memory per idle connection | <= 8 KB |
| Graceful restart under 1M req/s | 0 dropped |

## Conformance status (2026-04-29)

| Suite | Pass | Total | % |
|---|---|---|---|
| weft | 29 | 30 | 96.7% |
| quic | 78 | 130 | 60% |
| tls13 | 43 | 76 | 56.6% |
| h3 + http2 + http3 + proxy + ws + tls + shutdown | 16 | 46 | 34.8% |

The weft framework itself is at 96.7% conformance. The remaining
gaps in protocol-level suites trace back to four shared compiler
issues which, once closed, unlock approximately half the suite at once.

## Tier-0 interpreter networking

Through 2026-04-29, `verum run --interp` returned `-1` from any TCP
or UDP intrinsic — interpreted-mode networking was a documentation-only
feature. Since closure of the Tier-0 networking work, every `__tcp_*_raw`
and `__udp_*_raw` is backed by `std::net` resources keyed in a thread-local
synthetic-fd registry, so a Verum script can now bind a port and serve
traffic directly through the interpreter:

```verum
mount core.sys.raw.{
    __tcp_listen_raw, __tcp_accept_raw,
    __tcp_recv_raw, __tcp_send_raw, __tcp_close_raw,
};

fn main() {
    let listen_fd = __tcp_listen_raw(7878);
    let conn_fd   = __tcp_accept_raw(listen_fd);
    let req       = __tcp_recv_raw(conn_fd, 4096);
    let _         = __tcp_send_raw(conn_fd, "HTTP/1.0 200 OK\r\n\r\nhello");
    __tcp_close_raw(conn_fd);
    __tcp_close_raw(listen_fd);
}
```

The full Weft stack — through `core/net/tcp.vr` plus the io-engine
async layer — currently goes through AOT only; Tier-0 syscall
emulation (`accept4`, `read`, `write` through `syscall_raw`) is
on the roadmap.

## Related documentation

- [Service / Layer / ServiceBuilder](./service)
- [Handler & FromRequest extractors](./handler)
- [Router](./router)
- [`stdlib/net/quic/`](/docs/stdlib/net/quic/)
- [`stdlib/net/tls/`](/docs/stdlib/net/tls/)
- [`stdlib/net/http2/`](/docs/stdlib/http2)
- [`stdlib/net/http3/`](/docs/stdlib/net/http3/)
