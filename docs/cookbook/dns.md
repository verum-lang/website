---
title: DNS lookup
description: Resolve hostnames — A, AAAA, MX, TXT, SRV, CNAME, PTR — with caching and custom resolvers.
---

# DNS lookup

Verum ships a pure-Verum DNS client (RFC 1035 over UDP + TCP fallback)
— no libc `getaddrinfo` dependency. It participates in the async
runtime and respects cancellation, timeouts, and structured
concurrency.

## Forward resolution

```verum
mount core.net.*;

async fn print_ips(host: &Text) using [Network] {
    match lookup_host_async(host).await {
        Result.Ok(addrs) => {
            for a in &addrs { print(f"{host} -> {a}"); }
        }
        Result.Err(e) => eprint(f"dns: {e:?}"),
    }
}
```

Output:

```
example.com -> 93.184.216.34
example.com -> 2606:2800:220:1:248:1893:25c8:1946
```

`lookup_host_async(host)` returns **all** A + AAAA records as a
`List<IpAddr>`. The family-specific forms are SYNCHRONOUS — there is no
`lookup_host_v4_async` / `lookup_host_v6_async`:

```verum
lookup_host_v4(host)      // Result<List<Ipv4Addr>, DnsError>
lookup_host_v6(host)      // Result<List<Ipv6Addr>, DnsError>
```

The whole async surface of `core.net.dns` is three free functions —
`lookup_host_async`, `lookup_addr_async`, `resolve_async`. Everything
else, including every `Resolver` method, is synchronous.

## Reverse resolution (PTR)

```verum
let addr = IpAddress.V4(Ipv4Addr.new(1, 1, 1, 1));
match lookup_addr_async(&addr).await {
    Result.Ok(name) => print(f"{addr} -> {name}"),
    Result.Err(e)   => eprint(f"dns: {e:?}"),
}
// Output: 1.1.1.1 -> one.one.one.one
```

PTR lookups are rate-limited by most public resolvers. Retry with
backoff if you need bulk reverse resolution — see
[Resilience](/docs/cookbook/resilience).

## Resolve for `connect()`

```verum
let addrs: List<SocketAddr> =
    resolve_async("example.com", 443).await?;

let stream = TcpStream.connect_addr_async(&addrs[0]).await?;
```

`TcpStream.connect_async` is already generic over anything
implementing `ToSocketAddrs`, so in most code you never call
`resolve_async` directly:

```verum
// Implicit DNS + connect:
let stream = TcpStream.connect_async("example.com:443").await?;
```

Behind the scenes, `ToSocketAddrs` resolves the name, tries each
resulting address in order (IPv6 first by default), and returns the
first successful socket.

### Happy-eyeballs connect

:::caution Not shipped
Happy-eyeballs (RFC 8305 — racing IPv4 and IPv6 with a head start for
v6) is **not implemented**. Neither
`TcpStream.connect_happy_eyeballs_async` nor `HappyEyeballsOptions`
exists anywhere in `core/`, and this section described both as if they
did until 2026-09-06.

What ships today tries the resolved addresses **in order**, IPv6 first,
and returns the first socket that connects:

```verum
// Synchronous, and async; both resolve through `ToSocketAddrs`
// and walk the address list sequentially.
let stream = TcpStream.connect(("example.com", 443))?;
let stream = TcpStream.connect_async(("example.com", 443)).await?;
```

The practical difference is the failure case: a sequential walk pays the
full connect timeout on an unreachable IPv6 address before it tries
IPv4, which is the latency happy-eyeballs exists to remove. If you need
the racing behaviour now, run the two connects under `select` yourself.
:::

## Custom resolver

Use a `Resolver` when you need:

- A specific set of nameservers.
- A non-default timeout or retry budget.
- A separate cache from the rest of your process.
- Record types beyond A/AAAA.

```verum
let resolver = Resolver.new()
    .nameserver_ip(Ipv4Addr.new(1, 1, 1, 1))   // Cloudflare
    .nameserver_ip(Ipv4Addr.new(8, 8, 8, 8))   // Google
    .timeout_ms(3_000)
    .retries(2)
    .use_tcp(false)          // UDP first, TCP fallback on truncation
    .search_domain("corp.internal")
    .ndots(1);
```

The full builder is `new`, `system`, `nameserver`, `nameserver_ip`,
`timeout_ms`, `retries`, `search_domain`, `ndots`, `use_tcp` — that is
all of it. There is no DNSSEC validation and no per-resolver cache.

### Record types

**`Resolver`'s query methods are SYNCHRONOUS.** The module's entire
async surface is three free functions — `lookup_host_async`,
`lookup_addr_async`, `resolve_async` — and none of them takes a
`Resolver`. Call the methods below directly, or move the call off the
executor yourself.

```verum
// A + AAAA together — there is no separate lookup_a / lookup_aaaa
let ips = resolver.lookup("example.com")?;              // List<IpAddr>

// MX — priority paired with the exchange host
let mxs = resolver.lookup_mx("example.com")?;           // List<(Int, Text)>
for (priority, exchange) in &mxs { print(f"{priority} {exchange}"); }

// TXT
let txts = resolver.lookup_txt("_dmarc.example.com")?;  // List<Text>

// SRV — ONE name, already assembled; not (service, proto, domain)
let srv = resolver.lookup_srv("_imap._tcp.example.com")?;
// List<(Int, Int, Int, Text)> — priority, weight, port, target

// NS
let ns = resolver.lookup_ns("example.com")?;            // List<Text>

// PTR — reverse
let name = resolver.lookup_ptr(&addr)?;                 // Text
```

CNAME and SOA have no dedicated method. Reach them through `query`,
which is the general form:

### Arbitrary query type

```verum
let entries = resolver.query("example.com", DnsRecordType.A)?;
// List<DnsRecordEntry> — each is { record: DnsRecord, ttl: Int }

for entry in &entries {
    print(f"ttl={entry.ttl}");
    match entry.record {
        DnsRecord.A(addr)                    => print(f"A {addr}"),
        DnsRecord.AAAA(addr)                 => print(f"AAAA {addr}"),
        DnsRecord.CNAME(name)                => print(f"CNAME {name}"),
        DnsRecord.MX { priority, exchange }  => print(f"MX {priority} {exchange}"),
        DnsRecord.TXT(text)                  => print(f"TXT {text}"),
        DnsRecord.NS(host)                   => print(f"NS {host}"),
        DnsRecord.PTR(name)                  => print(f"PTR {name}"),
        DnsRecord.SRV { priority, weight, port, target }
                                             => print(f"SRV {target}:{port}"),
        DnsRecord.SOA { mname, serial, .. }  => print(f"SOA {mname} {serial}"),
    }
}
```

`DnsRecordType` is `A | AAAA | CNAME | MX | TXT | NS | PTR | SRV | SOA |
ANY`. Note the record carries a TTL beside it — the entry is the pair,
not the record alone.

## Caching

:::danger There is no cache

`grep -ci cache core/net/dns.vr` → **0**, re-measured 2026-09-10. Every
query goes to a nameserver.

This section previously documented `cache_clear()`,
`cache_invalidate(host)`, `cache_stats()` with a `hit_rate`, a
`Resolver.new().cache_capacity(0)` builder for deterministic tests, and
a "~50 ns (a hash-map lookup)" figure for a cache hit. None of those
names exists, so none of that was measured — a performance number
attached to an absent mechanism is the clearest possible sign a page has
drifted from its library.

If you need caching, hold the results yourself: `lookup` returns a
`List<IpAddr>` and `query` returns `List<DnsRecordEntry>` whose `ttl`
field is the value a cache would key its expiry on.

:::

## DNS-over-HTTPS (DoH)

:::caution Not shipped
`DnsTransport` and `with_transport` do not exist, and the file has no
HTTPS side at all — measured 2026-09-10:

```
grep -rlE 'DnsTransport|with_transport' core/ --include='*.vr' | wc -l  # 0
grep -cEi 'doh|dns-query|https' core/net/dns.vr                         # 0
```

`Resolver` is real (`grep -n 'type Resolver' core/net/dns.vr`); its
builder is `nameserver`, `nameserver_ip`,
`timeout_ms`, `retries`, `search_domain`, `ndots` and `use_tcp` — plain
UDP with a TCP fallback.  The shape below is what a DoH transport would
look like.
:::

A DoH transport would look like the shape below. It is not callable:
neither `DnsTransport` nor `with_transport` exists, and the sentence
that used to stand under it — that DoH reuses the process's HTTPS pool
for connection-level authentication — was a claim about a mechanism
with no code behind it.

```verum
// SHAPE ONLY — does not compile. Nothing here is declared.
let resolver = Resolver.new()
    .with_transport(DnsTransport.Https {
        endpoint: url#"https://cloudflare-dns.com/dns-query",
        ech: true,                       // Encrypted Client Hello
    });
```

What `Resolver` does offer is plain UDP with a TCP fallback:
`.nameserver(&addr)`, `.nameserver_ip(ip)`, `.timeout_ms(ms)`,
`.retries(n)`, `.search_domain(d)`, `.ndots(n)`, `.use_tcp(bool)`.

## Validation helpers

Avoid firing a DNS query for something that is already an IP literal
or an obviously invalid name:

```verum
fn should_resolve(input: &Text) -> Bool {
    !is_ip_address(input) &&
    is_valid_domain(input) &&
    input.len() <= 253                     // max FQDN length
}

if should_resolve(host) {
    lookup_host_async(host).await
} else if is_ip_address(host) {
    Result.Ok([parse_ip(host)?])    // already an IP
} else {
    Result.Err(DnsError.InvalidName)
}
```

## Bulk resolution with backpressure

Resolving thousands of hostnames? Bound concurrency with a
`Semaphore` and a `nursery`:

```verum
async fn resolve_many(hosts: &List<Text>, concurrency: Int)
    -> Map<Text, List<IpAddress>>
    using [Network, IO]
{
    let sem = Semaphore.new(concurrency);
    let mut out = Map.new();

    nursery(on_error: wait_all) {
        for host in hosts {
            let sem2 = sem.clone();
            let host2 = host.clone();
            spawn async move {
                let _permit = sem2.acquire().await;
                let ips = lookup_host_async(&host2).await
                    .unwrap_or_else(|_| List.new());
                out.insert(host2, ips);
            };
        }
    }
    out
}
```

## DNS errors

| `DnsError` variant      | Meaning                                       |
|-------------------------|-----------------------------------------------|
| `NoRecords`             | The query succeeded but returned no records. |
| `NxDomain`              | The nameserver says the domain does not exist. |
| `ServFail`              | Nameserver transient failure. Retry.          |
| `Refused`               | Nameserver refused to answer (policy).        |
| `Timeout`               | No answer within the configured timeout.      |
| `InvalidName`           | Syntactically invalid hostname.               |
| `InvalidResponse`       | Malformed response from the server.           |
| `DnssecValidationFailed`| DNSSEC enabled and validation failed.         |
| `Transport(e)`          | Underlying I/O error.                         |

## Testing

:::caution Not shipped
`MockResolver` does not exist — zero declarations in `core/` — and
`Resolver` is not a context, so the `provide Resolver = mock in { … }`
this section used to show could not have been written either. Both
halves of the example named machinery with no code behind it.
:::

`Resolver` is a value, so a test points one at a nameserver it
controls rather than substituting the type:

```verum
// A resolver aimed at a fixture nameserver on the loopback. `retries`
// and `timeout_ms` keep a test from hanging when the fixture is down.
let resolver = Resolver.new()
    .nameserver_ip(Ipv4Addr.new(127, 0, 0, 1))
    .timeout_ms(200)
    .retries(0)
    .use_tcp(false);

match resolver.lookup(&"example.com") {
    Result.Ok(ips)  => assert(ips.len() > 0),
    // Run against a loopback with nothing listening and the error is
    // NOT `Timeout` — measured. Match the variant you actually expect
    // rather than assuming the timeout is what a dead port produces.
    Result.Err(err) => print(f"lookup failed: {err}"),
}
```

The free functions (`lookup_host`, `lookup_addr`, `resolve`) read the
system configuration and cannot be pointed anywhere, so a test that
must not touch the network uses a `Resolver` and its methods.

## See also

- **[`stdlib/net`](/docs/stdlib/net)** — full resolver API and record
  types.
- **[TCP echo server](/docs/cookbook/tcp)** — uses `ToSocketAddrs`
  resolution.
- **[HTTP client](/docs/cookbook/http-client)** — which uses DNS
  under the hood.
- **[Resilience](/docs/cookbook/resilience)** — retry / circuit
  breaker around DNS calls.
