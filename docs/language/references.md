---
sidebar_position: 11
title: References
---

# References

Verum has three reference tiers plus raw pointers. This page gives the
precise semantics and usage patterns for each.

## Tier 0 — `&T` (managed)

The default. A 16-byte reference (`ThinRef<T>`) consisting of:

- an 8-byte pointer to the object;
- a 4-byte generation tag;
- 4 bytes of epoch/capability metadata.

For unsized types (slices, `dyn Protocol`), the reference is a 32-byte
`FatRef<T>` carrying an additional length or vtable pointer.

**Each dereference** performs one CBGR check against the object's
header — measured at ~0.93 ns on the `production_targets` bench
(x86_64, release build), well under the ≤ 15 ns design target. If
the generation has advanced, the check aborts with a
`UseAfterFreeError`.

```verum
fn first<T>(xs: &List<T>) -> &T { &xs[0] }
```

**When the compiler can prove the reference cannot dangle**, escape
analysis rewrites the function signature from `&T` to `&checked T`
automatically — the CBGR check disappears entirely. This is a
compile-time decision; no runtime logic changes.

## Tier 1 — `&checked T` (zero-cost)

A raw 8-byte pointer with a **compile-time proof** that the pointer is
live for the duration it is used.

```verum
fn tight_loop(data: &checked List<Int>) -> Int {
    data.iter().fold(0, |acc, x| acc + x)
}
```

You ask for `&checked T` when you want a guarantee from the compiler
that the CBGR check is eliminable. If the compiler cannot prove it, the
function is rejected:

```
error[V5201]: cannot prove reference is safe for `&checked T`
  --> src/foo.vr:7:14
   |
 7 | fn run(x: &checked Config) -> Int { ... }
   |            ^^^^^^^^ `x` may escape into a stored location
   |
   = help: use `&T` (CBGR-checked) if escape is intentional,
           or refactor to prevent storage of `x`.
```

`&checked T` is typically used:
- on hot paths where even the ~0.93 ns per deref compounds into
  measurable overhead (billions of iterations per frame);
- at function boundaries where the caller naturally provides a short-lived reference;
- in generic numeric / iterator code where the compiler's escape
  analysis is robust.

## Tier 2 — `&unsafe T` (you prove it)

```verum
fn fast_copy(dst: &unsafe mut Byte, src: &unsafe Byte, n: Int) {
    unsafe { memcpy(dst, src, n); }
}
```

`&unsafe T` has the same 8-byte layout as `&checked T` but requires no
compiler proof. Creating one, passing it, and storing it is safe;
**dereferencing** it requires an `unsafe { ... }` block.

You use `&unsafe T` when:
- interfacing with C code;
- the compiler genuinely cannot verify a property you know to hold
  (e.g., a pointer sourced from a memory-mapped region);
- writing primitives inside `core.mem`.

In application code, `&unsafe T` should be rare — typically confined
to a single function with a comment explaining the obligation.

## Coercion rules

```
&checked T   ≤   &T             (automatic widening)
&unsafe T    ≤   &checked T     (requires `unsafe`)
&T           ↛   &checked T     (requires proof)
&T           ↛   &unsafe T      (requires `unsafe`)
```

## Mutable references

Each tier has a mutable variant.

```verum
&mut T            // exclusive, CBGR-checked
&checked mut T    // exclusive, zero-cost
&unsafe mut T     // exclusive, you prove it
```

The standard aliasing rules apply at each tier: while a mutable
reference exists, no other reference to the same value (of any tier)
may coexist.

## Interior mutability

Sometimes you need mutation through an immutable reference (caching,
lazy initialisation). The standard library exposes this via:

- `Cell<T>` — copy-based interior mutability, `!Sync`.
- `RefCell<T>` — borrow-checked at runtime, `!Sync`.
- `OnceCell<T>` — write-once, `!Sync`.
- `AtomicCell<T>` — atomic, `Sync`.
- `Mutex<T>` / `RwLock<T>` — locked, `Sync`.

These types carry the mutation API; their reference is still `&T` on
the outside.

## References in data structures

Storing a reference in a struct commits you to its lifetime. In Verum,
this is usually done via `Shared<T>` (ref-counted) or a borrow-checker
approved `&'a T` when the compiler can track the scope:

```verum
type Cache<'a> is {
    hot: &'a Map<Key, Value>,
    ...
};
```

In practice, most Verum code avoids lifetime-parameterised structs —
CBGR makes `Shared<Map<Key, Value>>` a cheap and safe alternative.

## Taking addresses

```verum
let x = 42;
let r: &Int         = &x;
let c: &checked Int = &checked x;   // requires proof
let u: &unsafe Int  = &unsafe x;    // explicit
```

Address-of operators follow the tier of the storage. `&x` of a local
is always taken as `&T`; the compiler may promote it to `&checked T`
if the analysis succeeds.

## Raw pointers

```verum
*const T        *mut T        *volatile T        *volatile mut T
```

Raw pointers are produced via `ptr.addr_of!`, `ptr.addr_of_mut!`, or
FFI boundary casts. They do not carry lifetime; dereferencing them is
`unsafe`.

Use raw pointers for:
- FFI with C APIs that take `void*` / `T*`;
- memory-mapped I/O (the `*volatile` variant forbids compiler reorderings);
- implementation of the memory subsystem itself.

## Capability bits on references

The `epoch_caps` word of every `ThinRef` / `FatRef` carries 8
capability bits drawn from the CBGR capability set:

| Bit | Name | Meaning |
|-----|------|---------|
| 0 | `READ` | reads permitted |
| 1 | `WRITE` | writes permitted |
| 2 | `EXECUTE` | target is callable |
| 3 | `DELEGATE` | can be handed to another context |
| 4 | `REVOKE` | holder can revoke copies |
| 5 | `BORROWED` | this is a borrow, not an owner |
| 6 | `MUTABLE` | `&mut` semantics |
| 7 | `NO_ESCAPE` | optimisation hint — reference cannot escape |

Capabilities attenuate **monotonically**: a `Database with [READ]`
reference has `WRITE` cleared and can never regain it. The compiler
enforces this at every conversion. Capability checks at runtime cost
one AND + one branch (~1 ns).

## Hazard-pointer protocol

Between the moment a reader loads the generation from a `ThinRef` and
the moment it dereferences the pointer, the allocator could free the
target and increment the generation. CBGR prevents this race via
**hazard pointers** (`core/mem/hazard.vr`):

1. Before validating, the reader publishes the target address in a
   per-thread hazard slot.
2. The CBGR generation check runs.
3. After dereferencing, the reader clears the hazard slot.
4. The allocator's free path checks all hazard slots before recycling
   a page — if any slot holds the target, the free is deferred.

This makes the check **lock-free** on the fast path with no fences
needed on x86_64 (TSO). On aarch64, acquire/release fences provide
the necessary ordering.

## VBC opcodes per tier

Each tier lowers to a distinct VBC instruction so the tier decision
survives all the way from the compiler to the executor:

| Opcode | Hex | Tier | Runtime behaviour |
|--------|-----|------|-------------------|
| `Ref` | 0x70 | 0 | CBGR-validated deref (~0.93 ns measured) |
| `RefMut` | 0x71 | 0 | mutable CBGR-validated |
| `Deref` | 0x72 | — | deref with validation |
| `DerefMut` | 0x73 | — | mutable deref with validation |
| `ChkRef` | 0x74 | — | explicit validation guard |
| `RefChecked` | 0x75 | 1 | 0 ns — compiler-proven safe |
| `RefUnsafe` | 0x76 | 2 | 0 ns — unsafe, user-attested |
| `DropRef` | 0x77 | — | drop a reference (bookkeeping) |

In the interpreter, all derefs perform the full check (safety first).
In AOT, Tier 1 and Tier 2 emit direct loads. See
**[CBGR internals → VBC tier opcodes](/docs/architecture/cbgr-internals#vbc-tier-opcodes)**.

## Escape-analysis promotion model

The compiler's 11-module analysis suite (`verum_cbgr`) classifies
every reference into one of four escape states:

| State | Meaning | Tier decision |
|-------|---------|---------------|
| `NoEscape` | reference provably stays local | → Tier 1 (`RefChecked`) |
| `MayEscape` | inconclusive | → Tier 0 (`Ref`) |
| `Escapes` | stored into a heap location, returned, etc. | → Tier 0 (`Ref`) |
| `Unknown` | analysis failed | → Tier 0 (`Ref`, conservative) |

Only `NoEscape` qualifies for promotion. The SMT-alias analysis
(`smt_alias_verification.rs`) is invoked when the simpler analyses
are inconclusive. Typical promotion rate on idiomatic code: 60–95 %.

## Worked example — all three tiers

```verum
fn process_batch(data: &List<Record>) using [Database, Logger] {
    // Tier 0 (&T): the reference `data` may escape into Logger
    Logger.info(f"processing {data.len()} records");

    for record in data.iter() {
        // Tier 1 (&checked): the compiler proves `record` cannot
        // escape the loop body. No CBGR overhead here.
        let id: &checked Int = &checked record.id;
        insert_record(*id);
    }
}

fn insert_record(id: Int) using [Database] {
    // Tier 2 (&unsafe): raw pointer into a memory-mapped buffer.
    // We know the buffer outlives this call because the caller
    // holds the mmap guard.
    let buf: &unsafe Byte = unsafe { mmap_region.as_ptr() };
    Database.execute(f"INSERT INTO log(id) VALUES({id})")?;
}
```

## See also

- **[Memory model](/docs/language/memory-model)** — ownership,
  mutability, drops, allocator internals.
- **[CBGR](/docs/language/cbgr)** — how the generational check works.
- **[CBGR internals](/docs/architecture/cbgr-internals)** — header
  layout, 8-capability-bit system, compile-time analysis suite.
- **[Cookbook → references](/docs/cookbook/references)** — when to use
  each tier in practice.
