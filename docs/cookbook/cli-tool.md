---
title: Building a CLI tool
description: Arguments, subcommands, config, error reporting.
---

# Building a CLI tool

### Minimal

:::note `env.args()` does not compile today — the API is right, the name resolution is not

`env` refers to `core.base.env`, which declares `args() -> List<Text>`,
and that is the intended way to read command-line arguments. The bare
`env` identifier currently resolves to an unrelated compiler-internal
context method instead of the module, so the line below fails to
compile as written. The same note appears on the
[CLI tutorial](/docs/tutorials/cli-tool).

Until that is fixed, this compiles and does the same thing:

```verum
mount core.shell.script.{args};
let argv = args();
```

:::

```verum
fn main() {
    let argv = env.args();
    match argv.get(1) {
        Maybe.Some(first) => {
            if first == "--help" || first == "-h" {
                print_help();
            } else {
                greet(&first);
            }
        }
        Maybe.None => print_help(),
    }
}

fn greet(name: &Text) {
    print(f"Hello, {name}!");
}

fn print_help() {
    print("usage: greet <name>");
}
```

### With subcommands

```verum
type Command is
    | Build { release: Bool, target: Maybe<Text> }
    | Test  { filter: Maybe<Text> }
    | Version;

fn parse_args(args: &List<Text>) -> Result<Command, Error> {
    match args.get(1).map(|s| s.as_str()) {
        Maybe.Some("build") => {
            let mut release = false;
            let mut target = Maybe.None;
            for a in args.iter().skip(2) {
                match a.as_str() {
                    "--release"              => release = true,
                    s if s.starts_with("--target=")
                        => target = Maybe.Some(s[9..].to_string()),
                    _ => return Result.Err(Error.new(&f"unknown flag {a}")),
                }
            }
            Result.Ok(Command.Build { release, target })
        }
        Maybe.Some("test") => {
            let filter = args.get(2).cloned();
            Result.Ok(Command.Test { filter })
        }
        Maybe.Some("version") => Result.Ok(Command.Version),
        Maybe.Some(c) => Result.Err(Error.new(&f"unknown command: {c}")),
        Maybe.None    => Result.Err(Error.new(&"no command given")),
    }
}

fn main() {
    match parse_args(&env.args()).and_then(dispatch) {
        Result.Ok(()) => (),
        Result.Err(e) => { eprintln(&f"error: {e}"); env.exit(1); }
    }
}
```

### Reading config files

```verum
fn load_config() -> Result<Config, Error> {
    let home = env.home_dir().unwrap_or(Text.from("."));
    let path = match env.var_opt(&Text.from("MYTOOL_CONFIG")) {
        Some(p) => p,
        None    => f"{home}/.mytool/config.toml",
    };

    match fs.read_to_string(&Path.from(&path)) {
        Result.Ok(text) => toml_parse(&text).map_err(Error.from),
        Result.Err(e) if e.kind == IoErrorKind.NotFound => Result.Ok(Config.default()),
        Result.Err(e) => Result.Err(Error.from(e)),
    }
}
```

Notes:

- Verum has no `format!` macro — string interpolation uses the
  `f"..."` literal.
- `Maybe<T>` (the `Option`-equivalent) deconstructs through `match`,
  not Rust-style `.unwrap_or_else(closure)`. Use `.unwrap_or(default)`
  for an eager default value.

### Coloured error output

```verum
mount term.style.{Color, Style};

fn report_error(e: &Error) {
    let red = Style.new().fg(Color.Red).add_modifier(Modifier.Bold);
    eprint(&red.paint(&"error: "));
    eprintln(&e.to_string());
    for src in e.chain().skip(1) {
        eprintln(&f"  caused by: {src}");
    }
}
```

### Exit codes

```verum
fn main() {
    match run() {
        Result.Ok(())                                  => env.exit_success(),
        Result.Err(e) if e.is_user_error()             => { report_error(&e); env.exit(1); }
        Result.Err(e) if e.is_config_error()           => { report_error(&e); env.exit(78); }  // sysexits EX_CONFIG
        Result.Err(e)                                  => { report_error(&e); env.exit(1); }
    }
}
```

### Progress bars & spinners

```verum
mount term.widget.{Spinner, SpinnerFrames};

async fn slow_task() {
    let mut spin = Spinner.new().frames(&SpinnerFrames.Dots);
    spin.start(&"loading");
    let result = heavy_compute().await;
    spin.stop(&f"done in {result.elapsed:?}");
}
```

### See also

- **[base → env](/docs/stdlib/base)** — CLI args, env vars, paths.
- **[io → process](/docs/stdlib/io)** — running external commands.
- **[term](/docs/stdlib/term)** — colours, spinners, full TUI.
