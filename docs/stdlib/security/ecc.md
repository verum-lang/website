---
sidebar_position: 7
title: ecc — Curve25519 / X25519 ECDH
description: Elliptic-curve Diffie–Hellman over Curve25519. The classical half of every modern TLS 1.3 / QUIC key exchange and the PQ-hybrid `X25519MLKEM768`.
---

# `core.security::ecc` — elliptic-curve cryptography

## What is ECDH and why do we need it?

Two parties want to agree on a shared secret without ever sending it
over the wire. Classical solution: [Diffie–Hellman key
exchange](https://en.wikipedia.org/wiki/Diffie%E2%80%93Hellman_key_exchange).

```
Alice:                               Bob:
    a  ← random                        b  ← random
    A = g^a                            B = g^b
               ── A ──▶
               ◀── B ──
    S = B^a                            S = A^b
         Both end up with S = g^(ab)
```

An attacker watching the wire sees `A` and `B` but, to derive `S`,
needs to compute `a` from `g^a` (the **discrete-logarithm problem**,
believed hard).

The Diffie-Hellman construction works in any group where discrete
log is hard. **Elliptic-Curve Diffie-Hellman** (ECDH) uses a group
of points on an elliptic curve instead of integers modulo a prime —
smaller keys for the same security level (32 bytes vs ~400 bytes).

### Why Curve25519?

Daniel J. Bernstein designed Curve25519 in 2005 with a few brilliant
choices that make it the most widely-deployed ECC curve today:

1. **Equation:** `y^2 = x^3 + 486662 x^2 + x` over the prime field
   `2^255 - 19` (hence "25519").
2. **Montgomery form + Montgomery ladder** — the dominant algorithm
   structure naturally runs in constant time, branch-free. No
   special care needed to avoid timing side-channels.
3. **All scalars are valid** — no need to check that a random
   32-byte scalar falls in the valid range. Just clamp and go.
4. **No prime-order subgroup attacks** — small-subgroup points are
   exactly the "low-order points" that map to the all-zero shared
   secret, which the RFC 8446 / RFC 7748 recommend rejecting (which
   our library does automatically).
5. **Fast in software.** ~50–100× faster than P-256 or P-384
   without hardware acceleration. Good for mobile / embedded.

Adoption: TLS 1.3 default (RFC 8446), QUIC (RFC 9001), SSH, Signal,
Wireguard, WhatsApp, OpenSSH, Tor, Apple iMessage, Google Fi —
essentially every modern security protocol.

### Post-quantum context

Classical ECDH falls to Shor's algorithm on a quantum computer.
Today's PQ-hybrid solution in TLS 1.3 / QUIC is the **combined**
key exchange `X25519MLKEM768` (Chrome 131+, Cloudflare ~36% of
HTTPS, Apple iMessage): run X25519 AND ML-KEM-768 simultaneously,
then KDF both shared secrets together. The exchange is secure if
EITHER is secure — a belt-and-braces bet against both classical
breaks of ML-KEM and quantum breaks of ECDH.

Verum supports this out of the box: X25519 here + [`ml_kem`](/docs/stdlib/security/pq)
in the `pq` module. TLS 1.3 / QUIC handshake in `core.net.tls`
negotiates the hybrid by default.

---

## API

```verum
mount core.security.ecc.x25519.{
    // Types
    X25519SecretKey,        // [Byte; 32] — clamped scalar
    X25519PublicKey,        // [Byte; 32] — u-coordinate
    X25519SharedSecret,     // [Byte; 32] — result of DH
    X25519Error,
    // Sizes
    SCALAR_SIZE,            // 32
    POINT_SIZE,             // 32
    SHARED_SECRET_SIZE,     // 32
    BASE_POINT,             // [Byte; 32] — RFC 7748 basepoint (u=9)
    // Operations
    X25519,                 // namespace type
};

public type X25519Error is
    | AllZeroOutput         // peer sent a low-order point (attack!)
    | BackendNotReady;      // intrinsic backend missing (build error)

impl X25519 {
    pub fn generate_secret_key() -> X25519SecretKey;
    pub fn public_key(sk: &X25519SecretKey) -> X25519PublicKey;
    pub fn diffie_hellman(
        sk: &X25519SecretKey,
        peer_pk: &X25519PublicKey,
    ) -> Result<X25519SharedSecret, X25519Error>;
    pub fn secret_key_from_bytes(raw: &[Byte; 32]) -> X25519SecretKey;
}
```

All three 32-byte types are separate nominal types — you can't
accidentally pass a public key where a secret was expected
(compile-time error).

## Quick start — full ECDH exchange

### Setting up both ends

```verum
use core.security.ecc.x25519.{X25519, X25519Error};

// Alice (locally)
let alice_sk = X25519.generate_secret_key();
let alice_pk = X25519.public_key(&alice_sk);

// Bob (locally)
let bob_sk = X25519.generate_secret_key();
let bob_pk = X25519.public_key(&bob_sk);

// --- Wire exchange: Alice sends alice_pk to Bob, Bob sends bob_pk to Alice ---

// Alice computes the shared secret
let alice_shared = X25519.diffie_hellman(&alice_sk, &bob_pk)?;

// Bob computes the shared secret
let bob_shared = X25519.diffie_hellman(&bob_sk, &alice_pk)?;

// alice_shared == bob_shared
```

### Using the shared secret — always via HKDF

The raw shared secret is **not** safe to use directly as an AEAD
key. Always run it through HKDF to get uniformly-distributed
session keys:

```verum
use core.security.kdf.hkdf.{hkdf_sha256};

fn session_keys(shared: &X25519SharedSecret) -> Result<SessionKeys, _> {
    let mut aead_key: List<Byte> = List.with_capacity(32);
    hkdf_sha256(
        b"protocol-v1-salt",
        shared.as_slice(),
        b"aead key",
        32,
        &mut aead_key,
    )?;
    // ... derive mac_key, nonce_iv similarly ...
    Ok(SessionKeys { aead: aead_key, /* ... */ })
}
```

This is the basic form of the TLS 1.3 "early secret" → "handshake
secret" → "master secret" chain.

### Deterministic test vectors

For reproducible tests, supply a clamped-scalar directly:

```verum
let alice_sk: X25519SecretKey = X25519.secret_key_from_bytes(&[
    0x77, 0x07, 0x6d, 0x0a, 0x73, 0x18, 0xa5, 0x7d,
    0x3c, 0x16, 0xc1, 0x72, 0x51, 0xb2, 0x66, 0x45,
    0xdf, 0x4c, 0x2f, 0x87, 0xeb, 0xc0, 0x99, 0x2a,
    0xb1, 0x77, 0xfb, 0xa5, 0x1d, 0xb9, 0x2c, 0x2a,
]);
// secret_key_from_bytes applies clamping automatically
```

This is the `alice` scalar from RFC 7748 §6.1; pair with Bob's
scalar from the same RFC for deterministic round-trip tests.

---

## Algorithm details — for professionals

### Scalar clamping (RFC 7748 §5)

X25519 requires scalars to satisfy:

```
scalar[0]  &= 248     // clear bottom 3 bits
scalar[31] &= 127     // clear top bit
scalar[31] |=  64     // set second-highest bit
```

Effects:

1. The top bit is fixed → the Montgomery ladder's iteration count
   is constant regardless of secret scalar. Crucial for constant
   time.
2. Clearing the bottom 3 bits ensures the scalar is a multiple of
   the cofactor (8) → removes any contribution from the small-order
   twist component.
3. Setting bit 254 ensures scalars ≥ 2^254 → denies a class of
   attacks on weak scalars.

Our `secret_key_from_bytes` and `generate_secret_key` apply this
clamping automatically. Callers never see an unclamped scalar.

### Montgomery ladder (RFC 7748 §5)

The scalar multiplication `k * P` on a Montgomery curve uses the
**Montgomery ladder**:

```python
for each bit of k from msb to lsb:
    if bit == 0:  (X_1, X_2) = (ladder_double(X_1), ladder_add(X_1, X_2, base))
    else:         (X_1, X_2) = (ladder_add(X_1, X_2, base), ladder_double(X_2))
```

In practice, implementations use a **conditional swap** (`cswap`)
to unify both branches into a single constant-time code path. This
is what makes Curve25519 famously easy to implement safely.

Verum's reference routes the scalar-mult through an intrinsic
(`verum.x25519.scalar_mult`) that binds at link-time to:

- The **fiat-crypto** synthesised constant-time code (default).
  This is F\*-verified-at-compile-time C, same as BoringSSL /
  rustls / libsodium use. Machine-checked by Coq.
- Hardware variants (ARMv8.2 PACGA, RISC-V K extension, Intel
  AVX-512 IFMA) where they beat fiat-crypto on throughput.
- A Verum-native ref10 port — tracked as a future audit-hardening
  item. Differentially tested against the intrinsic via DST
  property tests.

### Base point

The RFC 7748 base point is `u = 9`. Computing `public_key(sk)` runs
the ladder on the base point:

```
public = X25519_scalar_mult(sk, BASE_POINT)
       = sk * G on Curve25519   # in Montgomery representation
```

`BASE_POINT` is exposed publicly as `[Byte; 32]` (little-endian
representation of 9) for anyone needing to do `sk * G`
explicitly — e.g. batch-verifying multiple public keys.

### All-zero output rejection

When the peer sends a "low-order point" (one of the 12 points of
small order on Curve25519), the shared secret `sk * peer_pk` is
**the all-zeros point**. This can happen:

- **Accidentally** — bad implementations generating garbage keys.
- **Maliciously** — in certain attack scenarios on TLS handshakes,
  `all-zero shared secret` lets the attacker force the session keys
  to a known value.

RFC 8446 §7.4.2 and RFC 7748 §6.1 both mandate rejecting all-zero
shared secrets. Verum's `diffie_hellman` does this automatically
and returns `Err(X25519Error.AllZeroOutput)`. Callers should treat
this error as a fatal handshake failure.

### Sizes and conversions

All three types are `[Byte; 32]` on the wire:

- **Secret key**: clamped scalar, little-endian bytes. Never
  reveal.
- **Public key**: u-coordinate (Montgomery-X) of `sk * G`. Safe to
  send in clear.
- **Shared secret**: u-coordinate of `sk * peer_pk`. Run through
  HKDF before use.

### Contributory property — why `AllZeroOutput` matters

RFC 7748 specifies that `X25519(k, u)` **is** the u-coordinate of
`k * u`. It does NOT specify whether this should be rejected for
"degenerate" u values. The RFC calls the choice
"contributory" vs. "non-contributory":

- **Contributory** (what TLS 1.3 / QUIC do): reject the all-zero
  output. Requires both parties to contribute non-trivially to the
  secret.
- **Non-contributory** (what Signal does): accept the all-zero
  output and derive further keys from it. This lets a participant
  unilaterally decide the shared secret.

We default to contributory because that's what TLS 1.3 needs. If
you need non-contributory (Signal, some X3DH variants), catch
`AllZeroOutput` and continue.

---

## Performance

| Platform | ECDH per second |
|---|---|
| x86_64 fiat-crypto ref | ~50,000/s |
| x86_64 AVX-512 IFMA | ~180,000/s |
| ARMv8 Apple M2 | ~100,000/s |
| ARMv8 Cortex-A53 (budget mobile) | ~8,000/s |

ECDH is done once per TLS handshake; these rates are more than
adequate for even very high-traffic servers.

---

## Security considerations

### What the library handles for you

- ✅ Scalar clamping (automatic in `generate_secret_key` and
  `secret_key_from_bytes`).
- ✅ Constant-time Montgomery ladder (via intrinsic backend).
- ✅ All-zero shared-secret rejection.
- ✅ Side-channel-resistant CSPRNG (via `verum.rng.fill_secure`
  intrinsic).

### What you must handle

- **Secret-key storage.** Clamped 32-byte scalars are as sensitive
  as long-term keys. Store in a secure keystore; zero memory on
  drop (see [`util`](/docs/stdlib/security/util) for `zeroise`).
- **Downstream KDF.** Never use the raw `X25519SharedSecret` as an
  AEAD key. Run it through HKDF with a protocol-specific salt and
  info context (see [`kdf`](/docs/stdlib/security/kdf)).
- **Replay prevention.** ECDH alone doesn't prevent replays. Pair
  with a nonce or sequence number.
- **Authentication.** Ephemeral-ephemeral ECDH gives perfect
  forward secrecy BUT no authentication. Combine with signatures
  (ML-DSA or, once shipped, Ed25519) if you need to know you're
  talking to the right peer.

### Low-order point attack in detail

If the peer sends:

- The identity point (`u = 0`),
- The `y`-coordinate of a 2-, 4-, or 8-torsion point, or
- One of 9 specific "small-order" u-coordinates listed in
  [Curve25519](https://cr.yp.to/ecdh.html),

then `sk * peer_pk` always equals the identity, regardless of your
secret key. That means the shared secret is identical for every
participant — the attacker knows what it is.

Our `diffie_hellman` computes the result, checks it against the
all-zeros pattern, and returns `AllZeroOutput` so the handshake
fails safely.

### Unauthenticated DH — the missing half

X25519 provides **confidentiality** (attacker can't learn the
shared secret) but NOT **authentication** (attacker could pretend
to be the peer with a man-in-the-middle). Real protocols pair
ECDH with:

- **Certificate-signed ephemeral keys** (TLS 1.3 with
  `CertificateVerify`).
- **Pre-shared identity keys** (Signal, Noise).
- **TOFU / fingerprint verification** (SSH known-hosts).

The `X25519` primitive alone is one layer of a larger authentication
stack. Don't use it bare unless both sides already have an
authenticated channel.

---

## Test vectors — RFC 7748 §6.1

```
alice_sk = 77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a
alice_pk = 8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a

bob_sk   = 5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb
bob_pk   = de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f

shared = 4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742
```

Our library produces bit-exact matches for these vectors. Full
validation in `vcs/specs/L1-core/security/x25519.vr` plus
intrinsic-level unit tests in the runtime crate.

---

## File layout

| File | Role |
|---|---|
| `core/security/ecc/x25519.vr` | Curve25519 / X25519 — ~215 LOC (surface + intrinsic dispatch) |

The actual Montgomery-ladder implementation lives in the runtime
behind `verum.x25519.scalar_mult`. Future work: ship a pure-Verum
ref10 port for bootstrap / audit purposes.

## Related modules

- [`core.security.pq.ml_kem`](/docs/stdlib/security/pq) — pair with
  X25519 for PQ-hybrid `X25519MLKEM768`.
- [`core.security.kdf.hkdf`](/docs/stdlib/security/kdf) — always
  post-process the shared secret through HKDF.
- [`core.security.util`](/docs/stdlib/security/util) — `zeroise`
  for clearing scalar memory; `constant_time_eq` if you compare
  public keys.
- [`core.net.tls`](/docs/stdlib/net/tls/) — consumes X25519 in the
  TLS 1.3 handshake key_share.

## References

- [RFC 7748 — Elliptic Curves for Security](https://datatracker.ietf.org/doc/html/rfc7748)
- [RFC 8446 §4.2.8](https://datatracker.ietf.org/doc/html/rfc8446#section-4.2.8) — TLS 1.3 key_share
- [RFC 9001](https://datatracker.ietf.org/doc/html/rfc9001) — QUIC
- Bernstein, [Curve25519: new Diffie-Hellman speed records](https://cr.yp.to/ecdh/curve25519-20060209.pdf) (2006)
- [The fiat-crypto project](https://github.com/mit-plv/fiat-crypto) — formally verified C source used under Verum's `@intrinsic` hook
- [NIST SP 800-186](https://doi.org/10.6028/NIST.SP.800-186) — Recommendations for Discrete Logarithm-based Cryptography
