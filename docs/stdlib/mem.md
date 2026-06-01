---
sidebar_position: 4
title: mem
description: Capability-Based Generational References — Heap, Shared, allocator, raw ops.
status: partial
status_detail: 15 submodules green under `--interp`. CLOSED 2026-05-29/31 — D2/CLASS-9 cross-module field-index shift (resolve_field_index string-authoritative descriptor resolution; 4 thin_ref/mod tests un-ignored); D1 epoch write-surface (scalar-shadow routing; 3 tests un-ignored); D2b stdlib-wide global-intern field-layout subclass (global_type_layout_registry — precompile global-intern 5210→225, −96%, fixes the cross-module field-shift class platform-wide, not just mem). OPEN — D3 single-field-record-variant unboxing (arena task #8 / Duration class); D-AOT-1 AOT typechecker types `Enum.Variant {}` as the variant not the parent enum (blocks Tier-1); ~225 intra-module forward-ref global-intern tail. Held at `partial` until AOT verified + D3 closed. Per-submodule rows in `core-tests/INVENTORY.md`.
---

import ModuleStatus, {
  LifecycleBadge,
  TierBadge,
  TestCovBadge,
} from '@site/src/components/StdlibBadge';

# `core.mem` — Memory management

The implementation of CBGR (Capability-Based Generational References),
the three-tier reference model, and the allocator stack. User code
typically interacts with `Heap`, `Shared`, and references via
[`base`](/docs/stdlib/base); this page documents the full `mem` API
for systems programmers.

## Module status

Each stdlib module declares its maturity via the `@arch_module(...,
lifecycle: Lifecycle.X("vN.M"))` directive at the top of its source.
The four lifecycle states are:

| Status | Meaning | API stability |
|---|---|---|
| **🟢 Theorem(v0.1+)** | Implementation complete, mechanised proof attached, tier-aligned test suite green on both `--interp` and `--aot`. | Stable — additions only, no breaking changes inside the major version. |
| **🟡 Conjecture(v0.1)** | Implementation complete; proof in progress; tests passing in at least one tier. | Stable in spirit — may receive bug-fix breakage if a defect surface forces a rename. |
| **🟠 Draft(vX)** | Implementation incomplete or partially gated behind feature flags; API may still shift. | Unstable — pin a specific Verum version. |
| **⚫ Deprecated** | Superseded by another module; kept for source-level compatibility until next major version. | Will be removed — migrate per the deprecation note. |

Orthogonal coverage axes:

| Axis | Symbols | Meaning |
|---|---|---|
| **Tier** | `--interp` ✓ / `--aot` ✓ | Both tiers exercise the module's public surface; `--interp` is mandatory, `--aot` is "tier-aligned" gate. |
| **Test coverage** | 🟢 full / 🟡 partial / 🔴 none | "Full" requires `core-tests/<x>/<y>/{unit,property,integration,regression}_test.vr` + `audit.md`. |

### `core.mem` per-module status

The table reflects `@arch_module(... lifecycle: ...)` declared in each
source file PLUS the test-coverage state in `core-tests/mem/`.

| File | Lifecycle | Tier | Tests | Notes |
|---|---|---|---|---|
| `capability.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/capability/` — 4 files + audit |
| `header.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/header/` — 4 files + audit |
| `size_class.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/size_class/` — 4 files + audit; uncovered `clz_u64 → ctlz` + PAGE_HEADER_SIZE drift defects (both closed) |
| `thin_ref.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/thin_ref/` — 4 files + audit. **D2/CLASS-9 CLOSED 2026-05-29**: `UseAfterFreeError.new(...)` cross-module field round-trip now correct — root was `resolve_field_index`'s descriptor path comparing `fd.name.0` (a `ctx.strings` StringId) against `field_name_indices[field]` (a separate intern namespace), false-matching at index 0; fixed by string-authoritative resolution. `.new(...)`/`.message()`/`.eq()` tests un-ignored, all GREEN under `--interp` (audit §8). |
| `fat_ref.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/fat_ref/` — 4 files + audit (static-shape only) |
| `hazard.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="partial" /> | <TestCovBadge cov="full" /> | `core-tests/mem/hazard/` — `HazardStats` algebra surface complete: 3-field round-trip + `needs_reclaim()` boundary sweep + `estimated_retired_bytes` product invariant. `hazard_stats()` live call pinned via `@ignore` (audit §3.3 — record-typed `static mut` has no cell backing) |
| `epoch.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/epoch/` — read + write surface. **D1 CLOSED 2026-05-29**: `increment_epoch_for_tests` re-routed through the scalar-shadow cell + atomic ops (the implemented epoch mechanism that `current_epoch`/`reset_for_tests` already use), instead of the unimplemented record-shaped `static mut` method path; 3 increment tests un-ignored, GREEN under `--interp`. The general `&mut static_mut_struct.scalar_field` codegen cell-backing remains a separate language-level gap (task #9). |
| `allocator.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/allocator/` — static-shape + live cbgr_alloc round-trip via public `Heap<T>` / `Shared<T>` (audit §A closed); §B realloc-cross-boundary + §C ctx-allocator + §D protocol-impls + §E AllocStats + §F AOT sweep open |
| `arena.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="partial" /> | <TestCovBadge cov="full" /> | `core-tests/mem/arena/` — constants + `ArenaConfig.{default,fixed,custom}` constructors + `ArenaError` 4-variant `is`-disjoint sweep + per-variant `.message()` payload-content assertions all green; **9 live-lifecycle tests pinned `@ignore` on task #8** (precompiled-stdlib `GenerationalArena.new` MakeRecord step broken) |
| `segment.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/segment/` — Mimalloc-style 32 MiB chunks |
| `heap.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/heap/` — thread-local fast path; live heap_alloc lifted via public `Heap.new` (audit §B closed); HeapError 7-variant + HeapStats 8-field surface exhausted + From&lt;SegmentError&gt; lift covered (audit §D closed) |
| `diagnostics.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/diagnostics/` — read-only observer surface |
| `cap_audit.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/cap_audit/` — capability transition events |
| `cap_audit_ring.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/cap_audit_ring/` — lock-free SPMC ring |
| `mem_raw.vr` (re-exported) | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="both" /> | <TestCovBadge cov="full" /> | `memcpy`/`memmove`/`memset`/`memcmp`/`strlen`/`strcmp` — see `core-tests/intrinsics/` |
| `mod.vr` (module root) | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/mod/` — 4 files + audit. Module-root surface: `UseAfterFreeError` (5-field record + 3 ctors + message + Debug + Display + Eq) + `RevocationError` (4-variant sum + 4 ctors + message + Debug + Display + Eq) + `CbgrTier` (4-variant sum) + `get/set_execution_tier` global accessor. 41 unit + 19 property + 18 integration + 9 regression tests cover module-root types + the umbrella re-export contract (every submodule symbol resolves via `mount core.mem.{Name}`). **4 pinned `@ignore`'d tests**: 3 on cross-module instance-method-body field-access shift defect (`UseAfterFreeError.message()` / `.eq()` body field-reads drift), 1 on umbrella-mount dispatch collision (`has_capability(flags, cap)` routed to `AllocationHeader.has_capability(&self, cap)`) — see `audit.md §3.1` and `§3.4`. |

The dedicated-suite-pending modules are tracked in
`core-tests/INVENTORY.md`; new modules graduate to <TierBadge tier="both" />
once all four test files land **and** the audit deferrals all close on both
tiers.

### Round-17 expansion (2026-05-28) — `core.mem.mod/` first-pass + foundation-layer property law sweeps

Three commits landed:

**1. `mem/mod/` 4-file conformance suite** (commit `8efa39d08`) —
   first coverage of the `core/mem/mod.vr` umbrella manifest. 41
   active unit + 19 property + 18 integration + 9 regression tests +
   `audit.md` covering the 3 module-root types (`UseAfterFreeError`,
   `RevocationError`, `CbgrTier`) and the umbrella re-export contract.

**2. `mem/epoch/` + `mem/hazard/` property sweep** (commit `84a329253`)
   — epoch property 85→250 LOC (4→13 laws); hazard property 38→235 LOC
   (3→17 laws); hazard integration 41→200 LOC (2→11 tests). Closes
   foundation-layer algebraic-law gaps for EpochCache 3-field
   isolation, `needs_reclaim` threshold sweep,
   `estimated_retired_bytes` 5×5 Cartesian product law,
   MAX_THREADS / RETIRED_THRESHOLD power-of-two pins, and footprint
   analysis composed with HEADER_SIZE / SEGMENT_SIZE /
   DEFAULT_ARENA_CAPACITY.

**3. `mem/heap/` + `mem/arena/` property sweep** (commit `d533408b7`)
   — heap property 53→300 LOC (3→16 laws); arena property 40→230 LOC
   (4→18 laws). HeapStats 8-field isolation + balance algebra
   (`alloc_count == dealloc_count + live_count` no-leak invariant +
   bytes balance + monotonicity); ArenaConfig
   `.default()`/`.fixed()`/`.custom()` constructor invariants +
   ArenaError 4-variant disjointness + payload-conjunctive Eq laws.

#### NEW defects surfaced

##### §1. Cross-module instance-method-body field-access shift

`UseAfterFreeError.message()` body reads `self.<field>` at the WRONG
offsets when invoked on instances constructed in test code, because
the method body's compilation context is `core/mem/mod.vr` and the
precompiled-archive's field layout for `UseAfterFreeError` isn't
fully threaded into `compile_field_access` at the method-body
codegen site.

Demonstration (interpolated output under `--interp` 2026-05-28):

```text
let e: UseAfterFreeError = UseAfterFreeError {
    expected_gen:   5,    actual_gen:     6,
    expected_epoch: 1,    actual_epoch:   2,
    type_name:      "Shared<Int>",
};
print(e.message());
// Output: "use-after-free detected for 1: expected gen=5 epoch=5,
//                                         actual gen=6 epoch=6"
```

Decoded shift:

| Field | Logical slot | `.message()` reads slot |
|---|---:|---:|
| `expected_gen`   | 0 | 0 ✓ |
| `actual_gen`     | 1 | 1 ✓ |
| `expected_epoch` | 2 | 0 ❌ (reads expected_gen) |
| `actual_epoch`   | 3 | 1 ❌ (reads actual_gen) |
| `type_name`      | 4 | 2 ❌ (reads expected_epoch) |

Same root cause class as the existing
`use_after_free_error_field_shift_2026-05-27` defect (see below) but
surfaced at the instance-method-body codegen site rather than the
cross-module static-method return path. Pinned `@ignore`'d in
`core-tests/mem/mod/unit_test.vr §1-§2`.

##### §2. Umbrella-mount dispatch collision: `has_capability`

When `has_capability` is mounted via the umbrella
(`mount core.mem.{has_capability}` routing through `mod.vr`'s
`public mount .capability.{has_capability}` re-export), a 2-arg call
`has_capability(flags, cap)` is dispatched to the SAME-NAME 2-arg
method `AllocationHeader.has_capability(&self, cap)` defined at
`core/mem/header.vr:636`.

```text
let flags: UInt16 = CAP_OWNED;
assert(has_capability(flags, CAP_READ));
// Runtime: NullPointerAt { op: "opcode 0x78",
//                          site: "AllocationHeader.load_capabilities",
//                          pc: 0 }
```

The first UInt16 argument (CAP_OWNED) is re-interpreted as a
`&AllocationHeader` pointer (= null), faulting on the first
`self.load_capabilities()` call.

**Direct submodule mount works**: `mount core.mem.capability.{has_capability}`
resolves to the free function correctly (29 GREEN tests in
`core-tests/mem/capability/`). The defect is specific to
umbrella-mount dispatch, not bare-name dispatch.

**Fundamental fix surface**:
1. The dispatcher's bare-name lookup must distinguish free-fn-arity-N
   from impl-block-method-arity-(N-1)-plus-receiver dispatch.
2. Or — umbrella-re-exported free fns must carry their canonical
   source-module identity in their function-id key.

Pinned `@ignore`'d in `core-tests/mem/mod/unit_test.vr §8` +
`regression_test.vr §H`.

### Round-14 expansion (2026-05-27) — +26 new integration tests

The latest expansion landed 26 new integration tests across 4 mem
submodules under `--interp`:

| Submodule | New tests | Sections covered |
|---|---:|---|
| `capability` | +9 | §7 composition with `GEN_*` lifecycle; §8 capability lattice ordering (top/bottom/idempotence/associativity); §9 `has_capability` bit-mask invariants (monotone-under-or, zero-mask, has_all_capabilities-universal-self) |
| `size_class` | +6 | §9 `aligned_size` semantic (passthrough for align ≤ `MAX_ALIGN_SIZE`, overhead for oversized); §10 round-trip law `size_to_bin · bin_to_size` + monotone-over-doubling; §11 blocks-per-page lower bound |
| `header` | +6 | §6 9-flag power-of-two layout + 6 pairwise-distinctness; §7 `GEN_UNALLOCATED < GEN_INITIAL < GEN_MAX < UInt32.MAX` chained inequality + headroom > 2^31; §8 compound flag operations (OR/XOR) |
| `heap` | +5 | §4 HeapStats zero-state invariants (8-field baseline + live-count + bytes-outstanding + page-and-cache activity); §5 DIRECT_LOOKUP_SIZE + PAGE_HEADER_SIZE drift pins |

All 26 tests pass under `--interp` (~28-30s each).  Test budget for
full round-14 sweep: ~13 minutes wall-clock.

### Known open defect — cross-module record-return field-access shift

The `UseAfterFreeError.new(...)` (5-arg static constructor) returns a
record whose field reads at the test site shift by +2 indices.  The
constructor body writes fields at correct offsets; the test-side
field READS land on wrong slots because `compile_field_access` falls
through `resolve_field_index`'s type-aware lookups and lands on the
global `intern_field_name(field_name)` fallback.

**Affected sites**: every cross-module `Type.new(...)` (5+ args) call
where the test expects to read distinct field values back.  Workaround
pinned in `core-tests/mem/thin_ref/unit_test.vr §5`: construct via
direct record literal at the test site, NOT via the cross-module
`.new(...)` constructor.

**Attempted fix**: a defensive `self.types`-by-name fallback in
`resolve_field_index` (commit `ab8e707f4`) regressed 3 previously-GREEN
record-literal tests; reverted in commit `585728904`.  The correct
fundamental fix must preserve the 4-way cache consistency
`(type_name_to_id, self.types, type_field_layouts,
type_field_type_names)` holistically — likely at the archive-load
path (`import_archive_type_with_protocol_remap` in
`crates/verum_vbc/src/codegen/mod.rs:15771-15820`) rather than at
downstream consumers.

Pinned by memory entry `use_after_free_error_field_shift_2026-05-27.md`,
audit `core-tests/mem/thin_ref/audit.md §6-§7`, and the corresponding
`@ignore` pins in `unit_test.vr §6` (3 tests in thin_ref + 1 in
diagnostics).  Same defect class as
`[[btree_pattern_match_ref_generic_class]]` and
`[[enactment_field_access_oob_2026-05-24]]`.

### Cross-tier validation status

The `Tier` column reflects validated status under `verum test --interp`
(Tier 0 VBC interpreter) as of the latest mem-suite sweep.  Tier 2
(`verum test --aot`, LLVM AOT) verification of the full suite was, until
2026-06-01, blocked at the **runner level**: `verum test --aot` runs
with `[test].parallel = true` by default, and the runner contained two
independent parallelism bugs that crashed the *whole* run with an
in-process compiler `SIGSEGV` during `generate_native` (see
[defect-class catalogue §23 — AOT-PARALLEL-1](/docs/stdlib/defect-class-catalogue)):

1. **Colliding artifact paths.**  Per-test build artifacts (the merged
   `target/test/test_<stem>.merged.vr`, the output binary, the derived
   `.o`/`.ll`, and the shared `verum_runtime_stubs.c`/`.o`) were keyed on
   the test file's `file_stem`, which repeats across every module (all
   `unit_test.vr` → stem `"unit_test"`).  Parallel workers clobbered each
   other's files → corrupt source → malformed IR → SIGSEGV.  Fixed by
   `unique_merged_stem` (folds the source path + test fn into every
   artifact name).
2. **LLVM backend not thread-safe.**  Even with unique artifacts, LLVM's
   per-process pass registry / subtarget caches / `cl::opt` globals are
   not safe to drive from multiple threads at once.  Fixed by a
   process-global `llvm_backend_lock()` around the optimisation + object
   emission window.

(The earlier "WinSock `recv` arity" hypothesis was disproved — a single
`--aot` test compiles and passes; the blocker was the *parallel* runner,
not a stdlib symbol.)  With both fixed, `verum test --aot` completes.

**First post-fix `--aot` baseline** (mem `capability` + `cap_audit` +
`cap_audit_ring`, 173 tests, 0 compiler SIGSEGV): **125 pass / 48 fail**.
Every failure is the same per-test defect — **AOT-ITER-1** (catalogue
§18): tests whose bodies iterate `for x in …iter()` (the exhaustive
property laws and integration scenarios) crash at *runtime*
("process terminated by signal") on the raw `&unsafe T` iterator
backing-pointer deref. Pure-data tests (constants, ADT construct/match,
field round-trips) pass `--aot` cleanly. So the `Tier` column stays
`--interp` per-module until AOT-ITER-1 §18 closes — that single codegen
fix un-crashes the for-loop tests suite-wide and lets the mem modules
promote to `--interp ✓ / --aot ✓`. (Record-variant construction,
catalogue §-pending, is a smaller secondary surface.)

## File-by-file API surface

| File | What's in it |
|---|---|
| `allocator.vr` | `Allocator` protocol, `cbgr_alloc`/`cbgr_dealloc`/`cbgr_realloc`, `Layout`, `AllocError` |
| `header.vr` | `AllocationHeader` (32-byte CBGR metadata), `MemValidationError` / `ValidationError` alias, FLAG_* bits |
| `thin_ref.vr` | `ThinRef<T>` (16 bytes) |
| `fat_ref.vr` | `FatRef<T>` (32 bytes) |
| `hazard.vr` | `HazardGuard<T>` — concurrent-safe deref protection |
| `epoch.vr` | `EpochManager` — generation wraparound safety |
| `capability.vr` | `Capability` bits — read/write/execute/delegate/revoke/borrowed/mutable/no-escape; `pack_epoch_caps` / `unpack_*` |
| `arena.vr` | `GenerationalArena<T>` — O(1) mass invalidation |
| `segment.vr` | `Segment` — 32 MiB virtual regions, mimalloc-style |
| `size_class.vr` | 73-bin size class table (Mimalloc-style); `size_to_bin` / `bin_to_size` / `aligned_size` |
| `heap.vr` | `LocalHeap` — thread-local allocation |
| `diagnostics.vr` | Read-only `MemHeaderView` observer surface; `live_allocations` |
| `cap_audit.vr` | `CapEvent` capability-transition event type |
| `cap_audit_ring.vr` | Lock-free SPMC ring buffer for `CapEvent`; `record_revoke` / `record_attenuate` / `record_ref_*` / `record_gen_bump` |
| `mem_raw.vr` (re-exported via `core.intrinsics.runtime.mem_raw.*`) | `memcpy`, `memmove`, `memset`, `memcmp`, `strlen`, `strcmp` |

---

## References — three tiers

### `ThinRef<T>` — 16 bytes

```verum
type ThinRef<T> is {
    ptr: *unsafe T,
    generation: UInt32,
    epoch_caps: UInt32,       // high 16 bits: epoch; low 16: capability flags
};
```

Used for `&T` when `T: Sized`. The `generation` and `epoch_caps` are
fixed at reference creation; the CBGR check compares them against the
allocation's `AllocationHeader` on every deref.

### `FatRef<T>` — 32 bytes

```verum
type FatRef<T> is {
    ptr: *unsafe T,
    generation: UInt32,
    epoch_caps: UInt32,       // epoch in high 16 bits, capabilities in low 16
    metadata: UInt64,         // slice length, dyn-protocol vtable pointer, etc.
    offset:   UInt32,         // non-zero for interior references
    reserved: UInt32,         // padding + room for future fields
};
```

Used when `T` is unsized — slices (`[T]`) and trait objects (`dyn P`) —
and for interior references that need an offset into a larger allocation.

### `AllocationHeader` — 32 bytes, cache-aligned

```verum
type AllocationHeader is {
    generation: UInt32,       // incremented on free
    epoch:      UInt32,       // wraparound-safety
    flags:      UInt32,       // drop impl, pinned, capabilities
    layout_size: UInt32,      // for realloc / sanity
    _padding:   UInt64,       // align to 32 bytes
    layout:     Layout,       // size, align
};
```

Prepended to every CBGR-tracked allocation. The header lives in the
same cache line as (or adjacent to) the object, so the CBGR check is
typically a hot L1 hit.

### CBGR check sequence (conceptual)

```verum
fn deref<T>(r: ThinRef<T>) -> &T {
    let hdr = header_of(r.ptr);
    if hdr.generation != r.generation {
        handle_use_after_free(&r, &hdr);
    }
    if (r.epoch_caps >> 16) != hdr.epoch {
        handle_epoch_mismatch(&r, &hdr);
    }
    unsafe { &*r.ptr }
}
```

Measured: **~0.93 ns** on the `production_targets` bench
(x86_64 release build), well under the ≤ 15 ns design target.

---

## `Heap<T>` — unique owned allocation

```verum
Heap.new(value) -> Heap<T>                      // panics on OOM
Heap.new_default() -> Heap<T>                   // T: Default
Heap.new_zeroed() -> Heap<T>
Heap.try_new(value) -> Result<Heap<T>, AllocError>
Heap.from_raw(ptr) -> Heap<T>                   // unsafe
```

### Introspection

```verum
h.as_ref() -> &T                   h.as_mut() -> &mut T
h.into_inner() -> T                h.into_raw() -> &unsafe T   (leaks)
h.leak() -> &mut T                 // leaks; returns static-lifetime mut ref
h.generation() -> UInt32
h.epoch() -> UInt16
h.capabilities() -> UInt16
h.is_valid() -> Bool
h.is_allocated() / h.is_freed() -> Bool
h.header_generation() / h.header_epoch() / h.header_size()
```

### Implements

`Deref`, `DerefMut`, `Drop`, `Clone` (deep-copy if `T: Clone`),
`Debug`, `Eq`, `Ord`, `Hash`, `Default` (if `T: Default`).

---

## `Shared<T>` — atomically ref-counted

```verum
Shared.new(value) -> Shared<T>
s.clone() -> Shared<T>              // bumps refcount
s.weak() -> Weak<T>                 // does not bump strong count
Shared.strong_count(&s) -> Int
Shared.weak_count(&s) -> Int
Shared.try_unwrap(s) -> Result<T, Shared<T>>   // succeeds if strong_count == 1
Shared.get_mut(&mut s) -> Maybe<&mut T>         // Some if unique
```

`Weak<T>.upgrade() -> Maybe<Shared<T>>` — returns `Some` if the target
is still live. Used to break reference cycles.

---

## Allocator protocol

```verum
type Allocator is protocol {
    fn alloc(&self, layout: Layout) -> Result<*mut Byte, AllocError>;
    fn dealloc(&self, ptr: *mut Byte, layout: Layout);
    fn realloc(&self, ptr: *mut Byte, old: Layout, new: Layout)
        -> Result<*mut Byte, AllocError>;
}
```

### `Layout`

```verum
type Layout is {
    size_:  Int,   // bytes
    align_: Int,   // bytes (power of 2)
};

impl Layout {
    fn new<T>() -> Layout                                   // T.size, T.alignment
    fn from_size_align(size: Int, align: Int) -> Layout     // panics on bad input
    fn try_from_size_align(size: Int, align: Int)
        -> Result<Layout, AllocError>                        // fallible
    fn from_size(size: Int) -> Layout                       // natural alignment
    fn size(&self) -> Int
    fn align(&self) -> Int
    fn repeat(&self, n: Int) -> Layout                      // [T; N] layout
    fn try_repeat(&self, n: Int) -> Result<Layout, AllocError>
    fn extend(&self, other: Layout) -> Layout               // sequential layout
    fn try_extend(&self, other: Layout) -> Result<Layout, AllocError>
}
```

`from_size_align` panics on invalid alignment (non-positive or
non-power-of-2) or negative size — use `try_from_size_align` at any
trust boundary (FFI, deserialised input).

### `AllocError`

```verum
type AllocError is
    | OutOfMemory      { requested: Int }
    | InvalidSize      { size: Int }
    | InvalidAlignment { alignment: Int }
    | MmapFailed       { code: Int }
    | MunmapFailed     { code: Int }
    | PageExhausted
    | InvalidPointer
    | CapacityOverflow { requested: Int }
    | UnsupportedOs    { op: Text }
    ;

e.message() -> Text          // human-readable
```

Implements `Display` (routes via `.message()`), `Debug`, and `Eq`
(per-variant; payload-bearing variants compare payloads).

### Default allocator — `cbgr_alloc`

```verum
unsafe fn cbgr_alloc(layout: Layout) -> *mut Byte
unsafe fn cbgr_alloc_zeroed(layout: Layout) -> *mut Byte
unsafe fn cbgr_dealloc(ptr: *mut Byte, layout: Layout)
unsafe fn cbgr_realloc(ptr: *mut Byte, old: Layout, new: Layout) -> *mut Byte
```

### Context-scoped allocator

```verum
set_context_allocator(alloc: &dyn Allocator)
ctx_alloc(layout: Layout) -> Result<*mut Byte, AllocError>       using [Allocator]
ctx_dealloc(ptr, layout)                                          using [Allocator]
```

Using an arena or slab allocator for a task tree:

```verum
let arena = GenerationalArena.new(capacity: 1 << 20);
provide Allocator = arena in {
    build_parse_tree(source).await
};
// Dropping the scope drops all arena memory in O(1).
```

---

## Alignment

```verum
fn align_up(x: Int, align: Int) -> Int
fn align_down(x: Int, align: Int) -> Int
fn is_aligned(x: Int, align: Int) -> Bool
```

---

## Hazard pointers

```verum
type HazardGuard is { ... };
acquire_hazard(ptr: &unsafe Byte) -> HazardGuard
guard.release()                       // explicit drop also works
force_reclaim_all()                   // scan + reclaim retired nodes
cleanup_thread_hazards()              // called on thread exit
```

Used internally to keep reads safe against a concurrent `free`. A
reader installs its target in a hazard slot before the CBGR check; a
freer scans all hazard slots before returning memory to the pool.

### Observability — `HazardStats`

```verum
type HazardStats is {
    protected_count: Int,    // currently protected pointers across all threads
    retired_count:   Int,    // retired nodes awaiting reclamation
    thread_count:    Int,    // registered threads
};

hazard_stats() -> HazardStats

impl HazardStats {
    fn needs_reclaim(&self) -> Bool {
        self.retired_count >= RETIRED_THRESHOLD
    }
    fn estimated_retired_bytes(&self, avg_size: Int) -> Int {
        self.retired_count * avg_size
    }
}
```

### Constants

```verum
const HAZARD_POINTERS_PER_THREAD: Int = 8;      // per-thread slot count
const RETIRED_THRESHOLD:          Int = 64;     // amortises scan cost
const MAX_THREADS:                Int = 256;    // global cap
```

---

## Epoch manager

```verum
type EpochManager is { ... };

EpochManager.global() -> &EpochManager
mgr.current() -> UInt32
mgr.advance()                         // bump epoch (typically timer-driven)
mgr.register_thread()
mgr.retire(callback: fn())
```

Epochs are the safety net for 32-bit generation wraparound: each
thread carries an epoch that advances periodically (~1 kHz), and a
reference with a stale epoch fails the check even if the generation
field collided.

---

## Capabilities

```verum
type Capability is UInt16;           // bitflags

const CAP_READ:   UInt16 = 0x0001;
const CAP_WRITE:  UInt16 = 0x0002;
const CAP_ADMIN:  UInt16 = 0x0004;
const CAP_DELEGATE: UInt16 = 0x0008;
const CAP_REVOKE:   UInt16 = 0x0010;
// Application-defined: bits 5..15
```

Embedded in the low 16 bits of the `epoch_caps` field of references.
`Database with [Read]` compiles to a reference with only `CAP_READ`
set; attempts to call a write method hit a compile-time check against
the method's required capability set.

---

## `GenerationalArena<T>`

```verum
type GenerationalArena<T> is { ... };

GenerationalArena.new(capacity) -> GenerationalArena<T>
a.insert(value) -> ArenaHandle<T>
a.get(handle) -> Maybe<&T>
a.get_mut(handle) -> Maybe<&mut T>
a.remove(handle) -> Maybe<T>
a.clear()                     // O(1) mass invalidation via epoch bump
a.len() / a.is_empty() / a.capacity()
```

Arenas are the idiomatic choice for:
- AST trees (parser lifetimes)
- Game engine objects (frame-scoped)
- Request-scoped data (web-server tasks)

### Configuration — `ArenaConfig`

```verum
type ArenaConfig is {
    initial_capacity: Int,    // bytes
    max_capacity:     Int,    // bytes; 0 = no limit
    growth_factor:    Int,    // percentage; 200 = double on growth
};

ArenaConfig.default()               // 64 KiB / 256 MiB / 2×
ArenaConfig.fixed(capacity: Int)    // capacity / capacity / no-grow (100%)
ArenaConfig.custom(initial, max, growth)
```

### Errors — `ArenaError`

```verum
type ArenaError is
    | OutOfMemory       { requested: Int, available: Int }
    | ExceedsMaxCapacity { requested: Int, max: Int }
    | InvalidAlignment   { alignment: Int }
    | AlreadyDestroyed
    ;

e.message() -> Text                  // human-readable formatter
```

Implements `Display` (routes via `.message()`) and `Debug` (renders the
variant + payload braces).

### Constants

```verum
const DEFAULT_ARENA_CAPACITY: Int = 65_536;       // 64 KiB
const MAX_ARENA_CAPACITY:     Int = 268_435_456;  // 256 MiB
const DEFAULT_GROWTH_FACTOR:  Int = 200;          // 200% = double
const ARENA_ALIGNMENT:        Int = 8;            // 64-bit word
const ARENA_GEN_INITIAL:      Int = 1;            // matches CBGR GEN_INITIAL
```

---

## Segment allocator (internal)

```verum
// Partitioning constants
const SEGMENT_SIZE:           Int = 32 * 1024 * 1024;   // 32 MiB
const SLICE_SIZE:             Int = 64 * 1024;          // 64 KiB
const SLICES_PER_SEGMENT:     Int = 512;                // 32 MiB ÷ 64 KiB
const SEGMENT_ALIGN:          Int = SEGMENT_SIZE;
const SMALL_PAGE_SIZE:        Int = SLICE_SIZE;
const MEDIUM_PAGE_SIZE:       Int = 8 * SLICE_SIZE;     // 512 KiB
const LARGE_PAGE_THRESHOLD:   Int = MEDIUM_PAGE_SIZE;

// Slice state bytes
const SLICE_FREE:             UInt8 = 0;
const SLICE_USED:             UInt8 = 1;
const SLICE_SPAN_START:       UInt8 = 2;
const SLICE_SPAN_CONTINUE:    UInt8 = 3;

// Segment kinds
const SEGMENT_NORMAL:         UInt8 = 0;
const SEGMENT_HUGE:           UInt8 = 1;

type Segment is MemSegment;             // alias
type SegmentError is
    | MmapFailed   { code: Int }
    | MunmapFailed { code: Int }
    | OutOfMemory
    | UnsupportedOs { op: Text }
    ;

fn segment_alloc(thread_id: UInt64) -> Result<&mut MemSegment, SegmentError>
fn segment_free(seg: &mut MemSegment)
fn segment_abandon(seg: &mut MemSegment)
fn ptr_to_segment(ptr: &unsafe Byte) -> &MemSegment
```

Allocations are grouped into 73 size classes spaced at ~12.5%
intervals (see `size_class.vr`). Small objects come from thread-local
segments via `segment_alloc`; medium / large allocations are bookkept
separately.

---

## `LocalHeap`

```verum
type LocalHeap is { ... };

// Lifecycle
init_thread_heap() -> Result<(), HeapError>
shutdown_thread_heap()
get_heap() -> &mut LocalHeap        // lazy-init on first call

// Allocation (Tier-0: through CBGR `cbgr_alloc` rather than directly)
heap_alloc(size: Int) -> Result<(&unsafe Byte, UInt32, UInt16), HeapError>
heap_alloc_zeroed(size: Int) -> Result<(&unsafe Byte, UInt32, UInt16), HeapError>
heap_free(ptr: &unsafe Byte) -> Result<(), HeapError>
heap_free_validated(ptr: &unsafe Byte, gen: UInt32, caps: UInt16)
    -> Result<(), HeapError>

// Observability
get_heap_stats() -> HeapStats
```

`heap_alloc` returns `(ptr, generation, capabilities)` — the generation
is the CBGR `header.generation` at allocation time, and the capabilities
are the bitflags the allocator deemed safe for the slot.  Callers
typically don't invoke this directly: the public `Heap<T>` /
`Shared<T>` constructors are the user-facing API.

### `HeapStats`

```verum
type HeapStats is {
    alloc_count:     UInt64,
    dealloc_count:   UInt64,
    bytes_allocated: UInt64,
    bytes_freed:     UInt64,
    live_count:      UInt64,
    live_bytes:      UInt64,
    pages_in_use:    UInt32,
    segments_owned:  UInt32,
};

HeapStats.new() -> HeapStats   // every field zero — bootstrap initialiser
```

### Errors — `HeapError`

```verum
type HeapError is
    | OutOfMemory
    | PageExhausted
    | InvalidPointer
    | InvalidSize        { size: Int }
    | InvalidAlignment   { alignment: Int }
    | SegmentError       { inner: SegmentError }    // From<SegmentError>
    | UseAfterFree
    ;

e.message() -> Text                                  // human-readable
HeapError.from(seg_err: SegmentError) -> HeapError   // From impl
```

Implements `Display` (routes via `.message()`), `Debug`, and `Eq`
(per-variant; payload-bearing variants compare payloads).

### Constants

```verum
const DIRECT_LOOKUP_SIZE:        Int    = 129;   // wsize 0..128 (lock-free fast path)
const PAGE_HEADER_SIZE:          Int    = 128;   // cache-line aligned

const PAGE_FLAG_IN_FULL_QUEUE:   UInt16 = 0x0001;
const PAGE_FLAG_HAS_ALIGNED:     UInt16 = 0x0002;
const PAGE_FLAG_ZERO_INIT:       UInt16 = 0x0004;
```

Thread-local heap. Lock-free fast path; spills into the global heap
for cross-thread frees.

---

## CBGR error types

The reference-validation surface returns two error sum types:

### `UseAfterFreeError` — 5-field record

```verum
type UseAfterFreeError is {
    expected_gen:   UInt32,
    actual_gen:     UInt32,
    expected_epoch: UInt16,
    actual_epoch:   UInt16,
    type_name:      Text,
};

impl UseAfterFreeError {
    fn new(eg: UInt32, ag: UInt32, ee: UInt16, ae: UInt16,
           tn: Text) -> UseAfterFreeError
    fn null_pointer(type_name: Text) -> UseAfterFreeError
        // sets both gens to GEN_UNALLOCATED — `.message()` routes
        // through the "null pointer" branch.
    fn capability_violation(capability: Text, type_name: Text)
        -> UseAfterFreeError
    fn message(&self) -> Text   // null-pointer / use-after-free branches
}
```

Implements `Display` (routes via `.message()`), `Debug`, and `Eq`
(field-by-field compare).

### `RevocationError` — 4-variant sum

```verum
type RevocationError is
    | NullPointer          { type_name: Text }
    | CapabilityViolation  { type_name: Text }
    | AlreadyRevoked       { type_name: Text }
    | Internal             { type_name: Text, reason: Text }
    ;

impl RevocationError {
    fn null_pointer(type_name: Text) -> RevocationError
    fn capability_violation(type_name: Text) -> RevocationError
    fn already_revoked(type_name: Text) -> RevocationError
    fn internal_error(type_name: Text, reason: Text) -> RevocationError
}
```

---

## Capability audit ring

The CBGR system records every capability-state transition as a
`CapEvent` and commits it into a lock-free single-producer / multi-
consumer ring (`cap_audit_ring.vr`).  Observers — panic post-mortem
handlers, runtime monitors, future debugger UIs — read recent events
via `recent(n)`.

### `CapEventKind` — 6-variant tag

```verum
type CapEventKind is
    | Revoke         // capability revoked (e.g., write→read)
    | Attenuate      // capability narrowed (subset retained)
    | RefIncr        // reference count increment
    | RefDecr        // reference count decrement
    | GenBump        // generation field bumped (free path)
    | EpochAdvance   // wraparound-safety epoch bump
    ;
```

### `CapEvent` — 8-field record

```verum
type CapEvent is {
    seq:                UInt64,     // ring-assigned commit sequence; 0 = un-committed
    kind:               CapEventKind,
    target_ptr:         UInt64,     // address of the affected allocation
    generation_before:  UInt32,
    generation_after:   UInt32,
    capabilities_before: UInt16,
    capabilities_after:  UInt16,
    epoch_at_event:     UInt32,
};

CapEvent.new(kind, target_ptr, gen_before, gen_after, caps_before,
             caps_after, epoch) -> CapEvent      // returns seq=0
event.bumped_generation() -> Bool                // true for Revoke + GenBump
```

`bumped_generation()` is **kind-driven**, not diff-driven: it returns
`true` iff the kind is `Revoke` or `GenBump`, regardless of whether
the before/after generation values happen to differ.  This intent-based
semantics matches the doc-comment contract and pinned in the audit
suite.

### Ring API

```verum
const CAP_AUDIT_RING_CAPACITY: Int = 256;       // power of 2 for efficient mod

is_enabled() -> Bool
enable()                                         // idempotent
disable()
count() -> UInt64                                // total commits since enable
recent(n: Int) -> List<CapEvent>                 // bounded by min(n, ring fill)

record_revoke(target_ptr: UInt64, gen_before, gen_after, caps_before, caps_after, epoch)
record_attenuate(target_ptr, gen_before, gen_after, caps_before, caps_after, epoch)
record_ref_incr(target_ptr, ..., epoch)
record_ref_decr(target_ptr, ..., epoch)
record_gen_bump(target_ptr, ..., epoch)
record_epoch_advance(target_ptr, ..., epoch)
```

When the ring is disabled, every `record_*` writer is a short-circuit
no-op — `count()` does not advance, no allocation, no atomic.  This
keeps audit-disabled production builds zero-overhead.

---

## Read-only diagnostics

`core.mem.diagnostics` is the introspection surface — no mutating
operations.  Used by panic post-mortem handlers, runtime monitors,
and future debugger integrations.

### `MemHeaderView` — snapshot of an allocation header

```verum
type MemHeaderView is {
    generation: UInt32,
    epoch:      UInt32,
    caps:       UInt16,
    size:       UInt32,
    align:      UInt32,
    type_id:    UInt32,
    flags:      UInt32,
    ref_count:  UInt32,
};

MemHeaderView.from_header(h: &AllocationHeader) -> MemHeaderView
```

### `CallFrame` — stack-trace entry

```verum
type CallFrame is {
    function:            Text,
    file:                Text,
    line:                UInt32,
    column:              UInt32,
    instruction_pointer: UInt64,
};
```

### Functions

```verum
live_allocations() -> List<MemHeaderView>
live_allocation_count() -> UInt64
current_call_stack(skip: UInt32) -> List<CallFrame>
```

The producer-side wiring (writing `MemHeaderView` snapshots from the
allocator on each cbgr_alloc, populating the call-stack from VBC
debug info) is owned by the CBGR allocator and the interpreter
debugger — those are tested separately.

---

## Raw memory operations

```verum
unsafe fn memcpy(dst: *mut Byte, src: *const Byte, n: Int)
unsafe fn memmove(dst: *mut Byte, src: *const Byte, n: Int)   // overlap-safe
unsafe fn memset(dst: *mut Byte, byte: Byte, n: Int)
unsafe fn memcmp(a: *const Byte, b: *const Byte, n: Int) -> Int
unsafe fn strlen(ptr: *const Byte) -> Int                      // NUL-terminated
unsafe fn strcmp(a: *const Byte, b: *const Byte) -> Int
```

These bypass CBGR. Use only in allocator implementations, FFI
boundaries, or when you can prove safety by other means.

---

## Constants

```verum
const GEN_INITIAL:     UInt32 = 1;
const GEN_MAX:         UInt32 = 0xFFFF_FFFE;
const GEN_UNALLOCATED: UInt32 = 0;

const EPOCH_INITIAL:   UInt32 = 1;
const EPOCH_INTERVAL_MS: Int = 1;             // advance 1000×/s

const SSO_CAPACITY:    Int = 23;              // Text inline capacity
const PAGE_SIZE:       Int = 4096;            // architecture-dependent
```

---

## Errors

```verum
type UseAfterFreeError is {
    ptr: *unsafe Byte,
    gen_expected: UInt32,
    gen_actual:   UInt32,
    epoch_expected: UInt32,
    epoch_actual:   UInt32,
};

type RevocationError is { ptr: *unsafe Byte, revoker: Text };
type AllocError      is OutOfMemory | InvalidLayout | Refused;
```

On a CBGR violation, the runtime:
1. Constructs a `UseAfterFreeError` with full diagnostic context.
2. Invokes the installed panic handler (default: abort with stack
   trace).

---

## CBGR execution tiers

```verum
type ExecutionMode is Interpreter | Aot;

fn current_mode() -> ExecutionMode
fn is_interpreted() -> Bool
```

Execution mode affects how the CBGR check is produced, not whether
it runs:

- **Interpreter**: software check every deref, via the VBC
  `Deref` / `DerefMut` opcodes — the safe-by-default path, because
  the interpreter validates every reference regardless of the
  reference's static CBGR tier.
- **AOT**: each CBGR tier lowers to a distinct code sequence in
  LLVM IR. Tier-0 references emit the load-compare-branch pattern;
  tier-1 references proven safe by escape analysis are elided to a
  direct load (0 ns); tier-2 `&unsafe T` references compile to a
  direct load with no check.

There is no JIT tier in between; a Verum program runs either in
the interpreter or as AOT-compiled native code.

---

## Cross-references

- **[Language → memory model](/docs/language/memory-model)** — the user-level story.
- **[Language → references](/docs/language/references)** — `&T` / `&checked T` / `&unsafe T`.
- **[Language → CBGR](/docs/language/cbgr)** — conceptual model.
- **[Architecture → CBGR internals](/docs/architecture/cbgr-internals)** — data structures + algorithms.
- **[intrinsics](/docs/stdlib/intrinsics)** — `ptr_read`, `ptr_write`, `volatile_load/store`.
- **[sys](/docs/stdlib/sys)** — OS-level `os_alloc` / `os_free` under the segment allocator.
