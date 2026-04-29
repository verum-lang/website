---
title: core.database.mysql — pure-Verum MySQL 8 driver
description: Pure-Verum implementation of the MySQL 8 binary protocol — no libmysqlclient, no FFI shim. Affine transactions, COM_STMT_PREPARE/EXECUTE prepared statements, caching_sha2_password authentication, REPEATABLE READ default isolation.
---

# `core.database.mysql` — pure-Verum MySQL 8 driver

`core.database.mysql` — codename **spindle (mysql backend)** — is a
pure-Verum implementation of the MySQL 8.0 binary protocol.  Zero
`libmysqlclient`, zero FFI: the wire is encoded and decoded in
Verum end-to-end.

The adapter implements the cross-vendor protocols defined in
`core.database.common.protocol` (`Adapter`, `Connection`, affine
`Transaction`, `Pool`, `Row`, `Params`) so handler code is portable
across the SQLite / Postgres / MySQL backends — see
[the cross-vendor capability table](./database#postgres--mysql-parity-surface).

## Architectural layers

```
┌─────────────────────────────────────────────────────────────┐
│ L7  PUBLIC API           MysqlConnection, MysqlTransaction   │
├─────────────────────────────────────────────────────────────┤
│ L6  SESSION              prepared statements (binary proto)  │
├─────────────────────────────────────────────────────────────┤
│ L5  COMMANDS             COM_QUERY / COM_STMT_PREPARE /      │
│                          EXECUTE / CLOSE / RESET / PING       │
├─────────────────────────────────────────────────────────────┤
│ L4  AUTH                 caching_sha2_password (default)     │
├─────────────────────────────────────────────────────────────┤
│ L3  WIRE FRAMES          MysqlPacket (length-prefixed)        │
├─────────────────────────────────────────────────────────────┤
│ L2  TLS                  via core.net.tls                     │
├─────────────────────────────────────────────────────────────┤
│ L1  TCP                  via core.net.tcp.TcpStream           │
└─────────────────────────────────────────────────────────────┘
```

## Opening a connection

```verum
mount core.database.mysql.{MysqlConfig, MysqlConnection, connect};

let cfg = MysqlConfig.new()
    .with_host("localhost".into())
    .with_port(3306)
    .with_user("alice".into())
    .with_database("prod".into())
    .with_password_from_env("MYSQL_PASSWORD".into())?;

let mut conn = connect(&cfg)?;
let result = conn.simple_query(&"SELECT 1".into())?;
```

## Affine `MysqlTransaction`

Same shape as the Postgres / SQLite transaction handles.  MySQL
flavour notes baked into the API:

```verum
mount core.database.mysql.{
    MysqlTransaction, MyTxOpts,
    MyTkSerializable, MyAmReadOnly,
    begin_tx, begin_tx_with, begin_tx_serializable, begin_tx_read_only,
    commit_tx, rollback_tx,
    with_transaction, with_transaction_serializable,
    savepoint, release_savepoint, rollback_to_savepoint,
};

with_transaction(&mut conn, |c| {
    c.execute(&"INSERT INTO orders (id, total) VALUES (1, 100)".into())?;
    c.execute(&"UPDATE accounts SET balance = balance - 100 WHERE id = 1".into())?;
    Ok(())
})?;
```

`MyTxOpts` builder selects isolation + access mode:

| Field | Values |
|---|---|
| `isolation: MyTxKind` | `MyTkRepeatableRead` (server default — vs Postgres's READ COMMITTED), `MyTkReadCommitted`, `MyTkReadUncommitted`, `MyTkSerializable` |
| `mode: MyAccessMode` | `MyAmReadWrite` (default), `MyAmReadOnly` |

MySQL 8.0+ supports `START TRANSACTION ISOLATION LEVEL ...,
READ {ONLY|WRITE}` in one statement — used by `render_sql()` so
`begin_tx` is one round-trip.

## Prepared statements (binary protocol)

3–5× faster than `COM_QUERY` text protocol on repeated queries
AND the only safe surface for parameterised values (text-protocol
concatenation invites SQL injection).

```verum
mount core.database.mysql.{
    MysqlPreparedStatement, MysqlPreparedResult,
    StmtParam, param_null, param_int, param_text, param_blob, param_double,
};

let stmt = conn.prepare(&"SELECT id, name FROM users WHERE age > ? AND active = ?".into())?;

let mut params: List<StmtParam> = List.new();
params.push(param_int(18 as Int64));
params.push(param_int(1 as Int64));        // BOOL → MY_TYPE_TINY

let result = conn.execute_prepared(&stmt, &params)?;
for row in result.rows.iter() {
    let id_bytes = row[0].as_ref();        // Maybe<List<Byte>> per column
    let name_bytes = row[1].as_ref();
    // Decode per stmt.column_types[i]
}

conn.close_prepared(&stmt)?;
```

`StmtParam` covers the binary-protocol type set:

```verum
public type StmtParam is
      SpNull
    | SpTinyInt(Int)         // i8
    | SpShort(Int)           // i16 LE
    | SpLong(Int)            // i32 LE
    | SpLongLong(Int64)      // i64 LE
    | SpDouble(Float64)      // ieee754 double LE
    | SpFloat(Float)         // ieee754 single LE
    | SpString(Text)         // length-encoded UTF-8
    | SpBlob(List<Byte>);    // length-encoded raw bytes
```

`MY_TYPE_*` constants (`MY_TYPE_TINY=0x01`, `MY_TYPE_LONGLONG=0x08`,
`MY_TYPE_VAR_STRING=0xFD`, `MY_TYPE_BLOB=0xFC`, …) cover the field-
type wire bytes.

`MysqlPreparedStatement`:

```verum
public type MysqlPreparedStatement is {
    statement_id: Int,
    num_params: Int,
    num_columns: Int,
    param_types: List<Int>,    // MY_TYPE_* per parameter
    column_types: List<Int>,
    sql: Text,                 // for tracing
};
```

`MysqlPreparedResult`:

```verum
public type MysqlPreparedResult is {
    affected_rows: Int,
    last_insert_id: Int,
    rows: List<List<Maybe<List<Byte>>>>,    // binary rows
};
```

`execute_prepared` returns `affected_rows` / `last_insert_id` for
non-SELECT shapes; `rows` is empty in that case.  Param-count
mismatch (caller passes wrong number of params) returns
`DbError.Adapter` with code `"PARAM_COUNT_MISMATCH"`.

CAP_DEPRECATE_EOF aware: MySQL 8+ skips intermediate EOF packets
between ColumnDefinitions, so the driver conditionally `recv_packet`
an EOF only when the capability is NOT negotiated.

## `caching_sha2_password` authentication

`core.database.mysql.auth.caching_sha2` — MySQL 8 default plugin.
Path:

1. Server sends scrambled challenge in initial Handshake.
2. Client computes `SHA256(password) XOR SHA256(SHA256(SHA256(password)) ‖ scramble)`.
3. Server replies with either `AuthMoreData(0x03)` (fast-path,
   cached server-side) or `AuthMoreData(0x04)` (full-auth needed —
   client must fall back to RSA-encrypted password).

Pre-shared-cache fast-path works end-to-end; RSA-over-insecure
full-auth path is parked behind a future feature flag.

## Wire-protocol surface

Frame builders + parsers live under `core.database.mysql.wire`:

| Module | Surface |
|---|---|
| `wire.frame` | `MysqlPacket { length: u24, seq: u8, payload }`; length-encoded integers + strings |
| `wire.frontend` | `handshake_response`, `com_query`, `com_ping`, `com_quit`, `com_init_db`, `com_reset_connection`, `com_stmt_prepare`, `com_stmt_execute`, `com_stmt_close`, `com_stmt_reset`, `auth_switch_response`, param encoders for the binary-EXECUTE protocol |
| `wire.backend` | `parse_initial_handshake`, `parse_ok`, `parse_err`, `parse_auth_switch`, `parse_auth_more`, `parse_column_def`, `parse_stmt_prepare_ok`, `parse_binary_row`, `classify(payload, capabilities) -> ServerPacketKind` |
| `wire.types` | Capability flags (`CLIENT_*`), status flags (`STATUS_*`), `COM_*` opcodes, `MY_TYPE_*` field-type bytes |

The capability set `SPINDLE_CLIENT_FLAGS` negotiates:
`CLIENT_PROTOCOL_41 | CLIENT_SECURE_CONNECTION | CLIENT_PLUGIN_AUTH
| CLIENT_PLUGIN_AUTH_LENENC | CLIENT_CONNECT_WITH_DB |
CLIENT_TRANSACTIONS | CLIENT_LONG_FLAG | CLIENT_DEPRECATE_EOF |
CLIENT_MULTI_RESULTS`.

## What's NOT in this module (yet)

* TLS `MtmRequired` mode — currently rejects at connect with
  "TLS_PENDING" adapter error; depends on `core.net.tls`
  integration.
* Binlog streaming consumer (`core.database.mysql.binlog`) — CDC
  events for downstream stream-processing.  Spec §6.3.4.
* Group replication topology detection — primary/secondary
  routing for read-preference workloads.  Spec §6.3.5.
* GTID tracking for resume-from-offset replication.

See [`internal/specs/database.md`](https://github.com/...) §6.3
for the full normative specification.
