---
sidebar_position: 2
title: Build a typed CLI tool
description: Parse arguments, read a config file, generate output — with tests.
---

# Build a typed CLI tool

**Time: 30 minutes. Prerequisites: [Hello, World](/docs/getting-started/hello-world).**

We'll build `wordcount` — counts lines, words, bytes in input files,
with flags, a configurable output format, tests, and a bench.

## 1. Scaffold

```bash
$ verum new wordcount
$ cd wordcount
```

`verum.toml`:

```toml
[cog]
name = "wordcount"
version = "0.1.0"
edition = "2026"
profile = "application"
```

## 2. Parse arguments

Replace `src/main.vr`:

```verum
type OutputFormat is Text | Json | Csv;

type Args is {
    paths: List<Text>,
    format: OutputFormat,
    show_help: Bool,
};

fn parse_args(argv: &List<Text>) -> Result<Args, Text> {
    let mut paths = list![];
    let mut format = OutputFormat.Text;
    let mut show_help = false;

    let mut i = 1;
    while i < argv.len() {
        match argv[i].as_str() {
            "-h" | "--help"   => show_help = true,
            "--json"          => format = OutputFormat.Json,
            "--csv"           => format = OutputFormat.Csv,
            s if s.starts_with("--format=") => {
                match &s[9..] {
                    "text" => format = OutputFormat.Text,
                    "json" => format = OutputFormat.Json,
                    "csv"  => format = OutputFormat.Csv,
                    f      => return Result.Err(f"unknown format: {f}".to_string()),
                }
            }
            s if s.starts_with("-")  => return Result.Err(f"unknown flag: {s}".to_string()),
            s                         => paths.push(s.to_string()),
        }
        i += 1;
    }
    Result.Ok(Args { paths, format, show_help })
}
```

## 3. Count

```verum
type Counts is { lines: Int, words: Int, bytes: Int, path: Text };

fn count_one(path: &Path) -> IoResult<Counts> {
    let text = fs.read_to_string(path)?;
    let bytes = text.len();
    let lines = text.lines().count();
    let words = text.split_whitespace().count();
    Result.Ok(Counts { lines, words, bytes, path: path.as_text().to_string() })
}

fn count_all(paths: &List<Text>) -> IoResult<List<Counts>> {
    let mut out = list![];
    for p in paths {
        let path = Path.from(p);
        out.push(count_one(&path)?);
    }
    Result.Ok(out)
}
```

## 4. Format output

```verum
fn format_counts(counts: &List<Counts>, fmt: OutputFormat) -> Text {
    match fmt {
        OutputFormat.Text => {
            let mut s = Text.with_capacity(256);
            for c in counts {
                s.push_str(&f"{c.lines:>6} {c.words:>6} {c.bytes:>8}  {c.path}\n");
            }
            s
        }
        OutputFormat.Csv => {
            let mut s = "path,lines,words,bytes\n".to_string();
            for c in counts {
                s.push_str(&f"{c.path},{c.lines},{c.words},{c.bytes}\n");
            }
            s
        }
        OutputFormat.Json => {
            let mut s = "[\n".to_string();
            for (i, c) in counts.iter().enumerate() {
                let sep = if i + 1 == counts.len() { "" } else { "," };
                s.push_str(&f"  {{\"path\": \"{c.path}\", \"lines\": {c.lines}, \"words\": {c.words}, \"bytes\": {c.bytes}}}{sep}\n");
            }
            s.push_str("]\n");
            s
        }
    }
}
```

## 5. Main

```verum
fn print_help() {
    print(&"usage: wordcount [--format=text|json|csv] FILE...\n");
}

fn main() {
    let argv = env.args();
    let args = match parse_args(&argv) {
        Result.Ok(a) => a,
        Result.Err(e) => { eprint(&f"error: {e}"); exit(2); }
    };

    if args.show_help { print_help(); return; }
    if args.paths.is_empty() { print_help(); exit(2); }

    match count_all(&args.paths) {
        Result.Ok(counts) => print(&format_counts(&counts, args.format)),
        Result.Err(e) => { eprint(&f"error: {e}"); exit(1); }
    }
}
```

## 6. Run it

```bash
$ echo "hello world\nsecond line" > /tmp/a.txt
$ verum run -- /tmp/a.txt
     2      4       22  /tmp/a.txt

$ verum run -- --json /tmp/a.txt
[
  {"path": "/tmp/a.txt", "lines": 2, "words": 4, "bytes": 22}
]
```

## 7. Add tests

```verum
@cfg(test)
module tests {
    use .super.*;

    @test
    fn parses_format_flag() {
        let args = parse_args(&list!["prog".to_string(), "--json".to_string(), "a.txt".to_string()])
            .expect("should parse");
        assert(args.format is OutputFormat.Json);
        assert_eq(args.paths.len(), 1);
    }

    @test
    fn counts_simple_file() {
        let tmp = Path.from(&env.temp_dir()).join(&Path.from("wc_test.txt"));
        fs.write_text(&tmp, &"hello world\nfoo bar baz").unwrap();
        let c = count_one(&tmp).unwrap();
        assert_eq(c.lines, 2);
        assert_eq(c.words, 5);
        fs.remove_file(&tmp).ok();
    }

    @test
    fn formats_csv_header() {
        let counts = list![Counts { lines: 1, words: 2, bytes: 10, path: "x".to_string() }];
        let out = format_counts(&counts, OutputFormat.Csv);
        assert(out.starts_with("path,lines,words,bytes\n"));
    }
}
```

```bash
$ verum test
   running 3 tests
   test tests.parses_format_flag      ... ok
   test tests.counts_simple_file      ... ok
   test tests.formats_csv_header      ... ok
   all 3 tests passed
```

## 8. Benchmark

```verum
@cfg(bench)
module benches {
    use .super.*;
    use core.runtime.Bencher;

    @bench
    fn bench_count_1kb(b: &mut Bencher) {
        let tmp = Path.from(&env.temp_dir()).join(&Path.from("bench.txt"));
        fs.write_text(&tmp, &"lorem ipsum ".repeat(80)).unwrap();
        b.iter(|| count_one(&tmp).unwrap());
        fs.remove_file(&tmp).ok();
    }
}
```

```bash
$ verum bench
   bench_count_1kb    ... 12,450 ns/iter  (+/- 430)
```

## 9. Ship it

```bash
$ verum build --release
$ cp target/release/wordcount ~/bin/
```

## What you learned

- Parsing flags by hand (for small tools; use a cog for complex CLIs).
- Built-ins like `print` used directly in `count_one` and
  `format_counts` — no `using` clause needed for standard output.
- `@cfg(test)` and `@cfg(bench)` modules co-located with code.
- `fs.read_to_string`, `text.split_whitespace().count()`,
  `text.lines().count()`.
- Format specs in `f"{c.lines:>6}"` for aligned output.

## Next

- **[A verified data structure](/docs/tutorials/verified-data-structure)** —
  add `@verify(formal)` proofs to a stateful type.
- **[Cookbook → cli-tool](/docs/cookbook/cli-tool)** — subcommands,
  coloured errors, spinners.
