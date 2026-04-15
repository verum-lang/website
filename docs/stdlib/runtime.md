---
sidebar_position: 3
title: runtime
description: Runtime flavours, supervision, ExecutionEnv (θ+), benchmarks.
---

# `core::runtime` — Runtime configuration & supervision

The runtime is configurable per-project — full multi-threaded async on
servers, single-thread on WASM, no-heap on embedded. This module
exposes the configuration types, supervision primitives, the unified
`ExecutionEnv` (θ+), and benchmark harness.

| File | What's in it |
|---|---|
| `mod.vr` | orchestration + re-exports + `init`, `shutdown`, `current_env`, `Runtime` static accessors, `Bencher`, `benchmark` |
| `config.vr` | `RuntimeConfig` protocol, `InitError`, per-flavour configs |
| `env.vr` | `ExecutionEnv`, `MemoryContext`, `CapabilityContext`, `RecoveryContext`, `ConcurrencyContext` |
| `recovery.vr` | `RecoveryStrategy`, retry, circuit breaker |
| `supervisor.vr` | `Supervisor`, `ChildSpec`, `SupervisionStrategy`, `RestartPolicy` |
| `spawn.vr` | `SpawnConfig`, `SpawnConfigBuilder`, `Priority` |
| `pool.vr` | `ThreadPool`, `ThreadPoolConfig` |
| `ctx_bridge.vr` | runtime ↔ context-system interop |
| `task_queue.vr` | work-stealing deque (internal) |
| `stack_alloc.vr` | stack allocator for `runtime = "embedded"` |

---

## Runtime flavours

Selected via `Verum.toml`:

```toml
[runtime]
kind = "full"                # full | single_thread | no_async | embedded | no_runtime
worker_threads = 8           # default: num_cpus()
stack_size = 2_097_152       # 2 MiB
io_engine = "io_uring"       # io_uring | kqueue | iocp | none
```

| Flavour | Threads | Async | Heap | Typical target |
|---|---|---|---|---|
| `full` | work-stealing pool | yes | yes | servers, desktop apps |
| `single_thread` | 1 | yes | yes | WASM, GUI main thread |
| `no_async` | 1 or pool | async compiled to sync | yes | CLI tools, scripts |
| `embedded` | 1 | limited | stack-only | microcontrollers |
| `no_runtime` | 1 | stubs | no | kernel, bootloaders |

Each flavour implements the `RuntimeConfig` protocol; the compiler
picks the right one at build time.

---

## Initialisation

```verum
init() -> Result<(), InitError>                 // install default runtime
init_with<R: RuntimeConfig>() -> Result<(), InitError>
shutdown()
is_initialized() -> Bool
```

Called once per process (typically in `main`). `spawn` / `block_on`
implicitly call `init()` if no runtime is registered.

```verum
fn main() using [IO] {
    init().expect("runtime");
    block_on(async_main());
    shutdown();
}
```

### `InitError`

```verum
type InitError is
    | AlreadyInitialized
    | InvalidConfig(Text)
    | ResourceExhausted
    | PlatformUnsupported(Text);
```

---

## `ExecutionEnv` (θ+)

The unified per-task context: **memory** + **capabilities** +
**recovery** + **concurrency**.

```verum
type ExecutionEnv is {
    memory:       MemoryContext,
    capabilities: CapabilityContext,
    recovery:     RecoveryContext,
    concurrency:  ConcurrencyContext,
};

type MemoryContext is {
    allocator: &dyn Allocator,
    tier:      ExecutionTier,
    gen:       UInt32,
    epoch:     UInt32,
};

type CapabilityContext is {
    static_deps: Map<TypeId, *mut Byte>,       // zero-overhead @injectable
    dynamic_stack: Vec<DynamicFrame>,          // provide/using stack
};

type RecoveryContext is {
    policy: RecoveryStrategy,
    retries_remaining: Int,
    circuit: Maybe<CircuitBreaker>,
};

type ConcurrencyContext is {
    executor: &Executor,
    io_driver: &IODriver,
    task_id: TaskId,
};

type ExecutionTier is Interpreter | Aot;
```

### Accessors

```verum
current_env() -> &ExecutionEnv
current_env_mut() -> &mut ExecutionEnv
```

`spawn` snapshots `current_env()` at spawn time and re-installs it in
the child task.

---

## Supervision trees

```verum
type Supervisor is { ... };
type SupervisorId is { id: UInt64 };

type SupervisionStrategy is
    | OneForOne                // restart failed child only
    | OneForAll                // restart all children on any failure
    | RestForOne               // restart failed + all started after it
    | SimpleOneForOne;         // dynamic children, restart individually

type RestartPolicy is
    | Permanent                // always restart
    | Transient                // restart only on abnormal exit
    | Temporary;               // never restart

type IsolationLevel is Shared | SendOnly | Full;

type ChildSpec is {
    name: Text,
    task: fn() -> Future<()>,
    restart: RestartPolicy,
    isolation: IsolationLevel,
    max_restarts: Int,
    within: Duration,            // restart window
};
```

### Supervisor API

```verum
Supervisor::new(SupervisionStrategy) -> Supervisor

sup.spawn(ChildSpec)
sup.terminate_child(&name)
sup.restart_child(&name)
sup.which_children() -> List<ChildSpec>
sup.count_children() -> SupervisorCount

sup.run().await                   // run until all children terminate
sup.shutdown(duration).await      // graceful shutdown
```

### Example

```verum
let sup = Supervisor::new(SupervisionStrategy.OneForOne);

sup.spawn(ChildSpec {
    name: "ingestion",
    task: || ingestion_loop(),
    restart: RestartPolicy.Permanent,
    isolation: IsolationLevel.SendOnly,
    max_restarts: 5,
    within: 60.seconds(),
});

sup.spawn(ChildSpec {
    name: "health-check",
    task: || health_loop(),
    restart: RestartPolicy.Transient,
    isolation: IsolationLevel.SendOnly,
    max_restarts: 10,
    within: 60.seconds(),
});

sup.run().await
```

---

## Recovery strategies

(Detailed API in [`async`](/docs/stdlib/async#retry-and-circuit-breaker).)

```verum
type RecoveryStrategy is
    | None
    | Retry(RetryConfig)
    | CircuitBreaker(CircuitBreakerConfig)
    | Fallback(fn() -> T)
    | Supervised;

type BackoffStrategy is
    | Fixed(Duration)
    | Linear(Duration, Duration)
    | Exponential { initial: Duration, max: Duration, factor: Float, jitter: Bool };
```

---

## Spawn configuration

```verum
type SpawnConfig is { ... };
type Priority is Low | Normal | High | Critical;

SpawnConfig::new()
    .with_priority(Priority.High)
    .with_isolation(IsolationLevel.Full)
    .with_recovery(RecoveryStrategy.Retry(RetryConfig::exponential(3, 100.ms())))
    .with_restart(RestartPolicy.Permanent)
    .with_timeout_ms(5000)
    .with_name("compute-worker")
```

See [`async`](/docs/stdlib/async#spawn-configuration) for `spawn_with`.

---

## Thread pool

```verum
type ThreadPool is { ... };
type ThreadPoolConfig is {
    size: Int,
    stack_size: Int,
    name_prefix: Text,
};

ThreadPool::new(ThreadPoolConfig) -> ThreadPool
pool.execute(|| blocking_computation())
pool.execute_with_priority(Priority.High, || ...)
pool.shutdown_join()
pool.available_threads() -> Int
pool.queued_jobs() -> Int
```

Used by `spawn_blocking` and by user code wanting to run CPU-heavy
synchronous work without blocking the async executor.

---

## Runtime metrics

```verum
Runtime.current_epoch() -> UInt32
Runtime.memory_usage() -> Int                   // bytes allocated
Runtime.advance_epoch()                         // force CBGR epoch bump
Runtime.allocation_count() -> Int               // active allocations
Runtime.validate_all()                          // sweep + report issues
Runtime.active_tasks() -> Int
Runtime.queued_tasks() -> Int
```

---

## Benchmarks — `Bencher`

```verum
type Bencher is { ... };
type BenchmarkResult is {
    name: Text,
    iterations: Int,
    elapsed_ns: Int,
    ns_per_iter: Int,
    throughput: Maybe<Float>,
};

Bencher::new() -> Bencher
b.with_iterations(n) -> Bencher
b.iter(|| measured_work())         // runs n times, records
b.ns_per_iter() -> Int
b.elapsed() -> Int

// Convenience top-level:
benchmark("name", |b| b.iter(|| work())) -> BenchmarkResult
```

### Example

```verum
@bench
fn bench_fibonacci_iter(b: &mut Bencher) {
    b.iter(|| fibonacci(20));
}
```

`verum bench` runs all `@bench` functions and prints statistics.

---

## `ctx_bridge` — runtime ↔ context bridge

Internal plumbing that lets `provide` / `using` interoperate with
`ExecutionEnv`. You don't call it directly, but you see its effects:

- A `provide X = v in { ... }` scope registers `v` in the current
  task's `CapabilityContext.dynamic_stack`.
- `spawn` clones the current stack into the child's env.
- Channel receivers start with a **cleared** dynamic stack (channels
  do not propagate contexts).

---

## Per-flavour runtime configs

Each flavour lives in its own file (selected by `@cfg(runtime = …)`):

- `FullRuntime` — work-stealing pool, global allocator, full async,
  `num_cpus()` workers, `io_uring`/`kqueue`/`IOCP` reactor.
- `SingleThreadRuntime` — single-threaded event loop, WASM-friendly.
- `SyncRuntime` — async→sync lowering, blocking I/O, optional thread
  pool for parallelism.
- `EmbeddedRuntime` — stack allocator only, no heap, no async.
- `CustomRuntime` — implement `RuntimeConfig` yourself.

---

## Cross-references

- **[async](/docs/stdlib/async)** — futures, channels, tasks, streams.
- **[sync](/docs/stdlib/sync)** — atomics & locks the runtime uses.
- **[context](/docs/stdlib/context)** — `provide`/`using` semantics.
- **[mem](/docs/stdlib/mem)** — `ExecutionTier` controls CBGR behaviour.
- **[sys](/docs/stdlib/sys)** — `IOEngine`, `ctx_push_frame`, platform layer.
- **[Architecture → runtime tiers](/docs/architecture/runtime-tiers)** — implementation details.
