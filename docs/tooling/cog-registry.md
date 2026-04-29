---
sidebar_position: 21
title: Cog distribution registry
---

# `verum cog-registry` — Verified-mathematics package distribution

Verum's package manager is to verified mathematics what Cargo is
to Rust: published packages (cogs) carry **cryptographic
proof-integrity** so a downstream consumer can verify the entire
dependency closure.  Immutable releases, per-cog reproducibility
chains, attestation kinds, multi-mirror trust — all designed so
"this theorem was kernel-checked on date X by signer Y" is a
verifiable claim, not a trust assumption.

## Mental model

A **cog** is one published unit of verified content (a library, a
proof corpus, a framework definition).  Every cog version ships:

1. **Manifest** — name, version, dependencies, license, description,
   tags.
2. **Reproducibility envelope** — three blake3 hashes:
   - `input_hash` — over (sources + lockfile + audit reports).
   - `build_env_hash` — over the pinned toolchain (Verum kernel
     version, SMT-solver versions, foreign-tool versions).
   - `output_hash` — over the compiled `.vbc` archives + cert
     files.
   - `chain_hash` — blake3 over the three above, the canonical
     content identifier.  Tampering with any component breaks
     `chain_hash_valid()`.
3. **Attestations** — typed Ed25519 signatures from auditors:
   - `verified_ci` — `make audit` + `make audit-honesty-gate`
     passed.
   - `honesty` — proof-honesty audit clean (no axiom-only
     placeholder).
   - `coord` — coord-consistency audit clean (every `@verify(...)`
     has a matching `@framework(...)`).
   - `cross_format` — cross-format export round-trip succeeded.
   - `framework_soundness` — every `@axiom` body is in `Prop`.
4. **Discovery tags** — paper DOI, framework lineage, theorem
   catalogue.  Searchable.

## Trust contract

Three invariants the registry enforces:

1. **Immutable releases.**  Republishing the same `(name,
   version)` with a different chain hash is a **hard failure**
   (`VersionConflict`).  Once published, a cog version's content
   is fixed forever.
2. **Envelope integrity.**  Publish rejects any manifest whose
   `chain_hash` doesn't match the canonical derivation from the
   three component hashes.  Tampering is observable.
3. **Multi-mirror consensus.**  When the same cog is fetched from
   N mirrors, the trusted answer is the one every mirror agrees
   on.  A single mirror disagreeing breaks consensus.

These three together give cog-level cryptographic
proof-integrity: a downstream consumer can verify the entire
dependency closure without trusting any single party.

## Subcommand reference

```bash
verum cog-registry publish    --manifest <FILE>
                              [--root <DIR>] [--registry-id <ID>]
                              [--output plain|json|markdown]

verum cog-registry lookup     --name <N> --version <V>
                              [--root <DIR>] [--registry-id <ID>] [--output ...]

verum cog-registry search     [--name <SUB>] [--paper-doi <DOI>]
                              [--framework <TAG>] [--theorem <NAME>]
                              [--require-attestation <KIND>]
                              [--root <DIR>] [--registry-id <ID>] [--output ...]

verum cog-registry verify     --name <N> --version <V>
                              [--root <DIR>] [--registry-id <ID>] [--output ...]

verum cog-registry consensus  --name <N> --version <V>
                              --mirror <DIR> [--mirror <DIR>]…
                              [--output ...]

verum cog-registry seed-demo  [--output ...]
```

`--root` defaults to `<project>/target/.verum_cache/cog-registry`
when omitted.

### `publish`

Reads a manifest JSON file and stores it in the registry.  Validates
the envelope's chain hash before accepting.  Idempotent for the same
chain hash; non-zero exit on `VersionConflict` (the immutable-
release contract).

```bash
$ verum cog-registry publish --manifest cog.json
Cog publish
  name        : verum.demo.hello-world
  version     : 0.1.0
  chain_hash  : 5e9c1c…

  ✓ accepted
```

### `lookup`

Fetch a specific `(name, version)`.  Non-zero exit on `NotFound`.

```bash
$ verum cog-registry lookup --name math.algebra --version 1.2.3
Cog lookup: ✓ found
  name           : math.algebra
  version        : 1.2.3
  description    : Commutative ring algebra
  authors        : math@verum.lang
  license        : Apache-2.0
  envelope:
    chain_hash     : 5e9c1c…
    valid          : true
  attestations:
    verified_ci            signer=ci@verum.lang ts=1714478400
```

### `search`

Multi-criteria search: name substring, paper DOI, framework
lineage, theorem catalogue, attestation requirement.  Every flag is
optional and combinable.

```bash
$ verum cog-registry search --paper-doi 10.4007/annals.2022.196.3
Search results: 1 match(es)
  hott-stuff@1.0.0
```

```bash
$ verum cog-registry search --require-attestation verified_ci --framework lurie_htt
Search results: 3 match(es)
  category-theory@2.0.0
  yoneda-formalism@1.5.0
  presheaf-completeness@1.0.0
```

### `verify`

Run the integrity checks on a published cog: envelope chain-hash
validity + which attestation kinds are present.

```bash
$ verum cog-registry verify --name alpha --version 1.0.0
Verify cog `alpha@1.0.0`

  envelope chain_hash valid : ✓
  attestations:
    coord                  —
    cross_format           —
    framework_soundness    —
    honesty                —
    verified_ci            ✓
```

Non-zero exit when the envelope is invalid.

### `consensus`

Multi-mirror cross-check.  Each `--mirror` is a separate registry
root path; the command walks all mirrors and reports per-mirror
verdicts plus the consensus.

```bash
$ verum cog-registry consensus --name widely-used --version 2.5.0 \
    --mirror /nfs/registry-a \
    --mirror /nfs/registry-b \
    --mirror /nfs/registry-c
Consensus check: `widely-used@2.5.0` across 3 mirror(s)
  mirror-1               ✓ found chain=5e9c1c…
  mirror-2               ✓ found chain=5e9c1c…
  mirror-3               ✓ found chain=5e9c1c…

Consensus      : ✓
Agreed hash    : 5e9c1c…
```

Non-zero exit when consensus is broken (any mirror has a different
chain hash).  This is the CI gate for production deployments where
cog content must be uniformly distributed.

### `seed-demo`

Populates an in-process demo registry with a sample cog and dumps
its metadata.  Useful for the docs generator + tutorial walks; not
part of the production protocol.

## Manifest JSON schema

```json
{
  "name": "math.algebra",
  "version": { "major": 1, "minor": 2, "patch": 3, "prerelease": null },
  "description": "Commutative ring algebra",
  "authors": ["math@verum.lang"],
  "license": "Apache-2.0",
  "dependencies": [
    { "name": "core.proof", "version_constraint": ">=1.0,<2.0" }
  ],
  "envelope": {
    "input_hash": "<blake3 hex of sources + lockfile + audit reports>",
    "build_env_hash": "<blake3 hex of pinned toolchain>",
    "output_hash": "<blake3 hex of compiled .vbc + certs>",
    "chain_hash": "<blake3 hex of input_hash || build_env_hash || output_hash>"
  },
  "attestations": [
    {
      "kind": "verified_ci",
      "signer": "ci@verum.lang",
      "signature": "<hex Ed25519 signature>",
      "timestamp": 1714478400
    }
  ],
  "tags": {
    "paper_doi": ["10.4007/annals.2022.196.3"],
    "framework_lineage": ["lurie_htt"],
    "theorem_catalogue": ["yoneda_full_faithful"]
  },
  "published_at": 1714478400
}
```

The `chain_hash` field MUST match the canonical derivation
(`blake3(input_hash || "\n" || build_env_hash || "\n" || output_hash)`)
or the registry rejects the manifest at publish time.

## Validation contract

| Rule | Error |
|---|---|
| `--manifest` not valid JSON | `manifest must be valid CogManifest JSON` |
| `--version` not parseable | `version must be major.minor.patch[-pre]` |
| Envelope `chain_hash` doesn't match canonical derivation | `Rejected: envelope chain_hash mismatch` |
| Republishing different content for same `(name, version)` | `VersionConflict: existing N proposed M` (non-zero exit) |
| `lookup` for missing cog | non-zero exit |
| `verify` on cog whose envelope `chain_hash` is invalid | non-zero exit |
| `consensus` with 0 mirrors | `consensus requires at least one --mirror` |
| `consensus` mirrors disagree on chain hash | non-zero exit |
| `--require-attestation` not in canonical kind set | `--require-attestation must be one of …` |

## V0 vs V1+

V0 ships:

- Production-grade `MemoryRegistry` and `LocalFilesystemRegistry`.
- Immutable-release contract enforced.
- Envelope chain-hash integrity check.
- Multi-mirror consensus aggregator.
- All CLI subcommands (publish / lookup / search / verify /
  consensus / seed-demo).

V1+ adds:

- Production HTTP server fronting the registry trait
  (`packages.verum.lang`).  Same trait surface; CLI flags and JSON
  schemas unchanged.
- Ed25519 signature verification on publish + serve.
- Verified-build attestation chain (CI auto-signs; consumers see
  the badge).
- Hot-link from paper PDFs (each `\cite{}` opens the corresponding
  cog version).

## CI usage

The standard publish-on-tag workflow:

```bash
# .github/workflows/publish-cog.yml — runs on git tag push.
# Build sources + run verification + assemble manifest.
verum verify --closure-cache
verum audit --proof-honesty
verum audit --coord-consistency
verum doc-render check-refs

# Compute the envelope.
verum cog-registry publish --manifest cog.json

# Verify it round-trips.
verum cog-registry verify --name "$NAME" --version "$VERSION"

# Cross-check against any configured mirrors.
verum cog-registry consensus --name "$NAME" --version "$VERSION" \
    --mirror /nfs/mirror-a \
    --mirror /nfs/mirror-b
```

Any failure aborts the release.

## Cross-references

- **[Continuous benchmarking](/docs/tooling/benchmarking)** —
  per-cog metrics that feed the comparison matrix.
- **[Auto-paper generator](/docs/tooling/auto-paper)** — every
  rendered theorem can carry the cog's chain hash for the
  reproducibility envelope.
- **[Incremental cache](/docs/tooling/incremental-cache)** — the
  closure-hash cache used by every cog's verification step.
- **[SMT certificate replay](/docs/tooling/cert-replay)** — the
  cross-backend agreement contract that drives the
  `cross_format` attestation.
- **[Cog packages](/docs/tooling/cog-packages)** — the user-side
  dependency-management workflow (this page documents the
  registry protocol; cog-packages documents the consumer
  experience).
