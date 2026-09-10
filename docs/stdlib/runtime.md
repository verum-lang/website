---
sidebar_position: 3
title: runtime
description: core.runtime — the Verum runtime (ExecutionEnv, executor, supervision, thread pool, recovery, timers, TLS) documented against the implementation in core/runtime.
status: partial
status_detail: >-
  2026-07-16 wave-4: TIER-COHERENT ZERO held — interp 473/0 == AOT 473/0 of 536 (63 pins, each naming its defect class and task). Clock authority, context slots, FFI struct layouts, const-generic seeding all root-fixed.
---

# `core.runtime`

import StdlibStatus from '@site/src/components/StdlibStatus';

<StdlibStatus
  status="partial"
  detail="Eighteen submodules, all with conformance suites, all exercised under the interpreter. Most are complete there; the partial ones are listed below with what does not work yet. Ahead-of-time compilation covers most of the same ground with a small set of divergences."
  defects={[
    {area: 'thread pool', summary: 'Submitting and joining work runs under the interpreter. Retrieving a value through a task handle is still being filled in — use a channel to carry the result meanwhile.'},
    {area: 'context bridge', summary: 'Context slots read and write correctly from one task. Two tasks writing the same slot in parallel is not yet coherent; confine a context to the task that provided it.'},
    {area: 'stack allocation', summary: 'The allocators are self-contained and available, but a method on an `implement` block parameterised by a const generic does not resolve, which is most of the ergonomic surface. Call the free functions directly.'},
    {area: 'text', summary: 'One Unicode case-category pair is classified wrongly. Everything else in the runtime text surface is correct.'},
    {area: 'async operations', summary: 'Measuring elapsed time across a sleep is unreliable under the interpreter. Read the clock directly on both sides instead.'},
  ]}
  sweepDate="2026-07-15"
/>

> **Status legend.** See [stdlib status badge system](/docs/stdlib/overview#stdlib-status-badge-system).

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

## Submodule status overview

The table below mirrors the per-submodule audit findings at
`core-tests/runtime/<sub>/audit.md`. Click each row's audit link
for the full open-defects list + deferred-action ranking.

| Module | Status | Notes |
|---|---|---|
| `runtime.env` | partial | — |
| `runtime.cbgr` | complete (interp) | canonical re-export of the memory-safety surface |
| `runtime.sync` | complete (interp) | thin canonical re-export |
| `runtime.syscall` | complete (interp) | thin canonical re-export |
| `runtime.time` | complete (interp) | canonical re-export; qualified names bind correctly |
| `runtime.tls` | complete (interp) | live thread-local round-trips |
| `runtime.text` | partial | one Unicode case-category pair classified wrongly |
| `runtime.async_ops` | partial | elapsed time measured across a sleep is unreliable |
| `runtime.ctx_bridge` | partial | parallel writes to one context slot are not coherent |
| `runtime.pool` | partial | submit and join run; retrieving a value through a handle is being filled in |
| `runtime.thread` | partial | spawn and join run under the interpreter |
| `runtime.config` | partial | two display paths pending |
| `runtime.stack_alloc` | regression-only | allocators available; methods on a const-generic `implement` block do not resolve |
| `runtime.recovery` | partial | a foreign `Drop` implementation on a scope guard is not run |
| `runtime.spawn` | partial | a constructor chain can leak an unresolved stub |
| `runtime.task_queue` | complete (interp) | — |
| `runtime.supervisor` | complete (interp) | — |
| `runtime.mod` | partial | accessor receiver resolution through a renamed mount |

Every module above is exercised under the interpreter and, separately,
compiled ahead of time. A change to `core/runtime/` is expected to be
green on both before it lands, which is why the divergences between the
two are tracked rather than tolerated.

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
    | Tier0_Full       // full CBGR: ≤ 15 ns design target; 1.2–1.7 ns (re-measured 2026-09-05) (gen+epoch)
    | Tier1_Epoch      // gen + epoch: 1.2–1.7 ns
    | Tier2_Gen        // gen only: < Tier1_Epoch
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
`verum.toml` and falls back to sensible defaults (`worker_threads =
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
    public fn enable_io(mut self) -> RuntimeBuilder;
    public fn enable_time(mut self) -> RuntimeBuilder;
    public fn thread_name(self, prefix: Text) -> Self;
    public fn max_blocking_threads(self, n: Int) -> Self;
    public fn build(self) -> AsyncRuntime;
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
    | RestForOne;        // restart the failing child and its successors

// NOT `RestartStrategy` — that name belongs to a different type in
// `runtime.env`. The supervisor's is prefixed.
public type SupervisorRestartStrategy is
    | Permanent          // always restart
    | Transient          // restart on abnormal exit only
    | Temporary;         // never restart

public type FailureReason is
    | NormalExit
    | ErrorExit(Text)
    | Panic(Text)
    | Timeout
    | Cancelled
    | Manual             // operator-initiated restart
    | SupervisorShutdown;

public type ChildStatus is
    | Running | Starting | Restarting | Terminated | Failed | Stopped;

// A tracker, not a pair of settings: the counters are atomic and live
// in the type, so a supervisor reads the window without a lock.
public type RestartIntensity is {
    max_restarts:    UInt16,
    window_ms:       UInt64,
    restart_count:   AtomicU16,
    window_start_ms: AtomicU64,
    last_restart_ms: AtomicU64,
};

// No `start` factory, no `modules` list, no `ty`, no `significant` —
// a child is named and scheduled, and the work is handed to
// `SupervisorHandle.supervise` rather than stored in the spec.
public type ChildSpec is {
    name:                Text,
    restart:             SupervisorRestartStrategy,
    shutdown_timeout_ms: UInt32,
    max_restarts:        UInt16,
    restart_window_secs: UInt32,
    priority:            UInt8,        // higher starts earlier, stops later
};

public type ShutdownStrategy is
    | Graceful { timeout_ms: UInt32 }   // cancel, wait, then force
    | Brutal   { timeout_ms: UInt32 }   // force after a minimal timeout
    | Infinite;                         // wait forever
```

`ChildSpec.new(name)` gives Transient / 5000 ms / 10 restarts per 60 s /
priority 100; `ChildSpec.permanent(name)` differs only in the restart
strategy. `ShutdownStrategy.graceful()` is 5000 ms and
`ShutdownStrategy.brutal()` is 100 ms.

### Creating a supervisor

```verum
// The window lives here as two plain numbers; `RestartIntensity` is the
// runtime tracker the supervisor builds from them. There is no
// `AutoShutdownStrategy`, and the name is a `Text`, not a `Maybe<Text>`.
public type SupervisorConfig is {
    strategy:                  SupervisionStrategy,
    max_restarts:              UInt16,
    restart_window_secs:       UInt32,
    escalation:                EscalationPolicy,
    shutdown:                  ShutdownStrategy,
    enable_circuit_breaker:    Bool,
    circuit_breaker_threshold: UInt16,
    name:                      Text,
};

implement SupervisorConfig {
    public fn one_for_one(name: Text) -> Self;      // and the other two
}

implement SupervisorHandle {
    public fn new(config: SupervisorConfig) -> Self;
    public fn root(config: SupervisorConfig) -> Self;
    public fn id(&self) -> SupervisorId;
    public fn name(&self) -> Text;
    public fn status(&self) -> SupervisorStatus;
    public fn set_parent(&self, parent: SupervisorHandle);

    public async fn supervise<F, T>(...) -> Result<ChildId, SupervisorError>;
    public async fn restart(&self, child_id: ChildId)
        -> Result<(), SupervisorError>;
    public async fn terminate(&self, child_id: ChildId)
        -> Result<(), SupervisorError>;
    public async fn shutdown(&self) -> Result<(), SupervisorError>;
}

public type SupervisorStatus is {
    id: SupervisorId, name: Text, strategy: SupervisionStrategy,
    child_count: Int, running_count: Int,
    total_restarts: UInt64, last_restart_ns: UInt64, is_running: Bool,
};

public type SupervisorError is
    | TooManyRestarts { count: Int, window_secs: UInt32 }
    | ChildNotFound(ChildId)
    | ShuttingDown
    | SpawnFailed(Text)
    | ChannelClosed
    | InvalidSpec(Text)
    | NoParentSupervisor
    | Other(Text);
```

`shutdown()` takes no argument — the strategy comes from the config the
supervisor was built with. There is no `start`, `start_child`,
`which_children` or `count_children`: a supervisor is constructed with
`new`/`root`, work is attached with `supervise`, and the census is
`status()`.

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
    | RestartSubtree         // restart every child of this supervisor
    | EscalateToParent       // the @default arm
    | Terminate              // stop the whole tree
    | LogAndIgnore;          // for non-critical children

public type EscalationReason is
    | RestartLimitExceeded {
          child_id: ChildId, child_name: Text,
          max_restarts: UInt16, window_secs: UInt32,
          last_failure: FailureReason,
      }
    | SubSupervisorEscalation {
          supervisor_id: SupervisorId, reason: Heap<EscalationReason>,
      }
    | InternalFault { error: Text }
    | AllStrategiesExhausted;
```

There is no `CustomHandler` arm and no `EscalationAction` type — the
policy is a closed set of four, and `EscalationReason.description()`
renders any of them for a log line. `SubSupervisorEscalation` nests
through `Heap<EscalationReason>`, which is how a deep tree reports the
original cause upward.

## Recovery — `runtime.recovery`

Retry loops, circuit breakers, backoff and jitter. Available on
every profile (including `no_async` — the synchronous form uses the
same types).

### Retry

```verum
Every name in this module carries a `Recovery` prefix — `BackoffStrategy`
and `RetryPolicy` unprefixed are not declared. Delays are milliseconds,
not `Duration`, and there is no Fibonacci arm.

```verum
public type RecoveryBackoffStrategy is
    | Fixed       { delay_ms: UInt64 }
    | Linear      { base_ms: UInt64, increment_ms: UInt64, max_ms: UInt64 }
    | Exponential { base_ms: UInt64, max_ms: UInt64, multiplier: Int }
    | None;                                       // immediate retry

implement RecoveryBackoffStrategy {
    fn calculate_delay_ms(&self, attempt: Int) -> UInt64;
    fn exponential(base_ms: UInt64, max_ms: UInt64) -> Self;   // multiplier 2
}

// A sum type, not a function type.
public type RetryPredicate is
    | AllErrors
    | TransientOnly                    // timeouts, connection reset
    | Custom(fn(&Text) -> Bool);

public type JitterConfig is
    | None
    | Proportional(UInt8)              // percentage 0-100 of the delay
    | Fixed(UInt64)                    // plus or minus this many ms
    | Full;                            // 0 .. delay

implement JitterConfig {
    fn apply(&self, delay_ms: UInt64) -> UInt64;
}

// The config and the policy are two types: the policy carries the
// running state.
public type RuntimeRetryConfig is {
    max_attempts: Int,
    backoff:      RecoveryBackoffStrategy,
    jitter:       JitterConfig,
    retry_on:     RetryPredicate,
};

public type RecoveryRetryPolicy is {
    config:          RuntimeRetryConfig,
    current_attempt: Int,               // 1-indexed
    total_retries:   Int,
    last_error:      Maybe<Text>,
};
```

### Circuit breaker

```verum
```verum
// Three bare variants — the deadline and the trial count are state on
// the breaker, not payload on the state.
public type RecoveryCircuitState is
    | Closed                 // normal
    | Open                   // rejecting
    | HalfOpen;              // testing recovery

public type RecoveryCircuitBreakerConfig is {
    failure_threshold:  UInt16,
    required_successes: UInt16,
    timeout_ms:         UInt32,        // Open -> HalfOpen after this
    error_predicate:    ErrorPredicate,
};

public type RecoveryCircuitBreaker is { /* atomic state */ };
public type CircuitBreakerStats is { /* counters */ };
public type CircuitBreakerError<E> is { /* wraps the inner error */ };
```

### The inline variants

`InlineCircuitBreaker` and `InlineRetryPolicy` are stored by value to
avoid a heap allocation on the hot path; `RecoveryCircuitBreaker` and
`RecoveryRetryPolicy` above are for long-lived state shared across
tasks. `RuntimeRecoveryStrategy` selects between them.

## Threads — `runtime.thread`

OS-level threads. Available only on profiles that have threading
(`full`, `no_async`). Suspended on `single_thread`, `no_heap`,
`embedded`.

```verum
public type ThreadId is { /* opaque */ };
public type Thread   is ();

// `ThreadJoinHandle`, not `JoinHandle` — the bare name is not declared
// here.
public type ThreadJoinHandle<T> is { /* opaque */ };

public type ThreadBuilder is { /* fluent */ };

implement ThreadBuilder {
    public fn new() -> ThreadBuilder;
    public fn name(self, name: Text) -> ThreadBuilder;
    public fn stack_size(self, size: Int) -> ThreadBuilder;
    public fn spawn<T: Send>(self, f: fn() -> T)
        -> Result<ThreadJoinHandle<T>, ThreadError>;
}

implement Thread {
    public fn spawn<T: Send>(f: fn() -> T) -> ThreadJoinHandle<T>;
    public fn builder() -> ThreadBuilder;
    public fn current_id() -> ThreadId;
    public fn yield_now();
    public fn sleep(duration: Duration);
    public fn sleep_ms(ms: Int);
    public fn available_parallelism() -> Int;
    public fn park();
    public fn unpark(thread_id: ThreadId);
}

// Four variants. There is no StackTooSmall, OutOfMemory, NameTooLong or
// ProfileUnsupported, and SpawnFailed carries no payload.
public type ThreadError is
    | SpawnFailed | JoinFailed | Panicked | InvalidName;

// `ThreadStackFrame`, and every resolvable field is a `Maybe` because
// symbolication is deferred and may fail.
public type ThreadStackFrame is {
    ip:     UInt64,
    symbol: Maybe<Text>,
    file:   Maybe<Text>,
    line:   Maybe<Int>,
    column: Maybe<Int>,
};

public type StackTrace is { frames: List<ThreadStackFrame> };
```

`StackTrace` records no thread id — `StackTrace.capture()` is written to
walk the calling thread's own frames, up to 64 of them.

:::caution `capture()` does not walk anything yet

Measured 2026-09-10. The walk starts from `@frame_address(0)`, and type
inference has no arm for that name: it types as `Unit`, so the frame
pointer the loop tests and advances is not a pointer. The function
compiles and returns a `StackTrace`; what it cannot do is fill one.

The gap is the same shape as the cubical `@builtin_*` family described
on **[verification/cubical-hott](/docs/verification/cubical-hott)** — a
name the compiler parses, does not type, and therefore silently reduces
to `Unit`. Nothing about `StackTrace`'s own shape is affected: the
record, its fields and `ThreadStackFrame` are all real.

This box stops being true when inference learns `@frame_address`.
:::

## Thread pool — `runtime.pool`

A fixed-size thread pool for CPU-bound tasks that do not need the
full async scheduler.  The task shape is deliberately minimal —
`fn(Int) -> Int` — matching the native `verum_pool_*` runtime ABI;
richer task shapes ride the async executor instead.

```verum
public type ThreadPool is { handle: Int };
public type PoolTaskHandle is { handle: Int, awaited: Bool };

implement ThreadPool {
    /// num_workers <= 0 defaults to 4.
    public fn new(num_workers: Int) -> ThreadPool;
    public fn submit(&self, func: fn(Int) -> Int, arg: Int) -> PoolTaskHandle;
    /// Static: submit to the lazily-initialized global pool.
    public fn global_submit(func: fn(Int) -> Int, arg: Int) -> PoolTaskHandle;
    /// RAII: Drop releases the pool; explicit destroy for early release.
    public fn destroy(&self);
}

implement PoolTaskHandle {
    /// Block until the task completes and return its result.
    /// Named `join` (NOT `await`): postfix `.await` is async-expression
    /// syntax, so a method named `await` is uncallable — the historical
    /// `await()` name shipped uncalled (POOL-AWAIT-NAME-1, fixed
    /// 2026-07-14).  Drop drains an un-joined handle.
    public fn join(&mut self) -> Int;
}
```

**Tier semantics.** Tier-1 (AOT) runs tasks on real native worker
threads (`verum_pool_*`).  Tier-0 (interpreter) executes each task
EAGERLY at the submit point on the interpreter thread and parks the
result in a slot-recycling handle table — observable `join()` results
are identical for any result-observing program; only the interleaving
differs, which the language does not promise.  (Before 2026-07-14 the
Tier-0 handlers were constant-zero stubs that never ran the task —
POOL-INTERP-STUB-1; pinned by `core-tests/runtime/pool/`.)

## Time — `runtime.time`

`runtime.time` is a THIN RE-EXPORT of the canonical, wired
declarations in `core.intrinsics.runtime.time` — one source of truth
for both tiers (RUNTIME-DUPLICATE-TREE-1 discipline).  `Instant` /
`Duration` and the calendar surface live in
[`core.time`](/docs/stdlib/time), not here.

```verum
public mount core.intrinsics.runtime.time.{
    monotonic_nanos,   // fn() -> Int — monotone, both tiers
    realtime_secs,     // fn() -> Int — Unix seconds
    realtime_nanos,    // fn() -> Int — Unix nanoseconds
    num_cpus,          // fn() -> Int — logical CPU count
    sleep_ms,          // fn(Int)
    sleep_ns,          // fn(Int)
};
```

Consumer mounts of this shim resolve through the qualified-key +
carried-target-name machinery (REEXPORT-QUALIFIED-KEY-1, schema v19);
before 2026-07-14 the bare-name first-wins table bound
`monotonic_nanos` to the darwin mach path (DivisionByZero under
`--interp`) and `num_cpus` to a self-recursive delegator
(StackOverflow) — pinned by `core-tests/runtime/time/`.

## Thread-local storage — `runtime.tls`

`runtime.tls` is a thin re-export of `core.intrinsics.runtime.tls` —
the raw slot API over a DEDICATED `user_tls_slots` store (opcodes
0x59-0x5D; the context system populates separate high slots and
cannot collide).

```verum
public mount core.intrinsics.runtime.tls.{
    tls_get_base,      // fn() -> *mut Byte
    tls_slot_get,      // fn(UInt8) -> *const Byte
    tls_slot_set,      // fn(UInt8, *const Byte)
    tls_slot_clear,    // fn(UInt8)
    tls_slot_has,      // fn(UInt8) -> Bool
    tls_frame_push,    // fn() -> *const Byte   — balanced pair:
    tls_frame_pop,     // fn()                  — pops the TOP frame
    tls_read_ptr, tls_write_ptr,      // <T> raw offset access
    tls_read_i32, tls_write_i32,
    tls_read_usize, tls_write_usize,
};
```

Note the frame discipline: `tls_frame_pop()` takes NO argument — it is
a balanced-stack pop, not a token-addressed restore.

## Stack / arena / pool allocators — `runtime.stack_alloc`

Deterministic-latency allocators over fixed `[Byte; SIZE]` buffers.
PRIMARY use is the `no_heap` / `embedded` profiles (EmbeddedRuntime's
allocator), but since 2026-07-14 the module is NOT cfg-gated: the
implementations are self-contained and equally useful on the full
runtime (request arenas, connection pools).  The real API surface:

```verum
public type StackAllocator<const SIZE: Int> is { /* buffer + bump top + watermark */ };
public type StackSavepoint is { top: Int, alloc_count: Int };
public type ArenaAllocator<const CHUNK_SIZE: Int, const MAX_CHUNKS: Int> is { /* chunked */ };
public type PoolAllocator<const BLOCK_SIZE: Int, const BLOCK_COUNT: Int> is { /* freelist */ };
// Presets: TinyStackAllocator (1 KiB) / Small (4) / Medium (16) / Large (64)

implement<const SIZE: Int> StackAllocator<SIZE> {
    public fn new() -> Self;
    public fn alloc(&mut self, layout: Layout) -> Result<*mut Byte, AllocError>;
    public fn dealloc(&mut self, ptr: *mut Byte, layout: Layout);   // LIFO only
    public fn save(&self) -> StackSavepoint;
    public fn restore(&mut self, savepoint: StackSavepoint);
    public fn capacity(&self) -> Int;
    public fn used(&self) -> Int;
    public fn remaining(&self) -> Int;
    public fn watermark(&self) -> Int;
    public fn alloc_count(&self) -> Int;
    public fn reset(&mut self);       // keeps the lifetime watermark
    public fn reset_all(&mut self);   // clears the watermark too
}
```

**Known gap:** methods of `implement<const N>` blocks are currently
unresolvable on archive-loaded types (CONST-GENERIC-IMPL-METHODS-1) —
the conformance suites are written and pinned on that task.

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
