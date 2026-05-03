---
sidebar_position: 9
title: Transport — byte-duplex protocol
description: WeftTransport — abstract byte-duplex with cancellation-aware read, blanket impl for TcpStream, foundation for plain TCP, TLS, UDS, vsock, and future QUIC bidi-stream carriers.
---

# `core.net.weft.transport`

Plumbing that lets the HTTP/1.1 connection pipeline work uniformly
over plain TCP, TLS-wrapped TCP, Unix-domain sockets, and (eventually)
QUIC bidirectional streams.

Source: `core/net/weft/transport.vr` (90 LOC).

## `WeftTransport` — the byte-duplex protocol

```verum
public type WeftTransport is protocol {
    /// Peer address for logging, tracing, and access lists.
    fn peer_addr(&self) -> Result<SocketAddr, IoError>;

    /// Cancellable read. Outer Result is the cancellation channel;
    /// inner Result is the normal read outcome. The connection
    /// pipeline drives this so the listener's shutdown token can
    /// reach available reads in bounded time.
    async fn read_cancellable(
        &mut self,
        buf: &mut List<Int>,
        token: &CancellationToken,
    ) -> Result<Result<Int, IoError>, CancellationError>;

    /// Write — may be partial; the connection pipeline retries
    /// until `buf` is fully drained.
    async fn write_async(&mut self, buf: &List<Int>) -> Result<Int, IoError>;

    /// Half-close write direction. No-op permitted for transports
    /// without a meaningful shutdown (vsock loopback, in-memory mocks).
    async fn shutdown_write(&mut self) -> Result<(), IoError>;
};
```

Implementors **must** be cancellation-aware on `read_cancellable` —
this is what lets the listener's shutdown token reach available
reads in bounded time.

`write_async` **may** ignore cancellation — responses should always
finish writing once started. The hard-stop phase of graceful
shutdown is the safety valve for stuck writes.

## Blanket impl for `TcpStream`

```verum
mount core.net.tcp.{TcpStream, Shutdown};

implement WeftTransport for TcpStream {
    fn peer_addr(&self) -> Result<SocketAddr, IoError> {
        TcpStream.peer_addr(self)
    }

    async fn read_cancellable(
        &mut self,
        buf: &mut List<Int>,
        token: &CancellationToken,
    ) -> Result<Result<Int, IoError>, CancellationError> {
        TcpStream.read_cancellable(self, buf, token).await
    }

    async fn write_async(&mut self, buf: &List<Int>) -> Result<Int, IoError> {
        TcpStream.write_async(self, buf).await
    }

    async fn shutdown_write(&mut self) -> Result<(), IoError> {
        TcpStream.shutdown(self, Shutdown.Write)
    }
}
```

`TcpStream` already exposes the methods expected here — defining
the protocol separately lets us add a blanket impl without touching
the underlying TCP module, and gives a single binding point for
TLS, UDS, vsock, and QUIC bidi-stream adapters.

## Other implementors

| Type | Module | Notes |
|---|---|---|
| `TcpStream` | `core.net.tcp` | Blanket impl, this file. |
| `TlsStream<T>` | `core.net.weft.tls` | Wraps any `WeftTransport` with TLS termination. |
| `UnixStream` | `core.net.unix` | UDS — blanket impl in the unix module. |
| `VsockStream` | (planned) | vsock for VM-host edge cases. |
| `QuicBidiStream` | (planned) | One bidirectional QUIC stream as a transport. |
| `MemPipe` | testing | In-memory transport for unit tests. |

## Why `List<Int>` buffers?

The existing stdlib socket layer marshals bytes through `List<Int>`
(see `core.net.tcp`). The transport protocol preserves that shape
to avoid a disruptive stdlib-wide rewrite. A future migration to
`List<Byte>` (Phase 5 optimisation) changes this single file without
touching the connection pipeline.

## Cancellation contract

The outer `Result<_, CancellationError>` is the cancellation
channel: when the token cancels, `read_cancellable` returns
`Err(CancellationError::Cancelled)` rather than blocking
indefinitely. The runtime registers a cancellation handler that
cancels the available kernel `recv` syscall.

The inner `Result<Int, IoError>` is the normal read outcome: bytes
read or an I/O error. `0` means EOF / clean close.

`write_async` does not have the outer cancellation channel — once
the runtime hands a buffer to the kernel, retracting it is racy and
not worth the complexity. If a write must be interrupted, the
listener calls `shutdown_write` to half-close the socket; the next
write will fail and the connection task can return.

## Status

- **Implementation**: complete (protocol plus `TcpStream` blanket impl).
- **Conformance**: implicitly tested by every transport-using suite.
- **Phase**: 1 closed; UDS and vsock impls are Phase 4 follow-ups.

## Related documentation

- [Connection — HTTP/1.1 pipeline](./connection)
- [TLS](../tls/)
- [Listener](./listener)
