---
sidebar_position: 3
title: From Go
description: For Go developers — mapping idioms to Verum.
---

# Migrating from Go

Go and Verum share a taste for small cores and explicit dependencies.
Verum goes further on the type-system axis (generics are first-class,
sum types are real, errors are values but better).

## Quick reference

| Go | Verum |
|---|---|
| `type Foo struct { X int }` | `type Foo is { x: Int };` |
| `type Foo interface { Bar() }` | `type Foo is protocol { fn bar(&self); }` |
| `type MyInt int` (named type) | `type MyInt is (Int);` (newtype) |
| `[]T`, slice | `List<T>` — dynamic; `&[T]` borrowed slice |
| `[N]T`, array | `[T; N]` |
| `map[K]V` | `Map<K, V>` |
| `chan T` (buffered) | `let (tx, rx) = channel<T>(capacity: N)` |
| `chan T` (unbuffered) | `let (tx, rx) = channel<T>(capacity: 0)` |
| `go f()` | `spawn f()` |
| `select { case ... }` | `select { arm.await => ... }` (keyword expression) |
| `sync.Mutex`, `sync.RWMutex` | `Mutex<T>`, `RwLock<T>` |
| `sync.WaitGroup` | `WaitGroup` |
| `sync.Once` | `Once`, `OnceLock<T>` |
| `ctx.Done()` | task cancellation via `nursery` |
| `defer` | `defer` (same); + `errdefer` for error-only cleanup |
| `panic` / `recover` | `panic` / `recover` block inside `try` |
| `func f() (int, error)` | `fn f() -> Result<Int, Error>` |
| `if err != nil { return err }` | `?` operator |
| `errors.Is` / `errors.As` | pattern matching on error enums |
| `fmt.Printf("x=%d", x)` | `print(&f"x={x}")` |
| `fmt.Sprintf(...)` | `f"..."` format literal |
| `import "foo/bar"` | `mount foo.bar` |
| `package foo` | module path determined by directory structure |
| `unsafe.Pointer` | `&unsafe T` or `*const Byte` |

---

## Structs & interfaces

```go
// Go
type User struct {
    ID    int
    Name  string
    Email string
}

type Stringer interface {
    String() string
}

func (u User) String() string {
    return fmt.Sprintf("User(%d, %s)", u.ID, u.Name)
}
```

```verum
// Verum
type User is { id: Int, name: Text, email: Text };

type Stringer is protocol { fn to_string(&self) -> Text; }

implement Stringer for User {
    fn to_string(&self) -> Text {
        f"User({self.id}, {self.name})"
    }
}
```

**Explicit `implement`** — Verum doesn't auto-satisfy interfaces by
method-set shape. This catches typos, documents intent, and makes
tooling dramatically faster.

---

## Sum types (the thing Go lacks)

In Go, tagged unions are simulated with interfaces or `interface{}`
payloads. In Verum, they're first-class:

```verum
type Shape is
    | Circle { radius: Float }
    | Rectangle { w: Float, h: Float };

fn area(s: Shape) -> Float {
    match s {
        Shape.Circle { radius }     => 3.14 * radius * radius,
        Shape.Rectangle { w, h }    => w * h,
    }
}
```

Match is **exhaustive** — the compiler rejects non-exhaustive `match`.

---

## Goroutines → tasks

```go
go func() { work() }()
```

```verum
spawn async { work() };
```

`spawn` returns a `JoinHandle<T>` (like a bounded Go channel of 1
value) that you can `.await` — recovering both value and panic info.

### Structured concurrency

This is the biggest upgrade. Go's `go f()` has fire-and-forget
semantics; Verum's `nursery` scopes task lifetimes:

```verum
async fn do_all(items: &List<T>) -> List<U> {
    nursery {
        let handles = items.iter()
            .map(|x| spawn process(x.clone()))
            .collect();
        join_all(handles).await
    }
    // ^ guaranteed: every spawned task has completed by this point.
}
```

No "context plumbing" — cancellation propagates through the nursery
scope automatically.

---

## Channels

```go
ch := make(chan int, 10)
go func() { ch <- 42 }()
val := <-ch
```

```verum
let (tx, mut rx) = channel<Int>(capacity: 10);
spawn async move { tx.send(42).await.unwrap(); };
let val = rx.recv().await.unwrap();
```

Verum channels are async-native — `send` / `recv` suspend the task
instead of blocking the thread. Channel types:

- `Channel<T>` (MPSC) — `channel<T>(capacity: N)`.
- `BroadcastChannel<T>` — every receiver sees every message.
- `OneShot<T>` — single send, single receive.

### `select`

```go
select {
case v := <-ch1: handle(v)
case v := <-ch2: handle(v)
case <-time.After(5 * time.Second): timeout()
}
```

```verum
select {
    v = rx1.recv() => handle(v),
    v = rx2.recv() => handle(v),
    _ = sleep(5.seconds()) => timeout(),
}
```

---

## Errors are values

No `err != nil`. Use `Result<T, E>`:

```go
// Go
file, err := os.Open(path)
if err != nil {
    return err
}
defer file.Close()
```

```verum
// Verum
let file = File.open(path)?;
// file auto-drops (which closes it) at end of scope.
```

The `?` does the work. For resource cleanup that shouldn't fire on
error: `defer`. Error-only cleanup: `errdefer`.

---

## Error types

```go
// Go: string-typed or type switch
if errors.Is(err, ErrNotFound) { ... }
```

```verum
// Verum: match on the error enum
match result {
    Result.Err(Error.NotFound(path)) => ...,
    Result.Err(Error.PermissionDenied)  => ...,
    Result.Err(e)                        => ...,
    Result.Ok(value)                     => ...,
}
```

---

## Generics

Go generics (1.18+) are close to Verum's. Differences:

- Bound syntax: `T Comparable` → `T: Eq + Ord`.
- Negative bounds: `T: Send + !Sync` — no Go equivalent.
- Higher-kinded: `<F<_>: Functor>` — no Go equivalent.
- Associated types: first-class in Verum.

---

## Packages

| Go | Verum |
|---|---|
| `package foo` | Implicit — determined by directory |
| `import "foo/bar"` | `mount foo.bar` |
| `init()` functions | `@init` attribute on a regular function |
| `go.mod` | `verum.toml` |
| `go.sum` | `Verum.lock` |
| `go mod tidy` | `verum build` (auto-tidy) |
| `go get example.com/pkg` | `verum add pkg` |
| `go test` | `verum test` |
| `go build` | `verum build` |

Cogs (Verum's packages) follow the orphan rule: implementations must
live in the cog that defines either the protocol or the implementing
type. Use newtype wrappers for cross-cog glue.

---

## No `nil`

`nil` doesn't exist. Use `Maybe<T>` for optional values:

```verum
type User is { id: Int, name: Text, manager: Maybe<Heap<User>> };

match user.manager {
    Maybe.Some(m) => print(&f"manager: {m.name}"),
    Maybe.None    => print(&"top-level"),
}
```

No `nil`-pointer dereferences by construction.

---

## Performance

- **CBGR references (~0.93 ns check, measured)** are roughly the
  cost of a Go bounds-check — far cheaper than a refcount bump.
  Escape analysis eliminates the check entirely for references
  that can be promoted to `&checked T`.
- **Native binaries via LLVM** with aggressive optimisation — expect
  0.9–1.0× C speeds.
- **No GC.** Memory management via RAII + CBGR. No GC pauses.
- **`Mutex<T>` is async-aware**: contention suspends the task, not the
  thread — same behaviour as `sync.Mutex` in Go's GMP scheduler.

---

## Tooling

| Go | Verum |
|---|---|
| `go test ./...` | `verum test` |
| `go build -race` | `verum build --profile race` (compiles with race detector) |
| `go fmt` | `verum fmt` |
| `go vet` | `verum lint` |
| `golangci-lint` | `verum lint` (linter suite) |
| `godoc -http` | `verum doc --open` |
| `pprof` | `verum profile` |
| `go test -bench` | `verum bench` |
| `delve` (debugger) | `verum dap` (DAP server) |

---

## Common first pain-points

1. **"Why protocols not duck typing?"** — explicit `implement` blocks
   make intent clear and catch typos.
2. **"Where's `context.Context`?"** — use Verum's context system:
   `using [Logger, Database, Clock]` in the signature, `provide` at
   the caller. No plumbing.
3. **"Where's `error` as the second return value?"** — `Result<T, E>`
   is a single return value; `?` is the error plumbing.
4. **"Why is `Sender<T>` cloneable?"** — Verum channels are MPSC
   (multi-producer, single-consumer); clone the sender, keep the
   receiver. Go's channels are MPMC by default (different tradeoff).

---

## See also

- **[Language tour](/docs/getting-started/tour)**
- **[Refinement types](/docs/language/refinement-types)** — types that
  do domain modelling for you.
- **[Structured concurrency](/docs/language/async-concurrency#nursery--structured-concurrency)**
  — the part Go is adding via experimental proposals; Verum has it now.
