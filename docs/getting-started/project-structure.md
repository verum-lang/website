---
sidebar_position: 4
title: Project Structure
description: Anatomy of a Verum project — files, modules, visibility, and workspaces.
---

# Project Structure

A Verum project is called a **cog**. This page covers the layout, the
manifest, the module system, and how all of that plays together.

## Anatomy of a cog

```
my-project/
├── Verum.toml            # package manifest
├── src/
│   ├── main.vr           # entry point (application)
│   ├── lib.vr            # library root (optional)
│   ├── config.vr         # module: crate::config
│   ├── handlers/         # directory module: crate::handlers
│   │   ├── mod.vr        #   the module's root
│   │   ├── user.vr       #   submodule: crate::handlers::user
│   │   └── order.vr      #   submodule: crate::handlers::order
│   └── protocols.vr      # module: crate::protocols
├── tests/
│   └── integration.vr    # integration tests
├── benches/
│   └── bench.vr          # criterion-style benchmarks
├── examples/
│   └── quickstart.vr     # executable examples
├── proofs/               # @verify(certified) exports (optional)
│   └── kernel.verum-cert
├── build.vr              # build script (optional, for FFI)
├── Verum.lock            # dependency lock file
└── target/               # build artefacts (gitignored)
    ├── debug/
    ├── release/
    └── proof-cache/      # SMT results cache
```

Only three things are required: `Verum.toml`, `src/`, and either
`main.vr` or `lib.vr` inside `src/`.

## `Verum.toml` — the manifest

The manifest describes the cog's identity and dependencies.

```toml
[cog]
name        = "my-project"
version     = "0.1.0"
edition     = "2026"
profile     = "application"          # application | systems | research
description = "Verum URL shortener"
license     = "Apache-2.0 OR MIT"
authors     = ["Alice Smith <alice@example.com>"]
repository  = "https://github.com/alice/my-project"

[dependencies]
serde       = "1.4"
http        = { version = "0.8", features = ["tls"] }
my-utils    = { path = "../utils" }
security    = { git = "https://github.com/verum-lang/security-ext", tag = "v0.3" }
optional-dep = { version = "2.0", optional = true }

[dev-dependencies]
test-helpers = { path = "../test-helpers" }
proptest     = "1.0"

[features]
default       = ["tls"]
tls           = []
metrics       = ["dep:optional-dep"]

[verify]
default_strategy   = "static"   # runtime | static | formal | fast | thorough | certified | synthesize
default_timeout_ms = 500

[build]
optimize     = "aggressive"     # none | balanced | aggressive
lto          = "thin"           # off | thin | fat
target-cpu   = "native"         # or a specific LLVM CPU name
link-search  = ["/usr/local/lib"]

[profile.release]
overflow-checks = false
debug           = false
```

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
fn main() using [IO] {
    print("Hello, World!");
}
```

A minimal `lib.vr`:

```verum
pub type UserId is (Int) { self > 0 };

pub fn create_user(name: Text) -> User { ... }
```

## Tests

Tests live inline or in `tests/`. Inline tests use `@test`:

```verum
@test
fn addition_commutes() {
    assert(1 + 2 == 2 + 1);
}

@test(property)
fn sort_is_idempotent(xs: List<Int>) {
    assert(xs.sorted().sorted() == xs.sorted());
}

@test(async)
async fn fetches_the_right_page() {
    let page = fetch(&url).await?;
    assert_eq(page.title, "Welcome");
}
```

Integration tests live in `tests/`:

```
tests/
├── integration.vr
├── http_test.vr
└── fixtures/
    └── golden.json
```

Each file is compiled as a separate top-level program; they share
the project's dependencies but each file runs independently.

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
├── Verum.toml                 # workspace root
├── Verum.lock                 # shared lock
├── target/                    # shared build target
├── core/
│   ├── Verum.toml
│   └── src/lib.vr
├── api/
│   ├── Verum.toml
│   └── src/main.vr
└── cli/
    ├── Verum.toml
    └── src/main.vr
```

Workspace manifest:

```toml
# my-workspace/Verum.toml
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
# api/Verum.toml
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

## Verum.toml minimum

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
