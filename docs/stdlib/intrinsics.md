---
sidebar_position: 5
title: intrinsics
description: 700+ compiler intrinsics — arithmetic, bitwise, float, memory, atomic, tensor, GPU, runtime, low-level.
---

# `core::intrinsics` — Compiler intrinsics

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

// Saturating — clamp at T::MIN / T::MAX
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

Backs the high-level `tensor<Shape>T` literals and `math::tensor` API.
Selected intrinsics:

```verum
// Creation
tensor_new<const S: Shape, D>()                 tensor_fill<S, V, D>()
tensor_from_slice<T, S, D>()                    tensor_from_array<T>()
tensor_arange<S, E, T>()                        tensor_linspace<S, E>()
tensor_rand<S>()                                tensor_randn<S>()
tensor_randint<S>()                              tensor_clone()     tensor_eye()

// Shape
tensor_reshape<const S: Shape>()                tensor_transpose()
tensor_permute<const P>()                        tensor_squeeze()    tensor_unsqueeze()
tensor_repeat<const R>()                         tensor_contiguous()

// Indexing
tensor_slice<S>()                                tensor_index<I>()
tensor_index_select<I>()                         tensor_gather()
tensor_concat()                                  tensor_stack()
tensor_split()                                   tensor_broadcast<S>()

// Element-wise
tensor_binop()    tensor_unop()    tensor_cmp()    tensor_where()
tensor_clamp()    tensor_cast<D>()  tensor_masked_fill()
tensor_lerp()

// Linear algebra
tensor_matmul()   tensor_mm()   tensor_mv()     tensor_bmm()
tensor_dot()      tensor_outer()                tensor_einsum<const E>()

// Decompositions
tensor_svd()      tensor_qr()   tensor_lu()     tensor_cholesky()
tensor_eig()      tensor_eigh()

// Solvers
tensor_solve()    tensor_tri_solve()             tensor_inverse()
tensor_det()       tensor_trace()

// Reduction
tensor_reduce()   tensor_reduce_all()            tensor_argmax()
tensor_topk()     tensor_cumulative()

// Normalisation
tensor_softmax()  tensor_log_softmax()
tensor_layer_norm() tensor_batch_norm() tensor_rms_norm()

// Convolutions
tensor_conv()     tensor_conv2d()

// Advanced
tensor_scatter()  tensor_nonzero()               tensor_one_hot()
tensor_fft()      tensor_flash_attention()       tensor_norm()
```

---

## GPU

Orchestration intrinsics used by `math::gpu` and `@gpu.kernel`.

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
tls_slot_get(slot) -> Maybe<Int>   tls_slot_set(slot, value)
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
cbgr_validate<T>(ptr: *const T) -> Bool
cbgr_current_epoch() -> UInt64
cbgr_advance_epoch()
cbgr_get_generation(ptr) -> UInt32
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

### Tier (`runtime/tier.vr`)

```verum
tier_promote()               // hint: worth promoting from interpreter to JIT
is_interpreted() -> Bool
get_tier() -> ExecutionTier
```

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
