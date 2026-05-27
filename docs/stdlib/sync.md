---
sidebar_position: 2
title: sync
description: Atomics, Mutex, RwLock, Once, Semaphore, Condvar, Barrier, WaitGroup — thread synchronization primitives.
status: partial
status_detail: Round 14 (2026-05-27) registered all 9 sync submodules (atomic, mutex, rwlock, semaphore, condvar, barrier, waitgroup, once, mod) in `core-tests/INVENTORY.md` with per-module `audit.md` + `unit_test.vr` + `property_test.vr` + `regression_test.vr` (3261 LOC of tests, 254 `@test` entries across 27 files). 8/9 submodules **stable** under `--interp`; `waitgroup` **partial** — closed §A interpreter no-op-stub defect class via real handle-table at `crates/verum_vbc/src/interpreter/waitgroup.rs` AND closed §B sibling single-field-record `"add"` Int-receiver mis-intercept at `crates/verum_vbc/src/interpreter/dispatch_table/handlers/method_dispatch.rs:4059` (a Duration-bias intercept that fired for any single-field-record record whose first field is Int).
---

import StdlibStatus from '@site/src/components/StdlibStatus';

# `core.sync` — Synchronisation primitives

Atomic operations, locking types, condition variables, barriers,
and `Send`/`Sync` marker protocols.

<StdlibStatus
  status="partial"
  detail="3261 LOC of tests / 254 @test entries across 9 submodules — 8/9 stable under --interp, waitgroup partial (interpreter Tier-0 handle-table landed, defect class § A closed; §B duration-add intercept removed)."
  defects={[
    {area: 'sync/waitgroup', summary: 'Closed § A: Tier-0 interpreter stubbed all WaitGroup intrinsics as inert no-ops with fixed return values; tests silently passed/failed against the wrong counter state. Real handle-table now lives at crates/verum_vbc/src/interpreter/waitgroup.rs.'},
    {area: 'sync/waitgroup', summary: 'Closed § B: method_dispatch.rs:4059 had a Duration-bias \"add\" intercept on Int-receivers that fired for any single-field-record-unboxed record (every WaitGroup{handle: Int}.add(delta) silently dropped to a bare Int+Int sum). Same defect class as [[duration_single_field_record_unboxing_2026-05-27]].'},
  ]}
  sweepDate="2026-05-27"
/>

| File | What's in it |
|---|---|
| `atomic.vr` | `AtomicInt`, `AtomicU8`..`AtomicU64`, `AtomicBool`, `AtomicPtr<T>`, `MemoryOrdering` (Relaxed/Acquire/Release/AcqRel/SeqCst), `AtomicOrdering` alias, `fence(order)`, `SpinLock`, `FutexLock` |
| `mutex.vr` | `Mutex<T>`, `MutexGuard<T>`, `LockResult<T>`, `TryLockResult<T>`, `PoisonError<T>`, `TryLockError<T>` |
| `rwlock.vr` | `RwLock<T>`, `RwLockReadGuard<T>`, `RwLockWriteGuard<T>` |
| `once.vr` | `Once`, `OnceState` (New/InProgress/Done/Poisoned), `OnceLock<T>` |
| `semaphore.vr` | `Semaphore`, `SemaphoreGuard` |
| `condvar.vr` | `Condvar`, `WaitTimeoutResult`, `CondvarNotifyGuard`, `producer_consumer_pair<T>` |
| `barrier.vr` | `Barrier`, `BarrierWaitResult`, `Phaser`, `CountDownLatch` |
| `waitgroup.vr` | `WaitGroup` |
| `mod.vr` | Top-level re-exports + `Send`/`Sync` marker-protocol implementations + `prelude` |

All locks in this module are **futex-backed**: contention parks the thread
(or task on async runtimes) rather than busy-spinning.

## Module status

Each `core.sync.*` module carries an explicit conformance status — same
contract as [`core.base`](./base.md#module-status),
[`core.collections`](./collections.md#module-status), and
[`core.time`](./time.md#module-status). The status row is the truth-table
over the module's public API exercised by `core-tests/sync/<module>/`
under both Tier 0 (interpreter) and Tier 2 (AOT). Disagreement between
tiers is itself a test failure.

| Module | Status | Conformance suite |
|---|---|---|
| `atomic.vr`    | **stable** | [core-tests/sync/atomic](https://github.com/verum-lang/verum/tree/main/core-tests/sync/atomic) — 8 unit + 14 property + 10 regression. MemoryOrdering 5-variant pairwise disjointness + `name()` canonical-token injectivity + Eq laws (added this round). AtomicInt/AtomicBool single-threaded load/store/fetch_add round-trip in regression suite. Live atomic contention deferred to vcs/specs/L2-standard/sync/atomic/. |
| `mutex.vr`     | **stable** | [core-tests/sync/mutex](https://github.com/verum-lang/verum/tree/main/core-tests/sync/mutex) — 22 unit + 12 property + 5 regression. Mutex.new + poison/clear_poison/is_poisoned state-machine + PoisonError construction + TryLockError 2-variant ADT (WouldBlock / Poisoned). Default-via-`new(0)` workaround pinned in regression (task #17 close-gate). Live lock/contention at L2. |
| `rwlock.vr`    | **stable** | [core-tests/sync/rwlock](https://github.com/verum-lang/verum/tree/main/core-tests/sync/rwlock) — 14 unit + 10 property + 4 regression. RwLock.new + poison protocol + re-exported error types (LockResult / TryLockResult / PoisonError / TryLockError) destructure round-trip + multi-instance independence matrix. Writer-preference fairness pinned by data-shape; live verification at L2. |
| `semaphore.vr` | **stable** | [core-tests/sync/semaphore](https://github.com/verum-lang/verum/tree/main/core-tests/sync/semaphore) — 15 unit + 8 property + 4 regression. try_acquire / release / try_acquire_many / release_many full sequential cycle. add_permits dual-bump (capacity AND availability) + forget_permit asymmetric shrink + binary() ≡ new(1) pinned in regression. Live contention at L2. |
| `condvar.vr`   | **stable** | [core-tests/sync/condvar](https://github.com/verum-lang/verum/tree/main/core-tests/sync/condvar) — 12 unit + 7 property + 5 regression. Condvar.new + notify_one / notify_all unconditional (post missed-wakeup-fix at condvar.vr:217-230) + WaitTimeoutResult single-field shape + CondvarNotifyGuard ctor + producer_consumer_pair factory. Live wait/notify race at L2. |
| `barrier.vr`   | **stable** | [core-tests/sync/barrier](https://github.com/verum-lang/verum/tree/main/core-tests/sync/barrier) — 21 unit + 8 property + 8 regression. Barrier.new + num_threads/waiting_count/generation + BarrierWaitResult Bool + Default + Phaser bit-layout pins (TERMINATED_BIT at bit 62 preserves party-count under terminate per task #32) + CountDownLatch drained-immediate fast paths. Live multi-thread rendezvous at L2. |
| `waitgroup.vr` | **partial** | [core-tests/sync/waitgroup](https://github.com/verum-lang/verum/tree/main/core-tests/sync/waitgroup) — 9 unit + 7 property + 4 regression. **§A closed this round**: Tier-0 interpreter handle-table at `crates/verum_vbc/src/interpreter/waitgroup.rs` replaces inert no-op stubs. **§B closed this round**: Duration-bias `"add"` intercept on Int-receivers at `method_dispatch.rs:4059` removed — fired for any single-field-record-unboxed receiver. Live concurrent wait()+done() at L2. |
| `once.vr`      | **stable** | [core-tests/sync/once](https://github.com/verum-lang/verum/tree/main/core-tests/sync/once) — 6 unit + 11 property + 6 regression. OnceState 4-variant pairwise disjointness matrix + `name()` canonical tokens ("New" / "InProgress" / "Done" / "Poisoned") + Eq reflexivity / inequality. Live Once.call_once / call_once_force multi-threaded at L2. |
| `mod.vr`       | **stable** | [core-tests/sync/mod](https://github.com/verum-lang/verum/tree/main/core-tests/sync/mod) — 16 unit + 8 regression. Top-level re-export resolution + submodule-direct equivalence (Mutex / RwLock / MemoryOrdering / OnceState all resolve identically via `core.sync.X` and `core.sync.<sub>.X` paths) + curated prelude (Mutex / MutexGuard / RwLock / AtomicInt / AtomicBool / Send / Sync) resolution. |

The status table is the runtime truth, not the file's `lifecycle`
annotation: `lifecycle: Lifecycle.Theorem("v0.1")` is the *spec*
lifecycle (what the contract promises); the table above is the
*implementation* lifecycle (what the runtime currently delivers).
When the two diverge, the table is the source of truth for callers.

---

## Atomics

```verum
type MemoryOrdering is Relaxed | Acquire | Release | AcqRel | SeqCst;
type AtomicOrdering is MemoryOrdering;   // alias for atomic contexts
```

`MemoryOrdering` implements `name() -> Text` + `Display` + `Debug` + `Eq`
(landed this round) — useful for state-machine assertions:

```verum
assert_eq(o, MemoryOrdering.Acquire);
assert_eq(o.name(), "Acquire");
```

### Atomic integer types

`AtomicInt`, `AtomicU8`, `AtomicU16`, `AtomicU32`, `AtomicU64`, `AtomicBool`,
`AtomicPtr<T>` — all expose the same shape:

```verum
A.new(value) -> A
a.load(order) -> V
a.store(value, order)
a.swap(value, order) -> V
a.compare_exchange(current, new, success_order, failure_order) -> Result<V, V>
a.compare_exchange_weak(...)                            // may spuriously fail
a.fetch_add(delta, order) -> V
a.fetch_sub(delta, order) -> V
a.fetch_and(mask, order)  / fetch_or  / fetch_xor       // bitwise
a.fetch_max(value, order) / fetch_min                   // monotone
a.get_mut() -> &mut V                                   // unique access
a.into_inner() -> V                                     // consumes
```

### Memory fence

```verum
fence(order)              // standalone barrier (mfence/lfence/sfence on x86_64;
                          // dmb variants on aarch64)
compiler_fence(order)     // prevents compiler reordering only
```

### Ordering guide

| Ordering | Use when |
|---|---|
| `Relaxed` | counters, statistics — no inter-thread ordering needed |
| `Acquire` | load that must see previous `Release` writes (read side of lock) |
| `Release` | store that publishes previous writes (write side of lock) |
| `AcqRel`  | read-modify-write that both acquires and releases |
| `SeqCst`  | total order across all `SeqCst` ops (strongest; use when in doubt) |

### Lazy-init idiom

```verum
let ptr: AtomicPtr<T> = AtomicPtr.new(null_ptr<T>());
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
```

---

## `Mutex<T>`

```verum
Mutex.new(value: T) -> Mutex<T>

let r = m.lock();                        // -> LockResult<MutexGuard<T>>
let r = m.try_lock();                    // -> TryLockResult<MutexGuard<T>>

m.is_poisoned() -> Bool
m.poison()           // advisory — explicit (not panic-driven; see audit §3.2)
m.clear_poison()
m.is_locked() -> Bool                    // best-effort

m.get_mut() -> LockResult<&mut T>        // unique-borrow, no lock
m.into_inner() -> LockResult<T>          // consumes
```

`MutexGuard<T>` implements `Deref<Target=T>` + `DerefMut`. The lock is
released when the guard drops.

```verum
{
    let mut g = config.lock().unwrap_or_else(|p| p.into_inner());
    g.apply(update);
}   // released here
```

### Poisoning is advisory in Verum

Unlike Rust, Verum does NOT auto-poison on panic-during-guard-drop —
the language does not yet expose a "currently unwinding" predicate. Callers
that detect inconsistent state while holding the guard MUST invoke
`mutex.poison()` explicitly before raising. Documented at
`core/sync/mutex.vr:91-104`; pinned in [the regression suite](https://github.com/verum-lang/verum/tree/main/core-tests/sync/mutex/regression_test.vr).

---

## `RwLock<T>`

```verum
RwLock.new(value)

rw.read()       -> LockResult<RwLockReadGuard<T>>
rw.write()      -> LockResult<RwLockWriteGuard<T>>
rw.try_read()   -> TryLockResult<RwLockReadGuard<T>>
rw.try_write()  -> TryLockResult<RwLockWriteGuard<T>>

rw.is_poisoned() / rw.poison() / rw.clear_poison()
rw.get_mut() / rw.into_inner()
```

- Multiple concurrent readers, OR one writer.
- **Writer-preferred fairness**: when at least one writer is queued
  (`writers_waiting > 0`), incoming readers step aside and sleep so the
  queued writer can drain the reader pile. Bounded writer wait-time at the
  cost of mild reader latency under sustained writer pressure. See
  `core/sync/rwlock.vr:57-67`.

---

## `Once` — one-time initialisation

```verum
static INIT: Once = Once.new();
INIT.call_once(|| setup_global_state());
```

`OnceState` (New / InProgress / Done / Poisoned) inspects why a call
short-circuited. Implements `name()` + `Display` + `Debug` + `Eq`.

```verum
assert_eq(once.state(), OnceState.Done);
```

`OnceLock<T>` is the typed variant — get-or-init container with
single-shot publication:

```verum
let cfg = CONFIG.get_or_init(|| load_config());
```

### `OnceGuard.drop` soundness fix

`OnceGuard.drop` uses CAS-based poisoning to avoid overwriting a
successful `COMPLETE` with `POISONED` in a panic-during-publication race
window. Pinned in the source-side doc-comment at
`core/sync/once.vr:50-72`; LOCKed at the L2-spec level once the
multi-threaded harness lands.

---

## `Semaphore` — counting permits

```verum
Semaphore.new(permits: Int)
Semaphore.binary()                       // alias for new(1)

sem.acquire()                            // blocks via futex until available
sem.try_acquire() -> Bool                // non-blocking
sem.acquire_many(n) / try_acquire_many(n) -> Bool

sem.release() / sem.release_many(n)
sem.acquire_guard() -> SemaphoreGuard    // RAII

sem.available_permits() -> Int           // clamped non-negative
sem.max_permits() -> Int
sem.add_permits(n)                       // grows capacity AND availability
sem.forget_permit()                      // shrinks capacity permanently
```

`SemaphoreGuard` releases the held permits on drop.

### Missed-wakeup ordering rationale

`acquire()` / `acquire_many()` use `Release` ordering on the
`waiters.fetch_add` so the waiter-registration synchronises-with the
`Acquire` load in `release()` / `release_many()` / `add_permits()`. With
`Relaxed`, a concurrent releaser could read `waiters == 0` before the
waiter's increment becomes visible and skip the `futex_wake`. See
`core/sync/semaphore.vr:78-87`.

---

## `Condvar` — condition variable

```verum
Condvar.new()
cv.wait(mutex_guard) -> LockResult<MutexGuard<T>>
cv.wait_timeout(guard, timeout_ns) -> LockResult<(MutexGuard<T>, Bool)>
cv.wait_while(guard, predicate) -> LockResult<MutexGuard<T>>

cv.notify_one()                          // unconditional — no `if waiters > 0` gate
cv.notify_all()
cv.waiter_count() -> Int
```

### Unconditional notify

`notify_one` / `notify_all` always bump the sequence counter AND issue
`futex_wake`. The previous gate `if waiters > 0` was unsafe in the
notify-without-lock pattern (producer modifies state under mutex,
releases the mutex, then calls `notify_one()`): a concurrent consumer's
`waiters.fetch_add` may not be observed before the notifier's
`waiters.load`, so the notifier skips the wake; the consumer sleeps
forever. The cost of the unconditional wake is one syscall per notify
on truly-uncontended condvars (kernel returns immediately when nothing
is waiting). See `core/sync/condvar.vr:217-230`.

```verum
let (mu, cv) = producer_consumer_pair(Queue.new());
// Producer
{
    let mut q = mu.lock().unwrap_or_else(|p| p.into_inner());
    q.push(msg);
    cv.notify_one();
}
// Consumer
{
    let mut q = mu.lock().unwrap_or_else(|p| p.into_inner());
    q = cv.wait_while(q, |q| q.is_empty()).unwrap();
    let msg = q.pop().unwrap();
}
```

---

## `Barrier` — N-thread rendezvous

```verum
Barrier.new(n: Int)
barrier.wait() -> BarrierWaitResult       // is_leader: exactly one per sync
barrier.num_threads() -> Int
barrier.waiting_count() -> Int            // approximate
barrier.generation() -> Int               // increments each pass
```

`Barrier` is reusable — `generation` increments each time all N threads
have arrived, and the barrier resets to accept the next batch.

### `Phaser` — reusable, growable, terminable barrier

```verum
Phaser.new(initial_parties: Int)
phaser.register() -> Int                  // returns current phase
phaser.arrive_and_await() -> Int          // returns phase that just completed
phaser.arrive_and_deregister() -> Int

phaser.get_phase() / get_registered_parties() / get_arrived_parties()
phaser.is_terminated() -> Bool
phaser.terminate()
```

**Packed-state encoding** (see `core/sync/barrier.vr:262-298`):

```
Bits 0-15:  parties (≤ 0xFFFF)
Bits 16-31: arrived (≤ 0xFFFF)
Bits 32-61: phase (30 bits = ~1.07 billion phases)
Bit  62:    terminated
Bit  63:    UNUSED (sign bit — historically held terminated, which
            silently corrupted phase decoding via arithmetic-right-
            shift; task #32 moved the flag to bit 62)
```

Phase-advance under concurrent register / arrive_and_await uses a CAS
loop that MUST preserve the TERMINATED_BIT — losing it silently un-
terminates the phaser on the next arrival. Same data-loss class as the
arrive_and_deregister fix; both pinned in
[core-tests/sync/barrier/regression_test.vr](https://github.com/verum-lang/verum/tree/main/core-tests/sync/barrier/regression_test.vr).

### `CountDownLatch` — single-use count-down barrier

```verum
let latch = CountDownLatch.new(N);
for _ in 0..N {
    spawn { do_work(); latch.count_down(); };
}
latch.wait_for_zero();
latch.wait_for_zero_timeout(timeout_ns) -> Bool
```

`wait_for_zero_timeout` loops on the predicate under the mutex,
recomputing remaining_ns against an absolute monotonic deadline each
iteration. The earlier single-shot implementation returned `false` on
the first spurious condvar wake even when the count was still > 0. See
`core/sync/barrier.vr:548-587`.

---

## `WaitGroup` — Go-style task-completion barrier

```verum
let wg = WaitGroup.new();
for item in items {
    wg.add(1);
    spawn { work(item); wg.done(); };
}
wg.wait();                                // blocks until counter == 0
wg.try_wait() -> Bool                     // non-blocking
```

### Tier-0 interpreter handle-table

The interpreter at `crates/verum_vbc/src/interpreter/waitgroup.rs`
provides a real, thread-safe handle-table for WaitGroup. Pre-fix the
intrinsics (`__waitgroup_new_raw`, `__waitgroup_add_raw`,
`__waitgroup_done_raw`, `__waitgroup_wait_raw`,
`__waitgroup_try_wait_raw`, `__waitgroup_destroy_raw`) were inert no-op
stubs that always returned 0/1 — every conformance test silently
passed against the wrong counter state (`try_wait` returning true even
on a non-drained group). The handle-table allocates fresh,
monotonically-increasing handles per `new()`, tracks a per-WG counter
under a `Mutex`, and clamps `done()` on a drained counter (instead of
underflowing).

### Single-field-record `"add"` intercept removed

`crates/verum_vbc/src/interpreter/dispatch_table/handlers/method_dispatch.rs:4059`
had a Duration-bias `"add"` intercept that fired for any `is_int()`
receiver and computed `v + other`. Combined with Verum's
single-field-record unboxing optimisation, this caused
`WaitGroup { handle: Int }.add(delta)` to silently drop the call to
the underlying `__waitgroup_add_raw` intrinsic and return a bare
`handle + delta` instead — corrupting every conformance test that
expected a counter increment. The intercept has been removed; Duration's
`Add::add` continues to dispatch through its Verum-side body + the
`time_duration_add` intrinsic. Same defect surface as
[`[[duration_single_field_record_unboxing_2026-05-27]]`](https://github.com/verum-lang/verum/tree/main/core-tests/time/duration/audit.md#section-g).

---

## `Send` and `Sync`

Marker protocols imported from `core.base.protocols`. Auto-derived for
primitives, `Heap<T>`, `Shared<T>`, `List<T>`, `Map<K,V>`, `Set<T>`,
`Channel<T>`, `Mutex<T>`, `Maybe<T>`, `Result<T,E>`, `AtomicInt`,
`AtomicBool` under the appropriate `T: Send` / `T: Send + Sync`
constraints.

```verum
type Send is protocol {};      // values can be transferred across threads
type Sync is protocol {};      // &T can be shared across threads
```

### Auto-derivation table

| Type | `Send` when | `Sync` when |
|---|---|---|
| primitives (Int / Float / Bool / Byte / Char / Text) | always | always |
| `Heap<T>` | `T: Send` | `T: Send + Sync` |
| `Shared<T>` | `T: Send + Sync` | `T: Send + Sync` |
| `List<T>` / `Set<T>` | `T: Send` | `T: Send + Sync` |
| `Map<K, V>` | `K: Send, V: Send` | `K: Send + Sync, V: Send + Sync` |
| `Channel<T>` | `T: Send` | `T: Send` |
| `Mutex<T>` | `T: Send` | `T: Send` (the lock guarantees exclusion) |
| `Maybe<T>` / `Result<T, E>` | members all Send | members all Send + Sync |
| `AtomicInt` / `AtomicBool` | always | always |

### Opting out

```verum
type MyType<T>: !Sync = ...;             // in a generic bound
fn requires_not_sync<T: !Sync>(x: T) { ... }
```

---

## Prelude

```verum
public module prelude {
    public mount super.{Mutex, MutexGuard, RwLock, AtomicInt, AtomicBool, Send, Sync};
}
```

Add to your file with:

```verum
mount core.sync.prelude.*;
```

---

## Cross-references

- **[base → Cell/RefCell](/docs/stdlib/base)** — non-thread-safe equivalents (mutation without locking).
- **[async](/docs/stdlib/async)** — the executor that backs async-aware locks.
- **[intrinsics](/docs/stdlib/intrinsics)** — `atomic_load_*`, `atomic_store_*`, `atomic_cas_*`, `atomic_fetch_*`, `fence`, `futex_wait`, `futex_wake`, `spinlock_*`.
- **[runtime](/docs/stdlib/runtime)** — global runtime context bootstrap (uses `Once`).
