---
sidebar_position: 1
title: math
---

# `core::math` — Pure-Verum mathematics

`core::math` is the largest module in the stdlib: a 9-layer stack
covering IEEE 754 utilities, elementary functions, linear algebra,
tensors, automatic differentiation, neural networks, and pure
mathematics (category theory, HoTT, ∞-topoi).

It is **libm-free** — no dependency on C's math library; every function
is implemented in Verum.

## Layer 0 — Foundation

### `math.ieee754`

```verum
is_nan(x)   is_infinite(x)   is_finite(x)   is_normal(x)   is_subnormal(x)
copysign(x, y)                signbit(x)
```

### `math.bits`

```verum
clz(x)    ctz(x)    popcnt(x)    rotl(x, n)    rotr(x, n)
is_power_of_two(x)    next_power_of_two(x)
```

### `math.checked`

Overflow-aware arithmetic:

```verum
checked_add(a, b) -> Maybe<T>
saturating_mul(a, b) -> T
wrapping_sub(a, b) -> T
```

### `math.libm`

Implementations of `sin`, `cos`, `exp`, `log`, etc., in pure Verum.

## Layer 1 — Scalar functions

### `math.constants`

```verum
PI    E    TAU    PHI    SQRT2    EPSILON    INFINITY    NAN
```

### `math.elementary`

```verum
sin, cos, tan, asin, acos, atan, atan2, sincos
exp, exp2, expm1, log, log2, log10, log1p
pow, powi, sqrt, cbrt, hypot
floor, ceil, round, rint, trunc, fract
min, max, clamp, abs, signum, fma
lerp, inverse_lerp, remap, smoothstep, smootherstep
```

### `math.special`

```verum
gamma, lgamma, digamma, beta, erf, erfc, erfinv
```

Safe variants (`sqrt_safe`, `log_safe`, etc.) return `Maybe<T>`.

## Layer 2 — Linear algebra

### `math.linalg`

BLAS-style API:

- **Level 1**: `dot`, `nrm2`, `asum`, `scal`, `axpy`, `copy`, `swap`.
- **Level 2**: `gemv`, `trsv`, `ger`, `syr`.
- **Level 3**: `gemm`, `trsm`, `syrk`.

Decompositions: `lu`, `qr`, `cholesky`, `svd`.
Solvers: `solve`, `inverse`, `determinant`.

```verum
let a: Matrix<3, 3, Float> = Matrix::from_rows([[1,2,3],[4,5,6],[7,8,10]]);
let (q, r) = a.qr();
let a_inv  = a.inverse()?;
```

## Layer 3 — Numerical analysis

### `math.calculus`

Numerical differentiation (forward/backward/central), integration
(trapezoid, Simpson, Romberg, Gauss–Legendre), ODE solvers (Euler,
Heun, midpoint, RK4, RK45), root finding (bisection, Newton, secant,
Brent), optimisation (gradient descent, Newton, BFGS).

### `math.random`

```verum
type Rng is protocol { ... };
type XorShift128, PCG : Rng;

let rng = PCG::seed(42);
let x = rng.uniform_01();          // [0.0, 1.0)
let n = rng.uniform(0, 100);
let g = rng.normal(mean = 0.0, std = 1.0);
```

## Layer 4 — Tensors

```verum
type Tensor<T, const S: Shape>;
type DynTensor<T>;

let t = zeros::<Float, shape[3, 4]>();
let u = t.reshape::<shape[12]>();
let m = matmul(a, b);              // compile-time shape check
let s = tensor.sum(axis = 0);
```

## Layer 5 — GPU

```verum
let device = GPUBackend::default();
let buf = device.allocate::<Float>(1024);
device.launch(LaunchConfig { grid: (32,), block: (32,) }, kernel, args);
```

## Layer 6 — Automatic differentiation

```verum
fn f(x: Float) -> Float { x * x * x - 2.0 * x + 1.0 }

let (y, dy_dx) = value_and_grad(f, 1.5);

// Higher-order
let jac = jacobian(multi_var_fn);
let hess = hessian(scalar_fn);

// Manual VJP
let (y, vjp) = vjp(f, x);
let cotangent = vjp(1.0);
```

## Layer 7 — Neural networks

```verum
let model = Sequential::new()
    .add(Linear::new(784, 256))
    .add(Activation.ReLU)
    .add(Linear::new(256, 10));

let optimiser = AdamW::new(model.parameters(), lr = 0.001);
for (x, y) in dataset {
    let (loss, grads) = value_and_grad(|p| loss_fn(p, x, y), model.parameters());
    optimiser.step(&grads);
}
```

## Layer 8 — State-space models & distributed

Mamba, Jamba (hybrid SSM + attention), distributed data parallel,
FSDP.

## Layer 9 — Agent systems

Tokeniser, KV cache, speculative decoding, ReAct agents, RAG.

## Pure mathematics

Category theory (`math.category`), HoTT (`math.hott`), cubical
(`math.cubical`), ∞-categories (`math.infinity_category`), ∞-topoi
(`math.infinity_topos`), Kan extensions, operads, synthetic
differential geometry.

These live alongside the applied math but are organised separately —
`math.algebra`, `math.topology`, `math.analysis`, `math.logic`,
`math.number_theory`.

## See also

- **[simd](/docs/stdlib/simd)** — portable SIMD.
- **[mathesis](/docs/stdlib/mathesis)** — ∞-topos of formal theories,
  Kan extensions at the theory level.
