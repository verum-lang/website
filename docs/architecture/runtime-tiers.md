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

## CBGR performance across tiers

The `&T` managed-reference check has different costs at different
tiers, and different amounts are eliminated by analysis.

### Tier 0 — interpreter

```
deref(&T) = 1 load (pointer) + 1 load (header) + 1 compare + 1 branch
          ≈ 90–120 ns   (tree-walker overhead dominates)
```

- Full check on every deref.
- No elision.
- Fine for REPL / tests / short scripts.

### Tier 1 — baseline JIT

Check compiles to:

```
mov  rax, [rdi]                ; load pointer
mov  ecx, [rax - 16]           ; load header.generation
cmp  ecx, [rdi + 8]            ; compare reference.generation
jne  .use_after_free
```

- ~15 ns per check on modern x86_64 (6–9 cycles).
- Basic inlining + escape analysis elides 60–80% of checks in
  typical code.

### Tier 2 — optimising JIT (MLIR)

Dataflow-based escape analysis plus loop-invariant code motion:

- ~5–15 ns per check where a check remains.
- 0 ns for checks hoisted out of loops.
- 80–95% of checks eliminated on average.

### Tier 3 — AOT (LLVM)

**Debug profile** (`--profile debug`): ~15 ns per remaining check;
~60–80% elision via intraprocedural escape analysis.

**Release profile** (`--profile release` with LTO):
- 0 ns for `&checked T` (proven).
- ~15 ns for remaining `&T` (rare in hot paths).
- 90–98% of checks eliminated via whole-program escape analysis +
  refinement-informed bounds elimination.

### Cross-tier reference downgrade

Calling from AOT into the interpreter downgrades `&checked T` to
`&T` — safety is preserved but the recipient pays the ~100 ns check.
This is invisible unless you're profiling the interpreter.

## Memory costs across tiers

Allocation is shared across all tiers — every tier sees the same
mimalloc-inspired heap described in **[memory
model](/docs/language/memory-model#allocation-internals)**. What
changes per tier is how many of the allocator's safety checks are
executed versus proven away at compile time.

| Tier           | Alloc fast path | CBGR deref | Cross-thread free | Notes |
|----------------|-----------------|-----------|-------------------|-------|
| T0 Interpreter | ~80 ns | 25–40 ns | ~70 ns | every check runs; VBC bookkeeping |
| T1 Baseline JIT| ~25 ns | 15–20 ns | ~55 ns | direct-array fast path inlined |
| T2 Optimising  | ~15 ns | 5–10 ns  | ~50 ns | escape analysis elides 40–60 % of checks |
| T3 AOT         | < 20 ns | < 5 ns (or zero for `&checked`) | ~50 ns | 70–90 % of CBGR checks elided |
| T4 GPU         | device allocator | N/A | N/A | kernel scratchpad only |

Allocator scalability is tier-independent: thread-local heaps stay
contention-free up to roughly 32 threads regardless of tier; beyond
that, abandoned-segment reclamation starts to dominate and cross-thread
free latency rises. The lazy purge window (10 ms) is the same across
tiers, so heap size does not depend on how fast code is running.

### Tier-local vs global state

Each tier has its own JIT-code cache and its own specialisation state;
they all share **one** allocator, **one** CBGR epoch manager, and
**one** task scheduler. This is what makes cross-tier calls free — no
trampolines, no marshalling, just a normal call through a VBC
descriptor.

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
