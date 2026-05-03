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

## 7. The L6 ↔ MTAC connection

Articulation hygiene at L6 connects to the MTAC layer through
the [`AP-029 ObserverImpersonation`](../anti-patterns/mtac.md#ap-029)
anti-pattern. Both check that *the asserter's role and register
match the assertion's content*.

The two patterns are *not* duplicates: AP-029 fires on
architectural decisions (a Developer asserting in Architect
register); the L6 gate fires on audit-chronicle prose (an
ungrounded universal). The two together cover the full surface.

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
- [MTAC anti-pattern AP-029 ObserverImpersonation](../anti-patterns/mtac.md#ap-029)
  — the architectural counterpart.
- [Audit protocol](../audit-protocol.md) — the gate runner that
  applies the L6 check.
