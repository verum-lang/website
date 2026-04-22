---
sidebar_position: 4
title: kdf — HKDF key-derivation
description: HKDF (RFC 5869) over SHA-256 / SHA-384 / SHA-512 — the standard key-derivation function for TLS 1.3, QUIC, and modern protocols.
---

# `core.security::kdf` — HKDF key-derivation

## What is a KDF and why do we need one?

A **Key Derivation Function** (KDF) turns one secret into many
secrets. You have a "root" secret — maybe the output of a
Diffie-Hellman exchange, a master password, or a secret loaded from
HSM — and you need from it:

- an AEAD encryption key,
- a separate MAC key,
- an IV / nonce,
- application-specific sub-keys (one per session, one per tenant, …),

all cryptographically independent. You can't just split the root
secret: what if it's 128 bits but you need three 256-bit keys? What
if you need cryptographic independence between sub-keys so that
leaking one doesn't compromise the others?

A KDF solves exactly this. Give it:

1. some **input keying material** (IKM) — your root secret,
2. an optional **salt** — a non-secret string used to diversify,
3. a per-output **info** string — a domain-separation tag,
4. the **desired output length**.

It gives back cryptographically strong, independent-looking output
bytes. Different `info` values yield independent keys from the same
IKM; there is no way (given current cryptography) to recover IKM
from output or cross-predict one output from another.

## HKDF — the standard answer

There are several KDFs in the wild (PBKDF2, Argon2, scrypt, KDF1,
KDF2, X9.63). For most modern protocols the right answer is
**HKDF**, defined in [RFC 5869](https://datatracker.ietf.org/doc/html/rfc5869):

- Standardised.
- Built from HMAC, so its security reduces to the security of the
  underlying hash.
- Supports arbitrary output length.
- Used by TLS 1.3 key schedule, QUIC keying, Signal Protocol, modern
  OAuth token derivation, WireGuard, Noise framework, …

**PBKDF2 / Argon2 / scrypt are different animals** — they are
*password-based* KDFs designed to be slow. Use them for passwords,
not for session-key derivation. HKDF is for when you already have a
high-entropy IKM (DH shared secret, random bytes).

## Two-stage: Extract then Expand

HKDF works in two stages:

```
           ┌─────────────┐        ┌──────────────┐
  IKM  ───▶│   EXTRACT   ├──PRK──▶│    EXPAND    ├───▶ output bytes
  salt ───▶│  HMAC-based │        │  HMAC-based  │
           └─────────────┘        └──────────────┘
                                          ▲
                                    info  │
                                  length  │
```

**Extract** compresses potentially-weak input (IKM + salt) into a
uniformly-distributed *pseudorandom key* (PRK) of fixed size.

**Expand** takes the PRK and a context (`info`) and produces the
requested number of output bytes via a chain of HMACs.

You can combine them in one call (`hkdf_sha256(salt, ikm, info, len, out)`)
or use them separately when you want to reuse the PRK for several
different `info` contexts.

## API

```verum
mount core.security.kdf.hkdf.{
    HkdfError,
    // SHA-256 variant
    hkdf_extract_sha256, hkdf_expand_sha256, hkdf_sha256,
    MAX_EXPAND_OUTPUT_256,
    // SHA-384 variant
    hkdf_extract_sha384, hkdf_expand_sha384, hkdf_sha384,
    MAX_EXPAND_OUTPUT_384,
    // SHA-512 variant
    hkdf_extract_sha512, hkdf_expand_sha512, hkdf_sha512,
    MAX_EXPAND_OUTPUT_512,
};
```

### Extract — returns PRK of fixed size

```verum
public fn hkdf_extract_sha256(salt: &[Byte], ikm: &[Byte]) -> [Byte; 32];
public fn hkdf_extract_sha384(salt: &[Byte], ikm: &[Byte]) -> [Byte; 48];
public fn hkdf_extract_sha512(salt: &[Byte], ikm: &[Byte]) -> [Byte; 64];
```

- `salt = &[]` is treated per RFC 5869 §2.2 as a zero-filled string
  of hash-output length (32/48/64 bytes of 0x00). That's safe but
  unsalted HKDF is slightly weaker than salted; always pass a salt
  if you have one.

### Expand — any output length up to 255 × HashLen

```verum
public fn hkdf_expand_sha256(
    prk: &[Byte],     // must be ≥ 32 bytes (HashLen)
    info: &[Byte],    // domain-separation context (can be empty)
    length: Int,      // ≤ 255 * 32 = 8160
    out: &mut List<Byte>,
) -> Result<(), HkdfError>;

// hkdf_expand_sha384 — prk ≥ 48, length ≤ 255 * 48 = 12240
// hkdf_expand_sha512 — prk ≥ 64, length ≤ 255 * 64 = 16320
```

### Combined — Extract + Expand in one call

```verum
public fn hkdf_sha256(
    salt: &[Byte], ikm: &[Byte],
    info: &[Byte], length: Int,
    out: &mut List<Byte>,
) -> Result<(), HkdfError>;

// hkdf_sha384 / hkdf_sha512 — identical shape, different hash
```

### Errors

```verum
public type HkdfError is
    | OutputTooLong { requested: Int, limit: Int }
    | InvalidPrk { len: Int };
```

- `OutputTooLong` — you asked for more than 255 × HashLen bytes.
  Solution: use a wider hash (SHA-512: 16320 B) or two PRKs with
  different `info` values.
- `InvalidPrk` — the PRK you supplied to `expand` is shorter than
  HashLen. Only happens if you bypassed `extract`.

### Constants

```verum
MAX_EXPAND_OUTPUT_256  // 255 * 32 = 8160
MAX_EXPAND_OUTPUT_384  // 255 * 48 = 12240
MAX_EXPAND_OUTPUT_512  // 255 * 64 = 16320
```

## Quick start — deriving session keys from a shared secret

```verum
use core.security.kdf.hkdf.{hkdf_sha256};
use core.security.ecc.x25519.{X25519};

fn establish_session(my_sk: &X25519SecretKey, peer_pk: &X25519PublicKey)
    -> Result<SessionKeys, Error>
{
    // Step 1. Diffie-Hellman gives us a 32-byte shared secret (IKM).
    let shared = X25519.diffie_hellman(my_sk, peer_pk)?;

    // Step 2. Use HKDF to derive separate keys for encryption +
    //         authentication + a nonce salt, each keyed by a
    //         distinct `info` string for domain separation.
    let mut aead_key: List<Byte> = List.with_capacity(32);
    let mut mac_key:  List<Byte> = List.with_capacity(32);
    let mut nonce_iv: List<Byte> = List.with_capacity(12);

    // Salt: anything non-secret; session ID, handshake transcript,
    // protocol identifier — all work. Here we use a constant label.
    let salt = b"my-protocol-v1";

    hkdf_sha256(salt, &shared.as_slice(), b"aead key",
                32, &mut aead_key)?;
    hkdf_sha256(salt, &shared.as_slice(), b"mac key",
                32, &mut mac_key)?;
    hkdf_sha256(salt, &shared.as_slice(), b"nonce iv",
                12, &mut nonce_iv)?;

    Ok(SessionKeys { aead: aead_key, mac: mac_key, iv: nonce_iv })
}
```

The three `info` strings (`"aead key"`, `"mac key"`, `"nonce iv"`)
provide **domain separation** — even though all three keys derive
from the same shared secret, the HMAC chain in `expand` ensures they
are cryptographically independent.

## Extract + reuse PRK for several Expands

When you want several keys from the same IKM without re-running
`extract`:

```verum
fn derive_suite_of_keys(master: &[Byte]) -> Result<SessionKeys, HkdfError> {
    // Extract once.
    let prk = hkdf_extract_sha256(b"session-salt", master);

    // Expand many times with different info.
    let mut k1: List<Byte> = List.with_capacity(32);
    let mut k2: List<Byte> = List.with_capacity(32);
    let mut k3: List<Byte> = List.with_capacity(16);
    hkdf_expand_sha256(&prk, b"enc", 32, &mut k1)?;
    hkdf_expand_sha256(&prk, b"mac", 32, &mut k2)?;
    hkdf_expand_sha256(&prk, b"iv",  16, &mut k3)?;

    Ok(SessionKeys { enc: k1, mac: k2, iv: k3 })
}
```

This pattern is how TLS 1.3 derives its whole key schedule from a
single handshake-derived PRK.

## Algorithm — for professionals

### Extract (RFC 5869 §2.2)

```
PRK = HMAC-Hash(salt, IKM)
```

If `salt` is empty, use `HashLen` zero bytes as the salt. The output
is `HashLen` bytes long.

### Expand (RFC 5869 §2.3)

```
N = ceil(L / HashLen)
T(0) = empty string
T(i) = HMAC-Hash(PRK, T(i-1) || info || i)   # i is a single byte
OKM  = T(1) || T(2) || ... || T(N), truncated to L bytes
```

`i` is a one-byte counter starting at 1; `N ≤ 255` is what caps
output to `255 × HashLen` bytes.

The chain property (`T(i)` depends on `T(i-1)`) is what gives HKDF
its resistance to parallel-attack weakening.

### Why not just HMAC(PRK, info)?

Because that's a fixed 32-byte output, not arbitrary-length.
HKDF-Expand wraps HMAC in a counter-mode construction that lets you
request any length up to 255 × HashLen.

### Why chained T(i) instead of HMAC(PRK, info || i)?

The chain defeats a class of attacks where the attacker obtains an
early output and tries to use it to predict a later output. With
the chain, computing T(3) requires first computing T(1) and T(2);
there is no shortcut.

## Which variant should I use?

| Protocol you're implementing | Use |
|---|---|
| TLS 1.3 `TLS_AES_128_GCM_SHA256` | HKDF-SHA-256 |
| TLS 1.3 `TLS_AES_256_GCM_SHA384` | HKDF-SHA-384 |
| TLS 1.3 `TLS_CHACHA20_POLY1305_SHA256` | HKDF-SHA-256 |
| QUIC (inherits from negotiated TLS 1.3 cipher) | whichever TLS chose |
| Noise framework | HKDF-SHA-256 (default) or -SHA-512 (high-security) |
| Signal Protocol | HKDF-SHA-256 |
| Custom protocol, 128-bit security target | HKDF-SHA-256 |
| Custom protocol, 256-bit security target or PQ-ready | HKDF-SHA-512 |

For a new design, **HKDF-SHA-256 is almost always right**.
HKDF-SHA-512 doubles the output budget and provides a larger
security margin against future attacks but costs about 2× in
throughput.

## TLS 1.3 HKDF-Expand-Label

TLS 1.3 defines a layer on top of HKDF-Expand with a specific
`info` encoding:

```
HKDF-Expand-Label(Secret, Label, Context, Length) =
    HKDF-Expand(Secret, HkdfLabel, Length)

struct {
    uint16 length = Length;
    opaque label<7..255> = "tls13 " + Label;
    opaque context<0..255> = Context;
} HkdfLabel;
```

That `HkdfLabel` struct becomes the `info` parameter. The
`"tls13 "` prefix gives TLS 1.3 its own domain separation from
other protocols using the same HKDF.

Verum's stdlib provides HKDF at the primitive level; TLS 1.3's
`HKDF-Expand-Label` wrapper lives in `core.net.tls` because its
encoding is TLS-specific. QUIC's equivalent key derivation
(RFC 9001) reuses TLS 1.3's `HKDF-Expand-Label` verbatim.

## Performance

HKDF-Expand's cost is dominated by the HMAC calls in its chain:
one HMAC per `HashLen` bytes of output. With the pure-Verum HMAC
reference:

| Output size | HKDF-SHA-256 | HKDF-SHA-384 | HKDF-SHA-512 |
|---|---|---|---|
| 32 B | ~10 µs | ~13 µs | ~13 µs |
| 256 B | ~80 µs | ~100 µs | ~100 µs |
| 4 KiB | ~1.3 ms | ~1.6 ms | ~1.6 ms |

Accelerated (SHA-NI / AVX-512) — divide by ~10×.

## Test vectors — RFC 5869 §A

Spot check:

```
IKM  = 0x0b0b0b0b0b0b0b0b0b0b0b (11 * 0x0b)
salt = 0x000102030405060708090a0b0c
info = 0xf0f1f2f3f4f5f6f7f8f9
L    = 42
OKM  = 3cb25f25faacd57a90434f64d0362f2a 2d2d0a90cf1a5a4c5db02d56ecc4c5bf 34007208d5b887185865
```

VCS discharge: `vcs/specs/L1-core/security/hmac_hkdf.vr`
(shape) plus RFC-5869-driven runs under `L1-core/security/run/`.

## Security considerations

- **Salt reuse is OK** — unlike nonces, HKDF salts can (and
  typically should) be stable per-deployment. The common pattern
  is a protocol identifier like `"tls13 key"` or
  `"my-app-v1 session"`.

- **PRK reuse across domains is fine if `info` differs.** HKDF is
  specifically designed to let you extract once and expand many
  times.

- **IKM should have ≥ `HashLen` × 8 bits of entropy** to get full
  security from the underlying hash.

- **Truncating output is safe** — unlike a MAC tag, HKDF output can
  be used at any length up to its max without compromising security
  (the output bytes are cryptographically independent).

- **HKDF is NOT a password hash.** If your IKM is a user password
  (low entropy, 10-30 bits), use PBKDF2 / Argon2 / scrypt instead.
  HKDF assumes the IKM is high-entropy already.

## Common mistakes

1. **Using empty `info` everywhere.** Different use-cases for keys
   derived from the same IKM MUST have different `info` values.
   Otherwise you're deriving the same key for different purposes,
   which breaks domain separation.

2. **Using HKDF to hash passwords.** HKDF is not designed to be
   slow. Password hashing needs a memory-hard, tunable-cost function
   (Argon2id, scrypt).

3. **Requesting more than 255 × HashLen bytes.** This is a hard
   limit of the construction — the 1-byte counter in Expand. If you
   need more, use SHA-512 (16 KiB max), or extract twice with
   different salts.

4. **Passing the PRK as IKM to a second extract.** That's not how
   HKDF is designed. Instead, extract once, expand many times.

## File layout

| File | Role |
|---|---|
| `core/security/kdf/hkdf.vr` | HKDF-SHA-{256, 384, 512}, ~260 LOC |

## Related modules

- [`core.security.mac.hmac`](/docs/stdlib/security/mac) — the
  underlying PRF.
- [`core.security.hash`](/docs/stdlib/security/hash) — the hashes
  HMAC is keyed with.
- [`core.net.tls`](/docs/stdlib/net#tls) — consumes HKDF for the
  TLS 1.3 key schedule.

## `pbkdf2` — password-based KDF (RFC 8018 §5.2)

HKDF is the input-key-material stretcher for already-high-entropy
secrets (e.g. DH-derived shared secrets). PBKDF2 is the
iteration-based stretcher for **low-entropy inputs** — passwords.

```verum
mount core.security.kdf.pbkdf2.{
    pbkdf2_hmac_sha256, pbkdf2_hmac_sha384, pbkdf2_hmac_sha512,
};

let derived = pbkdf2_hmac_sha256(
    password_bytes, salt_bytes,
    600_000_u32,    // NIST SP 800-63B 2024 baseline
    32,             // output bytes
)?;
```

Output length capped at 1 MiB. Zero-iteration input rejected.
Three PRF widths matching the existing HMAC family — pick the
width that matches your downstream key length.

For the higher-level **password-hashing protocol** with PHC
modular-format strings, iteration-count floor, and
constant-time verify — see
[`password_hash`](/docs/stdlib/security/auth-primitives#password_hash--phc-modular-format).

## References

- [RFC 5869 — HMAC-based Key Derivation Function (HKDF)](https://datatracker.ietf.org/doc/html/rfc5869)
- [RFC 8018 §5.2 — PBKDF2](https://datatracker.ietf.org/doc/html/rfc8018#section-5.2)
- [NIST SP 800-56C Rev.2](https://doi.org/10.6028/NIST.SP.800-56Cr2) — Derivation of Keying Material
- [NIST SP 800-63B §5.1.1.2](https://pages.nist.gov/800-63-3/sp800-63b.html#memsecretver)
  — password-verifier iteration guidance (2024 revision recommends ≥ 600k for SHA-256).
- Krawczyk, "Cryptographic Extraction and Key Derivation" (2010) — HKDF security proof.
- [RFC 8446 §7.1](https://datatracker.ietf.org/doc/html/rfc8446#section-7.1) — TLS 1.3 `HKDF-Expand-Label`.
