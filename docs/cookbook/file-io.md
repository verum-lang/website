---
title: File I/O
description: Read, write, stream, and memory-map files — sync and async.
---

# File I/O

Every recipe below uses `core.io::fs` and assumes the function is
in scope for `using [FileSystem, IO]`. See
[`stdlib/io`](/docs/stdlib/io) for the full API.

## Read a file line by line

```verum
mount core.io.fs;
mount core.io.{BufReader};

fn count_errors(path: &Path) -> IoResult<Int>
    using [FileSystem]
{
    let file = File.open(path)?;
    let mut reader = BufReader.new(file);
    let mut count = 0;
    for line in reader.lines() {
        let line = line?;                                 // IoResult<Text>
        if line.starts_with("ERROR") { count += 1; }
    }
    Result.Ok(count)
}
```

`BufReader.new(file)` wraps the file in an 8 KiB buffer by default;
for sequential workloads where you know the file is large, preallocate:

```verum
let reader = BufReader.with_capacity(64 * 1024, file);
```

## Read the whole file at once

When the file fits comfortably in memory (say, under 10 MiB) and you
need all of it, prefer the one-shot APIs:

```verum
// Bytes:
let bytes: List<Byte> = fs::read(path)?;

// Text (validates UTF-8 — errors if invalid):
let text: Text = fs::read_to_string(path)?;

// Lines — eagerly materialised:
let lines: List<Text> = fs::read_to_string(path)?
    .lines()
    .collect();
```

For files bigger than available memory, **never** use `read_to_string` —
use `BufReader`-based streaming as above.

## Write a file

```verum
fn write_summary(path: &Path, summary: &Summary) -> IoResult<()>
    using [FileSystem]
{
    let mut w = BufWriter.new(File.create(path)?);
    for record in &summary.records {
        w.write_all(record.to_text().as_bytes())?;
        w.write_all(b"\n")?;
    }
    w.flush()?;                                         // don't forget!
    Result.Ok(())
}
```

### Atomic writes

A crash between `File.create` and `flush` leaves a partial file. For
critical data, write to a sibling file and **rename** it into place —
POSIX guarantees rename is atomic within a filesystem:

```verum
fn write_atomic(path: &Path, contents: &[Byte]) -> IoResult<()>
    using [FileSystem]
{
    let tmp = path.with_extension("tmp");
    {
        let mut w = BufWriter.new(File.create(&tmp)?);
        w.write_all(contents)?;
        w.flush()?;
        w.sync_data()?;                                 // fsync the data
    }
    fs::rename(&tmp, path)?;                            // atomic
    Result.Ok(())
}
```

`sync_data` forces the OS to push the data to stable storage; without
it the data may live only in the page cache for some time after
`flush` returns.

## Append to a file

```verum
let mut f = File.options()
    .append(true)
    .create(true)
    .open(path)?;
f.write_all(line.as_bytes())?;
```

## Pitfall — forgetting to flush

`BufWriter` drops *do* flush, but **swallow the error**. For critical
writes, call `.flush()?` explicitly so a failure propagates:

```verum
{
    let mut w = BufWriter.new(File.create(path)?);
    w.write_all(data)?;
    w.flush()?;                                         // propagates errors
}  // drop here: silent flush retry, any error is lost
```

## Copy, rename, remove

```verum
fs::copy(src, dst)?;                                   // returns bytes copied
fs::rename(old_path, new_path)?;                       // atomic within fs
fs::remove_file(path)?;
fs::remove_dir(path)?;                                 // fails if not empty
fs::remove_dir_all(path)?;                             // recursive
```

## List a directory

```verum
for entry in fs::read_dir(path)? {
    let entry = entry?;                                 // IoResult<DirEntry>
    print(f"{entry.path}  {entry.metadata()?.len()}B");
}
```

`read_dir` returns a streaming iterator; it does not materialise a
list. For bulk listings, wrap in `.collect::<List<_>>()`.

### Recursive walk

```verum
for entry in fs::walk_dir(path)? {
    let entry = entry?;
    if entry.file_type()?.is_file() {
        process_file(&entry.path).await?;
    }
}
```

## File metadata

```verum
let md = fs::metadata(path)?;
print(f"size={md.len()} modified={md.modified()?} mode={md.permissions()?:o}");

let t = md.file_type();
if t.is_file()    { ... }
if t.is_dir()     { ... }
if t.is_symlink() { ... }
```

## Symbolic links

```verum
fs::symlink(target, link_path)?;                       // create

let metadata = fs::symlink_metadata(path)?;           // does not follow
let target   = fs::read_link(path)?;                  // → Path
```

## Permissions

```verum
let mut perms = fs::metadata(path)?.permissions();
perms.set_mode(0o644);
fs::set_permissions(path, perms)?;

#[cfg(unix)]
{
    fs::set_mode(path, 0o755)?;                        // Unix helper
}
```

## Memory-mapped files

For read-only access to large files, memory-mapping beats repeated
`read` calls:

```verum
mount core.io.mmap;

let mm = Mmap.open(path)?;                             // read-only
let bytes: &[Byte] = mm.as_slice();

// Random access without system calls:
for chunk in bytes.chunks(4096) {
    process(chunk);
}
// `mm` is unmapped on drop.
```

For writable mmap:

```verum
let mut mm = MmapMut.open(path)?;
mm.as_mut_slice()[0] = 42;
mm.flush()?;                                           // sync
```

## Async I/O

For high-throughput servers, use the `_async` variants:

```verum
async fn count_errors_async(path: &Path) -> IoResult<Int>
    using [FileSystem]
{
    let file = File.open_async(path).await?;
    let mut reader = BufReader.new(file);
    let mut count = 0;
    while let Maybe.Some(line) = reader.next_line_async().await? {
        if line.starts_with("ERROR") { count += 1; }
    }
    Result.Ok(count)
}
```

`open_async` schedules the `open()` syscall on the IO pool; subsequent
`read_async`/`write_async` calls yield when data is not ready. On
platforms with `io_uring` (Linux), the read/write goes through the
uring queue for near-zero syscall overhead.

## Error handling

Common `IoError` variants for file I/O:

| Variant                 | Cause                                                  |
|-------------------------|--------------------------------------------------------|
| `NotFound`              | Path does not exist.                                   |
| `PermissionDenied`      | Missing read/write/execute bit.                        |
| `AlreadyExists`         | `File.create` with `create_new(true)` on existing path.|
| `InvalidData`           | UTF-8 check failed in `read_to_string`.                |
| `IsADirectory`          | `File.open` on a directory.                            |
| `NotADirectory`         | Directory syscall on a file.                           |
| `StorageFull`           | No space left on device.                               |
| `QuotaExceeded`         | User quota.                                            |
| `InvalidFilename`       | Illegal byte sequence in the path.                     |
| `Interrupted`           | A signal interrupted the syscall.                      |

`IoError` implements `Display`, so `f"{e}"` gives a readable message.
See [language/error-handling](/docs/language/error-handling) for the
full ladder.

## Testing with a virtual filesystem

The `MemoryFs` mock replaces the real `FileSystem` context in tests:

```verum
let fs = MemoryFs.new()
    .with_file("/etc/config.toml", b"key = 1")
    .with_dir("/var/log");

provide FileSystem = fs in {
    let text = fs::read_to_string(path#"/etc/config.toml")?;
    assert_eq(text, "key = 1");
}
```

## See also

- **[`stdlib/io`](/docs/stdlib/io)** — `Read`, `Write`, `BufRead`,
  async file handles, mmap.
- **[`stdlib/text`](/docs/stdlib/text)** — `Text.from_utf8`, line
  iteration, encoding helpers.
- **[`stdlib/sys`](/docs/stdlib/sys)** — paths, environment, file
  descriptors.
- **[CLI tool tutorial](/docs/tutorials/cli-tool)** — a project that
  puts file I/O together with configuration and reporting.
