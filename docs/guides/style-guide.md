---
sidebar_position: 2
title: Style guide
description: Naming, formatting, imports, idioms — the conventions the stdlib follows.
---

# Style guide

Conventions used by `core/` and the compiler itself. Applied by
`verum fmt`; enforced (with overrides) by `verum lint`.

## Naming

### Types

`UpperCamelCase`. Type constructors (variants) same case.

```verum
type User is { id: UserId, name: Text };
type Shape is Circle | Square | Triangle;
type HttpError is Timeout | ConnectionReset | InvalidStatus(Int);
```

### Protocols

`UpperCamelCase`, usually a verb or adjective.

```verum
type Serializable is protocol { ... };
type Ord          is protocol { ... };
type IntoIterator is protocol { ... };
```

### Functions, methods, variables

`snake_case`.

```verum
fn build_query(filter: &Filter) -> Query { ... }
let request_count = 0;
```

### Constants & statics

`UPPER_SNAKE_CASE`.

```verum
const MAX_RETRIES: Int = 3;
const DEFAULT_BUF_CAPACITY: Int = 8192;
static mut COUNTER: AtomicU64 = AtomicU64::new(0);
```

### Modules

`lower_snake_case`, singular for concepts, plural when the module
collects instances.

```
core.net.tcp           // concept
core.collections       // collection of types
core.math.linalg       // sub-area
```

### Generic parameters

One letter, capitalised, meaningful when possible. Use `T` for single
type params, `K`/`V` for keys/values, `E` for errors, `F` for
functions, `S` for state, `I` for iterators.

```verum
fn fold<T, B, F>(iter: I, init: B, f: F) -> B
    where I: Iterator<Item = T>, F: fn(B, T) -> B
```

### Lifetimes

Single letter, lowercase. Rarely appear in Verum; when they do, use
`'a`, `'b`, or descriptive names for long-lived scopes (`'arena`,
`'world`).

## Formatting

`verum fmt` is the arbiter. Key rules it enforces:

- **4-space indentation.** No tabs.
- **Line width 100 characters.** Exceptions for URLs and long
  literals.
- **Trailing commas** in multi-line lists / tuples / records.
- **One statement per line.** Exception: one-line control flow
  (`if x { foo() } else { bar() }`) up to 80 chars.
- **Type ascriptions go with the binding**: `let x: Int = 42;`, not
  `let x = 42 : Int;`.

### Braces

Opening brace on the same line as the declaration:

```verum
fn foo(x: Int) -> Int {
    x + 1
}
```

Never:

```verum
fn foo(x: Int) -> Int
{
    x + 1
}
```

### Field initialisers

```verum
let u = User {
    id: UserId(42),
    name: "Alice".to_string(),
    email: "alice@example.com".to_string(),
};
```

`..other` for struct update goes last, no trailing comma:

```verum
let v2 = User { name: "Bob".to_string(), ..user };
```

## Imports

### Ordering

1. Standard library (`mount std.*` / `mount core.*`).
2. External cogs.
3. Current cog (`mount .self.*`, `mount .super.*`, `mount .crate.*`).

One blank line between groups. Within a group, alphabetical.

```verum
mount std.io.*;
mount std.collections.{List, Map};
mount std.time.Duration;

mount http::{Request, Response};
mount serde::Deserialize;

mount .self.config.Config;
mount .self.util.*;
```

### Glob imports

Allowed for prelude-style modules (`mount std.*`). Avoid elsewhere;
be explicit about what you're bringing in.

## Visibility

- Default to private. Only mark `pub` / `internal` when needed.
- Prefer `internal` over `pub` when the item is not part of the cog's
  public surface.
- Documented public items get `///` doc-comments.

## Documentation

- `///` doc comments attach to the following item.
- `//!` inner doc comments attach to the enclosing module.
- Prefer example-heavy doc comments; stdlib uses this heavily.

```verum
/// Double the value, saturating at `Int::MAX`.
///
/// # Examples
///
/// ```verum
/// assert_eq(double_sat(5), 10);
/// assert_eq(double_sat(Int::MAX), Int::MAX);
/// ```
fn double_sat(x: Int) -> Int { x.saturating_add(x) }
```

## Errors

- Prefer a typed error enum over string errors for non-trivial functions:

  ```verum
  type ParseError is
      | UnexpectedEof
      | InvalidToken(Text, Int)
      | UnclosedDelimiter(Char);
  ```

- Reserve `core::base::Error` (the string-based catch-all) for quick
  scripts and the innermost wrapper.
- In async code, attach a source via `@derive(Error)` so chains render
  properly.

## Refinement conventions

- Keep refinements short and decidable. Long ones belong in `@logic`
  helpers with a named predicate.

  ```verum
  // Good
  type Positive is Int { self > 0 };

  // Refactor
  @logic
  fn is_valid_checksum(xs: &List<Byte>) -> Bool { ... }
  type Validated is List<Byte> { is_valid_checksum(self) };
  ```

- Don't refine for decoration. If no caller or callee benefits, drop
  the refinement.

## References

- Default to `&T`. Let escape analysis promote.
- Use `&checked T` when you want a compile-time guarantee that the
  check was elided (critical hot paths).
- Use `&unsafe T` only with a `// SAFETY: ...` comment explaining
  the obligation.

## Context clauses

- List in logical order: resources first, side-effects second,
  measurement third.

  ```verum
  fn handle(req: Request) using [Database, Logger, Metrics] { ... }
  ```

- Declare exactly what you use — don't "just in case" a context. The
  static analyser will flag unused ones.

## Async

- Name async futures after the task, not the state: `fetch_user`, not
  `user_future`.
- Short `.await` chains over deep nested `match` on `Poll`.
- Prefer `nursery { }` over freestanding `spawn` for concurrent work
  that needs to complete before the caller returns.

## Tests

- Tests near the code: `@test` annotations in the same file for unit
  tests.
- `tests/` directory for integration tests.
- Name tests `fn test_<what>_<circumstance>()` or `fn <what>_should_<outcome>()`.

```verum
@test
fn test_divide_rejects_zero_denominator() {
    assert(divide(10, 0).is_err());
}
```

## Commit messages (cog-wide convention)

```
feat(area): ...       - new feature
fix(area): ...        - bug fix
perf(area): ...       - performance improvement
refactor(area): ...   - no functional change
docs(area): ...       - documentation only
test(area): ...       - tests only
build(area): ...      - build system
```

## Formatting directives

Override `verum fmt` sparingly with comment markers:

```verum
// fmt: off
let M = [
    [1.0, 0.0, 0.0],
    [0.0, 1.0, 0.0],
    [0.0, 0.0, 1.0],
];
// fmt: on
```

## See also

- **[Best practices](/docs/guides/best-practices)** — bigger-picture
  patterns.
- **[FAQ](/docs/guides/faq)** — quick answers to common questions.
