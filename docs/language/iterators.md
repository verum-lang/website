---
title: Iterators
description: The Iterator protocol, lazy adapters, terminators, and the reference rules that decide how many stars a closure parameter needs.
---

# Iterators

An iterator is any type that answers `next`:

```verum
type Iterator is protocol {
    type Item;
    fn next(&mut self) -> Maybe<Self.Item>;
};
```

Everything else in this page — thirty-odd adapters, twenty terminators,
`for` loops, comprehensions — is built on that one method. A type that
implements it gets the whole surface for free through the protocol's
default methods.

## Getting one

`iter()` on a collection produces an iterator that **borrows**:

```verum
let xs: List<Int> = [10, 15, 17];
let it = xs.iter();       // yields &Int — xs is untouched
```

This matters more than it first appears, and the section on
[references](#references-and-how-many-stars) below is the one to read if a
closure ever refuses to typecheck.

## Lazy adapters vs eager methods

Verum gives you both, and the difference is visible in the type:

```verum
let a = xs.iter().map(|x| x + 1);   // MappedIter — nothing computed yet
let b = xs.map(|x| x + 1);          // List<Int>   — computed, allocated
```

`xs.iter().map(f)` builds a small record holding the source iterator and
the closure. No element has been touched. `xs.map(f)` walks the list now
and hands back a new one.

Reach for the lazy form when you are going to chain — it fuses the whole
chain into a single pass and allocates nothing in between:

```verum
let n = xs.iter()
          .map(|x| x + 1)
          .filter(|x| *x > 12)
          .count();          // one pass, no intermediate List
```

Reach for the eager form when you want the container itself and there is
no chain to fuse. `xs.map(f)` says that plainly and skips the adapter.

A chain does nothing until a **terminator** asks for a value. `count`,
`sum`, `fold`, `collect`, `any`, `for` — those drive it. Without one, the
chain is just a value sitting in a variable.

## References, and how many stars

`iter()` yields `&T`, so `Self.Item` is `&Int` for a `List<Int>`. Two
rules follow, and together they explain every `*` you will write:

**Arithmetic sees through a reference.** A closure taking `Self.Item`
gets `&Int`, and arithmetic reads the value:

```verum
xs.iter().map(|x| x + 1)      // x is &Int; x + 1 is 11, 16, 18
xs.iter().map(|x| x * x)      // 100, 225, 289
```

**Predicates take a reference to the item**, one level deeper. `filter`,
`any`, `all`, `find` and `position` are declared
`fn(&Self.Item) -> Bool`, so their parameter is `&&Int` and a comparison
needs both stars:

```verum
xs.iter().filter(|n| **n > 12)      // not *n, not n
xs.iter().any(|n| **n > 16)
xs.iter().position(|n| **n == 15)
```

The rule to carry: **transform closures take the item, predicate closures
take a reference to it.** If a comparison complains, add a star; if it
still complains, you are on the transform side and should remove one.

An explicit `*` is always allowed where the value is wanted, and is worth
writing when the expression is dense:

```verum
xs.iter().map(|x| *x * *x)    // same as |x| x * x, easier to read
```

## Adapters

Each returns a new lazy iterator. All of these compose with each other
and with any terminator.

| Adapter | Yields |
|---|---|
| `map(f)` | `f` applied to each item |
| `filter(p)` | items where `p` holds — `p` takes `&Item` |
| `filter_map(f)` | items where `f` returned `Some` |
| `take(n)` | the first `n` |
| `skip(n)` | everything after the first `n` |
| `take_while(p)` | items until `p` first fails |
| `skip_while(p)` | items from the first `p` failure on |
| `step_by(n)` | every `n`-th item |
| `enumerate()` | `(index, item)` pairs |
| `zip(other)` | pairs, stopping at the shorter side |
| `chain(other)` | this iterator, then the other |
| `rev()` | back to front — needs `DoubleEndedIterator` |
| `peekable()` | adds `peek()`, which looks without consuming |
| `inspect(f)` | items unchanged, calling `f` on each |
| `dedup()` | items with consecutive duplicates collapsed |

```verum
xs.iter().take_while(|x| **x < 16).count()    // 2
xs.iter().step_by(2).count()                  // 2
xs.iter().zip(ys.iter()).count()              // min of the two lengths
xs.iter().enumerate()                         // (0, 10), (1, 15), (2, 17)
```

## Terminators

Each consumes the iterator and produces a value.

| Terminator | Returns |
|---|---|
| `count()` | how many items |
| `sum()` / `product()` | the total |
| `fold(init, f)` | `f` folded left over the items |
| `reduce(f)` | like `fold`, seeded with the first item — `Maybe` |
| `collect()` | a container; annotate the binding or write `collect<List<Int>>()` |
| `any(p)` / `all(p)` | `Bool`, short-circuiting |
| `find(p)` / `position(p)` | the first match / its index — `Maybe` |
| `min()` / `max()` / `last()` / `nth(n)` | `Maybe` |
| `partition(p)` | two containers — items where `p` holds, then the rest |
| `for_each(f)` | nothing; calls `f` on each item |

`collect` needs to know what to build. Either annotate the binding or say
it at the call:

```verum
let doubled: List<Int> = xs.iter().map(|n| n * 2).collect();
print(xs.iter().map(|n| n * 2).collect<List<Int>>());
```

`partition` follows the same rule — its two result containers are named
by the binding annotation:

```verum
let (evens, odds): (List<Int>, List<Int>) =
    range(0, 10).partition(|x| *x % 2 == 0);
```

## for loops

`for` drives an iterator directly, and binds the item — no stars needed
in the body for arithmetic:

```verum
for v in xs.iter() {
    print(v * 2);
}

for pair in xs.iter().enumerate() {
    print(pair);            // (0, 10), (1, 15), (2, 17)
}
```

## Writing your own

Implement `next` and the rest of the surface follows:

```verum
type Countdown is { n: Int };

implement Iterator for Countdown {
    type Item = Int;

    fn next(&mut self) -> Maybe<Int> {
        if self.n == 0 { return Maybe.None; }
        self.n = self.n - 1;
        Maybe.Some(self.n)
    }
};
```

A type that can also be walked from the back implements
`DoubleEndedIterator`, which `extends Iterator` and adds `next_back`.
That is what `rev()` requires.

## Current limitation

`rev()` applied **after** an adapter does not currently carry the
adapter's transformation:

```verum
xs.iter().map(|x| x + 1).rev()   // yields 17, 15, 10 — the map is lost
```

`rev()` on an unadapted iterator is correct:

```verum
xs.iter().rev().collect<List<Int>>()          // [17, 15, 10]
```

The same shape affects any user-written `DoubleEndedIterator` whose
`next_back` chains a method onto the inner iterator's `next_back()`.
Binding the intermediate result to an annotated local is a reliable
workaround:

```verum
fn next_back(&mut self) -> Maybe<B> {
    let m: Maybe<A> = self.iter.next_back();
    m.map(self.f)
}
```
