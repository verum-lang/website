---
sidebar_position: 8
title: Functions
---

# Functions

## Anatomy

```verum
pub async fn fetch_user<T: Parse>(id: UserId) -> Result<T, Error>
    using   [Http, Logger, Cache]
    throws  (NetworkError | ParseError)
    where   ensures result is Ok(u) => u.id == id
{
    Logger.info(f"fetching user {id}");
    let bytes = Http.get(f"/users/{id}").await?;
    T.parse(&bytes)
}
```

From outside in:

- `pub` — visibility.
- `async` — returns a `Future<Result<T, Error>>`.
- `fn` — function.
- `<T: Parse>` — type parameters with bounds.
- `(id: UserId)` — parameters with refined types.
- `-> Result<T, Error>` — return type.
- `using [...]` — context clause (effects / capabilities).
- `throws (...)` — typed error boundary.
- `where ensures ...` — postcondition (refinement on the return value).
- `{ ... }` — body.

## Function modifiers

Order matters. The full list, in order:

| Modifier | Meaning |
|----------|---------|
| `pub` / `internal` / `protected` | visibility |
| `pure` | compiler-verified to have no side effects |
| `meta` / `meta(N)` | compile-time executable (staged) |
| `async` | returns a future |
| `cofix` | coinductive fixpoint (corecursive) |
| `unsafe` | bypasses safety guarantees |

Not every combination makes sense; the compiler enforces the legal
subset (e.g. `pure async` is allowed; `pure unsafe` is not).

## Parameters

Parameter patterns, not just names:

```verum
fn area({width, height}: &Rect) -> Float {
    width * height
}

fn process((head, tail): &(Item, List<Item>)) { ... }
```

The receiver parameter uses the dedicated forms:

```verum
fn method(&self) { ... }          // immutable borrow
fn mutate(&mut self) { ... }      // mutable borrow
fn consume(self) { ... }          // by value
fn checked(&checked self) { ... } // proven-safe borrow
```

## Return

The last expression in the body is the return value. `return expr;`
is a control-flow operator for early return.

Functions with no explicit return type return `()`.

## Generator functions

```verum
fn* fibonacci() -> Iterator<Int> {
    let (mut a, mut b) = (0, 1);
    loop {
        yield a;
        (a, b) = (b, a + b);
    }
}

async fn* stream_events() -> AsyncIterator<Event> using [Ws] {
    while let Maybe.Some(e) = Ws.next().await {
        yield e;
    }
}
```

- `fn*` — sync generator, returns `Iterator<T>`.
- `async fn*` — async generator, returns `AsyncIterator<T>`.

## Loop invariants and decreases

Loops inside verified functions take two clauses:

```verum
while lo < hi
    invariant 0 <= lo && hi <= xs.len()
    decreases hi - lo
{
    ...
}
```

- `invariant` — must hold at entry and after each iteration.
- `decreases` — a well-founded measure that strictly decreases every
  iteration. Proves termination.

## Contracts

### `requires` — preconditions

```verum
fn divide(a: Int, b: Int) -> Int
    where requires b != 0
{
    a / b
}
```

### `ensures` — postconditions

```verum
fn abs(x: Int) -> Int
    where ensures result >= 0,
          ensures result == x || result == -x
{
    if x >= 0 { x } else { -x }
}
```

Multiple clauses are conjoined.

## Error handling

```verum
fn parse_port(s: Text) -> Result<Int, Error>
    throws(ParseError)
{
    let n = s.parse::<Int>()?;
    if n < 0 || n > 65535 {
        throw ParseError.OutOfRange(n);
    }
    Ok(n)
}
```

- `?` propagates a `Result.Err` or `Maybe.None`.
- `throw E` constructs and propagates an error, valid only when `throws(...)` is declared.

## Closures

```verum
let square     = |x| x * x;
let typed      = |x: Int| -> Int { x * x };
let async_task = async |url| Http.get(url).await;
```

Closures capture their environment by the minimum capability needed
(immutable reference, mutable reference, or by-move).

## Forward declarations

In `extern` blocks and protocol bodies, `fn` ends with `;` instead of
a body:

```verum
extern "C" {
    fn malloc(size: Int) -> &unsafe Byte;
    fn free(ptr: &unsafe Byte);
}

type Describable is protocol {
    fn describe(&self) -> Text;
}
```
