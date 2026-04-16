---
sidebar_position: 6
title: Codegen
---

# Code Generation

`verum_codegen` translates VBC bytecode into native machine code via
two backends: **LLVM** (AOT, default) and **MLIR** (JIT + GPU).

## LLVM backend

Located in `verum_codegen::llvm`. Huge — `instruction.rs` alone is
1.1 M LOC.

### VBC → LLVM IR

`vbc_lowering.rs` walks VBC functions and emits LLVM IR:

- **Values** become SSA registers.
- **Control flow** maps to LLVM basic blocks + `br` / `br-cond`.
- **Function calls** map to `call` / `invoke` (the latter for
  exception-propagating contexts).
- **CBGR checks** lower to a load-compare-branch sequence, then
  optimised by LLVM's passes.
- **Cubical opcodes** lower to identity / noop (proof erasure).

### Runtime support

`runtime.rs` generates:
- CBGR helper functions (fast-path in-asm; slow-path in C).
- Alloc / dealloc entry points (call into `verum_toolchain::mem`).
- Context stack primitives (push, pop, lookup).
- Panic and unwind machinery.

### FFI trampolines

`ffi.rs` emits trampolines for `extern "C"` functions:
- Argument marshalling (Verum types ↔ C types).
- Return value handling.
- Exception conversion (C errno / return codes → Verum `Result`).
- CBGR guarding of outgoing pointers (wrapped as `&unsafe T`).

### Tensor and SIMD

`tensor_ir.rs` (134 K LOC) and `simd.rs` (21 K LOC) map tensor and
SIMD opcodes to platform intrinsics — SSE/AVX/AVX-512 on x86_64, NEON
on aarch64, scalar fallbacks on other targets.

### GPU (Metal)

`metal_ir.rs` emits Metal shading-language IR for `@gpu.kernel`
functions.

### Inline assembly

`asm.rs` supports `@llvm_only unsafe asm!(...)` for kernels and
drivers. Bitfield layout is handled by `bitfield.rs` for
memory-mapped I/O.

## MLIR backend

Located in `verum_codegen::mlir`. Used for JIT, autodiff, and the GPU
path. The LLVM backend handles CPU AOT; MLIR owns everything else.

### Dialect stack

VBC lowers progressively through a fixed ladder of dialects:

```
VBC tensor / SIMD opcodes
        │
        ▼
verum.tensor            (custom, preserves Verum semantics)
        │
        ▼
linalg                  (named ops: matmul, conv, reduce, ...)
        │
        ▼
┌───────┼──────────┬───────────┐
▼       ▼          ▼           ▼
gpu   vector     scf         arith / memref
│       │          │           │
▼       ▼          ▼           ▼
nvvm   rocdl     spirv       air         (target-specific)
(PTX)  (HSACO)  (SPIR-V)   (Metal)
```

Passes in `passes/` drive each lowering step. Standard dialects
(`arith`, `cf`, `math`, `memref`) handle the plumbing; `verum.tensor`
keeps high-level shape information alive long enough for fusion
passes to run before dropping to `linalg`.

### VBC → dialect mapping (selected)

| VBC opcode | `verum.tensor` | `linalg` | Target lowering |
|------------|----------------|----------|-----------------|
| `TENSOR_MATMUL` (0xE8) | `verum.matmul` | `linalg.matmul` | `nvvm.mma` / `gpu.wmma` |
| `TENSOR_CONV` (0xEA) | `verum.conv2d` | `linalg.conv_2d_nhwc` | implicit GEMM |
| `TENSOR_SOFTMAX` (0xF4) | `verum.softmax` | `scf.for` + `arith` | online softmax |
| `TENSOR_LAYERNORM` (0xF5) | `verum.layer_norm` | custom | fused kernel |
| `TENSOR_BATCHNORM` (0xF6) | `verum.batch_norm` | custom | fused kernel |
| `TENSOR_EINSUM` (0xEC) | `verum.einsum` | `linalg.generic` | target-specific |
| `TENSOR_FLASH_ATTENTION` (0xFC) | `verum.attention` | — | intrinsic |

Flash attention stays a single op all the way to the target — the
lowering emits vendor intrinsics directly rather than reconstructing
the pattern from `linalg`.

### GPU targets

Five backends share the MLIR pipeline:

| Target | Triple | Matmul tile (default) |
|--------|--------|------------------------|
| CUDA (NVIDIA, tensor cores) | `nvptx64-nvidia-cuda` | 128×128×32 on SM8x, 64×64×32 on SM7x |
| CUDA (NVIDIA, no TC)        | `nvptx64-nvidia-cuda` | 32×32×8 |
| ROCm (AMD, matrix cores)    | `amdgcn-amd-amdhsa`   | 128×128×16 |
| ROCm (AMD, no MC)           | `amdgcn-amd-amdhsa`   | 32×32×8 |
| Metal (Apple)               | `air64-apple-macosx`  | 32×32×8 |
| Vulkan                       | `spirv64-unknown-vulkan` | 16×16×8 |
| SYCL / oneAPI                | `spir64-unknown-unknown` | 16×16×8 |

Tile sizes come from `GpuTarget::matmul_tile_sizes()`; the compiler
picks the widest variant supported by the detected device.

### JIT

`jit/` wraps MLIR's ORC JIT. A function compiles on demand, its code
object is cached keyed by `(vbc_fingerprint, target, opt_level)`, and
subsequent calls skip compilation entirely. Target: JIT compile time
under 50 ms for a transformer forward kernel (vs 100–500 ms for
PyTorch, 1–30 s for JAX's first-run path).

### AOT

`aot/` runs the full pass pipeline and emits an object file linked
alongside the LLVM-produced host code. Used for GPU kernels in
release builds and for research experiments that want the MLIR
CPU path.

### GPU binaries

`gpu_binary.rs` assembles Metal `.metallib`, SPIR-V modules, or PTX /
HSACO blobs from MLIR-lowered kernels and embeds them into the final
executable via the linker's `__TEXT,__const` section (macOS) or a
dedicated `.rodata.verum_gpu` section (Linux / Windows). The runtime
looks them up by kernel ID at launch time.

## Autodiff lowering

`@differentiable` functions go through a source-transformation pass
that runs *on the MLIR side* so VJP rules can be expressed over
`linalg` ops rather than bytecode:

1. The primal function is lowered to `verum.tensor` as usual.
2. A reverse-mode pass walks the op graph and emits a companion
   function using VJP rules registered per op.
3. Tape storage (for activations that the backward pass needs) uses
   a stack-allocated `GradientTape` when possible, falling back to
   `Heap<...>` when shapes are dynamic.

The `GradientTape` context sees every `linalg` op, so the backward
pass fuses into the forward kernel whenever the dataflow allows
(saving a materialisation of the primal output).

## Linking

`link.rs` invokes the platform linker:

- **Linux**: `lld` with musl for static builds; `ld.bfd` as fallback.
- **macOS**: `ld64`, dynamic system libraries (libSystem).
- **Windows**: `lld-link` with MSVC CRT.
- **Cross-compilation**: pre-staged sysroots bundled in the `verum` binary.

LTO options:
- `thin` (default): fast, good inlining.
- `full`: slower, maximum cross-module optimisation.

## Debug information

- **DWARF** on Linux / macOS.
- **PDB** on Windows.
- Source-level debugging: variables, types, expressions.
- **CBGR header awareness**: debuggers can pretty-print generation and
  epoch.

## Artefact layout

```
target/
├── debug/
│   ├── <name>         (executable or .cog)
│   ├── <name>.vbc     (bytecode, always emitted)
│   └── <name>.dwarf
└── release/
    └── <name>         (LTO'd, stripped)
```

`.cog` is a library artefact: VBC + metadata + optional proof certs.

## See also

- **[VBC bytecode](/docs/architecture/vbc-bytecode)** — the input to
  codegen.
- **[Runtime tiers](/docs/architecture/runtime-tiers)** — when each
  backend runs.
- **[Language → FFI](/docs/language/ffi)** — user-facing FFI boundary.
