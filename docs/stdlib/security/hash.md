---
sidebar_position: 2
title: hash — SHA-2 family
description: SHA-256, SHA-384, SHA-512 — FIPS 180-4 streaming digests.
---

# `core.security.hash` — SHA-2 family

The SHA-2 family of cryptographic hash functions, per **FIPS PUB
180-4**. Three variants ship:

| Variant | Block size | Output size | Typical use |
|---|---|---|---|
| SHA-256 | 64 B | 32 B | TLS 1.3 HKDF default, most signatures, checksums |
| SHA-384 | 128 B | 48 B | `TLS_AES_256_GCM_SHA384` suite, ML-DSA-65 |
| SHA-512 | 128 B | 64 B | Ed25519 internal hash, HKDF-SHA512, wide-output variants |

All three use the same compression-function core (64-bit words for
SHA-384/512, 32-bit words for SHA-256), natively constant-time,
with a `@cfg(feature = "crypto-accel")` substitution point that
binds to SHA-NI (x86_64) or ARMv8 SHA-2 Crypto Extensions.

## API surface

### Type + constructors

```verum
mount core.security.hash.sha256.{Sha256, BLOCK_SIZE, OUTPUT_SIZE};
mount core.security.hash.sha384.{Sha384};
mount core.security.hash.sha512.{Sha512};

// Streaming state
let mut s: Sha256 = Sha256.new();

// One-shot
let digest: [Byte; 32] = Sha256.digest(data);
```

### Streaming operations

```verum
impl Sha256 {
    public fn new() -> Sha256;
    public fn update(&mut self, data: &[Byte]);
    public fn finalize(self) -> [Byte; 32];
    public fn digest(data: &[Byte]) -> [Byte; 32];      // one-shot
}

// Sha384 — identical shape, `finalize` returns [Byte; 48]
// Sha512 — identical shape, `finalize` returns [Byte; 64]
```

### Size constants

```verum
core.security.hash.sha256.BLOCK_SIZE   // 64
core.security.hash.sha256.OUTPUT_SIZE  // 32

core.security.hash.sha384.BLOCK_SIZE   // 128 (inherited from SHA-512)
core.security.hash.sha384.OUTPUT_SIZE  // 48

core.security.hash.sha512.BLOCK_SIZE   // 128
core.security.hash.sha512.OUTPUT_SIZE  // 64
```

### Low-level compression primitive (SHA-512)

Exposed for SHA-384, SHA-512/256, and any other SHA-512-based scheme
that shares the compression function:

```verum
public fn compress_block(
    h: &mut [UInt64; 8],
    block: &[Byte; 128],
);
```

## Basic usage

### One-shot hash

```verum
mount core.security.hash.sha256.{Sha256};

fn example_one_shot() {
    let data = b"The quick brown fox jumps over the lazy dog";
    let digest: [Byte; 32] = Sha256.digest(data);
    // digest == d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592
}
```

### Streaming (for large inputs)

```verum
fn hash_file<R: Read>(reader: &mut R) -> Result<[Byte; 32], IoError> {
    let mut s = Sha256.new();
    let mut buf: [Byte; 8192] = [0; 8192];
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 { break; }
        s.update(&buf[..n]);
    }
    Ok(s.finalize())
}
```

### SHA-512 for wider outputs

```verum
mount core.security.hash.sha512.{Sha512};

fn pbkdf2_wide_key(password: &[Byte], salt: &[Byte]) -> [Byte; 64] {
    // Suppose you want a 512-bit key for deriving two 256-bit sub-keys.
    Sha512.digest(&concat(password, salt))
}
```

## Algorithm details

### SHA-256 (FIPS 180-4 §6.2)

- Processes 512-bit (64-byte) blocks.
- 64 rounds per block.
- Eight 32-bit working registers (H[0..8]).
- Big-endian serialisation for the final digest.
- Initial H values — first 32 bits of fractional parts of square
  roots of the first 8 primes (2..19).
- Round constants K[0..64] — first 32 bits of fractional parts of
  cube roots of the first 64 primes.

### SHA-512 (FIPS 180-4 §6.4)

- Processes 1024-bit (128-byte) blocks.
- 80 rounds per block.
- Eight 64-bit working registers.
- 128-bit length field in the padding (carry-propagation across
  `length_hi` + `length_lo` in the stream state).

### SHA-384 (FIPS 180-4 §5.3.4)

Identical compression to SHA-512, differing only in:

- The initial H values (FIPS §5.3.4, taken from fractional parts of
  square roots of primes 23..53).
- The final output is truncated to H[0..6] (384 bits = 48 bytes).

The `sha384.vr` implementation therefore consists of ~180 lines —
most of it stream-boilerplate identical in shape to SHA-512 — and
reuses `sha512.compress_block` directly.

## Test vectors

All three variants pass the FIPS 180-4 Appendix example vectors and
the NIST CAVP short-message KAT.

| Input | SHA-256 output (hex) |
|---|---|
| `""` (empty) | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `"abc"` | `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad` |
| `"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"` | `248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1` |

| Input | SHA-384 output (hex) |
|---|---|
| `""` | `38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b` |
| `"abc"` | `cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7` |

| Input | SHA-512 output (hex) |
|---|---|
| `""` | `cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e` |
| `"abc"` | `ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f` |

VCS discharge: `vcs/specs/L1-core/security/sha2_kat.vr` (shape) and
CAVP-driven runs under `L1-core/security/run/` (byte-exact).

## Performance

Reference throughput (pure Verum, no acceleration):

| Platform | SHA-256 | SHA-384/512 |
|---|---|---|
| x86_64 (Zen 4, 4.5 GHz) | ~300 MB/s | ~200 MB/s |
| ARM Neoverse N1 | ~200 MB/s | ~150 MB/s |

Accelerated (`@cfg(feature = "crypto-accel")`):

| Platform | SHA-256 | SHA-384/512 |
|---|---|---|
| x86_64 with SHA-NI | ~3 GB/s | — (no HW accel in SHA-NI) |
| x86_64 with AVX-512 | ~2.5 GB/s | ~2 GB/s |
| ARMv8 FEAT_SHA2 | ~4 GB/s | ~2 GB/s |

Use streaming `update` for inputs that don't fit comfortably in
memory; the one-shot `digest` convenience allocates zero extra
buffers beyond the input slice.

## Side-channel notes

- **Timing safety.** The reference implementation is branch-free
  over input bytes: the round loop has a fixed iteration count,
  and no table lookups are indexed by secret data (all bit-ops and
  fixed-index H[] / K[] accesses).

- **Length-extension.** SHA-256 and SHA-512 are Merkle-Damgård
  hashes and thus vulnerable to length-extension attacks if used
  directly as a keyed MAC (`hash(key || message)`). This is NOT a
  defect of the hash — it's a protocol error. For authentication,
  always use [`core.security.mac.hmac`](/docs/stdlib/security/mac)
  which is designed to resist length-extension.

- **Collision resistance.** SHA-256 is still cryptographically
  collision-resistant; public pre-image and second-preimage attacks
  remain out of reach. SHA-1 is deprecated for signatures but
  remains available in `core.security.hash.sha1` for protocols
  that require it (Git SHA-1, legacy HMAC-SHA1 in TOTP, etc.).

## Relation to other modules

- [`core.security.mac.hmac`](/docs/stdlib/security/mac) uses SHA-2
  as its compression function.
- [`core.security.kdf.hkdf`](/docs/stdlib/security/kdf) builds on
  HMAC-SHA-{256, 384, 512}.
- [`core.net.tls`](/docs/stdlib/net/tls/) uses SHA-256/SHA-384 in
  the TLS 1.3 key schedule and the transcript hash.

## File layout

| File | Role |
|---|---|
| `core/security/hash/sha1.vr` | SHA-1 (200 LOC, legacy only) |
| `core/security/hash/sha256.vr` | SHA-256 (340 LOC) |
| `core/security/hash/sha384.vr` | SHA-384 (180 LOC, shares sha512 core) |
| `core/security/hash/sha512.vr` | SHA-512 (330 LOC, exposes `compress_block`) |
| `core/security/hash/crc32.vr` | CRC-32 / IEEE 802.3 — **non-cryptographic** checksum |

## `crc32` — non-cryptographic checksum

Packaged alongside the SHA-2 family because it is a byte-oriented
digest, but **this is not a cryptographic hash** — adversaries can
trivially reproduce any target checksum. Use SHA-256 or HMAC when
the integrity check must be tamper-resistant.

```verum
mount core.security.hash.crc32.{Crc32, crc32, crc32_continue};

// one-shot
let digest: UInt32 = crc32(b"hello world");

// streaming
let mut h = Crc32.new();
h.update(chunk1);
h.update(chunk2);
let digest: UInt32 = h.finalize();
```

Standard IEEE 802.3 / RFC 1952 (gzip) polynomial 0xEDB88320 with
reflected input, reflected output, pre-XOR `0xFFFFFFFF`, and final
XOR `0xFFFFFFFF`. Matches zlib's `crc32`, the `crc32` CLI, Python's
`binascii.crc32`, and Rust's `crc32fast.hash`. Used internally by
`core.database.sqlite.native` for WAL frame checksums.

## `crc32c` — Castagnoli polynomial

```verum
mount core.security.hash.crc32c.{Crc32c, crc32c};
let digest: UInt32 = crc32c(b"123456789");   // 0xE3069283 (RFC 3720)
```

Reflected polynomial `0x82F63B78` (Castagnoli). Better error-
detection properties than CRC-32/IEEE over 27..127-bit payloads
(Koopman & Chakravarty 2004). Used by SCTP (RFC 4960 §6.8),
iSCSI data digest (RFC 7143 §10.4.3), ext4/btrfs/f2fs/XFS
filesystems, Google Cloud Storage object checksums. SSE4.2 /
ARMv8 CRC32C hardware instructions can accelerate ~10× behind
a follow-up intrinsic.

## `xxhash` — XXH64 fast non-crypto hash

```verum
mount core.security.hash.xxhash.{XxHash64, xxh64};

let h: UInt64 = xxh64(data, seed);

let mut hasher = XxHash64.new(seed);
hasher.update(chunk1);
hasher.update(chunk2);
let h: UInt64 = hasher.finalize();
```

Yann Collet's XXH64. The non-crypto speed champion: ~3 GB/s in
pure Verum (4-lane parallel accumulator for inputs ≥ 32 bytes;
seed + PRIME64_5 for smaller inputs; final 3-round avalanche).
Streaming output always equals one-shot — the `update` /
`finalize` path buffers tails identically.

Used by Facebook RocksDB blob-file integrity, LZ4 frame-format
content checksums, ClickHouse analytics column hashing, Redis
rax, Ceph. **Not** cryptographic — adversarial inputs trivially
collide.

## `murmur3` — MurmurHash3 (32-bit + 128-bit)

```verum
mount core.security.hash.murmur3.{murmur3_32, murmur3_128, Murmur3Hash128};

let h32: UInt32 = murmur3_32(key_bytes, seed);

let h128: Murmur3Hash128 = murmur3_128(key_bytes, seed);
// { high: UInt64, low: UInt64 }
```

Austin Appleby 2011. Wire-compatible with Cassandra
Murmur3Partitioner, Guava `Hashing.murmur3_*`, Apache Spark
partitioning, Apache Commons Codec, Rust `fastmurmur3`. Two
variants — 32-bit for hash tables, 128-bit (x64 variant) when
birthday collisions at scale matter.

Same "not cryptographic" caveat as XXH64 — partition keys,
BloomFilter fingerprints, dedup fingerprints only. Use SHA-256
or HMAC against untrusted peers.

## References

- [FIPS PUB 180-4](https://doi.org/10.6028/NIST.FIPS.180-4) — Secure Hash Standard
- [RFC 6234](https://datatracker.ietf.org/doc/html/rfc6234) — informational SHA-2
- [NIST CAVP test vectors](https://csrc.nist.gov/projects/cryptographic-algorithm-validation-program)
