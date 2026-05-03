---
sidebar_position: 31
title: Solver Tuning
description: Complete reference for tuning the SMT solver — every config field, default, and parameter scope, with copy-paste recipes for common workflows.
---

# Solver Tuning

This page is the **operator's manual** for the verification
solver: every configurable knob, what it does, and which
combinations to reach for under specific workflow goals.

If you only want to set a per-function timeout, use
`@verify(thorough)` and stop reading. If you need to bound
memory in CI, configure the SMT backend's quantifier strategy, or
debug a stuck proof, this page is the one to bookmark.

---

## How to read this page

Each subsection covers **one configuration struct** in the
verification stack. For each, you see:

- **Owner** — which subsystem owns the struct.
- **Where it's set** — manifest section, CLI flag, or `@verify`
  attribute.
- **Default** — the value you get from `Default::default()`.
- **Effect** — what changing the value actually does.
- **Wiring scope** — which multiple SMT backends parameter scope (global,
  Config, or Solver) the field reaches; see [scope discipline](#parameter-scope-discipline)
  for why this matters.

Every field listed is **load-bearing**: an audit run on
2026-04-29 confirmed that toggling each one has an
observable effect on the corresponding solver invocation.
Fields are not "best-effort hints" — Verum treats every
documented knob as a contract.

---

## Three layers of tuning

When you tune the solver, the value flows through three
nested layers:

```
verum.toml [verify.*]            ← persistent project policy
   ↓
CLI flag (--solver, --timeout)   ← per-invocation override
   ↓
@verify(strategy) attribute      ← per-function override
```

The **most-specific** layer wins. The full precedence order
(highest → lowest):

1. CLI flag (`verum verify --timeout 60s`)
2. Active manifest profile (`[verify.profiles.<name>]` when
   `--verify-profile <name>`)
3. Per-module manifest override (`[verify.modules."<path>"]`)
4. Top-level `[verify]` / `[verify.solver]`
5. `@verify(strategy)` attribute on the function
6. Built-in default

Within layer 4 (manifest), the structs below are the
authoritative schema.

---

## RefinementConfig — refinement-type subtyping

**Owner**: `verum_types::refinement::RefinementChecker`.

**Where set**: `[verify]` / `[verify.solver]` (top-level
timeout knobs); the structured form lives in
`[verify.solver.refinement]` (planned for v0.4).

**Use when**: every time the type checker proves a
refinement subtyping `T{φ1} <: T{φ2}` — which is everywhere
refinements appear, including function args, return types,
and `let` bindings.

| Field | Default | Effect |
|-------|--------:|--------|
| `enable_smt` | `true` | When `false`, fall back to syntactic-only subsumption — fast but conservative (rejects valid programs that need SMT). |
| `timeout_ms` | `100` | Per-query the SMT backend budget. The spec mandates 10–500 ms for refinement checks; values outside that range trigger a warning at type-check time. |
| `enable_cache` | `true` | Memoise verification conditions by their SHA-256 fingerprint. Disabling adds ~30% to total verification time. |
| `max_cache_size` | `10 000` | LRU bound. Each entry is ~512 B, so 10 k entries ≈ 5 MB. |

**Recipe — fast IDE feedback**:

```toml
[verify.solver.refinement]
timeout_ms       = 50    # 100 ms is too slow for on-type
enable_cache     = true
max_cache_size   = 50_000  # bigger cache = more reuse
```

**Recipe — strict CI**:

```toml
[verify.solver.refinement]
timeout_ms       = 5_000   # generous; CI cares about correctness, not latency
```

---

## QEConfig — quantifier elimination

**Owner**: `verum_smt::quantifier_elim::QuantifierEliminator`.

**Used by**: invariant synthesis, weakest-precondition
computation, refinement projection.

| Field | Default | Effect |
|-------|--------:|--------|
| `timeout_ms` | `5 000` | Per-QE-call the SMT backend budget. |
| `max_iterations` | `10` | Reserved for iterative QE (planned). |
| `use_qe_lite` | `true` | Try the SMT backend's `qe-light` first — fast for linear arithmetic. |
| `use_qe_sat` | `true` | SAT-preprocess Boolean-heavy formulas before QE. |
| `use_model_projection` | `true` | Model-based projection for non-linear cases. |
| `use_skolemization` | `true` | Skolem-functions fallback when QE-lite + projection fail. |
| `simplify_level` | `2` | See chain table below. |

`simplify_level` maps to escalating the SMT backend tactic chains:

| Level | Chain |
|-------|-------|
| `0` | `skip` (identity — no rewriting) |
| `1` | `simplify` |
| `2` (default) | `simplify` ∘ `propagate-values` |
| `3+` | `simplify` ∘ `propagate-values` ∘ `ctx-simplify` |

Higher levels produce smaller / more readable invariants but
spend more time. `0` is useful when you want to feed the
QE result directly to a downstream rewriter that has its
own simplifier.

---

## InterpolationConfig — Craig interpolation

**Owner**: `verum_smt::interpolation::InterpolationEngine`.

**Used by**: compositional verification (split a hard goal
into A ⇒ I, I ∧ B ⇒ ⊥), inductive-invariant synthesis (use
interpolant as candidate invariant).

| Field | Default | Effect |
|-------|---------|--------|
| `algorithm` | `MBI` | Pick: `McMillan` (proof-based, strongest), `Pudlak` (dual, weakest), `Dual` (combines), `Symmetric` (avoids McMillan/Pudlak bias), `MBI` (model-based, the SMT backend-native), `PingPong` / `Pogo` (specialised). |
| `strength` | `Balanced` | Bias toward stronger or weaker interpolant. |
| `simplify` | `true` | Run `simplify` on the result before returning. |
| `timeout_ms` | `Some(5 000)` | Per-interpolation the SMT backend budget; `None` = unbounded (only for offline runs). |
| `proof_based` | `false` | Reserved for proof-based fallback. |
| `model_based` | `true` | Reserved for MBI fallback hint. |
| `quantifier_elimination` | `true` | When `false`, MBI's `project_onto_shared` skips QE and returns the original formula. McMillan correctness (`A ⇒ I`) is preserved; the `I ∧ B ⇒ ⊥` half degrades. |
| `max_projection_vars` | `100` | Reject MBI projection when the elimination set is larger — exponential in some theories. |

**Recipe — large heaps**:

```toml
[verify.solver.interpolation]
algorithm            = "MBI"
quantifier_elimination = false   # ~30% encoder reduction
max_projection_vars  = 50         # bail earlier on blowup
```

---

## StaticVerificationConfig — bounds / safety

**Owner**: `verum_smt::static_verification::StaticVerifier`.

**Used by**: compile-time elimination of runtime checks
(`verum build` with `enable_bounds_elimination = true`).

| Field | Default | Effect |
|-------|--------:|--------|
| `timeout_ms` | `30 000` | Global wall-clock for the entire verifier pass. |
| `constraint_timeout_ms` | `100` | Per-constraint the SMT backend budget — triggers graceful degradation (constraint stays in runtime CFG instead of being eliminated). |
| `enable_proofs` | `true` | Request the SMT backend proof generation. |
| `enable_unsat_cores` | `true` | Extract minimal unsat cores for diagnostics. |
| `minimize_cores` | `true` | Iterate to find a *minimal* core (more expensive). |
| `enable_caching` | `true` | Proof-cache lookups across runs. |
| `max_cache_size` | `10 000` | LRU bound on the proof cache. |
| `enable_parallel` | `false` | Reserved — the SMT backend Context is not Send/Sync in 0.19. |
| `num_workers` | `cpus()` | Reserved. |
| `auto_tactics` | `true` | Use the SMT backend's tactic auto-selection when constructing solvers. |
| `memory_limit_mb` | `Some(4096)` | Process-wide memory ceiling — see [parameter-scope discipline](#parameter-scope-discipline) for why this is global, not per-solver. |

---

## SmtBackendConfig — the SMT backend-specific tuning

**Owner**: `verum_smt::backend::SmtContextManager`.

**Where set**: `[verify.solver.smt-backend]`.

| Field | Default | Effect | Wiring scope |
|-------|---------|--------|--------------|
| `enable_proofs` | `true` | Proof-log generation. | Config |
| `minimize_cores` | `true` | Pass to `unsat_core` extraction. | Solver Params |
| `enable_interpolation` | `false` | Enable the SMT backend's MBI tactic when interpolating. | tactic dispatch |
| `global_timeout_ms` | `Some(30 000)` | Context-level timeout. | Config (`set_timeout_msec`) |
| `memory_limit_mb` | `Some(8192)` | Process-wide memory ceiling. | **Global** (`memory_max_size`) |
| `enable_mbqi` | `true` | Model-based quantifier instantiation. | Solver Params (per-query) |
| `enable_patterns` | `true` | Pattern-based quantifier instantiation. | Solver Params (per-query) |
| `random_seed` | `None` | Reproducibility seed. | **Global** (`smt.random_seed`) |
| `num_workers` | `cpus().max(4)` | (Forwarded to `ParallelConfig`.) | — |
| `auto_tactics` | `true` | Auto-tactic selection. | Config (`auto_config`) |

**Recipe — reproducible CI**:

```toml
[verify.solver.smt-backend]
random_seed   = 42
auto_tactics  = false   # remove heuristic non-determinism
```

---

## SmtBackendConfig — the SMT backend-specific tuning

**Owner**: `verum_smt::backend::SmtBackend`.

**Where set**: `[verify.solver.smt-backend]`.

| Field | Default | the SMT backend option | Effect |
|-------|---------|-------------|--------|
| `logic` | `ALL` | `:logic` | SMT-LIB logic name. |
| `timeout_ms` | `Some(30 000)` | `tlimit-per` | Per-query timeout. |
| `incremental` | `true` | `incremental` | Push/pop support. |
| `produce_models` | `true` | `produce-models` | SAT result + model. |
| `produce_proofs` | `true` | `produce-proofs` | UNSAT result + proof log. |
| `produce_unsat_cores` | `true` | `produce-unsat-cores` | UNSAT + core. |
| `preprocessing` | `true` | `preprocess-only=false` | When `false`, the SMT backend stops after preprocessing — useful for instrumentation, never for production. |
| `quantifier_mode` | `Auto` | `quant-mode` | `None` / `EMatching` / `CEGQI` / `MBQI` / `Auto`. |
| `random_seed` | `None` | `seed` | Reproducibility. |
| `verbosity` | `0` | `verbosity` | 0–5; saturates at 5. |

**Quantifier-mode tuning**: the SMT backend's `Auto` heuristic picks per
goal. Pin a mode when you have ground truth about goal shape:

| Mode | Best for |
|------|----------|
| `EMatching` | Ground-instance proofs (most refinement obligations). |
| `CEGQI` | Counterexample-guided synthesis. |
| `MBQI` | Model-based; good when patterns are sparse. |
| `None` | Quantifier-free fragments only — fastest. |

---

## SubsumptionConfig — refinement subtyping internals

**Owner**: `verum_smt::subsumption::SubsumptionChecker`.

| Field | Default | Effect |
|-------|--------:|--------|
| `cache_size` | `10 000` | LRU bound on result cache. |
| `smt_timeout_ms` | `100` | Per-query the SMT backend budget. **Updated dynamically** by `RefinementSmtBackend::set_timeout_ms` so each `RefinementConfig.timeout_ms` change takes effect immediately. |

This is an internal struct; you don't normally configure it
directly — `RefinementConfig.timeout_ms` propagates here.

---

## BisimulationConfig — coinductive equivalence

**Owner**: `verum_smt::coinductive::BisimulationChecker`.

**Used by**: behavioural equivalence checks for session
types, π-calculus processes, lazy data structures.

| Field | Default | Effect |
|-------|--------:|--------|
| `max_depth` | `100` | Hard cap on recursive-destructor unfolding. |
| `timeout_ms` | `30 000` | Per-query the SMT backend budget. |
| `generate_counterexamples` | `true` | When `false`, leave the counterexample slot as `None` to save formatting work — useful when you only need the boolean answer. |
| `infinite_strategy` | `BoundedUnfolding` | `Coinduction` / `UpToBisimulation` / `BoundedUnfolding`. |

---

## SepLogicConfig — separation logic

**Owner**: `verum_smt::separation_logic::SepLogicEncoder`.

**Used by**: heap-shape verification (linked lists, trees,
graph predicates).

| Field | Default | Effect |
|-------|--------:|--------|
| `entailment_timeout_ms` | `5 000` | Per-entailment the SMT backend budget. |
| `max_unfolding_depth` | `10` | Bound on recursive-predicate unfolding (`ListSeg`, `TreePred`). |
| `enable_frame_inference` | `true` | Gates `infer_frame`; when `false`, returns typed failure so callers that only need entailment validity skip the residual computation (~30% encoder reduction on large heaps). |
| `enable_symbolic_execution` | `true` | Reserved — feature not yet enabled by default in encoder. |
| `enable_caching` | `true` | Reserved — encoding-cache infrastructure exists but isn't yet read. |

---

## UnsatCoreConfig — minimal-core extraction

**Owner**: `verum_smt::unsat_core::UnsatCoreExtractor`.

**Used by**: refinement-type error reporting (which clauses
contradict?), proof-search debugging.

| Field | Default | Effect |
|-------|--------:|--------|
| `minimize` | `true` | Iterate to find a *minimal* core. |
| `quick_extraction` | `false` | Trade minimality for speed — return the first unsat-core the SMT backend finds. |
| `max_iterations` | `100` | Bound on minimization iteration count. |
| `timeout_ms` | `Some(10 000)` | Per-extraction the SMT backend budget — folded into the same `Params` that sets `unsat_core: true`. |
| `proof_based` | `false` | Use the SMT backend's proof API instead of assumption-tracking — slower but more precise. |

---

## ParallelConfig — portfolio + cube-and-conquer

**Owner**: `verum_smt::parallel::ParallelSolver`.

**Used by**: `@verify(thorough)` and `@verify(certified)`
modes — both multiple SMT backends race to discharge the same goal.

| Field | Default | Effect |
|-------|--------:|--------|
| `num_workers` | `cpus()` | Worker thread count. |
| `strategies` | `default_strategies()` | Per-worker strategy list (the SMT backend logic, tactics, seed). |
| `timeout_ms` | `Some(30 000)` | Global timeout. |
| `enable_sharing` | `true` | **Broader gate** — must be true for *any* cross-worker exchange. |
| `enable_lemma_exchange` | `true` | Per-feature gate; effective only when `enable_sharing` is also true. |
| `race_mode` | `true` | First-to-finish terminates others. |
| `lemma_exchange_interval_ms` | `500` | How often workers swap learned clauses. |
| `max_lemmas_per_exchange` | `10` | Bound on payload size per round. |
| `enable_cube_and_conquer` | `false` | Search-space partitioning. |
| `cubes_per_worker` | `4` | Partition target. |

**Recipe — deterministic verification**:

```toml
[verify.solver.parallel]
enable_sharing  = false   # no cross-talk
race_mode       = false   # all workers finish; stable result
num_workers     = 1       # single-thread for full reproducibility
```

---

## OptimizerConfig — MaxSAT / Pareto

**Owner**: `verum_smt::optimizer::SmtOptimizer`.

**Used by**: optimization-modulo-theories (best-effort
refinement, weighted-soft-constraint solving).

| Field | Default | Effect |
|-------|---------|--------|
| `incremental` | `true` | Gates `push` / `pop` scope manipulation. When `false`, push/pop are no-ops (paired so the stack stays balanced). |
| `max_solutions` | `Some(usize::MAX)` | Cap for Pareto-front enumeration. |
| `timeout_ms` | `Some(30 000)` | Per-query the SMT backend budget. |
| `enable_cores` | `true` | Extract unsat cores for soft-constraint debugging. |
| `method` | `Lexicographic` | `Lexicographic` / `Pareto` / `Box` / `WeightedSum`. |

---

## CacheConfig — verification-result cache

**Owner**: `verum_smt::verification_cache::VerificationCache`.

**Used by**: cross-build SMT result reuse (`target/smt-cache/`).

| Field | Default | Effect |
|-------|--------:|--------|
| `max_size` | `2 000` | Entry cap. |
| `max_size_bytes` | `500 MB` | Memory cap. |
| `ttl` | `30 days` | Result expiry. |
| `statistics_driven` | `true` | When `false`, cache everything. When `true`, gate inserts on the SMT backend stats. |
| `min_decisions_to_cache` | `1 000` | ≥ this many SMT decisions → cache. |
| `min_conflicts_to_cache` | `100` | ≥ this many conflicts → cache. |
| `min_solve_time_ms` | `100` | ≥ this elapsed → cache. |
| `distributed_cache` | `None` | Opt-in distributed cache via S3/Redis URL. |

Statistics-driven caching only fires for callers that route
through `VerificationCache::insert_with_stats`. The default
`get_or_verify` path uses unconditional `insert`, so the
stats thresholds above only apply when callers explicitly
provide stats.

---

## Parameter-scope discipline

The SMT backend has three distinct parameter scopes that are **not
interchangeable** — even for the same param key:

| Scope | API | Persistence |
|-------|-----|-------------|
| Global | `smt-backend::set_global_param(k, v)` | Process-wide; most-recent call wins. |
| Config | `Config::set_param_value(k, v)` | Applied at context construction. |
| Solver | `Params::set_u32 / set_bool` + `Solver::set_params(&p)` | Per-solver. |

The empirically verified rule per key:

| Key | Global | Config | Solver |
|-----|:------:|:------:|:------:|
| `memory_max_size` | ✅ | ❌ silent ignore + help dump | ❌ mis-routes queries |
| `smt.random_seed` | ✅ | partial | ✅ |
| `auto_config` | ✅ | ✅ | ❌ |
| `proof` | ✅ | ✅ (`set_proof_generation`) | ❌ |
| `timeout` | partial | ✅ (`set_timeout_msec`) | ✅ (`set_u32`) |
| `unsat_core` | ❌ | ✅ | ✅ — must fold into the same `Params` value as the timeout |
| `quant-mode` (the SMT backend) | n/a | n/a | ✅ via `smt_solver_set_option` |

:::warning Don't trust your intuition
A parameter that looks settable at any scope frequently
isn't. the SMT backend's silent-ignore behaviour means an incorrect
choice produces a "config seems to work" failure mode that
only shows up under stress (`memory_max_size` is the
canonical example: setting it on `Config` lets the build
succeed but the SMT backend ignores the limit; setting it on `Solver`
makes the SMT backend mis-route easy queries).

If you're adding a new param to the verifier, **empirically
verify** at each scope before committing. The verifier's
audit suite includes regression tests for every parameter
that has been wired this way.
:::

### `Solver::set_params` is **destructive**

A subtle gotcha: `Solver::set_params(&params)` *replaces*
the entire param set. Two separate calls do not accumulate:

```rust
// WRONG — second call erases the first
let mut p1 = Params::new();
p1.set_bool("unsat_core", true);
solver.set_params(&p1);

let mut p2 = Params::new();
p2.set_u32("timeout", 5000);
solver.set_params(&p2);   // unsat_core is now back to default

// RIGHT — fold both keys into a single Params value
let mut p = Params::new();
p.set_bool("unsat_core", true);
p.set_u32("timeout", 5000);
solver.set_params(&p);
```

Every per-solver call site in the verifier follows this
pattern. The audit suite has a regression test for it.

---

## Common workflows

### Latency-sensitive (IDE / on-type)

```toml
[verify.solver.refinement]
timeout_ms       = 50

[verify.solver.qe]
timeout_ms       = 500
simplify_level   = 1   # cheaper

[verify.solver.cache]
max_size         = 100_000   # bigger reuse window
ttl              = "7d"
```

### CI / production builds

```toml
[verify.solver.refinement]
timeout_ms       = 5_000

[verify.solver.smt-backend]
random_seed      = 42        # reproducible failures
auto_tactics     = false
memory_limit_mb  = 16_384

[verify.solver.parallel]
enable_sharing   = false      # determinism
race_mode        = false
num_workers      = 1
```

### Deep proof debugging

```toml
[verify.solver.smt-backend]
verbosity        = 3          # the SMT backend trace output

[verify.solver.unsat_core]
minimize         = true
proof_based      = true        # slow but precise
timeout_ms       = 60_000

[verify.solver.optimizer]
incremental      = false       # no scope reuse — clean state per query
```

### Ultra-conservative (research / paper artefacts)

```toml
[verify]
default_strategy = "certified"
fail_on_divergence = true

[verify.solver.refinement]
timeout_ms       = 30_000

[verify.solver.smt-backend]
enable_proofs    = true
random_seed      = 42

[verify.solver.parallel]
enable_sharing   = false
race_mode        = false

[verify.solver.unsat_core]
proof_based      = true
```

---

## Telemetry & inspection

After a build with `--smt-stats`, inspect what each setting
actually accomplished:

```bash
verum smt-stats              # human-readable
verum smt-stats --json       # machine-readable
verum smt-stats --reset
```

The output includes per-theory routing counts, p50/p95
latency, cache hit rate, and per-strategy breakdown. Use it
to validate that a tuning change had the expected effect
before committing the manifest.

---

## See also

- **[Architecture → SMT integration](/docs/architecture/smt-integration)** —
  how the configs flow from session to solver.
- **[Reference → verum.toml](/docs/reference/verum-toml)** —
  full `[verify]` schema.
- **[Verification → SMT routing](./smt-routing.md)** —
  per-theory backend selection logic.
- **[Verification → performance](./performance.md)** —
  cost / completeness trade-offs across strategies.
- **[Verification → CLI workflow](./cli-workflow.md)** —
  per-invocation overrides and budget management.
