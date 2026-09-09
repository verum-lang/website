---
sidebar_position: 9
title: cog
description: Cog tooling subsystem — manifest parsing, .vbca archive reading, Ed25519 signing, pubgrub-style dependency resolution.
status: regression-only
---

import StdlibStatus from '@site/src/components/StdlibStatus';

# `core.cog` — Cog tooling subsystem

<StdlibStatus status="regression-only" />

A **cog** is the Verum unit of package distribution: a `.vbca`
archive containing pre-compiled VBC modules + manifest metadata,
optionally signed with an Ed25519 envelope. `core.cog` is the
first-class library API for manipulating cogs.

## Consumers

| Consumer | What it does with `core.cog` |
|---|---|
| `verum-registry` (vcogs.io reference impl) | Stores / serves cogs; verifies signatures |
| `verum package publish` / `verum package install` CLI | Builds, signs, uploads, downloads, verifies |
| IDE / LSP integration | Manifest validation, dependency hover, suggestion |
| Build tooling (CI) | Reproducible builds via locked dependency resolution |

`core.cog` is the library *behind* these tools; the tools
themselves live in `crates/verum_cli/`.

## Layout

| File | What's in it |
|---|---|
| `mod.vr` | re-exports |
| `manifest.vr` | `CogManifest` parser/serializer (Verum.toml schema) |
| `archive.vr` | `.vbca` archive read/write (header / module table / signing envelope) |
| `sign.vr` | Ed25519 signature envelope (sign / verify) |
| `resolve.vr` | Pubgrub-style dependency resolution |

## Manifest

The identity table is `[cog]`, not `[package]`, and dependencies are a
MAP from name to spec rather than a list carrying its own name. There is
no `build`, `publish` or `workspace` field.

```verum
public type CogManifest is {
    cog:                CogIdentity,               // the `[cog]` table
    language:           LanguageConfig,            // `[language]`
    dependencies:       Map<Text, DependencySpec>, // `[dependencies]`
    dev_dependencies:   Map<Text, DependencySpec>,
    build_dependencies: Map<Text, DependencySpec>,
    features:           Map<Text, List<Text>>,
    default_features:   List<Text>,
    meta:               ConfigValue,               // free-form `[meta]`
};

public type CogIdentity is {
    name:          CogName,
    version:       SemVer,
    authors:       List<Text>,
    description:   Maybe<Text>,
    license:       Maybe<Text>,      // SPDX expression
    repository:    Maybe<Text>,
    homepage:      Maybe<Text>,
    documentation: Maybe<Text>,
    keywords:      List<Text>,
    categories:    List<Text>,
    edition:       Text,             // e.g. "2025"
};

public type LanguageConfig is { profile: LanguageProfile };

// The name is the MAP KEY, so the spec does not repeat it, and the
// version constraint is optional because a path/git/workspace source
// carries its version implicitly.
public type DependencySpec is {
    constraint:       Maybe<SemVerConstraint>,
    source:           DependencySource,
    features:         List<Text>,
    optional:         Bool,
    default_features: Bool,
};
```

Manifest is parsed from `Verum.toml`; the schema is enforced at
parse time (missing required fields surface as
`ManifestError.MissingField`).

## Archive format (`.vbca`)

```verum
The archive holds the module INDEX and the payloads separately —
`modules[i]` describes what `module_data[i]` contains — and it carries
its own content hash. There is no `metadata` or `envelope` field on it.

```verum
public type CogArchive is {
    header:      ArchiveHeader,
    modules:     List<ModuleEntry>,
    module_data: List<List<Byte>>,   // module_data[i].len() == modules[i].data_size
    sha256:      Text { len == 64 }, // hex SHA-256 of the whole archive
};

public type ArchiveHeader is {
    magic:         [Byte; 4],                     // "VBCA"
    version_major: Int { >= 0, <= 65535 },
    version_minor: Int { >= 0, <= 65535 },        // major AND minor
    flags:         Int { >= 0, <= 4294967295 },
    module_count:  Int { >= 0 },
    index_offset:  Int { >= 0 },
    index_size:    Int { >= 0 },
};

public type ModuleEntry is {
    name:         Text,              // e.g. "core.collections.list"
    data_offset:  Int { >= 0 },
    data_size:    Int { >= 0 },
    content_hash: Int,               // 64-bit, for cache invalidation
    dependencies: List<Int>,         // indices into `modules[]`
};
```

The `.vbca` is the canonical distribution unit — a container of
pre-compiled VBC modules. Consumers read the header first (small, allows
a fast magic check), then the index at `index_offset`, then the payloads
they need. The refinements on the header fields are part of the type:
a version above 65535 or a negative offset is not representable.

## Ed25519 signing

```verum
public type SignatureEnvelope is {
    signer_key_id:  Text,                // Ed25519 public-key fingerprint
    signature:      List<Byte>,           // 64-byte Ed25519 signature
    signed_at:      Int,                  // Unix seconds
    archive_hash:   List<Byte>,           // SHA-256 of unsigned archive bytes
};

public fn sign_archive(
    archive: &CogArchive,
    private_key: &Ed25519PrivateKey,
) -> Result<SignatureEnvelope, SignError>;

public fn verify_envelope(
    archive: &CogArchive,
    envelope: &SignatureEnvelope,
    public_key: &Ed25519PublicKey,
) -> Result<(), SignError>;
```

Signature semantics: `archive_hash` covers EVERY byte of the
archive *except* the envelope itself. This means appending a
signature is non-destructive — the underlying bytes don't change,
and you can re-sign a previously-signed archive without re-bundling.

## Dependency resolution

`core.cog.resolve` implements Pubgrub-style resolution
(http://pubgrub.dart.dev). The algorithm produces a flat
`ResolvedGraph` — every transitive dependency resolved to a
specific concrete `(name, version)` — and surfaces minimal
explanations on conflict:

```verum
public type ResolvedGraph is {
    root:     Text,                       // root package name
    versions: Map<Text, Semver>,          // name → resolved version
    edges:    List<(Text, Text, VersionSpec)>,  // dependency edges
};

// Two arms, not three: the resolver reports one explanation chain for
// any unsatisfiable graph — conflict, missing package and cycle all
// arrive as `NoSolution` — and passes provider failures through.
public type ResolveError is
    | NoSolution { explanation: List<Text> }
    | Provider(ProviderError);

public fn resolve(
    root_manifest: &CogManifest,
    available_versions: &Map<Text, List<Semver>>,
) -> Result<ResolvedGraph, ResolveError>;
```

`available_versions` is the index the resolver consults; in
production it's the registry's version table, but during unit
testing it's any synthesised map.

Resolution is deterministic — same inputs always produce the same
output, including conflict-explanation text. This makes `verum
publish --offline` reproducible and lets CI bots verify a lockfile
without re-querying the registry.

## Status

| File | Status |
|---|---|
| `mod.vr` | **stable** — re-exports |
| `manifest.vr` | **stable** — full schema |
| `archive.vr` | **stable** — read/write round-trip |
| `sign.vr` | **stable** — Ed25519 sign + verify |
| `resolve.vr` | **partial** — pubgrub core complete; feature-unification + dev-only-edge tracking TBD |

## Architectural alignment

`core.cog` provides the LIBRARY interface to cog manipulation.
The CLI tools (`verum package publish`, `verum package install`, `verum tree`) at
`crates/verum_cli/src/commands/` consume this library — no CLI-
specific manipulation logic in `core/`, no library logic in
`crates/verum_cli/`. The split keeps the cog model itself
embeddable in third-party tools (IDEs, custom registries,
deployment systems) without dragging in the CLI surface.
