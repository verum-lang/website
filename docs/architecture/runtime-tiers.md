---
sidebar_position: 4
title: Runtime Tiers
---

# Runtime Tiers

Verum runs at four tiers of increasing performance and specialisation.
A single program can move values between tiers seamlessly.

## Tier 0 — Interpreter

The VBC interpreter (`verum_vbc::interpreter`) — where all `verum run`
execution starts. Used during development, in the Playbook TUI, in the
REPL, and inside `meta fn` evaluation.

- **Compile time**: seconds (only to VBC).
- **Execution**: ~5–20× slower than native.
- **Features**: every VBC opcode supported, including cubical.
- **Use when**: iterating, testing, compile-time evaluation.

## Tier 1 — Baseline JIT

A simple single-pass translator from VBC to machine code. Emitted for
hot functions identified by runtime profiling.

- **Compile time**: microseconds per function.
- **Execution**: ~1.5–3× slower than optimising AOT.
- **Features**: no inlining, no loop optimisation.
- **Use when**: long-running programs with hot paths that justify the
  warmup cost.

## Tier 2 — Optimising JIT (MLIR)

MLIR-based JIT with full optimisation passes. Experimental; on by
default for `@hot` functions when `runtime.jit = "optimising"`.

- **Compile time**: milliseconds per function.
- **Execution**: ~0.95–1.0× of AOT.
- **Features**: inlining, vectorisation, dataflow optimisation.
- **Use when**: you want close-to-AOT performance without a prior
  build step.

## Tier 3 — AOT (LLVM)

Ahead-of-time compilation through LLVM — the default for `verum
build --release`.

- **Compile time**: seconds per function, dominated by LLVM.
- **Execution**: 0.85–1.0× of equivalent C.
- **Features**: full LLVM optimisation stack, LTO, PGO.
- **Use when**: shipping production binaries.

## Tier 4 — GPU (MLIR → Metal / Vulkan)

`@gpu.kernel` functions compile through MLIR's GPU dialect to Metal IR
(Apple) or SPIR-V / Vulkan.

- **Compile time**: per-kernel, bundled into the main binary.
- **Execution**: native GPU performance.
- **Features**: no CBGR (kernels use a separate arena), no async.
- **Use when**: compute-heavy data-parallel workloads.

## Async scheduler

The runtime uses a work-stealing executor:

- **Per-core worker threads**: number = `num_cpus()` by default.
- **Per-worker deque**: local tasks pushed / popped LIFO; stolen FIFO.
- **Global queue**: for tasks spawned from outside the executor.
- **IO reactor**: one thread driving `io_uring` / `kqueue` / `IOCP`.

Task context (`ExecutionEnv`, including context stack) is saved /
restored at each `.await` suspension. Context stacks are cloned on
`spawn`.

## Memory: unified CBGR arena

All four tiers share the same CBGR-managed heap. A value allocated in
the interpreter can outlive the `verum run` session and be passed into
AOT code via persistence (cog packages); CBGR headers mean the
validity check is consistent across tiers.

## Tier selection

Per-function annotations:

```verum
@tier(aot)              // always emit AOT code
@tier(jit)              // JIT-only (no AOT), used in tests
@tier(interpret)        // never compile
```

Per-project default in `Verum.toml`:

```toml
[build]
default_tier = "aot"
jit = "baseline"         # baseline | optimising | off
```

## Cross-tier transitions

Calls between tiers go through a standard ABI — VBC-compatible layout
with CBGR headers. Crossing from interpreter to AOT adds no overhead
beyond a normal C call. Inlining across the boundary happens when the
optimising JIT or AOT has visibility into both sides.

## See also

- **[VBC bytecode](/docs/architecture/vbc-bytecode)** — the IR all
  tiers share.
- **[Codegen](/docs/architecture/codegen)** — AOT LLVM pipeline.
- **[CBGR internals](/docs/architecture/cbgr-internals)** — memory
  model across tiers.
- **[Stdlib → runtime](/docs/stdlib/runtime)** — runtime configuration.
