---
sidebar_position: 2
title: Semantic Honesty
---

# Semantic Honesty

> A type name is a promise about **what a value means**, not **how it
> is stored**.

This single rule, applied consistently, is why Verum reads the way it
does.

## The problem with operational names

In most systems languages, the standard collection is called `Vec<T>`
(Rust), `vector<T>` (C++), or `ArrayList<T>` (Java). The name
describes the layout: a growable array. But consumers of the API
rarely care about the layout. They care that:

- it is ordered;
- they can push to the end in amortised O(1);
- they can index in O(1).

They do not care whether the storage is contiguous, whether it uses
exponential growth, or whether it heap-allocates. Those are
implementation details.

When the name _is_ the implementation detail, you cannot change the
implementation without a breaking rename. When the name is the
meaning, the implementation can evolve — and does.

## How Verum names things

| Concept                           | Type       |
| --------------------------------- | ---------- |
| Ordered collection                | `List<T>`  |
| Key-value mapping                 | `Map<K,V>` |
| Unordered collection              | `Set<T>`   |
| Ordered mapping                   | `BTreeMap<K,V>` |
| Double-ended queue                | `Deque<T>` |
| Priority queue                    | `BinaryHeap<T>` |
| UTF-8 text                        | `Text`     |
| Owned allocation                  | `Heap<T>`  |
| Atomically ref-counted allocation | `Shared<T>` |
| Optional value                    | `Maybe<T>` |
| Fallible result                   | `Result<T, E>` |

`List<T>` does not specify a representation. In today's standard
library it is a contiguous growable buffer. Tomorrow it might dispatch
to a small-buffer optimisation for `N ≤ 8`, or a rope-like structure
for very large `T` where move costs dominate. Your code does not
change.

## Consequences you feel every day

**Testing is clearer.** `fn sum(xs: List<Int>) -> Int` says nothing
about how you pass it in. Mocks, property generators, and test
fixtures compose.

**Documentation is shorter.** API docs read like prose. "Returns a
list of users" is both accurate and precise.

**Refactoring is local.** Changing an internal `List` to a `Deque`
because you need O(1) front-push touches only the definition and the
code that actually relies on queue semantics.

**Verification is easier.** Refinement predicates talk about
logical properties — `self.is_sorted()`, `self.len() > 0` — not about
buffer geometry. SMT solvers have a much easier time with `List` than
with `Vec<T, A: Allocator>`.

## The escape hatch

When you genuinely care about layout (FFI boundaries, cache-locality
micro-optimisation, specific alignment), Verum has you covered:

```verum
// Explicitly request contiguous storage with a growth strategy.
type PackedList<T> is List<T> with [Contiguous, GrowthFactor<2>];

// Or drop to the raw backing store.
@repr(C)
type CBuffer is { ptr: *mut Byte, len: Int, cap: Int };
```

But these appear where they belong — on the perf-critical boundary —
not in the default public API.

## What we pay for

Semantic honesty is not free. The implementation of `List` is
occasionally more complex than a naive `Vec` because the contract must
survive representation changes. The standard library carries a few
strategic traits (`Contiguous`, `Indexable`, `Orderable`) that `Vec`
does not need. This is a deliberate trade: a small increase in stdlib
complexity buys a large reduction in user-code churn over the
lifetime of the language.
