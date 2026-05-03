---
sidebar_position: 1
title: "The Eight Architectural Primitives"
description: "Capability, Boundary, Composition, Lifecycle, Foundation, Tier, Stratum, Shape — the eight Verum-native primitives ATS-V is built from."
slug: /architecture-types/primitives
---

# The Eight Architectural Primitives

The Architectural Type System for Verum (ATS-V) imports no foreign
concepts. Every architectural claim — capability, boundary, lifecycle,
composition discipline — is expressed in *existing Verum syntax*:
variants, records, attributes, protocols. The eight primitives
listed below are the canonical vocabulary.

This page is a tour. Each primitive has its own deep-dive document
linked from the table; readers new to ATS-V should read this page
in order, then follow the deep-dives in the order they appear in
their own work.

## 1. The eight primitives at a glance

| # | Primitive | Verum surface | Question it answers | Deep-dive |
|---|-----------|---------------|---------------------|-----------|
| 1 | **Capability** | `type Capability is …` (variant) | What may this cog *do*? | [details](./capability.md) |
| 2 | **Boundary** | `type Boundary is { … }` (record) | What crosses the cog's edge, and how? | [details](./boundary.md) |
| 3 | **Composition** | `composes_with: List<Text>` | Which other cogs may legally compose with this one? | [details](./composition.md) |
| 4 | **Lifecycle** | `type Lifecycle is …` (variant) | At which CVE stage is this artefact? | [details](./lifecycle.md) |
| 5 | **Foundation** | `type Foundation is …` (variant) | Which meta-theoretic profile carries the proof corpus? | [details](./foundation.md) |
| 6 | **Tier** | `type Tier is …` (variant) | Where does this code execute? | [details](./tier.md) |
| 7 | **Stratum** | `type MsfsStratum is …` (variant) | Which Modular-Stratified-Foundation level? | [details](./stratum.md) |
| 8 | **Shape** | `type Shape is { … }` (record) | The aggregate carrier — a `Shape` *is* the architectural fingerprint. | [details](./shape.md) |

## 2. The aggregate — `Shape`

Every cog declares its architectural intent via the `@arch_module(...)`
attribute. The compiler reads the attribute as a `Shape` value —
a record whose fields are seven of the eight primitives plus a
strictness flag and a CVE-closure triple:

```verum
public type Shape is {
    exposes:        List<Capability>,
    requires:       List<Capability>,
    preserves:      List<BoundaryInvariant>,
    consumes:       List<Text>,                  // resource-tag list
    at_tier:        Tier,
    foundation:     Foundation,
    stratum:        MsfsStratum,
    cve_closure:    CveClosure,
    lifecycle:      Lifecycle,
    composes_with:  List<Text>,
    strict:         Bool,
};
```

The `Shape` is the architectural type of the cog. Two cogs with the
same `Shape` are architecturally interchangeable; two cogs with
different `Shape`s require an explicit functor-bridge to compose
(see [composition](./composition.md)).

## 3. How `@arch_module` reads onto `Shape`

The annotation has flexible field order — every field is optional
and defaults to a sensible no-op. A minimal annotation is:

```verum
@arch_module(lifecycle: Lifecycle.Theorem("v1.0"))
module my_app.checkout;
```

…which expands to a `Shape` with empty `exposes` / `requires`,
`Tier.Aot`, `Foundation.ZfcTwoInacc` (the default), `MsfsStratum.LFnd`,
and `strict: false`. The full long form is:

```verum
@arch_module(
    foundation:    Foundation.ZfcTwoInacc,
    stratum:       MsfsStratum.LFnd,
    lifecycle:     Lifecycle.Theorem("v1.0"),
    exposes:       [Capability.Read(ResourceTag.File("./config")),
                    Capability.Network(NetProtocol.Tcp, NetDirection.Outbound)],
    requires:      [Capability.Read(ResourceTag.Logger),
                    Capability.Read(ResourceTag.Random)],
    preserves:     [BoundaryInvariant.AllOrNothing,
                    BoundaryInvariant.AuthenticatedFirst],
    composes_with: ["my_app.crypto", "my_app.config"],
    at_tier:       Tier.Aot,
    cve_closure:   CveClosure {
        constructive:        Some("explicit_constructor"),
        verifiable_strategy: Some(VerifyStrategy.Certified),
        executable:          Some("verum extract --target=rust"),
    },
    strict:        true,
)
module my_app.fetcher;
```

The compiler validates each field individually and then validates
the *combination* against the body of the cog. A claim of
`Capability.Network(Tcp, Outbound)` that the body doesn't actually
exercise is permitted (over-declaration is conservative); the
opposite — the body exercises a network call but the `exposes`
list omits it — is [`AP-001 CapabilityEscalation`](../anti-patterns/classical.md#ap-001).

## 4. The discipline of "no new grammar"

Every primitive uses one of three pre-existing Verum grammar forms:

- **Variant types** (`type X is A | B(T) | …`) carry enumerations:
  `Capability`, `Lifecycle`, `Foundation`, `Tier`, `MsfsStratum`,
  `BoundaryInvariant`, `WireEncoding`, etc.
- **Record types** (`type X is { … }`) carry aggregates: `Boundary`,
  `Shape`, `CveClosure`.
- **Attributes** (`@arch_module(...)`, `@framework(...)`, `@verify(...)`)
  carry annotations attached to declarations.

There is no `architecture` keyword. There is no `capability`
keyword. There is no special `module …` declaration form for
architectural cogs. The discipline is *strict*: an extension that
required a new grammar production would be evidence that the
primitive does not belong in the canonical set.

This pays off in three ways:

1. **Tooling reuse.** The LSP, the formatter, the parser, the
   type checker, the macro expander all work on ATS-V code with
   zero special-case logic.
2. **Migration ergonomics.** A codebase can adopt ATS-V
   incrementally — annotating one cog at a time — without flag
   days, without parser version splits, without language-server
   upgrades.
3. **Self-application.** ATS-V's own `core.architecture.types`
   cog is annotated with `@arch_module(...)`. The type checker
   that validates application code also validates ATS-V's own
   primitives. There is no privileged escape hatch.

## 5. Reading primitives without context

Each primitive's deep-dive page is self-contained. You can read
[capability](./capability.md) without first reading
[boundary](./boundary.md). The cross-references inside the
deep-dives all point to other docs in this category and to
related `core/` standard-library types — never to internal
specifications.

A reader entering the system without prior architectural-typing
exposure will get the most leverage by reading:

1. **[Lifecycle](./lifecycle.md)** — the CVE 7-symbol taxonomy.
   Lifecycle is the simplest primitive and the one most code
   review surfaces.
2. **[Capability](./capability.md)** — the first-class
   "permission" type. Capabilities are the unit of architectural
   authority and are conserved across composition.
3. **[Shape](./shape.md)** — the aggregate. Once Lifecycle and
   Capability are familiar, the rest of `Shape`'s fields read
   easily.
4. **[Foundation](./foundation.md)** — the meta-theoretic profile.
   Especially important for teams that mix proof corpora.
5. **[Tier](./tier.md)** + **[Stratum](./stratum.md)** —
   execution placement and MSFS positioning. Most cogs use
   defaults (`Aot`, `LFnd`); these matter primarily for cross-tier
   FFI and for proof-corpus migration.
6. **[Boundary](./boundary.md)** + **[Composition](./composition.md)** —
   the discipline of cross-cog traffic. Most cogs use sensible
   defaults; these become load-bearing in multi-cog projects.

## 6. The discipline by example

A small worked example shows how the eight primitives interlock.
We have a payment-processing cog whose architectural intent is:

- *Theorem-class* artefact (load-bearing, fully proved).
- Reads ledger state, writes settlement records.
- Speaks gRPC outbound to a fraud detector.
- Composes only with cogs from the same security boundary.
- Runs at AOT tier 1 in a ZFC + 2-inacc foundation, MSFS
  stratum `LFnd`.

```verum
@arch_module(
    lifecycle:     Lifecycle.Theorem("v3.2"),
    foundation:    Foundation.ZfcTwoInacc,
    stratum:       MsfsStratum.LFnd,
    at_tier:       Tier.Aot,
    exposes:       [
        Capability.Read(ResourceTag.Database("ledger")),
        Capability.Write(ResourceTag.Database("settlement")),
        Capability.Network(NetProtocol.Grpc, NetDirection.Outbound),
    ],
    requires:      [
        Capability.Read(ResourceTag.Logger),
        Capability.Read(ResourceTag.Clock),
    ],
    preserves:     [
        BoundaryInvariant.AllOrNothing,
        BoundaryInvariant.AuthenticatedFirst,
        BoundaryInvariant.BackpressureHonoured,
    ],
    composes_with: ["payment.fraud", "payment.audit"],
    strict:        true,
)
module payment.settlement;
```

The ATS-V phase reads this as eight obligations:

1. **Lifecycle** — body is fully proved; `@verify(certified)` is
   expected on every public function.
2. **Foundation** — proof corpus uses ZFC + 2-inacc; foreign
   citations to HoTT or Cubical require a functor-bridge.
3. **Stratum** — settles in `LFnd`; the cog *cannot* mention
   `LAbs`-typed objects without stratum-admissibility check.
4. **Tier** — body emits AOT-friendly code; tier-mixing call
   sites flagged.
5. **Capability exposes** — reads ledger, writes settlement,
   speaks outbound gRPC. *Anything else* the body does is an
   AP-001 violation.
6. **Capability requires** — needs Logger and Clock providers in
   the runtime context.
7. **Boundary invariants** — every public function must preserve
   all-or-nothing semantics, must authenticate before first byte,
   and must honour back-pressure signals.
8. **Composition** — only `payment.fraud` and `payment.audit`
   may import from this cog. Imports from other cogs are
   architectural errors *even if the value types match*.

These eight obligations live in the type system. The type checker
issues stable RFC-coded diagnostics for each violation. There is
no separate "architectural review" step.

## 7. Where each primitive plumbs into the rest of the system

| Primitive | Connects to … |
|-----------|---------------|
| **Capability** | the property system (`PropertySet`), the context system (`using [...]`), and the [orthogonality](../orthogonality.md) doc. |
| **Boundary** | wire encoding (`stdlib/encoding`), back-pressure (`stdlib/runtime`), authentication (`stdlib/security`). |
| **Composition** | the module system (mounting), the cog-package registry (`tooling/cog-packages`). |
| **Lifecycle** | CVE (the [seven symbols](../cve/seven-symbols.md)), audit reports, proof-corpus migration. |
| **Foundation** | the framework-axiom inventory (`verum audit --framework-axioms`), proof export. |
| **Tier** | the VBC bytecode + LLVM AOT pipeline; `verum run --interp` vs `--aot`. |
| **Stratum** | the [MSFS coord](../../verification/msfs-coord.md) discipline. |
| **Shape** | the aggregate carrier — referenced by every audit gate. |

Each connection is documented inside the corresponding deep-dive.

## 8. What ATS-V annotation is *not*

A handful of clarifications that prevent common misreadings.

- **`@arch_module(...)` is not a permission system.** It is a
  *type* — a static description of what the cog claims about
  itself. Runtime permission enforcement is the
  [context system's](../../language/context-system.md) job.
- **A `Shape` is not a runtime object.** The compiler erases
  `Shape` after architectural type-checking. Production binaries
  carry no architectural metadata unless explicitly opted in via
  `@embed_shape(...)`.
- **An over-declared capability is not an error.** Conservatism is
  always permitted; *under-declaration* (the body does X but the
  Shape does not list X) is the error. This asymmetry mirrors
  how `unsafe` and ownership work in tier-0 references.
- **`composes_with: []` is not the same as `composes_with: missing`.**
  An explicit empty list is the strictest possible composition
  declaration: *no other cog may import this one*. Missing
  composition is the *permissive* default: imports allowed
  subject to capability/boundary checks.

## 9. Cross-references

- [Capability — first-class possibility](./capability.md)
- [Boundary — typed cross-cog traffic](./boundary.md)
- [Composition — the cog-composition algebra](./composition.md)
- [Lifecycle — CVE 7-symbol taxonomy](./lifecycle.md)
- [Foundation — meta-theoretic profile](./foundation.md)
- [Tier — execution placement](./tier.md)
- [Stratum — MSFS moduli stratum](./stratum.md)
- [Shape — aggregate carrier](./shape.md)
- [Three orthogonal axes](../orthogonality.md) — capability vs
  property vs context.
- [Anti-patterns overview](../anti-patterns/overview.md) — the
  thirty-two canonical defects ATS-V detects.
- [Audit protocol](../audit-protocol.md) — how to run the audit
  gates that consume Shapes.
