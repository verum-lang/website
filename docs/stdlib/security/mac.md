---
sidebar_position: 3
title: mac — HMAC + Poly1305
description: Keyed message-authentication codes — HMAC-SHA-2 family and Poly1305 one-time authenticator.
---

# `core::security::mac` — message authentication

## What is a MAC and why do we need one?

A **Message Authentication Code** (MAC) is a fixed-size tag
computed from:

- a **message** (any bytes), and
- a **secret key** (shared between sender and receiver).

The tag proves two things to whoever holds the same key:

1. **Authenticity** — the message really came from someone with the key.
2. **Integrity** — the message wasn't changed in transit.

Without a MAC, an attacker who can modify bytes on the wire can
forge or tamper with messages. TLS, QUIC, HTTP cookies, API tokens,
software updates — all rely on MACs under the hood.

### MAC vs. hash vs. signature

Beginners often confuse these. The difference matters:

| Scheme | Secret? | Public verifier? | Use |
|---|---|---|---|
| Hash (SHA-256) | ❌ No key | Anyone can compute | Checksums, file identity |
| MAC (HMAC) | ✅ Shared secret | Only key-holders | TLS record integrity, cookies |
| Signature (Ed25519) | ✅ Private key (signer), public key (verifier) | Anyone with public key | Cert signatures, software signing |

Use a MAC when **both** sides share a secret. Use a signature when
**only the signer** should be able to produce tags.

### Two MACs ship here

Verum's stdlib ships two, each best at a different job:

- **[HMAC](#hmac)** — the general-purpose keyed hash. Built on top
  of SHA-2. Works with any key size, any message size. Used by
  TLS 1.3 HKDF, JWT HS256/384/512, cookie signing, basically
  everything.
- **[Poly1305](#poly1305)** — a **one-time** authenticator.
  Extremely fast, but the key can be used **exactly once**. Pair it
  with a stream cipher (ChaCha20) to get a complete AEAD. Used
  inside `chacha20_poly1305`.

If you're not sure which to pick: use **HMAC-SHA-256**. That's the
right answer 95% of the time.

---

## HMAC

### What is HMAC?

HMAC, defined in [RFC 2104](https://datatracker.ietf.org/doc/html/rfc2104),
is a construction that turns any hash function (SHA-256, SHA-384,
SHA-512, ...) into a MAC. It's the de-facto industry standard for
authenticating messages with a shared key.

The algorithm (for intuition):

```
HMAC(key, message) = H( (key XOR 0x5C...) || H( (key XOR 0x36...) || message ) )
```

where `H` is the underlying hash. The double-hashing with different
XOR padding defeats length-extension attacks that would otherwise
break a naive `H(key || message)` construction.

### API

Verum's `core.security.mac` ships three streaming HMAC types (one
per SHA-2 variant) plus three one-shot helpers:

```verum
mount core.security.mac.hmac.{
    HmacSha256, HmacSha384, HmacSha512,
    hmac_sha256, hmac_sha384, hmac_sha512,
};
```

#### Streaming — for large messages

```verum
public type HmacSha256 is { ... };

impl HmacSha256 {
    public fn new(key: &[Byte]) -> HmacSha256;
    public fn update(&mut self, data: &[Byte]);
    public fn finalize(self) -> [Byte; 32];
}

// HmacSha384 — finalize returns [Byte; 48]
// HmacSha512 — finalize returns [Byte; 64]
```

#### One-shot — convenience for small messages

```verum
public fn hmac_sha256(key: &[Byte], data: &[Byte]) -> [Byte; 32];
public fn hmac_sha384(key: &[Byte], data: &[Byte]) -> [Byte; 48];
public fn hmac_sha512(key: &[Byte], data: &[Byte]) -> [Byte; 64];
```

### Quick start — signing a cookie

```verum
use core.security.mac.hmac.{hmac_sha256};
use core.security.util.constant_time.{constant_time_eq};

const COOKIE_KEY: [Byte; 32] = /* loaded from secrets, NOT hard-coded */ ;

fn sign_cookie(payload: &[Byte]) -> (List<Byte>, [Byte; 32]) {
    let tag = hmac_sha256(&COOKIE_KEY, payload);
    (payload.to_vec(), tag)
}

fn verify_cookie(payload: &[Byte], tag: &[Byte; 32]) -> Bool {
    let expected = hmac_sha256(&COOKIE_KEY, payload);
    // ⚠ constant_time_eq, NOT `==`. See "Security" section below.
    constant_time_eq(&expected, tag)
}
```

### Streaming — for large messages

```verum
fn sign_large_file<R: Read>(reader: &mut R, key: &[Byte]) -> [Byte; 32] {
    let mut mac = HmacSha256.new(key);
    let mut buf: [Byte; 4096] = [0; 4096];
    loop {
        let n = reader.read(&mut buf).unwrap();
        if n == 0 { break; }
        mac.update(&buf[..n]);
    }
    mac.finalize()
}
```

### Which HMAC variant?

| You're implementing... | Use |
|---|---|
| TLS 1.3 AES-128-GCM-SHA256 handshake | HMAC-SHA-256 |
| TLS 1.3 AES-256-GCM-SHA384 handshake | HMAC-SHA-384 |
| JWT with HS256 | HMAC-SHA-256 |
| JWT with HS384 / HS512 | HMAC-SHA-384 / -SHA-512 |
| Generic API token | HMAC-SHA-256 (shortest tag still adequate) |
| Custom protocol, margin-for-future | HMAC-SHA-512 (long-term security margin) |

### Algorithm — for professionals

RFC 2104 §2. Given block size `B` (hash-dependent: 64 for SHA-256,
128 for SHA-384/512) and output size `L`:

```
1. If len(key) > B:   key' = H(key)         # pre-hash the key
   else if len(key) < B:  key' = key || 0x00...0   # zero-pad to B
   else:                 key' = key

2. ipad = 0x36...0x36 (B bytes)
   opad = 0x5C...0x5C (B bytes)

3. HMAC(key, msg) = H( (key' XOR opad) || H( (key' XOR ipad) || msg ) )
```

Verum's `HmacSha256.new` pre-computes `(key' XOR ipad)` and
pre-seeds the inner hash state at construction time, so `update`
calls feed directly into the inner compression — zero extra work
per byte vs. plain SHA-256.

### Test vectors — RFC 4231

All three variants pass every vector in
[RFC 4231](https://datatracker.ietf.org/doc/html/rfc4231). Spot check:

- key = `0x0b * 20`, data = `b"Hi There"`
- HMAC-SHA-256 = `b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7`
- HMAC-SHA-384 = `afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6`
- HMAC-SHA-512 = `87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854`

### Security considerations

- **Constant-time comparison mandatory.** Comparing tags with `==`
  opens a timing side-channel — the attacker can determine the tag
  byte-by-byte by measuring response time. Always use
  [`constant_time_eq`](/docs/stdlib/security/util).

- **Key length.** RFC 2104 recommends keys ≥ L (output size) bytes.
  Shorter keys work but reduce brute-force margin. Keys longer than
  B (block size) get pre-hashed to L bytes.

- **HMAC vs. `hash(key || msg)`.** The latter is broken for
  Merkle-Damgård hashes (SHA-2) because of length-extension.
  Never hand-roll a MAC. Use HMAC.

- **Constant-time hash underneath.** All three SHA-2 variants are
  natively constant-time (branch-free over input bytes). So HMAC
  inherits this property.

- **Algorithm agility.** Downstream protocols (TLS 1.3, JWT, etc.)
  negotiate the HMAC variant at runtime. Your code should accept
  whichever variant matches the negotiated cipher-suite.

### Common mistakes

1. **Using HMAC on untrusted data without verifying first.** If the
   payload parser crashes on malformed input, the tag check never
   runs. Always: parse length → verify tag → parse body.

2. **Reusing a key across protocols.** HMAC keys should be
   *domain-separated*: one key per protocol, derived via HKDF from a
   master key if needed.

3. **Truncating the tag.** Some protocols truncate HMAC-SHA-256 to
   16 bytes ("HMAC-SHA-256-128"). This weakens the security level
   from 128 bits to 64 bits (birthday bound). Don't truncate unless
   a spec explicitly requires it (TLS 1.3 for JWT JWS is fine; your
   ad-hoc protocol is not).

---

## Poly1305

### What is Poly1305?

Poly1305, defined in [RFC 8439](https://datatracker.ietf.org/doc/html/rfc8439),
is a **Wegman-Carter one-time authenticator**. It produces a 16-byte
tag from a 32-byte key and arbitrary-length message, and it is:

- **Very fast** — ~10× faster than HMAC-SHA-256 in software.
- **One-time** — the key must be used **exactly once**. Ever. Reusing
  a key lets the attacker recover it from two tags.

The "one-time" restriction sounds scary but is easy to satisfy: pair
Poly1305 with a stream cipher that derives a fresh key from a
(key, nonce) pair every message. That's exactly what the
ChaCha20-Poly1305 AEAD does — the Poly1305 key is the first 32
bytes of `ChaCha20(key, counter=0, nonce)`.

### When to use Poly1305 directly

Essentially never. Use the [`chacha20_poly1305`
AEAD](/docs/stdlib/security/aead) instead — it handles the
per-message key derivation for you and combines authentication with
encryption.

The `Poly1305` type is exposed publicly because:

- You might be implementing a **custom AEAD** that uses Poly1305
  differently (e.g. the inner layer of a nested authentication
  scheme, or a mod for academic research).
- You might be integrating a protocol (e.g. Wireguard's `mac1` /
  `mac2` fields) that uses Poly1305 directly with a transient key.

If neither applies: reach for `chacha20_poly1305` or HMAC.

### API

```verum
mount core.security.mac.poly1305.{
    Poly1305, Poly1305Key, Poly1305Tag,
    poly1305_mac,
    KEY_SIZE, TAG_SIZE,
};

public type Poly1305Key is [Byte; 32];
public type Poly1305Tag is [Byte; 16];

// Streaming
public type Poly1305 is { ... };
impl Poly1305 {
    public fn new(key: &Poly1305Key) -> Poly1305;
    public fn update(&mut self, data: &[Byte]);
    public fn finalize(self) -> Poly1305Tag;
}

// One-shot
public fn poly1305_mac(key: &Poly1305Key, data: &[Byte]) -> Poly1305Tag;
```

### Quick example

```verum
// ⚠ DO NOT use the same key twice with Poly1305!
// Real usage: derive `poly_key` via ChaCha20(master_key, counter=0, nonce).
let poly_key: Poly1305Key = derive_one_time_key();
let tag = poly1305_mac(&poly_key, message);
// ... receiver recomputes the same tag, compares with constant_time_eq ...
```

### Algorithm — for professionals

RFC 8439 §2.5. Operating in the prime field GF(2^130 − 5):

```
1. Split the 32-byte key into r (low 16 B) and s (high 16 B).
2. Clamp r: clear top 4 bits of bytes 3,7,11,15 and low 2 bits of 4,8,12.
3. Accumulator a = 0.
4. For each 16-byte block m of input (last block zero-padded with
   trailing 0x01 placed after the last content byte):
      a = (a + interpret_as_integer(m) + 2^128) * r   (mod p)
5. Tag = (a + s) mod 2^128    (serialise little-endian)
```

The `2^128` term in step 4 is the implicit "1" bit appended to every
full block; short final blocks get the bit placed explicitly inside
the padded block.

Verum's reference stores `a` as five 26-bit limbs in `UInt32`, does
multiplication with schoolbook lazy reduction into `UInt64`
intermediates, and propagates carry once per block. The final
reduction uses a constant-time conditional-subtract via a carry mask
(no secret-dependent branches).

`@cfg(feature = "crypto-accel")` substitutes the inner multiply with
AVX2 / NEON vectorised variants using lazy reduction — typical
throughput 2–4 GiB/s vs. ~100 MiB/s reference.

### Clamping rationale

Clamping `r` (masking certain bits to 0) is what makes Poly1305
information-theoretically one-time-secure. The clamp ensures that
the distribution of `r * (a + m + 2^128) mod p` across uniformly
random clamped `r` is almost-uniform — the standard Wegman-Carter
universal-hash bound applies.

Skipping or modifying the clamp **destroys the security argument**.
`Poly1305.new` clamps automatically — do not bypass it.

### Security considerations

- **One-time key, no exceptions.** Reusing the same `(r, s)` with
  two different messages lets the attacker recover `r` and forge
  arbitrary tags. The AEAD construction exists specifically to
  prevent this by deriving a fresh key per nonce.

- **Tag length is 16 bytes.** Do not truncate. 128-bit tag is the
  standard Poly1305 output; shorter tags lose security below the
  acceptable threshold.

- **Constant-time verification.** Same rule as HMAC — compare tags
  with [`constant_time_eq`](/docs/stdlib/security/util), not `==`.

- **Poly1305 is not a hash.** The `(r, s)` key is integral to
  security; unkeyed Poly1305 has no meaning.

### Test vectors — RFC 8439

Spot check (RFC 8439 §2.5.2):

```
r = 85:d6:be:78:57:55:6d:33:7f:44:52:fe:42:d5:06:a8:01:03:80:8a:fb:0d:b2:fd:4a:bf:f6:af:41:49:f5:1b
s = already embedded in the test; full 32-byte key:
key = 85d6be7857556d337f4452fe42d506a8 0103808afb0db2fd4abff6af4149f51b
data = "Cryptographic Forum Research Group"
tag  = a8:06:1d:c1:30:51:36:c6:c2:2b:8b:af:0c:01:27:a9
```

---

## File layout

| File | Role |
|---|---|
| `core/security/mac/hmac.vr` | HMAC-SHA-{256, 384, 512} — ~260 LOC |
| `core/security/mac/poly1305.vr` | Poly1305 — ~340 LOC |

## Related modules

- [`core.security.hash`](/docs/stdlib/security/hash) — the SHA-2
  primitive HMAC builds on.
- [`core.security.kdf.hkdf`](/docs/stdlib/security/kdf) — uses HMAC
  as its underlying PRF.
- [`core.security.aead`](/docs/stdlib/security/aead) — the
  ChaCha20-Poly1305 AEAD which is how Poly1305 is actually used in
  TLS / QUIC.
- [`core.security.util.constant_time`](/docs/stdlib/security/util) —
  constant-time tag comparison (mandatory).

## References

- [RFC 2104 — HMAC](https://datatracker.ietf.org/doc/html/rfc2104)
- [RFC 4231 — Identifiers and test vectors for HMAC-SHA-2](https://datatracker.ietf.org/doc/html/rfc4231)
- [RFC 8439 — ChaCha20-Poly1305 for IETF protocols](https://datatracker.ietf.org/doc/html/rfc8439)
- Bellare, Canetti, Krawczyk, "Keying Hash Functions for Message
  Authentication" (1996) — the HMAC security proof.
- Bernstein, "The Poly1305-AES message-authentication code" (2005).
