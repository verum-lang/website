---
sidebar_position: 1
title: base
description: The Verum prelude — Maybe, Result, Iterator, operator protocols, panic, env, cells.
---

# `core.base` — Foundational types and protocols

Everything in `core.base` is loaded by the prelude — you do not need
to `mount` it. It contains the types and protocols that every other
module assumes.

This page enumerates **every** public item.

| File | What's in it |
|---|---|
| `maybe.vr` | `Maybe<T>`, `MaybeIter<T>`, `collect_maybe`, `flatten_maybe` |
| `result.vr` | `Result<T,E>`, `ResultIter<T>`, `Error` |
| `ordering.vr` | `Ordering` |
| `ops.vr` | `ControlFlow<B,C>`, `Try`, `FromResidual`, `Never`, `Drop` |
| `protocols.vr` | the operator and capability protocols (Eq, Ord, Hash, Clone, Copy, Default, Debug, Display, Send, Sync, Add..Shr, From/Into, Deref/AsRef, Numeric, …) |
| `iterator.vr` | `Iterator` protocol + 30+ adapters |
| `cell.vr` | `Cell`, `RefCell`, `OnceCell`, `LazyCell`, `Ref`, `RefMut` |
| `memory.vr` | `Heap<T>`, `Shared<T>`, `Weak<T>`, `Cow<T>`, `Pin<P>`, `ManuallyDrop<T>`, `MaybeUninit<T>` |
| `panic.vr` | `panic`, `assert`, `unreachable`, `todo`, `catch_unwind`, `PanicInfo` |
| `env.vr` | `args`, `var`, `home_dir`, `os_name`, `arch`, `exit` |
| `data.vr` | `Data` (dynamic JSON-like value), `parse_json` |
| `serde.vr` | `Serialize`, `Deserialize`, `Serializer`, `Deserializer` |
| `error.vr` | `StackFrame`, `Backtrace`, `ErrorProtocol`, `ErrorChain` |
| `log.vr` | `LogLevel`, `Logger`, `LogRecord`, `trace`/`debug`/`info`/`warn`/`error` |
| `coinductive.vr` | corecursive analysis (`CorecursiveCall`, `check_productivity`, `bisimilar_up_to`) |
| `primitives.vr` | inherent methods on `Int`, `Float`, `Bool`, `Char`, `Byte` |

---

## `Maybe<T>` — optional value

```verum
type Maybe<T> is None | Some(T);
```

The Verum equivalent of `Option`. Used wherever a value may be absent.

### Constructing

```verum
let a: Maybe<Int> = Maybe.Some(42);
let b: Maybe<Int> = Maybe.None;

let parsed = "42".parse_int();  // returns Maybe<Int>
```

### Inspecting

```verum
m.is_some() -> Bool
m.is_none() -> Bool
m.contains(&value) -> Bool                 // requires T: Eq
m.is_some_and(f: fn(&T) -> Bool) -> Bool
m.is_none_or(f: fn(&T) -> Bool) -> Bool
```

### Unwrapping

```verum
m.unwrap()                 // panics if None
m.expect("must exist")     // panics with message
m.unwrap_or(default)
m.unwrap_or_else(|| compute())
m.unwrap_or_default()      // requires T: Default
```

### Transforming

```verum
m.map(|x| x + 1)                              // Maybe<U>
m.and_then(|x| if x > 0 { Some(x) } else { None })
m.or_else(|| compute_fallback())
m.map_or(default, |x| x + 1)
m.map_or_else(|| default(), |x| x + 1)
m.filter(|x| *x > 0)
m.flatten()                  // Maybe<Maybe<T>> -> Maybe<T> (T: Default)
```

### Combining

```verum
m.and(other)     // Maybe<U>: Some(_).and(x) = x; None.and(_) = None
m.or(other)      // Maybe<T>: Some(x).or(_) = Some(x); None.or(y) = y
m.xor(other)     // exclusive: Some/None or None/Some
m.zip(other)     // Maybe<(T, U)>
m.zip_with(other, |a, b| a + b)
```

### Result interop

```verum
m.ok_or(error)           // Maybe<T> -> Result<T, E>
m.ok_or_else(|| make_error())
```

### Mutating

```verum
m.take()                       // -> Maybe<T>, leaves *self = None
m.replace(value)               // -> Maybe<T>, sets *self = Some(value)
m.insert(value)                // -> &mut T
m.get_or_insert(value)         // -> &mut T
m.get_or_insert_with(|| compute())
m.get_or_insert_default()      // T: Default
m.take_if(|x| should_take(x))
```

### Iteration

```verum
for x in m.iter() { ... }       // 0 or 1 element
for x in m.iter_mut() { ... }
```

### Module-level helpers

```verum
collect_maybe(iter)        // Iterator<Maybe<T>> -> Maybe<List<T>> (all-or-nothing)
flatten_maybe(items)       // &List<Maybe<T>> -> List<T>  (skip None)
flatten_maybe_iter(iter)   // Iterator<Maybe<T>> -> List<T>
```

### `?` operator

`?` propagates `None` from a `Maybe`-returning function:

```verum
fn first_word(text: &Text) -> Maybe<Text> {
    let space = text.find(" ")?;       // returns None early
    Maybe.Some(text.slice(0, space))
}
```

### Pitfall — accidental swallowing

`m.unwrap_or(default)` discards the information that the value was
absent. When the absence might indicate a bug, prefer `expect` (with
a precise message) so the panic carries diagnostic value.

---

## `Result<T, E>` — fallible value

```verum
type Result<T, E> is Ok(T) | Err(E);
```

The canonical error type. By convention `E` is a dedicated error
enum (`type ParseError is …`) or, for quick code, `Text`.

### Constructing

```verum
let r: Result<Int, Text> = Result.Ok(42);
let r: Result<Int, Text> = Result.Err("bad");
```

### Inspecting

```verum
r.is_ok() -> Bool
r.is_err() -> Bool
r.is_ok_and(|v| *v > 0)
r.is_err_and(|e| matches(e, Error.Timeout))
```

### Conversion

```verum
r.ok()       // Result<T,E> -> Maybe<T>
r.err()      // Result<T,E> -> Maybe<E>
```

### Unwrapping

```verum
r.unwrap()                 // E: Debug; panics on Err
r.unwrap_err()             // T: Debug; panics on Ok
r.expect("must succeed")
r.expect_err("must fail")
r.unwrap_or(default)
r.unwrap_or_else(|e| recover(e))
r.unwrap_or_default()      // T: Default
```

### Transforming

```verum
r.map(|t| t + 1)                       // Result<U,E>
r.map_err(|e| ApiError::wrap(e))       // Result<T,F>
r.map_or(default, |t| t + 1)
r.map_or_else(|e| handle_err(e), |t| t + 1)
r.and_then(|t| further(t))             // flatmap on Ok
r.or_else(|e| recover(e))              // flatmap on Err
r.and(other)                           // (Ok(_), x) -> x; (Err(e), _) -> Err(e)
r.or(other)
r.flatten()                            // Result<Result<T,E>,E> -> Result<T,E>
```

### Borrowing & inspection

```verum
r.as_ref()         // Result<T,E> -> Result<&T, &E>
r.as_mut()         // -> Result<&mut T, &mut E>
r.inspect(|t| log(t))      // pass-through with side effect on Ok
r.inspect_err(|e| log(e))  // pass-through with side effect on Err
```

### Iteration

```verum
for v in r.iter() { ... }       // 0 elements on Err, 1 on Ok
for v in r.iter_mut() { ... }
```

### `Error` (lightweight catch-all)

```verum
type Error is { message: Text };
let e = Error.new("something broke");
```

Implements `Debug + Display + Describable + Eq + Clone`. Useful when
you do not yet have a typed error hierarchy. Replace with a dedicated
error enum (`type MyError is | NotFound | Timeout(Duration)`) once
the failure modes stabilise.

### `?` operator

In a function returning `Result<_, E>`, the `?` operator unwraps an
`Ok` or returns the `Err` early — converting via `From` if necessary.

```verum
fn load_config() -> Result<Config, Error> {
    let bytes = fs::read("config.toml")?;
    let text  = Text.from_utf8(&bytes)?;
    toml::parse(&text)
}
```

### Pitfall — `unwrap` in libraries

`unwrap` is fine in tests and prototypes. In library code, prefer
`?` and let the caller decide. `expect("invariant: …")` is acceptable
when you can articulate why panic is the only sane response.

---

## `Ordering`

```verum
type Ordering is Less | Equal | Greater;
```

The result of `cmp`. Total ordering primitives.

```verum
o.is_less() / o.is_equal() / o.is_greater()
o.is_le() / o.is_ge()
o.reverse()                 // Less <-> Greater
o.then(other)               // lexicographic chain
o.then_with(|| compute())   // lazy chain
o.to_int()                  // -1 / 0 / 1
Ordering.from_int(n)        // parse from -1/0/1
```

Lexicographic comparison idiom:

```verum
fn cmp(a: &Person, b: &Person) -> Ordering {
    a.last.cmp(&b.last)
        .then_with(|| a.first.cmp(&b.first))
        .then_with(|| a.age.cmp(&b.age))
}
```

---

## `ControlFlow<B, C>` and `Try`

```verum
type ControlFlow<B, C> is Continue(C) | Break(B);
```

The protocol behind `?`. You rarely write it directly, but it powers
custom early-return types:

```verum
type Try is protocol {
    type Output;
    type Residual;
    fn from_output(output: Output) -> Self;
    fn branch(self) -> ControlFlow<Residual, Output>;
};

type FromResidual<R> is protocol {
    fn from_residual(residual: R) -> Self;
};
```

`Maybe`, `Result`, and any user-defined sum type can implement `Try`
to participate in the `?` operator.

`Never` (alias `!`) is the bottom type; it can be coerced to any
type. Returned by `panic`, `exit`, infinite loops, etc.

---

## Operator protocols

Implementing these makes your type work with the corresponding
syntax. From `protocols.vr`:

| Protocol | Syntax | Methods |
|---|---|---|
| `PartialEq` | `==`, `!=` | `eq(&self, other: &Self) -> Bool` |
| `Eq` | (marker) | extends `PartialEq` |
| `PartialOrd` | `<`, `<=`, `>`, `>=` | `partial_cmp(&self, other: &Self) -> Maybe<Ordering>` |
| `Ord` | (sortable) | `cmp(&self, other: &Self) -> Ordering`; `min`, `max`, `clamp` |
| `Hash` | hashing | `hash<H: Hasher>(&self, h: &mut H)` |
| `Clone` | `.clone()` | `clone(&self) -> Self`, `clone_from(&mut self, other: &Self)` |
| `Copy` | implicit copy | extends `Clone`; marker only |
| `Default` | `T.default()` | `default() -> Self` |
| `Debug` | `{:?}` | `fmt_debug(&self, f: &mut Formatter) -> FmtResult` |
| `Display` | `{}` | `fmt(&self, f: &mut Formatter) -> FmtResult` |
| `Drop` | scope exit | `drop(&mut self)` |
| `Add<Rhs>` | `a + b` | `add(self, rhs: Rhs) -> Self.Output` |
| `Sub`, `Mul`, `Div`, `Rem`, `Neg` | arithmetic | analogous |
| `BitAnd`, `BitOr`, `BitXor`, `Not`, `Shl`, `Shr` | bitwise | analogous |
| `AddAssign`..`ShrAssign` | `a += b` etc. | in-place compound |
| `Index<Idx>` | `xs[i]` | `index(&self, i: Idx) -> &Self.Output` |
| `IndexMut<Idx>` | `xs[i] = …` | `index_mut(&mut self, i: Idx) -> &mut Self.Output` |
| `Deref` | auto-deref | `deref(&self) -> &Self.Target` |
| `DerefMut` | mutable auto-deref | `deref_mut(&mut self) -> &mut Self.Target` |
| `From<T>` | `T.from(x)` | `from(x: T) -> Self` |
| `Into<T>` | `x.into()` | `into(self) -> T` |
| `TryFrom<T>` / `TryInto<T>` | fallible variants | with `Error` associated type |
| `AsRef<T>` | `&Self -> &T` | `as_ref(&self) -> &T` |
| `AsMut<T>` | `&mut Self -> &mut T` | `as_mut(&mut self) -> &mut T` |
| `Borrow<B>` / `BorrowMut<B>` | hash-key borrowing | `borrow(&self) -> &B` |

### Numeric protocols

```verum
type Zero    is protocol { fn zero() -> Self; fn is_zero(&self) -> Bool; }
type One     is protocol { fn one()  -> Self; fn is_one(&self) -> Bool; }
type Numeric        is protocol;   // implemented by all primitive numerics
type SignedNumeric  is protocol extends Numeric;
type Integer        is protocol extends Atomic;
type SignedInteger  is protocol extends Integer;
type Atomic         is protocol;   // safe for atomic ops
```

### Capability protocols

```verum
type Sized  is protocol;        // statically sized; auto for almost all types
type Send   is protocol;        // safe to move across threads
type Sync   is protocol;        // safe to share `&Self` across threads
type Unpin  is protocol;        // not structurally pinned
type Any    is protocol { fn type_id(&self) -> TypeId; }
```

`Send` and `Sync` are auto-derived; opt out with `!Send` / `!Sync` in
generic bounds (`fn f<T: Send + !Sync>(x: T)`).

### Error protocols

```verum
type Describable is protocol { fn description(&self) -> Text; }
type ErrorSource is protocol extends Describable {
    fn source(&self) -> Maybe<&dyn ErrorSource>;
}
type ErrorProtocol is protocol extends ErrorSource {
    fn message(&self) -> Text;
    fn backtrace(&self) -> Maybe<&Backtrace>;
}
type FromStr  is protocol { fn from_str(s: &Text) -> Result<Self, ParseError>; }
type ToString is protocol { fn to_string(&self) -> Text; }
```

### Implementations the stdlib provides

| Trait | For |
|---|---|
| `Numeric` | every primitive integer + every `Float*` |
| `Integer` | every primitive integer |
| `SignedInteger` | `Int8..Int128`, `Int`, `ISize` |
| `Atomic` | every primitive integer + `Bool` |
| `Hasher` | `DefaultHasher` (FxHash-based, `wrapping_mul` core) |

---

## `Iterator` and adapters

```verum
type Iterator is protocol {
    type Item;
    fn next(&mut self) -> Maybe<Self.Item>;
    fn size_hint(&self) -> (Int, Maybe<Int>);
    // ... 60+ default methods
}
```

### Consuming methods (terminal)

```verum
.count()                 // -> Int
.last()                  // -> Maybe<Item>
.nth(n)                  // -> Maybe<Item>
.advance_by(n)           // -> Result<(), Int>
.collect::<C>()          // -> any C: FromIterator<Item>
.fold(init, |acc, x| ...)   // -> B
.reduce(|a, b| max(a,b))    // -> Maybe<Item>
.try_fold(init, |acc, x| ...)
.scan(state, |st, x| ...)
.all(|x| pred(x))        // -> Bool (short-circuits on false)
.any(|x| pred(x))        // -> Bool (short-circuits on true)
.find(|x| pred(x))       // -> Maybe<Item>
.find_map(|x| ...)       // -> Maybe<U>
.position(|x| pred(x))   // -> Maybe<Int>
.sum()                   // -> Item: Add + Zero
.product()               // -> Item: Mul + One
.min() / .max()          // -> Maybe<Item> (Item: Ord)
.min_by_key(|x| key(x)) / .max_by_key
.min_by(|a,b| cmp) / .max_by
.min_max()               // -> Maybe<(Item, Item)>
```

### Adapter methods (lazy — return new iterators)

```verum
.map(|x| f(x))                // MappedIter
.filter(|x| pred(x))          // FilterIter
.filter_map(|x| ...)          // FilterMapIter
.flat_map(|x| produce_seq(x)) // FlatMapIter
.flatten()                    // FlattenIter — Iter<Iter<T>> -> Iter<T>
.take(n)                      // TakeIter
.skip(n)                      // SkipIter
.take_while(|x| pred(x))      // TakeWhileIter
.skip_while(|x| pred(x))      // SkipWhileIter
.chain(other_iter)            // ChainIter
.zip(other_iter)              // ZipIter
.enumerate()                  // EnumerateIter — yields (Int, Item)
.peekable()                   // PeekableIter — adds .peek()
.dedup()                      // DedupIter — removes consecutive equals
.interleave(other_iter)       // InterleaveIter
.step_by(stride)              // StepByIter
.inspect(|x| log(x))          // InspectIter — pass-through with side effect
.fuse()                       // FuseIter — None stays None
.cycle()                      // CycleIter — repeats forever
.cloned() / .copied()         // Iter<&T> -> Iter<T>
.chunks(n)                    // ChunksIter — windows of n
.windows(n)                   // WindowsIter — sliding window
.intersperse(separator)       // IntersperseIter
.intersperse_with(|| sep())   // IntersperseWithIter
.pairwise()                   // PairwiseIter — yields (Item, Item)
.zip_longest(other)           // ZipLongestIter
.map_while(|x| ...)           // MapWhileIter — stops on None
.by_ref()                     // ByRef — iterate without consuming
```

### Idiomatic chains

```verum
// sum of squares of odd numbers in 0..100
let s: Int = (0..100).filter(|x| x % 2 == 1).map(|x| x * x).sum();

// first prime > 1000
let p = (1001..).find(|n| is_prime(n));

// dedupe a sorted list and join with commas
let csv: Text = sorted.iter().dedup().map(|x| x.to_string())
    .intersperse(",".to_string()).collect();

// produce a Map<Int, List<String>> grouped by length
let by_len: Map<Int, List<Text>> = words.iter()
    .fold(Map.new(), |mut m, w| {
        m.entry(w.len()).or_insert_with(List.new).push(w.clone());
        m
    });
```

### Pitfall — re-using a consumed iterator

Iterators are single-use unless they implement `Clone`. Use `.by_ref()`
when you want to consume only part of an iterator and keep iterating
later.

---

## Cells (interior mutability)

### `Cell<T>` — copy-based, `!Sync`

```verum
let c = Cell.new(0);
c.set(42);
c.get();             // requires T: Clone
c.replace(100);      // returns old value
c.take();            // returns value, leaves Default (T: Default)
c.update(|v| v + 1); // apply function in-place
```

### `RefCell<T>` — runtime-borrow-checked, `!Sync`

```verum
let rc = RefCell.new(Vec.new());
{
    let mut w = rc.borrow_mut();   // panics if any borrow active
    w.push(1);
}
{
    let r = rc.borrow();           // panics if mutable borrow active
    print(f"{r.len()}");
}

// Non-panicking variants:
match rc.try_borrow_mut() {
    Result.Ok(mut w) => { w.push(2); }
    Result.Err(_)    => log("contended"),
}
```

### `OnceCell<T>` — write-once

```verum
let cfg: OnceCell<Config> = OnceCell.new();
cfg.set(load_config()).unwrap();
let value = cfg.get_or_init(|| load_config());
```

### `LazyCell<T>` — lazy computation

```verum
let computed: LazyCell<HeavyResult> = LazyCell.new(|| compute_once());
let result = computed.force();   // computes on first call, caches
```

For thread-safe equivalents, see [`sync`](/docs/stdlib/sync) (`AtomicCell`,
`Mutex`, `RwLock`, `OnceLock`).

---

## Heap, Shared, Cow, Pin

| Type | Semantics |
|---|---|
| `Heap<T>` | unique heap allocation; CBGR-tracked |
| `Shared<T>` | atomically ref-counted; `Send + Sync` if `T: Send + Sync` |
| `Weak<T>` | non-owning ref to a `Shared<T>` (breaks cycles) |
| `Cow<T>` | clone-on-write — borrowed `&T` until you call `.to_mut()` |
| `Pin<P>` | structurally pinned (used for self-referential futures) |
| `ManuallyDrop<T>` | wraps `T` to prevent automatic drop |
| `MaybeUninit<T>` | wraps possibly-uninit memory; safe initialisation |

### `Heap<T>`

```verum
Heap.new(value) -> Heap<T>            // panics on OOM
Heap.new_default() -> Heap<T>         // T: Default
Heap.new_zeroed() -> Heap<T>
Heap.try_new(value) -> Result<Heap<T>, AllocError>

h.as_ref() / h.as_mut()       // CBGR-checked deref
h.into_inner() -> T
h.into_raw() -> &unsafe T     // leaks; pair with from_raw
Heap::from_raw(p) -> Heap<T>  // unsafe
h.leak() -> &mut T

h.generation() / h.epoch() / h.is_valid()       // CBGR introspection
h.is_allocated() / h.is_freed()
h.capabilities()                                // capability bits
```

### `Shared<T>` and `Weak<T>`

```verum
Shared.new(value)       Shared.clone(&s)   s.weak() -> Weak<T>
weak.upgrade() -> Maybe<Shared<T>>
Shared.strong_count(&s) / weak_count
```

### `Cow<T>`

```verum
let c: Cow<List<Int>> = Cow::Borrowed(&xs);
let owned: &mut List<Int> = c.to_mut();   // clones if Borrowed
```

### Raw pointer helpers

```verum
ptr_read(p)        ptr_write(p, value)         // unsafe
drop_in_place(p)   forget(value)               // mem leaks
is_null(p)         null_ptr::<T>()
ptr_offset(p, n)
```

For full memory primitives see [`mem`](/docs/stdlib/mem).

---

## `panic` and assertions

### Panicking

```verum
panic("invariant violated") -> !
panic_at("oops", "src/foo.vr", 12, 4) -> !
abort() -> !            // immediate; no unwinding
exit(code) -> !
```

### Assertions

Core assertions — always on, panic on failure:

```verum
assert(cond, "message")
assert_eq(left, right, "message")     // T: Eq + Debug
assert_ne(left, right, "message")
assert_some(maybe, "expected Some")
assert_none(maybe, "expected None")
assert_ok(result, "expected Ok")
assert_err(result, "expected Err")
```

Extended assertions (added for reference-quality testing — see
**[Tooling → Testing](/docs/tooling/testing)**):

```verum
// Float comparison with tolerance — use this INSTEAD of assert_eq
// on any Float-typed value; direct IEEE-754 equality is almost never
// what you want after arithmetic.
assert_approx_eq(left: Float, right: Float, tolerance: Float = 1e-9, msg: Text)

// Inclusive-range check: fails if v < lo or v > hi.
assert_between<T: Ord>(v: T, lo: T, hi: T, msg: Text)

// Sorted-ascending check over &List<T>. O(n).
assert_is_sorted<T: Ord>(list: &List<T>, msg: Text)

// Membership check. O(n) linear scan.
assert_contains<T: Eq>(list: &List<T>, needle: &T, msg: Text)

// Expects the closure to panic. Succeeds iff it does; fails the
// assertion if the closure returns normally. Implemented via
// catch_unwind.
assert_panics<T>(f: fn() -> T, msg: Text)
```

Debug-only variants — stripped in release builds:

```verum
debug_assert(cond, "msg")
debug_assert_eq(a, b, "msg")
debug_assert_ne(a, b, "msg")
```

### Markers

```verum
unreachable("dead branch") -> !
unreachable_unchecked("dead in release; UB hint") -> !
unimplemented("phase 2") -> !
todo("write me") -> !
```

### Catch panics

```verum
catch_unwind(|| risky()) -> Result<T, PanicInfo>
resume_unwind(panic_info) -> !
```

### Compile-time helpers

```verum
@file()        @line()        @column()
@function()    @module()
@current_location()
```

`PanicInfo` carries `message: Text`, optional `Location { file, line, column }`.
`set_panic_handler(hook)` installs a global hook (`fn(&PanicInfo)`).

### `dbg` — print-and-pass-through

```verum
let total = dbg(items.iter().filter(|x| x.is_active()).count());
// stderr: [src/foo.vr:42] items.iter().filter(...).count() = 17
```

---

## `env` — process environment

### CLI arguments

```verum
args() -> List<Text>            // all argv
arg(i) -> Maybe<Text>
args_count() -> Int
args_os() -> Args               // iterator
```

### Environment variables

```verum
var(key) -> Result<Text, VarError>
var_opt(key) -> Maybe<Text>
set_var(key, value)
remove_var(key)
vars() -> Vars                  // iterator over (Text, Text)
vars_list() -> List<(Text, Text)>
```

`VarError` is `NotPresent | NotUnicode(List<Byte>)`.

### Standard locations

```verum
home_dir() -> Maybe<Text>       // HOME or USERPROFILE
user() -> Maybe<Text>           // USER or USERNAME
path() -> Maybe<Text>           // PATH
shell() -> Maybe<Text>          // SHELL or COMSPEC
locale() -> Maybe<Text>         // LANG / LC_*
temp_dir() -> Text              // TMPDIR/TMP/TEMP or /tmp
```

### Platform info

```verum
os_name() -> Text       // "macos", "linux", "windows"
arch() -> Text          // "aarch64", "x86_64", ...
os_family() -> Text     // "unix" or "windows"
```

### Exit

```verum
exit(code) -> !
exit_success() -> !     // 0
exit_failure() -> !     // 1
```

### Path utilities

```verum
split_paths(path_str) -> List<Text>   // splits PATH-style string
```

---

## `Data` — dynamic typed value

When you genuinely don't know the schema (e.g., reading arbitrary JSON
configuration), `Data` is the JSON-like dynamic value:

```verum
type Data is
    | Null
    | Bool(Bool)
    | Int(Int)
    | Float(Float)
    | Text(Text)
    | Array(List<Data>)
    | Object(Map<Text, Data>);
```

### Construction & parsing

```verum
Data.null()     Data.from_int(42)    Data.from_text("hi")
Data.empty_object()    Data.empty_array()
parse_json(input) -> Result<Data, DataError>
```

### Type predicates and accessors

```verum
d.is_null()  d.is_bool()  d.is_int()  d.is_float()  d.is_text()
d.is_array()  d.is_object()  d.is_number()
d.as_bool()  d.as_int()  d.as_float()  d.as_text()
d.as_array()  d.as_object()
d.as_array_mut()  d.as_object_mut()
d.type_name() -> Text
```

### Object / array operations

```verum
d.get(key)       d.get_mut(key)       d.contains_key(key)
d.set(key, value) -> Result<(), DataError>
d.remove(key) -> Maybe<Data>
d.at(index)      d.at_mut(index)
d.push(value) -> Result<(), DataError>
d.pop() -> Maybe<Data>
d.len()          d.is_empty()
d.keys()         d.values()
```

### Path access, merging, output

```verum
d.path("user.address.city") -> Maybe<&Data>
d.merge(&other)         d.deep_merge(&other)
d.to_json()             d.to_json_pretty()
d.to_string()           d.to_number()
```

### `DataError`

```verum
type DataError is
    | TypeMismatch
    | KeyNotFound(Text)
    | IndexOutOfBounds(Int)
    | ParseError(Text)
    | InvalidCast;
```

For typed schemas, prefer dedicated record types with `@derive(Serialize,
Deserialize)` — see [`serde.vr`](#serialisation--serialize--deserialize) below.

---

## Serialisation — `Serialize` / `Deserialize`

```verum
type Serialize is protocol {
    fn serialize<S: Serializer>(&self, s: &mut S) -> Result<S.Ok, S.Error>;
}
type Deserialize is protocol {
    fn deserialize<D: Deserializer>(d: &mut D) -> Result<Self, D.Error>;
}
```

The format is supplied by an implementation of the dual `Serializer` /
`Deserializer` protocols (one per format: JSON, TOML, YAML, …). Most
user types just `@derive(Serialize, Deserialize)` and let an
external cog (e.g. `toml`, `serde_json`-equivalent) drive the format.

Helper builders:

```verum
ListSerializer::serialize_element(&value)
MapSerializer::serialize_key(&k);  ::serialize_value(&v)
RecordSerializer::serialize_field(name, &value)
```

`SerdeError` is the common error: constructors include
`unexpected_type(expected, found)`, `missing_field(name)`,
`unknown_field(name)`.

---

## `error` — backtraces and chains

```verum
type StackFrame is { function: Text, file: Text, line: Int, column: Int };
type Backtrace  is { frames: List<StackFrame> };

Backtrace::capture() -> Backtrace          // current stack (best-effort)
Backtrace::from_frames(frames) -> Backtrace
bt.frames() / bt.is_empty() / bt.len()
```

### `ErrorProtocol`

```verum
type ErrorProtocol is protocol extends ErrorSource {
    fn message(&self) -> Text;
    fn backtrace(&self) -> Maybe<&Backtrace>;
}
```

### Chain rendering

```verum
format_error_chain(&error) -> Text   // walks .source() and prints all
```

```verum
match result {
    Result.Err(e) => eprint(format_error_chain(&e)),
    Result.Ok(_)  => (),
}
```

---

## `log` — structured logging protocol

```verum
type LogLevel is Trace | Debug | Info | Warn | Error;

type Logger is protocol {
    fn log(&self, record: &LogRecord);
    fn is_enabled(&self, level: LogLevel) -> Bool;
}

type LogRecord is {
    level: LogLevel,
    message: Text,
    module_path: Maybe<Text>,
    file: Maybe<Text>,
    line: Maybe<Int>,
};
```

### Convenience functions (require `Logger` in context)

```verum
fn handle(req: Request) using [Logger] {
    info(&"received request");
    debug(&f"path = {req.path}");
    if !req.is_authenticated() {
        warn(&f"unauthorised access from {req.remote_addr}");
    }
    error(&f"unexpected: {err}");
}
```

### Backends

`NullLogger` (no-op, useful in tests). Real backends are in user code
or third-party cogs (file logger, journald, syslog, …).

---

## `coinductive` — productivity & bisimulation analysis

For corecursive function bodies. Most users will not import this
directly; it backs the `cofix` modifier's productivity check.

```verum
type CorecursiveCall is { callee: Text, guard_depth: Int };
type ProductivityResult is Productive | NonProductive { unguarded: List<Text> };

corec_call(callee, depth)                check_productivity(calls)
is_guarded(call)
observation(label, payload)              trace(steps)
trace_prefix(t, n)
observations_equal(a, b)
bisimilar_up_to(left, right, depth)      // BisimulationResult
```

---

## Primitive methods (`primitives.vr`)

Inherent methods on the built-in numeric / character types. Selected
highlights — see source for full list.

### `Int` (64-bit signed)

```
constants:    Int.MIN  Int.MAX  Int.BITS
predicates:   is_positive, is_negative, is_zero, is_power_of_two
arithmetic:   abs, signum, pow(n), min, max, clamp
checked:      checked_add, checked_sub, checked_mul, checked_div, ...
wrapping:     wrapping_add, wrapping_sub, wrapping_mul, ...
saturating:   saturating_add, saturating_sub, saturating_mul
overflowing:  overflowing_add (-> (T, Bool)), ...
bits:         leading_zeros, trailing_zeros, count_ones, count_zeros,
              swap_bytes, reverse_bits, rotate_left, rotate_right
bytes:        to_le_bytes, to_be_bytes, from_le_bytes, from_be_bytes
conversion:   to_float, to_binary, to_hex, to_octal, to_text, parse_int
euclidean:    div_euclid, rem_euclid
range:        in_range, ilog2, ilog10, abs_diff
```

### `Float` (64-bit)

```
constants:    Float.MIN  Float.MAX  Float.MIN_POSITIVE  Float.NAN
              Float.INFINITY  Float.NEG_INFINITY
classify:     is_nan, is_infinite, is_finite, is_normal,
              is_sign_positive, is_sign_negative
arithmetic:   abs, signum, trunc, fract, round, ceil, floor,
              sqrt, cbrt, pow(n), exp, log, log10, log2
trig:         sin, cos, tan, asin, acos, atan, atan2
hyper:        sinh, cosh, tanh, asinh, acosh, atanh
ops:          min, max, clamp, copysign, fma, hypot
conversion:   to_int, to_bits, from_bits, to_string, parse_float
```

### `Bool`

```
.count()                // count of `true` in a slice (extension idiom)
.to_int()               // 0 or 1
.to_text()              // "true" / "false"
parse_bool(text)
```

### `Char`

```
classify: is_alphabetic, is_numeric, is_whitespace, is_control,
          is_uppercase, is_lowercase
case:     to_uppercase, to_lowercase
encoding: encode_utf8, escape_debug
constants:Char.MIN  Char.MAX  Char.UNICODE_LIMIT
```

### `Byte`

```
is_ascii, is_ascii_digit, is_ascii_alphabetic, is_ascii_whitespace
to_int, to_char, to_text
Byte::from_int(n)
```

---

## IDs and versioning

### `uuid` — RFC 4122 / 9562

```verum
let v4 = Uuid.new_v4();                // 122 bits random
let v7 = Uuid.new_v7();                // 48-bit unix-ms + 74 random bits
let text: Text = v7.to_text();
let back = Uuid.parse(&text)?;
```

v7 is time-ordered — lexicographic sort matches chronological
sort, ideal for DB primary keys (no B-tree fragmentation). The
48-bit timestamp prefix comes from
`core.time.system_time.SystemTime.now().timestamp_millis()`
(wall clock, `clock_gettime(CLOCK_REALTIME)` on Unix); the
remaining 74 random bits come from the platform CSPRNG via
`core.sys.common.random_bytes`.

### `snowflake` — Twitter 64-bit IDs

```verum
let mut gen = Snowflake.new(DEFAULT_EPOCH_MS, worker_id)?;
let id: UInt64 = gen.next_id()?;

// Decompose.
let parts = snowflake.parse(id, DEFAULT_EPOCH_MS);
// { timestamp_ms, worker_id, sequence }
```

Bit layout: `[ 0 | 41-bit unix-ms | 10-bit worker | 12-bit seq ]`.
Monotonically increasing within a worker; the generator surfaces
two distinct clock-regression errors so non-monotone wall clocks
never silently produce non-monotone IDs:

- `ClockRegressed(delta_ms)` — wall clock went backwards relative
  to this generator's last emitted ID.
- `ClockBeforeEpoch(delta_ms)` — wall clock is **earlier** than
  the configured epoch (e.g. embedded systems with an unset RTC
  reading 1970 against the 2010 Twitter epoch, or tests using a
  future epoch). Pre-fix, the underlying subtraction underflowed
  `UInt64` silently and the resulting bit-shifted value produced
  corrupt non-sortable IDs with no error surfaced.

The wall-clock source is `core.time.system_time.SystemTime.now()
.timestamp_millis()` — `clock_gettime(CLOCK_REALTIME)` on
Linux/macOS, `GetSystemTimePreciseAsFileTime` on Windows.

Saturates at 4 M IDs/sec per worker (12-bit sequence wraps each
ms).

Pick UUID v4/v7 for cross-system interop, Snowflake for compact
DB primary keys with explicit worker sharding.

### `nanoid` — URL-safe short IDs

```verum
let id = nanoid.generate();                                 // 21 chars ≈ 126 bits
let short = nanoid.generate_len(10);
let hex = nanoid.generate_with_alphabet(b"0123456789abcdef", 16);
```

Byte-exact compatible with the `nanoid` JS/Go/Rust/Python
libraries. Rejection sampling over the smallest power-of-two
mask covering the alphabet eliminates modulo-bias. Birthday
collision ≈ 1 per 2.4 × 10¹⁸ IDs at default length.

### `semver` — Semantic Versioning 2.0.0

```verum
let v = semver.parse(&Text.from("1.0.0-beta.1+build.5"))?;
// v.major = 1, v.pre_release = ["beta", "1"], v.build_meta = ["build", "5"]

let a = semver.parse(&Text.from("1.0.0-alpha"))?;
let b = semver.parse(&Text.from("1.0.0"))?;
assert(semver.cmp(&a, &b) < 0);      // release > prerelease (§11.3)
```

Strict §9 parser — leading zeros in numeric identifiers
rejected. Full §11 total ordering: major/minor/patch →
prerelease-vs-release → numeric < alphanumeric → fewer
identifiers < more at common prefix equal. Build metadata
ignored in precedence (§10).

### `glob` — shell-style pattern matching

```verum
glob.matches("src/**/*.rs", "src/foo/bar.rs")    // true
glob.matches("*.rs", "src/lib.rs")               // false — * doesn't cross /

let pat = glob.compile("target/**")?;
pat.matches_path("target/debug/verum")           // true
```

| Form | Matches |
| ---- | ------- |
| `*` | sequence of non-separator chars |
| `**` | any number of path segments |
| `?` | single non-separator char |
| `[abc]` / `[a-z]` / `[!abc]` | class / range / negated |
| `\c` | literal `c` |

`**` follows `fnmatch(FNM_PATHNAME \| FNM_LEADING_DIR)` — the
Bazel / Cargo / Jest / `.gitignore` convention.

---

## See also

- **[collections](/docs/stdlib/collections)** — `List`, `Map`, `Set`, `Deque`, `BinaryHeap`, `BTreeMap`, `BTreeSet`.
- **[text](/docs/stdlib/text)** — `Text` (UTF-8 string), `Char`, formatter, regex, tagged literals.
- **[mem](/docs/stdlib/mem)** — CBGR allocator and the implementation under `Heap` / `Shared`.
- **[sync](/docs/stdlib/sync)** — thread-safe equivalents of `Cell`, atomics, `Mutex`, `RwLock`.
- **[Language → patterns](/docs/language/patterns)** — pattern syntax used with `Maybe` / `Result`.
- **[Language → error handling](/docs/language/error-handling)** — `Result`/`Maybe`/`?`/`throws`/`try`/`recover`.
