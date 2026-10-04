---
sidebar_position: 11
title: References
---

# References

Verum has three reference tiers plus raw pointers. Reference syntax
selects a safety obligation; it does not select the execution backend
or transfer ownership of the referenced value.

| Form | Who establishes validity? |
|---|---|
| `&T` / `&mut T` | Managed references use runtime CBGR validation where needed. |
| `&checked T` / `&checked mut T` | The compiler must establish the required proof. |
| `&unsafe T` / `&unsafe mut T` | The programmer is responsible for validity. |

These are independent of the interpreter/native [execution modes](/docs/architecture/runtime-tiers).
The layouts below describe the CBGR runtime structures, not a stable
foreign-function ABI for every lowered reference.

## Tier 0 — `&T` (managed)

The default. A 16-byte reference (`ThinRef<T>`) consisting of:

- an 8-byte pointer to the object;
- a 4-byte generation tag;
- 4 bytes of epoch/capability metadata.

For unsized types (slices, `dyn Protocol`), the reference is a 32-byte
`FatRef<T>` carrying an additional length or vtable pointer.

**Each dereference** performs one CBGR check against the object's
header — re-measured at 1.2–1.7 ns on the `production_targets` bench
(x86_64, release build), well under the ≤ 15 ns design target. If
the generation has advanced, the check aborts with a
`UseAfterFreeError`.

```verum
fn first<T>(xs: &List<T>) -> &T { &xs[0] }
```

**When the compiler can prove the reference cannot dangle**, escape
analysis can select the checked tier for its uses and eliminate runtime
validation. Promotion is a compile-time decision based on the actual
reference flow; a short example alone is not proof of promotion.

## Tier 1 — `&checked T` (zero-cost)

A raw 8-byte pointer with a **compile-time proof** that the pointer is
live for the duration it is used.

```verum
fn tight_loop(data: &checked List<Int>) -> Int {
    data.iter().fold(0, |acc, x| acc + x)
}
```

`&checked T` expresses a requirement for a compiler-proven reference.
It is useful at boundaries where the lifetime and aliasing facts are
available to analysis. It is not a cast that makes arbitrary memory
safe, and it does not remove the caller's obligations when the pointer
originated in unsafe code.

`&checked T` is typically used:
- on hot paths where even the 1.2–1.7 ns per deref compounds into
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

## Tiers as method receivers

A method's receiver takes a tier the same way any other reference does:

```verum
implement Counter {
    fn read(&self) -> Int { self.value }              // Tier 0
    fn read_fast(&checked self) -> Int { self.value } // Tier 1
    fn read_raw(&unsafe self) -> Int { self.value }   // Tier 2
}
```

All three are methods, called the same way — `c.read_fast()`. The tier
changes the reference-safety obligation. Method lookup still uses the
receiver's declared type.
An owning receiver (`%self`) and a by-value receiver (`self`) are methods
too; only a function with no receiver at all is an associated function,
called as `Counter.new()`.

## Coercion rules

```
&checked T   ≤   &T             (automatic widening)
&unsafe T    ≤   &checked T     (requires `unsafe`)
&T           ↛   &checked T     (requires proof)
&T           ↛   &unsafe T      (requires `unsafe`)
```

## Reaching through a wrapper — `Deref`

`Deref` associates a wrapper with a `Target` and provides a reference to
that target. Field access, indexing, and method lookup can follow this
relationship. The explicit spelling `(*wrapper).method()` makes the
intermediate dereference visible in source.

```verum
mount core.base.protocols.{Deref};

type Item is { answer: Int };
type Boxy<T> is { inner: T };

implement<T> Deref for Boxy<T> {
    type Target = T;
    fn deref(&self) -> &T { &self.inner }
}
```

In this declaration, `Boxy<Item>` has `Target = Item`. It does not become
`Item`: the wrapper retains its own type and any methods declared on
it. Receiver-owned methods take precedence over looking through a
`Deref` chain. A mutable operation also needs the appropriate mutable
reference and `DerefMut` contract; `Deref` alone does not grant mutation.

`Heap<T>` and `Shared<T>` declare this relationship in the standard
library. A lock guard can also expose its protected value through
`Deref`, but dereference behaviour and lock release are separate issues.

**Known limitation, measured 2026-10-04:** qualified wrapper receivers,
chained method results, and nested fields through `Deref` still have
compiler gaps in some builds. In particular, a direct access working
in the interpreter does not prove that an imported generic chain
preserves its type through native compilation. Corrections under
validation are not a blanket compatibility guarantee.

## Qualified type identity

A qualified name identifies the declaring module as well as the type.
Mounting the type introduces a local spelling for that identity:

```verum
mount core.base.memory.{Shared};
mount core.sync.atomic.{AtomicBool};

type StopFlag is Shared<core.sync.atomic.AtomicBool>;
```

Here `Shared<AtomicBool>` refers to the same type argument as the
qualified spelling, because the explicit mount resolves `AtomicBool`
to that declaration. `Shared<Int>` is a different instantiation.
Two unrelated modules declaring a type with the same short name do
not make those types interchangeable.

The same identity rule applies inside references and nested generic
arguments. Use explicit mounts or qualified names at module boundaries
to make the intended declaration clear; qualification does not perform
a conversion. See [modules](/docs/language/modules).

**Known limitation, measured 2026-10-04:** imported signatures and
source-qualified reference parameters still have incomplete type
identity propagation in some compiler paths. Do not shorten a type name
to make an unrelated type acceptable, or treat a field-guess diagnostic
as evidence that the compiler selected the right record layout.

## Resource lifetime

A reference borrows access to a value; the resource owner decides how
that value is destroyed. Passing `&T`, dereferencing a wrapper, or
casting an address does not establish a new owner. Reference validity
checks therefore cannot replace correct `Drop` behaviour.

**Known limitation, measured 2026-10-04:** general native owned-object
destruction and lock-guard release are incomplete. Borrowed access can
work while the owner's cleanup is still incorrect. Validate resource
lifetime in the native backend before relying on scope exit to release
locks or other exclusive resources.

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

Storing a reference in a record commits you to its lifetime. In Verum
that commitment is enforced by CBGR at the dereference, not by an
annotation on the record:

```verum
type Cache is {
    hot: Shared<Map<Key, Value>>,
};
```

Use an owning type such as `Shared<T>` when the record needs to keep a
value alive beyond the scope that created it. A borrowed reference, even
with an explicit lifetime parameter, does not transfer ownership or
extend the referent's lifetime. The resource-cleanup limitation above
still applies to native execution.

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

| | |
|---|---|
| `*const T` |  |
| `*mut T` |  |
| `*volatile T` |  |
| `*volatile mut T` |  |

Raw pointers can cross FFI boundaries and be formed by explicit pointer
casts. They do not carry a managed lifetime; dereferencing them is
`unsafe`. A cast does not keep the source allocation alive.

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
| `Ref` | 0x70 | 0 | CBGR-validated deref (1.2–1.7 ns, re-measured 2026-09-05) |
| `RefMut` | 0x71 | 0 | mutable CBGR-validated |
| `Deref` | 0x72 | — | deref with validation |
| `DerefMut` | 0x73 | — | mutable deref with validation |
| `ChkRef` | 0x74 | — | explicit validation guard |
| `RefChecked` | 0x75 | 1 | 0 ns — compiler-proven safe |
| `RefUnsafe` | 0x76 | 2 | 0 ns — unsafe, user-attested |
| `DropRef` | 0x77 | — | drop a reference (bookkeeping) |

The backend must preserve the tier and the address of the referenced
value when lowering these instructions. A reference to a field must
still address that field when passed to another function; its contents
are not a substitute for its address. See
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
    Database.execute("INSERT INTO log(id) VALUES($1)", [f"{id}"])?;
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
