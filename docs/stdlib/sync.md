---
sidebar_position: 2
title: sync
description: Atomics, Mutex, RwLock, Once, Semaphore, Condvar, Barrier, WaitGroup.
---

# `core.sync` — Synchronisation primitives

Atomic operations and locking types. All types in this module are
`Send`/`Sync` as appropriate so they compose across threads.

| File | What's in it |
|---|---|
| `atomic.vr` | `AtomicInt`, `AtomicU8`..`AtomicU64`, `AtomicBool`, `AtomicPtr<T>`, `MemoryOrdering`, `fence`, `Ordering` (CAS result) |
| `mutex.vr` | `Mutex<T>`, `MutexGuard<T>` |
| `rwlock.vr` | `RwLock<T>`, `RwLockReadGuard<T>`, `RwLockWriteGuard<T>` |
| `once.vr` | `Once`, `OnceState`, `OnceLock<T>` |
| `semaphore.vr` | `Semaphore`, `SemaphoreGuard` |
| `condvar.vr` | `Condvar`, `CondvarNotifyGuard`, `producer_consumer_pair` |
| `barrier.vr` | `Barrier`, `BarrierWaitResult`, `Phaser`, `CountDownLatch` |
| `waitgroup.vr` | `WaitGroup` |

All locks in this module are **async-aware**: contention suspends the
task rather than parking the thread. On single-threaded or
`no_async` runtimes they fall back to spinning / thread parking.

---

## Atomics

```verum
type MemoryOrdering is Relaxed | Acquire | Release | AcqRel | SeqCst;
type Ordering        is Success | Failure;     // CAS result (distinct from Ord)
```

### Atomic integer types

`AtomicInt`, `AtomicI8`, `AtomicI16`, `AtomicI32`, `AtomicI64`,
`AtomicU8`, `AtomicU16`, `AtomicU32`, `AtomicU64` — all share the
same API (shown for `AtomicU64`):

```verum
AtomicU64.new(value) -> AtomicU64
a.load(order) -> UInt64
a.store(value, order)
a.swap(value, order) -> UInt64

a.compare_exchange(current, new, success: Ordering, failure: Ordering)
    -> Result<UInt64, UInt64>                  // Ok(old) if swapped; Err(actual) if not
a.compare_exchange_weak(...)                   // may spuriously fail; fine in loops

a.fetch_add(delta, order) -> UInt64
a.fetch_sub(delta, order) -> UInt64
a.fetch_and(mask, order) -> UInt64
a.fetch_or(mask, order) -> UInt64
a.fetch_xor(mask, order) -> UInt64
a.fetch_nand(mask, order) -> UInt64
a.fetch_max(value, order) -> UInt64
a.fetch_min(value, order) -> UInt64

a.get_mut() -> &mut UInt64                     // unique access — no atomic needed
a.into_inner() -> UInt64                        // consumes
```

### `AtomicBool`

```verum
AtomicBool.new(value)
b.load(order) / b.store(value, order) / b.swap(value, order)
b.compare_exchange(current, new, s, f) -> Result<Bool, Bool>
b.fetch_and(mask, order) / fetch_or / fetch_xor
```

### `AtomicPtr<T>`

```verum
AtomicPtr.new(ptr: *mut T)
p.load(order) -> *mut T
p.store(ptr, order)
p.swap(ptr, order) -> *mut T
p.compare_exchange(current: *mut T, new: *mut T, s, f) -> Result<*mut T, *mut T>
```

### Memory fence

```verum
fence(order)                // standalone barrier
compiler_fence(order)       // prevents compiler reordering only
```

### Idioms

```verum
// Counter
let counter = AtomicU64.new(0);
counter.fetch_add(1, MemoryOrdering.Relaxed);

// Lazy init via CAS
let ptr = AtomicPtr.new(null_ptr<T>());
if ptr.load(MemoryOrdering.Acquire).is_null() {
    let new_ptr = Heap(T.default());
    match ptr.compare_exchange(
        null_ptr<T>(), new_ptr,
        MemoryOrdering.Release, MemoryOrdering.Relaxed
    ) {
        Result.Ok(_) => (),
        Result.Err(_) => { /* someone beat us; drop new_ptr */ }
    }
}

// Spin while flag
while flag.load(MemoryOrdering.Acquire) {
    spin_hint();
}
```

### Ordering guide

| Ordering | Use when |
|---|---|
| `Relaxed` | counters, statistics — no inter-thread ordering needed |
| `Acquire` | load that must see previous `Release` writes (read side of lock) |
| `Release` | store that publishes previous writes (write side of lock) |
| `AcqRel` | read-modify-write that both acquires and releases |
| `SeqCst` | total order across all `SeqCst` ops (strongest; use when in doubt) |

---

## `Mutex<T>`

```verum
Mutex.new(value: T) -> Mutex<T>

let guard: MutexGuard<T> = m.lock().await;         // suspends on contention
let guard = m.lock_blocking();                      // blocks the thread
let guard = m.try_lock();                           // -> Maybe<MutexGuard<T>>
```

`MutexGuard<T>` implements `Deref<Target=T>` and `DerefMut`, so you
use it as if it were `&mut T`. The lock is released when the guard
is dropped.

```verum
{
    let mut g = config.lock().await;
    g.apply(update);
}   // released here
```

`Mutex<T>: Sync` when `T: Send`. Typically wrapped in `Shared<Mutex<T>>`
for shared ownership across tasks:

```verum
let cfg = Shared.new(Mutex.new(Config.default()));
let clone = cfg.clone();
spawn async move {
    let mut g = clone.lock().await;
    g.refresh();
};
```

### Pitfall — holding across `.await`

Holding a `MutexGuard<T>` across an unrelated `.await` serialises
everything on that lock. If you must await inside the critical section,
use an async-friendly pattern (channels + message queue, or
`scope_guard_mutex` which gives you a narrow scope).

---

## `RwLock<T>`

```verum
RwLock.new(value)

rw.read().await -> RwLockReadGuard<T>              // shared
rw.write().await -> RwLockWriteGuard<T>            // exclusive
rw.try_read() / rw.try_write() -> Maybe<Guard>
rw.read_blocking() / rw.write_blocking()
```

- Multiple concurrent readers.
- At most one writer.
- Writers are not starved (bounded-FIFO queue).

---

## `Once` — one-time initialisation

```verum
static INIT: Once = Once.new();
INIT.call_once(|| setup_global_state());
```

`OnceState` inspects why a call failed (concurrent completion vs.
in-progress). `OnceLock<T>` is the typed variant:

```verum
static CONFIG: OnceLock<Config> = OnceLock.new();
let cfg = CONFIG.get_or_init(|| load_config());
```

---

## `Semaphore` — counting permits

```verum
Semaphore.new(permits: Int)

sem.acquire().await -> SemaphoreGuard              // decrement, suspend if 0
sem.try_acquire() -> Maybe<SemaphoreGuard>
sem.acquire_many(n).await -> SemaphoreGuard        // atomic batch
sem.add_permits(n)                                 // release without guard
sem.available_permits() -> Int
sem.close()                                         // wake all; future acquires fail
```

Used for bounded-parallelism controls:

```verum
let sem = Shared.new(Semaphore.new(16));         // max 16 concurrent
for task in tasks {
    let p = sem.clone().acquire_owned().await;
    spawn async move {
        let _permit = p;
        process(task).await;
    };
}
```

---

## `Condvar` — condition variable

```verum
Condvar.new() -> Condvar

cv.wait(mutex_guard).await -> MutexGuard<T>        // release + wait + reacquire
cv.wait_while(mutex_guard, |state| !ready(state)).await -> MutexGuard<T>
cv.wait_timeout(guard, duration).await -> (MutexGuard<T>, bool)

cv.notify_one()
cv.notify_all()
```

`producer_consumer_pair()` creates a linked `(Mutex, Condvar)` pair:

```verum
let (mu, cv) = producer_consumer_pair<Queue<Msg>>();
// Producer
{
    let mut q = mu.lock().await;
    q.push(msg);
    cv.notify_one();
}
// Consumer
{
    let mut q = mu.lock().await;
    q = cv.wait_while(q, |q| q.is_empty()).await;
    let msg = q.pop().unwrap();
}
```

---

## `Barrier`

Synchronise N tasks at a rendezvous point.

```verum
Barrier.new(n: Int) -> Barrier
barrier.wait().await -> BarrierWaitResult

let r = barrier.wait().await;
if r.is_leader() {
    // exactly one task gets this
    emit_checkpoint();
}
```

### `Phaser` — reusable, growable barrier

```verum
Phaser.new(initial_parties: Int)
phaser.register()                // add party
phaser.arrive()                  // mark self as arrived, don't wait
phaser.arrive_and_await().await
phaser.phase() -> Int            // monotonic phase counter
```

### `CountDownLatch` — one-time barrier

```verum
let latch = CountDownLatch.new(5);
for _ in 0..5 {
    spawn async move {
        do_work().await;
        latch.count_down();
    };
}
latch.await().await;             // returns when count reaches 0
```

---

## `WaitGroup` — Go-style wait

```verum
let wg = WaitGroup.new();
for item in items {
    wg.add(1);
    let wg2 = wg.clone();
    spawn async move {
        work(item).await;
        wg2.done();
    };
}
wg.wait().await;
```

`WaitGroup` is internally an atomic counter + condvar. Differences from
`CountDownLatch`: the count can grow (`add(delta)`) after creation.

---

## `Send` and `Sync`

Marker protocols; auto-derived.

```verum
type Send is protocol {};      // values can be transferred across threads
type Sync is protocol {};      // &T can be shared across threads
```

### When auto-derivation applies

- All primitive types are `Send + Sync`.
- `Heap<T>: Send + Sync` iff `T: Send + Sync`.
- `Shared<T>: Send + Sync` iff `T: Send + Sync`.
- `Rc<T>: !Send, !Sync` (single-threaded only).
- `Cell<T> / RefCell<T>: !Sync` (interior mutability without locking).
- `Mutex<T>: Sync` iff `T: Send`.
- `RwLock<T>: Sync` iff `T: Send + Sync`.

### Opting out

```verum
type MyType<T>: !Sync = ...;   // in a generic bound
fn requires_not_sync<T: !Sync>(x: T) { ... }
```

---

## Cross-references

- **[base → Cell/RefCell](/docs/stdlib/base)** — non-thread-safe equivalents.
- **[async](/docs/stdlib/async)** — the executor that backs async locks.
- **[intrinsics](/docs/stdlib/intrinsics)** — `atomic_cmpxchg`, `atomic_fetch_*`, `fence`, `futex_*`, `spinlock_*`.
