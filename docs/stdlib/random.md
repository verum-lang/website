---
sidebar_position: 9
title: random — secure vs deterministic
description: Two kinds of randomness under one name, so the choice is made once, deliberately, at the mount line.
---

# `core.random` — randomness, split by the guarantee it carries

Two kinds of randomness live here, and choosing the wrong one is a
silent, total failure: the output looks equally random in a test and in
a debugger. They sit side by side, under one name, so the choice is
made once, deliberately, at the `mount` line.

| module | guarantee | use for |
|---|---|---|
| `core.random.secure` | unpredictable to an adversary who has seen any amount of previous output | every secret-bearing draw: keys, nonces, IVs, salts, session tokens, key-share blinding, reset tokens |
| `core.random.deterministic` | a seed reproduces the whole stream exactly | Monte Carlo, simulation, property tests, shuffles, tensor initialisation |

## The choice rule

If an adversary must not predict the value, use `secure`. If a run must
be repeatable from a seed, use `deterministic`. Nothing needs both — a
draw that must be unpredictable can never be reproducible.

Speed is not a reason to reach for `deterministic`: the platform CSPRNG
costs one syscall amortised over a buffer, and every real protocol draws
far less randomness than it hashes.

Observing a few outputs of `deterministic` (PCG, XorShift128+,
SplitMix64) reveals its internal state, which is what makes it unusable
for anything secret — and exactly what makes it useful for a
reproducible simulation.

## `core.random.secure`

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

For the common case, `core.random.secure` exposes ergonomic
helpers built on top of the intrinsic:

```verum
mount core.random.secure;

let mut nonce: [Byte; 12] = [0; 12];
rng.fill_secure_array(&mut nonce);   // const-N form, no bounds check

let mut buf = List<Byte>.with_size(32);
rng.fill_secure(&mut buf);           // dynamic-size form
```

Use the `_array` form when the buffer length is known at compile
time (key, nonce, MAC tag); use `fill_secure` when it's dynamic.

### What NOT to use

**Do not** use `core.random.deterministic` or any other userland PRNG for
cryptographic purposes. Those are deterministic, reproducible,
optimised for speed — perfect for simulation and tests, fatal for
crypto.

Rule of thumb: **if the output is ever going to be used as a key,
nonce, IV, salt, or signature randomness**, it must come from
`verum.rng.fill_secure`.

### Failure is not silent

A request for secure randomness either succeeds or the process stops.
There is deliberately no PRNG fallback and no "best effort" path: a
caller asks for secure randomness because a key, nonce, salt or session
token depends on it, and a guessable answer is worse than no answer —
it fails silently, passes every test, and is found by an attacker
rather than by us.

## `core.random.deterministic`

Reproducible generators (PCG, XorShift128+, SplitMix64) and probability
distributions (uniform, normal, exponential), plus shuffling and
permutation utilities. Written in pure Verum; a `RandomKey` makes a
stream functional and parallelisable.

## See also

- [`core.subtle`](/docs/stdlib/subtle) — constant-time comparison and zeroization
- [`core.hash`](/docs/stdlib/hash) — digests, grouped by guarantee
