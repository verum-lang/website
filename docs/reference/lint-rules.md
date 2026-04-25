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
