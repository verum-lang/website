---
sidebar_position: 1
title: security — overview
description: Verum's security primitives — cryptography, information-flow control, regions, capabilities, identity, secrets. Unified industrial-standard library.
---

# `core.security` — overview

The `core.security` subtree is Verum's consolidated security layer.
Everything every other module touches for authentication,
authorisation, confidentiality, integrity, or information-flow
control routes through it. There are no parallel crypto stacks,
nor shortcut FFI wrappers — the layer below TLS, QUIC, SPIFFE,
gRPC tokens, and application-level AEAD tokens is the **same code**.

## Design principles

### 1. Single horizontal layer, zero duplication

The guiding architectural decision: crypto primitives live once, in
`core.security`, and are consumed by every protocol. When a QUIC
packet needs AEAD, it calls the same `aead.chacha20_poly1305` that
TLS 1.3's record layer uses, and the same that the application
itself can use to seal a cookie.

If you find yourself wanting to wrap a different crypto library for
"just this one use case", it's a bug. Open an issue.

### 2. Refinement-typed keys and nonces

All key and nonce types are fixed-size byte arrays. `AesKey128` is
`[Byte; 16]`, `AesKey256` is `[Byte; 32]`, `ChaChaKey` is `[Byte; 32]`,
every AEAD nonce is `[Byte; 12]` (RFC 8446 / RFC 9001 convention).
Mis-sized keys or nonces are a **type error**, not a runtime
condition. Nonce-reuse bugs that haunt cipher APIs in other
ecosystems are made structurally harder to write.

### 3. Constant-time by construction — with hardware accel for perf

Every primitive in this layer is constant-time at the algorithm
level. Reference implementations use:

- no data-dependent branches on secret data;
- no memory accesses indexed by secret bytes (with the noted
  exception of AES, which uses S-box lookups — see
  [`cipher`](/docs/stdlib/security/cipher#side-channels));
- fixed-count iterations;
- constant-time comparisons via
  [`core.subtle.constant_time.constant_time_eq`](/docs/stdlib/subtle).

For production throughput, every hot path has a
`@cfg(feature = "crypto-accel")` substitution point that binds to
hardware primitives (AES-NI, VAES-512, SHA-NI, PCLMULQDQ, ARMv8
Crypto Extensions). Reference code remains available and is
differentially tested against the accelerated path via property
tests in `vcs/specs/L1-core/security/`.

### 4. Production-first, standards-aligned

Every primitive cites its authoritative standard in the module
header and matches its published test vectors bit-exact:

- FIPS 180-4 (SHA-2 family)
- FIPS 197 (AES)
- NIST SP 800-38D (AES-GCM)
- NIST FIPS 203 / 204 / 205 (ML-KEM / ML-DSA / SLH-DSA post-quantum)
- RFC 2104 (HMAC), 4231 (HMAC test vectors)
- RFC 5869 (HKDF)
- RFC 7748 (Curve25519 / X25519)
- RFC 8032 (Ed25519)
- RFC 8439 (ChaCha20-Poly1305)
- RFC 8446 (TLS 1.3), 9001 (QUIC), 9113 (HTTP/2)
- RFC 9381 (ECVRF — Verifiable Random Function)
- IETF draft-irtf-cfrg-bls-signature (BLS12-381 signatures + threshold aggregation)
- IETF draft-irtf-cfrg-pairing-friendly-curves (BLS12-381 parameter pinning)
- BLAKE3 specification (O'Connor / Aumasson / Neves / Wilcox-O'Hearn 2020)
- Halo2 specification (Zcash Foundation, builds on Bowe / Grigg / Hopwood 2019)
- Ben-Sasson et al. STARK + FRI (2018)

## Module map

The tree below maps to `core/security/` exactly — every filename
is linked to a dedicated documentation page.

```
# Digests, MACs, entropy and constant-time primitives are NOT here: they
# are computation over bytes, they depend on `core` alone, and they live
# below this module so that a Bloom filter can obtain a hash without
# depending on the crypto stack.
#
#   core/hash/    — checksum / fast / crypto / legacy   (see: stdlib/hash)
#   core/mac/     — HMAC, Poly1305                      (see: stdlib/mac)
#   core/random/  — secure vs deterministic             (see: stdlib/random)
#   core/subtle/  — constant-time compare, zeroization  (see: stdlib/subtle)
#
# What remains below is what genuinely reasons about trust.

core/security/
├── kdf/
│   └── hkdf.vr         — HKDF-{SHA-256, SHA-384, SHA-512}
├── cipher/
│   ├── aes.vr          — AES-128 / AES-256 block cipher
│   └── chacha20.vr     — ChaCha20 stream cipher
├── aead/
│   ├── aes_gcm.vr      — AES-128-GCM / AES-256-GCM AEAD
│   └── chacha20_poly1305.vr — ChaCha20-Poly1305 AEAD
├── ecc/
│   ├── ed25519.vr      — Ed25519 signatures (RFC 8032)
│   ├── p256.vr         — NIST P-256 (FIPS 186-4)
│   ├── x25519.vr       — Curve25519 ECDH (RFC 7748)
│   ├── vrf.vr          — ECVRF-EDWARDS25519-SHA512-TAI (RFC 9381)
│   └── bls12_381.vr    — BLS12-381 pairing curve, threshold + aggregate sigs
├── pq/
│   ├── ml_kem.vr       — ML-KEM-512/768/1024 (FIPS 203)
│   ├── ml_dsa.vr       — ML-DSA (FIPS 204)
│   └── sphincs_plus.vr — SLH-DSA / SPHINCS+ (FIPS 205) — 12 parameter sets
├── zk/
│   ├── halo2/          — Halo2 + KZG10 (Plonk-style over BLS12-381)
│   │   ├── circuit.vr  —   circuit DSL (Column / Selector / Gate / Lookup)
│   │   ├── srs.vr      —   universal SRS + ceremony
│   │   ├── prover.vr   —   precompute + prove + prove_with_aux
│   │   └── verifier.vr —   verify + verify_batch
│   └── stark/          — STARK + FRI (PQ-secure, transparent setup)
│       ├── air.vr      —   AIR DSL (Expr / TransitionConstraint / BoundaryConstraint)
│       ├── prover.vr   —   prove
│       └── verifier.vr —   AirVk + verify + verify_batch
├── spiffe/
│   ├── id.vr           — SPIFFE URI parsing
│   ├── svid.vr         — X.509-SVID + JWT-SVID types
│   └── workload_api.vr — SPIRE client
├── secrets/
│   ├── core_protocol.vr — Secrets-backend abstraction
│   ├── aws.vr          — AWS Secrets Manager
│   ├── gcp.vr          — GCP Secret Manager
│   └── vault.vr        — HashiCorp Vault
├── labels.vr           — Information-flow labels (IFC)
└── regions.vr          — Region-based isolation
```

## Documentation map

### Cryptographic primitives

- [**`kdf`**](/docs/stdlib/security/kdf) — HKDF (Extract/Expand)
- [**`cipher`**](/docs/stdlib/security/cipher) — AES, ChaCha20
- [**`aead`**](/docs/stdlib/security/aead) — AES-GCM, ChaCha20-Poly1305
- [**`ecc`**](/docs/stdlib/security/ecc) — Ed25519, P-256, X25519, ECVRF (RFC 9381), BLS12-381 (pairing + threshold sigs)
- [**`pq`**](/docs/stdlib/security/pq) — ML-KEM, ML-DSA, SPHINCS+ post-quantum
- [**`zk`**](/docs/stdlib/security/zk) — Halo2 + KZG10 (BLS12-381) and STARK + FRI (PQ-secure)

### Below this module — byte primitives, not security policy

- [**`core.hash`**](/docs/stdlib/hash) — digests grouped by guarantee: checksum / fast / crypto / legacy
- [**`core.mac`**](/docs/stdlib/mac) — HMAC-SHA-family + Poly1305
- [**`core.random`**](/docs/stdlib/random) — secure (CSPRNG) vs deterministic (reproducible)
- [**`core.subtle`**](/docs/stdlib/subtle) — constant-time comparison, zeroization

### Identity, secrets, policy

- [**`spiffe`**](/docs/stdlib/security/spiffe) — workload identity (SPIFFE/SPIRE)
- [**`secrets`**](/docs/stdlib/security/secrets) — cloud / Vault secrets backends
- [**`labels`**](/docs/stdlib/security/labels) — information-flow labels + lattice
- [**`regions`**](/docs/stdlib/security/regions) — region-based isolation
- [**`capabilities`**](/docs/stdlib/security/capabilities) — `@cap`, declassification

## TLS 1.3 / QUIC cipher-suite coverage

This matrix is the concrete justification of the "single horizontal
layer" claim. Every TLS 1.3 cipher-suite that QUIC negotiates
is implementable with modules from this subtree alone.

| Cipher-suite | Hash | KDF | AEAD | KEX |
|--------------|------|-----|------|-----|
| `TLS_AES_128_GCM_SHA256` | [`sha256`](/docs/stdlib/hash) | [`hkdf_sha256`](/docs/stdlib/security/kdf) | [`aes_gcm-128`](/docs/stdlib/security/aead) | [`x25519`](/docs/stdlib/security/ecc) |
| `TLS_AES_256_GCM_SHA384` | [`sha384`](/docs/stdlib/hash) | [`hkdf_sha384`](/docs/stdlib/security/kdf) | [`aes_gcm-256`](/docs/stdlib/security/aead) | [`x25519`](/docs/stdlib/security/ecc) |
| `TLS_CHACHA20_POLY1305_SHA256` | [`sha256`](/docs/stdlib/hash) | [`hkdf_sha256`](/docs/stdlib/security/kdf) | [`chacha20_poly1305`](/docs/stdlib/security/aead) | [`x25519`](/docs/stdlib/security/ecc) |
| `X25519MLKEM768` (PQ hybrid) | — | — | — | [`x25519`](/docs/stdlib/security/ecc) + [`ml_kem-768`](/docs/stdlib/security/pq) |

:::caution What this matrix claims, and what it does not

It claims the modules are **present and composable** — every cell links to
code that exists in this subtree. It does **not** claim every cell runs
today. Measured 2026-09-13: the `x25519` cell traps on both tiers (its
intrinsic has no registry entry), `ml_kem-768` likewise, and every hash, KDF
and AEAD cell is correct under the interpreter but faults under AOT. The
per-primitive status table below carries the measurement for each one; read
it before planning against a row here.

:::

## Threat model and what the layer does NOT cover

- **Endpoint compromise.** If the process has been compromised,
  nothing this library does prevents key theft. Use hardware-backed
  keystores for high-value keys (platform KMS, HSM via
  [`secrets`](/docs/stdlib/security/secrets)).

- **Physical side channels.** Power analysis, electromagnetic
  emanations, acoustic attacks are out of scope. If you need
  resistance against those, run your secrets inside a TEE (Intel
  SGX / TDX, AMD SEV-SNP, ARM CCA). The library's constant-time
  discipline protects against *timing* side channels only.

- **Cryptanalytic breaks.** When a primitive is broken, the
  library's mitigation is to flag deprecation via a compile-time
  warning in the next release and to provide a migration path.
  Downstream protocols with public configs (TLS 1.3 cipher-suite
  negotiation) remove the broken primitive from their defaults
  while leaving it available under an explicit opt-in flag.

- **Misuse of one-time keys.** Poly1305's security depends on the
  MAC key being used **exactly once**. The
  [`aead`](/docs/stdlib/security/aead) construction derives a fresh
  Poly1305 key from ChaCha20 for every message — follow the same
  pattern if you're building a bespoke scheme.

- **Weak RNG.** All randomness in this library comes from the
  platform CSPRNG (`getrandom(2)`, `arc4random_buf`,
  `BCryptGenRandom`). Do NOT supply your own "random" bytes
  unless they originate from an audited CSPRNG.

## Relationship to other Verum docs

- **[guides/security](/docs/guides/security)** — the high-level
  practitioner's guide: what Verum prevents by construction and
  what requires programmer discipline.
- **[language/cbgr](/docs/language/cbgr)** — memory safety.
- **[verification/contracts](/docs/verification/contracts)** —
  formal contracts on crypto functions (constant-time refinement,
  nonce-non-reuse invariants in progress).
- **[stdlib/net](/docs/stdlib/net)** — TLS 1.3 record layer,
  QUIC, HTTP/3 all consume the primitives here.

## Status and roadmap

| Primitive | Status | Notes |
|---|---|---|
| SHA-256, SHA-384, SHA-512 | ⚠️ Interpreter only | Pure Verum reference + `crypto-accel` hook. The digests are RIGHT — measured 2026-09-13, `abc` gives `ba7816bf…` (SHA-256) and `ddaf35a1…` (SHA-512) under the interpreter — and the AOT binary faults at `0x0` inside `Sha256.update` / `Sha512.update` before producing any output. The state's `buf: [Byte; N]` field is read through a runtime container classifier that has no arm for a packed buffer; tracked as A147. |
| SHA-1 (legacy) | ⚠️ Interpreter only | Same shape and the same fault: `abc` gives `a9993e36…` under the interpreter, `0x0` inside `Sha1.update` under AOT. Tracked as A147. |
| BLAKE3 | ⚠️ Interpreter only | Same shape and the same fault: `abc` gives `6437b3ac…` under the interpreter, `0x0` inside `Blake3.update` under AOT. Tracked as A147. |
| HMAC-SHA-{256,384,512} | ⚠️ Interpreter only | RFC 4231 vectors byte-exact under the interpreter. Measured 2026-09-13: `hmac_sha256` over a 4-byte key and `abc` answers with a fully non-zero 32-byte tag under the interpreter, and the AOT binary faults at `0xfffffff8ffc08200` inside `core.hash.crypto.sha256.compress_block` — an address far above the heap floor, i.e. array CONTENT used as a pointer, the same A147 root as the digests above. |
| HKDF-SHA-{256,384,512} | ⚠️ Interpreter only | RFC 5869 vectors byte-exact under the interpreter. Measured 2026-09-13: `hkdf_sha256` asking for 16 bytes returns 16 non-zero bytes under the interpreter, and the AOT binary faults at `0xfffffff8dddf4200` inside `core.hash.crypto.sha256.compress_block` — the same frame and the same A147 root as HMAC above. |
| AES-128 (block cipher) | ✅ Production | Reference + AES-NI / ARMv8 hook. Verified 2026-09-13 against the FIPS-197 C.1 vector at BOTH tiers, byte for byte: key `2b7e151628aed2a6abf7158809cf4f3c`, plaintext `3243f6a8885a308d313198a2e0370734`, ciphertext `3925841d02dc09fbdc118597196a0b32`. Checked against the published vector rather than against "it no longer crashes" — a resolved-but-wrong block cipher produces a zero tag and never crashes at all. |
| AES-256 (block cipher) | ✅ Production | Verified 2026-09-13 against the FIPS-197 C.3 vector at BOTH tiers, byte for byte: key `000102…1f`, plaintext `00112233445566778899aabbccddeeff`, ciphertext `8ea2b7ca516745bfeafc49904b496089`. Measured separately from AES-128 — the 60-word key schedule is its own code path and the 128-bit vector does not speak for it. |
| AES-GCM | ⚠️ Interpreter only | 12-byte IV path (TLS/QUIC). Correct under the interpreter: a 4-byte plaintext gives a 4-byte ciphertext and a 16-byte all-non-zero tag. Under AOT it still faults, but 2026-09-13 the fault MOVED: `Aes128Gcm.new` now completes (it used to die computing `H = E_K(0^128)` before any plaintext), and the failure is now inside `gcm_encrypt_common`, which takes the GHASH subkey `h: &[Byte; 16]` — a reference to a packed BYTE field. That is the half of A147 that is still open. |
| ChaCha20 | ⚠️ Interpreter only | RFC 8439. Correct under the interpreter — `chacha20_xor` over 8 zero bytes returns 8 non-zero keystream bytes — and the AOT binary faults at `0x7a385155bee7079f`. That address is the keystream itself used as a pointer: `chacha20_block` RETURNS a packed `[Byte; 64]`, and indexing it hits the same runtime container classifier described under the digests. Measured 2026-09-13 through both the low-level block function and the `chacha20_xor` API, which fault at the identical address. Tracked as A147. |
| Poly1305 | ⚠️ Interpreter only | 5 × 26-bit limbs. Correct under the interpreter — `poly1305_mac` returns a 16-byte all-non-zero tag — and the AOT binary faults at `0x0` inside `Poly1305.update`, the same shape as the digests: a `[Byte; N]` buffer field read through the runtime container classifier. Measured 2026-09-13. Tracked as A147. |
| ChaCha20-Poly1305 AEAD | ⚠️ Interpreter only | RFC 8439. Correct under the interpreter: a 4-byte plaintext gives a 4-byte ciphertext and a 16-byte all-non-zero tag. The AOT binary faults at `0x0` inside `chacha20_block` — both of this construction's halves are affected on their own (see the two rows above), and it dies in the cipher half first. Measured 2026-09-13. Tracked as A147. |
| X25519 | ❌ Not implemented | The scalar-mult intrinsic (`verum.x25519.scalar_mult`) has no registry entry, so the call traps on BOTH tiers: the interpreter panics with "is not implemented in this build" and the AOT binary exits on a trap. Measured 2026-09-13 with the RFC 7748 §6.1 secret key. |
| ML-KEM | ❌ Not implemented | FIPS 203 shape is declared, but `verum.pq.ml_kem_keygen` has no registry entry and `ml_kem_keygen` traps on BOTH tiers. Measured 2026-09-13 (ML-KEM-768). |
| ML-DSA | ❌ Not implemented | FIPS 204 shape is declared, but `verum.pq.ml_dsa_keygen` has no registry entry and `ml_dsa_keygen` traps on BOTH tiers. Measured 2026-09-13 (ML-DSA-65). |
| Ed25519 | 🟡 Planned P1 | Modern signatures |
| P-256 (ECDSA + ECDHE) | 🟡 Planned P1 | Legacy cert chains |
| RSA-PSS (verify-only) | 🟡 Planned P2 | Legacy cert chains |
| AES-GCM-SIV | 🟡 Planned P2 | Nonce-misuse-resistant |

## Citations

When citing this library in a paper or audit report, use:

```
Verum Security Library, core.security/*.vr,
Verum Language Platform, 2026.
```

Implementations align with:

- NIST FIPS 180-4 (Secure Hash Standard)
- NIST FIPS 197 (Advanced Encryption Standard)
- NIST FIPS 203 (Module-Lattice-Based Key-Encapsulation)
- NIST FIPS 204 (Module-Lattice-Based Digital Signature)
- NIST SP 800-38D (Galois/Counter Mode)
- IETF RFC 2104, 4231, 5869, 7748, 8439, 8446, 9001
