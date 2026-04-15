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

Located in `verum_codegen::mlir`. Experimental; used for JIT and GPU
compilation.

### Dialects

Verum lowers to a stack of MLIR dialects:

- `arith`, `cf`, `math`, `memref` — standard.
- `gpu` — GPU kernel definitions.
- `vbc` — custom dialect mirroring VBC semantics.

Passes (`passes/`) progressively lower higher dialects to the target.

### JIT

`jit/` wraps MLIR's ORC JIT. Compile a function on demand, cache the
code object, call.

### AOT

`aot/` runs the full pass pipeline and emits an object file. Used as
an alternative to LLVM for research experiments — not the default.

### GPU binaries

`gpu_binary.rs` assembles Metal / SPIR-V binaries from MLIR-lowered
kernels and packages them into the final executable.

## Linking

`link.rs` invokes the platform linker:

- **Linux**: `lld` with musl for static builds; `ld.bfd` as fallback.
- **macOS**: `ld64`, dynamic system libraries (libSystem).
- **Windows**: `lld-link` with MSVC CRT.
- **Cross-compilation**: pre-staged sysroots shipped with the toolchain.

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
