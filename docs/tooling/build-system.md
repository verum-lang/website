---
sidebar_position: 2
title: Build System
---

# Build System

`verum build` runs the full compilation pipeline (see
[architecture](/docs/architecture/compilation-pipeline)) with incremental
and parallel execution.

## Profiles

Three built-in profiles:

- **`dev`** (default) — fast compile, debug info, CBGR on, `@verify(static)`.
- **`release`** — LLVM -O3, LTO, stripped, aggressive CBGR promotion.
- **`bench`** — release + profile-guided hints, debug symbols kept.

Customise in `Verum.toml`:

```toml
[profile.release]
optimize = "aggressive"        # none | balanced | aggressive
lto      = "thin"              # off | thin | full
codegen-units = 1              # fewer = better optimisation, slower compile
strip    = true
panic    = "abort"             # abort | unwind
debug    = false
incremental = false            # force clean build per change

[profile.release.verification]
default_level = "smt"
smt_timeout_ms = 10_000
```

## Incremental compilation

Per-function fingerprints keyed on source + dependency hashes. An edit
to `src/lib.vr` invalidates only the functions actually changed and
their transitive downstream. Stored in `target/.verum-cache/`.

Typical re-build after a one-line edit: ~200 ms for a 50 K-LOC project.

## Parallelism

- **Inference**: per-module parallel via `rayon`.
- **MIR optimisation**: per-function parallel.
- **Codegen**: per-translation-unit parallel, configurable via
  `codegen-units`.
- **SMT verification**: per-obligation parallel, shared cache.

`verum build -j 16` sets the parallelism level explicitly.

## Cross-compilation

```bash
verum build --target aarch64-linux-gnu
verum build --target wasm32-wasi
verum build --target aarch64-apple-darwin
```

Supported targets:
- `x86_64-linux-gnu`, `x86_64-linux-musl`
- `aarch64-linux-gnu`, `aarch64-linux-musl`
- `x86_64-apple-darwin`, `aarch64-apple-darwin`
- `x86_64-pc-windows-msvc`
- `wasm32-wasi`, `wasm32-unknown-unknown`
- `riscv64gc-linux-gnu`
- embedded: `thumbv7em-none-eabihf`, `riscv32imac-none-elf`

Sysroots ship with the toolchain; `verum target install X` adds new ones.

## Build scripts

A `build.vr` file at the project root is a pre-build script:

```verum
// build.vr
fn main() using [IO] {
    let schema = fs::read_to_string("schema.sql")?;
    let generated = codegen_bindings(&schema);
    fs::write("target/generated/bindings.vr", &generated)?;
    println("cargo:rerun-if-changed=schema.sql");
}
```

Build scripts produce outputs under `target/generated/` which are
automatically mounted into the project.

## Features

Cargo-style feature flags:

```toml
[features]
default = ["std", "tls"]
std = []
tls = ["openssl"]
gpu = ["opencl"]
```

```bash
verum build --features gpu
verum build --no-default-features
verum build --all-features
```

## Link configuration

```toml
[build]
link-search = ["/usr/local/lib", "./vendor/lib"]
c-flags    = ["-march=native", "-DVERSION=\"3\""]
linker     = "lld"                    # ld | lld | mold | system
```

## Output

```
target/
├── debug/
│   ├── myprog            # executable (or myprog.cog for a library)
│   ├── myprog.vbc        # bytecode
│   └── deps/             # dependency artefacts
└── release/
    └── myprog            # LTO'd, stripped
```

## `cargo`-like workspace

```toml
# Verum.toml at workspace root
[workspace]
members = ["core", "api", "cli", "tools/*"]
default-members = ["api", "cli"]

[workspace.dependencies]
serde = "1.4"
```

Workspace members share a lockfile; common dependencies share versions.

## See also

- **[Cog packages](/docs/tooling/cog-packages)** — distribution.
- **[verum.toml reference](/docs/reference/verum-toml)** — manifest
  schema.
- **[Architecture → compilation pipeline](/docs/architecture/compilation-pipeline)**
  — what `verum build` actually does.
