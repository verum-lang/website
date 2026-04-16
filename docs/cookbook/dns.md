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

async fn print_ips(host: &Text) using [IO, Network] {
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
`List<IpAddress>`. For a specific family:

```verum
lookup_host_v4_async(host)      // IPv4 only
lookup_host_v6_async(host)      // IPv6 only
```

The three functions differ only in which `DnsRecordType` they query —
`A`, `AAAA`, or both — and which they expose.

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

`TcpStream.connect_async` already accepts `impl ToSocketAddrs`, so in
most code you never call `resolve_async` directly:

```verum
// Implicit DNS + connect:
let stream = TcpStream.connect_async("example.com:443").await?;
```

Behind the scenes, `ToSocketAddrs` resolves the name, tries each
resulting address in order (IPv6 first by default), and returns the
first successful socket.

### Happy-eyeballs connect

For latency-sensitive clients, **happy-eyeballs** connects to IPv4 and
IPv6 in parallel and keeps the first success:

```verum
let stream = TcpStream.connect_happy_eyeballs_async(
    "example.com", 443,
    HappyEyeballsOptions {
        ipv6_head_start_ms: 300,
        retry_ipv4_after_ms: 2000,
    },
).await?;
```

## Custom resolver

Use a `Resolver` when you need:

- A specific set of nameservers.
- A non-default timeout or retry budget.
- A separate cache from the rest of your process.
- Record types beyond A/AAAA.

```verum
let resolver = Resolver.new()
    .nameserver_ip(Ipv4Addr.new(1, 1, 1, 1))         // Cloudflare
    .nameserver_ip(Ipv4Addr.new(8, 8, 8, 8))         // Google
    .timeout_ms(3_000)
    .max_retries(2)
    .prefer_tcp(false)                                // use UDP first
    .validate_dnssec(true);                           // DNSSEC if available
```

### Common record types

```verum
// A — IPv4 addresses
let ips_v4 = resolver.lookup_a_async("example.com").await?;
// List<Ipv4Addr>

// AAAA — IPv6 addresses
let ips_v6 = resolver.lookup_aaaa_async("example.com").await?;
// List<Ipv6Addr>

// CNAME — canonical name
let cn = resolver.lookup_cname_async("www.example.com").await?;
// Maybe<Text>

// MX — mail exchangers, with priority
let mxs = resolver.lookup_mx_async("example.com").await?;
// List<MxRecord { preference: Int, exchange: Text }>
for mx in &mxs { print(f"{mx.preference} {mx.exchange}"); }

// TXT — text records
let txts = resolver.lookup_txt_async("_dmarc.example.com").await?;
// List<Text>

// SRV — service discovery
let srv = resolver.lookup_srv_async("_imap", "_tcp", "example.com").await?;
// List<SrvRecord { priority, weight, port, target }>

// NS — authoritative name servers
let ns = resolver.lookup_ns_async("example.com").await?;
// List<Text>

// SOA — start of authority
let soa = resolver.lookup_soa_async("example.com").await?;
// SoaRecord
```

### Arbitrary query type

```verum
let records = resolver.query_async(
    "example.com",
    DnsRecordType.A,
).await?;
// List<DnsRecord>

for record in &records {
    match record {
        DnsRecord.A(addr)              => print(f"A {addr}"),
        DnsRecord.AAAA(addr)           => print(f"AAAA {addr}"),
        DnsRecord.CNAME(name)          => print(f"CNAME {name}"),
        DnsRecord.MX(pref, host)       => print(f"MX {pref} {host}"),
        DnsRecord.TXT(text)            => print(f"TXT {text}"),
        _                              => print(f"unknown: {record:?}"),
    }
}
```

## Caching

The default resolver caches results according to record TTLs. Cache
hits are ~50 ns (a hash-map lookup). Cache misses incur the
round-trip to the nameserver.

```verum
resolver.cache_clear();                  // invalidate all cached results
resolver.cache_invalidate("example.com"); // specific hostname only

let stats = resolver.cache_stats();
print(f"hit rate: {stats.hit_rate}");
print(f"entries: {stats.entries}");
```

For deterministic testing, disable caching entirely:

```verum
let resolver = Resolver.new().cache_capacity(0);
```

## DNS-over-HTTPS (DoH)

For privacy-sensitive deployments, use a DoH transport:

```verum
let resolver = Resolver.new()
    .with_transport(DnsTransport.Https {
        endpoint: url#"https://cloudflare-dns.com/dns-query",
        ech: true,                       // Encrypted Client Hello
    });
```

DoH reuses the process's HTTPS pool (see
[`stdlib/net`](/docs/stdlib/net)) for connection-level authentication.

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
    Result.Ok(List.of(parse_ip(host)?))    // already an IP
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

## Testing with a mock resolver

`core.net` exposes a `MockResolver` for tests — no network I/O:

```verum
let mock = MockResolver.new()
    .with_a("example.com",      [Ipv4Addr.new(127, 0, 0, 1)])
    .with_aaaa("example.com",   [Ipv6Addr.LOCAL_HOST])
    .with_txt("_dmarc.example.com", ["v=DMARC1; p=reject"]);

provide Resolver = mock in {
    let ips = lookup_host_async("example.com").await?;
    // ...
}
```

## See also

- **[`stdlib/net`](/docs/stdlib/net)** — full resolver API and record
  types.
- **[TCP echo server](/docs/cookbook/tcp)** — uses `ToSocketAddrs`
  resolution.
- **[HTTP client](/docs/cookbook/http-client)** — which uses DNS
  under the hood.
- **[Resilience](/docs/cookbook/resilience)** — retry / circuit
  breaker around DNS calls.
