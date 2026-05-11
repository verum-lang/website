---
sidebar_position: 22
title: redis
description: Multi-purpose Redis subsystem — RESP3 client + commands + pub/sub + streams + transactions + scripting.
---

# `core.redis` — Multi-purpose Redis subsystem

Production-grade Redis client speaking RESP2 / RESP3. Used as a
multi-purpose data store: cache, pub/sub, streams (event queue),
transactions, sorted-set leaderboards, distributed locks.

## Architectural composition

Lower layers (`protocol.vr`, `client.vr`) handle RESP framing +
connection pool + cluster redirects.  Upper layers (`commands.vr`,
`pubsub.vr`, `stream.vr`, `transaction.vr`, `script.vr`) provide
typed surfaces.  Every command goes through `client::exec` (or
`exec_bytes` for binary-safe), which acquires a pool slot, writes
the framed RESP, reads one reply, releases the slot.

**Composes against** lower stdlib subsystems:

| Dependency | What it provides |
|---|---|
| `core.net.tcp` | Transport |
| `core.async` | Concurrency |
| `core.sync.{rwlock, semaphore}` | Pool primitives |

Zero new low-level primitives — every protocol concern delegates
to the canonical subsystem.

## Layout

| File | What's in it |
|---|---|
| `protocol.vr` | RESP2 / RESP3 framing (`RespValue`, `RespError`, `encode`, `decode`) |
| `client.vr` | `RedisClient`, `RedisConfig`, `RedisError`, `connect`, `connect_url`, `exec`, `exec_bytes`, `exec_pipeline` |
| `commands.vr` | Typed wrappers over the common command set |
| `pubsub.vr` | `PubSubMessage`, `publish` + subscriber loops |
| `transaction.vr` | `TxResult`, MULTI/EXEC scripting |
| `stream.vr` | `StreamEntry`, `xadd` / `xrange` / `xread` / `xreadgroup` / `xack` / `xgroup_create` |
| `script.vr` | `script_load`, `eval`, `evalsha`, `script_exists`, `script_flush` |

## RESP protocol model

```verum
public type RespValue is
    | SimpleStr(Text)        // "+OK"
    | Error(Text)             // "-ERR msg"
    | Int(Int)                 // ":42"
    | BulkStr(Maybe<List<Byte>>)  // "$N\r\n..." or null bulk
    | Array(Maybe<List<RespValue>>); // "*N\r\n..." or null array

public type RespError is
      InvalidFrame(Text)
    | UnexpectedEof
    | IntegerOverflow
    | InvalidUtf8;
```

The decoder is binary-safe — `BulkStr(Some(bytes))` preserves
non-UTF8 payloads byte-for-byte. UTF-8 conversion happens at the
upper-layer command boundary.

## RedisClient

```verum
public type RedisConfig is {
    host:                 Text,
    port:                 Int,
    pool_size:            Int,
    connect_timeout_ms:   Int,
    read_timeout_ms:      Int,
    write_timeout_ms:     Int,
    cluster_aware:        Bool,
    follow_moved:         Bool,
    follow_asking:        Bool,
    follow_redirect_max:  Int,
    // ...
};

public fn connect(config: &RedisConfig) -> Result<RedisClient, RedisError>;
public fn connect_url(url: &Text) -> Result<RedisClient, RedisError>;
public fn redis_config_default() -> RedisConfig;
```

Cluster awareness is opt-in via `cluster_aware`. When enabled the
client transparently follows `MOVED` and `ASK` redirects (bounded
by `follow_redirect_max` to prevent loops on misconfigured
clusters).

## Command execution surface

| Function | Purpose |
|---|---|
| `exec(client, args)` | UTF-8 args + UTF-8 reply path |
| `exec_bytes(client, args)` | Binary-safe — args/replies as `List<Byte>` |
| `exec_pipeline(client, batches)` | Batched send + batched receive in pool slot |

The typed wrappers in `commands.vr` are the recommended entry
point — they encapsulate argument formatting and reply parsing for
the common command set (`GET`, `SET`, `INCR`, `LPUSH`, `ZADD`,
etc.). Drop down to raw `exec` only when you need a command not
yet wrapped or a non-standard reply shape.

## Streams (event queue)

```verum
public type StreamEntry is { id: Text, fields: List<(Text, Text)> };

pub fn xadd(client, key, entry)
    -> Result<Text, RedisError>;
pub fn xrange(client, key, start, end)
    -> Result<List<StreamEntry>, RedisError>;
pub fn xread(client, keys, last_ids, count, block_ms)
    -> Result<Map<Text, List<StreamEntry>>, RedisError>;
pub fn xreadgroup(client, group, consumer, keys, ids, count, block_ms)
    -> Result<Map<Text, List<StreamEntry>>, RedisError>;
pub fn xack(client, key, group, ids)
    -> Result<Int, RedisError>;
pub fn xgroup_create(client, key, group, start_id, mkstream)
    -> Result<(), RedisError>;
```

Stream semantics match Redis 5+: append-only log keyed per stream,
consumer-group acknowledgement, optional `MKSTREAM` on first
group create. The typed `xread` / `xreadgroup` block on the
underlying socket via `core.async` so the call site can `await`
without blocking the executor.

## Pub/Sub

```verum
public type PubSubMessage is { channel: Text, payload: List<Byte> };

pub fn publish(client, channel, payload) -> Result<Int, RedisError>;
```

Subscription consumes from `RedisClient` via a dedicated connection
(separate from the command pool — Redis pub/sub semantics require
the connection stay in subscribe-mode until UNSUBSCRIBE).

## Transactions

`MULTI` / `EXEC` via `transaction::run_simple`. For optimistic
concurrency (WATCH-based CAS), drop to raw `exec` and orchestrate
manually — typed wrapper TBD.

## Scripting (Lua)

```verum
pub fn script_load(client, source) -> Result<Text, RedisError>;
pub fn eval(client, source, keys, args) -> Result<RespValue, RedisError>;
pub fn evalsha(client, sha1, keys, args) -> Result<RespValue, RedisError>;
pub fn script_exists(client, sha1s) -> Result<List<Bool>, RedisError>;
pub fn script_flush(client) -> Result<(), RedisError>;
```

Standard SCRIPT LOAD / EVALSHA round-trip; the script SHA is
returned by `script_load` and consumed by `evalsha` for the
optimised fast path.

## Status

| File | Status |
|---|---|
| `protocol.vr` | **stable** — RESP2 + RESP3 framing complete |
| `client.vr` | **stable** — connection pool + cluster redirects |
| `commands.vr` | **partial** — common commands wrapped; long tail TBD |
| `pubsub.vr` | **stable** — publish + subscriber loops |
| `transaction.vr` | **partial** — MULTI/EXEC wrapped; WATCH-based CAS TBD |
| `stream.vr` | **stable** — full XADD/XREAD/XREADGROUP/XACK surface |
| `script.vr` | **stable** — full SCRIPT LOAD/EVAL/EVALSHA surface |

## Integration with `core.cache`

`core.cache.adapters.redis` is the abstract-cache adapter that
re-exposes a subset of `core.redis` via the `CacheBackend`
protocol. Same composition discipline as every other adapter —
delegates to `core.redis` for protocol-level concerns, exposes
only `CacheBackend`-shaped methods upward.
