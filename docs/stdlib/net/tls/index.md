---
sidebar_position: 1
title: core.net.tls13 — TLS 1.3
description: Pure-Verum implementation of RFC 8446 + RFC 8449 + RFC 8879 with typed handshake phases, refinement-proven transcripts, and Z3-checked session invariants.
---

# `core.net.tls13` — TLS 1.3

A pure-Verum implementation of TLS 1.3, replacing the legacy
intrinsic-backed `core.net.tls.*` surface with a fully-typed,
refinement-verified pipeline. The crate tracks these specifications:

| Spec | Title | Scope |
|------|-------|-------|
| [RFC 8446](https://datatracker.ietf.org/doc/html/rfc8446) | The Transport Layer Security (TLS) Protocol Version 1.3 | Record layer, handshake, key schedule, 0-RTT |
| [RFC 8448](https://datatracker.ietf.org/doc/html/rfc8448) | Example Handshake Traces | Byte-level KAT coverage |
| [RFC 8449](https://datatracker.ietf.org/doc/html/rfc8449) | Record Size Limit | `max_fragment_length` extension |
| [RFC 8879](https://datatracker.ietf.org/doc/html/rfc8879) | Certificate Compression | Interop with brotli / zstd compression |
| [RFC 5869](https://datatracker.ietf.org/doc/html/rfc5869) | HKDF | Key schedule primitive |
| [RFC 9147 §4.2](https://datatracker.ietf.org/doc/html/rfc9147) | DTLS 1.3 early-data semantics | Cross-referenced by QUIC 0-RTT |

TLS 1.3 design in Verum has two deliberate departures from
wire-mirror implementations:

1. **Typed handshake phases** — the session value carries its
   handshake state as a type parameter. Moving from `Handshaking` to
   `Established` is a type transition, not a runtime check.
2. **Transcript hash as a dependent parameter** — each handshake
   message is indexed by the prefix hash it must be appended to, so
   transcript-mismatch bugs (e.g., Lucky-13 style) are compile-time
   errors rather than runtime protocol aborts.

## Module map

| Concern | Module | Key types |
|---------|--------|-----------|
| Record layer | `core.net.tls13.record` | `RecordAead`, `ContentType`, `ProtectedRecord` |
| Key schedule | `core.net.tls13.keyschedule.{derive_secret, schedule}` | `EarlySecret`, `HandshakeSecret`, `MasterSecret` |
| Handshake driver | `core.net.tls13.handshake` | `ClientSm`, `ServerSm`, `HandshakeDriver` |
| Typed session | `core.net.tls13.session` | `TlsClient<Phase>`, `TlsServer<Phase>`, `Progress` |
| Cipher suites | `core.net.tls13.cipher_suite` | `CipherSuite`, `AeadKind`, `HashKind` |
| Named groups | `core.net.tls13.named_group` | `NamedGroup`, `Curve25519`, `P256`, `P384`, `P521` |
| Signature schemes | `core.net.tls13.sig_scheme` | `SignatureScheme`, `default_offer_list` |
| Extensions | `core.net.tls13.handshake.extension` | `Extension`, SNI, ALPN, KeyShare, EarlyData, … |
| Alerts | `core.net.tls13.alert` | `Alert`, `AlertLevel`, `AlertDescription` |
| 0-RTT / resumption | `core.net.tls13.handshake.{early_data, psk, ticket_issuer}` | `EarlyKeys`, `PskIdentity`, `ClientSession` |
| Post-handshake auth | `core.net.tls13.handshake.post_handshake_auth` | `PostHandshakeAuthExt`, CertificateRequest trigger |
| Anti-replay | `core.net.tls13.handshake.zero_rtt_antireplay` | `AntiReplayCache`, bloom-filter + strike-register |
| kTLS handoff | `core.net.tls13.record.ktls` | Linux 5.x kernel-offloaded record layer |

## Typed session flow

The client session carries its phase as a type parameter. The
compiler enforces that `write`/`read` are only callable on
`TlsClient<Established>`.

```verum
mount core.net.tls13.session.{TlsClient, Progress};
mount core.net.tls13.handshake.{ClientConfig};
mount core.net.tls13.cipher_suite.{CipherSuite};
mount core.net.tls13.named_group.{NamedGroup};
mount core.net.tls13.sig_scheme.{SignatureScheme};
mount core.security.x509.{TrustStore};

async fn tls_handshake(transport: &mut TcpStream)
    -> Result<TlsClient<Established>, TlsError>
{
    let cfg = ClientConfig {
        server_name:       "example.test",
        alpn:              [b"h3".to_list()],
        trust:             TrustStore.system()?,
        groups:            [NamedGroup.X25519],
        suites:            [CipherSuite.TlsAes128GcmSha256],
        sig_schemes:       SignatureScheme.default_offer_list(),
        verify_hostname:   true,
        random:            csprng_32()?,
        key_shares:        [],
    };

    // Start handshake — get the ClientHello to ship.
    let (mut client, first_wire) = TlsClient.new(cfg)?;
    transport.write_all(first_wire.as_slice()).await?;

    // Drive to Established.
    loop {
        let inbound = transport.read_record().await?;
        match client.progress(inbound.as_slice())? {
            Progress.Done(established) => return Ok(established),
            Progress.Continue(next) => {
                client = next;
                if let Some(out) = client.drain_outbound() {
                    transport.write_all(out.as_slice()).await?;
                }
            }
        }
    }
}
```

The returned `TlsClient<Established>` exposes `write(&mut self, buf)`
and `read(&mut self, buf)` — neither method exists on
`TlsClient<Handshaking>`, so the compile-time proof "session in
handshake cannot emit application data" is free.

## Key schedule (RFC 8446 §7.1)

The key schedule is a linear HKDF chain. Each derivation is a
separate function so that mis-labeling a secret (e.g., deriving the
`c hs traffic` secret from the `server_handshake_secret`) is caught
by the type system:

```text
zero_salt                        PSK (or zero)
   │                               │
   └─── HKDF-Extract ──────────────┘
                 │
              early_secret
                 │
          ┌──────┼──────────┐
          │      │          │
        c e      c hs        e exp
     traffic   master       master
                 │
          Derive-Secret
                 │
              ECDHE(e, s)
                 │
       HKDF-Extract(., .)
                 │
          handshake_secret
                 │
          ┌──────┼──────────┐
          │      │          │
        c hs    s hs         ...
       traffic traffic
                 │
              zero_salt
                 │
        HKDF-Extract
                 │
          master_secret
                 │
          ┌──────┼──────────┐
          │      │          │
     c ap     s ap        exp
    traffic  traffic     master
```

The three entry points (`early_secret`, `handshake_secret`,
`master_secret`) are distinct types; `derive_secret` is
module-parametric over the hash (`Sha256`, `Sha384`).

## Refinement contracts (V1–V9)

Invariants encoded at type level and discharged by `verum verify`:

| # | Invariant | Module |
|---|-----------|--------|
| V1 | Record sequence monotonic (per direction) | `record` |
| V2 | AEAD nonce = static IV xor sequence counter (§5.3) | `record` |
| V3 | `SignatureScheme.default_offer_list()` distinct + non-empty | `sig_scheme` |
| V4 | `CipherSuite.aead_kind()` matches hash kind (TLS 1.3 tuple invariant) | `cipher_suite` |
| V5 | Transcript hash extends monotonically | `handshake.transcript` |
| V6 | Post-handshake auth CertificateRequest is allowed at 0 or more positions | `handshake.post_handshake_auth` |
| V7 | Anti-replay `(psk_id, ClientHello hash)` window never shrinks | `handshake.zero_rtt_antireplay` |
| V8 | Alert levels (`Warning`/`Fatal`) exhaust description enum | `alert` |
| V9 | Key-update boundaries ≥ confidentiality limit | shared with QUIC `key_update` |

Every invariant has a theorem file under
`vcs/specs/L2-standard/net/tls13/`. The proofs depend on HKDF being
axiomatised against its RFC 5869 specification (visible via
`verum audit --framework-axioms`).

## 0-RTT / resumption

Resumption uses RFC 8446 §4.6.1 `NewSessionTicket` messages; the
server mints a `ClientSession` (ticket + master secret handle + max
early data size), and the client's next connection offers it in the
pre-shared-key extension.

```verum
mount core.net.tls13.handshake.{ClientConfig, early_data};
mount core.net.tls13.session.{TlsClient};

async fn resume_with_0rtt(
    cfg: ClientConfig,
    session: ClientSession,
    early_payload: &[Byte],
) -> Result<TlsClient<Established>, TlsError> {
    if (early_payload.len() as UInt32) > session.max_early_data_size {
        return Err(TlsError.EarlyDataTooLarge(early_payload.len()));
    }
    let (mut client, first_wire, early_wire) =
        TlsClient.new_resumed(cfg, session, early_payload)?;
    // ship first_wire + early_wire immediately ... drive progress as before.
}
```

The server must enforce anti-replay. `zero_rtt_antireplay` offers two
strategies — single-use tickets (burn on first use) and bloom-filter
dedup over `(psk_id, ClientHello-hash)` — per RFC 8446 §8.

## Post-handshake authentication (RFC 8446 §4.6.2)

`post_handshake_auth.PostHandshakeAuthExt` lets the server mint a
`CertificateRequest` at any point after the handshake completes. The
typed session carries a phantom parameter `HasClientAuth` that flips
once the client sends its post-handshake `Certificate` message, so
the application layer can assert `client.is_authenticated()` in a
refinement-typed context.

## kTLS offload

`core.net.tls13.record.ktls` exposes a Linux 5.x kernel-offloaded
record layer: once the handshake completes, `TlsClient<Established>`
can hand its traffic keys to the kernel via `setsockopt(TLS_TX)` /
`setsockopt(TLS_RX)`. Subsequent `write`/`read` then go through plain
`TcpStream` I/O — the kernel applies AEAD. This saves a copy on the
data-plane without weakening the TLS 1.3 state machine guarantees
(the handshake, key update, alerts, and post-handshake auth all stay
in Verum).

## Testing

- Byte-level RFC 8448 traces:
  `vcs/specs/L2-standard/net/tls13/rfc8448_*.vr` (§3, §4, §5, §6, §7).
- Alert tests exercise every alert description at both levels.
- Anti-replay cache unit tests simulate 10⁶-entry bloom filters and
  verify false-positive rate.

## Deep-dive pages

- [Handshake state machine (RFC 8446 §4)](/docs/stdlib/net/tls/handshake) — typed-state
  client / server progression, all 10 handshake messages, transcript
  hash folding + HRR reseed, Finished MAC, CertificateVerify context.
- [Extensions (RFC 8446 §4.2)](/docs/stdlib/net/tls/extensions) — full catalogue with
  wire layout: SNI, ALPN, key_share, supported_versions, PSK,
  early_data, signature_algorithms(_cert), cookie, status_request,
  record_size_limit, quic_transport_parameters.
- [Key schedule (RFC 8446 §7)](/docs/stdlib/net/tls/keyschedule) — HKDF-Expand-Label,
  Derive-Secret, the early → handshake → master chain, V1/V2
  theorems.
- [Record layer (RFC 8446 §5)](/docs/stdlib/net/tls/record-layer) — TLSPlaintext outer
  header, TLSInnerPlaintext, AEAD seal/open, nonce construction, V8
  monotonicity.

## See also

- [`core.net.quic`](/docs/stdlib/net/quic/) — QUIC consumes `tls13.handshake` via
  CRYPTO frames; the `session` surface is reused.
- [`core.net.h3`](/docs/stdlib/net/http3/) — ALPN-negotiated HTTP/3 sits on top.
- [`core.security`](/docs/stdlib/security/overview) — certificate
  chain validation (`TrustStore.verify(...)`) and the cipher /
  AEAD / KDF primitives the key schedule consumes.

## Status (2026-04-29)

Full handshake path (1-RTT + 0-RTT) + resumption + HRR ships.
Server-side post-handshake auth is wired; anti-replay ships as two
independent strategies (bloom-filter + monotonic clock).

L2 conformance: **43 / 76 (56.6 %)** at the 2026-04-29 baseline.
The gap is **not** in TLS protocol code: the implementation modules
all type-check standalone, the V1 / V2 / V8 theorems still discharge
through Z3, and the RFC 8448 reference vectors (`rfc8448_simple_1rtt`,
`rfc8448_hrr_appendix_c`, `rfc8448_resumed_appendix_b`) compute the
correct intermediate secrets when run as standalone scripts.

The 33 failures cluster into the same four cross-cog symbol-resolution
issues described in the QUIC status section:

1. `mount X.{TEXT_CONST}` from a `mod.vr`-style submodule does not
   bind the constant — affects per-handshake-stage label constants
   (`LABEL_CLIENT_IN`, `LABEL_QUIC_KEY`, `LABEL_FINISHED`, etc.).
2. Variant-name simple-name keying — affects extension-tag
   constructors that share names across `tls13.extension` and
   `tls13.handshake.messages`.
3. Stale type names — a few KAT files reference pre-rename types.
4. Explicit type arguments at call site — affects generic helpers
   that take `T` and need to call `T.from_bytes(...)`.

When these compiler issues close, the TLS suite returns to the
100 % band on the same test corpus.

The audit (constant-time discipline on secret compare,
zeroise-on-drop for secret bytes, downgrade prevention, secure RNG,
0-RTT replay protection, malformed-input robustness, DoS surface)
is documented separately and has all six tracked items closed.
