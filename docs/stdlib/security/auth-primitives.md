---
title: Auth primitives
description: JWT, COSE, TOTP/HOTP, password hashing, token generation, Merkle trees
---

# `core.security` auth primitives

High-level authentication and authorization primitives layered on
top of the low-level crypto. Every web service, mobile app, and
2FA flow reaches for one of these.

## At a glance

| Module | Format | Typical use |
| ------ | ------ | ----------- |
| `jwt` | JSON-based | API bearer tokens, OAuth/OIDC |
| `cose` | CBOR-based | WebAuthn passkeys, CWT, mDoc |
| `otp` | Digit string | 2FA / email-verification codes |
| `password_hash` | PHC string | User-account password storage |
| `token` | Text/bytes | Session IDs, CSRF tokens, API keys |
| `hpke` | Binary envelope | ECH, MLS, Privacy Pass |
| `merkle` | Hash tree | Transparency logs, Sigstore, TUF |

## `jwt` — JSON Web Tokens (RFC 7519 + 7515)

```verum
mount core.security.jwt.{
    JwtAlgorithm, JwtKey, JwtHeader, VerifyOptions,
    sign_compact, verify_compact,
};
```

### Sign

```verum
let key = JwtKey.HmacSecret(secret_bytes);
let header = JwtHeader.new(JwtAlgorithm.HS256)
    .with_kid(Text.from("k1"));
let token = jwt.sign_compact(&header, &claims_json, &key)?;
```

### Verify

```verum
let opts = VerifyOptions {
    allowed_algorithms: [JwtAlgorithm.HS256],
    expected_iss: Some(Text.from("acme")),
    expected_aud: None,
    now_unix: Instant.now_unix(),
    clock_skew_sec: 5,
};
let parsed = jwt.verify_compact(&token, &key, &opts)?;
```

### Supported algorithms

| ID | Kind | Key |
| -- | ---- | --- |
| HS256 / HS384 / HS512 | HMAC | `JwtKey.HmacSecret` |
| EdDSA | Ed25519 | `JwtKey.Ed25519Seeded` / `Ed25519Public` |

### Security posture

- **`"alg":"none"`** rejected unconditionally (CVE-2015-2951
  bypass cannot be re-enabled).
- **Algorithm confusion** blocked by the typed `JwtKey` enum —
  an HMAC secret cannot pass where an asymmetric key is
  expected.
- **`allowed_algorithms`** is mandatory on verify — wildcard
  "accept whatever the token claims" is not a posture.
- **Signature compare** via `constant_time_eq`.
- **Claim enforcement** — `exp` / `nbf` with configurable
  clock skew, `iss` / `aud` optional equality check.

## `cose` — CBOR Object Signing (RFC 9052)

```verum
mount core.security.cose.{
    CoseAlg, CoseKey, CoseHeaders,
    sign1, verify_sign1, mac0, verify_mac0,
};
```

The CBOR-based signing envelope behind WebAuthn passkeys, CWT
(CBOR Web Token, RFC 8392), mDoc mobile driving licenses
(ISO 18013-5), and OAuth DPoP-bound tokens.

### Sign1 (single-signer)

```verum
let wire = cose.sign1(
    &CoseHeaders { alg: CoseAlg.EdDSA, kid: Some(id_bytes) },
    payload, external_aad, &CoseKey.Ed25519Seeded(sk),
)?;

// Verify on the peer.
let payload = cose.verify_sign1(
    &wire, external_aad, &CoseKey.Ed25519Verify(pk),
)?;
```

### Mac0 (single-recipient MAC)

```verum
let wire = cose.mac0(
    &CoseHeaders { alg: CoseAlg.HS256, kid: None },
    payload, external_aad, &key,
)?;

let payload = cose.verify_mac0(&wire, external_aad, &key)?;
```

### Wire layout

```
COSE_Sign1 = [protected, {}, payload, signature]
Sig_structure = ["Signature1", protected, external_aad, payload]

COSE_Mac0 = [protected, {}, payload, tag]
MAC_structure = ["MAC0", protected, external_aad, payload]
```

Protected headers ({1: alg, [4: kid]}) are serialised via
`cbor.encode_canonical` so verifier and signer see byte-identical
inputs regardless of CBOR map-key insertion order.

## `otp` — HOTP + TOTP (RFC 4226 / 6238)

```verum
mount core.security.otp.{
    OtpHash, hotp, totp, totp_verify,
    generate_secret, provisioning_uri,
    DEFAULT_STEP_SEC, DEFAULT_DIGITS,
};
```

### Generate + verify

```verum
// 32-byte shared secret.
let secret = otp.generate_secret(otp.DEFAULT_SECRET_BYTES);

// Classic 30-s step, 6-digit code, SHA-256 (recommended over SHA-1).
let code = otp.totp(
    secret.as_slice(), Instant.now_unix(),
    otp.DEFAULT_STEP_SEC, otp.DEFAULT_DIGITS, &OtpHash.Sha256,
)?;

// Verify with ±1 step clock-drift tolerance.
let ok = otp.totp_verify(
    secret.as_slice(), &candidate, Instant.now_unix(),
    otp.DEFAULT_STEP_SEC, otp.DEFAULT_DIGITS, &OtpHash.Sha256, 1,
);
```

Verify uses `constant_time_eq` — wrong-code timing is
indistinguishable from right-code timing.

### Enrollment QR

```verum
let uri = otp.provisioning_uri(
    &Text.from("ACME:alice@example.com"),
    &Text.from("ACME"),
    secret.as_slice(),
    otp.DEFAULT_DIGITS, otp.DEFAULT_STEP_SEC, &OtpHash.Sha256,
);
// otpauth://totp/ACME:alice@example.com?secret=BASE32&issuer=ACME&...
```

Google Authenticator / Authy / FreeOTP / 1Password consume this
URI directly via QR-code scan.

### Digit uniformity

`generate_numeric(digits)` uses rejection sampling over a 32-bit
uniform draw to eliminate modulo-bias — every digit at every
position is equally probable, even for non-power-of-10 alphabets.

## `password_hash` — PHC modular format

```verum
mount core.security.password_hash.{
    Pbkdf2Sha256Hasher, PasswordHasher, PasswordHashError,
    DEFAULT_PBKDF2_ITERATIONS, MIN_PBKDF2_ITERATIONS,
};
```

```verum
let hasher = Pbkdf2Sha256Hasher.with_defaults()
    .with_iterations(600_000);   // NIST SP 800-63B 2024

let phc: Text = hasher.hash(password_bytes)?;
// "$pbkdf2-sha256$i=600000$<salt_b64u>$<hash_b64u>"

let ok = hasher.verify(password_bytes, &phc)?;
```

### Guards

| Bound | Floor | Action below |
| ----- | ----- | ------------ |
| Iterations | `MIN_PBKDF2_ITERATIONS` = 100,000 | `WeakParameters` |
| Salt bytes | 8 | `WeakParameters` |
| Output bytes | 16 | `WeakParameters` |

Any below-floor configuration is rejected at hash time — no
silent fallback. The PHC string carries every parameter, so
verification doesn't need side-channel knowledge of what the
hasher was configured with.

Argon2id and scrypt backends plug in behind the same
`PasswordHasher` protocol in follow-up work.

## `token` — session / CSRF / OTP tokens

```verum
mount core.security.token.{
    generate_urlsafe, generate_hex, generate_numeric, generate_bytes,
    compare_tokens, compare_token_bytes,
    MIN_TOKEN_BYTES, DEFAULT_TOKEN_BYTES,
};
```

```verum
// OWASP default — URL-safe base64, 256 bits entropy.
let session = token.generate_urlsafe(DEFAULT_TOKEN_BYTES);

// Hex is friendlier in logs.
let api_key = token.generate_hex(16);

// Verification check in time independent of leading-byte matches.
let ok = token.compare_tokens(&incoming, &stored_in_db);
```

All constructors funnel through `fill_secure` (CSPRNG); no
weak-PRNG fallback. `MIN_TOKEN_BYTES = 16` clamps any accidental
short-token request up to 128-bit entropy.

## `hpke` — Hybrid Public Key Encryption (RFC 9180)

```verum
mount core.security.hpke.{
    setup_base_s, setup_base_r,
    SenderContext, ReceiverContext, Encapsulation,
};
```

One-suite implementation — the common HPKE profile every
deployment supports:

| Role | ID | Value |
| ---- | -- | ----- |
| KEM | 0x0020 | DHKEM(X25519, HKDF-SHA256) |
| KDF | 0x0001 | HKDF-SHA256 |
| AEAD | 0x0003 | ChaCha20-Poly1305 |
| Mode | 0 | Base |

Used by ECH (Encrypted ClientHello, TLS 1.3), MLS messaging,
Privacy Pass, Oblivious DoH.

### Sender

```verum
let (enc, mut ctx) = hpke.setup_base_s(&recipient_pk, info)?;
let ct1 = ctx.seal(aad, pt1)?;
let ct2 = ctx.seal(aad, pt2)?;
let exported = ctx.export(b"binder", 32)?;
```

### Receiver

```verum
let mut ctx = hpke.setup_base_r(&enc, &our_sk, info)?;
let pt1 = ctx.open(aad, &ct1)?;
let pt2 = ctx.open(aad, &ct2)?;
```

Sequence numbers monotonically increment; wrap-around is fatal
per RFC 9180 §5.2. Plaintext is never exposed on AEAD open
failure.

## `merkle` — Binary Merkle tree (RFC 6962 §2.1)

```verum
mount core.security.merkle.{
    MerkleTree, InclusionProof,
    leaf_hash, node_hash, verify_inclusion_proof,
};
```

The Certificate-Transparency-style tree layout used by Sigstore,
TUF, Noms content-addressed storage, Bitcoin-family chains.

```verum
// Build.
let tree = MerkleTree.from_leaves(&leaves);
let root = tree.root();

// Prove.
let proof = tree.inclusion_proof(index)?;

// Verify on the remote side.
let ok = merkle.verify_inclusion_proof(
    leaf_bytes, index, tree.len(), &proof, &root,
);
```

### Domain-separated hashing

```
leaf_hash(x)    = SHA-256(0x00 || x)
node_hash(l, r) = SHA-256(0x01 || l || r)
```

The 0x00 / 0x01 prefix bytes prevent second-preimage collisions
across leaves and internal nodes (Halevi-Krawczyk 1997).

### Odd-leaf handling

When a level has an odd number of entries, the last entry is
promoted unchanged to the next level — matches RFC 6962 and
avoids the Bitcoin-family CVE-2012-2459 duplication collision
where two distinct trees could hash to the same root.

## Further reading

- [`hash`](/docs/stdlib/security/hash) — underlying SHA / CRC /
  non-crypto fingerprint primitives.
- [`ecc`](/docs/stdlib/security/ecc) — Ed25519 / X25519 / P-256
  curves these primitives build on.
- [encoding/cbor](/docs/stdlib/encoding) + [encoding/jcs](/docs/stdlib/encoding)
  — the serialisation layers COSE + JCS-signed JSON run over.
