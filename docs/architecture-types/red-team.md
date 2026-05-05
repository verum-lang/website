---
sidebar_position: 91
title: "Red-team — closed attack vectors"
description: "Five explicit attack vectors against the ATS-V architectural type system, the closure axioms that defeat them, and the threat-modelling discipline behind the catalog."
slug: /architecture-types/red-team
---

# Red-team — closed attack vectors

A type system that catches honest mistakes is necessary but not
sufficient.  An adversary writing `@arch_module(...)` declarations
will probe the boundaries: which checks are decidable on the
surface alone, which depend on kernel state, which are silently
absent.  This page documents the five canonical attack vectors
against ATS-V, the closure axioms that defeat them, and the
threat-modelling discipline used to enumerate new vectors.

## Attack vector AT-1 — Capability ontology forgery

**Setup.** A malicious cog declares:

```verum
@arch_module(
    exposes: [
        Capability.Custom {
            tag: "admin",
            schema: CapabilitySchema {
                description: "admin access",
                transfers_privilege: true,
                subsumed_by: [],
            },
        },
    ],
)
module evil.cog;
```

The inline `transfers_privilege: true` claim would otherwise
fabricate a high-privilege capability that downstream cogs
accept on faith.

**Why it would work without closure.** The kernel parser fills
the schema with conservative defaults when the cog source omits
fields, but it does not validate the `tag` against any registry.
The check `B.requires ⊆ A.exposes` runs on string equality of
tags, so a downstream cog with `requires: [Capability.Custom { tag:
"admin", ... }]` would compose without complaint.

**Closure.** The axiom
`kernel_arch_capability_ontology_check` in
`core.architecture.anti_patterns` requires every Custom-tagged
capability to be registered in
`core.architecture.capability_ontology.ATS_V_CANONICAL_CAPABILITIES`
(or in a corpus-extended registry declared via `@arch_corpus(...)`).
Unregistered tags raise an error at the ATS-V phase, before any
composition check runs.

## Attack vector AT-2 — Theorem without CVE

**Setup.** A cog declares:

```verum
@arch_module(
    lifecycle: Lifecycle.Theorem("v1.0"),
    strict: false,            // soft mode
    // cve_closure_C, cve_closure_V_strategy, cve_closure_E omitted
)
module honest_looking.cog;
```

The `[T]` Theorem status conveys "fully proven, load-bearing" to
every reviewer and to every cog that cites this one (AP-009
treats Theorem as the highest rank, which means lower-rank cogs
may safely depend on it).

**Why it would work without closure.** AP-010 `CveIncomplete`
fires only when `strict = true`.  In soft mode, the missing CVE
axes are downgraded to warnings, and the cog passes the audit.
A reviewer not paying attention to soft-mode warnings sees a
green build with a `[T]` claim and concludes the artefact is
load-bearing.  But the three CVE axes — Constructive witness,
Verifiable strategy, Executable artefact — are exactly the
content that makes a Theorem load-bearing; their absence means
the `[T]` claim is unbacked.

**Closure.** The axiom `kernel_arch_theorem_cve_required` raises
`CveIncomplete` to `Severity.Error` for any `Lifecycle.Theorem(...)`
declaration that lacks a complete CVE-closure triple, regardless
of the `strict` flag.  The semantic constraint — "Theorem implies
CVE+ by definition" — overrides the strictness toggle.

## Attack vector AT-3 — Yoneda equivalence forgery

**Setup.** A cog submits a Yoneda verdict claiming two shapes are
equivalent based on a single curated agreement:

```verum
YonedaVerdict {
    schema_version: 1,
    agreements: [
        ObserverAgreement {
            observer: Observer.Auditor("compliance"),
            status: AgreementStatus.Agree,
            base_observation: <auditor view>,
            alt_observation: <auditor view>,
        },
    ],
    equivalent: true,
    disagreement_count: 0,
}
```

The Auditor observer projects the *full* Shape, so its agreement
is structurally strong — the strictest observer agreed, surely the
others agree as well?  Not necessarily.  A determined refactor can
rearrange the cog so the Auditor sees the same fields but the
EndUser observer sees a different exposes list, or the Adversary
observer sees a different attack surface.

**Why it would work without closure.** The `YonedaVerdict` type
permits any subset of observers in the `agreements` list.  Empty
list yields `equivalent: false` (the existing refusal axiom), but
a single-element list with `equivalent: true` is structurally
permitted.

**Closure.** The axiom
`kernel_arch_yoneda_canonical_roster_complete` requires the
`agreements` list to span the full canonical 5-roster (EndUser,
PeerCog, Stakeholder, Auditor, Adversary).  Partial agreements
cannot fabricate equivalence; the verdict is only binding when
*every* observer has been queried.  This pairs with the
`observer_full_canonical_roster()` helper that returns the
authoritative list.

## Attack vector AT-4 — Composition path traversal

**Setup.** A cog declares:

```verum
@arch_module(
    composes_with: ["./../some-cog"],
)
module sus.cog;
```

The `composes_with` field is `List<Text>` with no internal
structure validation.  An adversary supplies path-traversal-style
strings, expecting the resolver to follow them outside the
intended module hierarchy.

**Why it might work without closure.** ATS-V itself only treats
`composes_with` as opaque identifiers and runs the
`composition_check` against the resolved Shape.  Path resolution
happens in the module loader — outside the architectural-type
boundary.

**Closure status.** Out of scope for ATS-V proper.  Module
resolution and path-traversal hardening live in the module
loader (`verum_modules`).  The ATS-V phase treats every entry in
`composes_with` as a name to look up; whether the lookup is
restricted to the module graph is the loader's responsibility.
Documented here for threat-model completeness.

## Attack vector AT-5 — `consumes` field injection

**Setup.** A cog declares:

```verum
@arch_module(
    consumes: ["'; DROP TABLE--", "very_legitimate"],
)
module exploit.cog;
```

The `consumes: List<Text>` field is free-form — any string passes.
Downstream gas-accounting code parses `<resource>/<N> <unit>`
patterns from these strings and may concatenate them into
diagnostics, audit reports, or future SQL-backed analytics.

**Why it would work without closure.** No format enforcement on
free-form `Text` fields.  The parser at `arch_parse` treats each
entry as an opaque string.

**Closure.** The axiom
`kernel_arch_consumes_format_check` requires each entry to
match the canonical pattern
`<resource_kind>/<positive_integer> <unit>` where the unit
belongs to the closed set `{bytes, ops, ms, ns}`.  Format
violations surface as AP-025 `DeclarationDrift` at the ATS-V
phase, before any downstream consumer sees the value.

## How new vectors get added

The threat model is reviewed each release cycle.  A new vector
joins the catalog when:

1. A reviewer or external researcher demonstrates a forgery,
   bypass, or escalation path the current catalog does not cover.
2. The team writes a regression test demonstrating the failure
   on an unpatched build.
3. A closure axiom is added to `core.architecture.anti_patterns`
   with a stable name (`kernel_arch_*_check` for the check,
   `AT-N` letter code for cross-referencing).
4. The kernel side implements the check; the Verum-side axiom
   declares the bridge.
5. The pin test extends with the new axiom name; the
   architectural type-checker exit criterion now includes the
   new bridge.

The catalog above is therefore a **lower bound** on the closures
shipped — every release may add more.

## Cross-reference

- [Anti-pattern catalog overview](./anti-patterns/overview.md)
- [Operationalisation surface](./operationalisation.md)
- [Capability ontology](./primitives/capability.md)
