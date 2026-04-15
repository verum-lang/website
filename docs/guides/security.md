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

- **Cryptographic correctness** — use vetted cogs (`crypto.aead`,
  `crypto.sig`). Don't roll your own.
- **Constant-time code** — the compiler doesn't guarantee side-channel
  resistance by default. Use `@verify(ct)` attributes from the
  crypto cog.
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
- Shell commands via `Command::new(...).arg(...)` — never string-
  concatenate.
- HTML output via `html#"""..."""` — escape-by-default.

### Authentication / authorisation

- Sensitive operations require `using [Auth]` — no global auth.
- Use capability-restricted types: `Database with [Read]` for views
  that must not write.
- Label-track sensitive data with [`security::labels`](/docs/stdlib/security):

  ```verum
  type SessionToken is Labeled<Text>;
  fn handle(req: Request) {
      let token = labeled(Label.Secret, extract_bearer(&req));
      // `token` cannot flow to Public sinks without explicit declassify.
  }
  ```

### Secrets

- Never log `Labeled<T: Secret>` values (the stdlib logger refuses).
- Zeroise on drop: `@derive(Zeroize)` on types holding key material.
- Environment variables over on-disk plaintext; container secrets
  over env vars where possible.

### Crypto

- Prefer the `crypto` cog's high-level API over primitives.
- Authenticated encryption: AES-GCM / ChaCha20-Poly1305 via `crypto.aead`.
- Signatures: Ed25519 via `crypto.sig`.
- KDFs: Argon2id for passwords; HKDF for key derivation.
- Never `unsafe`-cast between `[Byte; N]` and other types without
  zeroisation.

### Network

- TLS everywhere by default. `TlsConfig::client()` loads system roots
  and enforces TLS 1.2+.
- Certificate pinning when appropriate: `TlsConfig::with_pinned(...)`.
- Validate `Host` header for virtual hosting — don't route on Host
  content without whitelisting.
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
- Strings crossing the boundary: `Text::from_c_str` — validates UTF-8.

### Verification

- Safety-critical code: `@verify(thorough)`.
- Security-critical lemmas: `@verify(certified)` with a proof term.
- `@verify(certified)` in CI for any module touching crypto,
  auth, or raw memory.

## Auditing

```bash
verum audit                     # scan deps against advisory DB
verum analyze --report capabilities   # what @cap does each function hold?
verum analyze --report cbgr           # reference tier distribution
verum analyze --report smt            # verification coverage
```

## Reporting vulnerabilities

Security issues in Verum itself: email `security@verum-lang.org`
with a PoC. The team follows a 90-day coordinated-disclosure policy.

## See also

- **[security stdlib](/docs/stdlib/security)** — labels, regions.
- **[Tooling → cog packages → trust](/docs/tooling/cog-packages#trust-model)** — supply-chain trust.
- **[Verification → thorough strategy](/docs/verification/smt-routing#verifythorough--verifyreliable--portfolio)** — solver cross-validation.
- **[FFI](/docs/language/ffi)** — boundary contracts.
