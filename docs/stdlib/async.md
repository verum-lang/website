---
sidebar_position: 1
title: async
description: Futures, tasks, channels, streams, timers, nursery, select, parallel.
---

# `core.async` — Asynchronous execution

Full async toolkit: `Future` protocol, executors, channels, async
streams, timers, structured concurrency (`nursery`), racing (`select`),
circuit breakers, retry policies, parallel helpers.

## Module status

Each `core.async.*` module carries an explicit conformance status so
you know what you can rely on today versus what is still in flight.
The status is the truth-table over the module's API surface as
exercised by `core-tests/async/<module>/` under both `verum test
--interp` (Tier 0 VBC interpreter) and `verum test --aot` (Tier 2 LLVM
AOT, `--test-threads 1`).

| Status | Meaning |
|---|---|
| **stable** | Every public method is conformance-tested. Algebraic laws are pinned by exhaustive or large-domain property tests. Cross-stdlib integration is verified. Interpreter and AOT agree on every test. Safe to depend on in production. |
| **complete** | Synonym for *stable* used by the conformance suite: 100 % public API coverage, every algebraic law pinned, every regression guarded forever. |
| **partial** | Subset of the public API is conformance-tested and stable. The rest is exercised in `regression_test.vr` via `@ignore`d tests pinning the specific defects that block coverage. The non-ignored API surface is safe; everything else is documented per-module under "Open defects". |
| **regression-only** | Module is gated by upstream stdlib / language-level defects. Public-API tests do not pass yet — only `@ignore`d regressions exist to lock the bug shapes. Avoid in production until promoted. |
| **undocumented** | Documentation in this reference is authoritative, but the module has not yet been routed through the `core-tests/` conformance suite. The current page is a best-effort snapshot of the source; it may drift from runtime behaviour. |

| Module | Status | Conformance suite |
|---|---|---|
| `poll.vr`          | **complete** | [core-tests/async/poll](https://github.com/verum-lang/verum/tree/main/core-tests/async/poll) — 42 unit + 21 property + 14 integration + 7 regression-as-guardrail (79 working, 0 pinned) |
| `waker.vr`         | **partial**  | [core-tests/async/waker](https://github.com/verum-lang/verum/tree/main/core-tests/async/waker) — 9 working + 2 pinned regressions (inline-vtable redesign + record-literal Clone-corruption fix + Waker construction inlining; waker construction + clone + wake_by_ref + will_wake all now green; 2 residual pins: fn_ref-as-Int identity stability and Debug auto-derive precedence for record types) |
| `future.vr`        | **partial**  | [core-tests/async/future](https://github.com/verum-lang/verum/tree/main/core-tests/async/future) — 17 working (construction + SelectResult variant algebra + Maybe interop) + 14 pinned regressions (the Future.poll / FutureExt.block surface is gated by the same `&self` auto-deref defect as waker §C) |
| `backoff.vr`       | **partial**  | [core-tests/async/backoff](https://github.com/verum-lang/verum/tree/main/core-tests/async/backoff) — 14 working (BackoffStrategy variant + match-coverage) + 7 pinned regressions (Backoff.<ctor> blocked by upstream CSPRNG intrinsic gap shared with reservoir) |
| `task.vr`          | **partial**  | [core-tests/async/task](https://github.com/verum-lang/verum/tree/main/core-tests/async/task) — 16 working (JoinError variant algebra + TaskId record construction + List<TaskId> bookkeeping) + 2 pinned (TaskId.new atomic counter + JoinError Debug, both gated by upstream defects) |
| `diagnostics.vr`   | **partial**  | [core-tests/async/diagnostics](https://github.com/verum-lang/verum/tree/main/core-tests/async/diagnostics) — 15 working (TaskLifecycleState 6-variant lifecycle + partition + terminal-state classification + List-histogram). Pure data-type module — no runtime dependency. |
| `cancellation.vr`  | **partial**  | [core-tests/async/cancellation](https://github.com/verum-lang/verum/tree/main/core-tests/async/cancellation) — 11 working (CancelReason 4-variant + Aborted(Text) payload + List bookkeeping). Timeout{deadline} arm deferred to integration once Instant works under interp. |
| `channel.vr`       | **partial**  | [core-tests/async/channel](https://github.com/verum-lang/verum/tree/main/core-tests/async/channel) — 12 working (TrySendError + TryRecvError variant algebra + payload recovery + retry-signal classification). |
| `broadcast.vr`     | **partial**  | [core-tests/async/broadcast](https://github.com/verum-lang/verum/tree/main/core-tests/async/broadcast) — 18 working (BroadcastRecvError + TryRecvResult<T> 4-variant + LagPolicy 3-variant + Maybe interop). |
| `select.vr`        | **partial**  | [core-tests/async/select](https://github.com/verum-lang/verum/tree/main/core-tests/async/select) — 12 working (Either<A,B> + SelectError + race-outcome bookkeeping). |
| `nursery.vr`       | **partial**  | [core-tests/async/nursery](https://github.com/verum-lang/verum/tree/main/core-tests/async/nursery) — 8 working (NurseryErrorBehavior 3-policy + priority/severity ordering). |
| `spawn_config.vr`  | **partial**  | [core-tests/async/spawn_config](https://github.com/verum-lang/verum/tree/main/core-tests/async/spawn_config) — 21 working (RestartPolicy + IsolationLevel + Priority 4-rank ordering + will-restart classification). |
| `spawn_with.vr`    | **partial**  | [core-tests/async/spawn_with](https://github.com/verum-lang/verum/tree/main/core-tests/async/spawn_with) — 10 working (CircuitState 3-variant breaker lifecycle Closed → Open → HalfOpen → Closed + can-attempt classification). |
| `executor.vr`      | undocumented | — (depends on extern FFI symbols not callable under interp) |
| `stream.vr`        | undocumented | — (StreamExt depends on Future protocol; deferred until #11 closes) |
| `generator.vr`     | undocumented | — (runtime-bound) |
| `timer.vr`         | undocumented | — (Future-bound types only) |
| `parallel.vr`      | undocumented | — (function-only, no data types) |
| `panic_fence.vr`   | undocumented | — (Future-bound) |
| `semaphore.vr`     | undocumented | — (single-variant SemaphoreError + Future-bound) |
| `async_iterator.vr`| undocumented | — (protocol-only) |
| `intrinsics.vr`    | undocumented | — (Future-bound, extern FFI) |

### Cross-module language defects

Five interpreter / codegen defects are shared across the *partial*
async modules above; closing any unblocks coverage in every module
that depends on it:

* ~~**Protocol default-method dispatch via blanket impl**~~ →
  **CLOSED 2026-05-12** (task #11) by a focused blanket-impl
  pre-pass in `collect_all_declarations` + a generic-param
  materialisation skip in the main `collect_declarations` arm.
  Stdlib pattern: `implement<F: Future> FutureExt for F {}` declared
  AFTER concrete `implement Future for ReadyFuture<T>` (source-order
  in `core/async/future.vr`).  Single-pass collection observed
  `self.blanket_impls = [Future→IntoFuture]` only at ReadyFuture's
  collection point — `Future→FutureExt` had not yet been visited,
  so FutureExt's default bodies (`block` / `map` / `and_then`)
  never monomorphised onto ReadyFuture and runtime `r.block()`
  panicked.  Fix: pre-pass populates `blanket_impls` from a single
  linear scan; the main pass's `already_present` guard
  short-circuits duplicate registration.  Generic-param skip
  suppresses spurious `F.block` / `F.map` / `F.and_then`
  registration when the blanket impl itself is observed (the
  generic-param's bare name was leaking phantom FunctionIds via
  the bare-name fanout).  Critical invariant: the pre-pass NEVER
  calls `generate_default_protocol_methods` — only seeds
  `blanket_impls` — so the Poll-suite invariant (protocol-registry
  empty-entry guard at line 1455) stays intact and the
  default-method materialisation runs exactly once per
  (concrete impl × derived protocol) pair.  Repro fixed at
  `core-tests/async/future/regression_test.vr §A` — 6 newly-passing
  tests across `block` / payload round-trip / `lazy.invokes` / `map`
  / `map_composes` / `and_then`.  §B (4 tests on Join2/Join3/Select2
  combinator receivers) remains pinned as task #24 — separate
  dispatch defect surfaces only when the receiver itself is a
  generic combinator wrapping inner Futures.

* ~~**Stdlib precompile divergence for record methods**~~ →
  **CLOSED 2026-05-12** as `compile_record` Clone-Unit-corruption.
  Investigation traced the root cause to `compile_record`'s
  field-init Clone-before-SetF step, which wrote Unit into record
  fields whose AST declared no `Clone` impl.  Combined with a
  `Waker.from_raw(raw)` call-arg passing failure in the
  `unsafe { ... }` wrapper at the call site, the construction
  chain materialised Wakers whose `raw` field was Unit; every
  downstream `self.raw.<vtable.slot>` GetF then null-derefed at
  the first chain step.  Fix: removed the synthetic Clone in
  `compile_record` (records live in heap-allocated NaN-boxed
  objects, so the field-write copies the pointer into the parent
  record's field slot — aliasing isn't possible through this
  path), AND inlined `noop_waker()`'s body to a single nested
  record literal that side-steps the call-arg indirection.
  See commit `5129d8b1a`.

* **`type_field_layouts` cross-mount registration race**
  (`future §B`).  When a record type is processed across multiple
  compilation passes (user-phase + stdlib-phase + cross-module
  mount), the field-type map could be left partial; the field
  resolver then falls into a global-scan path that picks a
  wrong-index match.  Partially mitigated by an unconditional
  `type_field_type_names` population in
  `verum_vbc::codegen::mod::register_record_fields`.

* ~~**Free-function name collision in mount resolution**~~ →
  **CLOSED 2026-05-12** by `register_function_authoritative` +
  archive cross-pollination guard + qualified-key path-doubling fix
  in `register_module_filtered`.  When multiple stdlib modules
  exported free functions with the same simple name (e.g. `select`
  appears in 7 modules; `join` in 10), the call-site `mount
  path.{name}` previously bound to whichever overload won the
  bootstrap-order first-wins race.  Three layered defects, all
  closed:

  1. **Codegen first-wins discipline** swallowed explicit user
     mounts: `register_function`'s `entry().or_insert()` under
     `prefer_existing_functions=true` rejected the user's
     authoritative binding when a passive archive-load had already
     claimed the bare-name slot.  Lifted via
     `register_function_authoritative` (writes both `name` and
     `name#arity` keys, no first-wins gate, no arity-collision
     shadowing) — invoked exclusively at the explicit-mount
     `process_import_tree::Path` branch.  Glob mounts (`mount X.*`)
     keep first-wins to protect the FFI-raw / safe-wrapper
     precedence rule.

  2. **Archive cross-pollination guard** matched only the first
     path segment, so every stdlib `core.X.Y.<leaf>` path passed
     the gate against every other `core.A.B.<leaf>` (the `w_prefix`
     was always `core` for stdlib keys).  Two unrelated functions
     sharing a simple name collapsed onto the same `FunctionInfo`,
     leaking the wrong FunctionId through the canonical qualified
     key.  Tightened: when both keys are qualified, the FULL
     path-before-leaf must match.

  3. **Path-doubling in `register_module_filtered`** built the
     qualified key as `format!("{}.{}", module_name,
     simple_name_str)` without checking whether `simple_name_str`
     already carried the module path (the precompiler's
     descriptor-name promotion sets `fn_desc.name` to the full
     source-module-qualified form).  Result:
     `core.async.future.ready` got registered as
     `core.async.core.async.future.ready`; the canonical-form probe
     missed, and the user-side mount's lookup fell through to the
     cross-pollinated entry under the *un-doubled* key.  Mirrors
     the detection rule from `populate_ctx_from_archive` line ~326:
     when `simple_name` already contains a dot, treat it as the
     qualified shape directly.

  Repro pinned at `core-tests/async/future/unit_test.vr §4-5`:
  `mount core.async.future.{join, select, join3}; let _ = join(f1,
  f2);` now dispatches to `core.async.future.join` (was:
  `core.io.path.join` / `core.security.labels.join` / etc.).

* **Constrained-implement-block method dispatch on `Poll<Result<T, E>>`**
  (`poll §H` — task #22).  Methods defined inside
  `implement<T, E> Poll<Result<T, E>>` (at `core/async/poll.vr:100`
  onward — including `map_ok` / `map_err` / `ready_ok` /
  `ready_err`) are dispatched but the closure argument is bound
  incorrectly.  Concretely: `Poll.Ready(Err(7)).map_err(|e| e+1)`
  returns `Poll.Ready(Err(7))` rather than `Poll.Ready(Err(8))` —
  the closure body is never invoked, producing a structural
  no-op.  The dispatcher resolves the method (no panic, no
  argument-count mismatch) but either: (a) closure ends up in the
  wrong slot; (b) dispatch falls through to the generic
  `implement<T> Poll<T>` block's `map` and elides the inner
  transformation; or (c) the Ready(Err(_)) destructuring recurses
  back through Ready(_) without extracting the Err payload.  The
  `_preserves_ok` / `_preserves_pending` test cases pass
  *despite* the bug, because their pinned outcomes (Ok / Pending
  arms) are preserved trivially by the no-op fallback.  Worked
  around in `core-tests/async/poll/{unit,property,integration}_test.vr`
  via direct `match q { Poll.Ready(Err(e)) => e, _ => ... }`
  projection — the Poll/Result algebraic identity is pinned
  without crossing the broken dispatcher.

---

| File | Purpose |
|---|---|
| `poll.vr` | `Poll<T>` — the three async states |
| `waker.vr` | `Waker`, `Context`, `RawWaker`, `RawWakerVTable` |
| `future.vr` | `Future` protocol + `ReadyFuture`, `PendingFuture`, `Lazy`, `Join*`, `Select2`, `FutureExt` |
| `task.vr` | `Task<T>`, `JoinHandle<T>`, `TaskId`, `JoinError`, `JoinSet<T>`, `YieldNow` |
| `channel.vr` | `Channel<T>`, `Sender`/`Receiver`, `OneshotSender`/`OneshotReceiver`, send/try errors |
| `broadcast.vr` | `BroadcastSender<T>`, `BroadcastReceiver<T>`, `broadcast_channel` |
| `executor.vr` | `Runtime`, `RuntimeConfig`, `block_on`, `Timeout`, `LocalExecutor` |
| `select.vr` | `Either<A,B>`, `select_either`, `race`, `select_all`, `join_all`, `try_first` |
| `stream.vr` | `Stream`, `StreamExt`, 30+ adapters, factories (`iter`, `unfold`, `interval`, `from_fn`) |
| `generator.vr` | `Generator<T>`, `AsyncGenerator<T>` |
| `nursery.vr` | `Nursery`, `NurseryOptions`, `NurseryError`, `NurseryErrorBehavior`, `TaskHandle` |
| `timer.vr` | `Sleep`, `SleepUntil`, `Interval`, `Delay`, `Timeout`, `Debounce`, `Throttle` |
| `spawn_config.vr` | `SpawnConfig`, `RetryConfig`, `CircuitBreakerConfig`, `RecoveryStrategy`, `Priority` |
| `spawn_with.vr` | `CircuitBreaker`, `CircuitState`, `execute_with_retry*` |
| `parallel.vr` | `parallel_map`, `parallel_filter_map`, `parallel_for_each`, `parallel_reduce` |
| `intrinsics.vr` | runtime hooks: `spawn_with_env`, `executor_spawn`, `future_poll_sync`, `async_sleep_*` |

---

## `Poll<T>` — the two-state algebra

> **Status: complete.**
> Full public-API conformance under Tier 0 (interpreter) and Tier 2
> (LLVM AOT, `--test-threads 1`). 42 unit + 21 property + 14
> integration + 7 regression-as-guardrail tests; every algebraic law
> on the `Functor`-shape (identity, composition, Pending-as-absorbing-
> element), the Maybe-isomorphism round-trip, and the `Eq` / `Clone`
> / `Default` protocols are exhaustively pinned over a representative
> `Int` payload domain. Conformance suite:
> [core-tests/async/poll](https://github.com/verum-lang/verum/tree/main/core-tests/async/poll).

The foundational poll-state algebra. Every async surface in the stdlib
(`Future.poll`, `Stream.poll_next`, `AsyncIterator.poll_next`, cancellation
checks, …) returns `Poll<T>` as its hot-path completion signal.

```verum
public type Poll<T> is
    | Ready(T)      // computation completed with value
    | Pending;      // not yet complete — the caller must re-poll
```

### Predicates

```verum
p.is_ready() -> Bool         // O(1), inlined
p.is_pending() -> Bool       // O(1), inlined; is_ready ⊕ is_pending = true ∀ p
```

### Functorial map

```verum
p.map<U, F: fn(T) -> U>(self, f: F) -> Poll<U>
```

`Pending` is the absorbing element: `Pending.map(f) == Pending` for any
`f`; the closure is never invoked. `Ready(t).map(f)` materialises
`Ready(f(t))`.

```verum
let p: Poll<Int>  = Poll.Ready(3);
let q: Poll<Int>  = p.map(|x| x * 2);              // Poll.Ready(6)
let r: Poll<Text> = p.map(|x| f"{x}");             // Poll.Ready("3")
```

### Extraction

```verum
p.unwrap(self)            -> T                  // panics if Pending
p.unwrap_or(self, default: T) -> T              // Pending → default
p.ready(self)             -> Maybe<T>           // Pending → None
```

`p.ready()` is the canonical bridge to `Maybe<T>`: `Ready(t) ↔ Some(t)`
and `Pending ↔ None`. The reverse direction is the `From<Maybe<T>>`
impl below; the two together form a structural isomorphism between
`Poll<T>` and `Maybe<T>` on the observable surface.

### Conversions

```verum
From<Maybe<T>> for Poll<T>           // Some(t) -> Ready(t), None -> Pending
```

> **Removed blanket impl.** An earlier `From<T> for Poll<T>` blanket
> impl was deleted: under any substitution `T = Maybe<U>` it
> overlapped `From<Maybe<T>>` and the impl-coherence selector silently
> routed `Poll.from(non_maybe_value)` through the Maybe arm —
> collapsing the result to `Poll.Pending` regardless of input. Write
> `Poll.Ready(value)` directly; it is the explicit, unambiguous form
> and produces byte-identical code.

### `Poll<Result<T, E>>` — async-result composition

`map_ok` / `map_err` live on the `Poll<Result<T, E>>` shape so async
functions whose `Output` is `Result<T, E>` compose without
intermediate destructuring.

```verum
Poll.ready_ok(t: T)   -> Poll<Result<T, E>>     // shorthand for Ready(Ok(t))
Poll.ready_err(e: E)  -> Poll<Result<T, E>>     // shorthand for Ready(Err(e))

p.map_ok<U, F>(self, f: F) -> Poll<Result<U, E>>      // F: fn(T) -> U
p.map_err<U, F>(self, f: F) -> Poll<Result<T, U>>     // F: fn(E) -> U
```

`Pending` remains the absorbing element on both arms:
`Pending.map_ok(f) == Pending` and `Pending.map_err(f) == Pending`.
`Ready(Err(e)).map_ok(f) == Ready(Err(e))` (no re-wrapping); symmetric
for `map_err`.

```verum
let p: Poll<Result<Int, Text>> = Poll.ready_ok(10);
let mid: Poll<Result<Int, Text>> = p.map_ok(|x| x + 1);
let after: Poll<Result<Int, Text>> = mid.map_ok(|x| x * 2);  // Ready(Ok(22))
```

### Protocol implementations

```verum
implement<T: Eq>      Eq      for Poll<T>;     // structural on Ready/Pending
implement<T: Clone>   Clone   for Poll<T>;
implement<T>          Default for Poll<T>;     // = Pending
implement<T: Debug>   Debug   for Poll<T>;     // "Ready(<t>)" | "Pending"
```

### Algebraic laws

All pinned by `core-tests/async/poll/property_test.vr`:

| Law | Statement |
|---|---|
| **Functor identity** | `p.map(\|x\| x) == p` |
| **Functor composition** | `p.map(g).map(f) == p.map(\|x\| f(g(x)))` |
| **Pending absorbs map** | `Pending.map(f) == Pending` |
| **Maybe round-trip** | `Poll.from(p.ready()) == p` |
| **Result arm preservation** | `Ready(Err(e)).map_ok(f) == Ready(Err(e))`; symmetric for `map_err` |
| **Eq reflexive / symmetric / transitive** | standard equality laws on the two-variant carrier |
| **Default invariance** | `Poll.default() = Pending` for every payload type |

### Pattern matching

`Poll<T>` is exhaustive on two arms; nest with `Maybe` or `Result` for
the common composite patterns:

```verum
fn classify(p: Poll<Result<Int, Text>>) -> Text {
    match p {
        Poll.Ready(Ok(_))  => "ready-ok",
        Poll.Ready(Err(_)) => "ready-err",
        Poll.Pending       => "pending",
    }
}
```

---

## `Future` protocol

```verum
type Future is protocol {
    type Output;
    fn poll(&mut self, cx: &mut Context) -> Poll<Self.Output>;
}

type IntoFuture is protocol {
    type Future: Future;
    fn into_future(self) -> Self.Future;
}

type FutureExt is protocol extends Future {
    fn map<U, F>(self, f: F) -> MapFuture<Self, F>
        where F: fn(Self.Output) -> U;
    fn and_then<U, F, Fut2>(self, f: F) -> AndThenFuture<Self, F, Fut2>
        where F: fn(Self.Output) -> Fut2, Fut2: Future<Output = U>;
    fn block(self) -> Self.Output;              // block current thread
}
```

### Factories

```verum
ready(value) -> ReadyFuture<T>             // immediately completes
pending<T>() -> PendingFuture<T>         // never completes
lazy(|| compute()) -> Lazy<F, T>           // deferred closure
```

### Combinators (also available on `FutureExt`)

```verum
join(fut1, fut2)               -> Join2<Fut1, Fut2>      // (O1, O2)
join3(fut1, fut2, fut3)        -> Join3                   // (O1, O2, O3)
join_all(futures)              -> List<Output>            // for List<F>
try_join(fut1, fut2)           -> Result<(O1, O2), E>     // fail-fast on Err
select(fut1, fut2)             -> Select2                 // first to complete wins
select_either(fut1, fut2)      -> Either<A, B>
race(fut1, fut2)               -> T                       // winner; loser cancelled
select_all(futures)            -> SelectAllResult<T>      // first + index
try_first(futures)             -> SelectAllResult<Output> // first Ok
timeout(fut, duration)         -> Result<T, TimeoutError>
```

---

## Tasks

```verum
type TaskId is { id: UInt64 };
type Task<T>  is { ... };
type JoinHandle<T> is { ... };
type JoinError is Cancelled | Panicked(PanicInfo);

spawn(future) -> JoinHandle<T>                   // shorthand
spawn_blocking(f) -> JoinHandle<T>               // on thread pool
spawn_detached(future) -> ()                     // fire-and-forget
yield_now() -> YieldNow                          // cooperate

h.abort()                                         // cancel
h.is_finished() -> Bool
h.id() -> TaskId
h.await -> Result<T, JoinError>                   // via Future
```

### `JoinSet<T>` — dynamic task collection

```verum
let mut set: JoinSet<Int> = JoinSet.new();
set.spawn(task_a());
set.spawn(task_b());

while let Maybe.Some(res) = set.join_next().await {
    match res {
        Result.Ok(value) => ...,
        Result.Err(JoinError.Cancelled) => ...,
        Result.Err(JoinError.Panicked(info)) => ...,
    }
}
```

---

## Channels

### MPSC — `Sender<T>` / `Receiver<T>`

```verum
channel<T>() -> (Sender<T>, Receiver<T>)                // unbounded
bounded<T>(capacity) -> (Sender<T>, Receiver<T>)
unbounded_channel<T>()                                  // alias for channel()
bounded_channel<T>(cap)                                 // alias for bounded()

// Sync API
tx.send(value)  -> Result<(), SendError<T>>               // blocks (futex) if bounded full
tx.try_send(value) -> Result<(), TrySendError<T>>         // Full | Disconnected
tx.send_timeout(value, d) -> Result<(), SendError<T>>     // with deadline

// Async API — awaitable with waker-based backpressure
tx.send_async(value) -> SendFut<T>                        // Future<Result<(), SendError<T>>>
tx.send_cancellable(value, &token)                        // Future; Err(Cancelled) on token fire
tx.closed() -> ChannelClosed<T>                           // Future<()>; completes on close

// Inspection
tx.is_closed() -> Bool                                    // == is_disconnected
tx.is_disconnected() -> Bool
tx.capacity() -> Maybe<Int>
tx.len() -> Int

// Receiver
rx.recv() -> Maybe<T>                                     // sync blocking
rx.recv_fut() -> RecvFut<T>                               // explicit async Future
rx.recv_cancellable(&token)                               // Future; Err(Cancelled) on token fire
rx.recv_many(&mut buf, max) -> Int                        // batch-drain in one lock
rx.try_recv() -> Result<T, TryRecvError>                  // Empty | Disconnected

// Receiver implements Stream<Item = T> — works with `for await msg in rx { ... }`
// and all StreamExt combinators (map, filter, take, etc.).
```

### Async backpressure

For bounded channels, `send_async(value).await` is the idiomatic way to
apply backpressure:

- If the channel has slack — push and resolve `Ok(())` immediately.
- If full — register the caller's waker in `sender_wakers`, return
  `Poll.Pending`. When the receiver pops, the sender's waker fires and
  the future re-polls, now with space.

The blocking `send()` method uses the same notification path but via
futex, for non-async callers. Both paths share state; a bounded
channel is safe to use from a mix of async and blocking senders.

### Cancellation integration

Both async variants accept a `&CancellationToken` parameter via
`*_cancellable` — on token fire the future resolves immediately
with `Err(CancellationError)` or `Err(CancellableSendError.Cancelled(..))`,
deregisters its waker, and returns control. Pattern:

```verum
select {
    msg = rx.recv_cancellable(&shutdown).await => match msg {
        Ok(Some(v)) => handle(v),
        Ok(None)    => return,   // channel closed
        Err(_)      => return,   // shutdown fired
    },
    _ = idle_timeout.await => return,
}
```

### One-shot — `oneshot<T>()`

```verum
let (tx, rx) = oneshot<Result<Data, Error>>();
spawn async move { tx.send(compute()); };
let result = rx.await;
```

### Broadcast (MPMC) — `broadcast_channel`

```verum
broadcast_channel<T>(capacity) -> (BroadcastSender<T>, BroadcastReceiver<T>)
broadcast_channel_with<T>(capacity, policy) -> (Sender, Receiver)

// Sender
tx.send(value) -> Result<Int, SendError<T>>               // returns listener count
tx.clone() -> BroadcastSender<T>                           // multi-producer
tx.subscribe() -> BroadcastReceiver<T>                     // new receiver starting now
tx.receiver_count() -> Int
tx.sender_count() -> Int
tx.is_closed() -> Bool
tx.close()

// Receiver — implements Future AND Stream
rx.recv() -> BroadcastRecv<T>                              // awaitable future
rx.recv_cancellable(&token) -> Result<Result<T, RecvError>, CancellationError>
rx.try_recv() -> TryRecvResult<T>                          // Value/Empty/Closed/Lagged
rx.len() -> Int
rx.is_empty() -> Bool
```

### Lag policies — `LagPolicy`

Controls behavior when a receiver falls behind the ring capacity:

| Variant | Semantics |
|---|---|
| `LagTolerant` (default) | Return `RecvError.Lagged(n)`; advance to oldest available message. |
| `DropOldest` | Advance silently; never return `Lagged`. Senders never block. |
| `DropSlowReceiver` | Unsubscribe the slow receiver entirely. For strict keep-up SLAs. |

Broadcast receivers observe every value **sent after subscription**;
they do not see historic values.

`BroadcastReceiver<T>` implements both `Future<Output = Result<T, RecvError>>`
(direct `.await`) and `Stream<Item = Result<T, RecvError>>` (for-await loops
and combinators). Sender and receiver counts are maintained atomically;
last-sender-drop closes the channel and wakes all receivers.

---

## Streams {#stream}

```verum
type Stream is protocol {
    type Item;
    fn poll_next(&mut self, cx: &mut Context) -> Poll<Maybe<Self.Item>>;
}
type IntoStream is protocol { ... };
type StreamExt is protocol extends Stream { ... };
```

### Factories

```verum
iter(iterable) -> Iter<I>                    // any IntoIterator
once(item) -> StreamOnce<T>
once_future(fut) -> StreamOnce<Output>
empty<T>() -> StreamEmpty
repeat(item) -> StreamRepeat<T>              // infinite (T: Clone)
repeat_n(item, n) -> StreamRepeatN<T>
from_fn(|| produce_next()) -> StreamFromFn
poll_fn(|cx| ...) -> StreamFromFn
unfold(state, |s| (item, new_state)) -> StreamUnfold
interval(duration) -> Interval
```

### Adapters (return new streams)

```verum
s.map(|x| f(x))            s.filter(|x| pred(x))     s.filter_map(|x| ...)
s.take(n)                  s.skip(n)
s.take_while(|x| pred)     s.skip_while(|x| pred)
s.chain(other)             s.zip(other)              s.enumerate()
s.peekable()               s.flatten()               s.fuse()
s.throttle(rate)           s.debounce(duration)      s.chunks(n)
s.buffer_unordered(n)      s.buffered(n)
s.timeout_each(duration)
```

### Consumers (terminal)

```verum
s.next() -> Poll<Maybe<Item>>
s.try_next() -> Poll<Maybe<Result<T, E>>>
s.for_each(|x| side_effect(x))
s.fold(init, |acc, x| ...) -> B
s.reduce(|a, b| ...) -> Maybe<Item>
s.collect<C>() -> C
s.find(|x| pred) -> Maybe<Item>
s.any(|x| pred) / s.all(|x| pred)
s.count() / s.last() / s.nth(n)
s.position(|x| pred) -> Maybe<Int>
```

### Example

```verum
async fn monitor(sensor: &Sensor) using [Logger] {
    let mut s = interval(1.seconds())
        .map(|_| sensor.read())
        .filter(|r| r.is_ok())
        .map(|r| r.unwrap())
        .throttle_filter(|v| v.delta() > 0.01);

    while let Maybe.Some(reading) = s.next().await {
        Logger.info(&f"reading: {reading}");
    }
}
```

---

## Generators

```verum
fn* fibonacci() -> Int {
    let (mut a, mut b) = (0, 1);
    loop {
        yield a;
        (a, b) = (b, a + b);
    }
}

for n in fibonacci().take(10) {
    print(f"{n}");
}
```

- `fn* name(...) -> T` — synchronous generator; returns `Iterator<Item=T>`.
- `async fn* name(...) -> T` — async generator; returns `AsyncIterator<Item=T>` (a `Stream<T>`).

Inside a generator:

```verum
yield value;                // emit
// `return` (no value) ends the generator
```

Async generators support `.await`:

```verum
async fn* stream_events(url: &Text) -> Event using [Http] {
    let mut body = Http.get_streaming(url).await?;
    loop {
        let chunk = body.next_chunk().await?;
        for e in parse_chunk(chunk) { yield e; }
    }
}

for await event in stream_events("wss://…") using [Http] {
    handle(event);
}
```

---

## Nursery — structured concurrency

```verum
public type NurseryOptions is {
    timeout:   Maybe<Duration>,
    max_tasks: Maybe<Int>,
    on_error:  NurseryErrorBehavior,         // field name matches the surface syntax
};

public type NurseryErrorBehavior is CancelAll | WaitAll | FailFast;

public type NurseryError is
    | Single(Heap<Error>)                    // single-task failure
    | Multiple(List<Heap<Error>>)            // WaitAll collected multiple failures
    | Timeout
    | Cancelled
    | Panic(PanicInfo)
    | TaskLimitExceeded(Int);

// Builder
implement NurseryOptions {
    public fn new() -> Self;
    public fn default() -> Self;                                   // alias for new
    public fn with_timeout(self, timeout: Duration) -> Self;
    public fn with_timeout_ms(self, ms: Int) -> Self;
    public fn with_max_tasks(self, max: Int) -> Self;
    public fn with_error_behavior(self, behavior: NurseryErrorBehavior) -> Self;
}

// Underlying async functions the nursery { ... } block lowers to:
public async fn with_nursery<T>(
    options: NurseryOptions,
    f: fn(&mut Nursery) -> T,
) -> Result<T, NurseryError>;

public async fn with_nursery_timeout<T>(
    duration: Duration,
    f: fn(&mut Nursery) -> T,
) -> Result<T, NurseryError>;
```

### Usage

```verum
async fn fetch_batch(urls: &List<Text>) -> List<Bytes> using [Http] {
    nursery(
        timeout: 10.seconds(),
        on_error: cancel_all,
        max_tasks: 100,
    ) {
        let handles: List<JoinHandle<Bytes>> = urls.iter()
            .map(|u| spawn Http.get(u.clone()))
            .collect();
        try_join_all(handles).await?
    } on_cancel {
        metrics.increment("fetch_batch.cancelled");
    } recover(e: NurseryError) {
        log_error(&e);
        List.new()
    }
}
```

### Guarantees

- Every spawned task completes, fails, or is cancelled **before** the
  nursery scope exits.
- `on_error` policies:
  - `cancel_all` — one failure cancels all siblings.
  - `wait_all` — collect all results including errors.
  - `fail_fast` — return the first error immediately.
- Context stacks are inherited by spawned tasks.

---

## Cancellation

Cooperative cancellation is implemented by `core.async.cancellation`.
A cancelled task continues running until it hits a *cancel point* — an
`.await` on a cancellation-aware future, an explicit `throw_if_cancelled`
check, or a `CancelScope` exit.

### Core types

```verum
// Owner — only holder can cancel.
CancellationTokenSource.new()
  .token()     -> CancellationToken                  // observer handle (clone-cheap)
  .cancel()                                          // with default CancelReason.Cancelled
  .cancel_with(reason)
  .is_cancelled() -> Bool
  .reason() -> Maybe<CancelReason>
  .linked_to(&parent)                                 // child source, propagates from parent

// Observer — read-only view.
token: CancellationToken
  .is_cancelled() -> Bool
  .reason() -> Maybe<CancelReason>
  .throw_if_cancelled() -> Result<(), CancellationError>
  .cancelled() -> CancelledFuture                    // Future<Output = CancelReason>
  .register(fn()) -> Registration                    // sync callback; RAII-deregister
  .child_source() -> CancellationTokenSource          // propagation tree
  .combine(&[t1, t2, ...]) -> CancellationToken       // any-of aggregation (static fn)
  .with_timeout(Duration) -> CancellationToken        // auto-cancel (static fn)
  .with_deadline(Instant) -> CancellationToken
  .never() -> CancellationToken                       // sentinel; never fires
```

### Structured reasons

```verum
type CancelReason is
    | Cancelled
    | Timeout { deadline: Instant }
    | ParentCancelled
    | Aborted(Text)
```

Children of a cancelled parent see `ParentCancelled` — not the parent's
own reason. This makes structured traceability explicit.

### Awaitable integration

`token.cancelled()` returns a `CancelledFuture` that completes with the
token's `CancelReason`. Compose with `select`:

```verum
select {
    r   = work().await           => Ok(r),
    res = token.cancelled().await => Err(res),
}
```

The future deregisters its waker on drop; no stale wake-ups.

### Sync callback bridge — `Registration`

```verum
let reg = token.register(|| close_file_handle(fd));
// ... do work ...
// Drop of `reg` deregisters BEFORE cancel fires. If cancel already
// happened, the callback fired synchronously inside `register()`.
```

### Scoped cancellation — `CancelScope`

```verum
let scope = CancelScope.new();
let token = scope.token();
spawn worker(token.clone());
// ... work ...
// Dropping `scope` cancels `token` (unless `scope.dismiss()` was called).
```

Scope variants:

```verum
CancelScope.new()                              // auto-cancel on drop
CancelScope.linked_to(&parent_token)           // child-source pattern
CancelScope.with_timeout(Duration)             // auto-cancel + timeout
scope.dismiss()                                // opt-out of drop-cancel
scope.cancel()                                 // explicit
```

### Propagation rules (normative)

1. **Parent → child**: `source.cancel()` propagates to every token linked
   via `child_source()` / `linked_to()`. Children fire with
   `CancelReason.ParentCancelled`.
2. **Combine**: tokens from `CancellationToken.combine(&inputs)` fire when
   any input fires.
3. **Idempotent**: subsequent calls to `cancel_with()` after a cancel are
   no-ops; the first call's reason wins.
4. **Registered callbacks and wakers** are drained under lock, then
   invoked without the lock held (no re-entrancy).
5. **Dropped registrations / futures** deregister automatically.

## Async signal subscription — `core.signal`

Async-aware wrapper around `core.sys.signal` — exposes OS signals as
awaitable futures and `AsyncIterator` streams for ergonomic composition
with `select`, `nursery`, and cancellation tokens.

```verum
// Wait for a single Ctrl-C
ctrl_c().await;                                  // -> ()

// Wait for a single SIGTERM (K8s pod-eviction trigger)
terminate().await;                               // -> ()

// Wait for SIGHUP (reload-config convention)
hup().await;                                     // -> ()

// Wait for any shutdown signal; returns which one fired
let sig: Signal = shutdown_signals().await;      // Int | Term | Hup

// Arbitrary signal set as a Stream of arrivals
let mut stream = signal_stream(&[Signal.Usr1, Signal.Usr2]);
for await sig in stream {
    handle(sig);
}
```

Idiomatic shutdown — race server work vs signal:

```verum
select {
    _ = ctrl_c().await           => drain_and_exit(),
    _ = shutdown_signals().await => drain_and_exit(),
    r = run_server().await       => handle_result(r),
}
```

### Architecture

Invoking any allocating or lock-taking operation from inside a POSIX
signal handler is undefined — the handler may preempt the mainline
thread mid-malloc, mid-mutex-unlock, etc. `core.signal` uses the
standard **self-pipe / atomic-flag** pattern:

1. The OS-level signal handler (registered once per subscribed signal
   via `core.sys.signal.on_signal`) does only an async-signal-safe
   atomic store into a `SignalFlag` (set bit).
2. A single background poller task polls these flags every ~20 ms,
   clears any set flags, and fans out to subscribers via a
   `BroadcastSender<Signal>`. The poller runs in normal runtime
   context, so broadcasting and waker operations are safe.

Trade-off: up to ~20 ms signal-to-subscriber latency — acceptable for
shutdown, reload, and heartbeat use cases. A future upgrade to Linux
`signalfd(2)`, kqueue `EVFILT_SIGNAL`, or Windows APC delivery will
collapse latency to zero behind the same public API.

## Timers

```verum
sleep(duration) -> Sleep                   // await to suspend
sleep_ms(ms)                               sleep_secs(secs)
sleep_until(deadline: Instant) -> SleepUntil

delay(future) -> Delay<F>                  // delay future by a duration
timeout(future, duration) -> Timeout<F>    // -> Result<T, TimeoutError>
debounce(future) -> Debounce<F>            // suppress rapid calls
throttle(future) -> Throttle<F>            // rate-limit

interval(duration) -> Interval              // stream firing on schedule
```

```verum
let mut ticker = Interval.new(500.ms());
loop {
    ticker.tick().await;
    update_ui();
}
```

---

## Runtime and executor

```verum
type RuntimeConfig is { ... };
type Runtime is { ... };
type LocalExecutor is { ... };
type TimeoutError is ();
type ExecutionEnv is { ... };               // θ+ context

Runtime.new() -> RuntimeBuilder
builder.worker_threads(n).stack_size(bytes)
       .io_engine(IoEngineKind.IoUring)
       .max_tasks(n)
       .build() -> Runtime

rt.block_on(future) -> Output
rt.spawn(future) -> JoinHandle<T>
rt.shutdown() / rt.shutdown_timeout(duration)
rt.enter()                                 // set current runtime for this thread
```

### Global helpers

```verum
block_on(future) -> Output                 // uses default runtime
spawn(future) -> JoinHandle<T>
current_runtime() -> Maybe<&Runtime>
```

### `LocalExecutor`

Single-threaded executor for `!Send` futures:

```verum
let exec = LocalExecutor.new();
exec.spawn_local(future);
exec.run_until(main_future);
```

---

## Spawn configuration

```verum
type SpawnConfig is { ... };                // builder
type RecoveryStrategy is
    | None
    | Retry(RetryConfig)
    | CircuitBreaker(CircuitBreakerConfig)
    | Fallback(fn() -> T)
    | Supervised;
type RestartPolicy is Permanent | Transient | Temporary;
type IsolationLevel is Shared | SendOnly | Full;
type Priority is Low | Normal | High | Critical;

let cfg = SpawnConfig.new()
    .with_priority(Priority.High)
    .with_isolation(IsolationLevel.Full)
    .with_recovery(RecoveryStrategy.Retry(RetryConfig.exponential(3, 100.ms())))
    .with_timeout_ms(5000)
    .with_name("worker-42");

let handle = spawn_with(cfg, task());
```

---

## Retry and circuit breaker

```verum
type RetryConfig is {
    max_attempts: Int,
    initial_backoff_ms: Int,
    max_backoff_ms: Int,
    backoff_factor: Float,
    jitter: Bool,
};
RetryConfig.fixed(attempts, delay_ms)
RetryConfig.exponential(attempts, initial_ms)

execute_with_retry(|| call_api(), max_attempts = 3, backoff_ms = 100)
execute_with_retry_config(|| call_api(), config)
```

### Circuit breaker

```verum
type CircuitBreakerConfig is {
    failure_threshold: Int,
    reset_timeout_ms: Int,
    half_open_max_calls: Int,
};
type CircuitState is Closed | Open | HalfOpen;

let breaker = CircuitBreaker.new(CircuitBreakerConfig {
    failure_threshold: 5,
    reset_timeout_ms: 30_000,
    half_open_max_calls: 1,
});

if breaker.is_call_allowed() {
    match call_remote().await {
        Result.Ok(v)  => { breaker.record_success(); Result.Ok(v) }
        Result.Err(e) => { breaker.record_failure(); Result.Err(e) }
    }
} else {
    Result.Err(Error.new("circuit open"))
}
```

---

## Parallel helpers

Data-parallel patterns, implemented in a portable way that the work-
stealing runtime can pick up.

```verum
parallel_map(items, worker_count, |x| f(x)) -> List<U>
parallel_filter_map(items, worker_count, |x| maybe_transform(x)) -> List<U>
parallel_for_each(items, worker_count, |x| side_effect(x))
parallel_reduce(items, worker_count, |a, b| combine(a, b)) -> Maybe<T>
```

`worker_count = 0` means "default to `num_cpus()`".

---

## Low-level intrinsics (`intrinsics.vr`)

```verum
type Executor is { ... };                  // opaque handle

Executor.current() -> Maybe<Executor>
Executor.in_async_context() -> Bool

spawn_with_env(future) -> JoinHandle<T>
executor_spawn(&exec, future) -> JoinHandle<T>
executor_block_on(future) -> Output
future_poll_sync(&mut future) -> Maybe<Output>      // single poll, sync

async_sleep_ms(ms) / async_sleep_ns(ns)
```

User code rarely touches these; they exist for runtime authors.

---

## `Waker` and `Context`

```verum
type Waker is { ... };
type Context<'a> is { waker: &'a Waker };
type RawWaker     is { ... };
type RawWakerVTable is { ... };

noop_waker() -> Waker
Context.from_waker(&waker) -> Context<'a>

waker.wake()         // consume, enqueue task
waker.wake_by_ref()  // enqueue without consuming
waker.clone()
```

---

## Context inheritance across `.await` and `spawn`

- `.await` preserves the current context stack verbatim.
- `spawn` snapshots the parent's context stack at spawn time.
- `nursery { spawn ... }` — tasks inherit the nursery's contexts.
- Channels do **not** propagate contexts (they're pure data pipes).

See **[Language → context system](/docs/language/context-system)** for the rules.

---

## `semaphore` — cooperative task limiter

```verum
mount core.async.semaphore.{AsyncSemaphore, SemaphorePermit};

let sem = AsyncSemaphore.new(10);      // cap at 10 concurrent ops

for url in urls {
    let permit = sem.acquire().await?;
    spawn(async move {
        let _p = permit;                // held for task lifetime (RAII)
        fetch(&url).await;
    });
}
```

Async-task counting semaphore — waiters park via `Future` /
`Waker` instead of blocking an OS thread (unlike
`core.sync.Semaphore` which futex-blocks). FIFO waiter fairness;
`try_acquire()` non-blocking fast path; `add_permits(n)`
runtime resize; `close()` causes pending + future `acquire`
calls to fail with `SemaphoreError.Closed`.

Typical deployments:

  - bounded outbound fan-out (N concurrent HTTP fetches)
  - DB connection-pool checkout
  - rate-limit async CPU-bound tasks (N parallel inferences)
  - producer/consumer backpressure without a channel

## `backoff` — retry delay policies

```verum
mount core.async.backoff.{Backoff, BackoffStrategy};

let mut bo = Backoff.exponential_full_jitter(
    Duration.from_millis(100),
    Duration.from_secs(30),
).with_max_attempts(5);

loop {
    match try_operation() {
        Ok(r)    => return r,
        Err(_)   => match bo.next_delay() {
            Some(d) => async_sleep(d).await,
            None    => return Err(MaxAttemptsReached),
        },
    }
}
```

Four industry-standard strategies:

| Strategy | Formula | Notes |
| -------- | ------- | ----- |
| `ExponentialNoJitter` | `base × 2^n` | deterministic |
| `ExponentialFullJitter` | `rand(0, base × 2^n)` | AWS default |
| `ExponentialDecorrelated` | `rand(base, prev × 3)` | AWS whitepaper; best for large fleets |
| `FibonacciFullJitter` | `base × F(n+1)` jittered | gentler ramp |

Overflow-guarded integer arithmetic over microseconds. Once
`base × 2^attempt` would overflow UInt64, the raw value
saturates at `cap_us` — pathological `max_attempts` values
plateau at the configured ceiling instead of wrapping.

---

## See also

- **[sync](/docs/stdlib/sync)** — atomics, mutexes, condvars used by async code.
- **[runtime](/docs/stdlib/runtime)** — `ExecutionEnv`, supervision.
- **[time](/docs/stdlib/time)** — `Duration`, `Instant`, time intrinsics.
- **[Language → async & concurrency](/docs/language/async-concurrency)** — surface syntax (`async fn`, `.await`, `spawn`, `nursery`, `select`).
- **[Architecture → runtime tiers](/docs/architecture/runtime-tiers)** — executor internals.
