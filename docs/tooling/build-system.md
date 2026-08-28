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

`--target <triple>` is passed straight through to LLVM — the CLI does
not validate it against a fixed list, so any triple LLVM's backend
recognises can be requested. Verified end-to-end (module triple,
per-platform runtime bodies, and a linked object carrying zero
undefined libc symbols) as of 2026-07-28 for `x86_64-unknown-linux-gnu`,
`aarch64-unknown-linux-gnu`, `x86_64-apple-darwin`,
`aarch64-apple-darwin`, and `x86_64-pc-windows-msvc`. Other triples —
`wasm32-*`, `riscv64gc-*`, the embedded targets — are expected to work
on the same mechanism but have not been individually verified.

**`verum` does not bundle sysroots, cross-linkers, or platform SDKs.**
Final linking needs the target's own toolchain installed separately —
see [Installation → Cross-compiling Verum programs](/docs/getting-started/installation#cross-compiling-verum-programs)
for what that requires and what `[cross_compile]` in `verum.toml` does
and does not do today.

## Build scripts — there are none, on purpose

Verum has no `build.vr` and no build-script phase. A build script
is a second program the type checker cannot see, communicating with
the build through stdout conventions; the two things it is normally
used for are first-class language constructs here instead.

**Native libraries** are declared where they are used, and the link
line follows from the declaration:

```verum
@ffi("sqlite3")
extern {
    fn sqlite3_libversion_number() -> Int32;
}
```

**Compile-time asset reading and code generation** are `meta`
functions, which run during compilation and are type-checked like
any other function. `BuildAssets` is read-only and confined to the
project directory; `CompileDiag` turns a missing input into a real
diagnostic instead of a failed process:

```verum
mount core.meta.contexts.{BuildAssets, CompileDiag};
mount core.meta.span.{Span};

meta fn schema_text() -> Text using [BuildAssets, CompileDiag] {
    match BuildAssets.load_text("assets/schema.sql") {
        Result.Ok(text) => text,
        Result.Err(_) => {
            CompileDiag.emit_error("assets/schema.sql is missing", Span.call_site());
            ""
        }
    }
}
```

See [meta/staging](/docs/language/meta/staging) for when a `meta`
function runs, and [meta/token-api](/docs/language/meta/token-api)
for generating code rather than reading data.

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

## Degradation is a build error

When the compiler cannot do a job properly it stops, rather than
producing something that links and then behaves oddly. Two examples:
monomorphisation that fails leaves generic call sites resolving to the
erased body, and a signature collision leaves a function declared
without its body — the binary links, the call finds garbage. Both fail
the build, and the message names the site.

If you need the older permissive behaviour — bisecting an upstream
change, or shipping a build where one degraded corner is understood
and acceptable — ask for it explicitly:

```bash
verum build --lenient          # degraded sites warn instead of failing
```

The flag is process-wide and deliberate: prefer fixing the reported
site, and keep `--lenient` for the case where you have decided the
degradation is acceptable this once.

## Output

```
target/
├── debug/
│   ├── myprog            # executable (or myprog.cog for a library)
│   ├── myprog.vbc        # bytecode
│   └── deps/             # dependency artefacts
├── release/
│   └── myprog            # LTO'd, stripped
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
