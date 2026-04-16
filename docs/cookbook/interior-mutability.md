---
title: Interior mutability
description: Mutating through an immutable reference — when, why, and which cell to use.
---

# Interior mutability

Sometimes you need to mutate through an `&T` — the classic cases are
caches, lazy initialisation, reference counting, and memoisation.
Four cells, one decision matrix.

| Cell | Sync? | When to use |
|---|---|---|
| `Cell<T>` | `!Sync` | `T: Copy`, single-threaded, just swap values |
| `RefCell<T>` | `!Sync` | Single-threaded, runtime-checked borrows |
| `OnceCell<T>` | `!Sync` | Single-threaded, write-once |
| `LazyCell<T>` | `!Sync` | Single-threaded, initialise-on-first-access |
| `AtomicU64` etc. | `Sync` | Multi-threaded, primitive-typed |
| `Mutex<T>` | `Sync` | Multi-threaded, any `T: Send` |
| `RwLock<T>` | `Sync` | Multi-threaded, read-mostly |
| `OnceLock<T>` | `Sync` | Multi-threaded, write-once |

## `Cell<T>` — copy swap

```verum
type Counter is { n: Cell<Int> };

implement Counter {
    fn new() -> Counter { Counter { n: Cell.new(0) } }

    fn inc(&self) { self.n.set(self.n.get() + 1); }
    fn get(&self) -> Int { self.n.get() }
}
```

No borrow, no lock — just reads & writes to the `Cell`. `T` must
implement `Copy` (or at least `Clone` for `.get()`).

## `RefCell<T>` — runtime borrow check

```verum
type Notes is { entries: RefCell<List<Text>> };

implement Notes {
    fn new() -> Notes { Notes { entries: RefCell.new(List.new()) } }

    fn add(&self, note: Text) {
        self.entries.borrow_mut().push(note);      // panics if any borrow active
    }
    fn count(&self) -> Int {
        self.entries.borrow().len()
    }
}
```

Non-panicking alternatives:

```verum
match notes.entries.try_borrow_mut() {
    Result.Ok(mut w) => { w.push(note); }
    Result.Err(_)    => log(&"contended"),
}
```

## `OnceCell<T>` — initialise-once

```verum
static LOG_LEVEL: OnceCell<LogLevel> = OnceCell.new();

fn log_level() -> LogLevel {
    *LOG_LEVEL.get_or_init(|| env::var(&"LOG_LEVEL")
        .map(|s| LogLevel::parse(&s).unwrap_or(LogLevel.Info))
        .unwrap_or(LogLevel.Info))
}
```

`.get_or_init(|| ...)` is idempotent — the initialiser runs at most
once, the result is cached.

## `LazyCell<T>` — lazy + cached

```verum
type Config is { data: LazyCell<Data> };

implement Config {
    fn new() -> Config {
        Config { data: LazyCell.new(|| load_config_from_disk()) }
    }
    fn get(&self) -> &Data { self.data.force() }
}
```

Like `OnceCell::get_or_init`, but the initialiser is baked into the
cell. Good for expensive computations you might never need.

## Thread-safe equivalents (`core::sync`)

```verum
// Single-threaded Cell<u64>  →  multi-threaded AtomicU64
static HITS: AtomicU64 = AtomicU64.new(0);
HITS.fetch_add(1, MemoryOrdering.Relaxed);

// Single-threaded RefCell<T>  →  multi-threaded Mutex<T>
let state = Shared.new(Mutex.new(State::default()));

// Single-threaded OnceCell<T>  →  multi-threaded OnceLock<T>
static CONFIG: OnceLock<Config> = OnceLock.new();
let cfg = CONFIG.get_or_init(|| load_config());
```

The API shapes mirror each other deliberately — code moves from
single-threaded to multi-threaded by substituting types.

## Pitfall — two mutable borrows on `RefCell`

```verum
let r = cell.borrow_mut();
let q = cell.borrow_mut();      // PANIC — second mutable borrow
```

`RefCell` tracks borrows at runtime; violation is a panic. Keep
borrow scopes small; end them explicitly (`drop(r);`) before the next
`borrow_mut`.

## Pitfall — using `Cell<T>` for non-`Copy` types

`Cell::get()` copies; for `T: Clone`, use `Cell::take()` + restore:

```verum
let v = cell.take();           // moves out, leaves Default
process(&v);
cell.set(v);
```

## See also

- **[base → cells](/docs/stdlib/base#cells-interior-mutability)**
- **[sync](/docs/stdlib/sync)** — thread-safe primitives.
- **[Shared state](/docs/cookbook/shared-state)** — multi-task sharing.
