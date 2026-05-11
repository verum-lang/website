---
sidebar_position: 9
title: cog
description: Cog tooling subsystem — manifest parsing, .vbca archive reading, Ed25519 signing, pubgrub-style dependency resolution.
---

# `core.cog` — Cog tooling subsystem

A **cog** is the Verum unit of package distribution: a `.vbca`
archive containing pre-compiled VBC modules + manifest metadata,
optionally signed with an Ed25519 envelope. `core.cog` is the
first-class library API for manipulating cogs.

## Consumers

| Consumer | What it does with `core.cog` |
|---|---|
| `verum-registry` (vcogs.io reference impl) | Stores / serves cogs; verifies signatures |
| `verum publish` / `verum install` CLI | Builds, signs, uploads, downloads, verifies |
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

```verum
public type CogManifest is {
    package:        PackageInfo,
    dependencies:   List<Dependency>,
    dev_dependencies: List<Dependency>,
    build:          BuildConfig,
    publish:        Maybe<PublishConfig>,
    workspace:      Maybe<WorkspaceConfig>,
    features:       Map<Text, List<Text>>,
};

public type PackageInfo is {
    name:        Text,
    version:     Semver,
    authors:     List<Text>,
    license:     Text,
    description: Text,
    repository:  Maybe<Text>,
    homepage:    Maybe<Text>,
    keywords:    List<Text>,
    categories:  List<Text>,
    edition:     Text,
};

public type Dependency is {
    name:       Text,
    spec:       VersionSpec,    // SemverConstraint | GitSpec | PathSpec
    features:   List<Text>,
    optional:   Bool,
    default_features: Bool,
};
```

Manifest is parsed from `Verum.toml`; the schema is enforced at
parse time (missing required fields surface as
`ManifestError::MissingField`).

## Archive format (`.vbca`)

```verum
public type CogArchive is {
    header:   CogHeader,
    modules:  List<ArchivedModule>,
    metadata: Maybe<CoreMetadata>,
    envelope: Maybe<SignatureEnvelope>,
};

public type CogHeader is {
    magic:        [Byte; 4],            // "VBCA"
    version:      Int,                   // archive format version
    flag_bits:    Int,
    module_count: Int,
};
```

The `.vbca` is the canonical distribution unit — a zstd-compressed
container of pre-compiled VBC modules. Consumers read the header
first (small, allows fast magic check), then enumerate modules,
then optionally consume the metadata side-channel (for type-checker
hand-off) and signature envelope (for trust verification).

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

public type ResolveError is
      VersionConflict { package: Text, conflict_explanation: Text }
    | UnresolvedDependency { package: Text, requested_by: Text }
    | CycleDetected(List<Text>);

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
The CLI tools (`verum publish`, `verum install`, `verum tree`) at
`crates/verum_cli/src/commands/` consume this library — no CLI-
specific manipulation logic in `core/`, no library logic in
`crates/verum_cli/`. The split keeps the cog model itself
embeddable in third-party tools (IDEs, custom registries,
deployment systems) without dragging in the CLI surface.
