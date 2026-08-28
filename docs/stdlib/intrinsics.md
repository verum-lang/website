---
sidebar_position: 5
title: intrinsics
description: 700+ compiler intrinsics — arithmetic, bitwise, float, memory, atomic, tensor, GPU, runtime, low-level.
status: partial
status_detail: >-
  2026-07-16: tensor first real suite — interp 65/65 zero-ignore on main (T0193 wire canon; T0199 stale-bake+carrier-gate and T0200 kernel class closed; T0225 restored the AOT tier at HEAD); Tier-1 tensor compiles, values staged under T0179/T0201; largest open: MEM-PTR-DEREF-TIER0-1, UMBRELLA-REEXPORT-RESOLVE-1 (T0175 in flight).
---

# `core.intrinsics` — Compiler intrinsics

The compiler-provided bridge between Verum code and CPU/runtime
operations. Higher-level stdlib modules wrap these with safe APIs;
this page enumerates the raw surface for runtime authors, driver
writers, and micro-optimisation specialists.

**~700 public intrinsics** across 26 files, grouped by category.

| Category | File | Rough count |
|---|---|---|
| [Arithmetic](#arithmetic) | `arithmetic.vr` | 100+ |
| [Bitwise](#bitwise) | `bitwise.vr` | 40+ |
| [Float](#float) | `float.vr` | 100+ |
| [Atomic](#atomic) | `atomic.vr` | 80+ |
| [Memory](#memory) | `memory.vr` | 50+ |
| [Type info](#type-info) | `type_info.vr` | 10 |
| [Conversion](#conversion) | `conversion.vr` | 40+ |
| [Control](#control) | `control.vr` | 20 |
| [Platform](#platform) | `platform.vr` | 10 |
| [SIMD](#simd) | `simd.vr` | 10 |
| [Tensor](#tensor) | `tensor.vr` | 70+ |
| [GPU](#gpu) | `gpu.vr` | 50+ |
| [Runtime](#runtime) | `runtime/*.vr` | 80+ |
| [Low-level](#low-level) | `lowlevel/*.vr` | 90+ |

Annotations you will see:
- `@vbc_direct_lowering` — VBC has a dedicated opcode.
- `@llvm_only` — only available when lowered to LLVM (not in the VBC
  interpreter).
- `@requires_runtime` — needs a specific runtime feature (threads, etc.).
- `@inline(always)` — compiler will always inline.
- `@target_feature("…")` — requires a specific CPU feature.

---

## Conformance status by submodule (2026-07-15)

Statuses follow the [status convention](./status-convention.md); the
per-module deep findings live in `core-tests/intrinsics/<module>/audit.md`.
"Both tiers" means the suite passes under `verum test --interp` AND `--aot`.

| Submodule | Status | State (2026-07-15) |
|---|---|---|
| `arithmetic` | ⚠️ partial | Interp green core (129 live). **ARITH-PURE-BODY-1**: the 14 historically-nil intrinsics (`widening_mul`, `carrying_add`, `borrowing_sub`, `checked_shl/shr/rem/next_power_of_two`, `overflowing_neg/shl/shr`, `saturating_div`, `ilog10`, `leading_sign_bits`, `is_power_of_two`) are now pure Verum bodies over the registered primitives — full 14-function battery green on the v20 bake. AOT sweep pending. |
| `bitwise` | ✅ complete | Both tiers green (127/127). |
| `float` | ⚠️ partial | Interp 85 live; 7 pins (`roundeven/rint/nearbyint`, `minimum/maximum`, `is_subnormal`/sign classify need opcodes); AOT libm cluster open (`fneg`/`fms`, `hypot`/`cbrt`/`expm1`/`log1p`/`powi`). |
| `memory` | ⚠️ partial | Value-level + **raw-pointer harness landed** (property/integration over the `cbgr_allocate` bridge). **MEM-BULK-ADDR-DUAL-1 fixed**: `memcpy`/`memmove`/`memset`/`memcmp`/`secure_zero` now honest at Tier-0 (dual int-or-pointer extraction). `ptr_is_aligned_to` registered. Open: MEM-PTR-DEREF-TIER0-1 (`ptr_read` identity / `ptr_write` no-op at Tier-0 — the two-physical-worlds provenance model, task #16), MEM-SLICE-INTRINSIC-FATREF-1 (slice family re-routed to the canonical CbgrExtended ops — verification in flight), MEM-TRANSMUTE-FLOAT-1. |
| `atomic` | ⚠️ partial | Interp 30/30; AOT 25/30 (compare-and-swap `(observed, succeeded)` tuple under AOT — ATOMIC-CAS-AOT). |
| `type_info` | ⚠️ partial | `T.size`/`T.bits`/… property surface complete both tiers (102 tests). The legacy meta-fn forms (`size_of<T>()`, `align_of<T>()`) are `@deprecated` and return 0 through every path — use the type-property syntax. |
| `conversion` | ⚠️ partial | Interp 60 live; AOT 52/60 (f32/f64 bit-reinterpret + endianness round-trip flake). |
| `control` | ⚠️ partial | Both tiers 36/36; 1 pin (generic `expect<T>` result mis-tag under arithmetic). |
| `platform` | ✅ complete | Both tiers green. |
| `tensor` | ⚠️ partial | **First real suite 2026-07-16 (T0193)** — the old "audit-only, JIT gate covers it" rationale was disproved: the JIT gate exercises kernels, not the intrinsic WIRE, and ~30 of ~70 ops had divergent operand shapes. Wire canon `[dst][mode?][arg-regs]` landed (envelope-authoritative stream advance, dtype-converting writes, axis-aware softmax/argmax, moded Rand/Reduce/Index/Conv/Softmax). Interp 65/65 zero-ignore (T0199 closed — stale-bake T0219 + registry-derived carrier gate; T0200 closed — struct-pointer-as-buffer class swept across five kernels). Tier-1: core ops (new/fill/from_slice/get/set/binop/unop/matmul/reduce/reshape/transpose/softmax/clone) have real IR bodies — leg in triage; the extended surface panics loudly by design until the T0179 staging lands IR bodies (was: 60 declared-no-body externs). |
| `simd` / `gpu` | ❔ undocumented | simd: suite blocked by INTRINSIC-RESOLVE-NONDET-1 (T0175, fix in flight) + splat/reduce surface landing under T0116. gpu: wire-shape fix + suites in flight under GPU-OPERAND-SHAPE-1 (T0177). Both owned by an active peer session — see the pool tasks. |
| `lowlevel/*` | ⚠️ partial | Arch files (x86_64/aarch64/kernel/mmio) audit-only (privileged/@llvm_only). The umbrella's cross-platform surface (`CpuCapabilities`, `detect_capabilities()`, SIMD width constants) is suite-covered; **CFG-CONST-SELECT-1** pinned (@cfg on const items takes the fallback branch — `MAX_SIMD_WIDTH` = 128 on aarch64). |
| `runtime/tier,time,text,mem_raw,cbgr` | ⚠️ partial | Full suites, interp green; see audits for per-module AOT residuals. |
| `runtime/sync` | ⚠️ partial | 13/13 interp (restored 2026-07-15 by **ARCHIVE-REF-TIER-DROP-1** — baked signatures lost `&unsafe`/`&checked`/`mut`); AOT green under `--exact`. |
| `runtime/os` | ⚠️ partial | Unit + integration + **property laws** (round-trip identity over a UTF-8 domain, seek algebra, delete lifecycle) — 9/9 interp. |
| `runtime/io` | ⚠️ partial | Unit + **engine-algebra property laws** (fd-free drift probes) — 6/6 interp. Registration surface belongs to the net suites. |
| `runtime/tls` | ⚠️ partial | Slot algebra + regression pins for the 2026-07-04 slot-trio cluster; **TLS-SLOT-GET-NULL-1 fixed** (absent slot returns the null pointer, not nil). |
| `runtime/scripting` | ⚠️ partial | **NEW 2026-07-15**: 30/30 interp (outcome taxonomy, sticky `last_error_kind`, globals, sandbox fuel, List marshaling). Tier contract pinned: AOT = failed outcome kind 4 (no compiler hook). Needed **SCRIPT-HOOK-TEST-RUNNER-1** (test runner now installs the hook). |
| `runtime/async_ops` / `runtime/syscall` | ❔ undocumented | Deliberate audit-only exceptions: async surface is conformance-tested at `core-tests/async/intrinsics/`; raw syscalls are a portability landmine (platform-specific numbers). |
| `mod` umbrellas | ⚠️ partial | Explicit re-export lists pinned green. **UMBRELLA-REEXPORT-RESOLVE-1**: wildcard re-exports through umbrella brace-mounts resolve NONDETERMINISTICALLY per run (map-walk name index) — acceptance blocks committed in the suites. |

Open cross-cutting classes (2026-07-15): MEM-PTR-DEREF-TIER0-1,
UMBRELLA-REEXPORT-RESOLVE-1, ARCHIVE-GENERIC-BODY-NIL-1 (baked generic
bodies vs local twins — fixed by SERIALIZE-STUB-IDENTITY-1/v20 for the
arithmetic battery; broader sweep pending), LITERAL-SIZED-ALIAS-COERCE-1
(bare `Int` literals vs `USize`/`ISize` params of baked free fns),
CFG-CONST-SELECT-1, INTERP-SWEEP-ISOLATION-1 (threads=16 cross-test
pollution).

---

## Arithmetic

Generic arithmetic over `T: Numeric`. Multiple flavours cover
checked / wrapping / saturating / overflowing semantics.

```verum
// Basic
add<T>(a: T, b: T) -> T         sub<T>(a, b) -> T        mul<T>(a, b) -> T
div<T>(a, b) -> T                rem<T>(a, b) -> T        neg<T>(a) -> T
abs<T>(a) -> T                   signum<T>(a) -> T

// Checked — return Maybe<T>; None on overflow
checked_add<T>(a, b) -> Maybe<T>    checked_sub / checked_mul / checked_div
checked_rem / checked_neg / checked_shl / checked_shr

// Overflow-reporting — returns (result, overflowed: Bool)
overflowing_add<T>(a, b) -> (T, Bool)
overflowing_sub / overflowing_mul / overflowing_neg
overflowing_shl / overflowing_shr

// Wrapping — modular arithmetic, no overflow
wrapping_add<T>(a, b) -> T        wrapping_sub / wrapping_mul
wrapping_neg / wrapping_abs / wrapping_shl / wrapping_shr

// Saturating — clamp at T.MIN / T.MAX
saturating_add<T>(a, b) -> T      saturating_sub / saturating_mul / saturating_div
saturating_neg / saturating_abs

// Comparison
eq<T>(a, b) -> Bool        ne / lt / le / gt / ge
min<T>(a, b) -> T          max<T>(a, b) -> T        clamp<T>(x, lo, hi) -> T

// Wide arithmetic
widening_mul<T>(a, b) -> (T, T)          // low, high
widening_mul_signed<T>(a, b) -> (T, T)
carrying_add<T>(a, b, carry: Bool) -> (T, Bool)
borrowing_sub<T>(a, b, borrow: Bool) -> (T, Bool)

// Utilities
leading_sign_bits<T>(a) -> Int
ilog2<T>(a) -> Int                       ilog10<T>(a) -> Int
is_power_of_two<T>(a) -> Bool
checked_next_power_of_two<T>(a) -> Maybe<T>
wrapping_next_power_of_two<T>(a) -> T
```

Width-specific variants (e.g. `wrapping_add_u32`, `saturating_mul_u8`)
are provided to avoid generic instantiation in hot paths.

### Panic conditions on the trapping forms

The non-`checked` / non-`wrapping` / non-`saturating` operations
panic on the inputs below. Use the `checked_*` family to recover
without panicking.

| Op | Panics on (signed integer T) | Float behaviour |
|----|-------------------------------|-----------------|
| `add` / `sub` / `mul` | overflow / underflow | IEEE 754 — saturates to `±inf` |
| `div` | `b == 0`; **also** `T.MIN / -1` (mathematical result is unrepresentable) | `x / 0.0 = ±inf`; `0.0 / 0.0 = NaN` |
| `rem` | `b == 0`; `T.MIN % -1` | IEEE 754 |
| `neg` / `abs` | `T.MIN` (mathematical result `|T.MIN|` is not representable) | flips sign / `abs(NaN) = NaN`, `abs(±inf) = +inf` |
| `wrapping_div` / `wrapping_rem` | `b == 0` (the `T.MIN / -1` pair wraps instead of panicking) | n/a |

`signum` is total: returns `-1` / `0` / `1` for ints; for float
NaN it returns NaN. `add` / `sub` / `mul` on unsigned T are the
ordinary modular operations on bit widths and never panic from
overflow.

### Conformance status — arithmetic ⚠️ partial

Suite: `core-tests/intrinsics/arithmetic/`
(unit + property + integration + regression + `audit.md`).
**106 live tests GREEN under `--interp`; 42 `@ignore` pins.**

**Verified (interp):** `add` `sub` `mul` `div` `rem` `neg` `abs`
`abs_signed` `signum`; `checked_add/sub/mul/div` (+ `_u64`);
`add_overflow` `sub_overflow` `mul_overflow` **and the
`overflowing_add/sub/mul` aliases**; `wrapping_add/sub/mul/neg/shl/shr`
(Int) and the width-specific `wrapping_*_u8/_i8/_u32`;
`saturating_mul/neg/abs` and `saturating_*_u8/_u16/_u32/_i32`;
`min` `max` `clamp`; `ilog2`. Ring/order algebraic laws pinned by
the property suite.

**Source fixes landed this branch:**

- **Comparison wrappers `eq/ne/lt/le/gt/ge`** — `emit_intrinsic_direct_opcode`
  had no arm for the `EqI/NeI/LtI/LeI/GtI/GeI` DirectOpcodes, so these
  Bool-returning wrappers fell through to a `LoadNil` fallback (nil stub). Now
  emit `CmpI`. GREEN.
- **`overflowing_add/sub/mul`** — added the missing registry aliases (they had
  no entry and silently lowered to `nil`). GREEN.
- **`checked_neg` / `checked_abs` width** — the generic forms now emit the
  `width=64, signed=1` bytes the interpreter's `CheckedNeg`/`CheckedAbs`
  handlers read (correct for AOT + direct `@intrinsic` + fresh user wrapper).
  Still gated under the stdlib wrapper by the name-collision below.

**Additional fixes (2026-06-21):**

- **`checked_neg`/`checked_abs` + `saturating_add/sub/neg/abs` — bare-name
  collision FIXED.** These were resolving to the unmounted
  `core.math.checked.*` overloads (returning `CheckedResult`/`nil`) instead of
  the explicitly-mounted intrinsics versions, because resolution ranked
  candidates by argument type and a typed `Int` arg (`Int.MAX`) matched the
  concrete `Int64` signature. An explicit `mount X.{name}` now owns the bare
  name. `SaturatingNeg`/`SaturatingAbs` width-byte emission was also fixed
  (exposed once the collision stopped masking it).

**Open defects (pinned `@ignore`):**

- **(B) Missing registry entries — `is_power_of_two`, `checked_rem`.** No
  `lookup_intrinsic` entry → archived body is a `LoadNil` stub.
- **(D) Nested-call dispatch — `mul(a, add(b,c))`.** The outer intrinsic is
  mis-computed as the inner one (`a + b + c` instead of `a·(b+c)`).
- **`ARITH-MISSING-INTRINSICS-1`.** `overflowing_neg/shl/shr`,
  `wrapping_div/rem/abs`, `wrapping_next_power_of_two`, `widening_mul[_signed]`,
  `carrying_add`, `borrowing_sub`, `checked_shl/shr`,
  `checked_next_power_of_two`, `ilog10`, `leading_sign_bits`, `saturating_div`
  have no registry/dispatch implementation yet.

Until (A)–(D) are fixed, prefer operator forms (`==`, `<`, `+`, `*`, …) and the
width-specific intrinsics (`saturating_add_u32`, …) over the generic free
functions.

---

## Bitwise

```verum
bitand<T>(a, b) -> T        bitor / bitxor
bitnot<T>(a) -> T

shl<T>(a, n: Int) -> T      shr (arith)  lshr (logical)  ashr (arith)
rotl<T>(a, n) -> T          rotr<T>(a, n) -> T
fshl<T>(a, b, n) -> T       fshr<T>(a, b, n) -> T       // funnel shift

clz<T>(a) -> Int            // count leading zeros
ctz<T>(a) -> Int            // count trailing zeros
popcnt<T>(a) -> Int         // population count
leading_ones<T>(a) -> Int   trailing_ones<T>(a) -> Int

bswap<T>(a) -> T            bitreverse<T>(a) -> T
byte_swap_bits<T>(a) -> T
```

Sized variants: `clz_u32`, `ctz_u64`, `popcnt_u64`, etc.

All generic forms operate at **64-bit width** (VBC integer Values are i64 at
runtime — same model as [arithmetic](#arithmetic)).  The `_u32` count
variants are width-correct: `clz_u32` subtracts the 32-bit carrier slack
(`clz64(x) - 32`) and `ctz_u32` sets a guard bit (`ctz64(x | 1<<32)`) so an
all-zero word yields `32`, not `64`.

`byte_swap_bits` reverses the bit order *within* each byte (byte positions
unchanged) — the identity `byte_swap_bits = bswap ∘ bitreverse`.  `ashr`
sign-extends; `lshr` zero-fills; the bare `shr` is arithmetic.

### Conformance status — bitwise ✅ complete

Suite: `core-tests/intrinsics/bitwise/`
(unit + property + integration + regression + `audit.md`).
**Both tiers GREEN via `verum test`: interp 127/127, AOT 127/127; 0 `@ignore`.**
Every public function is exercised; Boolean-algebra laws (commutativity,
associativity, De Morgan, distributivity, idempotence) and bit-manip invariants
(involutions, popcnt-preservation, rotate-inverse) are pinned by the property
suite.

**Source / crate fixes landed this branch** (all at registry + codegen +
interp + LLVM):

- **`bitnot` / `lshr` / `ashr` returned `nil`.** The registry held only the
  semantic *wrapper* names (`bitand` …); the authoritative `@intrinsic` body
  names (`and`/`or`/`xor`/`not`) and the logical/arithmetic right shifts were
  unregistered.  Now `and`/`or`/`xor`/`not` → `Band`/`Bor`/`Bxor`/`Bnot`,
  `lshr` → `Ushr`, `ashr` → `Shr`; the missing `Ushr` emit arm was added.
- **`clz_u32`/`ctz_u32` ignored width** (`clz_u32(1)` was `63`, not `31`).
  New width-correct inline sequences.
- **`byte_swap_bits` was unregistered.** New `bswap ∘ bitreverse` inline
  sequence.

**Tier-1 (AOT):** the bitwise suite passes **127/127 under `verum test --aot`**.
This required a systemic compiler fix (`SYSTEMIC-AOT-EAGER-CORE-1`): the test
harness writes its merged file inside the `core` cog, and
`load_project_modules` was eager-loading the *whole* `core` crate as a project
— pulling unreachable stdlib modules into native codegen and aborting on
undefined leaf functions.  In `Normal` build mode the stdlib `core` cog is now
served exclusively from the embedded precompiled archive and never
eager-compiled as a project, which unblocks AOT for **every** `core-tests`
suite.

---

## Float

```verum
// Elementary
sqrt<T>(x) -> T            cbrt / exp / expm1 / exp2 / exp10
log<T>(x) -> T             log1p / log10 / log2
pow<T>(x, y) -> T          powi<T>(x, n: Int) -> T
hypot<T>(x, y) -> T

// Rounding
floor<T>(x) -> T           ceil / round / roundeven / trunc / nearbyint / rint

// Fused
fma<T>(a, b, c) -> T       // single-rounded a*b+c
fms<T>(a, b, c) -> T       // a*b-c

// Sign / magnitude
copysign<T>(mag, sign) -> T
minnum / maxnum            // NaN-handling IEEE 754
minimum / maximum          // signed-zero-aware
fmod / remquo              fabs / fneg

// Trigonometry
sin / cos / tan / asin / acos / atan / atan2 / sincos

// Hyperbolic
sinh / cosh / tanh / asinh / acosh / atanh

// Classification
is_nan / is_inf / is_finite / is_normal / is_subnormal
is_sign_negative / is_sign_positive / is_infinite
```

### IEEE 754 bit operations

```verum
f32_to_bits(f: Float32) -> UInt32          f32_from_bits(b: UInt32) -> Float32
f64_to_bits(f: Float64) -> UInt64          f64_from_bits(b: UInt64) -> Float64

f32_infinity() / f32_neg_infinity() / f32_nan()
f64_infinity() / f64_neg_infinity() / f64_nan()

infinity<T>() -> T        nan<T>() -> T         epsilon<T>() -> T
min_positive<T>() -> T    max_float<T>() -> T
```

Runtime model: VBC floats are IEEE **f64** (Float32 widens to f64 at runtime);
the generic forms are f64-natural and `_f32`/`_f64` carry their width. Most
functions dispatch via a `MathExtended` opcode (~2 ns).

### Conformance status — float ⚠️ partial

Suite: `core-tests/intrinsics/float/`
(unit + property + integration + regression + `audit.md`).
**Interp 85/85 GREEN (7 `@ignore`); AOT 70/85.**

**Fixes landed:**

- **`trunc` returned its input unchanged** — float `trunc<T>` shared the bare
  `@intrinsic("trunc")` name with integer `conversion.itrunc` (which is a no-op
  `Mov` at i64/f64 width). Routed float `trunc` to its dedicated `trunc_f64`
  (round toward zero).
- **`fneg` → `nil` (and `fms` garbage)** — `fneg` had no registry entry; aliased
  it to the polymorphic `neg` (`PolyNeg`, float-aware). Closes `fneg` + `fms`.
- **`epsilon`/`min_positive`/`max_float` → `nil`** — used unregistered
  `@intrinsic` names; now plain IEEE-754 literals.

**Open — interp (need new opcodes):**

- `FLOAT-ROUNDMODES-1` — `roundeven`/`rint`/`nearbyint` (round-half-to-even).
- `FLOAT-MINMAX-1` — `minimum`/`maximum` (IEEE 754-2019, NaN-propagating).
- `FLOAT-CLASSIFY-1` — `is_subnormal`/`is_sign_negative`/`is_sign_positive`.

**Open — AOT only (`FLOAT-AOT-LIBM-1`, interp green):** `fneg`/`fms` (the
`PolyNeg` AOT path doesn't negate floats) and the libm-backed
`hypot`/`cbrt`/`expm1`/`log1p`/`powi` (AOT lowering).

---

## Atomic

```verum
type MemoryOrder is Relaxed | Acquire | Release | AcqRel | SeqCst;

const ORDERING_RELAXED: MemoryOrder;
const ORDERING_ACQUIRE: MemoryOrder;
const ORDERING_RELEASE: MemoryOrder;
const ORDERING_ACQ_REL: MemoryOrder;
const ORDERING_SEQ_CST: MemoryOrder;

// Generic
atomic_load<T>(ptr: *const T, order: MemoryOrder) -> T
atomic_store<T>(ptr: *mut T, value: T, order: MemoryOrder)
atomic_xchg<T>(ptr, value, order) -> T

atomic_cmpxchg<T>(ptr, current, new, success, failure) -> Result<T, T>
atomic_cmpxchg_weak<T>(...) -> Result<T, T>

atomic_add / atomic_sub / atomic_max / atomic_min / atomic_umax / atomic_umin
atomic_and / atomic_nand / atomic_or / atomic_xor

atomic_fence(order)     compiler_fence(order)
```

### VBC-direct width-specific primitives

```verum
atomic_load_u8/u16/u32/u64/i32/ptr(ptr, order)
atomic_store_u8/u16/u32/u64/i32/ptr(ptr, value, order)
atomic_cas_u32/u64/i32/ptr(ptr, old, new, s, f) -> Result<T, T>
atomic_fetch_add_u32/u64/u16(ptr, delta, order) -> T
atomic_fetch_sub_u32/u64
atomic_fetch_and_u32/u64/u16         atomic_fetch_or_u64      atomic_fetch_xor_u64
atomic_exchange_u32/u64/i32(ptr, new, order) -> T
```

### Int-sized (platform-pointer-width)

```verum
atomic_load_int / atomic_store_int
atomic_cmpxchg_int / atomic_fetch_add_int
```

`atomic_cas_*` returns a `(observed_value, succeeded)` pair: on success
`observed == expected` and the new value is installed; on failure `observed` is
the current value and the cell is untouched. The `ORDERING_*` constants are the
`UInt8` strength ladder (`Relaxed`=0 … `SeqCst`=4) the width-typed intrinsics
consume; the `MemoryOrder` ADT is the typed surface over them.

### Conformance status — atomic ⚠️ partial

Suite: `core-tests/intrinsics/atomic/`
(unit + property + integration + regression + `audit.md`).
**Interp 30/30 GREEN; AOT 16/30.**

A single-threaded conformance test pins each operation's **value semantics**
(read-modify-write result + returned previous value) over a live atomic cell,
not inter-thread ordering. **No atomic-intrinsic fix was needed** — the full
operational surface (load/store, `fetch_add/sub/and/or/xor`, `exchange`,
compare-and-swap, fences) is correct under interp.

**Open — AOT only (`ATOMIC-AOT-RAWPTR-1`):** the 14 operational tests drive
atomic ops through a `List.as_mut_ptr()` raw pointer; that AOT raw-pointer /
`List`-backing path fails (even `store`/`load`), so it's the same family as the
byte-array AOT defect, not the atomic ops. The `MemoryOrder` ADT + ORDERING
constants + fences pass on both tiers. Inter-thread ordering semantics belong to
a concurrency suite (out of scope here).

---

## Memory

```verum
// Bulk
memmove(dst: *mut Byte, src: *const Byte, n: Int)
memcpy(dst, src, n)
memset(dst, byte: Byte, n)
memcmp(a, b, n) -> Int

// Typed
copy<T>(dst: *mut T, src: *const T, count: Int)
copy_nonoverlapping<T>(dst, src, count)           // UB if overlapping
swap<T>(a: *mut T, b: *mut T)
replace<T>(ptr: *mut T, value: T) -> T
forget<T>(value: T)                                // leak, no drop
transmute<S, D>(value: S) -> D                    // reinterpret bits

// Pointer
ptr_read<T>(p: *const T) -> T
ptr_read_unaligned<T>(p: *const T) -> T
ptr_read_volatile<T>(p: *const T) -> T
ptr_write<T>(p: *mut T, v: T)
ptr_write_unaligned<T>(p, v)                       ptr_write_volatile<T>(p, v)
ptr_write_bytes<T>(p: *mut T, byte: Byte, count: Int)
ptr_offset<T>(p: *const T, count: Int) -> *const T
ptr_offset_mut<T>(p: *mut T, count: Int) -> *mut T
ptr_add<T>(p, count) / ptr_sub<T>(p, count)
null_ptr<T>() -> *const T          null_ptr_mut<T>() -> *mut T
ptr_is_null<T>(p) -> Bool
ptr_is_aligned<T>(p) -> Bool       ptr_is_aligned_to<T>(p, align: Int) -> Bool
drop_in_place<T>(p: *mut T)

// Slice (unsafe)
slice_from_raw_parts<T>(p: *const T, len: Int) -> &[T]
slice_from_raw_parts_mut<T>(p: *mut T, len: Int) -> &mut [T]
slice_len<T>(s: &[T]) -> Int
slice_as_ptr<T>(s: &[T]) -> *const T
slice_as_mut_ptr<T>(s: &mut [T]) -> *mut T
slice_get_unchecked<T>(s: &[T], i: Int) -> &T
slice_get_unchecked_mut<T>(s: &mut [T], i: Int) -> &mut T
slice_subslice<T>(s: &[T], start, end) -> &[T]
slice_split_at<T>(s: &[T], at: Int) -> (&[T], &[T])
slice_split_at_mut<T>(s: &mut [T], at: Int) -> (&mut [T], &mut [T])

// Uninit
uninit<T>() -> MaybeUninit<T>
zeroed<T>() -> MaybeUninit<T>
maybe_uninit_is_init<T>(m: &MaybeUninit<T>) -> Bool

// Volatile
volatile_load<T>(p: *const T) -> T
volatile_store<T>(p: *mut T, v: T)
volatile_copy<T>(dst, src, count)                  volatile_set<T>(dst, v, count)

// Reference conversion
ptr_to_ref<T>(p: *const T) -> &T                   // UB if null
ptr_to_mut_ref<T>(p: *mut T) -> &mut T
```

### Conformance status — memory ⚠️ partial

Suite: `core-tests/intrinsics/memory/` (unit + regression + `audit.md`).
**Value-level subset GREEN on BOTH tiers (interp 11/11 + AOT 11/11):**
`swap`, `replace`, `transmute`, `null_ptr`/`null_ptr_mut`/`ptr_is_null`,
`zeroed`.

**Fix landed:** `null_ptr`/`ptr_is_null` returned `nil` — their registry
strategies (`DirectOpcode(LoadI)` with no immediate; `DirectOpcode(EqI)` with a
single operand) fell through to `LoadNil`. Now dedicated inline sequences
(`LoadI 0` / `LoadI 0` + `CmpI eq`).

**Partially landed (2026-07-01):** the raw-pointer surface now has a focused
harness over a `List`-backing pointer (`as_mut_ptr`). `ptr_read`/`ptr_write` work
on AOT; **`ptr_offset`/`ptr_add`/`ptr_sub` were fixed** — they advanced by *bytes*
not *elements*, so `ptr_offset(p, 1)` landed mid-slot (every backing slot is an
8-byte NaN-boxed `Value`). The fix scales by the slot size on both tiers (AOT
`lower_ptr_add`/`sub` GEP over `i64`; interpreter `offset × 8`), validated AOT
`v0=99 v1=20 v2=30` with no regression (conversion 59/60). **Still deferred:**
`memcpy`/`memset`/`memcmp`, `slice_*`, `ptr_is_aligned`, `ptr_to_ref`, `uninit`
(the full `MEM-RAWPTR-HARNESS-1` both-tier surface); and an interpreter-tier
`ptr_read` defect — a deref of a calloc'd `List`-backing pointer hits the
identity-deref path (returns the pointer instead of `*p`); the AOT reads `*p`
correctly. Partly covered today by the [`mem`](/docs/stdlib/mem) and
`base/memory` suites (the CBGR safety layer).

---

## Type info

```verum
// Deprecated (prefer T.size etc.)
size_of<T>() -> Int         align_of<T>() -> Int        stride_of<T>() -> Int
bits_of<T>() -> Int         type_id<T>() -> UInt64      type_name<T>() -> Text

// Meta
needs_drop<T>() -> Bool     min_align() -> Int
```

Replaced by the type-property syntax — `T.size`, `T.alignment`,
`T.stride`, `T.bits`, `T.id`, `T.name`.

---

## Conversion

```verum
// Integer ↔ float
int_to_float<I, F>(x: I) -> F        uint_to_float<U, F>(x: U) -> F
float_to_int<F, I>(x: F) -> I        float_to_uint<F, U>(x: F) -> U

// Precision
fpext<S, D>(x: S) -> D               fptrunc<S, D>(x: S) -> D
sext<S, D>(x: S) -> D                zext<S, D>(x: S) -> D
itrunc<S, D>(x: S) -> D

// Bit-level reinterpret
bitcast<S, D>(x: S) -> D             // size(S) == size(D)

// Byte layouts
to_le_bytes<T, const N: Int>(x: T) -> [Byte; N]
to_be_bytes<T, const N>(x) -> [Byte; N]
to_ne_bytes<T, const N>(x) -> [Byte; N]
from_le_bytes<T, const N>(bytes: [Byte; N]) -> T
from_be_bytes<T, const N>(bytes) -> T
from_ne_bytes<T, const N>(bytes) -> T

// Width-specific
to_le_bytes_2 / _4 / _8 / _16                     (UInt16 / UInt32 / UInt64 / UInt128)
to_be_bytes_2 / _4 / _8 / _16
from_le_bytes_2 / _4 / _8 / _16
from_be_bytes_2 / _4 / _8 / _16

// Endianness
to_le<T>(x) / to_be<T>(x) / from_le<T>(x) / from_be<T>(x)

// Convenience
int_to_bytes<T, const N>(x: T) -> [Byte; N]
f32_to_bits(f) -> UInt32             f32_from_bits(b) -> Float32
f64_to_bits(f) -> UInt64             f64_from_bits(b) -> Float64
```

Runtime model: integer/float **width is static-only** (i64/f64 at runtime), so
the widening conversions (`sext`/`zext`/`fpext`) and narrowing ones
(`itrunc`/`fptrunc`) are value-preserving no-ops. The float↔int **bit
reinterpretation** is a real opcode (it is *not* a move in the Tier-0 NaN-boxed
representation), so use the size-typed `f{32,64}_{to,from}_bits` wrappers rather
than the generic `unsafe bitcast<S, D>`. `to_le`/`from_le` are no-ops on a
little-endian target; `to_be`/`from_be` byte-swap.

### Conformance status — conversion ⚠️ partial

Suite: `core-tests/intrinsics/conversion/`
(unit + property + integration + regression + `audit.md`).
**Interp 60/60 GREEN, 0 `@ignore`; AOT 52/60.**

**Wiring fixes landed (data-only — the codegen/interp/LLVM implementations
already existed but were unreachable from the intrinsic surface):**

- **`sext`/`zext`/`itrunc`/`fpext`/`fptrunc` returned `nil`** — the generic
  names aliased to registry names that don't exist (the real entries are
  width-typed: `i32_to_i64`, `u32_to_u64`, `f32_to_f64`, `f64_to_f32`,
  `i64_to_i32`). Repointed the aliases.
- **`f{32,64}_{to,from}_bits` returned `nil`** — the wrappers called the
  unregistered generic `bitcast` instead of their dedicated bit-reinterpret
  intrinsics. Routed them correctly.
- **`to_le`/`to_be`/`from_le`/`from_be` returned a byte array** — they were
  aliased to `to_le_bytes`/`to_be_bytes`. Now return the endianness-converted
  `T` (identity / `bswap`).

**AOT-codegen fix landed (`CONV-AOT-BYTEARRAY-1`):** the `to/from_*_bytes`
`[Byte; N]` intrinsics SIGSEGV'd under AOT.  Root cause was general — AOT `GetE`
mis-classified a byte-element collection that crossed a function boundary
(`List<U8>`/`List<I8>` marked as a *slice*; `[T; N]` left unmarked), so it used
the wrong stride / dereferenced the list header.  A `List<U8>`/`[Byte; N]` is an
i64-strided list object; true `&[U8]` slices are a distinct representation.
Fixed in both the return-type and parameter register-marking paths
(`verum_codegen/llvm`) — this also unblocks every `fn … -> [T; N]` and
`fn(List<U8>)` under AOT.

**Open (separate, pre-existing):** `CONV-AOT-F32BITS-1` — `f32_to_bits`/
`f32_from_bits` return `0` under AOT (Float32 cast/parameter handling; the f64
forms are correct on both tiers).

---

## Control

```verum
trap() -> !                         // abort — "should not execute"
unreachable() -> !                   // UB hint
debugtrap()                          // breakpoint
nop()                                 // no-op placeholder
assume(cond: Bool)                    // optimiser hint
likely(cond: Bool) -> Bool            // branch prediction hint
unlikely(cond: Bool) -> Bool
expect<T>(value: T, expected: T) -> T

prefetch_read<T>(p: *const T)
prefetch_write<T>(p: *mut T)

panic(msg: Text) -> !
abort() -> !                          // immediate; no unwinding
debug_assert(cond, msg)
unreachable_unchecked(msg) -> !
panic_impl(info: &PanicInfo) -> !

catch_unwind<T, F>(f: F) -> Result<T, PanicInfo>

random_float() -> Float               // OS RNG
random_u64() -> UInt64
```

### Conformance status — control ✅ value surface (both tiers)

**36/36 GREEN on BOTH interp and AOT** (1 `@ignore`), via
`core-tests/intrinsics/control/` (`verum test`).

The **branch-hint** intrinsics are semantically transparent — they steer the
optimiser but must return their primary operand unchanged: `likely(c)` /
`unlikely(c)` return `c`, and `expect<T>(v, hint)` returns `v` (the hint is
advisory only).

**Fix landed (`CONTROL-EXPECT-NIL`):** `likely` / `unlikely` / `expect` all
lower to `@intrinsic("expect", value, hint)`, which had **no registry entry** —
so the name resolved to `LoadNil` and every branch-hint call returned `nil`.
Registered `expect` with the identity-`Mov`-of-first-argument inline sequence
(it returns the value and ignores the hint operand). Fixed on both tiers.

Verified green: branch-hint identity (Int / Bool / Text), `nop()` /
`assume(true)` / `debug_assert(true)` callable no-ops, `random_float()` ∈
`[0.0, 1.0)`, `random_u64()` non-constant, and hints embedded in realistic
control flow (a `likely` hot loop, an `unlikely` rare branch) computing
identical results to the un-hinted form.

**Known residual (`@ignore`d):** generic `expect<T>` returns the value with a
mis-tagged (boxed) representation — correct for compare/print/assign but
**arithmetic on the result yields garbage** (`acc + expect(i*i, 0)`); the
non-generic `likely` / `unlikely` are unaffected.

**Not value-tested:** the diverging `Never`-typed intrinsics (`trap`,
`unreachable`, `panic`, `abort`, `unreachable_unchecked`, `panic_impl`) and the
`catch_unwind` / `prefetch_*` surfaces (raw-pointer + unwinding harness) — see
`core-tests/intrinsics/control/audit.md`.

---

## Platform

```verum
is_debug() -> Bool          is_release() -> Bool

target_os() -> UInt8           // compact encoding, see platform.vr
target_arch() -> UInt8
target_pointer_width() -> UInt32
target_is_little_endian() -> Bool

target_has_atomic<T>() -> Bool
target_has_feature(feature: Text) -> Bool

rdtsc() -> UInt64                         // x86_64
rdtscp() -> (UInt64, UInt32)
spin_hint()                                // pause / yield instruction
```

---

## SIMD

Lane-level primitives. Higher-level API lives in [`simd`](/docs/stdlib/simd).

```verum
simd_extract<V, T>(v: V, lane: Int) -> T
simd_insert<V, T>(v: V, lane: Int, value: T) -> V
simd_shuffle<V, const MASK: [UInt32]>(a: V, b: V) -> V

simd_reduce_add<V, T>(v: V) -> T
simd_reduce_mul<V, T>(v: V) -> T
simd_reduce_min<V, T>(v: V) -> T
simd_reduce_max<V, T>(v: V) -> T

simd_reduce_and<V, T>(v: V) -> T
simd_reduce_or<V, T>(v: V) -> T
simd_reduce_xor<V, T>(v: V) -> T
```

---

## Tensor

Runtime tensor compute over **opaque handles** (`Int` at the surface
until the dedicated handle type lands — T0179/T0202). Backs
`math.tensor` and the autodiff stack. The interpreter executes real
CPU kernels (`interpreter/tensor.rs`; SVD/QR/eig/einsum/conv2d
included); Tier-1 lowers to `verum_tensor_*` IR bodies.

**Wire contract (T0193).** Every tensor intrinsic emits
`TensorExtended` with operands `[dst][mode?][arg-registers…]` — all
values arrive in registers, never as inline immediates, and the
operand-byte envelope (not the arm's reads) advances the instruction
stream. This is the single authority shared by the emitter, the
interpreter arms, and the AOT lowering.

### Element dtypes (`DTYPE_*` constants)

Pass these to `tensor_new` / `tensor_fill` / `tensor_from_slice` /
`tensor_cast` — they mirror the runtime `DType` byte encoding:

| Constant | Id | | Constant | Id |
|---|---|---|---|---|
| `DTYPE_F32` | 0 | | `DTYPE_U64` | 8 |
| `DTYPE_F64` | 1 | | `DTYPE_U32` | 9 |
| `DTYPE_F16` | 2 | | `DTYPE_U16` | 10 |
| `DTYPE_BF16` | 3 | | `DTYPE_U8` | 11 |
| `DTYPE_I64` | 4 | | `DTYPE_BOOL` | 12 |
| `DTYPE_I32` | 5 | | `DTYPE_COMPLEX64` | 13 |
| `DTYPE_I16` | 6 | | `DTYPE_COMPLEX128` | 14 |
| `DTYPE_I8` | 7 | | | |

Reads (`tensor_get_scalar → Float`) and writes (`tensor_set_scalar`,
fills, `from_slice` copies) are **dtype-converting** in both
directions — an F32/int tensor can never silently read back zeros
(the pre-T0193 write path was F64-only and no-op'd for every other
dtype).

### Op-code tables (mirror the VBC enums — do not trust older docs)

| `tensor_unop` op | | op | | op |
|---|---|---|---|---|
| 0 neg | | 5 sin | | 10 relu |
| 1 abs | | 6 cos | | 11 gelu |
| 2 sqrt | | 7 tan | | 12 silu |
| 3 exp | | 8 tanh | | 13 floor |
| 4 log | | 9 sigmoid | | 14 ceil |

`tensor_binop`: 0 add · 1 sub · 2 mul · 3 div · 4 pow · 5 mod ·
6 min · 7 max.
`tensor_cmp`: 0 eq · 1 ne · 2 lt · 3 le · 4 gt · 5 ge (Bool tensor).
`tensor_reduce`: 0 sum · 1 **prod** · 2 max · 3 min · 4 **mean** ·
5 var (axis &lt; 0 reduces all).
`tensor_cumulative`: 0 sum · 1 prod.

> The 2026-07-16 sweep (T0198) found the previous op listings drifted
> from the enums — `math.autodiff`'s sigmoid was emitting **tanh**.
> These tables are verified against `TensorUnaryOp`/`TensorBinaryOp`/
> `TensorReduceOp`/`CompareOp` byte values.

### Surface by group

```verum
// Creation                        // Factories
tensor_new(shape, dtype)           tensor_arange(start, end, step)
tensor_fill(shape, value, dtype)   tensor_linspace(start, end, steps)
tensor_from_slice(data, shape, d)  tensor_eye(n)
tensor_from_array(data)            tensor_rand(shape) / tensor_randn(shape)
tensor_clone(t)                    tensor_randint(low, high, shape)

// Shape                           // Indexing
tensor_reshape(t, shape)           tensor_slice(t, ranges)
tensor_transpose(t)                tensor_index(t, indices)
tensor_permute(t, perm)            tensor_index_select(t, dim, idx)
tensor_squeeze(t)                  tensor_gather(t, dim, indices)
tensor_unsqueeze(t, dim)           tensor_concat(tensors, dim)  // List of handles
tensor_repeat(t, times)            tensor_stack(tensors, dim)   // List of handles
tensor_contiguous(t)               tensor_split(t, chunks, dim) // → List
tensor_broadcast(t, shape)

// Element-wise                    // Linear algebra
tensor_binop(a, b, op)             tensor_matmul / tensor_mm / tensor_mv
tensor_unop(t, op)                 tensor_bmm(a, b)   tensor_dot(a, b)
tensor_cmp(a, b, op)               tensor_outer(a, b)
tensor_where(cond, a, b)           tensor_einsum(expr, tensors)
tensor_clamp(t, lo, hi)            tensor_solve(a, b) tensor_tri_solve(a, b)
tensor_cast(t, dtype)              tensor_inverse(t)  tensor_det(t) → Float
tensor_masked_fill(t, mask, v)     tensor_trace(t) → Float
tensor_lerp(a, b, w)

// Reductions                      // Normalisation
tensor_reduce(t, op, axis)         tensor_softmax(t, axis)      // per-lane
tensor_reduce_all(t, op)           tensor_log_softmax(t, axis)  // stable LSE
tensor_argmax(t, axis)  // → I64 index TENSOR (axis<0 ⇒ flat global)
tensor_topk(t, k, axis) // → VALUES tensor, sorted desc
tensor_cumulative(t, op, axis)     tensor_layer_norm(t, ns, w, b)
                                   tensor_batch_norm(t, mean, var, w, b)
tensor_norm(t, p, dim)             tensor_rms_norm(t, w)

// Convolutions (valid padding, stride 1)
tensor_conv(input, kernel)     // 1-D operands auto-wrapped to NCHW
tensor_conv2d(input, kernel)   // NCHW input, OIHW kernel

// Advanced
tensor_scatter(t, dim, indices, src)   tensor_nonzero(t)
tensor_one_hot(indices, classes)       tensor_fft(t)
tensor_flash_attention(q, k, v)        // softmax(Q·Kᵀ/√dₖ)·V
```

### Single-output contracts (until the multi-output surface lands)

The `.vr` surface returns ONE handle, so each decomposition returns
its documented **primary factor**: `tensor_qr → Q`,
`tensor_svd → singular values`, `tensor_lu → U`,
`tensor_eig`/`tensor_eigh → eigenvalues`, `tensor_topk → values`,
`tensor_split`/`split_at → List of handles`. The full multi-factor
surface is staged under the T0179 epic.

### Tier contract

* **Interpreter (Tier 0)** — full surface, real kernels;
  conformance: `core-tests/intrinsics/tensor` (63/0/2).
* **AOT (Tier 1)** — the core group (`new`/`fill`/`from_slice`/
  element access/`binop`/`unop`/`matmul`/`reduce`/`reshape`/
  `transpose`/`softmax`/`clone`) has real IR bodies; every other op
  currently lowers to a **loud runtime panic** naming the op
  (`"<op>: no Tier-1 lowering yet"`) instead of the previous
  declared-but-undefined externs. IR bodies land per-op under T0179;
  axis-honoring reduce/softmax at Tier-1 is T0201.

### Open defects

| Class | Task |
|---|---|
| Broadcast kernel returns nil for the NumPy row-tile | T0199 |
| `det`/`trace` value channel (0.0 / int-bits-as-double) | T0200 |
| Tier-1 reduce/softmax ignore `axis` | T0201 |
| Handles are headerless `Box` ptrs — garbage f-string render, every tensor leaks | T0202 |
| View strides ignored by element accessors | T0196 |
| Script-cache survives wire changes (phantom regressions) | T0197 |

---

## GPU

Orchestration intrinsics used by `math.gpu` and `@kernel`.

```verum
// Device management
gpu_get_device() -> GpuDevice
gpu_set_device(id: Int)
gpu_device_reset()
gpu_mem_info() -> (free: Int, total: Int)
gpu_can_peer(a, b) -> Bool
gpu_enable_peer(a, b) / gpu_disable_peer(a, b)

// Allocation
gpu_malloc<T>(count: Int) -> GpuBuffer<T>
gpu_malloc_managed<T>(count: Int) -> GpuBuffer<T>
gpu_free(buf)
gpu_pin_memory<T>(host: *mut T, count) / gpu_unpin_memory
gpu_prefetch(buf, device_id)

// Transfers
gpu_memcpy(dst, src, bytes, kind: TransferKind)
gpu_memcpy_async(dst, src, bytes, kind, stream)
gpu_memcpy_h2d / d2h / d2d
gpu_memset / gpu_memset_async

// Streams & events
gpu_stream_create()                          gpu_stream_create_prio(priority)
gpu_stream_destroy(stream)                   gpu_stream_query(stream) -> Bool
gpu_stream_wait_event(stream, event)
gpu_sync(stream) / gpu_sync_all()

gpu_event_create()                           gpu_event_create_f()
gpu_event_destroy(event)                     gpu_event_record(event, stream)
gpu_event_sync(event)                        gpu_event_query(event) -> Bool
gpu_event_elapsed(start, stop) -> Float

// Kernel launch
gpu_launch(grid, block, kernel, args)
gpu_launch_coop(grid, block, kernel, args)

// Graph API (capture + replay)
gpu_graph_create() / gpu_graph_destroy
gpu_graph_begin(stream) / gpu_graph_end(stream)
gpu_graph_inst(graph) -> GpuExecutable
gpu_graph_launch(exec, stream)

// Enumeration
gpu_enumerate_cuda() -> List<GpuDevice>
gpu_enumerate_metal() -> List<GpuDevice>
gpu_enumerate_rocm() / vulkan()

// Profiling
gpu_marker_push(name: Text)
gpu_marker_pop()
```

---

## Runtime

Intrinsics annotated `@requires_runtime`. See [`runtime`](/docs/stdlib/runtime)
for configured flavours.

### Async (`runtime/async_ops.vr`)

```verum
// Opaque handles
JoinHandleOpaque       ExecutorHandle        FutureHandle
SupervisorHandleOpaque ChildSpecOpaque        ExecutionEnvOpaque
RecoveryContextOpaque   CircuitBreakerOpaque  AllocHandle
IODriverHandle          SharedRegistryOpaque  MiddlewareChainOpaque
SingleThreadExecutorOpaque

// Spawn & block
spawn_with_env<T>(future) -> JoinHandleOpaque
executor_spawn<T>(exec, future) -> JoinHandleOpaque
executor_block_on<T>(future) -> T
future_poll_sync<T>(future: &mut F) -> Maybe<T>
default_executor() -> ExecutorHandle

// Sleep
async_sleep_ms(ms: Int)
async_sleep_ns(ns: Int)

// Supervision
spawn_supervised(...)                     supervisor_log_escalation(...)
supervisor_set_parent(child, parent)      exec_with_recovery(...)

// Globals
global_allocator() -> AllocHandle
default_io_driver() -> IODriverHandle
shared_registry_global() -> SharedRegistryOpaque
middleware_chain_empty() -> MiddlewareChainOpaque
single_thread_block_on<T>(future) -> T

// Recovery error type
type RecoveryError is
    | MaxRetriesExceeded
    | CircuitOpen
    | Timeout
    | InnerError(Error);
```

### TLS (`runtime/tls.vr`)

```verum
tls_get_base() -> *mut Byte
tls_slot_get(slot: UInt8) -> *const Byte   tls_slot_set(slot: UInt8, value: *const Byte)
tls_slot_clear(slot)               tls_slot_has(slot) -> Bool
tls_frame_push() / tls_frame_pop()

tls_read_ptr<T>(slot) -> *const T        tls_write_ptr<T>(slot, ptr)
tls_read_i32(slot) / tls_write_i32(slot, v)
tls_read_usize(slot) / tls_write_usize(slot, v)
```

### Syscalls (`runtime/syscall.vr`)

```verum
syscall0(num) -> Int
syscall1(num, a0) -> Int
syscall2(num, a0, a1) -> Int
syscall3(num, a0, a1, a2) -> Int
syscall4(num, a0..a3) -> Int
syscall5(num, a0..a4) -> Int
syscall6(num, a0..a5) -> Int
```

### Time (`runtime/time.vr`)

```verum
monotonic_nanos() -> UInt64
realtime_secs() -> Int64       realtime_nanos() -> UInt64
num_cpus() -> Int
sleep_ms(ms) / sleep_ns(ns)
```

### Raw memory (`runtime/mem_raw.vr`)

Raw-address (`Int`-pointer) memory operations — the byte-granular layer
under `core/intrinsics/memory.vr`'s typed pointers.  Addresses are plain
integers (obtain one from `cbgr_allocate` or FFI); all offsets are BYTES.

```verum
memcpy(dst: Int, src: Int, n: Int) -> Int      // non-overlapping
memmove(dst: Int, src: Int, n: Int) -> Int     // overlap-safe
memset(dst: Int, value: Int, n: Int) -> Int    // fills value % 256
memzero(dst: Int, n: Int) -> Int
memcmp(a: Int, b: Int, n: Int) -> Int          // 0 / <0 / >0

strlen(s: Int) -> Int                          // to first NUL
strcmp(a: Int, b: Int) -> Int

load_byte(addr: Int) -> Int      store_byte(addr: Int, value: Int) -> Int
load_i32(addr: Int) -> Int       store_i32(addr: Int, value: Int) -> Int
load_i64(addr: Int) -> Int       store_i64(addr: Int, value: Int) -> Int
```

Conformance: `core-tests/intrinsics/runtime/mem_raw/` (overlap laws both
directions, first-NUL strlen, byte-granular addressing, platform-endianness
cross-check), driven over live `cbgr_allocate` blocks on both tiers.

### Sync (`runtime/sync.vr`)

```verum
futex_wait(uaddr: *mut Int32, expected, timeout) -> Int
futex_wake(uaddr, n) -> Int                futex_wake_one(uaddr) / futex_wake_all(uaddr)

spinlock_try_lock(uaddr) -> Bool
spinlock_lock(uaddr)                        spinlock_unlock(uaddr)
spinlock_is_locked(uaddr) -> Bool

spin_hint()  spin_loop_hint()
memory_fence(order)  compiler_fence(order)
```

### CBGR (`runtime/cbgr.vr`)

```verum
// Validation — non-trapping (returns the verdict; ChkRef-style traps are
// the deref-site checks, not this API)
cbgr_validate<T>(reference: &T) -> Bool
cbgr_current_epoch() -> UInt64
cbgr_advance_epoch()
cbgr_get_generation(ptr: *const Byte) -> UInt32

// Public allocation bridge — user-pointer API over the 32-byte
// AllocationHeader model (size@0, align@4, generation@8, epoch@12,
// flags@20).  Both tiers share the layout: AOT via the verum_cbgr_*
// runtime, the interpreter via a bit-identical implementation.
// Alignment is honoured up to 32 (power of two); 0 = failure.
cbgr_allocate(size: Int, align: Int) -> Int
cbgr_deallocate(user_ptr: Int)            // no-op on 0
cbgr_realloc(user_ptr: Int, new_size: Int) -> Int  // preserves min(old,new)
```

### Text (`runtime/text.vr`)

```verum
text_from_static(s: &'static str) -> Text
text_byte_len(t: &Text) -> Int

text_parse_int(t: &Text) -> Result<Int, ParseError>
text_parse_float(t: &Text) -> Result<Float, ParseError>
int_to_text(n: Int) -> Text       float_to_text(f: Float) -> Text

utf8_decode_char(bytes: *const Byte) -> (Char, Int)
utf8_decode_char_len(bytes: *const Byte) -> Int
char_encode_utf8(c: Char) -> (UInt32, Int)

char_is_alphabetic(c) / is_numeric / is_alphanumeric / is_whitespace / is_control
char_is_uppercase / is_lowercase
char_to_uppercase / to_lowercase
char_general_category(c) -> GeneralCategory
char_escape_debug(c) -> Text
```

### Execution mode (`runtime/mode.vr`)

```verum
is_interpreted() -> Bool       // true when running under the VBC interpreter
current_mode() -> ExecutionMode  // Interpreter | Aot
get_tier() -> ExecutionTier      // Tier0_Full | Tier1_Epoch |
                                 //   Tier2_Gen | Tier3_Unchecked
```

`ExecutionTier` is the CBGR safety tier of the *current reference*,
not the execution mode of the process. Execution mode is always one
of two values — Verum does not have a JIT.

---

## Low-level (`@llvm_only`) {#low-level}

Direct hardware intrinsics. **Not** available in the VBC interpreter.

### `lowlevel/mod.vr`

```verum
type CpuCapabilities is {
    has_128bit_simd: Bool,  has_256bit_simd: Bool,  has_512bit_simd: Bool,
    has_fma: Bool,           has_aes: Bool,          has_sha: Bool,
    has_crc32: Bool,         has_popcnt: Bool,       has_lzcnt: Bool,
    has_atomic_16b: Bool,
};
detect_capabilities() -> CpuCapabilities
const MAX_SIMD_WIDTH: Int;
const PREFERRED_SIMD_WIDTH: Int;
```

### `lowlevel/x86_64.vr` (x86_64 only)

```verum
type CpuFeatures is { has_sse3, ssse3, sse41, sse42, avx, avx2, avx512f,
                      avx512dq, avx512bw, avx512vl, fma, bmi1, bmi2,
                      popcnt, lzcnt, aes, pclmulqdq, sha, cx16 : Bool };
cpu_features() -> CpuFeatures
cpuid(leaf, subleaf) -> (UInt32, UInt32, UInt32, UInt32)

// SSE/SSE2
sqrtps(v: Vec4f) -> Vec4f       rcpps(v) -> Vec4f       rsqrtps(v) -> Vec4f
dpps<const MASK: UInt8>(a, b) -> Vec4f

// AVX/AVX2
haddps_256(a, b)    phaddd(a, b)    permd(a, indices)
gatherd_ps_256(base, indices, mask)
fmadd_ps_256(a, b, c)    fmsub_ps_256(a, b, c)

// AVX-512
add_ps_512_mask(a, b, mask)      fmadd_ps_512_mask(a, b, c, mask)
compress_ps_512(a, mask) / expand_ps_512(a, mask)
conflict_d_512(a)

// Bit manipulation
tzcnt / lzcnt / popcnt / bextr / pdep / pext

// Cryptographic
aesenc / aesenclast / aesdec
pclmulqdq<const IMM>(a, b)
sha256msg1 / sha256rnds2

// Privileged
rdmsr(reg) / wrmsr(reg, val)
read_cr0 / read_cr3 / write_cr3 / invlpg

// Timing / serialisation
rdtsc / rdtscp / mfence / lfence / sfence / pause

// Port I/O
inb(port) / outb(port, val) / inw / outw / inl / outl
```

### `lowlevel/aarch64.vr` (aarch64 only)

```verum
type Aarch64CpuFeatures is { has_neon, has_sve, sve2 : Bool,
                             sve_width: Int, has_dotprod, fp16, bf16, i8mm,
                             sha256, sha512, aes, crc32, lse, rdm : Bool };
cpu_features() -> Aarch64CpuFeatures

// NEON float
vfmaq_f32(a, b, c) / vfmsq_f32(a, b, c)
vsqrtq_f32(v)  vrecpeq_f32(v)  vrsqrteq_f32(v)   vrecpsq_f32(a, b)
vpaddq_f32(a, b)   vmaxvq_f32(v) / vminvq_f32(v) / vaddvq_f32(v)

// NEON integer
vpaddq_s16 / vmlal_s16 / vabdq_s8 / vqtbl1q_u8 / vrev32q_u8 / vrev64q_u8

// Dot-product
vdotq_s32(a, b) / vdotq_u32(a, b)

// Cryptographic
vaeseq_u8 / vaesmcq_u8 / vaesdq_u8
vsha256hq_u32 / vsha256h2q_u32 / vsha256su0q_u32
vmull_p64

// LSE atomics
ldadd_i64 / swp_i64 / cas_i64

// System registers
read_id_aa64isar0_el1 / isar1 / pfr0
read_cntvct_el0 / cntfrq_el0

// Memory barriers
dmb_sy / dmb_ish / dmb_ishst / dmb_ishld
dsb_sy / isb

// Cache
dc_cvac / dc_civac / ic_ivau

// Hints
yield_cpu / wfi / wfe / sev
```

### `lowlevel/kernel.vr`

```verum
// Startup entries
linux_x86_64_start()                 linux_aarch64_start()
baremetal_x86_64_start()             baremetal_aarch64_start()

// Interrupt prologues / epilogues
x86_64_interrupt_prologue() / epilogue / error_prologue
aarch64_exception_prologue() / epilogue
```

---

## Cross-references

- **[simd](/docs/stdlib/simd)** — high-level wrappers around SIMD intrinsics.
- **[math](/docs/stdlib/math)** — libm, tensor, GPU layers built on these intrinsics.
- **[mem](/docs/stdlib/mem)** — CBGR uses the atomic + memory intrinsics.
- **[sys](/docs/stdlib/sys)** — syscall intrinsics drive platform operations.
- **[Language → attributes](/docs/language/attributes)** — `@llvm_only`, `@requires_runtime`, `@target_feature`.
