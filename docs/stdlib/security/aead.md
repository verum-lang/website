---
sidebar_position: 6
title: aead — AEAD ciphers (AES-GCM, ChaCha20-Poly1305)
description: Authenticated encryption with associated data. AES-128/256-GCM and ChaCha20-Poly1305. The AEAD layer used by TLS 1.3 and QUIC.
---

# `core::security::aead` — authenticated encryption

## What is AEAD and why does it matter?

**AEAD** stands for **A**uthenticated **E**ncryption with
**A**ssociated **D**ata. It's the modern, *non-optional* way to
encrypt data that might be tampered with in transit.

An AEAD scheme does three things in one call:

1. **Encrypts** plaintext → ciphertext (using a shared key + unique
   nonce).
2. **Authenticates** the ciphertext — produces a short tag (16 bytes)
   that the receiver checks.
3. **Authenticates associated data (AAD)** — extra bytes that are
   *not* encrypted but *are* covered by the tag (packet headers,
   routing metadata, …).

If the ciphertext or AAD were modified in transit, decryption fails
cleanly with a `TagMismatch` error — the plaintext is never exposed.
This prevents whole classes of attacks:

- **Bit-flipping** in ciphertext (classical CTR-mode attack).
- **Padding-oracle** attacks (classical CBC-mode attack).
- **Chosen-ciphertext** attacks generally.

TLS 1.3 (RFC 8446) requires AEAD. QUIC (RFC 9001) requires AEAD.
The old "encrypt-then-MAC" CBC cipher-suites of TLS 1.2 are
deprecated because they're an AEAD bolt-on that got MAC
verification subtly wrong in many implementations.

If you're encrypting data that will be stored or transmitted: use
an AEAD. Not raw AES + raw HMAC. Not CBC + HMAC-then-encrypt.
AEAD. Every time.

## Two AEADs, one API shape

```
┌──────────────────────────────────────────────────────────────────┐
│                     AEAD API (same shape for both)               │
│                                                                  │
│  seal(key, iv, aad, plaintext)  → (ciphertext, tag)             │
│  open(key, iv, aad, ciphertext, tag) → Result<plaintext, Error> │
└──────────────────────────────────────────────────────────────────┘
            │                                    │
            ▼                                    ▼
   ┌────────────────────┐              ┌──────────────────────────┐
   │  AES-128/256-GCM   │              │  ChaCha20-Poly1305       │
   │                    │              │                          │
   │  NIST SP 800-38D   │              │  RFC 8439 §2.8           │
   │  Hardware-accel    │              │  Pure-software friendly  │
   │  TLS/QUIC default  │              │  TLS/QUIC MTI mobile     │
   └────────────────────┘              └──────────────────────────┘
```

Both AEADs expose the same `encrypt(iv, aad, plaintext, &mut ct,
&mut tag)` / `decrypt(iv, aad, ct, &tag, &mut pt) -> Result<_,
AeadError>` contract, differing only in internals.

## Which AEAD should I use?

| Scenario | Recommendation |
|---|---|
| Server with AES-NI, encrypting in bulk | AES-128-GCM or AES-256-GCM |
| Mobile client, battery-sensitive | ChaCha20-Poly1305 |
| Embedded without AES accel | ChaCha20-Poly1305 |
| You need long-term (50+ year) security | AES-256-GCM |
| You're storing data at rest | either — AES-256-GCM is common |
| Interop with TLS 1.3 | negotiated at handshake |
| Interop with QUIC | inherits TLS 1.3 negotiation |

When in doubt, **follow what the protocol spec recommends**. For
new designs without protocol constraints, **AES-128-GCM on hosts
with AES-NI, ChaCha20-Poly1305 on hosts without** — which is what
TLS 1.3 actually negotiates in practice.

## The three hard rules — read twice

1. **Never reuse a nonce with the same key.** Not once. Nonce
   reuse breaks both AES-GCM and ChaCha20-Poly1305 *catastrophically*
   — the attacker can recover the authentication key and forge
   arbitrary messages. If you might reuse nonces (stateless servers,
   random-nonce schemes), look at AES-GCM-SIV (planned P2) or
   XChaCha20 (planned P3) instead. For everything we ship today:
   nonces must be **unique per (key, message)**.

2. **Never truncate the tag.** The full 16-byte tag is the
   authentication guarantee. Truncating to 8 or 12 bytes
   dramatically weakens the forgery bound.

3. **Never expose partial plaintext from a failed decrypt.** The
   library already enforces this: `decrypt` verifies the tag *before*
   revealing any plaintext. If you call the lower-level primitives
   directly, you must preserve this invariant.

These aren't Verum-specific quirks — they're universal AEAD rules.
Every secure AEAD deployment obeys them.

---

## AES-GCM — `core.security.aead.aes_gcm`

### What is AES-GCM?

AES-GCM pairs AES in **Counter mode** (for confidentiality) with
**GHASH** (a polynomial-hash MAC over GF(2^128)). Defined in
[NIST SP 800-38D (2007)](https://doi.org/10.6028/NIST.SP.800-38D).
Standardised in TLS from 1.2 onward and mandatory in TLS 1.3.

### API

```verum
mount core.security.aead.aes_gcm.{
    Aes128Gcm, Aes256Gcm,
    GcmError,
    GCM_IV_LEN,        // 12
    GCM_TAG_LEN,       // 16
};

public type GcmError is
    | TagMismatch
    | InvalidInput { reason: Text };

impl Aes128Gcm {
    pub fn new(key: &AesKey128) -> Aes128Gcm;

    pub fn encrypt(
        &self,
        iv: &[Byte; 12],
        aad: &[Byte],
        plaintext: &[Byte],
        ciphertext: &mut List<Byte>,
        tag: &mut [Byte; 16],
    );

    pub fn decrypt(
        &self,
        iv: &[Byte; 12],
        aad: &[Byte],
        ciphertext: &[Byte],
        tag: &[Byte; 16],
        plaintext: &mut List<Byte>,
    ) -> Result<(), GcmError>;
}

// Aes256Gcm — identical shape; key is &AesKey256 (32 bytes)
```

### 12-byte IV — the TLS/QUIC convention

Our API **only** accepts 12-byte IVs. NIST SP 800-38D also allows
arbitrary-length IVs via an internal `GHASH(IV || 0^s || len(IV))`
derivation, but:

- 12-byte IVs use the direct `J_0 = IV || 0x00000001` construction
  (faster, simpler).
- Every modern protocol (TLS 1.3, QUIC, GCM-SIV source material,
  IPsec ESP) standardises on 12.
- Non-standard IV lengths are a misuse trap: the fallback GHASH
  derivation costs an extra AES-ECB block and confuses the
  nonce-uniqueness model.

By only exposing the 12-byte path we make nonce-reuse harder to
write by accident.

### Quick example

```verum
use core.security.cipher.aes.{AesKey128};
use core.security.aead.aes_gcm.{Aes128Gcm, GcmError};

fn round_trip(
    key: &AesKey128,
    iv: &[Byte; 12],
    aad: &[Byte],
    pt: &[Byte],
) -> Result<List<Byte>, GcmError> {
    let cipher = Aes128Gcm.new(key);

    // Seal
    let mut ct = List.with_capacity(pt.len());
    let mut tag: [Byte; 16] = [0; 16];
    cipher.encrypt(iv, aad, pt, &mut ct, &mut tag);

    // … send ct + tag (and aad) over the wire …

    // Open
    let mut recovered = List.with_capacity(ct.len());
    cipher.decrypt(iv, aad, ct.as_slice(), &tag, &mut recovered)?;

    Ok(recovered)
}
```

### AES-256-GCM

```verum
use core.security.cipher.aes.{AesKey256};
use core.security.aead.aes_gcm.{Aes256Gcm};

let key: AesKey256 = /* 32 bytes */ ;
let cipher = Aes256Gcm.new(&key);
// identical encrypt/decrypt API to Aes128Gcm
```

### Algorithm — for professionals

#### Setup

```
H    = E_K(0^128)                    # "hash sub-key" — GHASH key
J_0  = IV || 0x00 0x00 0x00 0x01     # initial counter (96-bit IV case)
```

#### Encrypt

```
C = GCTR_K(inc_32(J_0), P)           # counter-mode starting at J_0+1
S = GHASH_H(A || pad_to_16 || C || pad_to_16 || len(A) || len(C))
T = E_K(J_0) XOR S                   # the authentication tag
```

- `GCTR_K(counter, plain)` XORs plain with `E_K(counter)`,
  `E_K(counter+1)`, `E_K(counter+2)`, …
- `GHASH_H(X)` is the polynomial hash in GF(2^128) keyed with H;
  reduction poly `x^128 + x^7 + x^2 + x + 1`.

#### Decrypt

Verify the tag *first*:

```
S'  = GHASH_H(A || pad || C || pad || len(A) || len(C))
T'  = E_K(J_0) XOR S'
if T' != T:   return Err(TagMismatch)
else:         return GCTR_K(inc_32(J_0), C)
```

The tag comparison uses
[`constant_time_eq`](/docs/stdlib/security/util) — essential to
prevent timing attacks that would otherwise let an attacker forge
tags byte-by-byte.

### GHASH internals

GHASH is a Wegman-Carter universal hash in GF(2^128). For each
16-byte block, XOR it into the accumulator, then multiply the
accumulator by `H` in GF(2^128). The reduction polynomial is
represented bit-reversed as `0xE1` in the high byte of a 16-byte
block — see `core/security/aead/aes_gcm.vr:gf_mul` for the
bit-by-bit reference implementation.

Reference `gf_mul` is ~5-10× slower than a PCLMULQDQ-accelerated
path. `@cfg(feature = "crypto-accel")` substitutes it with
hardware-based multiplication — typical end-to-end GCM throughput
6-10 GiB/s vs. ~100 MiB/s pure-software reference.

### Performance characteristics

| Platform | Reference | AES-NI + PCLMULQDQ |
|---|---|---|
| x86_64 Zen 4 | ~80 MiB/s | ~8 GiB/s |
| x86_64 Tiger Lake (VAES+VPCLMUL) | — | ~20 GiB/s |
| ARMv8 Apple M2 | ~60 MiB/s | ~10 GiB/s |
| ARMv8 Neoverse N1 | ~50 MiB/s | ~6 GiB/s |

Non-accelerated is acceptable for handshake volumes (few kbytes per
connection), not for bulk (data-center encrypting GB/s).

---

## ChaCha20-Poly1305 — `core.security.aead.chacha20_poly1305`

### What is it?

The RFC 8439 AEAD construction pairing ChaCha20 with Poly1305. The
beauty of this design:

- **Poly1305 is a one-time MAC** — but the construction derives a
  fresh Poly1305 key per message from `ChaCha20(key, counter=0, nonce)`.
- Every unique (key, nonce) pair gets its own independent Poly1305
  key. One-time-key discipline is automatic — you don't have to
  think about it.
- Data is encrypted with `ChaCha20(key, counter=1..N, nonce)`.
- Everything runs on just ADD, XOR, and integer multiply in the
  underlying primitives. **Naturally constant-time in software.**

This is what makes it the mobile/embedded AEAD of choice.

### API

```verum
mount core.security.aead.chacha20_poly1305.{
    ChaCha20Poly1305,
    AeadError,
    KEY_SIZE,      // 32
    NONCE_SIZE,    // 12
    TAG_SIZE,      // 16
};

public type AeadError is
    | TagMismatch
    | InvalidInput { reason: Text };

impl ChaCha20Poly1305 {
    pub fn new(key: &ChaChaKey) -> ChaCha20Poly1305;

    pub fn encrypt(
        &self,
        nonce: &ChaChaNonce,
        aad: &[Byte],
        plaintext: &[Byte],
        ciphertext: &mut List<Byte>,
        tag: &mut [Byte; 16],
    );

    pub fn decrypt(
        &self,
        nonce: &ChaChaNonce,
        aad: &[Byte],
        ciphertext: &[Byte],
        tag: &[Byte; 16],
        plaintext: &mut List<Byte>,
    ) -> Result<(), AeadError>;
}
```

Nonce-type aliasing: `ChaChaNonce` from `cipher/chacha20.vr` is
also `[Byte; 12]`, so it can be used interchangeably with the
`[Byte; 12]` type of the AEAD parameters.

### Quick example

```verum
use core.security.cipher.chacha20.{ChaChaKey, ChaChaNonce};
use core.security.aead.chacha20_poly1305.{ChaCha20Poly1305, AeadError};

fn round_trip(
    key: &ChaChaKey,
    nonce: &ChaChaNonce,
    aad: &[Byte],
    pt: &[Byte],
) -> Result<List<Byte>, AeadError> {
    let aead = ChaCha20Poly1305.new(key);

    let mut ct = List.with_capacity(pt.len());
    let mut tag: [Byte; 16] = [0; 16];
    aead.encrypt(nonce, aad, pt, &mut ct, &mut tag);

    let mut recovered = List.with_capacity(ct.len());
    aead.decrypt(nonce, aad, ct.as_slice(), &tag, &mut recovered)?;

    Ok(recovered)
}
```

### Algorithm — RFC 8439 §2.8.1

```
# Derive one-time Poly1305 key from first ChaCha20 block.
poly_key = ChaCha20(key, counter=0, nonce)[0..32]

# Encrypt plaintext starting at counter=1.
ciphertext = ChaCha20_XOR(key, counter=1, nonce, plaintext)

# Build the MAC input.
mac_data =
      AAD        || zero_pad_to_16(AAD)
   || ciphertext || zero_pad_to_16(ciphertext)
   || le64(len(AAD)) || le64(len(ciphertext))

# Compute tag.
tag = Poly1305(poly_key, mac_data)
```

Verification: recompute `tag` from the received ciphertext+AAD,
compare to the wire tag using `constant_time_eq`, then and only
then decrypt with ChaCha20_XOR.

### Performance characteristics

| Platform | Reference | AVX2 / NEON accelerated |
|---|---|---|
| x86_64 Zen 4 | ~250 MiB/s | ~3 GiB/s |
| x86_64 Tiger Lake + AVX-512 | ~250 MiB/s | ~6 GiB/s |
| ARMv8 Apple M2 | ~300 MiB/s | ~4 GiB/s |
| ARMv8 Cortex-A53 (budget mobile) | ~80 MiB/s | ~200 MiB/s |

The pure-software reference outperforms reference AES-GCM on every
platform. With vector accel both schemes are competitive; AES-GCM
wins on machines with VPCLMUL + VAES-512.

### Test vectors — RFC 8439 §2.8.2

```
key       = 80 81 82 83 84 85 86 87 88 89 8a 8b 8c 8d 8e 8f
            90 91 92 93 94 95 96 97 98 99 9a 9b 9c 9d 9e 9f
nonce     = 07 00 00 00 40 41 42 43 44 45 46 47
aad       = 50 51 52 53 c0 c1 c2 c3 c4 c5 c6 c7
plain     = "Ladies and Gentlemen of the class of '99: If I could
             offer you only one tip for the future, sunscreen would be it."
ciphertext= d3 1a 8d 34 64 8e 60 db 7b 86 af bc 53 ef 7e c2
            a4 ad ed 51 29 6e 08 fe a9 e2 b5 a7 36 ee 62 d6
            3d be a4 5e 8c a9 67 12 82 fa fb 69 da 92 72 8b
            1a 71 de 0a 9e 06 0b 29 05 d6 a5 b6 7e cd 3b 36
            92 dd bd 7f 2d 77 8b 8c 98 03 ae e3 28 09 1b 58
            fa b3 24 e4 fa d6 75 94 55 85 80 8b 48 31 d7 bc
            3f f4 de f0 8e 4b 7a 9d e5 76 d2 65 86 ce c6 4b
            61 16
tag       = 1a e1 0b 59 4f 09 e2 6a 7e 90 2e cb d0 60 06 91
```

VCS: `vcs/specs/L1-core/security/chacha20_poly1305.vr` (shape).

---

## Security considerations — shared by both AEADs

### Nonce uniqueness — the #1 rule

Both AES-GCM and ChaCha20-Poly1305 **catastrophically break** if a
(key, nonce) pair encrypts two different messages:

- Attacker XORs the two ciphertexts and gets the XOR of the two
  plaintexts — classical stream-cipher break.
- Worse, attacker can recover the authentication key and forge
  arbitrary messages for that (key, nonce).

Strategies to guarantee uniqueness:

1. **Counter-based nonces** — maintain a 64-bit counter per key,
   serialise to the low 8 bytes of the 12-byte nonce. The most
   common TLS / QUIC construction.
2. **Random 96-bit nonces** — ~2^48 nonces before birthday-bound
   collision. Acceptable for a few billion messages per key.
3. **XOR with a sequence number** — TLS 1.3 actually XORs its
   record sequence number into a fixed-per-key static IV. This is
   deterministic yet ensures uniqueness as long as the sequence
   number doesn't wrap.

Verum's API does **not** enforce nonce uniqueness — that's caller
responsibility. If you find yourself unsure, look up how your
target protocol does it.

### Message length limits

- **AES-GCM**: max `2^36 - 32 = ~64 GiB` per message. The limit
  comes from the 32-bit counter + 128-bit block size. Rotate keys
  before approaching this.
- **ChaCha20-Poly1305**: max `2^38 = ~256 GiB` per message. Same
  reason (32-bit counter × 64-byte block).

In practice, TLS 1.3 rotates keys *far* below these limits
(every 2^24 ≈ 16 M records).

### Tag forgery

Both AEADs have 128-bit tags. Forgery requires 2^128 guesses on
average — computationally infeasible. Do not truncate.

### Authenticated-associated-data (AAD) semantics

- AAD is authenticated but **not encrypted**. It travels in the
  clear.
- Typical use: protocol headers (TLS record type, QUIC packet
  number, routing metadata).
- AAD + plaintext are cryptographically bound. Modify either
  without the key → `TagMismatch`.

Do NOT put secrets in AAD. It's plaintext.

### When ChaCha20-Poly1305 is slightly safer

ChaCha20-Poly1305 has one architectural advantage over AES-GCM: it
does NOT need a constant-time AES implementation (which is hard
in software). On platforms without AES-NI, the reference AES
becomes the cache-timing-vulnerable path; ChaCha20 is naturally
timing-safe.

For this reason, AWS recommends ChaCha20-Poly1305 for client-side
encryption on mobile devices, and Google strongly preferred it for
QUIC on Android.

---

## File layout

| File | Role |
|---|---|
| `core/security/aead/aes_gcm.vr` | AES-128-GCM + AES-256-GCM — ~460 LOC |
| `core/security/aead/chacha20_poly1305.vr` | ChaCha20-Poly1305 AEAD — ~190 LOC |

## Related modules

- [`core.security.cipher.aes`](/docs/stdlib/security/cipher#aes) — the underlying block cipher.
- [`core.security.cipher.chacha20`](/docs/stdlib/security/cipher#chacha20) — the underlying stream cipher.
- [`core.security.mac.poly1305`](/docs/stdlib/security/mac#poly1305) — the one-time MAC inside ChaCha20-Poly1305.
- [`core.security.util.constant_time`](/docs/stdlib/security/util) — constant-time tag verify.
- [`core.security.kdf.hkdf`](/docs/stdlib/security/kdf) — typically used to derive the AEAD key from a shared secret.

## References

- [NIST SP 800-38D](https://doi.org/10.6028/NIST.SP.800-38D) — AES-GCM / GMAC
- [RFC 8439 §2.8](https://datatracker.ietf.org/doc/html/rfc8439#section-2.8) — ChaCha20-Poly1305 AEAD
- [RFC 5116](https://datatracker.ietf.org/doc/html/rfc5116) — the AEAD interface
- [RFC 7905](https://datatracker.ietf.org/doc/html/rfc7905) — ChaCha20-Poly1305 TLS cipher-suite
- [RFC 8446 §5.2](https://datatracker.ietf.org/doc/html/rfc8446#section-5.2) — TLS 1.3 AEAD usage
- [RFC 9001](https://datatracker.ietf.org/doc/html/rfc9001) — QUIC packet protection
- Rogaway, "Authenticated encryption and the GCM security proof" (2004)
