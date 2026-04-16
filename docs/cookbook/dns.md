---
title: DNS lookup
description: Resolve hostnames to IPs; reverse-resolve; MX / TXT / SRV records.
---

# DNS lookup

Verum has a pure-Verum DNS client (RFC 1035 over UDP + TCP fallback)
— no libc `getaddrinfo` dependency.

### Forward resolution

```verum
use core.net::*;

async fn print_ips(host: &Text) using [IO] {
    match lookup_host_async(host).await {
        Result.Ok(addrs) => {
            for a in &addrs { println(&f"{host} -> {a}"); }
        }
        Result.Err(e) => eprintln(&f"dns: {e:?}"),
    }
}
```

Output:

```
example.com -> 93.184.216.34
example.com -> 2606:2800:220:1:248:1893:25c8:1946
```

`lookup_host_async(&h)` returns all A + AAAA records. For a specific
family: `lookup_host_v4_async` / `lookup_host_v6_async`.

### Reverse resolution (PTR)

```verum
let addr = IpAddr.V4(Ipv4Addr.new(1, 1, 1, 1));
match lookup_addr_async(&addr).await {
    Result.Ok(name) => println(&f"{addr} -> {name}"),
    Result.Err(e)   => eprintln(&f"dns: {e:?}"),
}
// Output: 1.1.1.1 -> one.one.one.one
```

### Resolve for `connect()`

```verum
let addrs = resolve_async(&"example.com", 443).await?;
// addrs: List<SocketAddr> — ready to pass to TcpStream::connect_addr
let stream = TcpStream::connect_addr_async(&addrs[0]).await?;
```

`TcpStream::connect` accepts `impl ToSocketAddrs`, so in most code
you never call `resolve` directly:

```verum
TcpStream::connect_async("example.com:443").await?;    // implicit DNS
```

### Custom resolver (specific nameservers, timeout, retries)

```verum
let resolver = Resolver.new()
    .nameserver_ip(Ipv4Addr.new(1, 1, 1, 1))         // Cloudflare
    .nameserver_ip(Ipv4Addr.new(8, 8, 8, 8))         // Google
    .timeout_ms(3000)
    .max_retries(2);

// A records
let ips = resolver.lookup_a_async(&"example.com").await?;

// MX records — returns List<(priority, exchange)>
let mxs = resolver.lookup_mx_async(&"example.com").await?;
for (prio, host) in &mxs { println(&f"{prio} {host}"); }

// TXT records
let txts = resolver.lookup_txt_async(&"_dmarc.example.com").await?;

// SRV records
let srv = resolver.lookup_srv_async(&"_imap", &"_tcp", &"example.com").await?;

// Arbitrary type
let records = resolver.query_async(&"example.com", DnsRecordType.A).await?;
```

### Caching

The default resolver caches results according to record TTLs:

```verum
resolver.cache_clear();        // invalidate all cached results
```

### Validation helpers

```verum
if is_valid_domain(&input) && !is_ip_address(&input) {
    lookup_host_async(&input).await
} else {
    Result.Err(DnsError.InvalidName)
}
```

### See also

- **[net → DNS](/docs/stdlib/net#dns)** — full resolver API + record types.
- **[TCP echo server](/docs/cookbook/tcp)** — uses `ToSocketAddrs` resolution.
