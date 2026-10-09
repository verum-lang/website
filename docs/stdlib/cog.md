---
sidebar_position: 9
title: cog
description: Verum library APIs for manifests, compiled archive inspection, signatures and dependency resolution.
status: regression-only
---

# `core.cog` — Cog tooling subsystem

`core.cog` provides Verum library APIs for parsing manifests, inspecting compiled
`.vbca` archives, signing manifest and source bytes, and resolving dependencies.

The host package CLI uses Rust implementations in
[`crates/verum_cli`](https://github.com/verum-lang/verum/tree/main/crates/verum_cli).
It publishes source tarballs through the
[package workflow](/docs/tooling/cog-packages). These library APIs have separate
schemas and integration limits; their presence does not establish that a CLI
command or registry service uses them.

## Layout

| File | What's in it |
|---|---|
| `mod.vr` | re-exports |
| `manifest.vr` | `CogManifest` parser and formatter |
| `archive.vr` | `.vbca` header, module index and payload inspection |
| `sign.vr` | Ed25519 signatures over manifest and source hashes |
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

`parse_text(source)` parses TOML into `CogManifest`; `parse_value(value)` accepts
an existing `ConfigValue`. `format_text` and `format_value` perform the reverse
conversion. Missing required fields return `ManifestError.MissingField`.

The library reads `[dev-dependencies]` and `[build-dependencies]`, while the
[host CLI manifest](/docs/reference/verum-toml#dependencies-dev_dependencies-build_dependencies)
uses underscores. The library also represents per-dependency registry and
workspace sources that the CLI dependency parser refuses. Treat these as
separate schemas when building tools; converting between them requires explicit
validation of every field.

Source: [`core/cog/manifest.vr`](https://github.com/verum-lang/verum/blob/main/core/cog/manifest.vr).

## Archive format (`.vbca`)

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

`read_header` reads the fixed header; `read_archive_bytes` decodes the archive
and checks its index and payload bounds. `find_module`, `module_bytes`,
`dependency_graph`, and `topological_order` expose its contents.

Index decoding requires the `vbc_archive_decode_index` runtime intrinsic.
A supported declaration or a `FLAG_SIGNED` bit alone does not establish archive
validation or signature verification on a particular backend. This module has
no public archive-writing function.

Source: [`core/cog/archive.vr`](https://github.com/verum-lang/verum/blob/main/core/cog/archive.vr).

## Ed25519 signing

The signing module accepts canonical manifest JSON bytes and source archive
bytes separately:

```verum
public fn sign_cog(
    seed: &Ed25519Seed,
    manifest_canonical_json: &List<Byte>,
    source_archive: &List<Byte>,
) -> Result<CogSignature, CogSignatureError>;

public fn verify_cog(
    sig: &CogSignature,
    manifest_canonical_json: &List<Byte>,
    source_archive: &List<Byte>,
) -> Result<(), CogSignatureError>;
```

`CogSignature` carries `public_key`, `signature`, `manifest_sha256`,
`source_sha256`, and `signed_at`. The signed message is the concatenation of the
two raw SHA-256 digests, with the manifest digest first. The caller supplies the
canonical JSON representation; the signing function does not canonicalize JSON.
The timestamp is recorded in the envelope and is not part of the signed message.

`verify_cog` recomputes both digests, compares them with the envelope, and checks
the signature using its public key. The caller must separately establish that
this key belongs to an authorized publisher.
`verify_cog_precomputed_hashes` accepts two existing digests and skips hashing
the input bytes; the caller owns the provenance of those digests.

These library signatures are not accepted by the
[source publication protocol](/docs/tooling/cog-packages#source-archive).

Source: [`core/cog/sign.vr`](https://github.com/verum-lang/verum/blob/main/core/cog/sign.vr).

## Dependency resolution

Resolution is asynchronous and obtains package information from a
`DependencyProvider`:

```verum
public async fn resolve<P: DependencyProvider>(
    provider: &P,
    root_package: PackageName,
    root_version: SemVer,
) -> Result<Lockfile, ResolveError>;

public type Lockfile is {
    packages: Map<PackageName, SemVer>,
};

public type ResolveError is
    | NoSolution { explanation: List<Text> }
    | Provider(ProviderError);
```

The provider implements `list_versions` and `get_dependencies`. It can also
control package priority and version choice. The solver uses version ranges,
constraint propagation, and conflict explanations to select concrete versions.
It does not fetch or authenticate archive bytes.

Its `Dependency` record contains only a package and version range. Feature
activation and development-dependency policy must be handled before producing
those edges; they are not represented in the returned `Lockfile`. This library
value also differs from the host CLI's on-disk lockfile schema.

Source: [`core/cog/resolve.vr`](https://github.com/verum-lang/verum/blob/main/core/cog/resolve.vr).

## Status

| File | Status |
|---|---|
| `mod.vr` | **undocumented** — re-exports — no conformance suite yet |
| `manifest.vr` | **regression-only** — manifest parsing and formatting — [core-tests/cog/manifest](https://github.com/verum-lang/verum/tree/main/core-tests/cog/manifest) |
| `archive.vr` | **unverified** — archive reading — [core-tests/cog/archive](https://github.com/verum-lang/verum/tree/main/core-tests/cog/archive) |
| `sign.vr` | **unverified** — Ed25519 sign + verify — [core-tests/cog/sign](https://github.com/verum-lang/verum/tree/main/core-tests/cog/sign) |
| `resolve.vr` | **unverified** — provider-driven resolution; feature and development-edge policy are caller responsibilities — [core-tests/cog/resolve](https://github.com/verum-lang/verum/tree/main/core-tests/cog/resolve) |

## Integration boundaries

Use the [host manifest reference](/docs/reference/verum-toml) and
[package commands](/docs/tooling/cog-packages) when working with the CLI.
Use this library's types and source declarations when implementing Verum tools.
A parser, archive reader, resolver, or signature helper passing its own checks
does not establish a complete publish, install, and build workflow.
