---
sidebar_position: 8
title: pq — post-quantum (ML-KEM, ML-DSA)
description: NIST FIPS 203 (ML-KEM / Kyber) and FIPS 204 (ML-DSA / Dilithium) — post-quantum key encapsulation and signatures.
---

# `core.security.pq` — post-quantum cryptography

## Why post-quantum now?

Classical public-key cryptography (RSA, ECDH, ECDSA) is secured by
the hardness of integer factorisation and discrete logarithm.
**Shor's algorithm**, running on a sufficiently large quantum
computer, solves both in polynomial time. No such quantum computer
exists today, but:

- "Record now, decrypt later" — an adversary recording today's TLS
  handshakes can decrypt them once a quantum computer arrives.
  Data with long confidentiality lifetime (health records, state
  secrets) is already at risk *today*.
- NIST finalised three PQ standards in August 2024. Browsers and
  major CDNs have deployed them in production:
  - Chrome 131+ (default X25519MLKEM768 — 2024-11-12).
  - Cloudflare — ~36% of HTTPS traffic as of early 2026.
  - Apple iMessage — PQ3 rollout 2024.

Verum ships both relevant NIST standards:

| Standard | Purpose | Role |
|---|---|---|
| **FIPS 203 — ML-KEM** (Module-Lattice KEM, né Kyber) | Key Encapsulation Mechanism | Classical ECDH replacement / hybrid |
| **FIPS 204 — ML-DSA** (Module-Lattice DSA, né Dilithium) | Digital Signature | Classical RSA / ECDSA replacement |

**FIPS 205 (SLH-DSA / SPHINCS+)** — a stateless hash-based
signature backup is not yet in Verum's stdlib; planned P2.

## When do I need PQ crypto?

Right now, for production TLS 1.3 and QUIC: use the **hybrid**
`X25519MLKEM768` for key exchange. This is what `core.net.tls`
negotiates by default (§6.11 of the net-framework spec).

Hybrid means: run X25519 AND ML-KEM-768 simultaneously, combine the
two shared secrets via HKDF. Secure as long as EITHER scheme holds —
belt-and-braces against both:

- A classical break of ML-KEM (the PQ scheme is newer, less-studied).
- A quantum break of X25519 (the long-term threat).

For signatures on certificates / software updates: the ecosystem is
still transitioning. ML-DSA is FIPS-approved but very few X.509
chains use it today (certificate compression / size is a deployment
obstacle). Use it for internal service-to-service auth where you
control both ends; defer for public PKI until CA ecosystem catches up.

## Architecture: intrinsic-backed

Both ML-KEM and ML-DSA ship as *declarations* that route to a
runtime `@intrinsic`. The actual lattice arithmetic lives in the
Verum runtime, currently bound to the **NIST reference
implementations** wrapped in constant-time discipline:

- `verum.pq.ml_kem_{keygen,encapsulate,decapsulate}`
- `verum.pq.ml_dsa_{keygen,sign,verify}`

The intrinsic indirection lets the runtime swap in accelerated
implementations (AVX-512 IFMA or ARMv9 SVE) without any change to
the `.vr` API.

A pure-Verum port is planned (P3) for audit / bootstrap / teaching
purposes but not for production — lattice code has subtle
correctness pitfalls and the community consolidates around one
reference implementation per scheme.

---

## ML-KEM — `core.security.pq.ml_kem`

### What is ML-KEM?

A **Key Encapsulation Mechanism** (KEM) is a two-message variant of
public-key encryption:

```
        Alice                          Bob
   ┌──────────────┐               ┌────────────────┐
   │ (pk_A, sk_A) │ ─── pk_A ───▶ │ encapsulate    │
   └──────────────┘               │   uses pk_A,   │
                                  │   produces     │
                                  │     (ct, ss)   │
                                  └────────┬───────┘
         ◀───────── ct ────────────────────┘
   ┌──────────────┐
   │ decapsulate  │
   │  uses sk_A,  │
   │  recovers ss │
   └──────────────┘
```

`ss` is the shared secret (32 bytes for ML-KEM). After one round of
PKs and one round of CTs, both sides have `ss`. Unlike ECDH, this
is asymmetric — only the holder of `sk_A` can decapsulate.

### Parameter sets

FIPS 203 §8 defines three parameter sets:

| Variant | NIST category | Security | PK | SK | CT | Use |
|---|---|---|---|---|---|---|
| ML-KEM-512 | Category 1 | ~128-bit | 800 B | 1632 B | 768 B | Size-constrained |
| ML-KEM-768 | Category 3 | ~192-bit | 1184 B | 2400 B | 1088 B | **Recommended default** (TLS) |
| ML-KEM-1024 | Category 5 | ~256-bit | 1568 B | 3168 B | 1568 B | High-security margin |

TLS 1.3 / QUIC hybrid `X25519MLKEM768` uses the middle variant
because it balances security margin against handshake bandwidth.

### API

```verum
mount core.security.pq.ml_kem.{
    MlKemVariant,       // MlKem512 | MlKem768 | MlKem1024
    PqError,
    MlKemKeyPair,
    MlKemEncapsulation,
    // Length constants
    ML_KEM_SHARED_SECRET_LEN,        // 32
    ML_KEM_512_PK_LEN,   ML_KEM_512_SK_LEN,   ML_KEM_512_CT_LEN,
    ML_KEM_768_PK_LEN,   ML_KEM_768_SK_LEN,   ML_KEM_768_CT_LEN,
    ML_KEM_1024_PK_LEN,  ML_KEM_1024_SK_LEN,  ML_KEM_1024_CT_LEN,
    // Operations
    ml_kem_keygen,
    ml_kem_encapsulate,
    ml_kem_decapsulate,
};

public type MlKemKeyPair is {
    variant: MlKemVariant,
    public_key: List<Byte>,    // length = variant.public_key_len()
    secret_key: List<Byte>,    // length = variant.secret_key_len()
};

public type MlKemEncapsulation is {
    variant: MlKemVariant,
    ciphertext: List<Byte>,    // length = variant.ciphertext_len()
    shared_secret: List<Byte>, // length = 32 always
};

public fn ml_kem_keygen(variant: MlKemVariant) -> Result<MlKemKeyPair, PqError>;
public fn ml_kem_encapsulate(variant: MlKemVariant, public_key: &[Byte]) -> Result<MlKemEncapsulation, PqError>;
public fn ml_kem_decapsulate(variant: MlKemVariant, secret_key: &[Byte], ciphertext: &[Byte]) -> Result<List<Byte>, PqError>;
```

Helper methods on the variant:

```verum
impl MlKemVariant {
    pub fn public_key_len(&self) -> Int;
    pub fn secret_key_len(&self) -> Int;
    pub fn ciphertext_len(&self) -> Int;
    pub fn shared_secret_len(&self) -> Int;   // always 32
}
```

### Errors

```verum
public type PqError is
    | InvalidKeyLength { expected: Int, actual: Int }
    | InvalidCiphertextLength { expected: Int, actual: Int }
    | RngFailed
    | BackendUnavailable
    | DecapsulationFailure;     // rare — only for malformed inputs
```

Note: in correct deployments **decapsulation never fails for a
genuinely-invalid ciphertext**. ML-KEM is IND-CCA2-secure via the
Fujisaki-Okamoto transform; an attacker's ciphertext produces a
deterministic "implicit-rejection" shared secret that the peer will
use, leading to a downstream authentication mismatch rather than
an observable error. This protects against chosen-ciphertext oracles.

### Quick start — full PQ-KEM round trip

```verum
mount core.security.pq.ml_kem.{
    MlKemVariant, ml_kem_keygen, ml_kem_encapsulate, ml_kem_decapsulate,
};

fn example() -> Result<(), Heap<Error>> {
    let v = MlKemVariant.MlKem768;

    // 1. Alice generates a keypair.
    let alice = ml_kem_keygen(v)?;

    // 2. Alice publishes alice.public_key; Bob fetches it.
    // … wire …

    // 3. Bob encapsulates against Alice's PK.
    //    He gets: a ciphertext to send, and a shared secret to keep.
    let bob_enc = ml_kem_encapsulate(v, &alice.public_key)?;
    let bob_shared = &bob_enc.shared_secret;
    // … send bob_enc.ciphertext to Alice …

    // 4. Alice decapsulates with her secret key.
    let alice_shared = ml_kem_decapsulate(v, &alice.secret_key, &bob_enc.ciphertext)?;

    // alice_shared == bob_shared
    assert_eq!(alice_shared.as_slice(), bob_shared.as_slice());
    Ok(())
}
```

### PQ-hybrid KEX with X25519

The canonical TLS 1.3 / QUIC pattern:

```verum
mount core.security.ecc.x25519.{X25519};
mount core.security.pq.ml_kem.{MlKemVariant, ml_kem_keygen, ml_kem_encapsulate};
mount core.security.kdf.hkdf.{hkdf_sha256};

// Client advertises BOTH a classical share and a PQ share.
let ecdh_sk = X25519.generate_secret_key();
let ecdh_pk = X25519.public_key(&ecdh_sk);
let pq_kp   = ml_kem_keygen(MlKemVariant.MlKem768)?;

// The client's `key_share` sent on the wire = ecdh_pk || pq_kp.public_key

// Server receives, encapsulates, sends back both shares:
let ecdh_ss = X25519.diffie_hellman(&server_ecdh_sk, &ecdh_pk)?;
let pq_enc  = ml_kem_encapsulate(MlKemVariant.MlKem768, &pq_kp.public_key)?;

// Combine: the "hybrid" shared secret is ecdh_ss || pq_ss, then HKDF'd.
let mut combined: List<Byte> = List.with_capacity(64);
for b in ecdh_ss.as_slice() { combined.push(*b); }
for b in pq_enc.shared_secret.as_slice() { combined.push(*b); }

let mut session_key: List<Byte> = List.with_capacity(32);
hkdf_sha256(b"x25519mlkem768", combined.as_slice(), b"session", 32, &mut session_key)?;
```

`core.net.tls` performs exactly this pattern automatically when
`X25519MLKEM768` is negotiated.

---

## ML-DSA — `core.security.pq.ml_dsa`

### What is ML-DSA?

A digital signature scheme. Alice signs a message with her secret
key; anyone holding her public key can verify the signature. Unlike
ECDH/ML-KEM (shared secret between two parties), signatures are
*public verifiability*.

### Parameter sets

FIPS 204 §3.6:

| Variant | NIST category | Security | PK | SK | Sig | Use |
|---|---|---|---|---|---|---|
| ML-DSA-44 | Category 2 | ~128-bit | 1312 B | 2560 B | 2420 B | Size-constrained |
| ML-DSA-65 | Category 3 | ~192-bit | 1952 B | 4032 B | 3309 B | **Recommended default** |
| ML-DSA-87 | Category 5 | ~256-bit | 2592 B | 4896 B | 4627 B | High-security margin |

Signatures are much larger than classical (ECDSA P-256 sig = 64
bytes). Certificate chains become noticeable bandwidth cost — this
is the main adoption blocker in public PKI today.

### API

```verum
mount core.security.pq.ml_dsa.{
    MlDsaVariant,       // MlDsa44 | MlDsa65 | MlDsa87
    MlDsaKeyPair,
    MlDsaSignature,
    // Constants
    ML_DSA_44_PK_LEN,   ML_DSA_44_SK_LEN,   ML_DSA_44_SIG_LEN,
    ML_DSA_65_PK_LEN,   ML_DSA_65_SK_LEN,   ML_DSA_65_SIG_LEN,
    ML_DSA_87_PK_LEN,   ML_DSA_87_SK_LEN,   ML_DSA_87_SIG_LEN,
    // Operations
    ml_dsa_keygen,
    ml_dsa_sign,
    ml_dsa_verify,
};

public type MlDsaKeyPair is {
    variant: MlDsaVariant,
    public_key: List<Byte>,
    secret_key: List<Byte>,
};

public type MlDsaSignature is {
    variant: MlDsaVariant,
    bytes: List<Byte>,
};

pub fn ml_dsa_keygen(variant: MlDsaVariant) -> Result<MlDsaKeyPair, PqError>;
pub fn ml_dsa_sign(variant: MlDsaVariant, secret_key: &[Byte], message: &[Byte])
    -> Result<MlDsaSignature, PqError>;
pub fn ml_dsa_verify(variant: MlDsaVariant, public_key: &[Byte],
                     message: &[Byte], signature: &[Byte]) -> Result<Bool, PqError>;
```

Note `ml_dsa_verify` returns `Result<Bool, PqError>`:

- `Ok(true)` — signature valid.
- `Ok(false)` — signature cleanly invalid.
- `Err(…)` — malformed input (wrong key/sig length, backend error).

### Quick example

```verum
mount core.security.pq.ml_dsa.{MlDsaVariant, ml_dsa_keygen, ml_dsa_sign, ml_dsa_verify};

fn example() -> Result<(), Heap<Error>> {
    let v = MlDsaVariant.MlDsa65;

    // Signer
    let kp = ml_dsa_keygen(v)?;
    let message = b"release binary sha256: ...";
    let sig = ml_dsa_sign(v, &kp.secret_key, message)?;

    // Verifier (separate party, already holds kp.public_key)
    let ok = ml_dsa_verify(v, &kp.public_key, message, &sig.bytes)?;
    assert_eq!(ok, true);
    Ok(())
}
```

### Hedged signing

FIPS 204 §6 defines both **deterministic** and **hedged**
signatures. Verum's `ml_dsa_sign` uses hedged signing: each
signature samples fresh randomness from the runtime CSPRNG,
combined with the message hash. This defends against fault-
injection attacks on deterministic signatures while retaining the
security properties of both modes.

---

## Security considerations

### Implicit rejection in ML-KEM

ML-KEM's `decapsulate` **never** returns a clean "invalid
ciphertext" error to a correctly-formed input of the right length.
An attacker who submits a garbage ciphertext gets back a
deterministic shared secret — specifically, `Hash(sk, ct)` — that
they cannot predict without sk.

This is the Fujisaki-Okamoto transform's key property: downstream
use of the "wrong" shared secret leads to authentication failures
far away from the decapsulation, giving the attacker nothing to
learn.

Your protocol must continue to use the returned shared secret and
let the normal AEAD authentication fail. **Do not** special-case
a "looks wrong" ciphertext by rejecting early — that leaks
information.

### Key storage

- ML-KEM secret keys are 1.6–3.2 KiB — not a single dense value like
  a 32-byte ECDH scalar. Store them carefully; do not swap pieces
  with other keys.
- ML-DSA secret keys are 2.5–4.9 KiB.
- Wipe memory on drop; prefer hardware keystores for long-term keys.

### Side channels

- Both schemes are implemented in the runtime with constant-time
  discipline. The lattice operations do not branch on secret bits.
- Polynomial multiplication (the hot path) uses number-theoretic
  transforms (NTT) that are natively constant-time.
- Zero tables indexed by secret bits.

### Hybrid with classical — recommended

Neither PQ scheme has had the decades of cryptanalytic scrutiny
that RSA / ECC have. The community consensus (NIST, IETF, Chrome,
Cloudflare, …) is to deploy **hybrids** for the foreseeable future.
Even if a break of ML-KEM is discovered, the classical X25519 leg
keeps the handshake secure.

`core.net.tls` negotiates the hybrid by default. Do not disable it
unless you specifically know you don't need it.

### Signature replay

ML-DSA provides *non-repudiation* of who signed a message but NOT
replay prevention. Always include a unique identifier (nonce,
timestamp, sequence number) in the signed message if replay is a
concern.

---

## Performance

### ML-KEM-768

| Operation | Reference runtime | Accelerated |
|---|---|---|
| keygen | ~50 µs | ~15 µs |
| encapsulate | ~60 µs | ~18 µs |
| decapsulate | ~70 µs | ~22 µs |

~5–20× slower than X25519 ECDH in wall-clock, but still
sub-millisecond.

### ML-DSA-65

| Operation | Reference runtime | Accelerated |
|---|---|---|
| keygen | ~150 µs | ~50 µs |
| sign (average) | ~400 µs | ~120 µs |
| verify | ~180 µs | ~55 µs |

Sign latency has high variance (up to several ms) because of
hedged signing's rejection-sampling loop. Amortises well over
large message volumes.

---

## Test vectors

The NIST ACVP test vectors cover both schemes comprehensively.
Verum's runtime is cross-validated against them:

- ML-KEM: [NIST KAT](https://csrc.nist.gov/projects/cryptographic-algorithm-validation-program/post-quantum-cryptography)
- ML-DSA: same URL

Verum's VCS spec-suite (planned under `vcs/specs/L1-core/security/run/`)
pins a set of vectors for regression testing across runtime
updates.

---

## File layout

| File | Role |
|---|---|
| `core/security/pq/ml_kem.vr` | ML-KEM-512/768/1024 — ~130 LOC |
| `core/security/pq/ml_dsa.vr` | ML-DSA-44/65/87 — ~120 LOC |
| `core/security/pq/mod.vr` | Public re-exports |

## Related modules

- [`core.security.ecc.x25519`](/docs/stdlib/security/ecc) — pair
  with ML-KEM for PQ-hybrid KEX.
- [`core.security.kdf.hkdf`](/docs/stdlib/security/kdf) — combine
  hybrid shared secrets via HKDF.
- [`core.net.tls`](/docs/stdlib/net/tls/) — negotiates
  `X25519MLKEM768` by default.

## References

- [NIST FIPS 203 — ML-KEM](https://doi.org/10.6028/NIST.FIPS.203)
- [NIST FIPS 204 — ML-DSA](https://doi.org/10.6028/NIST.FIPS.204)
- [NIST FIPS 205 — SLH-DSA](https://doi.org/10.6028/NIST.FIPS.205) (not yet in stdlib)
- [IETF draft-ietf-tls-hybrid-design](https://datatracker.ietf.org/doc/draft-ietf-tls-hybrid-design/) — TLS hybrid design
- [Cloudflare: The state of PQ in TLS](https://blog.cloudflare.com/pq-2024)
- Bernstein, Lange, "Post-quantum cryptography" (2017), *Nature*
