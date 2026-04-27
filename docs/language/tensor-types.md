---
sidebar_position: 11
title: Tensor types
description: Shape-typed multi-dimensional arrays with compile-time shape checking and zero runtime cost for shape errors.
---

# Tensor types

> **TL;DR.** A tensor type `Tensor<Float32, [3, 224, 224]>` describes
> a three-dimensional array of 32-bit floats with the given shape.
> Shape mismatches — mismatched matmul, wrong axis for reduction,
> broken broadcasting — are caught by the type checker before the
> program runs. At runtime, a tensor is just a contiguous buffer
> plus strides known at compile time.

```verum
// Static shape — the type system enforces it.
fn image_channels(img: Tensor<Float32, [3, H, W]>) -> Int { 3 }

// Shape-polymorphic — H and W can vary, compiler keeps track.
fn resize<H, W>(img: Tensor<Float32, [3, H, W]>)
             -> Tensor<Float32, [3, 224, 224]> { ... }

// Matmul: the inner dimensions must agree, or the type checker rejects.
fn matmul<M, K, N>(a: Tensor<Float32, [M, K]>,
                   b: Tensor<Float32, [K, N]>)
               -> Tensor<Float32, [M, N]> { ... }
```

:::info Status
Wired end-to-end: `Type::Tensor { element, shape, strides }` in
`crates/verum_types/src/ty.rs`, shape validation in
`tensor_shape_checker.rs`, literal-building protocol in
`tensor_protocol.rs`, 40+ VBC e2e tests under
`vcs/specs/L0-critical/vbc/e2e/`. Compile-time shape arithmetic is
**stable**; broadcasting inference is **maturing**; shape-refined
indexing (`t[i]` with `i < shape[0]`) is **experimental**.
:::

## Why shape-typed tensors?

The vast majority of machine-learning bugs are shape bugs:
batch vs. no-batch, transposed matmul, wrong axis for `sum` or
`mean`, incompatible broadcast. NumPy and PyTorch turn these into
runtime `ValueError`s, often inside a training loop after an
hour of compute.

| Bug class | NumPy/PyTorch | Verum |
|---|---|---|
| `a @ b` with mismatched inner dims | Runtime `ValueError` | Compile error, shape visible |
| `sum(x, axis=5)` on rank-3 `x` | Runtime error | Compile error |
| Broadcast between `[4, 3, 1]` and `[4, 5]` | Runtime error | Compile error |
| Off-by-one in batch slicing | Silent wrong output | Compile error or refined-index error |
| Forgotten `.unsqueeze` | Shape drift at the next op | Compile error |

Shape typing moves all of this to compile time. The runtime cost is
**zero** — shapes exist only in the type system.

## The type

```ebnf
tensor_type_expr    = 'tensor' , '<' , shape_params , '>' , type_expr ;
shape_params        = dimension , { ',' , dimension } ;
dimension           = integer_lit | identifier | meta_arith_expr ;
```

Two equivalent surface forms:

```verum
// generic form — uses a type-level list
Tensor<Float32, [3, 224, 224]>

// explicit form — mirrors tensor literal syntax
tensor<3, 224, 224> Float32
```

Both elaborate to the same `Type::Tensor` node. Use the generic
form in general code; use the explicit form in numerical contexts
where the resemblance to the literal aids reading.

## First example: shape-checked dot product

```verum
fn dot<N>(a: Tensor<Float32, [N]>, b: Tensor<Float32, [N]>) -> Float32 {
    let mut acc = 0.0;
    for i in 0..N { acc += a[i] * b[i]; }
    acc
}

let x: Tensor<Float32, [3]> = tensor<3> Float32 { 1.0, 2.0, 3.0 };
let y: Tensor<Float32, [3]> = tensor<3> Float32 { 4.0, 5.0, 6.0 };
let z = dot(x, y);  // ok, N = 3 inferred

let w: Tensor<Float32, [4]> = tensor<4> Float32 { 1, 2, 3, 4 };
// dot(x, w);  // ERROR: expected Tensor<_, [3]>, found Tensor<_, [4]>
```

## Shape arithmetic

Shapes are compile-time expressions over natural numbers and
bound identifiers. Verum supports the usual operators inside shape
positions:

```verum
fn concat<A, B>(
    a: Tensor<Float32, [A]>,
    b: Tensor<Float32, [B]>,
) -> Tensor<Float32, [A + B]> { ... }

fn reshape_flat<H, W>(
    img: Tensor<Float32, [3, H, W]>,
) -> Tensor<Float32, [3 * H * W]> { ... }

fn kron<A, B, C, D>(
    x: Tensor<Float32, [A, B]>,
    y: Tensor<Float32, [C, D]>,
) -> Tensor<Float32, [A * C, B * D]> { ... }
```

The operators available in shape positions are the same as in
meta arithmetic: `+`, `-`, `*`, `/` (integer division), and
bracketed grouping. Equality between shape expressions uses SMT
so `[A + B]` and `[B + A]` unify.

## Broadcasting

Broadcasting is checked by `tensor_shape_checker`. Two rules:

1. Shapes are right-aligned. Missing leading dims are implicitly
   `1`.
2. Dimensions align if they are equal, or either is `1`.

The checker computes the broadcast shape symbolically:

```verum
// Input types
let x: Tensor<Float32, [4, 3, 1]>;
let y: Tensor<Float32, [   3, 5]>;

// Output shape computed at compile time
let z: Tensor<Float32, [4, 3, 5]> = x + y;
```

A failing broadcast is a compile error with the offending axis
called out:

```
error[E1311]: cannot broadcast shapes [4, 3, 1] and [4, 5]
  --> src/net.vr:18:13
   |
18 |     let z = x + y;
   |             ^^^^^ dimension 1: 3 vs 5 (neither is 1)
   = note: broadcasting requires each axis to be equal or one of
           the operands to be 1 at that axis.
```

## Matrix multiplication

```verum
fn matmul<M, K, N>(
    a: Tensor<Float32, [M, K]>,
    b: Tensor<Float32, [K, N]>,
) -> Tensor<Float32, [M, N]> { ... }

let a: Tensor<Float32, [3, 4]> = ...;
let b: Tensor<Float32, [4, 5]> = ...;
let c = matmul(a, b);  // Tensor<Float32, [3, 5]>, inferred

let d: Tensor<Float32, [6, 5]> = ...;
// matmul(a, d); // ERROR: inner dims mismatch: 4 vs 6
```

Batched matmul follows the same pattern with leading broadcast
dimensions:

```verum
fn bmm<B, M, K, N>(
    a: Tensor<Float32, [B, M, K]>,
    b: Tensor<Float32, [B, K, N]>,
) -> Tensor<Float32, [B, M, N]> { ... }
```

## Reductions

Reductions shrink a chosen axis. The axis is a compile-time
integer; the checker verifies it is in range:

```verum
fn sum_axis<Rank, Axis, S: Shape<Rank>>(
    t: Tensor<Float32, S>,
) -> Tensor<Float32, S.without(Axis)>
    where Axis < Rank;
```

`S.without(Axis)` is a type-level function on shapes: remove the
element at `Axis`. Specified at compile time, verified by the
checker.

## Reshape

```verum
fn reshape<OldShape, NewShape>(
    t: Tensor<Float32, OldShape>,
) -> Tensor<Float32, NewShape>
    where product(OldShape) == product(NewShape);
```

The `product(...)` predicate ensures element-count preservation —
checked by SMT at compile time.

## Tensor literals

Tensor literals pair an explicit shape with nested elements:

```verum
let eye3: Tensor<Float32, [3, 3]> = tensor<3, 3> Float32 {
    1.0, 0.0, 0.0,
    0.0, 1.0, 0.0,
    0.0, 0.0, 1.0,
};

let batch: Tensor<Int, [2, 3]> = tensor<2, 3> Int {
    [1, 2, 3],
    [4, 5, 6],
};
```

The number of elements must equal `∏ shape_i`, verified at parse
time. Literals can be nested arrays (PyTorch style) or flat
(BLAS style); both are accepted.

## Interaction with dependent types

Shape dimensions are (usually) type-level; when you need a
**runtime-valued dimension** you use dependent types:

```verum
fn concat_dyn(a: Tensor<Float32, [n]>, b: Tensor<Float32, [m]>)
            -> Tensor<Float32, [n + m]>
    where n: Nat, m: Nat;
```

`n` and `m` are dependent-typed indices; the return shape is
computed from them. At runtime, the dimensions become ordinary
integers carried alongside the buffer.

## Interaction with autodiff

Tensor types interact with `@grad` and `@jit`:

```verum
@grad
fn loss(x: Tensor<Float32, [Batch, 10]>, w: Tensor<Float32, [10, 1]>)
       -> Tensor<Float32, [Batch, 1]>
{
    matmul(x, w)
}
```

Gradient shapes are computed from the forward shapes, giving you
statically-typed backward passes.

## Cookbook

### A fully-connected layer

```verum
type Linear<In, Out> is {
    weight: Tensor<Float32, [Out, In]>,
    bias:   Tensor<Float32, [Out]>,
};

implement Linear<In, Out> {
    fn forward<Batch>(&self, x: Tensor<Float32, [Batch, In]>)
                           -> Tensor<Float32, [Batch, Out]>
    {
        matmul(x, self.weight.transpose()) + self.bias
    }
}
```

Every shape in `forward` is checked against the layer's
declaration. A shape mismatch in the training loop is a *compile
error* in the layer definition.

### A multi-head attention head

```verum
fn attention<B, H, T, D>(
    q: Tensor<Float32, [B, H, T, D]>,
    k: Tensor<Float32, [B, H, T, D]>,
    v: Tensor<Float32, [B, H, T, D]>,
) -> Tensor<Float32, [B, H, T, D]> {
    let scores   = matmul(q, k.transpose(-1, -2)) / sqrt(D as Float32);
    let weights  = softmax(scores, axis=-1);
    matmul(weights, v)
}
```

All head dimensions are polymorphic — one implementation, infinite
sizes.

### Convolution (simplified)

```verum
fn conv2d<B, C_in, C_out, Kh, Kw, H, W>(
    input:  Tensor<Float32, [B, C_in, H, W]>,
    weight: Tensor<Float32, [C_out, C_in, Kh, Kw]>,
) -> Tensor<Float32, [B, C_out, H - Kh + 1, W - Kw + 1]>
    where Kh <= H, Kw <= W;
```

The output spatial shape is *computed* from the input. The
compiler rejects a 3×3 kernel on a 2×2 input with a helpful
message.

## Interaction with other features

| With... | Behaviour |
|---|---|
| **Refinement types** | Tensor element types can be refined: `Tensor<Float32 { self >= 0 }, [N]>` — enforces nonnegativity entry-wise. |
| **Linearity** | GPU-resident tensors can be declared `linear` so that `.unmap()` is mandatory. |
| **Protocols** | `Add`, `Mul`, `Matmul` etc. are protocols parameterised by shape relations. |
| **Meta staging** | Shape arithmetic is compile-time; `@stage` can pre-compute shapes across a pipeline. |
| **Verification** | Reductions and reshape emit SMT obligations automatically. |

## Common pitfalls

### "The compiler says `[3, 4]` and `[A, B]` don't unify"

You're calling a shape-polymorphic function with concrete tensors
but the compiler can't deduce `A = 3, B = 4`. Add type arguments:
`f::<3, 4>(t)` — or wait for inference to see both arguments and
the return type.

### "My `reshape` fails even though the products match"

The SMT constraint is `product(OldShape) == product(NewShape)`,
and nonlinear arithmetic is undecidable in general. Provide a
hint: `reshape::<[A*B, C]>(t)` or break the reshape into steps
with known intermediate shapes.

### "Broadcasting says 'dimension 2: 7 vs 7' and still fails"

Check the leading dims; broadcasting is right-aligned, so
`[7, 3, 1]` vs `[3, 1]` has equal *trailing* dims but the second
operand is missing a leading `7`. Use `unsqueeze` or let
broadcasting insert `1`s explicitly.

### "`shape[0]` compiled, but `shape[i]` complains"

Shape subscripts with *symbolic* indices are refinement-typed
(`i < Rank`). Either bind `i` with a refined type or use a
compile-time constant.

## Implementation status

| Feature | Status | Backing |
|---|---|---|
| `Type::Tensor` in the type system | **Stable** | `verum_types/src/ty.rs:785-800` |
| Tensor literal parser / checker | **Stable** | `verum_types/src/infer.rs:18346` |
| Shape arithmetic in types | **Stable** | `verum_types/src/tensor_shape_checker.rs` |
| Broadcasting inference | **Maturing** | `tensor_shape_checker.rs` |
| Matmul / batched matmul | **Stable** | shape checker |
| Element-wise op overloading via protocols | **Experimental** | `tensor_protocol.rs` |
| Shape-refined indexing (`t[i]` with `i < shape[0]`) | **Experimental** | refinement integration in progress |
| Dependent (runtime-valued) dimensions | **Experimental** | pattern established in stdlib |
| Autodiff typing (`@grad`) | Planned | — |

## FAQ

**Are shapes erased at runtime?** Yes. The runtime representation
is just a buffer plus a tuple of integer strides, computed at
compile time for static shapes.

**What is `Float32` vs `Float64` — is element type erased too?**
Element types are *not* erased — they control layout. Only the
shape indices are erased.

**Can I have `Tensor<T, S>` generic over `T`?** Yes, and you often
should. Numeric protocols (`Num`, `Float`, `Int`) constrain `T`
appropriately.

**Where does the name `tensor` come from in the grammar?** The
lower-case `tensor<...>` is a literal head that matches the type
head. Capital `Tensor<T, S>` is the generic form used in types.
Both reach the same internal representation.

**Is there first-class support for sparse tensors?** Not at the
type level — sparse layouts live behind protocol-based
abstractions (`SparseTensor<T, S>` with its own methods).

**What about ragged (variable-length) tensors?** Use a row of
dependent-typed tensors (`List<Tensor<T, [n_i]>>`) with the lengths
in a companion shape tensor.

## See also

- [Types](./types.md) — base type forms.
- [Refinement types](./refinement-types.md) — element-level
  predicates.
- [Dependent types](./dependent-types.md) — dynamic dimensions.
- [Small neural net tutorial](../tutorials/small-nn.md) — a real
  model built on tensor types.
- Source: `crates/verum_types/src/ty.rs`,
  `crates/verum_types/src/tensor_shape_checker.rs`,
  `crates/verum_types/src/tensor_protocol.rs`. See also the
  [Grammar reference — Types](../reference/grammar-ebnf.md#27-types).
