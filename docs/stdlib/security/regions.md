---
sidebar_position: 13
title: regions — Tofte-Talpin region calculus
description: User-facing surface for Verum's region-calculus analysis — model and reason about region-typed values, lifetime environments, and escape checks.
---

# `core.security::regions` — region calculus

## What is this module, really?

This module is NOT a runtime region allocator. It's the **user-facing
surface for Verum's region-calculus analysis** — a small toolkit of
types and functions that let you *model* lifetimes, region sets, and
the escape-soundness gate that the compiler uses under the hood.

The actual runtime allocator (bump pointer, generational arena) lives
in **[`core.mem.arena`](/docs/stdlib/mem)**, and Weft's per-request
arena pool at
[`core.net.weft.arena_pool`](/docs/stdlib/net/weft). This file is
the region-theory formalisation that sits alongside those — so
analyses, tests, and custom verification passes can talk about
regions programmatically.

### Two things that both get called "regions"

| Concept | Where | What it is |
|---|---|---|
| **Region-typed arena** | `core.mem.arena.GenerationalArena`, `core.net.weft.arena_pool` | A live bump-pointer allocator with O(1) mass-invalidation. Used at runtime. |
| **Region calculus** | `core.security.regions` (this file) | Tofte-Talpin algebra: `Lifetime`, `LifetimeSet`, `LifetimeEnv`, escape check. Used by the type system, verification passes, and meta-programming. |

If you're writing ordinary application code and want an
arena-allocated scope, you want the first one — read the
[`mem`](/docs/stdlib/mem) and [Weft arena_pool](/docs/stdlib/net/weft)
documentation.

If you're building a compiler extension, static analyser, or
verification pass that needs to reason about region-typed values,
this module is your toolbox.

## Tofte-Talpin calculus — 30-second refresher

A region calculus gives every allocation a *name* — a region — and
ensures that references never outlive their region. Originally
introduced by Tofte & Talpin (1997) for ML, it's the theoretical
foundation behind Verum's lifetime tracking.

```
letregion ρ in
    let x = new ρ (Cons 1 (new ρ (Cons 2 (Nil ρ)))) in
    ...use x...
end   // region ρ is deallocated here
```

The type system needs three concepts:

1. **Lifetimes** — symbolic names for regions (`ρ`, `σ`, …).
2. **Region sets** — the regions a type depends on.
3. **Escape check** — a function returning a value with region
   `ρ` must be called from a caller whose scope includes `ρ`.

This module gives you each of those as Verum data types.

---

## API

### Lifetimes and region sets

```verum
mount core.security.regions.{
    Lifetime, LifetimeSet, LifetimeEnv, LifetimeType, EscapeVerdict,
    region, region_set, region_set_empty,
    region_set_contains, region_set_union, region_set_is_subset_of,
    region_env, region_env_empty, region_env_push,
    region_type, check_no_escape,
};

/// An abstract region — a named lifetime.
public type Lifetime is { name: Text };

/// Construct a lifetime from its name.
public fn region(name: Text) -> Lifetime;

/// A set of regions — deterministic ordering makes hashing
/// / comparison predictable.
public type LifetimeSet is { regions: List<Lifetime> };

public fn region_set(regions: List<Lifetime>) -> LifetimeSet;
public fn region_set_empty() -> LifetimeSet;

public fn region_set_contains(s: LifetimeSet, r: Lifetime) -> Bool;
public fn region_set_union(a: LifetimeSet, b: LifetimeSet) -> LifetimeSet;
public fn region_set_is_subset_of(a: LifetimeSet, b: LifetimeSet) -> Bool;
```

### Lifetime environments — "which regions are in scope right now"

```verum
public type LifetimeEnv is { in_scope: LifetimeSet };

public fn region_env(regions: List<Lifetime>) -> LifetimeEnv;
public fn region_env_empty() -> LifetimeEnv;

/// Push a new region into scope — models entering `letregion`.
public fn region_env_push(env: LifetimeEnv, r: Lifetime) -> LifetimeEnv;
```

### Lifetime-typed values

```verum
/// A type paired with the set of regions it depends on.
/// `payload` is a printable representation ("List<Int>", "Tree"),
/// kept as Text because this module is agnostic to the specific
/// type system being analysed.
public type LifetimeType is {
    payload: Text,
    regions: LifetimeSet,
};

public fn region_type(payload: Text, regions: LifetimeSet) -> LifetimeType;
```

### Escape check — the soundness gate

```verum
public type EscapeVerdict is
    | Ok
    | Escape { region: Lifetime, returned_type: Text };

/// Returns Ok iff every region the type depends on is in the
/// caller's environment. Escape reports the offending region and
/// the type that would carry it out of scope.
public fn check_no_escape(returned: LifetimeType, env: LifetimeEnv) -> EscapeVerdict;
```

---

## Quick example — modelling a `letregion` escape check

```verum
use core.security.regions.{
    region, region_set, region_env, region_type,
    check_no_escape, EscapeVerdict,
};

// Caller's environment contains regions ρ and σ.
let env = region_env([
    region("ρ".into()),
    region("σ".into()),
]);

// The value being returned depends on region τ — which is NOT
// in the caller's environment.
let returned = region_type(
    "List<Int>".into(),
    region_set([region("τ".into())]),
);

match check_no_escape(returned, env) {
    EscapeVerdict.Ok =>
        println!("safe: no escape"),
    EscapeVerdict.Escape { region: r, returned_type: t } =>
        println!("ERROR: {} would carry region {} out of scope",
                 t, r.name),
}
// → ERROR: List<Int> would carry region τ out of scope
```

Combine `region_env_push` with `region_set_union` to model entering
and leaving `letregion` scopes, the region-set of a product type
(union of the regions of each component), etc.

---

## When do I use this directly?

**Rarely.** Application code doesn't touch this module — you use
regions through the language-level `letregion` / `@lifetime`
constructs, and the compiler calls `check_no_escape` under the
hood.

Legitimate direct uses:

- **Writing a verification pass** that reasons about region
  escapes — your pass computes `LifetimeType`s and asks
  `check_no_escape`.
- **Implementing a DSL** that embeds region tracking into custom
  type constructors.
- **Academic work** — reproducing Tofte-Talpin soundness proofs
  in Verum.

For everyday arena-backed scoped allocation, reach for
[`core.mem.arena`](/docs/stdlib/mem) (the actual bump-pointer
allocator) or [`core.net.weft.arena_pool`](/docs/stdlib/net/weft)
(per-request arena pool).

---

## Relationship to CBGR and `@lifetime`

Verum has three complementary memory disciplines:

| Discipline | Per-deref cost | Guarantee |
|---|---|---|
| Default [CBGR](/docs/language/cbgr) | ~0.93 ns measured (≤ 15 ns design target) | Generational-ref safety; handles heterogeneous lifetimes |
| `@lifetime('r)` + regions (this calculus) | 0 ns | Compile-time non-escape; homogeneous lifetimes |
| Raw `&unsafe T` | 0 ns | Caller-sworn safety; escape hatch |

The runtime never sees the region — codegen erases the calculus
after the escape check runs. Regions give you raw-pointer
performance **with** compile-time safety, provided your data's
lifetime fits one scope.

In practice, Weft's per-request paths use regions; long-lived
business objects use CBGR. Both interoperate.

---

## Security angle — why regions live in `core.security`

The calculus underpins the compile-time guarantee that sensitive
data can't leak *through memory re-use*:

1. **Scope-local clearing.** Weft's request arena is reset on
   request completion; the region calculus proves that no
   reference into that arena survives beyond the request.
2. **Isolation.** Region-typed references are *type-level
   non-transferable* — a handler can't hand a `&'req Token` to a
   background task.
3. **Audit.** Every region-typed parameter in a function
   signature is a compile-time contract about what memory
   boundary the function respects.

Think of the region calculus as "the typed manifestation of
request-scope" — runtime arenas *implement* scopes, the calculus
*describes* them.

---

## File layout

| File | Role |
|---|---|
| `core/security/regions.vr` | Tofte-Talpin calculus surface — ~160 LOC |

## Related modules

- [`core.mem.arena`](/docs/stdlib/mem) — the runtime bump-pointer
  allocator that implements regions in memory.
- [`core.net.weft.arena_pool`](/docs/stdlib/net/weft) — per-request
  arena pool on top of `GenerationalArena`.
- [`labels`](/docs/stdlib/security/labels) — information-flow
  labels; regions and labels are *orthogonal* dimensions of
  Verum's security type system.
- [`language/cbgr`](/docs/language/cbgr) — the default memory
  model regions complement.

## References

- Tofte & Talpin, "Region-based memory management" (1997) — the
  original paper.
- Grossman, Morrisett, Jim, Hicks, Wang, Cheney, "Region-based
  memory management in Cyclone" (2002) — Cyclone's region system
  that heavily influenced Verum's design.
- Tofte, Birkedal, Elsman, Hallenberg, "A retrospective on
  region-based memory management" (2004) — 30-year lessons.
