---
sidebar_position: 9
title: util — constant-time ops, zeroise, RNG
description: Timing-safe comparisons, secret-wipe, and the platform CSPRNG. Small utilities that matter enormously.
---

# `core.security::util` — small utilities

Three primitives that every cryptographic program needs, in one
module. Each is tiny but essential — using the wrong alternative
(regular `==`, a debug-friendly clear, the userland RNG) is how
real-world crypto deployments get compromised.

## Why these three?

| Need | Naive alternative that fails | What to use |
|---|---|---|
| Compare a secret byte-slice to a user-supplied one | `==` | [`constant_time_eq`](#constant-time-equality) |
| Clear secret bytes from memory before drop | `= 0` / `memset` | `zeroise` (planned) |
| Generate cryptographically-random bytes | `rand::random`, `Math.random()` | `verum.rng.fill_secure` intrinsic |

The theme: each alternative looks right, runs in tests, but leaks
secrets in production when subjected to practical attacks.

---

## Constant-time equality

### The problem

Suppose you're verifying an HMAC tag attached to a request. The
naive check:

```verum
if received_tag == expected_tag {
    accept();
} else {
    reject();
}
```

On modern CPUs, `==` on byte slices short-circuits on the first
mismatch. The time this function takes is proportional to the
length of the matching prefix:

- 0 matching bytes → ~1 ns.
- 1 matching byte → ~2 ns.
- 2 matching bytes → ~3 ns.
- ...

An attacker measuring response time over many probes learns the
tag byte-by-byte, starting with the first byte and progressing.
A 32-byte MAC (256 bits of security) falls in roughly 32 × 256 = 8192
probes to a remote server — feasible to execute.

This attack is not theoretical. The [Xbox 360 signing-key
recovery](https://www.youtube.com/watch?v=9Jrht_UwA7o), the
[lucky-13 TLS attack](https://en.wikipedia.org/wiki/Lucky_Thirteen_attack),
the [timing attacks on OpenSSL ECDSA](https://eprint.iacr.org/2018/367)
— all use this same class of timing side-channel.

### The fix

`constant_time_eq(a, b)` runs for the same amount of time
regardless of where the first mismatch lies. The implementation:

```verum
pub fn constant_time_eq(a: &[Byte], b: &[Byte]) -> Bool {
    if a.len() != b.len() { return false; }
    let mut diff: UInt32 = 0;
    let mut i = 0;
    while i < a.len() {
        diff = diff | ((a[i] as UInt32) ^ (b[i] as UInt32));
        i = i + 1;
    }
    diff == 0
}
```

Key properties:

1. **No short-circuit.** The loop iterates `a.len()` times no matter
   what.
2. **XOR-accumulation into `diff`.** `diff` is `0` iff every byte
   matched. Reading `diff == 0` at the end is the single point
   where the result leaves the constant-time domain.
3. **Length check is NOT secret.** The attacker already knows the
   length of their probe (they submitted it), so returning early on
   a length mismatch doesn't leak anything they didn't already have.

### API

```verum
mount core.security.util.constant_time.{
    constant_time_eq,
    constant_time_compare,
};

/// Returns true iff the two slices have equal length AND every byte
/// matches. Runtime is O(n) regardless of input content.
@verify(constant_time)
public fn constant_time_eq(a: &[Byte], b: &[Byte]) -> Bool;

/// Three-way comparison (-1 / 0 / +1 like strcmp) — constant-time.
/// Used by MPI compare in big-integer crypto primitives.
@verify(constant_time)
public fn constant_time_compare(a: &[Byte], b: &[Byte]) -> Int;
```

The `@verify(constant_time)` attribute is a request to the codegen
backend to **reject** any optimisation that would re-introduce
data-dependent branches or memory accesses. Production builds with
this annotation enforce the constraint at compile time.

### When to use — every time you compare secrets

Always use `constant_time_eq` (never `==`) when:

- Verifying an HMAC / Poly1305 / HKDF output tag.
- Comparing an AEAD tag with a computed value (the AEAD's own
  `decrypt` does this internally; if you wrote your own combined
  crypto, you must too).
- Verifying an ECDSA / Ed25519 / ML-DSA signature's "integer
  components" against an expected pattern.
- Verifying passwords (though *password hashing* like Argon2 is
  more appropriate than HMAC for passwords).
- Checking certificate fingerprints.
- Comparing any cryptographic secret (session key, bearer token, …).

### When NOT to use

- For **non-secret data** — file paths, URLs, header names, protocol
  identifiers. `==` is fine and faster.
- For **length-prefix-validated** opaque blobs where the length is
  itself a secret — in that case first pad inputs to a common size,
  then compare.

### Quick example — signing a cookie

```verum
use core.security.mac.hmac.{hmac_sha256};
use core.security.util.constant_time.{constant_time_eq};

fn verify_cookie(key: &[Byte], payload: &[Byte], tag: &[Byte; 32]) -> Bool {
    let expected = hmac_sha256(key, payload);
    constant_time_eq(&expected, tag)    // ⚠ NOT `expected == *tag`
}
```

### Example — verifying an AEAD tag (done for you)

The high-level AEAD APIs (`Aes128Gcm.decrypt`,
`ChaCha20Poly1305.decrypt`) already use `constant_time_eq`
internally. You only need to call it if you're working below the
AEAD layer.

### Algorithm — why `diff == 0` is safe

The `diff == 0` check at the end produces a Bool from a 32-bit
integer. On most CPU architectures, `CMP` + `SETE` compile this to
a single non-branching instruction. On architectures where
the compiler might insert a conditional jump, the
`@verify(constant_time)` attribute causes the codegen to lower to
bit manipulation (`diff |= (diff >> 16); diff |= (diff >> 8); …`)
to stay branch-free.

---

## Secure random — `verum.rng.fill_secure`

Every cryptographic primitive in this library that needs randomness
calls the runtime intrinsic `verum.rng.fill_secure`. This is bound
per-platform:

- **Linux / Android** → `getrandom(2)` syscall.
- **macOS / iOS** → `arc4random_buf` (ChaCha20-backed CSPRNG).
- **Windows** → `BCryptGenRandom(BCRYPT_USE_SYSTEM_PREFERRED_RNG)`.
- **BSDs** → `getrandom(2)` or `arc4random_buf`.

These are the kernel/OS CSPRNGs, reseeded from hardware entropy
(RDRAND on x86, `arch_get_random_*` on ARM, PMU randomness, physical
interrupts). They satisfy the `NIST SP 800-90B` random bit generator
requirements.

### When you need random bytes

Most of the time, you don't — the high-level APIs handle it:

- `X25519.generate_secret_key()` — uses the CSPRNG.
- `ml_kem_keygen(variant)` — uses the CSPRNG.
- `ml_dsa_sign(...)` — uses the CSPRNG for hedged signing.

If you really need raw random bytes (e.g. generating a nonce for a
protocol the library doesn't directly support):

```verum
fn generate_nonce() -> [Byte; 12] {
    let filled = @intrinsic("verum.rng.fill_secure", 12);
    let mut nonce: [Byte; 12] = [0; 12];
    let mut i = 0;
    while i < 12 { nonce[i] = filled[i]; i = i + 1; }
    nonce
}
```

A stable wrapper `core.security.util.random.secure_random_bytes(n)`
is planned for the next iteration of this module.

### What NOT to use

**Do not** use `core.math.random` or any other userland PRNG for
cryptographic purposes. Those are deterministic, reproducible,
optimised for speed — perfect for simulation and tests, fatal for
crypto.

Rule of thumb: **if the output is ever going to be used as a key,
nonce, IV, salt, or signature randomness**, it must come from
`verum.rng.fill_secure`.

---

## Zeroise — clearing secrets from memory (planned)

### The problem

When a secret-carrying value (a private key, a session key, a
password) goes out of scope, the bytes remain in memory until
something else overwrites them. Paged memory may reach disk via
swap; core dumps may capture it; a post-mortem attacker (forensic
analysis of a seized device) can recover them.

Naive `buf = [0; 32]` doesn't help — a clever optimising compiler
sees that `buf` is never read again and deletes the clear entirely
as "dead store elimination". This has bitten cryptographic code in
every language — OpenSSL had to introduce `OPENSSL_cleanse`,
libsodium has `sodium_memzero`, Rust has the `zeroize` crate.

### The fix

A `zeroise` function that:

1. Writes zeros to memory.
2. Has a compiler-visible side effect preventing DSE.
3. Ideally uses a platform-specific syscall (`explicit_bzero`,
   `memset_s`, `SecureZeroMemory`) when available.

### Status

`zeroise` is planned for the P1 iteration of this module. The
tracking issue specifies:

```verum
public fn zeroise(buf: &mut [Byte]);
public fn zeroise_array<const N: Int>(buf: &mut [Byte; N]);
```

Until then, a manual pattern using `@intrinsic` is available:

```verum
fn manual_zeroise(buf: &mut [Byte; 32]) {
    // The intrinsic carries a compiler hint to prevent DSE.
    @intrinsic("verum.mem.zeroise", buf);
}
```

When the stable API lands, `manual_zeroise` will become a
one-line call to `zeroise`.

### Best practices — defence in depth

- **Short-lived secrets.** Keep keys in scope for as short a time
  as possible. Load from keystore immediately before use, zeroise
  after.
- **No debug-print.** Refuse to `Debug`-format secret types. A
  future `#[opaque_debug]` attribute will enforce this statically.
- **Hardware keystores.** For long-term keys, the ideal place is
  never in process memory at all — hardware security module (HSM),
  platform KMS, or a TPM-sealed blob decrypted only on use.
- **Avoid Drop-on-panic quirks.** A panic-on-drop can prevent the
  zeroise from running. Prefer [`ScopeGuard`](https://docs.verum-lang.org/docs/stdlib/runtime)
  patterns that zeroise on scope exit regardless.

---

## Relationship to other modules

- [`mac/hmac`](/docs/stdlib/security/mac) — the HMAC-SHA-2 family.
  Always verify tags with `constant_time_eq`.
- [`aead`](/docs/stdlib/security/aead) — AEAD decrypt already uses
  `constant_time_eq` internally.
- [`ecc/x25519`](/docs/stdlib/security/ecc) — relies on
  `verum.rng.fill_secure` for scalar generation.
- [`pq/ml_kem`](/docs/stdlib/security/pq) — ditto for keygen.

---

## File layout

| File | Role |
|---|---|
| `core/security/util/constant_time.vr` | Timing-safe compare + 3-way compare — ~120 LOC |
| `core/security/util/random.vr` | (planned) stable wrapper over `verum.rng.fill_secure` |
| `core/security/util/zeroise.vr` | (planned) memory-clearing with DSE prevention |

## References

- [NIST SP 800-90A](https://csrc.nist.gov/publications/detail/sp/800-90a/rev-1/final) — Random Bit Generator recommendations
- [RFC 4086](https://datatracker.ietf.org/doc/html/rfc4086) — Randomness Requirements for Security
- [Bernstein's timing-attack paper](http://cr.yp.to/antiforgery/cachetiming-20050414.pdf) — the canonical cache-timing attack on AES
- [`libsodium` design principles](https://libsodium.gitbook.io/doc/)
- [Rust `subtle` crate](https://docs.rs/subtle/) — similar constant-time primitives for the Rust ecosystem
