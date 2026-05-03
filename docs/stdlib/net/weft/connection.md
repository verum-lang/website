---
sidebar_position: 8
title: Connection — HTTP/1.1 pipeline
description: Per-connection HTTP/1.1 keep-alive loop with chunked transfer encoding, payload-size cap, drain-aware connection-close negotiation, and cancellation through every read.
---

# `core.net.weft.connection`

Per-connection HTTP/1.1 pipeline. One spawned task drives a single
TCP / TLS / vsock / UDS stream through the keep-alive loop until
the client closes, the listener drains, or the cancellation token
fires.

Source: `core/net/weft/connection.vr` (458 LOC).

## `ConnectionConfig`

```verum
public type ConnectionConfig is {
    max_request_size: Int,           // default 1 MiB
    read_buffer_capacity: Int,       // default 16 KiB
    keep_alive: Bool,                // default true
};

implement ConnectionConfig {
    public fn default() -> ConnectionConfig {
        ConnectionConfig {
            max_request_size: 1 * 1024 * 1024,
            read_buffer_capacity: 16 * 1024,
            keep_alive: true,
        }
    }
}
```

Listener-level overrides flow through `ListenerConfig.connection`.

## `serve_http1` — the pipeline entry point

```verum
public async fn serve_http1<T: WeftTransport, S: Handler>(
    mut stream: T,
    peer_addr: SocketAddr,
    app: Heap<S>,
    token: CancellationToken,
    draining: Shared<AtomicBool>,
    config: ConnectionConfig,
) -> Result<(), ConnError>
```

Generic over the transport (`WeftTransport` protocol) and the
handler (`Handler` protocol) — zero-cost monomorphisation.

Behaviour:

1. **Token check** at the top of every loop iteration. If cancelled,
   return `Err(Cancelled)`.
2. **Drain check** — if the listener-level `draining` flag is set,
   the upcoming response is stamped `Connection: close` and the
   loop exits after the message.
3. **Read request** — accumulate bytes until the parser declares
   `Done { consumed, body_len, body_start }` or `Error`.
4. **Sojourn-time stamp** — record `x-weft-submitted-at` (ms) so
   the CoDel admission layer can compute queue-time downstream.
   Any client-supplied value is preserved as
   `x-weft-submitted-at-client` to detect injection attempts.
5. **Body read** — content-length or chunked. Hard cap at
   `max_request_size`. Truncation returns 413.
6. **Dispatch** to `app.handle(request)`. Success or
   `IntoResponse`-rendered error.
7. **Stamp** `Connection: keep-alive` or `Connection: close` on the
   response based on HTTP version, request `Connection` header,
   server config, and drain state.
8. **Write response** — partial-write tolerant; retries until the
   buffer is fully drained. I/O errors return `Err(Io)`.
9. **Loop or return** — `KeepAlive.Continue` keeps the connection;
   `KeepAlive.Close` exits.

## `ConnError` — typed connection-loop errors

```verum
public type ConnError is
    | ClientClosed
    | Cancelled
    | Io(Text)
    | Parse(ParseError)
    | TooLarge
    | UnsupportedTransferEncoding(Text)
    | HandlerError(WeftError);
```

These never reach the client as wire bytes — they're internal
classifications for logging and metrics. The wire response was
already written (or could not be written) by the time the error
surfaces.

## Sojourn-time stamping

The stamp is a millisecond timestamp captured at the moment the
listener begins reading the request. The CoDel layer reads it and
computes `now - stamp` to get queue-time. If the p95 sojourn time
exceeds `target` (default 100 ms) for 5 seconds straight, the layer
narrows the concurrency limit — application-layer FQ-CoDel.

The stamp is also useful for tracing: the duration from accept to
handler-start gives you the queue depth without instrumenting every
layer between.

## Chunked transfer encoding

Input chunked decoding goes through `ChunkedDecoder` from
`core.net.http_parser`. The decoder is fed accumulated buffer
slices and emits:

- `ChunkOutput { consumed, data_start, data_len }` for each chunk's
  payload (the connection appends `data_len` bytes to the body
  output buffer);
- `ChunkEnd { .. }` when the terminating zero-length chunk arrives;
- `ChunkNeedMore` when more bytes are needed (the connection reads
  more from the stream and re-feeds);
- `ChunkErr(error)` on protocol violation — the connection writes
  a 400 response and returns the error.

The hard cap on total decoded body size is `max_request_size`. A
malicious or buggy client cannot blow memory by streaming chunks
indefinitely.

Output chunking (server-side response streaming) is currently a
fixed-content-length flow; chunked output is a Phase 2 follow-up.

## Keep-alive decision

```verum
fn decide_keep_alive(
    version: &Version,
    headers: &Headers,
    server_allows: Bool,
) -> Bool
```

Rules:

- If the server config disables keep-alive or the listener is
  draining, return `false`.
- For HTTP/1.1: keep-alive **unless** the client sent
  `Connection: close`.
- For HTTP/1.0: keep-alive **only if** the client sent
  `Connection: keep-alive`.
- For other versions: no keep-alive (HTTP/2 / HTTP/3 use their own
  multiplexing; this path should not be reached).

Comparison is ASCII-fast `eq_ignore_case` on the borrowed value —
no fresh `Text` allocation per request.

## Cancellation propagation

Every `read_cancellable` and `write_response` checks the
cancellation token. The flow:

1. `accept_loop` clones the listener-level token into the spawned
   task.
2. `serve_http1` polls the token at the top of every loop iteration.
3. Inside `read_cancellable`, the runtime registers a cancel
   handler that cancels the in-flight kernel `recv` syscall.
4. The handler's `await` points may also see the same token
   propagated through `provide CancellationToken = ...`.

Result: when shutdown is requested, every in-flight connection
sees cancellation within `idle_timeout` of the next read or
sooner if a write is in progress. There is no deadline by which a
slow client can keep a connection alive past shutdown.

## Status

- **Implementation**: complete (keep-alive, chunked input, drain-aware,
  413 enforcement, cancellation throughout).
- **Conformance**: covered by `hello_world`, `slow_loris_pool_exhaustion`,
  and `graceful_shutdown` tests.
- **Phase**: 1 + 2 closed.
- **Out of scope for current release**: chunked output (server-side
  streaming), HTTP/1.1 pipelining (multiple requests in flight on a
  single connection), HTTP upgrade sideband mechanism (e.g. WebSocket
  upgrade is handled by a separate `WsRunner`).

## Related documentation

- [Listener](./listener)
- [Transport](./transport)
- [TLS](../tls/)
