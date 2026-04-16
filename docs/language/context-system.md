---
sidebar_position: 14
title: Context System
---

# Context System

The context system replaces ambient state — globals, thread-locals,
singletons, "magic" dependency injection — with typed, explicitly
declared capabilities.

## Two levels

Verum offers two complementary DI mechanisms.

### Level 1: static `@injectable`

Compile-time dependency injection with zero runtime cost.

```verum
@injectable(Scope.Singleton)
type Logger is { level: LogLevel };

fn process(msg: Message) {
    let log: &Logger = inject Logger;
    log.info(f"processing {msg.id}");
}
```

The `inject Logger` expression is resolved at compile time. The
compiler walks the injector graph, stitches together singleton /
request / transient instances per scope, and hands `process` the
already-built `&Logger`.

### Level 2: dynamic `provide` / `using`

Runtime DI with ~5–30 ns overhead (task-local lookup).

```verum
context Logger {
    fn info(&self, msg: Text);
    fn error(&self, msg: Text);
};

fn fetch_user(id: UserId) -> User using [Logger, Database] {
    Logger.info(f"fetching {id}");
    Database.query(id)
}

fn main() using [IO] {
    let log = ConsoleLogger::new(LogLevel.Info);
    let db  = PostgresDatabase::connect(...)?;
    provide Logger = log;
    provide Database = db in {
        fetch_user(UserId(42));
    };
}
```

The `provide ... in { ... }` scope injects the value. `using [Logger,
Database]` declares the function's effects. Within the provided scope,
`Logger.info(...)` routes to the installed backend.

## Choosing between the two

| Use static `@injectable` | Use dynamic `provide`/`using` |
|--------------------------|------------------------------|
| Singleton / well-known backends | Request-scoped or runtime-selected |
| Zero-overhead required | Flexible late binding acceptable |
| Protocols with a single sensible instance | Protocols with multiple viable instances |

You can mix them. A `Database` context might be dynamically provided
per-request; a `Metrics` context might be a compile-time singleton.

## Context clause syntax

```verum
fn f() using [A, B, C] { ... }           // required contexts
fn f() using [A, !IO] { ... }            // required A, forbidden IO
fn f() using [A if cfg.debug] { ... }    // conditional
fn f() using [A.readonly()] { ... }      // transformed capability
fn f() using [A as primary] { ... }      // aliased
```

### Negative contexts

`!IO` means "this function may not perform IO." A caller that provides
`IO` to the function violates the contract at compile time. This is
how Verum encodes "pure" code:

```verum
using Pure = [!IO, !State<_>, !Random];

fn sum(xs: &List<Int>) -> Int using Pure {
    xs.iter().sum()
}
```

### Context groups

```verum
using WebRequest = [Database, Logger, Cache, Metrics, Clock];

fn handle(req: Request) -> Response using [WebRequest] { ... }
```

Groups are just named lists. They compose.

### Transformed contexts

```verum
fn analyse(db: Database) using [Database.readonly()] { ... }
```

The callee receives a `Database` with only read capabilities. If the
function tries to call a mutating method, the compiler rejects it
immediately — no runtime error.

## Propagation across async boundaries

Context stacks are **task-local**. Async and structured concurrency
preserve them:

- **`spawn`** clones the parent's context stack.
- **`.await`** preserves the stack across the suspension.
- **`for await`** in a generator preserves stacks per yield.
- **`nursery`** inherits stacks into child tasks.
- **Channel `send`/`recv`** does _not_ propagate — channels are data
  pipes, not capability pipes.

```verum
async fn handle(req: Request) using [Database, Logger] {
    nursery {
        spawn background_task();     // inherits Database + Logger
        primary_flow(req).await
    }
}
```

## Context protocols

A `context protocol` is both a protocol (types implement it) and a
context (functions request it). This is the dual role that lets
`Logger` appear in both `implement Logger for Console {}` and `using
[Logger]`.

```verum
context protocol Clock {
    fn now(&self) -> Instant;
    fn elapsed(&self, since: Instant) -> Duration {
        self.now() - since
    }
}
```

## Meta contexts — the compile-time mirror

The context system extends to compile-time programming: `meta fn`
functions declare their capabilities with the **same `using [...]`
syntax** as runtime functions, but the contexts are compiler-provided
and execute at compile time with zero runtime cost.

```verum
// Runtime context — provider explicit at the call site
fn handle(req: Request) -> Response
    using [Database, Logger, Clock] { ... }

// Meta context — provider is the compiler, implicit
meta fn derive_eq<T>() -> TokenStream
    using [TypeInfo, AstAccess, CompileDiag] { ... }
```

14 meta-specific contexts are defined in `core/meta/contexts.vr`:
`BuildAssets`, `TypeInfo`, `AstAccess`, `CompileDiag`, `MetaRuntime`,
`MacroState`, `CodeSearch`, `ProjectInfo`, `SourceMap`, `Schema`,
`DepGraph`, `MetaBench`, `StageInfo`, `Hygiene`. Composite groups
like `MetaCore = [TypeInfo, AstAccess, CompileDiag]` mirror the
`using WebRequest = [...]` pattern for runtime contexts. See
**[stdlib → meta](/docs/stdlib/meta)** for the full API surface.

## Where contexts are erased

Contexts provided statically (via `@injectable` with compile-time
resolution, or `provide` in a monomorphic call graph) are **entirely
erased** — the generated code calls the concrete function directly.

Dynamically provided contexts cost one pointer load from task-local
storage per access (~5–30 ns).

## Grammar

From `grammar/verum.ebnf`:

```
context_clause = "using" "[" context_spec { "," context_spec } "]" ;
context_spec   = [ "!" ] context_path [ context_transform ] [ context_cond ] [ "as" identifier ] ;
provide_stmt   = "provide" context_path [ "as" identifier ] "=" expr
                 [ "in" block ] ";" ;
```

## Worked example — wiring a web service

A typical top-level entry point layers every context once:

```verum
fn main() using [IO] {
    let app_layer = Layer::new()
        .with_singleton::<Logger>(ConsoleLogger::new(LogLevel.Info))
        .with_singleton::<Clock>(SystemClock::new())
        .with_request::<Database>(|| PostgresDatabase::connect(&db_url))
        .with_request::<Metrics>(|| Metrics::tagged("req_id"));

    app_layer.run(async {
        let mut server = HttpServer::bind(&":8080").await?;
        server.serve(|req| handle(req)).await?;
        Result.Ok::<(), Error>(())
    }).await.expect("server");
}

async fn handle(req: Request) -> Response
    using [Database, Logger, Clock, Metrics]
{
    let now = Clock.now();
    Logger.info(&f"req {req.path} at {now}");
    Metrics.increment("requests.total");
    ok_response(&Database.find_user(req.auth)?)
}
```

The `handle` function declares every capability it needs in its
signature; the compiler refuses to call `Database.find_user` if
the caller didn't provide a `Database`. Tests swap in a mock:

```verum
@test
async fn test_handler() using [IO] {
    provide Database = MockDatabase::new() in
    provide Logger   = NullLogger::new() in
    provide Clock    = FakeClock::at(epoch()) in
    provide Metrics  = NullMetrics::new() in {
        let req = Request::get("/users/42");
        let resp = handle(req).await;
        assert_eq(resp.status.code(), 200);
    }
}
```

No mocking framework. No DI container. Contexts are just types;
`provide` is just assignment; the compiler does the rest.

Full build in [HTTP service tutorial](/docs/tutorials/http-service).

## See also

- **[Stdlib → context](/docs/stdlib/context)** — the `Provider`, `Scope`,
  and `ContextError` types.
- **[Async and concurrency](/docs/language/async-concurrency)** —
  how contexts flow across tasks.
- **[Architecture → execution environment (θ+)](/docs/architecture/execution-environment)**
  — how context interacts with memory / recovery / concurrency.
- **[Architecture → runtime tiers](/docs/architecture/runtime-tiers)**
  — how the runtime implements task-local storage.
- **[HTTP service tutorial](/docs/tutorials/http-service)** —
  end-to-end use of `Layer::new().with_...(...)`.
- **[Cookbook → shared state](/docs/cookbook/shared-state)** — when
  a `Mutex`-wrapped context is the right shape.
