---
sidebar_position: 5
title: Listener — accept loop, two-phase shutdown, SO_REUSEPORT
description: TCP listener with shared accept loop, ConnectionRunner protocol for plain HTTP/1.1 and TLS variants, graceful drain plus hard-stop, per-connection task isolation, concurrency budget enforcement.
---

# `core.net.weft.listener`

The listener owns the bind / accept lifecycle. Per-connection
behaviour is pluggable through the `ConnectionRunner` protocol, so
one and the same accept loop drives plain TCP (`Server<H>`),
TLS-terminating (`TlsServer<H>`), and HTTP/2 cleartext upgrade
(`Http2cRunner`) variants without duplicated code.

Source: `core/net/weft/listener.vr` (309 LOC).

## `ListenerConfig`

```verum
public type ListenerConfig is {
    /// Soft cap on in-flight connections. Sockets accepted while
    /// at the cap are refused via the runner's overload hook.
    max_concurrent_connections: Int,

    /// Per-connection config handed to `serve_http1`.
    connection: ConnectionConfig,

    /// Maximum milliseconds shutdown() will wait for in-flight
    /// connections to finish before forcibly dropping them.
    /// 30s matches the Kubernetes default.
    drain_grace_ms: Int,

    /// Bind with SO_REUSEPORT — enables seamless blue/green handoff
    /// at the OS level.
    reuseport: Bool,
};
```

Sensible defaults:

```verum
ListenerConfig {
    max_concurrent_connections: 10_000,
    connection: ConnectionConfig.default(),
    drain_grace_ms: 30_000,
    reuseport: false,
}
```

Builder helpers:

```verum
public fn with_drain_grace_ms(self, ms: Int) -> ListenerConfig
public fn with_reuseport(self, enabled: Bool) -> ListenerConfig
```

## `ConnectionRunner` — pluggable per-connection strategy

```verum
public type ConnectionRunner is protocol {
    /// Drive one accepted connection to completion. Owns the stream.
    async fn run(&self, stream: TcpStream, peer: SocketAddr);

    /// Refuse a connection because the listener-level budget is
    /// exhausted. Invoked synchronously inside the accept loop;
    /// runs on the accept task, not a spawned one.
    async fn refuse_overloaded(&self, stream: TcpStream);
};
```

Implementors decide:

- whether to wrap the socket in TLS or any other transport,
- which protocol to speak (HTTP/1.1, HTTP/2 via ALPN, WebSocket),
- what to say to a client refused for overload.

Two phase-3 implementors ship in stdlib:

- `PlainHttp1Runner<H>` — plaintext HTTP/1.1, refuses overload with
  a minimal `503 Service Unavailable`.
- `TlsHttp1Runner<H>` — wraps the stream in TLS before HTTP/1.1,
  silently drops overload sockets (cannot speak plaintext).

Plus `Http2cRunner` for HTTP/2 cleartext upgrade.

### `PlainHttp1Runner<H>`

```verum
public type PlainHttp1Runner<H> is {
    app: Heap<H>,
    token: CancellationToken,
    draining: Shared<AtomicBool>,
    connection_cfg: ConnectionConfig,
};

implement<H: Handler + Send + Sync + 'static> PlainHttp1Runner<H> {
    public fn new(
        app: Heap<H>,
        token: CancellationToken,
        draining: Shared<AtomicBool>,
        connection_cfg: ConnectionConfig,
    ) -> PlainHttp1Runner<H>
}
```

`run` calls `serve_http1` from `core.net.weft.connection`.
`refuse_overloaded` writes a fixed 503 response then drops.

## `accept_loop` — shared core for every Weft server variant

```verum
public async fn accept_loop<R: ConnectionRunner + Clone + Send + Sync + 'static>(
    listener: TcpListener,
    config: ListenerConfig,
    token: CancellationToken,
    draining: Shared<AtomicBool>,
    runner: R,
) -> Result<(), Text>
```

Generic over the runner — zero-cost polymorphism via
monomorphisation, no boxed trait objects on the hot path. The loop:

1. Checks the cancellation token; breaks if cancelled.
2. Checks the `draining` flag; breaks if draining was requested.
3. Calls `listener.accept_cancellable(&token)`. On error other than
   cancellation (`EMFILE` etc.) sleeps 10 ms before retrying.
4. On success, increments the in-flight counter atomically and:
   - if at or above `max_concurrent_connections`, decrements and
     calls `runner.refuse_overloaded(stream)` synchronously,
   - otherwise spawns the connection on a fresh task that runs
     `runner.run(stream, peer)` then decrements the counter.

After the loop exits, drains: waits for in-flight connections to
complete up to `drain_grace_ms` (poll-based, 50 ms tick).

## `Server<H>` — plain TCP HTTP/1.1 server

```verum
public type Server<H> is {
    listener: TcpListener,
    app: Heap<H>,
    config: ListenerConfig,
    token: CancellationToken,
    draining: Shared<AtomicBool>,
};

implement<H: Handler + Send + Sync + 'static> Server<H> {
    /// Bind a TCP listener and wrap it with the given handler.
    /// Honours config.reuseport.
    public fn bind(addr: Text, app: H, config: ListenerConfig)
        -> Result<Server<H>, Text>

    public fn local_addr(&self) -> Result<SocketAddr, Text>
    public fn shutdown_token(&self) -> CancellationToken
    public fn drain_handle(&self) -> Shared<AtomicBool>

    /// Phase-1 shutdown: stop accepting new connections, signal
    /// keep-alive connections to stamp `Connection: close` next.
    public fn begin_drain(&self)

    /// Full shutdown: drain plus token cancel. Running handlers
    /// see cancellation on their next await point.
    public fn shutdown(&self)

    /// Run until the token fires or the listener drains.
    public async fn serve(self) -> Result<(), Text>
}
```

## Two-phase shutdown

Phase 1 — `begin_drain()`:

- `draining` flag flips to `true`.
- Accept loop checks the flag at the top of each iteration and breaks.
- Existing keep-alive connections detect the flag on their next
  HTTP/1.1 message and stamp `Connection: close` on the response,
  so the client cleanly disconnects after one more roundtrip.

Phase 2 — `shutdown()`:

- Calls `begin_drain()`.
- Cancels the cancellation token.
- Already-running handlers see cancellation at their next `.await`
  point, propagated through the connection's nursery cancellation
  tree.
- After `drain_grace_ms` of waiting, any still-running tasks are
  dropped (their nursery captures and logs a `nursery.leaked_tasks`
  metric).

The two phases give operators a choice: a soft drain (no new
connections, finish in-flight) versus a hard stop (cancel everything
with grace).

## `SO_REUSEPORT` blue/green handoff

When `reuseport: true`, the bind goes through `bind_reuseport`,
allowing multiple processes to bind the same port. Pattern:

1. New process starts with `reuseport: true`. Both old and new
   processes accept simultaneously.
2. New process announces ready, old process begins drain.
3. After old process drains all in-flight, it exits.
4. New process now owns the port.

Zero connections dropped, no listener gap.

For QUIC / UDP, the analogous pattern uses an eBPF connection-ID
router so existing QUIC connections continue to land on the old
process while new ones go to the new process. This piece is a
follow-up on the QUIC server.

## Cancellation propagation

A connection's lifetime is bounded by:

- the listener-level cancellation token (`shutdown()`),
- the per-connection `idle_timeout` enforced by the connection's
  own nursery,
- per-request `TimeoutLayer.ms(N)`,
- protocol-level errors (RST, GOAWAY).

The listener's token is cloned into every spawned connection task.
When the listener-level token is cancelled, every in-flight
connection sees it on its next `.await` — `read_cancellable`,
`write_cancellable`, channel receives, timer waits — all check the
token. There is no "cancellation gap" where an in-flight handler
keeps running after shutdown.

## Status

- **Implementation**: complete.
- **Conformance**: `graceful_shutdown` and `slow_loris_pool_exhaustion`
  tests passing.
- **Phase**: 1 + 2 closed (basic accept loop, drain, REUSEPORT bind).
- **Out of scope for current release**: io_uring multi-shot accept,
  registered buffers, zero-copy send. These are Phase 5 work and
  require additional kernel intrinsics.

## Related documentation

- [Service / Layer / ServiceBuilder](./service)
- [Connection — HTTP/1.1 pipeline](./connection)
- [WeftApp](./app)
