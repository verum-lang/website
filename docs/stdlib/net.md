---
sidebar_position: 1
title: net
description: TCP, UDP, HTTP, TLS, DNS — V-LLSI-native networking with zero FFI.
status: partial
status_detail: Round 19 (2026-07-05) — **PRELUDE-FREEFN CLOSED end-to-end**: `f"{x:?}"` now binds `format_debug` implicitly (scanner keyed inline-prelude concrete mounts under `core` instead of `core.prelude`; consumer replay had no metadata fallback for unloaded source modules; the pipeline never injected the implicit prelude glob — all three fixed). **Cross-module `collection[i].field` OOB CLOSED**: archive dropped free-fn nested return generics (`Result<List<T>,E>`→bare `List`), so `let m=f().unwrap(); m[i].field` fell to the global field-interner — now composes `return_type_inner` with full nesting. `net/mod` umbrella suite added (26 GREEN); `cidr` block-boundary API (network_address/last_address/broadcast_address/normalize + Eq/Display) → 102 GREEN; `uri_template` RFC 6570 §3.2.2 list-comma + §3.2.8 empty-string fixed → 41 GREEN; `http_range` 51 GREEN (Index-field); `http_cache` 46 GREEN. New property/integration suites for 8 modules. Deep codegen defects pinned (@ignore'd LOCK-INs): TUPLE-DESTRUCTURE-INDEXED, INLINE-AGG-REF-ARG, HTTPPARSE-1 (feed compile-crash), select_best_media/coding codegen crash, v4-mapped dotted parse. Round 18 (2026-06-20) — first cross-tier `--aot` validation of a net module: `addr` is Tier-0 138/138, Tier-1 103/138 after the TUPLE-EQ-AOT codegen fix (tuple `==`/`!=` now lowered element-wise; was always-true under AOT). Remaining gap root-caused to DISP-EMPTY-AOT + PARSE-AOT (+ PRELUDE-FREEFN gating `:?` Debug) — see `addr/audit.md §3.5`. `addr` reclassified **stable→partial** to reflect the Tier-1 surface. Round 17d (2026-05-28) — URL-8 + WS-6 root causes isolated + source-side workarounds landed (qualified Result.* arms stripped + Sha1 chain broken). Round 17c (2026-05-28) — 10-defect SIGSEGV + cross-module-field close-out via byte-push + closure-free + qualified-arm + transitive-mutation-inline stdlib discipline. CIDR-1 + CIDR-2 + IPV6CAN-1 + URL-1 + URL-7 + URITPL-1 + HTTPRNG-1 + HTTPCACHE-1 + CONNEG-1 + LINKHDR-1 all CLOSED; 50+ regression tests transitioned from @ignore'd to GREEN under `--interp`. **Stable**: cidr, unix, url, ipv6_canonical, uri_template, http_range, http_cache, content_negotiation, link_header. **Partial**: addr (Tier-1 103/138 — TUPLE-EQ-AOT fixed; DISP-EMPTY + PARSE remain), dns (mock-resolver gated), http (transport harness gated), tls (backend pluggability gated). **Regression-only** (data-surface only — functional surface gated on harnesses): tcp, udp, h3, http2, http3, http_parser, proxy, quic, tls13, websocket (WS-6 stack-overflow pinned), weft, shutdown. Cross-tier `--aot` validation deferred until task #7 (AOT stdlib build cascade) closes.
---

# `core.net` — Networking

Full network stack built directly on V-LLSI syscalls (no libc
dependency). RFC-conformant DNS, TLS 1.0–1.3 with platform-native
certificate stores, HTTP types, TCP/UDP sockets with async I/O.

## Module status

Each `core.net.*` module carries an explicit conformance status — same
contract as [`core.base`](./base.md#module-status),
[`core.collections`](./collections.md#module-status), and
[`core.time`](./time.md#module-status). The status row is the truth-table
over the module's public API exercised by `core-tests/net/<module>/`
under both Tier 0 (interpreter) and Tier 2 (AOT). Disagreement between
tiers is itself a test failure.

| Status | Meaning |
|---|---|
| **stable** | Every public method conformance-tested under interp + AOT; algebraic laws pinned. |
| **partial** | Subset stable; remainder gated by upstream defects, documented per-module. |
| **regression-only** | Tests gate on language-level defects (precompile-cascade, codegen, harness gaps), pinned by `@ignore`'d LOCK-IN regressions. |
| **undocumented** | Snapshot from source; no runtime conformance pin yet. |

| Module | Status | Conformance suite |
|---|---|---|
| `addr.vr`           | **partial**          | [core-tests/net/addr](https://github.com/verum-lang/verum/tree/main/core-tests/net/addr) — Ipv4Addr/Ipv6Addr/IpAddr/SocketAddrV4/SocketAddrV6/SocketAddr full surface + RFC 5735/1918/5771/4291 predicates + parse happy/error + AddrParseError disjointness + **Display rendering**. **Cross-tier `--aot` validated 2026-06-20: Tier-0 138/138, Tier-1 103/138** (after the **TUPLE-EQ-AOT codegen fix** — see below). The remaining Tier-1 gap = 2 root-caused codegen defect classes (see [`addr/audit.md §3.5`](https://github.com/verum-lang/verum/tree/main/core-tests/net/addr/audit.md)): **DISP-EMPTY-AOT** (f-string Display of user types → empty), **PARSE-AOT** (v4/v6/socket parse); **PRELUDE-FREEFN** (`f"{x:?}"`→`format_debug` unbound under AOT/run) keeps `:?` Debug out of the suite. **TUPLE-EQ-AOT CLOSED** — tuple `==`/`!=` was always-true under AOT (`lower_cmp_generic` misread a tuple `Pack` pointer as a `Text` and strcmp'd it); now lowered element-wise in VBC codegen, flipping the 8 `is_unspecified`/`is_broadcast`/ipv6-predicate tests green. Construction, scalar + tuple predicates, `to_u32`/`from_u32`, accessors, `AddrParseError` Eq pass both tiers. Fixed test bug: `fe90` **is** link-local (`fe80::/10` = `fe80..=febf`). |
| `cidr.vr`           | **stable**           | [core-tests/net/cidr](https://github.com/verum-lang/verum/tree/main/core-tests/net/cidr) — 40 unit + 26 property + 5 regression. **CIDR-1 + CIDR-2 both CLOSED 2026-05-28** via 4-commit source-side discipline (closure-free + byte-push slice_text + cross-type Err-payload discard + inline `self.blocks.push()` in add_text). 5/5 regression tests transition from @ignore'd-SIGSEGV to GREEN. See [`cidr/audit.md §3.1`](https://github.com/verum-lang/verum/tree/main/core-tests/net/cidr/audit.md). |
| `dns.vr`            | **partial**          | [core-tests/net/dns](https://github.com/verum-lang/verum/tree/main/core-tests/net/dns) — 45 unit + 41 property + 14 regression. RFC 1035 §3.2.2 wire constants + DnsRecordType 10-variant disjointness + DnsRecord 9-variant payload preservation + DnsError 13-variant + DnsRecordEntry TTL boundary. **DNS-1..6 @ignore'd** — live `lookup_host*`/`resolve`/`Resolver.query` need mock-resolver harness; data-surface fully covered. 45/45 unit + 45/45 property GREEN under `--interp` 2026-05-27. |
| `tcp.vr`            | **regression-only**  | [core-tests/net/tcp](https://github.com/verum-lang/verum/tree/main/core-tests/net/tcp) — 6 unit + 12 property + 7 regression. Shutdown 3-variant lattice + 9-cell pairwise disjointness via `is` (no Eq impl). **TCP-1..4 @ignore'd** — TcpStream.connect / TcpListener.accept / AsyncRead-AsyncWrite / socket options need loopback harness; SOCKADDR_IN_SIZE/SOCKADDR_IN6_SIZE pinned indirectly via `core.net.addr` round-trip. |
| `udp.vr`            | **regression-only**  | [core-tests/net/udp](https://github.com/verum-lang/verum/tree/main/core-tests/net/udp) — 2 unit + 6 regression. **UDP-1..4 + UDP-6 @ignore'd** — bind/send_to/recv_from/multicast need socket-fixture harness; UDP-5 active mount-resolution smoke. |
| `unix.vr`           | **stable**           | [core-tests/net/unix](https://github.com/verum-lang/verum/tree/main/core-tests/net/unix) — 22 unit + 33 property + 13 regression. UnixError 7-variant Eq + payload preservation + ShutdownKind via `is` + PeerCred 3-axis field independence (pid/uid/gid sentinel -1) + FdPassingError.NotImplemented stub. **UNIX-1..5 @ignore'd** — bind/connect/AsyncRead-AsyncWrite/PeerCred-query/SCM_RIGHTS need fixture harness. 13/13 unit GREEN under `--interp` 2026-05-27. |
| `tls.vr`            | **partial**          | [core-tests/net/tls](https://github.com/verum-lang/verum/tree/main/core-tests/net/tls) — 31 unit + 38 property + 10 regression. TlsVersion 4-variant + wire_version (3,1)/(3,2)/(3,3)/(3,4) per RFC 2246/4346/5246/8446 + is_secure (Tls12/Tls13 only) + KeyType 3-variant + CertVerifyMode + Certificate/PrivateKey from_der. **TLS-1..5 @ignore'd** — TlsConnector/TlsAcceptor + Certificate/PrivateKey from_pem + ALPN backend not yet implemented; 5 active LOCK-IN RFC-stable wire constants. 19/19 unit GREEN under `--interp` 2026-05-27. |
| `tls13/*`           | **partial**          | Umbrella [core-tests/net/tls13](https://github.com/verum-lang/verum/tree/main/core-tests/net/tls13) — 32 unit. **Per-submodule (2026-05-29):** `alert` (20 — AlertLevel to_u8/from_u8 + 12 §6 description codes), `cipher_suite` (11 — 5 §B.4 codepoints + hash_kind + round-trip), `named_group` (11 — 8 §4.2.7 codepoints + round-trip), `sig_scheme` (14 — §4.2.3 codepoints + Unknown passthrough + round-trip), `version` (10 — ProtocolVersion §4.1.2 wire). Live handshake / key-schedule HKDF / record AEAD gated on the algorithmic primitives + transport harness. |
| `http.vr`           | **partial**          | [core-tests/net/http](https://github.com/verum-lang/verum/tree/main/core-tests/net/http) — 116 unit (incl. status_test) + 60 property + 19 regression. HTTP Method 9-variant + is_safe/is_idempotent/has_body truth tables (RFC 7231/7230) + StatusCode 1xx/2xx/3xx/4xx/5xx classification + Version 4-variant. **HTTP-5..7 @ignore'd** — HttpClient.get / HttpServer.bind / wire round-trip need transport harness. |
| `url.vr`            | **stable**           | [core-tests/net/url](https://github.com/verum-lang/verum/tree/main/core-tests/net/url) — 54 unit + 45 property + 8 regression + 7 diagnostic. Url.parse for http/https/ftp/file + scheme lowercase canonicalisation per RFC 3986 §3.1, percent_encode/decode RFC 3986 §2.1 over alphanum + reserved + UTF-8 multi-byte, UrlErrorKind 6-variant Eq + 15 pairwise-disjoint pairs, MAX_URL_LENGTH_BYTES=65536 DoS guard. **URL-8 CLOSED 2026-05-28** via VBC codegen `extract_expr_type_name` + `infer_expr_type_name` MethodCall static-call generic-instantiation preservation fix (commit `a8fb1933e`). 33/33 property tests GREEN. **URL-2** UTF-32 percent_encode sweep still gated. |
| `http_parser.vr`    | **regression-only**  | [core-tests/net/http_parser](https://github.com/verum-lang/verum/tree/main/core-tests/net/http_parser) — 36 unit. RFC 7230 HTTP/1.1 wire parser state machine + ParseError variants + DoS guards (max-headers/max-header-len/max-line-len) + body-framing resolution (§3.3.3) + chunked decoder. Live parser-against-wire-fixtures gated on fixture model. |
| `http_cache.vr`     | **stable**           | [core-tests/net/http_cache](https://github.com/verum-lang/verum/tree/main/core-tests/net/http_cache) — 23 unit + 6 regression. **HTTPCACHE-1 CLOSED 2026-05-28** via byte-push slice_vec helper fix; 6/6 regression tests transition from @ignore'd-SIGSEGV to GREEN. Cache-Control directive parser + revalidation (If-Modified-Since/ETag) + stale-while-revalidate per RFC 7234. |
| `http_range.vr`     | **stable**           | [core-tests/net/http_range](https://github.com/verum-lang/verum/tree/main/core-tests/net/http_range) — 19 unit + 9 regression. **HTTPRNG-1 CLOSED 2026-05-28** via byte-push slice_range + inline `b"bytes "` / `b"bytes */"` literals; 9/9 regression tests transition from @ignore'd-SIGSEGV to GREEN. RFC 7233 Range header parsing + 206 Partial Content + RangeError variants. |
| `content_negotiation.vr` | **stable**       | [core-tests/net/content_negotiation](https://github.com/verum-lang/verum/tree/main/core-tests/net/content_negotiation) — 13 unit + 8 regression. **CONNEG-1 CLOSED 2026-05-28** via byte-push trim_ws helper fix; 8/8 regression tests transition from @ignore'd-SIGSEGV to GREEN. RFC 7231 §5.3.2 Accept header parsing + q-value precedence + media-range matching + wildcard vs concrete precedence. |
| `link_header.vr`    | **stable**           | [core-tests/net/link_header](https://github.com/verum-lang/verum/tree/main/core-tests/net/link_header) — 12 unit + 8 regression. **LINKHDR-1 CLOSED 2026-05-28** via byte-push slice_text + inline `b", "` / `b"; "` literals; 8/8 regression tests transition from @ignore'd-SIGSEGV to GREEN. RFC 8288 Link header parsing + uri-reference + rel + title + media + type + hreflang link-extension parameters. |
| `uri_template.vr`   | **stable**           | [core-tests/net/uri_template](https://github.com/verum-lang/verum/tree/main/core-tests/net/uri_template) — 10 unit + 7 regression. **URITPL-1 CLOSED 2026-05-28** via byte-push literal-collection in parse; 7/7 regression tests transition from @ignore'd-SIGSEGV to GREEN. RFC 6570 URI Template Level 1 + Level 2 + Level 3 + Level 4 prefix expansion. |
| `ipv6_canonical.vr` | **stable**           | [core-tests/net/ipv6_canonical](https://github.com/verum-lang/verum/tree/main/core-tests/net/ipv6_canonical) — 21 unit + 3 regression. **IPV6CAN-1 CLOSED 2026-05-28** via closure-free parse + inline `b"::ffff:"` literal in format_v4_mapped; 3/3 regression tests transition from @ignore'd-SIGSEGV to GREEN. RFC 5952 canonical IPv6 text-representation (lowercase hex, longest-zero-run compression with `::`, leading-zero suppression). |
| `http2/*`           | **partial**          | Umbrella [core-tests/net/http2](https://github.com/verum-lang/verum/tree/main/core-tests/net/http2) — 57 unit. **Per-submodule (2026-05-29):** `hpack` (49 — RFC 7541 §5.1 integer codec w/ Appendix C vectors + §5.2 string codec + §4.4 eviction; 2 gated ENCODE-1), `error` (29 — ErrorCode §7 + Http2Error ADT), `stream` (27 — §5.1 FSM single-step + §5.1.1 id alloc; 8 gated MUTSELF-MATCH-1), `static_table` (15 — §A), `frame` (22 — FrameType/FrameFlags + FrameHeader 9-byte wire round-trip). **Fundamental fix:** DEFERRED-INIT-1 (compiler) + EXTSLICE-1 hpack.decode_string. Full frame/HPACK codec round-trip + CONTINUATION gated on EXTSLICE-1/ENCODE-1. |
| `http3/*` + `h3/*` | **partial**          | [core-tests/net/http3](https://github.com/verum-lang/verum/tree/main/core-tests/net/http3) — 11 unit + [core-tests/net/h3](https://github.com/verum-lang/verum/tree/main/core-tests/net/h3) — 13 unit. **Per-submodule (2026-05-29):** h3/`error` (24 — 17 §8.1 H3 + 3 §6 QPACK codes + new/value + range disjointness + H3Error ADT). Live H3 transport + full frame/QPACK codec gated. |
| `quic/*`            | **partial**          | Umbrella [core-tests/net/quic](https://github.com/verum-lang/verum/tree/main/core-tests/net/quic) — 24 unit. **Per-submodule (2026-05-29):** `version` (14 — §15/RFC 9369 + RFC 8701 greasing), `connection_id` (11 — §5.1 ≤20-byte bound), `frame` (21 — §13/§9.1 attribute predicates + FrameError ADT), `error` (25 — 17 §20.1 TransportErrorCode + ApplicationErrorCode + QuicError ADT). Live handshake + frame/varint codec gated on EXTSLICE-1 + transport harness. |
| `websocket.vr`      | **regression-only**  | [core-tests/net/websocket](https://github.com/verum-lang/verum/tree/main/core-tests/net/websocket) — 38 unit + 16 regression. WebSocket opcode constants per RFC 6455 §5.2 (CONT=0x0/TEXT=0x1/BINARY=0x2/CLOSE=0x8/PING=0x9/PONG=0xA) + CloseCode pairwise-disjoint + Sec-WebSocket-Accept GUID per §4.2.2. **WS-3..5 @ignore'd** — handshake / permessage-deflate / fragmented Continuation need transport harness. |
| `proxy/*`           | **regression-only**  | [core-tests/net/proxy](https://github.com/verum-lang/verum/tree/main/core-tests/net/proxy) — 8 unit. LoadBalancer 3-variant + rate-limit cost constants. Umbrella covers circuit_breaker / health_check / loadbalancer / rate_limit / retry / upstream_pool. |
| `weft/*`            | **regression-only**  | [core-tests/net/weft](https://github.com/verum-lang/verum/tree/main/core-tests/net/weft) — 20 unit. Server middleware umbrella (CORS / request-ID injector / trust-IP allow-list / body-size limiter / gzip codec). Live server gated on TcpListener harness. |
| `shutdown.vr`       | **regression-only**  | [core-tests/net/shutdown](https://github.com/verum-lang/verum/tree/main/core-tests/net/shutdown) — 8 unit. Graceful-shutdown coordinator + 3-variant Drainability ADT. |
| `mod.vr`            | **stable**           | [core-tests/net/mod](https://github.com/verum-lang/verum/tree/main/core-tests/net/mod) — 26 tests (Round 19). The umbrella re-export contract: every test constructs a value through `mount core.net.{...}` (and the `core.net.prelude.*` glob) AND calls an impl method on it, so a dropped impl block re-manifests as a suite-wide failure (pins the umbrella-reexport-impl class, cf. `core.sys.{MemProt}`). addr / http / tls / dns / unix surfaces + prelude double-hop. |

The status table is the runtime truth, not the file's `lifecycle`
annotation. When the two diverge, the table is the source of truth for
callers.

### Round 19 (2026-07-05) — language-level fixes surfaced by the net suite

Two fixes here are not net-specific — they are language-level defects the
net conformance suite exposed, fixed once for **all** user code:

* **PRELUDE-FREEFN — `f"{x:?}"` bound an unbound `format_debug`.** The
  f-string Debug lowering targets the prelude free fn `format_debug`, but
  it never resolved: (1) the precompile scanner keyed the inline prelude's
  concrete named mounts (`super.text.format.format_debug`, `super.io.print`,
  `super.math.{sin,…}`) under the *file's* module (`core`) instead of
  `core.prelude`; (2) the consumer's glob-replay had a metadata fallback
  only when the source module loaded as a `ModuleInfo` — an unmounted
  source (`core.text.format` under a bare `mount core.prelude.*`) silently
  no-op'd; (3) the pipeline compile path never injected the implicit
  prelude glob at all. All three fixed — bare `range`, `format_display`,
  and `f"{x:?}"` now resolve implicitly.

* **Cross-module `collection[i].field` out-of-bounds.** `let m =
  free_fn().unwrap(); m[i].field` on a cross-module record element baked a
  wrong field index via the global `intern_field_name` fallback, because
  the archive rendered a free fn's nested return generics
  (`Result<List<ResolvedRange>, E>`) down to the bare base (`List`), losing
  the element type. Fixed by rendering `return_type_inner` with full
  nesting (`archive_ctx_loader::type_ref_full_name`) and composing it in
  the `Call` arm of `infer_expr_type_name`. This flipped the `http_range`
  and `link_header` resolve/lookup suites.

**Deep codegen defects the suite pinned** (each an `@ignore`'d LOCK-IN —
compile-time crashers must skip compilation):

| Defect | Shape | Status |
|---|---|---|
| TUPLE-DESTRUCTURE-INDEXED | `let (a, b) = &list[i]` reads garbage; `list[i].0`/`.1` works | worked around in `link_header` |
| RECORD-LET-REF-TYPE-LOSS | `let e = &list[i]; e.field[j].0.as_bytes()` fails method resolution; direct `list[i].field[j].0` works | worked around in `link_header` |
| INLINE-AGG-REF-ARG | inline `&Aggregate { … }` as a call argument crashes codegen; `let x = …; &x` works | worked around in `http_range` |
| HTTPPARSE-1 | `HttpParser.feed()` compile-crashes | `http_parser` feed laws pinned |
| SELECTBESTMEDIA-CODEGEN | `select_best_media` / some `select_best_coding` calls crash codegen | `content_negotiation` select laws pinned |
| IPV6-V4MAPPED-PARSE | `Ipv6Addr.parse("::ffff:1.2.3.4")` returns Err (no dotted-quad tail) | 2 `ipv6_canonical` laws pinned |

---

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
Ipv4Addr.new(a, b, c, d) -> Ipv4Addr
Ipv4Addr.localhost() -> Ipv4Addr             // 127.0.0.1
Ipv4Addr.unspecified() -> Ipv4Addr           // 0.0.0.0
Ipv4Addr.broadcast() -> Ipv4Addr             // 255.255.255.255
Ipv4Addr.parse(&"127.0.0.1") -> Result<Ipv4Addr, AddrParseError>
Ipv4Addr.from_u32(bits) -> Ipv4Addr

a.octets() -> (Byte, Byte, Byte, Byte)
a.to_u32() -> Int
a.is_loopback() / is_unspecified() / is_private() / is_multicast() / is_broadcast() -> Bool
```

Implements `Eq`, `Ord`, `Hash`, `Clone`, `Copy`, `Debug`, `Display`.

### `Ipv6Addr`

```verum
Ipv6Addr.new(a, b, c, d, e, f, g, h) -> Ipv6Addr     // 8× UInt16
Ipv6Addr.localhost() -> Ipv6Addr                     // ::1
Ipv6Addr.unspecified() -> Ipv6Addr                   // ::
Ipv6Addr.parse(&"::1") -> Result<Ipv6Addr, AddrParseError>

a.segments() -> (Int, Int, Int, Int, Int, Int, Int, Int)
a.octets() -> [Byte; 16]
a.is_loopback() / is_unspecified() / is_multicast() / is_link_local() / is_unique_local() -> Bool
```

### `IpAddr`

```verum
type IpAddr is V4(Ipv4Addr) | V6(Ipv6Addr);

IpAddr.v4(a, b, c, d)        IpAddr.v6(a..h)
a.is_ipv4() / is_ipv6() / is_loopback() / is_unspecified() / is_multicast()
```

### `SocketAddr`

```verum
SocketAddr.new_v4(Ipv4Addr, port) -> SocketAddr
SocketAddr.new_v6(Ipv6Addr, port) -> SocketAddr
SocketAddr.parse(&"127.0.0.1:8080") -> Result<SocketAddr, AddrParseError>

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
TcpStream.connect("example.com:443").await?;           // uses ToSocketAddrs
TcpStream.connect(("::1", 8080)).await?;
```

### `AddrParseError`

```verum
type AddrParseError is InvalidFormat | InvalidOctet | InvalidPort;
```

---

## TCP

### `TcpStream`

```verum
TcpStream.connect<A: ToSocketAddrs>(addr) -> IoResult<TcpStream>
TcpStream.connect_addr(&SocketAddr) -> IoResult<TcpStream>

// Async variants
TcpStream.connect_async<A: ToSocketAddrs>(addr).await -> IoResult<TcpStream>

s.peer_addr() -> SocketAddr        s.local_addr() -> SocketAddr
s.as_raw_fd() -> FileDesc
s.set_read_timeout(ms: Int)        s.set_write_timeout(ms: Int)
s.set_nodelay(enable: Bool)        s.set_keepalive(enable: Bool)
s.set_linger(duration: Maybe<Duration>)
s.set_ttl(ttl: Int)
s.shutdown(how: Shutdown) -> IoResult<()>

// Implements Read, Write, AsyncRead, AsyncWrite, Drop
```

### Async I/O protocol

`TcpStream` implements `AsyncRead` and `AsyncWrite` from
`core.io.async_protocols`. Readiness-awaiting uses the `IOEngine` —
on `EAGAIN`/`WouldBlock`, a waker is registered with the kernel-level
reactor (io_uring / epoll / kqueue / IOCP) so the task wakes when data
is ready.

```verum
// Protocol methods
stream.poll_read(cx: &mut Context, buf: &mut List<Int>)
    -> Poll<Result<Int, IoError>>
stream.poll_write(cx: &mut Context, buf: &List<Int>)
    -> Poll<Result<Int, IoError>>
stream.poll_flush(cx: &mut Context) -> Poll<Result<(), IoError>>
stream.poll_shutdown(cx: &mut Context) -> Poll<Result<(), IoError>>

// Ergonomic async wrappers
stream.read_async(&mut buf).await -> Result<Int, IoError>
stream.write_async(&buf).await -> Result<Int, IoError>

// Cancellation-aware variants
stream.read_cancellable(&mut buf, &token).await
    -> Result<Result<Int, IoError>, CancellationError>
stream.write_cancellable(&buf, &token).await
    -> Result<Result<Int, IoError>, CancellationError>
```

On Linux, read/write use `MSG_DONTWAIT` to avoid blocking the reactor
thread. On macOS, socket is non-blocking at creation with
`SO_NOSIGPIPE` to prevent SIGPIPE on closed connections.

```verum
type Shutdown is Read | Write | Both;
```

### `TcpListener`

```verum
TcpListener.bind<A: ToSocketAddrs>(addr) -> IoResult<TcpListener>
TcpListener.bind_addr(&SocketAddr) -> IoResult<TcpListener>
TcpListener.bind_addr_with_backlog(&SocketAddr, backlog: Int)
TcpListener.bind_addr_reuseport(&SocketAddr, backlog: Int)    // SO_REUSEPORT

l.accept() -> IoResult<(TcpStream, SocketAddr)>
l.accept_async().await -> IoResult<(TcpStream, SocketAddr)>
l.accept_cancellable(&token).await
    -> Result<Result<(TcpStream, SocketAddr), IoError>, CancellationError>
l.incoming() -> Incoming                                  // blocking iterator
l.incoming_async() -> AsyncIncoming                       // Stream<Item = Result<TcpStream, IoError>>

l.local_addr() -> SocketAddr
l.set_ttl(ttl: Int)          l.set_only_v6(only: Bool)
```

### `AsyncIncoming` — async accept stream

Implements `Stream<Item = Result<TcpStream, IoError>>`. Use in a `while
let` or `for await` loop (once the `AsyncStream` protocol lands; manual
`poll_next` works today):

```verum
let listener = TcpListener.bind_reuseport("0.0.0.0:8080")?;
let mut incoming = listener.incoming_async();
// ... with AsyncStream protocol ...
// for await conn in listener.incoming_async() {
//     spawn handle_client(conn?);
// }
```

### Example — echo server

```verum
async fn echo_server() {
    let listener = TcpListener.bind("0.0.0.0:7").await?;
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
UdpSocket.bind<A: ToSocketAddrs>(addr) -> IoResult<UdpSocket>
UdpSocket.bind_addr(&SocketAddr) -> IoResult<UdpSocket>

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
let resolver = Resolver.new()
    .nameserver_ip(Ipv4Addr.new(1, 1, 1, 1))       // Cloudflare
    .nameserver_ip(Ipv4Addr.new(8, 8, 8, 8))       // Google
    .timeout_ms(3000)
    .max_retries(2);

resolver.lookup_a(&"example.com").await
resolver.lookup_aaaa(&"example.com").await
resolver.lookup_cname(&"www.example.com").await -> Result<List<Text>, DnsError>
resolver.lookup_mx(&"example.com").await -> Result<List<(Int, Text)>, DnsError>
resolver.lookup_srv(&"_imap", &"_tcp", &"example.com").await
resolver.lookup_txt(&"example.com").await
resolver.lookup_ptr(&IpAddr.V4(Ipv4Addr.new(1, 1, 1, 1))).await
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
cog (`http`); `core.net.http` gives you the building blocks.

### `Method`

```verum
type Method is Get | Head | Post | Put | Delete | Connect | Options | Trace | Patch;

m.as_str() -> Text        Method.from_str(&"GET") -> Maybe<Method>
m.is_safe() -> Bool        m.is_idempotent() -> Bool        m.has_body() -> Bool
```

### `StatusCode`

```verum
StatusCode.new(code: Int) -> StatusCode
StatusCode.ok()           StatusCode.created()      StatusCode.no_content()
StatusCode.bad_request()  StatusCode.unauthorized() StatusCode.forbidden()
StatusCode.not_found()    StatusCode.internal_server_error()

s.code() -> Int             s.reason_phrase() -> Text
s.is_informational() / is_success() / is_redirection() / is_client_error() / is_server_error()
```

### `Version`

```verum
type Version is Http10 | Http11 | Http2 | Http3;
```

### `Headers`

```verum
Headers.new()
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

Request.new(method, &uri) -> Request
req.with_headers(headers) -> Request
req.with_body(bytes) -> Request
req.body_text() -> Maybe<Text>

type Response is {
    status: StatusCode,
    version: Version,
    headers: Headers,
    body: Maybe<List<Byte>>,
};

Response.new(status) -> Response
resp.with_headers(h) -> Response
resp.with_body(b) -> Response
resp.body_text() -> Maybe<Text>
```

### `Url`

```verum
Url.parse(&"https://user:pass@host:443/path?q#frag") -> Result<Url, HttpError>

u.scheme() -> &Text
u.host() -> Maybe<&Text>       u.port() -> Maybe<Int>
u.path() -> &Text
u.query() -> Maybe<&Text>      u.fragment() -> Maybe<&Text>
u.to_string() -> Text
```

### `Cookie`

```verum
type SameSite is Strict | Lax | None;

Cookie.new(&name, &value)
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

## HTTP/1.1 wire-parser — `core.net.http_parser`

Zero-copy, resumable, SIMD-accelerated HTTP/1.1 parser intended for the
hot-path of HTTP servers and clients (the Weft framework target budget is
< 150 ns/request on modern x86_64). Header key/value pairs are returned as
`(offset, length)` views into the input buffer — no allocations during
parsing.

### API overview

```verum
mount core.net.http_parser.{
    HttpParser, HeaderView, ParseProgress, ParseError,
    ChunkedDecoder, ChunkProgress,
};

let mut parser = HttpParser.request();        // or .response() for client
loop {
    let n = tcp.read_async(&mut buf).await?;
    if n == 0 { return Err(Unexpected.Eof); }
    match parser.feed(&buf[..n]) {
        ParseProgress.NeedMore               => continue,
        ParseProgress.Done { consumed, body_len, body_start } => {
            // consumed == header-region size; body_len is Some(n) for
            // Content-Length, None for Transfer-Encoding: chunked.
            break;
        }
        ParseProgress.Error(e) => return Err(e),
    }
}
```

### State machine

```mermaid
flowchart LR
    S[StartLine] -- CRLF --> H[Headers]
    H -- empty CRLF --> D[Done]
    H -- header line --> H
```

Once `Done` is signalled, the caller reads the body according to the
returned `body_len` — either a fixed Content-Length slice or a chunked
decode via `ChunkedDecoder`.

### Zero-copy header views

Parsed headers are exposed as `HeaderView { key_start, key_len,
value_start, value_len }`. Use the accessors to resolve slices against
the input buffer:

```verum
for hv in parser.headers().iter() {
    let key   = hv.key(buf);
    let value = hv.value(buf);
    // key / value are &[Byte] views — no copy.
}
```

The buffer must outlive the parsed Request; Weft uses a per-request
arena (allocated when the request line is first read, dropped at
response-write completion) to bound this lifetime structurally —
the parsed `Request<'arena>` cannot escape that scope, so use-after-
free of the byte view is impossible by construction.

### DoS guards

| Limit                  | Default  | Error variant                  |
|------------------------|----------|--------------------------------|
| `MAX_REQUEST_LINE`     | 8192 B   | `RequestLineTooLong { limit }` |
| `MAX_HEADER_LINE`      | 16384 B  | `HeaderTooLong { limit }`      |
| `MAX_HEADERS_TOTAL`    | 64 KiB   | `HeaderTooLong { limit }`      |
| `MAX_HEADER_COUNT`     | 128      | `TooManyHeaders { limit }`     |

### Body-framing resolution (RFC 7230 §3.3.3)

The parser extracts `Content-Length` and `Transfer-Encoding` during the
header pass and encodes precedence:

- `Transfer-Encoding: chunked` wins; `Content-Length` is cleared.
- Two conflicting `Content-Length` values raise `ConflictingContentLength`.
- A non-numeric `Content-Length` raises `InvalidContentLength(raw)`.

### SIMD acceleration

CRLF / colon scans call `core.simd.bytes.find_byte(b'\r')` which
@multiversion-dispatches to SSE2 / AVX2 / NEON per CPU. A scalar fallback
produces identical results at reduced throughput.

### Chunked decoder

`ChunkedDecoder` is independent from the header parser — feed body bytes
after detecting `Transfer-Encoding: chunked`:

```verum
let mut dec = ChunkedDecoder.new();
loop {
    match dec.feed(body_buf) {
        ChunkProgress.ChunkNeedMore => { read_more().await?; continue; }
        ChunkProgress.ChunkOutput { data_start, data_len, .. } => {
            sink.write(&body_buf[data_start..data_start + data_len]);
        }
        ChunkProgress.ChunkEnd { consumed } => break,
        ChunkProgress.ChunkErr(e) => return Err(e),
    }
}
```

Chunk sizes are hex-parsed with u32 overflow detection; trailer headers
are skipped (placeholder for a future typed-trailers API).

---

## WebSocket — `core.net.websocket`

RFC 6455 WebSocket protocol: opening-handshake helpers, frame codec
with masking, close codes, control frames (Ping / Pong / Close),
fragmentation support. Permessage-deflate (RFC 7692) tracked as
follow-up.

### API summary

| Type / fn | Purpose |
|-----------|---------|
| `Opcode` | Continuation / Textual / Binary / Close / Ping / Pong / Reserved |
| `CloseCode` | 1000 NORMAL / 1001 GOING_AWAY / 1002 PROTOCOL_ERROR / ... |
| `Frame` | `{ fin, rsv1/2/3, opcode, payload }` |
| `Frame.text/binary/ping/pong/close(...)` | Convenience builders |
| `encode(&frame, mask_key, &mut out)` | Encode to bytes — `Some(key)` on client side |
| `decode(buf, expect_masked, max_payload) -> DecodeResult` | Parse one frame; NeedMore / Decoded / Err |
| `accept_key(client_key)` | Derive `Sec-WebSocket-Accept` .2 |
| `validate_server_handshake(headers)` | Check Upgrade/Connection/Version/Key |

### Handshake

```verum
// Server side — after HTTP/1.1 request parsed:
match validate_server_handshake(&request.headers) {
    None => return Err("invalid upgrade"),
    Some(key) => {
        let accept = accept_key(&key);
        // Reply with 101 Switching Protocols + Sec-WebSocket-Accept: <accept>
    }
}
```

### Frame codec

```verum
// Server → client — unmasked
let mut out = List.new();
encode(&Frame.text("hello".into_bytes()), None, &mut out);
stream.write_all(&out).await?;

// Client → server — masked with random key
let mut out = List.new();
let key: [UInt8; 4] = random_mask_key();
encode(&Frame.text(b"hello"), Some(key), &mut out);

// Incoming — resumable decode
match decode(&buf, expect_masked: true, max_payload: 1 << 20) {
    DecodeResult.Decoded { frame, consumed } => dispatch(frame),
    DecodeResult.NeedMore => continue,
    DecodeResult.Err(e) => return close_with_protocol_error(e),
}
```

### DoS guards

- `max_payload` parameter enforces a hard cap on a single-frame payload
  (caller-specified; RFC does not mandate a value).
- Control frames (Close / Ping / Pong) are rejected if payload > 125 bytes
  or if fragmented (`!fin`).
- RSV bits are currently all reserved — any RSV=1 fails with
  `ReservedBitsSet`. Enabling permessage-deflate will consume RSV1.

---

## Graceful shutdown — `core.net.shutdown`

Graceful-shutdown primitives for any accept-loop based service.
Combines a cancellation token (for prompt accept-loop / available stop)
with an atomic available-request counter and a wait-for-zero drain
mechanism.

### API summary

| Type / fn | Purpose |
|-----------|---------|
| `GracefulShutdown.new()` | Controller — owns counter + token source |
| `shutdown.token()` | `CancellationToken` for accept loops / handlers |
| `shutdown.track()` | RAII `ConnectionGuard` — inc on acquire, dec on drop |
| `shutdown.initiate()` | Cancel the token (idempotent) |
| `shutdown.wait_drained(timeout)` | Poll-wait until counter == 0 or timeout |
| `shutdown.shutdown(timeout)` | `initiate` + `wait_drained` in one call |
| `tcp_listener_from_raw_fd(fd)` | Adopt a TCP listener fd (zero-downtime restart) |
| `unix_listener_from_raw_fd(fd)` | Adopt a Unix listener fd |
| `listen_fds()` / `listen_fd(i)` | systemd socket-activation protocol |

### Typical HTTP-server skeleton

```verum
let shutdown = GracefulShutdown.new();
let token = shutdown.token();

// Signal → shutdown
spawn_detached(async move {
    shutdown_signals().await.next().await;
    shutdown.initiate();
});

// Accept loop — each request holds a ConnectionGuard
loop {
    match listener.accept_cancellable(&token).await {
        Err(_) => break,
        Ok(Err(_)) => continue,
        Ok(Ok((stream, _))) => {
            let guard = shutdown.track();
            spawn_detached(async move {
                serve_one(stream, &token).await;
                drop(guard);
            });
        }
    }
}

// Drain — 30s hard limit
let _ = shutdown.wait_drained(Duration.from_secs(30)).await;
```

### FD handoff for zero-downtime restart

```verum
// On startup, prefer the systemd-activated fd if present
let listener = match listen_fd(0) {
    Ok(fd) => tcp_listener_from_raw_fd(fd),
    Err(_) => TcpListener.bind(&addr)?,
};
```

During a live upgrade the old process can SCM_RIGHTS-pass its listener
fd to the new process over an AF_UNIX control socket; see
`core.net.unix.UnixStream.send_fds` (follow-up).

---

## Unix-domain sockets — `core.net.unix`

AF_UNIX stream sockets for local IPC. Per-process-credentials, zero
network overhead, fd-passing via SCM_RIGHTS (pending implementation).

```verum
// Server
let listener = UnixListener.bind(&"/tmp/app.sock")?;
let (stream, peer_path) = listener.accept_async().await?;

// Client
let stream = UnixStream.connect_async(&"/tmp/app.sock").await?;

// Shutdown
stream.shutdown(ShutdownKind.Write)?;
```

### API summary

```verum
// UnixStream
UnixStream.connect(&path) -> Result<UnixStream, UnixError>
UnixStream.connect_async(&path).await -> Result<UnixStream, UnixError>
s.peer_addr() -> Maybe<&Text>
s.as_raw_fd() -> FileDesc
s.shutdown(ShutdownKind.Read|Write|Both) -> Result<(), UnixError>

// Implements: Read, Write, AsyncRead, AsyncWrite, Drop
s.read_async(&mut buf).await -> Result<Int, IoError>
s.write_async(&buf).await -> Result<Int, IoError>
s.read_cancellable(&mut buf, &token).await
s.write_cancellable(&buf, &token).await

// UnixListener
UnixListener.bind(&path) -> Result<UnixListener, UnixError>
UnixListener.bind_with_backlog(&path, backlog) -> Result<UnixListener, UnixError>
l.accept() -> Result<(UnixStream, Maybe<Text>), UnixError>
l.accept_async().await
l.accept_cancellable(&token).await
l.incoming_async() -> UnixIncoming  // Stream + AsyncIterator

// Peer credentials (Linux: SO_PEERCRED)
s.peer_cred() -> Result<PeerCred, UnixError>
type PeerCred is { pid: Int32, uid: UInt32, gid: UInt32 }
```

### Platform notes

- **Linux**: Full support. Abstract namespace (`"\0my-service"`) — path
  in kernel, no filesystem inode; auto-cleaned on socket close.
- **macOS**: Filesystem paths only (no abstract namespace).
  LOCAL_PEERCRED variant of peer_cred pending.
- **Windows**: AF_UNIX since Windows 10 1803; implementation gated
  behind `@cfg(feature = "windows_unix_sockets")`.

### FD-passing status

`send_fds` / `recv_fds` are declared and return
`FdPassingError.NotImplemented` until sendmsg/recvmsg + cmsghdr
bindings land. The graceful-shutdown FD-handoff pattern referenced by
`net-framework.md §7.8` depends on this; tracked as a follow-up task.

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
Certificate.from_der(bytes)
Certificate.from_pem(&pem) -> Result<Certificate, TlsError>
Certificate.from_pem_chain(&pem) -> Result<List<Certificate>, TlsError>
cert.der_bytes() -> &[Byte]     cert.size() -> Int

type PrivateKey is { der_data: List<Byte>, key_type: KeyType };
PrivateKey.from_der(bytes, key_type)
PrivateKey.from_pem(&pem) -> Result<PrivateKey, TlsError>
key.key_type() -> KeyType

type SystemCerts;
SystemCerts.load() -> List<Certificate>    // platform-native store
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

TlsConfig.client()
    .with_root_certs(SystemCerts.load())
    .with_min_version(TlsVersion.Tls12)
    .with_alpn(&[&"h2", &"http/1.1"])

TlsConfig.server()
    .with_identity(cert, key)
    .with_alpn(&[&"h2"])
```

### Streams

```verum
type TlsStream is { inner: TcpStream, session: TlsSession, ... };

// Client
TlsStream.connect(tcp, &server_name, &config).await -> Result<TlsStream, TlsError>
// Server
TlsStream.accept(tcp, &config).await -> Result<TlsStream, TlsError>

// AsyncRead/AsyncWrite protocol methods
s.poll_read(cx, &mut buf) -> Poll<Result<Int, IoError>>
s.poll_write(cx, &buf) -> Poll<Result<Int, IoError>>
s.poll_flush(cx) -> Poll<Result<(), IoError>>
s.poll_shutdown(cx) -> Poll<Result<(), IoError>>

// Ergonomic wrappers
s.read_async(&mut buf).await -> Result<Int, IoError>
s.write_async(&buf).await -> Result<Int, IoError>
s.write_all(&buf).await -> Result<(), TlsError>
s.shutdown().await -> Result<(), TlsError>

// Cancellation-aware variants
s.read_cancellable(&mut buf, &token).await
    -> Result<Result<Int, IoError>, CancellationError>
s.write_cancellable(&buf, &token).await
    -> Result<Result<Int, IoError>, CancellationError>

// Getters
s.alpn_protocol() -> Maybe<&Text>      // full name
s.alpn() -> Maybe<&Text>                // short alias
s.negotiated_version() -> Maybe<TlsVersion>
s.peer_certificate() -> Maybe<Certificate>
s.get_ref() -> &TcpStream

// Channel binding for SCRAM-SHA-256-PLUS (RFC 5929 tls-server-end-point)
s.peer_cert_hash_sha256() -> Maybe<[Byte; 32]>

// RFC 5705 exporter — derive application-level keys
s.export_keying_material(label, context, length) -> Result<List<Byte>, TlsError>

// Kernel TLS offload (Linux ≥6.0 + KTLS-enabled backend)
s.enable_ktls() -> Result<(), TlsError>
```

### Backend plugin model

`TlsStream` operations currently dispatch through `@intrinsic("verum.tls.*")`
symbols that are resolved at link-time to a pluggable backend:

| Backend | When to use | Status |
|---|---|---|
| `rustls-ktls` (default target) | Pure Rust TLS 1.3, memory-safe, KTLS-capable | planned |
| `openssl-fips` | FIPS 140-3 compliance requirement | planned |
| `hacl-star` | Formally verified primitives (Project Everest) | planned |
| `schannel` / `securetransport` | Platform-native on Windows / macOS | planned |

Switch via `@cfg(feature = "tls-backend-X")` at cog-level.

### Features on the roadmap (not yet implemented)

- Post-quantum hybrid key exchange: `X25519MLKEM768` default (table stakes by 2026).
- Encrypted ClientHello (ECH) — HPKE over HTTPS DNS records.
- TLS 1.3 0-RTT server-side with anti-replay cache.
- Certificate compression (RFC 8879, brotli/zstd).
- Session resumption via session tickets (RFC 8446 §4.6.1).
- SNI-based certificate resolver callback (multi-tenant edge).

### High-level builders

```verum
let connector = TlsConnector.new().with_alpn(&[&"h2", &"http/1.1"]);
let tls = connector.connect(&"example.com", 443).await?;

let acceptor = TlsAcceptor.new(cert, key);
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
async fn fetch_json(url: &Text) -> Result<JsonValue, Error> {
    let parsed = Url.parse(url)?;
    let host = parsed.host().ok_or(Error.new("no host"))?;
    let port = parsed.port().unwrap_or(443);

    let tcp = TcpStream.connect_async((host, port)).await?;
    let cfg = TlsConfig.client().with_root_certs(SystemCerts.load());
    let mut tls = TlsStream.connect(tcp, host, &cfg).await?;

    let req = f"GET {parsed.path()} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n";
    tls.write_all_async(req.as_bytes()).await?;

    let mut buf = List<Byte>.new();
    let mut tmp = [0u8; 4096];
    loop {
        let n = tls.read_async(&mut tmp).await?;
        if n == 0 { break; }
        buf.extend_from_slice(&tmp[..n]);
    }
    let text = Text.from_utf8_lossy(&buf);
    let (_, body) = text.split_once(&"\r\n\r\n")
        .ok_or(Error.new("malformed response"))?;
    Result.Ok(parse_json(&body.to_string())?)
}
```

---

## HTTP helper modules

### `content_negotiation` — Accept / Accept-Encoding / Accept-Language (RFC 9110 §12)

```verum
mount core.net.content_negotiation.{
    parse_accept, parse_accept_encoding, parse_accept_language,
    select_best_media, select_best_coding,
};

let prefs = parse_accept(&header);    // "text/html;q=0.9, application/json"
let offers: List<Text> = [
    Text.from("application/json"),
    Text.from("text/html"),
];
match select_best_media(&prefs, &offers) {
    Some(pick) => respond_with(&pick),
    None       => respond_406_not_acceptable(),
}
```

Selection ranks first by q-factor (desc), then by specificity
(exact > `type/*` > `*/*`), then by caller's offer order.
`q=0` means explicitly rejected; `"identity"` is implicitly
acceptable for Accept-Encoding unless rejected (RFC 9110
§12.5.3).

### `http_range` — Range / Content-Range (RFC 9110 §14)

```verum
mount core.net.http_range.{
    RangeSet, ResolvedRange,
    parse_range_header, resolve_and_merge,
    encode_content_range, encode_unsatisfiable,
};

// "Range: bytes=0-499, 600-899, 1000-"
let rs = parse_range_header(&header)?;
let merged: List<ResolvedRange> = resolve_and_merge(&rs, total_length)?;

// Response header for one sub-range.
let hdr = encode_content_range(&merged[0], total_length);

// 416 Range Not Satisfiable body.
let body_hdr = encode_unsatisfiable(total_length);
```

Three spec forms: `a-b` closed, `a-` prefix, `-N` suffix.
Invalid-start sub-ranges drop; if every sub-range drops,
`UnsatisfiableRange` tells the caller to respond 416. Overlapping
sub-ranges merge .4. Whitespace + case-insensitive
`bytes=` unit per the ABNF.

### `link_header` — RFC 8288

```verum
mount core.net.link_header.{parse, format, find_rel, LinkEntry};

let entries = parse(&header)?;
match find_rel(&entries, "next") {
    Some(entry) => crawl(&entry.uri),
    None        => done,
}
```

The hypermedia-relation / pagination / preload-hint header used
by GitHub API pagination, ActivityPub, W3C Annotations, HAL,
AS2. Quoted-string escapes, space-separated multi-rel matching,
case-insensitive `find_rel`. Round-trip builder picks the
minimal valid wire form (bare token vs quoted-string wrapping).

---

## See also

- **[io](/docs/stdlib/io)** — `Read`/`Write`/`AsyncRead`/`AsyncWrite` protocols.
- **[async](/docs/stdlib/async)** — the executor driving network I/O.
- **[sys](/docs/stdlib/sys)** — V-LLSI syscalls beneath the network stack.
- **[encoding](/docs/stdlib/encoding)** — JSON / CBOR / MessagePack /
  Base64 / Base32 / Base58 / hex / PEM / JCS / JSON Pointer /
  varint / DER.
- **[security/auth-primitives](/docs/stdlib/security/auth-primitives)**
  — JWT / COSE / TOTP / password hashing / CSPRNG tokens /
  HPKE / Merkle.
- **[Weft reverse proxy](/docs/stdlib/net/weft/overview)** —
  connection-pool, health-check, load-balancer, circuit-breaker,
  retry, and rate-limiter middleware.
