---
sidebar_position: 5
title: cipher — AES + ChaCha20
description: Block cipher (AES) and stream cipher (ChaCha20) primitives. Used internally by the AEAD constructions; rarely used directly.
---

# `core.security::cipher` — symmetric ciphers

## Two ciphers, both used through AEAD

Verum ships two symmetric ciphers, each of a different *family*:

- **AES** — a *block cipher*. Encrypts one fixed-size block
  (16 bytes) at a time. Block ciphers become useful encryption
  schemes only when wrapped in a *mode* (CTR, GCM, CBC, ECB, …).
- **ChaCha20** — a *stream cipher*. Produces a keystream that you
  XOR with plaintext. Naturally encrypts any length; no blocks, no
  padding.

In production Verum code you will almost never use these directly —
you'll use the [`aead`](/docs/stdlib/security/aead) layer, which
pairs each cipher with an authenticator and produces the complete
sealed/opened API that TLS 1.3 and QUIC need.

This module exists because:

1. The AEAD constructions need a clean, isolated, auditable cipher
   core. Separating the cipher from the authentication makes the
   audit trail cleaner.
2. Some protocols legitimately use raw ciphers — e.g. QUIC's
   **header protection** uses AES-ECB (single-block, no mode) to
   mask packet numbers. That's built from `aes.vr` directly,
   bypassing the AEAD layer.
3. Rarely, an application wants bespoke keystream-XOR usage
   (e.g. custom stream-based protocols).

If you want to encrypt application data, **skip this page and use
[`aead`](/docs/stdlib/security/aead).**

## Which cipher underneath?

The choice shows up only in the AEAD layer:

| AEAD | Underlying cipher | Best on |
|---|---|---|
| AES-128-GCM | AES-128 | x86_64 with AES-NI, ARMv8 with AES Crypto Ext |
| AES-256-GCM | AES-256 | same — higher security margin |
| ChaCha20-Poly1305 | ChaCha20 | hosts without AES hardware (mobile, embedded, older CPUs) |

Production advice:

- Prefer **AES-128-GCM** when hardware AES is available everywhere
  in your fleet.
- Prefer **ChaCha20-Poly1305** when you're deploying to diverse
  hardware, mobile devices, or when you want predictable
  constant-time behaviour in pure software.
- **AES-256-GCM** — use when you need 256-bit security margin
  (long-lived data, paranoid threat model). Slightly slower, same
  hardware support.

Most browsers prefer ChaCha20-Poly1305 on mobile and AES-GCM on
desktop. TLS 1.3 lets the server negotiate based on client
preferences.

---

## AES — `core.security.cipher.aes` {#aes}

### What is AES?

AES (Advanced Encryption Standard) is the world's most widely
deployed symmetric cipher. NIST FIPS 197, 2001. Block size 128 bits,
key sizes 128/192/256 bits. Verum supports 128 and 256 — AES-192 is
intentionally omitted because no modern protocol negotiates it.

AES alone is not an encryption scheme — it's a pseudorandom
permutation (PRP). You give it a 16-byte block + a key, it gives
back a 16-byte encrypted block. To encrypt longer data you combine
it with a **mode of operation** — CTR for AEAD, CBC for legacy,
ECB only for rare specialised uses (QUIC header protection).

### API

```verum
mount core.security.cipher.aes.{
    // Fixed constants
    BLOCK_SIZE,                  // 16
    AES128_KEY_SIZE,             // 16
    AES128_NR,                   // 10 — number of rounds
    AES128_NK,                   // 4  — key length in u32 words
    AES128_RK_WORDS,             // 44 — total round-key u32 words

    AES256_KEY_SIZE,             // 32
    AES256_NR,                   // 14
    AES256_NK,                   // 8
    AES256_RK_WORDS,             // 60

    // Typed keys and round-key state
    AesKey128,                   // [Byte; 16]
    AesKey256,                   // [Byte; 32]
    RoundKeys128,                // { w: [UInt32; 44] }
    RoundKeys256,                // { w: [UInt32; 60] }

    // Operations
    aes128_encrypt_block,
    aes256_encrypt_block,
};

impl RoundKeys128 {
    public fn expand(key: &AesKey128) -> RoundKeys128;
}

impl RoundKeys256 {
    public fn expand(key: &AesKey256) -> RoundKeys256;
}

public fn aes128_encrypt_block(rk: &RoundKeys128, block: &mut [Byte; 16]);
public fn aes256_encrypt_block(rk: &RoundKeys256, block: &mut [Byte; 16]);
```

### Concepts — round keys, SubBytes, ShiftRows, MixColumns

AES processes each 16-byte block through:

1. An **initial key addition** (XOR the block with round-key 0).
2. Some number of **full rounds** (9 for AES-128, 13 for AES-256),
   each consisting of:
   - **SubBytes** — substitute each byte via the fixed 256-entry
     S-box.
   - **ShiftRows** — rotate byte positions in the state matrix.
   - **MixColumns** — multiply each column by a fixed polynomial
     in GF(2^8). Diffuses every byte across a column.
   - **AddRoundKey** — XOR with the next round key.
3. A **final round** identical to the full round but without
   MixColumns.

The sequence of round keys (44 `UInt32` for AES-128, 60 for
AES-256) is expanded once from the cipher key via `RoundKeys*.expand`.
Storing them lets `encrypt_block` skip re-derivation — it's called
millions of times per TLS handshake.

### Quick example — encrypt one block

```verum
use core.security.cipher.aes.{AesKey128, RoundKeys128, aes128_encrypt_block};

fn encrypt_one_block() -> [Byte; 16] {
    // FIPS 197 Appendix C.1 — the canonical AES-128 test vector.
    let key: AesKey128 = [
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
        0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
    ];
    let rk = RoundKeys128.expand(&key);

    let mut block: [Byte; 16] = [
        0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77,
        0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
    ];
    aes128_encrypt_block(&rk, &mut block);

    // block == 69c4e0d86a7b0430d8cdb78070b4c55a (hex)
    block
}
```

### AES-256

```verum
use core.security.cipher.aes.{AesKey256, RoundKeys256, aes256_encrypt_block};

fn encrypt_one_block_256() -> [Byte; 16] {
    let key: AesKey256 = [
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
        0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
        0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17,
        0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f,
    ];
    let rk = RoundKeys256.expand(&key);
    let mut block: [Byte; 16] = [
        0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77,
        0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
    ];
    aes256_encrypt_block(&rk, &mut block);
    // block == 8ea2b7ca516745bfeafc49904b496089
    block
}
```

### Why no decrypt function?

For good reason. The AEAD modes this library supports (GCM) are
**counter-mode based** — they never need `aes_decrypt_block`
because decryption runs the same CTR keystream XOR'd with the
ciphertext. Every modern AEAD works this way; AES decrypt rounds
(InvSubBytes / InvShiftRows / InvMixColumns) are a relic from CBC
mode which we don't ship.

If you need AES decryption (for CBC legacy), raise an issue — it's
a 100-line extension but we decline to ship it by default because
it nudges people away from CBC toward AEAD.

### Why no AES-192?

AES-192 offers security between AES-128 and AES-256 at the cost of
an awkward key size (24 bytes) that is hardware-expensive and
protocol-rare. TLS 1.3 does not negotiate AES-192; QUIC does not;
nobody asks for it. Excluding it keeps the audit surface smaller.

### Algorithm deep-dive — for professionals

#### Key expansion (FIPS 197 §5.2)

For AES-128 (Nk = 4, Nr = 10, total `Nk × (Nr+1) = 44` u32 words):

```
W[0..Nk] = key[0..4] as u32 words, big-endian
for i in Nk..44:
    temp = W[i-1]
    if i mod Nk == 0:
        temp = SubWord(RotWord(temp)) XOR Rcon[i / Nk]
    W[i] = W[i - Nk] XOR temp
```

For AES-256 (Nk = 8, Nr = 14, total `4 * 15 = 60` words) the loop
also does `if i mod Nk == 4: temp = SubWord(temp)` to match the
spec — this extra SubWord every 4 words compensates for the longer
key schedule.

Verum's `RoundKeys*.expand` is a direct translation.

#### Round function (FIPS 197 §5.1)

Verum combines **SubBytes + ShiftRows** into a single indexed
S-box read (the shifted positions are known at code-emission time,
so we just read the right offset directly).

**MixColumns** is encoded as multiplication by the polynomial
`{03}x^3 + {01}x^2 + {01}x + {02}` in GF(2^8). The `xtime` helper
implements multiplication by `{02}` (shift-left with conditional
XOR of the reduction polynomial `{1b}`); `xtime(x) ^ x` gives `{03}x`.
The full column transform therefore needs only XOR + a handful of
xtime calls per byte.

#### Field arithmetic

GF(2^8) elements are represented as `Byte` (unsigned 8-bit). The
reduction polynomial for AES is `x^8 + x^4 + x^3 + x + 1` (= 0x11b
as a 9-bit value, which `xtime` applies implicitly). All arithmetic
is XOR-based except the conditional reduction, which is
branch-free via the MSB mask.

### Side channels

Verum's reference AES uses the standard 256-byte S-box. **This is
cache-timing susceptible on shared hardware** — an attacker
co-located on the same physical CPU can observe which S-box
cache-lines were accessed per encryption and recover key bytes
statistically.

For production, enable `@cfg(feature = "crypto-accel")` — this
substitutes `aes{128,256}_encrypt_block` and `RoundKeys*.expand`
with hardware primitives:

- **Intel AES-NI** — `aesenc`, `aesdec`, `aeskeygenassist`. Natively
  constant-time; single-cycle throughput on modern CPUs.
- **Intel VAES (AVX-512)** — parallel 4-way AES; ~4× faster than
  AES-NI scalar for bulk ops.
- **ARMv8 AES Crypto Extensions** — `aese`, `aesd`, `aesmc`, `aesimc`
  — equivalent guarantees on modern Apple Silicon, Neoverse, etc.

All of these execute in constant time by hardware design. The
reference is retained as the canonical "golden" implementation
against which accelerated paths are differentially tested via
property tests in `vcs/specs/L1-core/security/run/`.

### Performance

| Platform | Reference (pure Verum) | Accelerated |
|---|---|---|
| x86_64 Zen 4 + AES-NI | ~80 MiB/s | ~8 GiB/s |
| x86_64 Zen 4 + VAES-512 | ~80 MiB/s | ~20 GiB/s |
| ARMv8 Neoverse N1 + AES Ext | ~50 MiB/s | ~6 GiB/s |
| ARMv8 Apple M2 Ext | ~60 MiB/s | ~10 GiB/s |

For single-block operations (QUIC header protection, 8–12 blocks
per packet), even the reference is fine — the overhead is
negligible. For bulk (AEAD encrypting megabytes) the accelerated
path is mandatory on hot paths.

### Test vectors — FIPS 197 Appendix C

Spot checks pass byte-exact. See `vcs/specs/L1-core/security/aes_gcm.vr`
for surface tests and the KAT-driven runs in `run/`.

---

## ChaCha20 — `core.security.cipher.chacha20` {#chacha20}

### What is ChaCha20?

ChaCha20 is a stream cipher by Daniel J. Bernstein, standardised
in [RFC 8439](https://datatracker.ietf.org/doc/html/rfc8439).
Key features:

- 256-bit key, 96-bit nonce (IETF variant), 32-bit counter.
- Produces a 64-byte keystream block per (key, counter, nonce).
- Encryption = plaintext XOR keystream. Decryption is identical.
- **Naturally constant-time in software.** No tables, no
  data-dependent branches. Just ADD / XOR / ROT on 32-bit words.

Preferred choice for:

- Platforms without AES hardware (most mobile, some embedded, older
  x86).
- Situations where predictable constant-time matters.
- TLS 1.3's `TLS_CHACHA20_POLY1305_SHA256` cipher-suite.

### API

```verum
mount core.security.cipher.chacha20.{
    KEY_SIZE,       // 32
    NONCE_SIZE,     // 12
    BLOCK_SIZE,     // 64
    ChaChaKey,      // [Byte; 32]
    ChaChaNonce,    // [Byte; 12]
    chacha20_block,
    chacha20_xor,
};

public fn chacha20_block(
    key: &ChaChaKey,
    counter: UInt32,
    nonce: &ChaChaNonce,
) -> [Byte; 64];

public fn chacha20_xor(
    key: &ChaChaKey,
    initial_counter: UInt32,
    nonce: &ChaChaNonce,
    data: &[Byte],
    out: &mut List<Byte>,
);
```

### Quick example — raw keystream

```verum
use core.security.cipher.chacha20.{ChaChaKey, ChaChaNonce, chacha20_block};

fn derive_block() -> [Byte; 64] {
    let key: ChaChaKey = [0; 32];
    let nonce: ChaChaNonce = [0; 12];
    chacha20_block(&key, 1, &nonce)
}
```

### Quick example — encrypt a message

```verum
use core.security.cipher.chacha20.{ChaChaKey, ChaChaNonce, chacha20_xor};

fn encrypt(key: &ChaChaKey, nonce: &ChaChaNonce, pt: &[Byte]) -> List<Byte> {
    let mut ct = List.with_capacity(pt.len());
    chacha20_xor(key, 1, nonce, pt, &mut ct);   // counter=1 per RFC 8439
    ct
}

// decrypt is identical — XOR is its own inverse
let pt_again = encrypt(&key, &nonce, &ct);
```

### Counter starting value

- Counter **0** is reserved for deriving the one-time
  Poly1305 key in the ChaCha20-Poly1305 AEAD.
- Counter **1** is where body encryption begins.

If you're using raw ChaCha20 outside of the AEAD, start at
counter=0 if you need the full keystream; start at counter=1 if
you're following RFC 8439 conventions for interop.

### Algorithm — for professionals

#### The state matrix (RFC 8439 §2.3)

ChaCha20 operates on a 4×4 matrix of `UInt32`:

```
row 0:  c   c   c   c       constants "expand 32-byte k" in little-endian
row 1:  k0  k1  k2  k3      key words 0..4
row 2:  k4  k5  k6  k7      key words 4..8
row 3:  n0  n1  n2  n3      n0 = counter, n1..n3 = nonce
```

#### Quarter-round

```verum
quarter_round(a, b, c, d):
    a += b;  d ^= a;  d = d.rotate_left(16);
    c += d;  b ^= c;  b = b.rotate_left(12);
    a += b;  d ^= a;  d = d.rotate_left(8);
    c += d;  b ^= c;  b = b.rotate_left(7);
```

One round applies the quarter-round to:

- Four column-quartets: (0,4,8,12), (1,5,9,13), (2,6,10,14), (3,7,11,15).
- Four diagonal-quartets: (0,5,10,15), (1,6,11,12), (2,7,8,13), (3,4,9,14).

Total 20 rounds (= 10 column + 10 diagonal). After the rounds, add
the initial state back and serialise little-endian → 64 bytes.

#### Counter and nonce evolution

Per block, increment `counter` by 1 (wrapping; a deployment that
hits 2^32 blocks with the same nonce is protocol-broken). The
nonce stays fixed for the whole message.

### Performance

| Platform | Reference (pure Verum) | Accelerated |
|---|---|---|
| x86_64 AVX2 | ~300 MiB/s | ~2.5 GiB/s |
| x86_64 AVX-512 | ~300 MiB/s | ~5 GiB/s |
| ARMv8 NEON | ~250 MiB/s | ~2 GiB/s |

ChaCha20 vectorises naturally — 4 columns fit in SIMD registers
and process in parallel. The `@cfg(feature = "crypto-accel")`
substitution binds to the standard SSE3 / AVX2 / AVX-512 / NEON
implementations.

### Side channels

ChaCha20 is natively constant-time in software — no table lookups,
no branches on secrets. The reference implementation preserves this.
No special hardware is needed; even vectorised variants remain
constant-time.

### Test vectors — RFC 8439 §2.3.2

```
key   = 00010203040506070809...1f (32 bytes, ascending)
nonce = 000000090000004a00000000
counter = 1
block =
    10f1e7e4d13b5915500fdd1fa32071c4 c7d1f4c733c068030422aa9ac3d46c4e
    d2826446079faa0914c2d705d98b02a2 b5129cd1de164eb9cbd083e8a2503c4e
```

---

## File layout

| File | Role |
|---|---|
| `core/security/cipher/aes.vr` | AES-128 + AES-256 core — ~410 LOC |
| `core/security/cipher/chacha20.vr` | ChaCha20 block + XOR stream — ~205 LOC |

## Related modules

- [`core.security.aead.aes_gcm`](/docs/stdlib/security/aead#aes-gcm)
  — AES in GCM mode, with authentication.
- [`core.security.aead.chacha20_poly1305`](/docs/stdlib/security/aead#chacha20-poly1305)
  — ChaCha20 paired with Poly1305.
- [`core.security.mac.poly1305`](/docs/stdlib/security/mac#poly1305)
  — the one-time authenticator paired with ChaCha20 in the AEAD.

## References

- [NIST FIPS PUB 197](https://doi.org/10.6028/NIST.FIPS.197) — AES
- [RFC 8439 §2](https://datatracker.ietf.org/doc/html/rfc8439#section-2) — ChaCha20 specification
- Bernstein, ["ChaCha, a variant of Salsa20"](https://cr.yp.to/chacha.html) (2008)
- Daemen & Rijmen, *The Design of Rijndael* (2002) — the AES design book.
