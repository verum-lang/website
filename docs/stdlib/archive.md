---
sidebar_position: 5
title: archive
description: Create tar archives, inspect borrowed entry views, and validate complete bounded archive streams.
status: regression-only
---

# `core.archive` — File-archive packaging

An archive groups named entries into one byte stream. Compression is separate:
`core.archive.tar` reads and writes tar bytes; `core.compress.mod_gzip.Gzip`
decodes gzip bytes before those bytes reach the tar reader.

Use `read_archive_strict` for complete input validation. It checks framing and
resource limits before returning entries. The caller must still validate paths,
entry kinds and application metadata before using an untrusted archive.

## Create and inspect a tar archive

This complete program writes a binary file entry and reads it back with explicit
limits. Run it with `verum run --tier interpret` in a project.

```verum
mount core.archive.tar.{
    TarEntry, TarReadLimits, entry_for_file, write_archive, read_archive_strict,
};

fn main() {
    let content: List<Byte> = [0_u8, 65_u8, 255_u8];
    let entries: List<TarEntry> = [entry_for_file("payload.bin", content, 0o644, 0)];
    let bytes = write_archive(&entries).unwrap();
    let limits = TarReadLimits {
        max_input_bytes: 4096, max_entries: 1, max_entry_bytes: 3,
        max_total_content_bytes: 3, max_extensions: 0,
        max_extension_bytes: 0, max_text_bytes: 64,
        max_trailing_padding_bytes: 0,
    };
    let decoded = read_archive_strict(bytes.as_slice(), &limits).unwrap();
    assert_eq(decoded.len(), 1);
    assert_eq(*decoded[0].path(), "payload.bin");
    assert_eq(decoded[0].content()[2], 255_u8);
    print("archive verified");
}
```

The example exercises interpreter execution. It does not establish native AOT
support for every archive operation.

## Borrowed entry views

`TarEntry` stores its fields privately. Accessors borrow the stored values;
reading a path, kind or payload does not require copying the whole entry.

| Method | Return type | Meaning |
|---|---|---|
| `path()` | `&Text` | Archive path, with `/` separators. |
| `entry_type()` | `&EntryType` | Regular file, directory, link or another tar kind. |
| `content()` | `&List<Byte>` | Exact binary payload. |
| `mode()` | `Int` | POSIX mode bits. |
| `mtime()` | `Int` | Modification time in Unix seconds. |

Keep a borrowed view within the lifetime of its entry. Make an explicit copy
when the value must outlive that owner. Inspect `EntryType.Symlink(target)` and
`EntryType.Hardlink(target)` to read a link target; a link is not a regular file.

## Constructors and writing

The following functions live in `core.archive.tar` and return `TarEntry`:

| Constructor | Arguments |
|---|---|
| `entry_for_file` | `path: Text`, `content: List<Byte>`, `mode: Int`, `mtime: Int` |
| `entry_for_directory` | `path: Text`, `mode: Int`, `mtime: Int` |
| `entry_for_symlink` | `path: Text`, `target: Text`, `mtime: Int`; mode defaults to `0o777`. |
| `entry_for_symlink_with_mode` | `path: Text`, `target: Text`, `mode: Int`, `mtime: Int` |
| `entry_for_hardlink` | `path: Text`, `target: Text`, `mode: Int`, `mtime: Int` |

`write_archive(&List<TarEntry>)` returns `Result<List<Byte>, TarError>` containing
uncompressed tar bytes. It does not write files, compress the result or grant
permission to extract entries. Gzip encoding remains unavailable; see
[compression codecs](/docs/stdlib/compress).

## Strict complete-stream reading

`read_archive_strict(bytes: &[Byte], limits: &TarReadLimits)` returns
`Result<List<TarEntry>, TarReadError>`. Its supported profile includes:

- Exact USTAR and GNU headers, including checked nonnegative octal and GNU binary numbers.
- Regular files, directories, symbolic links and hard links.
- GNU long-path and long-link extensions.
- One local PAX header per entry, with `path`, `linkpath`, `size`, `uid`, `gid`,
  `uname`, `gname` and integer `mtime` fields. PAX `size` controls the following
  entry's physical payload and padding.

Paths and textual metadata must be UTF-8. The reader rejects embedded NUL in
extension values, duplicate or competing extensions, orphan extensions, global
PAX, sparse files, devices, FIFOs, unknown PAX keys and unsupported type flags.
Negative or fractional numeric metadata is rejected. Ambiguous GNU binary
numbers with the sign bit set are rejected.

Every payload needs complete zero padding. The archive must end with two zero
blocks; any remaining input must consist entirely of bounded whole zero blocks.
No partial entry list is returned when a later entry or trailing byte fails.

### Resource limits

Every field of `TarReadLimits` is public and required. All limits are
nonnegative; zero forbids that resource. A valid empty archive still needs at
least 1024 input bytes for its two terminating blocks.

| Field | Budget |
|---|---|
| `max_input_bytes` | Total uncompressed tar input. |
| `max_entries` | Returned entries, excluding extension headers. |
| `max_entry_bytes` | Payload bytes of one returned entry. |
| `max_total_content_bytes` | Combined payload bytes of returned entries. |
| `max_extensions` | Number of extension headers. |
| `max_extension_bytes` | Combined extension payload bytes. |
| `max_text_bytes` | Length of a decoded textual field. |
| `max_trailing_padding_bytes` | Zero padding after the required end blocks. |

Limit failures return `TarReadError.LimitExceeded(TarReadLimit)` identifying the
budget. Other errors distinguish malformed headers, padding, terminators,
trailing data and extension records. `Format(TarError)` retains the underlying
header or numeric error; `InvalidLimits` rejects a negative budget.

### Application admission

Strict format validation does not make archive paths safe for extraction.
Applications must independently reject absolute paths, traversal, duplicate
names and conflicting file/directory paths, and choose whether links are
permitted. Compressed inputs need a separate expansion limit before parsing.
Cog publication also requires checksum and manifest agreement; see
[source archives](/docs/tooling/cog-packages#source-archive).

### Permissive reader

`read_archive(bytes: &[Byte]) -> Result<List<TarEntry>, TarError>` retains its
legacy permissive behavior. It is not an admission validator: it does not
require strict complete-input framing and does not implement the strict GNU
profile. `TarFormat.unpack` uses this reader; use `read_archive_strict` directly
when the strict contract is required.

## Universal archive protocol

`core.archive.Archive` defines `algorithm()`, `pack(&List<ArchiveEntry>)` and
`unpack(&[Byte])`. Packing returns archive bytes; unpacking returns entries;
both operations return `Result<…, ArchiveError>`.

`ArchiveEntry` privately stores a path, POSIX mode, modification time, kind and
binary payload. `ArchiveEntryKind` represents regular files, directories,
symbolic links and hard links. Parent-module `entry_for_file`,
`entry_for_directory` and `entry_for_symlink` construct universal entries.
Their `core.archive.tar` counterparts construct format-specific entries; the
parent also re-exports those constructors with a `tar_` prefix.

### TarEntry ↔ ArchiveEntry adapters

| Function | Result |
|---|---|
| `tar_entry_to_universal(&TarEntry)` | `Result<ArchiveEntry, ArchiveError>` |
| `universal_to_tar_entry(&ArchiveEntry)` | `TarEntry` |

Conversions use public borrowed views and constructors. They preserve path,
mode, modification time, binary content and supported link targets. Unsupported
tar kinds return `ArchiveError.InvalidEntry`; they are never relabeled as
regular files. `TarFormat.unpack` propagates that failure without returning a
partial universal entry list.

The universal model has no UID, GID or owner-name fields. Those fields are lost
on conversion; converting back uses the tar constructors' default owner values.
Use `TarEntry` directly when format-specific ownership metadata matters.

### Algorithm dispatch

`tar_format() -> TarFormat` constructs the concrete tar adapter. The declared
`adapter_for(ArchiveAlgorithm)` returns `Result<Heap<dyn Archive>, ArchiveError>`;
its generic heap-to-protocol coercion is not established by the concrete-adapter
examples and can fail strict source checking. Use the concrete adapter when
that factory is rejected.

| Algorithm | Tag | Extensions | Adapter |
|---|---|---|---|
| `Tar` | `tar` | `tar` | `TarFormat` |
| `Zip` | `zip` | `zip`, `jar` | Unimplemented. |
| `Ar` | `ar` | `a` | Unimplemented. |
| `Cpio` | `cpio` | `cpio` | Unimplemented. |

`archive_algorithm_tag` and `archive_algorithm_extensions` take
`&ArchiveAlgorithm`; they identify a selected format without inspecting bytes.
Unavailable adapters return `ArchiveError.UnsupportedAlgorithm`. Format errors
use `ArchiveError.Format(Text)`; unsupported entries use `InvalidEntry(Text)`.

## Implementation references

- [Tar source and public API](https://github.com/verum-lang/verum/blob/main/core/archive/tar.vr)
- [Universal archive adapters](https://github.com/verum-lang/verum/blob/main/core/archive/mod.vr)
- [Executable archive controls](https://github.com/verum-lang/verum/tree/main/core-tests/archive/tar)
