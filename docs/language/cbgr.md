---
sidebar_position: 12
title: CBGR
---

# CBGR — Capability-Based Generational References

**CBGR** is Verum's default memory-safety mechanism for `&T` references.
It detects use-after-free and double-free at runtime with roughly **15
nanoseconds** of overhead per dereference — faster than a malloc, slower
than a register access.

This page explains the idea. For data-structure details, see
**[CBGR internals](/docs/architecture/cbgr-internals)**.

## The problem

Manual memory management crashes when you dereference a pointer after
its object has been freed. Garbage collection solves this by refusing
to free until no one can reach the object; the cost is latency spikes
and loss of control.

Verum wants the control _and_ the safety. CBGR is the compromise.

## The idea in one paragraph

Every heap allocation carries a small **header** with a **generation
counter**. Every reference includes a copy of the generation it was
issued against. When you dereference, the runtime compares the two. If
they match, the object is still the one you got a reference to, and
the access proceeds. If they differ, the object has been freed (or
revoked) and the access is rejected.

## What a reference looks like

**`ThinRef<T>` — 16 bytes:**

| Offset | Size  | Field           | Purpose                              |
|-------:|------:|-----------------|--------------------------------------|
|      0 | 8 B   | `pointer`       | object address                       |
|      8 | 4 B   | `generation`    | issued-against counter               |
|     12 | 4 B   | `epoch / caps`  | scope epoch + capability bit vector  |

For unsized types, slices, trait objects, and interior references the
runtime uses `FatRef<T>` — 32 bytes total. It layers three fields on
top of a `ThinRef`: an 8-byte metadata word (length for slices, vtable
pointer for `dyn`), a 4-byte offset (for interior references), and a
4-byte reserved field for alignment and future use.

## What a header looks like

**`AllocationHeader` — 32 bytes, cache-line (32-byte) aligned, placed immediately before the object payload:**

| Offset | Size  | Field           | Purpose                              |
|-------:|------:|-----------------|--------------------------------------|
|      0 | `u32` | `size`          | payload size in bytes                |
|      4 | `u32` | `align`         | payload alignment                    |
|      8 | `u32` | `generation`    | bumped on free/revoke                |
|     12 | `u16` | `epoch`         | scope epoch                          |
|     14 | `u16` | `capabilities`  | capability bits                      |
|     16 | `u32` | `type_id`       | runtime type identifier              |
|     20 | `u32` | `flags`         | mark/pin/frozen bits                 |
|     24 | `u64` | `reserved`      | reserved for future use              |

`generation` (u32) and `epoch` (u16) are laid out so they fit into a
single 64-bit atomic load on the fast path; freeing an object
`Release`-increments that word, and every reader does an `Acquire`
load before comparing. See **[architecture → CBGR internals](/docs/architecture/cbgr-internals#allocationheader)**
for the exact bit layout.

## The check

```
fn deref(r: ThinRef<T>) -> &T {
    let hdr = header_of(r.pointer);
    if hdr.generation != r.generation {
        panic_use_after_free();
    }
    unsafe { &*r.pointer }
}
```

Three loads, one compare, one conditional branch. On typical hardware,
this measures ~15 ns.

## Why not just bounds-check?

Bounds checking prevents out-of-range indexing; it does nothing about
stale pointers after free. Conversely, CBGR prevents stale-pointer
access but does not itself bound-check indices. They are orthogonal
safety mechanisms — and Verum uses both.

## Generation wraparound

Generations are 32-bit. At one allocation per object per nanosecond,
wraparound takes ~4.3 seconds. To prevent reuse of a generation while
old references still point at it, the allocator uses **epochs**: a
thread-local epoch counter advances periodically, and references are
invalidated across epoch boundaries. This is handled automatically by
the runtime.

## Capability bits

The `epoch / caps` word of a reference is partitioned between the
epoch identity and **eight capability bits**, drawn from a fixed set
with **monotonic attenuation** (capabilities can only be removed as
the reference is passed around):

| Bit | Name | Meaning |
|-----|------|---------|
| 0 | `READ`       | reads permitted (set for every live reference) |
| 1 | `WRITE`      | writes permitted |
| 2 | `EXECUTE`    | the target is callable |
| 3 | `DELEGATE`   | can be handed to another context |
| 4 | `REVOKE`     | the holder can revoke outstanding copies |
| 5 | `BORROWED`   | this is a borrow, not an owner |
| 6 | `MUTABLE`    | `&mut` semantics (exclusive access) |
| 7 | `NO_ESCAPE`  | optimisation hint — cannot escape |

This is how `Database with [READ]` becomes a value at runtime — the
`Database` reference has `WRITE` cleared, and a call to
`Database.write(...)` fails a capability check that is one AND plus
one branch (~1 ns). Reducing the set (`db.readonly()`) is always
allowed; re-expanding it is rejected by the compiler.

## When the check is elided

The compiler emits the full ~15 ns check for `&T`. It emits **nothing**
for `&checked T` — escape analysis (one of eleven compile-time
analyses in `verum_cbgr`) has proved the check unnecessary. The proof
is witnessed in the compilation artefacts; you can inspect which
references got promoted with:

```bash
$ verum analyze --escape ./src/main.vr
function     total   tier0   tier1   tier2   promoted
process        42       3      39       0          39/42 (92.9%)
tight_loop      8       0       8       0           8/8  (100%)
```

Or dump the full analysis suite with `verum analyze --all`. On
idiomatic code the typical promotion rate is 60–95 %.

## Tiered execution

In the VBC interpreter, CBGR checks run in software. In the LLVM AOT
backend, they are lowered to native instructions and frequently
collapsed by LLVM's optimiser when adjacent to each other or inside
tight loops. In GPU kernels, CBGR is disabled by construction (kernels
operate on a separate memory arena with statically checked accesses).

## Performance numbers

Reported on an Apple M3 Max, release build with LTO:

| Operation | Cycles | Nanoseconds |
|-----------|--------|-------------|
| Unchecked pointer deref | 2 | 0.5 |
| `&checked T` deref | 2 | 0.5 |
| `&T` CBGR check + deref | 55 | 13.8 |
| `&T` check + cache miss on header | 220 | 55 |
| Free + increment generation | 80 | 20 |

The "cache miss" line is worst case — the header is designed to share
a cache line with the object, so in typical access patterns it's
already hot.

## Mental model

Think of CBGR as **trading a small constant-factor overhead on every
reference dereference for the complete elimination of an entire class
of CVEs**. For most code, 15 ns is invisible. For hot loops, escape
analysis elides the check. For code where it cannot, you can be
explicit about wanting `&checked T` and let the compiler tell you what
needs refactoring.

## See also

- **[References](/docs/language/references)** — the three tiers from
  the user's perspective.
- **[CBGR internals](/docs/architecture/cbgr-internals)** — the
  runtime, escape analysis algorithm, and implementation details.
- **[Tooling → analyze](/docs/tooling/cli)** — running the CBGR
  promotion report.
