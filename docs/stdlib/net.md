---
sidebar_position: 1
title: net
---

# `core::net` — TCP, UDP, HTTP, TLS, DNS

Full network stack, V-LLSI-based (no libc dependency).

## Addresses

```verum
type IpAddr      is Ipv4(Ipv4Addr) | Ipv6(Ipv6Addr);
type SocketAddr  is V4(SocketAddrV4) | V6(SocketAddrV6);

let addr: SocketAddr = "127.0.0.1:8080".parse()?;
let ip: IpAddr       = "::1".parse()?;
```

## TCP

```verum
// Server
let listener = TcpListener::bind("0.0.0.0:3000").await?;
loop {
    let (stream, peer) = listener.accept().await?;
    spawn handle_connection(stream);
}

// Client
let mut stream = TcpStream::connect("example.com:80").await?;
stream.write_all(b"GET / HTTP/1.1\r\nHost: example.com\r\n\r\n").await?;
let mut buf = [0u8; 4096];
let n = stream.read(&mut buf).await?;
```

## UDP

```verum
let sock = UdpSocket::bind("0.0.0.0:0").await?;
sock.send_to(&payload, "1.2.3.4:53").await?;
let (n, peer) = sock.recv_from(&mut buf).await?;
```

## HTTP

```verum
// Client
let client = HttpClient::new(ClientConfig::default());
let resp = client
    .get("https://api.example.com/users/42")
    .header("Authorization", f"Bearer {token}")
    .send().await?;
let user: User = resp.json().await?;

// Server
async fn handler(req: Request<Body>) -> Response<Body> using [Database] {
    match (req.method(), req.uri().path()) {
        (Method.GET,  "/users") => list_users().await,
        (Method.POST, "/users") => create_user(req).await,
        _ => Response::not_found(),
    }
}

HttpServer::bind("0.0.0.0:8080")
    .serve(handler).await?;
```

Types: `Method`, `StatusCode`, `Version`, `Headers`, `Request<B>`,
`Response<B>`, `HttpClient`, `HttpError`, `Url`, `Cookie`.

## TLS

```verum
let cfg = TlsConfig::builder()
    .cert_chain(load_certs("cert.pem")?)
    .private_key(load_key("key.pem")?)
    .build()?;

let acceptor = TlsAcceptor::new(cfg);
let tls_stream = acceptor.accept(tcp_stream).await?;

// Client
let connector = TlsConnector::builder()
    .root_certs(TlsConfig::webpki_roots())
    .build()?;
let tls_stream = connector.connect("example.com", tcp_stream).await?;
```

Supports TLS 1.2 and 1.3. Certificate types: PEM, DER. Key types:
PKCS#8, PKCS#1.

## DNS

```verum
// Synchronous
let addrs: List<IpAddr> = lookup_host("example.com")?;
let addrs_v4 = lookup_host_v4("example.com")?;

// Async
let addrs = lookup_host_async("example.com").await?;

// Full resolver
let resolver = Resolver::default();
let records = resolver.resolve("example.com", DnsRecordType.A).await?;
```

## WebSocket

```verum
let ws = connect_ws("wss://echo.websocket.org").await?;
ws.send(WsMessage.Text("hello")).await?;
while let Maybe.Some(msg) = ws.next().await {
    match msg? {
        WsMessage.Text(t)    => print(t),
        WsMessage.Binary(b)  => process(b),
        WsMessage.Close(_)   => break,
        _ => {}
    }
}
```

## See also

- **[async](/docs/stdlib/async)** — the async runtime.
- **[io](/docs/stdlib/io)** — `Read` / `Write` protocols on sockets.
