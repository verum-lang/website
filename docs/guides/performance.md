---
sidebar_position: 5
title: Performance
description: Measuring, understanding, and improving Verum performance.
---

# Performance

Verum code starts fast (LLVM AOT, CBGR escape analysis) and can be
made very fast with targeted effort. This guide covers how to
measure and where to spend that effort.

## The speed of Verum

Expect, out of the box:

| Workload | Typical range vs C |
|---|---|
| Tight numeric loops | 0.90–1.00× |
| Pointer-heavy structures | 0.85–0.98× |
| Async / IO-bound servers | comparable to Rust tokio |
| Math / tensor operations | 0.95–1.00× with SIMD |
| Allocator-heavy workloads | Mimalloc-class |

Variance within the range tracks how well CBGR escape analysis
promotes references in your specific code.

## Measure first

```bash
verum bench                              # run all @bench functions
verum profile --cpu [file.vr]            # sampling profile + hot functions
verum profile --memory [file.vr]         # CBGR tier 0/1/2 breakdown
verum profile --compilation [file.vr]    # per-phase compilation timings
verum analyze --escape                   # reference-tier promotion report
verum analyze --refinement               # refinement coverage
verum build --timings                    # per-phase compile time
```

Write benchmarks with the `Bencher` helper:

```verum
@bench
fn bench_sort_10k(b: &mut Bencher) {
    let data = generate_test_vec(10_000);
    b.iter(|| data.clone().sorted());
}
```

Never micro-optimise before profiling. In particular:

- **CBGR overhead is often zero** (promoted to `&checked T`).
- **LLVM inlines aggressively** at `optimize = "aggressive"`.
- **`Iterator::fold` is generally as fast as a hand-written loop.**

## The top 5 wins

### 1. Turn on release mode

```bash
verum build --release
```

Default debug builds are 2–20× slower. This is the single biggest
gain, always measure on release builds.

### 2. Enable LTO on the release profile

```toml
[profile.release]
lto = "thin"           # or "full" for one more percent at much higher compile cost
codegen-units = 1      # fewer translation units = better inlining
```

`thin` LTO gives most of the benefit at ~2× the compile time of no
LTO. `full` LTO adds a few extra percent at 5–10× compile time.

### 3. Target-specific CPU

```toml
[build]
target-cpu = "native"       # for machines you'll deploy on
# or for a specific ISA baseline:
target-cpu = "x86_64-v3"
```

`native` unlocks AVX2 / AVX-512 / BMI / FMA / whatever the target
has. For release binaries shipped to heterogeneous hardware, use
`@multiversion` on hot functions (see below).

### 4. CBGR tier promotion

If `verum analyze --escape` shows a low promotion rate on a hot
function, rewrite so the compiler can prove local scope. Common causes
of escape:

- Storing a reference in a struct that outlives the scope (use
  `Heap<T>` to own, or `Shared<T>` to share).
- Passing a reference to an opaque function (the compiler can't see
  what happens to it).
- Returning a reference from a function whose inputs are all owned
  (the reference has nothing to borrow from).

After the rewrite, request `&checked T` explicitly — the compiler
will confirm the promotion was possible.

### 5. Choose the right data structure

- **Linear scans on small n**: `List<T>` beats `Set<T>` until the set
  is large enough to amortise hashing. Rule of thumb: < 16 items,
  prefer `List`.
- **Ordered iteration + lookup**: `BTreeMap` over `Map`. Same O(log n)
  vs O(1) tradeoff as Rust.
- **Producer/consumer**: prefer `channel` (MPSC) over `Mutex<Vec<T>>`
  + `Condvar`.

## Targeted optimisations

### Explicit SIMD via `core::simd`

```verum
use core.simd.{Vec8f, Mask8};

@cfg(target_has_feature("avx2"))
fn dot(a: &[Float32], b: &[Float32]) -> Float32 {
    let mut acc = Vec8f::splat(0.0);
    for chunk in a.chunks_exact(8).zip(b.chunks_exact(8)) {
        let (ca, cb) = chunk;
        let va = Vec8f::load_unaligned(ca.as_ptr());
        let vb = Vec8f::load_unaligned(cb.as_ptr());
        acc = va.fma(&vb, acc);
    }
    acc.reduce_add() + dot_scalar(&a[a.len() - a.len() % 8..], &b[a.len() - a.len() % 8..])
}
```

See [`simd`](/docs/stdlib/simd).

### Runtime CPU dispatch with `@multiversion`

```verum
@multiversion
fn hot_kernel(data: &[Float]) -> Float { ... }
```

Emits several variants — scalar, AVX2, AVX-512 — and dispatches via
CPUID at runtime. Pay a ~3 ns dispatch cost for broad compatibility.

### `@inline(always)` and `@hot` / `@cold`

```verum
@inline(always)
fn bounds_check(xs: &[T], i: Int) { assert(i < xs.len()); }

@hot
fn ray_intersect(...) { ... }

@cold
fn handle_unlikely_error(e: Error) { ... }
```

Use sparingly — LLVM's own heuristics are very good. Reserve these
for cases profiling shows mattering.

### Loop unrolling and vectorisation hints

```verum
@unroll(factor = 4)
fn reduce_chunks(xs: &[Int]) -> Int {
    let mut s = 0;
    for x in xs { s += x; }
    s
}

@vectorize(lanes = 8)
fn saxpy(alpha: Float, x: &[Float], y: &mut [Float]) {
    for i in 0..x.len() { y[i] += alpha * x[i]; }
}
```

### Profile-guided optimisation

```bash
verum build --release --pgo instrument
./target/release/myprog typical_workload
verum build --release --pgo optimize
```

Two-pass build. Typical gain: 10–20% on branch-heavy code.

## Memory / allocation

### Use `Shared<T>` / `Heap<T>` deliberately

Every `Heap::new` / `Shared::new` is an allocation. For a hot path
that creates many short-lived heap values, consider:

1. **A local buffer** reused across iterations.
2. **An arena** (`GenerationalArena<T>`) — one allocation up front,
   O(1) bulk free.

### Prefer `&[T]` over `List<T>` in parameters

Taking `&List<T>` requires the caller to have a concrete `List`; taking
`&[T]` is more general and allows the caller to pass a slice, array,
or sub-range of a `List`.

### Pre-allocate when size is known

```verum
let mut out = List::with_capacity(expected);
for x in iter { out.push(transform(x)); }
```

vs.

```verum
let out: List<_> = iter.map(transform).collect();   // also sizes correctly via size_hint()
```

The second form can be equivalent if the iterator has a precise
size hint. Profile both.

## Async performance

### Don't `await` inside a `Mutex` guard

Serialises everything through the lock. Instead: gather the work you
need, drop the guard, then `await`.

```verum
// Don't
let mut guard = mu.lock().await;
let data = guard.fetch_or_load().await;     // blocks other callers
guard.commit(data);

// Do
let info;
{
    let mut g = mu.lock().await;
    info = g.take_request_info();
}
let data = remote_fetch(info).await;
{
    let mut g = mu.lock().await;
    g.commit(data);
}
```

### Use `spawn_blocking` for CPU-bound work

```verum
let result = spawn_blocking(|| heavy_compute(data)).await;
```

Reserves a thread-pool thread so the async executor keeps processing
other tasks.

### Pick the right executor

`full` is the default. For latency-sensitive single-threaded
workloads (games, GUIs, embedded), try `single_thread` — removes
the synchronisation overhead on every task wake.

## Verification performance

### Cache SMT proofs

Enabled by default — results are keyed on the obligation's SMT-LIB
fingerprint. Across builds, ~85% hit rate is typical. Check:

```bash
verum smt-stats
```

### Avoid unbounded quantifiers

`forall x: Int. P(x)` forces the solver to synthesise triggers.
Whenever possible, bound the quantifier: `forall x in 0..n. P(x)`.

### Reflect common predicates

Instead of inlining a 10-line predicate in 50 different refinements,
extract it to a `@logic fn`. The solver reuses the axiom across
obligations.

## Compile-time performance

If `verum build` is slow on clean builds:

```toml
[profile.dev]
codegen-units = 256      # more parallelism
lto = "off"
incremental = true

[profile.release]
codegen-units = 16
lto = "thin"
```

`verum build --timings` shows where the time goes. Typical hotspots:

- Phase 4 (semantic + CBGR) in generics-heavy code.
- Phase 3a / Phase 4 verification when many `@verify(formal)` functions
  have large obligations.
- Phase 7 (AOT: VBC → LLVM) when LTO is `full`.

## See also

- **[intrinsics](/docs/stdlib/intrinsics)** — low-level performance
  primitives.
- **[simd](/docs/stdlib/simd)** — portable vectorisation.
- **[Troubleshooting](/docs/guides/troubleshooting)** — when perf is
  catastrophically bad.
- **[Architecture → runtime tiers](/docs/architecture/runtime-tiers)**
  — interpreter / JIT / AOT execution model.
