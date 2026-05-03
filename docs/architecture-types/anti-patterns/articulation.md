---
sidebar_position: 3
title: "Articulation anti-patterns (AP-010 .. AP-018)"
description: "The articulation-hygiene band: circular self-reference, ungrounded assumption, retracted-citation use, hypothesis without plan, definition shadowing."
slug: /architecture-types/anti-patterns/articulation
---

# Articulation anti-patterns (AP-010 .. AP-018)

The articulation band covers defects that arise when an
artefact's *self-presentation* is internally inconsistent: it
cites itself without operator, it asserts without grounding, it
declares without honouring its own discipline. These patterns
are typically *warnings* by default — they signal hygiene
issues rather than soundness failures — but a few are errors
because they would propagate inconsistency into the audit
chronicle.

For the catalog's overall structure see
[Anti-pattern overview](./overview.md). For the underlying
discipline that motivates this band see
[CVE — articulation hygiene](../cve/articulation-hygiene.md).

---

## AP-010 — CircularSelfReference {#ap-010}

**Severity:** warning · **Phase:** post-arch

**Predicate.** A cog or theorem references itself by name without
specifying an *operator* — a ranking function, a measure, a
fixed-point combinator — that grounds the recursion.

**What it catches.** A function whose body calls itself with the
same arguments without a proof of well-foundedness. Or a theorem
whose statement mentions itself without a measure.

**Worked example — defect.**

```verum
@arch_module(lifecycle: Lifecycle.Theorem("v1.0"))
module algos.recursive_thing;

public fn compute(x: Int) -> Int {
    compute(x)        // <-- AP-010: self-reference, no measure
}
```

**Remediation.** Either provide a measure / ranking function, or
mark the function as expected-non-terminating (rare):

```verum
public fn compute(x: Int) -> Int
    decreases x        // ← measure
{
    if x <= 0 { 0 } else { compute(x - 1) + x }
}
```

---

## AP-011 — UngroundedAssumption {#ap-011}

**Severity:** warning · **Phase:** post-arch

**Predicate.** A claim is asserted without К or В content — no
constructor, no check, no citation. The claim is purely
declarative, but the cog's Lifecycle implies higher rank.

**What it catches.** A function declared `@verify(formal)` that
relies on an axiom not registered in `@framework(...)`. The
axiom is "assumed" but the assumption is undocumented.

**Remediation.** Either provide the missing К / В content, or
register the assumption explicitly:

```verum
@framework(my_team_axioms, "User-validated email format")
@axiom
public theorem email_format_is_well_known: ...
```

The axiom now appears in `verum audit --framework-axioms`.

---

## AP-012 — OverQuantifiedScope {#ap-012}

**Severity:** warning · **Phase:** post-arch

**Predicate.** A universal quantifier (`forall`) ranges over a
broader scope than the cog's `Shape` admits — for example,
quantifying over "all values" in a cog whose stratum admits
only `LFnd` content.

**What it catches.** A theorem that claims to hold "for all X"
where X includes content the cog's stratum does not admit.

**Remediation.** Either narrow the quantifier's range, or raise
the cog's stratum to admit the broader scope.

---

## AP-013 — RetractedCitationUse {#ap-013}

**Severity:** error · **Phase:** post-arch

**Predicate.** A cog cites (via `mount`, `composes_with`, or
direct call) a cog whose Lifecycle is `Lifecycle.Retracted(...)`.

**What it catches.** A code path that depends on an artefact the
team has explicitly withdrawn.

**Worked example — defect.**

```verum
@arch_module(
    lifecycle: Lifecycle.Retracted(
        "weak primitive",
        Some("crypto.aes256_gcm"),
    ),
)
module crypto.des_legacy;

@arch_module(lifecycle: Lifecycle.Theorem("v1.0"))
module my_app.payment;

mount crypto.des_legacy;          // <-- AP-013
```

**Diagnostic.**

```text
error[ATS-V-AP-013]: retracted citation use
  --> src/payment.vr:3:7
   |
 3 | mount crypto.des_legacy;
   |       ^^^^^^^^^^^^^^^^^ cog `crypto.des_legacy` is Retracted.
   |                         Reason: "weak primitive"
   |                         Replacement: crypto.aes256_gcm
   |
help: replace `crypto.des_legacy` with `crypto.aes256_gcm`.
```

**Remediation.** Use the `replacement` cog if one is named, or
remove the dependency.

---

## AP-014 — UndisclosedDependency {#ap-014}

**Severity:** warning · **Phase:** post-arch

**Predicate.** A proof relies on an axiom or assumption not
registered in `@framework(...)`.

**What it catches.** A `@verify(formal)` proof that internally
uses LEM (`P ∨ ¬P`) without declaring `@framework(classical_axioms,
"law of excluded middle")`. The proof is sound under classical
logic, but the dependency is invisible to `verum audit
--framework-axioms`.

**Remediation.** Register the assumption explicitly:

```verum
@framework(classical_axioms, "law of excluded middle")
@axiom
public theorem lem<P>: P or not P;
```

Once registered, the audit inventory enumerates the dependency.

---

## AP-015 — DeclarationBodyDrift {#ap-015}

**Severity:** error · **Phase:** arch-check

**Predicate.** A cog's `Shape` claim contradicts a structural
property of its body. Examples:

- `cve_closure.executable: Some(...)` but the body has no
  extractable content.
- `cve_closure.constructive: Some(...)` but the cog declares
  `Lifecycle.Interpretation`.
- `lifecycle: Lifecycle.Theorem(...)` but no public function
  carries `@verify(...)`.

**Remediation.** Either bring the body up to the Shape's claim,
or weaken the Shape:

```verum
@arch_module(
    lifecycle: Lifecycle.Plan("v0.5"),    // ← was Theorem
    cve_closure: CveClosure {
        constructive:        None,
        verifiable_strategy: None,
        executable:          None,
    },
)
module my_app.future_feature;
```

---

## AP-016 — HypothesisWithoutMaturationPlan {#ap-016}

**Severity:** error · **Phase:** arch-check

**Predicate.** A cog declares `Lifecycle.Hypothesis(...)` without
an accompanying `@plan(...)` attribute.

**What it catches.** A `[Г]` Hypothesis cog that is "open-ended"
— no target completion, no milestones. Hypotheses without
plans tend to ossify into permanent stubs.

**Worked example — defect.**

```verum
@arch_module(lifecycle: Lifecycle.Hypothesis(ConfidenceLevel.Medium))
module my_app.experimental.zk_proof;
// AP-016: no @plan(...) attribute
```

**Remediation.**

```verum
@arch_module(lifecycle: Lifecycle.Hypothesis(ConfidenceLevel.Medium))
@plan(
    target:     "v0.5",
    milestones: ["spec drafted", "POC built", "verified", "shipped"],
)
module my_app.experimental.zk_proof;
```

The `@plan(...)` attribute makes the maturation path part of the
audit chronicle. Mature cogs report the milestone completion in
`verum audit --arch-corpus`.

---

## AP-017 — InterpretationInMatureCorpus {#ap-017}

**Severity:** error · **Phase:** arch-check

**Predicate.** A cog declares `Lifecycle.Interpretation(...)` in
a project where `strict: true` is set on the cog or the project
defaults are strict.

**What it catches.** A `[И]` Interpretation cog reaching a
mature corpus. By definition, a mature corpus contains zero
`[И]` entries — every Interpretation must mature into a higher
status or be removed.

**Remediation.** Either upgrade to a higher Lifecycle (typical:
`Hypothesis` with a plan, or `Conditional` with conditions, or
`Theorem` with verification), or remove the cog.

---

## AP-018 — DefinitionShadowing {#ap-018}

**Severity:** error · **Phase:** post-arch

**Predicate.** Two `Lifecycle.Definition` cogs declare the same
name in scopes that overlap at a call site. The "boundary set
by fiat" is therefore ambiguous.

**What it catches.** A namespacing collision where two
definitional cogs both claim to define `UserId` (or any other
boundary type), and a downstream cog imports both.

**Remediation.** Rename one of the definitions, or refactor to a
single canonical definition with an explicit re-export from the
other site.

---

## Summary of severities

| AP | Severity | Most common cause |
|----|----------|-------------------|
| AP-010 | warning | recursion without measure |
| AP-011 | warning | proof relies on undocumented axiom |
| AP-012 | warning | quantifier over too-broad scope |
| AP-013 | error | citing a retracted cog |
| AP-014 | warning | proof uses LEM/AC without `@framework` |
| AP-015 | error | Shape claim doesn't match body |
| AP-016 | error | `[Г]` without `@plan` |
| AP-017 | error | `[И]` in strict-mode |
| AP-018 | error | duplicate boundary definitions |

The articulation band's discipline: every architectural
*assertion* must be either proved, cited, or admitted —
nothing implicit.

## Cross-references

- [Anti-pattern overview](./overview.md)
- [Classical anti-patterns](./classical.md) — AP-001 .. AP-009.
- [Coherence anti-patterns](./coherence.md) — AP-019 .. AP-026.
- [MTAC anti-patterns](./mtac.md) — AP-027 .. AP-032.
- [CVE — articulation hygiene](../cve/articulation-hygiene.md)
  — the underlying L6 discipline.
- [Lifecycle primitive](../primitives/lifecycle.md) — the CVE
  taxonomy AP-013 / AP-016 / AP-017 enforce.
