---
sidebar_position: 10
title: id — unique identifiers
description: UUID, ULID, NanoID and Snowflake. Not primitives of the language — they read a clock and draw entropy.
---

# `core.id` — unique identifiers

Generators for identifiers that must not collide.

They lived in `core/base/` until the stdlib's ring law measured the
consequence: `base` is ring 0, the language's own vocabulary, and these
modules mount `core.time.system_time` (ring 2). `core.base.snowflake`
was claiming that a Snowflake ID is a primitive of the LANGUAGE,
alongside `Maybe` and `Result`. It is not — it is a timestamp, a machine
id and a sequence number.

| module | shape |
|---|---|
| `core.id.uuid` | RFC 9562 UUIDs |
| `core.id.ulid` | lexicographically sortable, timestamp-prefixed (Crockford base32) |
| `core.id.nanoid` | short, URL-safe, entropy only — 21 chars, 126 bits |
| `core.id.snowflake` | 64-bit: timestamp + machine + sequence |

## An identifier is not a secret

All four draw from [`core.random.secure`](/docs/stdlib/random), so the
entropy is sound. That is a property of the GENERATOR, not of the
format: `ulid` and `snowflake` embed a timestamp by design and reveal
their creation time to anyone holding one. If you need a value an
observer cannot correlate, `nanoid` carries no structure — or draw the
bytes yourself.

None of these is a hash. For content addressing see
[`core.hash.crypto`](/docs/stdlib/hash); for a keyed tag see
[`core.mac`](/docs/stdlib/mac).

## Per-module status

| file | status | detail |
|---|---|---|
| `uuid.vr`            | **partial** | [core-tests/base/uuid](https://github.com/verum-lang/verum/tree/main/core-tests/base/uuid) — `Uuid.parse` and `Uuid.from_bytes` are stable.  |
| `ulid.vr`            | **partial** | [core-tests/base/ulid](https://github.com/verum-lang/verum/tree/main/core-tests/base/ulid) — unit, property, integration and regression suites green under the interpreter. The data surface is fully covered: the `from_parts` and `from_parts_seeded` factories, parse validation, the Crockford alphabet, the two-variant `UlidError`, and the 48-bit timestamp round trip. **Known limitation, measured 2026-09-04:** `Ulid.new()` does not run — it panics before producing a value, reporting an unresolved stub for a uniquely-named public function. Build a ULID from explicit parts with `from_parts` until it lands; the data surface above is unaffected. The generating entry points `Ulid.now` and `generate` share `new`'s path. |
| `nanoid.vr`          | **partial** | [core-tests/base/nanoid](https://github.com/verum-lang/verum/tree/main/core-tests/base/nanoid) — 4/4 test files green under `--interp` (was 1/3 pre-fix). 16 unit + 14 property + 9 integration + 12 regression pins. Pure-data surface — `NANOID_ALPHABET` (64-char URL-safe alphabet: A-Z + a-z + 0-9 + `_` + `-`), `NANOID_DEFAULT_LENGTH = 21`, alphabet composition, URL-safety, 126-bit-entropy invariant — fully covered. Three `@ignore`'d pins for two cascading stdlib defects (both fixed in this branch, activate on next precompiled-stdlib refresh): (a) **§A `Text.from("")` undefined** — `core/base/nanoid.vr:138` called a non-existent `Text.from` factory; fix: `→ Text.new()`. (b) **§B `Text.from_utf8_unchecked` private** — same fix as ulid §A (text.vr:455 `unsafe fn` → `public unsafe fn`). Combined effect: every code path through `generate_with_alphabet` (including `generate()` and `generate_len`) lenient-stubbed at precompile, panics at runtime. Workaround: constant + alphabet-invariant surface exclusively. |
| `snowflake.vr`       | **partial** | [core-tests/base/snowflake](https://github.com/verum-lang/verum/tree/main/core-tests/base/snowflake) — unit, property, integration and regression suites green under the interpreter. The data surface is fully covered: `Snowflake.new` validation, the layout constants, the `SnowflakeError` variants and their equality, the parse-then-build identity, `SnowflakeParts` construction and the accessors.  |
