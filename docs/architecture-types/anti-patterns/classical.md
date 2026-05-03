---
sidebar_position: 2
title: "Classical anti-patterns (AP-001 .. AP-009)"
description: "The first nine ATS-V anti-patterns: capability escalation, boundary violation, dependency cycle, tier mixing, foundation drift, register mixing, stratum admissibility, composition associativity, lifecycle regression."
slug: /architecture-types/anti-patterns/classical
---

# Classical anti-patterns (AP-001 .. AP-009)

The classical band covers the architectural defects that follow
directly from the eight [ATS-V primitives](../primitives/overview.md).
Every classical pattern is an *error by default*, every one fires
during the **arch-check** phase (before composition is considered),
and every one has a remediation that does not require redesigning
the surrounding architecture.

This page is the operational reference: each entry has a precise
predicate, a worked example, the diagnostic the compiler emits, and
the canonical remediation.

For the catalog's overall structure see
[Anti-pattern overview](./overview.md). For the predicate-level
formalisation see [verification → soundness gates](../../verification/soundness-gates.md).

---

## AP-001 — CapabilityEscalation {#ap-001}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.1

**Predicate.** A cog's body exercises capability `c` while the
cog's `Shape.exposes` does not contain `c` (or a capability that
subsumes `c`).

**What it catches.** A function calls `net.tcp.connect(...)` from
inside a cog whose architectural Shape claims it only reads files.

**Worked example — defect.**

```verum
@arch_module(
    exposes: [Capability.Read(ResourceTag.File("./config"))],
)
module my_app.config_loader;

public fn fetch_remote_config(url: &Text) -> Result<Config, Error> {
    let body = net.http.get(url)?;       // <-- AP-001 here
    parse_config(body)
}
```

**Diagnostic.**

```text
error[ATS-V-AP-001]: capability escalation
  --> src/config_loader.vr:7:16
   |
 7 |     let body = net.http.get(url)?;
   |                ^^^^^^^^^^^^^^^^^^ body uses
   |                Capability.Network(Http, Outbound),
   |                but cog `my_app.config_loader` does not
   |                expose this capability.
   |
note: cog declares
        @arch_module(
          exposes: [Capability.Read(File("./config"))],
        )
help: either
   1. add Capability.Network(Http, Outbound) to `exposes`, or
   2. move the network call into a child cog whose Shape
      encapsulates the capability.
```

**Remediation.** Either declare the missing capability in the
cog's `exposes`, or factor the call into a child cog:

```verum
// child cog encapsulates the network capability
@arch_module(exposes: [Capability.Network(Http, Outbound)])
module my_app.config_loader.remote_fetch;

// parent cog now exposes only File reads
@arch_module(
    exposes:       [Capability.Read(ResourceTag.File("./config"))],
    composes_with: ["my_app.config_loader.remote_fetch"],
)
module my_app.config_loader;
```

**Why the asymmetry.** Over-declaration is *always* permitted —
listing `Network(Http, Outbound)` in `exposes` when the body
never makes the call is fine; the architectural type system is
conservative. Under-declaration is the error.

---

## AP-002 — BoundaryViolation {#ap-002}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.1

**Predicate.** A message crosses a cog's `Boundary` without
satisfying every entry in `Boundary.invariants`.

**What it catches.** A cog declares
`BoundaryInvariant.AuthenticatedFirst` on its inbound boundary,
but a public function processes the first byte of an inbound
message before the authentication handshake.

**Worked example — defect.**

```verum
@arch_module(
    preserves: [BoundaryInvariant.AuthenticatedFirst,
                BoundaryInvariant.BackpressureHonoured],
)
module my_app.api.handler;

public fn handle_request(req: &Request) -> Response {
    log.info(f"request body: {req.body}");   // <-- reads body
    let auth = req.headers.get("Authorization");
    if !validate_auth(auth) {                 // <-- auth check AFTER body read
        return Response.unauthorised();
    }
    process(req)
}
```

**Diagnostic.**

```text
error[ATS-V-AP-002]: boundary violation
  --> src/handler.vr:7:5
   |
 7 |     log.info(f"request body: {req.body}");
   |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ first byte of inbound
   |                                          message is consumed
   |                                          BEFORE validate_auth.
   |
note: cog declares preserves [AuthenticatedFirst, ...]
help: move authentication BEFORE any other access to req.body.
```

**Remediation.** Restructure so authentication runs first:

```verum
public fn handle_request(req: &Request) -> Response {
    let auth = req.headers.get("Authorization");
    if !validate_auth(auth) {
        return Response.unauthorised();
    }
    log.info(f"request body: {req.body}");
    process(req)
}
```

The boundary checker walks the function body in order and emits
the diagnostic at the *first* operation that violates the
invariant — typically the easiest violation to remediate.

---

## AP-003 — DependencyCycle {#ap-003}

**Severity:** error · **Phase:** post-arch · **Stable since:** v0.1

**Predicate.** The directed graph induced by `Shape.composes_with`
across all cogs in a project contains a cycle.

**What it catches.** Two cogs that mutually `composes_with` each
other, or a longer chain `A → B → C → A`.

**Worked example — defect.**

```verum
@arch_module(composes_with: ["my_app.b"])
module my_app.a;

@arch_module(composes_with: ["my_app.a"])    // <-- forms a cycle
module my_app.b;
```

**Diagnostic.**

```text
error[ATS-V-AP-003]: composition cycle detected
  cycle: my_app.a → my_app.b → my_app.a
help: introduce a third cog whose Shape mediates the relationship,
      or split one of the cogs along the dependency boundary.
```

**Remediation.** Cycles in architectural composition signal an
under-specified boundary. Introduce a *mediator* cog:

```verum
@arch_module(composes_with: ["my_app.shared_state"])
module my_app.a;

@arch_module(composes_with: ["my_app.shared_state"])
module my_app.b;

@arch_module(/* no composes_with */)
module my_app.shared_state;
```

The mediator carries the shared concern; A and B each compose
with the mediator instead of each other.

---

## AP-004 — TierMixing {#ap-004}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.1

**Predicate.** A cog at `Tier.Aot` directly invokes a function in
a cog at `Tier.Interp` (or vice versa) without an explicit
tier-bridge attribute.

**What it catches.** A production AOT-compiled cog accidentally
calls into a development-time interpretive cog whose code does
not survive AOT compilation.

**Worked example — defect.**

```verum
@arch_module(at_tier: Tier.Aot)
module my_app.ledger;

@arch_module(at_tier: Tier.Interp)
module my_app.repl_helpers;

// In ledger.vr:
mount my_app.repl_helpers;
fn process(tx: Tx) -> ... {
    repl_helpers.dump(tx)               // <-- AP-004
}
```

**Remediation.** Either remove the cross-tier call, or introduce
a `@bridge(...)` attribute on the receiving function:

```verum
@bridge(from: Tier.Aot, to: Tier.Interp)
public fn dump(tx: Tx) -> ()
```

A bridge lifts the architectural ban but introduces a runtime
boundary the bridge author is responsible for documenting.

---

## AP-005 — FoundationDrift {#ap-005}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.1

**Predicate.** Two cogs that `composes_with` each other declare
`Shape.foundation` values from incompatible meta-theoretic
profiles, and no `@bridge_foundation(...)` mediator is present.

**What it catches.** A ZFC-grounded production cog imports a
HoTT-grounded research cog without an explicit functor-bridge
proving the foundations are reconciled.

**Worked example — defect.**

```verum
@arch_module(foundation: Foundation.ZfcTwoInacc)
module my_app.production;

@arch_module(foundation: Foundation.Hott)
module my_app.research;

// In production.vr:
mount my_app.research;       // <-- AP-005 unless @bridge_foundation
```

**Compatibility table.** Verum currently recognises the
following foundation pairs as compatible without a bridge:

- `ZfcTwoInacc ⟷ Cic` (CIC's universe hierarchy is interpretable in ZFC + 2-inacc)
- `ZfcTwoInacc ⟷ Mltt`
- `Hott ⟷ Cubical` (HoTT's identity types reduce to Cubical's path types)

All other pairs require an explicit bridge.

**Remediation.**

```verum
@bridge_foundation(from: Foundation.Hott, to: Foundation.ZfcTwoInacc,
                   citation: "Voevodsky 2014 · simplicial set model")
public fn lift_research_to_production(...) -> ...
```

The bridge function is a load-bearing axiom for the project's
proof corpus and is enumerated by `verum audit --framework-axioms`.

---

## AP-006 — RegisterMixing {#ap-006}

**Severity:** error · **Phase:** post-arch · **Stable since:** v0.1

**Predicate.** A single proof body uses two distinct MSFS
*registers* (proof modes — α-direct, ε-indirect, classical,
constructive) without an explicit register-bridge tactic.

**What it catches.** A `@verify(formal)` proof that mixes
α-direct (forward) reasoning with ε-indirect (backward) reasoning
in a way that breaks the bidirectional coherence the verifier
relies on.

For the operational meaning of registers see
[verification → articulation hygiene](../../verification/articulation-hygiene.md);
the register discipline is part of the [actic-dual](../../verification/actic-dual.md)
α/ε bidirectional system.

**Remediation.** Use the register-bridge tactic explicitly,
typically named `bridge_α_to_ε` or `bridge_ε_to_α`. The bridge
makes the otherwise-implicit register transition load-bearing in
the proof body.

---

## AP-007 — StratumAdmissibility {#ap-007}

**Severity:** error · **Phase:** arch-check · **Stable since:** v0.1

**Predicate.** A cog whose `Shape.stratum` is *not* `MsfsStratum.LAbs`
mentions `LAbs`-stratum content (typically reflective absolute
quantification) without an admissibility certificate.

**What it catches.** A `LFnd`-stratum cog accidentally references
`LAbs`-stratum content, which is *inadmissible* under the AFN-T
α condition (MSFS Theorem 5.1).

**Why this matters.** `LAbs` content lives in the absolute
universe; mentioning it from a foundational stratum without an
admissibility check breaks the MSFS stratification that keeps
the proof corpus consistent.

**Remediation.** Either move the content into an `LAbs`-stratum
cog, or add an `@admissibility_certificate(...)` attribute that
documents the proof of admissibility (typically a
forcing-extension argument).

---

## AP-008 — CompositionAssociativityBreak {#ap-008}

**Severity:** error · **Phase:** post-arch · **Stable since:** v0.1

**Predicate.** A macro-expanded `composes_with` declaration
produces a non-associative composition graph — i.e., expanding
`(A ∘ B) ∘ C` differently from `A ∘ (B ∘ C)`.

**What it catches.** A `@derive` macro that injects synthetic
dependencies in a way that depends on parenthesisation.
Architectural composition must be associative; a macro that
breaks associativity is producing an unsound graph.

**Remediation.** This is a *macro-author* error rather than an
end-user error. Macros are responsible for emitting associative
compositions. The diagnostic identifies the macro and the
synthetic edges.

---

## AP-009 — LifecycleRegression {#ap-009}

**Severity:** error · **Phase:** post-arch · **Stable since:** v0.1

**Predicate.** A cog with Lifecycle of rank R cites (via
`composes_with`, `mount`, or direct call) a cog with Lifecycle
of rank strictly less than R.

**What it catches.** A `Lifecycle.Theorem` cog citing a
`Lifecycle.Hypothesis` cog. The citing cog claims to be load-
bearing-mature, but its dependency chain reveals it is in fact
only as strong as a Hypothesis.

**Worked example — defect.**

```verum
@arch_module(lifecycle: Lifecycle.Theorem("v1.0"))
module my_app.production;

@arch_module(lifecycle: Lifecycle.Hypothesis(ConfidenceLevel.Medium))
module my_app.experimental;

// In production.vr:
mount my_app.experimental;          // <-- AP-009: rank 6 → rank 2
```

**Diagnostic.**

```text
error[ATS-V-AP-009]: lifecycle regression
  --> src/production.vr:3:7
   |
 3 | mount my_app.experimental;
   |       ^^^^^^^^^^^^^^^^^^^ cog `my_app.production` (Theorem, rank 6)
   |                          cites cog `my_app.experimental`
   |                          (Hypothesis, rank 2). A Theorem cog
   |                          MUST cite cogs of rank ≥ 6.
   |
help: either
   1. mature `my_app.experimental` to Theorem / Definition / Conditional, or
   2. demote `my_app.production` to a lower lifecycle rank, or
   3. introduce a Lifecycle.Conditional intermediate that lists
      "experimental_module is hypothetical" as a stated condition.
```

**Remediation.** See the help text. The most common remediation
is option (3) — wrap the regression in an explicit
`Conditional` cog that names the hypothesis as a stated
condition. The audit chronicle then records the hypothesis as a
load-bearing assumption.

**Companion check.** A *transitive* form of this pattern,
[`AP-026 TransitiveLifecycleRegression`](./coherence.md#ap-026),
fires when the chain spans more than one hop — e.g., `A → B → C`
where each direct edge is OK but the end-to-end chain exposes a
low-rank intermediate.

---

## Pattern interactions

The classical band patterns are largely independent — fixing
one does not introduce another. There are two notable
interactions:

- **AP-001 + AP-019 (CapabilityLaundering).** AP-001 catches
  *direct* capability use without declaration; AP-019 (in the
  coherence band) catches *indirect* laundering — capability
  erased by transit through an unmarked boundary.
- **AP-009 + AP-026 (TransitiveLifecycleRegression).** AP-009 is
  the direct edge check; AP-026 walks the closure.

Each pair has a more-precise variant in a higher band. The
classical band catches the obvious cases at compile time;
the coherence band catches the subtle cases at audit time.

## Cross-references

- [Anti-pattern overview](./overview.md) — the four bands.
- [Articulation anti-patterns](./articulation.md) — AP-010..018.
- [Coherence anti-patterns](./coherence.md) — AP-019..026.
- [Modal-temporal anti-patterns](./mtac.md) — AP-027..032.
- [Capability primitive](../primitives/capability.md) — what
  AP-001 enforces.
- [Lifecycle primitive](../primitives/lifecycle.md) — what AP-009
  enforces.
- [Three orthogonal axes](../orthogonality.md) — why AP-001
  catches a different defect class than the property type
  checker.
