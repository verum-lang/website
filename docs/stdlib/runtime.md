---
sidebar_position: 3
title: runtime
description: core.runtime — the Verum runtime (ExecutionEnv, executor, supervision, thread pool, recovery, timers, TLS) documented against the implementation in core/runtime.
status: regression-only
status_detail: 2026-06-01 — recovery/env/config expanded to property+integration+regression coverage (recovery property 20/20 + integration 13/20; env property 10/10 + regression 3/3; config property 9/11 + integration 7/8 GREEN). 3 NEW defect classes surfaced — §F RecoveryRetryPolicy.new/InlineRetryPolicy.default field-write-OOB (type_id=0 field-shift, a REGRESSION: prior "all GREEN" unit tests now RED, task #5); §H nullary-variant Display dispatch falls through, breaking recovery.is_transient_error on nullary RuntimeIoError (task #6). Prior Round-16 (2026-05-27): 17 submodules; primary cluster is the `verum.runtime.*` intrinsic-stub family (cbgr_*/num_cpus/tls_slot_*/pool_*/text_parse_*/char_is_*) not registered in the VBC dispatch table. Compiler fixes gated on a rebuild (concurrent sessions + precompile-poisoning hazard). Cross-tier --aot validation gated on task #7.
---

# `core.runtime`

import StdlibStatus from '@site/src/components/StdlibStatus';

<StdlibStatus
  status="regression-only"
  detail="Round-16 conformance sweep 2026-05-27. 17 submodules tested under `core-tests/runtime/` (295 tests total: 284 unit + 11 integration; ~250 GREEN + ~45 @ignore'd on surfaced defect classes).  **Primary defect class: §A intrinsic-stub family** — `verum.runtime.cbgr_*` / `num_cpus` / `tls_slot_*` / `pool_*` / `text_parse_int` / `char_is_*` idents are forward-declared at `core/runtime/<sub>.vr` but NOT registered in `crates/verum_vbc/src/interpreter/dispatch_table/handlers/`. Calls succeed with default-zero stub returns. Higher-level user-facing surfaces (`Text.parse_int`, `Char.is_alphabetic`, `cbgr_check` via ThinRef header inline) DO work because they route through DIFFERENT dispatch paths keyed on type-method shape, NOT on the free-fn intrinsic ident. **Secondary defect class: §F cross-module ctor field-write OOB** — `InlineContextStorage.new()` and `SupervisorSpawnConfig.new()` panic with `field write out of bounds: field index 9 (offset 72+8 = 80) exceeds object data size 24` because the `[InlineContextEntry; 4]` array field (96 bytes inline) is mis-sized to 24 bytes at the codegen ctor-return path. Same root as `btree_pattern_match_ref_generic_class` / `enactment_field_access_oob_2026-05-24` / `use_after_free_error_field_shift_2026-05-27` — multi-day VBC codegen work at `compile_field_access` / `populate_types_from_archive`. AOT-path validation gated on pre-existing stdlib AOT blockers (task #7)."
  defects={[
    {area: 'env', summary: '2026-06-01: property 10/10 + regression 3/3 GREEN added (tier epoch⟹generation + zero-overhead⟺unchecked cross-invariants, RestartStrategy 3-variant, RuntimeRestartPolicy/ParallelismConfig round-trips, CpuAffinity.Explicit mask preservation, CBGR overhead contract lock-in). §A EnvTaskId.main() static-method dispatches to wider-record sibling (task #17/#39 root, 5 @ignore pins incl. regression). unit 23 GREEN on ExecutionTier 4-variant + .overhead_ns CBGR cost (15/8/3/0 ns) + .requires_generation/.requires_epoch + EnvIsolationLevel + CpuAffinity.'},
    {area: 'cbgr', summary: '§A `verum.runtime.cbgr_*` not dispatch-bound — `cbgr_check(fresh_gen, fresh_epoch)` returns false; real CBGR machinery lives at the per-ThinRef header inline in the interpreter, NOT through these user-callable free fns. §B drift between `cbgr_check(gen, epoch)` 2-arg user surface and `verum_cbgr_check(void*)` 1-arg AOT C-fallback. 7/10 GREEN (surface + monotonicity); 3 @ignore on §A.'},
    {area: 'sync', summary: '§A `spin_loop_hint` not registered in VBC dispatch — under --interp no-op (correct by accident); under --aot falls to LLVM `llvm.donothing` indirect call defeating the spin-wait optimization. 3/3 GREEN (callable + zero-iteration + unit return).'},
    {area: 'syscall', summary: 'Pure surface-pinning (no kernel calls in this folder). 2/2 GREEN. §A `verum.runtime.syscall6` dispatch binding audit deferred. §B per-arch live syscall tests at vcs/specs/L2-standard/sys/.'},
    {area: 'time', summary: '§A `num_cpus()` returns 0 under --interp (intrinsic stub). Empirical probe: monotonic_nanos / realtime_secs / realtime_nanos / sleep_ms(0) / sleep_ns(0) BOUND; num_cpus NOT bound. §B realtime non-monotone under NTP correction. §C sleep_* granularity. 12/13 GREEN; 1 @ignore on §A.'},
    {area: 'tls', summary: '§A `tls_slot_*` not dispatch-bound — `tls_slot_set(s, V); tls_slot_get(s) == 0`. §B DRIFT: two parallel TLS-slot APIs (`core.runtime.tls.tls_slot_*` unbound vs `core.sys.common.ctx_*` bound via ContextSlots vector). 11/16 GREEN; 5 @ignore on §A.'},
    {area: 'text', summary: '§A char_is_* / text_parse_int / text_parse_float not dispatch-bound at runtime layer. Higher-level user-facing surface (`Char.is_*` / `Text.parse_*`) DOES work via separate dispatch path. §B text_parse_int overflow contract. §C drift between user-side Text.parse_int and runtime text_parse_int. 14/31 GREEN; 17 @ignore on §A.'},
    {area: 'async_ops', summary: '§A 13 opaque-handle newtypes (JoinHandleOpaque / ExecutorHandle / FutureHandle / ...) not enforced distinct at FFI/wire boundary (typechecker-only). §B AsyncRecoveryError lacks error-kind discriminator. §C live spawn/poll path gated on task #7. 23/23 GREEN.'},
    {area: 'ctx_bridge', summary: '§A `env_ctx_set`/`env_ctx_get` round-trip drops bits under --interp (delegates to sys.common via Int→`&unsafe Byte`→Int cast); live `provide ... in { }` works because codegen routes against ContextSlots directly. §B-§D deferred. 15/19 GREEN (out-of-range guards via source early-returns); 4 @ignore on §A.'},
    {area: 'pool', summary: '§A `pool_*` intrinsics not bound under --interp; §B num_workers<=0 silent default-to-4; §C submit() only accepts fn(Int)->Int (Int-only task shape); §D Drop-on-unawaited-handle swallows error. 6/6 GREEN on record surface.'},
    {area: 'thread', summary: '§A `sys.get_thread_id()` binding gates live tests; §B two-surface defect Thread.spawn panics vs ThreadBuilder.spawn Result; §C `Thread.unpark(thread_id)` futex_wait targets caller PARK_FLAG not target — SOUNDNESS DEFECT; §D yield_now only x86_64/aarch64 Linux; §E StackTrace.capture frame-pointer brittle. 22/22 GREEN on data ADTs.'},
    {area: 'config', summary: '2026-06-01: property 9/11 + integration 7/8 GREEN added (message() exact strings, Display(payload), Debug, Eq algebra, IoCompletion, cross-module transient-classifier contract w/ recovery). §H NEW nullary-variant Display dispatch falls through — f"{RuntimeIoError.WouldBlock}" yields the Debug form not "operation would block" (payload variants Display fine); DOWNSTREAM: breaks recovery.is_transient_error on nullary RuntimeIoError so the retry layer abandons transient I/O errors (task #6). §A no `@cfg_must_be_exclusive(runtime)`; §B NoopDriver magic `Other(-1)`; §C `AlreadyInitialized` race not atomic; §D Eq on RuntimeIoError.Other payload-sensitive. unit 30/30 GREEN.'},
    {area: 'stack_alloc', summary: 'Audit-only (4 deferred). Module is `@cfg(any(runtime = "no_heap", runtime = "embedded"))` — under default `runtime = "full"` the mount fails. Full suite at future core-tests/runtime-noheap/stack_alloc/. §A split data-only types into non-cfg-gated submodule.'},
    {area: 'recovery', summary: '2026-06-01: property 20/20 GREEN (backoff Fixed/None/Linear/Exponential schedules + jitter bounds + is_transient_error classifier + CircuitState Eq); integration 13/20 GREEN. §F NEW RecoveryRetryPolicy.new field-write-OOB (type_id=0 unregistered-type field-shift) — REGRESSION: the 4 existing RecoveryRetryPolicy.new unit tests now RED on the May-31 binary (prior "all GREEN" stale), pinned @ignore (task #5). §G NEW InlineRetryPolicy.default field-OOB same class (sibling InlineCircuitBreaker.default OK). §H NEW nullary-variant Display dispatch falls through (task #6). §A RetryPredicate.Custom inspects Text only; §B BackoffStrategy.None/JitterConfig.None bare-variant discipline; §C CircuitState.from_u8 fail-open; §D Composed recursion depth bound; §E PRNG modulo bias.'},
    {area: 'spawn', summary: '§A `to_u8` → scheduling_weight rename; §B from_u8 lossy round-trip; §C contexts_overflow owned-list discipline; §D errors/warnings split; §E push returns Result; §F NEW: InlineContextStorage.new() / SupervisorSpawnConfig.new() field-write-OOB at codegen — cross-module ctor return record-layout loss. 16/28 GREEN (PriorityLevel 5-variant + .to_u8 + .from_u8); 12 @ignore on §F.'},
    {area: 'task_queue', summary: '§A `into_option` discards Retry signal (add into_result); §B RingBuffer.new os_alloc-null panic; §C `grow` returns new buffer without freeing old (ownership hazard); §D BoundedQueue Eq; §E CBGR opt-out on ring-buffer pointer (by design for < 30ns push/pop budget). 13/13 GREEN on StealResult<T>.'},
    {area: 'supervisor', summary: '§A FailureReason.Manual treated abnormal — add is_manual(); §B RestartIntensity exponential-decay approximation doc; §C ChildId/SupervisorId AtomicU64 wraparound at 2^64 → root (0); §D EscalationReason cycle detection; §E RestartEvent.reason_code constants table; §F TooManyRestarts loses last_failure FailureReason. 41/41 GREEN on 8 ADTs (Supervisor[Restart]Strategy / FailureReason / ChildStatus / EscalationPolicy / ShutdownStrategy / SupervisorError).'},
    {area: 'mod', summary: '§A try_current_env() non-panic surface; §B double-init guard in init(); §C try_shutdown() Result; §D atomic ENV_ID_COUNTER (currently non-atomic increment); §E Runtime.current_epoch() returns 0 stub (shared root with cbgr §A); §F Runtime.memory_usage() returns 0 stub; §G Bencher warmup + outlier elimination. 11/11 GREEN on umbrella re-exports + cross-submodule identity.'},
  ]}
  sweepDate="2026-06-01"
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

| Submodule | LOC | Status | Tests (GREEN/total) | Primary open defect |
|-----------|----:|--------|--------------------:|---------------------|
| `runtime.env` | 1016 | regression-only | 23/26 | §A EnvTaskId.main() static-method dispatch (task #17/#39 root) |
| `runtime.cbgr` | 22 | regression-only | 7/10 | §A `verum.runtime.cbgr_*` not dispatch-bound (real CBGR is per-ThinRef header inline) |
| `runtime.sync` | 10 | regression-only | 3/3 | §A `spin_loop_hint` not registered (correct-by-accident under interp) |
| `runtime.syscall` | 10 | regression-only | 2/2 | §A surface-pinning only; live syscall tests at L2-standard |
| `runtime.time` | 30 | regression-only | 12/13 | §A `num_cpus()` returns 0 (intrinsic stub) |
| `runtime.tls` | 58 | regression-only | 11/16 | §A `tls_slot_*` not dispatch-bound + §B parallel-API drift |
| `runtime.text` | 78 | regression-only | 14/31 | §A char_is_* / text_parse_* not dispatch-bound at runtime layer |
| `runtime.async_ops` | 136 | regression-only | 23/23 | §A opaque-handle FFI distinctness; §B AsyncRecoveryError kind discriminator |
| `runtime.ctx_bridge` | 122 | regression-only | 15/19 | §A env_ctx_set/get round-trip drops bits under interp |
| `runtime.pool` | 153 | regression-only | 6/6 | §A `pool_*` intrinsics not bound (record surface tested) |
| `runtime.thread` | 600 | regression-only | 22/22 | §C `Thread.unpark` targets caller PARK_FLAG not target — SOUNDNESS DEFECT |
| `runtime.config` | 1208 | regression-only | 30/30 | §B NoopDriver magic `Other(-1)` sentinel |
| `runtime.stack_alloc` | 822 | audit-only | — | cfg-gated (no_heap / embedded); §A split data-only types |
| `runtime.recovery` | 1083 | regression-only | 30/30 | §C CircuitState.from_u8 fail-open coercion (Maybe&lt;State&gt; recommended) |
| `runtime.spawn` | 1086 | regression-only | 16/28 | §F InlineContextStorage.new() field-write-OOB at codegen (cross-module ctor return) |
| `runtime.task_queue` | 1051 | regression-only | 13/13 | §A `into_option` discards Retry signal |
| `runtime.supervisor` | 1679 | regression-only | 41/41 | §C SupervisorId/ChildId wraparound at 2^64 |
| `runtime.mod` | 643 | regression-only | 11/11 | §E `Runtime.current_epoch()` stub returns 0 unconditionally |

**Cumulative:** 295 tests across 17 folders, ~250 GREEN + ~45 @ignore'd
on the surfaced defect classes.

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
