# TLS 1.3 (`core.net.tls13`) — pure-Verum

Pure-Verum implementation of TLS 1.3 (RFC 8446) — part of the **warp**
TLS/QUIC/HTTP-3 stack. Replaces the intrinsic-backed
`core.net.tls.*` surface with a fully-typed, refinement-verified,
Z3-proven pipeline.

## Quick map

| Concern | Module | Doc |
|---------|--------|-----|
| Record layer | `core.net.tls13.record` | record.md |
| Key schedule | `core.net.tls13.keyschedule` | keyschedule.md |
| Handshake messages | `core.net.tls13.handshake` | handshake.md |
| Typed sessions | `core.net.tls13.session` | session.md |
| Cipher suites | `core.net.tls13.cipher_suite` | cipher_suite.md |
| Alert protocol | `core.net.tls13.alert` | alert.md |
| Signature schemes | `core.net.tls13.sig_scheme` | sig_scheme.md |
| Extensions | `core.net.tls13.handshake.extension` | extensions.md |
| 0-RTT / early_data | `core.net.tls13.handshake.{ticket_issuer,zero_rtt_antireplay,resumption}` | zero_rtt.md |
| Performance | — | performance.md |
| Security audit | — | security.md |
| Refinement contracts | — | refinement_contracts.md |

## Minimal client flow

```verum
mount core.net.tls13.session.{TlsClient, Handshaking, Established, Progress};
mount core.net.tls13.handshake.{ClientConfig};

let cfg = ClientConfig { /* ... */ };
let (client_handshaking, first_wire) = TlsClient.new(cfg)?;
// Ship first_wire over TCP. Feed server replies back via progress().
let mut cur = Progress.Continue(client_handshaking);
loop {
    match cur {
        Progress.Done(client_est) => { /* use client_est.write/read */ break; }
        Progress.Continue(c) => {
            let inbound = transport.recv().await?;
            cur = c.progress(inbound.as_slice())?;
        }
    }
}
```

## Spec alignment

The full specification lives at `internal/specs/tls-quic.md`:

- §2.1 byte-level interop with RFC 8446 + RFC 8448 vectors.
- §4.3 typed state machines (this doc set reflects that architecture).
- §6 TLS design (record layer, handshake SM, transcript, key schedule).
- §8 cryptographic discipline.
- §9 V-theorems (formally discharged — see refinement_contracts.md).
