---
sidebar_position: 1
title: base
---

# `core::base` — Foundational types and protocols

Everything in `core::base` is available without explicit import — the
prelude loads it for every Verum program.

## `Maybe<T>`

```verum
type Maybe<T> is
    | None
    | Some(T);
```

Key methods: `is_some()`, `is_none()`, `unwrap()`, `unwrap_or(d)`,
`map(f)`, `and_then(f)`, `or_else(f)`, `filter(pred)`, `flatten()`.

```verum
let x = Maybe.Some(5);
let y = x.map(|v| v * 2);             // Some(10)
let z = x.and_then(|v| Maybe.Some(v + 1)); // Some(6)
let n = Maybe.None.unwrap_or(42);     // 42
```

`?` propagates `None` from a `Maybe`-returning function.

## `Result<T, E>`

```verum
type Result<T, E> is
    | Ok(T)
    | Err(E);
```

Key methods: `is_ok()`, `is_err()`, `unwrap()`, `unwrap_err()`,
`unwrap_or(d)`, `map(f)`, `map_err(f)`, `and_then(f)`, `or_else(f)`.

```verum
let res: Result<Int, Error> = parse_int(&s)?;   // `?` propagates Err
```

## `Ordering`

```verum
type Ordering is
    | Less
    | Equal
    | Greater;
```

Returned by `Ord::cmp`. Methods: `reverse()`, `then(other)`,
`then_with(f)`, `is_lt()`, `is_eq()`, `is_gt()`.

## Operator protocols

| Protocol | Operators |
|----------|-----------|
| `Add<Rhs=Self>` | `a + b` |
| `Sub`, `Mul`, `Div`, `Rem`, `Neg` | arithmetic |
| `BitAnd`, `BitOr`, `BitXor`, `Not`, `Shl`, `Shr` | bitwise |
| `Index<Idx>` / `IndexMut<Idx>` | `xs[i]` |
| `Eq`, `PartialEq` | `==`, `!=` |
| `Ord`, `PartialOrd` | `<`, `<=`, `>`, `>=` |
| `Zero`, `One`, `Numeric` | numeric literals |

## Core protocols

```verum
type Clone is protocol { fn clone(&self) -> Self; };
type Copy  is protocol extends Clone {};
type Drop  is protocol { fn drop(&mut self); };
type Default is protocol { fn default() -> Self; };
type Debug   is protocol { fn debug(&self, f: &mut Formatter) -> ...; };
type Display is protocol { fn format(&self, f: &mut Formatter) -> ...; };
type Hash    is protocol { fn hash<H: Hasher>(&self, h: &mut H); };
type Send    is protocol {};      // marker
type Sync    is protocol {};      // marker
type From<T> is protocol { fn from(x: T) -> Self; };
type Into<T> is protocol { fn into(self) -> T; };
type AsRef<T> is protocol { fn as_ref(&self) -> &T; };
```

## Iterator

```verum
type Iterator is protocol {
    type Item;
    fn next(&mut self) -> Maybe<Self.Item>;

    // Default methods — dozens provided.
    fn map<B>(self, f: fn(Item) -> B) -> Map<Self, fn(Item) -> B>;
    fn filter(self, pred: fn(&Item) -> Bool) -> Filter<Self>;
    fn fold<B>(self, init: B, f: fn(B, Item) -> B) -> B;
    fn collect<C: FromIterator<Item>>(self) -> C;
    fn sum<T: Add + Zero>(self) -> T where Item = T;
    fn zip<I: Iterator>(self, other: I) -> Zip<Self, I>;
    fn take(self, n: Int) -> Take<Self>;
    fn skip(self, n: Int) -> Skip<Self>;
    fn all(self, pred: fn(Item) -> Bool) -> Bool;
    fn any(self, pred: fn(Item) -> Bool) -> Bool;
    fn count(self) -> Int;
    fn min(self) -> Maybe<Item> where Item: Ord;
    fn max(self) -> Maybe<Item> where Item: Ord;
    // ... and more
};
```

## Cell types

```verum
Cell<T>        // copy-based interior mutability (!Sync)
RefCell<T>     // borrow-checked at runtime (!Sync)
OnceCell<T>    // write-once (!Sync)
LazyCell<T>    // lazy initialisation (!Sync)
```

For thread-safe variants, see [`sync`](/docs/stdlib/sync).

## Panic and control

```verum
panic(msg: Text) -> !           // unwind current task
abort()         -> !            // terminate process
exit(code: Int) -> !            // clean exit
assert(cond: Bool)
assert_eq(a, b)
unreachable()   -> !            // "this code should be dead"
todo(msg: Text) -> !            // placeholder
```

## Environment

```verum
fn args()       -> List<Text>                 using [IO];
fn var(k: Text) -> Maybe<Text>                using [IO];
fn set_var(k: Text, v: Text)                  using [IO];
fn home_dir()   -> Maybe<Path>                using [IO];
fn temp_dir()   -> Path                       using [IO];
fn user()       -> Text                       using [IO];
fn shell()      -> Maybe<Text>                using [IO];
fn locale()     -> Locale                     using [IO];
```

## Also in `base`

- **`Heap<T>`** — owned heap box.
- **`Shared<T>`** — atomically ref-counted heap box.
- **`Rc<T>`** — non-atomic ref-counted heap box (`!Send`, cheaper).
- **`TypeId`**, **`Describable`** — runtime type identity.
- **`Log`** (`log.info`, `log.error`) — structured logging protocol.
- **`Serialize`, `Deserialize`** — serialisation protocols.

## See also

- **[Collections](/docs/stdlib/collections)** — `List`, `Map`, `Set`
  and friends.
- **[Sync](/docs/stdlib/sync)** — thread-safe versions of cell types.
