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

:::caution The union form does not compile yet

The comma form is implemented; the union form is not. `Resource with
[Read, Execute]` parses, `Resource with [Read | Execute]` reports
`unclosed delimiter ']'` — the parser reads one identifier per
capability slot and stops at the `|`. The alternation is in the grammar
(`capability_or_expr`), so this is a gap in the parser, not a decision
against the feature; it is tracked as A78 in the tech-debt register.
Write the requirement as a comma list, or as two overloads, until it
lands.

:::

## Declaring refined types

Use `type` to name a particular attenuation:

```verum
type DatabaseFull     is Database with [Read, Write, Admin];
type DatabaseReadOnly is Database with [Read];
type DatabaseTxScope  is Database with [Read, Write, Transaction];
```

:::note The attenuation is enforced, and the name is a plain identifier
Measured 2026-09-04. `with [...]` is real and ENFORCED — a call to a
method the attenuation drops is refused:

    fn f(x: FileRead) -> Unit { x.write_all("x") }
      -> error<E306>: capability violation: method `write_all` on
                     `File` requires `WriteOnly` capability

A grouped, dotted declaration name — `type File.Read is ...` — is not
available: `type_def` takes a plain `identifier`, not a path
(`grammar/verum.ebnf`), and the parser agrees, reporting `error<E044>:
expected `is` keyword in type definition`. Prefix instead of grouping —
`FileRead`, `DatabaseReadOnly`, `DbAdmin` — which is what `core/` and
`core-tests/` already write.
:::

The prefix is a naming convention only; it has no runtime meaning. What
carries the meaning is the capability list.

A function boundary can then speak in the narrow name:

```verum
pub fn rates(db: DatabaseReadOnly) -> List<Rate> {
    db.query("SELECT ...").rows()
}

pub fn migrate(db: &mut DatabaseFull)
    using [MigrationLog]
{
    with_transaction(db, |c| {
        c.execute(&"ALTER TABLE ...".into())?;
        Ok(())
    })?;
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

A `Mutation` cannot accept a `DatabaseReadOnly` — the protocol bound
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
type FileRead is File with [Read];

fn count_lines(f: FileRead) -> Int {
    f.lines().count()
    // f.write(...) is a type error here.
}
```

### Admin-only migration

```verum
type DbAdmin is Database with [Read, Write, Admin];

pub fn migrate_v3(db: DbAdmin) using [Logger] {
    db.write("CREATE TABLE ...");
    db.write("ALTER ROLE ...");
}
```

A non-admin caller **cannot even name the function's argument type**
without having `[Read, Write, Admin]` in scope; capability types
surface privilege failures at the function boundary.

### Minimal auth-safe logger

```verum
type LoggerNoAuth is Logger with [Logging];
// Logger is presumed to potentially carry [Logging, Metrics, Config, Auth]

fn fire_and_forget(msg: Text, log: LoggerNoAuth) {
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
