---
sidebar_position: 6
title: Verum.toml
---

# `Verum.toml` — Manifest Reference

Every cog has a `Verum.toml` manifest at its root. This page
documents every section.

## Minimal example

```toml
[cog]
name    = "my-project"
version = "0.1.0"
edition = "2026"
```

## `[cog]` — package identity

```toml
[cog]
name           = "my-project"
version        = "0.1.0"
edition        = "2026"                      # language edition
profile        = "application"               # application | systems | research
description    = "A short description"
authors        = ["Alice <alice@example.com>"]
license        = "MIT OR Apache-2.0"
homepage       = "https://example.com"
repository     = "https://github.com/me/my-project"
documentation  = "https://docs.example.com"
keywords       = ["web", "async", "http"]
categories     = ["network-programming"]
readme         = "README.md"
rust-min       = "0.32"                      # minimum verum version
verification   = "smt"                        # advertised verification level
```

## `[dependencies]`

```toml
[dependencies]
serde   = "1.4"
tokio   = { version = "2.0", default-features = false, features = ["rt"] }
my-lib  = { path = "../my-lib" }
data    = { git = "https://github.com/me/data", rev = "abc123" }
custom  = { ipfs = "Qm..." }                 # content-addressed

[dev-dependencies]
criterion = "0.5"

[build-dependencies]
codegen = "0.2"
```

Version specifiers follow SemVer:
- `"1.4"` — `^1.4` (>= 1.4.0, < 2.0.0).
- `"=1.4.2"` — exactly 1.4.2.
- `"~1.4.2"` — (>= 1.4.2, < 1.5.0).
- `">=1.4, <2.0"` — explicit range.

## `[features]`

```toml
[features]
default = ["std", "tls"]
std     = []
tls     = ["openssl"]
gpu     = ["opencl", "tensor-gpu"]
full    = ["std", "tls", "gpu"]
```

Dependencies can be feature-gated:

```toml
[dependencies]
openssl = { version = "0.3", optional = true }
```

Enable with `verum build --features gpu` or via
`features = ["gpu"]` on a dependency.

## `[verification]`

```toml
[verification]
default_level        = "smt"        # runtime | static | smt | portfolio | certified
smt_timeout_ms       = 5000
portfolio_quorum     = 2             # both solvers must agree
emit_certificates    = true          # embed proof certs in VBC
cache_directory      = "target/smt-cache"
fallback_strategy    = "other-solver" # other-solver | fail
```

## `[build]`

```toml
[build]
optimize     = "balanced"          # none | balanced | aggressive
lto          = "thin"              # off | thin | full
strip        = true
panic        = "unwind"            # abort | unwind
codegen-units = 16
target-cpu   = "native"
linker       = "lld"
link-search  = ["/usr/local/lib"]
c-flags      = ["-march=native"]
script       = "build.vr"           # optional build script
```

Per-profile override:

```toml
[profile.release]
optimize = "aggressive"
lto      = "full"
```

## `[runtime]`

```toml
[runtime]
kind          = "full"                # full | single_thread | no_async | embedded | no_runtime
worker_threads = 8
stack_size    = 2_097_152            # 2 MiB default
io_engine     = "io_uring"           # io_uring | kqueue | iocp | none
```

## `[meta]`

```toml
[meta]
recursion_limit = 256
iteration_limit = 1_000_000
memory_limit_mb = 64
timeout_ms      = 30_000
```

## `[lints]`

```toml
[lints]
pedantic      = "warn"
nonstandard_style = "deny"
dead_code     = "allow"
unused_imports = "warn"
```

## `[workspace]` (root only)

```toml
[workspace]
members         = ["core", "api", "cli"]
default-members = ["cli"]
exclude         = ["vendor/*"]

[workspace.dependencies]
serde = "1.4"
```

Members can reference shared deps with `serde = { workspace = true }`.

## `[test]`

```toml
[test]
harness    = "default"              # default | custom
timeout_ms = 30_000
```

## `[[bin]]`, `[[example]]`, `[[bench]]`

Custom binary / example / benchmark targets:

```toml
[[bin]]
name = "my-tool"
path = "src/bin/tool.vr"

[[example]]
name = "quickstart"
path = "examples/quickstart.vr"
```

## `[ffi]`

```toml
[ffi.openssl]
kind         = "system"              # system | static | pkg-config
libraries    = ["ssl", "crypto"]
min_version  = "3.0"
```

## Inheritance

Workspace `Verum.toml` fields propagate to members; members can override.

## `Verum.lock`

Generated automatically. Pins exact versions of all transitive
dependencies. Commit to version control for binary projects; optional
for libraries.

## See also

- **[Cog packages](/docs/tooling/cog-packages)** — distribution story.
- **[Build system](/docs/tooling/build-system)** — how the manifest
  drives the compiler.
- **[CLI commands](/docs/reference/cli-commands)** — commands that
  read/write this file.
