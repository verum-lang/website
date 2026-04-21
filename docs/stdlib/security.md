---
sidebar_position: 2
title: security
description: The security stdlib — cryptographic primitives, information-flow control, workload identity, secrets, and regions.
---

# `core::security`

Verum's security stdlib is a consolidated subtree covering:

- **Cryptographic primitives** — hashes, MACs, KDFs, symmetric
  ciphers, AEADs, elliptic-curve / post-quantum public-key crypto.
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

- [`hash`](/docs/stdlib/security/hash) — SHA-256 / SHA-384 / SHA-512
- [`mac`](/docs/stdlib/security/mac) — HMAC-SHA-family + Poly1305
- [`kdf`](/docs/stdlib/security/kdf) — HKDF
- [`cipher`](/docs/stdlib/security/cipher) — AES + ChaCha20
- [`aead`](/docs/stdlib/security/aead) — AES-GCM + ChaCha20-Poly1305
- [`ecc`](/docs/stdlib/security/ecc) — X25519 ECDH
- [`pq`](/docs/stdlib/security/pq) — ML-KEM + ML-DSA post-quantum
- [`util`](/docs/stdlib/security/util) — constant-time ops, zeroise, RNG

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
