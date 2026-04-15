---
sidebar_position: 1
title: io
---

# `core::io` — Files, paths, stdio, processes

## Protocols

```verum
type Read  is protocol { fn read(&mut self, buf: &mut [Byte]) -> IoResult<Int>; };
type Write is protocol { fn write(&mut self, buf: &[Byte]) -> IoResult<Int>;
                          fn flush(&mut self) -> IoResult<()>; };
type Seek  is protocol { fn seek(&mut self, pos: SeekFrom) -> IoResult<UInt64>; };

// Async variants
type AsyncRead, AsyncWrite, AsyncBufRead
```

## `File` and `OpenOptions`

```verum
let f = File::open("data.txt")?;
let f = OpenOptions::new()
    .read(true).write(true).create(true).truncate(false)
    .open("log.txt")?;

let bytes = fs::read("config.toml")?;       // returns List<Byte>
let text  = fs::read_to_string("a.txt")?;   // returns Text
fs::write("out.txt", &bytes)?;
```

## Buffered I/O

```verum
let reader = BufReader::new(File::open("big.txt")?);
for line in reader.lines() {
    process(&line?);
}

let mut writer = BufWriter::new(File::create("out.txt")?);
writer.write_all(&data)?;
writer.flush()?;
```

## Paths

```verum
let p: Path = Path::from("/usr/local/bin/verum");
p.file_name();           // Maybe.Some("verum")
p.extension();           // Maybe.None
p.parent();              // Maybe.Some("/usr/local/bin")
p.join("sub");           // "/usr/local/bin/verum/sub"
p.is_absolute();
p.exists();              // uses Io context
```

## Filesystem

```verum
fs::metadata(path)   -> IoResult<Metadata>
fs::create_dir(path) -> IoResult<()>
fs::create_dir_all(path)
fs::remove_file(path)
fs::remove_dir(path)
fs::remove_dir_all(path)
fs::rename(from, to)
fs::copy(from, to)    -> IoResult<Int>     // bytes copied
fs::canonicalize(p)   -> IoResult<PathBuf>
fs::read_dir(path)    -> IoResult<ReadDir>
fs::walk_dir(path)    -> IoResult<WalkDir>
```

## Standard streams

```verum
let mut out = stdout();
out.write_all(b"hello\n")?;

for line in stdin().lock().lines() { ... }

eprint("error: ");
eprintln("something happened");
```

## Process

```verum
let output = Command::new("ls")
    .arg("-la")
    .arg("/tmp")
    .output()?;

if output.status.success() {
    print(Text::from_utf8(&output.stdout)?);
}

// Streaming
let mut child = Command::new("grep")
    .arg("TODO")
    .stdin(Stdio.Piped)
    .stdout(Stdio.Piped)
    .spawn()?;

child.stdin.take()?.write_all(input)?;
let result = child.wait_with_output()?;
```

## Errors

```verum
type StreamError is { kind: IoErrorKind, message: Text };
type IoErrorKind is
    | NotFound
    | PermissionDenied
    | Interrupted
    | UnexpectedEof
    | WouldBlock
    | TimedOut
    | ... ;
type IoResult<T> = Result<T, StreamError>;
```

## Utility types

`Empty`, `Sink`, `ByteRepeat` — mock readers/writers.
`Cursor<&[Byte]>` — in-memory `Read + Write + Seek`.
`Chain<R1, R2>`, `Take<R>` — reader adapters.
`LinesIter`, `BytesIter` — line / byte iterators.

## See also

- **[async](/docs/stdlib/async)** — async I/O variants.
- **[net](/docs/stdlib/net)** — network I/O.
- **[text](/docs/stdlib/text)** — `Text`, `Char`, parsing.
