---
title: TCP echo server
description: Async accept loop, connection handler, graceful shutdown.
---

# TCP echo server

```verum
use core.net.tcp::*;
use core.io::*;
use core.async::*;

async fn echo_server(addr: &Text) -> IoResult<()>
    using [IO, Logger]
{
    let listener = TcpListener.bind(addr).await?;
    Logger.info(&f"listening on {addr}");

    nursery(on_error: wait_all) {
        loop {
            let (stream, peer) = listener.accept_async().await?;
            Logger.info(&f"{peer} connected");
            spawn handle_client(stream, peer);
        }
    }
    Result.Ok(())
}

async fn handle_client(mut stream: TcpStream, peer: SocketAddr) using [Logger] {
    let mut buf = [0u8; 4096];
    loop {
        match stream.read_async(&mut buf).await {
            Result.Ok(0)  => break,                             // peer closed
            Result.Ok(n)  => {
                if stream.write_all_async(&buf[..n]).await.is_err() { break; }
            }
            Result.Err(e) => {
                Logger.warn(&f"{peer} io error: {e:?}");
                break;
            }
        }
    }
    Logger.info(&f"{peer} disconnected");
}

fn main() using [IO] {
    block_on(async {
        provide Logger = ConsoleLogger.new(LogLevel.Info) in {
            echo_server(&"0.0.0.0:7777").await.expect("server")
        }
    });
}
```

### Notes

- `accept_async` returns as soon as a connection is available; the
  loop keeps going.
- `spawn` inside `nursery` means the server waits for every
  connection handler to finish before returning (relevant on
  graceful shutdown).
- A 0-length `read` result means the peer closed its write side.
- `SocketAddr` implements `Display` — `f"{peer}"` gives `127.0.0.1:59234`.

### Graceful shutdown

Intercept `Ctrl+C`:

```verum
let stop = Shared.new(AtomicBool.new(false));
let s_clone = stop.clone();
spawn async move {
    wait_for_signal(Signal.Interrupt).await;
    s_clone.store(true, MemoryOrdering.Release);
};

while !stop.load(MemoryOrdering.Acquire) {
    select {
        r = listener.accept_async() => { /* handle */ }
        _ = sleep(100.ms()) => { continue; }           // periodic check
    }
}
```

### Setting TCP options

```verum
stream.set_nodelay(true)?;                   // disable Nagle
stream.set_keepalive(true)?;                 // TCP keepalive
stream.set_read_timeout_ms(5_000)?;
listener.set_nonblocking(true)?;
```

### Concurrent clients stress test

```bash
$ verum run --release &
$ for i in {1..1000}; do
    echo "hello $i" | nc -q 1 127.0.0.1 7777
  done
```

### See also

- **[net → TCP](/docs/stdlib/net#tcp)**
- **[Nursery](/docs/cookbook/nursery)** — structured connection-handling patterns.
- **[async](/docs/stdlib/async)** — the executor driving accept/read/write.
