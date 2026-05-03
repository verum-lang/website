---
sidebar_position: 1
title: From Rust
description: Concept-by-concept mapping for Rust developers moving to Verum.
---

# Migrating from Rust

Verum will feel familiar to Rust developers. The big-picture mapping
below gets you writing code quickly; subtleties are flagged with
**Differences**.

## Quick reference

| Rust | Verum |
|---|---|
| `struct Foo { x: i32 }` | `type Foo is { x: Int };` |
| `enum Foo { A, B(i32) }` | `type Foo is A \| B(Int);` |
| `trait Foo { ... }` | `type Foo is protocol { ... };` |
| `impl Foo for Bar { ... }` | `implement Foo for Bar { ... }` |
| `impl Bar { fn new() -> Self { ... } }` | `implement Bar { fn new() -> Bar { ... } }` |
| `fn foo() -> Option<i32>` | `fn foo() -> Maybe<Int>` |
| `Option<T>::Some(x)`, `None` | `Maybe.Some(x)`, `Maybe.None` |
| `Result<T, E>` | `Result<T, E>` (same) |
| `Box<T>` | `Heap<T>` |
| `Arc<T>` | `Shared<T>` |
| `Rc<T>` | `Rc<T>` (same) |
| `Vec<T>` | `List<T>` |
| `String`, `&str` | `Text`, `&Text` |
| `HashMap<K, V>` | `Map<K, V>` |
| `HashSet<T>` | `Set<T>` |
| `BTreeMap<K, V>` | `BTreeMap<K, V>` |
| `VecDeque<T>` | `Deque<T>` |
| `BinaryHeap<T>` | `BinaryHeap<T>` |
| `#[derive(Clone)]` | `@derive(Clone)` |
| `#[cfg(feature = "x")]` | `@cfg(feature = "x")` |
| `#[inline]`, `#[cold]` | `@inline`, `@cold` |
| `println!("{x}")` | `print(&f"{x}")` — function + format literal |
| `format!("x = {}", x)` | `f"x = {x}"` — literal, no macro |
| `panic!("msg")` | `panic("msg")` |
| `assert!(cond)` | `assert(cond)` |
| `assert_eq!(a, b)` | `assert_eq(a, b)` |
| `matches!(x, P)` | `x is P` — operator, no macro |
| `vec![1, 2, 3]` | `list![1, 2, 3]` |
| `let _ = expr;` | `let _ = expr;` (same) |
| `?` operator | `?` operator (same) |
| `async fn f() -> T` | `async fn f() -> T` (same) |
| `.await` | `.await` (same) |
| `use std::collections::*;` | `mount std.collections.*;` |
| `mod foo;` | `module foo;` |
| `pub`, `pub(crate)`, `pub(super)` | `pub`, `internal`, `pub(super)` |
| (no equivalent) | `pub(in path)` — restrict to a named subtree |
| (no equivalent) | `protected` — protocol-local, visible to impls |
| `unsafe { ... }` | `unsafe { ... }` (same) |
| `&T` | `&T` (but CBGR-checked) |
| `&'a T` | `&T` — lifetimes usually inferred |
| (no equivalent) | `&checked T` — proven-safe zero-cost reference |
| (no equivalent) | `&unsafe T` — unchecked zero-cost reference |
| `*const T`, `*mut T` | `*const T`, `*mut T` (same) |

---

## Ownership & borrowing

Same core model. Differences:

**No lifetime annotations in signatures (usually).** CBGR's runtime
generation checking absorbs what Rust's lifetime analysis statically
tracked. When the compiler cannot infer, you add lifetimes explicitly
— but that's rare in practice.

**Three reference tiers.** `&T` is CBGR-checked (~0.93 ns per
deref, measured on the `production_targets` bench — a single
cacheline-local generation+epoch compare).
Escape analysis promotes most `&T` to `&checked T` (zero cost) at
compile time. Use `&checked T` **explicitly** when you want the
compiler to refuse code that would otherwise force a runtime check.
`&unsafe T` is for FFI and primitives.

**No "fighting the borrow checker."** Most of what a Rust developer
had to restructure for lifetimes, Verum accepts directly — at a small
runtime cost that escape analysis often eliminates.

---

## Enums → sum types

```rust
// Rust
enum Shape {
    Circle { radius: f32 },
    Square { side: f32 },
    Triangle(f32, f32, f32),
}
```

```verum
// Verum
type Shape is
    | Circle   { radius: Float }
    | Square   { side:   Float }
    | Triangle (Float, Float, Float);
```

Construction is `Shape.Circle { radius: 1.0 }` (with the dot) —
variant constructors are namespaced under the type.

---

## Traits → protocols

```rust
// Rust
trait Display {
    fn fmt(&self, f: &mut Formatter) -> fmt::Result;
}
```

```verum
// Verum
type Display is protocol {
    fn fmt(&self, f: &mut Formatter) -> FmtResult;
}
```

`trait` → `type ... is protocol`. Associated types are `type Item;`
(same). Default methods are provided in the protocol body.

**Protocol extension**:

```verum
type Ord is protocol extends Eq {
    fn cmp(&self, other: &Self) -> Ordering;
}
```

**Coherence**: same "orphan rule" as Rust. At least one of the
protocol or the type must belong to the cog providing the impl.

---

## Error handling

- `Result<T, E>` — identical API (`map`, `map_err`, `and_then`,
  `or_else`, `unwrap`, `unwrap_or_else`, `?`).
- `Option<T>` → `Maybe<T>` — identical API.
- `thiserror`-style error enums: use `@derive(Debug, Display, Error)`.
- `anyhow::Error`: use `core::base::Error` (lightweight catch-all)
  plus your own typed errors where it matters.

**`throws(E)`**: for functions that can throw a specific error type —
like Swift 6. `throw E` inside, `?` to propagate.

**`try { } recover { } finally { }`**: structured error handling.
Like a `match` block but at the statement level, with guaranteed
cleanup.

---

## Iterators

Same mental model. Every collection has `.iter()`, `.iter_mut()`,
`.into_iter()`. All the combinators (`map`, `filter`, `fold`, etc.)
are there. See [stdlib → base → Iterator](/docs/stdlib/base#iterator-and-adapters).

---

## Macros

No `!`. Everything is `@`:

```rust
// Rust
println!("hi {x}");
format!("hi {x}");
vec![1, 2, 3];
#[derive(Clone)]
struct Foo { ... }
```

```verum
// Verum
print(&f"hi {x}");             // function call + format literal
let s = f"hi {x}";             // Text via format literal
list![1, 2, 3];                // macro, but lowercase + no bang
@derive(Clone)
type Foo is { ... };            // attribute
```

**Writing your own procedural macro**: `meta fn` + `quote { ... }`.
See [metaprogramming](/docs/language/meta/overview).

---

## Async

- `async fn`, `.await`, `Future<Output = T>` — same.
- `tokio::spawn` → `spawn`.
- `tokio::task::JoinHandle` → `JoinHandle<T>`.
- `futures::select!` → `select { ... }` — no macro, keyword expression.
- `tokio::sync::mpsc::channel` → `channel::<T>(capacity)`.
- `tokio::time::sleep` → `sleep(duration).await`.
- `async_scoped` / `tokio_scoped` → built-in `nursery { ... }` — fully
  structured concurrency.
- No `Pin<Box<Future>>` boxing for async-trait — protocols support
  async methods natively.

---

## No-std / embedded

`verum.toml`:

```toml
[language]
profile = "systems"          # allows unsafe + raw pointers

[codegen]
tier = "aot"

[runtime]
heap_policy = "adaptive"     # or use @cfg(runtime = "embedded") in code
```

Instead of `#![no_std]`, declare the `systems` profile and gate
allocator-requiring code with `@cfg(runtime = "embedded")`. The
compiler swaps out heap types for stack-allocated equivalents and
links only `core` (no `std`) when the embedded profile is active.

---

## Unsafe

`unsafe { ... }` blocks, `unsafe fn`, `extern "C"` blocks — same
shape. Additional: `&unsafe T` as an explicit reference tier (you
don't need to wrap in an `unsafe` block to hold one; you need `unsafe`
to dereference).

---

## Verification — the new part

This is Verum's reason for being. There is no Rust equivalent.

**Refinement types**:

```verum
fn divide(a: Int, b: Int { self != 0 }) -> Int { a / b }
```

The type system rejects callers who can't prove `b != 0`. The SMT
solver proves it where it can; flow analysis narrows types across
control flow; anywhere the compiler can't prove it, you get a
detailed error with a counter-example.

**Contracts**:

```verum
fn sqrt(x: Float { self >= 0.0 }) -> Float
    where ensures result * result == x    // approximately; SMT-checked
{ ... }
```

Graduate in stages:
1. Start with `@verify(runtime)` — refinements as assertions.
2. Add refinement types where the invariant matters.
3. Upgrade to `@verify(formal)` — SMT proves the obligations.
4. For critical code, `@verify(thorough)` cross-validates the SMT backend.

See [gradual verification](/docs/verification/gradual-verification).

---

## Tooling

| Rust | Verum |
|---|---|
| `cargo new` | `verum new` |
| `cargo build` | `verum build` |
| `cargo run` | `verum run` |
| `cargo test` | `verum test` (libtest-compatible flag set; see below) |
| `cargo bench` | `verum bench` (Criterion-style time budgets, baselines) |
| `proptest!` macro | `@property fn(args)` attribute — built-in, no crate |
| `cargo-llvm-cov` | `verum test --coverage` + `llvm-cov` |
| `cargo check` | `verum check` |
| `cargo doc` | `verum doc` |
| `cargo fmt` | `verum fmt` |
| `cargo clippy` | `verum lint` |
| `cargo publish` | `verum publish` |
| `Cargo.toml` | `verum.toml` |
| `Cargo.lock` | `Verum.lock` |
| `rustup` | not needed — `verum` is a single self-contained binary |

---

## Testing

Verum's testing surface is built into the `verum` binary — no
separate `proptest`, `criterion`, `insta`, or `cargo-llvm-cov` crates
to install. The mental mapping is roughly libtest-shaped, with
property testing native:

```rust
// Rust — separate crates
#[test]
fn add_works() { assert_eq!(1 + 2, 3); }

#[test] #[ignore] fn slow_test() { /* … */ }

#[cfg(test)]
mod tests {
    use proptest::prelude::*;
    proptest! {
        #[test]
        fn add_commutes(a in 0i64.., b in 0i64..) {
            prop_assert_eq!(a + b, b + a);
        }
    }
}
```

```verum
// Verum — built in
@test
fn add_works() { assert_eq(1 + 2, 3); }

@test
@ignore(reason = "slow on CI")
fn slow_test() { /* … */ }

@property
fn add_commutes(a: Int{ it >= 0 }, b: Int{ it >= 0 }) {
    assert_eq(a + b, b + a);
}
```

Notable differences:

- **No `#[cfg(test)]`** — tests live under `tests/`, never inline. The
  per-file structure replaces the `mod tests` boilerplate.
- **No `proptest!` block** — `@property` is an ordinary attribute on
  an ordinary fn. Refinement types feed the generator, eliminating
  most of the `Strategy` boilerplate.
- **Built-in regression DB** — failing seeds persist to
  `target/test/pbt-regressions.json` and replay first; commit it for
  permanent CI coverage. No separate file like `proptest-regressions/`.
- **Built-in baselines** — `verum bench --save-baseline main`,
  `--baseline main`, `--noise-threshold 5.0` ship with the binary. No
  Criterion-style HTML report yet; JSON / Markdown / CSV cover most
  needs.
- **Output formats**: `--format pretty | terse | json | junit | tap | sarif`.
  No need for `cargo2junit` or `tap-junit` adapters.

The full reference is at **[Tooling → Testing](/docs/tooling/testing)**;
the walkthrough at **[Tutorials → Testing walkthrough](/docs/tutorials/testing-walkthrough)**
mirrors the test-driven development loop a Rust dev would expect.

---

## Common first pain-points

1. **"Why no lifetimes?"** — CBGR handles most cases at runtime. Use
   `&checked T` when you want the compiler to promise zero overhead.
2. **"Why does the constructor use a dot?"** — Variants and associated
   functions are namespaced under the type (`Shape.Circle { ... }`,
   `List.new()`). Consistent across records, enums, and protocols.
3. **"Where's `cargo add`?"** — `verum add <dep>`. Same thing.
4. **"How do I `Box<dyn Trait>`?"** — `Heap<dyn Protocol>`.
5. **"Where's `mem::replace`?"** — `core::intrinsics::memory::replace`,
   or `std::mem::take` equivalent: `xs.take()`.
6. **"Why `f"{x}"` not `format!("{x}")`?"** — format strings are
   literals, not macros. The compiler validates them.

---

## See also

- **[Language tour](/docs/getting-started/tour)** — 10-minute crash course.
- **[Philosophy](/docs/foundations/principles)** — why Verum made
  different design choices.
- **[Verification spectrum](/docs/verification/gradual-verification)**
  — the feature Rust doesn't have.
