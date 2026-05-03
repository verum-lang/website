---
sidebar_position: 15
title: "Self-application — ATS-V annotated by ATS-V"
description: "ATS-V types itself. Every primitive of the architectural type system is declared in a Verum cog whose own Shape is checked by the very same architectural type checker."
slug: /architecture-types/self-application
---

# Self-application — ATS-V annotated by ATS-V

A claim of soundness in a system that classifies others is only
load-bearing when *the system survives its own classification*. A
type system that cannot type itself; a verification framework
that cannot verify its own correctness; an architectural-type
system that cannot annotate its own primitives — each is, by
construction, weaker than the artefacts it claims to govern.

ATS-V is **self-applicable**. Every primitive of the architectural
type system — `Capability`, `Boundary`, `Composition`, `Lifecycle`,
`Foundation`, `Tier`, `Stratum`, `Shape` — is declared in a Verum
cog whose own `Shape` is checked by the very same architectural
type checker.

This page documents the self-application: which cog declares
ATS-V's types, what its Shape claims, and why the
self-application is more than aesthetics — it is the *test* that
ATS-V's primitives are sufficient.

## 1. The cog that declares ATS-V

ATS-V's primitives live in `core.architecture.types`. The cog's
own `@arch_module(...)` annotation:

```verum
@arch_module(
    foundation: Foundation.ZfcTwoInacc,
    stratum:    MsfsStratum.LFnd,
    lifecycle:  Lifecycle.Theorem("v0.1"),
)
module core.architecture.types;

mount core.prelude.{Bool, Int, Maybe, List, Text};

// =====================================================================
// The eight architectural primitives — declared here, checked by ATS-V
// =====================================================================

public type Capability is
    | Read(ResourceTag)
    | Write(ResourceTag)
    | Exec(ExecTarget)
    | Escalate(PrivilegeRealm)
    | Spawn(TaskLifetime)
    | TimeBound(ExpirationPolicy)
    | Persist(PersistenceMedium)
    | Network(NetProtocol, NetDirection)
    | CustomCapability(Text);

public type Boundary is { ... };

public type Lifecycle is
    | Hypothesis(ConfidenceLevel)
    | Plan(Text)
    | Postulate(Text)
    | Definition
    | Conditional(List<Text>)
    | Theorem(Text)
    | Interpretation(Text)
    | Retracted(Text, Maybe<Text>)
    | Obsolete(Text, Maybe<Text>);

// ... the remaining primitives ...
```

The cog declares itself as a `[T]` Theorem, foundation
ZFC + 2-inacc, stratum LFnd. The compiler verifies these claims
against the body, just as it would for any other annotated cog.

## 2. The discipline — no privileged escape

The crucial discipline: there is **no privileged escape hatch**.
The architectural type checker that validates application
code *also validates* `core.architecture.types`. If the
architectural type system rejects a Shape, that includes Shapes
belonging to its own implementation.

Three concrete consequences:

1. **The cog's `[T]` Lifecycle requires every public function to
   carry `@verify(...)`.** And they do — the type definitions
   are `Definition`-class declarations whose discharge is
   trivial.
2. **The cog's `Foundation.ZfcTwoInacc` declaration is checked
   against its imports.** It mounts only `core.prelude` (which
   itself is ZFC-grounded), so the foundation discipline is
   honoured.
3. **The cog's `composes_with` discipline is checked.** The cog
   is mounted by `core.architecture.checks` and many other
   cogs; the cross-cog graph respects the lifecycle ordering
   and capability discipline.

## 3. Why self-application is more than aesthetics

A primitive that ATS-V itself needs but cannot express in its
own surface is, by construction, a primitive that does *not
belong* in the canonical set. Self-application is the *test*
that the primitives are sufficient.

Three example tests:

### 3.1 Test: can ATS-V express its own foundational character?

The cog declares `Foundation.ZfcTwoInacc` and `MsfsStratum.LFnd`.
These primitives suffice — no extension to the Foundation or
Stratum variants is needed to type the cog. ✓

### 3.2 Test: can ATS-V express its own capability discipline?

The cog has empty `exposes` and empty `requires` — it provides
type definitions only, doesn't *do* anything. The Capability
primitive's `[]` (empty list) suffices for this case. ✓

### 3.3 Test: can ATS-V express its own composition rules?

The cog mounts `core.prelude` and is mounted by many downstream
cogs. The composes_with primitive (with its capability/lifecycle
conservation rules) suffices to type the cog's import graph. ✓

If any of these tests *failed* — if the cog could not be typed by
its own primitives — that would indicate a missing primitive.
Verum's primitives have grown over time precisely because of
such tests; today's eight are the *minimal sufficient set*.

## 4. The recursion grounded by Lifecycle.Theorem

A potential anti-pattern: an infinite regress where the type
system's correctness depends on its own correctness. Self-
application without grounding would be circular — the cog's
`Lifecycle.Theorem` claim depends on the soundness of the
architectural type system, which is what the cog is defining.

The recursion is *grounded* by two factors:

1. **The Lifecycle is `Theorem("v0.1")`** — a *specific*
   version. Future versions may be `Theorem("v0.2")` etc., but
   the current version's soundness is not contingent on future
   versions.
2. **The trusted base is independent.** ATS-V's primitives are
   defined in Verum, but the *checker* is implemented in Rust
   in `verum_kernel::arch`. The Rust implementation is
   independently auditable; the Verum-side primitives are a
   *mirror* whose alignment is pinned by kernel-side tests.

The recursion is therefore one of *attestation* (the cog
attests to its own Shape) but not of *bootstrapping* (the
checker is not running in the very Verum code it is checking).

## 5. The CVE seven-layer perspective

Self-application is a CVE-L6 question: *is the framework C-V-E
when applied to itself?* See
[CVE — articulation hygiene](./cve/articulation-hygiene.md)
for the L6 register-prohibition discipline.

ATS-V's self-application answers L6 affirmatively:

- **C:** the primitives are realised as Verum types — ✓.
- **V:** the cog is type-checked by the architectural type
  system — ✓.
- **E:** the type definitions extract trivially — ✓.

All three at L6. The framework survives self-application.

## 6. The audit chronicle's record

`verum audit --arch-corpus` includes `core.architecture.types`
in its inventory. The cog's entry:

```json
{
  "cog":         "core.architecture.types",
  "lifecycle":   { "variant": "Theorem", "since": "v0.1", "rank": 6 },
  "foundation":  "ZfcTwoInacc",
  "stratum":     "LFnd",
  "at_tier":     "Aot",
  "exposes":     [],
  "requires":    [],
  "composes_with": [],   // permissive default
  "self_attesting": true
}
```

The `self_attesting: true` field is informational — it marks
cogs that contribute to ATS-V's own implementation. Auditors
inspect these cogs with extra care because their Shapes are
load-bearing for the rest of the audit.

## 7. The kernel-side mirror

The Verum-side `core.architecture.types` has a kernel-side
mirror in the `arch` module of the trusted kernel. The two are
kept in sync by the kernel test suite — every variant added on
one side has a corresponding variant on the other.

This mirror is itself an architectural artefact. The kernel
side is the *trusted base* (the kernel that performs the
checks); the Verum side is the *self-application surface* (the
type definitions the kernel examines). Drift between the two
manifests as a test failure in the kernel test suite.

The discipline has shipped without drift through multiple
revisions. New primitives — when ATS-V grew from six primitives
to eight — were added to both sides synchronously, with the
test suite enforcing parity.

## 8. The final closure

Self-application closes the framework. ATS-V says: *every cog
declares its Shape; the Shape is checked; defects surface as
RFC-coded diagnostics*. The framework includes itself in the
"every cog" — and it survives the check.

The closure is what makes ATS-V suitable as a foundation rather
than a convention. A framework that is exempted from its own
discipline is, by construction, weaker than its own discipline.
ATS-V is not exempted.

## 9. Cross-references

- [Architecture-as-Types overview](./index.md) — the framework
  applied to user code.
- [The eight architectural primitives](./primitives/overview.md)
  — the canonical set the self-application tests.
- [CVE — articulation hygiene](./cve/articulation-hygiene.md) —
  the L6 register-prohibition discipline self-application
  satisfies.
- [Audit protocol](./audit-protocol.md) — the audit chronicle
  that records the self-attestation.
