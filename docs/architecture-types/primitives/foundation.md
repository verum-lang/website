---
sidebar_position: 6
title: "Foundation — meta-theoretic profile"
description: "The Foundation primitive: ZFC-2-inacc, HoTT, Cubical, CIC, MLTT, EFF, custom — every cog declares the foundational profile its proof corpus rests on."
slug: /architecture-types/primitives/foundation
---

# Foundation — meta-theoretic profile

A **foundation** in ATS-V is the meta-theoretic profile a cog's
proof corpus rests on. Verum's verification machinery admits
multiple foundations, and not every pair is automatically
compatible — composing two cogs whose foundations contradict
without an explicit functor-bridge triggers
[`AP-005 FoundationDrift`](../anti-patterns/classical.md#ap-005).

The Foundation primitive answers *"under which mathematical
universe does this cog's proof corpus live?"* and is enumerable
via `verum audit --framework-axioms`.

## 1. The Foundation variant

```verum
public type Foundation is
    | ZfcTwoInacc
    | Hott
    | Cubical
    | Cic
    | Mltt
    | Eff
    | CustomFoundation(Text, Text);   // (name, citation)
```

Six canonical profiles plus a custom escape hatch.

| Foundation | Reading | Typical use |
|------------|---------|-------------|
| **ZfcTwoInacc** | Zermelo-Fraenkel set theory + 2 strongly inaccessible cardinals | The default. Verum's kernel rules are sound under this profile. |
| **Hott** | Homotopy Type Theory (Univalent Foundations) | Higher inductive types, equivalences-as-equality. |
| **Cubical** | Cubical Type Theory | Computational interpretation of HoTT's path types. |
| **Cic** | Calculus of Inductive Constructions | Coq's foundation. |
| **Mltt** | Martin-Löf Type Theory | The intuitionistic core of dependent type theory. |
| **Eff** | Effectful type theory | Algebraic-effects-flavoured foundation. |
| **CustomFoundation(name, citation)** | Project-specific | When the canonical six don't capture the requirement. |

## 2. The default — `ZfcTwoInacc`

When `@arch_module(...)` does not specify a foundation, the
compiler defaults to `Foundation.ZfcTwoInacc`. This is the
foundation under which:

- Verum's kernel rules are proved sound.
- The trusted-base kernel's universe hierarchy is interpretable.
- The reflection tower's REF^2 level discharges.

A project that declares no foundation is therefore living in
ZFC + 2-inacc. Most production code stays here.

## 3. Foundation compatibility table

Verum recognises a small set of foundation pairs as compatible
without an explicit bridge:

| From | To | Citation |
|------|-----|----------|
| `Cic` | `ZfcTwoInacc` | Standard set-theoretic interpretation |
| `Mltt` | `ZfcTwoInacc` | Aczel 1978 |
| `Hott` | `Cubical` | Cohen, Coquand, Huber, Mörtberg 2018 |
| `Cubical` | `Hott` | (same — bidirectional) |

All other pairs require an explicit `@bridge_foundation(...)`
attribute citing the relevant interpretation theorem.

## 4. The `@bridge_foundation(...)` attribute

When two cogs at incompatible foundations need to compose, the
bridging cog declares the bridge explicitly:

```verum
@bridge_foundation(
    from:     Foundation.Hott,
    to:       Foundation.ZfcTwoInacc,
    citation: "Voevodsky 2014 — simplicial set model of UF",
)
public fn lift_research_to_production(...) -> ...
```

The bridge:

- Lifts the architectural ban (`AP-005 FoundationDrift` no
  longer fires for compositions through this bridge).
- Adds the citation to the project's framework-axiom inventory
  (`verum audit --framework-axioms` reports it).
- Becomes load-bearing — the project's soundness now rests on
  the cited interpretation theorem.

## 5. Why foundations matter — soundness consequences

A naïve question: *"why not just admit all foundations
universally?"* Two reasons:

### 5.1 Different foundations have different theorems

Voevodsky's univalence axiom is a theorem of HoTT but is *not*
admissible in plain MLTT. A cog whose proof relies on
univalence cannot be soundly composed with a cog that rejects
univalence — unless there is a bridge that makes the cited
result provable in the receiving foundation.

The Foundation primitive prevents the silent composition that
would otherwise allow a HoTT-only theorem to flow into an
MLTT-grounded proof corpus.

### 5.2 Different foundations have different *universe* hierarchies

ZFC + 2-inacc provides a sequence of universes `U_0 ⊆ U_1 ⊆ U_2`
modelled by the inaccessible cardinals. CIC has its own
universe hierarchy that is *not* directly interpretable in plain
ZFC. Mixing universe types across foundations without a bridge
produces silently-wrong universe-level checks.

The Foundation primitive's compile-time check guards against
this drift.

## 6. The `verum audit --framework-axioms` integration

Every cog's Foundation declaration is enumerated by the
framework-axiom audit. The output groups by foundation:

```text
$ verum audit --framework-axioms

Framework axiom inventory · 2026-05-02

foundation: ZfcTwoInacc                     (default — implicit)
  cogs: 256
  axioms cited: 17
    - K-Universe-Ascent           (verum_internal_meta)
    - K-Norm                      (verum_internal_meta)
    - separation_logic_alignment  (verum_internal)
    ...

foundation: Hott                            (declared in 8 cogs)
  cogs: 8
  axioms cited: 3
    - voevodsky_univalence_axiom  (HoTT-Book 2.10.3)
    - hott_function_extensionality (HoTT-Book 2.9.3)
    ...

bridge_foundation: Hott → ZfcTwoInacc       (declared in 1 cog)
  citation: "Voevodsky 2014 — simplicial set model of UF"
  cogs using bridge: 8
```

The inventory makes the project's *complete* trust boundary
machine-readable: every foundation declared, every bridge
cited, every foundation-specific axiom enumerated.

## 7. Custom foundations

Projects with foundation requirements outside the canonical six
use `CustomFoundation(name, citation)`:

```verum
@arch_module(
    foundation: Foundation.CustomFoundation(
        "lambda_pi_modulo",
        "Cousineau-Dowek 2007 — λΠ-calculus modulo",
    ),
)
module my_app.lambda_pi_dispatch;
```

Custom foundations:

- Carry a *citation* mandatorily — without a published source,
  the foundation is not admissible.
- Are *opaque* to the compatibility table — every composition
  with a non-custom foundation requires an explicit bridge.
- Are enumerated separately in `--framework-axioms`.

## 8. Foundation and CVE Lifecycle interaction

A subtle interaction: the strongest CVE Lifecycle a cog may
declare is bounded by its Foundation. Specifically:

- A `[Т]` Theorem cog under a canonical foundation is fully
  load-bearing.
- A `[Т]` Theorem cog under a `CustomFoundation` requires the
  citation to admit the theorem; otherwise the strongest
  admissible status is `[П]` Postulate.

This bound is enforced by `verum audit --bundle`'s L4 check:
a cog whose Lifecycle exceeds the strength its Foundation
admits is flagged as
[`AP-020 FoundationForgery`](../anti-patterns/coherence.md#ap-020).

## 9. Worked example — multi-foundation project

A research-heavy project mixes ZFC-grounded production with
HoTT-grounded research:

```verum
// Production cog — ZFC-grounded
@arch_module(
    lifecycle:  Lifecycle.Theorem("v3.2"),
    foundation: Foundation.ZfcTwoInacc,
)
module my_app.production.payment;

// Research cog — HoTT-grounded
@arch_module(
    lifecycle:  Lifecycle.Conditional(["univalence axiom admitted"]),
    foundation: Foundation.Hott,
)
module my_app.research.eq_proofs;

// Bridge cog — explicit interpretation
@arch_module(lifecycle: Lifecycle.Postulate(
    "Voevodsky 2014 · simplicial set model"
))
@bridge_foundation(from: Foundation.Hott, to: Foundation.ZfcTwoInacc,
                   citation: "Voevodsky 2014")
module my_app.bridges.hott_to_zfc;
```

The audit chronicle then enumerates:

- 256 cogs under `ZfcTwoInacc`.
- 8 cogs under `Hott`.
- 1 explicit bridge between the two.
- The cited interpretation theorem (Voevodsky 2014) as a
  framework axiom.

The composition is well-typed at the architectural layer; the
bridge is the load-bearing assumption.

## 10. Cross-references

- [Lifecycle primitive](./lifecycle.md) — the CVE 7-symbol
  taxonomy that interacts with Foundation.
- [Shape](./shape.md) — the aggregate carrier.
- [Anti-pattern AP-005 FoundationDrift](../anti-patterns/classical.md#ap-005).
- [Anti-pattern AP-020 FoundationForgery](../anti-patterns/coherence.md#ap-020).
- [Verification → framework axioms](../../verification/framework-axioms.md)
  — the full inventory machinery.
- [Verification → reflection tower](../../verification/reflection-tower.md)
  — the meta-theoretic hierarchy Foundation participates in.
