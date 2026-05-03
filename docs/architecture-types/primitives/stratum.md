---
sidebar_position: 8
title: "Stratum — MSFS moduli stratum"
description: "The MsfsStratum primitive: position in the Modular-Stratified-Foundation moduli space (LFnd / LCls / LClsTop / LAbs). LAbs is inadmissible by AFN-T α."
slug: /architecture-types/primitives/stratum
---

# Stratum — MSFS moduli stratum

A **stratum** in ATS-V is a cog's position in the
**Modular-Stratified-Foundation (MSFS) moduli space**. The MSFS
discipline organises foundational mathematical content into four
strata, each with its own admissibility rules. The stratum
primitive answers *"which level of the MSFS hierarchy does this
cog inhabit?"*

```verum
public type MsfsStratum is
    | LFnd
    | LCls
    | LClsTop
    | LAbs;
```

Four strata, in order of increasing strength:

| Stratum | Reading | Admissibility |
|---------|---------|---------------|
| **LFnd** | Foundational level — base content | always admissible |
| **LCls** | Classical level — classical reasoning | admissible under classical foundations |
| **LClsTop** | Classical-top level — classical with top-level reflection | admissible under reflection-tower discharge |
| **LAbs** | Absolute level — absolute / reflective quantification | **inadmissible** by AFN-T α (MSFS Theorem 5.1) |

## 1. Why a stratification?

The MSFS discipline addresses a well-known issue in foundational
mathematics: as you climb in proof-theoretic strength, you
acquire stronger reasoning principles but also acquire greater
risk of inconsistency. Sound stratification keeps strong content
*addressable* (you can reason about it, transport results across
strata) while preventing strong content from *contaminating*
weaker strata.

Verum's `MsfsStratum` makes the stratification first-class. A
cog's stratum is declared, checked, and load-bearing in
[`AP-007 StratumAdmissibility`](../anti-patterns/classical.md#ap-007).

## 2. The four strata in detail

### 2.1 `LFnd` — foundational

The base level. Content here:

- Uses only constructive reasoning.
- Avoids classical principles (LEM, AC).
- Is admissible under every Foundation profile.

This is the default stratum for application code. Most cogs
without explicit stratum declaration default to `LFnd`.

### 2.2 `LCls` — classical

The classical level. Content here:

- May use classical principles (LEM, AC).
- Is admissible under foundations that admit those principles
  (`ZfcTwoInacc`, `Cic`).
- Is *not* admissible under purely-constructive foundations
  (`Hott`, `Cubical`).

A cog at `LCls` interacting with a `Hott`-foundation cog
requires an explicit reasoning bridge.

### 2.3 `LClsTop` — classical with top-level reflection

The classical-top level adds top-level reflection — the ability
to reason about the meta-theory's own truth predicate at the
top level. Content here:

- Uses classical principles plus reflection.
- Is admissible under foundations whose meta-theory satisfies
  REF^k for the required k (see [reflection tower](../../verification/reflection-tower.md)).

`LClsTop` is the strongest stratum admissible without
risking absolute-quantification anomalies.

### 2.4 `LAbs` — absolute

The absolute level. Content here:

- Uses absolute / reflective quantification.
- Is **inadmissible** by AFN-T α (MSFS Theorem 5.1).
- Declaring a cog at `LAbs` triggers a stratum-admissibility
  check; the check requires explicit forcing-extension
  certification.

In practice, no production code lives at `LAbs`. The variant
exists in the type system to *prevent* accidental escalation —
a cog that needs to mention `LAbs` content must do so via an
explicit admissibility certificate, not by silent inheritance.

## 3. The stratum-admissibility check

`AP-007 StratumAdmissibility` fires when a non-`LAbs` cog
mentions `LAbs`-stratum content without an admissibility
certificate:

```verum
@arch_module(stratum: MsfsStratum.LFnd)
module my_app.production;

mount core.meta.absolute_reflective;     // <-- LAbs-stratum content

// AP-007 fires: LFnd cog mentions LAbs content.
```

The diagnostic suggests one of:

1. Move the content into an `LAbs` cog with an explicit
   `@admissibility_certificate(...)` attribute documenting the
   forcing-extension argument.
2. Remove the content (production code typically does not need
   absolute reflection).
3. Replace with `LClsTop` content under explicit reflection
   discharge.

## 4. The `@admissibility_certificate(...)` attribute

When `LAbs` content is genuinely needed — typically for advanced
proof corpora — the admissibility certificate makes the
admission explicit:

```verum
@arch_module(
    stratum: MsfsStratum.LAbs,
    @admissibility_certificate(
        method:    "forcing extension",
        citation:  "Shoenfield 1971 — absoluteness of forcing",
        condition: "ground model is L (the constructible hierarchy)",
    ),
)
module my_app.advanced.absolute_proof;
```

The certificate:

- Lifts the AFN-T α inadmissibility ban for this specific cog.
- Adds the citation to the framework-axiom inventory.
- Becomes load-bearing in the project's audit chronicle — the
  project's soundness rests on the cited absoluteness theorem.

## 5. The MSFS-coordinate audit

`verum audit --bundle` walks every annotated cog and verifies
the *coordinate* — the (Foundation, Stratum) pair. The
coordinate must be admissible under the cog's claimed
Lifecycle:

| Foundation | Stratum | Admissible Lifecycle |
|------------|---------|---------------------|
| ZfcTwoInacc | LFnd | every |
| ZfcTwoInacc | LCls | Definition / Conditional / Theorem (with cited LEM/AC) |
| ZfcTwoInacc | LClsTop | Postulate / Conditional |
| ZfcTwoInacc | LAbs | Postulate (with admissibility certificate) |
| Hott | LFnd | every |
| Hott | LCls | Conditional (LEM admitted as classical add-on) |
| Hott | LClsTop | Postulate |
| Hott | LAbs | Postulate (with admissibility certificate) |

Coordinates outside this table trigger
[`AP-011 AbsoluteBoundaryAttempt`](../anti-patterns/articulation.md#ap-011)
when the cog claims `LAbs` membership, or
[`AP-026 FoundationContentMismatch`](../anti-patterns/articulation.md#ap-026)
when the body uses constructs from a different foundation than
the declared one.

## 6. Stratum and the register-mixing pattern

A subtle interaction: the `AP-006 RegisterMixing` anti-pattern
checks that a single proof body does not mix two MSFS *registers*
(α-direct, ε-indirect, classical, constructive) without an
explicit register-bridge tactic. Registers are *finer* than
strata — a single stratum supports multiple registers.

The relationship:

| Stratum | Admissible registers |
|---------|---------------------|
| LFnd | α-constructive, ε-constructive |
| LCls | α-classical, ε-classical, plus the LFnd registers |
| LClsTop | every register |
| LAbs | every register, plus the absolute register |

A cog whose stratum admits multiple registers is permitted to
use them, but mixing within a single proof body still requires
the register-bridge tactic.

## 7. Default stratum behaviour

Cogs without an explicit stratum declaration default to `LFnd`.
This is the *most-restrictive* default — the cog cannot mention
classical content without first either:

1. Declaring a higher stratum via `@arch_module(stratum: ...)`, or
2. Importing classical content via a bridge.

The default makes `LFnd` cogs safe by construction.

## 8. Worked example — multi-stratum project

```verum
// LFnd-stratum: production code, fully constructive
@arch_module(
    foundation: Foundation.ZfcTwoInacc,
    stratum:    MsfsStratum.LFnd,
    lifecycle:  Lifecycle.Theorem("v1.0"),
)
module my_app.production.payment;

// LCls-stratum: classical content used in well-known classical theorems
@arch_module(
    foundation: Foundation.ZfcTwoInacc,
    stratum:    MsfsStratum.LCls,
    lifecycle:  Lifecycle.Conditional(["LEM admitted at this stratum"]),
)
module my_app.classical.continuum_proof;

// LClsTop-stratum: classical with top-level reflection
@arch_module(
    foundation: Foundation.ZfcTwoInacc,
    stratum:    MsfsStratum.LClsTop,
    lifecycle:  Lifecycle.Postulate("Pohlers 2009 · iterated reflection"),
)
module my_app.advanced.reflection_proofs;
```

The audit chronicle enumerates the stratum distribution:

```
$ verum audit --arch-corpus --filter=stratum

stratum LFnd     : 256 cogs   (97%)
stratum LCls     : 8   cogs   (3%)
stratum LClsTop  : 1   cog    (<1%)
stratum LAbs     : 0   cogs   (with certificate)
```

The bulk of cogs at `LFnd` is the healthy state. Climbing the
stratum hierarchy is acceptable but should be deliberate.

## 9. Cross-references

- [Foundation primitive](./foundation.md) — the meta-theoretic
  profile that interacts with Stratum.
- [Lifecycle primitive](./lifecycle.md) — the CVE 7-symbol
  taxonomy bounded by stratum strength.
- [Anti-pattern AP-006 RegisterMixing](../anti-patterns/classical.md#ap-006).
- [Anti-pattern AP-007 StratumAdmissibility](../anti-patterns/classical.md#ap-007).
- [Anti-pattern AP-011 AbsoluteBoundaryAttempt](../anti-patterns/articulation.md#ap-011) — the canonical stratum-admissibility check.
- [Anti-pattern AP-026 FoundationContentMismatch](../anti-patterns/articulation.md#ap-026) — body-vs-declared foundation alignment.
- [Verification → MSFS coord](../../verification/msfs-coord.md)
  — the operational MSFS-coordinate machinery.
- [Verification → reflection tower](../../verification/reflection-tower.md)
  — the discharge ladder.
