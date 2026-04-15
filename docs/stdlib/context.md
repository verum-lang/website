---
sidebar_position: 1
title: context
description: Scopes, providers, async propagation — the implementation of `using` / `provide`.
---

# `core::context` — Dependency injection primitives

The runtime side of the language-level context system. Users interact
via `using [...]` and `provide ... = ... in { ... }`; the types here
are what the compiler lowers those constructs to, plus a typed API
for building your own providers.

| File | What's in it |
|---|---|
| `scope.vr` | `Scope`, `ContextScope` |
| `error.vr` | `ContextError` |
| `provider.vr` | `Provider<T>`, `ScopedProvider<T>`, `LazyProvider<T>`, `get_context`, `has_context` |
| `layer.vr` | `Layer` — declarative wiring of multiple contexts |
| `standard.vr` | standard contexts (`Logger`, `Clock`, `Random`, `IO`) re-exports |
| `mod.vr` | module entry |

See [Language → context system](/docs/language/context-system) for
the user-level guide.

---

## Two levels of DI

| Level | Resolution | Cost |
|---|---|---|
| **Static** (`@injectable` / `inject`) | compile time | 0 ns |
| **Dynamic** (`context Name` / `provide` / `using`) | runtime (task-local) | ~5–30 ns |

Static is faster and simpler — prefer it for singletons and
well-known backends. Dynamic is flexible — use it for request-scoped,
environment-dependent, or late-bound dependencies.

---

## Scopes

```verum
type Scope is
    | Singleton     // one instance per program
    | Request       // one instance per task tree
    | Transient;    // new instance per injection

type ContextScope is { scope: Scope, key: Text };
```

Used with the `@injectable` attribute:

```verum
@injectable(Scope.Singleton)
type ConnectionPool is { ... };

@injectable(Scope.Request)
type RequestId is (Text);

@injectable(Scope.Transient)
type RngInstance is { ... };
```

And via the static `inject` expression:

```verum
fn process(req: Request) {
    let pool: &ConnectionPool = inject ConnectionPool;
    let id: RequestId         = inject RequestId;     // fresh per task
    ...
}
```

---

## Error type

```verum
type ContextError is
    | NotProvided(Text)         // context requested but not provided
    | WrongType(Text, Text)     // expected vs found
    | StackOverflow             // provide stack exceeded CONTEXT_STACK_DEPTH
    | SlotOccupied              // a slot is already bound
    | SlotEmpty                 // a slot is empty when it shouldn't be
    | InvalidSlot;
```

---

## Providers

A `Provider<T>` is anything that can yield a `T` when a `provide`
scope requests it.

```verum
type Provider<T> is protocol {
    fn provide(&self) -> T;
}

type ScopedProvider<T> is {
    scope: Scope,
    builder: fn() -> T,
};

type LazyProvider<T> is {
    inner: OnceCell<T>,
    builder: fn() -> T,
};

lazy.get() -> &T
eager.get() -> T
```

### Runtime accessors

```verum
get_context<T>() -> Maybe<&T>
has_context<T>() -> Bool
get_context_mut<T>() -> Maybe<&mut T>        // when provided as mutable
```

These are what the compiler emits for calls like `Logger.info(...)`
inside `using [Logger]`.

---

## `Layer` — declarative wiring

Useful for organising many contexts at once:

```verum
type Layer is { ... };

Layer::new()
    .with_singleton::<Logger>(ConsoleLogger::new(LogLevel.Info))
    .with_request::<Database>(|| PostgresDatabase::connect(&db_url))
    .with_request::<RequestId>(|| RequestId::random())
    .with_transient::<Random>(|| Rng::from_os())
    .run(async_main())
    .await
```

Layers compose:

```verum
let app_layer = Layer::new()
    .merge(logging_layer)
    .merge(db_layer)
    .merge(metrics_layer);
```

---

## Async propagation rules

When a task spawns or suspends, what happens to its context stack?

| Event | Behaviour |
|---|---|
| `spawn task` | child clones the parent's current context stack |
| `.await` | context stack is preserved across suspension |
| generator `yield` / resume | stack snapshotted at yield, restored at resume |
| channel `send` / `recv` | **no** propagation (channels are data pipes) |
| `nursery { spawn ... }` | each child inherits the nursery's stack |
| `provide X = v in { … }` | `v` is installed for the duration of the block, then unbound |

These rules are implemented in [`runtime::ctx_bridge`](/docs/stdlib/runtime#ctx_bridge--runtime--context-bridge).

---

## Negative and transformed contexts

Advanced forms of `using [...]`:

```verum
// Negative — explicitly forbid IO in this scope.
fn pure_compute() using [!IO] { ... }

// Transformed — attenuate capabilities.
fn audit(db: &Database) using [Database.readonly()] { ... }

// Conditional — only requested if a cfg flag is set.
fn optionally_log() using [Logger if cfg.debug] { ... }

// Aliased — multiple contexts of the same type.
fn forward(msg: Msg) using [Database as primary, Database as replica] { ... }
```

---

## Standard contexts (`standard.vr`)

Frequently-used context types are re-exported:

| Context | Provides |
|---|---|
| `IO` | stdio, file, network capability |
| `Logger` | `trace`/`debug`/`info`/`warn`/`error` |
| `Clock` | `now()` (monotonic + wall), `elapsed(since)` |
| `Random` | `Rng` trait (uniform, gaussian, choice, shuffle) |
| `Database` | (user-provided backend; placeholder protocol) |
| `Cache` | `get`, `set`, `evict` |
| `Metrics` | `increment`, `record`, `histogram` |

Most of these are protocols — you provide a concrete implementation at
the top of your program.

---

## Example — layered wiring

```verum
fn main() using [IO] {
    let app_layer = Layer::new()
        .with_singleton::<Logger>(ConsoleLogger::new(LogLevel.Info))
        .with_singleton::<Clock>(SystemClock::new())
        .with_request::<Database>(|| connect_db())
        .with_request::<Metrics>(|| Metrics::tagged("req_id"));

    app_layer.run(async {
        let mut server = HttpServer::bind(&":8080").await?;
        server.serve(|req| handle(req)).await?;
        Result.Ok::<(), Error>(())
    }).await
    .expect("server");
}

async fn handle(req: Request) -> Response
    using [Database, Logger, Clock, Metrics]
{
    let now = Clock.now();
    Logger.info(&f"req {req.path} at {now}");
    Metrics.increment("requests.total");

    let user = Database.find_user(req.auth)?;
    ok_response(&user)
}
```

---

## Cross-references

- **[Language → context system](/docs/language/context-system)** — user-level surface.
- **[runtime](/docs/stdlib/runtime)** — `ExecutionEnv`, `ctx_bridge`.
- **[sys](/docs/stdlib/sys)** — `ctx_get` / `ctx_set` / `ctx_push_frame` TLS primitives.
