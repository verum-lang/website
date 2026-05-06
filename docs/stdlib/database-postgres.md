---
title: core.database.postgres — pure-Verum PostgreSQL driver
description: Pure-Verum implementation of the PostgreSQL v3 wire protocol — no libpq, no FFI shim. Affine transactions, query cancellation, LISTEN/NOTIFY, COPY streaming, SCRAM-SHA-256 auth, extended protocol with prepared-statement cache.
---

# `core.database.postgres` — pure-Verum PostgreSQL driver

`core.database.postgres` — codename **spindle (postgres backend)** —
is a pure-Verum implementation of PostgreSQL's v3 wire protocol.
Zero `libpq`, zero FFI: every byte that flows over the TCP socket is
encoded and decoded in Verum.

The adapter implements the cross-vendor protocols defined in
`core.database.common.protocol` (`Adapter`, `Connection`, affine
`Transaction`, `Pool`, `Row`, `Params`) so handler code is portable
across the SQLite / Postgres / MySQL backends — see
[the cross-vendor capability table](./database#postgres--mysql-parity-surface).

## Architectural layers

```
┌─────────────────────────────────────────────────────────────┐
│ L7  PUBLIC API           PgConnection, PgTransaction        │
├─────────────────────────────────────────────────────────────┤
│ L6  SESSION              cancel, listen/notify, copy        │
├─────────────────────────────────────────────────────────────┤
│ L5  EXTENDED PROTOCOL    Parse / Bind / Execute / Sync;      │
│                          per-connection prepared cache       │
├─────────────────────────────────────────────────────────────┤
│ L4  AUTH                 SCRAM-SHA-256-PLUS, channel bind    │
├─────────────────────────────────────────────────────────────┤
│ L3  WIRE FRAMES          frontend / backend / message types  │
├─────────────────────────────────────────────────────────────┤
│ L2  TLS                  via core.net.tls                    │
├─────────────────────────────────────────────────────────────┤
│ L1  TCP                  via core.net.tcp.TcpStream          │
└─────────────────────────────────────────────────────────────┘
```

## Opening a connection

```verum
mount core.database.postgres.{PgConfig, PgConnection, connect};

let cfg = PgConfig.new()
    .with_host("localhost".into())
    .with_port(5432)
    .with_user("alice".into())
    .with_database("prod".into())
    .with_password_from_env("PGPASSWORD".into())?;

let mut conn = connect(&cfg)?;
let result = conn.simple_query(&"SELECT 1".into())?;
```

## Affine `PgTransaction`

Same shape as the loom L7 `Transaction` (see
[`database`](./database#affine-transaction)):

```verum
mount core.database.postgres.{
    PgTransaction, PgTxOpts,
    PgTkSerializable, PgAmReadOnly,
    begin_tx, begin_tx_with, begin_tx_serializable, begin_tx_read_only,
    commit_tx, rollback_tx,
    with_transaction, with_transaction_serializable,
    savepoint, release_savepoint, rollback_to_savepoint,
};

// Recommended — callback combinator.
with_transaction(&mut conn, |c| {
    c.execute(&"INSERT INTO orders (id, total) VALUES (1, 100)".into())?;
    c.execute(&"UPDATE accounts SET balance = balance - 100 WHERE id = 1".into())?;
    Ok(())
})?;

// Manual — affine handle the user must consume.
let tx = begin_tx_serializable(&mut conn)?;
conn.execute(&"...".into())?;
commit_tx(&mut conn, tx)?;     // or rollback_tx(...)
```

`PgTxOpts` builder selects isolation + access mode + DEFERRABLE:

| Field | Values |
|---|---|
| `isolation: PgTxKind` | `PgTkReadCommitted` (default), `PgTkRepeatableRead`, `PgTkSerializable` |
| `mode: PgAccessMode` | `PgAmReadWrite` (default), `PgAmReadOnly` |
| `deferrable: PgDeferrable` | `PgDfNone` (default), `PgDfDeferrable`, `PgDfNotDeferrable` |

Defence-in-depth: `commit_tx` checks `conn.tx_status()` (driven by
every server-side `ReadyForQuery`) and refuses to fire if the
connection is in `TxFailedTransaction` (Postgres requires ROLLBACK
after error) or `TxIdle` (no tx in progress) — surfaces
`DbMisuse(...)` rather than emitting the silent-warning NOTICE.

`rollback_tx` is tolerant of `TxIdle` — server-side may have
auto-rolled, the affine consume always succeeds.

## Query cancellation

Postgres protocol §6.1.7: cancellation must travel on a *separate*
TCP connection (the original socket is held busy by the available
query).  The driver captures `(process_id, secret_key)` from the
startup `BackendKeyData` frame and offers two entry points:

```verum
// Convenience — uses the connection's stored backend_key.
conn.cancel_running_query(&"localhost".into(), 5432)?;

// Standalone — for callers that hold the tuple outside a PgConnection
// (pool reservations, supervisor watchdogs, audit-log replay).
mount core.database.postgres.cancel_running_query_at;
cancel_running_query_at(&"localhost".into(), 5432, pid, secret_key)?;
```

Race semantics match Postgres: the server may complete the query
before the cancel arrives, in which case the cancel is silently
ignored.  Don't treat cancel as guaranteed delivery.

## LISTEN / NOTIFY

```verum
// Subscribe.
conn.listen(&"orders_channel".into())?;

// Publish (single-quote-escapes the payload per SQL standard).
conn.notify(&"orders_channel".into(), &"order_id=42".into())?;

// Drain all pending notifications.
let pending = conn.take_notifications();
for n in pending.iter() {
    let _channel = &n.channel;
    let _payload = &n.payload;
    let _sender_pid = n.process_id;
}

// Block until at least one arrives.
let batch = conn.wait_for_notification()?;
```

Implementation: `read_message` auto-demuxes `BmNotification(...)`
frames into `conn.notifications` whenever the server pushes one
between query rounds.  Higher-level callers see only synchronous
response streams; notifications accumulate transparently.

## COPY FROM / TO — bulk-streaming

5–10× faster than even pipelined `INSERT` for bulk ingest because
the server skips per-row Parse+Bind round-trips:

```verum
mount core.database.postgres.copy.{copy_in, copy_out};

// Bulk ingest — one row per List<Text> entry, tab-separated.
let n_rows = copy_in(&"events".into())
    .with_columns(["ts".into(), "user_id".into(), "kind".into()])
    .run(&mut conn, &rows)?;

// Bulk export.
let chunks = copy_out(&"users".into())
    .with_columns(["id".into(), "email".into()])
    .run(&mut conn)?;
```

Driver methods on PgConnection (lower-level):

* `copy_in_bytes(sql, rows: &List<List<Byte>>) -> Result<Int, DbError>`
* `copy_in_text_lines(sql, rows: &List<Text>) -> Result<Int, DbError>` — auto-newline-terminates
* `copy_fail_in(reason: &Text) -> Result<(), DbError>` — abort mid-stream
* `copy_out_bytes(sql) -> Result<List<List<Byte>>, DbError>`

## SCRAM-SHA-256-PLUS authentication

`core.database.postgres.auth.scram` — pure-Verum SCRAM-SHA-256
client.  Channel-binding (`-PLUS`) is preferred when a TLS layer
is present.  `md5`, `password`, `trust` flows are
compile-time-rejected unless `@allow_legacy_auth` is opted in.

## Extended protocol

`core.database.postgres.extended` covers Parse / Bind / Describe /
Execute / Sync.  Per-connection LRU prepared-statement cache (size
default 256) sits in `core.database.postgres.stmt_cache` so
repeated queries with the same `fingerprint = hash(normalised_sql_ast)`
skip the Parse round-trip.

## Wire-protocol surface

Frame builders + parsers live under `core.database.postgres.wire`:

| Module | Surface |
|---|---|
| `wire.frame` | `Frame { tag: Byte, payload: List<Byte> }`; length-prefixed framing |
| `wire.frontend` | `startup`, `simple_query`, `parse`, `bind`, `execute`, `sync`, `flush`, `terminate`, `cancel_request`, `copy_data`, `copy_done`, `copy_fail`, SCRAM helpers |
| `wire.backend` | `parse_backend(frame, formats)` → `BackendMessage`; `BmAuth` / `BmReadyForQuery` / `BmRowDescription` / `BmDataRow` / `BmCommandComplete` / `BmError` / `BmNotice` / `BmNotification` / `BmCopyInResponse` / `BmCopyOutResponse` / `BmCopyData` / `BmCopyDone` / `BmParseComplete` / `BmBindComplete` / `BmCloseComplete` / etc. |
| `wire.types` | `BE_*` / `FE_*` byte constants, `TX_*` status bytes, `AUTH_*` SASL sub-codes |

All decoded `&arena` references live in connection-arena;
`recv_buf` / `last_formats` reset at connection drop.

## Binary type codecs

`core.database.postgres.codec` carries the wire-level binary
codec for every PostgreSQL built-in scalar plus arrays plus
composites.  The codec splits the encode and decode paths so
parameter binding (Verum value → PG bytes) and row decoding
(PG bytes → Verum value) can evolve independently per type.

The dispatch table `supports_binary` returns `true` for every
type the binary path can carry; types not in the table fall
back to the textual `FmtText` representation so the connection
never gets stuck on an exotic OID.

### Coverage matrix

| PG type            | Decode | Encode | Notes |
|--------------------|--------|--------|-------|
| `BOOL` / `BYTEA`   | ✓      | ✓      | Pass-through. |
| `INT2` / `INT4` / `INT8` | ✓ | ✓ | Network-byte-order. |
| `FLOAT4` / `FLOAT8`| ✓      | ✓      | IEEE 754. |
| `TEXT` / `VARCHAR` | ✓      | ✓      | UTF-8. |
| `UUID`             | ✓      | ✓      | 16 bytes. |
| `DATE` / `TIME` / `TIMESTAMP[TZ]` | ✓ | ✓ | µs-precision Postgres epoch. |
| `INTERVAL`         | ✓      | ✓      | (months, days, µs) triple. |
| `JSON` / `JSONB`   | ✓      | ✓      | JSONB version byte preserved. |
| `INET` / `CIDR`    | ✓      | ✓      | Family-byte + prefix. |
| `MACADDR` / `MACADDR8` | ✓  | ✓      | 6 / 8 bytes. |
| `BIT` / `VARBIT`   | ✓      | ✓      | Length-prefixed. |
| **`NUMERIC`**      | ✓      | ✓ V0/V1| V0 integer fast-path; V1 text → binary via `Decimal`. |
| **`tsvector`**     | ✓      | —      | Decode-only V0; encode via `to_tsvector` server-side. |
| **`composite` / `record`** | ✓ | ✓  | `(type_oid, ArenaSlice)` per field; auto-encode from Verum record values is V1. |
| **`array<T>`** for every `T` above | ✓ | ✓ | Header + per-element dispatch. |
| `range<T>`         | ✓      | ✓      | `(lower, upper, flags)`. |

The `NUMERIC`, `tsvector`, and `composite` codecs landed in the
2026-05-04 batch (changelog entries
[NUMERIC](/docs/changelog#added--postgres-wire-codec--numeric-tsvector-composite-2026-05-04)).
With them every PG built-in scalar plus array plus composite
has a wire codec; parameter binding no longer hits `FmtText`
for any built-in type.

### `NUMERIC` parameter binding

Three encoders cover the full surface:

```verum
// Integer fast-path — no Decimal allocation.
public fn encode_numeric_from_int(
    buf:   &mut WireBuf,
    arena: &Arena,
    n:     Int,
) -> Bool;

// V1 — non-integer NUMERIC values.
public fn encode_numeric_from_decimal(
    buf:   &mut WireBuf,
    arena: &Arena,
    d:     &Decimal,
) -> Bool;

// Convenience: Text → Decimal → encode.
public fn encode_numeric_from_text(
    buf:   &mut WireBuf,
    arena: &Arena,
    s:     &Text,
) -> Bool;
```

The decimal path bridges through
[`core.text.numeric.decimal`](./decimal.md), so non-integer
binding is full-fidelity (no rounding) for any value within the
V0 i64-coefficient range.

### `tsvector` decode

```verum
public type PgTsVector  is { lexemes: List<PgTsLexeme> };
public type PgTsLexeme  is { word: Text, positions: List<PgTsPosition> };
public type PgTsPosition is { position: Int, weight: Int };

public fn decode_tsvector(slice: &ArenaSlice) -> Result<PgTsVector, DbError>;
```

Constants `PG_TS_WEIGHT_{D,C,B,A}` (0=D, 1=C, 2=B, 3=A) match
the PG source.  Encode is a V1 follow-up — most callers ship
`Text` and let PG run `to_tsvector` server-side.

### `composite` codec

```verum
public type PgComposite      is { fields: List<PgCompositeField> };
public type PgCompositeField is { type_oid: Int, value: Maybe<ArenaSlice> };

public fn decode_composite(
    slice:    &ArenaSlice,
) -> Result<PgComposite, DbError>;

public fn encode_composite(
    buf:    &mut WireBuf,
    arena:  &Arena,
    fields: &List<PgCompositeField>,
) -> Bool;
```

Decoded fields surface as `(type_oid, ArenaSlice)` so callers
dispatch via the existing per-OID decoder table sql# uses for
top-level columns.  Auto-encoding from a Verum record value
(deriving `type_oid` and per-field encoder) is V1 and depends on
the row-resolver.

## Error model

Every wire-decode failure becomes `BackendDecodeError`; every
high-level operation surfaces a unified
`core.database.common.error.DbError`.  See
`core.database.postgres.error.dberr_from_pg` for the server-side
`ErrorResponse` → `DbError` translation (preserves SQLSTATE class
+ severity + message).

## What's NOT in this module (yet)

* TLS `verify-full` — TLS handshake works (`PtmDisable` mode), but
  `verify-full` mode currently rejects with a "TLS_PENDING" adapter
  error; depends on `core.net.tls` channel-binding wiring.
* Logical replication consumer (`core.database.postgres.replication`)
  — pgoutput-format CDC stream.  Spec §6.1.8.
* Connection-pool resilience patterns (auto-reconnect + retry).
* `pgvector` typed codec.

See also: [stdlib → database](./database.md) for the
cross-vendor surface, and
[stdlib → database (mysql)](./database-mysql.md) for the
sister implementation.
