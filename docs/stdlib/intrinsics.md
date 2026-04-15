---
sidebar_position: 5
title: intrinsics
---

# `core::intrinsics` — Compiler intrinsics

Intrinsics are operations the compiler knows about directly: they
compile to specific CPU instructions, runtime calls, or are replaced
by constants at compile time.

User code rarely touches `intrinsics` — higher-level modules wrap
them with safer APIs. This reference is for writing the stdlib itself.

## Categories

### Arithmetic

```verum
fn add<T>(a: T, b: T) -> T;
fn add_checked<T>(a: T, b: T) -> Maybe<T>;
fn add_wrapping<T>(a: T, b: T) -> T;
fn add_saturating<T>(a: T, b: T) -> T;
// sub, mul, div, rem: same family
```

### Bitwise

```verum
fn and<T>(a: T, b: T) -> T;
fn or<T>(a: T, b: T) -> T;
fn xor<T>(a: T, b: T) -> T;
fn shl<T>(a: T, n: Int) -> T;
fn shr<T>(a: T, n: Int) -> T;
fn rol<T>(a: T, n: Int) -> T;
fn ror<T>(a: T, n: Int) -> T;
fn clz<T>(a: T) -> Int;            // count leading zeros
fn ctz<T>(a: T) -> Int;            // count trailing zeros
fn popcnt<T>(a: T) -> Int;         // population count
```

### Float

```verum
fn sqrt(x: Float) -> Float;
fn sin(x: Float) -> Float;
fn cos(x: Float) -> Float;
fn exp(x: Float) -> Float;
fn log(x: Float) -> Float;
fn fma(a: Float, b: Float, c: Float) -> Float;    // fused multiply-add
fn is_nan(x: Float) -> Bool;
fn is_infinite(x: Float) -> Bool;
fn is_finite(x: Float) -> Bool;
```

### Memory

```verum
unsafe fn memcpy(dst: *mut Byte, src: *const Byte, n: Int);
unsafe fn memmove(dst: *mut Byte, src: *const Byte, n: Int);
unsafe fn memset(dst: *mut Byte, b: Byte, n: Int);
unsafe fn ptr_read<T>(p: *const T) -> T;
unsafe fn ptr_write<T>(p: *mut T, v: T);
```

### Atomic

```verum
fn atomic_load<T>(p: *const T, order: MemoryOrder) -> T;
fn atomic_store<T>(p: *mut T, v: T, order: MemoryOrder);
fn atomic_cmpxchg<T>(p: *mut T, old: T, new: T, success: MemoryOrder, failure: MemoryOrder) -> Result<T, T>;
fn fence(order: MemoryOrder);

type MemoryOrder is
    | Relaxed
    | Acquire
    | Release
    | AcqRel
    | SeqCst;
```

### Type info

```verum
fn size_of<T>()  -> Int;       // size in bytes
fn align_of<T>() -> Int;       // alignment in bytes
fn type_id<T>()  -> TypeId;    // unique runtime type identifier
fn type_name<T>() -> Text;     // human-readable type name
```

### Conversion

```verum
unsafe fn bitcast<T, U>(x: T) -> U where size_of<T>() == size_of<U>();
unsafe fn transmute<T, U>(x: T) -> U;
```

### Control

```verum
fn trap() -> !;              // abort — "this should never execute"
fn unreachable() -> !;       // same, with diagnostic
fn assume(cond: Bool);       // tell the optimiser `cond` holds
fn likely(cond: Bool) -> Bool;      // branch hint
fn unlikely(cond: Bool) -> Bool;    // branch hint
fn prefetch(p: *const Byte, intent: Prefetch);
```

### Platform

```verum
fn target_family() -> Text;    // "unix", "windows", "wasm"
fn target_os()     -> Text;    // "linux", "macos", "windows"
fn target_arch()   -> Text;    // "x86_64", "aarch64"
fn has_cpu_feature(f: Text) -> Bool;     // "avx2", "neon", etc.
```

### SIMD

```verum
fn simd_splat<T, const N: Int>(x: T) -> Vec<T, N>;
fn simd_add<T, const N: Int>(a: Vec<T, N>, b: Vec<T, N>) -> Vec<T, N>;
fn simd_extract<T, const N: Int>(v: Vec<T, N>, i: Int) -> T;
fn simd_insert<T, const N: Int>(v: Vec<T, N>, i: Int, x: T) -> Vec<T, N>;
fn simd_shuffle<const MASK: [Int]>(a: Vec<T, N>, b: Vec<T, N>) -> Vec<T, N>;
fn simd_reduce_add<T, const N: Int>(v: Vec<T, N>) -> T;
// ... and many more
```

See **[simd](/docs/stdlib/simd)**.

## Runtime intrinsics

Marked `@requires_runtime` — only available under runtimes that
provide them (async, tls, sync, syscalls).

```verum
// Async runtime
fn spawn_with_env<T>(env: ExecutionEnv, task: Future<T>) -> JoinHandle<T>;
fn executor_block_on<T>(f: Future<T>) -> T;

// Thread-local storage
fn tls_get_base() -> *mut Byte;
fn tls_slot_get(slot: Int) -> Maybe<Int>;

// Time
fn monotonic_nanos() -> UInt64;
fn realtime_nanos() -> UInt64;
fn num_cpus() -> Int;

// Direct syscalls (Linux)
unsafe fn syscall6(num: Int, a0: Int, ..., a5: Int) -> Int;
```

## LLVM-only intrinsics

Marked `@llvm_only` — cannot run in the VBC interpreter, used for
inline SSE/AVX/NEON, CPU privileged instructions, and kernel entry
points:

```verum
@llvm_only fn sse_sqrt_ps(v: Vec<Float, 4>) -> Vec<Float, 4>;
@llvm_only fn x86_cpuid(leaf: Int) -> (Int, Int, Int, Int);
@llvm_only unsafe fn naked_entry() -> !;
```

## See also

- **[Architecture → codegen](/docs/architecture/codegen)** — how
  intrinsics are lowered.
- **[simd](/docs/stdlib/simd)** — portable SIMD built on SIMD intrinsics.
- **[sys](/docs/stdlib/sys)** — V-LLSI kernel layer using runtime intrinsics.
