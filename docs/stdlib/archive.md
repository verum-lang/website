---
sidebar_position: 5
title: archive
description: Uniform packaging functor across tar / zip / ar / cpio formats. Composes with `core.compress` for `.tar.gz`-style pipelines.
---

# `core.archive` — File-archive packaging

`core.archive` is a **packaging functor** that converts
`List<(path, metadata, content)>` ↔ `Bytes`. Concrete adapters
target POSIX tar (USTAR + PAX), PKZIP, Unix ar, and POSIX cpio.

## Architectural alignment with `core.compress`

`core.archive` and `core.compress` are **siblings** at the same
architectural layer. Both transform byte streams; they differ in
*what* the transformation models:

| Module | Functor | Domain |
|---|---|---|
| `core.compress` | `Bytes → Bytes` (smaller, reversible) | a single byte stream |
| `core.archive` | `List<(path, metadata, content)> → Bytes` | a multi-file bundle |

They compose:

```verum
let tarball: List<Byte> = archive.tar.write_archive(entries)?;
let gzipped: List<Byte> = compress.gzip.encode(&tarball)?;
// `gzipped` is now `.tar.gz`
```

The convenience helper `with_compress(archive_alg, compress_alg)`
builds the composed pipeline directly.

## Universal entry model

```verum
public type ArchiveEntry is {
    path:    Text,
    mode:    Int,                    // POSIX bits, e.g. 0o644
    mtime:   Int,                    // Unix seconds; 0 = unset
    kind:    ArchiveEntryKind,
    content: List<Byte>,             // only for RegularFile entries
};

public type ArchiveEntryKind is
      ArchiveRegularFile
    | ArchiveDirectory
    | ArchiveSymlink(Text)           // target path
    | ArchiveHardlink(Text);
```

`ArchiveEntry` is the **protocol-level** entry view used by
`Archive::pack` / `unpack`. Per-format adapters convert between
this universal record and their format-specific representation
(e.g., `TarEntry` for tar — see `core.archive.tar` for the
USTAR-mapped field set).

## Algorithm selector

```verum
public type ArchiveAlgorithm is
      Tar     // USTAR + PAX
    | Zip     // PKZIP
    | Ar      // Unix ar
    | Cpio;   // POSIX cpio
```

The selector is runtime-aware:

| Algorithm | `algorithm_tag` | `algorithm_extensions` |
|---|---|---|
| Tar | `"tar"` | `["tar"]` |
| Zip | `"zip"` | `["zip", "jar"]` |
| Ar | `"ar"` | `["a", "ar"]` |
| Cpio | `"cpio"` | `["cpio"]` |

The extensions list is the canonical lookup for "given a filename,
what algorithm produced it?" — a directory walker reading
`build/output.tar.gz` decomposes into `(archive=tar,
compress=gzip)` via `archive_algorithm_extensions` plus the analogous
`compress_algorithm_extensions`.

## Archive protocol

```verum
public protocol Archive {
    fn algorithm(&self) -> ArchiveAlgorithm;
    fn pack(&self, entries: &List<ArchiveEntry>) -> Result<List<Byte>, ArchiveError>;
    fn unpack(&self, bytes: &[Byte]) -> Result<List<ArchiveEntry>, ArchiveError>;
}
```

Bidirectional packaging — format adapters implement this to
participate in the universal subsystem. The protocol surface is
intentionally minimal:

  * `algorithm` — adapter self-identification (also useful for
    multi-format dispatch in user code).
  * `pack` — universal entries → bytes.
  * `unpack` — bytes → universal entries.

Higher-level concerns (streaming, partial-archive reads,
permissions-preservation policies) compose ON TOP of this
protocol via consumer-side adapters; the protocol stays small.

## Error surface

```verum
public type ArchiveError is
      Format(Text)                    // format-specific parse / write error
    | UnsupportedAlgorithm(ArchiveAlgorithm)
    | InvalidEntry(Text);
```

`Display` + `Debug` are implemented; every variant produces a
human-readable diagnostic suitable for logging at the call site.

## Algorithm dispatch

```verum
pub fn adapter_for(a: ArchiveAlgorithm) -> Result<Heap<dyn Archive>, ArchiveError>;
```

Resolves an algorithm tag to its concrete adapter. Returns
`UnsupportedAlgorithm` for not-yet-implemented formats (zip / ar /
cpio at v0.1).

## Convenience constructors

For ergonomic entry construction:

```verum
let entry_file: ArchiveEntry =
    archive::entry_for_file(path, content, mode, mtime);

let entry_dir: ArchiveEntry =
    archive::entry_for_directory(path, mode, mtime);

let entry_symlink: ArchiveEntry =
    archive::entry_for_symlink(path, target, mtime);
```

These set the right `kind` variant and zero-fill content for
non-RegularFile entries.

## TarEntry ↔ ArchiveEntry adapters

For users that need to drop down to the format-specific representation
(e.g., to access PAX extended headers, owner UID/GID, group/user
names), `core.archive.tar` exposes `TarEntry` directly. The
bidirectional adapters `tar_entry_to_universal(&TarEntry)` and
`universal_to_tar_entry(&ArchiveEntry)` give round-trip conversion.

## Primary consumers

| Use case | Composition |
|---|---|
| Cog-source distribution | `archive.tar.write_archive |> compress.zstd.encode` |
| Build-output bundles (binary releases) | `archive.tar.write_archive |> compress.gzip.encode` |
| Backup / restore pipelines | `archive.tar.write_archive |> compress.xz.encode` |
| Container-image layer construction | `archive.tar.write_archive` (uncompressed; OCI does its own compression) |

## File-by-file status

| File | Status | Notes |
|---|---|---|
| `mod.vr` | **stable** | universal entry model + Archive protocol + dispatch |
| `tar.vr` | **partial** | USTAR + PAX header read/write fully implemented; xattr / sparse-file PAX extensions deferred |

`zip.vr`, `ar.vr`, `cpio.vr` adapters are tracked as future work.
The `Archive` protocol's `UnsupportedAlgorithm` error variant
keeps the consumer-side dispatch graceful while implementations
land.
