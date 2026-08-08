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
| `uuid.vr`            | **partial** | [core-tests/base/uuid](https://github.com/verum-lang/verum/tree/main/core-tests/base/uuid) — `Uuid.parse`/`from_bytes` stable; `Uuid.to_text` previously lenient-skipped on `Text.new` (one of ~400 Text.* method cascade entries at May-11 baseline). **Tracked under task #16** (twice attempted reland regressed; runtime sentinel handler durably landed via commit `b5f5462d4`) (commits `b5f5462d4` runtime sentinel handler + `5b657aa16` stage-1 + `98fced985` stage-2 + `7cdb334b2` + `86784eebf` stub-overwrite discipline): caller-modules now see `Text.new` / `List.from` / `AtomicInt.new` / `Duration.from_secs` / variant constructors as stubs from compile-time-zero; producing modules' real bodies overlay the stubs via the sentinel-ID-range overwrite gate at `stdlib_bootstrap.rs:1453`; stuck stubs (when producing module itself fails precompile) degrade gracefully via the runtime sentinel handler with a clean `[lenient] task#16 stage-N stub never resolved` panic. Stage 1 targets 386 Text-method skips; combined with Stage 2's 131 variant-constructor skips, ~631 of 1333 fresh-baseline skips (≈47%) close as one architectural fix. |
| `ulid.vr`            | **partial** | [core-tests/base/ulid](https://github.com/verum-lang/verum/tree/main/core-tests/base/ulid) — 4/4 test files green under `--interp` (was 1/3 pre-fix). 28 unit + 11 property + 11 integration + 8 regression pins. Pure-data surface (`from_parts(int, int)` factory, `Ulid.from_parts_seeded`, parse validation, ULID_ALPHABET Crockford pin, UlidError 2-variant ADT, 48-bit timestamp round-trip) fully covered. Two `@ignore`'d defect classes pinned: (a) **task §2.1** — `Ulid.to_text()` lenient panic-stub because `Text.from_utf8_unchecked` was `unsafe fn` (private) at `core/text/text.vr:455`; visibility fix staged in this branch (`public unsafe fn`); flips green on next precompiled-stdlib refresh. (b) **task #17/#39 — SystemTime.now() static-method dispatch defect**: `Ulid.new()` / `Ulid.now()` / `generate()` internally call `SystemTime.now().timestamp_millis()` which mis-routes to `SysTimeOpsInstant.now()` (same root as snowflake §D). Workaround: deterministic `from_parts(int, int)` constructors throughout test suite. |
| `nanoid.vr`          | **partial** | [core-tests/base/nanoid](https://github.com/verum-lang/verum/tree/main/core-tests/base/nanoid) — 4/4 test files green under `--interp` (was 1/3 pre-fix). 16 unit + 14 property + 9 integration + 12 regression pins. Pure-data surface — `NANOID_ALPHABET` (64-char URL-safe alphabet: A-Z + a-z + 0-9 + `_` + `-`), `NANOID_DEFAULT_LENGTH = 21`, alphabet composition, URL-safety, 126-bit-entropy invariant — fully covered. Three `@ignore`'d pins for two cascading stdlib defects (both fixed in this branch, activate on next precompiled-stdlib refresh): (a) **§A `Text.from("")` undefined** — `core/base/nanoid.vr:138` called a non-existent `Text.from` factory; fix: `→ Text.new()`. (b) **§B `Text.from_utf8_unchecked` private** — same fix as ulid §A (text.vr:455 `unsafe fn` → `public unsafe fn`). Combined effect: every code path through `generate_with_alphabet` (including `generate()` and `generate_len`) lenient-stubbed at precompile, panics at runtime. Workaround: constant + alphabet-invariant surface exclusively. |
| `snowflake.vr`       | **partial** | [core-tests/base/snowflake](https://github.com/verum-lang/verum/tree/main/core-tests/base/snowflake) — 4/4 test files green under `--interp` (was 2/3 pre-fix). 24 unit + 14 property + 10 integration + 9 regression pins. Pure-data surface (Snowflake.new validation, layout constants, SnowflakeError variants + Eq matrix, parse · build identity, SnowflakeParts construction, accessors) fully covered. Live `next_id()` gated on **task #17/#39 — `SystemTime.now()` static-method dispatch defect**: `next_id` internally calls `SystemTime.now().timestamp_millis()`, but the dispatcher mis-routes to `SysTimeOpsInstant.now()` (a sibling type with a 1-field layout), causing `field access out of bounds: field index 1 (offset 8+8 = 16) exceeds object data size 8 type_id=... type='SysTimeOpsInstant'`. 3 `@ignore`'d pins (`regression_test.vr §D`) for live next_id / monotonicity / live-ID-parse-round-trip. Workaround in test suite: synthetic IDs built via `(ts_offset << TIMESTAMP_SHIFT) \| (worker << WORKER_SHIFT) \| seq`, parsed via `parse(id, epoch_ms)`. |
