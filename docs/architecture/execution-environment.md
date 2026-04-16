---
sidebar_position: 9
title: Execution Environment (θ+)
description: How memory, capabilities, error recovery, and concurrency unify in one runtime context.
---

# Unified Execution Environment (θ+)

Verum's runtime threads four concerns — **memory**, **capabilities**,
**error recovery**, **concurrency** — through a single typed
structure called the **Execution Environment**, referred to in the
spec as **θ+**. Every async task carries one; propagation rules are
uniform.

## The four pillars

### 1. Memory context (CBGR)

```verum
type MemoryContext is {
    allocator: &dyn Allocator,
    tier:      ExecutionTier,        // Interpreter | Aot
    generation: UInt32,
    epoch:      UInt32,
}
```

Carries the current allocator (default CBGR, or a scoped arena) and
the tier-appropriate check cost. See
[CBGR internals](/docs/architecture/cbgr-internals).

### 2. Capability context (DI)

```verum
type CapabilityContext is {
    static_deps:     Map<TypeId, *mut Byte>,  // @injectable — 0 ns
    dynamic_stack:   Vec<DynamicFrame>,       // provide / using — 5–30 ns
}
```

- Static: compile-time `@injectable` resolution, 0 ns overhead.
- Dynamic: `provide X = v in { ... }` pushes a frame; `using [X]`
  reads from the top.

### 3. Recovery context

```verum
type RecoveryContext is {
    policy:              RecoveryStrategy,
    retries_remaining:   Int,
    circuit:             Maybe<CircuitBreaker>,
    supervisor:          Maybe<SupervisorId>,
}
```

When a task fails, the supervisor (if any) consults this context to
decide between retry, circuit-break, restart, or propagate.

### 4. Concurrency context

```verum
type ConcurrencyContext is {
    executor:   &Executor,
    io_driver:  &IODriver,
    task_id:    TaskId,
    parent:     Maybe<TaskId>,
    nursery:    Maybe<NurseryId>,
}
```

Ties the task to the executor, the reactor (io_uring / kqueue /
IOCP), and its supervising scope.

## The complete environment

```verum
type ExecutionEnv is {
    memory:       MemoryContext,
    capabilities: CapabilityContext,
    recovery:     RecoveryContext,
    concurrency:  ConcurrencyContext,
}

fn current_env() -> &ExecutionEnv;
fn current_env_mut() -> &mut ExecutionEnv;
```

One `ExecutionEnv` per task; stored in task-local slots (TLS for the
root task, task-local storage for spawned children).

## Propagation rules

| Operation | Memory | Capabilities | Recovery | Concurrency |
|---|---|---|---|---|
| `spawn f()` | cloned | cloned (full stack snapshot) | inherited | new `TaskId`, same executor |
| `.await` | preserved | preserved | preserved | preserved |
| generator `yield` / resume | snapshotted / restored | snapshotted / restored | preserved | preserved |
| channel `send` / `recv` | N/A | **not propagated** | N/A | N/A |
| `nursery { spawn ... }` | inherited | inherited | nursery policy overrides | nursery id |
| `provide X = v in { ... }` | — | frame pushed / popped | — | — |
| `try { ... } recover { ... }` | — | — | recovery frame pushed | — |

Channels do **not** carry context — they are pure data pipes. The
receiving task reads from its own context stack.

## Integration with other subsystems

### CBGR

The memory pillar gates every `&T` dereference. At higher tiers,
escape analysis promotes references to `&checked T`, which skip the
check entirely. See
[CBGR performance across tiers](/docs/architecture/runtime-tiers#cbgr-performance-across-tiers).

### Supervision trees

`Supervisor.new(SupervisionStrategy)` installs a recovery context
for its children:

```verum
let sup = Supervisor.new(SupervisionStrategy.OneForOne);
sup.spawn(ChildSpec {
    name: "worker",
    task: || worker_loop(),
    restart: RestartPolicy.Permanent,
    isolation: IsolationLevel.SendOnly,
    max_restarts: 5,
    within: 60.seconds(),
});
```

Each child receives a fresh env where `recovery.supervisor` points
back to `sup`. On child panic, control returns to the supervisor's
recovery policy.

### Structured concurrency

`nursery { ... }` is the syntactic form of "inherit this environment
for every spawn inside the scope, and don't let the scope return
until every child has finished or been cancelled." See
[Nursery cookbook](/docs/cookbook/nursery).

## Semantics in pseudocode

```rust
// spawn f()
fn spawn(f: impl Future) -> JoinHandle {
    let parent = current_env();
    let child_env = ExecutionEnv {
        memory:       parent.memory.clone_for_child(),
        capabilities: parent.capabilities.clone(),      // full stack snapshot
        recovery:     parent.recovery.inherit(),
        concurrency:  ConcurrencyContext::new_child(parent),
    };
    executor.spawn_with_env(child_env, f)
}

// .await
fn poll(fut: &mut impl Future) -> Poll {
    // env is preserved across suspension because the task's
    // env pointer lives in task-local storage, not the stack frame.
    fut.poll(...)
}

// nursery { spawn ... }
async fn nursery<F>(f: F) where F: FnOnce(Scope) {
    let scope = Scope.new();
    let mut env = current_env().clone();
    env.concurrency.nursery = Some(scope.id);
    install(env);
    let result = f(scope).catch_unwind();
    scope.join_or_cancel_all().await;
    restore();
    match result {
        Ok(v)  => v,
        Err(e) => propagate(e),
    }
}
```

## Cross-tier transparency

A reference allocated in the interpreter can outlive the REPL session
and be passed into AOT code — the CBGR header is consistent across
all tiers, so tier transitions do not require marshalling. Likewise,
an AOT-compiled function called from the interpreter receives the
same `ExecutionEnv` shape.

**Reference tier downgrade on crossing tiers**: calling from
optimised AOT into the interpreter downgrades `&checked T` to `&T`,
so the interpreter does the full CBGR check — safety preserved at
the cost of the optimisation.

## Performance overheads

| Operation | Measured (M3 Max) |
|---|---|
| `current_env()` read | 2 ns (one TLS load) |
| `provide X = v in { ... }` entry | 8 ns (push frame) |
| `provide ...` exit | 4 ns (pop frame) |
| `using [X]` lookup | 3 ns (vec scan, typical depth ≤ 4) |
| `@injectable(Singleton)` lookup | 0 ns (resolved at compile time) |
| `spawn` with env clone | 120 ns (includes task-local alloc) |
| `.await` suspend + resume | ~50 ns |

Context operations are off the critical path for almost all code.
Profile-driven optimisation is rarely necessary.

## See also

- **[Runtime tiers](/docs/architecture/runtime-tiers)** — tier details.
- **[CBGR internals](/docs/architecture/cbgr-internals)** — memory side.
- **[context stdlib](/docs/stdlib/context)** — runtime API.
- **[runtime stdlib](/docs/stdlib/runtime)** — `ExecutionEnv`,
  `Supervisor`, `ChildSpec`.
- **[Language → context system](/docs/language/context-system)** —
  user surface.
- **[Language → async & concurrency](/docs/language/async-concurrency)** —
  async / spawn / nursery / select.
