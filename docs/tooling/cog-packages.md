---
sidebar_position: 3
title: Cog Packages
---

# Cog Packages

A **cog** is Verum's unit of distribution — a self-describing archive
containing VBC bytecode, type metadata, proof certificates, and
documentation.

## Cog structure

A `.cog` file is a compressed tarball:

```
my-cog-1.2.3.cog
├── manifest.toml          # expanded verum.toml
├── vbc/
│   ├── lib.vbc
│   └── ...
├── metadata/
│   ├── types.ron          # type metadata
│   └── api.json           # exposed API
├── proofs/                # optional
│   └── *.proof.bin
├── docs/                  # optional
│   └── html/
└── SIGNATURE              # cryptographic signature
```

## Publishing

The publish / search / install surface lives under `verum
package`:

```bash
verum package publish [--dry-run] [--allow-dirty]
verum package search  <query> [--limit 10]
verum package install <name> [--version X]
```

`verum package publish` defaults to
`registry.verum-lang.org`. `--dry-run` builds the cog locally
without uploading; `--allow-dirty` permits publishing from a
working tree with uncommitted changes (default behaviour
refuses).

For the registry-side surface (signed releases, multi-mirror
consensus, attestation kinds) see
[Tooling → Cog distribution registry](/docs/tooling/cog-registry).

Requirements:
- All declared dependencies available.
- Passes `verum lint --severity error`.
- Version not already published — immutable releases per
  cog-registry policy.
- API compatibility with prior minor version (checked via public-API
  diff).

## Dependency resolution

Cogs are resolved by SemVer. Lockfile `Verum.lock` pins exact
versions:

```toml
# Verum.lock
[[cog]]
name    = "serde"
version = "1.4.2"
source  = "registry+https://registry.verum-lang.org"
checksum = "sha256:abc..."
```

## Dependency management

Day-to-day dependency operations live under `verum deps`:

```bash
verum deps add <pkg> [--version X] [--dev] [--build]
verum deps remove <pkg> [--dev] [--build]
verum deps update [<pkg>]
verum deps list [--tree]
```

The dependency tree alone (read-only) is also exposed via
`verum tree [--duplicates] [--depth N]`.

Sources accepted in `verum.toml`:

```toml
[dependencies]
# From the registry
serde = "1.4"

# Specific version
tokio = { version = "2.0.0", default-features = false }

# Git repository
my-lib = { git = "https://github.com/me/my-lib", rev = "abc123" }

# Local path
utils = { path = "../utils" }

# IPFS content-addressed
data = { ipfs = "Qm..." }
```

## Registry architecture

Three-layer distribution:

1. **Central registry** (`registry.verum-lang.org`) — canonical
   metadata, authorship, verification.
2. **CDN / IPFS** — content-addressed binary distribution.
3. **Git** — for unpublished cogs.

A cog's identity is its content hash; the registry maps
`name@version` → hash.

## Verification profiles on cogs

A cog can declare its verification profile:

```toml
[cog]
verification = "portfolio"     # advertised to consumers
```

Consumers can filter: `verum add some-cog --require-verification=smt`
refuses to install cogs that do not meet the threshold.

## Trust model

Cogs are **signed** by the publisher (Ed25519 by default). The registry
tracks publisher identities. Each consumer decides which publishers to
trust:

```toml
# ~/.verum/config.toml
[trust]
"registry.verum-lang.org" = "required"
"github.com/verum-lang/*" = "verified"
"github.com/trusted-author/*" = "trusted"
```

## Vulnerability advisories

```bash
verum proof-draft       # cooperating drafts include security audit of dependencies
verum audit --bundle    # whole-project audit including framework / cog citation surface
```

Cog-level vulnerability advisories surface via the registry's
attestation kinds (`verified_ci`, `honesty`, `coord`,
`cross_format`, `framework_soundness`) — a cog whose attestation
chain is broken or whose framework citations conflict surfaces
through `verum cog-registry verify` and the bundle audit's
framework-conflict gate.

## Content-addressed storage

Every cog's build artefacts are content-addressed in `target/.verum-cache/`.
Builds across projects share artefacts — a cog compiled once for
`cog-a` is reused in `cog-b`. Results in massive speedups on
multi-project workstations.

## Workspace publishing

The `verum workspace` surface manages multi-cog workspaces:

```bash
verum workspace list
verum workspace add    <path>
verum workspace remove <name>
verum workspace exec   -- <command> [args...]
```

Workspace members can depend on each other by path at development
time and by version at publish time —
`verum workspace exec -- verum package publish` per member
re-resolves path-deps to versioned-deps in the published
manifest.

## See also

- **[Build system](/docs/tooling/build-system)** — how cogs are built.
- **[verum.toml reference](/docs/reference/verum-toml)** — manifest
  schema.
- **[Architecture → VBC bytecode](/docs/architecture/vbc-bytecode)**
  — VBC archive format.
