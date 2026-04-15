---
title: Shape-safe dependent-typed arrays
description: Matrix / tensor shapes as types — mismatched multiplication is a compile error.
---

# Shape-safe arrays

Dependent types encode array shapes at compile time. The classic
example: matrix multiplication that rejects incompatible shapes
without a runtime check.

### Static matrix type

```verum
use core.math.tensor::*;

/// M x N matrix of T, shape known at compile time.
type Matrix<const M: Int, const N: Int, T> is Tensor<T, shape![M, N]>;
```

Verum's `Tensor<T, Shape>` already carries shape in the type. `Matrix`
is just a friendlier alias.

### Construction

```verum
let a: Matrix<2, 3, Float> = Tensor::from_slice::<Float, shape![2, 3]>(&[
    1.0, 2.0, 3.0,
    4.0, 5.0, 6.0,
]);

let b: Matrix<3, 2, Float> = Tensor::from_slice::<Float, shape![3, 2]>(&[
    7.0,  8.0,
    9.0, 10.0,
    11.0, 12.0,
]);
```

### Multiplication with shape inference

```verum
/// Matrix multiply: (M x K) × (K x N) -> (M x N)
fn matmul<const M: Int, const K: Int, const N: Int>(
    a: &Matrix<M, K, Float>,
    b: &Matrix<K, N, Float>,
) -> Matrix<M, N, Float> {
    a.matmul(b)      // stdlib tensor op; shape proven at compile time
}

let c = matmul(&a, &b);          // c: Matrix<2, 2, Float>
```

Try to call `matmul(&a, &a)`:

```
error[V3402]: cannot unify shapes
  --> src/main.vr:14:13
   |
14 |     let c = matmul(&a, &a);
   |             ^^^^^^^^^^^^^^
   |  expected inner dimension 3 == 3
   |   found    inner dimension 3 != 2
   = note: `a` has shape [2, 3]; `matmul` expects second arg to start with dim 3.
```

The error is at **compile time**. No tests required.

### Refinement on shape dimensions

```verum
/// Square matrix of size N.
type SquareMatrix<const N: Int, T> is Matrix<N, N, T>
    where N > 0;

fn determinant<const N: Int { self > 0 }>(m: &SquareMatrix<N, Float>) -> Float {
    // Shape is [N, N]; can be safely handled by LU decomposition.
    m.det()
}
```

### Broadcasting with shape constraints

```verum
/// Element-wise addition with broadcasting.
fn add_broadcast<const M: Int, const N: Int>(
    a: &Matrix<M, N, Float>,
    b: &Tensor<Float, shape![N]>,          // row vector
) -> Matrix<M, N, Float> {
    a + b.broadcast::<shape![M, N]>()
}
```

The `broadcast::<shape![M, N]>()` call tells the compiler the target
shape; if the source shape can't broadcast to it, compile error.

### Concatenation

```verum
/// Stack two matrices row-wise.
fn vstack<const M1: Int, const M2: Int, const N: Int>(
    a: &Matrix<M1, N, Float>,
    b: &Matrix<M2, N, Float>,
) -> Matrix<{M1 + M2}, N, Float> {
    concat(&[a, b], axis = 0)
}
```

`{M1 + M2}` is type-level arithmetic — the compiler resolves it at
monomorphisation.

### Dynamic shapes when you need them

```verum
/// Same function, dynamic shapes. Fails at runtime if incompatible.
fn matmul_dyn(a: &DynTensor<Float>, b: &DynTensor<Float>) -> Result<DynTensor<Float>, Error> {
    if a.shape().dim(-1) != b.shape().dim(0) {
        return Result.Err(Error::new(&"shape mismatch"));
    }
    Result.Ok(a.matmul(b))
}
```

Use `DynTensor<T>` when shapes are not known until runtime (e.g.,
tensors loaded from a file). Mix freely with static tensors —
`tensor.to_dyn()` and `tensor.try_reshape_static::<Shape>()` convert.

### Dependent type in function signature

```verum
/// Return a zero vector of length n (n determined at call site).
fn zeros<const n: Int { self >= 0 }>() -> Tensor<Float, shape![n]> {
    Tensor::zeros::<Float, shape![n]>()
}

let z: Tensor<Float, shape![10]> = zeros::<10>();
```

### Common patterns

| What | How |
|---|---|
| Fixed-size vector | `Tensor<T, shape![N]>` |
| Fixed-size matrix | `Matrix<M, N, T>` (alias above) |
| Batched matrix  | `Tensor<T, shape![B, M, N]>` |
| Runtime-shape | `DynTensor<T>` |
| Shape-polymorphic | `fn f<const S: Shape>(t: &Tensor<T, S>)` |

### See also

- **[math → tensor](/docs/stdlib/math#layer-4--tensor-system)**
- **[Dependent types](/docs/language/dependent-types)** — the underlying
  type-system feature.
- **[Small NN tutorial](/docs/tutorials/small-nn)** — real use of
  shape-typed tensors in training.
