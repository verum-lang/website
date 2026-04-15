---
sidebar_position: 15
title: Async & Concurrency
---

# Async and Concurrency

Verum's concurrency story has three parts:
- **async/await** — cooperative suspension.
- **Structured concurrency** — `nursery`, `spawn`, cancellation.
- **Fearless parallelism** — `Send` / `Sync`, channels, atomics, locks.

## `async` functions

```verum
async fn fetch(url: Text) -> Result<Bytes, HttpError>
    using [Http]
{
    Http.get(url).await
}
```

An `async fn` returns a `Future<Output = T>`. The body does not run
until it is awaited or spawned.

## `.await`

```verum
let bytes = fetch("https://example.com").await?;
```

`.await` suspends the current task until the future completes.
Context stacks are preserved across the suspension.

## `spawn`

```verum
let handle: JoinHandle<T> = spawn fetch("...");
let result = handle.await;
```

`spawn` starts a new task on the executor. The returned `JoinHandle`
is itself a future — awaiting it produces the task's result.

## `select`

Race multiple futures; the first to complete wins.

```verum
select {
    bytes = fetch(url1).await => process(bytes),
    bytes = fetch(url2).await => process(bytes),
    _     = sleep(5.seconds) => Err(Error.Timeout),
}

select biased {            // try arms in order; useful for prioritisation
    priority = high.await => ...,
    normal   = low.await  => ...,
}
```

An `else => ...` branch runs if no future is ready.

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
            .collect::<List<_>>();
        try_join_all(handles).await?
    }
    on_cancel { metrics::increment("fetch_all.cancelled") }
    recover(e: HttpError) { List::new() }
}
```

Guarantees:
- No task started in the nursery outlives the nursery's scope.
- If any child fails (per the `on_error` policy), the rest are
  cancelled and awaited.
- `on_cancel` runs if the nursery is cancelled from outside.
- `recover` handles exceptions without propagating them upward.

## Cancellation

Cancellation is cooperative. A task is marked cancelled; the next
`.await` (or cancellation checkpoint) observes the flag and propagates.
The `nursery` cancellation path runs destructors and `on_cancel`
blocks before returning.

## `join` / `try_join`

```verum
let (a, b, c) = join(fetch(u1), fetch(u2), fetch(u3)).await;
let (a, b)    = try_join(fetch(u1), fetch(u2)).await?;
```

`join` waits for all; `try_join` fails fast on the first `Err`.

## Channels

```verum
let (tx, rx) = channel::<Event>(capacity: 64);

spawn produce(tx);
consume(rx).await
```

Channel types:
- `Channel<T>` (MPSC) — multiple producers, single consumer.
- `BroadcastChannel<T>` — multiple producers, multiple consumers (every
  receiver sees every message).
- `OneShot<T>` — single send, single receive.

Channels are `Send`-safe when `T: Send`.

## Send / Sync

- `Send` — values of this type can be moved across threads.
- `Sync` — `&T` can be shared across threads (equivalent to `&T: Send`).

Both are auto-derived. Use `!Send` / `!Sync` to opt out explicitly.

## Atomics

```verum
let counter = AtomicInt::new(0);
counter.fetch_add(1, MemoryOrder.SeqCst);
```

`sync::atomic` exposes the standard atomic types with explicit memory
ordering (`Relaxed`, `Acquire`, `Release`, `AcqRel`, `SeqCst`).

## Mutex / RwLock

```verum
let config = Shared::new(Mutex::new(Config::default()));

// Elsewhere:
let guard = config.lock().await;
guard.apply(update);
```

Mutexes are async by default — acquiring a contested lock suspends
rather than blocks the thread.

## Work-stealing executor

The default runtime uses a work-stealing scheduler with per-core
queues. Tasks that `.await` an IO operation are re-scheduled when the
operation completes via the platform's async IO API (`io_uring` on
Linux, `kqueue` on macOS/BSD, `IOCP` on Windows — see
[architecture](/docs/architecture/runtime-tiers)).

## Runtime configurations

`Verum.toml` can select the runtime flavour:

```toml
[runtime]
kind = "full"                # full | single_thread | no_async | embedded
```

- `full` — multi-threaded, work-stealing, full async.
- `single_thread` — single-threaded event loop (WASM-friendly).
- `no_async` — async/await compiled to synchronous calls.
- `embedded` — stack allocation only, no heap.

## Worked patterns

### Fan-out / fan-in with bounded concurrency

```verum
async fn process_bounded<T, U>(items: List<T>, workers: Int,
                               f: fn(T) -> Future<Output=U>) -> List<U>
{
    let sem = Shared::new(Semaphore::new(workers));
    nursery(on_error: cancel_all) {
        let handles: List<_> = items.into_iter().map(|item| {
            let sem = sem.clone();
            spawn async move {
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
let (tx, mut rx) = channel::<Event>(capacity: 128);

nursery {
    spawn async move {
        while let Maybe.Some(ev) = fetch_next().await {
            tx.send(ev).await.unwrap();          // suspends if full
        }
    };
    spawn async move {
        while let Maybe.Some(ev) = rx.recv().await {
            process(ev).await;
        }
    };
}
```

Full pipeline in the **[async pipeline tutorial](/docs/tutorials/async-pipeline)**.

### Racing with timeout

```verum
async fn fetch_or_fail(url: &Text) -> Result<Bytes, Error> using [Http] {
    timeout(5.seconds(), Http.get(url)).await?.body().await
}
```

See **[Cookbook → resilience](/docs/cookbook/resilience)** for retry +
circuit breaker composition.

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
