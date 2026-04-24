---
sidebar_position: 4
title: QUIC cryptography (RFC 9001)
description: Initial secret derivation, per-packet AEAD seal/open, header protection, Retry integrity tag, and key update.
---

# QUIC cryptography — RFC 9001

`core.net.quic.crypto` wraps the TLS 1.3 key schedule into the
per-packet-protection operations QUIC requires. Every public function
either takes or returns typed secrets that satisfy refinement
contracts (length, AEAD tag size, directional separation).

## Initial secret derivation (§5.2)

The client's destination CID seeds the Initial key schedule:

```
initial_salt = 0x38762cf7f55934b34d179ae6a4c80cadccbb7f0a

initial_secret          = HKDF-Extract(initial_salt, client_dst_cid)
client_initial_secret   = HKDF-Expand-Label(initial_secret, "client in", "", 32)
server_initial_secret   = HKDF-Expand-Label(initial_secret, "server in", "", 32)

client_key / server_key = HKDF-Expand-Label(role_secret, "quic key", "", 16)
client_iv  / server_iv  = HKDF-Expand-Label(role_secret, "quic iv",  "", 12)
client_hp  / server_hp  = HKDF-Expand-Label(role_secret, "quic hp",  "", 16)
```

RFC 9001 §A.1 known-answer for client DCID `0x8394c8f03e515708`:

| Output | Expected |
|--------|----------|
| `client_initial_secret` | `c00cf151ca5be075ed0ebfb5c80323c4 2d6b7db67881289af4008f1f6c357aea` |
| `client_initial_key` | `1f369613dd76d5467730efcbe3b1a22d` |
| `client_initial_iv` | `fa044b2f42a3fd3b46fb255c` |
| `client_initial_hp` | `9f50449e04a0e810283a1e9933adedd2` |

API:

```verum
mount core.net.quic.crypto.initial.{
    derive_initial_secrets, derive_initial_keys, InitialKeys,
};

let secrets = derive_initial_secrets(&dcid_bytes)?;
let client_keys: InitialKeys = derive_initial_keys(secrets.client.as_slice())?;
// client_keys.key  : List<Byte>  (16 bytes)
// client_keys.iv   : [Byte; 12]
// client_keys.hp   : List<Byte>  (16 bytes)
```

See [`rfc9001_initial_secret_kat`](#references) and
[`initial_salt_label_kat`](#references).

## Per-packet AEAD (§5.3)

Each packet protects its payload with AEAD_AES_128_GCM (or GCM-256 /
ChaCha20-Poly1305 post-handshake):

```
nonce       = iv XOR pad_left_64(packet_number, 12 bytes)
aad         = plaintext header bytes (up through PN field)
ciphertext  = AEAD_seal(key, nonce, aad, payload)
tag         = last 16 bytes of ciphertext
```

The sequence counter is strictly monotonically increasing — every
successful `seal` / `open` increments the space's next-PN counter
by exactly one (V8 theorem,
[`v8_aead_seq_theorem`](#references)). Crossing PN boundaries across
PN spaces does not tie them together: Initial, Handshake, and
Application are independent (V4 theorem,
[`v4_pn_monotonic_theorem`](#references)).

## Header protection (§5.4)

After sealing the payload, QUIC protects the first byte and the
packet-number bytes with a mask derived from the ciphertext sample:

```
sample = ciphertext[offset_of_PN_start + 4 ..= offset_of_PN_start + 19]   (16 bytes)
mask   = first 5 bytes of:
           * AES-128-ECB(hp_key, sample)              — AES suite
           * ChaCha20(hp_key, counter = u32_le(sample[0..4]),
                              nonce   = sample[4..16],
                              zeros)                  — ChaCha20 suite
```

Applied bits:

- **First byte:** low 4 bits (long header) or low 5 bits (short
  header) XOR `mask[0]`.
- **Packet number bytes:** every byte in the PN field XORs with
  `mask[1 + i]`.

The HP key flavour is encoded as `HpKey::AesEcb128([Byte;16])`,
`HpKey::AesEcb256([Byte;32])`, or `HpKey::ChaCha20Block([Byte;32])`
— constructed at key-derivation time based on the AEAD family.

API:

```verum
mount core.net.quic.crypto.header_protection.{
    HpKey, compute_hp_mask, apply_hp_mask,
};

let mask: [Byte; 5] = compute_hp_mask(&hp_key, &sample);
apply_hp_mask(&mut wire, pn_offset, pn_len, &mask, /* is_long */ true);
```

KATs:

- [`hp_mask_aes_roundtrip`](#references) — AES-128 / AES-256 masks
  deterministic + apply is XOR-inverse + first-byte clamp (0x0F long,
  0x1F short).
- [`rfc9001_chacha20_hp_kat`](#references) — ChaCha20 HP derivation.

## Retry integrity tag (§5.8)

The Retry packet carries no encrypted payload; its trailing 16 bytes
authenticate the entire Retry header plus the original DCID:

```
pseudo_packet  = len(odcid) || odcid || retry_packet_without_tag
integrity_tag  = AEAD_AES_128_GCM_tag(
                   key    = RETRY_INTEGRITY_KEY_V1,
                   nonce  = RETRY_INTEGRITY_NONCE_V1,
                   aad    = pseudo_packet,
                   plain  = [])
```

Fixed constants:

```
RETRY_INTEGRITY_KEY_V1   = 0xbe0c690b9f66575a1d766b54e368c84e
RETRY_INTEGRITY_NONCE_V1 = 0x461599d35d632bf2239825bb
```

API:

```verum
mount core.net.quic.crypto.{
    compute_retry_integrity_tag, verify_retry_integrity_tag,
};

let tag: [Byte; 16] = compute_retry_integrity_tag(&odcid, &retry_header)?;
let ok = verify_retry_integrity_tag(&odcid, &retry_packet_bytes)?;
```

See [`rfc9001_retry_integrity_kat`](#references).

## Key update (§6)

RFC 9001 §6 rotates the 1-RTT traffic keys via the TLS 1.3
application-traffic secret chain:

```
current_secret_N+1 = HKDF-Expand-Label(current_secret_N, "quic ku", "", Hash.len)
key_N+1            = HKDF-Expand-Label(current_secret_N+1, "quic key", "", key_len)
iv_N+1             = HKDF-Expand-Label(current_secret_N+1, "quic iv",  "", 12)
```

HP keys are *not* rotated (per spec). The key_phase bit in short-header
first byte signals which generation a packet uses. Limits:

- **Confidentiality:** max 2²³ records for AES-GCM, 2²³ records for
  ChaCha20-Poly1305 (RFC 8446 §5.5).
- **Integrity:** 2⁵² invalid records observed triggers a
  `AEAD_LIMIT_REACHED` close.

V2 theorem ([`v2_key_update_theorem`](#references)) proves the counter
is monotonic, the peer gap is at most 1, and the per-direction record
sequence resets on rotation.

## References

- `vcs/specs/L2-standard/net/kat/rfc9001_client_initial.vr`
- `vcs/specs/L2-standard/net/kat/rfc9001_server_initial.vr`
- `vcs/specs/L2-standard/net/quic/initial_salt_label_kat.vr`
- `vcs/specs/L2-standard/net/quic/rfc9001_initial_secret_kat.vr`
- `vcs/specs/L2-standard/net/quic/rfc9001_retry_integrity_kat.vr`
- `vcs/specs/L2-standard/net/quic/rfc9001_chacha20_hp_kat.vr`
- `vcs/specs/L2-standard/net/quic/hp_mask_aes_roundtrip.vr`
- `vcs/specs/L2-standard/net/quic/retry_constants_surface.vr`
- `vcs/specs/L2-standard/net/quic/key_update_actions.vr`
- `vcs/specs/L2-standard/net/quic/key_update_limits.vr`
- `vcs/specs/L2-standard/net/quic/key_update_typecheck.vr`
- `vcs/specs/L2-standard/net/tls13/v2_key_update_theorem.vr`
- `vcs/specs/L2-standard/net/tls13/v8_aead_seq_theorem.vr`
- `vcs/specs/L2-standard/net/quic/v4_pn_monotonic_theorem.vr`
