---
sidebar_position: 33
title: script
description: Embedded scripting — a host Verum program compiles and runs Verum scripts at runtime, in-process, on the same VBC interpreter.
status: partial
status_detail: "Interpreter regressions cover captured and generic host callbacks, host identity and Engine handle lifetime. Session, Outcome and World retain legacy raw-handle paths; this does not establish complete sandboxing or native parity."
---

# `core.script` — Verum as its own scripting language

A host Verum program can compile and run Verum **scripts** at runtime,
in-process, on the same VBC interpreter the host itself runs on.

`Engine` compiles source through the host's installed compiler hook and runs
it in an interpreter. Without that hook, source evaluation reports
`CompilerUnavailable`; executing an already compiled module is a separate
operation. Native embedding requires its own compiler/runtime integration.

```verum
mount core.script.{Engine, ScriptValue, ScriptResult};

fn main() {
    let engine = Engine.new();
    match engine.eval("fn main() -> Int { 42 }") {
        ScriptResult.Ok(ScriptValue.Int(value)) => assert(value == 42),
        _ => panic("script failed"),
    }
}
```

## Host callbacks

`Engine.register(name, callback)` accepts `fn(Int) -> Int`. A callback keeps
its captured environment and the lexical generic arguments required by its
body, including nested closures. Registration preserves the callable value;
it does not turn a closure into a bare function identifier.

A callback is tied to its originating host interpreter and module. A foreign
host, an expired host or a host reset invalidates that authority. Callback
errors propagate back through script evaluation. Engine operations use
interpreter-owned handles and an exclusive execution lease: stale handles
and reentrant access to an active engine are refused.

## The three affine handles

`Engine`, `Session` and `World` are declared affine. `Engine` is the
compile-and-run surface. `Session`, obtained through `load`, `link` or
`link2`, retains a compiled script and its state across calls. `World`
provides a shared environment.

These declarations do not by themselves establish runtime handle safety.
The checked handle registry currently covers `Engine`; the `Session`,
`World` and outcome interfaces still contain raw-handle paths requiring
separate lifetime validation.

## Value boundaries and validation scope

Host callbacks run against their originating host state. Script evaluation
uses its own interpreter state; a shared execution model does not imply
that every value can cross heaps without conversion.

`Engine.call_args` currently supports self-contained scalar arguments.
`Text`, `List` and `Map` arguments require reconstruction on the script
side. Values visible through a shared `World` are a distinct interface and
do not establish support for these call arguments.

The interpreter callback and handle regressions live in
[`script_host_callable.rs`](https://github.com/verum-lang/verum/blob/main/crates/verum_vbc/tests/script_host_callable.rs).
They include the actual `Engine` wrapper, captured and nested generic
callbacks, invalid host ownership, callback failures and stale handles.
They do not establish full module conformance, isolation of untrusted
scripts, or parity with native embedding.
