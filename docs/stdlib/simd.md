---
sidebar_position: 2
title: simd
---

# `core::simd` — Portable SIMD

Portable vector types. The compiler emits SSE/AVX/AVX-512 on x86_64,
NEON on aarch64, and scalar fallbacks elsewhere.

## `Vec<T, N>`

```verum
let a: Vec<Float, 4> = Vec::splat(1.5);
let b: Vec<Float, 4> = Vec::from_array([1.0, 2.0, 3.0, 4.0]);
let c = a + b;

let sum = c.reduce_add();
```

Element types: `Float`, `Float32`, `Float64`, `Int8`…`Int64`,
`UInt8`…`UInt64`, `Bool`.

## Type aliases (common widths)

```
128-bit:   Vec4f, Vec2d, Vec4i, Vec2l, Vec16b, Vec8s
256-bit:   Vec8f, Vec4d, Vec8i, Vec4l, Vec32b, Vec16s
512-bit:   Vec16f, Vec8d, Vec16i, Vec8l, Vec64b, Vec32s
```

## Arithmetic

```verum
a + b     a - b     a * b     a / b
fma(a, b, c)          // a * b + c
abs(a)    neg(a)      min(a, b)     max(a, b)
```

## Reduction

```verum
a.reduce_add()    a.reduce_mul()
a.reduce_min()    a.reduce_max()
```

## Comparison

```verum
let mask: Mask<4> = a.lt(b);
mask.all()        mask.any()    mask.count()
```

## Masks

```verum
let m: Mask<8> = Mask::from_array([true, false, true, false, true, false, true, false]);
let result = m.select(a, b);    // where m is true, pick a, else b
```

## Memory

```verum
let v = Vec::<Float, 4>::load_aligned(&data[0]);
v.store_aligned(&mut out[0]);

let v = Vec::<Float, 4>::load_unaligned(&data[0]);
v.store_unaligned(&mut out[0]);
```

## Gather / scatter

```verum
let values = Vec::<Float, 4>::gather(&table, indices);
values.scatter(&mut output, indices);
```

## Shuffle

```verum
let rev = v.shuffle::<[3, 2, 1, 0]>();
let dup = v.shuffle::<[0, 0, 1, 1]>();
```

## CPU feature flags

```verum
const HAS_SSE42:  Bool;
const HAS_AVX:    Bool;
const HAS_AVX2:   Bool;
const HAS_AVX512: Bool;
const HAS_NEON:   Bool;
```

Used for conditional compilation:

```verum
@cfg(HAS_AVX2)
fn fast_path(data: &[Float]) { ... }
```

## Runtime dispatch

```verum
@multiversion
fn sum(data: &[Float]) -> Float { ... }
// Compiler emits multiple versions; the runtime picks one via CPUID.
```

## See also

- **[math](/docs/stdlib/math)** — SIMD-accelerated math routines.
- **[intrinsics](/docs/stdlib/intrinsics)** — lower-level SIMD intrinsics.
