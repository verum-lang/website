---
sidebar_position: 5
title: TLS 1.3 record layer (RFC 8446 §5)
description: Outer plaintext framing, inner plaintext padding, AEAD seal/open, and the V8 sequence-monotonicity theorem.
---

# TLS 1.3 record layer — RFC 8446 §5

`core.net.tls13.record` implements the record wrapping that sits
between handshake-message emission and the network. It has two
carriers:

- **TLSPlaintext** — pre-encryption records (early handshake, dummy
  ChangeCipherSpec for middlebox compatibility).
- **TLSCiphertext** — AEAD-sealed records after key installation.

## Outer record (TLSPlaintext, §5.1)

```
struct {
    ContentType type;            ← u8, one of {20, 21, 22, 23}
    ProtocolVersion legacy_record_version = 0x0303;
    uint16 length;
    opaque fragment[TLSPlaintext.length];
} TLSPlaintext;
```

ContentType codepoints:

| Code | Name | Use |
|:---:|------|-----|
| 20 | `ChangeCipherSpec` | Legacy dummy, §D.4 middlebox compat |
| 21 | `Alert` | Warning/fatal alerts (RFC 8446 §6) |
| 22 | `Handshake` | ClientHello, ServerHello, ... |
| 23 | `ApplicationData` | All encrypted records' outer type |

Constants: `legacy_record_version` is ALWAYS `0x0303` on the wire
(TLS 1.2 sentinel — the real version is negotiated via
`supported_versions`).

Fragment length cap: `MAX_PLAINTEXT_SIZE = 16384` (2¹⁴). Encoder
rejects larger fragments with `RecordEncodeError.FragmentTooLarge`.

```verum
mount core.net.tls13.record.plaintext.{
    TlsPlaintext, MAX_PLAINTEXT_SIZE, MAX_CIPHERTEXT_SIZE,
};

let rec = TlsPlaintext {
    content_type: ContentType.Handshake,
    fragment:     hs_message_bytes,
};
let mut out: List<Byte> = [];
rec.encode(&mut out)?;
```

Byte-exact layout for an empty Handshake record:

```
[0x16] [0x03 0x03] [0x00 0x00]
  ^^   ^^^^^^^^^^^ ^^^^^^^^^^^
  type legacy ver. length = 0
```

See [`tls_plaintext_encode_kat`](#references).

## Inner plaintext (TLSInnerPlaintext, §5.2)

After key installation the wire carries ciphertext; the decrypted
inner blob has this shape:

```
struct {
    opaque     content[TLSPlaintext.length];
    ContentType type;                          ← real type
    uint8      zeros[length_of_padding];
} TLSInnerPlaintext;
```

The *outer* ContentType is always `ApplicationData` (23) regardless
of the inner type. Post-decrypt, the parser scans trailing zero bytes
backwards to find the real ContentType byte:

```verum
public fn build_inner_plaintext(content: &[Byte],
                                 content_type: ContentType,
                                 padding_len: Int) -> List<Byte>;

public fn parse_inner_plaintext(inner: &[Byte])
    -> Result<(ContentType, List<Byte>), RecordDecodeError>;
```

Reject conditions (§5.1 last paragraph):

- **All-zero blob** → `NoContentType` (nothing but padding).
- **Trailing ContentType = 0 (Invalid)** → `InvalidInnerType`.

See [`inner_plaintext_roundtrip`](#references).

## AEAD seal / open (§5.2)

Per-direction `AeadState` holds the traffic key + IV + monotonically
increasing sequence counter:

```verum
public type AeadState is {
    kind: AeadKind,              ← Aes128Gcm | Aes256Gcm | ChaCha20Poly1305 | ...
    key:  SecretBytes,
    iv:   [Byte; 12],
    seq:  UInt64,
};
```

Per-record nonce (§5.3):

```
nonce = iv XOR pad_left_64(seq, 12 bytes)
```

`seq` is XORed into the *last 8 bytes* of `iv`; the first 4 bytes of
`iv` pass through unchanged.

`AeadState.seal(content, content_type, padding_len)`:

1. Build inner plaintext.
2. Compute AAD = 5-byte outer header `[23, 0x03, 0x03, len_hi, len_lo]`
   where `len = inner.len() + tag_len`.
3. Compute nonce per above.
4. `ciphertext = AEAD_seal(key, nonce, aad, inner_plaintext)`.
5. Emit outer header + ciphertext.
6. `seq += 1`.

`AeadState.open(record)`:

1. Split header + body; verify outer type is `ApplicationData`.
2. Recompute nonce from current `seq` + `iv`.
3. `inner = AEAD_open(key, nonce, aad, body)`.
4. Parse inner_plaintext, extract (type, content).
5. `seq += 1`.

V8 theorem ([`v8_aead_seq_theorem`](#references)) proves `seq`
strictly increases by 1 per successful seal/open — this is the
AEAD nonce-uniqueness invariant.

## Error catalogue

```verum
public type RecordError is
      SequenceOverflow
    | AeadFailure
    | PlaintextTooLarge(Int)
    | CiphertextTooShort
    | BadContentType
    | InnerPlaintextMalformed;
```

- `AeadFailure` — tag verify failed; either tamper or wrong key. Both
  tests in [`aead_state_roundtrip`](#references) cover this.
- `BadContentType` — received outer record's type ≠ `ApplicationData`
  after key installation.

## AEAD cipher families

```verum
public type AeadKind is
    | Aes128Gcm                  ← key 16, tag 16 — mandatory §9.1
    | Aes256Gcm                  ← key 32, tag 16 — recommended §9.1
    | ChaCha20Poly1305           ← key 32, tag 16 — mandatory §9.1
    | Aes128Ccm                  ← key 16, tag 16 — optional
    | Aes128Ccm8                 ← key 16, tag 8  — optional (IoT)
    | Unknown;
```

`AeadKind.{key_len,iv_len,tag_len}` expose the size parameters; `iv_len`
is always 12 for TLS 1.3. See [`aead_kind_sizes`](#references).

## Fragmentation (§5.1)

A handshake message larger than `MAX_PLAINTEXT_SIZE` is split across
multiple records; the receiver reassembles by buffering `Handshake`
records until the inner length field matches. See
[`fragment_reassembler`](#references) and
[`seal_all_fragmenting`](#references).

## References

- `vcs/specs/L2-standard/net/tls13/tls_plaintext_encode_kat.vr`
- `vcs/specs/L2-standard/net/tls13/inner_plaintext_roundtrip.vr`
- `vcs/specs/L2-standard/net/tls13/aead_state_roundtrip.vr`
- `vcs/specs/L2-standard/net/tls13/aead_kind_sizes.vr`
- `vcs/specs/L2-standard/net/tls13/content_type_roundtrip.vr`
- `vcs/specs/L2-standard/net/tls13/fragment_reassembler.vr`
- `vcs/specs/L2-standard/net/tls13/seal_all_fragmenting.vr`
- `vcs/specs/L2-standard/net/tls13/v8_aead_seq_theorem.vr`
- `vcs/specs/L2-standard/net/tls13/alert_roundtrip.vr`
- `vcs/specs/L2-standard/net/tls13/alert_close_notify.vr`
