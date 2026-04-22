---
title: Interior mutability
description: Mutating through an immutable reference — Cell, RefCell, OnceCell, LazyCell, Atomics, Mutex, RwLock, OnceLock.
---

# Interior mutability

Sometimes you need to mutate through an `&T` — caches, lazy
initialisation, reference counting, memoisation, and occasional
mutable shared state. Verum ships a cell for every scenario.

The rule of thumb: **prefer plain ownership; use a cell only when you
can't**. Interior mutability is an opt-in escape from the usual
immutability rules, and every escape adds cognitive and runtime cost.

## Decision matrix

| Cell              | Sync? | When to use                                                  |
|-------------------|-------|--------------------------------------------------------------|
| `Cell<T>`         | No    | `T: Copy`, single-threaded, just swap values.                |
| `RefCell<T>`      | No    | Single-threaded, runtime-checked borrows.                    |
| `OnceCell<T>`     | No    | Single-threaded, **write-once**.                             |
| `LazyCell<T>`     | No    | Single-threaded, initialise-on-first-access.                 |
| `AtomicU64`, …    | Yes   | Multi-threaded, primitive-typed.                             |
| `Mutex<T>`        | Yes   | Multi-threaded, any `T: Send`; one writer at a time.         |
| `RwLock<T>`       | Yes   | Multi-threaded, read-mostly.                                 |
| `OnceLock<T>`     | Yes   | Multi-threaded, write-once.                                  |
| `AtomicArc<T>`    | Yes   | Multi-threaded, swap whole values atomically.                |

## `Cell<T>` — copy swap

```verum
type Counter is { n: Cell<Int> };

implement Counter {
    pub fn new() -> Counter { Counter { n: Cell.new(0) } }

    pub fn inc(&self) { self.n.set(self.n.get() + 1); }
    pub fn get(&self) -> Int { self.n.get() }
}
```

Note `inc(&self)` — takes a shared reference, not `&mut`. `Cell`'s
`set` / `get` work through `&self` because the cell is the opt-out.

**`T` must implement `Copy`** for `.get()`. For `Clone`, use `.take()`
(replaces the cell's value with `Default::default()`) + restore.

```verum
let v: Text = cell.take();               // moves out, leaves ""
process(&v);
cell.set(v);                              // restore
```

## `RefCell<T>` — runtime borrow check

```verum
type Notes is { entries: RefCell<List<Text>> };

implement Notes {
    pub fn new() -> Notes { Notes { entries: RefCell.new(List.new()) } }

    pub fn add(&self, note: Text) {
        self.entries.borrow_mut().push(note);     // panics on concurrent borrow
    }
    pub fn count(&self) -> Int {
        self.entries.borrow().len()
    }
    pub fn snapshot(&self) -> List<Text> {
        self.entries.borrow().clone()
    }
}
```

`RefCell` enforces **one `borrow_mut` or many `borrow`** at runtime.
Violation panics. Keep borrow scopes small; drop explicitly if
needed:

```verum
let r = cell.borrow_mut();
// ... update r ...
drop(r);
// ... next borrow now legal ...
```

Non-panicking alternatives:

```verum
match notes.entries.try_borrow_mut() {
    Result.Ok(mut w) => { w.push(note); }
    Result.Err(_)    => log("contended"),
}
```

## `OnceCell<T>` — initialise-once

```verum
static LOG_LEVEL: OnceCell<LogLevel> = OnceCell.new();

fn log_level() -> LogLevel {
    *LOG_LEVEL.get_or_init(|| {
        env::var("LOG_LEVEL")
            .and_then(|s| LogLevel::parse(&s).ok())
            .unwrap_or(LogLevel.Info)
    })
}
```

`.get_or_init(|| ...)` is idempotent — the initialiser runs at most
once, the result is cached.

### `.set()` vs `.get_or_init()`

- `.set(v)` — set if uninitialised; returns `Err(v)` otherwise.
- `.get_or_init(|| compute())` — initialise if needed, return `&T`.
- `.get_or_try_init(|| compute_result())` — ditto, but with
  `Result<T, E>`.

## `LazyCell<T>` — lazy + cached

```verum
type Config is { data: LazyCell<Data> };

implement Config {
    pub fn new() -> Config {
        Config { data: LazyCell.new(|| load_config_from_disk()) }
    }
    pub fn get(&self) -> &Data { self.data.force() }
}
```

Like `OnceCell::get_or_init`, but the initialiser is baked into the
cell. Good for expensive computations you might never need.

## Thread-safe equivalents (`core.sync`)

```verum
// Single-threaded Cell<u64>   →   multi-threaded AtomicU64
static HITS: AtomicU64 = AtomicU64.new(0);
HITS.fetch_add(1, MemoryOrdering.Relaxed);

// Single-threaded RefCell<T>  →   multi-threaded Mutex<T>
let state = Shared.new(Mutex.new(State::default()));

// Single-threaded OnceCell<T> →   multi-threaded OnceLock<T>
static CONFIG: OnceLock<Config> = OnceLock.new();
let cfg = CONFIG.get_or_init(|| load_config());

// Read-mostly shared state    →   RwLock<T>
let cache = Shared.new(RwLock.new(Map.new()));
```

The API shapes mirror each other deliberately — code moves from
single-threaded to multi-threaded by substituting types and
(occasionally) awaiting.

## Atomics

Primitive-sized atomic operations go through the `AtomicT` types in
`core.sync::atomic`:

```verum
type AtomicInt32  is core.sync::atomic::AtomicI32;
type AtomicInt64  is core.sync::atomic::AtomicI64;
type AtomicU64    is core.sync::atomic::AtomicU64;
type AtomicBool   is core.sync::atomic::AtomicBool;
type AtomicUsize  is core.sync::atomic::AtomicUsize;
```

API:

```verum
counter.fetch_add(1, MemoryOrdering.Relaxed);
counter.compare_exchange(old, new, MemoryOrdering.AcqRel, MemoryOrdering.Acquire);
flag.store(true, MemoryOrdering.Release);
let v = flag.load(MemoryOrdering.Acquire);
```

Memory orderings — `Relaxed`, `Acquire`, `Release`, `AcqRel`,
`SeqCst` — follow the C++ model. Use `SeqCst` if you don't know
which ordering you need; it's the conservative choice.

## `Mutex<T>` — single writer, multi-consumer

```verum
let cache = Shared.new(Mutex.new(Map.new()));

async fn record(key: Text, value: Int, cache: &Shared<Mutex<Map<Text, Int>>>) {
    let mut guard = cache.lock().await;
    guard.insert(key, value);
}                                           // guard drops, lock released
```

In Verum, **mutexes are async by default** — acquiring a contested
lock suspends the current task rather than blocking the OS thread.
Use `.lock_blocking()` only inside non-async code (and think twice).

### Poisoning

If a task panics while holding a `Mutex`, the mutex is **poisoned**.
Subsequent `lock()` calls return `Err(PoisonError)` carrying the
still-accessible (but possibly broken) inner value. You decide
whether to recover.

## `RwLock<T>` — many readers, one writer

```verum
let settings = Shared.new(RwLock.new(Settings::default()));

async fn read_setting(key: &Text) -> Maybe<Value>
    using [Settings = Shared<RwLock<Settings>>]
{
    Settings.read().await.get(key).cloned()
}

async fn write_setting(key: Text, value: Value)
    using [Settings = Shared<RwLock<Settings>>]
{
    Settings.write().await.set(key, value);
}
```

`read()` returns a read-only guard; many can coexist. `write()`
returns an exclusive guard. Writer starvation is prevented by the
default scheduling policy.

## `AtomicArc<T>` — swap whole values atomically

For read-heavy, occasionally-replaced state:

```verum
let config = AtomicArc.new(Shared.new(Config::default()));

// Reader — common case, wait-free:
let snapshot = config.load();
process(&snapshot);

// Writer — rare, replaces the whole Arc:
let new_config = Config::load_from_file();
config.store(Shared.new(new_config));
```

Readers never block; writers swap atomically. The old `Config` is
kept alive by existing readers until they release their `Shared<_>`.

## Pitfalls

### Two `borrow_mut` on `RefCell`

```verum
let r = cell.borrow_mut();
let q = cell.borrow_mut();       // PANIC — second mutable borrow
```

Keep borrow scopes small; end them (`drop(r);`) before the next
`borrow_mut`. Or restructure to avoid the nested mutation entirely.

### Holding a `Mutex` guard across `.await`

```verum
let guard = cache.lock().await;
let resp = Http.get(&url).await?;     // HOLDS MUTEX across IO
guard.insert(key, resp);
```

This stalls every other caller until the HTTP finishes. Restructure
to compute outside the lock:

```verum
let resp = Http.get(&url).await?;
cache.lock().await.insert(key, resp);
```

### Cell for non-`Copy` non-`Clone` types

`Cell<Large>` where `Large: !Copy` forces `.take() + restore` —
awkward. Prefer `RefCell` for such types.

### `OnceLock` initialiser panicking

If the initialiser passed to `OnceLock.get_or_init` panics, the
cell **remains uninitialised** — the next call retries. If you want
"failed permanently", use `OnceLock.get_or_try_init(|| ...)` and
handle `Err`.

## See also

- **[`stdlib/base`](/docs/stdlib/base)** — `Cell`, `RefCell`,
  `OnceCell`, `LazyCell`.
- **[`stdlib/sync`](/docs/stdlib/sync)** — thread-safe primitives.
- **[Shared state](/docs/cookbook/shared-state)** — multi-task
  sharing strategies.
- **[Shared ownership](/docs/cookbook/shared-ownership)** — `Shared`,
  `Rc`, `Weak`.
- **[language/memory-model](/docs/language/memory-model)** — the
  ownership foundation interior mutability opts out of.
