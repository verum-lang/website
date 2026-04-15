---
title: Async / await basics
description: The smallest-possible tour of async in Verum.
---

# Async / await basics

### An `async fn`

```verum
async fn fetch(url: &Text) -> Result<Bytes, HttpError> using [Http] {
    let resp = Http.get(url).await?;
    resp.body().await
}
```

An `async fn`:
- Declares the function as asynchronous.
- Returns a `Future<Output = T>` (where `T` is what the body returns).
- May use `.await` to suspend on inner futures.
- May use `using [...]` to demand contexts (propagated across suspensions).

### Driving a future

```verum
// Top-level
fn main() using [IO, Http] {
    let result = block_on(fetch(&"https://example.com"));
    println(&f"{result:?}");
}

// Inside another async fn
async fn worker() using [IO, Http] {
    let result = fetch(&"…").await?;
    println(&f"{result:?}");
}
```

`block_on(future)` runs the future on the current thread until it
completes. Inside async code you `.await` — never `block_on` — or
you'll deadlock the executor.

### Parallel: `spawn` and `join`

```verum
async fn do_two_things() using [Http] {
    let h1 = spawn fetch(&"a");
    let h2 = spawn fetch(&"b");
    let (a, b) = (h1.await, h2.await);
}

async fn do_many_things(urls: &List<Text>) using [Http] -> List<Bytes> {
    let handles: List<_> = urls.iter().map(|u| spawn fetch(u.clone())).collect();
    join_all(handles).await.into_iter().filter_map(Result.ok).collect()
}
```

### Yielding

```verum
async fn polite_loop() {
    for i in 0..1_000_000 {
        crunch(i);
        if i % 1000 == 0 { yield_now().await; }
    }
}
```

`yield_now()` returns a future that completes on the next executor
tick — useful for long CPU-bound async loops that shouldn't starve
siblings.

### Common patterns

| I want to… | Do |
|---|---|
| Fan out with a join | `join(f1, f2).await` or `join_all(fs).await` |
| Race to completion | `race(f1, f2).await` |
| First-success | `try_first(fs).await` |
| With a time budget | `timeout(f, 5.seconds()).await?` |
| Wait forever | `pending::<T>().await` |
| Pass a value when ready | `ready(v).await` |

### Pitfall — `.await` inside a synchronous mutex

```verum
// DO NOT
let guard = mu.lock().await;
let resp = Http.get(url).await?;     // all callers of this mutex are blocked.
guard.commit(resp);
```

Do the IO outside the lock:

```verum
let req = {
    let g = mu.lock().await;
    g.build_request()
};
let resp = Http.get(req.url).await?;
{
    let mut g = mu.lock().await;
    g.commit(resp);
}
```

### See also

- **[async](/docs/stdlib/async)** — Future, Stream, Task, channels, timers.
- **[Nursery](/docs/cookbook/nursery)** — structured concurrency.
- **[Channels](/docs/cookbook/channels)** — MPSC, broadcast, oneshot.
