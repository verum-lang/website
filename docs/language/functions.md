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

Order matters. The full list, from the grammar
(`function_modifiers` in `verum.ebnf`):

| Modifier | Meaning | Implies |
|----------|---------|---------|
| `pub` / `internal` / `pub(super)` / `pub(in path)` | visibility | — |
| `pure` | compiler-verified no side effects | `using [!IO, !State<_>, !Random]` |
| `meta` / `meta(N)` | compile-time executable at stage N | `pure`; may `using` meta contexts only |
| `async` | returns `Future<Output = T>` | caller must `.await` or `spawn` |
| `cofix` | coinductive fixpoint (corecursive) | must satisfy a productivity check |
| `unsafe` | may perform unchecked operations | callers require `unsafe { ... }` block |

The compiler checks legal combinations:

| Combination | Valid? | Note |
|-------------|--------|------|
| `pure async` | ✓ | pure w.r.t. effects; `.await` is a suspension, not a side effect |
| `pure unsafe` | ✗ | `unsafe` admits arbitrary effects |
| `meta async` | ✗ | `meta fn` runs at compile time — no executor |
| `async unsafe` | ✓ | rare: raw async IO kernels |
| `meta(2) pure` | ✓ | multi-stage compile-time, still pure |

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

### `old(expr)` in postconditions

`old(expr)` captures the value of `expr` at function entry — useful
for "delta" contracts:

```verum
fn push<T>(xs: &mut List<T>, x: T)
    where ensures xs.len() == old(xs.len()) + 1
{
    xs.data.push(x);
}
```

### `invariant` + `decreases` — loop contracts

```verum
fn binary_search(xs: &List<Int>, key: Int) -> Maybe<Int>
    where ensures result is Some(i) => xs[i] == key
{
    let (mut lo, mut hi) = (0, xs.len());
    while lo < hi
        invariant 0 <= lo && hi <= xs.len()          // true every iteration
        decreases hi - lo                             // strictly decreasing → termination
    {
        let mid = lo + (hi - lo) / 2;
        match xs[mid].cmp(&key) {
            Ordering.Less    => lo = mid + 1,
            Ordering.Greater => hi = mid,
            Ordering.Equal   => return Some(mid),
        }
    }
    None
}
```

The `invariant` must imply the postcondition when conjoined with the
negation of the loop condition. The `decreases` expression must be a
non-negative, well-founded value that strictly decreases each
iteration — it proves the loop terminates.

### How contracts are discharged

1. `where requires / ensures` clauses generate SMT obligations in
   **Phase 3a** (contracts) and **Phase 4** (semantic analysis).
2. `invariant + decreases` generate loop-local obligations in
   Phase 4.
3. Each obligation is dispatched to Z3, CVC5, or the portfolio per
   the function's `@verify(...)` strategy.
4. Results are cached keyed on SMT-LIB fingerprint and reused
   across incremental builds.

See **[verification → contracts](/docs/verification/contracts)** for
the full semantics and **[cookbook → adding verification](/docs/cookbook/adding-verification)** for a guided walk-through.

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
(immutable reference, mutable reference, or by-move). Force a move
with `move`:

```verum
let name = "Alice".to_string();
let greet = move |greeting| f"{greeting}, {name}!";
// `name` moved into the closure; no longer accessible here.
```

Closure types implement `Fn` / `FnMut` / `FnOnce` protocols:

| Protocol | Captures | Can call | Meaning |
|----------|----------|----------|---------|
| `Fn` | `&self` | multiple times | read-only closure |
| `FnMut` | `&mut self` | multiple times | may mutate captures |
| `FnOnce` | `self` | once | consumes captures |

In function signatures use `fn(T) -> U` for thin function pointers
(no captures) and `impl Fn(T) -> U` or `dyn Fn(T) -> U` for
closures with captures.

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
