---
sidebar_position: 4
title: mem
description: Capability-Based Generational References — Heap, Shared, allocator, raw ops.
status: partial
---

import ModuleStatus, {
  LifecycleBadge,
  TierBadge,
  TestCovBadge,
} from '@site/src/components/StdlibBadge';
import StdlibStatus from '@site/src/components/StdlibStatus';

# `core.mem` — Memory management

<StdlibStatus status="partial" />

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
| `hazard.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/hazard/` — **green under the interpreter** (the whole module used to SIGSEGV): live `hazard_stats()` / `force_reclaim_all()` / `cleanup_thread_hazards()` all pass after TYPE-NAME-INFERENCE-1 + PROTOCOL-ITER-1 + CALLSYNC-R0-CLOBBER-1 (audit §8) |
| `epoch.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/epoch/` — `core-tests/mem/epoch/` — the read and write surface is covered. Epoch advance goes through the same scalar cell and atomic operations that `current_epoch` and the reset helper use, so a test-driven advance and a real one cannot diverge. |
| `allocator.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/allocator/` — static-shape + live cbgr_alloc round-trip via public `Heap<T>` / `Shared<T>` (audit §A closed); §B realloc-cross-boundary + §C ctx-allocator + §D protocol-impls + §E AllocStats + §F AOT sweep open |
| `arena.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="partial" /> | <TestCovBadge cov="full" /> | `core-tests/mem/arena/` — `core-tests/mem/arena/` — the constants, the `ArenaConfig` constructors (`default`, `fixed`, `custom`), a disjointness sweep over the four `ArenaError` variants and the message payload of each are all covered, as is the live allocation lifecycle. |
| `segment.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/segment/` — Mimalloc-style 32 MiB chunks |
| `heap.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/heap/` — thread-local fast path; live heap_alloc lifted via public `Heap.new` (audit §B closed); HeapError 7-variant + HeapStats 8-field surface exhausted + From&lt;SegmentError&gt; lift covered (audit §D closed) |
| `diagnostics.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/diagnostics/` — read-only observer surface |
| `cap_audit.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/cap_audit/` — capability transition events |
| `cap_audit_ring.vr` | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/cap_audit_ring/` — lock-free SPMC ring |
| `mem_raw.vr` (in `core.intrinsics.runtime`) | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="both" /> | <TestCovBadge cov="full" /> | `memcpy_addr`/`memmove_addr`/`memset_addr`/`memcmp_addr`/`strlen`/`strcmp` — see `core-tests/intrinsics/` |
| `mod.vr` (module root) | <LifecycleBadge lifecycle="theorem" version="v0.1" /> | <TierBadge tier="interp" /> | <TestCovBadge cov="full" /> | `core-tests/mem/mod/` — 4 files + audit. Module-root surface: `UseAfterFreeError` (5-field record + 3 ctors + message + Debug + Display + Eq) + `RevocationError` (4-variant sum + 4 ctors + message + Debug + Display + Eq) + `CbgrTier` (4-variant sum) + `get/set_execution_tier` global accessor. Unit, property, integration and regression suites cover module-root types + the umbrella re-export contract (every submodule symbol resolves via `mount core.mem.{Name}`). **All pins closed** — the §3.1 field-shift trio un-gated in earlier waves and the §3.4 umbrella `has_capability` collision un-@ignore'd 2026-07-05 (public-mount re-export traversal resolves the binding authoritatively): **87/87/0**. |

The dedicated-suite-pending modules are tracked in
`core-tests/INVENTORY.md`; new modules graduate to <TierBadge tier="both" />
once all four test files land **and** the audit deferrals all close on both
tiers.

### What was measured, and what this page no longer claims

This section carried two limitations until 2026-09-04. Both were
inherited from an older status table rather than measured, and one of
them is false:

**"Compiled ahead of time, a `for` loop over an iterator crashes at run
time."** It does not.

```verum
let mut s: Int = 0;
for x in xs.iter() { s = s + *x; }
```

`verum build` produces a binary; running it prints the same answer the
interpreter gives. Checked both ways on the same program.

The other — that a cross-module static constructor of five or more
arguments returns a record whose fields read back shifted — is removed
rather than restated. It may still be true; nobody has shown it on this
tree, and a limitation a reader cannot reproduce is worse than no
limitation at all, because it steers them away from a working API.

The reference tiers, `Heap<T>`, the arena and epoch surfaces below are
covered by conformance suites under the interpreter. That is a
statement about what is TESTED, which is the strongest thing this page
can say without measuring each claim.

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
| `mem_raw.vr` (in `core.intrinsics.runtime`, not `core.mem`) | `memcpy_addr`, `memmove_addr`, `memset_addr`, `memcmp_addr`, `strlen`, `strcmp` — all address-taking |

---

## References — three tiers

### `ThinRef<T>` — 16 bytes

```verum
@repr(C, size(16), align(8))
public type ThinRef<T> is {
    ptr: &unsafe T,
    generation: UInt32,
    epoch_and_caps: UInt32,   // bits 0-15: epoch; bits 16-31: capability flags
};
```

Used for `&T` when `T: Sized`. The `generation` and `epoch_and_caps` are
fixed at reference creation; the CBGR check compares them against the
allocation's `AllocationHeader` on every deref.

The packed halves are **epoch low, capabilities high** — `pack_epoch_caps`
(`capability.vr`) is `((caps as UInt32) << 16) | (epoch as UInt32)`. Read
them with `unpack_epoch` / `unpack_caps`, or with the `.epoch()` /
`.capabilities()` accessors on the reference, rather than shifting by hand.

### `FatRef<T>` — 32 bytes

```verum
@repr(C, size(32), align(8))
public type FatRef<T> is {
    ptr: &unsafe Byte,        // erased to Byte; the element type stays in `T`
    generation: UInt32,
    epoch_and_caps: UInt32,   // bits 0-15: epoch; bits 16-31: capabilities
    metadata: Int,            // slice length, dyn-protocol vtable pointer, etc.
    offset_from_base: UInt32, // non-zero for interior references
    reserved: UInt32,         // padding + room for future fields
};
```

Used when `T` is unsized — slices (`[T]`) and protocol objects (`dyn P`) —
and for interior references that need an offset into a larger allocation.

### `AllocationHeader` — 32 bytes, cache-aligned

```verum
@repr(C, align(32))
public type AllocationHeader is {
    size:           UInt32,   // offset  0 — payload bytes, header excluded
    alignment:      UInt16,   // offset  4 — requested align (validated <= 4096)
    base_offset:    UInt16,   // offset  6 — header address - malloc base
    generation:     UInt32,   // offset  8 — atomic; bumped on free (HOT)
    epoch_and_caps: UInt32,   // offset 12 — atomic; epoch low, caps high
    type_id:        UInt32,   // offset 16
    flags:          UInt32,   // offset 20
    ref_count:      UInt32,   // offset 24 — atomic; an allocation starts at 1
    total:          UInt32,   // offset 28 — front slack + header + payload
};
```

Exactly 32 bytes, 32-byte aligned, and the field order IS the byte order —
`ALLOCATION_HEADER_EPOCH_OFFSET` (12) and `_CAPABILITIES_OFFSET` (14) index
into `epoch_and_caps` directly on a little-endian target.

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
    if unpack_epoch(r.epoch_and_caps) != unpack_epoch(hdr.epoch_and_caps) {
        handle_epoch_mismatch(&r, &hdr);
    }
    unsafe { &*r.ptr }
}
```

Measured: **1.2–1.7 ns** on the `production_targets` bench
(x86_64 release build), well under the ≤ 15 ns design target.

---

## `Heap<T>` — unique owned allocation

`Heap<T>` and `Shared<T>` are declared in `core.base.memory`, not in
`core.mem` — mount them from `core.base` (`mount core.base.{Heap, Shared};`).
They are documented here because their layout is the CBGR triple
(`ptr`, `generation`, `epoch`) and every operation on them goes through
`core.mem`'s allocator.

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
h.current_epoch() -> UInt16        // the header's epoch, not the reference's
```

### Implements

`Deref`, `DerefMut`, `Drop`, `Clone` (deep-copy if `T: Clone`),
`Debug`, `Display` (both if `T` is), `Eq`, `Ord`, `Hash`,
`Default` (if `T: Default`).

---

## `Shared<T>` — atomically ref-counted

The counts and the unwrap are **methods on the value**, not associated
functions taking a reference — there is no `Shared.strong_count(&s)`.

```verum
Shared.new(value) -> Shared<T>
Shared.try_new(value) -> Result<Shared<T>, AllocError>
Shared.new_default() -> Shared<T>               // T: Default

s.clone() -> Shared<T>              // bumps refcount
s.downgrade() -> Weak<T>            // does not bump the strong count
s.strong_count() -> Int
s.weak_count() -> Int
s.is_unique() -> Bool               // strong == 1; says NOTHING about weak
s.get_mut() -> Maybe<&mut T>        // Some when strong == 1 AND weak == 0
s.make_unique() -> &mut T           // clone-on-write; T: Clone
s.try_unwrap() -> Result<T, Shared<T>>          // Ok when unique
s.ptr_eq(&other) -> Bool            // same allocation, not same value
s.borrow() -> &T                    s.borrow_mut() -> &mut T
s.generation() -> UInt32            s.epoch() -> UInt16
```

The two conditions are not the same one: after a single `downgrade()`,
`is_unique()` is still `true` while `get_mut()` answers `None`. Measured
2026-09-09 — `weak=0->1` with `unique=true` in the same line.

`Weak<T>` carries the same triple and does not keep the value alive:

```verum
Weak.from(&shared) -> Weak<T>
w.upgrade() -> Maybe<Shared<T>>     // Some while the target is live
w.is_alive() -> Bool
w.strong_count() -> Int             w.weak_count() -> Int
```

---

## Allocator protocol

```verum
type Allocator is protocol {
    fn alloc(&self, size: Int, align: Int)
        -> Result<(&unsafe Byte, UInt32, UInt16), AllocError>;
    fn alloc_zeroed(&self, size: Int, align: Int)
        -> Result<(&unsafe Byte, UInt32, UInt16), AllocError>;
    fn dealloc(&self, ptr: &unsafe Byte) -> Result<(), AllocError>;
    fn realloc(&self, ptr: &unsafe Byte, old_size: Int, new_size: Int,
               align: Int)
        -> Result<(&unsafe Byte, UInt32, UInt16), AllocError>;
};
```

Two things about that signature are load-bearing:

* the protocol takes **`size` and `align` separately**, not a `Layout` —
  `Layout` is a helper type used by container code, not part of this
  protocol;
* `alloc` returns a **triple** `(ptr, generation, capabilities)`, not a
  bare pointer. Those are exactly the three fields a `ThinRef` needs, so
  a caller builds a reference from the allocator's own answer instead of
  reading the header back.

`GlobalAllocator` is the default implementation; it forwards to
`cbgr_alloc` and friends below.

### `Layout`

```verum
type Layout is {
    size_:  Int,   // bytes
    align_: Int,   // bytes (power of 2)
};

implement Layout {
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
fn cbgr_alloc(size: Int, align: Int)
    -> Result<(&unsafe Byte, UInt32, UInt16), AllocError>
fn cbgr_alloc_zeroed(size: Int, align: Int)
    -> Result<(&unsafe Byte, UInt32, UInt16), AllocError>
fn cbgr_dealloc(ptr: &unsafe Byte) -> Result<(), AllocError>
fn cbgr_realloc(ptr: &unsafe Byte, old_size: Int, new_size: Int, align: Int)
    -> Result<(&unsafe Byte, UInt32, UInt16), AllocError>
```

`cbgr_dealloc` takes only the pointer — the size it needs is in the
header it is about to invalidate, so there is no "free with the same
layout you allocated with" obligation to get wrong.

### Context-scoped allocator

```verum
get_allocator() -> &dyn Allocator          // context slot 1, else GlobalAllocator
set_context_allocator(allocator: &dyn Allocator)

ctx_alloc(size: Int, align: Int)
    -> Result<(&unsafe Byte, UInt32, UInt16), AllocError>
ctx_alloc_zeroed(size: Int, align: Int)
    -> Result<(&unsafe Byte, UInt32, UInt16), AllocError>
ctx_dealloc(ptr: &unsafe Byte) -> Result<(), AllocError>
ctx_realloc(ptr: &unsafe Byte, old_size: Int, new_size: Int, align: Int)
    -> Result<(&unsafe Byte, UInt32, UInt16), AllocError>
```

Each `ctx_*` is a one-line forward to `get_allocator()`, which reads
`CONTEXT_SLOT_ALLOCATOR` and falls back to `GlobalAllocator`.

Using a bump allocator for a task tree — `MemStackAllocator` is the
`Allocator` implementor for that shape (`GenerationalArena` is a handle
table, not an `Allocator`; the four implementors are `GlobalAllocator`,
`TieredAllocator`, `SimpleAllocator` and `MemStackAllocator`):

```verum
let mut arena = MemStackAllocator.init(1 << 20)?;
provide Allocator = arena in {
    build_parse_tree(source).await
};
arena.reset();      // O(1) — rewinds the bump offset for the next tree
```

---

## Alignment

```verum
fn align_up(value: Int, align: Int) -> Int      // core.mem.allocator
fn align_down(value: Int, align: Int) -> Int    // core.mem.allocator
fn aligned_size(size: Int, align: Int) -> Int   // core.mem.size_class
```

There is no `is_aligned(value, align)` — test it as
`align_down(value, align) == value`. The pointer-level predicates live in
`core.intrinsics.memory` (`ptr_is_aligned`, `ptr_is_aligned_to`).

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

fn hazard_stats() -> HazardStats;

implement HazardStats {
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

One global manager, reached through the `GLOBAL_EPOCH` static rather
than through a `global()` constructor:

```verum
static mut GLOBAL_EPOCH: EpochManager;

implement EpochManager {
    fn current_epoch(&self) -> UInt64;
    fn increment_epoch(&mut self) -> UInt64;
    fn wraparound_count(&self) -> Int;
    fn register_callback(&mut self, callback: EpochCallback) -> Int;
    fn unregister_callback(&mut self, id: Int) -> Bool;
    fn register_revocation_callback(&mut self, cb: RevocationCallback) -> Int;
    fn unregister_revocation_callback(&mut self, id: Int) -> Bool;
}

// Module-level wrappers over the same static — prefer these.
fn current_epoch() -> UInt64
fn wraparound_count() -> Int
fn register_epoch_callback(callback: EpochCallback) -> Int
fn unregister_epoch_callback(id: Int) -> Bool
fn register_revocation_callback(callback: RevocationCallback) -> Int
fn unregister_revocation_callback(id: Int) -> Bool

type EpochCallback is fn(UInt64);
type RevocationCallback is fn(&unsafe Byte, UInt32, UInt32, UInt16);
```

Epochs are the safety net for 32-bit generation wraparound: a reference
with a stale epoch fails the check even if the generation field
collided. Two details a reader has to get right:

* the counter is **`UInt64`**, but only its low 16 bits reach a
  reference — that is the `EPOCH_MAX: UInt16 = 0xFFFF` half of
  `epoch_and_caps`;
* it advances when something calls `increment_epoch()`, not on a timer.
  `DEFAULT_SYNC_INTERVAL = 1000` is a count of **checks** between
  reloads in the per-thread `EpochCache`, not milliseconds.

```verum
type EpochCache is { cached_epoch: UInt64, checks_since_sync: Int,
                     sync_interval: Int };

fn get_thread_epoch_cache() -> &mut EpochCache;
fn cached_epoch() -> UInt64;
fn invalidate_epoch_cache();
```

---

## Capabilities

```verum
// The raw bitflags, one per capability.
const CAP_READ:      UInt16 = 1 << 0;
const CAP_WRITE:     UInt16 = 1 << 1;
const CAP_EXECUTE:   UInt16 = 1 << 2;
const CAP_DELEGATE:  UInt16 = 1 << 3;
const CAP_REVOKE:    UInt16 = 1 << 4;
const CAP_BORROWED:  UInt16 = 1 << 5;
const CAP_MUTABLE:   UInt16 = 1 << 6;
const CAP_NO_ESCAPE: UInt16 = 1 << 7;
const CAP_ALL:       UInt16 = 0x00FF;   // bits 8..15 are unassigned

// Named combinations, defined in terms of the bits above.
const CAP_READ_ONLY:     UInt16 = CAP_READ;
const CAP_READ_WRITE:    UInt16 = CAP_READ | CAP_WRITE;
const CAP_OWNED:         UInt16 = CAP_READ | CAP_WRITE | CAP_DELEGATE
                                | CAP_REVOKE | CAP_MUTABLE;
const CAP_BORROW_SHARED: UInt16 = CAP_READ | CAP_BORROWED;
const CAP_BORROW_MUT:    UInt16 = CAP_READ | CAP_WRITE | CAP_BORROWED
                                | CAP_MUTABLE;
const CAP_EXECUTABLE:    UInt16 = CAP_READ | CAP_EXECUTE;

// And the type-safe wrapper over the same eight bits.
type Capability is
    | Read | Write | Execute | Delegate
    | Revoke | Borrowed | Mutable | NoEscape
    ;

implement Capability {
    fn to_bit(&self) -> UInt16;
}
```

Embedded in the **high** 16 bits of the `epoch_and_caps` field of
references — `unpack_caps` is `(epoch_and_caps >> 16) as UInt16`.
`Database with [Read]` compiles to a reference with only `CAP_READ`
set; attempts to call a write method hit a compile-time check against
the method's required capability set.

---

## `GenerationalArena`

A **bump arena over bytes**, not a slotmap: it is not generic, it hands
back offsets rather than typed handles, and there is no `ArenaHandle`,
`insert`, `get` or `remove`. Nothing is freed individually — `reset()`
bumps one shared generation and invalidates every outstanding reference
into the arena at once.

```verum
type GenerationalArena is {
    buffer: Int, capacity: Int, used: Int,
    generation: Int, alloc_count: Int, reset_count: Int,
    config: ArenaConfig,
};

GenerationalArena.new(capacity: Int) -> GenerationalArena
GenerationalArena.with_config(config: ArenaConfig) -> GenerationalArena

a.alloc(size: Int) -> Int                        // address; 0 on failure
a.alloc_aligned(size: Int, alignment: Int) -> Int
a.reset()                     // O(1) mass invalidation via a generation bump
a.destroy()

a.generation() -> Int         a.used() -> Int        a.capacity() -> Int
a.remaining() -> Int          a.alloc_count() -> Int a.reset_count() -> Int
a.is_destroyed() -> Bool      a.contains_ptr(ptr: Int) -> Bool

// Save and roll back a bump position within one generation.
type ArenaSnapshot is { used: Int, alloc_count: Int, generation: Int };
a.snapshot() -> ArenaSnapshot
a.restore(snap: ArenaSnapshot) -> Bool     // false if reset() intervened
```

`restore` rolls the bump pointer back **without** bumping the
generation, so references into the rolled-back span become
address-invalid but stay generation-valid — the CBGR check passes and
reads bytes the arena has since re-handed out. `reset()` is the one that
makes a stale reference detectable. `GenerationalArena` also has no
`Drop` impl: the buffer goes back on an explicit `destroy()`, never by
going out of scope.

`GenerationalArena` does **not** implement `Allocator` — to make one the
ambient allocator for a scope, use `MemStackAllocator` (see
[the context-scoped allocator](#context-scoped-allocator)).

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
```

| constructor | initial / max / growth |
|---|---|
| `ArenaConfig.default()` | 64 KiB / 256 MiB / 2× |
| `ArenaConfig.fixed(capacity: Int)` | capacity / capacity / no-grow (100%) |
| `ArenaConfig.custom(initial, max, growth)` | |

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

fn segment_alloc(thread_id: UInt64) -> Result<&mut MemSegment, SegmentError>;
fn segment_free(seg: &mut MemSegment);
fn segment_abandon(seg: &mut MemSegment);
fn ptr_to_segment(ptr: &unsafe Byte) -> &MemSegment;
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
```

| | |
|---|---|
| `e.message() -> Text` | human-readable |
| `HeapError.from(seg_err: SegmentError) -> HeapError` | `From` impl |

Implements `Display` (routes via `.message()`), `Debug`, and `Eq`
(per-variant; payload-bearing variants compare payloads).

### Constants

```verum
const DIRECT_LOOKUP_SIZE:        Int    = 129;   // wsize 0..128 (lock-free fast path)
const PAGE_HEADER_SIZE:          Int    = 128;   // declared in size_class.vr,
                                                 // where blocks_per_page uses it

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

implement UseAfterFreeError {
    fn new(eg: UInt32, ag: UInt32, ee: UInt16, ae: UInt16,
           tn: Text) -> UseAfterFreeError;
    // `null_pointer` sets both gens to GEN_UNALLOCATED — `.message()`
    // routes through the "null pointer" branch.
    fn null_pointer(type_name: Text) -> UseAfterFreeError;
    fn capability_violation(capability: Text, type_name: Text)
        -> UseAfterFreeError;
    fn message(&self) -> Text;  // null-pointer / use-after-free branches
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

implement RevocationError {
    fn null_pointer(type_name: Text) -> RevocationError;
    fn capability_violation(type_name: Text) -> RevocationError;
    fn already_revoked(type_name: Text) -> RevocationError;
    fn internal_error(type_name: Text, reason: Text) -> RevocationError;
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
    kind:                CapEventKind,
    seq:                 UInt64,    // ring-assigned on commit; 0 = un-committed
    ptr_id:              UInt64,    // CBGR user-pointer address, as a stable id
    generation_before:   UInt32,
    generation_after:    UInt32,    // equal when the event does not bump it
    capabilities_before: UInt16,
    capabilities_after:  UInt16,    // equal when the event does not touch caps
    timestamp_ns:        UInt64,    // monotonic clock; 0 when unsupported
};
```

The last field is a **timestamp**, not an epoch — the ring records when a
transition happened, and the epoch is not part of the event.

| | |
|---|---|
| `CapEvent.new(kind, ptr_id, gen_before, gen_after, caps_before, caps_after, timestamp_ns) -> CapEvent` | returns seq=0 |
| `event.bumped_generation() -> Bool` | true for Revoke + GenBump |


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

// Each writer takes only the fields its own kind can change, and each
// returns the commit sequence (0 when the ring is disabled).
record_revoke(ptr_id: UInt64, gen_before: UInt32, gen_after: UInt32,
              caps: UInt16, timestamp_ns: UInt64) -> UInt64
record_attenuate(ptr_id: UInt64, generation: UInt32,
                 caps_before: UInt16, caps_after: UInt16,
                 timestamp_ns: UInt64) -> UInt64
record_ref_incr(ptr_id: UInt64, generation: UInt32, caps: UInt16,
                timestamp_ns: UInt64) -> UInt64
record_ref_decr(ptr_id: UInt64, generation: UInt32, caps: UInt16,
                timestamp_ns: UInt64) -> UInt64
record_gen_bump(ptr_id: UInt64, gen_before: UInt32, gen_after: UInt32,
                caps: UInt16, timestamp_ns: UInt64) -> UInt64
record_epoch_advance(epoch_before: UInt16, epoch_after: UInt16,
                     timestamp_ns: UInt64) -> UInt64   // global; ptr_id = 0

commit(event: CapEvent) -> UInt64                // the writers' shared tail
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
    generation:   UInt32,
    epoch:        UInt16,   // low 16 bits of the header's epoch_and_caps
    capabilities: UInt16,   // high 16 bits of the same word
    size:         UInt32,
    alignment:    UInt32,
    type_id:      UInt32,
    flags:        UInt32,
    ref_count:    UInt32,
};

MemHeaderView.from_header(header: &AllocationHeader) -> MemHeaderView
```

### `CallFrame` — stack-trace entry

```verum
type CallFrame is {
    function:            Text,   // empty when symbolication failed
    file:                Text,   // empty when the source map missed
    line:                Int,    // 1-indexed; 0 = unknown
    column:              Int,    // 1-indexed; 0 = unknown
    instruction_pointer: UInt64, // 0 is the "no frame" sentinel
};

implement CallFrame {
    fn from_ip(ip: UInt64) -> CallFrame;   // unsymbolicated frame
}
```

### Functions

```verum
live_allocations() -> List<MemHeaderView>
live_allocation_count() -> Int
current_call_stack(skip: Int) -> List<CallFrame>
```

The producer-side wiring (writing `MemHeaderView` snapshots from the
allocator on each cbgr_alloc, populating the call-stack from VBC
debug info) is owned by the CBGR allocator and the interpreter
debugger — those are tested separately.

---

## Raw memory operations

There are two families, and they are not interchangeable.

`core.intrinsics.memory` — reference-taking, lowered to the LLVM
intrinsic of the same name:

```verum
fn memcpy(dst: &mut Byte, src: &Byte, count: USize)
fn memmove(dst: &mut Byte, src: &Byte, count: USize)   // overlap-safe
fn memset(dst: &mut Byte, val: Byte, count: USize)
fn memcmp(a: &Byte, b: &Byte, count: USize) -> Int
```

`core.intrinsics.runtime.mem_raw` — **address**-taking, with an
interpreter fallback written in Verum, for code that holds a raw
address rather than a reference:

```verum
fn memcpy_addr(dst: Int, src: Int, n: Int) -> Int
fn memmove_addr(dst: Int, src: Int, n: Int) -> Int      // overlap-safe
fn memset_addr(dst: Int, value: Int, n: Int) -> Int
fn memcmp_addr(a: Int, b: Int, n: Int) -> Int
fn strlen(s: Int) -> Int                                // NUL-terminated
fn strcmp(a: Int, b: Int) -> Int
```

Both bypass CBGR. Use only in allocator implementations, FFI
boundaries, or when you can prove safety by other means.

---

## Constants

```verum
const GEN_INITIAL:     UInt32 = 1;
const GEN_MAX:         UInt32 = 0xFFFF_FFFE;
const GEN_UNALLOCATED: UInt32 = 0;

const EPOCH_MAX:       UInt16 = 0xFFFF;       // core.mem.epoch
const DEFAULT_SYNC_INTERVAL: Int = 1000;      // epoch-cache resync period

const SSO_CAPACITY:    Int = 23;              // core.text — inline capacity
const PAGE_SIZE:       Int = 65536;           // core.mem.allocator — 64 KiB,
                                              // i.e. 16 OS pages of 4 KiB
```

`PAGE_SIZE` here is the **allocator's** page, not the OS page; the 4096-byte
one is `core.sys.common.PAGE_SIZE` (a `USize`).

---

## Errors

The three error types are declared once each, above: `UseAfterFreeError`
and `RevocationError` under [CBGR error types](#cbgr-error-types),
`AllocError` under [the allocator protocol](#allocerror).

On a CBGR violation, the runtime:
1. Constructs a `UseAfterFreeError` with full diagnostic context.
2. Invokes the installed panic handler (default: abort with stack
   trace).

---

## CBGR execution tiers

`core.mem`'s own selector is `CbgrTier` — four variants, not two, and
there is no `ExecutionMode` or `current_mode()`:

```verum
type CbgrTier is
    | Interpreter    // full validation
    | BaselineJit
    | OptimizingJit
    | Aot            // minimal validation
    ;

fn get_execution_tier() -> CbgrTier;
fn set_execution_tier(tier: CbgrTier);
```

The runtime probes live in `core.intrinsics.runtime.tier`:

```verum
fn is_interpreted() -> Bool    // true only under the VBC interpreter
fn get_tier() -> UInt8         // 0 = VBC, 1 = JIT baseline,
                               // 2 = JIT optimized, 3 = AOT
```

Under AOT both are compile-time constants. The tier affects how the CBGR
check is produced, not whether it runs:

- **Interpreter**: software check every deref, via the VBC
  `Deref` / `DerefMut` opcodes — the safe-by-default path, because
  the interpreter validates every reference regardless of the
  reference's static CBGR tier.
- **AOT**: each CBGR tier lowers to a distinct code sequence in
  LLVM IR. Tier-0 references emit the load-compare-branch pattern;
  tier-1 references proven safe by escape analysis are elided to a
  direct load (0 ns); tier-2 `&unsafe T` references compile to a
  direct load with no check.

There is no JIT tier in between; a Verum program runs either in the
interpreter or as AOT-compiled native code. `CbgrTier.BaselineJit`,
`CbgrTier.OptimizingJit` and the `1` / `2` of `get_tier` are reserved
names that nothing selects or returns today — treat a non-zero tier as
"compiled", not as "JIT-compiled".

---

## Cross-references

- **[Language → memory model](/docs/language/memory-model)** — the user-level story.
- **[Language → references](/docs/language/references)** — `&T` / `&checked T` / `&unsafe T`.
- **[Language → CBGR](/docs/language/cbgr)** — conceptual model.
- **[Architecture → CBGR internals](/docs/architecture/cbgr-internals)** — data structures + algorithms.
- **[intrinsics](/docs/stdlib/intrinsics)** — `ptr_read`, `ptr_write`, `volatile_load/store`.
- **[sys](/docs/stdlib/sys)** — OS-level `os_alloc` / `os_free` under the segment allocator.
