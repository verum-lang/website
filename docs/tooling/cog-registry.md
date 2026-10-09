---
sidebar_position: 21
title: Local cog manifest registry
---

# Local cog manifest registry

`verum cog-registry` stores and searches JSON manifests for verified-mathematics
content in local directories. Each manifest describes a cog, its declared
dependencies, a reproducibility envelope, attestations and discovery tags.

For publishing source packages to a network registry and managing project
dependencies, use the [cog package commands](/docs/tooling/cog-packages).
The local manifest catalogue has its own JSON format and storage. It does not
upload source archives, install dependencies or verify a dependency closure.

## What the commands verify

`publish` and `verify` check that the envelope's recorded chain hash can be
recomputed from its three component hash strings. They do not recompute those
component hashes from source files, build environments or compiled artifacts.
A consistent envelope therefore establishes an internal relationship between
stored values, without establishing reproducibility or mathematical correctness.

Attestations are stored as supplied metadata. The CLI can report or filter by
attestation kind, but it does not authenticate signers, verify Ed25519 signatures,
run proof checking or replay certificates. A manifest with no attestations can
pass both `publish` and `verify`.

## Commands and storage

All subcommands accept `--output plain|json|markdown`; the default is `plain`.
The following is command syntax, with optional arguments in brackets:

```text
verum cog-registry publish --manifest FILE
  [--root DIR] [--registry-id ID] [--output FORMAT]

verum cog-registry lookup --name NAME --version VERSION
  [--root DIR] [--registry-id ID] [--output FORMAT]

verum cog-registry search [--name SUBSTRING] [--paper-doi DOI]
  [--framework TAG] [--theorem NAME] [--require-attestation KIND]
  [--root DIR] [--registry-id ID] [--output FORMAT]

verum cog-registry verify --name NAME --version VERSION
  [--root DIR] [--registry-id ID] [--output FORMAT]

verum cog-registry consensus --name NAME --version VERSION
  --mirror DIR [--mirror DIR ...] [--output FORMAT]

verum cog-registry seed-demo [--output FORMAT]
```

`--root` selects a filesystem directory. Without it, the CLI searches the current
directory and its ancestors for `Verum.toml`, accepting legacy `verum.toml`, and
uses `<project>/target/.verum_cache/cog-registry`. Outside a project, supply an
explicit root. Opening a root creates the directory if it does not exist,
including for lookup and mirror commands.

`--registry-id` defaults to `local`. It labels the local registry; it does not
select a network service, authenticate a publisher or change the storage path.
Manifests are stored under `<root>/<sanitized-name>/<version>.json`.

`--version` takes `major.minor.patch` with an optional nonempty `-prerelease`
suffix. The three numeric components must fit unsigned 32-bit integers. These
commands take an exact version, not a dependency version range.

### `publish`

Read a `CogManifest` JSON file and store it under the selected root:

```bash
verum cog-registry publish --manifest cog.json --root ./manifest-registry
```

The command rejects an inconsistent envelope. If an existing manifest is found
at the same storage path, a different chain hash produces `VersionConflict` and
a nonzero exit. The same chain hash is accepted as a no-op: it leaves the stored
manifest unchanged, including its description, tags and attestations.

This comparison concerns the recorded envelope hash. It does not compare source
archives or hash the entire manifest, and the JSON files remain ordinary editable
files on disk. Publish does not resolve or validate declared dependencies.

### `lookup`

Read the manifest at an exact name and version:

```bash
verum cog-registry lookup --name math.algebra --version 1.2.3 \
  --root ./manifest-registry --output json
```

A missing entry, unreadable file or invalid JSON produces a nonzero exit.
Successful JSON output is a lookup result with `"kind": "Found"` and a nested
`"manifest"`, rather than a bare manifest suitable for `publish --manifest`.
Lookup does not require a valid envelope or check that the stored name and
version match the requested path.

### `search`

Combine any of the optional filters. Every supplied filter must match:

| Option | Match |
|---|---|
| `--name` | Case-sensitive substring of the manifest name |
| `--paper-doi` | Exact entry in `tags.paper_doi` |
| `--framework` | Exact entry in `tags.framework_lineage` |
| `--theorem` | Exact entry in `tags.theorem_catalogue` |
| `--require-attestation` | Presence of the specified attestation kind |

```bash
verum cog-registry search --name math --require-attestation verified_ci \
  --root ./manifest-registry
```

With no filters, search lists the manifests it can read. Unreadable or malformed
entries are skipped. Search is a discovery operation: a match does not establish
envelope validity or the truth of an attestation.

### `verify`

Recompute the chain hash and report which attestation kinds are present:

```bash
verum cog-registry verify --name math.algebra --version 1.2.3 \
  --root ./manifest-registry --output json
```

The command fails if lookup fails or the envelope is inconsistent. Missing
attestations do not make it fail. The JSON `attestations` values are presence
booleans, not signature-verification or proof-checking results.

### `consensus`

Compare recorded chain hashes across local directory roots. Supply at least one
`--mirror`; each is a filesystem path, not a URL:

```bash
verum cog-registry consensus --name math.algebra --version 1.2.3 \
  --mirror ./mirror-a --mirror ./mirror-b --output json
```

The CLI uses the library's default policy, which compares only manifests returned
as `Found`. Its result has these boundaries:

| Mirror lookup results | `consensus` | `agreed_chain_hash` |
|---|---|---|
| Found manifests all carry the same chain hash | `true` | That hash |
| Found manifests carry different chain hashes | `false` | `null` |
| No manifest is found | `true` | `null` |

`NotFound` and per-mirror lookup errors do not break agreement among found
manifests. A root that cannot be opened fails the command before comparison.
The command returns a nonzero exit when `consensus` is false, but even an all-missing
lookup can exit successfully. Inspect `per_mirror` and require the expected
`Found` results before treating the output as evidence of availability.

The comparison does not check envelope validity, stored name/version identity,
signatures or a minimum number of successful mirrors. Matching hashes alone do
not establish that every mirror has the package or that its content is trusted.
There are no CLI flags for a quorum or trusted publisher keys.

### `seed-demo`

```bash
verum cog-registry seed-demo --output json
```

Create an in-memory sample and print its lookup result. Nothing is written to a
local registry root. The sample uses synthetic content and placeholder attestation
data; it is a metadata demonstration. As with `lookup`, the JSON wraps the manifest
inside a `Found` result.

## Reproducibility envelope

The producer supplies the bytes represented by `input_hash`, `build_env_hash`
and `output_hash`. These fields are intended to describe inputs, the build
environment and outputs respectively. The library's `CogReproEnvelope::compute`
helper hashes each supplied byte sequence with BLAKE3 and encodes the result as
lowercase hexadecimal. It does not discover files or assemble a toolchain record.

The chain hash is calculated over the UTF-8 component strings with newline
separators and no trailing newline:

```text
chain_hash = hex(BLAKE3(
  UTF8(input_hash) || "\n" || UTF8(build_env_hash) || "\n" || UTF8(output_hash)
))
```

The CLI's envelope check applies this formula to the strings in the manifest.
It does not separately validate their hexadecimal format or recompute their
underlying bytes. Other manifest fields, including dependencies and attestations,
are not directly included in this formula.

## Manifest JSON

This is the manifest structure, with illustrative hash and signature placeholders.
Replace them with values produced for your content before using the file with
`publish`.

```json
{
  "name": "math.algebra",
  "version": { "major": 1, "minor": 2, "patch": 3, "prerelease": null },
  "description": "Commutative ring algebra",
  "authors": ["maintainer@example.org"],
  "license": "Apache-2.0",
  "dependencies": [
    { "name": "core.proof", "version_constraint": ">=1.0,<2.0" }
  ],
  "envelope": {
    "input_hash": "<input hash>",
    "build_env_hash": "<build environment hash>",
    "output_hash": "<output hash>",
    "chain_hash": "<chain hash derived with newline separators>"
  },
  "attestations": [
    {
      "kind": "verified_ci",
      "signer": "ci@example.org",
      "signature": "<hex Ed25519 signature>",
      "timestamp": 1714478400
    }
  ],
  "tags": {
    "paper_doi": [],
    "framework_lineage": [],
    "theorem_catalogue": ["ring_identity"]
  },
  "published_at": 1714478400
}
```

Timestamps are Unix seconds supplied in the manifest. Dependency constraints are
stored strings; no command in this family resolves them, traverses dependencies
or checks a dependency closure.

### Attestation kinds

The accepted kind names describe the publisher's declared evidence:

| Kind | Declared evidence category |
|---|---|
| `verified_ci` | Verification in CI |
| `honesty` | Proof-honesty audit |
| `coord` | Verification/framework annotation consistency |
| `cross_format` | Cross-format verification or export checks |
| `framework_soundness` | Framework soundness audit |

The kind, signer label, signature and timestamp are stored values. Publishing
one of these records does not execute its named audit. The `--require-attestation`
search filter checks only the kind.

For callers integrating the Rust library, `sign_attestation` and
`verify_attestation` provide Ed25519 operations with explicitly supplied keys.
`MultiMirrorClient::lookup_with_consensus_policy` also accepts explicit quorum,
identity and attestation-key requirements. These are separate library APIs;
the CLI commands above do not enable those checks.

## Related tools and implementation

- [Cog packages](/docs/tooling/cog-packages) describes source package commands and
  project dependencies.
- [SMT certificate replay](/docs/tooling/cert-replay) documents separate certificate
  tools; the local manifest catalogue does not invoke them.
- The [CLI handlers](https://github.com/verum-lang/verum/blob/main/crates/verum_cli/src/commands/cog_registry.rs)
  define command validation, output and exit behavior.
- The [registry library](https://github.com/verum-lang/verum/blob/main/crates/verum_verification/src/cog_registry.rs)
  defines `CogManifest`, envelope computation, local storage and mirror policies.
