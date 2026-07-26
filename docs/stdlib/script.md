---
sidebar_position: 33
title: script
description: Embedded scripting — a host Verum program compiles and runs Verum scripts at runtime, in-process, on the same VBC interpreter.
status: undocumented
status_detail: not yet routed through `core-tests/` — there is no `core-tests/script/` suite, so this page reflects source-of-truth at last edit, not verified runtime behaviour.
---

# `core.script` — Verum as its own scripting language

A host Verum program can compile and run Verum **scripts** at runtime,
in-process, on the same VBC interpreter the host itself runs on.

This is the capability a game engine gets from embedding Lua — user
content that ships after the binary does — with one difference that
shapes the whole design: there is **no second virtual machine, heap, or
sandbox**. Script and host are the same execution model, so the boundary
that usually costs marshalling costs nothing to cross.

```verum
mount core.script.{Engine, ScriptValue, ScriptResult};

let engine = Engine.new();
match engine.eval(user_script) {
    ScriptResult.Ok(ScriptValue.Int(n)) => use_result(n),
    ScriptResult.Err => report_failure(),
    _ => {},
};
```

## Layout

| File | Lines | What's in it |
|---|---:|---|
| `engine.vr` | 431 | `Engine`, `Session`, `World`, `ScriptValue`, `ScriptResult`, `ErrorKind` |
| `mod.vr` | 44 | Re-exports; declares `public module engine` |

## The three affine handles

`Engine`, `Session` and `World` are all declared `affine`, which is what
makes lifetime management disappear from the caller's code: a handle is
used at most once along any path, so the compiler knows exactly where it
dies.

**`Engine`** is the compile-and-run surface. It owns the interpreter
handle and is freed automatically when it goes out of scope — no explicit
teardown, no leak on an early return.

**`Session`** is obtained from `Engine.link2` and holds state *across*
calls. Globals and heap written by an earlier `call` are visible to later
ones, shared by reference rather than copied. This is the shape you want
for a REPL, a modding API, or anything where scripts accumulate context.

**`World`** carries the shared environment scripts observe.

## Why sharing works here and not elsewhere

Because host and script run on one interpreter, values cross the boundary
**by reference**. Boundary-crossing engines — Wasm, BEAM, V8 — cannot
offer this: their guest heap is a separate address space, so every value
is copied or proxied.

The source notes that scalars and `Text` share correctly today. Richer
structures are the area to check against the sources before relying on
them, which the status above already implies: with no `core-tests/script/`
suite, the guarantee is what the implementation does, not what a
conformance run has confirmed.

## Status

There is no conformance suite for this module. The public surface above
is read from the sources; runtime behaviour across tiers has not been
validated the way `regression-only` and `partial` modules have. Treat the
API as documented-but-unpinned until a `core-tests/script/` suite lands.
