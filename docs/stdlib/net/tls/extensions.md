---
sidebar_position: 3
title: TLS 1.3 extensions (RFC 8446 §4.2)
description: Complete extension catalogue with wire layout, carrier rules, and byte-exact KATs.
---

# TLS 1.3 extensions — RFC 8446 §4.2

`core.net.tls13.handshake.extension` exposes a single `Extension` sum
covering every extension warp speaks. The decoder is context-aware:
`decode_extensions_block(reader, ctx)` dispatches on the carrier
message (`ClientHelloCtx` / `ServerHelloCtx` / `HelloRetryRequestCtx` /
`EncryptedExtensionsCtx` / `CertificateCtx` / `CertificateRequestCtx` /
`NewSessionTicketCtx`) so `supported_versions` expands into
`SupportedVersionsClient` vs `SupportedVersionsServer` correctly.

Every extension wraps its body in a `u16` length prefix:

```
[ExtensionType u16] [outer_len u16] [body ...]
```

## Extension catalogue

| ID | Name | Carriers | KAT |
|---:|------|----------|-----|
| 0 | `server_name` | CH, EE | [`sni_encode_kat`](#references) |
| 5 | `status_request` | CH, CR, Cert, CertEntry | [`psk_cookie_status_ext_kat`](#references) |
| 10 | `supported_groups` | CH, EE | [`supported_groups_versions_kat`](#references) |
| 13 | `signature_algorithms` | CH, CR | indirect via [`certificate_request_encode`](#references) |
| 16 | `application_layer_protocol_negotiation` | CH, EE | [`alpn_encode_kat`](#references) |
| 18 | `signed_certificate_timestamp` | CH, CR, Cert | — (CT v1.1) |
| 28 | `record_size_limit` | CH, EE | [`quic_tp_record_size_ext_kat`](#references) |
| 27 | `compress_certificate` (RFC 8879) | CH | [`cert_compress_rfc8879`](#references) |
| 41 | `pre_shared_key` | CH (last), SH | [`psk_extension_encode_kat`](#references) |
| 42 | `early_data` | CH, EE, NST | [`encrypted_extensions_encode`](#references), [`nst_early_data_ext_kat`](#references) |
| 43 | `supported_versions` | CH, SH, HRR | [`supported_groups_versions_kat`](#references) |
| 44 | `cookie` | CH, HRR | [`psk_cookie_status_ext_kat`](#references) |
| 45 | `psk_key_exchange_modes` | CH | [`psk_cookie_status_ext_kat`](#references), [`psk_ke_mode`](#references) |
| 49 | `post_handshake_auth` | CH | [`psk_cookie_status_ext_kat`](#references), [`post_handshake_auth_typecheck`](#references) |
| 50 | `signature_algorithms_cert` | CH, CR | [`signature_algorithms_cert_ext_kat`](#references) |
| 51 | `key_share` | CH, SH, HRR | [`key_share_extension_kat`](#references) |
| 57 | `quic_transport_parameters` (RFC 9001 §8.2) | CH, EE | [`quic_tp_record_size_ext_kat`](#references) |

GREASE extension IDs (16 reserved values from RFC 8701) are emitted
by `core.net.tls13.handshake.grease` and ignored on decode.

## Key share (§4.2.8) — three carriers

The KeyShare extension has three structurally distinct wire forms
depending on the carrier:

```
ClientHello:
  [0x00 0x33] [outer_len] [list_len u16]
  [group u16] [kx_len u16] [kx bytes]   ← repeated per offered group

ServerHello:
  [0x00 0x33] [outer_len]
  [group u16] [kx_len u16] [kx bytes]   ← single selected share

HelloRetryRequest:
  [0x00 0x33] [0x00 0x02]
  [selected_group u16]                   ← no key material
```

ADT:

```verum
public type Extension is
    // ...
    | KeyShareClient { shares: List<KeyShareEntry> }
    | KeyShareServer { share:  KeyShareEntry }
    | KeyShareHelloRetryRequest { selected_group: NamedGroup }
    // ...
```

Named groups supported (RFC 8446 §4.2.7): X25519 (0x001D, mandatory),
Secp256r1 (0x0017, mandatory for WebPKI), Secp384r1, Secp521r1, X448,
ffdhe2048/3072/4096. See
[`named_group_codepoints`](#references).

## Signature algorithms vs signature_algorithms_cert (§4.2.3)

Two extensions with *identical wire layout* but different IDs:

- `signature_algorithms` (13) — peer's acceptance list for the other
  side's `CertificateVerify` signature.
- `signature_algorithms_cert` (50) — peer's acceptance list for
  signatures on the *certificate chain* itself. If absent, the other
  extension's list applies.

```
[ext_id u16] [outer_len u16] [list_len u16] [scheme u16] × N
```

`SignatureScheme` codepoints (§4.2.3 / §4.4.3): `rsa_pkcs1_sha256`,
`ecdsa_secp256r1_sha256`, `rsa_pss_rsae_sha256`, `ed25519`, etc. A
scheme is legal for `CertificateVerify` iff it's post-TLS-1.2 (no
SHA-1, no PKCS#1 v1.5); `SignatureScheme.is_valid_for_certificate_verify()`
enforces.

## Supported versions (§4.2.1) — two carriers

```
ClientHello:
  [0x00 0x2B] [outer_len u16] [list_len u8]
  [version u16] × N

ServerHello / HRR:
  [0x00 0x2B] [0x00 0x02] [selected_version u16]
```

TLS 1.3 is `0x0304`; legacy version in the outer `ClientHello.legacy_version`
is always `0x0303` (TLS 1.2 sentinel). The *real* version sits in this
extension. Downgrade sentinels (§4.1.3) complement the logic: a
1.3-aware client that receives TLS 1.2 must check for `DOWNGRD\x01`
in the last 8 bytes of `ServerHello.random` and abort if present.

## Pre-shared key (§4.2.11)

The resumption carrier: identifies PSKs offered by the client plus
HMAC binders proving possession:

```
OfferedPsks {
    identities<7..2^16-1> {
        opaque identity<1..2^16-1>,
        uint32 obfuscated_ticket_age,
    }
    binders<33..2^16-1> {
        opaque binder<32..255>   ← one per identity, HMAC-Hash output
    }
}
```

Binder computation (§4.2.11.2):

```
binder_key    = Derive-Secret(early_secret, "res binder" | "ext binder", "")
finished_key  = HKDF-Expand-Label(binder_key, "finished", "", Hash.len)
binder        = HMAC-Hash(finished_key,
                          Transcript-Hash(Truncate(ClientHello1)))
```

`Truncate(CH1)` = everything up to but excluding the binders block
itself. `ResumptionBinder` for tickets from `NewSessionTicket`;
`ExternalBinder` for out-of-band PSKs.

`obfuscated_ticket_age = (elapsed_ms + ticket_age_add) mod 2^32`
hides the wall-clock age from passive observers.

See [`psk_extension_encode_kat`](#references),
[`binder_flavor_label`](#references).

## Early data (§4.2.10) — three forms

Same extension ID (42), three shapes by carrier:

- **ClientHello + EncryptedExtensions:** empty body (0 bytes).
- **NewSessionTicket:** 4-byte `max_early_data_size` (u32 big-endian)
  — advertises 0-RTT budget for the next resumption.

```verum
public type EarlyDataIndication is
      EarlyDataClient
    | EarlyDataTicket { max_early_data_size: UInt32 };
```

See [`nst_early_data_ext_kat`](#references),
[`early_data_budget`](#references).

## QUIC transport parameters (RFC 9001 §8.2)

Extension ID 57 wraps an opaque byte-string carrying the QUIC
`transport_params` wire emitted by `core.net.quic.transport_params.encode`:

```
[0x00 0x39] [outer_len u16] [body bytes]
```

The TLS layer does not parse the body; QUIC handles that after the
handshake completes. See [`quic_tp_record_size_ext_kat`](#references).

## Record size limit (RFC 8449)

```
[0x00 0x1C] [0x00 0x02] [limit u16]
```

Advertises the maximum record-plaintext size the sender is willing to
receive. TLS 1.3 inner plaintext cap is 16384 (2¹⁴); `limit` MUST be
≥ 64 to avoid alert-size fragility. See
[`quic_tp_record_size_ext_kat`](#references).

## Unknown extension passthrough

```verum
Extension.Unknown { ext_type: UInt16, data: List<Byte> }
```

Preserves any extension type warp doesn't structurally decode.
Necessary for grease and for forward-compat when a peer advertises an
extension the platform doesn't yet understand.

## References

- `vcs/specs/L2-standard/net/tls13/extension_encode_kat.vr`
- `vcs/specs/L2-standard/net/tls13/extension_id_codepoints.vr`
- `vcs/specs/L2-standard/net/tls13/sni_encode_kat.vr`
- `vcs/specs/L2-standard/net/tls13/alpn_encode_kat.vr`
- `vcs/specs/L2-standard/net/tls13/supported_groups_versions_kat.vr`
- `vcs/specs/L2-standard/net/tls13/signature_algorithms_cert_ext_kat.vr`
- `vcs/specs/L2-standard/net/tls13/key_share_extension_kat.vr`
- `vcs/specs/L2-standard/net/tls13/psk_extension_encode_kat.vr`
- `vcs/specs/L2-standard/net/tls13/psk_cookie_status_ext_kat.vr`
- `vcs/specs/L2-standard/net/tls13/psk_ke_mode.vr`
- `vcs/specs/L2-standard/net/tls13/nst_early_data_ext_kat.vr`
- `vcs/specs/L2-standard/net/tls13/early_data_budget.vr`
- `vcs/specs/L2-standard/net/tls13/post_handshake_auth_typecheck.vr`
- `vcs/specs/L2-standard/net/tls13/quic_tp_record_size_ext_kat.vr`
- `vcs/specs/L2-standard/net/tls13/cert_compress_rfc8879.vr`
- `vcs/specs/L2-standard/net/tls13/grease_rfc8701.vr`
- `vcs/specs/L2-standard/net/tls13/named_group_codepoints.vr`
- `vcs/specs/L2-standard/net/tls13/signature_scheme_codepoints.vr`
- `vcs/specs/L2-standard/net/tls13/binder_flavor_label.vr`
- `vcs/specs/L2-standard/net/tls13/version_codepoints.vr`
