---
sidebar_position: 4
title: Project Structure
description: Anatomy of a Verum project — files, modules, visibility, and workspaces.
---

# Project Structure

A Verum project is called a **cog**. This page covers the layout, the
manifest, the module system, and how all of that plays together.

## Anatomy of a cog

After `verum new my-project --profile application`:

```
my-project/
├── verum.toml            # package manifest (also accepts verum.toml)
├── README.md             # scaffolded
├── .gitignore            # scaffolded
├── src/
│   └── main.vr           # entry point
├── tests/
│   └── main_test.vr      # integration tests
├── benches/              # criterion-style benchmarks
└── examples/             # executable examples
```

As the project grows you organise `src/` into modules — `.vr` files
and `mod.vr`-directories:

```
my-project/src/
├── main.vr
├── lib.vr                # optional library root
├── config.vr             # module: my_project.config
├── handlers/             # directory module: my_project.handlers
│   ├── mod.vr            #   the module's root
│   ├── user.vr           #   submodule: my_project.handlers.user
│   └── order.vr          #   submodule: my_project.handlers.order
└── protocols.vr          # module: my_project.protocols
```

Optional project-level subtrees picked up by the build system:

| Directory     | Purpose                                             |
|---------------|-----------------------------------------------------|
| `tests/`      | Integration tests — one file per binary             |
| `benches/`    | Criterion-style benchmarks                          |
| `examples/`   | Executable examples runnable with `verum run --example <name>` |
| `proofs/`     | Exported `.verum-cert` bundles (produced by `@verify(certified)`) |
| `target/`     | Build artefacts (gitignored). `debug/`, `release/`, plus `target/smt-cache/` — content-addressed SMT result cache. |
| `build.vr`    | Build script (optional, used for FFI and code-gen)  |
| `verum.lock`  | Dependency lock file                                |

Only three things are required: `verum.toml`, `src/`, and either
`main.vr` or `lib.vr` inside `src/`.

## `verum.toml` — the manifest

The manifest describes the cog's identity and dependencies. The
canonical filename is `verum.toml` (lowercase — what `verum new`
generates); the compiler also accepts the historical `Verum.toml`
spelling for back-compat, but new projects should stick with
lowercase.

```toml
[cog]
name        = "my-project"
version     = "0.1.0"
description = "Verum URL shortener"
license     = "Apache-2.0 OR MIT"
authors     = ["Alice Smith <alice@example.com>"]
keywords    = []
categories  = []

[language]
profile     = "application"     # application | systems | research

[dependencies]
stdlib       = "0.1"
serde        = "1.4"
http         = { version = "0.8", features = ["tls"] }
my-utils     = { path = "../utils" }
security     = { git = "https://github.com/verum-lang/security-ext", tag = "v0.3" }
optional-dep = { version = "2.0", optional = true }

[dev_dependencies]
test-helpers = { path = "../test-helpers" }
proptest     = "1.0"

[features]
default      = ["tls"]
tls          = []
metrics      = ["dep:optional-dep"]

[verify]
default_strategy       = "formal"   # runtime | static | formal | proof | fast | thorough | reliable | certified | synthesize
solver_timeout_ms      = 10000
enable_telemetry       = true
persist_stats          = true
fail_on_divergence     = true
profile_slow_functions = true

[build]
target       = ""              # "" = host
opt_level    = 0               # 0..3
incremental  = false
lto          = false
panic        = "unwind"        # unwind | abort

[profile.release]
tier            = "1"
verification    = "runtime"
opt_level       = 3
debug           = false
overflow_checks = false
lto             = true

[runtime]
cbgr_mode            = "mixed"   # all | mixed | optimized
async_scheduler      = "work_stealing"
async_worker_threads = 0         # 0 = CPU count
futures              = true
nurseries            = true

[types]
dependent              = true
refinement             = true
cubical                = true
higher_kinded          = true
universe_polymorphism  = false
coinductive            = true
quotient               = true
instance_search        = true
coherence_check_depth  = 16
```

This mirrors a representative `verum.toml` after `verum new --profile
application`, trimmed for readability. The full schema covers
additional sections for `[codegen]`, `[meta]`, `[protocols]`,
`[context]`, `[safety]`, `[test]`, `[debug]`, `[lsp]`, `[registry]`,
and `[verify.modules]`.

All nine `verify_strategy` names — `runtime`, `static`, `formal`,
`proof`, `fast`, `thorough`, `reliable`, `certified`, `synthesize` —
are accepted in `default_strategy`. See
[gradual verification](/docs/verification/gradual-verification) for
what each one does.

See [reference/verum-toml](/docs/reference/verum-toml) for the full
schema and every configurable field.

### Profiles

`[cog].profile` picks the default verification and build settings for
the project:

| Profile        | Default strategy | Build optimisation | Typical use                  |
|----------------|------------------|--------------------|------------------------------|
| `application`  | `static`         | `balanced`         | Services, CLIs.              |
| `systems`      | `formal`         | `aggressive`       | Systems code (OS, network).  |
| `research`     | `thorough`       | `balanced`         | Proof-heavy exploration.     |

Override any individual setting in the `[verify]` / `[build]`
sections.

## The module system

Verum modules are **directory-driven** with explicit `mount`
statements to import.

### Mounting modules

```verum
// src/lib.vr
mount config;                    // → src/config.vr  OR  src/config/mod.vr
mount handlers.user;             // → src/handlers/user.vr
mount handlers.{user, order};    // bring multiple in
mount protocols.*;               // glob — bring everything public
mount net.http as h;             // alias
```

### Module files

Each `.vr` file under `src/` is a module. A directory becomes a
module by containing a `mod.vr` file:

```
src/handlers/
    mod.vr         # pub module handlers {...}
    user.vr        # pub module handlers.user {...}
    order.vr       # pub module handlers.order {...}
```

Inside `mod.vr`, the directory's submodules are reachable without
`mount`:

```verum
// src/handlers/mod.vr
pub module handlers {
    mount .self.user;          // no effect; already in scope
    mount .self.order;

    pub fn route(req: &Request) -> Response {
        match req.path {
            "/users"  => user::list(req),
            "/orders" => order::list(req),
            _ => Response.not_found(),
        }
    }
}
```

### Paths

Four path roots:

- `crate` — the cog's root module.
- `self` — the current module.
- `super` — the parent module.
- *(no prefix)* — path resolved from the current module, then crate.

```verum
crate::types::User          // fully-qualified from cog root
super::shared_helpers::fmt  // from the parent module
.self.submodule             // explicit self-rooted
```

### Visibility

Five levels, applied to items:

```verum
pub         fn public_api()         { ... }   // exported
pub(super)  fn parent_visible()     { ... }   // parent module + descendants
pub(in net) fn net_subtree()        { ... }   // within the named subtree
internal    fn cog_wide()           { ... }   // cog-visible (alias: pub(crate))
            fn private()            { ... }   // module-local
```

Plus `protected` as a protocol-local refinement:

```verum
type User is protocol {
    protected fn sensitive_hash(&self) -> Hash;  // subtypes only
};
```

See [language/modules](/docs/language/modules) for the full
visibility story.

## Entry points

- **Applications** (`profile = "application"`): compile `src/main.vr`
  to an executable. Entry point is `fn main()`, which may be `async`.
- **Libraries** (`profile = "systems"` or `"research"`): compile
  `src/lib.vr` to a distributable cog.
- **Both**: a project can have both files — `verum build` produces
  both artefacts.

A minimal `main.vr`:

```verum
fn main() {
    print("Hello, World!");
}
```

A minimal `lib.vr`:

```verum
pub type UserId is (Int) { self > 0 };

pub fn create_user(name: Text) -> User { ... }
```

## Tests

Tests live in `tests/`. Three styles, all discovered automatically:

```verum
// tests/arith.vr

// Plain unit test — passes iff no panic.
@test
fn addition_commutes() {
    assert(1 + 2 == 2 + 1);
}

// Property-based test — harness picks 100 random (Int, Int) pairs and
// shrinks any failure to a minimal counterexample.
@property
fn sort_is_idempotent(xs: List<Int>) {
    assert_eq(xs.sorted().sorted(), xs.sorted());
}

// Parametrised table-driven test — expands into add[0]..add[2].
@test
@test_case(0, 0, 0)
@test_case(1, 2, 3)
@test_case(-5, 5, 0)
fn add(a: Int, b: Int, expected: Int) {
    assert_eq(a + b, expected);
}
```

Each file is compiled as a separate top-level program; they share the
project's dependencies but run independently. A file with `fn main()`
and no attributes is treated as one whole-file test (exit-0 means pass).

See **[Tooling → Testing](/docs/tooling/testing)** for the full guide,
or **[Tooling → Property testing](/docs/tooling/property-testing)**
for the `@property` harness in depth.

Run tests:

```bash
verum test
verum test --filter "addition"             # by name
verum test --tier integration              # only integration/
verum test --verify formal                 # promote strategy for tests
```

## Benchmarks

Benchmarks live in `benches/`:

```verum
@bench
fn sort_1000_random() using [Bench] {
    let xs = List.random_ints(1000);
    Bench.iter(|| xs.clone().sort());
}
```

Run:

```bash
verum bench
verum bench --filter "sort"
verum bench --compare-to baseline
```

## Examples

Runnable examples live in `examples/`:

```
examples/
├── quickstart.vr       # verum run --example quickstart
└── http_server.vr      # verum run --example http_server
```

Each example is a full Verum program (has its own `fn main`).

## Workspaces

Multi-cog workspaces share a lock file and a build target:

```
my-workspace/
├── verum.toml                 # workspace root
├── Verum.lock                 # shared lock
├── target/                    # shared build target
├── core/
│   ├── verum.toml
│   └── src/lib.vr
├── api/
│   ├── verum.toml
│   └── src/main.vr
└── cli/
    ├── verum.toml
    └── src/main.vr
```

Workspace manifest:

```toml
# my-workspace/verum.toml
[workspace]
members = ["core", "api", "cli", "tools/*"]
exclude = ["experiments/*"]

[workspace.dependencies]
# Shared dependency versions
serde = "1.4"
http  = "0.8"
```

Individual member manifests can inherit:

```toml
# api/verum.toml
[cog]
name    = "api"
version = "0.1.0"

[dependencies]
core  = { path = "../core" }
serde = { workspace = true }       # inherit from workspace
http  = { workspace = true }
```

See [tooling/build-system](/docs/tooling/build-system) for workspace
build semantics and [tooling/cog-packages](/docs/tooling/cog-packages)
for publishing.

## Build script — `build.vr`

For FFI or code generation at build time, place `build.vr` at the
cog root. The file compiles as a `meta` program and runs before
the main build:

```verum
// build.vr
meta fn main() using [BuildAssets, CompileDiag] {
    let version = BuildAssets.load_text("src/VERSION")?;
    BuildAssets.emit_constant("VERSION", version.trim());
    BuildAssets.link_native_lib("sqlite3");
}
```

Build scripts run in a sandboxed compile-time environment; they
cannot perform I/O outside the project directory.

## The `target/` directory

`target/` holds all build artefacts. The layout:

```
target/
├── debug/              # `verum build` output
│   ├── my-project      # binary (or my-project.cog for libraries)
│   └── deps/           # per-crate object files
├── release/            # `verum build --release` output
├── doc/                # `verum doc` output (HTML docs)
├── proof-cache/        # SMT solver memos (speed up re-verification)
└── expand/             # `verum expand` outputs (macro expansions)
```

`target/` is safe to delete; it regenerates from scratch.
`proof-cache/` is worth keeping — it holds cached SMT results that
speed up subsequent verifications.

## Ignore patterns

A minimum `.gitignore`:

```
target/
Verum.lock              # applications: commit  |  libraries: don't commit
```

Commit `Verum.lock` for applications (reproducible builds); leave it
out for libraries (callers pick their own dependency versions).

## verum.toml minimum

The absolute minimum is four lines:

```toml
[cog]
name = "hello"
version = "0.1.0"
edition = "2026"
```

No `src/main.vr`? `verum new hello` generates both.

## Next

- **[Hello, World](/docs/getting-started/hello-world)** — build a
  running program.
- **[Language Tour](/docs/getting-started/tour)** — walk through the
  language features in 10 minutes.
- **[tooling/build-system](/docs/tooling/build-system)** — how
  `verum build` works, profiles, targets.
- **[tooling/cog-packages](/docs/tooling/cog-packages)** — publishing
  and consuming cogs.
- **[reference/verum-toml](/docs/reference/verum-toml)** — every
  manifest field.
- **[language/modules](/docs/language/modules)** — the full module
  and visibility story.
