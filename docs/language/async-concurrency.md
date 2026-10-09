---
sidebar_position: 15
title: Async & Concurrency
---

# Async and Concurrency

Verum provides `async` / `.await` syntax, explicit futures, spawned tasks,
and structured concurrency. To compose these correctly, distinguish an
operation that has already run from a value that still needs polling.

## `async` functions

```verum
async fn answer() -> Int { 7 }
```

The language's asynchronous model associates a result with a future.
The current lowering of `async fn` does not yet implement that model
as a suspended state machine.

**Known limitation:** calling an `async fn` executes
its body eagerly and returns its result. Adding `.await` to that direct
call does not defer its side effects. This applies to the current
interpreter and native lowering; it is not a promise that all other
async behaviour agrees between them.

```verum
async fn answer() -> Int { 7 }
fn takes_int(value: Int) -> Int { value }

fn main() {
    // Currently accepted: answer() supplies Int directly.
    print(takes_int(answer()));
}
```

This matters when passing work to a timeout, cancellation boundary, or
panic handler: arguments are evaluated before the receiving function
runs. A wrapper given an already computed `Result` cannot interrupt or
catch the work that produced it. Use the API's deferred-operation form
(a closure or an explicit future) when the boundary must surround the
operation itself. Deferring the call is only the first requirement for
a timeout: a blocking closure can still occupy its thread until it
returns. The operation and timeout API must support cooperative polling
or another explicit interruption mechanism.

## `.await`

There are three distinct cases:

| Awaited expression | What drives completion |
|---|---|
| An explicit value implementing `Future` | Its `poll` method returns `Poll.Pending` or `Poll.Ready(value)`; `.await` yields the declared `Output`. |
| A handle inferred from the `spawn` keyword | Completion of the spawned task, yielding its body's result on the current keyword path. |
| A direct `async fn` call | The eagerly computed result, under the limitation above. |

The explicit protocol is declared in `core.async.future`. Its `Output`
is an associated type, so a future may yield a scalar, record, or
`Result<T, E>`. `Poll.Ready(Result.Err(error))` means the future has
completed with an error; it is distinct from `Poll.Pending`.

**Known limitation:** imported generic future
outputs and nested record payloads still have gaps in compiler type
propagation. A working direct future does not establish that every
associated-type combination works through an imported generic wrapper.
Verify that path in the execution mode your application uses.

## `spawn`

```verum
let handle = spawn { 7 };
let result = handle.await;
```

`spawn` produces a task handle. Use a block when the operation itself
must execute inside the child task:

```verum
let handle = spawn { fetch(url).await };
```

Handle completion and explicit `Future.poll` are separate mechanisms
from the eager lowering of a direct `async fn` call.

The library `core.async.task.JoinHandle<T>` declares a `Future.Output` of
`Result<T, JoinError>`. The keyword's task representation and this library
record do not yet share one checked completion path: an inferred keyword
handle can yield `T` directly. A library type annotation does not establish
cancellation support or insert a join-error layer. See
[task result boundaries](/docs/cookbook/async-basics#task-results-and-join-errors)
for the distinction, especially when `T` is itself a `Result`.

**Known limitation:** awaiting the same handle twice
was accepted. Do not rely on the checker to enforce a single-consumer
handle discipline. Consume handles by value when collecting task results.

### Context forwarding

By default, a spawned task **inherits the parent's context stack** —
the task sees the same `Database`, `Logger`, `Http`, and other
contexts the parent had when it called `spawn`.

Explicit forwarding names which contexts cross into the child; the
rest are dropped:

```verum
spawn using [Database, Logger] async { ... }
// ─ the child only sees Database and Logger, no Http / no Clock / ...
```

This is both a safety feature (prevents capability leaks across
task boundaries) and an audit tool (each `spawn` lists exactly what
the child may use).

## `select`

Race multiple futures; the first to complete wins.

```verum
select {
    bytes = fetch(url1).await => process(bytes),
    bytes = fetch(url2).await => process(bytes),
    _     = sleep(5.seconds).await => Err(Error.Timeout),
}

select biased {            // try arms in order; useful for prioritisation
    priority = high.await => ...,
    normal   = low.await  => ...,
}
```

### Arms, guards, and else

The full grammar:

```ebnf
select_expr = 'select' , [ 'biased' ] , '{' , select_arms , '}' ;
select_arms = select_arm , { ',' , select_arm } , [ ',' ] , [ select_else ] ;
select_arm  = { attribute } , pattern , '=' , await_expr , [ select_guard ] , '=>' , expression ;
select_guard = 'if' , expression ;
select_else  = 'else' , '=>' , expression , [ ',' ] ;
```

Arms can carry attributes and guards:

```verum
select biased {
    @cold ev = high_priority_queue.recv_fut().await if !paused => handle(ev),
    ev      = normal_queue.recv_fut().await                    => handle(ev),
    _       = shutdown.await                               => return,
    else    => sleep(10.millis()).await,       // no future ready, no await blocked
}
```

Semantics:

- Without `biased`: arms are polled in fair order.
- With `biased`: arms are polled top-to-bottom each iteration.
- A failing `if` guard marks that arm dormant for the iteration.
- `else` runs when **all** guards are false or no future is ready.
- An arm's `pattern = expr` binds the future's result (the pattern
  is matched — mismatches cause the arm to be skipped).

Each arm's awaited expression **must** use `.await` form (not a bare
call that returns a future) — the grammar enforces this.

## `nursery` — structured concurrency

A nursery is a lexical scope that owns a set of tasks. It does not
return until all tasks have either completed, failed, or been cancelled.

```verum
async fn fetch_all(urls: &List<Text>) -> List<Bytes>
    using [Http]
{
    nursery(on_error: cancel_all) {
        let handles = urls.iter()
            .map(|u| spawn fetch(u.clone()))
            .collect();
        try_join_all(handles).await?
    }
    on_cancel { metrics.increment("fetch_all.cancelled") } recover |e| { List.new() }
}
```

### Options

```verum
nursery(timeout: 5.secs(),
        on_error: cancel_all,
        max_tasks: 100)
{
    ...
}
```

| Option     | Type                                          | Default        |
|------------|-----------------------------------------------|----------------|
| `timeout`  | `Duration`                                    | no timeout     |
| `on_error` | `cancel_all \| wait_all \| fail_fast`         | `cancel_all`   |
| `max_tasks`| `Int`                                         | unbounded      |

`on_error` policies:

- `cancel_all` — on first error, cancel every sibling task and
  propagate the error. The default.
- `wait_all` — let every sibling run to completion regardless of
  errors; collect all errors in a `NurseryErrors` aggregate.
- `fail_fast` — drop sibling tasks immediately (best-effort cancel),
  return the first error without waiting.

### Handlers

```verum
nursery { ... }
on_cancel { cleanup_on_cancel() }     // only runs on external cancellation
recover {
    TimeoutError        => default_value,
    NetworkError(e)     => fallback(e),
}
```

- `on_cancel` runs if the nursery is cancelled from outside (e.g. a
  parent nursery is cancelling). Runs before handlers / closure
  drops.
- `recover` catches errors from child tasks. Supports both match-arm
  form (above) and closure form `recover |e| { ... }`. See
  [error-handling](/docs/language/error-handling).

### Guarantees

- No task started in the nursery outlives the nursery's scope.
- If any child fails (per the `on_error` policy), the rest are
  cancelled and awaited.
- `on_cancel` runs if the nursery is cancelled from outside.
- `recover` handles exceptions without propagating them upward.
- Exceptions from `on_cancel` and `recover` follow ordinary error
  handling (they propagate unless caught).

## Generators: `fn*` and `async fn*`

Verum has generators as first-class language features, orthogonal to
async. A **sync generator** `fn*` produces an iterator; an **async
generator** `async fn*` produces an async iterator.

```verum
fn* range(n: Int) -> Int {
    for i in 0..n { yield i; }
}

async fn* fetch_pages(base: &Url) -> Page
    using [Http]
{
    let mut cursor: Maybe<Text> = Maybe.None;
    loop {
        let page = Http.get_page(base, &cursor).await?;
        yield page.clone();
        cursor = page.next_cursor;
        if cursor.is_none() { break; }
    }
}
```

### Consumption

```verum
// Sync generator → ordinary for loop:
for i in range(10) { print(i); }

// Async generator → `for await`:
for await page in fetch_pages(&base) {
    process(&page);
}
```

### Grammar

```ebnf
fn_keyword  = 'fn' , [ '*' ] ;
yield_expr  = 'yield' , expression ;
for_await_loop = 'for' , 'await' , pattern , 'in' , expression
              , { loop_annotation } , block_expr ;
```

- `yield` is only valid inside a `fn*` or `async fn*` body.
- Generators cannot use `return expr` (only bare `return` to stop).
- All `yield` expressions must produce compatible types.

### Generators vs. `cofix`

Generators are the *imperative* producer form; `cofix` is the
*observational* producer form. See
[copatterns](/docs/language/copatterns) for when each is the better
choice.

## Cancellation

Cancellation is cooperative. A task is marked cancelled; the next
`.await` (or cancellation checkpoint) observes the flag and propagates.
The structured-concurrency contract includes cleanup and `on_cancel`
handlers. Native resource cleanup has the limitation described under
[Mutex / RwLock](#mutex--rwlock); cancellation syntax alone does not
establish that a guard has been released.

## `join` / `try_join`

```verum
let (a, b, c) = join(fetch(u1), fetch(u2), fetch(u3)).await;
let (a, b)    = try_join(fetch(u1), fetch(u2)).await?;
```

`join` waits for all; `try_join` fails fast on the first `Err`.

## Channels

```verum
let (tx, rx) = bounded<Event>(64);

spawn produce(tx);
consume(rx).await
```

Channel kinds, by the constructor that builds them:
- `bounded<T>(n)` / `channel<T>()` — MPSC: many producers, ONE consumer.
  The pair is `(Sender<T>, Receiver<T>)`; `Sender` is cloneable,
  `Receiver` deliberately is not.
- `broadcast_channel<T>(n)` — many producers, many consumers (every
  receiver sees every message). The pair is
  `(BroadcastSender<T>, BroadcastReceiver<T>)`, and `tx.subscribe()`
  hands out further receivers.
- `oneshot<T>()` — single send, single receive:
  `(OneshotSender<T>, OneshotReceiver<T>)`.

`Channel<T>` itself is the plain bounded ring underneath — construct it
with `Channel.new(capacity)` when you want one object rather than a
sender/receiver pair.

Channels are `Send`-safe when `T: Send`.

## Send / Sync

- `Send` — values of this type can be moved across threads.
- `Sync` — `&T` can be shared across threads (equivalent to `&T: Send`).

Both are auto-derived. Use `!Send` / `!Sync` to opt out explicitly.

## Atomics

```verum
let counter = AtomicInt.new(0);
counter.fetch_add(1, MemoryOrder.SeqCst);
```

`sync.atomic` exposes the standard atomic types with explicit memory
ordering (`Relaxed`, `Acquire`, `Release`, `AcqRel`, `SeqCst`).

## Mutex / RwLock

`core.sync.mutex.Mutex.lock()` is a **synchronous, blocking** operation.
It returns `Result<MutexGuard<T>, PoisonError<MutexGuard<T>>>`; it does
not become asynchronous by writing `.await` after the call. Avoid
blocking a cooperative executor thread while waiting for a contested lock.

A guard gives access to its protected value through `Deref`. Access and
resource lifetime are separate contracts: a successful read through a
guard does not demonstrate that dropping it unlocks the mutex.

**Known limitation:** guard lifetime is incomplete
in both backends. The interpreter can report a mutex unlocked while its
guard is still in scope. Native cleanup can leave a lock held after
scope exit. Verify ownership during guard use as well as release;
general native RAII and cancellation cleanup are not established. See
[references and resource lifetime](/docs/language/references#resource-lifetime).

## Work-stealing executor

The runtime contains a work-stealing scheduler and platform I/O drivers.
Those components do not make an eager function body suspendable. For an
operation to participate in cooperative polling, its API must actually
return a future and report readiness through that future.

The interpreter and native backend need separate validation for the
chosen API. See [execution modes](/docs/architecture/runtime-tiers#axis-1--execution-mode).

## Runtime configurations

The scheduler configuration uses the `[runtime]` section:

```toml
[runtime]
async_scheduler = "work_stealing"
async_worker_threads = 0          # automatic worker count
```

Execution mode is selected separately through `[codegen].tier` or the
CLI flags. The proposed runtime profiles are described in
[runtime profiles](/docs/architecture/runtime-tiers#axis-3--runtime-profiles);
`[runtime] kind = "full"` is not a supported profile selector.

## Worked patterns

### Fan-out / fan-in with bounded concurrency

```verum
async fn process_bounded<T, U>(items: List<T>, workers: Int,
                               f: fn(T) -> Future<Output=U>) -> List<U>
{
    let sem = Shared.new(Semaphore.new(workers));
    nursery(on_error: cancel_all) {
        let handles: List<_> = items.into_iter().map(|item| {
            let sem = sem.clone();
            spawn async {
                let _permit = sem.acquire().await;
                f(item).await
            }
        }).collect();
        join_all(handles).await
    }
}
```

See **[Cookbook → nursery](/docs/cookbook/nursery)** for more.

### Producer / consumer with backpressure

```verum
let (tx, mut rx) = bounded<Event>(128);

nursery {
    spawn async {
        while let Maybe.Some(ev) = fetch_next().await {
            tx.send_async(ev).await.unwrap();    // suspends if full
        }
    };
    spawn async {
        while let Maybe.Some(ev) = rx.recv_fut().await {
            process(ev).await;
        }
    };
}
```

Full pipeline in the **[async pipeline tutorial](/docs/tutorials/async-pipeline)**.

### Racing with timeout

Start the timeout around a deferred operation. If `fetch(url)` is an
eager `async fn`, passing `fetch(url)` into a timeout helper evaluates
the fetch before that helper starts. Passing a closure or an explicit
future is useful only when that helper's API accepts and drives it. A
closure that blocks without yielding is not made interruptible merely
by being passed as a callback.

For a multi-step operation, decide whether the deadline covers the
whole operation or each individual attempt. Resetting a timeout after
every received byte, for example, permits a slow peer to extend the
total request time indefinitely.

See [Cookbook → resilience](/docs/cookbook/resilience) for the
composition vocabulary, and check the evaluation contract of each API.

## See also

- **[Stdlib → async](/docs/stdlib/async)** — futures, executors, timers.
- **[Stdlib → sync](/docs/stdlib/sync)** — atomics, locks, barriers.
- **[Context system](/docs/language/context-system)** — propagation.
- **[Runtime tiers](/docs/architecture/runtime-tiers)** — how it works.
- **[Architecture → execution environment (θ+)](/docs/architecture/execution-environment)**
  — per-task context structure.
- **[Cookbook → async basics](/docs/cookbook/async-basics)**
- **[Cookbook → channels](/docs/cookbook/channels)**
- **[Cookbook → generators](/docs/cookbook/generators)**
- **[Cookbook → nursery](/docs/cookbook/nursery)**
- **[Cookbook → scheduler](/docs/cookbook/scheduler)**
- **[Async pipeline tutorial](/docs/tutorials/async-pipeline)**
