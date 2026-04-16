---
title: Generators (sync and async)
description: 'fn* and async fn* — lazy sequences with yield.'
---

# Generators

A generator is a function that produces a sequence lazily, suspending
between values instead of computing them all up front.

### Sync generator — `fn*`

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

`fn* name() -> T` declares a generator; `yield value` produces the
next item; the function appears to the caller as
`Iterator<Item = T>`.

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

### Consuming

Generators are just iterators — every iterator combinator works:

```verum
let primes: List<Int> = natural_numbers()
    .skip(2)
    .filter(|n| is_prime(*n))
    .take(100)
    .collect();
```

### Async generator — `async fn*`

For sequences that involve suspension (network, files, streams):

```verum
async fn* lines_from(path: &Path) -> Result<Text, IoError>
    using [IO]
{
    let file = File.open_async(path).await?;
    let mut reader = BufReader.new(file);

    loop {
        let mut line = Text.new();
        match reader.read_line_async(&mut line).await {
            Result.Ok(0) => return,              // EOF
            Result.Ok(_) => yield Result.Ok(line.trim_end().to_string()),
            Result.Err(e) => yield Result.Err(e),
        }
    }
}
```

Consume with `for await`:

```verum
async fn print_file(path: &Path) using [IO] {
    for await result in lines_from(path) {
        match result {
            Result.Ok(line) => println(&line),
            Result.Err(e)   => { eprintln(&f"{e:?}"); break; }
        }
    }
}
```

`async fn*` returns a `Stream<T>` — every `Stream` combinator
(`.map`, `.filter`, `.buffer_unordered`, etc.) works on it.

### Closing a generator

```verum
let mut gen = fibonacci();
println(&f"{gen.next().unwrap()}");       // 0
println(&f"{gen.next().unwrap()}");       // 1
gen.close();                                // releases any held resources
```

Generators that hold file handles / sockets / channel receivers
clean them up in their `Drop` impl. Explicit `close()` is rarely
needed.

### Gotchas

**`yield` outside a `fn*` body** is a compile error.

**`return value;`** in a `fn*` is forbidden — use `return;` only
(no argument) to end the generator. If you need a final value,
`yield` it then `return;`.

**Async generators suspend on `.await`**. A generator consumer that
pulls slowly throttles a generator that produces fast — built-in
backpressure.

### Generator expression — `gen { ... for ... in ... }`

One-shot generators without a function definition:

```verum
let stream = gen { x * 2 for x in 0..1_000_000 };
let first_ten: List<Int> = stream.take(10).collect();
// [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]
```

### See also

- **[async → generators](/docs/stdlib/async#generators)**
- **[base → Iterator](/docs/stdlib/base#iterator-and-adapters)**
- **[async → streams](/docs/stdlib/async#streams)** — the async
  iterator protocol.
