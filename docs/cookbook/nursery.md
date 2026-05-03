---
title: Structured concurrency with nursery
description: Fan out parallel work with guaranteed join, cancel, recover, and timeout.
---

# Structured concurrency with `nursery`

A **nursery** is a lexical scope that owns a set of tasks and refuses
to exit until they all complete. This is the single feature that
makes concurrency *composable* — you can read any function's type and
know it never leaves tasks running in the background.

Verum's nursery grammar:

```ebnf
nursery_expr    = 'nursery' , [ nursery_options ] , block_expr , [ nursery_handlers ] ;
nursery_options = '(' , nursery_option , { ',' , nursery_option } , ')' ;
nursery_option  = 'timeout' , ':' , expression
                | 'on_error' , ':' , ( 'cancel_all' | 'wait_all' | 'fail_fast' )
                | 'max_tasks' , ':' , expression ;
nursery_handlers = nursery_cancel , [ nursery_recover ] | nursery_recover ;
nursery_cancel  = 'on_cancel' , block_expr ;
nursery_recover = 'recover' , recover_body ;
```

## Parallel fetch with fail-fast

```verum
async fn fetch_all(urls: &List<Url>) -> Result<List<Bytes>, Error>
    using [Http]
{
    nursery(on_error: cancel_all, timeout: 10.seconds()) {
        let handles: List<JoinHandle<Bytes>> = urls.iter()
            .map(|u| spawn Http.get(u.clone()))
            .collect();
        try_join_all(handles).await
    }
    on_cancel {
        metrics.increment("fetch_all.cancelled");
    }
    recover(e: NurseryError) {
        Result.Err(Error.from(e))
    }
}
```

The nursery:

1. Spawns *N* fetches.
2. If any one errors, cancels the rest.
3. If the whole block takes longer than 10s, cancels everything.
4. On external cancellation, runs `on_cancel`.
5. On nursery failure, runs `recover` with the aggregated error.

After 10 s or the first error, **no tasks are left running**. The
scope is airtight.

## The three `on_error` policies

### `cancel_all` — default

First error cancels every sibling; the nursery returns that error.
Use when tasks are independent and one failure invalidates the
others (e.g. fetch N resources for a response).

```verum
nursery(on_error: cancel_all) {
    spawn step_a();
    spawn step_b();   // cancelled if step_a fails
}
```

### `wait_all` — gather

Every task runs to completion regardless of errors; the nursery
returns a `NurseryError.Multiple([...])` if any failed. Use when you
want all results, warts and all.

```verum
nursery(on_error: wait_all) {
    for item in items {
        spawn process(item);
    }
}
```

### `fail_fast` — best-effort

Like `cancel_all`, but **does not wait** for sibling tasks to
acknowledge cancellation. Returns the first error the moment it's
observed. Use when latency on failure trumps cleanup correctness.

```verum
nursery(on_error: fail_fast, timeout: 1.seconds()) {
    for replica in replicas {
        spawn replica.send(data);
    }
}
// returns within 1 s, even if replicas are slow to die
```

## Timeouts

```verum
nursery(timeout: 5.seconds()) {
    ...
}
```

When the nursery block exceeds the timeout, every available task is
cancelled and the nursery returns `NurseryError.Timeout`. The
timeout applies to the **whole block**, not per-task. For per-task
timeouts, wrap individual spawns:

```verum
nursery {
    for u in urls {
        spawn async move {
            timeout(3.seconds(), fetch(u)).await
        };
    }
}
```

## `max_tasks`

```verum
nursery(max_tasks: 1000) {
    for x in stream { spawn handle(x); }
}
```

If more than `max_tasks` are available, `spawn` blocks until a slot
is free. Use to bound memory when the task rate is unpredictable.
Often combined with a `Semaphore` for finer-grained backpressure
(see next section).

## Bounded parallelism

```verum
async fn process_bounded<T, U>(
    items: List<T>,
    concurrency: Int,
    f: fn(T) -> Future<Output = Result<U, Error>>,
) -> Result<List<U>, Error>
{
    let sem = Shared.new(Semaphore.new(concurrency));
    let out = Shared.new(Mutex.new(Vec.with_capacity(items.len())));

    nursery(on_error: cancel_all) {
        for item in items {
            let sem = sem.clone();
            let out = out.clone();
            spawn async move {
                let _permit = sem.acquire().await;
                let r = f(item).await?;
                out.lock().await.push(r);
                Result.Ok<(), Error>(())
            };
        }
    }

    Result.Ok(out.lock().await.drain().collect())
}

// Usage:
let results = process_bounded(urls, 16, |u| Http.get(u)).await?;
```

The `Semaphore` caps concurrency at 16; the `nursery` guarantees
every spawned task finishes before `process_bounded` returns.

## Fire-and-forget with supervision

For long-running background tasks that need restart semantics — use
`Supervisor` instead of `nursery`:

```verum
async fn main() using [IO, Logger] {
    let sup = Supervisor.new(SupervisionStrategy.OneForOne);

    sup.spawn(ChildSpec {
        name: "metrics-publisher",
        task: || publish_loop(),
        restart: RestartPolicy.Permanent,
        isolation: IsolationLevel.SendOnly,
        max_restarts: 5,
        within: 60.seconds(),
    });

    sup.spawn(ChildSpec {
        name: "cache-sweeper",
        task: || cache_sweep_loop(),
        restart: RestartPolicy.Transient,
        ..Default.default()
    });

    sup.run().await;
}
```

Supervisors extend nursery semantics with restart policies — see
[`stdlib/runtime`](/docs/stdlib/runtime).

## Handlers in detail

### `on_cancel`

Runs if the nursery is cancelled **from outside** — a parent nursery
is cancelling it, or a signal handler called `cancel_current()`. It
does **not** run on internal errors or timeouts.

```verum
nursery {
    ...
}
on_cancel {
    Logger.warn("parent cancelled us");
    publish_cancelled_metric();
}
```

Runs exactly once. Must not itself panic or throw — exceptions from
`on_cancel` are swallowed (with a warning) to preserve the
cancellation chain.

### `recover`

Runs if the nursery fails — any sibling's error propagated, timeout
expired, external cancellation, or task panic. The `NurseryError`
carries structured information:

```verum
type NurseryError is
    | Single(Error)
    | Multiple(List<Error>)
    | Timeout
    | Cancelled
    | Panic(PanicInfo)
    | TaskLimitExceeded(Int);
```

Two recover syntaxes:

```verum
// Match-arm form:
recover {
    NurseryError.Timeout => default_value,
    NurseryError.Cancelled => Result.Err(Error.Cancelled),
    NurseryError.Single(e) => Result.Err(e),
    _ => Result.Err(Error.Unknown),
}

// Closure form:
recover |e| {
    log_error(e);
    Result.Err(Error.from(e))
}
```

## Guarantees

- **No orphan tasks**: every `spawn` inside the nursery's scope
  completes, fails, or is cancelled before the `nursery { ... }`
  block returns.
- **Error propagation**: with `on_error: cancel_all`, the first
  failure cancels all siblings and returns the error.
- **Cleanup**: `on_cancel` runs exactly once if the nursery is
  cancelled from outside; `recover` runs on internal failure.
- **Context inheritance**: each `spawn` inherits the parent's
  context stack (see
  [async-concurrency → spawn](/docs/language/async-concurrency#spawn)).
- **Panic safety**: a panic in a child task is caught, wrapped in
  `NurseryError.Panic`, and surfaced to `recover`.

## Pitfalls

### Don't reach outside the nursery for resources it manages

A nursery may cancel a task mid-way; reaching "outside" may leak
half-built state:

```verum
// Wrong: `result` may contain inconsistent partial state on cancel
let mut result = Vec.new();
nursery {
    for x in items { spawn async { result.push(transform(x).await); }; }
}
// (syntactically rejected: `result` is shared mutably without Mutex)

// Right: scope result to the nursery's body
let result = nursery {
    let m = Shared.new(Mutex.new(Vec.new()));
    for x in items {
        let m = m.clone();
        spawn async move { m.lock().await.push(transform(x).await); };
    }
    m
};
```

### Use a `Supervisor` for restart

`nursery` tasks are not restarted on failure. For long-running
services that need "if the worker crashes, start a new one", use
`Supervisor`.

### A `spawn` without a `nursery` is still legal

A bare `spawn` with no enclosing nursery returns a `JoinHandle`
the caller must await. This is correct for ad-hoc two-task joins
(`let h = spawn work(); ...; h.await;`) — but makes it impossible
to guarantee the task cannot outlive its caller.

### Nesting nurseries

Nurseries nest — inner nursery errors propagate to the outer nursery,
which can cancel outer siblings. This is how large systems compose:
each subsystem is its own nursery; the top-level nursery supervises
them all.

## See also

- **[async → nursery](/docs/stdlib/async)** — full API.
- **[runtime → supervision](/docs/stdlib/runtime)** — `Supervisor`.
- **[language/async-concurrency](/docs/language/async-concurrency)** —
  grammar and normative reference.
- **[Resilience](/docs/cookbook/resilience)** — retry, circuit
  breakers, bulkheads layered on nurseries.
- **[Channels](/docs/cookbook/channels)** — for inter-task
  communication inside a nursery.
- **[Async pipeline tutorial](/docs/tutorials/async-pipeline)** —
  production-shaped example.
