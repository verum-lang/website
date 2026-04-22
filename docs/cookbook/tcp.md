---
title: TCP echo server
description: Async accept loop, connection handler, timeouts, and graceful shutdown.
---

# TCP echo server

A complete TCP echo server: async accept loop, per-connection handler,
nursery-based task management, timeouts, and graceful shutdown.

## The minimal server

```verum
mount core.net.tcp.*;
mount core.io.*;
mount core.async.*;

async fn echo_server(addr: &Text) -> IoResult<()>
    using [IO, Logger]
{
    let listener = TcpListener.bind(addr).await?;
    Logger.info(f"listening on {addr}");

    nursery(on_error: wait_all) {
        loop {
            let (stream, peer) = listener.accept_async().await?;
            Logger.info(f"{peer} connected");
            spawn handle_client(stream, peer);
        }
    }
    Result.Ok(())
}

async fn handle_client(mut stream: TcpStream, peer: SocketAddr)
    using [Logger]
{
    let mut buf = [0u8; 4096];
    loop {
        match stream.read_async(&mut buf).await {
            Result.Ok(0)  => break,                     // peer closed
            Result.Ok(n)  => {
                if stream.write_all_async(&buf[..n]).await.is_err() {
                    break;
                }
            }
            Result.Err(e) => {
                Logger.warn(f"{peer} io error: {e:?}");
                break;
            }
        }
    }
    Logger.info(f"{peer} disconnected");
}

fn main() {
    block_on(async {
        provide Logger = ConsoleLogger.new(LogLevel.Info) in {
            echo_server("0.0.0.0:7777").await.expect("server")
        }
    });
}
```

## Why `nursery` around the accept loop

Without `nursery`, each spawned `handle_client` would outlive the
server function. If the server returned early (e.g. because
`accept_async` failed), connections would continue running,
possibly for minutes, *outside* any cancellation scope.

`nursery` guarantees:

1. When the server function exits normally, every spawned task
   completes first.
2. When the server function exits with a panic, every spawned task
   is **cancelled** and the panic propagates after all tasks
   acknowledge.

The `on_error: wait_all` option says: *even if one handler fails,
wait for the others to finish cleanly before propagating*. Other
options — `cancel_all` (default), `fail_fast` — give different
shutdown semantics.

See [Nursery (cookbook)](/docs/cookbook/nursery) and
[Structured concurrency in async-concurrency](/docs/language/async-concurrency).

## Read/write semantics

A `0`-length `read` means the peer closed its write side (sent a
`FIN`). On BSD sockets this is the *only* signal of a clean
disconnection; treat it as "done, we're free to drop the stream".

A `write_all_async` failure can mean:

- The peer reset (`ECONNRESET`) — treat as disconnect.
- The write timed out (we set a timeout below).
- The local task was cancelled — propagate.

The `if ... .is_err() { break; }` pattern conflates all three. For
production code, match on `IoError` variants.

## Timeouts

Per-operation timeouts avoid slow-loris-style attacks where a peer
opens a connection and never sends anything:

```verum
async fn handle_client_with_timeout(mut stream: TcpStream, peer: SocketAddr)
    using [Logger]
{
    let mut buf = [0u8; 4096];
    loop {
        match select {
            r = stream.read_async(&mut buf) => r,
            _ = sleep(30.seconds()) => Result.Err(IoError.Timeout),
        } {
            Result.Ok(0) => break,
            Result.Ok(n) => {
                select {
                    w = stream.write_all_async(&buf[..n]) => {
                        if w.is_err() { break; }
                    }
                    _ = sleep(10.seconds()) => {
                        Logger.warn(f"{peer} write timeout");
                        break;
                    }
                }
            }
            Result.Err(e) => {
                Logger.info(f"{peer} disconnected: {e}");
                break;
            }
        }
    }
}
```

Alternatively, set socket-level timeouts once:

```verum
stream.set_read_timeout_ms(30_000)?;
stream.set_write_timeout_ms(10_000)?;
```

Socket-level timeouts return `IoError.Timeout` from the underlying
read / write; they are cheaper than `select` but less flexible.

## Graceful shutdown on SIGINT

Use a shutdown flag checked on every iteration and a `select` that
races `accept` against the signal:

```verum
use core.os.signal;

async fn echo_server_graceful(addr: &Text) -> IoResult<()>
    using [IO, Logger]
{
    let listener = TcpListener.bind(addr).await?;
    let stop = Shared.new(AtomicBool.new(false));

    // Signal listener task
    let s_clone = stop.clone();
    spawn async move {
        signal.wait_for(Signal.Interrupt).await;
        Logger.info("shutdown requested");
        s_clone.store(true, MemoryOrdering.Release);
    };

    nursery(on_error: wait_all) {
        while !stop.load(MemoryOrdering.Acquire) {
            match select {
                r = listener.accept_async() => r,
                _ = sleep(100.ms()) => continue,  // re-check flag
            } {
                Result.Ok((stream, peer)) => {
                    Logger.info(f"{peer} connected");
                    spawn handle_client(stream, peer);
                }
                Result.Err(e) => {
                    Logger.warn(f"accept failed: {e}");
                    break;
                }
            }
        }
        Logger.info("stopped accepting, draining existing connections");
    }
    // nursery block-exit awaits every outstanding handler.
    Logger.info("all connections drained");
    Result.Ok(())
}
```

## Backpressure via `Semaphore`

Bound the number of in-flight connections so a surge cannot exhaust
the file-descriptor table:

```verum
let sem = Semaphore.new(500);           // max 500 concurrent clients

nursery {
    loop {
        let (stream, peer) = listener.accept_async().await?;
        let permit = sem.acquire().await;     // blocks when full
        spawn async move {
            handle_client(stream, peer).await;
            drop(permit);                     // release on exit
        };
    }
}
```

When the semaphore is saturated, new connections back up in the TCP
`SYN` queue. Tune the `Semaphore` capacity against the
`listener.backlog(...)` setting.

## TCP socket options

```verum
stream.set_nodelay(true)?;                  // disable Nagle
stream.set_keepalive(true)?;                // TCP keepalive
stream.set_read_timeout_ms(30_000)?;
stream.set_write_timeout_ms(10_000)?;
stream.set_linger_secs(0)?;                 // close immediately on drop

listener.set_nonblocking(true)?;            // (automatic for async)
listener.set_backlog(1024)?;                // SYN backlog
listener.set_reuse_addr(true)?;
listener.set_reuse_port(true)?;             // multiple listeners
```

## Client side

```verum
async fn ping(host: &Text, port: Int) -> IoResult<Duration>
   
{
    let t0 = Instant.now();
    let mut stream = TcpStream.connect(f"{host}:{port}").await?;
    stream.write_all_async(b"ping\n").await?;

    let mut buf = [0u8; 16];
    let n = stream.read_async(&mut buf).await?;
    let elapsed = t0.elapsed();

    assert_eq(&buf[..n], b"ping\n");
    Result.Ok(elapsed)
}
```

## Error taxonomy

| `IoError` variant   | Typical cause                                  | Recovery                                       |
|---------------------|------------------------------------------------|-----------------------------------------------|
| `Timeout`           | Socket timeout expired                          | Retry or close.                                |
| `ConnectionReset`   | Peer sent `RST`                                 | Close; record as "abnormal close".             |
| `ConnectionRefused` | Connect to a closed port                        | Retry with backoff; fail after N tries.        |
| `AddrInUse`         | Bind to an already-bound addr                   | Kill old listener; `set_reuse_addr(true)`.     |
| `AddrNotAvailable`  | Interface gone                                  | Log and fail fast.                             |
| `BrokenPipe`        | Write after peer close                          | Treat as disconnect.                           |
| `Interrupted`       | Signal interrupted syscall                      | Retry the call.                                |
| `Cancelled`         | Task cancelled via nursery                      | Clean up and return.                           |

See [language/error-handling](/docs/language/error-handling) for the
general error-handling ladder.

## Stress testing

```bash
$ verum run --release &
$ for i in {1..1000}; do
    echo "hello $i" | nc -q 1 127.0.0.1 7777
  done
$ wait
```

For a heavier benchmark, use [wrk](https://github.com/wg/wrk) with a
HTTP overlay — but that requires an HTTP server, not an echo.

## See also

- **[`stdlib/net`](/docs/stdlib/net)** — full networking API.
- **[`stdlib/async`](/docs/stdlib/async)** — the async runtime.
- **[Nursery](/docs/cookbook/nursery)** — structured concurrency
  patterns.
- **[Channels](/docs/cookbook/channels)** — for fan-out message
  patterns on top of TCP.
- **[Scheduler](/docs/cookbook/scheduler)** — when you need
  priority-aware connection handling.
- **[Resilience](/docs/cookbook/resilience)** — retry, circuit
  breakers, bulkheads.
- **[DNS resolution](/docs/cookbook/dns)** — for resolving hostnames
  before connect.
