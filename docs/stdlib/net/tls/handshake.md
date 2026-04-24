---
sidebar_position: 2
title: TLS 1.3 handshake (RFC 8446 §4)
description: Typed-state client and server handshake state machines, message layouts, and transcript folding.
---

# TLS 1.3 handshake — RFC 8446 §4

`core.net.tls13.handshake` implements the full 1-RTT (and resumption +
0-RTT) handshake with *typed* state transitions — every state boundary
is a distinct type, and illegal transitions don't compile.

## Typed state machine

The client machine progresses through these six states:

```verum
public type ClientSm is
    | @Start(Start)
    | @WaitServerHello(WaitServerHello)
    | @WaitEncryptedExtensions(WaitEncryptedExtensions)
    | @WaitCertCr(WaitCertOrCr)
    | @WaitFinished(WaitFinished)
    | @Connected(Connected);
```

Each `recv_*` method returns the *next* state value. The compiler
rejects `ws.recv_server_hello(...)` on a `WaitFinished` — it's a
type error, not a runtime check.

Server machine mirrors the transitions: `Start → WaitClientHello →
AfterServerHello → AfterEncryptedExtensions → AfterCertificate →
AfterCertificateVerify → AfterFinished → Connected`.

## Handshake message table

| Type code | Message | Module | KAT |
|:---------:|---------|--------|-----|
| 1 | `ClientHello` | `handshake.messages` | [`client_hello_encode`](#references) |
| 2 | `ServerHello` + HRR | same | [`server_hello_encode`](#references), [`hrr_random_sentinel`](#references) |
| 4 | `NewSessionTicket` | same | [`new_session_ticket_encode`](#references), [`nst_early_data_ext_kat`](#references) |
| 5 | `EndOfEarlyData` | same | [`handshake_roundtrip`](#references) |
| 8 | `EncryptedExtensions` | same | [`encrypted_extensions_encode`](#references) |
| 11 | `Certificate` | same | [`certificate_encode_kat`](#references) |
| 13 | `CertificateRequest` | same | [`certificate_request_encode`](#references) |
| 15 | `CertificateVerify` | same | [`certificate_encode_kat`](#references) |
| 20 | `Finished` | same | [`finished_encode_kat`](#references), [`finished_mac`](#references) |
| 24 | `KeyUpdate` | same | [`handshake_roundtrip`](#references) |
| 254 | `message_hash` (synthetic, §4.4.1) | same | [`derive_secret_label_bytes`](#references) |

Every message encodes with a common 4-byte wrapper:

```
[msg_type u8] [length u24] [body ...]
```

Round-trip encode → decode is exercised in
[`handshake_roundtrip`](#references) for all 10 emitted variants.

## ClientHello

```
uint16 legacy_version = 0x0303;        ← middlebox compat (TLS 1.2)
opaque random[32];
opaque legacy_session_id<0..32>;
CipherSuite cipher_suites<2..2^16-2>;
opaque legacy_compression_methods<1..2^8-1> = { 0 };
Extension extensions<8..2^16-1>;
```

Middlebox-traversal gotchas baked into the encoder:

- `legacy_version` is always `0x0303`; the real version goes in the
  `supported_versions` extension.
- `legacy_compression_methods` is always `[0x00]`.
- `legacy_session_id` is echoed back by the server in its
  `legacy_session_id_echo`; a 32-byte value is typical.

## ServerHello and HelloRetryRequest

ServerHello and HRR share the same wire shape. The server signals
"retry requested" by setting the `random` field to the fixed 32-byte
SHA-256 hash of `"HelloRetryRequest"` (RFC 8446 §4.1.3):

```
HRR_RANDOM = CF 21 AD 74 E5 9A 61 11 BE 1D 8C 02 1E 65 B8 91
             C2 A2 11 16 7A BB 8C 5E 07 9E 09 E2 C8 A8 33 9C
```

Client detection: byte-exact compare the received random against
`HRR_RANDOM`. Servers MUST emit this exact value; see
[`hrr_random_sentinel`](#references).

## Downgrade sentinel (§4.1.3)

A TLS 1.3-capable server forced to negotiate 1.2 must set the last
8 bytes of `ServerHello.random` to a sentinel:

```
DOWNGRADE_SENTINEL_TLS12 = "DOWNGRD\x01"
DOWNGRADE_SENTINEL_TLS11 = "DOWNGRD\x00"
```

A 1.3-aware client detects either sentinel in a 1.2 ServerHello and
aborts with `TlsError.ProtocolVersion`. See
[`version_codepoints`](#references).

## Transcript hash (§4.4.1)

A single running hash accumulates every handshake message byte from
`ClientHello1` through the current point. After HelloRetryRequest,
the transcript is *reseeded* with the synthetic `message_hash`
record:

```
new transcript := type(254) || length(hash_len) || Hash(ClientHello1)
```

`Transcript.reseed_for_hrr()` replaces the live hasher with a fresh
one and feeds the 4-byte prefix + `Hash(CH1)`. See
[`transcript_surface`](#references).

## Finished MAC (§4.4.4)

```
finished_key = HKDF-Expand-Label(base_key, "finished", "", Hash.len)
verify_data  = HMAC-Hash(finished_key, Transcript-Hash(everything so far))
```

`base_key` is the traffic secret of the *writer* at the current stage
(`client_handshake_traffic_secret` for the client's Finished,
`server_handshake_traffic_secret` for the server's). The body of the
Finished handshake message is exactly `verify_data` with no framing
beyond the standard 4-byte handshake wrapper.

See [`finished_mac`](#references) and [`finished_encode_kat`](#references).

## CertificateVerify (§4.4.3)

The signature is computed over:

```
64 × 0x20 (space padding)
|| context_string
|| 0x00
|| Transcript-Hash(up to and including Certificate)
```

Context strings:

- `"TLS 1.3, server CertificateVerify"` (server → client)
- `"TLS 1.3, client CertificateVerify"` (client → server, mTLS)

The `CertificateVerify` message carries:

```
SignatureScheme algorithm (u16) || opaque signature<0..2^16-1>
```

RFC 8446 §4.4.3 forbids SHA-1 and PKCS#1 v1.5 for CertificateVerify;
only RSA-PSS, ECDSA-SHA2, and Ed25519/Ed448 schemes are eligible.
`SignatureScheme.is_valid_for_certificate_verify()` enforces this.

## ClientHello → Finished round trip

Full 1-RTT flight (no HRR, no resumption):

```
→ ClientHello
  supported_versions, supported_groups, signature_algorithms,
  key_share, server_name, application_layer_protocol_negotiation,
  [grease extensions]

← ServerHello
    supported_versions (= TLS 1.3), key_share
← EncryptedExtensions
    server_name, ALPN, [others]
← Certificate
← CertificateVerify
← Finished

→ [optional ChangeCipherSpec middlebox dummy]
→ Finished
→ (application data)

← NewSessionTicket × N   (server may delay these)
```

RFC 8448 Appendix A pins the byte-exact transcript for this flow —
see [`rfc8448_simple_1rtt`](#references). Appendix B covers the
resumed / 0-RTT variant; Appendix C the HRR variant.

## Post-handshake

- **KeyUpdate (§4.6.3):** request key rotation; peer SHOULD respond
  with its own KeyUpdate. Both sides derive next-generation traffic
  secrets via `HKDF-Expand-Label(current, "traffic upd", "", len)`.
  V2 theorem discharges the monotonicity obligation.
- **NewSessionTicket (§4.6.1):** server issues resumption material
  bound to the master secret; may carry `early_data` extension
  advertising `max_early_data_size` for 0-RTT.
- **CertificateRequest (§4.6.2):** post-handshake mutual auth — the
  client's `post_handshake_auth` extension opts in at ClientHello time.

## References

- `vcs/specs/L2-standard/net/tls13/client_hello_encode.vr`
- `vcs/specs/L2-standard/net/tls13/server_hello_encode.vr`
- `vcs/specs/L2-standard/net/tls13/hrr_random_sentinel.vr`
- `vcs/specs/L2-standard/net/tls13/handshake_roundtrip.vr`
- `vcs/specs/L2-standard/net/tls13/handshake_type_codepoints.vr`
- `vcs/specs/L2-standard/net/tls13/handshake_typecheck.vr`
- `vcs/specs/L2-standard/net/tls13/encrypted_extensions_encode.vr`
- `vcs/specs/L2-standard/net/tls13/certificate_encode_kat.vr`
- `vcs/specs/L2-standard/net/tls13/certificate_request_encode.vr`
- `vcs/specs/L2-standard/net/tls13/finished_encode_kat.vr`
- `vcs/specs/L2-standard/net/tls13/finished_mac.vr`
- `vcs/specs/L2-standard/net/tls13/new_session_ticket_encode.vr`
- `vcs/specs/L2-standard/net/tls13/nst_early_data_ext_kat.vr`
- `vcs/specs/L2-standard/net/tls13/transcript_surface.vr`
- `vcs/specs/L2-standard/net/tls13/fragment_reassembler.vr`
- `vcs/specs/L2-standard/net/tls13/version_codepoints.vr`
- `vcs/specs/L2-standard/net/tls13/derive_secret_label_bytes.vr`
- `vcs/specs/L2-standard/net/kat/rfc8448_simple_1rtt.vr`
- `vcs/specs/L2-standard/net/kat/rfc8448_resumed_appendix_b.vr`
- `vcs/specs/L2-standard/net/kat/rfc8448_hrr_appendix_c.vr`
