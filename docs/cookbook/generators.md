---
title: Generators (sync and async)
description: 'fn* and async fn* — lazy sequences with yield, combinators, error propagation, backpressure.'
---

# Generators

A generator is a function that produces a sequence **lazily**,
suspending between values instead of computing them all up front.
Verum has two flavours:

- `fn*` — sync generator, returns `Iterator<T>`.
- `async fn*` — async generator, returns `Stream<T>` (consume with
  `for await`).

For the coinductive (observation-oriented) counterpart, see
[language/copatterns](/docs/language/copatterns). Generators are
imperative — you drive them with `yield`; `cofix` functions are
observational — consumers drive them by asking for `.head` / `.tail`.

## Sync generator — `fn*`

```verum
fn* fibonacci() -> Int {
    let (mut a, mut b) = (0, 1);
    loop {
        yield a;
        (a, b) = (b, a + b);
    }
}

for n in fibonacci().take(10) {
    print(f"{n} ");
}
// 0 1 1 2 3 5 8 13 21 34
```

`fn* name() -> T` declares a generator. `yield value` produces the
next item and suspends; execution resumes on the next call to the
iterator's `.next()`.

### With state

```verum
fn* parser_tokens(src: &Text) -> Token {
    let mut i = 0;
    while i < src.len() {
        let tok = lex_one_token(src, &mut i);
        yield tok;
    }
}
```

Internally, the compiler compiles the generator to a **state
machine** — each `yield` is a suspension point. The generator's
local variables become fields of the state.

### Parameterised

```verum
fn* take_from(n: Int, iter: impl Iterator<Int>) -> Int {
    let mut i = 0;
    for x in iter {
        if i >= n { return; }
        yield x;
        i += 1;
    }
}
```

Generators can take arguments and interact with other iterators.

## Consuming sync generators

Generators are iterators; every combinator works:

```verum
let primes: List<Int> = natural_numbers()
    .skip(2)
    .filter(|n| is_prime(*n))
    .take(100)
    .collect();
```

```verum
let total: Int = fibonacci().take(20).sum();
```

The entire `Iterator` protocol applies — `.map`, `.filter`,
`.flat_map`, `.zip`, `.chain`, `.cycle`, `.step_by`, …. See
[`stdlib/base`](/docs/stdlib/base).

## Async generator — `async fn*`

For sequences involving suspension (network, files, streams):

```verum
async fn* lines_from(path: &Path) -> Result<Text, IoError>
    using [FileSystem]
{
    let file = File.open_async(path).await?;
    let mut reader = BufReader.new(file);

    loop {
        let mut line = Text.new();
        match reader.read_line_async(&mut line).await {
            Result.Ok(0)  => return,                            // EOF
            Result.Ok(_)  => yield Result.Ok(line.trim_end().to_text()),
            Result.Err(e) => yield Result.Err(e),
        }
    }
}
```

### Consume with `for await`

```verum
async fn print_file(path: &Path) using [FileSystem, IO] {
    for await result in lines_from(path) {
        match result {
            Result.Ok(line) => print(line),
            Result.Err(e)   => { eprint(f"{e:?}"); break; }
        }
    }
}
```

`for await` is the async analogue of `for`. Each iteration awaits
the next item, so the consumer and producer take turns cooperatively.

### Streams are combinator-friendly

An `async fn*` returns `Stream<T>`; the `Stream` protocol has:

```verum
.map(|x| f(x)) .filter(|x| pred(x)) .take(n) .skip(n)
.chunks(size) .window(size) .throttle(duration) .timeout(duration)
.flatten() .flat_map(|x| stream_expr)
.buffer(max_in_flight) .buffer_unordered(max_in_flight)
.merge(other) .zip(other)
.scan(init, |acc, x| update) .fold_async(init, |acc, x| future)
```

Example: concurrent HTTP fetches with bounded parallelism:

```verum
async fn fetch_all(urls: &List<Url>) -> List<Bytes>
    using [Http]
{
    stream::iter(urls.iter())
        .map(|u| Http.get(u.clone()))
        .buffer_unordered(16)                   // 16 concurrent, order undefined
        .filter_map(|r| async { r.ok() })
        .map(|resp| resp.body().await.unwrap())
        .collect::<List<_>>()
        .await
}
```

## Closing a generator

Generators that hold file handles / sockets / channel receivers
release them in their `Drop` impl. Explicit `close()` is rarely
needed but is available:

```verum
let mut gen = fibonacci();
print(f"{gen.next().unwrap()}");       // 0
print(f"{gen.next().unwrap()}");       // 1
gen.close();                             // release captured resources
```

Dropping `gen` without `close()` has the same effect, unless you
want deterministic cleanup at a specific point.

## Error propagation from generators

An `async fn*` that yields `Result<T, E>` is common. A helper:

```verum
async fn* try_lines(path: &Path) -> Text
    using [FileSystem]
    throws(IoError)
{
    let file = File.open_async(path).await?;
    let mut reader = BufReader.new(file);
    loop {
        let mut line = Text.new();
        if reader.read_line_async(&mut line).await? == 0 { return; }
        yield line.trim_end().to_text();
    }
}
```

With `throws(E)` on an `async fn*`, the generator yields `T` values;
on error, propagation short-circuits the `for await` loop:

```verum
for await line in try_lines(path) {
    process(line);
}
// If the generator threw, the `for await` returns the error.
```

Equivalent to a generator that yields `Result<T, E>`, but more
ergonomic.

## Backpressure

Async generators suspend on `.await` points. A consumer that pulls
slowly throttles a producer that produces fast — **built-in
backpressure**. No channel needed.

```verum
async fn* source() -> Int { loop { yield fetch().await; } }

async fn consumer() {
    for await n in source() {
        slow_process(n).await;                  // source waits for us
    }
}
```

## Generator expression — `gen { ... for ... in ... }`

For one-shot lazy sequences, use the generator expression form —
no need to define a function:

```verum
let nums = gen{ x * 2 for x in 0..1_000_000 };
let first_ten: List<Int> = nums.take(10).collect();
// [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]
```

See [language/comprehensions](/docs/language/comprehensions) — `gen`
is one of five comprehension forms.

## Gotchas

### `yield` outside a `fn*` body

```verum
fn main() {
    yield 42;     // COMPILE ERROR: yield only valid in fn* / async fn*
}
```

### `return value;` in a generator

Generators cannot `return` a value — only a bare `return` to end the
sequence. If you need a final value, yield it and then return.

```verum
fn* until_zero(xs: &List<Int>) -> Int {
    for &x in xs {
        if x == 0 { yield 0; return; }
        yield x;
    }
}
```

### Infinite generators on a `.collect()`

`fibonacci().collect::<List<Int>>()` runs forever. Add a `.take(n)`
before `.collect()` if you want a finite prefix.

### Cancellation only at `.await` points

Async generators honour cancellation only between `.await`s. A long
synchronous block inside an `async fn*` delays cancellation.
Insert `yield_now().await` to add cancellation checkpoints.

## Compile-time vs runtime — generators are VBC

Generators compile to a state machine in VBC. The generator's
captured locals become fields; `yield` becomes a return-plus-resume.
The resulting code is fast — the overhead is roughly the same as a
hand-written iterator struct.

## See also

- **[language/async-concurrency](/docs/language/async-concurrency#generators-fn-and-async-fn)** —
  the grammar.
- **[language/comprehensions](/docs/language/comprehensions)** —
  `gen{ ... }` expressions.
- **[language/copatterns](/docs/language/copatterns)** — `cofix` as
  the observational dual.
- **[`stdlib/base`](/docs/stdlib/base)** — `Iterator`.
- **[`stdlib/async`](/docs/stdlib/async)** — `Stream`.
