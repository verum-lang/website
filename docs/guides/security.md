---
sidebar_position: 6
title: Security
description: Building secure Verum programs — and what to watch for.
---

# Security

Verum's type system and verification pipeline eliminate entire classes
of vulnerabilities. This guide surveys the tools and the residual
risks.

## What Verum prevents by construction

| Class | Mechanism |
|---|---|
| Use-after-free | [CBGR](/docs/language/cbgr) generation checks |
| Double-free | CBGR tracks the current generation |
| Null dereference | No `null`; `Maybe<T>` forces handling |
| Buffer overflow | Bounds-checked indexing; refinement types proving in-range |
| Integer overflow | Explicit `checked_*` / `saturating_*` / `wrapping_*` APIs |
| Uninitialised-memory read | `MaybeUninit<T>` + escape check |
| Type confusion | Nominal types; explicit conversions |
| Data races | `Send` / `Sync` enforce thread-safety at compile time |
| SQL/HTML/shell injection | Tagged literals (`sql#`, `html#`, `sh#`) auto-escape |
| Deserialisation mismatch | Typed `@derive(Deserialize)` with refinements |
| Unvalidated user input | Refinement types force validation at boundaries |

## What still requires discipline

- **Cryptographic correctness** — use the vetted stdlib crypto
  primitives under [`core.security`](/docs/stdlib/security/overview):
  [`aead`](/docs/stdlib/security/aead) for authenticated encryption,
  [`ecc`](/docs/stdlib/security/ecc) for X25519, [`pq`](/docs/stdlib/security/pq)
  for ML-KEM / ML-DSA, [`kdf`](/docs/stdlib/security/kdf) for HKDF.
  Don't roll your own primitives — picking the wrong mode or
  truncating tags catastrophically weakens security.
- **Constant-time code** — the compiler doesn't guarantee side-
  channel resistance by default. The stdlib crypto primitives are
  constant-time by construction, and
  [`core.security.util.constant_time_eq`](/docs/stdlib/security/util)
  is mandatory for any secret-byte comparison. Don't branch on
  secret bytes in your own code.
- **Supply-chain trust** — see the [trust model](/docs/tooling/cog-packages#trust-model)
  for cog signatures and advisories.
- **Resource exhaustion** — DoS via memory, open FDs, task queues.
  Use bounded channels, semaphores, `nursery` limits.
- **Business-logic bugs** — verification proves *what you wrote*; if
  the spec is wrong, the proof doesn't help. Pair verified code with
  good tests.

## Practical checklist

### Inputs

- All external inputs parsed via typed `Deserialize` with refinement
  types or, for arbitrary shapes, `Data` + explicit validation.
- Regex in tagged form (`rx#"..."`) — compile-time-checked.
- SQL in tagged form (`sql#"..."`) — injection-safe.
- Shell commands via `Command.new(...).arg(...)` — never string-
  concatenate.
- HTML output via `html#"""..."""` — escape-by-default.

### Authentication / authorisation

- Sensitive operations require `using [Auth]` — no global auth.
- Use capability-restricted types: `Database with [Read]` for views
  that must not write.
- Label-track sensitive data with
  [`security.labels`](/docs/stdlib/security/labels):

  ```verum
  type SessionToken is Labeled<Text>;
  fn handle(req: Request) {
      let token = labeled(Label.Secret, extract_bearer(&req));
      // `token` cannot flow to Public sinks without explicit declassify.
  }
  ```

  See also [capabilities](/docs/stdlib/security/capabilities) for
  the `@cap(declassify)` audit trail on downgrades.

- Workload identity (K8s / multi-cluster / multi-cloud) —
  [`security.spiffe`](/docs/stdlib/security/spiffe) gives you
  SPIFFE-ID-based mTLS with automatic rotation.

### Secrets

- Never log `Labeled<T: Secret>` values (the stdlib logger refuses).
- For types holding key material, implement `Drop` to zero the
  buffer before release — see
  [`security.util.zeroise`](/docs/stdlib/security/util)
  (stable wrapper planned; use the `verum.mem.zeroise` intrinsic
  until then).
- Pull secrets from a dedicated store, not env vars: HashiCorp
  Vault, AWS Secrets Manager, or GCP Secret Manager via
  [`security.secrets`](/docs/stdlib/security/secrets).
- Environment variables over on-disk plaintext; container secrets
  over env vars where a store is not available.

### Crypto

- **Authenticated encryption** — use the AEAD layer:
  [AES-128/256-GCM or ChaCha20-Poly1305](/docs/stdlib/security/aead).
  Never raw AES / raw ChaCha20 — those lack authentication.
- **Signatures** — [ML-DSA (post-quantum)](/docs/stdlib/security/pq)
  for new work; Ed25519 (planned P1) when it lands; ECDSA-P256
  (planned P1) for legacy interop.
- **Key exchange** — [X25519](/docs/stdlib/security/ecc) paired
  with [ML-KEM-768](/docs/stdlib/security/pq) for PQ-hybrid is the
  TLS 1.3 / QUIC default.
- **KDFs** — [HKDF-SHA-256 / -SHA-384 / -SHA-512](/docs/stdlib/security/kdf)
  for key derivation from high-entropy IKM. Argon2id for password
  hashing (different module, planned).
- **MACs** — [HMAC-SHA-256](/docs/stdlib/security/mac) is the right
  default for cookie signing / token MACs. Always verify tags with
  `constant_time_eq`, never `==`.
- **Never** `unsafe`-cast between `[Byte; N]` and other types
  without zeroisation first.

### Network

- **TLS 1.3 only.** Verum's pure-Verum TLS stack at
  [`core.net.tls13`](/docs/stdlib/net/tls/) is 1.3-only by design;
  there is no `tls12_fallback` flag. Clients detect RFC 8446 §4.1.3
  downgrade sentinels (`"DOWNGRD\x01"` / `"DOWNGRD\x00"`) in
  `ServerHello.random` and abort with `ProtocolVersion`.
- Load the system trust store explicitly:
  `ClientOptions.with_system_trust()` (H3) or
  `QuicClientOptions.with_system_trust()` — both wrap
  `TrustStore.system()` with a deterministic fallback to an empty
  store on macOS / Windows backends that fail.
- Certificate pinning: construct a `TrustStore` from your pinned
  DER chains via `TrustStore.from_der(&[...])` and pass it as
  `opts.trust`.
- Hostname verification — on by default
  (`opts.verify_hostname = true`) via RFC 6125 §6.4 SAN matching.
  CN fallback is **not supported** (deprecated).
- [QUIC](/docs/stdlib/net/quic/) is anti-amplification limited to
  3× received bytes (§21.1) before path validation completes; no
  configuration required — the limit is enforced in `path.vr` and
  verified by V7.
- Rate-limit inbound: `Semaphore` for concurrent connections, leaky
  bucket for per-IP throughput.

### Concurrency

- Use `nursery` with `on_error: cancel_all` to bound task trees.
- Bounded channels (`bounded(N)`) to limit queue depth.
- Avoid mutable shared state; prefer message-passing.
- `@verify(static)` catches `Send` / `Sync` violations at compile time.

### FFI

- Every `extern "C"` block comes with a boundary contract
  (`requires`, `ensures`, `memory_effects`, `thread_safe`,
  `errors_via`, `@ownership`).
- Input pointers: validate non-null, bound-check length.
- Output pointers: zero before return if returning on error.
- Strings crossing the boundary: `Text.from_c_str` — validates UTF-8.

### Verification

- Safety-critical code: `@verify(thorough)`.
- Security-critical lemmas: `@verify(certified)` with a proof term.
- `@verify(certified)` in CI for any module touching crypto,
  auth, or raw memory.

## Auditing

```bash
verum audit                      # scan deps against advisory DB
verum analyze --context          # capability context surface per function
verum analyze --escape           # reference-tier distribution
verum analyze --refinement       # refinement / verification coverage
verum analyze --all              # everything in one pass
verum smt-stats                  # solver-routing stats from the last build
```

## Reporting vulnerabilities

Security issues in Verum itself: email `security@verum-lang.org`
with a PoC. The team follows a 90-day coordinated-disclosure policy.

## See also

- **[security stdlib](/docs/stdlib/security)** — labels, regions.
- **[Tooling → cog packages → trust](/docs/tooling/cog-packages#trust-model)** — supply-chain trust.
- **[Verification → thorough strategy](/docs/verification/smt-routing#verifythorough--verifyreliable--portfolio)** — solver cross-validation.
- **[FFI](/docs/language/ffi)** — boundary contracts.
