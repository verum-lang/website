---
sidebar_position: 28
title: Capability Types
description: Type-safe capability attenuation with `T with [Read, Write, ...]`.
---

# Capability Types

Verum has two complementary dependency-injection mechanisms:

- **Contexts** (`using [Database, Logger]`) — *which* resources a
  function needs.
- **Capabilities** (`Database with [Read]`) — *what* a function is
  allowed to do with a resource it already has.

Capability types narrow a type's effective API at the type level,
before any call site. A `Database with [Read]` **cannot** call
`.write(...)` — not because of a runtime check, but because the method
resolution refuses to find the symbol.

## Syntax

```ebnf
capability_type = path_type , 'with' , capability_list ;
capability_list = '[' , capability_item , { ',' , capability_item } , ']' ;
capability_item = capability_name | capability_or_expr ;
capability_or_expr = capability_name , '|' , capability_name , { '|' , capability_name } ;
```

Example:

```verum
fn stats(db: Database with [Read]) -> Stats {
    // db.query(...) works (Read capability provides .query)
    // db.write(...) is rejected at type check
}
```

## The built-in capability vocabulary

From the grammar:

```
Read | Write | ReadWrite | Admin | Transaction
Network | FileSystem | Query | Execute
Logging | Metrics | Config | Cache | Auth
```

Any `identifier` can serve as a custom capability, so user code is not
restricted to the built-in list — the built-ins are merely the
compiler-known conventions that the standard library uses.

## Subtyping

A capability type with a **superset** of capabilities is a subtype of
one with fewer:

```
T with [A, B, C]  <:  T with [A, B]  <:  T with [A]  <:  T with []
```

This is the basis of **automatic attenuation** at call sites. You never
write a conversion — the compiler checks that whatever capabilities the
callee demands are a subset of those the caller supplies.

```verum
fn audit(db: Database with [Read, Write, Admin])
    using [AuditLog]
{
    log_stats(db);      // calls fn log_stats(db: Database with [Read])
    migrate(db);        // calls fn migrate(db: Database with [Read, Write])
    purge_deleted(db);  // calls fn purge(db: Database with [Admin])
}
```

All three inner calls receive a subtype of what they demand.

## Composition via union

A single capability item can be a **union** with `|`, meaning "any of
these capabilities suffices":

```verum
fn log_access(resource: Resource with [Read | Execute]) { ... }
```

`Read | Execute` is a single capability slot satisfied by either. Union
in a capability list is distinct from listing two separate
capabilities:

```verum
[Read | Execute]       // one slot, one of the two required
[Read, Execute]        // two slots, both required
```

## Declaring refined types

Use `type` to name a particular attenuation:

```verum
type Database.Full     is Database with [Read, Write, Admin];
type Database.ReadOnly is Database with [Read];
type Database.TxScope  is Database with [Read, Write, Transaction];
```

The dotted name is a nested path; the dot has no runtime meaning —
it's purely a naming convention to group related refinements.

A function boundary can then speak in the narrow name:

```verum
pub fn rates(db: Database.ReadOnly) -> List<Rate> {
    db.query("SELECT ...").rows()
}

pub fn migrate(db: Database.Full)
    using [MigrationLog]
{
    db.begin();
    db.write("ALTER TABLE ...");
    db.commit();
}
```

## Interaction with the context system

Contexts and capabilities compose orthogonally:

```verum
fn page(req: Request) -> Response
    using [Database with [Read], Logger, Analytics if cfg.feature_flag]
{
    // Database injected via `using` (DI)
    // Capabilities narrow it (type-level)
    // Analytics is conditional on a feature flag
}
```

The `using [...]` clause **always** wins for injection — the compiler
finds the most general implementation matching the capability demand
and automatically attenuates.

## Stdlib protocols that respect capabilities

Protocols in the standard library are generic over their capability
demand. The common pattern:

```verum
type Query is protocol {
    fn run<D: Database with [Read]>(&self, db: D) -> Rows;
}

type Mutation is protocol {
    fn apply<D: Database with [Write]>(&self, db: D) -> RowsAffected;
}
```

A `Mutation` cannot accept a `Database.ReadOnly` — the protocol bound
forbids it.

## Capability assertion at call sites

For cross-boundary APIs (FFI, untyped context boundaries), the
**`assert_capability`** intrinsic performs a one-time runtime check
and narrows the type:

```verum
fn from_ffi(raw: RawHandle) -> Database with [Read, Write] {
    let db = Database.from_raw(raw);
    assert_capability!(db, [Read, Write]);   // panics if missing
    db
}
```

Inside normal Verum code this escape hatch is rarely needed — the
static subtype relation carries capabilities through.

## Relationship with `&T`, `&mut T`, and tiers

Capability attenuation is independent of reference tiers. You can
freely combine them:

```verum
fn read_rows(db: &(Database with [Read])) -> List<Row> { ... }
fn cb_tx(db: &checked mut (Database with [Read, Write, Transaction])) { ... }
```

When the capability list is on a reference target, parenthesise:
`&(T with [R])`. The unparenthesised form `&T with [R]` parses as
"reference to T, then extend with [R]" — two different syntactic
positions, same net effect, but explicit parentheses are preferred.

## Examples

### Read-only file handle

```verum
type File.Read is File with [Read];

fn count_lines(f: File.Read) -> Int {
    f.lines().count()
    // f.write(...) is a type error here.
}
```

### Admin-only migration

```verum
type Db.Admin is Database with [Read, Write, Admin];

pub fn migrate_v3(db: Db.Admin) using [Logger] {
    db.write("CREATE TABLE ...");
    db.write("ALTER ROLE ...");
}
```

A non-admin caller **cannot even name the function's argument type**
without having `[Read, Write, Admin]` in scope; capability types
surface privilege failures at the function boundary.

### Minimal auth-safe logger

```verum
type Logger.NoAuth is Logger with [Logging];
// Logger is presumed to potentially carry [Logging, Metrics, Config, Auth]

fn fire_and_forget(msg: Text, log: Logger.NoAuth) {
    log.info(msg);
    // log.auth_token() is a type error
}
```

## Grammar

```ebnf
capability_type     = path_type , 'with' , capability_list ;
capability_list     = '[' , capability_item , { ',' , capability_item } , ']' ;
capability_item     = capability_name | capability_or_expr ;
capability_or_expr  = capability_name , '|' , capability_name
                    , { '|' , capability_name } ;
capability_name     = 'Read' | 'Write' | 'ReadWrite' | 'Admin' | 'Transaction'
                    | 'Network' | 'FileSystem' | 'Query' | 'Execute'
                    | 'Logging' | 'Metrics' | 'Config' | 'Cache' | 'Auth'
                    | identifier ;
```

## See also

- **[Context System](/docs/language/context-system)** — `using [...]`, DI.
- **[References](/docs/language/references)** — three-tier references.
- **[Types](/docs/language/types)** — where capability types fit in the type grammar.
- **[`stdlib/security`](/docs/stdlib/security)** — capability-aware primitives.
