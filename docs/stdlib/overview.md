---
sidebar_position: 1
title: Standard Library Overview
---

# Standard Library Overview

The Verum standard library — `core` — is written in Verum. It provides
semantic-honest types, concurrency primitives, I/O, network, math,
and a pure-Verum math library (replacing libc's `libm`).

## Layered architecture

The layering is not a description — it is **data, and it is enforced**.
`core/rings.toml` declares which ring each module belongs to, and
`scripts/ci/check_core_rings.py` measures the actual `mount` graph
against it on every PR.

Use the ring check to validate a checkout:

```sh
python3 scripts/ci/check_core_rings.py
```

A root mount is counted as a dependency on the full re-export set in
`core/mod.vr`. Use selective module mounts in lower rings when a root
mount would introduce an upward dependency. The ring declarations below
define the allowed direction of dependencies.

```
Ring 5.5  integration-client  the CLIENT halves: sigstore, tuf, oidc,
                              spiffe.workload_api, x509 revocation clients
Ring 5    domain              net, security, database, storage, term, cli,
                              shell, mesh, redis, search, compress, money,
                              protobuf, architecture, theory_interop
Ring 4    language-services   meta, cog, proof, verify, archive, script,
                              diagnostics
Ring 3    runtime             async, runtime, concurrency, context, control,
                              tracing, metrics, signal, cache, action, eval
Ring 2    data                collections, text, encoding, math, simd, logic,
                              io, time, sync, configuration, id
Ring 1.5  byte-primitive      hash, mac, random, subtle,
                              security.{ecc, cipher, aead, kdf}
Ring 1    platform            sys, mem, target  (cohesive)
Ring 0    primitive           base, types, intrinsics,
                              collections.{list, map, set}, text.text  (cohesive)
```

**The law:** a module in ring N depends only on rings below N. A ring
marked *cohesive* is one layer whose members are mutually dependent by
design — `Maybe.ok_or → Result` and `Result.ok → Maybe` are paired
conversions; an atomic that blocks IS a syscall, and the syscall layer
cannot initialise without an atomic. Cutting either edge would duplicate
one side, not improve anything, so cohesion is declared and the cycle
check skips those rings only.

**Placement follows measurement, not topic.** Two consequences a reader
will notice:

* `List`, `Map`, `Set` and `Text` sit in ring 0, not with `collections`
  and `text`. They are the LANGUAGE's vocabulary — `base` uses them in
  384 places and `collections/list.vr` depends on `base`, a genuine
  mutual dependency. The rest of `collections` (btree, deque, lru,
  bloom) and of `text` (regex, formatter) is ring 2.
* Digests, MACs, entropy, constant-time operations and the ciphers,
  AEADs, curves and KDFs sit in ring 1.5, below `security`. They are
  computation over bytes: a Bloom filter needs a hash, not a dependency
  on the crypto stack, and TLS cannot encrypt a packet without an AEAD.

Sub-modules may carry their own ring where the parent's is wrong for
them — `runtime.{thread, pool}` are ring 2 because async is BUILT ON
them, while `runtime.{spawn, supervisor}` are ring 3 because they are
built on async.

## Top-level modules

| Module | Purpose |
|--------|---------|
| [`base`](/docs/stdlib/base) | `Maybe`, `Result`, `Iterator`, operator protocols, panic, environment |
| [`collections`](/docs/stdlib/collections) | `List`, `Map`, `Set`, `Deque`, `BinaryHeap`, `BTreeMap`, `BTreeSet` |
| [`text`](/docs/stdlib/text) | `Text`, `Char`, formatting, regex, tagged literals |
| [`mem`](/docs/stdlib/mem) | CBGR allocator, `Heap`, `Shared`, reference primitives |
| [`intrinsics`](/docs/stdlib/intrinsics) | compiler intrinsics (SIMD, atomic, memory, CPU) |
| [`hash`](/docs/stdlib/hash) | digests grouped by GUARANTEE: `checksum` / `fast` / `crypto` / `legacy` |
| [`mac`](/docs/stdlib/mac) | keyed authentication — HMAC, Poly1305 |
| [`random`](/docs/stdlib/random) | `secure` (platform CSPRNG) vs `deterministic` (reproducible) |
| [`subtle`](/docs/stdlib/subtle) | constant-time comparison, zeroization that survives optimisation |
| [`id`](/docs/stdlib/id) | unique identifiers — UUID, ULID, NanoID, Snowflake |
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
| [`action`](/docs/stdlib/action) | AC/OC duality — articulations, enactments, ε-primitives, monads, ludics |
| [`architecture`](/docs/stdlib/architecture) | ATS-V architectural type system — canonical types, anti-patterns, MTAC |
| [`archive`](/docs/stdlib/archive) | tar / zip / ar / cpio under one packaging functor; composes with `compress` |
| [`cache`](/docs/stdlib/cache) | `CacheBackend` protocol + adapters (Redis today) |
| [`cli`](/docs/stdlib/cli) | typed argument protocols, `AppBuilder`, combinator parser, sysexits codes |
| [`cog`](/docs/stdlib/cog) | manifest parsing, `.vbca` reading, Ed25519 signing, dependency resolution |
| [`compress`](/docs/stdlib/compress) | one `Codec` over gzip / deflate / zlib / brotli / zstd / lz4 |
| [`concurrency`](/docs/stdlib/concurrency) | π-calculus processes and session types |
| [`configuration`](/docs/stdlib/configuration) | parse / validate / convert / merge across TOML, YAML, JSON, INI, env |
| [`control`](/docs/stdlib/control) | delimited continuations — `shift` / `reset` |
| [`encoding`](/docs/stdlib/encoding) | JSON, CBOR, MessagePack, Base64, hex, PEM, JCS, varint, DER |
| [`eval`](/docs/stdlib/eval) | call-by-push-value term algebra |
| [`logic`](/docs/stdlib/logic) | modal (Kripke) and linear logic — the metatheory behind session types |
| [`mesh`](/docs/stdlib/mesh) | service mesh — Envoy xDS, Kubernetes Gateway API |
| [`metrics`](/docs/stdlib/metrics) | lock-free counters / gauges / histograms, Prometheus text format |
| [`money`](/docs/stdlib/money) | ISO 4217 minor units, currency-correct arithmetic, fair split |
| [`protobuf`](/docs/stdlib/protobuf) | the canonical Protocol Buffers wire format, streaming reader |
| [`redis`](/docs/stdlib/redis) | RESP3 client, commands, pub/sub, streams, transactions, scripting |
| [`script`](/docs/stdlib/script) | a host programme compiles and runs Verum scripts in-process |
| [`search`](/docs/stdlib/search) | `SearchIndex` protocol + adapters (MeiliSearch today) |
| [`shell`](/docs/stdlib/shell) | `sh#"…"` literals, typed pipelines, Git / Docker command DSLs |
| [`storage`](/docs/stdlib/storage) | `ObjectStore` protocol + adapters (S3-compatible today) |
| [`tracing`](/docs/stdlib/tracing) | spans, samplers, processors, exporters, W3C Trace Context |
| [`types`](/docs/stdlib/types) | polymorphic kinds, QTT, 2LTT — the vocabulary the verifier builds on |
| [`verify`](/docs/stdlib/verify) | verification as a first-class API for user code |


The table links the library modules to their API references. `core/target`
contains build artifacts rather than a library module.

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

## Runtime and foreign dependencies {#zero-ffi}

The stdlib source is written in Verum, but its intrinsics still need
interpreter or native implementations. Generated AOT programs must use
direct syscalls on Linux/FreeBSD, libSystem on macOS and kernel32/ntdll on
Windows. Some emitted runtime paths still violate that no-libc boundary.
The host CLI and interpreter may use libc and other baseline system
libraries, but must run on a clean supported OS without separately
installed third-party dependencies. Writing an API in Verum does not by
itself establish either artifact's dependencies.

See the [AOT no-libc status and host compatibility requirement](/docs/architecture/no-libc-architecture)
and [cross-compilation requirements](/docs/tooling/build-system#cross-compilation).
Compiler build tools, host deployment dependencies, AOT link inputs and
explicitly requested foreign libraries must be accounted for separately.

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
$ verum doc --format json              # machine-readable output
$ verum doc --search "Iterator"        # NOT IMPLEMENTED — see note below
$ verum api --signature "fn map"       # NOT IMPLEMENTED — see note below
```

:::warning `verum api` does not exist
Checked: `verum api --help` answers `error: unrecognized
subcommand`, and `verum doc --search` answers `error: unexpected
argument '--search' found`. There is no search
of any kind. `verum doc` generates documentation — `--open`,
`--format`, `--no-deps`, `--document-private-items` — and is the nearest
thing that ships.
:::

Source lives at `core/`.

## Stdlib status badge system

Module pages carry conformance metadata and may render an explicit
`<StdlibStatus />` badge. The accompanying detail identifies covered APIs,
execution backends and remaining limitations.

### Status keywords

[Status Convention](/docs/stdlib/status-convention) defines inventory and
frontmatter labels, the component's supported props, and the evidence
required to change a coverage statement. The component does not automatically
convert an inventory label or render a page's frontmatter.

### Frontmatter

Each module page declares its status in the YAML frontmatter so
search / sidebar widgets can read it without parsing the body:

```markdown
---
sidebar_position: 3
title: text
description: ...
status: partial
status_detail: Interpreter coverage includes text construction and character queries; backend-specific limitations are described below.
---
```

`status_detail` summarizes the covered APIs, execution backend and open limitations.
A page that renders a badge passes its supported `status` and `detail`
props explicitly; keep that detail consistent with the frontmatter.

### Component usage

```mdx
import StdlibStatus from '@site/src/components/StdlibStatus';

<StdlibStatus
  status="partial"
  detail="Interpreter coverage includes text construction and character queries; native coverage is tracked separately."
  defects={[
    {area: 'text', summary: 'Consult the module page for iterator and mutation limitations.'},
    {area: 'char', summary: 'Consult the module page for character-classification coverage.'},
  ]}
/>
```

Props:

- **`status`** — the component accepts `complete | partial | regression-only |
  unaudited`. Inventory and frontmatter labels such as `stable`, `unverified`
  and `undocumented` are separate metadata; the component does not convert them.
  `unaudited` means no conformance assessment is published for the surface;
  consult the module documentation and tests.
- **`detail`** *(optional)* — string mirroring the
  `status_detail` frontmatter; rendered in the badge body.
- **`defects`** *(optional)* — list of `{area, summary}` rows shown in
  a collapsible defect-class table.

### Updating status

When a module's verified API or backend coverage changes:

1. Update the per-module `core-tests/<...>/audit.md`.
2. Record the evidence and coverage in `core-tests/INVENTORY.md`
   (single-line row; do not restructure the table).
3. Update the module's website page frontmatter (`status`,
   `status_detail`) to reflect the verified behaviour and remaining limitations.
4. Refresh the `<StdlibStatus />` props (`detail`, `defects`).

The same status keywords appear in three places — `INVENTORY.md`, the
module page frontmatter, and the `<StdlibStatus />` `status` prop — so readers can follow each claim to its conformance evidence.
