---
title: types
description: Advanced type-system primitives (polymorphic kinds, QTT, two-level)
---

# `core.types`

**Advanced type-system primitives**

Surface for the research-grade type machinery that higher-level
libraries build on. Most application code never touches these
modules — they are the vocabulary used by formal-verification
extensions, typeclass hierarchies parameterised by kind, and
resource-aware programming.

## Submodules

| Submodule | Purpose |
|-----------|---------|
| `types.poly_kinds` | Polymorphic kinds — `Type`, `Constraint`, `K₁ → K₂`, kind variables + unification |
| `types.qtt` | Quantitative type theory — usage annotations on bindings (`0ω1`) |
| `types.two_level` | Two-level type theory — static / dynamic phase separation |

## `poly_kinds` — polymorphic kinds

```verum
public type Kind is
    | KType
    | KConstraint
    | KArrow { domain: Heap<Kind>, codomain: Heap<Kind> }
    | KVar { name: Text };
```

Surface mirrors `verum_types::poly_kinds`: kind-level
Hindley-Milner with kind variables, kind constructors (→, Type,
Constraint), and kind unification. Practical consumers:
heterogeneous containers, functor combinators, typeclass
hierarchies parameterised by kind.

## `qtt` — quantitative type theory

Quantitative type theory extends every binding with a usage
annotation from the semiring `{0, 1, ω}`:

- `0` — erased (compile-time only).
- `1` — must be used exactly once (affine + strict).
- `ω` — unrestricted (reuse freely).

The stdlib exposes the lattice algebra; the verification pipeline
consumes the annotations for resource-aware checking (file
handles, linear channels, one-shot futures).

## `two_level` — two-level type theory

Primitives for separating compile-time (static) from runtime
(dynamic) phases in types. Used by the meta-programming layer
(`core.meta`) and by refinement types that need to normalise
indices at compile time without polluting the runtime universe.

## Relationship to `verum_types` (compiler crate)

`core.types.*` surface IS the user-facing shape of the compiler's
`verum_types::poly_kinds`, `verum_types::qtt`, and
`verum_types::two_level` modules. The compiler uses the stdlib
declarations as the authoritative definition; there is no
parallel hardcoded list of kinds / usage tags / phases in the
compiler implementation.

## When to reach here

Almost never from application code. Libraries that need:

- Typeclass dispatch over kinds other than `Type`
- Linear-resource tracking beyond `affine` types
- Staged computation where compile-time values have distinct types
  from runtime values

…pull these modules in. Everyone else stays one layer up in
`core.base.*` where `Maybe`, `Result`, `List`, `Iterator`, `Heap`,
`Shared` already deliver the ergonomic surface.
