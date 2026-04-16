---
sidebar_position: 9
title: Context System (DI)
description: Refactor a dirty globals-soup function into clean, testable, context-driven code.
---

# Tutorial: Context System

Verum's context system replaces the usual soup of global state,
thread-locals, and dependency-injection frameworks with a **typed,
explicit, compile-time-checked** mechanism.

This tutorial takes a function written in the "implicit globals"
style and refactors it step by step. By the end you'll have a clean
function whose dependencies are all in the signature — and tests
that don't need any mocking framework.

**Time: 30 minutes.**

**Prerequisites:** [Hello, World](/docs/getting-started/hello-world).

## The starting point — a familiar mess

```verum
// BAD CODE — illustrative only

static mut GLOBAL_LOGGER: Maybe<Shared<Logger>> = Maybe.None;
static mut GLOBAL_DB:     Maybe<Shared<Database>> = Maybe.None;

fn order_total(order_id: Int) -> Float {
    // implicit globals:
    let logger = unsafe { GLOBAL_LOGGER.clone().unwrap() };
    let db     = unsafe { GLOBAL_DB.clone().unwrap() };

    logger.info(f"computing total for order {order_id}");
    let order  = db.find_order(order_id).unwrap();
    let total  = order.items.iter().map(|i| i.price * i.quantity).sum();
    logger.info(f"order {order_id} total = {total}");
    total
}
```

Problems:

- **`static mut`** — implicit state, hidden from the signature, hostile
  to testing.
- **`unsafe`** to access it — the compiler has no idea what's happening.
- **`.unwrap()`** — if the globals aren't initialised, the function
  panics at runtime.
- **Testing requires a global reset** — every test might clobber state.

Let's fix it.

## Step 1 — Identify the dependencies

Two: `Logger` and `Database`. Make them **contexts**:

```verum
context Logger {
    fn info(&self, msg: Text);
    fn warn(&self, msg: Text);
    fn error(&self, msg: Text);
}

context Database {
    fn find_order(&self, id: Int) -> Maybe<Order>;
    fn save(&self, order: &Order) -> Result<(), DbError>;
}
```

`context` is a Verum keyword for a DI-injectable type. It acts as
both a protocol (implementations satisfy the methods) and a context
(functions request it).

## Step 2 — Declare the dependencies in the signature

```verum
fn order_total(order_id: Int) -> Result<Float, Error>
    using [Database, Logger]
{
    Logger.info(f"computing total for order {order_id}");
    let order  = Database.find_order(order_id)
        .ok_or(Error.OrderNotFound(order_id))?;
    let total  = order.items.iter()
        .map(|i| i.price * i.quantity)
        .sum();
    Logger.info(f"order {order_id} total = {total}");
    Result.Ok(total)
}
```

No globals. No `unsafe`. No `.unwrap()`. The function signature
now tells the whole truth about what the function needs.

## Step 3 — Implement the contexts

```verum
type ConsoleLogger is { prefix: Text };

implement Logger for ConsoleLogger {
    fn info(&self, msg: Text) {
        print(f"[{self.prefix} INFO] {msg}");
    }
    fn warn(&self, msg: Text) {
        print(f"[{self.prefix} WARN] {msg}");
    }
    fn error(&self, msg: Text) {
        print(f"[{self.prefix} ERR] {msg}");
    }
}

type MemoryDatabase is {
    orders: Shared<Mutex<Map<Int, Order>>>,
};

implement Database for MemoryDatabase {
    fn find_order(&self, id: Int) -> Maybe<Order> {
        self.orders.lock().await.get(&id).cloned()
    }
    fn save(&self, order: &Order) -> Result<(), DbError> {
        self.orders.lock().await.insert(order.id, order.clone());
        Result.Ok(())
    }
}
```

Two concrete implementations — one that logs to the console, one
that stores orders in memory. We could just as easily implement
`Logger` for a file logger, a syslog handler, or `/dev/null`.

## Step 4 — Provide at the entry point

```verum
fn main() using [IO] {
    let logger: Logger = ConsoleLogger { prefix: "app" };
    let db: Database   = MemoryDatabase {
        orders: Shared.new(Mutex.new(Map.new())),
    };

    provide Logger = logger in
    provide Database = db in {
        seed_test_data();
        match order_total(42) {
            Result.Ok(total)  => print(f"total: {total}"),
            Result.Err(e)     => print(f"error: {e}"),
        }
    }
}
```

`provide Context = value in { ... }` injects the context into the
block's scope. Inside, any function that declares `using [Context]`
finds the provided value.

## Step 5 — Tests, no mocking framework

```verum
// tests/order_test.vr
mount my_project.*;

type TestLog is {
    messages: Shared<Mutex<List<Text>>>,
};

implement Logger for TestLog {
    fn info(&self, msg: Text) {
        self.messages.lock().await.push(f"INFO: {msg}");
    }
    fn warn(&self, msg: Text) { }
    fn error(&self, msg: Text) { }
}

@test
fn test_order_total() {
    let log = TestLog { messages: Shared.new(Mutex.new(List.new())) };
    let db  = MemoryDatabase.seeded_with(vec![
        Order { id: 42, items: vec![
            Item { price: 10.0, quantity: 2 },
            Item { price: 5.0,  quantity: 3 },
        ]},
    ]);

    provide Logger = log.clone() in
    provide Database = db in {
        let total = order_total(42).unwrap();
        assert_eq(total, 35.0);
    }

    let messages = log.messages.lock().await.clone();
    assert_eq(messages.len(), 2);
    assert!(messages[0].contains("computing total"));
}
```

No `when(x).thenReturn(y)`. No `@MockBean`. No test fixture
inheritance hell. Just ordinary values and `provide`.

## Step 6 — Advanced: negative contexts for purity proofs

Pure functions can **declare what they refuse** to use:

```verum
using Pure = [!IO, !State<_>, !Random];

fn sum(xs: &List<Int>) -> Int using Pure {
    xs.iter().sum()
}
```

A caller that provides `IO` to `sum` is rejected at compile time.
This is how Verum encodes "pure code" without making purity a
second type system — pure is just "absent IO, State, Random".

## Step 7 — Advanced: conditional contexts

Opt-in features via compile-time flags:

```verum
fn fast_path(x: &Data)
    using [Database,
           Cache if cfg.enable_cache,
           Metrics if cfg.metrics]
{
    if cfg.enable_cache {
        if let Maybe.Some(v) = Cache.get(x.key) { return v; }
    }
    let result = Database.query(x);
    if cfg.metrics {
        Metrics.increment("db_hits");
    }
    result
}
```

Build without `--features cache` and the `Cache` requirement
disappears; build with it, and callers must provide a `Cache`.

## Step 8 — Advanced: multiple instances

Need two of the same context (e.g. primary + replica database)?

```verum
fn replicate(order: &Order)
    using [Database as primary, Database as replica]
{
    primary.save(order);
    replica.save(order);
}

// Provider:
provide Database as primary = primary_db in
provide Database as replica = replica_db in {
    replicate(&order);
}
```

Aliases disambiguate; each alias is its own name in the callee.

## What you learned

- How to **extract implicit state** into typed contexts.
- How `using [...]` makes dependencies part of the signature.
- How `provide` injects concrete implementations.
- How the context system makes **tests trivial** — just provide
  different values.
- How negative contexts (`!IO`) encode purity.
- How conditional contexts (`X if cfg.flag`) give feature-flag DI.
- How aliased contexts allow multiple instances.

## Where to go next

- **[language/context-system](/docs/language/context-system)** — the
  normative reference.
- **[language/capability-types](/docs/language/capability-types)** —
  `Database with [Read]` type-level capability attenuation.
- **[`stdlib/context`](/docs/stdlib/context)** — the `Provider`,
  `Scope`, and `ContextError` types.
- **[tutorials/async-pipeline](/docs/tutorials/async-pipeline)** —
  context propagation across async boundaries.
- **[tutorials/http-service](/docs/tutorials/http-service)** — a real
  service built context-first.
