---
sidebar_position: 5
title: "Lifecycle — CVE 7-symbol taxonomy"
description: "How Verum codes the maturity of every architectural artefact: nine variants mapped onto the seven canonical CVE glyphs."
slug: /architecture-types/primitives/lifecycle
---

# Lifecycle — CVE 7-symbol taxonomy

Every Verum cog declares its `Shape.lifecycle` — the artefact's
position in the
[CVE seven-symbol taxonomy](../cve/seven-symbols.md). The
declaration is read by the audit machinery, by the linter, by the
compiler's anti-pattern catalog, and by the dual-audience surface
that renders both developer-facing and auditor-facing views.

This page is the operational reference. For the conceptual story
behind the seven symbols, read
[CVE — Constructive / Verifiable / Executable](../cve/overview.md);
for the canonical glyph table, read
[CVE — seven canonical symbols](../cve/seven-symbols.md). This
page assumes both.

## 1. The Lifecycle variant

```verum
public type ConfidenceLevel is
    | Low | Medium | High;

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
```

Nine variants — seven of them are the canonical CVE glyphs; two
(`Plan` and `Obsolete`) are ATS-V legacy variants retained for
backward compatibility.

| Variant | CVE glyph | Rank | Mature-corpus admissible? |
|---------|-----------|------|---------------------------|
| `Theorem(since)` | `[T]` | 6 | yes |
| `Definition` | `[D]` | 5 | yes |
| `Conditional(conditions)` | `[C]` | 5 | yes |
| `Postulate(citation)` | `[P]` | 4 | yes |
| `Plan(target_completion)` | (legacy) | 3 | discouraged |
| `Hypothesis(confidence)` | `[H]` | 2 | only with `@plan(...)` |
| `Interpretation(reason)` | `[I]` | 1 | no — flagged in strict |
| `Retracted(reason, repl)` | `[✗]` | 0 | no — citing produces error |
| `Obsolete(reason, repl)` | (legacy) | 0 | no — replace before remove |

## 2. Declaration sites

A cog declares Lifecycle exactly once, in the `@arch_module(...)`
attribute on its `module …;` statement:

```verum
@arch_module(
    foundation: Foundation.ZfcTwoInacc,
    stratum:    MsfsStratum.LFnd,
    lifecycle:  Lifecycle.Theorem("v1.0"),
)
module my_app.checkout;
```

Two corollaries:

1. **One Lifecycle per cog.** Lifecycle is not a per-function
   attribute. Function-level granularity is expressed via
   `@verify(strategy)` (the verification ladder) and via
   `@plan(...)` / `@retracted(...)` macros that wrap declarations
   inside an otherwise-mature cog.
2. **Lifecycle is mandatory in `strict: true` cogs.** A cog that
   sets `strict: true` *must* declare a Lifecycle. The default
   (when `strict` is omitted or `false`) treats a missing
   Lifecycle as `Lifecycle.Plan("unspecified")` — a permissive
   default suitable for available development.

## 3. Lifecycle ordering and citation discipline

The poset on Lifecycle is *load-bearing* in the type system. The
[`AP-009 LifecycleRegression`](../anti-patterns/classical.md#ap-009)
anti-pattern enforces a single rule:

> A cog with Lifecycle of rank R may only cite cogs with
> Lifecycle of rank ≥ R.

In other words: a `[T]` Theorem cog may cite `[T]`, `[D]`, `[C]`,
`[P]` cogs — but *not* `[H]`, `[I]`, `[✗]` cogs. The discipline
ensures that "mature artefacts depend on mature artefacts"; a
`[T]` cog that cites a `[H]` Hypothesis is in fact only as
strong as a `[H]`, but the developer is asserting it is `[T]`
— the type checker rejects the inconsistency.

A common pitfall: *transitive* lifecycle regression. A `[T]` cog
imports a `[D]` Definition cog which itself imports a `[H]`
Hypothesis cog. The direct relationship is OK (`[T] → [D]`,
both rank ≥ 5), but the transitive chain reveals the `[T]` is
ultimately resting on a `[H]`. The
[`AP-024 TransitiveLifecycleRegression`](../anti-patterns/articulation.md#ap-024)
anti-pattern walks the import graph and flags the chain.

## 4. Variant-by-variant operational guide

Each variant has a recommended discipline for *when to use it*,
*what additional attributes to add*, and *how to mature it*.

### 4.1 `Theorem(since: Text)` — `[T]`

**When:** the cog is fully proved, every public function carries
`@verify(certified)` (or stronger), and the proof corpus has been
re-checked through the trusted kernel.

**Companion attributes:** `@verify(certified)` on each public
function; optionally `@framework(...)` markers for cited axioms.

**Maturation path:** none — `[T]` is the terminal status. To
*retract* a `[T]`, transition to `Retracted("reason", Some(replacement))`.

**Example:**

```verum
@arch_module(lifecycle: Lifecycle.Theorem("v2.1"))
module my_app.crypto.poly1305;

@verify(certified)
public fn mac(key: Key32, msg: &Bytes) -> Tag16
    where ensures (verify_mac(key, msg, result) == true)
{ … }
```

### 4.2 `Definition` — `[D]`

**When:** the cog establishes a *boundary* — types, capability
ontology entries, configuration constants. There is no theorem to
prove; the definitions ARE the content.

**Companion attributes:** `@derive(...)` for trait derivations,
`@repr(C)` for FFI-relevant records.

**Maturation path:** none — Definition is terminal. If the
boundary needs proving (e.g., refinement satisfiability), the cog
graduates to `Theorem` once the proofs are added.

**Example:**

```verum
@arch_module(lifecycle: Lifecycle.Definition)
module my_app.config.types;

public type DatabaseUrl is Text { self.starts_with("postgres://") };
public type Port        is Int { 1 <= self && self <= 65535 };
public type MaxRetries  is Int { 0 <= self && self <= 100 };
```

### 4.3 `Conditional(conditions: List<Text>)` — `[C]`

**When:** the cog is fully proved *under listed assumptions*.
Outside the assumptions, the cog is undefined. Useful when the
proof relies on external invariants (OS guarantees, hardware
behaviours, cryptographic standards).

**Companion attributes:** `@verify(formal)` is typical; `@condition(...)`
markers can pin individual conditions to call sites.

**Maturation path:** discharge the conditions (move to `[T]`) or
demote to `[H]` if conditions cannot be satisfied.

**Example:**

```verum
@arch_module(
    lifecycle: Lifecycle.Conditional([
        "host platform is POSIX-compliant",
        "fs.realpath returns a canonical path",
        "process has CWD permissions on the target tree",
    ]),
)
module my_app.fs.canonical;
```

### 4.4 `Postulate(citation: Text)` — `[P]`

**When:** the cog is accepted *without* internal proof, on the
strength of an external citation: a peer-reviewed paper, a
published proof corpus, or a kernel discharge axiom.

**Companion attributes:** `@framework(name, "citation")` or
`@kernel_discharge` are mandatory; the audit gate enumerates them.

**Maturation path:** typically terminal. To "internalise" a
postulate (replace external trust with internal proof), graduate
to `[C]` or `[T]` and remove the framework citation.

**Example:**

```verum
@arch_module(
    lifecycle: Lifecycle.Postulate(
        "Joux 2009 · 'Algorithmic Cryptanalysis' · Theorem 4.2"
    ),
)
@framework(joux_2009, "Theorem 4.2 — generic group lower bound")
module my_app.crypto.security_arguments;
```

### 4.5 `Plan(target_completion: Text)` — *(legacy)*

**When:** committed work, not yet implemented. Distinct from
`[P]` Postulate. Retained for backward compatibility with existing
codebases.

**Companion attributes:** `@plan(target: "...", milestones: [...])`.

**Maturation path:** new code SHOULD prefer `Hypothesis` for
not-yet-formalised intent and let the `@plan` attribute carry the
target date. The Plan variant will be folded into Hypothesis in a
future release.

### 4.6 `Hypothesis(confidence: ConfidenceLevel)` — `[H]`

**When:** speculation. The cog is in active design, no
implementation, no proof, no tests. MUST carry a maturation
plan; a hypothesis without a `@plan(...)` attribute is
[`AP-016 HypothesisWithoutMaturationPlan`](../anti-patterns/articulation.md#ap-016).

**Companion attributes:** `@plan(target: ..., milestones: [...])`.

**Maturation path:** as the cog matures, transition to:

- `Conditional(...)` once the proof exists under hypotheses, or
- `Theorem(...)` once the proof exists unconditionally, or
- `Retracted(...)` if the bet does not pan out.

**Example:**

```verum
@arch_module(lifecycle: Lifecycle.Hypothesis(ConfidenceLevel.Medium))
@plan(
    target:     "v0.5",
    milestones: ["spec drafted", "POC built", "verified", "shipped"],
)
module my_app.experimental.zk_proof;
```

### 4.7 `Interpretation(reason: Text)` — `[I]`

**When:** the cog has been written down but neither realised, nor
checked, nor extracted. *Transitional only*. A mature corpus
contains zero `[I]` entries — every Interpretation must either
mature into a higher status or be removed before the corpus
ships.

In `strict: true` mode, an `Interpretation` annotation is
[`AP-017 InterpretationInMatureCorpus`](../anti-patterns/articulation.md#ap-017).

**Maturation path:** transition out as soon as the artefact gains
C, V, or E content.

**Why it exists at all:** during exploration, some artefacts are
written down before any of C/V/E is realised. Naming the status
`[I]` rather than "todo" or "draft" forces explicit transition
rather than silent decay.

### 4.8 `Retracted(reason: Text, replacement: Maybe<Text>)` — `[✗]`

**When:** the artefact has been deliberately withdrawn — refuted,
deprecated, scope-removed. The record is preserved as a *negative
example* in the audit chronicle.

Citing a `[✗]` cog produces a compile-time error
([`AP-013 RetractedCitationUse`](../anti-patterns/articulation.md#ap-013)).

**Companion attributes:** `@retracted_as_of(date: "YYYY-MM-DD")`
optionally pins the retraction date for audit chronology.

**Example:**

```verum
@arch_module(
    lifecycle: Lifecycle.Retracted(
        "weak primitive — deprecated by NIST SP 800-131A",
        Some("my_app.crypto.aes256_gcm"),
    ),
)
@retracted_as_of(date: "2024-03-15")
module my_app.crypto.des_legacy;
```

### 4.9 `Obsolete(reason: Text, replacement: Maybe<Text>)` — *(legacy)*

**When:** scheduled for removal. *Less* strict than `[✗]`
Retracted: the artefact still functions but is expected to be
replaced.

**Maturation path:** new code SHOULD prefer `Retracted` for
explicit withdrawals; `Obsolete` is retained for migration paths
where the artefact must remain callable for one or more release
cycles before final removal.

## 5. Compile-time checks summary

The Verum compiler enforces the following Lifecycle-related
checks:

| Check | Anti-pattern | When it fires |
|-------|--------------|---------------|
| Citing cog has lower rank than cited | [`AP-009 LifecycleRegression`](../anti-patterns/classical.md#ap-009) | direct citation |
| Citing chain exposes a low-rank link | [`AP-024 TransitiveLifecycleRegression`](../anti-patterns/articulation.md#ap-024) | transitive walk |
| Citing a `[✗]` cog | [`AP-013 RetractedCitationUse`](../anti-patterns/articulation.md#ap-013) | direct citation |
| `[H]` Hypothesis without `@plan` | [`AP-016 HypothesisWithoutMaturationPlan`](../anti-patterns/articulation.md#ap-016) | declaration site |
| `[I]` Interpretation in `strict: true` | [`AP-017 InterpretationInMatureCorpus`](../anti-patterns/articulation.md#ap-017) | declaration site |
| Lifecycle missing from `strict: true` cog | `ATS-V-LIFECYCLE-MISSING` (declaration error) | declaration site |
| `Lifecycle.Theorem` cog whose body lacks `@verify(...)` | `ATS-V-LIFECYCLE-UNDERSPECIFIED` | declaration site |

All of these emit at *compile time*. There is no runtime cost.

## 6. Audit-time enumeration

`verum audit --arch-corpus` enumerates every annotated cog with
its CVE glyph, its rank, and its citation graph. The output is
suitable for archival in audit chronicles:

```
$ verum audit --arch-corpus

corpus: 267 annotated cogs
  [T] Theorem        : 89   (33%)
  [D] Definition     : 121  (45%)
  [C] Conditional    : 31   (11%)
  [P] Postulate      : 17   (6%)
  Plan (legacy)      : 4    (1%)
  [H] Hypothesis     : 4    (1%)
  [I] Interpretation : 0    (0%)  ✓ mature corpus
  [✗] Retracted      : 1    (0%)
  Obsolete (legacy)  : 0    (0%)

regression edges: 0   (✓ Lifecycle poset honoured)
retracted citations: 0   (✓ no [✗] cited)

audit duration: 1.4s
```

The "mature corpus" badge appears when `[I]` count is zero. A
non-zero `[I]` count in `strict` mode is a build failure; in
permissive mode it is a hint.

## 7. Programmatic access

The Lifecycle variant exposes two methods used by the audit
pipeline and by tooling:

- `lifecycle.tag()` — returns a stable single-token string
  (`"theorem"`, `"definition"`, `"conditional"`, `"postulate"`,
  `"plan"`, `"hypothesis"`, `"interpretation"`, `"retracted"`,
  `"obsolete"`).
- `lifecycle.cve_glyph()` — returns the canonical glyph as a
  string (`"T"`, `"D"`, `"C"`, `"P"`, `"Plan"`, `"H"`, `"I"`,
  `"✗"`, `"O"`).
- `lifecycle.rank()` — returns the integer rank used by
  `LifecycleRegression`.

Tooling that consumes audit output should prefer these accessors
over re-deriving the values from the variant tag.

## 8. Cross-references

- [CVE overview](../cve/overview.md) — the universal correctness
  frame.
- [CVE — seven canonical symbols](../cve/seven-symbols.md) — the
  glyph reference.
- [CVE — seven layers](../cve/seven-layers.md) — where Lifecycle
  sits in the layered application of CVE.
- [Shape](./shape.md) — the aggregate carrier of which Lifecycle
  is one field.
- [Anti-pattern AP-009 LifecycleRegression](../anti-patterns/classical.md#ap-009)
- [Anti-pattern AP-013 RetractedCitationUse](../anti-patterns/articulation.md#ap-013)
- [Anti-pattern AP-016 HypothesisWithoutMaturationPlan](../anti-patterns/articulation.md#ap-016)
- [Anti-pattern AP-017 InterpretationInMatureCorpus](../anti-patterns/articulation.md#ap-017)
- [Anti-pattern AP-024 TransitiveLifecycleRegression](../anti-patterns/articulation.md#ap-024)
