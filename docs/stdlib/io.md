---
sidebar_position: 1
title: io
description: Files, paths, stdio, processes, Read/Write protocols, buffered I/O.
---

# `core.io` — Files, paths, streams, processes

File I/O, path manipulation, standard streams, processes, and the
`Read`/`Write`/`Seek`/`BufRead` protocol family. Both sync and async
variants are provided.

| File | What's in it |
|---|---|
| `protocols.vr` | `Read`, `Write`, `Seek`, `BufRead`, `SeekFrom` |
| `async_protocols.vr` | `AsyncRead`, `AsyncWrite`, `AsyncBufRead`, `ReadFuture`, `WriteFuture`, `FlushFuture` |
| `file.vr` | `File`, `OpenOptions`, sync + async file I/O |
| `stdio.vr` | `Stdin`, `Stdout`, `Stderr` (+ locks), `print`/`println`/`eprint`/`eprintln`, `read_line`, `read_int`, `read_float` |
| `path.vr` | `Path`, `PathBuf`, `Component`, `MAIN_SEPARATOR`, path utilities |
| `fs.vr` | `Metadata`, `FileType`, `DirEntry`, `ReadDir`, `WalkDir`, filesystem operations |
| `buffer.vr` | `BufReader<R>`, `BufWriter<W>`, `LineWriter<W>`, `copy`, `read_all`, `DEFAULT_BUF_CAPACITY` |
| `process.vr` | `Command`, `Child`, `ExitStatus`, `Output`, `Stdio`, `run` |
| `engine.vr` | adapter to `sys::IOEngine` (io_uring / kqueue / IOCP) |

All public functions in this module require `[IO]` in the context
unless otherwise noted.

---

## Protocols

### Sync

```verum
type Read is protocol {
    fn read(&mut self, buf: &mut [Byte]) -> IoResult<Int>;
    fn read_exact(&mut self, buf: &mut [Byte]) -> IoResult<()>;        // default
    fn read_to_end(&mut self, buf: &mut List<Byte>) -> IoResult<Int>;  // default
    fn read_to_string(&mut self, out: &mut Text) -> IoResult<Int>;     // default
    fn read_vectored(&mut self, bufs: &mut [IoSliceMut]) -> IoResult<Int>;
    fn bytes(self) -> BytesIter;
    fn chain<R: Read>(self, next: R) -> Chain<Self, R>;
    fn take(self, limit: UInt64) -> Take<Self>;
}

type Write is protocol {
    fn write(&mut self, buf: &[Byte]) -> IoResult<Int>;
    fn write_all(&mut self, buf: &[Byte]) -> IoResult<()>;             // default
    fn flush(&mut self) -> IoResult<()>;
    fn write_vectored(&mut self, bufs: &[IoSlice]) -> IoResult<Int>;
    fn write_fmt(&mut self, args: FormatArgs) -> IoResult<()>;
}

type Seek is protocol {
    fn seek(&mut self, pos: SeekFrom) -> IoResult<UInt64>;
    fn rewind(&mut self) -> IoResult<()>;                              // default
    fn stream_position(&mut self) -> IoResult<UInt64>;                 // default
    fn stream_len(&mut self) -> IoResult<UInt64>;                      // default
}

type BufRead is protocol extends Read {
    fn fill_buf(&mut self) -> IoResult<&[Byte]>;
    fn consume(&mut self, amt: Int);
    fn read_until(&mut self, byte: Byte, buf: &mut List<Byte>) -> IoResult<Int>;
    fn read_line(&mut self, out: &mut Text) -> IoResult<Int>;
    fn split(self, byte: Byte) -> SplitIter;
    fn lines(self) -> LinesIter;
}

type SeekFrom is Start(UInt64) | End(Int64) | Current(Int64);
```

### Async variants

```verum
type AsyncRead is protocol {
    async fn read_async(&mut self, buf: &mut [Byte]) -> IoResult<Int>;
    async fn read_to_end_async(&mut self, buf: &mut List<Byte>) -> IoResult<Int>;
}

type AsyncWrite is protocol {
    async fn write_async(&mut self, buf: &[Byte]) -> IoResult<Int>;
    async fn write_all_async(&mut self, buf: &[Byte]) -> IoResult<()>;
    async fn flush_async(&mut self) -> IoResult<()>;
    async fn shutdown_async(&mut self) -> IoResult<()>;
}

type AsyncBufRead is protocol extends AsyncRead {
    async fn read_line_async(&mut self, buf: &mut Text) -> IoResult<Int>;
    fn lines_async(self) -> AsyncLines;
}
```

---

## Error types

```verum
type StreamError is { kind: IoErrorKind, message: Text };
type IoErrorKind is
    | NotFound
    | PermissionDenied
    | ConnectionRefused
    | ConnectionReset
    | ConnectionAborted
    | NotConnected
    | AddrInUse
    | AddrNotAvailable
    | BrokenPipe
    | AlreadyExists
    | WouldBlock
    | InvalidInput
    | InvalidData
    | TimedOut
    | WriteZero
    | Interrupted
    | Unsupported
    | UnexpectedEof
    | OutOfMemory
    | Other(Text);

type IoResult<T> = Result<T, StreamError>;
```

---

## File operations

### Opening

```verum
File.open(&path) -> IoResult<File>            // read-only
File.create(&path) -> IoResult<File>          // truncate/create write

OpenOptions.new()
    .read(true)
    .write(true)
    .create(true)
    .truncate(false)
    .append(false)
    .create_new(false)                         // fail if exists
    .mode(0o644)                               // Unix perms
    .open(&path) -> IoResult<File>
```

### File methods

```verum
f.metadata() -> IoResult<Metadata>
f.set_len(size: UInt64) -> IoResult<()>
f.sync_all() -> IoResult<()>                   // fsync
f.sync_data() -> IoResult<()>                  // fdatasync
f.try_clone() -> IoResult<File>
f.path() -> IoResult<PathBuf>                  // from /proc/self/fd/N on Linux

// Implements Read, Write, Seek, AsyncRead, AsyncWrite
```

### Full-file helpers

```verum
fs::read(&path) -> IoResult<List<Byte>>
fs::read_to_string(&path) -> IoResult<Text>
fs::write(&path, bytes: &[Byte]) -> IoResult<()>
fs::write_text(&path, text: &Text) -> IoResult<()>
fs::append(&path, bytes: &[Byte]) -> IoResult<()>
```

---

## Buffered I/O

```verum
BufReader.new(R) -> BufReader<R>
BufReader.with_capacity(capacity, R)
br.buffer() -> &[Byte]
br.capacity() -> Int
br.into_inner() -> R

BufWriter.new(W) -> BufWriter<W>
BufWriter.with_capacity(capacity, W)
bw.buffer() -> &[Byte]
bw.into_inner() -> Result<W, IntoInnerError<W>>

LineWriter.new(W)                              // flushes on '\n'

copy(&mut R, &mut W) -> IoResult<UInt64>        // streaming copy
read_all(&mut R) -> IoResult<List<Byte>>

const DEFAULT_BUF_CAPACITY: Int = 8192;
```

### Idiomatic line processing

```verum
fn process_lines(path: &Path) -> IoResult<Int> {
    let f = File.open(path)?;
    let mut reader = BufReader.new(f);
    let mut count = 0;
    for line in reader.lines() {
        let line = line?;
        if line.starts_with("ERROR") { count += 1; }
    }
    Result.Ok(count)
}
```

---

## Standard streams

```verum
stdin() -> Stdin         stdout() -> Stdout         stderr() -> Stderr

// Locking for exclusive access (improves throughput in tight loops):
stdin().lock() -> StdinLock
stdout().lock() -> StdoutLock
stderr().lock() -> StderrLock
```

### Print functions

```verum
print(&text)       println(&text)
eprint(&text)      eprintln(&text)
// All require [IO]
```

### Read helpers

```verum
read_line() -> IoResult<Text>              // newline-trimmed
read_int() -> IoResult<Int>
read_float() -> IoResult<Float>
```

---

## Path and PathBuf

`Path` is the borrowed form (`&Path`); `PathBuf` is owned.

### Construction

```verum
Path.from(&text) -> &Path
PathBuf.from(&text) -> PathBuf
PathBuf.new() -> PathBuf
Path.new(&text) -> &Path       // same as Path.from
```

### Inspection

```verum
p.as_text() -> &Text
p.file_name() -> Maybe<&Text>
p.file_stem() -> Maybe<&Text>
p.extension() -> Maybe<&Text>
p.parent() -> Maybe<&Path>
p.components() -> Components           // iterator of Component
p.is_absolute() / p.is_relative() -> Bool
p.has_root() -> Bool
p.is_file() / p.is_dir() / p.is_symlink() -> Bool
p.exists() -> Bool

type Component is
    | RootDir
    | CurDir             // "."
    | ParentDir          // ".."
    | Normal(&Text);
```

### Construction from parts

```verum
p.join(&other) -> PathBuf
p.with_file_name(&name) -> PathBuf
p.with_extension(&ext) -> PathBuf
p.strip_prefix(&base) -> Result<&Path, StripPrefixError>

pb.push(&segment)                       // in-place append
pb.pop() -> Bool                        // remove last segment; false if at root
pb.set_file_name(&name)
pb.set_extension(&ext)
```

### Canonicalisation

```verum
normalize(&path) -> PathBuf             // resolves "." and ".." syntactically
canonicalize(&path) -> IoResult<PathBuf>  // resolves symlinks (hits disk)
```

### Constants

```verum
const MAIN_SEPARATOR: Char = '/';       // or '\\' on Windows
```

---

## Filesystem operations

```verum
fs::metadata(&path) -> IoResult<Metadata>
fs::symlink_metadata(&path) -> IoResult<Metadata>    // doesn't follow symlinks
fs::exists(&path) -> Bool
fs::is_file(&path) / is_dir(&path) / is_symlink(&path) -> Bool

fs::create_dir(&path) -> IoResult<()>
fs::create_dir_all(&path) -> IoResult<()>            // like mkdir -p
fs::remove_file(&path) -> IoResult<()>
fs::remove_dir(&path) -> IoResult<()>                // must be empty
fs::remove_dir_all(&path) -> IoResult<()>            // recursive
fs::rename(&from, &to) -> IoResult<()>
fs::copy(&from, &to) -> IoResult<UInt64>             // returns bytes copied
fs::hard_link(&src, &dst) -> IoResult<()>
fs::symlink(&src, &dst) -> IoResult<()>
fs::read_link(&path) -> IoResult<PathBuf>

fs::read_dir(&path) -> IoResult<ReadDir>             // iterator of DirEntry
fs::walk_dir(&path) -> IoResult<WalkDir>             // recursive

fs::temp_dir() -> PathBuf
fs::current_dir() -> IoResult<PathBuf>
fs::set_current_dir(&path) -> IoResult<()>
```

### `Metadata` / `FileType`

```verum
m.len() -> UInt64
m.is_file() / m.is_dir() / m.is_symlink() -> Bool
m.file_type() -> FileType
m.permissions() -> Permissions
m.modified() / m.accessed() / m.created() -> IoResult<SystemTime>

type Permissions is { mode: UInt32 };       // Unix
perm.mode() / perm.set_mode(mode) / perm.readonly()
```

### `DirEntry`

```verum
entry.path() -> PathBuf
entry.file_name() -> Text
entry.metadata() -> IoResult<Metadata>
entry.file_type() -> IoResult<FileType>
```

### `WalkDir`

Recursive directory traversal:

```verum
for entry in fs::walk_dir(&root)? {
    let entry = entry?;
    if entry.file_type()?.is_file() {
        process(&entry.path()).await?;
    }
}
```

Options:

```verum
fs::walk_dir(&root).unwrap()
    .min_depth(1)
    .max_depth(5)
    .follow_links(false)
    .same_file_system(true)
    .sort_by(|a, b| a.file_name().cmp(&b.file_name()))
```

---

## Processes

```verum
type Command is { ... };          // builder
type Child   is { ... };
type Output is { status: ExitStatus, stdout: List<Byte>, stderr: List<Byte> };
type ExitStatus is { code: Maybe<Int>, signal: Maybe<Int> };
type Stdio is Inherit | Piped | Null | From(File);
```

### Building a command

```verum
Command.new(&"grep")
    .arg("-n").arg("TODO")
    .args(&["src/", "tests/"])
    .env("RUST_LOG", "debug")
    .envs(extra_env)
    .env_remove("TMPDIR")
    .env_clear()
    .current_dir(&workdir)
    .stdin(Stdio.Null)
    .stdout(Stdio.Piped)
    .stderr(Stdio.Inherit)
```

### One-shot

```verum
cmd.output() -> IoResult<Output>               // blocks until exit
cmd.status() -> IoResult<ExitStatus>           // discards stdout/stderr
run(&"ls -la /tmp") -> IoResult<Output>        // convenience
```

### Streaming

```verum
cmd.spawn() -> IoResult<Child>

child.wait() -> IoResult<ExitStatus>
child.try_wait() -> IoResult<Maybe<ExitStatus>>
child.kill() -> IoResult<()>
child.id() -> UInt32
child.stdin.take()   / child.stdout.take()   / child.stderr.take()
child.wait_with_output() -> IoResult<Output>
```

### Example — shell pipeline

```verum
async fn count_todos(dir: &Path) -> IoResult<Int> {
    let mut child = Command.new(&"grep")
        .args(&["-r", "-c", "TODO", &dir.as_text()])
        .stdout(Stdio.Piped)
        .spawn()?;
    let out = child.wait_with_output().await?;
    let text = Text.from_utf8_lossy(&out.stdout);
    let total: Int = text.lines()
        .filter_map(|l| l.rsplit_once(":").and_then(|(_, n)| n.parse_int().ok()))
        .sum();
    Result.Ok(total)
}
```

---

## Utility types

```verum
Empty               // reader that returns 0 bytes
Sink                // writer that discards all input
ByteRepeat(byte)    // reader that produces the same byte forever
Cursor<&[Byte]>     // in-memory Read + Write + Seek over a buffer
Chain<R1, R2>       // read R1 fully, then R2
Take<R>             // read at most N bytes from R
BytesIter           // Iterator<IoResult<Byte>>
LinesIter           // Iterator<IoResult<Text>>
```

---

## Async-stream helpers

Most functions have `_async` variants:

```verum
fs::read_async(&path).await -> IoResult<List<Byte>>
fs::read_to_string_async(&path).await -> IoResult<Text>
fs::write_async(&path, &bytes).await -> IoResult<()>

let f = File.open_async(&path).await?;
let mut reader = BufReader.new(f);
while let Maybe.Some(line) = reader.next_line_async().await? {
    process(&line);
}
```

The async I/O engine is selected per-platform — `io_uring` on Linux,
`kqueue` on macOS/BSD, IOCP on Windows. See
[`sys`](/docs/stdlib/sys#io-engine).

---

## Cross-references

- **[net](/docs/stdlib/net)** — TCP/UDP sockets implement `Read`/`Write`/`AsyncRead`/`AsyncWrite`.
- **[async](/docs/stdlib/async)** — the executor driving async I/O.
- **[text](/docs/stdlib/text)** — parsing / formatting text read from files.
- **[sys](/docs/stdlib/sys)** — V-LLSI syscalls underlying `fs::`.
- **[Language → error handling](/docs/language/error-handling)** — `IoResult` + `?`.
