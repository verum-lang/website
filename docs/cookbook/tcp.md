---
title: TCP echo server
description: A complete blocking echo server and client, byte-stream framing, partial I/O, and socket errors.
---

# TCP echo server

TCP transports an ordered stream of bytes. One write can arrive in several
reads, and several writes can arrive in one read. An application protocol must
specify its own message boundaries.

The programs below use blocking sockets and handle one connection. They are a
starting point for understanding transport behavior. Concurrent admission,
request deadlines, cancellation and draining require additional server logic;
see [Weft's listener](/docs/stdlib/net/weft/listener).

## Server

Save this complete program in a cog's `src/main.vr` and run
`verum run --tier interpret`. It binds the loopback interface, accepts one client,
echoes each received chunk, and exits when the client closes its write side.

```verum
mount core.net.tcp.{TcpListener, TcpStream};
mount core.io.protocols.{Read, Write, StreamError};

fn echo_once() -> Result<(), StreamError> {
    let listener = TcpListener.bind("127.0.0.1:7777")?;
    print("listening on 127.0.0.1:7777");
    let (accepted, _) = listener.accept()?;
    let mut stream: TcpStream = accepted;
    stream.set_read_timeout(Maybe.Some(5000))?;
    stream.set_write_timeout(Maybe.Some(5000))?;

    let mut buffer: List<Byte> = List.with_capacity(4096);
    while buffer.len() < 4096 { buffer.push(0); }
    loop {
        let count = stream.read(buffer.as_mut_slice())?;
        if count == 0 { break; }
        stream.write_all(&buffer.as_slice()[..count])?;
    }
    Result.Ok(())
}

fn main() {
    echo_once().unwrap();
}
```

`read` initializes only the first `count` bytes. The server writes that prefix,
not the unused remainder of the buffer. Its memory requirement does not grow
with the number of bytes sent during the connection.

## Client

Run this second complete program from another cog while the server is waiting:

```verum
mount core.net.tcp.{TcpStream, Shutdown};
mount core.io.protocols.{Read, Write, StreamError};

fn ping() -> Result<(), StreamError> {
    let mut stream = TcpStream.connect("127.0.0.1:7777")?;
    stream.set_read_timeout(Maybe.Some(5000))?;
    stream.set_write_timeout(Maybe.Some(5000))?;
    stream.write_all("ping\n".as_bytes())?;
    stream.shutdown(Shutdown.Write)?;

    let mut reply: [Byte; 5] = [0; 5];
    stream.read_exact(&mut reply[..])?;
    assert_eq(Text.from_utf8(&reply[..]).unwrap(), "ping\n");
    Result.Ok(())
}

fn main() {
    ping().unwrap();
    print("echo received");
}
```

The client knows the reply length, so it uses `read_exact`. Shutting down the
write half signals end-of-input to the server while leaving the read half
available for its reply. A protocol that keeps connections open instead needs
another boundary, such as a length prefix or a delimiter.

## Partial operations and empty buffers

`write` returns the number of bytes accepted by the transport. That number may
be smaller than the supplied slice. `Write.write_all` repeats the operation
until all bytes are written or an error occurs; a zero-progress write is an
error. Successful writing means that the local transport accepted the data,
not that the remote application processed or persisted it.

`read` can return fewer bytes than requested. With a nonempty destination,
`Ok(0)` means the peer has closed its write side. An empty destination also
returns zero and therefore cannot be used to detect disconnection.
`Read.read_exact` fills the whole destination or reports an error, including
an unexpected end of input.

Synchronous operations accept byte slices, including slices into `List<Byte>`
and fixed arrays. Their observable unit is the byte, independent of the
container's internal representation. Binary data, including zero bytes, must
not be converted through text.

## Timeouts and error handling

`set_read_timeout` and `set_write_timeout` accept `Maybe.Some(milliseconds)`;
`Maybe.None` disables the corresponding socket timeout. These are socket-level
bounds on individual blocking operations. They do not impose a deadline on an
entire request, and the connect operation has a separate lifecycle.

Errors are `StreamError` values. Inspect `error.kind()` to obtain an
`IoErrorKind`; do not pattern-match fictional `IoError.Timeout` or
`IoError.Cancelled` variants. Socket timeouts can surface as `WouldBlock` or
`TimedOut`, depending on the operating system.

| Error kind | Meaning and response |
|---|---|
| `WouldBlock`, `TimedOut` | No progress within the socket's operating constraints. Apply the application's retry or deadline policy. |
| `ConnectionReset`, `BrokenPipe` | The connection is no longer usable for the attempted operation. End that session. |
| `ConnectionRefused` | The destination refused the connection. Bound retries and backoff. |
| `AddrInUse` | The bind address is occupied. Select an available address or deliberately configure listener sharing. |
| `Interrupted` | A system call was interrupted. Retry only while the application still permits the operation. |
| `UnexpectedEof` | The peer ended the stream before `read_exact` completed. Treat the message as truncated. |

## Socket options and concurrent services

`set_nodelay(true)` disables Nagle's algorithm. Choose it based on the protocol's
latency and packet-size requirements. `set_keepalive(true)` enables TCP
keepalive; it does not replace application deadlines.

Backlog and listener sharing are selected at bind time with
`TcpListener.bind_with_backlog(address, backlog)` or
`TcpListener.bind_reuseport(address)`. A listen backlog is a kernel queue limit,
not a limit on active application handlers. Enforce the latter separately.

The async I/O protocols use `List<Byte>` buffers. Their read operation appends
received bytes, whereas the synchronous `Read` operation above overwrites a
supplied mutable slice. Do not interchange these buffer contracts. Also review
[eager async calls and task handles](/docs/cookbook/async-basics) before turning
a blocking accept loop into a concurrent service. An `async` modifier alone
does not establish concurrent handling, cancellation cleanup or bounded drain.

## See also

- [Networking API](/docs/stdlib/net)
- [Weft listener and connection limits](/docs/stdlib/net/weft/listener)
- [Async / await basics](/docs/cookbook/async-basics)
- [Error handling](/docs/language/error-handling)
