---
sidebar_position: 5
title: "Modal-temporal anti-patterns (AP-027 .. AP-032)"
description: "The MTAC band: temporal inconsistency, counterfactual brittleness, missed adjoint, universal-property violation, phantom evolution, Yoneda-inequivalent refactor."
slug: /architecture-types/anti-patterns/mtac
---

# Modal-temporal anti-patterns (AP-027 .. AP-032)

Band 3 covers architectural defects in the **modal-temporal
architectural calculus** (per spec §20–§23). Patterns in this
band require additional inputs beyond the cog `Shape` —
specifically the [`DiagnosticContext`](../../reference/glossary)
fields `temporal_samples`, `counterfactual_pairs`,
`refactorings_without_adjoint`, `claimed_universal_property` /
`uniqueness_witness`, `declared_evolutions`, and
`yoneda_observer_diff`.

These patterns therefore fire at the **bundle** phase, when the
audit gate has access to the full project plus the
modal-temporal samples the developer / audit harness supplied.

This page paraphrases each entry's predicate from
the canonical anti-pattern catalog and its per-pattern predicates. For the
catalog's overall structure see
[Anti-pattern overview](./overview.md). For the MTAC primitives
themselves see [the MTAC architecture page](../mtac.md).

---

## AP-027 — TemporalInconsistency {#ap-027}

**Severity:** error · **Phase:** bundle · **Stable since:** v0.2

**Predicate.** `forall (t1, shape1), (t2, shape2) ∈
DiagnosticContext.temporal_samples.
shape1.foundation == shape2.foundation`. Across every pair of
sampled time-points, the cog's foundation must remain stable.

**Why it matters.** An MTAC `Always(Φ)` invariant requires `Φ`
to hold at every future time-point. Foundation stability is the
canonical instance of this for architecture: a cog that's HoTT
at t₀ and Cubical at t₁ has effectively two distinct
architectures, and any theorem cited across the temporal
boundary loses its meta-theoretic strength.

**Diagnostic.**
```text
ATS-V-AP-027 [error] in cog `my_app.alpha`:
  Foundation drifts across time samples (detected at Future(1735689600))
  An MTAC `Always(Φ)` invariant requires the foundation to be stable across
  all time points. This cog's temporal samples show foundation drift
  between time points.
```

**Remediation.** Either align the foundation across the
trajectory (pick one foundation and stay), or add an explicit
`@arch_corpus(foundation_bridge, ...)` that proves the
foundation-change is meaning-preserving.

---

## AP-028 — CounterfactualBrittleness {#ap-028}

**Severity:** error · **Phase:** bundle · **Stable since:** v0.2

**Predicate.** `forall pair ∈
DiagnosticContext.counterfactual_pairs.
forall inv ∈ pair.stability_invariants. holds(inv, pair.base) ∧
holds(inv, pair.alternative)`. Every counterfactual pair's
stability invariants must hold under both the base and the
alternative decision.

**Why it matters.** Counterfactual brittleness is the
architectural analogue of "this only works because we chose X" —
the system passes its tests because of an arbitrary decision,
and an alternative decision (a different framework choice, a
different topology) would silently break invariants the audit
believed were structural.

**Remediation.** Either generalise the cog so the invariants
hold under both decisions (the architectural fix), or remove
the invariant from the counterfactual pair's contract (the
declaration fix — admit the brittleness honestly).

---

## AP-029 — MissedAdjoint {#ap-029}

**Severity:** error · **Phase:** bundle · **Stable since:** v0.2

**Predicate.** `forall refactor ∈
DiagnosticContext.refactorings_without_adjoint.
exists adjoint(refactor)`. Every claimed refactoring must have
its inverse adjoint pair declared (per `AdjunctionWitness` in
[`arch_mtac`](../mtac.md)).

**Why it matters.** Refactorings are functors `F: Old → New`.
A refactoring without its right-adjoint `G: New → Old` cannot
be undone — the architecture loses optionality. Every
canonical refactoring (Inline ⊣ Extract, Specialise ⊣
Generalise, Decompose ⊣ Compose, Strengthen ⊣ Weaken) is an
adjoint pair; declaring only one half is an oversight.

**Remediation.** Add the inverse functor to the refactoring
declaration. The [`AdjunctionWitness`](../adjunctions) carries
the `forward_name`, `backward_name`, plus the `preserved` /
`gained` property lists.

---

## AP-030 — UniversalPropertyViolation {#ap-030}

**Severity:** hint · **Phase:** bundle · **Stable since:** v0.2

**Predicate.** `DiagnosticContext.claimed_universal_property.is_some() ⇒
DiagnosticContext.uniqueness_witness.is_some()`. Every claimed
universal-property uniqueness must carry a witness.

**Why it matters.** Universal-property claims ("this is THE
unique cog satisfying X") are stronger than existential
claims; without a uniqueness witness, the claim is a category
error.

**Remediation.** Either supply the uniqueness witness (a proof
term or a structural argument), or weaken the claim to
existential.

---

## AP-031 — PhantomEvolution {#ap-031}

**Severity:** error · **Phase:** bundle · **Stable since:** v0.2

**Predicate.** `forall e : ArchEvolution ∈
DiagnosticContext.declared_evolutions.
satisfiable(e.trigger)`. Every declared evolution path must
have a satisfiable trigger.

**Why it matters.** A phantom evolution is an evolution path
the architecture *promises* but cannot trigger. The audit
chronicle would see the evolution as load-bearing for the
project's roadmap; in fact the system never reaches the
trigger, so the evolution is dead code.

**Remediation.** Either remove the phantom evolution from the
declaration, or modify the trigger so it is satisfiable in some
realistic state.

---

## AP-032 — YonedaInequivalentRefactor {#ap-032}

**Severity:** hint · **Phase:** bundle · **Stable since:** v0.2

**Predicate.** `forall refactor.
yoneda_equivalent(refactor.before, refactor.after) ∨
declared_observer_change(refactor)`. A refactoring claimed
"Yoneda-equivalent" must actually preserve every observer
projection (per
[`yoneda_equivalent`](../../verification/proofs)) — or, if the
observer-functor genuinely changes, the refactoring must
declare that change explicitly.

**Why it matters.** Yoneda-inequivalence is the strongest form
of observable architectural change: the cog *appears different*
to at least one downstream consumer. A refactoring claimed
"safe" but Yoneda-inequivalent is a hidden breaking change.

**Remediation.** Either restore Yoneda-equivalence (typically
by preserving all five canonical observers — `EndUser`,
`PeerCog`, `Stakeholder`, `Auditor`, `Adversary`), or annotate
the refactoring as observer-changing and notify downstream
consumers.

---

## See also

- [Anti-pattern catalog overview](./overview.md) — the indexing
  page with the full 32-entry table.
- [Capability / composition core (AP-001..AP-010)](./classical.md)
- [Boundary / lifecycle / capability ontology (AP-011..AP-026)](./articulation.md)
- [MTAC architecture page](../mtac.md) — the modal-temporal
  primitives this band extends.
- [Adjunctions](../adjunctions.md) — the formal backing for
  AP-029 `MissedAdjoint`.
- [Counterfactual reasoning](../counterfactual.md) — the formal
  backing for AP-028 `CounterfactualBrittleness`.
