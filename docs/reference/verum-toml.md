---
sidebar_position: 6
title: verum.toml
---

# `verum.toml` — Manifest Reference

Every cog has a `verum.toml` manifest at its root. The schema below
is the authoritative description of every field the compiler and CLI
will consume.

## Minimal example

```toml
[cog]
name    = "my-project"
version = "0.1.0"

[language]
profile = "application"
```

## `[cog]` — package identity

```toml
[cog]
name        = "my-project"           # required
version     = "0.1.0"                # required
authors     = ["Alice <a@example.com>"]
description = "A short description"
license     = "MIT OR Apache-2.0"
homepage    = "https://example.com"
repository  = "https://github.com/me/my-project"
keywords    = ["web", "async"]
categories  = ["network"]
```

The `[cog]` section is for metadata only. `edition`, `profile`,
`rust-min`, `readme`, `documentation`, and `verification` are **not**
recognised fields — the corresponding concepts live in the sections
below.

## `[language]` — language profile

```toml
[language]
profile = "application"          # application | systems | research
```

| Profile | Unsafe | Dependent types | Target audience |
|---------|--------|-----------------|-----------------|
| `application` (default) | — | opt-in | ~80 % of users — no `unsafe`, refinements + runtime checks |
| `systems`               | ✓ | ✓ | allocators, drivers, OS code |
| `research`              | ✓ | ✓ + required verification | proof-heavy code |

## `[dependencies]`, `[dev_dependencies]`, `[build_dependencies]`

```toml
[dependencies]
serde  = "1.4"
tokio  = { version = "2.0", features = ["rt"] }
mylib  = { path = "../mylib" }
data   = { git = "https://github.com/me/data", rev = "abc123" }

[dev_dependencies]
criterion = "0.5"

[build_dependencies]
codegen = "0.2"
```

Note the **underscore** spelling: `dev_dependencies`, not
`dev-dependencies`.

Detailed dependency fields: `version`, `path`, `git`, `branch`, `tag`,
`rev`, `features`, `optional`.

Version specifiers follow SemVer:
- `"1.4"` — `^1.4` (`>= 1.4.0, < 2.0.0`).
- `"=1.4.2"` — exactly 1.4.2.
- `"~1.4.2"` — `>= 1.4.2, < 1.5.0`.
- `">=1.4, <2.0"` — explicit range.

## `[features]`

```toml
[features]
default = ["std", "tls"]
std     = []
tls     = ["openssl"]
gpu     = ["opencl"]
```

Optional dependencies participate via the dependency's `optional` flag.
Enable at build time with `verum build --features gpu` or
`--all-features`.

## `[build]` — basic build settings

```toml
[build]
target        = "native"             # or a target triple
opt_level     = 2                    # 0-3
incremental   = true
lto           = false                # bool here; use [lto] for strategies
codegen_units = 16
panic         = "unwind"             # unwind | abort
```

## `[profile.dev]`, `[profile.release]`, `[profile.test]`, `[profile.bench]`

Per-profile overrides. Each profile carries:

```toml
[profile.release]
tier             = "1"               # "0" interpreter | "1" aot (aliases accepted)
verification     = "certified"       # see "verification levels" table below
opt_level        = 3
debug            = false
debug_assertions = false
overflow_checks  = false
lto              = true
incremental      = false
codegen_units    = 1
cbgr_checks      = "optimized"       # all | optimized | proven
```

`tier` accepts the strings `"0"`, `"interpreter"`, `"interp"` for
interpreter mode and `"1"`, `"aot"`, `"release"`, `"native"` for AOT.

### Verification levels — nine-strategy ladder

The `verification` field of every profile (and `default_strategy` of
`[verify]` below) accepts one of ten lowercase strings, ordered by
strictly increasing rigour:

| Value          | Strategy                                                      | When to pick |
|----------------|---------------------------------------------------------------|--------------|
| `none`         | Unchecked                                                     | Never auto-selected; only by explicit override. |
| `runtime`      | Runtime assertions                                            | Default for the `application` profile. |
| `static`       | Dataflow + CBGR                                               | Trivially decidable refinements without SMT. |
| `fast`         | Bounded SMT                                                   | ≤ 100 ms / goal; UNKNOWN-tolerant. |
| `formal`       | multiple SMT backends portfolio                                           | Default `dev` for `research` profile. |
| `proof`        | User tactic + kernel re-check                                 | Promotes when SMT cannot discharge. |
| `thorough`     | `formal` + invariants / frame / termination                   | Catches missing specs. |
| `reliable`     | `thorough` + the SMT backend ∧ the SMT backend cross-check                            | UNKNOWN on disagreement. |
| `certified`    | `reliable` + certificate re-check + cross-format export       | Default `release` for `research` profile. |
| `synthesize`   | Inverse proof search → strictest non-synth strategy           | Holes filled by search; cost is unbounded. |

**Direction** — `@verify(proof)` on a function compiling under
`@verify(runtime)` is always accepted (lax → strict). The reverse
requires re-proof and is rejected by the level-inference pass.

Plus the coherent and complexity-typed extensions (`complexity_typed`,
`coherent_static`, `coherent_runtime`, `coherent`) — see
[Gradual verification](/docs/verification/gradual-verification)
for the full ν-coordinate ordering, capability-router dispatch
table, and cost / completeness trade-off per strategy.

## `[verify]` — formal verification

```toml
[verify]
# Base behaviour
default_strategy      = "formal"          # runtime | static | formal | fast |
                                          # thorough | certified | synthesize
solver_timeout_ms     = 10_000
enable_telemetry      = true              # write .verum/state/smt-stats.json
persist_stats         = true
fail_on_divergence    = true              # certified + cross-verifier divergence = build fail

# Budget / profiling knobs — see `docs/verification/performance.md` and
# `docs/verification/cli-workflow.md` for the workflow.
total_budget            = "120s"          # fail the build past this wall-clock
slow_threshold          = "5s"            # flag functions slower than this
profile_slow_functions  = true            # enable profiler when --profile given
profile_threshold       = "1s"            # only profile functions past this

# On-disk cache
cache_dir               = ".verum/verify-cache"
cache_max_size          = "500MB"
cache_ttl               = "30d"           # evict entries older than this

# Shared CI cache — S3 or Redis, reads + writes proofs across runs.
distributed_cache       = "s3://my-bucket/verify-cache"

# Per-module override: narrower scope than top-level [verify].
[verify.modules."crypto.signing"]
strategy                = "certified"
solver_timeout_ms       = 60_000

# Named profiles — selected via `verum verify --verify-profile <name>`.
# Inheritance: CLI flag > profile > [verify] > default.
[verify.profiles.release]
default_strategy        = "certified"
solver_timeout_ms       = 300_000
fail_on_divergence      = true

[verify.profiles.ci]
default_strategy        = "fast"
solver_timeout_ms       = 3_000
total_budget            = "60s"
```

Strategy-specific timeout multipliers: `fast 0.3×`, `thorough 2×`,
`certified 3×`, `synthesize 5×`.

Precedence (highest → lowest):

1. CLI flag (`--solver`, `--timeout`, `--budget`, `--distributed-cache`, …).
2. Active `[verify.profiles.<name>]` if `--verify-profile <name>` is set.
3. Per-module override in `[verify.modules."module.path"]` (for functions
   that live in that module and its descendants).
4. Top-level `[verify]`.
5. Built-in default.

Human-readable durations: `s`, `m`, `h`, `d` suffixes (or a bare
integer = seconds).

### `[verify.solver]` — solver tuning

Direct passthroughs to `SmtBackendConfig`, `SmtBackendConfig`, and the
intermediate verifier configs. Each field is **load-bearing**
— see [Architecture → SMT integration → Configuration knobs](/docs/architecture/smt-integration#configuration-knobs)
for the full matrix and which multiple SMT backends parameter scope each
setting reaches.

```toml
[verify.solver]
# Solver selection
backend                 = "auto"          # auto | auto | portfolio | capability_router

# the SMT backend-specific tuning
[verify.solver.smt-backend]
enable_proofs           = true
minimize_cores          = true
enable_interpolation    = false
global_timeout_ms       = 30_000          # context-level cap (Config::set_timeout_msec)
memory_limit_mb         = 8_192           # process-wide (set_global_param)
enable_mbqi             = true
enable_patterns         = true
random_seed             = 42              # reproducibility (smt.random_seed)
auto_tactics            = true            # auto_config Config param

# the SMT backend-specific tuning
[verify.solver.smt-backend]
logic                   = "ALL"           # SMT-LIB logic name
timeout_ms              = 30_000          # tlimit-per
incremental             = true
produce_models          = true
produce_proofs          = true
produce_unsat_cores     = true
preprocessing           = true            # preprocess-only=false
quantifier_mode         = "auto"          # none | ematching | cegqi | mbqi | auto
random_seed             = 42
verbosity               = 0               # 0–5, saturates at 5

# Quantifier elimination
[verify.solver.qe]
timeout_ms              = 5_000
simplify_level          = 2               # 0=skip | 1=simplify | 2=+propagate-values | 3=+ctx-simplify
use_qe_lite             = true
use_qe_sat              = true
use_model_projection    = true
use_skolemization       = true

# Interpolation
[verify.solver.interpolation]
algorithm               = "MBI"           # McMillan | Pudlak | Dual | Symmetric | MBI | PingPong | Pogo
strength                = "balanced"      # weakest | balanced | strongest
simplify                = true
timeout_ms              = 5_000
quantifier_elimination  = true            # if false, project_onto_shared returns input verbatim
max_projection_vars     = 100             # MBI bails when elimination set exceeds this

# Static verification (bounds elimination)
[verify.solver.static]
timeout_ms              = 30_000          # global
constraint_timeout_ms   = 100             # per-constraint
enable_proofs           = true
enable_unsat_cores      = true
minimize_cores          = true
enable_caching          = true
max_cache_size          = 10_000
auto_tactics            = true
memory_limit_mb         = 4_096

# Bisimulation
[verify.solver.bisimulation]
max_depth               = 100
timeout_ms              = 30_000
generate_counterexamples = true
infinite_strategy       = "bounded_unfolding"  # coinduction | up_to | bounded_unfolding

# Separation logic
[verify.solver.sep_logic]
entailment_timeout_ms   = 5_000
max_unfolding_depth     = 10
enable_frame_inference  = true            # set false to skip residual computation (~30% encoder reduction)

# Unsat-core extraction
[verify.solver.unsat_core]
minimize                = true
quick_extraction        = false
max_iterations          = 100
timeout_ms              = 10_000
proof_based             = false

# Optimizer (MaxSAT, Pareto)
[verify.solver.optimizer]
incremental             = true            # if false, push/pop are no-ops
max_solutions           = -1              # -1 = unbounded; positive = Pareto-front cap
timeout_ms              = 30_000
enable_cores            = true
method                  = "lexicographic" # lexicographic | pareto | box | weighted_sum

# Parallel portfolio
[verify.solver.parallel]
num_workers             = 8
timeout_ms              = 30_000
enable_sharing          = true            # broader gate over enable_lemma_exchange
enable_lemma_exchange   = true            # effective only when enable_sharing is also true
race_mode               = true
lemma_exchange_interval_ms = 500
max_lemmas_per_exchange = 10
enable_cube_and_conquer = false
cubes_per_worker        = 4

# Verification cache (cross-build SMT result reuse)
[verify.solver.cache]
max_size                = 2_000           # entries
max_size_bytes          = "500MB"
ttl                     = "30d"
statistics_driven       = true            # cache only expensive queries
min_decisions_to_cache  = 1_000
min_conflicts_to_cache  = 100
min_solve_time_ms       = 100
```

:::tip the SMT backend parameter-scope discipline
The SMT backend has three parameter scopes that are **not interchangeable**:
global (`set_global_param`), Config (`Config::set_param_value`),
and Solver (`Params::set_u32` + `Solver::set_params`). The
verifier picks the right scope per key empirically — for
example, `memory_max_size` only works at global scope (Config
is silently ignored, Solver mis-routes queries). The matrix
in [Architecture → SMT integration](/docs/architecture/smt-integration#solver-parameter-scope-discipline)
documents every key the manifest exposes.
:::

### Recap: how the manifest reaches the solver

The full chain when you set a value in `verum.toml`:

```
verum.toml [verify.solver.<sub>]
    ↓ (parsed by VerificationConfig in verum_compiler::verification_config)
CompilerOptions
    ↓ (passed at session construction)
Phase config (e.g. ContractVerificationPhase, StaticVerifier)
    ↓ (forwarded into the subsystem)
Subsystem config (e.g. RefinementConfig, QEConfig, InterpolationConfig)
    ↓ (consulted by the verifier method)
Backend-specific config (SmtBackendConfig / SmtBackendConfig)
    ↓ (per-call wiring on each fresh solver)
The SMT backend Params / the SMT backend options
```

Every field in this chain has been audited for "set but never
read" gaps; see the [closure log](/docs/changelog) for the
full list.

## `[workspace]`

```toml
[workspace]
members = ["core", "api", "cli"]
exclude = ["vendor/*"]
```

## `[registry]`

```toml
[registry]
index = "https://registry.verum-lang.org"
```

## Language-feature sections

Nine orthogonal sections each gate a subsystem. Every field defaults
to a sensible value; include only the ones you want to change.

### `[types]`

```toml
[types]
dependent              = true
refinement             = true
cubical                = true
higher_kinded          = true
universe_polymorphism  = false       # opt-in; rare & costly
coinductive            = true
quotient               = true
instance_search        = true
coherence_check_depth  = 16
```

### `[runtime]`

```toml
[runtime]
cbgr_mode            = "mixed"       # managed | checked | unsafe | mixed
async_scheduler      = "work_stealing"  # single_threaded | multi_threaded | work_stealing
async_worker_threads = 0             # 0 = logical CPU count
futures              = true
nurseries            = true
task_stack_size      = 0             # 0 = OS default
heap_policy          = "adaptive"    # aggressive | conservative | adaptive
panic                = "unwind"      # unwind | abort
```

### `[codegen]`

```toml
[codegen]
tier                    = "aot"      # interpret | aot | check
mlir_gpu                = false      # MLIR path for @device(GPU) code
gpu_backend             = "auto"     # auto | metal | cuda | rocm | vulkan
monomorphization_cache  = true
proof_erasure           = true
debug_info              = "line"     # none | line | full
tail_call_optimization  = true
vectorize               = true
inline_depth            = 3
```

### `[meta]`

```toml
[meta]
compile_time_functions  = true
quote_syntax            = true
macro_recursion_limit   = 128
reflection              = true
derive                  = true
max_stage_level         = 2          # 0=runtime, 1=meta fn, 2+=multi-stage
```

### `[protocols]`

```toml
[protocols]
coherence                 = "strict"       # strict | lenient | unchecked
resolution_strategy       = "most_specific" # most_specific | first_declared | error
blanket_impls             = true
higher_kinded_protocols   = true
associated_types          = true
generic_associated_types  = true
```

### `[context]`

```toml
[context]
enabled              = true
unresolved_policy    = "error"       # error | warn | allow
negative_constraints = true
propagation_depth    = 32
```

### `[safety]`

```toml
[safety]
unsafe_allowed       = true
ffi                  = true
ffi_boundary         = "strict"      # strict | lenient
capability_required  = false
mls_level            = "public"      # public | secret | top_secret
forbid_stdlib_extern = false
```

### `[test]`

```toml
[test]
differential     = false             # VBC vs LLVM AOT must agree
property_testing = true
proptest_cases   = 256
fuzzing          = false
timeout_secs     = 60
parallel         = true
coverage         = false
deny_warnings    = false
```

### `[debug]`

Debug Adapter Protocol (DAP) configuration for IDE integration.

```toml
[debug]
dap_enabled        = true
step_granularity   = "statement"     # statement | line | instruction
inspect_depth      = 8
port               = 0              # 0 = auto-pick; used when --transport socket
show_erased_proofs = false
```

`verum dap` refuses to start when `dap_enabled = false`.

## `[linker]` — native linking

Full linker control (parsed by `verum_compiler`):

```toml
[linker]
output            = "executable"     # executable | shared | static | object
lto               = "thin"           # none | thin | full
use_lld           = true             # default true on Linux, false elsewhere
pic               = true
strip             = false
strip_debug_only  = false
debug_info        = true
static_link       = false
entry_point       = "main"
target            = "native"
library_paths     = ["/usr/local/lib"]
libraries         = ["ssl", "crypto"]
exports           = ["verum_init"]
extra_flags       = ["-Wl,--gc-sections"]

[linker.linux]
library_paths     = ["/opt/local/lib"]
libraries         = ["dl"]

[linker.macos]
extra_flags       = ["-framework", "CoreFoundation"]

[linker.windows]
libraries         = ["kernel32", "user32"]
```

Profile-scoped overrides:

```toml
[profile.release.linker]
lto               = "full"
strip             = true
```

## `[llvm]`, `[optimization]`, `[lto]`, `[pgo]`, `[cross_compile]`

LLVM backend fine-tuning. These sections let you control the native
code generator beyond what `[build]` exposes.

```toml
[llvm]
target_triple    = "x86_64-unknown-linux-gnu"   # override `[build].target` for LLVM
target_cpu       = "native"                     # "native" | "generic" | "znver3" | …
target_features  = "+avx2,+fma"                 # comma-separated, `+`/`-` prefixed

[optimization]
level    = 3           # 0–3, orthogonal to `[build].opt_level` when you need
size_opt = false       # to diverge from the CLI's debug/release mapping
inline   = true

[lto]
enabled = true
mode    = "thin"       # "thin" (fast, moderate wins) | "full" (slow, maximum wins)

[pgo]
enabled      = true
profile_path = "target/pgo/default.profdata"

[cross_compile]
target  = "aarch64-apple-darwin"
sysroot = "/opt/xcode-sdks/MacOSX.sdk"
linker  = "clang"
```

CLI equivalents (build-time):

| TOML field | CLI flag |
|------------|----------|
| `[build].target`, `[cross_compile].target` | `--target TRIPLE` |
| `[optimization].level`, `[build].opt_level` | `--release` (= 3) |
| `[lto].enabled` + `[lto].mode` | `--lto thin\|full` |
| `[build].incremental` | `--timings` triggers report when enabled |
| static linking | `--static-link` |
| stripping | `--strip` / `--strip-debug` |
| emit artefacts | `--emit-asm`, `--emit-llvm`, `--emit-bc`, `--emit-types`, `--emit-vbc` |

CLI flags **always override** the manifest for the current build;
`verum.toml` values describe the project baseline.

## `[lint]` — linter policy

The `[lint]` section drives `verum lint`. It supports per-rule
severity, profiles, per-file overrides, named architecture layers,
naming-convention enforcement, plus refinement / capability / context
/ CBGR-tier / verification policies that are unique to Verum.

```toml
[lint]
extends  = "recommended"          # minimal | recommended | strict | relaxed
disabled = []
denied   = ["deprecated-syntax"]

[lint.severity]
unused-import     = "warn"
deprecated-syntax = "error"

[lint.rules.large-copy]
size-threshold-bytes = 256
exempt-types         = ["UserId", "Hash"]

[lint.per_file_overrides]
"tests/**" = { allow = ["unused-result", "todo-in-code"] }

[lint.architecture.layers]
core   = { allow_imports = ["core", "std"] }
domain = { allow_imports = ["core", "std", "domain"] }

[lint.refinement_policy]
public_api_must_refine_int   = true
require_verify_on_refined_fn = true

[lint.context_policy.modules]
"core.*" = { forbid = ["Database", "Logger", "Clock"] }
```

Full schema, every knob, every preset and the precedence stack:
**[Reference → Lint configuration](/docs/reference/lint-configuration)**.

## `[lsp]`

```toml
[lsp]
enable_cost_hints = true             # show CBGR tier / refinement costs inline
validation_mode   = "incremental"    # incremental | batch
auto_import       = true
format_on_save    = false
```

## `Verum.lock`

Generated automatically. Pins exact versions of all transitive
dependencies. Commit for binary projects; optional for libraries.

## CLI overrides (`-Z`)

Any manifest value can be overridden at the command line without
editing the file:

```bash
verum build -Z codegen.tier=interpret -Z safety.unsafe_allowed=false
verum run --no-cubical -Z runtime.cbgr_mode=unsafe
verum test -Z test.parallel=false -Z test.timeout_secs=120
```

Precedence (low → high):

1. Built-in defaults
2. `verum.toml` values
3. High-level CLI flags (`--tier`, `--no-cubical`, `--cbgr`, `--gpu`)
4. `-Z KEY=VALUE` overrides

Invalid keys produce a descriptive error listing all valid prefixes.
Typos trigger "did you mean" suggestions via edit distance.

## Inspecting & validating

```bash
verum config show              # human-readable resolved feature set
verum config show --json       # machine-readable JSON
verum config validate          # exit 0 on valid, non-zero with diagnostics
```

`verum config show` displays every flag's effective value after all
overrides are applied, so you can verify that your `-Z` flags and
`verum.toml` produce the expected configuration.

## See also

- **[Cog packages](/docs/tooling/cog-packages)** — distribution story.
- **[Build system](/docs/tooling/build-system)** — how the manifest
  drives the compiler.
- **[CLI commands](/docs/reference/cli-commands)** — `verum` subcommands
  that consume these settings.
