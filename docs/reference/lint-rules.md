---
sidebar_position: 12
title: Lint rules
---

# Lint rules catalogue

The lint rules grouped here fall into four categories — **safety**,
**verification**, **performance**, and **style** — each with a
distinct meaning when you pick a preset:

- The `strict` preset promotes every **safety** and **verification**
  warning to an *error*. CI gates that want a hard "no slipping" line
  use this.
- The `relaxed` preset demotes warnings to *info* and infos to
  *hint*. IDE-friendly suggestion mode that never breaks a build.
- The `recommended` preset (default) keeps each rule at its built-in
  severity. The middle ground.

Every rule has a stable kebab-case name. That name is what you pass
to `[lint.severity]`, to `@allow / @deny / @warn` attributes, and to
the `--severity` filter — the linter never asks you to spell the
same thing two different ways.

To inspect or print rules from the binary itself, without leaving
the terminal:

```bash
verum lint --list-rules                # alphabetised dump with categories
verum lint --explain unused-import     # one rule's full doc + example
```

For configuration, see **[Reference → Lint configuration](/docs/reference/lint-configuration)**.
For CLI usage, see **[Reference → CLI commands → `verum lint`](/docs/reference/cli-commands#verum-lint)**.

:::tip[Rule-doc template]
Every rule entry below follows the same shape:

- `### \`<rule-name>\` — *<level>* [— <category>]` heading.
- One-line summary describing the bug shape the rule catches.
- A **fires-on** example — the smallest snippet that triggers the rule.
- A **silent-on** example showing the corrected form.
- Configuration knobs (when the rule has any) under `[lint.<section>]`.
- Cross-references to related rules.

When you author a custom rule, follow the same template — the
generated docs page reads like the rest of the catalogue.
:::

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

### `unrefined-public-int` — *warn*

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

### `verify-implied-by-refinement` — *warn*

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

### `public-must-have-verify` — *hint*

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
a `Cleanup` protocol implementation. Without `Cleanup`, the
resource is leaked unless freed explicitly — relying on the user
to remember an explicit `close()` call is exactly the bug pattern
RAII / `Cleanup` was invented to prevent.

```verum
// fires
type FileHandle is { fd: Int };

// silenced — destruction releases the FD automatically
type FileHandle is { fd: Int };

implement Cleanup for FileHandle {
    fn cleanup(self) { close_fd(self.fd); }
}
```

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

```verum
// fires
public fn raw_buffer(buf: &unsafe [Byte]) -> Int { /* ... */ }

// silenced — wrap the unsafe interior behind a checked surface
public fn raw_buffer(buf: &checked [Byte]) -> Int {
    let bytes = unsafe { buf.as_unsafe() };
    /* ... */
}
```

### `unsafe-without-capability` — *warn*

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

### `ffi-without-capability` — *warn*

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

### `forbidden-context` — *error*

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

```verum
// fires — `name` is consumed at last use, no clone needed
fn greet(name: Text) {
    print(f"hello, {name.clone()}");
}

// silenced — the move version is one character shorter and faster
fn greet(name: Text) {
    print(f"hello, {name}");
}
```

`--fix` strips the trailing `.clone()` automatically; the bot's
fix.edits payload carries the precise byte range for LSP code
actions.

### `cbgr-budget-exceeded` — *warn*

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
`default_check_ns`. Enforcement is **static**: if the configured
budget is below `15 ns` (the cheapest single deref), every managed
`&` reference inside the matching module fires. The check is meant
as a tripwire — set the budget for hot modules and the linter will
flag any reference shape that *cannot* meet it, before a profile
ever runs.

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

### `naming-convention` — *warn*

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

### `max-line-length` — *hint*

Source line exceeds `[lint.style].max_line_length` characters.
Counts UTF-8 *characters*, not bytes. Default 100; set to 0 to disable.

```toml
[lint.style]
max_line_length = 100
```

### `max-fn-lines` — *hint*

Function body exceeds `[lint.style].max_fn_lines`. Length is computed
from the item's source span — `fn` keyword through closing brace.
Default 80.

```toml
[lint.style]
max_fn_lines = 80
```

### `max-fn-params` — *hint*

Function declares more parameters than `[lint.style].max_fn_params`.
Default 5.

```toml
[lint.style]
max_fn_params = 5
```

### `max-match-arms` — *hint*

A `match` expression has more arms than `[lint.style].max_match_arms`.
Walks the AST, so nested matches are checked independently. Default 12.

```toml
[lint.style]
max_match_arms = 12
```

### `public-must-have-doc` — *hint*

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

### `architecture-violation` — *error*

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

### `custom-ast-rule` — *warn*

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

## Cross-file rules

These rules operate on the assembled corpus, not one file at a
time. They land in the post-aggregation phase after every per-file
pass has run, so they see the full mount graph + the full set of
public symbols + every file's source. Useful for rules that
require a project-wide view: cycle detection, dead-code search,
public-API consistency.

### `circular-import` — *error*

DFS over the mount graph; reports every cycle once at its entry
node, with the full chain in the message (`a → b → c → a`).
Fires only on cycles entirely within the corpus — `mount-cycle-via-stdlib`
catches the harder variant where the cycle is laundered through a
standard-library re-export.

```verum
// fires — src/a.vr ↔ src/b.vr
// src/a.vr
mount b;          // a depends on b
public fn from_a() { b::from_b(); }

// src/b.vr
mount a;          // and b depends on a — cycle
public fn from_b() { a::from_a(); }
```

Standard fix: extract the shared types into a third leaf module
that both can mount.

### `orphan-module` — *hint*

A `.vr` file under `src/` that no other file mounts. Skips
entry-point conventions (`main.vr` / `lib.vr` / `mod.vr`) and any
file whose dotted name has a prefix that's already mounted —
`mount foo` covers `foo.bar` implicitly.

### `dead-module` — *hint*

A file isn't reached from any entry point along the mount graph.
Differs from `orphan-module`: orphan-module is *"no one mounts it"*;
dead-module is *"no chain of mounts from an entry point reaches it"* —
a file can be mounted-and-unreachable when the chain itself is dead.

### `unused-public` — *hint* — opt-in

Public symbol whose name doesn't appear as a standalone identifier
in any other file. Heuristic — qualified renames and reflective
use are out of scope; off by default to avoid nuisance reports on
library projects whose consumers live outside the workspace. Opt
in via:

```toml
[lint.rules.unused-public]
enabled = true
```

### `unused-private` — *hint*

Non-public symbol with no callers in its own file. Complements
`unused-public`; together they cover dead code on both sides of
the visibility boundary. Skips `main` / `init` / `_start` —
runtime entry-points are referenced externally.

```verum
// fires — helper is private and never called
fn helper() -> Int { 0 }
fn main() {}

// silenced — main calls helper
fn helper() -> Int { 0 }
fn main() { let _ = helper(); }
```

Use `@allow("unused-private")` on the declaration when the symbol
is intentionally retained for future use; the rule keeps quiet
for that one item without disabling itself across the file.

### `inconsistent-public-doc` — *hint* — opt-in

A module exports K public symbols, M of them have `///` doc
comments. Fires when 0 < M < K — the inconsistency case. All-or-
nothing is left alone (some modules legitimately don't need docs;
that's the user's call). Opt in via:

```toml
[lint.rules.inconsistent-public-doc]
enabled = true
```

### `mount-cycle-via-stdlib` — *warn*

A user-corpus file mounts a stdlib path (`stdlib.X` or `core.X`)
whose first non-stdlib segment overlaps with a top-level user
namespace. Catches the round-trip cycle that `circular-import`
misses because the standard library is a black box from the
linter's point of view. False positives are rare but possible —
suppress with `@allow("mount-cycle-via-stdlib")` when the stdlib
path is a legitimate forward of a different name.

### `pub-exports-unsafe` — *warn*

Public symbol's signature mentions `&unsafe` or `unsafe fn`.
Catches unintentional unsafe-surface leakage at the project's
public API boundary. The signature scan is text-level on the
declaration's source; the false-positive rate is low because
those tokens essentially never appear in safe code.

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
| `unrefined-public-int` | verification | warn | **AST**  |
| `verify-implied-by-refinement` | verification | warn | **AST**  |
| `public-must-have-verify` | verification | hint | **AST**  |
| `unsafe-without-capability` | safety | warn | **AST**  |
| `ffi-without-capability` | safety | warn | **AST**  |
| `forbidden-context` | safety | error | **AST**  |
| `architecture-violation` | style | error | **AST**  |
| `cbgr-budget-exceeded` | performance | warn | **AST**  |
| `naming-convention` | style | warn | **AST**  |
| `max-line-length` | style | hint | **AST**  |
| `max-fn-lines` | style | hint | **AST**  |
| `max-fn-params` | style | hint | **AST**  |
| `max-match-arms` | style | hint | **AST**  |
| `public-must-have-doc` | style | hint | **AST**  |
| `custom-ast-rule` | style | warn | **AST** (user-authored) |
| `shadow-binding` | style | info | text-scan |

AST-driven rules (built on `verum_ast::Visitor`) are zero-false-positive
on their concern — `redundant-refinement` cannot be fooled by a
`{ true }` inside a string literal or a comment, the way a text-scan
rule would. The two engines complement each other: AST rules read
*structure*, text-scan rules read *strings*, and each is the right
tool for one shape of evidence.

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

Plus call-site control inside the source itself — most-specific
scope wins, beating both `[lint.severity]` and CLI flags:

```verum
@allow(unused-import, reason = "needed by derive macro to see it")
mount stdlib.derive.*;

@deny(unused-result)
fn must_use_result() -> Result<Int, Error> { /* ... */ }

@warn(redundant-clone)
type LegacyShim is { /* opt this type back into stricter checking */ };
```

The rule name passed to `@allow / @deny / @warn` is the same
identifier shown in `verum lint --list-rules`.

## See also

- **[Reference → Lint configuration](/docs/reference/lint-configuration)** — full schema.
- **[Reference → CLI commands → `verum lint`](/docs/reference/cli-commands#verum-lint)** — flags.
- **[Reference → Attribute registry](/docs/reference/attribute-registry)** — `@allow` / `@deny` / `@warn`.
