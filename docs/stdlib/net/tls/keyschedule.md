---
sidebar_position: 4
title: TLS 1.3 key schedule (RFC 8446 §7)
description: HKDF-Expand-Label, Derive-Secret, and the early → handshake → master → traffic secret chain.
---

# TLS 1.3 key schedule — RFC 8446 §7

`core.net.tls13.keyschedule` implements the full early → handshake →
application secret chain with typed stages. The schedule passes
through four secret kinds:

```
PSK?                           DHE?
  │                             │
  ▼                             ▼
EarlySecret ──────► HandshakeSecret ──────► MasterSecret
  │                             │                │
  │ binder_key                  │ c_hs_traffic   │ c_ap_traffic
  │ res/ext binder              │ s_hs_traffic   │ s_ap_traffic
  │ c_e_traffic                 │                │ exporter_master
  │ e_exp_master                │                │ resumption_master
```

Every transition is a method on the current-stage type; you cannot
`HandshakeSecret.client_traffic()` without first going through
`EarlySecret.to_handshake_input()`.

## HKDF-Expand-Label (§7.1)

```
HkdfLabel {
    uint16 length = Length;
    opaque label<7..255> = "tls13 " ++ Label;
    opaque context<0..255> = Context;
}
HKDF-Expand-Label(Secret, Label, Context, Length) =
    HKDF-Expand(Secret, HkdfLabel, Length)
```

API:

```verum
mount core.net.tls13.keyschedule.hkdf_label.{hkdf_expand_label};

let derived = hkdf_expand_label(
    HashKind.Sha256,
    secret_bytes,
    &LABEL_CLIENT_HS_TRAFFIC,      // "c hs traffic"
    transcript_hash.as_slice(),
    32,
)?;
```

Byte-exact RFC 8446 §7.1 `HkdfLabel` wire for `"c hs traffic"`:

```
[0x00 0x20]                                    ← length = 32
[0x12]                                         ← "tls13 " ++ label length (0x12 = 18)
["tls13 c hs traffic"]                         ← 18 bytes
[0x20]                                         ← context length = 32
[Hash(ClientHello || ServerHello)]             ← context bytes
```

See [`hkdf_expand_label_kat`](#references) and
[`derive_secret_label_bytes`](#references).

## Derive-Secret (§7.1)

```
Derive-Secret(Secret, Label, Messages) =
    HKDF-Expand-Label(Secret, Label, Transcript-Hash(Messages), Hash.length)
```

Label catalogue (`core.net.tls13.keyschedule.derive_secret`):

| Label | Purpose |
|-------|---------|
| `"ext binder"` | External PSK binder key |
| `"res binder"` | Resumption PSK binder key |
| `"c e traffic"` | Client early traffic (0-RTT) |
| `"e exp master"` | Early exporter master |
| `"c hs traffic"` | Client handshake traffic |
| `"s hs traffic"` | Server handshake traffic |
| `"c ap traffic"` | Client application traffic |
| `"s ap traffic"` | Server application traffic |
| `"exp master"` | Exporter master secret |
| `"res master"` | Resumption master secret |
| `"derived"` | Forwarding label between stages |
| `"finished"` | Finished-MAC key derivation |
| `"key"` / `"iv"` | Per-record AEAD key / IV |
| `"traffic upd"` | KeyUpdate rotation |
| `"resumption"` | NST → PSK derivation |

See [`derive_secret_label_distinct`](#references) (V1 support).

## Early secret (§7.1)

```
EarlySecret = HKDF-Extract(0x00.., PSK?)         (PSK = 32/48 zeros if no PSK)
binder_key    = Derive-Secret(EarlySecret, "{res|ext} binder", "")
c_e_traffic   = Derive-Secret(EarlySecret, "c e traffic", ClientHello)
e_exp_master  = Derive-Secret(EarlySecret, "e exp master", ClientHello)
derived_es    = Derive-Secret(EarlySecret, "derived", "")
```

`EarlySecret.derive_no_psk(hash)` produces the no-PSK variant where the
PSK input is the all-zero vector. See
[`early_secret_paths`](#references) and
[`early_data_budget`](#references).

## Handshake secret (§7.1)

```
HandshakeSecret = HKDF-Extract(derived_es, (EC)DHE shared)
c_hs_traffic    = Derive-Secret(HandshakeSecret, "c hs traffic", CH..SH)
s_hs_traffic    = Derive-Secret(HandshakeSecret, "s hs traffic", CH..SH)
derived_hs      = Derive-Secret(HandshakeSecret, "derived", "")
```

## Master secret (§7.1)

```
MasterSecret       = HKDF-Extract(derived_hs, 0x00..)        (32/48 zeros)
c_ap_traffic       = Derive-Secret(MasterSecret, "c ap traffic", CH..SF)
s_ap_traffic       = Derive-Secret(MasterSecret, "s ap traffic", CH..SF)
exporter_master    = Derive-Secret(MasterSecret, "exp master", CH..SF)
resumption_master  = Derive-Secret(MasterSecret, "res master", CH..CF)
```

## Traffic secret → AEAD keys

Per-record key / IV derived by HKDF-Expand-Label on the stage's
traffic secret:

```
key = HKDF-Expand-Label(traffic_secret, "key", "", key_len)
iv  = HKDF-Expand-Label(traffic_secret, "iv",  "", 12)
```

`key_len` is 16 for AES-128-GCM / AES-128-CCM, 32 for AES-256-GCM /
ChaCha20-Poly1305.

## KeyUpdate rotation (§4.6.3 + §7.1)

```
next_traffic_secret = HKDF-Expand-Label(current_traffic_secret,
                                        "traffic upd", "", Hash.len)
```

V2 theorem ([`v2_key_update_theorem`](#references)) proves:

- Counter monotonicity: `generation_{N+1} = generation_N + 1` per
  direction.
- Peer-gap cap: `|generation_tx - generation_rx| ≤ 1` at any time.
- Per-record sequence reset: `record_seq = 0` on each new generation.

## Finished MAC key

```
finished_key = HKDF-Expand-Label(handshake_traffic_secret,
                                 "finished", "", Hash.len)
verify_data  = HMAC-Hash(finished_key, Transcript-Hash(everything))
```

## Exporter (RFC 5705 + §7.5)

```
exporter(label, context, length) =
    HKDF-Expand-Label(
        Derive-Secret(exporter_master, label, ""),
        "exporter", Hash(context), length
    )
```

Used by QUIC to derive QUIC traffic secrets post-handshake
(labels `"quic key"`, `"quic iv"`, `"quic hp"`).

## V1 theorem

`derive_secret` is label-injective: distinct labels produce distinct
output bytes with overwhelming probability under the standard HMAC
assumption. V1 ([`v1_derive_secret_theorem`](#references))
discharges the label-catalogue distinctness + output-length contract
through the SMT backend.

## References

- `vcs/specs/L2-standard/net/tls13/hkdf_expand_label_kat.vr`
- `vcs/specs/L2-standard/net/tls13/derive_secret_label_bytes.vr`
- `vcs/specs/L2-standard/net/tls13/derive_secret_label_distinct.vr`
- `vcs/specs/L2-standard/net/tls13/early_secret_paths.vr`
- `vcs/specs/L2-standard/net/tls13/keyschedule_typecheck.vr`
- `vcs/specs/L2-standard/net/tls13/early_data_budget.vr`
- `vcs/specs/L2-standard/net/tls13/traffic_directional_separation.vr`
- `vcs/specs/L2-standard/net/tls13/traffic_phase_direction.vr`
- `vcs/specs/L2-standard/net/tls13/key_update_rotation_distinct.vr`
- `vcs/specs/L2-standard/net/tls13/v1_derive_secret_theorem.vr`
- `vcs/specs/L2-standard/net/tls13/v2_key_update_theorem.vr`
- `vcs/specs/L2-standard/net/tls13/v8_aead_seq_theorem.vr`
- `vcs/specs/L2-standard/net/tls13/hash_kind_output_len.vr`
- `vcs/specs/L2-standard/net/tls13/binder_flavor_label.vr`
- `vcs/specs/L2-standard/net/kat/rfc8448_simple_1rtt.vr`
