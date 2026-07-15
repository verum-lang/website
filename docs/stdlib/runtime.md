---
sidebar_position: 3
title: runtime
description: core.runtime — the Verum runtime (ExecutionEnv, executor, supervision, thread pool, recovery, timers, TLS) documented against the implementation in core/runtime.
status: partial
status_detail: >-
  2026-07-15 close-out — interp 463/536 GREEN (9 = SYNC-SYSCALL-CTORS-REGRESSION-1 peer-window XMOD binds, task-tracked; 64 @ignore each naming its class); AOT 454/536 (18 = Text-iter &-pattern third-path ×6 + mod/integration LLVM SIGABRT ×11 + known §D ×1 — all task-tracked). 14 language-fix classes landed across 21 build rounds: pool/thread Tier-0 eager execution, mount re-export qualified keys (schema v19), unit-type descriptors, Self-newtype ctor, dotted-call scope authority, drop-glue raw-pointer discipline + layout gate, ctx one-store-per-tier + @cfg-tail-value root, const-generic impl gate (Meta), fn-local static once-init hoist, AOT intercept bare-name (narrowed to __*_raw) + helper-signature authority ×2, CreateCallback sigidx, invalidate operand shape, Deref value-fact propagation, per-file interp quarantine + ignored-fn merge-strip.
---

# `core.runtime`

import StdlibStatus from '@site/src/components/StdlibStatus';

<StdlibStatus
  status="partial"
  detail="2026-07-14 full-hierarchy sweep: 532 tests across all 18 submodule folders. Interpreter 460 GREEN / 64 @ignore (every pin carries its defect-class name; 6 classes filed as tasks) / 8 pool value-leg in flight. AOT 449 GREEN / 23 divergences (RUNTIME-AOT-LEG-1). The 2026-05 'intrinsic-stub family' is CLOSED: runtime leaves are thin re-exports of the canonical wired core.intrinsics.runtime.* modules, and the re-export chain itself was made loadable (REEXPORT-QUALIFIED-KEY-1: qualified keys + carried target names through mount_aliases, schema v19)."
  defects={[
    {area: 'pool', summary: 'POOL-INTERP-STUB-1 CLOSED (Tier-0 submit/join actually run tasks, eager execution); PoolTaskHandle.await renamed join() — the await name was uncallable (postfix .await is async syntax). Remaining: eager-result value normalization (in flight) + AOT native-pool leg.'},
    {area: 'thread', summary: 'THREAD-EAGER-TIER0-1: Thread.spawn/join live under --interp (pthread intercepts, trampoline→fn-id reverse resolve). Pinned: spawn generic-arg inference in merged-suite compiles (#11 family), sleep/parallelism sys-delegator self-recursion (QUALIFIED-CALL-FIRST-MATCH-1 #12).'},
    {area: 'time / tls / text / sync / syscall / cbgr', summary: 'Stub-era §A CLOSED across all six leaves — thin re-exports of the wired canonical intrinsics; suites assert live semantics. cbgr shim widened to the full canonical surface; cbgr_invalidate operand-shape desync fixed both tiers (INVALIDATE-OPERAND-SHAPE-1).'},
    {area: 'config', summary: 'GREEN 30/30 interp. Unit-type construction fixed at TWO roots (MOUNTED-UNIT-VALUE-1: unit types never had TypeDescriptors; bare-value fallback keyed on the wrong kind). Two suite-only Display legs pinned on STUB-STAGE-INSUITE-1 (#11).'},
    {area: 'supervisor', summary: 'GREEN 74/74 interp. SELF-NEWTYPE-CTOR-1 closed: Self(v) in a newtype impl (SupervisorId.root() returned Variant(138,0)) — typecheck + codegen legs.'},
    {area: 'stack_alloc', summary: 'cfg-gate REMOVED (self-contained allocators; the gate made the surface untestable). Suites written (accounting/savepoints/OOM/alignment laws) and pinned on CONST-GENERIC-IMPL-METHODS-1 (#10): implement<const N> methods unresolvable on archive-loaded types.'},
    {area: 'ctx_bridge', summary: 'CTX-STORE-AUTHORITY-1 (#8): two parallel context stores — sys.<os>.tls ctx_get/set dead under interp (TCB uninitialized; raw-nil Maybe panics .is_some()). Overflow-guard test bug fixed ((Int.MAX-8)/16 threshold); its wild load_i64 previously SIGSEGV\'d the WHOLE runner (TEST-RUNNER-ISOLATION-1 #7 filed).'},
    {area: 'recovery / env / spawn / task_queue / mod / async_ops', summary: 'recovery: DROP-GLUE-TYPEID-1 (#9) pins (foreign Drop impl on scope exit). env §A pins retired (EnvTaskId.main fixed upstream). spawn: ctor-chain stub leaks pinned on #11. mod: new unit suite (reserved slots ABI, Bencher laws); Runtime-accessor receiver resolution pinned (#11 + rename-mount typecheck gap). async_ops: integration suite (global handles + sleep).'},
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

| Submodule | LOC | Status | Interp (GREEN/total) | Primary open item |
|-----------|----:|--------|---------------------:|-------------------|
| `runtime.env` | 1016 | partial | 41/41 | §A pins retired 2026-07-14 (EnvTaskId.main fixed upstream) |
| `runtime.cbgr` | 24 | complete (interp) | 10/10 | canonical re-export shim; INVALIDATE-OPERAND-SHAPE-1 closed both tiers |
| `runtime.sync` | 16 | complete (interp) | 3/3 | thin canonical re-export |
| `runtime.syscall` | 16 | complete (interp) | 2/2 | thin canonical re-export |
| `runtime.time` | 30 | complete (interp) | 13/13 | REEXPORT-QUALIFIED-KEY-1 closed the misbinding roots |
| `runtime.tls` | 27 | complete (interp) | 16/16 | live round-trips; canonical 0-arg frame-pop contract |
| `runtime.text` | 32 | partial | 30/31 | one Lu≠Ll category pin (known §D misroute family) |
| `runtime.async_ops` | 136 | partial | 38/39 | sleep-elapsed probe pinned on #12 (sys-delegator recursion) |
| `runtime.ctx_bridge` | 122 | partial | 12/19 | CTX-STORE-AUTHORITY-1 (#8): parallel context stores |
| `runtime.pool` | 155 | partial | value-leg in flight | POOL-INTERP-STUB-1 closed; join() rename; eager-result normalization landing |
| `runtime.thread` | 600 | partial | 30/37 | #11 in-suite generic/stub pins + #12 sys-delegator pins |
| `runtime.config` | 1208 | partial | 44/46 | 2 suite-only Display legs on #11 |
| `runtime.stack_alloc` | 822 | regression-only | 0/27 (pinned) | CONST-GENERIC-IMPL-METHODS-1 (#10) |
| `runtime.recovery` | 1083 | partial | 49/51 | DROP-GLUE-TYPEID-1 (#9) pins |
| `runtime.spawn` | 1086 | partial | 25/38 | ctor-chain stub leaks on #11 |
| `runtime.task_queue` | 1051 | complete (interp) | 25/25 | — |
| `runtime.supervisor` | 1688 | complete (interp) | 74/74 | SELF-NEWTYPE-CTOR-1 closed |
| `runtime.mod` | 643 | partial | 18/24 | Runtime-accessor receiver resolution (#11 + rename-mount gap) |

**Cumulative (2026-07-14):** 532 tests across all 18 folders — interp
460 GREEN / 64 `@ignore` (every pin names its defect class; classes
filed as tasks #7-#12) / 8 in flight; AOT 449 GREEN / 23 divergences
(RUNTIME-AOT-LEG-1, task #13).  Both-tier green is the merge gate for
every future change to `core/runtime/`.

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
    | Tier0_Full       // full CBGR: ≤ 15 ns design target; ~0.93 ns measured (gen+epoch)
    | Tier1_Epoch      // gen + epoch: ~0.93 ns
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
    public fn capacity(&self) / used() / remaining() / watermark() / alloc_count() -> Int;
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
