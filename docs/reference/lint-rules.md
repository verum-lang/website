---
sidebar_position: 12
title: Lint rules
---

# Lint rules catalogue

Every built-in lint rule shipped with `verum lint`, grouped by
category. Each entry has a stable name (kebab-case, used in
`[lint.severity]` and `@allow / @deny / @warn` attributes), a
default severity, the category that drives preset promotion, and a
short description with one example.

For configuration, see **[Reference → Lint configuration](/docs/reference/lint-configuration)**.
For CLI usage, see **[Reference → CLI commands → `verum lint`](/docs/reference/cli-commands#verum-lint)**.

To inspect or print these from the binary itself:

```bash
verum lint --list-rules                # alphabetised dump
verum lint --explain unused-import     # one rule's full doc
```

## Verification

Verum-unique. These rules cover refinement-types, formal-verification,
and proof-correctness gaps that no other linter can express because
no other language has this layer.

### `unchecked-refinement` — *warn*

Function with refinement-typed parameters or return value lacks a
`@verify` annotation. Refinement types describe an obligation; a
function that never proves it is asking the runtime to do the work.

```verum
// fires
public fn divide(a: Int, b: Int{ it != 0 }) -> Int {
    a / b
}

// silences the lint — the obligation is now formally checked.
@verify(formal)
public fn divide(a: Int, b: Int{ it != 0 }) -> Int {
    a / b
}
```

### `redundant-refinement` — *hint* — AST-driven

A refinement predicate that always evaluates to `true` adds nothing
over the unrefined base type — drop the `{ … }` to simplify.

```verum
// fires (predicate is always true)
type Always is Int{ true };

// silenced — the bound is meaningful
type Pos is Int{ it > 0 };
```

### `empty-refinement-bound` — *error* — AST-driven

A refinement bound with **no inhabitants** — the type can never have
a value. Almost always a copy-paste error. The diagnostic prints the
empty range:

```verum
type Empty is Int{ it > 100 && it < 50 };
//   ^^^^^ refinement predicate has no inhabitants:
//         bound `101..=49` is empty
```

### `unrefined-public-int` — *warn* — AST-driven (Phase C.1)

Public function takes or returns a raw `Int` / `Text` parameter
without a refinement. The type system can't express usage
constraints, so every caller is allowed to pass anything; bugs are
only caught at runtime. Off by default; enable with:

```toml
[lint.refinement_policy]
public_api_must_refine_int  = true
public_api_must_refine_text = false
```

```verum
// fires (raw Int parameters)
public fn add(a: Int, b: Int) -> Int { a + b }

// silenced — usage is type-level explicit
public fn add(a: Int{ it > 0 }, b: Int{ it > 0 }) -> Int { a + b }
```

### `verify-implied-by-refinement` — *warn* — AST-driven (Phase C.1)

A function uses refinement types in any signature position but lacks
`@verify(...)`. The type-level obligation is then checked only at
runtime, defeating the static-verification value of refinements.
Enable with:

```toml
[lint.refinement_policy]
require_verify_on_refined_fn = true
```

```verum
// fires
public fn pos_only(x: Int{ it > 0 }) -> Int { x }

// silenced — has @verify (any strategy)
@verify(formal)
public fn pos_only(x: Int{ it > 0 }) -> Int { x }
```

### `public-must-have-verify` — *hint* — AST-driven (Phase C.1)

Every public function should declare its verification strategy —
`runtime`, `static`, `formal`, etc. The default is `hint` because not
every project wants every public fn formally verified. Enable with:

```toml
[lint.verification_policy]
public_must_have_verify = true
```

For security-critical codebases this turns "you forgot @verify" into
a build error.

## Safety

### `missing-context-decl` — *error*

Function uses a context (e.g. `Logger.info(...)`) without a
matching `using [Logger]` declaration in scope. The runtime would
fail with a missing-context panic; this catches it at lint time.

```verum
// fires — Database not declared
fn save(user: &User) {
    Database.exec("INSERT …", &[]);
}

// silenced
fn save(user: &User) using [Database] {
    Database.exec("INSERT …", &[]);
}
```

### `mutable-capture-in-spawn` — *error*

A `mut` variable is captured by a `spawn` closure. This is a data-race
risk — the parent and the spawned task can both write the same memory.

```verum
let mut counter: Int = 0;
spawn { counter = counter + 1 };   // fires
```

### `missing-error-context` — *warn*

Error propagation without context — `?` rethrows the inner error
without saying *what was being attempted*. Add `.context("…")` so
the resulting message is actionable.

```verum
let bytes = fs::read("config.json")?;            // fires
let bytes = fs::read("config.json").context("loading project config")?;
```

### `unused-result` — *warn*

The result of a function returning `Result<T, E>` (or any `@must_use`
type) is dropped without inspection. Errors silently disappear.

```verum
// fires — error is discarded
write_to_disk(&buf);

// silenced — explicit handling
let _ = write_to_disk(&buf);          // intentional drop
write_to_disk(&buf)?;                 // propagate
```

### `missing-cleanup` — *warn*

A type that holds a resource (file, socket, lock, allocation) lacks
a `Cleanup` protocol implementation. Resource is leaked unless
freed explicitly.

### `missing-timeout` — *warn*

A blocking call (`recv`, `await`, `join`) with no timeout. A wedged
peer can hang the caller forever; specify a deadline.

```verum
let v = chan.recv()?;                                    // fires
let v = chan.recv_with_timeout(5.seconds())?;            // silenced
```

### `unsafe-ref-in-public` — *warn*

A public function exposes `&unsafe T` in its API. The unsafe tier is
zero-overhead but requires manual safety proof at every call site;
keeping it out of public surfaces forces the proof to live in the
implementer's code, not every consumer's.

### `unsafe-without-capability` — *warn* — AST-driven (Phase C.2)

Function declares `unsafe { ... }` blocks but doesn't carry a
`@cap(...)` attribute. Verum's capability system makes every
safety-relaxation explicit at the type level; this rule turns that
convention into a static check.

```toml
[lint.capability_policy]
require_cap_for_unsafe = true
```

```verum
fn raw_unsafe() -> Int { unsafe { 42 } }            // fires

@cap(name = "memory.unsafe", domain = "low_level")
fn declared_unsafe() -> Int { unsafe { 42 } }       // silenced
```

### `ffi-without-capability` — *warn* — AST-driven (Phase C.2)

Same idea for FFI declarations. Items annotated `@ffi(...)` or
`@extern(...)` should also declare `@cap(...)` so the foreign-
boundary capability stays walkable.

```toml
[lint.capability_policy]
require_cap_for_ffi = true
```

```verum
@ffi("libc")
fn raw_ffi() -> Int { 0 }                           // fires

@cap(name = "ffi.libc", domain = "ffi")
@ffi("libc")
fn declared_ffi() -> Int { 0 }                      // silenced
```

### `forbidden-context` — *error* — AST-driven (Phase C.3)

Function uses a context (`using [X]`) that the project's
`[lint.context_policy.modules]` forbids in its module path. Off by
default; opt in by declaring rules:

```toml
[lint.context_policy.modules]
"core.*"        = { forbid     = ["Database", "Logger"] }
"core.math.*"   = { forbid_all = true }
"app.handlers"  = { allow      = ["Database", "Logger"] }
```

Most-specific match wins (`"core.math.*"` beats `"core.*"`).
Diagnostic names the module path, the offending context, the matched
glob, and the reason:

```text
error: module `core.math.linalg` may not use context `Database`
       (matched pattern `core.math.*`, forbid_all = true)
       [forbidden-context]
```

## Performance

### `unnecessary-heap` — *warn*

Heap allocation for a small type (Int, Bool, Char, small struct)
that could live on the stack.

```verum
let n: Heap<Int> = Heap(42);    // fires — Int is 8 bytes
let n: Int = 42;                // silenced
```

### `large-copy` — *warn*

A struct ≥ 256 bytes (default) is passed by value rather than by
reference, copying many bytes per call.

```verum
fn render(scene: Scene) { … }         // fires (Scene is large)
fn render(scene: &Scene) { … }        // silenced
```

### `cbgr-hotspot` — *info*

A tight loop with many CBGR-managed reference dereferences. Each
deref pays ~15 ns; promoting to `&checked` (compiler-proven safe)
collapses to 0 ns. Threshold is the `--cbgr-hotspot.loop-iteration-threshold`
config knob.

```verum
let n = vec.len();
for i in 0..n {
    process(&data[i]);   // fires — &data is managed
}
// after promotion:
let data: &checked Vec<Item> = make_checked(&data);
```

### `unbounded-channel` — *warn*

`Channel.new()` without a capacity limit can grow until OOM under
unfair production. Specify a bound explicitly.

```verum
let c = Channel.new();              // fires
let c = Channel.with_capacity(1024); // silenced
```

### `redundant-clone` — *warn*

`.clone()` on a value that is not used after this point — moving
would have been free. Common when refactoring borrows out.

### `cbgr-budget-exceeded` — *warn* — AST-driven (Phase C.4)

Managed CBGR reference (`&` / `&mut`, ~15 ns per deref) used in a
module whose `[lint.cbgr_budgets].max_check_ns` budget is below the
static per-deref cost. Promote to `&checked` (compiler-proven, 0 ns)
or `&unsafe` (manual safety, 0 ns).

```toml
[lint.cbgr_budgets]
default_check_ns = 15            # default: matches the spec

[lint.cbgr_budgets.modules]
"app.handlers.*" = { max_check_ns = 30 }
"core.runtime.*" = { max_check_ns = 0 }    # 0 = managed refs forbidden
```

Resolution: most-specific module pattern wins; falls back to
`default_check_ns`. Today's enforcement is **static**: if the budget
is below `15 ns` (the cheapest single deref), every managed `&`
fires. Profile-driven enforcement (compare measured runtime cost
against the budget) is on the roadmap.

## Style

### `unused-import` — *warn*

A `mount` statement whose imports are never used in the file. AST-
based when the file parses; falls back to text-scan otherwise.

### `deprecated-syntax` — *error*

Rust-isms or other deprecated syntax that does not compile to valid
Verum or that was once valid and removed. The diagnostic prints the
correct replacement:

| Rust-ism | Verum |
|---------|-------|
| `Box::new(x)` | `Heap(x)` |
| `Vec<T>` | `List<T>` |
| `String` | `Text` |
| `struct Name { … }` | `type Name is { … };` |
| `enum Name { A, B }` | `type Name is A \| B;` |
| `impl Trait for T` | `implement Trait for T` |
| `::` path separator | `.` |

This is the most-common autofix target with `verum lint --fix`.

### `empty-match-arm` — *warn*

A `match` arm with an empty body or `()`-only body. Either remove
the arm (let the `_` catch-all handle it) or add a body.

### `todo-in-code` — *warn*

A `TODO` / `FIXME` / `HACK` comment in production code (i.e. not in
`tests/` / `benches/`). The default config requires `TODO(#1234)` to
reference an issue — see `[lint.rules.todo-in-code]`.

### `single-variant-match` — *hint*

A `match` with a single non-`_` arm. An `if let` is shorter and
clearer.

```verum
// fires
match maybe_value {
    Some(v) => use_value(v),
    _ => {},
}
// preferred
if let Some(v) = maybe_value {
    use_value(v);
}
```

### `missing-type-annotation` — *hint*

A complex expression (chained method calls, generic call) without an
explicit type annotation. Annotations make the inferred type
visible to readers.

### `shadow-binding` — *info*

A `let` binding shadows a binding from an outer scope. Loop-variable
shadows are exempt by default (`[lint.rules.shadow-binding]
allow-shadow-of-loop-var = true`).

```verum
let x = 1;
{
    let x = 2;     // fires
}
```

### `naming-convention` — *warn* — AST-driven (Phase B.3)

Identifier doesn't match the project's `[lint.naming]` convention.
Per-construct: `fn`, `type`, `const`, `variant`, `field`, `module`,
`generic`. Recognised values:

`snake_case | kebab-case | PascalCase | camelCase | SCREAMING_SNAKE_CASE | lowercase | UPPERCASE`.

```toml
[lint.naming]
fn       = "snake_case"
type     = "PascalCase"
const    = "SCREAMING_SNAKE_CASE"

[lint.naming.exempt]
fn   = ["__init", "drop_impl"]    # FFI / convention exceptions
type = ["I32", "F64"]
```

```verum
fn camelFn() { … }       // fires (fn must be snake_case)
type bad_type is Int;    // fires (type must be PascalCase)
```

### `max-line-length` — *hint* — AST-driven (Phase C.6)

Source line exceeds `[lint.style].max_line_length` characters.
Counts UTF-8 *characters*, not bytes. Default 100; set to 0 to disable.

```toml
[lint.style]
max_line_length = 100
```

### `max-fn-lines` — *hint* — AST-driven (Phase C.6)

Function body exceeds `[lint.style].max_fn_lines`. Length is computed
from the item's source span — `fn` keyword through closing brace.
Default 80.

```toml
[lint.style]
max_fn_lines = 80
```

### `max-fn-params` — *hint* — AST-driven (Phase C.6)

Function declares more parameters than `[lint.style].max_fn_params`.
Default 5.

```toml
[lint.style]
max_fn_params = 5
```

### `max-match-arms` — *hint* — AST-driven (Phase C.6)

A `match` expression has more arms than `[lint.style].max_match_arms`.
Walks the AST, so nested matches are checked independently. Default 12.

```toml
[lint.style]
max_match_arms = 12
```

### `public-must-have-doc` — *hint* — AST-driven (Phase C.5)

Public function or type lacks a `///` doc comment. Detection scans
the source lines immediately above the item, skipping blank lines
and `@`-attributes, until it sees `///` (silenced) or anything else
(fires).

```toml
[lint.documentation]
public_must_have_doc = true
```

```verum
public fn no_doc() -> Int { 0 }    // fires

/// Returns zero.
public fn yes_doc() -> Int { 0 }   // silenced
```

### `architecture-violation` — *error* — AST-driven (Phase B.4)

A `mount` crosses a layer boundary (not in `allow_imports`) or
matches an explicit ban. Off by default; opt in by declaring layers
and/or bans:

```toml
[lint.architecture.layers]
core   = { allow_imports = ["core", "stdlib"] }
domain = { allow_imports = ["core", "stdlib", "domain"] }

[lint.architecture.bans]
"core.crypto" = ["core.testing"]
"app.ui"      = ["app.persistence", "app.network"]
```

Layer resolution: most-specific top-segment-prefix match.
Ban resolution: a key like `"core.crypto"` covers `core.crypto` and
every nested path under it (`core.crypto.sign`, …); glob patterns
work too (`"core.*"`).

```text
error: module `core.util` (layer `core`) may not import `domain.users`
       — not in `allow_imports`
       [architecture-violation]
error: module `core.crypto.sign` may not import `core.testing`
       — explicit ban (matched `core.crypto`)
       [architecture-violation]
```

### `custom-ast-rule` — *warn* — AST-driven (Phase D)

A meta-rule covering every user-authored entry in `[[lint.custom]]`
that uses the `[lint.custom.ast_match]` block instead of a regex
`pattern`. Each user rule emits diagnostics under its own `name` and
participates in the standard severity flow (`[lint.severity]`,
per-file overrides, in-source `@allow(...)`, the `--severity` filter).

The AST matcher exposes four shapes — exhaustive coverage of the
patterns most teams want to express without writing a Rust pass:

| `kind` | Selectors | Fires on |
|--------|-----------|----------|
| `method_call` | `method = "<name>"` | `recv.method(args)` calls |
| `call` | `path = "<a.b.c>"` | dotted-path free calls (`a.b.c(args)`) |
| `attribute` | `name = "<attr>"` | items annotated with `@attr` |
| `unsafe_block` | (none) | every `unsafe { … }` block |

Worked example:

```toml
# verum.toml
[[lint.custom]]
name        = "no-unwrap-in-prod"
description = "use `?` or `expect(\"why\")` instead of unwrap()"
severity    = "error"
paths       = ["src/**"]
exclude     = ["src/legacy/**"]
[lint.custom.ast_match]
kind   = "method_call"
method = "unwrap"
```

```text
error: use `?` or `expect("why")` instead of unwrap() [no-unwrap-in-prod]
  --> src/main.vr:8:13
```

AST-pattern rules are strictly more precise than regex rules — they
walk the parsed module via `verum_ast::Visitor`, so they will not
fire on text inside string literals or comments. The full schema is
documented in
[`[[lint.custom]]` · AST-pattern rules](/docs/reference/lint-configuration#ast-pattern-rules-phase-d).

## Severity / category cross-reference

| Rule | Cat. | Default | Implementation |
|------|------|---------|----------------|
| `missing-context-decl` | safety | error | text-scan |
| `deprecated-syntax` | style | error | text-scan + autofix |
| `mutable-capture-in-spawn` | safety | error | text-scan |
| `empty-refinement-bound` | verification | error | **AST** (lint_engine.rs) |
| `unchecked-refinement` | verification | warn | text-scan |
| `unused-import` | style | warn | text-scan |
| `unnecessary-heap` | performance | warn | text-scan + autofix |
| `missing-error-context` | safety | warn | text-scan |
| `large-copy` | performance | warn | text-scan |
| `unused-result` | safety | warn | text-scan |
| `missing-cleanup` | safety | warn | text-scan |
| `unbounded-channel` | performance | warn | text-scan |
| `missing-timeout` | safety | warn | text-scan |
| `redundant-clone` | performance | warn | text-scan |
| `empty-match-arm` | style | warn | text-scan |
| `todo-in-code` | style | warn | text-scan |
| `unsafe-ref-in-public` | safety | warn | text-scan |
| `cbgr-hotspot` | performance | info | text-scan |
| `single-variant-match` | style | hint | text-scan |
| `missing-type-annotation` | style | hint | text-scan |
| `redundant-refinement` | verification | hint | **AST** (lint_engine.rs) |
| `unrefined-public-int` | verification | warn | **AST** (Phase C.1) |
| `verify-implied-by-refinement` | verification | warn | **AST** (Phase C.1) |
| `public-must-have-verify` | verification | hint | **AST** (Phase C.1) |
| `unsafe-without-capability` | safety | warn | **AST** (Phase C.2) |
| `ffi-without-capability` | safety | warn | **AST** (Phase C.2) |
| `forbidden-context` | safety | error | **AST** (Phase C.3) |
| `architecture-violation` | style | error | **AST** (Phase B.4) |
| `cbgr-budget-exceeded` | performance | warn | **AST** (Phase C.4) |
| `naming-convention` | style | warn | **AST** (Phase B.3) |
| `max-line-length` | style | hint | **AST** (Phase C.6) |
| `max-fn-lines` | style | hint | **AST** (Phase C.6) |
| `max-fn-params` | style | hint | **AST** (Phase C.6) |
| `max-match-arms` | style | hint | **AST** (Phase C.6) |
| `public-must-have-doc` | style | hint | **AST** (Phase C.5) |
| `custom-ast-rule` | style | warn | **AST** (Phase D — user-authored) |
| `shadow-binding` | style | info | text-scan |

AST-driven rules (built on `verum_ast::Visitor`) are zero-false-positive
on their concern — `redundant-refinement` cannot be fooled by a
`{ true }` inside a string literal or a comment, the way text-scan
would. New AST passes land per Phase B/C of the
[lint configuration roadmap](/docs/reference/lint-configuration).

## How to control rule severity

Three ways, finest to coarsest:

```toml
# 1. Per-rule, by name (most precise)
[lint.severity]
deprecated-syntax = "off"
todo-in-code = "warn"

# 2. By preset
[lint]
extends = "strict"           # promotes safety/verification warnings to errors

# 3. By category — implicit through the preset table above.
```

Plus, in upcoming phases:

```verum
@allow(unused-import, reason = "needed by derive macro to see it")
mount stdlib.derive.*;
```

## See also

- **[Reference → Lint configuration](/docs/reference/lint-configuration)** — full schema.
- **[Reference → CLI commands → `verum lint`](/docs/reference/cli-commands#verum-lint)** — flags.
- **[Reference → Attribute registry](/docs/reference/attribute-registry)** — `@allow` / `@deny` / `@warn`.
