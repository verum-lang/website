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
├── manifest.toml          # expanded Verum.toml
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

```bash
verum publish                  # default: registry.verum-lang.org
verum publish --registry myregistry
verum publish --dry-run        # build the cog, don't upload
```

Requirements:
- All declared dependencies available.
- Passes `verum lint --strict`.
- Version not already published.
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

## Dependency sources

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
verum audit             # scan for known advisories
verum audit --fix       # update to patched versions where possible
```

The advisory database is mirrored to `~/.verum/advisories/`.

## Content-addressed storage

Every cog's build artefacts are content-addressed in `target/.verum-cache/`.
Builds across projects share artefacts — a cog compiled once for
`cog-a` is reused in `cog-b`. Results in massive speedups on
multi-project workstations.

## Workspace publishing

```bash
verum workspace publish --all       # publish all members
verum workspace publish --filter "api-*"
```

Workspace members can depend on each other by path at development time
and by version at publish time — `verum publish` automatically rewrites
the manifest.

## See also

- **[Build system](/docs/tooling/build-system)** — how cogs are built.
- **[verum.toml reference](/docs/reference/verum-toml)** — manifest
  schema.
- **[Architecture → VBC bytecode](/docs/architecture/vbc-bytecode)**
  — VBC archive format.
