---
sidebar_position: 4
title: "Composition — cog-composition algebra"
description: "The Composition primitive: how cogs compose, the conservation laws, and the discipline of composes_with."
slug: /architecture-types/primitives/composition
---

# Composition — cog-composition algebra

A **composition** in ATS-V is the relation between two cogs in
which one mounts (imports / uses) the other. The Composition
primitive is the simplest of the eight — it surfaces as a single
field on `Shape`:

```verum
public composes_with: List<Text>,    // cog names this cog may compose with
```

Behind the simple field lies an *algebra* of composition: which
cogs may legally compose with which others, what flows through
the composition, and what conservation laws the composition
satisfies.

## 1. The composes_with field

Every cog declares the set of cogs it *legally composes with*:

```verum
@arch_module(
    composes_with: ["my_app.crypto", "my_app.config"],
)
module my_app.payment.checkout;
```

Three semantics regimes:

- **`composes_with: ["a", "b", "c"]`** — explicit allowlist. The
  cog may import only from `a`, `b`, `c` (transitively, through
  re-exports).
- **`composes_with: []`** — explicit empty list. The cog *may
  not* be composed with by any other cog. Used for cogs that
  are end-user binaries or intentionally-isolated leaves.
- **field omitted** — permissive default. Imports allowed
  subject to capability/boundary checks.

The asymmetry: explicit `[]` means "I refuse to be composed
with"; explicit allowlist means "I refuse to compose with cogs
not on the list". Together they form a precise admissibility
filter.

## 2. The composition graph

Across the project, the composes_with declarations induce a
directed graph: an edge from cog A to cog B if A's allowlist
contains B (or A omits the field and capability/boundary checks
admit the import).

The graph is the project's *architectural skeleton*. Three
properties matter:

1. **Acyclicity.** The graph must be a DAG. A cycle triggers
   [`AP-003 DependencyCycle`](../anti-patterns/classical.md#ap-003).
2. **Closure under capability conservation.** If A composes with
   B, then A's effective capability set acquires (transitively)
   B's exposed capabilities — unless A explicitly encapsulates
   them. See [Capability primitive](./capability.md#3-capability-conservation-across-composition).
3. **Closure under lifecycle ordering.** If A composes with B
   and A's Lifecycle has rank R, then B's Lifecycle must have
   rank ≥ R. See [Lifecycle primitive](./lifecycle.md#3-lifecycle-ordering-and-citation-discipline).

These three closures are the *composition algebra*.

## 3. The four canonical composition moves

The [adjunction analyzer](../adjunctions.md) recognises four
moves on the composition graph:

| Move | Effect on graph |
|------|-----------------|
| **Inline** | Remove a node; merge incoming/outgoing edges into the caller. |
| **Extract** | Split a node into two; redistribute edges. |
| **Compose** | Merge two adjacent nodes into one; combine their Shapes. |
| **Decompose** | Split one node along a seam; produce two nodes with separate Shapes. |

Each move has a preservation/gain manifest documented in
[adjunctions](../adjunctions.md).

## 4. Cross-cog capability flow

When cog A composes with cog B, the architectural type system
enforces the following data flow:

```text
   B exposes:  [Cap1, Cap2, Cap3]
   B requires: [Cap_x]
                    │
                    │ A "composes_with B"
                    ▼
   A's effective view:
     - May exercise Cap1, Cap2, Cap3 through B (transitively contributes to A.exposes)
     - Must satisfy Cap_x at runtime (A must provide it or transitively require it)
```

A's effective `requires` list grows by `B.requires`. A's
effective `exposes` list grows by `B.exposes` *unless* A
encapsulates the capability — confines its use inside private
code so the public surface of A does not let the capability
escape.

[`AP-001 CapabilityEscalation`](../anti-patterns/classical.md#ap-001)
and [`AP-022 CapabilityLaundering`](../anti-patterns/articulation.md#ap-022)
together check that A's *declared* capabilities accurately
reflect its effective capabilities.

## 5. The associativity law

Architectural composition must be **associative**:

```text
   (A ∘ B) ∘ C   ≡   A ∘ (B ∘ C)
```

Two compositions of the same cogs in different parenthesisations
must produce equivalent Shapes. This holds trivially for
hand-written compositions; the law becomes load-bearing for
*macro-generated* compositions, where a `@derive(...)` macro
might inject synthetic dependencies that depend on
parenthesisation.

[`AP-008 CompositionAssociativityBreak`](../anti-patterns/classical.md#ap-008)
catches macro-generated compositions that violate associativity.
The diagnostic identifies the offending macro and the
non-associative edges.

## 6. The identity element

The composition algebra has an identity element: a cog that
composes-with anything *vacuously* — declaring a Shape with
empty `exposes`, empty `requires`, and `composes_with: ["*"]`.
Such a cog adds no architectural content; composing with it
leaves the surrounding Shape unchanged.

In practice, the identity element is rarely declared explicitly.
It is useful as a *unit test* — confirming that the architectural
type checker treats the identity correctly. The
[adjunction analyzer](../adjunctions.md) verifies the identity
law as part of its preservation manifest.

## 7. Cog-package composition vs source-tree composition

The composes_with field is *cog-name* based, not file-path
based. The same compositional rules apply whether the composed
cog lives in:

- The same source tree (local cog).
- A workspace dependency (sibling cog).
- A registry-fetched cog package (remote cog).

The architectural type checker walks the cog-name graph
regardless of physical location. This makes the composition
algebra invariant under refactoring (moving cogs between
files, packages, repositories).

## 8. The transitive composition discipline

A subtle question: *if A composes with B, and B composes with
C, does A compose with C?*

The answer depends on B's Boundary discipline. If B's public
surface re-exports C's content, then A *transitively* composes
with C. If B *encapsulates* C — exposes only its own public
surface — then A does not compose with C in the architectural
sense; A and C have no edge.

The Boundary primitive's `messages_in` / `messages_out` slots
make the transit explicit: a re-export appears in B's
`messages_out`, an encapsulated dependency does not.

## 9. composes_with and CVE Lifecycle

The composes_with declaration *is* a citation in the
[CVE](../cve/overview.md) sense. A cog that composes with B is
*citing* B's content as load-bearing for itself. Three
consequences:

1. **Lifecycle ordering** — B's Lifecycle rank must be ≥ A's
   (else `AP-009 LifecycleRegression`).
2. **Foundation compatibility** — B's Foundation must compose
   with A's (else `AP-005 FoundationDrift`).
3. **Stratum admissibility** — if B mentions higher-stratum
   content, A must accommodate it or use a bridge.

The composition algebra is therefore *not* a free monoid — it is
constrained by the per-axis admissibility rules.

## 10. Cross-references

- [Capability primitive](./capability.md) — what flows through
  composition.
- [Lifecycle primitive](./lifecycle.md) — the rank discipline
  composition must respect.
- [Foundation primitive](./foundation.md) — the meta-theoretic
  profile composition must respect.
- [Stratum primitive](./stratum.md) — the MSFS stratum
  composition must respect.
- [Boundary primitive](./boundary.md) — the discipline of edge
  traffic, where composition's transit happens.
- [Shape](./shape.md) — the aggregate carrier.
- [Adjunctions](../adjunctions.md) — the four canonical moves on
  the composition graph.
- [Anti-pattern AP-003 DependencyCycle](../anti-patterns/classical.md#ap-003).
- [Anti-pattern AP-008 CompositionAssociativityBreak](../anti-patterns/classical.md#ap-008).
- [Anti-pattern AP-009 LifecycleRegression](../anti-patterns/classical.md#ap-009).
