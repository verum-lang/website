---
sidebar_position: 5
title: Script mode
description: Top-level statements, the synthesised __verum_script_main entry, and the parser/compiler contract that distinguishes a script from a library or binary cog.
---

# Script mode

Verum's parser and compiler accept three module shapes —
**library**, **binary**, and **script**. Library / binary modules
follow the strict decls-only grammar at the module top level
(only `fn` / `type` / `const` / `mount` / `implement` / `protocol`
/ `module` / `static` items, etc.). Script-mode modules **also**
accept top-level statements (let-bindings, expression statements,
`defer`, …), folding them into a single synthesised
`__verum_script_main` function that becomes the program's entry
point.

This page is the source-of-truth for what script mode does
today, what it doesn't do yet, and the invariants the
parser / compiler enforce.

---

## The three module kinds

Each module carries a synthetic `@![__verum_kind(...)]`
attribute that records its kind. The attribute is normally set
by the pipeline driver (lexer shebang detection, manifest hint,
explicit attribute in source); user code can also set it
manually via the AST API
(`verum_ast::CogKind::set_on_module(&mut module)`).

| Kind | Tag | Top-level grammar | Entry point |
|------|-----|-------------------|-------------|
| Library | `@![__verum_kind("library")]` (default) | decls only | none — exported items |
| Binary  | `@![__verum_kind("binary")]` | decls only | `fn main()` (sync or async) |
| Script  | `@![__verum_kind("script")]` | decls **and** statements | `fn main()` if present, else synthesised `__verum_script_main` |

Library is the default when no attribute is present.
`Module::is_script()` returns `true` only for the explicit
`Script` tag. Tests and tooling can introspect via
`CogKind::of(&module)`; the value is also visible to meta
functions through `project_kind()` (planned, tracked under #20).

---

## The contract

A script-mode module is recognised by the parser when
[`FastParser::parse_module_script_str`][parser] is used (or the
internal `RecursiveParser::set_script_mode(true)` is set).
Inside that mode:

1. **Statement-starter short-circuit.** When the next token is
   `let`, `defer`, `errdefer`, or `provide`, the parser routes
   directly to `parse_stmt`. The library-mode item-keyword
   recogniser never sees the keyword. This is the language-
   level distinction between script mode and library mode:
   script `let` is a Python-style local binding folded into the
   wrapper, **not** the library-mode `const` shorthand.

2. **Item-failure fallback.** Tokens that don't unambiguously
   start a statement still pass through `parse_item` first. If
   parsing as an item fails AND the parser hasn't advanced (no
   tokens consumed), the parser retries via `parse_stmt`. This
   catches expression statements (`print(x);`,
   `do_thing();`) without a brittle look-ahead.

3. **Wrapper synthesis.** Every collected statement is folded
   into a private `FunctionDecl` named **`__verum_script_main`**
   and appended to the module after the regular items. Source
   order is preserved: items appear before the wrapper, but the
   wrapper's body holds statements in the exact order they were
   parsed.

4. **No-stmt elision.** A pure-decl source compiled in script
   mode does **not** get an empty wrapper. This matters for
   tooling that compiles every `.vr` file in script mode by
   default — pure libraries pass through unchanged.

5. **Entry-point fallback.** The compiler's
   `EntryDetectionPhase` looks for `fn main` first; if no
   `main` is found AND at least one module is script-tagged,
   it falls back to `__verum_script_main` from the script
   module. Modules tagged as Library / Binary that happen to
   declare a `__verum_script_main` are **not** treated as
   entry points — only the kind tag opts in.

6. **Explicit `main` wins.** A script-mode source that also
   declares `fn main()` (mid-migration) keeps `main` as the
   entry point. The wrapper is still emitted but is dead code
   at runtime. This lets you graduate a script to a binary
   without flipping the parser kind back.

[parser]: https://github.com/verum-lang/verum/blob/main/crates/verum_fast_parser/src/lib.rs

---

## Worked example

Source `hello.vr`:

```verum
fn greet(name: Text) -> Text {
    f"Hello, {name}!"
}

let user = "world";
print(greet(user));
defer cleanup();
```

In **library mode** the parser rejects `let user = "world"` (it
parses as a top-level `const` shorthand, then `print(...)` and
`defer cleanup()` fail because they aren't items). In
**script mode** the parser produces:

```text
Module
├── fn greet(name: Text) -> Text { … }       (user-written item)
└── fn __verum_script_main() {               (synthesised wrapper)
        let user = "world";
        print(greet(user));
        defer cleanup();
    }
```

`EntryDetectionPhase::detect_entry_point(&[module])` then
returns `MainConfig::Sync` with `__verum_script_main` as the
entry. (If `greet`'s definition were `async fn`, it wouldn't
matter — the wrapper itself isn't async, so the program is
sync.)

---

## What's not yet shipping

The script-mode foundation (parser flag, statement collection,
wrapper synthesis, entry-detection fallback) is fully wired and
covered by an end-to-end test suite at
`crates/verum_compiler/tests/script_mode_e2e.rs` (8 tests).
Pieces still in the queue:

- **`#!` shebang lexer hook.** Today script mode is opted in
  programmatically (`parse_module_script_str` or
  `set_script_mode(true)`). The driver-side hook that flips
  the flag automatically when the source starts with `#!` is
  tracked separately.

- **Script-arg propagation.** The implicit `__verum_script_main`
  has no parameters in the current implementation. The
  signature `fn __verum_script_main(args: List<Text>) -> Int`
  with auto-bridging from the platform's `argv` is on the
  follow-up list.

- **Script exit codes.** A script that returns `()` should map
  to exit code `0`; an explicit `Int` return should propagate
  through to the OS exit. The linker's entry-symbol
  parameterisation work is part of this thread.

- **Top-level `await`.** `await` at the script top level
  requires the wrapper to be `async fn` and an executor wired
  by the runtime. The parser already accepts `await` inside a
  block; the script wrapper just needs to flip to `async`
  when the body contains an `.await`.

- **Async script entry.** Once the wrapper can be `async`, the
  compiler will run it through the implicit-executor path the
  same way `async fn main()` is handled today.

These are tracked under task #8 (P1.8) and its continuations.

---

## Compiler / parser surface

| Concern | API |
|---------|-----|
| Parse a script source | `verum_fast_parser::FastParser::parse_module_script_str(&source, file_id)` |
| Set the kind on an existing module | `verum_ast::CogKind::set_on_module(&mut module)` |
| Read the kind | `verum_ast::CogKind::of(&module)` / `module.is_script()` |
| Detect the entry point | `verum_compiler::phases::entry_detection::EntryDetectionPhase::detect_entry_point(&modules)` |
| Synthesised wrapper name | `__verum_script_main` (private; pinned by the parser, recognised by the entry-detection phase) |
| Kind-tag attribute | `@![__verum_kind("script")]` (literal string argument) |

---

## Tests

End-to-end coverage lives in two suites:

- `crates/verum_fast_parser/tests/script_mode_tests.rs` — 5
  parser-level tests (library rejects `defer`, script accepts
  `defer`, intermixed decls + stmts preserve source order,
  no-stmt source emits no wrapper, expression statements
  routed through the item-failure fallback).
- `crates/verum_compiler/tests/script_mode_e2e.rs` — 8
  parser-to-entry-detection tests (covers the kind-tag
  fallback, explicit-main precedence, untagged-module
  rejection, idempotency of `set_on_module`).

Both surfaces pass with **0 regressions** across the wider
parser and compiler test suites.
