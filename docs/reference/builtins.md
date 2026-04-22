---
sidebar_position: 8
title: Built-in Functions
description: The complete registry of compiler-provided functions — `print`, `assert`, `panic`, `join`, and friends.
---

# Built-in Functions

A small set of functions is **provided by the compiler** rather than
the standard library. They are spelled as ordinary function calls —
Verum has no `!`-suffix macros like Rust — but their implementation is
hard-wired.

This page is the authoritative registry, organised by category.

Grammar reference:

```ebnf
builtin_call = builtin_name , '(' , [ argument_list ] , ')' ;

builtin_io            = 'print' | 'eprint' ;
builtin_assertion     = 'assert' | 'assert_eq' | 'assert_ne' | 'debug_assert' ;
builtin_control_flow  = 'panic' | 'unreachable' | 'unimplemented' | 'todo' ;
builtin_async         = 'join' | 'try_join' | 'join_all' | 'select_any' | 'ready' | 'pin' ;
```

## I/O

### `print`

```verum
fn print(args: ...Display);
```

Writes its arguments to standard output, separated by spaces, followed
by a newline. Accepts any number of values implementing `Display`.

```verum
print("hello");                     // hello
print("x =", x, "y =", y);          // x = 3 y = 4
print(f"value: {x}");               // value: 3   (format string)
```

`print` is a **built-in** — functions calling it do **not** need a
`using [...]` clause. Standard output is one of a small set of
built-in effects (`print`, `eprint`, `println`, `assert`, `panic`,
`unreachable`, `todo`, `unimplemented`) that bypass the user-ctx
mechanism. User-declared contexts (Logger, Database, Clock, ...)
still require their explicit `using [...]` declaration.

### `eprint`

```verum
fn eprint(args: ...Display);
```

Identical to `print`, writing to standard error.

```verum
eprint(f"Error: could not open {path}");
```

## Assertions

Assertions are runtime checks that call `panic` on failure. Under
`@verify(static)` or `@verify(formal)`, the SMT engine also checks
them at compile time — a failing assertion with a provable
counter-example is a compile error.

### `assert`

```verum
fn assert(condition: Bool);
fn assert(condition: Bool, message: Text);
```

Panics unless `condition` is `true`.

```verum
assert(x > 0);
assert(list.len() > 0, "list must be non-empty");
```

### `assert_eq` / `assert_ne`

```verum
fn assert_eq<T: Eq + Debug>(left: T, right: T);
fn assert_ne<T: Eq + Debug>(left: T, right: T);
```

Panics with both values formatted when inequality is detected (or
equality for `assert_ne`). Faster than writing `assert(a == b)` — the
failure message includes the actual values.

```verum
assert_eq(result, expected);
assert_ne(connection_id, 0);
```

### `debug_assert`

```verum
fn debug_assert(condition: Bool);
fn debug_assert(condition: Bool, message: Text);
```

Same as `assert`, but **elided in release builds** (`verum build
--release`). Use for expensive invariants in hot paths.

```verum
debug_assert(balance >= 0, "invariant broken after ledger update");
```

## Control flow

These functions return the **never type** (`!`). The compiler treats
their callers as diverging — no further code in the scope is reachable.

### `panic`

```verum
fn panic(message: Text) -> !;
fn panic(args: ...Display) -> !;
```

Terminates the current task or process with an error message. In a
thread, unwinds (if unwinding is enabled) and propagates to the
nursery; in `#[no_std]`, aborts.

```verum
panic(f"unexpected state {state}");
panic("not implemented for tagged variant");
```

### `unreachable`

```verum
fn unreachable() -> !;
fn unreachable(message: Text) -> !;
```

Panics with an "unreachable code reached" message. Use in match arms
that exhaust the input but cannot be proven exhaustive to the
compiler, or at points invariants guarantee never execute.

```verum
match tag {
    Kind.Read  => handle_read(),
    Kind.Write => handle_write(),
    _ => unreachable(),
}
```

### `unimplemented`

```verum
fn unimplemented() -> !;
fn unimplemented(reason: Text) -> !;
```

Panics with "not yet implemented". Semantically equivalent to
`todo()`; use `unimplemented` when you plan to leave the body
unimplemented (e.g. an interface stub the user must fill).

### `todo`

```verum
fn todo() -> !;
fn todo(note: Text) -> !;
```

Panics with "todo". Use during development to leave placeholders.
The `verum lint` tool reports `todo()` calls as warnings.

```verum
fn render(shape: Shape) -> Pixels {
    match shape {
        Shape.Rect(r) => rect_pixels(r),
        Shape.Ellipse(_) => todo("ellipse rendering"),
    }
}
```

## Async primitives

All async built-ins require an async runtime context; see
[async-concurrency](/docs/language/async-concurrency).

### `join`

```verum
async fn join<A, B>(a: Future<A>, b: Future<B>) -> (A, B);
async fn join<A, B, C>(a: Future<A>, b: Future<B>, c: Future<C>) -> (A, B, C);
// …up to 8-ary
```

Runs all futures concurrently. Returns their results as a tuple once
all have completed. If any future panics, the others are cancelled and
the panic is re-raised.

```verum
async fn load_page() -> Page using [Http, Database] {
    let (hdr, body, footer) = join(fetch_header(), fetch_body(), fetch_footer()).await;
    Page { header: hdr, body, footer }
}
```

### `try_join`

```verum
async fn try_join<A, B, E>(
    a: Future<Result<A, E>>,
    b: Future<Result<B, E>>,
) -> Result<(A, B), E>;
// …up to 8-ary
```

Like `join`, but short-circuits on the first `Err`. All tuple items
must have the same error type.

```verum
let (rows, meta) = try_join(db.rows(), db.meta()).await?;
```

### `join_all`

```verum
async fn join_all<T>(futures: Vec<Future<T>>) -> Vec<T>;
```

Runs a variable number of identical-result-type futures. Returns all
results as a `Vec<T>`. Any panic propagates.

### `select_any`

```verum
async fn select_any<T>(futures: Vec<Future<T>>) -> (T, usize, Vec<Future<T>>);
```

Completes when the **first** future completes. Returns the result, the
index of the winning future, and the remaining (unpolled) futures.

```verum
let (winner, idx, rest) = select_any(vec![fast, medium, slow]).await;
print(f"task {idx} won with {winner}");
// `rest` is still live — drop or reawait.
```

### `ready`

```verum
fn ready<T>(value: T) -> Future<T>;
```

Wraps a synchronous value in a `Future<T>` that is immediately ready.
Useful for stubs and control flow that expects a future.

```verum
let fut: Future<Int> = ready(42);
let x = fut.await;      // 42
```

### `pin`

```verum
fn pin<T>(value: T) -> Pin<T>;
```

Pins a value to its current memory location so that self-referential
futures can be polled safely. Most users encounter `pin` only through
the `async` expansion — manual use is rarely needed.

## Format strings (`f"..."`)

Not a function, but tightly coupled to `print`. `f"..."` is a literal
whose `{expr}` splices are type-checked. See
[Tagged Literals](/docs/language/tagged-literals) for the grammar.

Format specifications use the colon separator:

```verum
f"{value:04}"                 // pad with zeros to width 4
f"{price:.2}"                 // 2 decimal places
f"{p:>10}"                    // right-align, width 10
f"{msg:^.20}"                 // centre, truncate to 20
f"{bytes:#x}"                 // hex with 0x prefix
f"{value:?}"                  // debug form
```

Format spec mini-language:

```
[fill][align][sign][#][0][width][.precision][type]
align = < | > | ^
sign  = + | -
type  = x | X | o | b | e | E | f | F | ?
```

## What is *not* a built-in

A few things look built-in but are standard library or grammar
constructs:

- `select { … }` — an expression, not a call. See
  [async-concurrency](/docs/language/async-concurrency).
- `nursery { … }` — an expression with options and handlers.
- `format` — no such function; use `f"..."`.
- `matches!` — Verum uses the `is` operator: `value is Some(x)`.
- `vec!` / `list!` / `hashmap!` — use literal syntax
  (`[1, 2]`, `{k: v, ...}`) or constructors (`List.of(...)`,
  `Map.of(...)`).

## See also

- **[Meta Functions](/docs/reference/meta-functions)** — the `@`-prefix
  compile-time counterparts (`@const`, `@cfg`, `@stringify`).
- **[async-concurrency](/docs/language/async-concurrency)** — `select`,
  `nursery`, `spawn`.
- **[Tagged Literals](/docs/language/tagged-literals)** — `f"..."`.
