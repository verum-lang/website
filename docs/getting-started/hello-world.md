---
sidebar_position: 2
title: Hello, World
description: Your first Verum program — the canonical print, a refinement type, and SMT in action.
---

# Hello, World

This is a five-minute exercise. By the end, you will have:

- Created a project.
- Run a Verum program.
- Seen refinement types and the SMT solver in action.
- Understood the shape of a typical Verum file.

**Prerequisite:** [Installation](/docs/getting-started/installation) —
you need `verum --version` to work.

## Create a project

```bash
$ verum new hello
  created hello/
    ├── Verum.toml
    └── src/
        └── main.vr
$ cd hello
```

`verum new <name>` generates a minimum scaffold. The manifest
(`Verum.toml`) is where the cog (package) name, version, and
dependencies live; see
[Project Structure](/docs/getting-started/project-structure).

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
   A function that wanted to print without declaring `IO` would be
   rejected by the compiler.
2. **`print` is a function**, not a macro. No `!`, no `println!`. See
   [reference/builtins](/docs/reference/builtins) for the full list of
   built-ins.

## Build and run

```bash
$ verum run
   compiling hello v0.1.0 (./hello)
    finished in 0.4s
     running target/debug/hello
Hello, World!
```

`verum run` compiles and executes. For a release build:

```bash
$ verum build --release
$ ./target/release/hello
Hello, World!
```

The release build enables LLVM optimisations (`O3`, LTO), removes
debug-only assertions, and strips the binary. Expect it to be about
40× smaller and 5-10× faster than the debug version on real code.

## Play with a format string

Format strings use `f"..."`:

```verum
fn main() using [IO] {
    let name = "Verum";
    let version = 1;
    print(f"Hello, {name} v{version}!");
}
```

Output:

```
Hello, Verum v1!
```

Splicing inside `f"..."` runs type-checking on each expression;
`{name}` and `{version}` are both inferred and converted with their
`Display` implementations. See
[language/tagged-literals](/docs/language/tagged-literals) for the
full format literal grammar, including `{value:04}`-style format
specs.

## Adding a refinement type

Refinement types attach a predicate to a type. Every value must
satisfy it — checked at compile time.

Update `src/main.vr`:

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

`Greeting` is a `Text` constrained by a refinement predicate.
`greet` is required to return a `Greeting` — the compiler must
prove that every return path satisfies
`!self.is_empty() && self.len() < 100`.

For this case — a literal `"Hello, "` concatenated with any short
name — the SMT solver discharges the obligation trivially, and
**no runtime check is emitted**.

## Seeing the compiler reject an impossible contract

Change the bound to `self.len() < 10` and rebuild:

```verum
type Greeting is Text { !self.is_empty() && self.len() < 10 };
```

```bash
$ verum build
error[V3402]: postcondition violated
  --> src/main.vr:4:10
   |
 4 |     let msg = f"Hello, {name}!";
   |               ^^^^^^^^^^^^^^^^^ may exceed Greeting's length bound
   |
note: counter-example found by Z3
   |   name = "WorldXXXXXXX"
   |   result = "Hello, WorldXXXXXXX!"   // len() == 18, bound is < 10
   = help: widen the bound or shorten the input
```

The compiler found a **counter-example** — an input where the
refinement would be violated — and rejected the build. No runtime
test would catch that; the bug is prevented before the binary
exists.

Undo the change and rebuild to continue.

## Adding a test

Create `tests/greet_test.vr`:

```verum
mount hello.*;

@test
fn greet_returns_non_empty() {
    let result = greet("Verum");
    assert(!result.is_empty());
    assert(result.len() < 100);
}

@test
fn greet_includes_name() {
    let result = greet("Alice");
    assert(result.contains("Alice"));
}
```

Run tests:

```bash
$ verum test
   compiling hello v0.1.0 (./hello)
    finished in 0.2s
     running 2 tests
test greet_returns_non_empty ... ok
test greet_includes_name ... ok

test result: ok. 2 passed; 0 failed
```

`@test` marks a function as a test. Tests run in parallel by default;
see [tooling/cli](/docs/tooling/cli) for test filtering and options.

## What you just did

You:

- Created a project with `verum new`.
- Called a function with an explicit `IO` context.
- Wrote a refinement-type-checked function.
- Saw the SMT solver find a counter-example.
- Wrote and ran tests.

That is the whole shape of day-to-day Verum. Every program:

1. Declares its effects in the function signatures.
2. Attaches invariants to types (refinements) and to functions
   (`requires` / `ensures`).
3. Lets the compiler verify what the static checker can prove;
   SMT discharges the rest.
4. Falls back to runtime assertions only where proofs are not yet
   written.

## Next

- **[Language Tour](/docs/getting-started/tour)** — the rest of the
  language in ten minutes.
- **[Project Structure](/docs/getting-started/project-structure)** —
  `Verum.toml`, modules, cog packages, workspace layout.
- **[Typed CLI tool tutorial](/docs/tutorials/cli-tool)** — build a
  small, real program from scratch (30 min).
- **[Philosophy](/docs/philosophy/principles)** — the six design
  principles that shape every Verum decision.
