---
sidebar_position: 2
title: sync
---

# `core::sync` — Atomics and locks

## Atomics

```verum
let counter = AtomicInt::new(0);
counter.fetch_add(1, MemoryOrder.SeqCst);
counter.load(MemoryOrder.Relaxed);
counter.store(42, MemoryOrder.Release);
counter.compare_exchange(old, new, MemoryOrder.AcqRel, MemoryOrder.Acquire);
```

Types: `AtomicInt`, `AtomicU8`, `AtomicU16`, `AtomicU32`, `AtomicU64`,
`AtomicBool`, `AtomicPtr<T>`.

Memory orderings: `Relaxed`, `Acquire`, `Release`, `AcqRel`, `SeqCst`.

## `Mutex<T>`

```verum
let m = Shared::new(Mutex::new(Vec::<Int>::new()));

let clone = m.clone();
spawn async {
    let mut guard = clone.lock().await;
    guard.push(42);
};
```

Async by default — acquiring a contested lock suspends the task, not
the thread.

## `RwLock<T>`

```verum
let rw = Shared::new(RwLock::new(Config::default()));

{
    let r = rw.read().await;
    use_config(&r);
}
{
    let mut w = rw.write().await;
    w.apply(update);
}
```

Multiple concurrent readers or one writer.

## `Once`

```verum
static INIT: Once = Once::new();
INIT.call_once(|| setup_global_state());
```

## `Semaphore`

```verum
let sem = Semaphore::new(5);        // at most 5 concurrent holders
let guard = sem.acquire().await;
do_work();
// guard drops → slot released
```

## `Condvar` and `WaitGroup`

```verum
// Condition variable
let cond = Condvar::new();
let mutex = Mutex::new(false);
{
    let mut ready = mutex.lock();
    while !*ready { ready = cond.wait(ready); }
}
cond.notify_all();

// WaitGroup (Go-style)
let wg = WaitGroup::new();
for i in 0..10 {
    wg.add(1);
    spawn async move {
        work(i);
        wg.done();
    };
}
wg.wait().await;
```

## `Barrier` and `CountDownLatch`

```verum
let barrier = Barrier::new(4);
// 4 tasks call wait() and resume together.

let latch = CountDownLatch::new(3);
// Task calls await_one(); completes when latch.count_down() has been
// invoked 3 times total.
```

## Fences

```verum
fence(MemoryOrder.SeqCst);
```

## See also

- **[async](/docs/stdlib/async)** — async-aware locks use the same
  types.
- **[intrinsics](/docs/stdlib/intrinsics)** — the atomic intrinsics
  underlying these types.
