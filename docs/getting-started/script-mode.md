---
sidebar_position: 5
title: Script mode
description: Single-file Verum scripts via `#!` shebang — top-level statements, exit-code propagation, and the three-mode contract that keeps interpreter, AOT, and script invocations unambiguous.
---

# Script mode

Most languages force a choice: a small shell-grade scripting tool
(`bash`, `python`, `awk`) for one-shot work, or a full project
toolchain (Rust, Go, Java) when correctness and types matter.
Verum collapses that choice. The same compiler that runs your
verified, refinement-typed cog with SMT-checked contracts can also
boot a single `.vr` file with a shebang in milliseconds, no
`verum.toml`, no `fn main()`, no boilerplate — and that file gets
**the same type system, the same memory model, the same standard
library** as a production binary.

This page is the source-of-truth for what script mode does, how
to write a Verum script today, and the precise contract the
parser, CLI, and runtime enforce.

---

## The three execution modes

Verum has exactly three ways to execute a `.vr` source. The
distinction is structural — driven by what's in the file and how
you invoke `verum` — and the CLI enforces it strictly so the
mental model never blurs.

| Mode | When | Invocation | Required source signal |
|---|---|---|---|
| **Interpreter** | Fast iteration on a `fn main()` program | `verum run file.vr [-- args…]` | `fn main()` (sync or async) |
| **AOT** | Production binary, native speed | `verum run --aot file.vr` *or* `verum build` | `fn main()` |
| **Script** | One-shot tool, shell pipeline, scratch experiment | `verum file.vr [args…]` *or* `./file.vr` | `#!` shebang at byte 0 |

The shebang line is **the** signal that distinguishes a script
from a library/binary source. A `.vr` file without a shebang must
be invoked through `verum run`; trying the bare shorthand on it
surfaces a precise advisory:

```text
$ verum hello.vr
error: `hello.vr` looks like a Verum source file but is missing a `#!` shebang line.

The bare `verum hello.vr` shorthand is reserved for **scripts**, which must
declare a shebang at byte 0 (e.g. `#!/usr/bin/env verum`). Choose one of:

  • Run as a library/binary entry point:  verum run hello.vr
  • Convert to a script:                  add `#!/usr/bin/env verum` as the first line
```

The advisory fires before any subcommand dispatch, so a
mistyped invocation gets a one-line fix instead of a confusing
"unknown subcommand" error.

---

## Your first script

Save this as `hello.vr` and make it executable:

```verum
#!/usr/bin/env verum
print("hello from Verum");
```

```bash
chmod +x hello.vr
./hello.vr            # via OS shebang exec
verum hello.vr        # bare invocation
verum run hello.vr    # explicit form, also works
```

All three forms produce identical output. The kernel-level
shebang exec on Unix and the bare `verum hello.vr` shorthand both
end at the same script entry inside the compiler.

### What happens behind the scenes

When the source begins with `#!` (BOM-tolerant — editors that
prepend a UTF-8 BOM are accepted), the compiler accepts top-level
statements alongside the usual declarations and wraps them in an
implicit entry function. Every later phase — type checking,
refinement verification, memory analysis, codegen — treats the
script identically to a regular `fn main()` program. Script mode
is a single signal at the top of the file; everything downstream
runs through the same compiler that builds your binaries.

---

## Top-level statements

Inside script mode, statements that would be parse errors at the
module level of a library are accepted. The full set:

```verum
#!/usr/bin/env verum

// 1. let-bindings — Python-style locals scoped to the wrapper.
let greeting = "hello";
let target = "world";

// 2. Expression statements — call any function, print, etc.
print(f"{greeting}, {target}!");

// 3. defer / errdefer — RAII cleanup at script end.
defer print("(cleanup ran)");

// 4. Mixed with top-level decls — declared here, called below.
fn shout(s: Text) -> Text {
    return s.to_uppercase();
}

print(shout("done"));
```

Source order is preserved verbatim: items appear before the
wrapper in the AST, but the wrapper's body holds statements in
the exact order you wrote them, so a `let x = …` references the
`fn` declared above it without any extra ceremony.

A non-script `.vr` file (no shebang) does **not** accept these
top-level forms — `let user = "x"` would parse as the
library-mode constant shorthand, and `print(user); defer
cleanup()` would fail because they are not declarations. The
strict shebang requirement keeps the two grammars unambiguous so
the same file never silently flips between modes.

---

## Exit codes

The unique payoff of script mode meeting Verum's type system is
that **a script's value is its exit code**. Three rules cover
every case:

### Rule 1 — tail expression becomes the exit code

If the last top-level statement is an expression *without* a
trailing semicolon, the parser lifts it into the wrapper's
tail-position and returns its value. An `Int` value is the
process exit status:

```verum
#!/usr/bin/env verum
print("doing work");
42
```

```bash
$ ./script.vr; echo "exit=$?"
doing work
exit=42
```

Standard Verum block-as-expression semantics — the same rule
that makes `fn f() -> Int { print("x"); 7 }` return 7 — applied
to the implicit script wrapper. No new syntax, no `return`
gymnastics, no special-cased "last value" heuristic.

### Rule 2 — `Bool` follows Unix convention

A `Bool` tail value maps to Unix exit-code convention: `true` →
0 (success), `false` → 1 (failure):

```verum
#!/usr/bin/env verum
let ok = check_thing();
ok    // exit 0 if check_thing() returned true, 1 otherwise
```

### Rule 3 — anything else is success

`Unit` (`()`), `Nil`, `Float`, `Text`, objects, pointers — none
have exit-code semantics. The script exits 0 unless something
panicked or returned a non-zero `Int`/`false`. So a script that
just prints things finishes successfully:

```verum
#!/usr/bin/env verum
print("done");        // exit 0
```

### Tier-parity with `fn main()`

The same propagation kicks in when an explicit `fn main() -> Int`
runs under the interpreter — its return value becomes the exit
code, matching what AOT compilation produces (where the C
runtime takes `main`'s return value as `_exit`'s argument). So:

```verum
fn main() -> Int {
    print("checking…");
    if check_failed() { return 2; }
    return 0;
}
```

```bash
$ verum run main.vr; echo "exit=$?"
checking…
exit=2
```

The interpreter and AOT paths produce identical exit codes —
divergence between Tier 0 and Tier 1 is a hard contract
violation.

---

## Arguments

A script that needs command-line arguments declares an explicit
`fn main(args: List<Text>) -> Int` alongside its top-level
work. When both an explicit `main` and top-level statements are
present, `main` is the entry point:

```verum
#!/usr/bin/env verum

fn main(args: List<Text>) -> Int {
    if args.len() < 2 {
        eprintln("usage: greet.vr <name>");
        return 2;
    }
    print(f"hello, {args[1]}!");
    return 0;
}
```

```bash
$ ./greet.vr Alice
hello, Alice!
$ ./greet.vr; echo "exit=$?"
usage: greet.vr <name>
exit=2
```

---

## Why scripts in a verified language

Most "scripting" languages are dynamic for a reason: they
prioritise iteration speed over correctness. Verum's bet is that
those two are not actually in tension if the type system is
inferred enough, the cold-start latency is small enough, and the
compiler is incremental enough.

Concretely, a Verum script gets:

- **Refinement types.** `let port: Int{1024..=65535} = …` is
  checked at script load. A wrong literal fails before the
  process does any I/O.
- **Memory safety.** Three-tier CBGR (Cycle-Breaking Generation
  References). Default `&T` has ~15 ns runtime overhead;
  `&checked T` is compile-time-proven safe and zero-cost. A
  shell-replacement script gets the same `O(1)` no-leak guarantee
  as a long-lived service.
- **Effect-tracking.** The function's return type already says
  whether it can fail, allocate, or perform I/O. A script that
  crosses an unexpected effect boundary fails at compile time,
  not three minutes into a deploy.
- **The full standard library.** HTTP clients, SQLite, JSON,
  concurrency nurseries — the primitives that make a binary
  worth shipping are also what make a 30-line script worth
  keeping.
- **The same SMT solver.** Add `@verify(formal)` to a function
  inside a script and the same Z3/CVC5 routing that audits a
  protocol library checks the script's contracts.

The cost of script mode for users who don't use it is **zero**.
A `.vr` file without a shebang compiles exactly as it would
have before script mode existed, and a script-mode source
containing only declarations produces no wrapper.

---

## The contract

The invariants you can rely on:

1. **The `#!` shebang at byte 0 is the only script signal.**
   Not the `.vr` extension, not a directory layout convention.
   Either the first two bytes are `#!` (or `EF BB BF` BOM
   followed by `#!`) or the file is a regular library/binary
   source.

2. **`fn main()` always wins.** A script that also declares
   `fn main()` uses `main` as the entry point. This lets you
   graduate a script to a regular binary without rewriting it
   — keep the shebang or remove it, the program runs the same
   way.

3. **Pure-library sources are unaffected.** A `.vr` file
   without a shebang and without top-level statements compiles
   exactly as it always has, with no extra wrapper or runtime
   cost.

4. **Missing entry is an error.** A `.vr` file without a
   shebang AND without `fn main()` produces a clear "No entry
   point found" diagnostic that lists both recovery paths
   (add a shebang, or define `fn main()`).

5. **Interpreter and AOT exit codes match.** Whether you run
   the script via the interpreter or compile it ahead of time
   (`verum run --aot script.vr`), the process exit code is
   the same: tail-int / fn-main return value reaches the OS
   identically through both tiers.
