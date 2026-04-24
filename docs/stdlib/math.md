---
sidebar_position: 1
title: math
description: Layered mathematics stack — libm, linalg, calculus, tensors, autodiff, NN, SSM, agents, pure math.
---

# `core.math` — Mathematics

The largest module in the stdlib — a 10-layer mathematical stack plus a
substantial pure-mathematics branch. libm-free: every function is
implemented in Verum on top of CPU intrinsics.

This page is an index of every layer and sub-module. Deep APIs
(hundreds of functions per layer) are listed here in summary form;
follow the source links for complete signatures.

## Layer overview

```
Layer 9  Agents & LLM                          agent/ (tokenizer, KV cache, ReAct, RAG)
Layer 8  State-space models + distributed       ssm/  distributed/
Layer 7  Neural networks                        nn/
Layer 6  Automatic differentiation              autodiff/
Layer 5  GPU / accelerator                      gpu/
Layer 4  Tensor system                          tensor/
Layer 3  Numerical analysis & random            calculus/  random/
Layer 2  Linear algebra (BLAS-style)            linalg/
Layer 1  Scalar math                            constants/ elementary/ hyperbolic/ special/
Layer 0  Foundation                             ieee754/ integers/ bits/ checked/ libm/
```

**Pure mathematics** (parallel branch): `algebra/`, `category/`,
`topology/`, `analysis/`, `logic/`, `hott/`, `cubical/`,
`simplicial/`, `infinity_category/`, `infinity_topos/`,
`kan_extension/`, `fibration/`, `model_category/`, `operad/`,
`number_theory/`.

**∞-topos foundations**: `quantum_logic/`, `giry/`, `epistemic/`,
`cohesive/`, `day_convolution/`, `sdg/`.

**Others**: `complex/`, `category_finite/`, `bitvec/`,
`observational/`, `examples/`, `internal/`, `simple/`, `advanced/`,
`tactics/`.

---

## Layer 0 — Foundation

### `math.ieee754`

```verum
type FpCategory is NaN | Infinite | Zero | Subnormal | Normal;

f64_decompose(f: Float64) -> (sign: Bool, exp: Int, mantissa: UInt64)
f32_decompose(f: Float32) -> (Bool, Int, UInt32)
f64_compose(sign, exp, mantissa) -> Float64
f32_compose(sign, exp, mantissa) -> Float32

classify(f: Float64) -> FpCategory         classify_f32(f: Float32) -> FpCategory
is_nan / is_infinite / is_finite / is_normal / is_subnormal
copysign(x, y)          signbit(x) -> Bool
```

### `math.integers`

```verum
type DivMode is Truncate | Floor | Ceiling | Euclidean;

div_floor(a, b)         div_ceiling(a, b)
div_euclidean(a, b)     mod_euclidean(a, b)   mod_floor(a, b)
div(a, b, mode: DivMode)                      divmod(a, b) -> (q, r)

gcd(a, b) -> Int        gcd_binary(a, b) -> Int      lcm(a, b) -> Int
extended_gcd(a, b) -> (gcd, x, y)                  // ax + by = gcd
mod_inverse(a, m) -> Maybe<Int>
mod_pow(base, exp, m) -> Int
```

### `math.bits`

```verum
clz(x) / clz32(x)              ctz(x) / ctz32(x)
popcnt(x) / popcnt32(x)
ffs(x) / ffs32(x)              fls(x) / fls32(x)
highest_bit(x) / lowest_bit(x)
rotl(x, n) / rotr(x, n)        rotl32 / rotr32
bswap(x) / bswap32 / bswap16
bitreverse(x)
```

### `math.checked`

Overflow-safe arithmetic wrappers (thin layer over intrinsics, but
using refinement types to document invariants).

### `math.libm`

Pure-Verum libm. `sin`, `cos`, `exp`, `log`, `pow`, etc. — all
implemented on top of the bit-level primitives above. No C library
dependency.

---

## Layer 1 — Scalar math

### `math.constants`

```verum
const PI: Float          const E: Float             const TAU: Float
const PHI: Float         const SQRT2: Float
const EPSILON: Float     const INFINITY: Float       const NAN: Float

// Refinement-based semantic aliases
type NonNegative is Float { self >= 0.0 };
type Positive    is Float { self > 0.0 };
type UnitInterval is Float { 0.0 <= self && self <= 1.0 };
type Probability is UnitInterval;
type Angle       is Float;           // radians
```

### `math.elementary`

```verum
// Trigonometry
sin(x) / cos(x) / tan(x)               asin(x) / acos(x) / atan(x) / atan2(y, x)
sincos(x) -> (Float, Float)

// Exponentials & logs
exp(x) / exp2(x) / expm1(x)            log(x) / log2(x) / log10(x) / log1p(x)

// Powers & roots
pow(x, y) / powi(x, n: Int)            sqrt(x) / cbrt(x) / hypot(x, y)

// Rounding
floor / ceil / round / rint / trunc / fract

// Min/max/clamp
min(a, b) / max(a, b) / clamp(x, lo, hi)
abs(x) / signum(x)

// Fused operations
fma(a, b, c)                            // (a*b + c) with single rounding
lerp(a, b, t)                            // linear interpolation
inverse_lerp(a, b, x) -> Float           // where x sits in [a, b]
remap(x, lo1, hi1, lo2, hi2) -> Float    // remap x from [lo1, hi1] to [lo2, hi2]
smoothstep(edge0, edge1, x) / smootherstep(edge0, edge1, x)

// Safe variants — return Maybe<T>
sqrt_safe(x) / log_safe(x) / asin_safe(x) / acos_safe(x)
```

### `math.hyperbolic`

```verum
sinh / cosh / tanh                     asinh / acosh / atanh
```

### `math.special`

```verum
gamma(x) / lgamma(x) / digamma(x)
beta(x, y) / lbeta(x, y)
erf(x) / erfc(x) / erfinv(x)
```

---

## Layer 2 — Linear algebra

### `math.linalg`

BLAS-style API. Types: `Vector<T>`, `Matrix<T>`, `StaticVector<T, const N>`,
`StaticMatrix<T, const R, const C>`, and the `Numeric` protocol.

```verum
// Level 1 (vector ops)
dot(a, b) -> T                          nrm2(a) -> T           asum(a) -> T
iamax(a) -> Int                          // index of max |element|
scal(alpha, a)                            axpy(alpha, x, y)      // y := αx + y
copy(src, dst)                            swap(a, b)
rotg(a, b) -> (c, s)                     rot(x, y, c, s)

// Level 2 (matrix-vector)
gemv(alpha, A, x, beta, y)               // y := α A x + β y
trsv(upper, A, x)                         // triangular solve
ger(alpha, x, y, A)                       // A := α x yᵀ + A
syr(alpha, x, A)                           // symmetric rank-1

// Level 3 (matrix-matrix)
gemm(alpha, A, B, beta, C)               // C := α A B + β C
trsm(upper, alpha, A, B)                  // triangular solve
syrk(alpha, A, beta, C)                   // symmetric rank-k

// Decompositions
lu(A) -> LUDecomposition<T>
qr(A) -> QRDecomposition<T>
cholesky(A) -> CholeskyDecomposition<T>
svd(A) -> SvdDecomposition<T>

// Solvers
determinant(A) -> T
inverse(A) -> Maybe<Matrix<T>>
solve(A, b) -> Maybe<Vector<T>>           // Ax = b
```

---

## Layer 3 — Numerical analysis & random

### `math.calculus`

```verum
// Differentiation
forward_diff(f, x, h) -> Float
backward_diff(f, x, h) -> Float
central_diff(f, x, h) -> Float

// Integration
trapezoid(f, a, b, n) -> Float
simpson(f, a, b, n) -> Float
romberg(f, a, b, tol) -> Float
gauss_legendre(f, a, b, n) -> Float

// ODE solvers
euler(f, t0, y0, h, n) -> List<Float>
heun(f, t0, y0, h, n) -> List<Float>
midpoint(f, t0, y0, h, n) -> List<Float>
rk4(f, t0, y0, h, n) -> List<Float>
rk45(f, t0, y0, h_init, tol) -> List<(Float, Float)>   // adaptive

// Root finding
bisection(f, a, b, tol) -> Maybe<Float>
newton(f, df, x0, tol, max_iter) -> Maybe<Float>
secant(f, x0, x1, tol, max_iter) -> Maybe<Float>
brent(f, a, b, tol) -> Maybe<Float>

// Optimisation
gradient_descent(f, grad, x0, lr, max_iter) -> Vector<Float>
newton_optimize(f, grad, hess, x0, tol) -> Vector<Float>
bfgs(f, grad, x0, tol, max_iter) -> Vector<Float>
```

### `math.random`

```verum
type RandomKey is UInt64;
type Rng is protocol {
    fn next_u64(&mut self) -> UInt64;
    fn split(&self) -> (RandomKey, RandomKey);
};

type XorShift128 is { ... };          type PCG is { ... };
XorShift128::seed(key) -> XorShift128
PCG::seed(key) -> PCG

rng.uniform_01() -> Float                // [0.0, 1.0)
rng.uniform(lo, hi) -> Int / Float
rng.normal_01() -> Float
rng.normal(mean, std) -> Float
rng.truncated_normal(lo, hi, mean, std) -> Float
rng.exponential(lambda) -> Float
rng.bernoulli(p) -> Bool                  rng.poisson(lambda) -> Int
rng.gamma(shape, scale) -> Float          rng.beta(alpha, beta) -> Float
rng.chi_squared(k) -> Float                rng.student_t(df) -> Float
rng.categorical(probs) -> Int
rng.permutation(n) -> List<Int>
rng.shuffle_vec(&mut xs)                   rng.choice(&xs) -> &T
```

---

## Layer 4 — Tensor system

Defines `Tensor<T, const S: Shape>` (statically shaped) and `DynTensor<T>`
(dynamic), plus all the usual operations.

```verum
// Construction
zeros::<Float, shape[3, 4]>() -> Tensor<Float, shape[3, 4]>
ones::<Float, shape[3, 4]>()
full::<Float, shape[2, 2]>(value: 3.14)
eye::<Float, 5>()                        // identity
arange(start, stop, step) -> DynTensor<Float>
linspace(start, stop, n) -> Tensor<Float, shape[n]>
rand::<Float, shape[3, 4]>()             // uniform [0, 1)
randn::<Float, shape[3, 4]>()            // standard normal

// Shape & indexing
t.shape() -> Shape        t.dtype() -> DType
t.reshape::<shape[...]>() / t.squeeze() / t.unsqueeze(axis)
t.transpose() / t.permute::<[Int; N]>(axes)
t.flatten() / t.slice(...) / t.gather(indices) / t.scatter(indices, values)

// Arithmetic
t + other  /  -t  /  t * other  /  t.matmul(other)  /  t.mm(b)  /  t.bmm(b)
t.sum() / t.sum(axis: 0) / t.mean() / t.prod()
t.max() / t.min() / t.argmax() / t.argmin()
t.softmax(axis) / t.log_softmax(axis)
t.layer_norm() / t.batch_norm() / t.rms_norm()

// Comparison
t.eq(other) / ne / lt / le / gt / ge         // -> Tensor<Bool, S>
t.logical_and / or / not

// Selection
where_cond(mask: Tensor<Bool>, a: Tensor, b: Tensor) -> Tensor
t.clamp(lo, hi) / t.masked_fill(mask, value) / t.lerp(other, t_val)

// Composition
cat(&tensors, axis) / stack(&tensors, axis)
split(t, sizes, axis) / chunk(t, n, axis)
```

---

## Layer 5 — GPU

```verum
type GPUBackend, DeviceId, DeviceInfo, ComputeCapability;
type DeviceSelector, DeviceRegistry;
type MemorySpace, DevicePtr<T>, GPUBuffer<T>, PinnedBuffer<T>;
type Stream, Event, LaunchConfig, CudaGraph;

GPUBackend::default() -> GPUBackend
device.allocate::<T>(count) -> GPUBuffer<T>
device.launch(config, kernel, args)
device.sync()
```

See [`simd::gpu`](/docs/stdlib/simd#gpu-simdgpu) and
[`intrinsics → gpu`](/docs/stdlib/intrinsics#gpu) for device-side
intrinsics.

---

## Layer 6 — Automatic differentiation

```verum
type DiffMode is ReverseMode | ForwardMode | MixedMode { threshold: Float };

DiffMode::auto(input_dim, output_dim) -> DiffMode
// Picks ForwardMode when output_dim / input_dim > 1, else ReverseMode.

type Differentiable is protocol {
    type Tangent;     type Cotangent;
    fn zero_tangent() -> Self.Tangent;
    fn add_tangent(a: Self.Tangent, b: Self.Tangent) -> Self.Tangent;
    fn scale_tangent(t: Self.Tangent, s: Float) -> Self.Tangent;
}

// Gradients
grad(f) -> fn(input) -> Cotangent
value_and_grad(f, x) -> (output, gradient)
grad_argnums(f, argnums) -> fn(*args) -> Tuple<Cotangent>

// Vector-Jacobian products
vjp(f, x) -> (output, vjp_fn: fn(cotangent) -> Cotangent)
jvp(f, x, tangent) -> (output, tangent_out)

// Higher-order
jacobian(f) -> fn(x) -> Tensor
hessian(f) -> fn(x) -> Tensor
hvp(f, x, v) -> Tensor                      // Hessian-vector product

// Control
stop_gradient(x) -> T
custom_vjp(primal, vjp_fn)
GradientScope { fn enter() / exit() }
with_no_grad(|| pure_inference())

// Memory
checkpoint(f, x) -> y                        // trade recompute for memory
recompute(values)
```

Implements `Differentiable` for `Float`, `Float32`, `Float64`, all
tensor types, and user structs via `@derive(Differentiable)`.

---

## Layer 7 — Neural networks

```verum
type Module is protocol { ... };
type Trainable is protocol { ... };
type Parameter<T> is { value: T, grad: Maybe<T> };

// Layers
Linear.new(in_dim, out_dim) -> Linear
Embedding.new(vocab, dim) -> Embedding
Conv2d.new(in_ch, out_ch, kernel_size, stride, padding)
LayerNorm.new(shape)       RMSNorm.new(shape)        BatchNorm.new(features)

// Activations
relu / gelu / silu / sigmoid / softmax / softplus / tanh

// Dropout
Dropout.new(p)

// Attention
MultiHeadAttention.new(embed_dim, num_heads, dropout)
FeedForward.new(embed_dim, hidden_dim, dropout)
TransformerBlock.new(embed_dim, num_heads, hidden_dim, dropout)
RoPE.new(dim, max_positions)

// Optimisers
type Optimizer is protocol { fn step(&mut self, grads: &Params); }
SGD.new(params, lr, momentum, weight_decay)
AdamW.new(params, lr, betas, weight_decay)

// Schedulers
LRScheduler::cosine(initial_lr, min_lr, max_steps)
LRScheduler::step(initial_lr, gamma, step_size)

// Loss
mse_loss(pred, target) / cross_entropy(pred, target) / bce_loss(pred, target)

// Utility
clip_grad_norm(params, max_norm)
```

---

## Layer 8 — SSM & distributed

### `math.ssm` — state-space models

```verum
S4.new(dim, state_dim, kernel) / Mamba.new(dim, state_dim, conv_dim)
BiMambaBlock.new(dim, state_dim)       Jamba.new(...)       // hybrid SSM + attention

MoELayer.new(num_experts, dim, routing: RoutingStrategy)
RoutingStrategy is TopK(k) | Hash(buckets) | Learned;
BalanceLoss.new(num_experts)
```

### `math.distributed`

```verum
DataParallel.new(module, devices)
DistributedDataParallel.new(module, process_group)
FSDP.new(module, sharding_strategy)          // fully-sharded data parallel

ActorMesh.new(layout)                          Supervision(...)
RDMA::connect(peer)                             // remote direct memory access
```

---

## Layer 9 — Agents, RAG, guardrails

### `math.agent`

```verum
type Tokenizer is protocol { fn encode(text) -> List<Int>; fn decode(ids) -> Text; }
type KVCache is { ... };                       PagedKVCache.new(num_pages, page_size)
type SpeculativeDecoder is { ... };
type ContinuousBatcher is { ... };

LLMAgent.new(model, tokenizer)
ReActAgent.new(llm, tool_registry, max_iterations)
MemoryStore.new(vector_store)

flash_attention(q, k, v, scale) / paged_attention(...)
sample_top_p(logits, p) / sample_temperature(logits, t) / sample_greedy(logits)

type ChatMessage is { role: Text, content: Text };
type FunctionSchema is { name: Text, parameters: Data };
type ExecutableTool is protocol { fn call(args) -> Data; }

QuantizedLinear.new(in_dim, out_dim, bits: Int)    // INT4/INT8
```

### `math.guardrails`

```verum
ContentClassifier.new(categories, threshold)
Guardrail.new(&classifiers)
PIIFilter.new(patterns)
TopicGuardrail.new(allowed_topics)
GuardrailChain.new(&rails)
GuardedAgent.new(agent, chain)
```

### `math.rag`

```verum
Document { id, content, embedding, metadata }
VectorStore is protocol { ... };
HNSWIndex.new(dim, m, ef_construction)
TextChunker.new(chunk_size, overlap)
BM25Index.new()
HybridRetriever.new(vector_store, bm25, weight)
RAGPipeline.new(retriever, llm, prompt_template)
```

---

## Pure mathematics

Self-contained formalisations, used by the verification system
and by `theory_interop`. Depth varies per branch; most define
the usual algebraic structures and their universal
constructions.

- **`algebra/`** — groups, rings, fields, lattices, modules.
- **`category/`** — categories, functors, natural transformations,
  adjunctions, monads, limits, colimits.
- **`topology/`** — point-set topology, manifolds, homology.
- **`analysis/`** — real, functional, measure theory.
- **`logic/`** — propositions-as-types, proof terms, decidability.
- **`hott/`** — cubical HoTT: `I`, `Path`, `refl`, `transport`, `hcomp`,
  `Equiv`, `IsContr`, `IsProp`, `ua`, `funext`, `S1`, `Susp`, `Trunc`,
  `Quotient`.
- **`cubical/`** — interval operations, `Face`, `comp`, `Glue`.
- **`simplicial/`** — `SimplicialSet`, `KanComplex`, `InfinityGroupoid`.
- **`infinity_category/`** — `QuasiCategory`, `InfinityFunctor`, `MappingSpace`.
- **`infinity_topos/`** — `Sieve`, `GrothendieckTopology`, `InfPresheaf`,
  `InfSheaf`, `InfinityTopos`, `GeometricMorphism`, `DescentObstruction`.
- **`kan_extension/`** — `InfLeftKanExtension`, `InfRightKanExtension`,
  `PointwiseKanExtension`.
- **`fibration/`** — `GrothendieckFibration`, `CartesianMorphism`.
- **`model_category/`** — `QuillenModelStructure`, `WeakEquivalence`.
- **`operad/`** — operads, `E_n` operads, ∞-operads.
- **`number_theory/`** — Peano naturals, primes, modular arithmetic.

### ∞-Topos foundations

- **`quantum_logic/`** — `OrthomodularLattice`, `EpistemicHilbertSpace`,
  measure, commutator.
- **`giry/`** — `MeasurableSpace`, `ProbabilityMeasure`, Giry monad,
  `LlmOracle`.
- **`epistemic/`** — `EpistemicStatus`, `Theory`, `EpistemicTopology`,
  theory-site.
- **`cohesive/`** — cohesive structure: Π ⊣ Disc ⊣ Γ ⊣ coDisc.
- **`day_convolution/`** — `SymmetricMonoidalCategory`, `DayConvolution`,
  `CognitiveExtension`.
- **`sdg/`** — synthetic differential geometry: `D`, `TangentBundle`,
  `DifferentialForm`, `Connection`.

### Miscellaneous

- **`complex/`** — complex numbers.
- **`category_finite/`** — finite categories (decidable equality).
- **`bitvec/`** — bit-vectors for cryptography.
- **`observational/`** — observational type theory.
- **`examples/`** — reference implementations of Phase B/C content.
- **`internal/`** — library internals (`@internal` marked).
- **`simple/` / `advanced/`** — convenience API / fine-grained API.
- **`tactics/`** — tactic library for proof automation.

---

## Cross-references

- **[simd](/docs/stdlib/simd)** — SIMD vectors that `math::tensor` uses under the hood.
- **[intrinsics](/docs/stdlib/intrinsics)** — raw CPU/GPU primitives.
- **[theory_interop](/docs/stdlib/theory-interop)** — theory registry + translation + coherence audit; consumes `math::infinity_topos` + `math::kan_extension`.
- **[proof](/docs/stdlib/proof)** — proof certificates that verify math-module obligations.
- **[Verification → cubical & HoTT](/docs/verification/cubical-hott)** — the path types that `math::hott` encodes.
