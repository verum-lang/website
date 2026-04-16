---
sidebar_position: 1
title: async
description: Futures, tasks, channels, streams, timers, nursery, select, parallel.
---

# `core::async` — Asynchronous execution

Full async toolkit: `Future` protocol, executors, channels, async
streams, timers, structured concurrency (`nursery`), racing (`select`),
circuit breakers, retry policies, parallel helpers.

| File | Purpose |
|---|---|
| `poll.vr` | `Poll<T>` — the three async states |
| `waker.vr` | `Waker`, `Context`, `RawWaker`, `RawWakerVTable` |
| `future.vr` | `Future` protocol + `ReadyFuture`, `PendingFuture`, `Lazy`, `Join*`, `Select2`, `FutureExt` |
| `task.vr` | `Task<T>`, `JoinHandle<T>`, `TaskId`, `JoinError`, `JoinSet<T>`, `YieldNow` |
| `channel.vr` | `Channel<T>`, `Sender`/`Receiver`, `OneshotSender`/`OneshotReceiver`, send/try errors |
| `broadcast.vr` | `BroadcastSender<T>`, `BroadcastReceiver<T>`, `broadcast_channel` |
| `executor.vr` | `Runtime`, `RuntimeConfig`, `block_on`, `Timeout`, `LocalExecutor` |
| `select.vr` | `Either<A,B>`, `select_either`, `race`, `select_all`, `join_all`, `try_first` |
| `stream.vr` | `Stream`, `StreamExt`, 30+ adapters, factories (`iter`, `unfold`, `interval`, `from_fn`) |
| `generator.vr` | `Generator<T>`, `AsyncGenerator<T>` |
| `nursery.vr` | `Nursery`, `NurseryOptions`, `NurseryError`, `NurseryErrorBehavior`, `TaskHandle` |
| `timer.vr` | `Sleep`, `SleepUntil`, `Interval`, `Delay`, `Timeout`, `Debounce`, `Throttle` |
| `spawn_config.vr` | `SpawnConfig`, `RetryConfig`, `CircuitBreakerConfig`, `RecoveryStrategy`, `Priority` |
| `spawn_with.vr` | `CircuitBreaker`, `CircuitState`, `execute_with_retry*` |
| `parallel.vr` | `parallel_map`, `parallel_filter_map`, `parallel_for_each`, `parallel_reduce` |
| `intrinsics.vr` | runtime hooks: `spawn_with_env`, `executor_spawn`, `future_poll_sync`, `async_sleep_*` |

---

## `Poll<T>` — the three states

```verum
type Poll<T> is Ready(T) | Pending;
```

Methods:

```verum
p.is_ready() / p.is_pending() -> Bool
p.map<U, F>(f: F) -> Poll<U>
p.unwrap() -> T                   // panics if Pending
p.unwrap_or(default) -> T
p.ready() -> Maybe<T>
```

For `Poll<Result<T, E>>`:

```verum
ready_ok(t: T)   -> Poll<Result<T, E>>
ready_err(e: E)  -> Poll<Result<T, E>>
```

---

## `Future` protocol

```verum
type Future is protocol {
    type Output;
    fn poll(&mut self, cx: &mut Context) -> Poll<Self.Output>;
}

type IntoFuture is protocol {
    type Future: Future;
    fn into_future(self) -> Self.Future;
}

type FutureExt is protocol extends Future {
    fn map<U, F>(self, f: F) -> MapFuture<Self, F>
        where F: fn(Self.Output) -> U;
    fn and_then<U, F, Fut2>(self, f: F) -> AndThenFuture<Self, F, Fut2>
        where F: fn(Self.Output) -> Fut2, Fut2: Future<Output = U>;
    fn block(self) -> Self.Output;              // block current thread
}
```

### Factories

```verum
ready(value) -> ReadyFuture<T>             // immediately completes
pending::<T>() -> PendingFuture<T>         // never completes
lazy(|| compute()) -> Lazy<F, T>           // deferred closure
```

### Combinators (also available on `FutureExt`)

```verum
join(fut1, fut2)               -> Join2<Fut1, Fut2>      // (O1, O2)
join3(fut1, fut2, fut3)        -> Join3                   // (O1, O2, O3)
join_all(futures)              -> List<Output>            // for List<F>
try_join(fut1, fut2)           -> Result<(O1, O2), E>     // fail-fast on Err
select(fut1, fut2)             -> Select2                 // first to complete wins
select_either(fut1, fut2)      -> Either<A, B>
race(fut1, fut2)               -> T                       // winner; loser cancelled
select_all(futures)            -> SelectAllResult<T>      // first + index
try_first(futures)             -> SelectAllResult<Output> // first Ok
timeout(fut, duration)         -> Result<T, TimeoutError>
```

---

## Tasks

```verum
type TaskId is { id: UInt64 };
type Task<T>  is { ... };
type JoinHandle<T> is { ... };
type JoinError is Cancelled | Panicked(PanicInfo);

spawn(future) -> JoinHandle<T>                   // shorthand
spawn_blocking(f) -> JoinHandle<T>               // on thread pool
spawn_detached(future) -> ()                     // fire-and-forget
yield_now() -> YieldNow                          // cooperate

h.abort()                                         // cancel
h.is_finished() -> Bool
h.id() -> TaskId
h.await -> Result<T, JoinError>                   // via Future
```

### `JoinSet<T>` — dynamic task collection

```verum
let mut set: JoinSet<Int> = JoinSet.new();
set.spawn(task_a());
set.spawn(task_b());

while let Maybe.Some(res) = set.join_next().await {
    match res {
        Result.Ok(value) => ...,
        Result.Err(JoinError.Cancelled) => ...,
        Result.Err(JoinError.Panicked(info)) => ...,
    }
}
```

---

## Channels

### MPSC — `Sender<T>` / `Receiver<T>`

```verum
channel::<T>() -> (Sender<T>, Receiver<T>)                // unbounded
bounded::<T>(capacity) -> (Sender<T>, Receiver<T>)

tx.send(value)  -> Result<(), SendError<T>>               // blocks if bounded
tx.try_send(value) -> Result<(), TrySendError<T>>         // Full | Disconnected
tx.is_closed() -> Bool
tx.close()

rx.recv() -> Maybe<T>                                     // awaits
rx.try_recv() -> Result<T, TryRecvError>                  // Empty | Disconnected
rx.close()
rx.into_iter()                                            // blocking iterator
rx.stream()                                               // Stream<T>
```

### One-shot — `oneshot::<T>()`

```verum
let (tx, rx) = oneshot::<Result<Data, Error>>();
spawn async move { tx.send(compute()); };
let result = rx.await;
```

### Broadcast (MPMC) — `broadcast_channel`

```verum
broadcast_channel::<T>(capacity) -> (BroadcastSender<T>, BroadcastReceiver<T>)

tx.send(value) -> Result<Int, SendError<T>>               // returns listener count
rx = tx.subscribe()                                        // new receiver
rx.recv() -> Result<T, RecvError>                          // Closed | Lagged
rx.try_recv() -> TryRecvResult<T>                          // Value/Empty/Closed/Lagged
```

Broadcast receivers can fall behind (`Lagged`) — each receives every
message **starting from its subscription point**, or a `Lagged`
notification if the ring buffer overwrote pending messages.

---

## Streams

```verum
type Stream is protocol {
    type Item;
    fn poll_next(&mut self, cx: &mut Context) -> Poll<Maybe<Self.Item>>;
}
type IntoStream is protocol { ... };
type StreamExt is protocol extends Stream { ... };
```

### Factories

```verum
iter(iterable) -> Iter<I>                    // any IntoIterator
once(item) -> StreamOnce<T>
once_future(fut) -> StreamOnce<Output>
empty::<T>() -> StreamEmpty
repeat(item) -> StreamRepeat<T>              // infinite (T: Clone)
repeat_n(item, n) -> StreamRepeatN<T>
from_fn(|| produce_next()) -> StreamFromFn
poll_fn(|cx| ...) -> StreamFromFn
unfold(state, |s| (item, new_state)) -> StreamUnfold
interval(duration) -> Interval
```

### Adapters (return new streams)

```verum
s.map(|x| f(x))            s.filter(|x| pred(x))     s.filter_map(|x| ...)
s.take(n)                  s.skip(n)
s.take_while(|x| pred)     s.skip_while(|x| pred)
s.chain(other)             s.zip(other)              s.enumerate()
s.peekable()               s.flatten()               s.fuse()
s.throttle(rate)           s.debounce(duration)      s.chunks(n)
s.buffer_unordered(n)      s.buffered(n)
s.timeout_each(duration)
```

### Consumers (terminal)

```verum
s.next() -> Poll<Maybe<Item>>
s.try_next() -> Poll<Maybe<Result<T, E>>>
s.for_each(|x| side_effect(x))
s.fold(init, |acc, x| ...) -> B
s.reduce(|a, b| ...) -> Maybe<Item>
s.collect::<C>() -> C
s.find(|x| pred) -> Maybe<Item>
s.any(|x| pred) / s.all(|x| pred)
s.count() / s.last() / s.nth(n)
s.position(|x| pred) -> Maybe<Int>
```

### Example

```verum
async fn monitor(sensor: &Sensor) using [Logger] {
    let mut s = interval(1.seconds())
        .map(|_| sensor.read())
        .filter(|r| r.is_ok())
        .map(|r| r.unwrap())
        .throttle_filter(|v| v.delta() > 0.01);

    while let Maybe.Some(reading) = s.next().await {
        Logger.info(&f"reading: {reading}");
    }
}
```

---

## Generators

```verum
fn* fibonacci() -> Int {
    let (mut a, mut b) = (0, 1);
    loop {
        yield a;
        (a, b) = (b, a + b);
    }
}

for n in fibonacci().take(10) {
    print(f"{n}");
}
```

- `fn* name(...) -> T` — synchronous generator; returns `Iterator<Item=T>`.
- `async fn* name(...) -> T` — async generator; returns `AsyncIterator<Item=T>` (a `Stream<T>`).

Inside a generator:

```verum
yield value;                // emit
// `return` (no value) ends the generator
```

Async generators support `.await`:

```verum
async fn* stream_events(url: &Text) -> Event using [Http] {
    let mut body = Http.get_streaming(url).await?;
    loop {
        let chunk = body.next_chunk().await?;
        for e in parse_chunk(chunk) { yield e; }
    }
}

for await event in stream_events("wss://…") using [Http] {
    handle(event);
}
```

---

## Nursery — structured concurrency

```verum
type NurseryOptions is {
    timeout: Maybe<Duration>,
    max_tasks: Maybe<Int>,
    error_behavior: NurseryErrorBehavior,
};
type NurseryErrorBehavior is CancelAll | WaitAll | FailFast;
type NurseryError is
    | Single(Error)
    | Multiple(List<Error>)
    | Timeout
    | Cancelled
    | Panic(PanicInfo)
    | TaskLimitExceeded(Int);
```

### Usage

```verum
async fn fetch_batch(urls: &List<Text>) -> List<Bytes> using [Http] {
    nursery(
        timeout: 10.seconds(),
        on_error: cancel_all,
        max_tasks: 100,
    ) {
        let handles: List<JoinHandle<Bytes>> = urls.iter()
            .map(|u| spawn Http.get(u.clone()))
            .collect();
        try_join_all(handles).await?
    } on_cancel {
        metrics.increment("fetch_batch.cancelled");
    } recover(e: NurseryError) {
        log_error(&e);
        List.new()
    }
}
```

### Guarantees

- Every spawned task completes, fails, or is cancelled **before** the
  nursery scope exits.
- `on_error` policies:
  - `cancel_all` — one failure cancels all siblings.
  - `wait_all` — collect all results including errors.
  - `fail_fast` — return the first error immediately.
- Context stacks are inherited by spawned tasks.

---

## Timers

```verum
sleep(duration) -> Sleep                   // await to suspend
sleep_ms(ms)                               sleep_secs(secs)
sleep_until(deadline: Instant) -> SleepUntil

delay(future) -> Delay<F>                  // delay future by a duration
timeout(future, duration) -> Timeout<F>    // -> Result<T, TimeoutError>
debounce(future) -> Debounce<F>            // suppress rapid calls
throttle(future) -> Throttle<F>            // rate-limit

interval(duration) -> Interval              // stream firing on schedule
```

```verum
let mut ticker = Interval.new(500.ms());
loop {
    ticker.tick().await;
    update_ui();
}
```

---

## Runtime and executor

```verum
type RuntimeConfig is { ... };
type Runtime is { ... };
type LocalExecutor is { ... };
type TimeoutError is ();
type ExecutionEnv is { ... };               // θ+ context

Runtime.new() -> RuntimeBuilder
builder.worker_threads(n).stack_size(bytes)
       .io_engine(IoEngineKind.IoUring)
       .max_tasks(n)
       .build() -> Runtime

rt.block_on(future) -> Output
rt.spawn(future) -> JoinHandle<T>
rt.shutdown() / rt.shutdown_timeout(duration)
rt.enter()                                 // set current runtime for this thread
```

### Global helpers

```verum
block_on(future) -> Output                 // uses default runtime
spawn(future) -> JoinHandle<T>
current_runtime() -> Maybe<&Runtime>
```

### `LocalExecutor`

Single-threaded executor for `!Send` futures:

```verum
let exec = LocalExecutor.new();
exec.spawn_local(future);
exec.run_until(main_future);
```

---

## Spawn configuration

```verum
type SpawnConfig is { ... };                // builder
type RecoveryStrategy is
    | None
    | Retry(RetryConfig)
    | CircuitBreaker(CircuitBreakerConfig)
    | Fallback(fn() -> T)
    | Supervised;
type RestartPolicy is Permanent | Transient | Temporary;
type IsolationLevel is Shared | SendOnly | Full;
type Priority is Low | Normal | High | Critical;

let cfg = SpawnConfig.new()
    .with_priority(Priority.High)
    .with_isolation(IsolationLevel.Full)
    .with_recovery(RecoveryStrategy.Retry(RetryConfig.exponential(3, 100.ms())))
    .with_timeout_ms(5000)
    .with_name("worker-42");

let handle = spawn_with(cfg, task());
```

---

## Retry and circuit breaker

```verum
type RetryConfig is {
    max_attempts: Int,
    initial_backoff_ms: Int,
    max_backoff_ms: Int,
    backoff_factor: Float,
    jitter: Bool,
};
RetryConfig::fixed(attempts, delay_ms)
RetryConfig.exponential(attempts, initial_ms)

execute_with_retry(|| call_api(), max_attempts = 3, backoff_ms = 100)
execute_with_retry_config(|| call_api(), config)
```

### Circuit breaker

```verum
type CircuitBreakerConfig is {
    failure_threshold: Int,
    reset_timeout_ms: Int,
    half_open_max_calls: Int,
};
type CircuitState is Closed | Open | HalfOpen;

let breaker = CircuitBreaker.new(CircuitBreakerConfig {
    failure_threshold: 5,
    reset_timeout_ms: 30_000,
    half_open_max_calls: 1,
});

if breaker.is_call_allowed() {
    match call_remote().await {
        Result.Ok(v)  => { breaker.record_success(); Result.Ok(v) }
        Result.Err(e) => { breaker.record_failure(); Result.Err(e) }
    }
} else {
    Result.Err(Error.new("circuit open"))
}
```

---

## Parallel helpers

Data-parallel patterns, implemented in a portable way that the work-
stealing runtime can pick up.

```verum
parallel_map(items, worker_count, |x| f(x)) -> List<U>
parallel_filter_map(items, worker_count, |x| maybe_transform(x)) -> List<U>
parallel_for_each(items, worker_count, |x| side_effect(x))
parallel_reduce(items, worker_count, |a, b| combine(a, b)) -> Maybe<T>
```

`worker_count = 0` means "default to `num_cpus()`".

---

## Low-level intrinsics (`intrinsics.vr`)

```verum
type Executor is { ... };                  // opaque handle

Executor::current() -> Maybe<Executor>
Executor::in_async_context() -> Bool

spawn_with_env(future) -> JoinHandle<T>
executor_spawn(&exec, future) -> JoinHandle<T>
executor_block_on(future) -> Output
future_poll_sync(&mut future) -> Maybe<Output>      // single poll, sync

async_sleep_ms(ms) / async_sleep_ns(ns)
```

User code rarely touches these; they exist for runtime authors.

---

## `Waker` and `Context`

```verum
type Waker is { ... };
type Context<'a> is { waker: &'a Waker };
type RawWaker     is { ... };
type RawWakerVTable is { ... };

noop_waker() -> Waker
Context::from_waker(&waker) -> Context<'a>

waker.wake()         // consume, enqueue task
waker.wake_by_ref()  // enqueue without consuming
waker.clone()
```

---

## Context inheritance across `.await` and `spawn`

- `.await` preserves the current context stack verbatim.
- `spawn` snapshots the parent's context stack at spawn time.
- `nursery { spawn ... }` — tasks inherit the nursery's contexts.
- Channels do **not** propagate contexts (they're pure data pipes).

See **[Language → context system](/docs/language/context-system)** for the rules.

---

## See also

- **[sync](/docs/stdlib/sync)** — atomics, mutexes, condvars used by async code.
- **[runtime](/docs/stdlib/runtime)** — `ExecutionEnv`, supervision.
- **[time](/docs/stdlib/time)** — `Duration`, `Instant`, time intrinsics.
- **[Language → async & concurrency](/docs/language/async-concurrency)** — surface syntax (`async fn`, `.await`, `spawn`, `nursery`, `select`).
- **[Architecture → runtime tiers](/docs/architecture/runtime-tiers)** — executor internals.
