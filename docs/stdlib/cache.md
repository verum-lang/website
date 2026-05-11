---
sidebar_position: 7
title: cache
description: Abstract cache subsystem — CacheBackend protocol + concrete adapters (Redis, future LRU/Memcached).
---

# `core.cache` — Abstract cache subsystem

`core.cache` provides a backend-agnostic cache interface. Consumers
program against the `CacheBackend` protocol and pick a concrete
adapter (Redis today; in-memory LRU, Memcached, etc. as adapters
land) at construction time.

This separates *what* you cache (the protocol surface) from *where*
it lives (the backend implementation). The same caller code runs
unmodified across backends.

## Layout

| File | What's in it |
|---|---|
| `mod.vr` | re-exports |
| `types.vr` | `CacheBackend` protocol + value/error model |
| `adapters/redis.vr` | adapter over `core.redis` |

Composition discipline: adapters NEVER re-implement protocol-level
concerns. They delegate to the underlying multi-purpose subsystem
(e.g. `core.redis` for Redis) and expose only the CacheBackend-
shaped surface. New backends land as `core/cache/adapters/<name>.vr`
with no upstream code change required.

## Value model

```verum
@derive(Eq, Clone, Debug)
public type CacheValue is
    | Bytes(List<Byte>)              // raw byte payload
    | TextValue(Text)                // UTF-8 string (typically JSON)
    | Counter(Int)                   // monotonic counter — INCR/DECR atomic
    | StringSet(List<Text>);         // set of strings (tagging / invalidation groups)

@derive(Eq, Clone, Debug)
public type CacheTtl is
    | Persistent                     // no expiry
    | Seconds(Int { >= 1 })          // expire after N seconds
    | Millis(Int { >= 1 });          // sub-second precision
```

The variant discrimination is the contract: a backend that stores a
`Counter` exposes atomic INCR/DECR; a backend that stores a
`StringSet` exposes set-membership ops; backends MUST round-trip
the variant tag.

## Error model

```verum
public type CacheError is
    | NotFound(Text)                                         // key absent or expired
    | Network(Text)                                          // backend reachability
    | Encoding(Text)                                         // serialisation / deserialisation
    | TypeMismatch { expected: Text, found: Text }           // requested variant didn't match storage
    | TooLarge { size: Int, limit: Int }                     // value exceeded backend limit
    | InvalidKey(Text)                                       // key violates backend constraints
    | Backend(Text);                                         // generic backend-specific failure
```

`Display` + `Debug` are implemented; every variant produces a
human-readable diagnostic suitable for logging at the call site.

## CacheBackend protocol

Every concrete backend implements these primitives. Higher-level
helpers (typed get/set, JSON round-trip, scoped namespaces) are
supplied as default methods that compose against the primitives:

| Primitive | Purpose |
|---|---|
| `async get(&self, key)` | Fetch value by key; `None` if absent / expired |
| `async set(&self, key, value, ttl)` | Store value with TTL; replaces existing |
| `async set_if_absent(&self, key, value, ttl)` | Atomic set-if-absent; `true` on store |
| `async delete(&self, key)` | Delete; returns number of keys removed (0 or 1) |
| `async mget(&self, keys)` | Multi-get atomic; one entry per requested key in order |
| `async incr_by(&self, key, delta)` | Atomic counter increment; creates at 0 if absent |
| `async expire(&self, key, ttl)` | Set TTL on existing key; `false` if absent |
| `async ping(&self)` | Health-check round-trip |

All ops are `async fn` — backend dispatch is non-blocking. Errors
surface via `Result<T, CacheError>` so callers can pattern-match on
the failure mode.

## Status

| File | Status | Notes |
|---|---|---|
| `mod.vr` | **stable** | re-exports only |
| `types.vr` | **stable** | protocol + value/error model |
| `adapters/redis.vr` | **partial** | builds on `core.redis`; depends on that module's stability |

## Adapter contract for new backends

To add a backend `XYZ`:

1. Add `core/cache/adapters/xyz.vr`.
2. Implement `CacheBackend` for `XyzAdapter`.
3. Delegate to `core.xyz` (the multi-purpose subsystem) for protocol-
   level concerns — connection pooling, retries, redaction.
4. Surface only the CacheBackend-shaped methods.
5. Add a regression test under `core-tests/cache/xyz/` that exercises
   the full primitive set against a backend stub.

The CacheBackend protocol is the firewall: callers don't care which
adapter is loaded; `XyzAdapter` doesn't care which callers consume
it. This is the canonical pattern for stdlib subsystem composition.
