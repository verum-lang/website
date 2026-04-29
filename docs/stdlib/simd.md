---
sidebar_position: 2
title: simd
description: Portable SIMD — Vec<T,N>, Mask<N>, arithmetic, reduction, shuffle, gather/scatter, GPU.
---

# `core.simd` — Portable SIMD

Vectorised data types with platform dispatch. On x86_64 you get
SSE/AVX/AVX-512 where available; on aarch64 you get NEON/SVE; scalar
fallbacks on other targets.

| File | What's in it |
|---|---|
| `mod.vr` | `SimdElement`, `Vec<T,N>`, `Mask<N>`, arithmetic, reduction, shuffle, gather/scatter, CPU flags |
| `gpu.vr` | `GpuDevice`, `GpuBackend`, `GpuConfig`, `GpuBuffer<T>`, `Grid`, `Block`, device intrinsics |

---

## `Vec<T, N>`

```verum
type SimdElement is protocol {
    const BITS: Int;
    const LANES_128: Int;
    const LANES_256: Int;
    const LANES_512: Int;
}

type Vec<T: SimdElement, N: meta USize> is (/* opaque — SIMD register */);
```

### Aliases (most commonly used widths)

```verum
// 128-bit
type Vec4f  = Vec<Float32, 4>;
type Vec2d  = Vec<Float64, 2>;
type Vec4i  = Vec<Int32, 4>;
type Vec2l  = Vec<Int64, 2>;
type Vec16b = Vec<Int8, 16>;
type Vec8s  = Vec<Int16, 8>;

// 256-bit
type Vec8f, Vec4d, Vec8i, Vec4l, Vec32b, Vec16s;

// 512-bit
type Vec16f, Vec8d, Vec16i, Vec8l, Vec64b, Vec32s;
```

### Construction

```verum
Vec<T, N>.splat(value: T) -> Vec<T, N>                   // broadcast scalar
Vec<T, N>.from_array(arr: [T; N]) -> Vec<T, N>
v.to_array() -> [T; N]

Vec<T, N>.load_aligned(ptr: *const T) -> Vec<T, N>       // aligned
Vec<T, N>.load_unaligned(ptr: *const T) -> Vec<T, N>
v.store_aligned(ptr: *mut T)
v.store_unaligned(ptr: *mut T)
```

### Arithmetic

```verum
v.add(&other)    v.sub(&other)    v.mul(&other)    v.div(&other)
v.fma(&b, &c)                           // (self * b) + c, single rounding
v.abs()          v.neg()
v.min(&other)    v.max(&other)
```

### Reduction

```verum
v.reduce_add() -> T        v.reduce_mul() -> T
v.reduce_min() -> T        v.reduce_max() -> T
```

### Comparison → `Mask<N>`

```verum
v.cmp_lt(&other) -> Mask<N>        v.cmp_le(&other)
v.cmp_gt(&other)                    v.cmp_ge(&other)
v.cmp_eq(&other)                    v.cmp_ne(&other)
```

### Conditional operations via masks

```verum
Vec<T, N>.select(mask: Mask<N>, a: Vec<T, N>, b: Vec<T, N>) -> Vec<T, N>
v.masked_load(ptr, mask: Mask<N>) -> Vec<T, N>
v.masked_store(ptr, mask: Mask<N>)
```

### Shuffle / permute

```verum
v.shuffle<const MASK: [UInt32; N]>(&other) -> Vec<T, N>
v.reverse() -> Vec<T, N>
v.rotate_left<const COUNT: USize>() -> Vec<T, N>
```

### Gather / scatter

```verum
Vec<T, N>.gather(base: *const T, indices: Vec<Int32, N>) -> Vec<T, N>
v.scatter(base: *mut T, indices: Vec<Int32, N>)
Vec<T, N>.masked_gather(base, indices, mask: Mask<N>, default) -> Vec<T, N>
v.masked_scatter(base, indices, mask: Mask<N>)
```

---

## `Mask<N>`

```verum
type Mask<N: meta USize> is (/* opaque — SIMD mask */);

// Aliases
type Mask4, Mask8, Mask16;

Mask<N>.all()     Mask<N>.none()
m.count() -> USize              m.any() -> Bool      m.all_active() -> Bool
m.and(&other) / m.or(&other) / m.not()
```

---

## CPU feature flags (compile-time constants)

```verum
const HAS_SSE42:  Bool;
const HAS_AVX:    Bool;
const HAS_AVX2:   Bool;
const HAS_AVX512: Bool;
const HAS_NEON:   Bool;
```

Used with `@cfg` for conditional compilation:

```verum
@cfg(HAS_AVX2)
fn fast_dot(a: &[Float32], b: &[Float32]) -> Float32 {
    let mut acc = Vec8f.splat(0.0);
    for chunk in (0..a.len()).step_by(8) {
        let va = Vec8f.load_aligned(&a[chunk]);
        let vb = Vec8f.load_aligned(&b[chunk]);
        acc = va.fma(&vb, acc);
    }
    acc.reduce_add()
}
```

The `@multiversion` attribute emits several variants and dispatches
via CPUID at runtime — see [intrinsics → platform](/docs/stdlib/intrinsics#platform).

---

## GPU (`simd.gpu`)

SIMT primitives for `@gpu.kernel` functions and device orchestration.

### Types

```verum
type GpuBackend is Cuda | Rocm | Metal | Vulkan;

type GpuDevice is {
    id: Int,
    name: Text,
    compute_capability: Int,
    memory_bytes: Int,
    max_threads_per_block: Int,
    max_shared_memory: Int,
    warp_size: Int,
};

type GpuConfig is {
    backend: GpuBackend,
    opt_level: Int,
    enable_tensor_cores: Bool,
    max_shared_memory: Int,
    default_block_size: Int,
    enable_async_copy: Bool,
    compute_capability: Int,
};

type GpuBuffer<T> is { ptr: Int, len: Int, size_bytes: Int, device_id: Int };

type TransferKind is HostToDevice | DeviceToHost | DeviceToDevice;

type Grid  is { x: Int, y: Int, z: Int };
type Block is { x: Int, y: Int, z: Int };
```

### Grid & Block helpers

```verum
Grid.d1(x)  Grid.d2(x, y)  Grid.d3(x, y, z)
Block.d1(x) Block.d2(x, y) Block.d3(x, y, z)
block.total_threads() -> Int
```

### Config factories

```verum
GpuConfig.metal() -> GpuConfig          GpuConfig.cuda(sm_version: Int)
GpuConfig.rocm() -> GpuConfig           GpuConfig.vulkan() -> GpuConfig
GpuConfig.auto() -> GpuConfig            // probe and pick
```

### Thread intrinsics (inside `@device(gpu)` scope)

```verum
thread_id_x() -> Int       thread_id_y() -> Int       thread_id_z() -> Int
block_id_x() -> Int        block_id_y() -> Int        block_id_z() -> Int
block_dim_x() -> Int       block_dim_y() -> Int       block_dim_z() -> Int
grid_dim_x() -> Int        grid_dim_y() -> Int        grid_dim_z() -> Int

sync_threads()             sync_warp()
warp_size() -> Int
global_thread_id() -> Int
global_thread_id_2d() -> (Int, Int)
```

### Shared memory

```verum
shared_alloc(size_bytes: Int) -> Int
shared_load_i64(ptr, offset) -> Int
shared_store_i64(ptr, offset, value: Int)
shared_load_f64(ptr, offset) -> Float
shared_store_f64(ptr, offset, value: Float)

shared_atomic_add_i64(ptr, offset, value) -> Int
shared_atomic_add_f64(ptr, offset, value) -> Float
```

### Example — element-wise vector addition

```verum
@gpu.kernel
fn vec_add(a: &[Float], b: &[Float], c: &mut [Float], n: Int) {
    let i = global_thread_id();
    if i < n {
        c[i] = a[i] + b[i];
    }
}

fn main() using [IO, GpuDevice] {
    let cfg = GpuConfig.auto();
    let a = GpuBuffer.from_slice(&[1.0, 2.0, 3.0, 4.0]);
    let b = GpuBuffer.from_slice(&[10.0, 20.0, 30.0, 40.0]);
    let mut c = GpuBuffer<Float>.allocate(4);

    vec_add<<<Grid.d1(1), Block.d1(4)>>>(&a, &b, &mut c, 4);

    let host = c.to_host();
    print(f"{host:?}");    // [11.0, 22.0, 33.0, 44.0]
}
```

---

## Byte-scan primitives — `core.simd.bytes`

High-level SIMD helpers for parsers (HTTP, JSON, CSV), checksums, and
encoding. Built on `Vec<UInt8, N>`; SIMD width auto-selected per
target at build time; runtime dispatch via `@multiversion`.

```verum
// Single-byte search
find_byte(haystack: &[Byte], needle: Byte) -> Maybe<Int>

// Any-of-many bytes
find_any_of(haystack: &[Byte], needles: &[Byte]) -> Maybe<(Int, Int)>
  // (index, which-needle)

// HTTP header terminator (\r\n\r\n or \n\n)
find_header_terminator(haystack: &[Byte]) -> Maybe<Int>

// Substring — two-way + SIMD block-scan
find_subslice(haystack: &[Byte], needle: &[Byte]) -> Maybe<Int>

// UTF-8 validation — Lemire-style branchless
is_valid_utf8(bytes: &[Byte]) -> Bool

// JSON structural-char / whitespace skip
skip_whitespace(bytes: &[Byte]) -> Int

// CRC-32C (Castagnoli — SSE4.2 accelerated)
crc32c(bytes: &[Byte]) -> u32
crc32c_update(prev: u32, bytes: &[Byte]) -> u32

// Base64 encode/decode (SIMD ~4-5× scalar)
base64_encode(input: &[Byte], out: &mut List<Byte>) -> Int
base64_decode(input: &[Byte], out: &mut List<Byte>) -> Result<Int, Int>

// Hex encode/decode
hex_encode(input: &[Byte], out: &mut List<Byte>) -> Int
hex_decode(input: &[Byte], out: &mut List<Byte>) -> Result<Int, Int>
```

Use cases:

| Primitive | Framework use |
|---|---|
| `find_byte` | HTTP/1.1 header parser — find `\r\n`, `:`, `;` |
| `find_any_of` | JSON — find any structural char (`{`, `}`, `[`, `]`, `,`, `:`, `"`) |
| `find_header_terminator` | End-of-HTTP-headers detection (single call) |
| `find_subslice` | Router-prefix match, path-in-buffer find |
| `is_valid_utf8` | Text decode at network boundary |
| `skip_whitespace` | JSON parser pre-pass |
| `crc32c` | QUIC header integrity, DB block checksums |
| `base64_encode/decode` | HTTP Basic auth, JWT, binary transport |
| `hex_encode/decode` | Hash-digest display, bytea wire format |

## Implementation status

| Layer | Status |
|---|---|
| `Vec<T, N>` / `Mask<N>` types | Complete (69 public ops) |
| `SimdElement` protocol impls for all int/float primitives | Complete |
| `@intrinsic("simd_*")` declarations | Complete |
| **LLVM backend lowering to `<N x T>` vector ops** | **In progress (compiler-level)** |
| `@multiversion` runtime CPU-feature dispatch | In progress (compiler-level) |
| SWAR fallback for non-SIMD targets | Planned |
| High-level byte-scan helpers (`simd.bytes`) | Complete (declarations) |
| Benchmarks vs hand-written C | Planned (after backend) |

## Cross-references

- **[math → tensor](/docs/stdlib/math)** — tensor operations built on SIMD/GPU.
- **[intrinsics → simd / gpu / lowlevel](/docs/stdlib/intrinsics)** — the lower-level intrinsic functions.
- **[Language → attributes](/docs/language/attributes)** — `@multiversion`, `@vectorize`, `@gpu.kernel`.
