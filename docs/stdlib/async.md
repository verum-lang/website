---
sidebar_position: 1
title: async
description: Futures, tasks, channels, streams, timers, nursery, select, parallel.
status: partial
status_detail: 17 modules; 12 audited via core-tests/async/; 7 fundamental defects pinned (tasks #10 – #17); the variant-algebra + construction-surface backbone is fully exercised under interpreter, the runtime poll-path coverage waits on the executor test-bed.
---

import StdlibStatus from '@site/src/components/StdlibStatus';

# `core.async` — Asynchronous execution

<StdlibStatus
  status="partial"
  detail="12 of 23 async modules carry full conformance suites; 7 fundamental compiler/stdlib defects pinned. Variant-algebra + construction-surface backbone is interpreter-green; runtime poll-path coverage waits on the executor test-bed."
  defects={[
    {area: 'global AOT', summary: 'task #10 — `compiler.phase.generate_native` SIGABRT (LLVM SmallVector hang) — blocks AOT coverage across every async test'},
    {area: 'panic_fence', summary: '**CLOSED:** task #11 (`Maybe.take()` &mut self writeback round-trip) — three-layer fix: precompiler self-shape encoding + archive-loader decoding + field-receiver `SetF` writeback in `compile_method_call`'},
    {area: 'semaphore', summary: 'task #12 — `AsyncSemaphore.new` null-derefs through AtomicInt.swap in the Mutex/AtomicBool init chain. **CLOSED:** #13 (`is`-operator on single-variant sum) — parser fix at `crates/verum_fast_parser/src/decl.rs:3384` distinguishes `is`-form sum declarations from `=`-form aliases per grammar §2.4'},
    {area: 'timer', summary: 'task #15 — `Duration.from_millis` dispatch routes `from_nanos` to an Int receiver (archive-precompiled wrapper-fn return-register corruption — see audit). **CLOSED:** #14 (cross-module `timeout_ms` collision); #17 (getter-shadowing); **#16 (`Timeout<F>` field-layout write OOB)** — two-layer consumer-side fix that prefers `TypeDescriptor.fields` over the polluted simple-name `type_field_layouts` cache, eliminating the entire "record-type-name collides with sum-type variant payload" defect class universe-wide'},
  ]}
  sweepDate="2026-05-14"
/>

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
| `executor.vr`      | unaudited    | — depends on extern FFI symbols not callable under interp; deferred pending executor test-bed |
| `stream.vr`        | unaudited    | — StreamExt depends on Future protocol; deferred pending the executor test-bed and tasks #11 + #25 |
| `generator.vr`     | unaudited    | — runtime-bound; deferred pending the executor test-bed |
| `timer.vr`         | **partial**  | [core-tests/async/timer](https://github.com/verum-lang/verum/tree/main/core-tests/async/timer) — 29 working (Sleep/SleepUntil/Delay construction surface + TimerInterval new/immediate next_tick partition + Debounce/Throttle state-machine round-trip + monotonic refusal + reset-then-acquire across 4 representative intervals + TimeoutError Eq reflexivity) + 6 pinned regressions for tasks #14 / #15 / #16 / #17. Pre-fix landed in this branch: `pub async fn acquire` → `public async fn acquire` (line 535). |
| `parallel.vr`      | **complete** (interp) | [core-tests/async/parallel](https://github.com/verum-lang/verum/tree/main/core-tests/async/parallel) — 38 working covering parallel_map, parallel_filter_map, parallel_for_each, parallel_reduce, and the Blelloch parallel_scan_exclusive. Pinned properties: worker-count invariance over {1,2,4,8,16}, Blelloch-vs-reference exclusive-prefix-scan identity for `+` and `max`, parallel_reduce ≡ left-fold₁, filter_map index-subset-of-map. AOT validation gated by task #10. |
| `panic_fence.vr`   | **partial**  | [core-tests/async/panic_fence](https://github.com/verum-lang/verum/tree/main/core-tests/async/panic_fence) — 12 working (panic_safe factory + record-literal Some/None inner + Ready(Ok) Int/Text round-trip + fence outcome→tag classification + List<fenced ReadyFuture> sequential consumption summing 15) + 1 pinned (task #11: `Maybe.take()` mutation through `&mut self` on a generic record field; gates the fence's documented "inner=None after Ready" lifecycle invariant). Panic-arm coverage deferred pending a panicking-Future test bed. |
| `semaphore.vr`     | **regression-only** outside variant algebra | [core-tests/async/semaphore](https://github.com/verum-lang/verum/tree/main/core-tests/async/semaphore) — 8 working (SemaphoreError single-variant algebra including the natural `e is SemaphoreError.Closed` form + Result/Maybe wrapping integration) + 9 pinned regressions for #12 (lifecycle tests blocked by `AsyncSemaphore.new` null-derefs through AtomicInt.swap in Mutex/AtomicBool init).  **#13 CLOSED** 2026-05-15 via single-line architectural fix in the parser — `type X is Y;` is now correctly parsed as a single-variant sum (was incorrectly downgraded to alias), closing the entire `SemaphoreError` / `ChannelError` / single-variant marker idiom across stdlib. |
| `async_iterator.vr`| unaudited    | — protocol-only; the testable surface is the blanket `IntoAsyncIterator for A`, exercised transitively through stream/channel/broadcast concrete impls (deferred pending those test beds) |
| `intrinsics.vr`    | **partial**  | [core-tests/async/intrinsics](https://github.com/verum-lang/verum/tree/main/core-tests/async/intrinsics) — 19 working (Executor.current/in_async_context coherence + future_poll_sync ReadyFuture round-trip across Int/Text/Bool payloads + IntrinsicsYieldNow two-state lifecycle Pending→Ready with exactly-one-Pending tightness). Spawn family + sleep family @intrinsics deferred pending the live-executor test-bed. |

### Cross-module language defects

Multiple interpreter / codegen defects are shared across the *partial*
async modules above; closing any unblocks coverage in every module
that depends on it.

#### Active (2026-05-14)

* **Task #10 — global AOT `generate_native` SIGABRT.** Every test
  under `--aot` crashes with `__pthread_cond_wait` →
  `llvm::SmallVectorBase::grow_pod` at the native-gen worker pool.
  Affects every async test (and every base/maybe test too); not
  async-specific. Blocks the AOT half of the cross-tier conformance
  contract. Repro: `verum test --aot --filter test_none_construction`
  from `core/`.

* ~~**Task #11 — `Maybe.take()` mutation through `&mut self` does not
  flow back to a generic record field**~~ → **CLOSED 2026-05-14**
  via three layered architectural fixes:
  (1) **Precompiler self-shape encoding** (`crates/verum_vbc/src/codegen/mod.rs::compile_function`) —
  pre-fix every non-`Regular` `FunctionParamKind` (the entire
  `SelfValue` / `SelfRef` / `SelfRefMut` / checked / unsafe / own
  family) serialised into the archive as
  `TypeRef::Concrete(TypeId::UNIT)`, erasing reference + mutability
  + tier info at the serialisation boundary. Now each variant
  encodes its proper `TypeRef::Reference { inner, mutability, tier }`
  shape (or `Concrete(parent_tid)` for value receivers).
  (2) **Archive-loader self-shape decoding**
  (`crates/verum_compiler/src/archive_ctx_loader.rs`) — every site
  hardcoded `takes_self_mut_ref: false`. New `fn_takes_self_mut_ref`
  predicate inspects the first param's TypeRef: if `Reference {
  Mutability::Mutable, .. }` with name `self`, sets flag true.
  (3) **Field-receiver writeback** in `compile_method_call`
  (`crates/verum_vbc/src/codegen/expressions.rs`) — even with (1)+(2)
  wired, `b.inner.take()` still failed because `RefMut` creates a
  CBGR ref to the *temporary* register holding the extracted field,
  not to the field slot. The fix captures `(base_reg, field_idx)`
  upfront for `Field` receivers and emits a `SetF` after the
  method body returns, committing the (potentially mutated)
  receiver_reg back to the field slot — only when the method
  actually takes `&mut self`.
  Architectural rule pinned: the `FunctionParamKind` self-shape
  taxonomy MUST round-trip through the archive losslessly; the
  user-side method-call dispatch MUST honour the resulting
  `takes_self_mut_ref` flag with both `RefMut` to wrap the receiver
  AND the field-writeback `SetF` for chained-field receivers.
  Blast radius: every `&mut self` stdlib method (Maybe.take /
  Maybe.replace / Maybe.insert / Text.push_str / every mutator) now
  mutates correctly through user code.

* **Task #12 — `AsyncSemaphore.new` null-derefs through
  `AtomicInt.swap`.** Every `AsyncSemaphore.new(N)` for any N panics
  with `NullPointerAt { op: "opcode 0xe5", site: "AtomicInt.swap" }`.
  Construction chain: `AsyncSemaphore.new` → `Shared.new(Mutex.new(...))`
  → `AtomicBool.new(false)` → `AtomicInt.swap` NULL. Defect class:
  VBC interpreter atomic-primitive dispatch on a freshly-allocated
  atomic cell. Pinned in `core-tests/async/semaphore/regression_test.vr §A`.

* ~~**Task #13 — `is`-operator returns false on a single-variant sum
  type**~~ → **CLOSED 2026-05-15** by a single-line architectural
  fix at `crates/verum_fast_parser/src/decl.rs:3384`.  **Root cause
  (architectural)**: per `grammar/verum.ebnf` §2.4 the `is` / `=`
  sigils in type declarations are NEVER interchangeable —
  `type X = Y;` (with `=`) is an alias, `type X is Y;` (with `is`)
  is a single-variant sum.  Pre-fix the parser collapsed
  `type X is OnlyVariant;` (bare identifier, no payload, no
  leading `|`) into `TypeDeclBody::Alias(OnlyVariant)`, silently
  turning a single-variant sum into an alias to a non-existent
  type.  Downstream the typechecker's `is`-operator
  pattern-resolution at `crates/verum_types/src/infer/patterns.rs:1485`
  strictly required a `Type::Variant`, so `e is X.Closed` returned
  false — while `match e { X.Closed => … }` and `Eq.eq` still
  worked because their paths tolerated alias resolution.  The fix
  emits `TypeDeclBody::Variant(vec![first_variant])` for any
  `is`-form RHS that `looks_like_variant()` accepted.  Both
  `type X is | Closed;` and `type X is Closed;` now produce
  identical AST.  Closes the SemaphoreError / ChannelError / every
  single-variant marker error idiom across stdlib without a
  stdlib-source change.  Architectural rule pinned: the `is` /
  `=` sigils in type declarations are NEVER interchangeable; any
  future "is-form RHS looks like a type alias" optimisation MUST
  go through `=`, not `is`.

* ~~**Task #14 — `timeout_ms` cross-module name collision**~~ →
  **CLOSED 2026-05-14** by two layered fixes in `crates/verum_vbc/src/codegen/`:
  (1) **path-suffix narrowing probe** in `process_import_tree::Path` —
  the existing lookup chain probed only `core.async.timer.timeout_ms`
  (verbatim) and `async.timer.timeout_ms` (core-stripped); neither
  matched because `core/async/timer.vr` declares `module timer;`
  (single-segment), so the archive_ctx_loader installs functions
  under `timer.timeout_ms`. The new probe iterates parent-path tails
  from longest to shortest (longest-prefix-match routing-table
  discipline), anchoring on `func_name`, and the first hit wins;
  `[timer].timeout_ms` now resolves cleanly. (2) **strict-arity filter
  in `type_aware_lookup`** — the cross-module disambiguation closure
  built `arity_matches` via the lenient `lookup_function_with_arity`
  helper, which returns the primary registration even for wrong
  arity. Wrong-arity candidates polluted the set, and the downstream
  `param_type_names.iter().zip(arg_type_names)` truncated to the
  shorter sequence — letting a 1-param method-with-self
  (`ShutdownStrategy.timeout_ms(&self)`) "type-match" a 2-arg call by
  only inspecting `arg[0]`. The strict-arity filter
  (`info.param_count == args.len()`) eliminates this collision class
  structurally: type-based disambiguation now runs ONLY between
  candidates that already agree on parameter count. Architectural
  rule pinned: every code path that filters function candidates by
  arity MUST use strict equality — lenient arity helpers stay
  available for "report-this-as-error" surfaces, but they MUST NOT
  seed disambiguation tiers.

* **Task #15 — `Duration.from_millis` dispatch routes `from_nanos`
  to an Int receiver.** `sleep(Duration.from_millis(N))` panics:
  "method 'from_nanos' not found on receiver of runtime kind Int".
  Chain `Duration.from_millis → Duration.from_nanos(int*1_000_000)` is
  dispatching `from_nanos` as a method on the Int multiplied result
  instead of as a static Duration constructor. Also surfaces through
  `sleep(Duration.from_secs(1))` via the `@inline(always)` factory
  expansion, but NOT through `Sleep.new(Duration.from_secs(1))`.
  Pinned in `core-tests/async/timer/regression_test.vr §A`.

* ~~**Task #16 — `Timeout<F>` field-layout write out of bounds**~~ →
  **CLOSED 2026-05-15** by a two-layer consumer-side architectural
  fix in `crates/verum_vbc/src/codegen/`:
  (1) **`compile_record`'s `alloc_slots` resolution** — emits
  `Instruction::New { field_count }` from
  `TypeDescriptor.fields.len()` via `type_name_to_id → types[]` BEFORE
  falling back to the polluted simple-name `type_field_layouts` cache.
  (2) **`resolve_field_index`'s field-idx resolution** — strips
  generic args (`Timeout<ReadyFuture>` → `Timeout`), looks up the
  descriptor, scans its `fields` for the field-name match; returns the
  descriptor-canonical index.
  **Root cause (architectural)**: the flat `type_field_layouts:
  HashMap<String, Vec<String>>` cache is keyed by SIMPLE type name and
  was polluted by record-style variant constructors that share a
  simple name with a standalone record type — canonical case:
  `core.sys.io_engine.CompletionOp.Timeout { ts: &TimeSpec }`
  (1-field variant payload) registered `type_field_layouts["Timeout"]
  = ["ts"]` before `core.async.timer.Timeout<F>` (3-field record)
  could claim the simple-name slot.  Under first-wins, the host
  record's 3-field layout was silently shadowed.  `Timeout.new`'s
  precompiled body then emitted `Instruction::New { field_count: 1 }`
  (one slot, 8 bytes of data) and the subsequent SetF for field index
  2 (or 5 after Sleep nested allocation) wrote past the allocation.
  **Architectural rule pinned**: the `TypeDescriptor` (one per type,
  owned by the type's own declaration site) is the canonical source
  of truth for field-layout information; flat caches are convenience
  indices that may suffer simple-name collisions from sibling sum
  types' record-style variants; every consumer that needs declared
  field count or field index MUST query the descriptor FIRST and fall
  back to the cache ONLY when the descriptor lookup misses.  Blast
  radius: closes the entire "record type whose simple name collides
  with a sum type's record-style variant payload" defect class
  universe-wide — `Timeout<F>` is the canonical case but the same
  pattern applies to `NurseryError.Timeout`, `ShellError.Timeout`,
  every record-style variant payload across stdlib.

* ~~**Task #17 — `TimerInterval.period()` field-vs-method-name
  shadowing causes StackOverflow**~~ → **CLOSED 2026-05-15**.
  The originally-pinned defect — where the getter method body
  `self.period` inside `period(&self) -> Duration` was
  dispatching as a recursive `self.period()` method call (blowing
  the stack) — no longer reproduces.  Verified by both the
  user-side reproducer (`type T is { period: Int }; implement T
  { fn period(&self) -> Int { self.period } }` — both `t.period`
  field access and `t.period()` method call now stable) and the
  stdlib `TimerInterval.period()` regression test (flipped from
  `@ignore` to active).  Closed indirectly by parallel codegen
  disambiguators landed by other agents and/or by task #11's
  field-receiver writeback work that consolidated the
  field-vs-method path in `compile_method_call`.  Architectural
  rule pinned in the regression-test comment: bare `self.X` (no
  parens) inside a method body MUST resolve to field access when
  X names a field of the impl's parent type — even when X also
  names a method on the same type.  Only `self.X()` (with parens)
  resolves to a method call.  The pattern is canonical for getter
  idioms (Duration, Instant, Throttle, Debounce, TimerInterval).

#### Closed

Five interpreter / codegen defects previously gated the *partial*
async modules; closing them unblocked coverage:

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

* ~~**`type_field_layouts` cross-mount registration race**~~ →
  **CLOSED 2026-05-13** (task #9) by extending `register_archive_type`
  (`crates/verum_vbc/src/codegen/mod.rs:3944`) to unconditionally
  populate `type_field_type_names` for every archive-loaded record
  type — mirrors the `register_record_fields` invariant established
  by commit `ab768e5d8` for user-phase declarations.  Pre-fix the
  archive-side path only populated `type_field_layouts` and left
  `type_field_type_names` empty; downstream `field_type_name`
  returned `None` and `resolve_field_index` fell through to the
  "pick the type with the most fields" global-scan heuristic —
  silently routing record-construction field writes to wrong
  offsets when a sibling type with same-named field was in scope.
  Added `type_ref_to_field_name` helper that mirrors
  `extract_type_name_from_ast`'s prefix-preservation invariants
  (`&unsafe T` / `*const T` / `*mut T` keep their prefix so the
  raw-pointer marker at `compile_field_access` line 14372 still
  fires); pinned the built-in-`TypeId → name` discipline via the
  new `primitive_type_id_to_name` source-of-truth (third site
  consistent with `type_ref_to_name` codegen-side and
  `primitive_typeid_name` archive_ctx_loader-side).  4
  newly-passing regression tests at
  `core-tests/async/future/regression_test.vr §C`
  (ReadyFuture.value / Join2.{fut1,fut2,result1,result2} /
  Select2.{fut1,fut2} / Lazy.f field-access under `List` mount).

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

* ~~**Variant-tag stability under per-file test compilation**~~ →
  **CLOSED 2026-05-13** (task #22) across 4 architectural defect
  classes via commits `90b94e68b` + `3f14510b8` + `485a230c6` +
  `f1dd6fd19`.  (1) Nested-variant destructure scrutinee-type leak —
  stash i-th `variant_payload_types` into `match_scrutinee_type`
  before recursing.  (2) Flat-variant tag drift — scrutinee-aware
  lookup tier BEFORE bare `lookup_function(name).variant_tag` at
  both construction (`compile_variant_constructor_hinted`) and
  destructure (`compile_pattern_test`) sites.  (3) Nested
  construction payload propagation — symmetric to (1) at
  construction site via new helper
  `find_variant_payload_types_by_type_and_name`.  (4) Generic-param
  substitution — when payload type is bare generic-param shape
  (`"T"` / `"E"` / `"Self"`), substitute the i-th generic arg from
  the outer `receiver_type<...>` instantiation using TypeDescriptor's
  `type_params` index.  Closes round-trip for `Poll.Ready(Err(7)) →
  match → 2007` deterministically across precompile cycles.  Mirror
  of tasks #9 / #11 / #21 discipline: context-aware canonical
  resolution wins over passive bare-name race.  The constrained-
  implement-block dispatch issue (closure body in
  `implement<T,E> Poll<Result<T,E>> { fn map_err(...) { ... } }`
  not invoking the closure arg) is a DISTINCT defect tracked
  separately as task #25.

* **Closure dispatch in constrained-implement-block bodies**
  (task #25, distinct from #22).  Methods defined inside
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
