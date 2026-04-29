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
public context Logger {
    fn info(message: Text);
    fn error(message: Text);
}

public context Database {
    fn query(id: UserId) -> User;
}

fn fetch_user(id: UserId) -> User using [Logger, Database] {
    Logger.info(f"fetching {id}");
    Database.query(id)
}

fn main() {
    let log = ConsoleLogger.new(LogLevel.Info);
    let db  = PostgresDatabase.connect(...)?;
    provide Logger = log;
    provide Database = db in {
        fetch_user(UserId(42));
    };
}
```

Three syntactic facts worth noting against the stdlib's own contexts
in `core/context/standard.vr`:

- `context` declarations carry `public` (or no visibility prefix)
  — not `pub`, and they do **not** end with a semicolon. The body
  is enclosed in `{ … }` like any other item.
- Context methods do **not** take `&self`. They're called
  statically as `Logger.info(msg)` — the runtime looks up the
  installed backend from the current task-local context stack.
- `print` is a built-in, so `fn main()` does not need
  `using [...]`. User-defined contexts (Logger, Database, Clock,
  Metrics, RateLimiter, ...) do appear there whenever the function
  depends on them.

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
fn f() using [db: Database] { ... }      // named (identifier binding)
```

The full grammar allows five kinds of item in a context list:

```ebnf
extended_context_item = negative_context       (* !Context          *)
                      | conditional_context    (* Context if cond   *)
                      | transformed_context    (* Context.transform()*)
                      | named_context          (* name: Context  OR  Context as alias *)
                      | simple_context ;       (* Context           *)
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

Transforms chain:

```verum
fn do_tx() using [Database.transactional().isolated(Serializable)] { ... }
```

Each segment is an ordinary method on the context type (`Database`
has `.transactional()` and `.isolated(Level)` methods declared in its
protocol). The transform produces a **refined context** — the
function body sees `Database` with the tighter contract.

### Named and aliased contexts

Two instances of the same context type require disambiguation — use
`as` or a prefixed name:

```verum
// Using `as` — the alias is the symbol inside the function body:
fn replicate(data: &Record)
    using [Database as primary, Database as replica]
{
    primary.write(data);
    replica.write(data);
}

// Using `name: Context` — the name is the symbol:
fn handle(req: Request)
    using [db: Database, log: Logger]
{
    log.info(f"req {req}");
    db.query(...)
}
```

Both forms are equivalent. Inside the function, the alias (or name)
is what you call methods on; the bare context type (`Database`) is
**not** in scope when there are aliases.

### Conditional contexts (feature flags)

```verum
fn maybe_log(msg: &Text)
    using [Logger,
           Analytics if cfg.analytics_enabled,
           Metrics if cfg.metrics_enabled]
{
    Logger.info(msg);
    if cfg.analytics_enabled { Analytics.track(msg); }
    if cfg.metrics_enabled   { Metrics.increment("msgs"); }
}
```

`cfg.flag` is a compile-time boolean from `verum.toml` features.
Compiling with `--features analytics` enables the conditional
capability; without it the context is neither required nor emitted.

The condition can also be:

- `identifier` — a compile-time constant.
- `cfg.identifier` — a build feature.
- `platform.linux`, `platform.windows`, etc. — target platform.
- `T: Bound` — a type-constraint condition.
- Any Boolean combination of these with `&&`, `||`, `!`, `(…)`.

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

Fourteen meta-specific contexts ship with the language: `BuildAssets`,
`TypeInfo`, `AstAccess`, `CompileDiag`, `MetaRuntime`, `MacroState`,
`CodeSearch`, `ProjectInfo`, `SourceMap`, `Schema`, `DepGraph`,
`MetaBench`, `StageInfo`, `Hygiene`. Composite groups like
`MetaCore = [TypeInfo, AstAccess, CompileDiag]` mirror the
`using WebRequest = [...]` pattern for runtime contexts. See
**[stdlib → meta](/docs/stdlib/meta)** for the full API surface.

## Where contexts are erased

Contexts provided statically (via `@injectable` with compile-time
resolution, or `provide` in a monomorphic call graph) are **entirely
erased** — the generated code calls the concrete function directly.

Dynamically provided contexts cost one pointer load from task-local
storage per access (~5–30 ns).

## What contexts are *not*: a deliberate alternative to algebraic effects

The Verum context system is **capability-based dependency injection**,
not an algebraic-effect system. The distinction is a conscious design
choice, and worth unpacking because the two mechanisms are often
conflated.

### The effect-system tradition

In languages like **Koka**, **Effekt**, **Eff**, **Frank**, and
**OCaml 5**, every interaction with the outside world (logging, I/O,
non-determinism, mutable state, exceptions) is modelled as an *effect
operation* that a surrounding *handler* interprets. Handlers can
resume the suspended computation with a value, abort it, run it many
times (supporting non-deterministic search), or compose with other
handlers to stack interpretations. This subsumes dependency injection,
exception handling, coroutines, generators, transactional state, and
logic programming in a single elegant mechanism.

```koka
// Koka — Logger as an algebraic effect
effect log { fun info(msg: string): () }

fun greet(name: string): log () {
  info("greeting " ++ name)   // this might suspend!
}

fun main() {
  with handler {
    fun info(msg) { println(msg); resume(()) }   // handler chooses what to do
  }
  greet("world")
}
```

### Why Verum does not do this

Effect operations are not ordinary function calls. An operation can
in principle capture its own continuation, so every call site must be
compiled as if a stack-switch might happen. Koka's evidence-passing
transform, Effekt's capability-passing style, and OCaml 5's fibre-based
runtime all reduce this cost, but the price of the full-power effect
machinery is paid even by operations that never actually resume.

The empirical observation that drove Verum's design: in real code,
**the overwhelming majority of "effectful" operations are plain
dependency injection.** "Give me a `Logger`." "Give me a `Database`."
"Give me a `Clock`." Those calls do not want to capture their
continuation. They want a vtable dispatch and a way to be mocked in
tests.

### The tradeoff Verum makes

Verum's context system meets that common case with a mechanism every
systems programmer already understands:

| Dimension             | Algebraic effects (Koka, Effekt, OCaml 5)    | Verum contexts (`using [...]`)                     |
|-----------------------|-----------------------------------------------|----------------------------------------------------|
| **Power**             | Handlers may `resume`, `abort`, multi-shot    | Plain virtual dispatch; no resumption              |
| **Compilation**       | Evidence-passing / CPS / fibre stack-switch   | Vtable dispatch against task-local storage         |
| **Cost per call**     | Tens of nanoseconds even for trivial ops      | ~5–30 ns dynamic, zero when monomorphised          |
| **Cost model**        | Every effectful op may suspend                | Function-call cost, independent of op count        |
| **Testing**           | Swap the handler                              | Swap the provider (`provide X = mock`)             |
| **Async interaction** | Effects subsume async                         | Async orthogonal to contexts, compose cleanly      |
| **Mental model**      | Learn handler algebra / free monads           | "It's DI with a language-level syntax"             |

For the **5 % of cases** where reinterpretation *is* the point —
non-deterministic search, probabilistic programming, backtracking
parsers, proof search — Verum offers metaprogramming, tactic
combinators, and explicit continuations (`async`/`await`,
coroutine-style generators). None of those impose a runtime cost on
every function in the program.

### What this means in practice

- **A `Logger.info` call is a vtable dispatch**, not a suspension point.
- **Context providers compose by lexical scoping**, not by stacked
  handlers.
- **Adding a context to a function's signature does not change its
  ABI** beyond adding a capability requirement; the generated code
  path is the same shape.
- **Compile-time and runtime DI share one surface** — `using [...]`
  for both. Effect systems do not unify compile-time meta with
  runtime DI in this way.

If you are coming from Koka or OCaml 5, the mental adjustment is:
**Verum's contexts do less by design.** You lose `resume`. You gain a
cost model that stays flat as your program grows, the ability to hand
a context stack to a `spawn` and have it just work, and the full
algebra of dependency injection without any of the framework ceremony
that languages without a language-level DI mechanism have to layer on
top.

## Grammar

From the [grammar reference](/docs/reference/grammar-ebnf):

```ebnf
context_clause   = 'using' , context_spec ;
context_spec     = single_context_spec | extended_context_list ;
single_context_spec
                 = [ '!' ] , context_path , [ context_alias ] , [ context_condition ] ;
extended_context_list
                 = '[' , extended_context_item , { ',' , extended_context_item } , ']' ;

extended_context_item = negative_context
                      | conditional_context
                      | transformed_context
                      | named_context
                      | simple_context ;

context_group_def = 'using' , identifier , '=' , context_list_def , ';' ;
provide_stmt      = 'provide' , context_path , [ 'as' , identifier ]
                  , '=' , expression , ( ';' | 'in' , block_expr ) ;
```

## Worked example — wiring a web service

A typical top-level entry point layers every context once:

```verum
fn main() {
    let app_layer = Layer.new()
        .with_singleton<Logger>(ConsoleLogger.new(LogLevel.Info))
        .with_singleton<Clock>(SystemClock.new())
        .with_request<Database>(|| PostgresDatabase.connect(&db_url))
        .with_request<Metrics>(|| Metrics.tagged("req_id"));

    app_layer.run(async {
        let mut server = HttpServer.bind(&":8080").await?;
        server.serve(|req| handle(req)).await?;
        Result.Ok<(), Error>(())
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
async fn test_handler() {
    provide Database = MockDatabase.new() in
    provide Logger   = NullLogger.new() in
    provide Clock    = FakeClock.at(epoch()) in
    provide Metrics  = NullMetrics.new() in {
        let req = Request.get("/users/42");
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
  end-to-end use of `Layer.new().with_...(...)`.
- **[Cookbook → shared state](/docs/cookbook/shared-state)** — when
  a `Mutex`-wrapped context is the right shape.
