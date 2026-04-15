---
sidebar_position: 6
title: Verum.toml
---

# `Verum.toml` — Manifest Reference

Every cog has a `Verum.toml` manifest at its root. The schema below
matches `crates/verum_cli/src/config.rs` and
`crates/verum_compiler/src/linker_config.rs`.

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
verification     = "runtime"         # none | runtime | proof
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

## `[verify]` — formal verification

```toml
[verify]
default_strategy  = "formal"         # runtime | static | formal | fast |
                                     # thorough | certified | synthesize
solver_timeout_ms = 10000
enable_telemetry  = true             # write .verum/state/smt-stats.json
persist_stats     = true
fail_on_divergence = true

[verify.modules."crypto.signing"]    # per-module override
strategy          = "certified"
solver_timeout_ms = 60000
```

Strategy-specific timeout multipliers: `fast 0.3×`, `thorough 2×`,
`certified 3×`, `synthesize 5×`.

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

Debug-adapter configuration for DAP integration.

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

LLVM backend fine-tuning — target CPU, feature flags, optimisation
pass selection, LTO modes, profile-guided optimisation, and cross-
compilation sysroots. These are parsed but sparsely used; stick to
`[build]`, `[profile.*]`, and `[linker]` for normal projects.

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

## See also

- **[Cog packages](/docs/tooling/cog-packages)** — distribution story.
- **[Build system](/docs/tooling/build-system)** — how the manifest
  drives the compiler.
- **[CLI commands](/docs/reference/cli-commands)** — `verum` subcommands
  that consume these settings.
