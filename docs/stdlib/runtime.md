---
sidebar_position: 3
title: runtime
description: core.runtime — the Verum runtime (ExecutionEnv, executor, supervision, thread pool, recovery, timers, TLS) documented against the implementation in core/runtime.
---

# `core.runtime`

The runtime module is the single place where the language meets the
operating system. Everything with a `sys.*` call underneath —
scheduling, futures, threads, timers, memory arenas, TLS, retry
loops — lives here. The same module ships in five profiles
(`full`, `single_thread`, `no_async`, `no_heap`, `embedded`); each
profile swaps in a compatible implementation of the interfaces
below. See [runtime tiers → profiles](/docs/architecture/runtime-tiers#axis-3--runtime-profiles)
for when to pick which profile.

Everything documented here matches the `.vr` sources in
`core/runtime/`. Items marked *(protocol)* are typed interfaces that
multiple profiles implement; items marked *(record)* are concrete
types.

## Module map

| Submodule         | Contents                                                          |
|-------------------|-------------------------------------------------------------------|
| `runtime.env`     | **`ExecutionEnv` (θ+)** — memory / capabilities / recovery / concurrency. |
| `runtime.config`  | `RuntimeConfig` protocol and profile-specific implementations.    |
| `runtime.supervisor` | Supervision tree — `Supervisor`, `SupervisorHandle`, `ChildSpec`, restart strategies. |
| `runtime.recovery` | Retry policies, circuit breakers, backoff and jitter.             |
| `runtime.pool`    | Thread-pool primitive (`ThreadPool`, `TaskHandle`).                |
| `runtime.thread`  | OS threads (`Thread`, `ThreadBuilder`, `JoinHandle<T>`, stack traces). |
| `runtime.time`    | Monotonic / wall clocks, `sleep`, `Instant`, `Duration`.            |
| `runtime.tls`     | Thread-local storage primitive.                                    |
| `runtime.stack_alloc` | Stack-only allocator for `no_heap`.                            |
| `runtime.syscall` | Platform `sys.*` intrinsic imports.                                |
| `runtime.sync`    | Synchronisation wiring (re-exports from `core.sync`).              |
| `runtime.cbgr`    | CBGR-runtime glue: generation / epoch trackers.                    |
| `runtime.ctx_bridge` | Bridges between slot-based context access and the language's `using [...]` clause. |
| `runtime.async_ops` | Implementation of `await` / `select` at the op-code level.       |
| `runtime.spawn`   | Low-level `spawn` primitive (the language's `spawn` compiles to this). |

## Execution environment — `runtime.env`

The centrepiece. `ExecutionEnv` (θ+) is a 2,560-byte structure
holding the four pillars of execution state. Full layout, fork
rules, and hot-path costs are documented in
**[architecture → execution environment](/docs/architecture/execution-environment)**.

The user-facing API is deliberately small — most Verum code never
touches `runtime.env` directly, because the language's `&T`,
`using [...]`, `provide`, `defer`, and `spawn` constructs read and
write it implicitly.

```verum
/// Get the current task's environment (usually you don't need this).
public fn current_env() -> Maybe<&ExecutionEnv>;

/// Run a closure inside a freshly forked environment.
public fn with_forked_env<T, F: fn() -> T>(f: F) -> T;

/// CBGR safety tier (four variants, see architecture docs).
public type ExecutionTier is
    | Tier0_Full       // full CBGR: ~15 ns per deref
    | Tier1_Epoch      // gen + epoch: ~8 ns
    | Tier2_Gen        // gen only: ~3 ns
    | Tier3_Unchecked; // no checks: 0 ns (unsafe)
```

## Runtime configuration — `runtime.config`

```verum
public type RuntimeConfig is protocol {
    fn worker_threads(&self) -> Int;
    fn max_blocking_threads(&self) -> Int;
    fn thread_stack_size(&self) -> Int;
    fn enable_io(&self) -> Bool;
    fn enable_time(&self) -> Bool;
    fn cbgr_tier(&self) -> ExecutionTier;
};
```

The canonical implementation for the `full` profile is
`DefaultRuntimeConfig`, which reads from the `[runtime]` section of
`Verum.toml` and falls back to sensible defaults (`worker_threads =
num_cpus`, `max_blocking_threads = 512`, `stack_size = 2 MiB`,
`cbgr_tier = Tier0_Full`).

## Starting a runtime — `Runtime`

`core.async.executor.Runtime` is the top-level handle returned by
`RuntimeBuilder`. One is created in `fn main()` (implicitly by the
language runtime) or explicitly by `Runtime.new()` in tests.

```verum
public type Runtime is { /* private */ };

implement Runtime {
    public fn builder() -> RuntimeBuilder;
    public fn new() -> Runtime;                        // default config
    public fn spawn<F: Future>(&self, f: F) -> JoinHandle<F.Output>;
    public fn block_on<F: Future>(&self, f: F) -> F.Output;
    public fn shutdown(self, timeout: Duration) -> Result<(), ShutdownError>;
}

/// Enter the async world from a synchronous function.
public fn block_on<F: Future>(future: F) -> F.Output;
```

`RuntimeBuilder` is the fluent configuration surface:

```verum
public type RuntimeBuilder is { /* private */ };

implement RuntimeBuilder {
    public fn new() -> Self;
    public fn worker_threads(self, n: Int) -> Self;
    public fn thread_stack_size(self, bytes: Int) -> Self;
    public fn enable_io(self, on: Bool) -> Self;
    public fn enable_time(self, on: Bool) -> Self;
    public fn thread_name(self, prefix: Text) -> Self;
    public fn max_blocking_threads(self, n: Int) -> Self;
    public fn build(self) -> Result<Runtime, BuildError>;
}
```

## Supervision — `runtime.supervisor`

Erlang/OTP-style supervision over async tasks. A supervisor owns a
set of children; each child has a `ChildSpec` that declares how the
supervisor reacts when the child fails.

### Key types

```verum
public type SupervisorId is (UInt64);
public type ChildId      is (UInt64);

public type SupervisionStrategy is
    | OneForOne          // restart only the failing child
    | OneForAll          // restart every child on any failure
    | RestForOne         // restart the failing child and its successors
    | SimpleOneForOne;   // all children share a spec; restart the failed one

public type RestartStrategy is
    | Permanent          // always restart
    | Transient          // restart on abnormal exit only
    | Temporary;         // never restart

public type FailureReason is
    | Panic(Text)
    | Exception(Text)
    | Exit(Int)
    | Killed
    | Other(Text);

public type ChildStatus is
    | Starting | Running | Restarting | Stopping | Stopped | Failed(FailureReason);

public type RestartIntensity is {
    max_restarts: Int,        // max restarts allowed…
    period_ms:    Int,        // …within this window
};

public type ChildSpec is {
    id:                  Text,
    start:               Heap<fn() -> TaskHandle>,    // async factory
    restart:             RestartStrategy,
    shutdown:            ShutdownStrategy,
    ty:                  ChildType,                   // Worker | Supervisor
    significant:         Bool,                        // escalate if it dies?
    modules:             List<Text>,                  // for hot-code reload
};

public type ShutdownStrategy is
    | BrutalKill                          // SIGKILL equivalent
    | Timeout(Duration)                   // graceful, then force
    | Infinity;                           // wait forever
```

### Creating a supervisor

```verum
public type SupervisorConfig is {
    strategy:            SupervisionStrategy,
    intensity:           RestartIntensity,
    auto_shutdown:       AutoShutdownStrategy,
    name:                Maybe<Text>,
    escalation:          EscalationPolicy,
};

public type SupervisorHandle is { /* private */ };

implement SupervisorHandle {
    public async fn start(cfg: SupervisorConfig, children: List<ChildSpec>)
        -> Result<SupervisorHandle, SupervisorError>;
    public async fn start_child(&self, spec: ChildSpec)
        -> Result<ChildId, SupervisorError>;
    public async fn terminate_child(&self, id: ChildId)
        -> Result<(), SupervisorError>;
    public async fn restart_child(&self, id: ChildId)
        -> Result<ChildId, SupervisorError>;
    public async fn which_children(&self)
        -> List<(ChildId, ChildStatus)>;
    public async fn count_children(&self)
        -> SupervisorStatus;
    public async fn shutdown(&self, strategy: ShutdownStrategy)
        -> Result<(), SupervisorError>;
}
```

### Built-in shortcuts

```verum
public fn root_supervisor() -> &SupervisorHandle;

public async fn spawn_supervised<F, T>(future: F) -> Result<ChildId, SupervisorError>
    where F: Future<Output = T> + Send + 'static, T: Send + 'static;

public async fn spawn_permanent<F, T>(future: F, name: Text) -> Result<ChildId, SupervisorError>;
public async fn spawn_temporary<F, T>(future: F, name: Text) -> Result<ChildId, SupervisorError>;
```

### Escalation

When a supervisor exceeds `RestartIntensity`, it escalates to its
parent supervisor according to `EscalationPolicy`:

```verum
public type EscalationPolicy is
    | ShutdownSelf           // supervisor dies; parent decides what to do
    | NotifyParent           // send a message; parent decides
    | CustomHandler(fn(EscalationReason) -> EscalationAction);

public type EscalationReason is
    | IntensityExceeded { restarts: Int, window_ms: Int }
    | SignificantChildDied(ChildId)
    | ChildStartupFailed(ChildId, FailureReason)
    | ManualEscalation(Text);
```

## Recovery — `runtime.recovery`

Retry loops, circuit breakers, backoff and jitter. Available on
every profile (including `no_async` — the synchronous form uses the
same types).

### Retry

```verum
public type BackoffStrategy is
    | Fixed(Duration)
    | Linear { base: Duration, step: Duration, max: Duration }
    | Exponential { base: Duration, max: Duration, factor: Int }
    | Fibonacci   { base: Duration, max: Duration };

public type JitterConfig is
    | None
    | Full(Float)            // 0..1 — fraction of full jitter
    | Equal(Float);          // equal jitter (AWS model)

public type RetryPredicate is fn(&Error) -> Bool;

public type RetryPolicy is {
    max_attempts: Int,
    backoff:      BackoffStrategy,
    jitter:       JitterConfig,
    retry_if:     RetryPredicate,         // default: retry any error
};

public async fn execute_with_retry<F, T, E>(
    policy: RetryPolicy,
    f: F,
) -> Result<T, E>
    where F: fn() -> (impl Future<Output = Result<T, E>>);
```

### Circuit breaker

```verum
public type CircuitState is
    | Closed                 // normal
    | Open    { until: Instant }
    | HalfOpen { trials:   Int };

public type CircuitBreakerConfig is {
    failure_threshold:   Int,
    required_successes:  Int,
    timeout:             Duration,
    error_is_failure:    ErrorPredicate,
};

public type CircuitBreaker is { /* private, atomic state */ };

implement CircuitBreaker {
    public fn new(config: CircuitBreakerConfig) -> Self;
    public fn state(&self) -> CircuitState;
    public fn stats(&self) -> CircuitBreakerStats;
}

public async fn execute_with_circuit_breaker<F, T, E>(
    breaker: &CircuitBreaker,
    f: F,
) -> Result<T, CircuitBreakerError<E>>
    where F: fn() -> (impl Future<Output = Result<T, E>>);
```

### The inline variants

The θ+'s `RecoveryContext` stores `InlineCircuitBreaker` (64 bytes)
and `InlineRetryPolicy` (32 bytes) inline, to avoid heap allocation
on the hot path. The boxed types (`CircuitBreaker`, `RetryPolicy`)
above are for long-lived, shared state across tasks.

## Threads — `runtime.thread`

OS-level threads. Available only on profiles that have threading
(`full`, `no_async`). Suspended on `single_thread`, `no_heap`,
`embedded`.

```verum
public type ThreadId     is { /* opaque */ };
public type JoinHandle<T> is { /* opaque */ };
public type Thread       is ();

public type ThreadBuilder is { /* fluent */ };

implement ThreadBuilder {
    public fn new() -> Self;
    public fn name(self, s: Text) -> Self;
    public fn stack_size(self, bytes: Int) -> Self;
    public fn spawn<F, T>(self, f: F) -> Result<JoinHandle<T>, ThreadError>
        where F: fn() -> T + Send + 'static, T: Send + 'static;
}

public type ThreadError is
    | StackTooSmall | OutOfMemory | NameTooLong
    | ProfileUnsupported | SpawnFailed(Text);

public type StackFrame is {
    function: Text,
    file:     Text,
    line:     Int,
    address:  UInt64,
};

public type StackTrace is {
    frames: List<StackFrame>,
    thread: ThreadId,
};
```

## Thread pool — `runtime.pool`

A simple work-stealing `ThreadPool` for CPU-bound tasks that do
not need the full async scheduler:

```verum
public type ThreadPool is { /* private */ };
public type TaskHandle is { /* private */ };

implement ThreadPool {
    public fn new(size: Int) -> Self;
    public fn submit<F, T>(&self, f: F) -> TaskHandle
        where F: fn() -> T + Send, T: Send;
    public fn shutdown(self);
    public fn size(&self) -> Int;
    public fn active_count(&self) -> Int;
}
```

## Time — `runtime.time`

```verum
public type Instant  is { /* monotonic */ };
public type Duration is { /* nanoseconds */ };

public fn now() -> Instant;
public fn monotonic_nanos() -> UInt64;
public fn wall_time() -> Result<WallTime, TimeError>;
public async fn sleep(d: Duration);
public fn elapsed_since(i: Instant) -> Duration;
```

All durations are nanoseconds underneath; the `Duration` type's
constructors (`seconds`, `millis`, `micros`, `nanos`) and operators
enforce unit correctness at compile time.

## Thread-local storage — `runtime.tls`

`runtime.tls` provides a typed, `@thread_local` static primitive.
Profile-dependent: profiles without threads degrade to a single
cell per program.

```verum
public type TlsSlot<T> is { /* private */ };

implement<T> TlsSlot<T> {
    public fn new(init: fn() -> T) -> Self;
    public fn with<R>(&self, f: fn(&T) -> R) -> R;
    public fn with_mut<R>(&self, f: fn(&mut T) -> R) -> R;
}
```

## Stack-only allocator — `runtime.stack_alloc`

The `no_heap` profile replaces the global allocator with a
stack-bounded one. `stack_alloc.Arena` carves a fixed-size buffer:

```verum
public type Arena is { /* stack-backed */ };

implement Arena {
    public fn new(buffer: &mut [Byte]) -> Self;
    public fn allocate(&mut self, layout: Layout) -> Result<&mut [Byte], AllocError>;
    public fn reset(&mut self);
    public fn bytes_used(&self) -> Int;
}
```

A `no_heap`-profile program that tries to call `Heap.new(v)` is a
**compile error**, not a runtime failure.

## Process / session — `core.concurrency`

Two small modules outside `runtime` proper but closely related:

- `core.concurrency.process` — child-process spawn (`Command`,
  `Child`, `ExitStatus`, stdin/stdout/stderr pipes).
- `core.concurrency.session` — terminal session utilities (PTY
  allocation, signal propagation, job control).

These are documented under **[stdlib → concurrency](/docs/stdlib/concurrency)**.

## See also

- **[architecture → execution environment](/docs/architecture/execution-environment)**
  — the full θ+ layout and lifecycle.
- **[architecture → runtime tiers](/docs/architecture/runtime-tiers)**
  — execution mode, CBGR safety tiers, and the five profiles.
- **[stdlib → async](/docs/stdlib/async)** — `Future`, `Task`,
  `nursery`, `spawn_with`, channels, streams.
- **[stdlib → sync](/docs/stdlib/sync)** — mutexes, rwlocks,
  atomics, barriers.
- **[language → async & concurrency](/docs/language/async-concurrency)**
  — the user-facing language constructs.
- **[language → error handling](/docs/language/error-handling)** —
  `throws`, `try`, `recover`, `defer`, `errdefer`.
