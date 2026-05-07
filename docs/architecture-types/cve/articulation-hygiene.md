---
sidebar_position: 6
title: "CVE — articulation hygiene (L6)"
description: "The discipline that protects the CVE framework from anti-philosophical traps: register prohibitions, self-application audit, and the L6 layer where the framework is checked against itself."
slug: /architecture-types/cve/articulation-hygiene
---

# CVE — articulation hygiene (L6)

The CVE framework is recursively self-applicable: it asks the
same three questions of *itself* that it asks of every other
artefact. The recursive application is what gives the framework
its load-bearing status — a frame that cannot articulate itself
in its own vocabulary is, by construction, weaker than the
artefacts it claims to classify.

**Articulation hygiene** is the discipline that protects the
self-application from a small but well-known class of philosophical
traps. The hygiene is enforced at CVE layer **L6** — the layer
where the framework is checked against itself.

This page documents the register prohibitions, the
self-application audit, and how Verum surfaces violations.

## 1. Why an articulation discipline?

The CVE frame is a meta-discipline. It applies to:

- ordinary code (L0),
- proof terms (L1),
- proof methods (L2),
- meta-theories (L3),
- architectural shapes (L4),
- audit reports (L5),
- the frame itself (L6).

At L6 the frame is being applied *to* the frame. This recursion
admits well-known anti-patterns drawn from philosophy of language:

- **Self-reference without operator.** Asserting "this sentence
  is constructive" without specifying *what register* the
  assertion lives in.
- **Register collision.** Mixing object-level and meta-level
  vocabulary in a single assertion.
- **Ungrounded universality.** Asserting "every claim is C-typed"
  without specifying the layer the universality applies to.

These traps are subtle. They don't surface as obvious errors
during development; they surface as *logical inconsistency in the
audit chronicle*. Articulation hygiene catches them before they
do.

## 2. The register-prohibition discipline

Verum's articulation hygiene enforces three register prohibitions
at L6:

### 2.1 Prohibition 1 — no self-reference without operator

Every CVE statement in the audit chronicle MUST specify the layer
it applies to. A statement of the form "this artefact is C-V-E"
is admissible only when the layer is explicit:

- ✓ "At CVE-L0, `add(2, 3) = 5` is C-V-E."
- ✓ "At CVE-L4, the Shape of `payment.checkout` is C-V-E."
- ✗ "X is C-V-E." (which layer? object? proof? frame?)

Statements without layer attribution are flagged as candidates
for the
[register-prohibition check](../anti-patterns/mtac.md#ap-029).

### 2.2 Prohibition 2 — no mixing object-level and meta-level

Within a single assertion, all terms must inhabit the same layer.
A sentence that combines L0 vocabulary with L4 vocabulary is a
register collision:

- ✓ "The function `f` (L0) has refinement type `Int { self > 0 }`."
- ✓ "The cog `payment.checkout` (L4) has Lifecycle `Theorem`."
- ✗ "The function `f` has Lifecycle `Theorem`." — `f` is L0;
  `Lifecycle` is L4. The statement is a register collision.

### 2.3 Prohibition 3 — no ungrounded universality

Universal quantifications (∀, "every", "always") must specify
the layer they range over:

- ✓ "Every annotated cog (L4) carries a Lifecycle."
- ✓ "Every kernel rule (L1/L2) is admissible at the MSFS reflection-tower's BoundedByOneInaccessible stage (L3)."
- ✗ "Every claim is C-typed." (over what layer? L0 alone? all
  layers?)

Ungrounded universality is the most subtle of the three: the
ungrounded statement *might* be true at every layer, but the
audit cannot mechanically verify it because the quantification
range is undefined.

## 3. The L6 audit gate

Articulation hygiene is not a separate audit subcommand; it is
verified by `verum audit --bundle`'s L6 self-application step.
The step walks every emitted diagnostic, every audit report
field, every framework citation, and applies the three register
prohibitions.

A bundle that triggers any prohibition reports:

```text
warning[ATS-V-L6-REGISTER-001]: register prohibition triggered
  --> target/audit-reports/bundle.json (field: gates[3].verdict)
   |
   | "verdict": "every artifact is C-V-E"
   |            ^^^^^^^^^^^^^^^^^^^^^^^^^ ungrounded universality
   |                                     (no layer specified)
help: specify the layer the universality ranges over.
      Replace with one of:
        "every L0 artifact is C-V-E"
        "every L4 cog is C-V-E"
        ...
```

The L6 gate is the *self-check* of the audit framework. A
project's L4 verdict can be load-bearing without the L6 check
passing — but the audit pipeline reports the discrepancy
explicitly so reviewers can spot when the audit's own
articulation drifts from the discipline.

## 4. Self-application — does the frame survive?

The decisive test of articulation hygiene is whether the CVE
frame, when applied to itself, *satisfies* the three register
prohibitions. The answer is **yes** — by design.

The framework's self-application:

- *"Is the CVE framework constructive?"* — Yes, at CVE-L6. The
  framework is realised as Verum types and audit dispatchers.
- *"Is the CVE framework verifiable?"* — Yes, at CVE-L6. The
  manifest of CVE-glyph-to-rule is enumerable and audited.
- *"Is the CVE framework executable?"* — Yes, at CVE-L6. Every
  audit gate is a runnable subcommand.

Each answer specifies its layer (CVE-L6). Each answer's
vocabulary stays within L6. The universality is grounded in the
specific layer.

The framework therefore *survives* its own articulation hygiene.
This is the property that makes CVE suitable as a foundation
rather than a convention.

## 5. Why the prohibitions are necessary

A natural skepticism: *"if the framework survives by careful
application, why surface the prohibitions explicitly?"*

The answer: the prohibitions don't protect the framework's
*designed* use; they protect the framework's *unintended* use. A
codebase that adopts CVE may produce audit reports whose prose
violates the hygiene discipline. Without the L6 check, the
violations would propagate silently into the audit chronicle.

The prohibitions are therefore *quality gates on the audit
chronicle* — analogous to how the type checker is a quality gate
on the source code. Both prevent silently-wrong artefacts from
reaching production.

## 6. Common L6 register-prohibition triggers

Three patterns most commonly trigger the L6 check:

**Trigger 1.** A diagnostic message that uses object-level
vocabulary to describe an architectural concept:

- ✗ "This *function* has Lifecycle Theorem."
- ✓ "This *cog* has Lifecycle Theorem."

**Trigger 2.** An audit summary that aggregates across layers
without specifying the layer:

- ✗ "Total constructive artefacts: 1024."
- ✓ "Total CVE-L0 constructive artefacts: 1024.
     Total CVE-L4 constructive artefacts: 267."

**Trigger 3.** A framework citation that lifts a result without
documenting the layer transit:

- ✗ "Cited under `@framework(joux_2009, "Theorem 4.2")`."
- ✓ "Cited under `@framework(joux_2009, "Theorem 4.2 — generic group lower bound")`."
     (the citation specifies *what kind* of theorem at *what layer*)

The fixes for each trigger are mechanical; the L6 gate's
diagnostic includes the canonical fix.

## 7. The L6 ↔ CVE-AH connection

Articulation hygiene at L6 connects to the CVE articulation-hygiene
band through four load-bearing anti-patterns:

- [`AP-036 ObserverImpersonation`](../anti-patterns/articulation.md#ap-036)
  — observer role mismatches the register of the assertion content.
  Distinct from MTAC's [`AP-029 MissedAdjoint`](../anti-patterns/mtac.md#ap-029):
  AP-029 fires on architectural decisions (a refactoring claimed
  without its inverse adjoint); AP-036 fires on audit-chronicle
  prose where the observer register and the assertion content
  disagree.
- [`AP-038 ImplicitSubstrate`](../anti-patterns/articulation.md#ap-038)
  — strict-mode `[T]` cog without a declared `CognitiveSubstrate`.
  Self-disclosure of the substrate is part of L6 hygiene per
  [cve-architecture spec §1.5](#substrate-spec).
- [`AP-039 AnchoringOverextension`](../anti-patterns/articulation.md#ap-039)
  — `[T]` cog under non-CHL foundation without declared
  `FormalAnchoring`. Per [cve-architecture spec §4.5](#anchoring-spec),
  the architectural law extends across domains only when the
  parallel anchoring is explicitly named.
- [`AP-040 SelfReferenceWithoutOperator`](../anti-patterns/articulation.md#ap-040)
  — self-referential `Shape` pattern without declared
  `SelfReferenceWitness`. Operationalises
  [cve-architecture spec §16](#self-reference-spec) («никогда
  «само-X», всегда «оператор + неподвижная точка»). Closes the
  architectural-revision open invariant **R4**.

These patterns and the L6 gate together cover the full hygiene
surface: the L6 gate catches prose-level register collisions,
AP-036/038/039/040 catch type-system-level register collisions and
self-referential constructions.

## 8. Self-reference: operator + fixed point as type-level discipline {#self-reference-spec}

[Cve-architecture spec §16](../../../internal/cve/docs/cve-architecture.md)
formalises one of the most subtle hygiene principles:

> Никогда «само-X», всегда «оператор `T_X` + неподвижная точка
> `Fix(T_X)`».

The operational reading: **a self-referential claim is admissible
only when it is re-articulated as the fixed point of an
explicitly-named operator under a cited fixpoint-class theorem.**
The bare assertion «X is X» (or its operational analogues — a cog
that cites itself in `composes_with`, a capability targeting the
cog's own holon, a constitution that ratifies its own
amendment process) is operationally indistinguishable from a
Russell-paradox construction.

Verum operationalises this discipline through two new first-class
types and one new anti-pattern.

### 8.1 The two new types

**`FixpointClass`** — the theorem class discharging the existence
(and where applicable, uniqueness) of `Fix(T_X)`:

| Variant | Theorem | Discharges |
|---------|---------|------------|
| `Banach` | Banach fixed-point theorem | unique fixed point under contracting operator on complete metric space |
| `Tarski` | Tarski-Knaster | existence (possibly non-unique) under monotone operator on complete lattice |
| `Adamek` | Adamek's theorem on initial algebras | initial-algebra fixed point under continuous functor on cocomplete category |
| `CustomFixpoint(citation)` | user-cited theorem | requires `@framework(...)` attribute; enumerable via `verum audit --framework-axioms` |

**`SelfReferenceWitness`** — the operator + fixed-point pair plus
the cited fixpoint class:

```verum
public type SelfReferenceWitness is {
    operator: Text,        // path to the cog implementing T_X
    fixed_point: Text,     // path to the cog implementing Fix(T_X)
    fixpoint_class: FixpointClass,
};
```

The witness is packaged into `ShapeDeclarations.self_reference:
Maybe<SelfReferenceWitness>` alongside the existing `purpose`,
`substrate`, `anchoring`, `e_sense` declarations.

### 8.2 The detection rule (AP-040)

A cog's `Shape` exhibits a **self-X pattern** when at least one of:

1. The cog's own module path appears in `composes_with` (the most
   common variant).
2. A capability in `exposes` or `requires` targets a resource whose
   tag string contains the cog's own path (e.g. `Capability.Read(
   ResourceTag.Database("synarc.governance.constitution"))` from
   the `synarc.governance.constitution` cog).
3. A `Capability.Custom { tag, ... }` whose tag contains the cog's
   own path (chain-domain self-reference via `synarc:holon/<self>`
   or similar).

When self-X is present, AP-040 fires unless `Shape.declarations.
self_reference` carries an explicit witness.

### 8.3 Worked example — a constitution amendment cog

**Without witness (triggers AP-040):**

```verum
@arch_module(
    foundation:    Foundation.ZfcTwoInacc,
    stratum:       MsfsStratum.LFnd,
    lifecycle:     Lifecycle.Theorem("v1.0"),
    composes_with: ["synarc.governance.constitution"],  // SELF
    strict:        true,
    // declarations omitted: AP-040 fires
)
module synarc.governance.constitution;
```

The cog cites itself in `composes_with` (the Russell-paradox
shape: «the constitution is composed of the constitution»). In
strict mode this is rejected at deploy.

**With witness (admitted):**

```verum
@arch_module(
    foundation:    Foundation.ZfcTwoInacc,
    stratum:       MsfsStratum.LFnd,
    lifecycle:     Lifecycle.Theorem("v1.0"),
    composes_with: ["synarc.governance.constitution"],  // SELF, but...
    strict:        true,
    declarations: ShapeDeclarations {
        self_reference: Some(SelfReferenceWitness {
            operator:       "synarc.governance.amendment_operator",
            fixed_point:    "synarc.governance.constitution",
            fixpoint_class: FixpointClass.Banach,
        }),
        ..ShapeDeclarations::empty()
    },
)
module synarc.governance.constitution;
```

The witness re-articulates the bare self-X as: *the constitution
is the unique fixed point of the amendment-operator under Banach's
theorem*. The `synarc.governance.amendment_operator` cog is a
contracting operator (each amendment narrows admissible
constitutions; iterating converges to a unique stable text). The
cited theorem is mechanically discharged by the kernel through
the `@framework(...)` registry; AP-039 closure ensures the
fixpoint-class citation traces to a `[T]`-status proof.

### 8.4 The discipline applied to existing chain features

Several chain-level concepts that look like self-reference are
already articulated as operator+fixed-point:

| Concept | Operator | Fixed point | Class |
|---------|----------|-------------|-------|
| Validator-set rotation (§A2.6) | `synarc.consensus.rotation_operator` | active validator set | `Tarski` (monotone on stake-weighted lattice) |
| Holon coinductive guardedness (§L6) | `synarc.cognition.holon_operator` | self-similar holon at depth-N | `Adamek` (continuous functor on coalgebra) |
| Diakrisis canonical articulation (§A1.1) | `core.math.diakrisis.canonicalize` | unique canonical form | `Banach` (contracting on Bures metric) |
| Audit-bundle self-application (§L4) | `verum_audit::self_audit` | `[T]`-status audit cog | `CustomFixpoint("CVE §20 self-application")` |

Each of these is a legitimate self-reference because the cog
declares the operator and fixed point explicitly. AP-040 catches
the cogs that *look like* these but lack the witness — silent
self-reference is the defect, witnessed self-reference is the
discipline.

## 8. The discipline applied — a real example

A short worked example. The audit chronicle for revision *N*
contains:

```text
gate: counterfactual
verdict: "every counterfactual scenario is HoldsBoth"
```

The L6 gate inspects the verdict and triggers Prohibition 3:
*ungrounded universality* — over which scenarios? all scenarios?
the default battery? custom scenarios?

Fix:

```text
gate: counterfactual
verdict: "every default-battery scenario reports HoldsBoth"
```

The fixed verdict specifies the scope (default battery) and the
specific arm (HoldsBoth), so an auditor reading the chronicle can
mechanically verify the claim by re-running the gate.

## 9. Cross-references

- [CVE overview](./overview.md) — the universal frame.
- [Three axes](./three-axes.md) — C / V / E in detail.
- [Seven layers](./seven-layers.md) — where L6 sits in the
  stratification.
- [`AP-036 ObserverImpersonation`](../anti-patterns/articulation.md#ap-036)
  — type-system counterpart for observer-role/register collisions.
- [`AP-038 ImplicitSubstrate`](../anti-patterns/articulation.md#ap-038)
  — substrate self-disclosure (cve-architecture spec §1.5).
- [`AP-039 AnchoringOverextension`](../anti-patterns/articulation.md#ap-039)
  — formal anchoring boundary (cve-architecture spec §4.5).
- [Audit protocol](../audit-protocol.md) — the gate runner that
  applies the L6 check.
