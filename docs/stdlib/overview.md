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
Meta     Compile-time            meta, proof, theory_interop
```

Each layer depends only on layers below it. `core` is the root
namespace; users see its children via `mount core.*`.

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
| [`theory_interop`](/docs/stdlib/theory-interop) | Theory registry, translation, coherence audit, JSON-RPC interchange protocol |
| [`context`](/docs/stdlib/context) | scope, providers, context layers |
| [`security`](/docs/stdlib/security) | security labels, regions |
| [`database`](/docs/stdlib/database) | SQLite ("loom" — pure-Verum reimpl), Postgres, MySQL adapters; affine `Transaction`, online backup, hooks, typed pragmas, BLOB I/O, `LISTEN/NOTIFY`, COPY |

## Semantic-honest types — the cheat sheet

| Use this | Not this (in other languages) |
|----------|------------------------------|
| `List<T>` | `Vec<T>`, `vector<T>`, `ArrayList<T>` |
| `Text` | `String`, `str` |
| `Map<K,V>` | `HashMap<K,V>`, `dict`, `std.map` |
| `Set<T>` | `HashSet<T>`, `set<T>` |
| `BTreeMap<K,V>` | `TreeMap<K,V>`, `std.map` |
| `Heap<T>` | `Box<T>`, `unique_ptr<T>` |
| `Shared<T>` | `Arc<T>`, `Rc<T>`, `shared_ptr<T>` (atomically refcounted; CBGR-tracked) |
| `Cow<T>` | `Cow<T>` (clone-on-write borrow, owned-on-mutation) |
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

Configure via `verum.toml`:

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

Source lives at `core/`.

## Stdlib status badge system

Every stdlib module page carries a **conformance status badge** at the
top, rendered by the `<StdlibStatus />` component. The badge tells
readers, at a glance, how thoroughly the module's API contract has
been pinned by the conformance suite at `core-tests/`, and which
defect classes (if any) are still open.

### Status keywords

The four-level status taxonomy is shared between
`core-tests/INVENTORY.md` (the per-module inventory) and the website
(the public-facing API reference). Renaming a status anywhere requires
the same rename in both places.

| Status | Emoji | Meaning |
|---|---|---|
| `complete` | ✅ | All public APIs covered by unit tests; algebraic laws pinned by property tests; cross-stdlib integration verified; audit findings landed or routed. The module's contract is fully exercised end-to-end on both the interpreter (Tier 0) and AOT (Tier 1) paths. |
| `partial` | ⚠️ | A subset of the API surface is covered. The reasons for partial coverage are cited in the module's `audit.md`. Typically: the module sits on top of an upstream defect class (e.g. Iterator.next dispatch) that gates entire feature areas. |
| `regression-only` | ⛔ | The module is **gated** by upstream defects. Few or no public-API tests pass yet — only `@ignore`d regression pins exist (plus a small set of PASS-GUARDs for the bits that work). When the upstream defect closes, removing the `@ignore` on the regression test should turn the suite green automatically. |
| `unaudited` | ❔ | No `core-tests/<module>/` folder exists yet. The module surface is undocumented in conformance terms. New modules start here; aim to graduate to `regression-only` (write the tests, even if they all `@ignore`) before merging. |

### Frontmatter

Each module page declares its status in the YAML frontmatter so
search / sidebar widgets can read it without parsing the body:

```markdown
---
sidebar_position: 3
title: text
description: ...
status: partial
status_detail: 121/218 Text + 75/86 Char + ... unit tests pass on YYYY-MM-DD.
---
```

`status_detail` is a one-line summary of the conformance numbers.
The badge component reads `status` directly; `status_detail` is
mirrored into the visible badge.

### Component usage

```mdx
import StdlibStatus from '@site/src/components/StdlibStatus';

<StdlibStatus
  status="partial"
  detail="121/218 Text + 75/86 Char + … unit tests pass on 2026-05-13."
  defects={[
    {area: 'text', summary: '~18 defect classes — KMP find, Iterator.next dispatch, ...'},
    {area: 'char', summary: '5 defect classes — &mut Char mutation, ...'},
  ]}
  sweepDate="2026-05-13"
/>
```

Props:

- **`status`** — one of `complete | partial | regression-only | unaudited`.
- **`detail`** *(optional)* — string mirroring the
  `status_detail` frontmatter; rendered in the badge body.
- **`defects`** *(optional)* — list of `{area, summary}` rows shown in
  a collapsible defect-class table.
- **`sweepDate`** *(optional)* — last conformance-sweep date.

### Updating status

When a module's conformance numbers change:

1. Update the per-module `core-tests/<...>/audit.md`.
2. Append the new sweep numbers to `core-tests/INVENTORY.md`
   (single-line row; do not restructure the table).
3. Update the module's website page frontmatter (`status`,
   `status_detail`) to reflect the new sweep.
4. Refresh the `<StdlibStatus />` props (`detail`, `defects`).

The same status keywords appear in three places — `INVENTORY.md`, the
module page frontmatter, and the `<StdlibStatus />` `status` prop — to
let parallel agents run audits without coordinating on a single source
of truth.
