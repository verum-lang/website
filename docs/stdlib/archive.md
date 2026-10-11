---
sidebar_position: 5
title: archive
description: Archive entry types, the Archive protocol, and the declared tar adapter API.
status: regression-only
---

# `core.archive` — File-archive packaging

`core.archive` declares a common interface for packaging file entries into
bytes. It contains a tar adapter and selectors for tar, zip, ar and cpio;
zip, ar and cpio adapters are not implemented.

The declarations and signatures below are API reference excerpts, not
standalone executable examples. The generic tar adapter has a
[field-access limitation](#tarentry--archiveentry-adapters).

## Architectural alignment with `core.compress`

`core.archive` and `core.compress` are **siblings** at the same
architectural layer. Both transform byte streams; they differ in
*what* the transformation models:

| Module | Functor | Domain |
|---|---|---|
| `core.compress` | bytes → encoded bytes | a single byte stream |
| `core.archive` | archive entries → bytes | a multi-file bundle |

Tar packaging and compression are separate operations. The direct tar
writer has this signature:

```verum
public fn write_archive(entries: &List<TarEntry>) -> Result<List<Byte>, TarError>;
```

The declared encoder `core.compress.mod_gzip.Gzip.encode` takes a byte
slice, compression level and mutable output
list, and returns `Result<Int, CompressError>`. Its runtime backend is
unavailable; see [compression codecs](/docs/stdlib/compress). There is no
exported `with_compress` helper in `core.archive`.

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
`Archive.pack` / `unpack`. Per-format adapters convert between
this universal record and their format-specific representation
(e.g., `TarEntry` for tar — see `core.archive.tar` for the
USTAR-mapped field set).

The record's fields are private. Use the free constructors below to create
file, directory and symlink entries.

## Algorithm selector

```verum
public type ArchiveAlgorithm is
      Tar     // USTAR + PAX
    | Zip     // PKZIP
    | Ar      // Unix ar
    | Cpio;   // POSIX cpio
```

The selector helpers return format tags and associated filename extensions:

| Algorithm | `archive_algorithm_tag` | `archive_algorithm_extensions` |
|---|---|---|
| Tar | `"tar"` | `["tar"]` |
| Zip | `"zip"` | `["zip", "jar"]` |
| Ar | `"ar"` | `["a", "ar"]` |
| Cpio | `"cpio"` | `["cpio"]` |

Both helpers take `&ArchiveAlgorithm`. They return the values above;
they do not inspect archive contents or split compound filenames such as
`output.tar.gz`.

## Archive protocol

```verum
public type Archive is protocol {
    fn algorithm(&self) -> ArchiveAlgorithm;
    fn pack(&self, entries: &List<ArchiveEntry>) -> Result<List<Byte>, ArchiveError>;
    fn unpack(&self, bytes: &[Byte]) -> Result<List<ArchiveEntry>, ArchiveError>;
};
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

`Display` and `Debug` implementations are declared for these variants.

## Algorithm dispatch

```verum
public fn adapter_for(a: ArchiveAlgorithm) -> Result<Heap<dyn Archive>, ArchiveError>;
```

The declared implementation selects `TarFormat` for `Tar` and returns
`UnsupportedAlgorithm` for `Zip`, `Ar` and `Cpio`. `tar_format() -> TarFormat`
constructs the concrete adapter directly. Its `pack` and `unpack` methods
depend on the conversion functions described below.

## Convenience constructors

These functions are exported by `core.archive`. Reference signatures:

```verum
public fn entry_for_file(path: Text, content: List<Byte>, mode: Int, mtime: Int)
    -> ArchiveEntry;
public fn entry_for_directory(path: Text, mode: Int, mtime: Int) -> ArchiveEntry;
public fn entry_for_symlink(path: Text, target: Text, mtime: Int) -> ArchiveEntry;
```

They set the corresponding `ArchiveEntryKind`. Directory and symlink
entries have empty content lists; the symlink constructor sets mode `0o777`.
The similarly named constructors in `core.archive.tar` return `TarEntry`
instead. The parent module re-exports them with a `tar_` prefix, such as
`tar_entry_for_file`.

## TarEntry ↔ ArchiveEntry adapters

`core.archive.tar` exports the `TarEntry` type, but its fields are private.
The parent module declares these converters:

```verum
public fn tar_entry_to_universal(t: &TarEntry) -> ArchiveEntry;
public fn universal_to_tar_entry(e: &ArchiveEntry) -> TarEntry;
```

The current [converter implementations](https://github.com/verum-lang/verum/blob/main/core/archive/mod.vr)
read and construct private fields declared in
[`core.archive.tar`](https://github.com/verum-lang/verum/blob/main/core/archive/tar.vr).
Those accesses cross the declaring-module boundary and conflict with the
field-visibility contract. `TarFormat.pack` and `TarFormat.unpack` call
these converters; their signatures alone do not establish a working
generic archive round trip.

The conversion is also lossy: the universal record has no UID, GID or
owner-name fields. Conversion back sets UID/GID to zero and owner names to
empty text. The forward converter maps device, FIFO and other unsupported
entry kinds to `ArchiveRegularFile`. It therefore does not preserve every
tar entry kind or its metadata.

## Primary consumers

| Use case | Composition |
|---|---|
| Cog-source publication | `verum package publish` creates gzip-compressed tar; see [archive contents](/docs/tooling/cog-packages#source-archive). |
| Tar byte output | `core.archive.tar.write_archive` declares uncompressed tar output; compression is a separate operation. |

## File-by-file status

| File | Status | Notes |
|---|---|---|
| `mod.vr` | **undocumented** | Universal entry model, Archive protocol and dispatch declarations; converter field-access limitation described above. |
| `tar.vr` | **regression-only** | USTAR + PAX reader/writer source and [regression fixtures](https://github.com/verum-lang/verum/tree/main/core-tests/archive/tar); xattr and sparse-file PAX extensions are unsupported. |

There are no `zip.vr`, `ar.vr` or `cpio.vr` adapter implementations.
