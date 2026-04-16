---
sidebar_position: 2
title: Semantic Honesty
description: Types name what values mean, not how they are stored.
---

# Semantic Honesty

> A type name is a promise about **what a value means**, not **how it
> is stored**.

This single rule, applied consistently, is why Verum reads the way it
does — and it is the first of the language's
[design principles](/docs/philosophy/principles). This page explains
what it means, what it costs, and what it forbids.

## The problem with operational names

In most systems languages, the default collection is called `Vec<T>`
(Rust), `vector<T>` (C++), or `ArrayList<T>` (Java). The name
describes the layout: a growable array of contiguous storage.

But consumers of the API rarely care about the layout. They care
that:

- it is ordered;
- they can push to the end in amortised O(1);
- they can index in O(1).

They do not care whether the storage is contiguous, whether it uses
geometric growth, or whether it heap-allocates. Those are
implementation choices.

When the name *is* the implementation, three costs accumulate:

1. **Rename-as-refactor.** Changing `Vec` to `VecDeque` because
   you now also push to the front means changing every call site —
   even the ones that only care that the type is ordered.
2. **Leaky public APIs.** A function signature `fn process(xs:
   &Vec<Int>)` forbids callers from passing a `SmallVec` even when
   the body never touches the tail or the capacity.
3. **Documentation drift.** Type names become micro-optimisation
   hints, not behavioural guarantees. Readers can no longer tell
   whether `HashMap` was chosen for its O(1) average or
   because the programmer only knew one map type.

When the name *is the meaning*, the implementation can evolve — and
does.

## How Verum names things

| Concept                           | Type            | Rejected name    |
|-----------------------------------|-----------------|------------------|
| Ordered collection                | `List<T>`       | `Vec`, `ArrayList` |
| Key-value mapping                 | `Map<K, V>`     | `HashMap`, `Dict` |
| Unordered collection              | `Set<T>`        | `HashSet`         |
| Ordered mapping                   | `BTreeMap<K,V>` | `TreeMap`         |
| Double-ended queue                | `Deque<T>`      | `VecDeque`        |
| Priority queue                    | `BinaryHeap<T>` | `PriorityQueue`   |
| UTF-8 text                        | `Text`          | `String`, `str`   |
| Owned allocation                  | `Heap<T>`       | `Box`             |
| Atomically ref-counted allocation | `Shared<T>`     | `Arc`             |
| Single-threaded ref-counted       | `Rc<T>`         | —                 |
| Optional value                    | `Maybe<T>`      | `Option`, `Optional` |
| Fallible result                   | `Result<T, E>`  | —                 |
| Mutable shared cell               | `Cell<T>`       | `RefCell`         |
| Scoped lifetime pointer           | `&T`            | `*const T`, `*mut T` |
| Opaque foreign handle             | `Opaque<T>`     | `c_void*`         |

### The tough cases

A few names in the table above are *still* implementation-flavoured:

- `BTreeMap<K, V>` — the "B-tree" is a concrete data structure.
- `BinaryHeap<T>` — the "binary heap" is a concrete data structure.
- `Shared<T>` / `Rc<T>` — Verum ships two flavours to reflect the
  **cost** (atomic vs. single-threaded), which is semantic.

The rule is softer than "never mention a data structure". It is:
*never let the name commit to an implementation detail that could
reasonably change.* For `Map<K, V>`, the implementation can swap
between Swiss-table, B-tree, perfect hash, and user-profile-chosen
strategies; the name stays. For `BTreeMap<K, V>`, the "B-tree" is
load-bearing — the user chose a B-tree for its ordered traversal, the
log-time range queries, and its cache behaviour. Calling it just
`OrderedMap` would be a lie (a skip list would satisfy the name
without satisfying the contract).

### `Heap` vs `Box`

`Heap<T>` is an owned allocation on the heap. The name is honest:
*the value lives on the heap*. It does not claim to be a smart
pointer. It does not claim to participate in the borrow checker in
any magical way. It is the thing that keeps a value alive on the
heap.

`Box<T>` has the same semantics but the name — in the languages that
use it — advertises storage (a *box*), not placement. Verum prefers
`Heap<T>` because the rest of the language speaks about
lifetimes — *where* a value lives — while `Box` speaks about layout.

## Consequences you feel every day

### Testing is clearer

```verum
fn sum(xs: &List<Int>) -> Int { ... }
```

says nothing about how you pass it in. Mocks, property generators,
and test fixtures compose freely. In languages where the parameter
type commits to a buffer, every test adapter has to allocate
exactly the advertised layout.

### Documentation is shorter

API docs read like prose. "Returns a list of users" is both accurate
and precise. Documentation for `List<T>` does not need to start with
"an owned, growable, contiguous, heap-allocated buffer of `T`
elements" — because the Verum `List<T>` *is* a list of `T`, and
that's it.

### Refactoring is local

Changing an internal `List` to a `Deque` because you now need O(1)
front-push touches only the definition and the code that relies on
queue semantics. Code that only iterates does not change.

### Verification is easier

Refinement predicates talk about logical properties —
`self.is_sorted()`, `self.len() > 0` — not about buffer geometry.
SMT solvers have a much easier time with `List` than with
`Vec<T, A: Allocator>`. The `Allocator` parameter carries no logical
information; it only exists because the language committed to
exposing it.

### Profile-guided dispatch is possible

Verum's compiler is allowed to substitute a different `List` backing
based on PGO data: a measured workload of mostly prepends might
compile `List<Int>` into a ring-buffer; a workload dominated by
middle-insert might compile the same `List<Int>` into a rope. This
is only possible *because the user did not write down a commitment*.

## The escape hatches

When you genuinely care about layout — FFI boundaries, cache-locality
micro-optimisation, specific alignment — Verum provides explicit
hatches.

### Request a specific backing via capability attenuation

```verum
// Demand contiguous storage with a growth factor:
type PackedList<T> is List<T> with [Contiguous, GrowthFactor<2>];
```

Now `PackedList<Int>` is a `List<Int>` whose implementation *must*
be contiguous and double-on-growth. The attenuated name expresses a
stronger contract; callers that merely want ordered access still
accept `&List<T>` (capability subtyping admits the narrower type).

### Drop to the raw backing store

```verum
@repr(C)
type CBuffer is { ptr: *mut Byte, len: Int, cap: Int };
```

Use when you need to call C code that expects a specific memory
layout. The `@repr(C)` makes the layout decision explicit; the type
does not pretend to be a Verum list.

### Use a tiered reference for performance

The [three-tier reference system](/docs/language/references) is the
most common escape from the semantic layer: upgrade a `&List<T>` to
`&checked List<T>` when escape analysis can prove the CBGR counter
is unnecessary, or to `&unsafe List<T>` when you own the safety
proof.

## What semantic honesty is *not*

- It is not "don't mention implementations anywhere." We mention
  B-trees when the B-tree is the point.
- It is not "use abstract protocols everywhere." Protocols are a
  weaker escape — a function that is *only* generic over `Sequence`
  often pays in both compile time and readability. Concrete
  semantically-honest types are the default; generic protocols are
  the generalisation.
- It is not "forbid operational names in user code." If your program
  legitimately needs a SwissTable, call it `SwissTable`. The rule
  applies to the *standard library's public surface*.

## What we pay for

Semantic honesty is not free. Specifically:

- **Slightly more protocol machinery in the stdlib.** `List<T>`
  implements `Sequence`, `RandomAccess`, `MutableSequence`, and
  `FromIterator<T>` so that functions can be generic over the
  guaranteed properties. This costs a little stdlib complexity.
- **Profile-guided implementation dispatch adds complexity** to the
  build system. PGO data has to be available. When it isn't, a
  sensible default is baked.
- **Teaching cost.** Learners familiar with `Vec` / `HashMap` /
  `Option` spend one or two minutes mapping names. After that they
  read Verum programs faster than they read their origin language.

The trade is deliberate: a small increase in stdlib complexity buys
a large reduction in user-code churn over the lifetime of the
language.

## Where the rule shows up

- **Collections** — [`stdlib/collections`](/docs/stdlib/collections).
- **Memory** — [`stdlib/mem`](/docs/stdlib/mem), [Heap, Shared, Rc].
- **Text** — [`stdlib/text`](/docs/stdlib/text) (`Text`, not `String`).
- **Errors** — [`stdlib/base`](/docs/stdlib/base)
  (`Maybe`, `Result`, no `Option`).
- **Allocation** — [`cookbook/arenas`](/docs/cookbook/arenas).

## See also

- **[Design Principles](/docs/philosophy/principles)** — principle 1.
- **[Comparisons](/docs/philosophy/comparisons)** — how this looks
  next to Rust, Swift, Haskell.
- **[Language Overview](/docs/language/overview)** — where semantic
  honesty fits in the type stack.
- **[`stdlib/collections`](/docs/stdlib/collections)** — the
  collections catalogue.
