---
title: QUIC server
description: Bind a QUIC listener with `core.net.quic.api.QuicServer`, accept connections, and handle streams.
---

# QUIC server

Warp's high-level QUIC server lives at `core.net.quic.api.QuicServer`.
It wraps the TLS 1.3 server-side handshake, per-connection state
machine, and UDP packet dispatch behind an async `accept` loop.

## Minimum viable server

```verum
using [Nursery]

mount core.*;
mount core.net.quic.api.{QuicServer, QuicServerOptions, QuicAccepted};

pub async fn main() -> Result<(), core.net.quic.api.QuicServerError> {
    let cert_chain: List<List<Byte>> = load_cert_chain_der();
    let signer = load_private_key_signer();

    let opts = QuicServerOptions.from_cert(cert_chain, signer)
        .with_alpn([b"h3".to_list(), b"echo-v1".to_list()]);

    let server = QuicServer.bind(&f"0.0.0.0:443", opts).await?;
    print(f"listening on {server.local_addr()}");

    // accept_loop spawns one task per peer into the caller's nursery.
    server.accept_loop(|accepted: QuicAccepted| async move {
        handle_peer(accepted).await;
    }).await?;
    Ok(())
}

async fn handle_peer(mut conn: QuicAccepted) {
    match conn.next_bidi_stream().await {
        Ok(mut stream) => {
            let mut buf: List<Byte> = [];
            let _ = stream.recv.read_to_end(&mut buf).await;
            let _ = stream.send.write_all(&buf).await;   // echo
            let _ = stream.send.close().await;
        },
        Err(_) => {},
    }
}
```

`accept_loop` is the structured-concurrency variant. Each connection
runs inside its own nursery; when the outer `main` is cancelled the
whole tree tears down deterministically.

## Server options

```verum
let opts = QuicServerOptions.from_cert(cert_chain, signer)
    .with_alpn([b"h3".to_list()]);

// Tune per-connection flow control.
opts.params.initial_max_data          = 64_u64 * 1024_u64 * 1024_u64;   // 64 MiB
opts.params.initial_max_streams_bidi  = 1_024_u64;

// Cap server-wide concurrent connections.
opts.max_connections = 10_000_u64;

// Extend idle timeout for long-lived services.
opts.idle_timeout = Duration.from_secs(120);
opts.params.max_idle_timeout_ms = 120_000_u64;
```

Defaults per `QuicServerOptions.from_cert`:

| Field | Default |
|-------|---------|
| `params.initial_max_data` | 10 MiB |
| `params.initial_max_streams_bidi` | 128 |
| `params.initial_max_streams_uni` | 128 |
| `params.max_idle_timeout_ms` | 30 000 ms |
| `suites` | AES_128_GCM_SHA256, CHACHA20_POLY1305_SHA256, AES_256_GCM_SHA384 |
| `accepted_groups` | X25519, Secp256r1 |
| `dhe_pool` | `LocalDhePool.new()` (in-process, 128-entry LRU) |

## Certificate + signer

`cert_chain` is the server's DER-encoded certificate chain (leaf first,
root last). `signer` is any implementation of the `CertSigner`
protocol — for most production setups this is
`core.security.x509.sign.FileSigner` or an HSM-backed variant.

```verum
use core.security.x509.parse.{parse_cert_chain_pem};
use core.security.x509.sign.{FileSigner};

let chain = parse_cert_chain_pem(&fs.read_text("/etc/letsencrypt/live/example.com/fullchain.pem").await?)?;
let signer = FileSigner.from_pem_path("/etc/letsencrypt/live/example.com/privkey.pem").await?;
let opts = QuicServerOptions.from_cert(chain, Heap(signer));
```

## Handling individual streams

`QuicAccepted` exposes four async operations:

- `next_bidi_stream()` — wait for the peer to open a bidi stream.
- `next_uni_stream()` — wait for a peer-initiated uni stream.
- `next_datagram()` — pop the next inbound RFC 9221 datagram.
- `send_datagram(data)` — emit a datagram; best-effort.

Peer-initiated stream IDs arrive in allocation order from the peer;
the server doesn't choose them.

## Graceful shutdown

```verum
// Send CONNECTION_CLOSE with application error 0x0100 (H3_NO_ERROR).
accepted.close(0x0100_u64, &f"going away").await?;
```

Connection-level close triggers the RFC 9000 §10.2 three-PTO draining
window; subsequent datagrams on the same peer IP are ignored.

## Stateless reset

The server holds a long-lived `StatelessResetKey` and issues reset
tokens per-CID via `StatelessResetKey.token_for_cid(cid)`. A datagram
with no matching connection ends with a trailing 16-byte token
that the client recognises — see
[`stateless_reset_surface`](/docs/stdlib/net/quic/) discussion.

## Address validation

First-flight Initial packets from a new peer IP are anti-amplification
limited to 3× received bytes (§8.1). For high-traffic deployments,
use Retry to cheaply bounce through an address-validation round-trip:

```verum
opts.require_retry = true;       // every new 4-tuple gets a Retry first
```

The server keeps a symmetric-key sealed `Retry` token so follow-up
Initials carry the proof of liveness.

## Observability

Per-connection stats expose pacing rate, loss counters, cwnd, and
key-phase generation:

```verum
accepted.stats().snapshot().pretty();
```

Prometheus exporter at `/metrics` via
`core.net.quic.stats_prometheus.listener_exporter(&server)`.

## See also

- [`core.net.quic`](/docs/stdlib/net/quic/) — module reference.
- [Transport parameters](/docs/stdlib/net/quic/transport-params) —
  what gets advertised in the server's EncryptedExtensions.
- [TLS 1.3 handshake](/docs/stdlib/net/tls/handshake) — server
  typed-state machine driving each handshake.
