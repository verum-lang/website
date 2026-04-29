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

Customise in `verum.toml`:

```toml
[profile.release]
optimize = "aggressive"        # none | balanced | aggressive
lto      = "thin"              # off | thin | full
codegen-units = 1              # fewer = better optimisation, slower compile
strip    = true
panic    = "abort"             # abort | unwind
debug    = false
incremental = false            # force clean build per change

[verify]
default_strategy  = "formal"
solver_timeout_ms = 10_000
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

Sysroots ship with the `verum` binary; cross-compile by passing `--target <triple>`.

## Build scripts

A `build.vr` file at the project root is a pre-build script:

```verum
// build.vr
fn main() {
    let schema = fs.read_to_string("schema.sql")?;
    let generated = codegen_bindings(&schema);
    fs.write("target/generated/bindings.vr", &generated)?;
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

## Linking

CLI flags handle the common cases; the `[linker]` manifest section
covers per-platform overrides.

**Fast toggles** (map 1-to-1 to CLI flags):

```bash
verum build --lto thin            # link-time optimisation
verum build --lto full            # max wins, longer link
verum build --static-link         # produce a static binary (musl /
                                  # no-libc targets where applicable)
verum build --strip               # strip all symbols
verum build --strip-debug         # strip only debug info, keep names
```

**Manifest section**:

```toml
[linker]
# Global defaults
extra_flags = ["-Wl,--as-needed"]
libraries   = ["m", "pthread"]

# Per-platform overrides — merged with the global defaults on the
# matching target.
[linker.macos]
extra_flags = ["-framework", "CoreFoundation"]

[linker.linux]
libraries   = ["dl", "rt"]

[linker.windows]
libraries   = ["kernel32", "user32"]
```

Profile-scoped overrides (production wins take hold only in `release`):

```toml
[profile.release.linker]
lto   = "full"
strip = true
```

Precedence for a given build: `CLI flag > [profile.<active>.linker] >
[linker.<os>] > [linker] > default`.

## Emitting intermediate artefacts

When you need to inspect the compiler's output step by step:

```bash
verum build --emit-asm      # → target/*.s     (target-specific assembly)
verum build --emit-llvm     # → target/*.ll    (LLVM IR, human-readable)
verum build --emit-bc       # → target/*.bc    (LLVM bitcode, for external LTO)
verum build --emit-types    # → target/*.vtyp  (type metadata for separate compilation)
verum build --emit-vbc      # → target/*.vbc.txt (VBC disassembly)
verum build --keep-temps    # don't delete scratch files after build
```

Any combination can be passed; each flag is independent. These replace
the output binary when set (a build that only emits `--emit-llvm`
stops before the native codegen stage).

## Output

```
target/
├── debug/
│   ├── myprog            # executable (or myprog.cog for a library)
│   ├── myprog.vbc        # bytecode
│   └── deps/             # dependency artefacts
├── release/
│   └── myprog            # LTO'd, stripped
├── generated/            # build.vr outputs, auto-mounted
├── bench/drivers/        # `verum bench --aot` synthesised drivers
├── test/                 # per-test binaries + coverage profraw
│   ├── pbt-regressions.json  # PBT regression database
│   └── coverage/
└── .verum-cache/         # incremental fingerprints
```

## `cargo`-like workspace

```toml
# verum.toml at workspace root
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
