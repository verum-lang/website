---
sidebar_position: 4
title: Project Structure
---

# Project Structure

A typical Verum project — a **cog**, in Verum's package vocabulary —
has this shape:

```
my-project/
├── Verum.toml            # package manifest
├── src/
│   ├── main.vr           # entry point (application)
│   ├── lib.vr            # library root (optional)
│   └── ...               # other modules
├── tests/
│   └── integration.vr    # integration tests
├── benches/
│   └── bench.vr          # criterion-style benchmarks
├── examples/
│   └── quickstart.vr
├── proofs/               # @verify(certified) proof scripts
│   └── kernel.vr.proof
└── target/               # build artefacts (gitignored)
    ├── debug/
    └── release/
```

## `Verum.toml`

The manifest describes the cog and its dependencies.

```toml
[cog]
name    = "my-project"
version = "0.1.0"
edition = "2026"
profile = "application"          # application | systems | research

[dependencies]
serde     = "1.4"
http      = { version = "0.8", features = ["tls"] }
my-utils  = { path = "../utils" }

[verify]
default_strategy  = "static"     # runtime | static | formal | fast | thorough | certified | synthesize
solver_timeout_ms = 5000

[build]
optimize     = "aggressive"       # none | balanced | aggressive
lto          = "thin"
target-cpu   = "native"
```

See [verum.toml reference](/docs/reference/verum-toml) for the full
schema.

## Module layout

Verum's module system is directory-driven with explicit `mount`.

```verum
// src/lib.vr
mount utils;                 // → src/utils.vr or src/utils/mod.vr
mount net.http;              // → src/net/http.vr
mount .self.collections.*;   // glob import
```

Each `.vr` file is a module. A directory becomes a module by containing
a `mod.vr` file. Visibility is controlled with `pub`, `internal`, and
(implicit) private.

```verum
pub      fn api_entry()     { ... }   // public
internal fn helper()        { ... }   // crate-visible
         fn private_impl()  { ... }   // module-local
```

## Entry points

- **Applications** (`profile = "application"`) compile `src/main.vr` to
  an executable whose entry point is `fn main()`.
- **Libraries** (`profile = "systems"` or `"research"`) compile
  `src/lib.vr` to a distributable cog.
- **Both**: a project can have both, and `verum build` produces both artefacts.

## Tests

Any `.vr` file may declare tests inline with `@test`:

```verum
@test
fn addition_commutes() {
    assert(1 + 2 == 2 + 1);
}

@test(property)
fn sort_is_idempotent(xs: List<Int>) {
    assert(xs.sorted().sorted() == xs.sorted());
}
```

Integration tests live in `tests/`. Run everything with:

```bash
$ verum test
$ verum test --filter "addition"
$ verum test --verify smt
```

## Workspaces

Multi-cog workspaces share a `Cargo.lock`-like lockfile:

```toml
# Verum.toml at workspace root
[workspace]
members = ["core", "api", "cli", "tools/*"]
```

See **[Build System](/docs/tooling/build-system)** and
**[Cog Packages](/docs/tooling/cog-packages)** for the full story.
