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
packet needs AEAD, it calls the same `aead::chacha20_poly1305` that
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
  [`util::constant_time_eq`](/docs/stdlib/security/util).

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
- NIST FIPS 203 / 204 (ML-KEM / ML-DSA post-quantum)
- RFC 2104 (HMAC), 4231 (HMAC test vectors)
- RFC 5869 (HKDF)
- RFC 7748 (Curve25519 / X25519)
- RFC 8439 (ChaCha20-Poly1305)
- RFC 8446 (TLS 1.3), 9001 (QUIC), 9113 (HTTP/2)

## Module map

The tree below maps to `core/security/` exactly — every filename
is linked to a dedicated documentation page.

```
core/security/
├── hash/
│   ├── sha256.vr       — SHA-256 (FIPS 180-4 §6.2)
│   ├── sha384.vr       — SHA-384 (FIPS 180-4 §6.5)
│   └── sha512.vr       — SHA-512 (FIPS 180-4 §6.4)
├── mac/
│   ├── hmac.vr         — HMAC-SHA-{256, 384, 512}
│   └── poly1305.vr     — Poly1305 one-time MAC
├── kdf/
│   └── hkdf.vr         — HKDF-{SHA-256, SHA-384, SHA-512}
├── cipher/
│   ├── aes.vr          — AES-128 / AES-256 block cipher
│   └── chacha20.vr     — ChaCha20 stream cipher
├── aead/
│   ├── aes_gcm.vr      — AES-128-GCM / AES-256-GCM AEAD
│   └── chacha20_poly1305.vr — ChaCha20-Poly1305 AEAD
├── ecc/
│   └── x25519.vr       — Curve25519 ECDH
├── pq/
│   ├── ml_kem.vr       — ML-KEM-512/768/1024 (FIPS 203)
│   └── ml_dsa.vr       — ML-DSA (FIPS 204)
├── util/
│   └── constant_time.vr — constant-time compare, zeroise
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

- [**`hash`**](/docs/stdlib/security/hash) — SHA-256, SHA-384, SHA-512
- [**`mac`**](/docs/stdlib/security/mac) — HMAC-SHA-family + Poly1305
- [**`kdf`**](/docs/stdlib/security/kdf) — HKDF (Extract/Expand)
- [**`cipher`**](/docs/stdlib/security/cipher) — AES, ChaCha20
- [**`aead`**](/docs/stdlib/security/aead) — AES-GCM, ChaCha20-Poly1305
- [**`ecc`**](/docs/stdlib/security/ecc) — X25519 ECDH
- [**`pq`**](/docs/stdlib/security/pq) — ML-KEM, ML-DSA post-quantum
- [**`util`**](/docs/stdlib/security/util) — constant-time ops, zeroise, RNG

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
| `TLS_AES_128_GCM_SHA256` | [`sha256`](/docs/stdlib/security/hash) | [`hkdf_sha256`](/docs/stdlib/security/kdf) | [`aes_gcm-128`](/docs/stdlib/security/aead) | [`x25519`](/docs/stdlib/security/ecc) |
| `TLS_AES_256_GCM_SHA384` | [`sha384`](/docs/stdlib/security/hash) | [`hkdf_sha384`](/docs/stdlib/security/kdf) | [`aes_gcm-256`](/docs/stdlib/security/aead) | [`x25519`](/docs/stdlib/security/ecc) |
| `TLS_CHACHA20_POLY1305_SHA256` | [`sha256`](/docs/stdlib/security/hash) | [`hkdf_sha256`](/docs/stdlib/security/kdf) | [`chacha20_poly1305`](/docs/stdlib/security/aead) | [`x25519`](/docs/stdlib/security/ecc) |
| `X25519MLKEM768` (PQ hybrid) | — | — | — | [`x25519`](/docs/stdlib/security/ecc) + [`ml_kem-768`](/docs/stdlib/security/pq) |

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
| SHA-256, SHA-384, SHA-512 | ✅ Production | Pure Verum reference + `crypto-accel` hook |
| HMAC-SHA-{256,384,512} | ✅ Production | RFC 4231 vectors byte-exact |
| HKDF-SHA-{256,384,512} | ✅ Production | RFC 5869 vectors byte-exact |
| AES-128, AES-256 | ✅ Production | Reference + AES-NI / ARMv8 hook |
| AES-GCM | ✅ Production | 12-byte IV path (TLS/QUIC) |
| ChaCha20 | ✅ Production | RFC 8439 |
| Poly1305 | ✅ Production | 5 × 26-bit limbs |
| ChaCha20-Poly1305 AEAD | ✅ Production | RFC 8439 |
| X25519 | ✅ Production | Intrinsic-backed scalar-mult |
| ML-KEM | ✅ Production | FIPS 203 via intrinsic |
| ML-DSA | ✅ Production | FIPS 204 via intrinsic |
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
