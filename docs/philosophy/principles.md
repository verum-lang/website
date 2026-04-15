---
sidebar_position: 1
title: Design Principles
description: The six principles that shape every decision in Verum.
---

# Design Principles

Languages are shaped more by what their designers refuse to do than by
what they embrace. Verum's six principles are stated as constraints.

## 1. Semantic honesty over operational familiarity

A type's name describes what it **means**, not how it is laid out.

| Verum    | What it is          | Not called  |
| -------- | ------------------- | ----------- |
| `List`   | ordered collection  | `Vec`       |
| `Text`   | UTF-8 string        | `String`    |
| `Map`    | key-value mapping   | `HashMap`   |
| `Set`    | unordered collection| `HashSet`   |
| `Heap`   | owned allocation    | `Box`       |
| `Shared` | atomic-refcounted   | `Arc`       |
| `Maybe`  | optional value      | `Option`    |

The implementation of `Map<K, V>` may be a Swiss-table, a B-tree, or a
perfect-hash table chosen by profile feedback. The name does not lie by
committing to a data structure it may not use.

## 2. Verification is a spectrum, not a binary

A program is not "verified" or "unverified." It occupies a point on a
five-level ladder:

```
runtime  →  static  →  smt  →  portfolio  →  certified
```

- **runtime**: `assert!` equivalents.
- **static**: compile-time dataflow, refinement checks, CBGR.
- **smt**: refinement obligations discharged to Z3 or CVC5.
- **portfolio**: both solvers, cross-validated.
- **certified**: machine-checkable proof terms.

A single program can — and typically does — use all five. Choose the
strength that matches the risk.

## 3. No hidden state, no hidden effects

Every function's signature tells the truth about what it needs.

```verum
fn process(order: Order) using [Database, Logger, Clock] -> Result<Invoice, Error>
```

No global loggers. No ambient runtimes. No thread-local singletons
pretending not to exist. A function that touches the database says
`Database`. A function that reads the clock says `Clock`. The
alternative — hiding dependencies in `static mut` — makes testing,
verification, and reasoning impossibly non-local.

## 4. Zero-cost is the default; you pay for what you ask for

Every safety feature has three modes:

- **Free**: compiler proved it; the check is elided.
- **Cheap**: runtime check under 20 ns.
- **Explicit**: you opted into a runtime check for a reason.

`&T` costs ~15 ns per dereference because CBGR generational checking is
doing real work. `&checked T` costs 0 ns because the compiler proved it
could not dangle. `&unsafe T` costs 0 ns because you asserted it. There
is no fourth option that pretends the check is free when it isn't.

## 5. No magic

- **No `println!` macro**: `print` is a function in `core::io`.
- **No `!` suffix anywhere**: macros use `@` prefix.
- **No hidden `Box` insertion**: `Heap(x)` is explicit.
- **No implicit `clone()`**: you write it.
- **No `derive(Trait)` that synthesises surprising instances**: derive
  expansions are visible and deterministic.

## 6. Radical expressiveness where it earns its keep

Verum ships dependent types, cubical HoTT, higher-inductive types,
higher-rank polymorphism, existentials, linear logic, session types,
and synthetic differential geometry — but they live in opt-in parts of
the type system. Write a CRUD service and you never see `Path<A>(a, b)`.
Write a verified kernel and `Path` is the reason you are here.

---

The rest of this site is the operational consequence of these
principles. If something feels surprising, the chapter you want is
probably in **[Philosophy](/docs/philosophy/semantic-honesty)**.
