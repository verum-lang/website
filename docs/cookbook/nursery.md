---
title: Structured concurrency with `nursery`
description: Fan out parallel work with guaranteed join or cancel.
---

# Structured concurrency

### Parallel fetch with fail-fast

```verum
async fn fetch_all(urls: &List<Text>) -> Result<List<Bytes>, Error>
    using [Http]
{
    nursery(on_error: cancel_all, timeout: 10.seconds()) {
        let handles: List<JoinHandle<Bytes>> = urls.iter()
            .map(|u| spawn Http.get(u.clone()))
            .collect();
        try_join_all(handles).await
    } on_cancel {
        // runs if nursery is cancelled from outside
        metrics.increment("fetch_all.cancelled");
    } recover(e: NurseryError) {
        // runs if something goes wrong; pattern-match on NurseryError
        Result.Err(Error.from(e))
    }
}
```

### Bounded parallelism

```verum
async fn process_bounded<T, F, Fut>(items: List<T>, concurrency: Int, f: F) -> List<Result<F.Output, Error>>
    where F: Fn(T) -> Fut, Fut: Future<Output = Result<F.Output, Error>>
{
    let sem = Shared.new(Semaphore.new(concurrency));
    nursery {
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

// Usage
let results = process_bounded(urls, 16, |u| Http.get(u)).await;
```

### Fire-and-forget background tasks with supervision

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

### Guarantees

- **No orphan tasks**: every `spawn` inside the nursery's scope
  completes, fails, or is cancelled before the `nursery { ... }`
  block returns.
- **Error propagation**: with `on_error: cancel_all`, the first
  failure cancels all siblings and returns the error.
- **Cleanup**: `on_cancel` runs exactly once if the nursery is
  cancelled from outside.

### `NurseryError` variants

```verum
type NurseryError is
    | Single(Error)
    | Multiple(List<Error>)
    | Timeout
    | Cancelled
    | Panic(PanicInfo)
    | TaskLimitExceeded(Int);
```

### Pitfalls

- **Don't reach outside the nursery for resources it manages** — the
  nursery may cancel a task mid-way. Scope the resources inside.
- **`spawn` outside `nursery`** still works but gives you *fire-and-
  forget* semantics. Use a `Supervisor` for long-running tasks that
  need restart policies.

### See also

- **[async → nursery](/docs/stdlib/async#nursery--structured-concurrency)**
- **[runtime → supervision](/docs/stdlib/runtime#supervision-trees)**
- **[Language → async & concurrency](/docs/language/async-concurrency)**
