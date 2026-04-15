---
sidebar_position: 1
title: net
description: TCP, UDP, HTTP, TLS, DNS — V-LLSI-native networking with zero FFI.
---

# `core::net` — Networking

Full network stack built directly on V-LLSI syscalls (no libc
dependency). RFC-conformant DNS, TLS 1.0–1.3 with platform-native
certificate stores, HTTP types, TCP/UDP sockets with async I/O.

| File | What's in it |
|---|---|
| `addr.vr` | `Ipv4Addr`, `Ipv6Addr`, `IpAddr`, `SocketAddrV4`, `SocketAddrV6`, `SocketAddr`, `ToSocketAddrs`, `AddrParseError` |
| `tcp.vr` | `TcpStream`, `TcpListener`, `Incoming`, `Shutdown` |
| `udp.vr` | `UdpSocket` |
| `dns.vr` | `Resolver`, `DnsRecord`, `DnsRecordType`, `DnsError`, `lookup_host`/`lookup_addr`/`resolve` (sync + async) |
| `http.vr` | `Method`, `StatusCode`, `Version`, `Headers`, `Request`, `Response`, `HttpClient`, `HttpHandler`, `HttpError`, `Url`, `Cookie`, `SameSite`, `ClientConfig`, `PoolConfig` |
| `tls.vr` | `TlsStream`, `TlsConnector`, `TlsAcceptor`, `TlsConfig`, `Certificate`, `PrivateKey`, `KeyType`, `TlsVersion`, `CertVerifyMode`, `SystemCerts`, `TlsError` |

Architecture:
- Linux → `io_uring` (fallback `epoll`), direct `socket`/`connect`/`sendto` syscalls.
- macOS → `kqueue` + libSystem.
- Windows → IOCP + Winsock2.
- DNS → RFC 1035, pure Verum, UDP + TCP fallback.
- TLS → OpenSSL on Linux, Security.framework on macOS, SChannel on Windows.

---

## IP addresses

### `Ipv4Addr`

```verum
Ipv4Addr::new(a, b, c, d) -> Ipv4Addr
Ipv4Addr::localhost() -> Ipv4Addr             // 127.0.0.1
Ipv4Addr::unspecified() -> Ipv4Addr           // 0.0.0.0
Ipv4Addr::broadcast() -> Ipv4Addr             // 255.255.255.255
Ipv4Addr::parse(&"127.0.0.1") -> Result<Ipv4Addr, AddrParseError>
Ipv4Addr::from_u32(bits) -> Ipv4Addr

a.octets() -> (Byte, Byte, Byte, Byte)
a.to_u32() -> Int
a.is_loopback() / is_unspecified() / is_private() / is_multicast() / is_broadcast() -> Bool
```

Implements `Eq`, `Ord`, `Hash`, `Clone`, `Copy`, `Debug`, `Display`.

### `Ipv6Addr`

```verum
Ipv6Addr::new(a, b, c, d, e, f, g, h) -> Ipv6Addr     // 8× UInt16
Ipv6Addr::localhost() -> Ipv6Addr                     // ::1
Ipv6Addr::unspecified() -> Ipv6Addr                   // ::
Ipv6Addr::parse(&"::1") -> Result<Ipv6Addr, AddrParseError>

a.segments() -> (Int, Int, Int, Int, Int, Int, Int, Int)
a.octets() -> [Byte; 16]
a.is_loopback() / is_unspecified() / is_multicast() / is_link_local() / is_unique_local() -> Bool
```

### `IpAddr`

```verum
type IpAddr is V4(Ipv4Addr) | V6(Ipv6Addr);

IpAddr::v4(a, b, c, d)        IpAddr::v6(a..h)
a.is_ipv4() / is_ipv6() / is_loopback() / is_unspecified() / is_multicast()
```

### `SocketAddr`

```verum
SocketAddr::new_v4(Ipv4Addr, port) -> SocketAddr
SocketAddr::new_v6(Ipv6Addr, port) -> SocketAddr
SocketAddr::parse(&"127.0.0.1:8080") -> Result<SocketAddr, AddrParseError>

s.ip() -> IpAddr      s.port() -> Int
s.is_ipv4() / s.is_ipv6()
```

### `ToSocketAddrs` — polymorphic resolution

```verum
type ToSocketAddrs is protocol {
    type Iter: Iterator<Item = SocketAddr>;
    fn to_socket_addrs(&self) -> IoResult<Self.Iter>;
}

// Implemented for:
//   SocketAddr            — trivial
//   (&Text, Int)          — DNS-resolve hostname
//   (Ipv4Addr, Int), (Ipv6Addr, Int), (IpAddr, Int)
//   &Text                 — parses "host:port"
```

```verum
TcpStream::connect("example.com:443").await?;           // uses ToSocketAddrs
TcpStream::connect(("::1", 8080)).await?;
```

### `AddrParseError`

```verum
type AddrParseError is InvalidFormat | InvalidOctet | InvalidPort;
```

---

## TCP

### `TcpStream`

```verum
TcpStream::connect<A: ToSocketAddrs>(addr) -> IoResult<TcpStream>
TcpStream::connect_addr(&SocketAddr) -> IoResult<TcpStream>

// Async variants
TcpStream::connect_async<A: ToSocketAddrs>(addr).await -> IoResult<TcpStream>

s.peer_addr() -> SocketAddr        s.local_addr() -> SocketAddr
s.as_raw_fd() -> FileDesc
s.set_read_timeout(ms: Int)        s.set_write_timeout(ms: Int)
s.set_nodelay(enable: Bool)        s.set_keepalive(enable: Bool)
s.set_linger(duration: Maybe<Duration>)
s.set_ttl(ttl: Int)
s.shutdown(how: Shutdown) -> IoResult<()>

// Implements Read, Write, AsyncRead, AsyncWrite, Drop
```

```verum
type Shutdown is Read | Write | Both;
```

### `TcpListener`

```verum
TcpListener::bind<A: ToSocketAddrs>(addr) -> IoResult<TcpListener>
TcpListener::bind_addr(&SocketAddr) -> IoResult<TcpListener>
TcpListener::bind_addr_with_backlog(&SocketAddr, backlog: Int)
TcpListener::bind_addr_reuseport(&SocketAddr, backlog: Int)    // SO_REUSEPORT

l.accept() -> IoResult<(TcpStream, SocketAddr)>
l.accept_async().await -> IoResult<(TcpStream, SocketAddr)>
l.incoming() -> Incoming                                  // iterator

l.local_addr() -> SocketAddr
l.set_ttl(ttl: Int)          l.set_only_v6(only: Bool)
```

### Example — echo server

```verum
async fn echo_server() using [IO] {
    let listener = TcpListener::bind("0.0.0.0:7").await?;
    loop {
        let (mut stream, peer) = listener.accept_async().await?;
        spawn async move {
            let mut buf = [0u8; 4096];
            loop {
                match stream.read_async(&mut buf).await {
                    Result.Ok(0) => break,
                    Result.Ok(n) => stream.write_all_async(&buf[..n]).await.ok(),
                    Result.Err(_) => break,
                }
            }
        };
    }
}
```

---

## UDP

```verum
UdpSocket::bind<A: ToSocketAddrs>(addr) -> IoResult<UdpSocket>
UdpSocket::bind_addr(&SocketAddr) -> IoResult<UdpSocket>

s.connect(&SocketAddr) -> IoResult<()>                  // default peer

// Connected
s.send(&buf) -> IoResult<Int>                s.recv(&mut buf) -> IoResult<Int>
// Unconnected
s.send_to(&buf, &addr) -> IoResult<Int>
s.recv_from(&mut buf) -> IoResult<(Int, SocketAddr)>
s.peek(&mut buf) -> IoResult<Int>
s.recv_nonblock(&mut buf) -> IoResult<Maybe<Int>>
s.send_nonblock(&buf) -> IoResult<Maybe<Int>>

// Sync + async forms available for all of the above.

s.local_addr() -> SocketAddr        s.peer_addr() -> Maybe<SocketAddr>

// Options
s.set_read_timeout(ms: Int)         s.set_write_timeout(ms: Int)
s.set_broadcast(enable: Bool)
s.set_send_buffer_size(bytes: Int)  s.set_recv_buffer_size(bytes: Int)
s.set_ttl(ttl: Int)

// Multicast
s.join_multicast_v4(&multicast: &Ipv4Addr, &iface: &Ipv4Addr) -> IoResult<()>
s.leave_multicast_v4(&multicast, &iface) -> IoResult<()>
s.set_multicast_ttl_v4(ttl: Int)    s.set_multicast_loop_v4(enable: Bool)
s.join_multicast_v6(&multicast: &Ipv6Addr, iface: Int)
s.leave_multicast_v6(&multicast, iface: Int)
```

---

## DNS

```verum
type DnsError is
    | NotFound | HostNotFound | TryAgain | NoRecovery | NoData
    | Timeout | ServerError | InvalidName | InvalidResponse
    | NetworkError(Text) | Truncated | Refused | Other(Text);

type DnsRecordType is A | AAAA | CNAME | MX | TXT | NS | PTR | SRV | SOA | ANY | Unknown(Int);

type DnsRecord is
    | A     { name: Text, ttl: Int, address: Ipv4Addr }
    | AAAA  { name: Text, ttl: Int, address: Ipv6Addr }
    | CNAME { name: Text, ttl: Int, canonical: Text }
    | MX    { name: Text, ttl: Int, priority: Int, exchange: Text }
    | TXT   { name: Text, ttl: Int, data: Text }
    | NS    { name: Text, ttl: Int, nameserver: Text }
    | PTR   { name: Text, ttl: Int, domain: Text }
    | SRV   { name: Text, ttl: Int, priority: Int, weight: Int, port: Int, target: Text }
    | SOA   { name: Text, ttl: Int, mname: Text, rname: Text, serial: Int, refresh: Int, retry: Int, expire: Int, minimum: Int };
```

### Quick helpers

```verum
lookup_host(&"example.com") -> Result<List<IpAddr>, DnsError>
lookup_host_v4(&"example.com") -> Result<List<Ipv4Addr>, DnsError>
lookup_host_v6(&"example.com") -> Result<List<Ipv6Addr>, DnsError>
lookup_addr(&IpAddr) -> Result<Text, DnsError>          // reverse

resolve(&"example.com", 443) -> Result<List<SocketAddr>, DnsError>

// Async equivalents
lookup_host_async(&host).await -> Result<List<IpAddr>, DnsError>
resolve_async(&host, port).await -> Result<List<SocketAddr>, DnsError>

// Validation
is_valid_domain(&input) -> Bool
is_ip_address(&input) -> Bool
```

### `Resolver` — explicit resolver

```verum
let resolver = Resolver::new()
    .nameserver_ip(Ipv4Addr::new(1, 1, 1, 1))       // Cloudflare
    .nameserver_ip(Ipv4Addr::new(8, 8, 8, 8))       // Google
    .timeout_ms(3000)
    .max_retries(2);

resolver.lookup_a(&"example.com").await
resolver.lookup_aaaa(&"example.com").await
resolver.lookup_cname(&"www.example.com").await -> Result<List<Text>, DnsError>
resolver.lookup_mx(&"example.com").await -> Result<List<(Int, Text)>, DnsError>
resolver.lookup_srv(&"_imap", &"_tcp", &"example.com").await
resolver.lookup_txt(&"example.com").await
resolver.lookup_ptr(&IpAddr::V4(Ipv4Addr::new(1, 1, 1, 1))).await
resolver.query(&"example.com", DnsRecordType.A).await -> Result<List<DnsRecord>, DnsError>

resolver.cache_clear()
```

### DNS record type constants

```verum
const DNS_TYPE_A:     UInt16 = 1;
const DNS_TYPE_NS:    UInt16 = 2;
const DNS_TYPE_CNAME: UInt16 = 5;
const DNS_TYPE_SOA:   UInt16 = 6;
const DNS_TYPE_PTR:   UInt16 = 12;
const DNS_TYPE_MX:    UInt16 = 15;
const DNS_TYPE_TXT:   UInt16 = 16;
const DNS_TYPE_AAAA:  UInt16 = 28;
const DNS_TYPE_SRV:   UInt16 = 33;
const DNS_TYPE_ANY:   UInt16 = 255;
```

---

## HTTP

Types and protocol. Full client implementation lives in a separate
cog (`http`); `core::net::http` gives you the building blocks.

### `Method`

```verum
type Method is Get | Head | Post | Put | Delete | Connect | Options | Trace | Patch;

m.as_str() -> Text        Method::from_str(&"GET") -> Maybe<Method>
m.is_safe() -> Bool        m.is_idempotent() -> Bool        m.has_body() -> Bool
```

### `StatusCode`

```verum
StatusCode::new(code: Int) -> StatusCode
StatusCode::ok()           StatusCode::created()      StatusCode::no_content()
StatusCode::bad_request()  StatusCode::unauthorized() StatusCode::forbidden()
StatusCode::not_found()    StatusCode::internal_server_error()

s.code() -> Int             s.reason_phrase() -> Text
s.is_informational() / is_success() / is_redirection() / is_client_error() / is_server_error()
```

### `Version`

```verum
type Version is Http10 | Http11 | Http2 | Http3;
```

### `Headers`

```verum
Headers::new()
h.insert(&name, &value)                   // replaces
h.append(&name, &value)                    // adds (multi-value per RFC 7230)
h.get(&name) -> Maybe<&List<Text>>
h.get_first(&name) -> Maybe<&Text>
h.contains(&name) -> Bool
h.remove(&name)                            h.clear()
h.iter() -> Iterator<(&Text, &List<Text>)>
```

### `Request` / `Response`

```verum
type Request is {
    method: Method,
    uri: Text,
    version: Version,
    headers: Headers,
    body: Maybe<List<Byte>>,
};

Request::new(method, &uri) -> Request
req.with_headers(headers) -> Request
req.with_body(bytes) -> Request
req.body_text() -> Maybe<Text>

type Response is {
    status: StatusCode,
    version: Version,
    headers: Headers,
    body: Maybe<List<Byte>>,
};

Response::new(status) -> Response
resp.with_headers(h) -> Response
resp.with_body(b) -> Response
resp.body_text() -> Maybe<Text>
```

### `Url`

```verum
Url::parse(&"https://user:pass@host:443/path?q#frag") -> Result<Url, HttpError>

u.scheme() -> &Text
u.host() -> Maybe<&Text>       u.port() -> Maybe<Int>
u.path() -> &Text
u.query() -> Maybe<&Text>      u.fragment() -> Maybe<&Text>
u.to_string() -> Text
```

### `Cookie`

```verum
type SameSite is Strict | Lax | None;

Cookie::new(&name, &value)
    .with_path(&"/")
    .with_domain(&"example.com")
    .with_max_age(3600)
    .secure().http_only()
    .with_same_site(SameSite.Lax)

c.to_header_value() -> Text
```

### Protocols

```verum
type HttpClient is protocol {
    fn request(&self, req: &Request) -> Result<Response, HttpError>;
}
type HttpHandler is protocol {
    fn handle(&self, req: &Request) -> Result<Response, HttpError>;
}

type HttpError is
    | ConnectionError(Text)  | InvalidUri(Text)
    | InvalidRequest(Text)   | InvalidResponse(Text)
    | Timeout                 | DnsResolution(Text)
    | TlsError(Text)          | BodyTooLarge
    | BodyEncoding(Text)      | Other(Text);
```

### Configuration

```verum
type ClientConfig is {
    timeout_ms: Int,
    max_redirects: Int,
    follow_redirects: Bool,
    pool_config: PoolConfig,
    user_agent: Maybe<Text>,
    default_headers: Headers,
};
type PoolConfig is {
    max_connections: Int,
    idle_timeout_ms: Int,
    read_timeout_ms: Int,
    write_timeout_ms: Int,
};
```

---

## TLS

### Versions

```verum
type TlsVersion is Tls10 | Tls11 | Tls12 | Tls13;

v.as_str() -> Text              v.wire_version() -> (Int, Int)
v.is_secure() -> Bool           // true iff v in {Tls12, Tls13}
```

### Certificates and keys

```verum
type KeyType is Rsa | Ec | Ed25519;

type Certificate is { der_data: List<Byte> };
Certificate::from_der(bytes)
Certificate::from_pem(&pem) -> Result<Certificate, TlsError>
Certificate::from_pem_chain(&pem) -> Result<List<Certificate>, TlsError>
cert.der_bytes() -> &[Byte]     cert.size() -> Int

type PrivateKey is { der_data: List<Byte>, key_type: KeyType };
PrivateKey::from_der(bytes, key_type)
PrivateKey::from_pem(&pem) -> Result<PrivateKey, TlsError>
key.key_type() -> KeyType

type SystemCerts;
SystemCerts::load() -> List<Certificate>    // platform-native store
```

### Configuration

```verum
type CertVerifyMode is Full | None | Custom;

type TlsConfig is {
    min_version: TlsVersion,
    max_version: TlsVersion,
    root_certs: List<Certificate>,
    identity_cert: Maybe<Certificate>,
    identity_key: Maybe<PrivateKey>,
    verify_mode: CertVerifyMode,
    alpn_protocols: List<Text>,
    use_system_certs: Bool,
    is_server: Bool,
};

TlsConfig::client()
    .with_root_certs(SystemCerts::load())
    .with_min_version(TlsVersion.Tls12)
    .with_alpn(&[&"h2", &"http/1.1"])

TlsConfig::server()
    .with_identity(cert, key)
    .with_alpn(&[&"h2"])
```

### Streams

```verum
type TlsStream is { inner: TcpStream, session: TlsSession, ... };

// Client
TlsStream::connect(tcp, &server_name, &config).await -> Result<TlsStream, TlsError>
// Server
TlsStream::accept(tcp, &config).await -> Result<TlsStream, TlsError>

s.read_async(&mut buf).await -> Result<Int, TlsError>
s.write_async(&buf).await -> Result<Int, TlsError>
s.write_all_async(&buf).await -> Result<(), TlsError>
s.shutdown_async().await -> Result<(), TlsError>

s.alpn_protocol() -> Maybe<&Text>
s.negotiated_version() -> Maybe<TlsVersion>
s.peer_certificate() -> Maybe<Certificate>
s.get_ref() -> &TcpStream
```

### High-level builders

```verum
let connector = TlsConnector::new().with_alpn(&[&"h2", &"http/1.1"]);
let tls = connector.connect(&"example.com", 443).await?;

let acceptor = TlsAcceptor::new(cert, key);
let tls = acceptor.accept(tcp).await?;
```

### `TlsError`

```verum
type TlsError is
    | HandshakeFailed(Text)
    | InvalidCertificate(Text)
    | InvalidKey(Text)
    | CertificateVerificationFailed(Text)
    | CertificateExpired
    | HostnameMismatch(Text)
    | AlertReceived(Int, Text)
    | IoError(Text)
    | UnsupportedVersion(TlsVersion)
    | NoCipherSuites;
```

---

## End-to-end HTTPS example

```verum
async fn fetch_json(url: &Text) -> Result<JsonValue, Error> using [IO] {
    let parsed = Url::parse(url)?;
    let host = parsed.host().ok_or(Error::new("no host"))?;
    let port = parsed.port().unwrap_or(443);

    let tcp = TcpStream::connect_async((host, port)).await?;
    let cfg = TlsConfig::client().with_root_certs(SystemCerts::load());
    let mut tls = TlsStream::connect(tcp, host, &cfg).await?;

    let req = f"GET {parsed.path()} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n";
    tls.write_all_async(req.as_bytes()).await?;

    let mut buf = List::<Byte>::new();
    let mut tmp = [0u8; 4096];
    loop {
        let n = tls.read_async(&mut tmp).await?;
        if n == 0 { break; }
        buf.extend_from_slice(&tmp[..n]);
    }
    let text = Text::from_utf8_lossy(&buf);
    let (_, body) = text.split_once(&"\r\n\r\n")
        .ok_or(Error::new("malformed response"))?;
    Result.Ok(parse_json(&body.to_string())?)
}
```

---

## See also

- **[io](/docs/stdlib/io)** — `Read`/`Write`/`AsyncRead`/`AsyncWrite` protocols.
- **[async](/docs/stdlib/async)** — the executor driving network I/O.
- **[sys](/docs/stdlib/sys)** — V-LLSI syscalls beneath the network stack.
