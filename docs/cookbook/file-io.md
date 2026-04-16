---
title: Read a file, line by line
description: Open a file, iterate lines lazily, handle errors.
---

# Read a file, line by line

```verum
fn count_errors(path: &Path) -> IoResult<Int> using [IO] {
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

### Variations

**Read the whole file at once** (simpler, uses more memory):

```verum
let bytes = fs::read(path)?;
let text  = Text.from_utf8(&bytes)?;
```

**Text convenience**:

```verum
let text = fs::read_to_string(path)?;
for line in text.lines() { ... }                          // &Text slices
```

**Async**:

```verum
async fn count_errors_async(path: &Path) -> IoResult<Int> using [IO] {
    let file = File.open_async(path).await?;
    let mut reader = BufReader.new(file);
    let mut count = 0;
    while let Maybe.Some(line) = reader.next_line_async().await? {
        if line.starts_with("ERROR") { count += 1; }
    }
    Result.Ok(count)
}
```

**Large files** — prefer `BufReader` over `read_to_string` to avoid
loading everything into memory. Default buffer is 8 KiB; tune via
`BufReader.with_capacity(64 * 1024, file)` for sequential workloads.

### Writing

```verum
let mut w = BufWriter.new(File.create(path)?);
for record in &records {
    w.write_all(record.to_text().as_bytes())?;
    w.write_all(b"\n")?;
}
w.flush()?;                                               // don't forget!
```

### Pitfall — forgetting to flush

`BufWriter` drops also flush, but **swallow the error**. For critical
writes, call `.flush()?` explicitly so a failure propagates.

### See also

- **[io](/docs/stdlib/io)** — `Read`, `Write`, `BufRead`.
- **[text](/docs/stdlib/text)** — `Text.from_utf8`, line iteration.
