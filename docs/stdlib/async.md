---
sidebar_position: 1
title: async
---

# `core::async` — Futures, tasks, channels

The core async primitives. Language-level `async fn`, `.await`,
`spawn`, and `nursery` build on these types.

## `Future<T>`

```verum
type Poll<T> is
    | Ready(T)
    | Pending;

type Future is protocol {
    type Output;
    fn poll(&mut self, cx: &mut Context) -> Poll<Self.Output>;
};
```

## `Task<T>` and `JoinHandle<T>`

```verum
let handle: JoinHandle<T> = spawn computation();
let result: T = handle.await;
handle.abort();                     // cancel the task
```

## Executors

```verum
let runtime = Runtime::new(RuntimeConfig.default())?;
let result = runtime.block_on(async_main());
runtime.shutdown();

// Or the global executor:
let x = block_on(my_async_fn());
```

## Channels

```verum
// Bounded MPSC
let (tx, rx) = channel::<Event>(capacity: 100);

// Unbounded MPSC
let (tx, rx) = unbounded_channel::<Event>();

// Broadcast (MPMC)
let (tx, rx_template) = broadcast_channel::<Event>(capacity: 64);
let rx1 = rx_template.subscribe();
let rx2 = rx_template.subscribe();

// One-shot
let (tx, rx) = oneshot::<Result<T, Error>>();
```

Operations: `send`, `try_send`, `recv`, `try_recv`, `close`.

## Streams

```verum
type Stream is protocol {
    type Item;
    fn poll_next(&mut self, cx: &mut Context) -> Poll<Maybe<Self.Item>>;
};

let mut s = interval(1.seconds()).map(|_| fetch_data());
for await batch in s { process(batch); }
```

## Generators

```verum
async fn* produce() -> AsyncIterator<Event> {
    loop {
        let e = fetch_event().await;
        yield e;
    }
}
```

## Selection

```verum
select {
    x = fut_a.await => handle_a(x),
    y = fut_b.await => handle_b(y),
    _ = sleep(5.seconds()) => Err(Error.Timeout),
}

// Race
let winner = race(fut_a, fut_b).await;
```

## Timers

```verum
sleep(100.ms()).await;
let r = timeout(5.seconds(), slow_op()).await?;
let ticker = Interval::new(1.seconds());
```

## Parallel helpers

```verum
let results = parallel_map(&items, |x| process(x)).await;
let filtered = parallel_filter_map(&items, |x| maybe_transform(x)).await;
parallel_for_each(&items, |x| record(x)).await;
let sum = parallel_reduce(&items, 0, |acc, x| acc + x).await;
```

## Retry & circuit breaker

```verum
let cfg = RetryConfig { attempts: 3, backoff: Backoff.Exponential(100.ms()) };
let result = execute_with_retry(cfg, || fetch()).await?;

let breaker = CircuitBreaker::new(CircuitBreakerConfig {
    failure_threshold: 5,
    cooldown:          30.seconds(),
});
breaker.call(|| remote()).await
```

## Nursery

```verum
nursery(timeout: 10.seconds(), on_error: cancel_all) {
    let a = spawn task_a();
    let b = spawn task_b();
    try_join(a, b).await?
} on_cancel {
    metrics.inc("nursery.cancelled");
} recover(e: NurseryError) {
    log.error(e);
}
```

## Waker / Context (low level)

```verum
type Waker;           // notifies the executor a future may be ready
type Context;         // passed to poll, carries Waker
type RawWaker;        // for building custom wakers
type RawWakerVTable;
```

## See also

- **[Language → async & concurrency](/docs/language/async-concurrency)** —
  surface syntax.
- **[runtime](/docs/stdlib/runtime)** — executor configuration.
- **[sync](/docs/stdlib/sync)** — atomics and locks.
