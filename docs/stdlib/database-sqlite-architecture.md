---
title: Loom — SQLite engine deep-dive
description: Per-layer architecture of core.database.sqlite.native — VFS through public API, with module-level breakdown, data flow, invariants, and links to spec sections.
sidebar_position: 2
---

# Loom — SQLite engine deep-dive

This page complements the high-level overview in [`core.database`](./database)
with a layer-by-layer dissection of every module under
`core/database/sqlite/native/l*`.  Use it as a reading order when
ramping up on the engine itself (as opposed to the catalogue surface).

The design follows the eight-layer split from
[`internal/specs/sqlite-native.md`](../../specs/sqlite-native) §4: each
layer depends only on layers below it, and each layer has one stable
upward boundary.  Catalogues sit *beside* the engine — they are typed
specifications consumed by the layer that owns the corresponding
feature, not part of the call chain.

## Bird's-eye

```text
                ┌──────────────────────┐
                │  L7  Public API      │  Database, PreparedStatement
                │     (facade)         │  open_*, query_*, transaction
                └──────────┬───────────┘
                           ▼
                ┌──────────────────────┐
                │  L6  Session         │  Connection, SchemaCache,
                │     (per-conn state) │  bridge to/from L4 cursors
                └──────────┬───────────┘
                           ▼
                ┌──────────────────────┐
                │  L5  SQL frontend    │  lexer→parser→AST→resolver
                │     (text → bytecode)│  →planner→codegen
                └──────────┬───────────┘
                           ▼
                ┌──────────────────────┐
                │  L4  VDBE            │  Program (97 opcodes),
                │     (bytecode VM)    │  Register, Cursor table
                └──────────┬───────────┘
                           ▼
                ┌──────────────────────┐
                │  L3  B-tree          │  Cursor, Page, Balance,
                │     (keyed pages)    │  Overflow chain
                └──────────┬───────────┘
                           ▼
                ┌──────────────────────┐
                │  L2  Record          │  Varint, type affinity,
                │     (row codec)      │  collation, strict mode
                └──────────┬───────────┘
                           ▼
                ┌──────────────────────┐
                │  L1  Pager           │  Actor, page cache,
                │     (durable pages)  │  WAL + rollback journal
                └──────────┬───────────┘
                           ▼
                ┌──────────────────────┐
                │  L0  VFS             │  VfsProtocol, MemDb,
                │     (raw bytes)      │  Posix, Mock, locking, shm
                └──────────────────────┘
```

Read top-down for "what is the public surface", read bottom-up for
"what does an INSERT actually do".  The rest of this document walks
the layers bottom-up because that's the order in which guarantees
compose.

## L0 — virtual filesystem

**Responsibility.** Hide the operating system behind a minimal
durable-byte-storage protocol.  Everything above L0 only ever talks to
`VfsProtocol`.  This layer does NOT know about pages, transactions,
or SQL — only files and bytes.

**Files.** `core/database/sqlite/native/l0_vfs/` (9 files, 2.5 KLOC).

| File | Purpose |
|------|---------|
| `vfs_protocol.vr` | The `VfsProtocol` protocol definition (open/delete/access/full_pathname/randomness/sleep/current_time) plus `OpenFlags` bit field, `AccessKind` enum, `VfsError` |
| `posix_vfs.vr` | Production backend.  `pread`/`pwrite`/`fsync`/`fdatasync`, POSIX advisory locking; gated on `core.sys.locking` + `core.sys.durability` |
| `memdb_vfs.vr` | Pure-RAM implementation for `:memory:` databases and DST runs.  Page-aligned chunk store; deterministic |
| `mock_vfs.vr` | Fault-injection backend.  `pwrite_returns_short`, `fsync_fails`, scheduled delays — used by deterministic simulation testing |
| `locking.vr` | SQLite's five-state file-level lock state machine (UNLOCKED → SHARED → RESERVED → PENDING → EXCLUSIVE) plus the well-known byte offsets `PENDING_BYTE = 0x40000000`, `RESERVED_BYTE = 0x40000001`, `SHARED_FIRST = 0x40000002`, `SHARED_SIZE = 510` |
| `shm.vr` | Shared-memory file (`-shm`) for WAL mode; xShmMap / xShmLock / xShmBarrier |
| `clock.vr` | xCurrentTime / xCurrentTimeInt64 surfaces; see catalogue [`vfs_xcurrenttime_api`](#) |
| `registry.vr` | Named-VFS registry (`sqlite3_vfs_register`); resolves the VFS chain at open time |
| `mod.vr` | Public re-exports |

**Upward boundary.**  `SqliteFile` (an opened-file handle) plus the
`VfsProtocol` instance.  L1 acquires both at connection-open time and
keeps them for the connection's lifetime.

**Invariants.**
- A file handle never outlives its VFS instance.
- Locking transitions follow the linear sequence in `locking.vr`;
  illegal jumps (e.g. `SHARED → EXCLUSIVE` directly) panic in debug,
  return `VfsError` in release.
- `xRandomness` must produce non-deterministic bytes for production
  use; the catalogue [`vfs_xrandomness_api`](#) classifies sources by
  quality so the production `PosixVfs` rejects mock or low-quality
  entropy.

**Run-tests proven.**
- `vcs/specs/L2-standard/database/sqlite/l0_vfs/memdb_open_write_read.vr`
  — open in-memory file, write 128 bytes at offset 0 and offset 4096,
  read both back, verify byte-exact, close.

## L1 — pager (actor)

**Responsibility.** Turn raw byte storage into durable, transactional
*pages*.  Owns the page cache, the WAL or rollback journal, and the
checkpoint loop.  Everything above L1 sees pages — never bytes.

**Files.** `core/database/sqlite/native/l1_pager/` (12 files, 2.4 KLOC).

| File | Purpose |
|------|---------|
| `pager.vr` | Public surface — `Pager.read_page(pgno)`, `Pager.write_page(pgno, bytes)`, `Pager.begin_tx`, `Pager.commit`, `Pager.rollback` |
| `actor.vr` | The pager runs as a supervised actor.  Concurrent readers share a snapshot; writes serialise through the mailbox |
| `page_cache.vr` | LRU cache backed by `core.mem.arena` with CBGR generational tags so a stray cursor past restart fails closed |
| `db_header.vr` | The 100-byte SQLite database file header (`magic`, `page_size`, `file_change_counter`, `database_size`, `freelist_trunk`, `application_id` at offset 68, `user_version` at offset 60, etc.).  Offsets pin to catalogues [`application_id_pragma`](#) and [`user_version_pragma`](#) |
| `recovery.vr` | Hot-journal detection and rollback on connection-open.  See [`hot_journal_detector`](#) catalogue |
| `checkpointer.vr` | WAL-mode checkpoint loop.  Runs as sibling actor with backpressure via mailbox depth |
| `savepoint.vr` | SAVEPOINT / RELEASE / ROLLBACK TO bookkeeping inside the pager |
| `snapshot.vr` | sqlite3_snapshot_get / _open implementation; plumbs to [`snapshot_get_open_api`](#) |
| `journal/wal.vr` | WAL frame layout (24-byte frame header + 8-byte file header) — encoded per [`wal_frame_layout`](#) |
| `journal/rollback.vr` | Rollback-journal layout — encoded per [`journal_header_api`](#) |
| `mod.vr` | Public re-exports |

**Upward boundary.**  `Page` — a borrowed slice of bytes plus its page
number plus a generation stamp.  L2 reads/writes records by page; L3
arranges pages into b-trees.

**Invariants.**
- A `Page` borrowed for read remains valid until the pager's
  transaction boundary, even if checkpointing rotates underlying
  storage — the CBGR generation tag detects use-after-recycle.
- WAL frame checksums (CRC32 from `core.security.hash.crc32`) catch
  partial-write corruption.
- Hot-journal detection runs before the first read on every open.

**Catalogues that pin behaviour.**  [`pager_state_machine`](#),
[`mmap_region_api`](#), [`checkpoint_frame_range`](#),
[`journal_mode_pragma_api`](#), [`wal_index`](#), [`walblock`](#),
[`subjournal_api`](#).

## L2 — record codec

**Responsibility.** Encode/decode SQLite's row record format.  Reads a
sequence of bytes and produces a list of typed register values; writes
them back.

**Files.** `core/database/sqlite/native/l2_record/` (7 files, 1.0 KLOC).

| File | Purpose |
|------|---------|
| `record.vr` | The record header parser/builder; varint-prefixed type codes followed by raw payload bytes |
| `varint.vr` | SQLite varint codec (1..9 bytes; high-bit continuation).  Round-trip-tested against C-SQLite vectors in `varint_roundtrip.vr` |
| `affinity.vr` | Type affinity classifier (TEXT / NUMERIC / INTEGER / REAL / BLOB) per §3.1; mirrors catalogue [`affinity_matrix_api`](#) |
| `type_coercion.vr` | Affinity-driven implicit conversion (TEXT→NUMERIC for arithmetic; INTEGER→TEXT for concat); 7-way classifier |
| `collation.vr` | `Collation` protocol; ships BINARY, NOCASE, RTRIM in-tree |
| `strict.vr` | STRICT-table column-type enforcement; rejects values that don't match the declared type |
| `mod.vr` | Public re-exports |

**Upward boundary.**  `Record` — an immutable row, plus
`RecordBuilder` for assembly.  L3 stores records inside b-tree cells.

**Invariants.**
- Round-trip: `decode(encode(r)) ≡ r` for every well-formed record.
  Property-tested in `vcs/specs/L2-standard/database/sqlite/l2_record/`.
- Varint never produces an encoding longer than 9 bytes; never
  shorter than the canonical minimum.
- Strict-mode rejects a value if and only if affinity coercion would
  have changed it.

**Catalogues that pin behaviour.**  [`varint_encode_api`](#),
[`serial_type_api`](#), [`affinity_matrix_api`](#),
[`numeric_affinity_coerce_api`](#), [`collation_policy_api`](#),
[`text_to_int_strict_api`](#).

## L3 — B-tree

**Responsibility.** Arrange pages into ordered keyed structures.
Owns cursors that scan forward / backward / seek by key, plus the
balance algorithm that splits and merges pages on insert/delete.

**Files.** `core/database/sqlite/native/l3_btree/` (7 files, 1.4 KLOC).

| File | Purpose |
|------|---------|
| `btree.vr` | Public `Btree` surface — `open_table(rootpgno)`, `cursor_open`, `cursor_close` |
| `cursor.vr` | `Cursor.seek_ge(key)`, `Cursor.next`, `Cursor.prev`, `Cursor.row()`, `Cursor.insert(key, payload)`, `Cursor.delete()`, `Cursor.close` |
| `page_layout.vr` | The 4-cell-kind page format: leaf-table (0x0D), interior-table (0x05), leaf-index (0x0A), interior-index (0x02) |
| `balance.vr` | The 3-strategy balancer (Quick / Deeper / Nonroot) per [`btree_balance_strategy`](#) |
| `overflow.vr` | Cell-payload overflow chain.  Min/max-local thresholds match the spec formula |
| `integrity.vr` | `PRAGMA integrity_check` walker — 8 checks, severity 0..5 |
| `mod.vr` | Public re-exports |

**Upward boundary.**  `Cursor` — a stateful position inside a b-tree;
opaque to the VDBE except via the cursor methods.

**Invariants.** All discharged by SMT in the L2 conformance suite:
- B-tree depth never exceeds `log_minfanout(table_size)`.
- After `balance()`, all leaf pages have ≥ min-local fill or are root.
- Overflow chains are acyclic (encoded in `core.collections.btree`).
- Cell ordering is total: `key(cell[i]) < key(cell[i+1])` per the page's
  collation.

**Catalogues that pin behaviour.**  [`btree_balance_invariant`](#),
[`btree_balance_strategy`](#), [`btree_cell_parse_api`](#),
[`btree_seek_op_codes`](#), [`overflow_page_api`](#),
[`master_btree_meta`](#), [`integrity_walker_api`](#),
[`bloom_filter_api`](#).

## L4 — VDBE

**Responsibility.** Run the bytecode programs L5 emits.  A
register-SSA virtual machine with **97 opcodes** (vs 147 in C-SQLite —
the deltas are codepoints we don't yet generate, not opcodes that map
to behaviour).

**Files.** `core/database/sqlite/native/l4_vdbe/` (7 files, 3.2 KLOC).

| File | Purpose |
|------|---------|
| `program.vr` | The compiled bytecode container — array of opcodes, constant pool, parameter map, cursor descriptors |
| `opcode.vr` | The 97-variant `Op` enum.  Each variant carries its operand register/jump-target encoded inline |
| `register.vr` | The `Register` value type — `Null` / `Int(Int64)` / `Real(Float)` / `Text(Text)` / `Blob(Bytes)` plus `Mem` flags from [`vdbe_register_model`](#) |
| `cursor_table.vr` | The per-statement cursor table — N slots indexed by `cur_idx`; bridges to L3 cursors via [`cursor_table.vr`](#) |
| `interpreter.vr` | The step-based fetch-decode-execute loop.  `step(&mut VdbeState) → StepResult` returns `Done` / `Row` / `Yield` / `Error` |
| `optimizer.vr` | Bytecode-level peephole optimisation; inert today |
| `mod.vr` | Public re-exports |

**Upward boundary.**  `VdbeState` (program counter + register file +
cursor table) plus the `step()` driver.  L6 calls `step()` and gets
`Row(reg_start, n_cols)` for each result row.

**StepResult shape** (mirrored in catalogue [`stmt_busy_api`](#)):

```verum
public type StepResult is
    | Done                       // OP_Halt(0) reached
    | Row(reg_start: Int, n_cols: Int)
    | Yield                      // coroutine boundary; caller re-enters
    | ExecError(code: Int, msg: Text);
```

**Invariants.**
- The interpreter never panics on a malformed program — invalid
  register references / out-of-range jumps return `ExecError`.
- Halt-with-error always rolls back the active transaction (the
  invariant lives in L1's actor protocol).

**Catalogues that pin behaviour.**  [`vdbe_register_model`](#),
[`vdbe_subprogram_api`](#), [`explain_opcode_dump`](#),
[`bytecode_vtab_row_shape`](#), [`progress_handler_api`](#).

## L5 — SQL frontend

**Responsibility.** Turn SQL text into a VDBE program.  The classical
six-pass pipeline: **lexer → parser → AST → resolver → planner →
codegen**.

**Files.** `core/database/sqlite/native/l5_sql/` (15 files, 7.5 KLOC).

| File | Purpose |
|------|---------|
| `lexer.vr` | Hand-written DFA tokeniser; produces `Token` with span; understands keywords, identifiers, numeric literals, single-quoted strings, double-quoted identifiers, brackets, parameters (`?`, `?N`, `:name`, `@name`, `$name`) |
| `ast.vr` | The full AST: `Stmt` 16-variant (SELECT / INSERT / UPDATE / DELETE / DDL / TX / PRAGMA / etc), `Expr` 30-variant, `JoinClause`, `WindowFrame`, `WithClause` |
| `parser/stmt.vr` | Top-level statement dispatch |
| `parser/ddl.vr` | CREATE / DROP / ALTER (table, index, view, trigger) |
| `parser/dml.vr` | INSERT / UPDATE / DELETE / RETURNING |
| `parser/select.vr` | SELECT (FROM, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT, compound) |
| `parser/expr.vr` | Pratt parser for expressions; precedence table mirrors [`expr_precedence_api`](#) |
| `parser/misc.vr` | PRAGMA, BEGIN / COMMIT / ROLLBACK, EXPLAIN |
| `parser/token_stream.vr` | Lookahead token cursor |
| `resolver.vr` | Name resolution: column references, table aliases, schema lookup; produces fully-resolved AST with affinities and column types |
| `planner.vr` | Cost-based planner.  Picks index vs scan, join order, materialisation strategy.  Mirrors catalogues [`where_loop_cost_model`](#), [`subquery_materialization_api`](#), [`automatic_index_pragma`](#) |
| `codegen.vr` | The 2.5 KLOC code-emitter.  Walks the resolved AST and emits opcodes with relocatable jump targets |
| `compile.vr` | Top-level pipeline driver — `compile(sql) → Result<Program, CompileError>` |
| `mod.vr` | Public re-exports |

**Upward boundary.**  `Program` (a complete VDBE program) plus
`CompileError` (structured diagnostics).

**Catalogues that pin behaviour.**  [`numeric_literal_parser_api`](#),
[`keyword_check_api`](#), [`identifier_quote_api`](#),
[`expr_precedence_api`](#), [`expr_affinity_resolver`](#),
[`expr_const_folding`](#), [`expr_decorrelation`](#),
[`expr_in_subquery_api`](#), [`union_all_flatten_api`](#),
[`subquery_materialization_api`](#), [`pushdown_filter_api`](#),
[`prefix_like_opt`](#), [`compound_select_api`](#),
[`window_frame_api`](#), [`window_partition_api`](#),
[`cte_api`](#), [`recursive_cte_queue`](#),
[`upsert_api`](#), [`returning_clause_api`](#),
[`generated_col_api`](#), [`virtual_column_api`](#),
[`partial_index_api`](#), [`expr_index_api`](#),
[`alter_table_api`](#), [`view_variants_api`](#),
[`trigger_action_api`](#), [`conflict_clause_api`](#),
[`limit_clause_validator`](#), [`order_by_term_api`](#),
[`like_escape_clause_api`](#), [`null_safe_compare_op_api`](#),
[`between_op_api`](#), [`null_op_api`](#),
[`glob_pattern_api`](#), [`regexp_fn_api`](#),
[`iif_three_arg_fn`](#), [`format_fn`](#).

## L6 — session

**Responsibility.** Per-connection state — the open VFS file, pager
handle, schema cache, transaction state, prepared-statement cache.

**Files.** `core/database/sqlite/native/l6_session/` (5 files, 1.0 KLOC).

| File | Purpose |
|------|---------|
| `connection.vr` | `Connection` aggregate: `SqliteFile` + `Pager` + `SchemaCache` + `TxState` + per-conn pragma bag |
| `statement.vr` | `Statement` — wraps a compiled `Program` plus its cursor table; bridges to/from `Connection` cursors |
| `schema_cache.vr` | In-memory catalog of tables / indexes / triggers / views; rebuilt on DDL; per-tx snapshot |
| `bridge.vr` | `seed_cursors_from_connection` / `writeback_cursors_to_connection` — synchronise cursor positions across multi-statement transactions |
| `mod.vr` | Public re-exports |

**Upward boundary.**  `Connection` and `Statement` — the abstractions
L7 wraps in its public types.

**Transaction state.**  `TxState ∈ { Autocommit, Deferred, Immediate, Exclusive }`.
Transitions match SQLite's classic semantics:

```text
Autocommit  ──BEGIN──────────▶ Deferred
Autocommit  ──BEGIN IMMEDIATE▶ Immediate (reserves write lock)
Autocommit  ──BEGIN EXCLUSIVE▶ Exclusive (acquires exclusive lock)
Deferred    ──first write────▶ Immediate
Immediate   ──schema change──▶ Exclusive
*           ──COMMIT─────────▶ Autocommit
*           ──ROLLBACK───────▶ Autocommit
```

**Catalogues that pin behaviour.**  [`txn_state_api`](#),
[`db_filename_api`](#), [`db_readonly_api`](#),
[`db_release_memory_per_conn_api`](#), [`db_cacheflush_api`](#).

## L7 — public API

**Responsibility.** The thin facade an application sees.  Maps L6
errors to user-facing `DbError`, holds capability gates
(`CmRead` / `CmWrite` / `CmAdmin`), and provides ergonomic
`execute` / `query_first_row` / `query_all` shortcuts on top of the
prepare-step-finalize cycle.

**Files.** `core/database/sqlite/native/l7_api/` (2 files, 329 LOC).

| File | Purpose |
|------|---------|
| `database.vr` | `Database` aggregate; `open_memory_db`, `open_readonly`, `open_readwrite`, `open_admin`; the high-level surface |
| `mod.vr` | Public re-exports |

**Upward boundary.**  `Database`, `PreparedStatement`, `DbError`.
Everything an application imports lives here.

## How an INSERT flows (bottom-up)

To pin "what does the engine actually do":

1. **L7** receives `db.execute("INSERT INTO t VALUES (1)")`.  The
   capability gate checks the connection is `CmWrite` or `CmAdmin`.
2. **L6** acquires the prepared-statement cache; if the SQL is not
   cached, calls `compile(sql)` on **L5**.
3. **L5.lexer** tokenises `INSERT`, `INTO`, `t`, `VALUES`, `(`, `1`,
   `)`.
4. **L5.parser** assembles `Stmt::Insert(InsertStmt { … })` into the
   AST.
5. **L5.resolver** binds `t` to the schema-cached table id, resolves
   column types, applies affinity to literal `1`.
6. **L5.planner** picks "rowid path" (no index needed for a single
   literal-value insert) and produces a small plan.
7. **L5.codegen** emits a VDBE `Program` of ~10 opcodes:
   `Init` / `Transaction(write)` / `Integer(1, r0)` / `MakeRecord(r0..r0, "i")` /
   `Insert(cursor, key, payload)` / `Halt(0)`.
8. **L6.bridge** seeds cursors from the connection; **L4.interpreter**
   runs `step()` until `Done` or `ExecError`.
9. **L4.opcodes** that touch storage (`Insert`) call into **L3.cursor**
   `cursor.insert(key, payload)`.
10. **L3.cursor** finds the right page via the b-tree, calls
    **L3.balance** if the page would overflow, and dirties the page
    in **L1.page_cache**.
11. **L1.pager** logs the dirty page to **L1.journal** (WAL frame
    or rollback page) and queues the write through the actor mailbox.
12. **L0.posix_vfs** receives the `pwrite` + `fsync` calls when the
    transaction commits.
13. **L4** returns `Done` to **L6** which writes back cursor positions
    to the connection.
14. **L7** maps `Done` to `Result::Ok(())`.

If anything fails at L1..L4, the error bubbles up as `ExecError(code,
msg)`, gets wrapped by L6 as `StmtError`, and L7 surfaces it as
`DbError::DbStmtError(_)` (or one of the more specific variants if the
code matches a well-known class — `DbConstraint`, `DbBusy`,
`DbReadonly`).

## Testing strategy per layer

| Layer | Smoke (typecheck-pass) | Run-tests | Property tests | Differential vs C-SQLite |
|-------|-----------------------|-----------|----------------|--------------------------|
| L0 | ✓ (catalogues per VFS method) | ✓ `memdb_open_write_read.vr` | scaffolded, no harness yet | — |
| L1 | ✓ | ✓ `page_roundtrip.vr` (single page); multi-page demoted typecheck-pass (interpreter perf) | journal-replay vectors | — |
| L2 | ✓ (varint, affinity, collation, …) | ✓ `varint_roundtrip.vr`, `crc32_vectors.vr` | varint round-trip | byte-vectors against C |
| L3 | ✓ | — | scaffolded | — |
| L4 | ✓ (per opcode) | — | — | — |
| L5 | ✓ (per SQL feature) | — | — | `vcs/differential/sqlite/cross-impl/sql/` (4 SQL files today) |
| L6 | ✓ | — | — | — |
| L7 | ✓ | — | — | — |

The "first end-to-end run-test that drives L5 → L4 → L3 → L1 → L0
through `CREATE TABLE` + `INSERT` + `SELECT`" was historically blocked
on the VBC codegen non-determinism (#143).  Determinism was fixed
across commits `0723ad43` (`pipeline.rs`) and `82303f94`
(`codegen/mod.rs` + `phases/vbc_codegen.rs`) — see the [stdlib
database doc](./database#status-2026-04-25--honest) for the seven
sort-by-stable-key sites.  After determinism, four further
deterministic codegen layers were peeled in sequence:

1. **`FilterMapIter.clone not found`** — closed in `506135ad` by
   adding 14 Clone implementations for forward-declared iterator
   adapters in `core/base/iterator.vr` (`MappedIter`, `FilterIter`,
   `FilterMapIter`, `FlatMapIter`, `TakeIter`, `SkipIter`,
   `TakeWhileIter`, `SkipWhileIter`, `ChainIter`, `ZipIter`,
   `EnumerateIter`, `StepByIter`, `InspectIter`, `FuseIter`).

2. **Thin-wrapper null-deref** in `open_admin` / `open_readonly` /
   `open_readwrite` — worked around in `c4dfffd5` by inlining the
   `open_memory_db` body directly into each mode-specific opener.

3. **Variant-tag layout drift on stdlib `Result` match** — captured
   as a regression repro in
   `vcs/specs/L0-critical/_codegen_regressions/result_match_stdlib_l6_open_memory.vr`.
   Without an explicit `mount l1_pager.{Pager}` in the consumer, the
   match `{ Ok(c) => …, Err(e) => … }` over a stdlib-returned
   `Result<Connection, ConnectionError>` deterministically takes the
   `Err` arm even when the producer returned `Ok`.  Transitive-import
   workaround makes the test green; durable fix tracked as #146
   (layout-invariant verification pass).

4. **Method-dispatch transitivity for impl blocks** — when stdlib
   defines `implement Database { fn execute(...) ... }` and the
   compiler's `compile_module_items_lenient` cannot resolve
   cross-module references in the body (e.g. `Database.execute`
   calls `parse_one` from `l5_sql`), the impl-block method gets
   silently dropped.  The runtime dispatch then panics with
   `method 'Database.execute' not found on value`.

   Commit `444dd00d` promoted these silent drops from `debug`-level
   tracing to `warn`-level emissions so every dropped impl-block
   method now surfaces in normal CI / dev runs as

   ```text
   WARN [lenient] SKIP Database.execute: undefined function:
        parse_one (in function Database.execute) — runtime calls to
        this method will panic 'method 'Database.execute' not found
        on value'.  Add the missing dependency to the caller's mount
        list or fix the cross-module reference in Database stdlib.
   ```

   A typical L7-touching test currently emits ~93 such warnings —
   each is a fix-once, deterministic stdlib-hygiene item.  The
   most-common cluster is `undefined variable: None` (`core.base.maybe`
   is intentionally excluded from `ALWAYS_INCLUDE` due to historical
   user-fixture collision — see the inline comment in
   `crates/verum_compiler/src/pipeline.rs::ALWAYS_INCLUDE`).

In the meantime, **L1's `page_roundtrip.vr`** is the deepest
end-to-end run-test that exists, exercising L0+L1 round-trip.

## See also

- [`core.database`](./database) — high-level overview, capability
  levels, public API.
- [`internal/specs/sqlite-native.md`](../../specs/sqlite-native) —
  the 2,943-line specification this engine implements.
- [`crates/verum_compiler/tests/sqlite_native_naming_hygiene.rs`](#) —
  the guardrail Rust test that prevents stdlib-name shadowing inside
  catalogues.
