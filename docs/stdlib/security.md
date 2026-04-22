---
sidebar_position: 2
title: security
description: The security stdlib — cryptographic primitives, information-flow control, workload identity, secrets, and regions.
---

# `core::security`

Verum's security stdlib is a consolidated subtree covering:

- **Cryptographic primitives** — hashes (SHA family + non-crypto
  CRC-32/32C/XXH64/MurmurHash3), MACs, KDFs (HKDF + PBKDF2),
  symmetric ciphers, AEADs, elliptic-curve / post-quantum public-
  key crypto, HPKE (RFC 9180).
- **High-level auth primitives** — JWT (RFC 7519/7515), COSE
  (RFC 9052), TOTP/HOTP (RFC 4226/6238), password hashing with
  PHC modular format, CSPRNG session/CSRF/OTP tokens.
- **Integrity + provenance** — Merkle trees (RFC 6962 CT-style),
  X.509 + RFC 6125 server-identity verifier.
- **Information-flow control** via typed labels.
- **Workload identity** (SPIFFE / SPIRE).
- **Secret stores** (HashiCorp Vault, AWS Secrets Manager, GCP
  Secret Manager).
- **Region-based isolation** — zero-overhead `&'r T` references.
- **Capability annotations** and declassification audit.

For the full map and architectural context, start at the
**[security overview](/docs/stdlib/security/overview)**.

## Quick links

### Cryptographic primitives

- [`hash`](/docs/stdlib/security/hash) — SHA-256/384/512, CRC-32/32C,
  XXH64, MurmurHash3 (32 + 128-bit)
- [`mac`](/docs/stdlib/security/mac) — HMAC-SHA-family + Poly1305
- [`kdf`](/docs/stdlib/security/kdf) — HKDF + PBKDF2 (HMAC-SHA256/384/512)
- [`cipher`](/docs/stdlib/security/cipher) — AES + ChaCha20
- [`aead`](/docs/stdlib/security/aead) — AES-GCM + ChaCha20-Poly1305
- [`ecc`](/docs/stdlib/security/ecc) — X25519 ECDH, Ed25519, P-256
- [`pq`](/docs/stdlib/security/pq) — ML-KEM + ML-DSA post-quantum
- `hpke` — RFC 9180 Hybrid Public Key Encryption (Mode Base:
  DHKEM-X25519 + HKDF-SHA256 + ChaCha20-Poly1305) — the primitive
  behind ECH, MLS, Privacy Pass
- [`util`](/docs/stdlib/security/util) — constant-time ops, zeroise, RNG

### Token / credential primitives

- `jwt` — JSON Web Tokens (RFC 7519 + 7515) with HS256/384/512
  and EdDSA; `alg:none` rejected, algorithm-confusion blocked by
  typed `JwtKey`, constant-time signature compare
- `cose` — CBOR Object Signing and Encryption (RFC 9052);
  Sign1 (EdDSA) + Mac0 (HS256/384/512) — the form behind WebAuthn
  passkeys, CWT, mDoc
- `otp` — HOTP (RFC 4226) + TOTP (RFC 6238); rejection-sampled
  uniform, ±window anti-drift verify, otpauth:// provisioning URI
- `password_hash` — PHC modular format with PBKDF2-HMAC-SHA256
  backend; 100k-iteration floor, constant-time verify
- `token` — CSPRNG-backed session/CSRF/OTP tokens (URL-safe
  base64, hex, numeric) with 128-bit entropy floor
- `merkle` — RFC 6962 CT-style Merkle tree; inclusion proofs with
  odd-leaf promotion (CVE-2012-2459-safe)

### Identity, secrets, policy

- [`spiffe`](/docs/stdlib/security/spiffe) — workload identity
- [`secrets`](/docs/stdlib/security/secrets) — Vault / AWS / GCP
- [`labels`](/docs/stdlib/security/labels) — IFC labels + lattice
- [`regions`](/docs/stdlib/security/regions) — region-based isolation
- [`capabilities`](/docs/stdlib/security/capabilities) — `@cap`, declassification

## Where to start

- **New to crypto?** Read the
  [overview](/docs/stdlib/security/overview) first for
  architectural context and threat model, then follow the quick-start
  in whichever primitive you need.
- **Building TLS / QUIC?** You'll use
  [`aead`](/docs/stdlib/security/aead),
  [`kdf`](/docs/stdlib/security/kdf),
  [`ecc`](/docs/stdlib/security/ecc), and
  [`pq`](/docs/stdlib/security/pq). Most TLS work happens inside
  [`core.net.tls`](/docs/stdlib/net), which consumes these as its
  underlying primitives.
- **Handling PII / regulated data?**
  [`labels`](/docs/stdlib/security/labels) shows how to mark
  sensitive data; [`capabilities`](/docs/stdlib/security/capabilities)
  covers the audit trail on declassification.
- **Running in Kubernetes?**
  [`spiffe`](/docs/stdlib/security/spiffe) gives you workload
  identity via SPIRE; [`secrets`](/docs/stdlib/security/secrets)
  hands you Vault / cloud secrets.

## Related guides

- [Security practitioner's guide](/docs/guides/security) — what
  Verum prevents by construction and what requires programmer
  discipline.
