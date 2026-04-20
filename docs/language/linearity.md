---
sidebar_position: 8
title: Linear & Affine types
description: Exactly-once and at-most-once resources at the type level, enforced at compile time with zero runtime cost.
---

# Linearity — linear and affine types

> **TL;DR.** A *linear* value must be consumed **exactly once**. An
> *affine* value may be consumed **at most once**. An ordinary value
> is **unrestricted** (used zero or more times). Linearity is a
> compile-time property — it disappears at runtime.

```verum
type affine FileHandle is { fd: Int };   // may be dropped, may not be duplicated
type linear Promise<T> is { pending: Shared<Cell<T>> }; // must be resolved
type Point is { x: Int, y: Int };        // ordinary — dup/drop freely
```

:::info Status
Core infrastructure is implemented (`ResourceKind::{Copy, Affine,
Linear}` in `crates/verum_types/src/affine.rs`, tracked through
`AffineTracker` in the inference pipeline). Drop-checking across
conditional branches and loop carriers is still maturing — see
[Implementation status](#implementation-status) below.
:::

## Why linearity?

Most type systems track **what** a value is. Linearity adds an
orthogonal question: **how many times** you may use it. That is
exactly the question you ask when a value represents a *resource*:

| Resource | Problem without linearity | What linearity gives you |
|---|---|---|
| File handle | Double-close / leak | Close runs **exactly** (linear) or **at most** (affine) once |
| Lock guard | Unlock twice / never | `MutexGuard` can't escape the region that took the lock |
| Network connection | Leaking sockets | Every `Connection` ends in `.close()` — statically |
| Database transaction | Accidental double-commit | `Tx` consumed by `commit()` or `rollback()`, never both |
| Cryptographic nonce | Nonce reuse | `Nonce` is linear — reuse is a type error |
| Physical capability | Accidental duplication | `AdminToken` used once per operation |
| GPU buffer | Free-after-unmap | Mapping consumes the buffer, unmapping restores it |
| One-shot sender | Sending twice | `oneshot::Sender<T>` moves into `.send(v)` and is gone |

Verum's answer — inspired by **substructural type theory** (Girard,
Wadler) and **Linear Haskell** — is a first-class attribute on the
type definition. The compiler then refuses to let you duplicate or
drop values that shouldn't be duplicated or dropped.

### Compared with alternatives

| Approach | Limits | Verum |
|---|---|---|
| Rust move/borrow | Linearity is implicit — every non-`Copy` type is affine, no way to forbid drops. `Drop` trait runs at scope exit. | Explicit `linear` forces consumption; `affine` matches Rust's default. |
| C++ `unique_ptr` | No duplication, but compiler-inserted destructors mean you **always** drop — no "must be consumed" check. | `linear` statically proves consumption. |
| Haskell `LinearTypes` | Linearity is on the arrow (`a %1 -> b`), not the type. Verbose to propagate. | Linearity on the **type** — propagates automatically through records/variants. |
| Session types (e.g. `session-haskell`) | Separate DSL, hard to mix with normal code. | Session types become ordinary linear values — one model. |
| Runtime resource managers | Double-close caught at runtime, if at all. | Caught by the type checker before the program runs. |

## The three resource kinds

Every type in Verum has a **resource kind** — a classification the
compiler derives from the type definition.

```
ResourceKind = Copy      // unrestricted, bit-copyable
             | Affine    // at most once
             | Linear    // exactly once
```

Rules:

- A type is **Copy** if every field/variant-payload is Copy *and*
  the type is not declared `affine` or `linear`. Primitives
  (`Int`, `Float`, `Bool`, `Char`, `()`, function pointers,
  `&checked T`) are Copy.
- A type is **Affine** if it is declared `affine` **or** any field
  is Affine.
- A type is **Linear** if it is declared `linear` **or** any field
  is Linear.

This is the *contagion rule*: structural containers **inherit** the
strongest resource discipline of any payload. It is what makes
linearity composable without annotation.

```verum
type affine FileHandle is { fd: Int };

type MaybeFile is
    | None
    | Some(FileHandle);
// MaybeFile is automatically Affine — the Some payload is Affine
```

## Syntax

```ebnf
linearity_qualifier = 'linear' | 'affine' ;

type_def = visibility , 'type' , [ linearity_qualifier ] , identifier
         , [ generics ] , [ meta_where_clause ]
         , 'is' , type_definition_body ;
```

Both `linear` and `affine` are **contextual** keywords — the three
reserved words of Verum remain `let`, `fn`, `is`. You can still
name a variable `linear` if you really want to.

### Worked syntax

```verum
type affine File is {
    fd: Int,
    path: Text,
};

type linear Connection<S: ProtocolState> is {
    socket: FileHandle,
    state: S,
};

// generic with linearity-aware content
type Box<T> is { inner: Heap<T> };
// Box<Connection<..>> is automatically Linear by contagion.
```

## A first example — unclosable files

```verum
type affine File is { fd: Int };

fn open(path: Text) -> File using [FileSystem] {
    let fd = fs_open(path);
    File { fd: fd }
}

fn close(f: File) using [FileSystem] {
    fs_close(f.fd)
    // f has been moved into this call; it is consumed.
}

fn read_all(f: &File) -> Text using [FileSystem] { ... }
```

Using it:

```verum
fn example() using [FileSystem] {
    let f = open("/etc/hosts");
    let content = read_all(&f);  // borrow, does not consume
    close(f);                    // consume exactly here
    // close(f); // ERROR: f has already been consumed
}
```

If you forget `close(f)`, `f` is merely *dropped* — which `affine`
allows. If you want to make closing **mandatory**, declare it
linear:

```verum
type linear File is { fd: Int };

fn example() using [FileSystem] {
    let f = open("/etc/hosts");
    let _ = read_all(&f);
    // ERROR at end of scope: f is a linear value and has not been consumed
}
```

The same program now refuses to compile until you call `close(f)`
on every control-flow path.

## Moving, borrowing, consuming

Three operations exist on any value; linearity changes which are
allowed.

| Operation | Copy | Affine | Linear |
|---|---|---|---|
| Implicit copy `let b = a; use(a); use(b)` | ✓ | ✗ | ✗ |
| Move `let b = a; use(b)` | ✓ | ✓ | ✓ |
| Drop (end of scope, no consumer) | ✓ | ✓ | ✗ |
| Borrow `&a` / `&mut a` | ✓ | ✓ | ✓ |
| Pattern match without binding | ✓ | ✓ | ✗ |

Borrowing is **always** allowed regardless of linearity. A
reference never consumes its target:

```verum
fn peek(c: &Connection<Open>) -> Text using [Net] { ... }
```

`peek` takes a shared reference; the caller still owns the linear
connection after the call returns.

## Consuming by pattern matching

Destructuring a linear record consumes it and yields the fields
individually, each with its own resource kind:

```verum
type linear Oneshot<T> is { slot: Heap<Cell<T>> };

fn take<T>(o: Oneshot<T>) -> T {
    let Oneshot { slot } = o;   // o is consumed; slot is Linear
    slot.take().unwrap()         // slot is consumed here
}
```

For a linear *variant* type, every arm of the match must consume the
payload:

```verum
type linear Session is
    | Awaiting(OpenSocket)
    | Live(Connection<Open>)
    | Closed;

match s {
    Awaiting(sock)  => sock.close(),     // consumes sock
    Live(conn)      => conn.shutdown(),  // consumes conn
    Closed          => {},                // nothing to consume
}
```

The compiler verifies that **every** arm accounts for the payload.
Falling through without consuming the payload is a type error
(linear) or warning (affine + `#[must_use]`).

## Splitting a linear value

Sometimes one linear value needs to become two, for example a split
of a full-duplex connection into a reader and a writer:

```verum
type linear Duplex is { rx: Reader, tx: Writer };

fn split(d: Duplex) -> (Reader, Writer) {
    let Duplex { rx, tx } = d;
    (rx, tx)
}
```

Both returned halves inherit linearity, so the caller must still
consume each.

## Borrowing a linear value

Linearity does **not** break references. A `&T` or `&mut T` to a
linear `T` is still a freely-copyable borrow during its lifetime:

```verum
type linear Db is { conn: Connection };

fn query_count(db: &Db, sql: Text) -> Int using [SQL] { ... }

fn example(db: Db) {
    let n1 = query_count(&db, "SELECT count(*) FROM users");
    let n2 = query_count(&db, "SELECT count(*) FROM orders");
    // db is still alive and linear; must be consumed below
    db.close();
}
```

Rule of thumb: **linearity governs ownership, references govern
lifetime.** They compose orthogonally, and CBGR (the capability-
based generational reference system) makes the lifetime side safe
without GC.

## Linear function arrows

Verum uses type-level linearity, not arrow-level. But there is one
case where an arrow matters: **higher-order consumers**. A closure
that consumes a linear argument cannot itself be duplicated or its
single argument would be consumed twice. The compiler infers this
automatically:

```verum
fn use_once<T>(f: fn(Linear) -> T) -> T { f(make()) }
// The closure passed in is treated as linear-capturing if it moves
// a linear value into its environment.
```

You rarely need to think about this explicitly; the closure capture
rules make the right kind fall out.

## Linearity and async

`async fn` that takes a linear parameter is fine — the parameter is
consumed at most once per `Future`. But **awaiting a linear future
more than once** is a type error:

```verum
async fn fetch(tok: linear AuthToken) -> Response using [Net] {
    http_get_with(tok).await
}

fn bad(t: linear AuthToken) {
    let fut = fetch(t);
    let r1 = fut.await;
    // let r2 = fut.await; // ERROR: fut is linear, already awaited
}
```

`Future<T>` is itself linear when its task captures linear data.

## Patterns: canonical linear APIs

### Typestate via linear self-parameters

```verum
type linear Pending  is { socket: Socket };
type linear Open     is { socket: Socket, session: Session };
type linear Closed   is {};

implement Pending {
    fn handshake(self) -> Open throws(HandshakeError) {
        let session = negotiate(&self.socket)?;
        Open { socket: self.socket, session: session }
    }
}

implement Open {
    fn send(&mut self, msg: Message) throws(IoError) { ... }
    fn close(self) -> Closed {
        self.socket.shutdown();
        Closed {}
    }
}
```

Every transition **consumes** the old state and **produces** the
new one. The compiler proves you can never send on a closed
connection or close twice.

### Builder with compile-time completeness

```verum
type linear BuilderWithHost<S>    is { url: Text, host: Text };
type linear BuilderWithAuth<S>    is { url: Text, host: Text, auth: Auth };

fn start() -> BuilderEmpty { ... }

implement BuilderEmpty {
    fn host(self, h: Text) -> BuilderWithHost { ... }
}
implement BuilderWithHost {
    fn auth(self, a: Auth) -> BuilderWithAuth { ... }
}
implement BuilderWithAuth {
    fn build(self) -> Request { ... }
}
```

`.build()` is only callable after `.host(..)` and `.auth(..)`.
The intermediate builders are linear, so you cannot drop them
partway through.

### One-shot channels

```verum
type linear Sender<T>   is { ... };
type linear Receiver<T> is { ... };

fn oneshot<T>() -> (Sender<T>, Receiver<T>) { ... }

implement Sender<T> {
    fn send(self, value: T) { ... }  // consumes Sender, cannot send twice
}
implement Receiver<T> {
    async fn recv(self) -> T { ... }
}
```

### Capability tokens

```verum
type linear Nonce is { bytes: [Byte; 12] };

fn encrypt(n: Nonce, plaintext: &[Byte], key: &Key) -> [Byte] {
    // n consumed; impossible to reuse
    ...
}
```

Nonce reuse — the classic cryptographic footgun — becomes a *type
error*. No runtime check, no code review discipline.

## Interaction with other features

### With refinement types

Linearity and refinements are orthogonal. You can have a refined
linear type:

```verum
type linear Buffer is { data: Heap<[Byte]>, len: Int }
    where self.len <= self.data.len();
```

The refinement is checked by SMT; linearity is checked by the
resource tracker. Neither subsumes the other.

### With context system

A linear value flowing through a context boundary is still linear:

```verum
fn run<C>(action: fn(Tx) -> Result using C) -> Result
    using C + [Database]
{
    let tx = db_begin();
    action(tx)  // tx consumed by action, or action errors
}
```

### With CBGR (three-tier references)

References do not consume, regardless of tier:

| Reference | Interaction with linear `T` |
|---|---|
| `&T` | Borrows a linear `T` without consuming. Lifetime managed by CBGR. |
| `&mut T` | Borrows exclusively; caller regains ownership after the borrow ends. |
| `&checked T` | Same semantics; compile-time lifetime proof. |
| `&unsafe T` | Caller must manually document why borrowing does not violate linearity. |

### With copatterns

A `cofix` stream can produce linear values if the consumer drives
it linearly. This is how `async` generators preserve one-shot
semantics.

## Common pitfalls

### "I can't use `match` because every arm moves the value"

That's the point. If every arm moves the linear value out, the
compiler is satisfied. If some arms don't consume, you get an
error — and that's a real bug: a resource leak on that path.

### "I need to share a linear value between tasks"

You can't — that would violate single-consumption. Wrap it in
`Shared<Cell<T>>` or pass it through a channel to the consumer task.
"Shared ownership" and "linearity" are contradictory; linear values
belong to exactly one consumer.

### "I want linear, but my field is `Int`, which is Copy"

Linearity propagates **up**, not **down**. A linear record can
contain Copy fields; reading those fields by pattern match consumes
the record and releases the primitives. The primitives are then
freely usable.

### "Drop runs destructors for me in Rust, why is Verum different?"

Verum's `linear` specifically forbids this convenience because
**silent drops hide bugs**. If you want automatic cleanup at scope
exit, use `affine` plus a `#[must_use]` attribute — the compiler
will warn you but not stop you.

### "I forgot to consume in one branch of an `if`"

Diagnostic:

```
error[E0411]: resource `tx` not consumed on all paths
  --> src/bank.rs:42:5
   |
42 |     if amount > 0 {
   |     ^^^^^^^^^^^^^^
43 |         tx.commit();
   |         --- consumed here
44 |     }
   |     - but on the `else` path, `tx` is still live
   = help: either `tx.commit()` / `tx.rollback()` on both branches,
           or move the use outside the if.
```

## Linearity and generics

A generic over `T: Any` is allowed regardless of `T`'s resource
kind, but the compiler propagates kind constraints:

```verum
fn store<T>(slot: &mut Option<T>, v: T) {
    *slot = Some(v);
}
```

If called with `T` linear, the argument `v` must flow into exactly
one use — in this case, into `Some(v)`, which is one use. The
generic code doesn't care; the instantiation does.

To explicitly require a kind, use a **linearity bound**:

```verum
fn drop_silently<T: Affine>(_: T) {}
// callable only when T is Copy or Affine, never Linear
```

(`Affine` and `Linear` are built-in kind traits; `Copy` is the
default when no bound is given.)

## Linearity and protocols

Protocol methods can take `self`, `&self`, or `&mut self`. On a
linear type, `fn(self)` **consumes** the receiver:

```verum
type linear File is { fd: Int };

implement File {
    fn close(self) { fs_close(self.fd) }     // consumes
    fn size(&self) -> Int { fs_size(self.fd) } // borrows
    fn write(&mut self, bytes: &[Byte]) { ... }
}
```

Protocols that want to be implementable by linear types must
declare the receiver carefully — otherwise implementers can't
provide the method.

## Implementation status

| Feature | Status | Backing file |
|---|---|---|
| `linear` / `affine` type_def | **Stable** | `verum_fast_parser/src/decl.rs` |
| `ResourceKind` tracking | **Stable** | `verum_types/src/affine.rs` |
| Contagion rule (field-driven kind) | **Stable** | `verum_types/src/affine.rs:type_contains_affine` |
| Consume-once on linear `self` | **Stable** | `verum_types/src/infer.rs` |
| Drop-check across `if`/`match` arms | **Maturing** | `affine.rs:check_linear_consumed` |
| Drop-check across loops | **Experimental** | tests under `vcs/specs/L1-core/linearity/` |
| `Linear` / `Affine` kind bounds in generics | **Experimental** | parser understands them, inference partial |
| Linearity-polymorphic arrows | Planned | — |

Track progress in `vcs/specs/L1-core/linearity/` and the roadmap
page.

## FAQ

**Is linearity inherited by `&T`?** No. References are always
unrestricted; only the underlying owner is tracked.

**Can I implement `Clone` for a linear type?** No. That would be a
contradiction — `.clone()` by definition duplicates. You can
implement a `.split(self) -> (Self, Self)` method if the semantics
genuinely permit it (e.g., a read-half/write-half pair).

**Does linearity impact runtime performance?** No. It is a
compile-time discipline. The generated code is identical to what a
Rust programmer would write by hand.

**What about `Shared<T>` and `Heap<T>`?** `Shared<T>` is reference-
counted and therefore duplicable, so it cannot wrap a linear
payload directly. `Heap<T>` is a unique owning box and freely
carries linear payloads.

**What's the difference from Rust's ownership?** Rust's
non-`Copy` types are already affine — move-only, droppable. Verum
adds the **linear** tier for types that must be consumed, and makes
both levels first-class declarations on the type.

**Can I mix linear and non-linear fields?** Yes. The record's
kind is the strongest of its fields. Reading a non-linear field by
pattern match consumes the record.

## See also

- [References and CBGR](./references.md) — how borrows interact with linearity.
- [Memory model](./memory-model.md) — move/copy/drop semantics in Verum.
- [Typestate cookbook recipe](../cookbook/shape-safe.md) — a complete typestate example.
- [Context system](./context-system.md) — linearity-friendly dependency injection.
- Source: `crates/verum_types/src/affine.rs`, `crates/verum_types/src/ty.rs`.
