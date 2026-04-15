---
sidebar_position: 2
title: Hello, World
---

# Hello, World

## Create a project

```bash
$ verum new hello
  created hello/
    ├── Verum.toml
    └── src/
        └── main.vr
$ cd hello
```

## The default program

`src/main.vr`:

```verum
fn main() using [IO] {
    print("Hello, World!");
}
```

Two things are worth noticing:

1. **`using [IO]`** — printing to stdout is an effect, and effects are
   typed. `main` requests the `IO` context; the runtime provides it.
2. **`print` is a function**, not a macro. No `!`, no `println!`.

## Build and run

```bash
$ verum run
   compiling hello v0.1.0 (./hello)
    finished in 0.4s
     running target/debug/hello
Hello, World!
```

`verum run` compiles and executes. For release builds:

```bash
$ verum build --release
$ ./target/release/hello
Hello, World!
```

## Adding a refinement type

Modify `src/main.vr`:

```verum
type Greeting is Text { !self.is_empty() && self.len() < 100 };

fn greet(name: Text) -> Greeting using [IO] {
    let msg = f"Hello, {name}!";
    print(msg);
    msg
}

fn main() using [IO] {
    greet("World");
    greet("Verum");
}
```

`Greeting` is a `Text` constrained by a refinement. `greet` is required
to return a `Greeting` — the compiler must prove that every return path
satisfies `!self.is_empty() && self.len() < 100`. For a literal `"Hello, "`
concatenated with a short name, this is trivial; Z3 discharges the
obligation at compile time and no runtime check is emitted.

Try changing the bound to `self.len() < 10` and rebuilding. The
compiler will reject the function:

```
error[V3402]: postcondition violated
  --> src/main.vr:4:10
   |
 4 |     let msg = f"Hello, {name}!";
   |               ^^^^^^^^^^^^^^^^^ may exceed Greeting's length bound
   |
note: counter-example found by Z3
   |   name = "WorldXXXXXXX"
   |   result = "Hello, WorldXXXXXXX!"  // len() == 18, bound is < 10
   = help: widen the bound or shorten the input
```

## What you just did

- Created a project with `verum new`.
- Called a function with an explicit `IO` context.
- Wrote a refinement-type-checked function.
- Saw the SMT solver reject an impossible contract.

That is the whole shape of day-to-day Verum.

## Next

- **[Language Tour](/docs/getting-started/tour)** — the rest of the
  language in ten minutes.
- **[Project Structure](/docs/getting-started/project-structure)** —
  `Verum.toml`, modules, `cog` packages.
