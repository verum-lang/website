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

## Two execution roles, three invocation modes

Verum draws a strict line between two **roles** a `.vr` source can
play. The role is determined by what's in the file:

- A **Verum application** declares `fn main()`. It can be executed
  by the interpreter or compiled to a native binary by AOT — both
  paths use the same `main` entry. No shebang.

- A **Verum script** starts with a `#!` shebang at byte 0 and has
  **no `fn main()`** — top-level statements are the program. A
  `fn main` written inside a script is a regular function, not the
  entry point. The synthesised wrapper around the top-level
  statements is always the entry.

The roles do not overlap. `main` only ever drives an application;
the script wrapper only ever drives a script. From those two roles
you get three invocation modes:

| Mode | Role | Invocation | Required source signal |
|---|---|---|---|
| **Interpreter** | Application | `verum run file.vr [-- args…]` | `fn main()` (sync or async) |
| **AOT** | Application | `verum run --aot file.vr` *or* `verum build` | `fn main()` |
| **Script** | Script | `verum file.vr [args…]` *or* `./file.vr` | `#!` shebang at byte 0 |

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

A script reads command-line arguments via the standard library —
`core.base.env.args()` returns them as a `List<Text>` with the
program name at index 0:

```verum
#!/usr/bin/env verum
mount core.base.env;

let args = env.args();
if args.len() < 2 {
    print("usage: greet.vr <name>");
    2
} else {
    print("hello, ");
    print(args[1]);
    0
}
```

```bash
$ ./greet.vr Alice
hello, Alice!
$ ./greet.vr; echo "exit=$?"
usage: greet.vr <name>
exit=2
```

A script must not declare `fn main`. If you find yourself reaching
for `fn main`, your file isn't a script — it's an application;
remove the shebang and run it via `verum run file.vr`.

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

## Sandboxing scripts with permissions

A Verum script is a security boundary. The dynamic-language
default is "the script can do anything the user could do" —
fine for one-shot work on your own machine, terrifying for
anything you fetched off the internet or run on someone else's
data. Verum closes that gap with a declarative permission
surface that the **same enforcement engine** honours under both
the interpreter and an AOT-compiled binary.

### Declaring grants

Permissions live in the script's frontmatter, the inline
metadata block delimited by `// /// script` lines. Frontmatter
sits immediately after the shebang:

```verum
#!/usr/bin/env verum
// /// script
// permissions = ["fs:read=./data", "net=api.example.com:443"]
// ///
mount json;

let body = io.fs.read_text("./data/config.json")?;
let resp = http.get("https://api.example.com:443/v1/echo")?;
print(resp.body);
0
```

Each grant has a **kind** and an optional **target**:

| Kind         | Meaning                                         | Targetable               |
|--------------|-------------------------------------------------|--------------------------|
| `fs:read`    | Read files                                      | Yes (`fs:read=./data`)  |
| `fs:write`   | Write/create/unlink files                       | Yes                      |
| `net`        | TCP/UDP/HTTP outbound + listen                  | Yes (`net=host:port`)    |
| `run`        | Spawn subprocesses, signal, exit non-zero       | Yes (program path)       |
| `ffi`        | Raw FFI / inline assembly                       | Yes (symbol name)        |
| `time`       | Wall-clock / monotonic clock reads              | No                       |
| `random`     | Host CSPRNG seeding                             | No                       |
| `env`        | Read/write process environment                  | No                       |

A bare kind grants the **wildcard** for that scope:
`permissions = ["net"]` allows every host:port combination,
while `permissions = ["net=internal.svc:5432"]` allows only the
listed target. Multiple targets in one declaration combine
additively (`["net=a:80", "net=b:80"]` permits both).

### CLI overrides

You can also drive permissions from the command line — useful
for sandboxing a script you didn't write or relaxing a
production policy in a one-off debug session:

```bash
$ verum --allow=fs:read=./logs --deny-all script.vr   # whitelist
$ verum --allow-all untrusted.vr                       # explicit "I trust this"
$ verum script.vr                                      # frontmatter wins
```

CLI flags **augment** frontmatter grants: a frontmatter
declaring `["net"]` plus `--allow=fs:read=./tmp` ends up with
both. `--deny-all` is the empty set; `--allow-all` is the
universal set. Either CLI flag installs a permission policy
even if the script's frontmatter is silent — opt-in to
sandboxing without editing the source.

The resolved policy is mixed into the script's persistent VBC
cache key, so two runs with different policies never collide on
the same cached binary.

### Enforcement: same gate, both tiers

Verum's defining property is that **the interpreter and the
AOT-compiled binary enforce the policy identically**. There is
no "AOT is fast but unsafe" fallback. The mechanism:

* **Interpreter (Tier 0).** A runtime `PermissionRouter` lives
  inside the dispatch loop. Every gated FFI call (`open`,
  `connect`, `socket`, `_exit`, `mmap`, …) and every raw
  syscall intrinsic checks the router on the warm path
  (≤ 2 ns one-entry cache hit). A denied call panics with
  `permission denied: <scope>(<target>)` and exits 143
  (SIGTERM-style, distinct from logic-panic exit 1).

* **AOT (Tier 1).** The CLI hands the resolved policy to the
  LLVM lowerer, which **bakes the grants into the generated
  binary at compile time**. Each `PermissionAssert` opcode in
  the bytecode lowers to one of four shapes — chosen per call
  site at compile time, not at runtime:

  | Policy state for this scope               | Emitted IR                                       |
  |-------------------------------------------|--------------------------------------------------|
  | Unconditionally allowed (wildcard / always-allow) | **No code** (the assert is elided entirely; LLVM sees zero overhead) |
  | Fully denied (no grants of any shape)     | Unconditional `puts("permission denied …") + _exit(143) + unreachable` (LLVM removes the gated intrinsic body via DCE) |
  | Specific targets listed                   | `switch i64 %target_id { T1 => ok, T2 => ok, default => panic }` (LLVM compiles the switch to compact branch-on-equal sequences) |
  | No script-mode policy installed (trusted application path) | **No code** (every gate is elided; matches the interpreter's allow-all default) |

  The panic site is **inlined per call site** rather than
  routed through a runtime helper. Inlining keeps the policy
  sealed in the binary — there is no helper symbol an attacker
  could intercept and no env-var protocol to tamper with — and
  lets LLVM merge identical denial sites across the module.

* **Sealed at build time.** The AOT cache key includes the
  resolved policy hash, so a binary cached for one policy is
  never reused for another. A script's compiled `.bin` always
  reflects the policy that was active when it was built.

### Wire-format contract

The interpreter and the AOT lowerer agree on a stable
**scope tag** mapping for the wire-encoded `PermissionAssert`
opcode (single byte, immediate after the opcode):

| Byte | Scope         |
|------|---------------|
| 0    | Syscall       |
| 1    | FileSystem    |
| 2    | Network       |
| 3    | Process       |
| 4    | Memory        |
| 5    | Cryptography  |
| 6    | Time          |

Unknown bytes collapse to **Syscall** — the most-restricted
scope — so a malformed or future-tagged call site errs on
stronger gating, never weaker.

### Diagnostics

A denied call surfaces a typed error. The interpreter prints:

```text
permission denied: Network(0xDEADBEEF)
```

The AOT binary, if compiled with the standard panic prologue,
prints:

```text
permission denied: script lacks `network` grant for this operation
```

and exits 143. Tooling (test runners, oncall dashboards) can
distinguish capability violations from logic panics by the exit
code: 143 = capability, 1 = logic.

---

## The contract

The invariants you can rely on:

1. **The `#!` shebang at byte 0 is the only script signal.**
   Not the `.vr` extension, not a directory layout convention.
   Either the first two bytes are `#!` (or `EF BB BF` BOM
   followed by `#!`) or the file is a regular library/binary
   source.

2. **Roles do not overlap.** An application has `fn main()` and no
   shebang; a script has a shebang and no `fn main()`. A `fn main`
   declared inside a script-tagged source is a regular function —
   it is not the program entry. To graduate a script to an
   application, remove the shebang and add `fn main()`; to demote
   an application to a script, do the inverse.

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
