---
sidebar_position: 1
title: io
description: Files, paths, stdio, processes, Read/Write protocols, buffered I/O.
status: partial
status_detail: 10 submodules covered by core-tests/io/* (2026-05-24); 200+ green tests under `--interp` over data-only + construction surface; method-call surface (Reader/Writer/Cursor/File) gated by task #io-1 (mount-scope-aware lookup_function).
---

import StdlibStatus from '@site/src/components/StdlibStatus';

# `core.io` — Files, paths, streams, processes

File I/O, path manipulation, standard streams, processes, and the
`Read`/`Write`/`Seek`/`BufRead` protocol family. Both sync and async
variants are provided.

<StdlibStatus
  status="partial"
  detail="200+ green tests under --interp over the data-only surface across 10 submodules; method-call surface (Reader/Writer/Cursor/File read/write/seek) gated by task #io-1 (mount-scope-aware lookup_function for VBC method dispatch)."
  defects={[
    {area: 'io.protocols', summary: 'Sink.write / EmptyReader.read / Cursor.read misdispatch to sys_read/sys_write (bare-name shadow)'},
    {area: 'io.protocols', summary: 'Cursor<T> defined twice (protocols.vr + buffer.vr alias)'},
    {area: 'io.protocols', summary: '`?` operator on IoResult<T> loses StreamError.kind through Err propagation'},
    {area: 'io.path', summary: 'PathBuf.push Text-equality drift via nested struct field (surgical fix landed for length; eq drift remains)'},
    {area: 'io.file', summary: 'Live I/O requires temp-dir / fixture harness'},
    {area: 'io.fs', summary: 'FileType has only 4 variants (vs POSIX 8) — block/char-device/fifo/socket not exposed'},
    {area: 'io.process', summary: 'Command.{spawn,output,status} return Result<_,Text> instead of IoResult<T>; Output.stdout returns Text not bytes'},
    {area: 'io.engine', summary: 'IoEngine.new/destroy needs sandboxed test harness; real async I/O via engine.poll still in plan'},
  ]}
  sweepDate="2026-05-24"
/>

## Submodule status

| Module | Status | Conformance suite |
|---|---|---|
| `protocols.vr` | **partial** | [core-tests/io/protocols](https://github.com/verum-lang/verum/tree/main/core-tests/io/protocols) — 60+ tests pin IoErrorKind 20-variant, StreamError, SeekFrom, POSIX-stable errno table, IoResult. 11 @ignore'd on Reader/Writer/Cursor method dispatch (#io-1). |
| `buffer.vr` | **partial** | [core-tests/io/buffer](https://github.com/verum-lang/verum/tree/main/core-tests/io/buffer) — constants (DEFAULT_BUF_CAPACITY=8192, MIN_BUF_CAPACITY=64) + FdReader, BufferCursor, BufReader, BufWriter construction. 7 @ignore'd on method surface (#io-1). |
| `path.vr` | **partial** | [core-tests/io/path](https://github.com/verum-lang/verum/tree/main/core-tests/io/path) — 40+ tests pin Path immutable surface (parent, file_name, file_stem, extension, starts_with, ends_with, strip_prefix), Component 5-variant, PathBuf construction. PathBuf mutable surface (push/pop/set_extension) partially gated by #io-4. |
| `stdio.vr` | **partial** | [core-tests/io/stdio](https://github.com/verum-lang/verum/tree/main/core-tests/io/stdio) — factory functions (stdin/stdout/stderr), lock construction, print/println/eprint/eprintln (live, no-panic). Read/write methods gated by #io-1. |
| `file.vr` | **partial** | [core-tests/io/file](https://github.com/verum-lang/verum/tree/main/core-tests/io/file) — O_* constants (POSIX-stable values), OpenOptions fluent builder, File.options factory. File I/O gated by #io-1 + #io-8 (temp-dir harness). |
| `fs.vr` | **partial** | [core-tests/io/fs](https://github.com/verum-lang/verum/tree/main/core-tests/io/fs) — FileType 4-variant + predicates, Permissions mode round-trip. Live fs ops gated by #io-1 + #io-8. |
| `process.vr` | **partial** | [core-tests/io/process](https://github.com/verum-lang/verum/tree/main/core-tests/io/process) — Stdio 3-variant, ExitStatus over POSIX waitpid encoding, Command fluent builder. Live spawn gated by #io-1 + #io-8. |
| `async_protocols.vr` | **partial** | [core-tests/io/async_protocols](https://github.com/verum-lang/verum/tree/main/core-tests/io/async_protocols) — ReadFuture / WriteFuture / FlushFuture construction + read_async/write_async/flush_async factories. Polling gated by #io-1 + executor. |
| `engine.vr` | **partial** | [core-tests/io/engine](https://github.com/verum-lang/verum/tree/main/core-tests/io/engine) — capacity constants + IoEvent Read/Write/ReadWrite flag laws. Engine lifecycle gated by #io-16 (sandboxed test harness). |
| `mod.vr` | **partial** | [core-tests/io/mod](https://github.com/verum-lang/verum/tree/main/core-tests/io/mod) — IoError = StreamError alias verified; IoErrorKind / SeekFrom / IoResult / print fn reachability through `core.io.*`. |

| Source File | What's in it |
|---|---|
| `protocols.vr` | `Read`, `Write`, `Seek`, `BufRead` protocols; `StreamError`, `IoErrorKind` (20 variants), `IoResult<T>`, `SeekFrom`; `EmptyReader`, `ByteRepeat`, `Sink`, `Cursor<T>`, `Chain`, `Take`; `BytesIter`, `LinesIter`, `SplitIter` |
| `async_protocols.vr` | `AsyncRead`, `AsyncWrite`, `AsyncBufRead`; `ReadFuture<R>`, `WriteFuture<W>`, `FlushFuture<W>`; `read_async`, `write_async`, `flush_async` |
| `file.vr` | `File`, `OpenOptions`, `BufReader`, `BufWriter`; `O_RDONLY`/`O_WRONLY`/`O_RDWR`/`O_CREAT`/`O_EXCL`/`O_TRUNC`/`O_APPEND`; `read`, `read_to_string`, `write`, `write_bytes` |
| `stdio.vr` | `Stdin`, `Stdout`, `Stderr` (and locks); `print`/`println`/`eprint`/`eprintln`; `read_line`, `read_int`, `read_float` |
| `path.vr` | `Path`, `PathBuf`, `Component` (5 variants: Prefix, RootDir, CurDir, ParentDir, Normal); `MAIN_SEPARATOR`; `normalize`, `join`, `file_name`, `file_stem`, `extension`, `parent` |
| `fs.vr` | `Metadata`, `FileType` (4 variants: File, Dir, Symlink, Unknown), `DirEntry`, `ReadDir`, `WalkDir`, `Permissions`; filesystem operations (metadata/exists/is_file/is_dir/is_symlink/create_dir/remove_dir/read_dir/rename/copy/canonicalize/temp_dir/current_dir/walk_dir) |
| `buffer.vr` | `BufReader<R>`, `BufWriter<W>`, `LineWriter<W>`, `BufferCursor<T>` (alias `Cursor<T>`), `FdReader`; `IntoInnerError<W>`; `copy`, `read_all`; `DEFAULT_BUF_CAPACITY=8192`, `MIN_BUF_CAPACITY=64` |
| `process.vr` | `Command`, `Child`, `ExitStatus`, `Output`, `Stdio` (3 variants: Inherit, Piped, Null); `run` |
| `engine.vr` | `IoEngine`, `IoEvent`; `IO_ENGINE_DEFAULT_CAPACITY=256`, `IO_ENGINE_MAX_CAPACITY=65536`, `IO_ENGINE_MAX_POLL_EVENTS=4096`; per-platform multiplexer (kqueue / epoll / IOCP) |

---

## Error types

```verum
type StreamError is {
    kind: IoErrorKind,
    message: Maybe<Text>,
};

type IoErrorKind is
    | NotFound           // ENOENT
    | PermissionDenied   // EACCES
    | ConnectionRefused  // ECONNREFUSED
    | ConnectionReset    // ECONNRESET
    | ConnectionAborted  // ECONNABORTED
    | NotConnected       // ENOTCONN
    | AddrInUse          // EADDRINUSE
    | AddrNotAvailable   // EADDRNOTAVAIL
    | BrokenPipe         // EPIPE
    | AlreadyExists      // EEXIST
    | WouldBlock         // EAGAIN
    | InvalidInput       // EINVAL
    | InvalidData
    | TimedOut           // ETIMEDOUT
    | WriteZero
    | Interrupted        // EINTR
    | UnexpectedEof
    | OutOfMemory        // ENOMEM
    | Unsupported
    | Other;             // catch-all (carries optional message field)

type IoResult<T> = Result<T, StreamError>;

// Public alias: IoError == StreamError. Both names accept the same value.
type IoError = StreamError;
```

### Constructors

```verum
StreamError.new(kind: IoErrorKind) -> StreamError
StreamError.with_message(kind: IoErrorKind, msg: Text) -> StreamError
StreamError.Other(msg: Text) -> StreamError                  // = with_message(Other, msg)
StreamError.from_raw_os_error(code: Int) -> StreamError      // POSIX-stable codes pinned
StreamError.from_errno(errno: Int) -> StreamError            // alias for from_raw_os_error
StreamError.from_os(err: OSError) -> StreamError             // from a libc error wrapper
```

### Accessors

```verum
e.kind() -> IoErrorKind
e.message() -> Maybe<&Text>
```

### POSIX-stable errno table

These codes produce identical `IoErrorKind` on every platform:

| errno | code | kind |
|---|---|---|
| ENOENT | 2 | NotFound |
| EINTR | 4 | Interrupted |
| ENOMEM | 12 | OutOfMemory |
| EACCES | 13 | PermissionDenied |
| EEXIST | 17 | AlreadyExists |
| EINVAL | 22 | InvalidInput |
| EPIPE | 32 | BrokenPipe |

Codes outside this table dispatch through `io_error_kind_from_os_code`,
which is `@cfg`-gated per platform — Linux and macOS overlap in
numerically-conflicting ways (e.g. Linux EAGAIN=11 collides with macOS
EDEADLK=11), so a single shared table would silently mis-classify. See
[`core/io/protocols.vr:127-213`](https://github.com/verum-lang/verum/blob/main/core/io/protocols.vr#L127-L213) for the full per-platform dispatcher.

---

## Read / Write / Seek / BufRead protocols

### `Read`

```verum
type Read is protocol {
    fn read(&mut self, buf: &mut [Byte]) -> IoResult<Int>;
    fn read_exact(&mut self, buf: &mut [Byte]) -> IoResult<()>;        // default
    fn read_to_end(&mut self, buf: &mut List<Byte>) -> IoResult<Int>;  // default; retries EINTR
    fn read_to_string(&mut self, out: &mut Text) -> IoResult<Int>;     // default
    fn bytes(self) -> BytesIter<Self>;
    fn chain<R: Read>(self, next: R) -> Chain<Self, R>;
    fn take(self, limit: Int) -> Take<Self>;
}
```

### `Write`

```verum
type Write is protocol {
    fn write(&mut self, buf: &[Byte]) -> IoResult<Int>;
    fn flush(&mut self) -> IoResult<()>;
    fn write_all(&mut self, buf: &[Byte]) -> IoResult<()>;            // default; retries EINTR
    fn write_fmt(&mut self, s: &Text) -> IoResult<()>;                // default
}
```

### `Seek`

```verum
type Seek is protocol {
    fn seek(&mut self, pos: SeekFrom) -> IoResult<Int>;
    fn stream_position(&mut self) -> IoResult<Int>;                   // default
    fn rewind(&mut self) -> IoResult<()>;                             // default
    fn stream_len(&mut self) -> IoResult<Int>;                        // default
}

type SeekFrom is Start(Int) | End(Int) | Current(Int);
```

### `BufRead`

```verum
type BufRead is protocol extends Read {
    fn fill_buf(&mut self) -> IoResult<&[Byte]>;
    fn consume(&mut self, amt: Int);
    fn has_data_left(&mut self) -> IoResult<Bool>;                    // default
    fn read_until(&mut self, delim: Byte, buf: &mut List<Byte>) -> IoResult<Int>;
    fn read_line(&mut self, buf: &mut Text) -> IoResult<Int>;
    fn lines(self) -> LinesIter<Self>;
    fn split(self, delim: Byte) -> SplitIter<Self>;
}
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

The current async I/O implementation runs sync I/O on a worker thread
("sync-under-async") — real `io_uring` / `kqueue` / IOCP routing through
`core.io.engine.IoEngine.poll` is on the roadmap (task #io-15).

---

## File operations

### Opening

```verum
File.open(path: &Text) -> IoResult<File>            // read-only
File.create(path: &Text) -> IoResult<File>          // truncate/create write
File.create_new(path: &Text) -> IoResult<File>      // fail if exists

OpenOptions.new()
    .read(true)
    .write(true)
    .append(false)
    .create(true)
    .create_new(false)                              // fail if exists
    .truncate(false)
    .open(path: &Text) -> IoResult<File>
```

### File methods

```verum
f.size() -> IoResult<Int>
f.set_len(size: Int) -> IoResult<()>
f.sync_all() -> IoResult<()>                        // fsync
f.sync_data() -> IoResult<()>                       // fdatasync
f.try_clone() -> IoResult<File>
f.as_raw_fd() -> Int

// Implements Read, Write, Seek, AsyncRead, AsyncWrite
```

### Convenience helpers (file-level)

```verum
file.read(path: &Text) -> IoResult<List<Byte>>
file.read_to_string(path: &Text) -> IoResult<Text>
file.write(path: &Text, contents: &Text) -> IoResult<()>
file.write_bytes(path: &Text, bytes: &[Byte]) -> IoResult<()>
```

### Open flag constants (POSIX-stable)

```verum
const O_RDONLY: Int = 0x0000;
const O_WRONLY: Int = 0x0001;
const O_RDWR:   Int = 0x0002;
const O_CREAT:  Int = 0x0200;
const O_EXCL:   Int = 0x0800;
const O_TRUNC:  Int = 0x0400;
const O_APPEND: Int = 0x0008;
```

Modifier bits (CREAT/EXCL/TRUNC/APPEND) are each single-bit set and
pairwise-disjoint — verified by `core-tests/io/file/property_test.vr::law_modifier_flags_pairwise_disjoint`.

---

## Buffered I/O

```verum
BufReader.new(R) -> BufReader<R>                    // default cap 8192
BufReader.with_capacity(capacity: Int, R)           // clamped to MIN=64
br.capacity() -> Int
br.get_ref() -> &R
br.get_mut() -> &mut R
br.into_inner() -> R

BufWriter.new(W) -> BufWriter<W>                    // default cap 8192
BufWriter.with_capacity(capacity: Int, W)
bw.capacity() -> Int
bw.buffer_len() -> Int                              // currently-buffered
bw.flush() -> IoResult<()>
bw.into_inner() -> Result<W, IntoInnerError<W>>

LineWriter.new(W) -> LineWriter<W>                  // flushes on '\n'

// Helpers
copy<R: Read, W: Write>(reader: &mut R, writer: &mut W) -> IoResult<Int>
read_all<R: Read>(reader: &mut R) -> IoResult<List<Byte>>

const DEFAULT_BUF_CAPACITY: Int = 8192;
const MIN_BUF_CAPACITY: Int = 64;
```

### Cursor

```verum
BufferCursor.new(inner: T) -> BufferCursor<T>
// `Cursor<T>` is an alias for `BufferCursor<T>` (see open defect §1 — alias collision with protocols.vr Cursor).
c.position() -> Int
c.set_position(pos: Int)
c.get_ref() / c.get_mut() / c.into_inner()

// For Cursor<List<Byte>>: implements Read + Write + Seek + BufRead.
```

### `FdReader`

```verum
FdReader.from_borrowed_fd(fd: Int) -> FdReader      // caller closes
FdReader.from_owned_fd(fd: Int) -> FdReader         // drop closes
r.raw_fd() -> Int

// Implements Read. Bridges to the runtime's verum_fd_read_chunk
// which honours EINTR retries internally.
```

### Idiomatic line processing (post-#io-1)

```verum
fn process_lines(path: &Path) -> IoResult<Int> {
    let f = File.open(path.as_str())?;
    let mut reader = BufReader.new(f);
    let mut count = 0;
    for line in reader.lines() {
        let line = line?;
        if line.starts_with("ERROR") { count = count + 1; }
    }
    Ok(count)
}
```

---

## Standard streams

```verum
stdin() -> Stdin
stdout() -> Stdout
stderr() -> Stderr

// Locking (currently a no-op marker — no actual mutual exclusion, see task #io-7):
stdin().lock() -> StdinLock
stdout().lock() -> StdoutLock
stderr().lock() -> StderrLock
```

### Print functions (free, no IoResult)

```verum
print(s: &Text)
println(s: &Text)
println_empty()
eprint(s: &Text)
eprintln(s: &Text)
```

### Read helpers

```verum
read_line() -> IoResult<Text>                      // newline-trimmed
read_int() -> IoResult<Int>
read_float() -> IoResult<Float>
```

---

## Path and PathBuf

`Path` is an immutable Verum value holding a `Text`; `PathBuf` is its
mutable counterpart. Both are valid UTF-8.

### Construction

```verum
Path.new(s: &Text) -> Path
Path.from_str(s: &str) -> Path                     // raw string literal

PathBuf.new() -> PathBuf
PathBuf.with_capacity(capacity: Int) -> PathBuf
PathBuf.from(s: &Text) -> PathBuf
PathBuf.from_str(s: &str) -> PathBuf
PathBuf.default() -> PathBuf                       // == new()
```

### Inspection

```verum
p.as_str() -> &Text
p.to_text() -> Text
p.to_path_buf() -> PathBuf
p.is_empty() -> Bool
p.is_absolute() -> Bool       // Unix: starts /  ; Windows: drive-letter or UNC
p.is_relative() -> Bool       // !is_absolute()
p.has_root() -> Bool          // alias for is_absolute()

p.parent() -> Maybe<Path>
p.file_name() -> Maybe<Text>
p.file_stem() -> Maybe<Text>  // file_name without extension
p.extension() -> Maybe<Text>
p.ancestors() -> Ancestors
p.components() -> Components
p.iter() -> PathIter

p.starts_with(prefix: &Path) -> Bool
p.ends_with(suffix: &Path) -> Bool                 // component-wise
p.strip_prefix(prefix: &Path) -> Maybe<Path>

p.exists() -> Bool                                 // hits fs
p.is_file() -> Bool / is_dir() / is_symlink()
```

### Mutation (PathBuf)

```verum
pb.push(component: &Path)                          // appends with separator
pb.push_str(component: &Text)
pb.pop() -> Bool                                   // returns false if at root
pb.set_file_name(name: &Text)
pb.set_extension(ext: &Text) -> Bool
pb.clear() / pb.reserve(additional: Int)
pb.capacity() -> Int
```

> **Open defect** (#io-4): `PathBuf.push` of a relative component has
> a Text-equality drift after the separator+suffix concatenation. The
> byte content is correct (length 15 for `/home/user` + `docs`), but
> direct `Text.eq` between the push-built form and the literal-built
> form fails — likely a Text invariant (small-string-inline state or
> hash cache) not preserved through the push/push_str chain via nested
> struct field access. Surgical fix landed for the length (was 28 →
> now 15); equality drift pinned in
> [`core-tests/io/path/regression_test.vr §A`](https://github.com/verum-lang/verum/blob/main/core-tests/io/path/regression_test.vr).

### `Component`

```verum
type Component is
    | Prefix(Text)              // Windows drive letter (e.g. "C:") or UNC
    | RootDir                   // leading "/" or "\\"
    | CurDir                    // "."
    | ParentDir                 // ".."
    | Normal(Text);

c.as_text() -> Maybe<&Text>     // Some for Prefix/Normal, None for the rest
c.to_text() -> Text             // RootDir → "/", CurDir → ".", etc.
```

### Canonicalisation

```verum
normalize(path: &Path) -> PathBuf   // lexical "." / ".." resolution, no fs hit
fs.canonicalize(&path) -> IoResult<PathBuf>   // resolves symlinks (hits disk)
```

### Constants

```verum
const MAIN_SEPARATOR: Char = '/';        // Unix
const MAIN_SEPARATOR: Char = '\\';       // Windows
```

---

## Filesystem operations

```verum
fs.metadata(&path) -> IoResult<Metadata>
fs.symlink_metadata(&path) -> IoResult<Metadata>     // doesn't follow symlinks
fs.exists(&path) -> Bool
fs.is_file(&path) -> Bool
fs.is_dir(&path) -> Bool
fs.is_symlink(&path) -> Bool

fs.create_dir(&path) -> IoResult<()>
fs.create_dir_all(&path) -> IoResult<()>            // like mkdir -p
fs.remove_file(&path) -> IoResult<()>
fs.remove_dir(&path) -> IoResult<()>                // must be empty
fs.remove_dir_all(&path) -> IoResult<()>            // recursive
fs.rename(&from, &to) -> IoResult<()>
fs.copy(&from, &to) -> IoResult<Int>                // returns bytes copied
fs.hard_link(&src, &dst) -> IoResult<()>
fs.symlink(&src, &dst) -> IoResult<()>
fs.read_link(&path) -> IoResult<PathBuf>
fs.canonicalize(&path) -> IoResult<PathBuf>

fs.read_dir(&path) -> IoResult<ReadDir>             // iterator of DirEntry
fs.walk_dir(&path) -> IoResult<WalkDir>             // recursive

fs.temp_dir() -> PathBuf
fs.current_dir() -> IoResult<PathBuf>
fs.set_current_dir(&path) -> IoResult<()>

fs.set_permissions(&path, perm: Permissions) -> IoResult<()>
```

### `Metadata`

```verum
m.len() -> Int
m.is_file() / m.is_dir() / m.is_symlink() -> Bool
m.file_type() -> FileType
m.permissions() -> Permissions
m.modified_secs() -> Int
m.accessed_secs() -> Int
m.created_secs() -> Int
m.is_readonly() -> Bool
```

### `FileType`

```verum
type FileType is
    | File
    | Dir
    | Symlink
    | Unknown;

ft.is_file() -> Bool
ft.is_dir() -> Bool
ft.is_symlink() -> Bool
```

> **Note** (#io-10): The 4-variant FileType collapses POSIX's 8 types
> (block / char device / fifo / socket dropped into Unknown). Consumers
> needing the full set must drop to `as_raw_fd` + libc's `S_IS*` macros.

### `Permissions` (Unix)

```verum
type Permissions is { mode: Int };

Permissions.from_mode(mode: Int) -> Permissions
p.mode() -> Int                          // bitwise-masked to PERM_MASK
p.readonly() -> Bool                     // no write bits set
p.set_readonly(readonly: Bool)
```

> **Note** (#io-11): No Windows equivalent yet.

### `DirEntry`

```verum
entry.path() -> Path
entry.file_name() -> &Text
entry.file_type() -> FileType
entry.metadata() -> IoResult<Metadata>
```

### `WalkDir`

Recursive directory traversal yields `IoResult<DirEntry>`.

---

## Processes

```verum
type Stdio is Inherit | Piped | Null;

type ExitStatus is { raw: Int };
es.success() -> Bool             // exited normally with code 0
es.is_exited() -> Bool           // WIFEXITED
es.is_signaled() -> Bool         // WIFSIGNALED
es.signal() -> Int               // 0 if not signal-terminated
es.code() -> Int                 // WEXITSTATUS, only meaningful if is_exited()

type Output is { ... };
o.stdout() -> Text
o.stderr() -> Text

type Command is { ... };          // fluent builder
type Child is { ... };
```

### Command

```verum
Command.new(program: Text) -> Command

c.arg(arg: Text) -> &mut Command
c.args(args: &[Text]) -> &mut Command
c.env(key: Text, val: Text) -> &mut Command
c.current_dir(dir: Text) -> &mut Command
c.stdout(cfg: Stdio) -> &mut Command
c.stderr(cfg: Stdio) -> &mut Command
c.stdin(cfg: Stdio) -> &mut Command

c.output() -> Result<Output, Text>
c.status() -> Result<ExitStatus, Text>
c.spawn() -> Result<Child, Text>
```

> **Open defect** (#io-13): `Command` returns `Result<_, Text>` not
> `IoResult<_>` — drops structured `IoErrorKind` information that the
> rest of `core.io` carries. Migrate to `IoResult<T>` in a future
> release.

### Child

```verum
child.id() -> Int
child.wait() -> Result<ExitStatus, Text>
child.write_stdin(data: &[Byte]) -> Result<Int, Text>
child.close_stdin() -> &mut Self
child.signal(sig: Int) -> Result<(), Text>
child.kill() -> Result<(), Text>           // SIGKILL
child.terminate() -> Result<(), Text>      // SIGTERM
```

### Run convenience

```verum
run(cmd: Text) -> IoResult<Output>
```

---

## I/O engine (async multiplexer)

Platform-native async I/O via `kqueue` (macOS/BSD), `epoll` (Linux),
or IOCP (Windows). Used internally by `core.net.*` and the long-term
async I/O routing path.

```verum
type IoEngine is { handle: Int };
type IoEvent is { flags: Int };

const IO_ENGINE_DEFAULT_CAPACITY: Int = 256;
const IO_ENGINE_MAX_CAPACITY: Int = 65536;
const IO_ENGINE_MAX_POLL_EVENTS: Int = 4096;

IoEngine.new() -> IoEngine
IoEngine.with_capacity(capacity: Int) -> IoEngine

IoEvent.Read() -> IoEvent           // flags = 1
IoEvent.Write() -> IoEvent          // flags = 2
IoEvent.ReadWrite() -> IoEvent      // flags = 3 = Read | Write

e.register(fd: Int, event: IoEvent) -> Int
e.deregister(fd: Int) -> Int
e.modify(fd: Int, event: IoEvent) -> Int
e.poll(max: Int, timeout_ns: Int) -> Int
e.is_ready(fd: Int, event: IoEvent) -> Bool
e.take_ready(fd: Int, event: IoEvent) -> Bool
e.destroy()
e.is_valid() -> Bool
```

---

## Utility types (in `protocols.vr`)

```verum
type EmptyReader is ();              // always 0 bytes
type ByteRepeat is { byte: Byte };   // forever returns the given byte
type Sink is ();                     // writer that discards all input
type Cursor<T> is { inner: T, pos: Int };  // in-memory Read/Write/Seek

empty_reader() -> EmptyReader
repeat_byte(byte: Byte) -> ByteRepeat
sink() -> Sink
```

> **Open defect** (#io-2): `Cursor<T>` is also defined in `buffer.vr`
> via the alias `Cursor<T> = BufferCursor<T>`. First-wins resolution
> at the mount site silently picks one definition over the other.
> Tactical fix: import directly from one specific path.

### Adapter readers

```verum
type Chain<T: Read, U: Read> is { ... };   // T fully, then U
type Take<T: Read> is { inner: T, limit: Int };

t.limit() -> Int
t.set_limit(limit: Int)
t.get_ref() / t.get_mut() / t.into_inner()
```

### Iterators

```verum
type BytesIter<R: Read>;             // Iterator<IoResult<Byte>>
type LinesIter<R: BufRead>;          // Iterator<IoResult<Text>>
type SplitIter<R: BufRead>;          // Iterator<IoResult<List<Byte>>>
```

---

## Open defects

The following defect classes are tracked in `core-tests/io/<sub>/audit.md`:

| Tag | Title | Scope |
|---|---|---|
| #io-1 | Mount-scope-aware `lookup_function` for method dispatch | VBC codegen 3-5 days; gates Read/Write/Seek/BufRead method dispatch on protocols.vr-defined types |
| #io-2 | Deduplicate `Cursor<T>` between protocols.vr and buffer.vr | stdlib refactor 0.5 day after #io-1 |
| #io-4 | `PathBuf.push` Text-equality drift via nested struct field | partial surgical fix landed; deeper VBC codegen work 2-3 days |
| #io-5 | `Path.file_name` trailing-separator char-byte hazard | stdlib 0.5 day |
| #io-7 | Real exclusive locking for `Stdin.lock` / `Stdout.lock` / `Stderr.lock` | stdlib 1-2 days |
| #io-8 | Temp-dir / fixture harness in core-tests | infra 1 day |
| #io-9 | Windows open-flag mapping (O_BINARY etc.) | stdlib 0.5 day |
| #io-10 | Decide POSIX 8-type FileType expansion | API design |
| #io-11 | Permissions implementation for Windows | stdlib 1-2 days |
| #io-12 | `Output.stdout_bytes` / `stderr_bytes` raw accessors | stdlib 0.5 day |
| #io-13 | Migrate `Command.{spawn,output,status}` to `IoResult<T>` | stdlib 1 day |
| #io-14 | Full 32-bit Windows exit code in `ExitStatus` | stdlib 0.5 day |
| #io-15 | Real async I/O via io_uring / kqueue / IOCP | core.io.engine 1-2 weeks |
| #io-16 | Sandboxed `IoEngine` test harness | infra 1 day |

---

## Cross-references

- **[net](/docs/stdlib/net)** — TCP/UDP sockets implement `Read`/`Write`/`AsyncRead`/`AsyncWrite`.
- **[async](/docs/stdlib/async)** — the executor driving async I/O.
- **[text](/docs/stdlib/text)** — parsing / formatting text read from files.
- **[sys](/docs/stdlib/sys)** — V-LLSI syscalls underlying `fs.*`.
