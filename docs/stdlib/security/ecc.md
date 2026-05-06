---
sidebar_position: 7
title: ecc — elliptic-curve cryptography
description: Ed25519 signatures, X25519 ECDH, NIST P-256, ECVRF (RFC 9381), BLS12-381 pairing-friendly threshold signatures.
---

# `core.security.ecc` — elliptic-curve cryptography

Five primitives ship under one umbrella. All operations are
constant-time on every CPU; secret-data-dependent branches and
secret-indexed memory accesses are absent throughout the layer.

| Primitive | Curve | Use case |
|---|---|---|
| **`ed25519`** | Edwards25519 | Default modern signature scheme — SSH, Signal, WireGuard, modern TLS 1.3 certs, EdDSA JWTs. Small (32 B pk / 64 B sig), fast, deterministic. |
| **`x25519`** | Curve25519 (Montgomery) | Default ECDH primitive — TLS 1.3 / QUIC key exchange, X3DH-style triple-DH flows. Pairs with `pq.ml_kem` for the PQ-hybrid `X25519MLKEM768`. |
| **`p256`** | NIST P-256 (secp256r1) | FIPS-validated deployments, JWS ES256, TLS ECDSA suites. |
| **`vrf`** | Edwards25519 (ECVRF, RFC 9381) | Verifiable Random Function — leader election, sortition, lottery, NSEC5. Reuses the Ed25519 keypair. |
| **`bls12_381`** | BLS12-381 (pairing-friendly) | Threshold + multi-sig + aggregate signatures, ZK pairing back-end (Halo2 / KZG10). Adopted by Eth2 PoS, Drand, Filecoin, Zcash Sapling, Algorand compact certs, Chia. |

The X25519 deep-dive that follows historically anchored this page;
the VRF and BLS12-381 sections at the end document the newer
primitives.

---

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
mount core.security.ecc.x25519.{X25519, X25519Error};

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
mount core.security.kdf.hkdf.{hkdf_sha256};

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
| `core/security/ecc/ed25519.vr`   | Ed25519 signatures — surface + intrinsic dispatch |
| `core/security/ecc/p256.vr`      | NIST P-256 — surface + intrinsic dispatch |
| `core/security/ecc/x25519.vr`    | Curve25519 / X25519 — surface + intrinsic dispatch |
| `core/security/ecc/vrf.vr`       | ECVRF-EDWARDS25519-SHA512-TAI per RFC 9381 |
| `core/security/ecc/bls12_381.vr` | BLS12-381 group ops + pairing + IETF signatures + threshold |

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

---

## ECVRF — Verifiable Random Function (RFC 9381)

A VRF is a "verifiable" pseudo-random function: the secret-key
holder produces a unique output for any input plus a *proof* of
correctness; anyone with the public key can check the proof. The
output is unforgeable and pseudo-random even relative to the
public key.

### Where VRFs are used

* **Fair leader election** — block proposer selected by VRF over
  a round seed. Leadership is verifiable but unpredictable in
  advance.
* **Sortition** in stake-weighted committees (Algorand, drand).
* **Anti-enumeration in DNS** — NSEC5 uses VRF to hide the existence
  set of zone records.
* **Lottery / VRF-NFT distribution** — provably fair on-chain
  randomness.

### Ciphersuite

`ECVRF-EDWARDS25519-SHA512-TAI` (RFC 9381 §5.5) — Edwards25519
group + SHA-512 hash + try-and-increment hash-to-curve. Pinned as
the only suite at v0.1.

### Wire sizes

| Object | Size |
|--------|------|
| Secret key (= Ed25519 seed) | 32 B |
| Public key | 32 B |
| Proof π (Γ‖c‖s = 32+16+32) | 80 B |
| Output β (SHA-512 of canonical Γ encoding) | 64 B |

### Key reuse with Ed25519

The 32-byte sk **is** the Ed25519 seed bit-for-bit; the 32-byte
pk **is** the Ed25519 public key bit-for-bit. Domain separation
comes from the ECVRF suite tag (`0x03`) prefixed in every internal
hash, so a single account key serves both protocols without
cross-protocol forgery (RFC 9381 §3 endorses this dual use).

### API

```verum
mount core.security.ecc.vrf.{
    Ecvrf, VrfSecretKey, VrfPublicKey, VrfProof, VrfOutput,
    VrfProveResult, VrfError,
};

let sk = Ecvrf.generate_secret_key();
let pk = Ecvrf.public_key(&sk);

// Prove — deterministic; same (sk, alpha) → same (proof, β).
let alpha = b"synarc/proposer-election/v1/epoch=42/slot=137";
let r = Ecvrf.prove(&sk, alpha);
//  r.proof : VrfProof  (80 B)
//  r.output: VrfOutput (64 B — pseudo-random)

// Verify — strict-mode reject (s ≥ L, Γ off-curve, low-order pk)
// surfaces as typed VrfError.
let beta = Ecvrf.verify(&pk, alpha, &r.proof)?;
assert_eq(beta, r.output);

// Numeric draw in [0, modulus) — bias-free via rejection.
let leader_index: UInt64 = Ecvrf.output_to_int_below(&beta, validator_count);
```

### Determinism

Like Ed25519 signing, ECVRF prove is **fully deterministic**. No
fresh randomness at prove time. The deterministic nonce is derived
from `sk` and `alpha` via SHA-512 (RFC 9381 §5.4.2.2).

### References

* [RFC 9381 — Verifiable Random Functions (VRFs)](https://www.rfc-editor.org/rfc/rfc9381.html)
* IRTF CFRG draft history — `draft-irtf-cfrg-vrf-15` (rolled to RFC 9381 errata-clean).

---

## BLS12-381 — pairing-friendly threshold signatures

BLS12-381 is the pairing-friendly elliptic curve adopted by
modern protocols that need short signatures plus
threshold/aggregate composition: Eth2 PoS, Drand, Filecoin,
Zcash Sapling/Orchard, Algorand compact certificates, Chia.

### Curve summary

* Prime field 𝔽_p with p ≈ 2²⁸¹ (~128-bit classical security).
* G1: prime-order subgroup of E(𝔽_p) of order r ≈ 2²⁵⁵.
  Compressed point: **48 B**.
* G2: prime-order subgroup of E'(𝔽_p²) of same order r.
  Compressed point: **96 B**.
* GT: r-th roots of unity in 𝔽_p¹². Pairing target. **576 B** (12 × 48 B).
* Pairing e: G1 × G2 → GT (optimal-Ate, ~64-bit Miller loop).

### Two ciphersuites

```verum
public type BlsCipherSuite is
    | MinPk     // G1 pubkey (48 B), G2 sig (96 B) — Eth2 / Drand default
    | MinSig;   // G2 pubkey (96 B), G1 sig (48 B) — Filecoin StorageMarket
```

The IETF draft pins both. `MinPk` is canonical for threshold +
multi-sig validator BFT (every modern validator-set chain uses it).
`MinSig` is canonical where individual signatures dominate.

Mixing suites within an aggregate raises `BlsError.AggregateMismatch`
at runtime — the load-bearing rule that prevents most production
BLS bugs.

### API surface

```verum
mount core.security.ecc.bls12_381.{
    BlsCipherSuite, G1Point, G2Point, GTElement, Scalar,
    BlsSecretKey, BlsPublicKey, BlsSignature, BlsProofOfPossession,
    BlsError,
    pairing, multi_pairing,
    aggregate_signatures, aggregate_public_keys,
    aggregate_verify, fast_aggregate_verify,
    threshold_combine, ThresholdId, ThresholdShare,
};

// Key generation.
let sk = BlsSecretKey.generate();                       // CSPRNG
let pk = sk.public_key(BlsCipherSuite.MinPk);

// Sign + verify.
let sig = sk.sign(BlsCipherSuite.MinPk, b"message");
sig.verify(&pk, b"message")?;

// Multi-sig (everyone signs the same m). PoP required first.
let pop  = sk.prove_possession(BlsCipherSuite.MinPk);
pk.verify_possession(&pop)?;
let agg_sig = aggregate_signatures(&[sig1, sig2, sig3])?;
let agg_pk  = aggregate_public_keys(&[pk1, pk2, pk3])?;
fast_aggregate_verify(&[pk1, pk2, pk3], b"message", &agg_sig)?;

// Aggregate-verify (each signer has their own message).
aggregate_verify(&public_keys, &messages, &agg_sig)?;
```

### Threshold (t-of-n Shamir)

```verum
let share_sig = ThresholdShare.sign(
    &my_share_scalar,
    BlsCipherSuite.MinPk,
    ThresholdId { value: 7 },
    b"epoch-boundary-block-hash",
);

// Combine ≥ t shares into a full signature under the group public key.
// Lagrange interpolation in 𝔽_r over distinct share IDs.
let group_sig = threshold_combine(&shares, threshold)?;
```

### Hash-to-curve

`G1Point.hash_to_curve(msg, dst)` and `G2Point.hash_to_curve(msg, dst)`
implement RFC 9380 §8.8.{1,2}: SSWU + XMD:SHA-256. The DST tags are
pinned by `BlsCipherSuite.dst()` per IETF draft §4.2.3.

### Backend

Heavy operations route through `@intrinsic("verum.crypto.bls12_381_*")`
to the audited Supranational `blst` library — the same implementation
lineage that powers Eth2 consensus clients.

### References

* [draft-irtf-cfrg-bls-signature-05](https://datatracker.ietf.org/doc/draft-irtf-cfrg-bls-signature/) — IETF BLS Signatures
* [draft-irtf-cfrg-pairing-friendly-curves-11](https://datatracker.ietf.org/doc/draft-irtf-cfrg-pairing-friendly-curves/) — BLS12-381 parameter pinning
* [RFC 9380](https://www.rfc-editor.org/rfc/rfc9380.html) — Hashing to Elliptic Curves
* Bowe, "[BLS12-381: New zk-SNARK Elliptic Curve Construction](https://electriccoin.co/blog/new-snark-curve/)" (2017)
* Boneh, Drijvers, Neven, "[Compact Multi-Signatures for Smaller Blockchains](https://eprint.iacr.org/2018/483)" (2018) — anti-rogue-key trick
