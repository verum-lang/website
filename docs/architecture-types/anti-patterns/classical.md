---
sidebar_position: 2
title: "Capability / composition core (AP-001 .. AP-010)"
description: "The first ten ATS-V anti-patterns: capability discipline, composition algebra, lifecycle ordering, foundation drift, register mixing, transaction / resource straddling, CVE-closure completeness."
slug: /architecture-types/anti-patterns/classical
---

# Capability / composition core (AP-001 .. AP-010)

Band 1 covers the architectural defects that follow directly from
the eight [ATS-V primitives](../primitives/overview.md) and the
[CVE-closure](../cve/overview.md) discipline. Every pattern in
this band fires during the **arch-check** phase (cog-by-cog,
before composition is considered), and every one has a
remediation that does not require redesigning the surrounding
architecture.

This page is the operational reference: each entry has a precise
predicate paraphrased from
the canonical anti-pattern catalog and its per-pattern predicates, a worked
example, the diagnostic the compiler emits, and the canonical
remediation.

For the catalog's overall structure see
[Anti-pattern overview](./overview.md). For the predicate-level
formalisation see
[verification → soundness gates](../../verification/soundness-gates.md).

---

## AP-001 — CapabilityEscalation {#ap-001}

**Severity:** error in strict mode, warning in soft · **Phase:** arch-check · **Stable since:** v0.1

**Predicate.** `forall c ∈ inferred_used_capabilities(cog).
c ∈ Shape.requires`. The cog's body must not invoke any
capability that is not declared in `@arch_module(requires: [...])`.

**Why it matters.** Capability declarations are the architecture's
audit trail: a cog that *uses* something it didn't *declare* is
an unaudited surface. The auditor reading the `@arch_module`
attribute would conclude the cog is harmless; the runtime would
disagree.

**Diagnostic.**
```text
ATS-V-AP-001 [error] in cog `my_app.checkout`:
  Capability/ies not declared in @arch_module(requires): network, persist
  Cog uses 2 capability/ies that are not declared in its
  @arch_module(requires). Add them to the requires list, or remove the usage.
```

**Remediation.** Add the inferred capabilities to the `requires`
list, or remove the usage in the body.

```verum
// Before — body uses Database, attribute doesn't declare it.
@arch_module(requires: [Logger])
module my_app.checkout;
fn process() using [Database, Logger] -> Bool { ... }

// After — declaration matches inferred surface.
@arch_module(requires: [Database, Logger])
module my_app.checkout;
```

---

## AP-002 — CapabilityLeak {#ap-002}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.1

**Predicate.** `forall c : Linear ∈ uses(cog). c.scope ⊆ cog.scope`.
Linear / affine capabilities (under `@quantity(1)`) must be
consumed exactly once within the issuing scope.

**Why it matters.** Linear capabilities encode resources that
must not duplicate (a one-shot token, a file handle that must
close, an authorisation that must be exercised). Letting one
escape its issuing scope breaks the multiplicity contract — the
caller may inadvertently double-spend.

**Diagnostic.**
```text
ATS-V-AP-002 [error] in cog `my_app.payment`:
  3 linear/affine capability/ies escape their scope
  A capability marked linear or affine via @quantity(1) was passed beyond
  its declared scope. Linear capabilities must be consumed exactly once
  within their issuing scope.
```

**Remediation.** Consume the capability within scope, or change
`@quantity(1)` to `@quantity(omega)` if duplication is
acceptable.

---

## AP-003 — DependencyCycle {#ap-003}

**Severity:** error · **Phase:** post-arch · **Stable since:** v0.1

**Predicate.** `acyclic(composes_with_graph)`. The cog must not
participate in any cycle of `@arch_module(composes_with: [...])`
declarations.

**Why it matters.** Architectural composition is a forest, not a
graph. A cycle means the architecture has no well-founded order
of construction — the cogs mutually depend without a base case.
This often indicates a missing protocol boundary that should
break the cycle.

**Detection.** Tarjan-style: any cycle involving the cog
(self-loop, or two-or-more cogs forming a strongly-connected
component) triggers. Pure reachability to *some* cyclic component
downstream does **not** trigger — the question is "does this cog
participate in a cycle?", not "does it observe one downstream?".

**Diagnostic.**
```text
ATS-V-AP-003 [error] in cog `my_app.alpha`:
  Cog my_app.alpha participates in a dependency cycle
  Cog my_app.alpha appears in a cycle of @arch_module(composes_with)
  declarations. Architectural composition graphs must be acyclic.
```

**Remediation.** Break the cycle by introducing a protocol
boundary (a `type ... is protocol { ... }` that both cogs use)
or by extracting the shared concern into a third cog.

---

## AP-004 — TierMixing {#ap-004}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.1

**Predicate.** `forall callee_tier. caller.at_tier.compatible_with(callee_tier)`.
Tier compatibility (per `Tier::compatible_with`):

- Same-tier compositions are always compatible.
- A `MultiTier { allowed }` is compatible with every tier in
  `allowed`.
- The `Check` tier is incompatible with every actual-runtime
  tier (it is type-check-only — nothing runs).
- Different tiers without a `@arch_tier_bridge` are
  incompatible.

**Why it matters.** Tier 0 (interpreter), Tier 1 (AOT) and
Tier 2 (GPU) have distinct execution semantics, calling
conventions and runtime invariants. Crossing tiers without a
bridge silently produces undefined behaviour.

**Remediation.** Either change `at_tier` to `MultiTier` with the
called tiers included, or introduce an explicit
`@arch_tier_bridge` annotation describing the bridge's
preservation contract.

---

## AP-005 — FoundationDrift {#ap-005}

**Severity:** error · **Phase:** post-arch · **Stable since:** v0.1

**Predicate.**
`forall (A, B) ∈ composes. A.foundation = B.foundation ∨ A.foundation ⊑ B.foundation ∨ B.foundation ⊑ A.foundation`.
Two cogs may compose only when their foundations are the same,
or one is *directly subsumed* by the other (canonical inclusions
only: CIC ⊃ MLTT, Cubical ⊃ HoTT). Cross-paradigm composition
requires an explicit functor-bridge cited via
`@framework(bridge_corpus, ...)`.

**Why it matters.** Foundations carry meta-theoretic strength
assumptions. Composing a HoTT cog with a ZFC-only cog mixes
universe ascent / cumulativity disciplines that are
demonstrably distinct; without a bridge, theorems proven in one
foundation cannot be cited in the other.

**Remediation.** Either align the foundations (move the
composing cog into the same foundation), or add a functor-bridge
declaration that translates predicates faithfully.

---

## AP-006 — RegisterMixing {#ap-006}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `forall citation ∈ proof_body(cog). citation.register ∉ Forbidden`.
Per CVE §6.7 (L6 antiphilosophical invariant), formal theorems
must not cite authoritative-appeal, phenomenological,
traditional, interpretive or ontological-declaration sources as
load-bearing justification. The forbidden register taxonomy is
[`ForbiddenRegisterKind`](../../reference/glossary).

**Why it matters.** A formal proof's load-bearing justification
must be structural / kernel-discharged / formally-cited. An
appeal to authority ("X said so") is an architectural defect at
the proof level: it doesn't compose under transitive citation
discipline.

**Remediation.** Replace the forbidden register citation with a
structural / kernel-discharged / formally-cited reference. The
auditor's `verum audit --arch-discharges` report carries the
exact citation location.

---

## AP-007 — TxStraddling {#ap-007}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `forall tx : Affine. !crosses_async(tx)`. An
affine transaction (held under `@quantity(1)`) must not outlive
its async scope.

**Why it matters.** A transaction held across an `await` point
becomes ambiguous — does the suspended task still hold the
transaction's lock? Different async runtimes answer differently;
the architectural rule eliminates the ambiguity by structural
prohibition.

**Remediation.** Either commit / rollback before the await
point, or restructure the transaction-bearing block inside a
`nursery { ... }` so structured concurrency enforces scope.

---

## AP-008 — ResourceStraddling {#ap-008}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `forall h : LinearResource. !escapes_scope(h)`.
File handles, database connections, mutexes — every linear
resource must be released within its issuing scope (either
explicitly closed or dropped at scope exit).

**Why it matters.** Linear resources have invariants the type
system tracks: a closed file handle should not be readable, a
released mutex should not be held twice. Letting a resource
escape its scope means those invariants leak into a context
that cannot enforce them.

**Remediation.** Wrap the resource in `using { ... }` (Verum's
RAII form), or restructure so every successful path releases.

---

## AP-009 — LifecycleRegression {#ap-009}

**Severity:** error · **Phase:** post-arch · **Stable since:** v0.1

**Predicate.** `forall (citing, cited) ∈ citations. citing.lifecycle.rank() ≥ cited.lifecycle.rank()`.
A more-mature artefact must not cite a less-mature one. The
ranking is fixed (per `Lifecycle::rank`):
`[Т] > [О] = [С] > [П] > [Г] > [И] > [✗] > Obsolete`.

**Why it matters.** Citation transports load-bearing strength: a
Theorem `[Т]` citing a Hypothesis `[Г]` makes the theorem only
as strong as the hypothesis. Documents that purport to be
mature corpus must not silently weaken themselves through
backward citation.

**Diagnostic.**
```text
ATS-V-AP-009 [error] in cog `my_app.checkout`:
  Lifecycle regression: Theorem("v1.0") cites Hypothesis(Medium)
  cited cog `my_app.experimental.zk_proof` lifecycle is below citing.
  Maturity rank diff = 4 (Theorem ranks 6, Hypothesis ranks 2).
```

**Remediation.** Either mature the cited artefact to at least
the citing artefact's rank, or downgrade the citing artefact
explicitly. The audit chronicle records every conscious
downgrade.

---

## AP-010 — CveIncomplete {#ap-010}

**Severity:** error in strict mode, warning in soft · **Phase:** arch-check · **Stable since:** v0.2

**Predicate.** `Shape.strict ⇒ Shape.cve_closure.is_fully_closed()`.
A strict-mode cog must declare all three CVE-closure axes:

- **C** — Constructive witness (function or constructor path).
- **V** — Verification strategy (one of the nine `@verify(...)`
  ladder rungs).
- **E** — Executable artefact (entry point or audit command).

Soft-mode cogs may have missing axes (warning); strict-mode
cogs must close the triple.

**Why it matters.** CVE-closure is the operational engineering
contract: every claim has a constructive witness, a verification
mechanism, and an executable artefact. Missing an axis means the
claim doesn't compose under the CVE discipline.

**Remediation.** Add the missing axes via
`@arch_module(cve_closure: { ... })`, or demote `strict: true`
to `strict: false` for cogs that are intentionally partial.

---

## See also

- [Anti-pattern catalog overview](./overview.md) — the indexing
  page with the full 32-entry table.
- [Boundary / lifecycle / capability ontology (AP-011..AP-026)](./articulation.md)
- [Modal-temporal anti-patterns (AP-027..AP-032)](./mtac.md)
- [CVE three-axis closure](../cve/overview.md)
- [ATS-V primitives — capability, foundation, tier, lifecycle](../primitives/overview.md)
