---
sidebar_position: 22
title: redis
description: Multi-purpose Redis subsystem — RESP3 client + commands + pub/sub + streams + transactions + scripting.
status: regression-only
---

import StdlibStatus from '@site/src/components/StdlibStatus';

# `core.redis` — Multi-purpose Redis subsystem

<StdlibStatus status="regression-only" />

Production-grade Redis client speaking RESP2 / RESP3. Used as a
multi-purpose data store: cache, pub/sub, streams (event queue),
transactions, sorted-set leaderboards, distributed locks.

## Architectural composition

Lower layers (`protocol.vr`, `client.vr`) handle RESP framing +
connection pool + cluster redirects.  Upper layers (`commands.vr`,
`pubsub.vr`, `stream.vr`, `transaction.vr`, `script.vr`) provide
typed surfaces.  Every command goes through `client.exec` (or
`exec_bytes` for binary-safe, `exec_pipeline` for a batch), which
acquires a pool slot, writes the framed RESP, reads one reply, releases
the slot.

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
// RESP3, not RESP2: sixteen arms, and nullity is its own variant
// rather than a `Maybe` inside the payload.
public type RespValue is
    | SimpleString(Text)                  // "+OK"
    | Error_(Text)                        // "-ERR msg"  (trailing _)
    | Integer(Int)                        // ":42"
    | BulkString(List<Byte>)              // "$N\r\n..."
    | NullBulk                            // "$-1"
    | NullArray                           // "*-1"
    | Array(List<RespValue>)              // "*N\r\n..."
    | Boolean(Bool)                       // "#t" / "#f"
    | Double(Float)                       // ","
    | BigNumber(Text)                     // "("
    | BulkError { code: Text, message: Text }
    | VerbatimString { format: Text, content: Text }
    | MapValue(List<(RespValue, RespValue)>)
    | SetValue(List<RespValue>)
    | Push(List<RespValue>)               // out-of-band, pub/sub
    | Nil_;

public type RespError is
    | UnexpectedEof
    | InvalidPrefix(Byte)                 // carries the offending byte
    | InvalidUtf8(Text)
    | InvalidInteger(Text)
    | InvalidBulkLength(Int)
    | InvalidArrayLength(Int)
    | TooDeep  { depth: Int, limit: Int }
    | TooLarge { size: Int, limit: Int };
```

Two names carry a trailing underscore — `Error_` and `Nil_` — because
the bare forms collide with the prelude.

Nullity is a variant, not a `Maybe` in the payload: `NullBulk` and
`NullArray` are distinct from an empty `BulkString` or `Array`, which is
a distinction Redis makes and `Maybe<List<Byte>>` would flatten.

Every parse error names what it saw. `InvalidPrefix` carries the byte,
`TooDeep` and `TooLarge` carry both the value and the limit — so a
caller reports the failure without re-reading the frame. There is no
`InvalidFrame` catch-all and no `IntegerOverflow`.

The decoder is binary-safe: `BulkString` holds `List<Byte>` and
preserves non-UTF8 payloads byte-for-byte. UTF-8 conversion happens at
the upper-layer command boundary.

## RedisClient

```verum
public type RedisConfig is {
    address:            Text,               // "host:port", one field
    username:           Maybe<Text>,
    password:           Maybe<Text>,
    db:                 Int { >= 0, <= 15 },
    pool_size:          Int { >= 1, <= 1024 },
    command_timeout_ms: Int { >= 1 },       // one timeout, not read+write
    connect_timeout_ms: Int { >= 1 },
    tls:                Bool,
    cluster_mode:       Bool,
    max_redirects:      Int { >= 1, <= 32 },
    client_name:        Maybe<Text>,
};

public fn connect(config: &RedisConfig) -> Result<RedisClient, RedisError>;
public fn connect_url(url: &Text) -> Result<RedisClient, RedisError>;
public fn redis_config_default() -> RedisConfig;
```

`host` + `port` is one `address` field, and the read/write timeout pair
is one `command_timeout_ms` — a Redis command is a round trip, so
splitting the two invites a configuration that cannot be honoured.
Authentication (`username` / `password` / `db` / `client_name`) and
`tls` are config, not connection-string trivia.

Cluster awareness is opt-in via `cluster_mode`. When enabled the client
transparently follows `MOVED` and `ASK` redirects; there are no separate
`follow_moved` / `follow_asking` switches, and the loop guard is
`max_redirects`, refined to `1..=32` so a misconfiguration cannot ask
for an unbounded chase.

Defaults from `redis_config_default()`: `127.0.0.1:6379`, db 0, pool 16,
both timeouts 5000 ms, no TLS, no cluster, 6 redirects.

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
public type StreamEntry is { id: Text, fields: List<(Text, List<Byte>)> };
```

| function | parameters | returns |
|---|---|---|
| `xadd` | `client, key, entry` | `Result<Text, RedisError>` |
| `xrange` | `client, key, start, end` | `Result<List<StreamEntry>, RedisError>` |
| `xread` | `client, keys, last_ids, count, block_ms` | `Result<Map<Text, List<StreamEntry>>, RedisError>` |
| `xreadgroup` | `client, group, consumer, keys, ids, count, block_ms` | `Result<Map<Text, List<StreamEntry>>, RedisError>` |
| `xack` | `client, key, group, ids` | `Result<Int, RedisError>` |
| `xgroup_create` | `client, key, group, start_id, mkstream` | `Result<(), RedisError>` |


Stream semantics match Redis 5+: append-only log keyed per stream,
consumer-group acknowledgement, optional `MKSTREAM` on first
group create. The typed `xread` / `xreadgroup` block on the
underlying socket via `core.async` so the call site can `await`
without blocking the executor.

## Pub/Sub

```verum
// A sum, not a record: the stream carries subscribe/unsubscribe
// acknowledgements alongside the payloads, and a consumer must match
// on which it got.
public type PubSubMessage is
    | Message  { channel: Text, payload: List<Byte> }
    | PMessage { pattern: Text, channel: Text, payload: List<Byte> }
    | Subscribed    { channel: Text, total_subscriptions: Int }
    | Unsubscribed  { channel: Text, total_subscriptions: Int }
    | PSubscribed   { pattern: Text, total_subscriptions: Int }
    | PUnsubscribed { pattern: Text, total_subscriptions: Int };

pub async fn publish(
    client:  &RedisClient,
    channel: &Text,
    payload: &[Byte],
) -> Result<Int, RedisError>;
```

Subscription consumes from `RedisClient` via a dedicated connection
(separate from the command pool — Redis pub/sub semantics require
the connection stay in subscribe-mode until UNSUBSCRIBE).

## Transactions

`MULTI` / `EXEC` via `transaction.run_simple`, re-exported from
`core.redis` under the name **`transaction_run`** — that alias is what a
`mount core.redis.{...}` sees. It answers a `TxResult`. For optimistic
concurrency (WATCH-based CAS), drop to raw `exec` and orchestrate
manually — no typed wrapper exists.

## Scripting (Lua)

```verum
// All five are `async`.
pub async fn script_load(client, source) -> Result<Text, RedisError>;
pub async fn eval(client, source, keys, args) -> Result<RespValue, RedisError>;
pub async fn evalsha(client, sha1, keys, args) -> Result<RespValue, RedisError>;
pub async fn script_exists(client, sha: &Text) -> Result<Bool, RedisError>;
pub async fn script_flush(client) -> Result<(), RedisError>;
```

Standard SCRIPT LOAD / EVALSHA round-trip; the script SHA is
returned by `script_load` and consumed by `evalsha` for the
optimised fast path.

## Status

| File | Status |
|---|---|
| `protocol.vr` | **regression-only** — RESP2 + RESP3 framing complete — [core-tests/redis/protocol](https://github.com/verum-lang/verum/tree/main/core-tests/redis/protocol) |
| `client.vr` | **undocumented** — connection pool + cluster redirects — no conformance suite yet |
| `commands.vr` | **undocumented** — common commands wrapped; long tail TBD — no conformance suite yet |
| `pubsub.vr` | **unverified** — publish + subscriber loops — [core-tests/redis/pubsub](https://github.com/verum-lang/verum/tree/main/core-tests/redis/pubsub) |
| `transaction.vr` | **unverified** — MULTI/EXEC wrapped; WATCH-based CAS TBD — [core-tests/redis/transaction](https://github.com/verum-lang/verum/tree/main/core-tests/redis/transaction) |
| `stream.vr` | **unverified** — full XADD/XREAD/XREADGROUP/XACK surface — [core-tests/redis/stream](https://github.com/verum-lang/verum/tree/main/core-tests/redis/stream) |
| `script.vr` | **undocumented** — full SCRIPT LOAD/EVAL/EVALSHA surface — no conformance suite yet |

## Integration with `core.cache`

`core.cache.adapters.redis` is the abstract-cache adapter that
re-exposes a subset of `core.redis` via the `CacheBackend`
protocol. Same composition discipline as every other adapter —
delegates to `core.redis` for protocol-level concerns, exposes
only `CacheBackend`-shaped methods upward.
