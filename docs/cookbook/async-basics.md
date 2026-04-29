---
title: Async / await basics
description: A practical tour of async in Verum — futures, awaiting, spawning, timing, and the common pitfalls.
---

# Async / await basics

This is the task-oriented guide. For the grammar and the full
concurrency surface, see
[language/async-concurrency](/docs/language/async-concurrency).

## An `async fn`

```verum
async fn fetch(url: &Url) -> Result<Bytes, HttpError> using [Http] {
    let resp = Http.get(url).await?;
    resp.body().await
}
```

An `async fn`:

- Declares the function as asynchronous. `async` is a function
  modifier, not an effect — it goes before `fn`, not in the
  `using [...]` clause.
- Returns a `Future<Output = T>` (where `T` is what the body returns).
- May use `.await` to suspend on inner futures.
- May use `using [...]` to demand contexts (propagated across
  suspensions).

The function **does not execute** when called; it returns a future.
The future runs when awaited or spawned.

```verum
let f: Future<Result<Bytes, HttpError>> = fetch(&url);    // not run
let result = f.await;                                      // runs here
```

## Driving a future

```verum
// Top-level (not async)
fn main() using [IO, Http] {
    let result = block_on(fetch(&url));
    print(f"{result:?}");
}

// Inside another async fn
async fn worker() using [IO, Http] {
    let result = fetch(&url).await?;
    print(f"{result:?}");
}
```

`block_on(future)` runs the future on the current thread until it
completes. Inside async code you **always** `.await` — never
`block_on` — or you will deadlock the executor.

### `block_on` only at entry points

`block_on` is for synchronous entry points: `main`, test harnesses,
CLI entry. Anywhere in the middle of an async call tree, use
`.await`:

```verum
// Wrong — block_on inside async
async fn wrong() {
    let x = block_on(fetch(&url));     // deadlocks the executor
}

// Right — ordinary .await
async fn right() {
    let x = fetch(&url).await;
}
```

## Running futures concurrently

### `join` — wait for all

```verum
async fn fetch_both() -> (Bytes, Bytes) using [Http] {
    let (a, b) = join(
        fetch(&url_a),
        fetch(&url_b),
    ).await;
    (a.unwrap(), b.unwrap())
}
```

`join(f1, f2, ...)` runs each future concurrently and returns a tuple
of their results. Supports 2 through 8 arguments; for variable
arities, use `join_all(vec)`.

### `try_join` — fail fast

```verum
async fn fetch_both_or_err() -> Result<(Bytes, Bytes), HttpError>
    using [Http]
{
    let (a, b) = try_join(fetch(&url_a), fetch(&url_b)).await?;
    Result.Ok((a, b))
}
```

`try_join` short-circuits on the first `Err` and cancels the others.

### `spawn` — let the executor schedule

```verum
async fn dispatch(urls: &List<Url>) -> List<Bytes> using [Http] {
    let handles: List<JoinHandle<_>> = urls
        .iter()
        .map(|u| spawn fetch(u.clone()))
        .collect();

    let mut out = List.new();
    for h in handles {
        if let Result.Ok(bytes) = h.await {
            out.push(bytes);
        }
    }
    out
}
```

`spawn` is heavier than `join` — each `spawn` goes through the global
task queue and may run on a different thread. For 2–3 futures, prefer
`join`; for dozens, prefer `spawn` inside a `nursery`.

### Race with `select`

```verum
async fn race_two(u: &Url, v: &Url) -> Bytes using [Http] {
    select {
        a = fetch(u).await => a.unwrap(),
        b = fetch(v).await => b.unwrap(),
    }
}
```

`select` runs arms concurrently and takes the **first** to complete;
the others are cancelled. See
[language/async-concurrency](/docs/language/async-concurrency#select).

## Timing, yielding, sleeping

### `sleep(duration)`

```verum
async fn polite() {
    do_work();
    sleep(500.ms()).await;              // wait half a second
    do_more();
}
```

`sleep` returns when the given `Duration` has elapsed; it does **not**
occupy the executor while waiting.

### `yield_now`

```verum
async fn polite_loop() {
    for i in 0..1_000_000 {
        crunch(i);
        if i % 1000 == 0 { yield_now().await; }
    }
}
```

`yield_now` returns control to the executor so other tasks can run.
Use in long CPU-bound async loops that would otherwise starve
siblings.

### `timeout`

```verum
async fn fetch_with_deadline(url: &Url) -> Result<Bytes, Error>
    using [Http]
{
    match timeout(3.seconds(), fetch(url)).await {
        Result.Ok(r) => r.map_err(Error.from),
        Result.Err(_) => Result.Err(Error.Timeout),
    }
}
```

`timeout(duration, future)` returns `Result<T, TimeoutError>` — either
the original result (`Ok(T)` → `Ok(Ok(T))`) or a timeout (`Err`). The
inner future is cancelled on timeout.

### Repeating with backoff

```verum
async fn retry<F, T, E>(mut f: F, max_attempts: Int) -> Result<T, E>
    where F: async fn() -> Result<T, E>
{
    let mut attempt = 0;
    loop {
        match f().await {
            Result.Ok(v) => return Result.Ok(v),
            Result.Err(e) if attempt < max_attempts - 1 => {
                sleep(100.ms() * (1 << attempt)).await;     // exp backoff
                attempt += 1;
            }
            Result.Err(e) => return Result.Err(e),
        }
    }
}
```

See [cookbook/resilience](/docs/cookbook/resilience) for
circuit-breaker and bulkhead patterns.

## Common patterns

| I want to…                             | Use                                       |
|----------------------------------------|-------------------------------------------|
| Run two futures concurrently           | `join(f1, f2).await`                      |
| Run N identical futures concurrently   | `join_all(vec).await`                     |
| Fail fast on first error               | `try_join(f1, f2).await?`                 |
| Take the first to finish               | `select { a = f1.await => a, b = f2.await => b }` |
| First non-error                         | `select_any(vec).await`                   |
| With a time budget                     | `timeout(dur, fut).await?`                |
| Structured task scope                  | `nursery { spawn f1; spawn f2; }`         |
| Deferred sync value                    | `ready(value).await`                      |
| Wait forever                           | `pending<T>().await`                    |
| Cooperative yield                      | `yield_now().await`                       |

## Pitfall — `.await` inside a synchronous section

Nothing forces a `.await` to yield — but blocking operations **do**.
Don't put an `.await` inside a synchronous critical section:

```verum
// DO NOT
let guard = mu.lock().await;
let resp = Http.get(&url).await?;      // holds the mutex across the IO!
guard.commit(resp);
```

The HTTP request may take milliseconds; holding a mutex for that
long stalls every other caller. Refactor:

```verum
let req = {
    let g = mu.lock().await;
    g.build_request()
};
let resp = Http.get(&req.url).await?;
{
    let mut g = mu.lock().await;
    g.commit(resp);
}
```

## Pitfall — forgotten `.await`

```verum
fetch(&url);                            // WRONG — returns future, no run
fetch(&url).await;                      // runs the future
```

The compiler warns on discarded futures but the warning can be
suppressed; always await or drop explicitly:

```verum
let _ = fetch(&url).await;              // discard the result explicitly
```

## Pitfall — cancellation between `.await`s

Cancellation happens **only at `.await` points**. Between two
`.await` calls, the task is uninterruptible. This is normally
desirable (you don't want partial state on cancellation). But long
synchronous sections may delay cancellation:

```verum
async fn slow() {
    let data = expensive_cpu_work();     // not cancellable
    data.send().await;                   // cancellable here
}
```

If the caller cancels `slow` during `expensive_cpu_work`, nothing
happens until the work returns. Insert `yield_now().await` in the
middle for periodic cancellation checks.

## Cleanup on cancellation — `defer` / `errdefer`

`defer` always runs; `errdefer` runs only on the error path:

```verum
async fn transactional_write(data: &Data) using [Database] {
    let tx = Database.begin().await;
    errdefer tx.rollback().await;

    tx.write(data).await?;
    tx.commit().await?;
}
```

If `write` fails or is cancelled, `errdefer` fires. If `commit`
succeeds, the `errdefer` is skipped.

## Running in a specific executor

```verum
let rt = Runtime.new()
    .worker_threads(4)
    .on_shutdown(|| print("shutting down"))
    .build();

let result = rt.block_on(fetch(&url));
rt.shutdown_timeout(5.seconds());
```

`Runtime` is the configurable alternative to `block_on`. For most
applications, `block_on(future)` (which uses the default runtime) is
fine; custom runtimes are for fine-tuned server deployments.

## Testing async code

Use `@test` to mark an async test:

```verum
@test
async fn test_fetch_timeout() {
    let result = timeout(100.ms(), pending<()>()).await;
    assert(result.is_err());
}
```

For deterministic time tests, inject a `FakeClock` context:

```verum
@test
async fn test_retry_backoff() {
    let clock = FakeClock.at(epoch());
    provide Clock = clock.clone() in {
        let result = spawn slow_retry();
        clock.advance(10.seconds());
        assert!(result.await.is_ok());
    }
}
```

## See also

- **[`stdlib/async`](/docs/stdlib/async)** — Future, Stream, Task,
  channels, timers, full API.
- **[Nursery](/docs/cookbook/nursery)** — structured concurrency.
- **[Channels](/docs/cookbook/channels)** — MPSC, broadcast, oneshot.
- **[Generators](/docs/cookbook/generators)** — `fn*` and `async fn*`.
- **[Scheduler](/docs/cookbook/scheduler)** — custom work-stealing
  configurations.
- **[Resilience](/docs/cookbook/resilience)** — retry, circuit
  breakers, bulkheads.
- **[Async pipeline tutorial](/docs/tutorials/async-pipeline)** —
  end-to-end production-shaped example.
- **[language/async-concurrency](/docs/language/async-concurrency)** —
  grammar and normative reference.
