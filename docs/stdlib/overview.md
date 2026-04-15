---
sidebar_position: 1
title: Standard Library Overview
---

# Standard Library Overview

The Verum standard library — `core` — is written in Verum. It provides
semantic-honest types, concurrency primitives, I/O, network, math,
and a pure-Verum math library (replacing libc's `libm`).

## Layered architecture

```
Layer 6  Compute                 math, simd
Layer 5  Network                 net (TCP, HTTP, TLS, DNS)
Layer 4  Async                   async, runtime
Layer 3  I/O                     io, term
Layer 2  Collections             collections, sync
Layer 1  Text                    text
Layer 0  Core                    base, mem, intrinsics
Kernel   V-LLSI                  sys
Meta     Compile-time            meta, proof, mathesis
```

Each layer depends only on layers below it. `core` is the root
namespace; users typically see its children via `mount std.*` or
`mount core.*`.

## Top-level modules

| Module | Purpose |
|--------|---------|
| [`base`](/docs/stdlib/base) | `Maybe`, `Result`, `Iterator`, operator protocols, panic, environment |
| [`collections`](/docs/stdlib/collections) | `List`, `Map`, `Set`, `Deque`, `BinaryHeap`, `BTreeMap`, `BTreeSet` |
| [`text`](/docs/stdlib/text) | `Text`, `Char`, formatting, regex, tagged literals |
| [`mem`](/docs/stdlib/mem) | CBGR allocator, `Heap`, `Shared`, reference primitives |
| [`intrinsics`](/docs/stdlib/intrinsics) | compiler intrinsics (SIMD, atomic, memory, CPU) |
| [`io`](/docs/stdlib/io) | files, paths, stdio, processes, `Read`/`Write` protocols |
| [`time`](/docs/stdlib/time) | `Duration`, `Instant`, `SystemTime`, timers |
| [`sys`](/docs/stdlib/sys) | V-LLSI kernel bootstrap (direct syscalls) |
| [`term`](/docs/stdlib/term) | 7-layer TUI framework |
| [`async`](/docs/stdlib/async) | `Future`, `Task`, `Channel`, executors, generators |
| [`sync`](/docs/stdlib/sync) | atomics, mutex, rwlock, condvar, barriers |
| [`runtime`](/docs/stdlib/runtime) | runtime configurations, supervision trees |
| [`net`](/docs/stdlib/net) | TCP, UDP, HTTP, TLS, DNS |
| [`math`](/docs/stdlib/math) | pure-Verum math (libm replacement), linalg, autodiff, tensors, neural networks |
| [`simd`](/docs/stdlib/simd) | portable SIMD types and operations |
| [`meta`](/docs/stdlib/meta) | compile-time programming (tokens, AST, quote, reflection) |
| [`proof`](/docs/stdlib/proof) | proof carrying code, reflection protocol |
| [`mathesis`](/docs/stdlib/mathesis) | ∞-topos of formal theories, Kan extensions |
| [`context`](/docs/stdlib/context) | scope, providers, context layers |
| [`security`](/docs/stdlib/security) | security labels, regions |

## Semantic-honest types — the cheat sheet

| Use this | Not this (in other languages) |
|----------|------------------------------|
| `List<T>` | `Vec<T>`, `vector<T>`, `ArrayList<T>` |
| `Text` | `String`, `str` |
| `Map<K,V>` | `HashMap<K,V>`, `dict`, `std::map` |
| `Set<T>` | `HashSet<T>`, `set<T>` |
| `BTreeMap<K,V>` | `TreeMap<K,V>`, `std::map` |
| `Heap<T>` | `Box<T>`, `unique_ptr<T>` |
| `Shared<T>` | `Arc<T>`, `shared_ptr<T>` |
| `Rc<T>` | `Rc<T>`, `shared_ptr<T>` (single-threaded) |
| `Maybe<T>` | `Option<T>` |
| `Result<T, E>` | `Result<T, E>`, `expected<T, E>` |
| `Deque<T>` | `VecDeque<T>`, `deque<T>` |
| `BinaryHeap<T>` | `BinaryHeap<T>`, `priority_queue<T>` |

## Naming conventions

- Types: `UpperCamelCase` (`List`, `MutexGuard`).
- Protocols: `UpperCamelCase`, verb-ish (`Clone`, `Display`, `Iterator`).
- Functions: `snake_case`.
- Constants: `UPPER_SNAKE_CASE`.
- Modules: `lower_snake_case`.

## Zero FFI

The stdlib has no Rust or C++ dependencies. The bootstrap layer
(`sys`) uses direct syscalls on Linux, libSystem.B.dylib on macOS,
and kernel32/ntdll on Windows — all via Verum's own FFI machinery.
This means:

- Cross-compilation is straightforward.
- Embedded targets are first-class.
- Upgrading the compiler does not change stdlib ABI.

## `core` vs `std` — the allocator boundary

The standard library splits in two at the **allocator line**:

- **`core`** (this is the *root* cog) is **allocator-free**. It has no
  `Heap<T>`, no `Shared<T>`, no dynamic `List<T>`, no heap-backed
  `Text`. Everything lives on the stack or in static storage. `core`
  is the library you can link into a bare-metal target with a 16 KiB
  image budget.
- **`std`** (also spelled `core.*` in imports) is everything else —
  the CBGR allocator, `List`, `Map`, `Set`, `Text`, async runtime, IO,
  network, TUI, tensors. `std` depends on `core`; `core` depends on
  nothing but compiler intrinsics.

| Feature | In `core` | In `std` |
|---------|-----------|----------|
| Primitives (`Int`, `Float`, …) | ✓ | — |
| `Maybe<T>`, `Result<T, E>`, `Ordering` | ✓ | — |
| `Eq`, `Ord`, `Hash`, `Clone`, `Copy`, `Default`, `Debug`, `Display`, `Drop`, `Send`, `Sync`, `Sized` | ✓ | — |
| Operator protocols (`Add`, `Sub`, …, `Try`) | ✓ | — |
| `MaybeUninit<T>`, `@intrinsic("...")` | ✓ | — |
| Panic handling (abort-based) | ✓ | — |
| `Heap<T>`, `Shared<T>`, `Weak<T>` | — | ✓ |
| `List<T>`, `Text`, `Map<K,V>`, `Set<T>` | — | ✓ |
| Async runtime, channels, timers | — | ✓ |
| IO, network, TLS, DNS | — | ✓ |
| `math`, `simd`, `tensor`, `gpu` | — | ✓ |

Embedded and `no_heap` targets automatically compile with `core`
only; attempting to `mount` an `std`-only module triggers a
compile-time error that names the profile mismatch rather than
producing a cryptic link error.

## Tier-specific availability

Some stdlib features require a runtime that supports them:

| Runtime kind | Async | Heap | Threads |
|--------------|-------|------|---------|
| `full` | ✓ | ✓ | ✓ |
| `single_thread` | ✓ | ✓ | 1 |
| `no_async` | compiled to sync | ✓ | optional |
| `embedded` | no | stack-only | 1 |
| `no_runtime` | stubs | no | 1 |

Configure via `Verum.toml`:

```toml
[runtime]
kind = "full"
```

## Browsing the stdlib

```bash
$ verum doc --open core                # generate + open docs
$ verum doc --search "Iterator"        # search
$ verum api --signature "fn map"       # query by signature
```

Source lives at [`verum-lang/verum/core`](https://github.com/verum-lang/verum/tree/main/core).
