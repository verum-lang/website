---
sidebar_position: 3
title: runtime
---

# `core::runtime` — Runtime configuration & supervision

The runtime is configurable per-project. `runtime` provides the
configuration types and supervision primitives.

## Runtime flavours

Set in `Verum.toml`:

```toml
[runtime]
kind = "full"                # full | single_thread | no_async | embedded | no_runtime
```

| Flavour | Threads | Async | Heap |
|---------|---------|-------|------|
| `full` | work-stealing pool | yes | yes |
| `single_thread` | 1 | yes | yes |
| `no_async` | 1 | compiled to sync | yes |
| `embedded` | 1 | limited | stack-only |
| `no_runtime` | 1 | stubs | no |

## `RuntimeConfig`

```verum
type RuntimeConfig is {
    kind:          RuntimeKind,
    worker_threads: Maybe<Int>,      // default: num_cpus()
    max_tasks:     Maybe<Int>,
    io_engine:     IoEngineKind,     // IoUring | Kqueue | IOCP | None
    stack_size:    Int,              // task stack (default 2 MiB)
};

Runtime::new(config)? -> Runtime
```

## `ExecutionEnv` (θ+)

The unified runtime context carrying all four pillars:

```verum
type ExecutionEnv is {
    memory:       MemoryContext,     // allocator + CBGR
    capabilities: CapabilityContext, // context stack
    recovery:     RecoveryContext,   // supervision policy
    concurrency:  ConcurrencyContext,// executor
};
```

Every async task carries an `ExecutionEnv`. `spawn` clones the parent's
env by default.

## Supervision trees

```verum
let sup = Supervisor::new(SupervisionStrategy.OneForOne);

sup.spawn(ChildSpec {
    name:    "worker-1",
    task:    worker_loop(),
    restart: RestartPolicy.Permanent,
});

sup.spawn(ChildSpec {
    name:    "health-check",
    task:    health_loop(),
    restart: RestartPolicy.Transient,   // restart only on abnormal exit
});

sup.run().await;
```

Strategies:
- `OneForOne` — restart the failed child only.
- `OneForAll` — restart all children when any one fails.
- `RestForOne` — restart the failed child and all started after it.

Restart policies:
- `Permanent` — always restart.
- `Transient` — restart only on abnormal exit.
- `Temporary` — never restart.

## Thread pool

```verum
let pool = ThreadPool::new(ThreadPoolConfig { size: 8 });
pool.execute(|| heavy_compute());
pool.shutdown_join();
```

## Spawn configuration

```verum
let handle = spawn_with(SpawnConfig {
    priority:  Priority.High,
    isolation: IsolationLevel.Panic,   // contained panics
    recovery:  RecoveryStrategy.Retry(3),
}, my_task());
```

## Bridge to context system

`runtime` and `context` interoperate through `ctx_bridge`:

```verum
provide Database = db in {
    spawn async move {
        // the spawned task inherits Database and Logger
        process_item().await;
    };
};
```

## See also

- **[async](/docs/stdlib/async)** — the futures API.
- **[sys](/docs/stdlib/sys)** — the kernel layer the runtime builds on.
- **[Architecture → runtime tiers](/docs/architecture/runtime-tiers)**
  — implementation.
