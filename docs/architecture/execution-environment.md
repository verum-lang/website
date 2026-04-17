---
sidebar_position: 9
title: Execution Environment (θ+)
description: How memory, capabilities, error recovery, and concurrency unify in one runtime structure — the internals of Verum's runtime, documented against the implementation.
---

# Unified Execution Environment (θ+)

Every Verum task — from `fn main()` downwards — executes inside a
**single typed structure** called the **Execution Environment**,
written **θ+** in the compiler sources. θ+ is how four concerns that
are normally separate systems in other languages fit together in
Verum without ever being coordinated by hand:

- **Memory** — CBGR tier, allocator, generation/epoch trackers,
  shared-ownership registry.
- **Capabilities** — dependency injection (both compile-time
  `@injectable` and runtime `provide`/`using`).
- **Error recovery** — supervision, circuit breakers, retry
  policies, `defer`/`errdefer` stacks.
- **Concurrency** — executor handle, I/O driver, isolation model,
  parallelism configuration, task identity.

A developer never constructs an `ExecutionEnv` directly. Ordinary
language features — `&T`, `using [...]`, `Result`, `spawn`, `nursery`
— read from and propagate it transparently. This page explains the
layout, the fork/merge rules, the measured costs, and the language
constructs that ride on top of it. Everything below matches the
production code.

## Total layout — 2,560 bytes per task

A θ+ is a single value, laid out inline (no per-pillar heap
allocation):

| Offset | Size (B) | Section             | What's in it                                                             |
|-------:|---------:|---------------------|--------------------------------------------------------------------------|
|      0 |       64 | Header              | `id`, `created_at`, `parent_id`, flags                                   |
|     64 |      128 | `MemoryContext`     | CBGR tier, allocator, shared-ownership registry, generation tracker      |
|    192 |    2 048 | `CapabilityContext` | 256-slot inline context array, dynamic-context map pointer, snapshot link |
|  2 240 |      192 | `RecoveryContext`   | Supervisor handle, 8 inline circuit breakers, 4 inline retry policies, defer stack |
|  2 432 |      128 | `ConcurrencyContext`| Executor handle, I/O driver, isolation model, parallelism, task id, task-locals |

Total: **2,560 bytes** per task. Each pillar below is documented
against the struct definition in `core/runtime/env.vr`.

## Pillar 1 — `MemoryContext`

```verum
public type MemoryContext is {
    cbgr_tier:            ExecutionTier,      // see below — four variants
    allocator:            &dyn Alloc,         // may be arena, pool, or global
    shared_registry:      &SharedRegistry,    // Shared<T> ownership tracking
    gen_tracker:          GenTracker,         // CBGR generation + epoch
    send_boundary:        Bool,               // true once value crossed a task
    send_boundary_count:  Int,                // how many times
};
```

### Runtime safety tiers (CBGR)

The `cbgr_tier` field is **not** an execution-mode tier; it is a compile-time
annotation per function indicating how much runtime safety the
compiler has to insert. The four tiers are defined in
`core/runtime/env.vr`:

| Variant           | Overhead per deref | Guarantee                                    |
|-------------------|-------------------:|----------------------------------------------|
| `Tier0_Full`      | ~15 ns             | Full CBGR: generation + epoch + bounds       |
| `Tier1_Epoch`     | ~8 ns              | Generation + epoch only                      |
| `Tier2_Gen`       | ~3 ns              | Generation only                              |
| `Tier3_Unchecked` | 0 ns               | No runtime checks (requires `unsafe`)        |

The compiler picks the minimum tier it can prove correct per
reference. See [CBGR internals](/docs/architecture/cbgr-internals)
for the escape analysis that drives the selection.

### Fork semantics (child tasks)

```verum
@inline
public fn fork(&self) -> MemoryContext {
    Self {
        cbgr_tier:           self.cbgr_tier,
        allocator:           self.allocator,
        shared_registry:     self.shared_registry,
        gen_tracker:         GenTracker.new(),   // fresh generation
        send_boundary:       true,                // marks cross-task
        send_boundary_count: 0,
    }
}
```

A spawned child **shares** its parent's allocator and
shared-registry references, but **gets a fresh generation tracker**
— so CBGR generation IDs issued in the child cannot collide with
the parent's. The `send_boundary` flag is set to `true` so that
cross-task reference flow is visible to the type checker.

## Pillar 2 — `CapabilityContext`

```verum
public type CapabilityContext is {
    slots:              ContextSlots,            // 256 inline entries
    static_deps:        &Map<TypeId, &dyn Any>,  // @injectable
    dynamic_ctx:        &Map<TypeId, &dyn Any>,  // provide / using
    parent_snapshot:    Maybe<&CapabilityContext>,
    middleware_chain:   &MiddlewareChain,
};
```

### Why slots, not hash maps

The common case — "this function asked for `Logger` and `Database`"
— should be as close to free as the compiler can make it. Verum's
context system reserves **256 inline slots** for well-known context
types. Compile-time-assigned TypeId → slot mappings let the runtime
index into the slot array in **~2 ns**. Dynamic lookup falls back
to a hashmap at **~20 ns** only when the slot is not pre-assigned.

### Lookup path

```verum
public fn get<T>(&self) -> Maybe<&T> {
    let slot = @const_slot_for<T>();          // compile-time constant
    if slot < CONTEXT_SLOT_COUNT {             // fast path, ~2 ns
        return self.slots.get<T>(slot);
    }
    let type_id = TypeId.of<T>();              // slow path, ~20 ns
    self.dynamic_ctx
        .get(&type_id)
        .map(|any| any.downcast_ref<T>())
        .flatten()
}
```

### Fork: panic-isolated snapshot

When a task forks, the child's `parent_snapshot` field points at the
parent's `CapabilityContext`. If the child panics, the unwinder
restores the parent's exact capability state — no half-applied
`provide` can leak across a panic boundary.

```verum
@inline
public fn fork(&self) -> CapabilityContext {
    Self {
        slots:           self.slots.clone(),   // shallow copy of array
        static_deps:     self.static_deps,     // shared
        dynamic_ctx:     self.dynamic_ctx,     // shared
        parent_snapshot: Some(self),           // isolation point
        middleware_chain: self.middleware_chain,
    }
}
```

## Pillar 3 — `RecoveryContext`

Fault tolerance, integrated with the supervision tree. The key
detail is that the common cases store **inline**, not on the heap:
the hot path pays zero allocations.

```verum
public type RecoveryContext is {
    supervision:               Maybe<&Supervisor>,
    circuit_breakers_inline:   [InlineCircuitBreaker; 8],   // 64 B each
    circuit_breaker_count:     UInt8,
    circuit_breakers_overflow: Maybe<&Map<Text, CircuitBreaker>>,
    retry_policies_inline:     [InlineRetryPolicy; 4],      // 32 B each
    retry_policy_count:        UInt8,
    retry_policies_overflow:   Maybe<&Map<TypeId, RetryPolicy>>,
    defer_stack:               &List<DeferHandler>,
};
```

### `InlineCircuitBreaker` — 64 bytes

```verum
@repr(C) @size(64)
public type InlineCircuitBreaker is {
    name: [Byte; 24], name_len: UInt8,     // up to 24-char inline name
    state: UInt8,                          // 0=Closed, 1=Open, 2=HalfOpen
    failure_count:       UInt16,
    success_count:       UInt16,           // for half-open trial
    failure_threshold:   UInt16,
    required_successes:  UInt16,
    timeout_ms:          UInt32,
    last_transition_ms:  UInt32,
    _padding:            [Byte; 18],
};
```

Up to **8 circuit breakers per task** live inline; beyond that a
heap map takes overflow. Inline lookup is ~10 ns; overflow lookup
~25 ns. Most real tasks never exceed the inline budget.

### `InlineRetryPolicy` — 32 bytes

```verum
@repr(C) @size(32)
public type InlineRetryPolicy is {
    type_id_hash:       UInt64,   // used for per-error-type lookup
    max_attempts:       UInt16,
    current_attempt:    UInt16,
    backoff_strategy:   UInt8,    // 0=Fixed, 1=Linear, 2=Exponential
    backoff_base_ms:    UInt16,
    backoff_max_ms:     UInt16,
    jitter_factor:      UInt8,    // 0-255 = 0%-100%
    _padding:           [Byte; 12],
};
```

Four inline slots, same overflow strategy.

### Inheritance rules

```verum
@inline
public fn inherit(&self) -> RecoveryContext {
    Self {
        supervision:               self.supervision,            // inherited
        circuit_breakers_inline:   [InlineCircuitBreaker.default(); 8],
        circuit_breaker_count:     0,                           // task-local
        circuit_breakers_overflow: None,
        retry_policies_inline:     self.retry_policies_inline,  // inherited
        retry_policy_count:        self.retry_policy_count,
        retry_policies_overflow:   self.retry_policies_overflow,
        defer_stack:               &List.new(),                 // fresh
    }
}
```

Read the code, not just the names: **circuit breakers are *not*
inherited** (they're task-local by design — a child's failures
should not trip the parent's breaker), **retry policies are
inherited** (callers define the retry contract, not each child
independently), and **the defer stack is fresh** per task (each task
runs its own `defer`s at its own scope exit).

### `defer` stack

`defer { ... }` pushes an RAII handler onto `defer_stack`. When the
task completes (normally or abnormally), `run_defers()` runs them
in LIFO order. `errdefer { ... }` pushes a handler that runs only on
the error path.

## Pillar 4 — `ConcurrencyContext`

```verum
public type ConcurrencyContext is {
    @cfg(feature = "async")
    executor:       &dyn Executor,          // work-stealing scheduler
    @cfg(feature = "io")
    io_driver:      &dyn RuntimeIoDriver,   // completion-based I/O
    isolation:      IsolationLevel,
    parallelism:    ParallelismConfig,
    task_id:        TaskId,
    restart_policy: Maybe<RestartPolicy>,
    task_locals:    TaskLocalStorage,
};
```

### Target performance (`core/runtime/env.vr` header)

| Metric                | Target  | Measured |
|-----------------------|--------:|---------:|
| Environment creation  | <1 μs   | ~800 ns  |
| Context lookup (slot) | <10 ns  | ~2 ns    |
| Error propagation     | <100 ns | ~50 ns   |
| Task spawn overhead   | <200 ns | ~150 ns  |
| Environment fork      | <100 ns | ~50–70 ns|
| Memory per task       | <4 kB   | ~2.5 kB  |
| Allocations per spawn | 0       | 0 (stack)|

## Isolation models

```verum
public type IsolationLevel is
    | Shared     // default — share parent's context
    | SendOnly   // must transmit only Send-safe values
    | Full;      // no shared mutable state
```

- **Shared** (default) — child sees parent's contexts, shared
  registry, open file handles, etc. Cheapest; relies on the type
  checker to ensure Send/Sync correctness.
- **SendOnly** — the type checker rejects captures that are not
  `Send`. Appropriate for message-passing designs and worker pools
  that never share state.
- **Full** — cloned environment with empty dynamic_ctx; a
  completely isolated task. The cost is one environment allocation
  plus any clones required by `Clone` bounds.

## Runtime profiles

`core/runtime/mod.vr` exposes **five runtime profiles** selected via
`@cfg(runtime = "…")`. Each profile swaps in a different executor
implementation, but every profile is a θ+ underneath.

| Profile          | When to use                              | Constraints                                |
|------------------|------------------------------------------|--------------------------------------------|
| `full`           | Servers, multi-core applications         | Work-stealing executor, threads, heap      |
| `single_thread`  | WASM, browser, single-thread deployments | Single-threaded executor, heap             |
| `no_async`       | Batch tools, CLIs                        | Blocking I/O only, no futures              |
| `no_heap`        | Real-time, safety-critical               | Stack allocation only, no heap             |
| `embedded`       | Microcontrollers, freestanding           | Minimal intrinsics, no stdlib beyond core  |

A program requiring more than the selected profile supports is a
**compile error**, not a runtime failure. `verum build` refuses to
link against `runtime = "no_heap"` if a transitive dependency uses
`Heap<T>`.

## Fork and merge — the lifecycle

### `spawn` path

```text
parent θ+ ──fork()──► child θ+ ──► task body runs ──► result
                                                  │
                                                  ├── Ok(v)  ──► caller .await reads v
                                                  ├── Err(e) ──► recovery path
                                                  └── panic  ──► parent_snapshot restored
```

A fork is a shallow copy of each pillar with pillar-specific rules
(fresh generation tracker; inherited retry policies; cleared circuit
breakers; fresh defer stack; `send_boundary = true`). Total cost:
~50–70 ns.

### Panic path

When a task panics, the unwinder:

1. Runs the task's `errdefer` handlers in LIFO order.
2. Runs the task's `defer` handlers in LIFO order.
3. Restores `CapabilityContext.parent_snapshot` — the parent's
   capability state as of the fork is re-applied.
4. Consults `RecoveryContext.supervision`. If a supervisor is set,
   the failure is forwarded; the supervisor decides retry, restart,
   or escalation.
5. If no supervisor is set, the panic propagates up the await chain
   as a `JoinError::Panicked`.

### Merge (completion)

On a successful completion, the child's `ErrorContext.error_chain`
(if any warnings were emitted) is merged into the parent's so
cross-task diagnostics remain visible. The child's circuit-breaker
state is **not** merged; breakers are task-local by design.

## Language constructs that read θ+ transparently

The programmer never writes `env.` anywhere. The mapping:

| Language construct                 | θ+ pillar reads/writes                        |
|------------------------------------|-----------------------------------------------|
| `&T`, `&mut T` (CBGR)              | `MemoryContext.cbgr_tier`, `gen_tracker`     |
| `using [X]`                        | `CapabilityContext.slots` / `dynamic_ctx`     |
| `provide X = v in { ... }`         | `CapabilityContext` push/pop                  |
| `@injectable`                      | `CapabilityContext.static_deps`               |
| `defer { ... }` / `errdefer { ... }` | `RecoveryContext.defer_stack`              |
| `spawn`, `spawn_with`              | `ConcurrencyContext.executor.spawn(fork(self))` |
| `nursery { ... }`                  | Scoped sub-supervisor + `defer { await all children }` |
| `throws` / `try` / `recover`       | `RecoveryContext.supervision` / retry policy  |

Nothing in this list is an effect handler. Every mechanism is a
normal function call against an inline structure; the compiler
arranges for the structure to be in scope.

## Zero-FFI execution path

`core/runtime/mod.vr` declares that every syscall the runtime
requires goes through a **VBC opcode**, not through C ABI. The
executive list:

| Subsystem | Intrinsic                  | VBC opcode |
|-----------|----------------------------|-----------:|
| Memory    | `sys.mmap`, `sys.munmap`   | `0xF1`     |
| Sync      | `sys.futex`, `sys.atomic_*`| `0xF2`     |
| I/O       | `sys.io_uring_enter`, `sys.kqueue`, IOCP | `0xF4` |
| Time      | `sys.clock_gettime`        | `0xF5`     |

The consequence for proof-carrying code: a cog's VBC module can be
validated offline without invoking any C library. No `libc`, no
`pthread`, no hidden ABI — just bytecode + declared capabilities.

## See also

- **[Runtime tiers](/docs/architecture/runtime-tiers)** — the
  interpreter/AOT choice and how θ+ interacts with each.
- **[Async & concurrency](/docs/language/async-concurrency)** — the
  language-surface constructs that manipulate θ+.
- **[CBGR internals](/docs/architecture/cbgr-internals)** —
  MemoryContext semantics.
- **[Context system](/docs/language/context-system)** —
  CapabilityContext semantics.
- **[Error handling](/docs/language/error-handling)** —
  RecoveryContext semantics and the supervision tree.
- **[stdlib → runtime](/docs/stdlib/runtime)** — the user-facing
  APIs (`Runtime`, `Supervisor`, `block_on`).
