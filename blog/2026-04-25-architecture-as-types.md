---
slug: architecture-as-types
title: "Architecture-as-Types — what stays load-bearing when models write the code"
authors: [verum-team]
tags: [architecture, ats-v, cve, types, llm, verification]
---

A diagram is a screenshot in time. The moment the team ships, the
diagram and the running system begin to drift apart. The
codebase becomes the only authoritative source — but the codebase
does not narrate *why* it is shaped the way it is. Reviewers
reconstruct intent from `git blame`, grep, and tribal memory. For
forty years that was an annoyance. In the era when an increasing
fraction of code is produced by language models, the absence of a
machine-checkable architectural contract becomes a structural
liability.

Verum's response is the **Architectural Type System for Verum
(ATS-V)**: a discipline that promotes architectural intent — *who
can do what, across which boundary, under which discipline* — from
prose into the type system. A `Shape` is a compiler-checked
obligation that travels with the code; the eight primitives that
build it use existing Verum syntax (variants, records, attributes,
protocols), with no new grammar productions. The map collapses
into the territory; there is exactly one source of truth, and it
is the code.

This post walks through ATS-V end-to-end, grounded in the actual
implementation: 1230 lines of canonical Verum-side type declarations
in the Architecture module, mirrored by 8320 lines in the
Architectural kernel surface on the Rust side. It closes with the
question the language was built around: what changes in this stack
when much of the code is written not by the engineer holding the
keyboard but by a model they are prompting.

<!-- truncate -->

## 1. The drift problem, restated

Every long-lived system carries two architectural artefacts: a
*map* (diagrams, READMEs, whiteboards) and a *territory* (function
signatures, module boundaries, deployed binaries). The two drift
apart because no compiler enforces the correspondence. Maps lag
behind refactors. Refactors break invariants the maps codified.
The codebase becomes authoritative; the maps become folklore.

The standard response is to add review process — code review, ADRs,
RFC documents, periodic architecture-review meetings. None of those
mechanisms run at compile time. None of them refuse to merge a
change that violates an architectural invariant.

ATS-V's claim is narrower and stronger: **architectural decisions
that matter must be expressible as types the compiler checks.** If
a discipline can only be enforced by review, that discipline will
drift. If the discipline lives in the type system, it cannot.

## 2. The eight architectural primitives

Every ATS-V annotation is built from eight primitives. None of
them introduces a new grammar production — variants, records,
attributes, and protocols already in the language carry the
entire load. The canonical declarations live in the
[Architecture types module](https://github.com/oldman/verum/blob/main/core/architecture/types.vr):

| Primitive | Question it answers | Verum surface |
|-----------|--------------------|---------------|
| **Capability** | What may this cog *do*? | `type Capability is …` (variant) |
| **Boundary** | What crosses the cog's edge, and how? | `type Boundary is { … }` (record) |
| **Composition** | Which other cogs may legally compose with this one? | `composes_with: List<Text>` |
| **Lifecycle** | At which CVE stage of maturation is this artefact? | `type Lifecycle is …` (variant) |
| **Foundation** | Which meta-theoretic profile carries the proof corpus? | `type Foundation is …` (variant) |
| **Tier** | Where does this code execute? | `type Tier is …` (variant) |
| **Stratum** | Which level of the MSFS moduli space? | `type MsfsStratum is …` (variant) |
| **Shape** | The aggregate carrier — the typed architectural fingerprint. | `type Shape is { … }` (record) |

A cog (the unit of compilation) declares its `Shape` via the
`@arch_module(...)` attribute on its `module …;` statement:

```verum
@arch_module(
    foundation: Foundation.ZfcTwoInacc,
    stratum:    MsfsStratum.LFnd,
    lifecycle:  Lifecycle.Theorem("v1.0"),
    exposes:    [Capability.Read(ResourceTag.File("./config")),
                 Capability.Network(NetProtocol.Tcp, NetDirection.Outbound)],
    requires:   [Capability.Read(ResourceTag.Logger)],
    preserves:  [BoundaryInvariant.AllOrNothing,
                 BoundaryInvariant.AuthenticatedFirst],
    at_tier:    Tier.Aot,
    strict:     true,
)
module my_app.fetcher;
```

The compiler reads this as an obligation. Every claim — *I expose
this capability, I require that one, I preserve these boundary
invariants, I run at this tier, my proof corpus rests on this
foundation* — is checked against the actual code body and against
the surrounding graph of cogs. As of this writing, **284 cogs in
the core stdlib carry an `@arch_module` annotation**; the
annotation is the standard surface, not an experimental one.

The full primitive reference is on the
[Eight Architectural Primitives](/docs/architecture-types/primitives) page.

## 3. What the architectural type checker actually does

A regular type checker asks: *does the value flowing into this
slot have the right type?* The architectural type checker asks the
same question one level up: *does the cog flowing into this
composition slot have the right `Shape`?*

The check is structural, not nominal. If cog A's `Shape.exposes`
contains `Read(ResourceTag.Database("ledger"))` and cog B's
`Shape.requires` lists `Read(ResourceTag.Database("ledger"))`,
then B may import from A. If A only exposes `Read(ResourceTag
.Database("audit"))`, the import is rejected at compile time. The
diagnostic carries a stable RFC code (`ATS-V-AP-001`,
`ATS-V-AP-005`, …), points at both cogs by name, and surfaces
through the same span pointers and LSP integration as ordinary
type errors.

Architectural diagnostics are not a separate review pass; they are
part of the compiler. There is no place to demote them to "warning
in the next sprint", because at the type-system level they cannot
be demoted any more than `Int + Bool` can.

## 4. The thirty-two anti-pattern catalog

On top of the structural check ATS-V layers a **canonical catalog
of architectural defects**, each registered as a refinement-level
predicate. The catalog has thirty-two entries, organised in three
bands. Each entry publishes a stable RFC code (`ATS-V-AP-NNN` —
the code never changes), a refinement predicate, a canonical
example, and a remediation recipe. The implementation in the
[Anti-patterns module](https://github.com/oldman/verum/blob/main/core/architecture/anti_patterns.vr)
on the Verum side and the corresponding 1722-line
anti-pattern kernel intrinsic on the Rust side holds the full
surface; an excerpt:

| Code | Band | Triggers when |
|------|------|---------------|
| `AP-001` CapabilityEscalation | core | body uses a capability not declared in `requires` |
| `AP-002` CapabilityLeak | core | linear / affine capability passed beyond its declared scope |
| `AP-003` DependencyCycle | core | `composes_with` graph contains a cycle |
| `AP-004` TierMixing | core | tier-N cog calls into tier-M without a bridge |
| `AP-005` FoundationDrift | core | composing cogs with incompatible foundations and no bridge |
| `AP-009` LifecycleRegression | core | citation chain regresses to a strictly-lower lifecycle rank |
| `AP-010` CveIncomplete | core | strict-mode cog with at least one missing CVE-closure axis |
| `AP-011` AbsoluteBoundaryAttempt | ontology | cog declares `MsfsStratum::LAbs` (AFN-T α violation) |
| `AP-014` UnauthenticatedCrossing | ontology | `Network` boundary without `BoundaryInvariant::AuthenticatedFirst` |
| `AP-016` CapabilityDuplication | ontology | `Linear` capability used twice |
| `AP-022` CapabilityLaundering | ontology | multi-hop privilege escalation through unmarked boundary |
| `AP-025` DeclarationDrift | ontology | declared `@arch_module(...)` shape diverges from inferred shape |
| `AP-027` TemporalInconsistency | mtac | invariant fails to hold across two sampled time-points |
| `AP-029` MissedAdjoint | mtac | refactoring claimed without its inverse adjoint pair |
| `AP-032` YonedaInequivalentRefactor | mtac | refactor changes the observer-functor (Yoneda inequivalent) |

The full catalog is enumerable via `verum audit
--arch-discharges` and is therefore part of the corpus's external
interface, not a private compiler concern. The catalog is
*append-only* — a future Verum version may add patterns; existing
patterns are never renumbered or removed, so a diagnostic emitted
in 2026 will still be parseable in 2031. See the
[Anti-pattern catalog overview](/docs/architecture-types/anti-patterns).

## 5. CVE — the universal correctness frame

Every Verum artefact carries exactly one of seven canonical
**CVE statuses** — the *Constructive / Verifiable / Executable*
classification — surfaced as a single-character glyph. The
Lifecycle primitive carries it; audit reports surface it; the
LSP shows it on hover.

| Glyph | Variant | C / V / E | Meaning |
|-------|---------|-----------|---------|
| `[T]` | `Theorem(since)` | yes / yes / yes | Full closure — the strongest claim |
| `[D]` | `Definition` | yes / trivial / yes | Boundary set by fiat |
| `[C]` | `Conditional(conds)` | conditional × 3 | Proven under listed hypotheses |
| `[P]` | `Postulate(citation)` | yes / external / yes | Accepted via external citation |
| `[H]` | `Hypothesis(confidence)` | partial / absent / absent | Speculative, with maturation plan |
| `[I]` | `Interpretation(reason)` | absent × 3 | Descriptive only — transitional |
| `[✗]` | `Retracted(reason, repl)` | n/a | Withdrawn; record retained |

The seven cover every productive cell of the
[CVE truth table — seven canonical configurations](/docs/architecture-types/cve/seven-configurations).
Configurations not shown are unreachable in practice — a
*"verifiable but not constructive"* claim is unstable by
construction. The seven glyphs form a partial order under "rank";
the [`AP-009 LifecycleRegression`](/docs/architecture-types/anti-patterns/classical#ap-009)
anti-pattern uses this order to reject citations from a high-rank
artefact down to a strictly-lower-rank one. A `[T]` cog citing a
`[H]` cog produces a compile-time diagnostic with the citing cog's
name, the cited cog's name, and the rank difference.

The same three CVE questions yield different answers at different
layers of abstraction. ATS-V stratifies CVE into seven layers, L0
through L6:

- **L0** — the object itself (a function body, a value, a theorem statement)
- **L1** — its proof (the proof term, the SMT certificate)
- **L2** — the proof method (the tactic, the strategy, the SMT call)
- **L3** — the method's foundation (the meta-theory)
- **L4** — the architectural shape carrying the proof
- **L5** — the communication of the proof to a reader
- **L6** — the frame itself (CVE applied to CVE)

Each audit gate is positioned at a specific layer; the bundle
aggregator combines verdicts across layers into a single **L4
load-bearing** claim. Combining gates at different layers
without normalising is a category error. See
[CVE — three axes (C / V / E)](/docs/architecture-types/cve/three-axes),
[CVE — seven canonical symbols](/docs/architecture-types/cve/seven-symbols),
and [CVE — seven layers (L0..L6)](/docs/architecture-types/cve/seven-layers).

## 6. Three orthogonal axes — Capability, Property, Context

A common misreading of Verum is to assume capabilities,
properties, and the context system describe the same thing in
three syntaxes. They do not. The three are **orthogonal**: each
tracks a different aspect, runs at a different phase, costs a
different amount, and fails for a different reason. Conflating
them leaves codebases under-specified in subtle ways.

| Axis | Phase | Cost |
|------|-------|------|
| **Capability** | compile-time architectural | 0 ns |
| **Property** | compile-time function-type | 0 ns |
| **Context** | DI signature + runtime lookup | ~5–30 ns |

- **Capability** lives in `@arch_module(exposes, requires)` and tracks what the cog is *permitted* to do. Failure surfaces as `AP-001 CapabilityEscalation`.
- **Property** lives on function types via `PropertySet` and tracks what the function's *body* actually does. Failure surfaces as a property-system mismatch (e.g. a `{Pure}` function calling a `{IO}` function).
- **Context** lives in the `using [Database, Logger]` clause and tracks which providers the runtime must inject. Failure surfaces as `unresolved_provider` at the call site.

Three axes correspond to three different *engineering questions*
a reviewer asks of a function: *"is this allowed in this part of
the system?"* — capability. *"What does this function actually
compute?"* — property. *"What does this function need at the
moment of call?"* — context. A single mechanism cannot answer
all three without losing precision in at least two of them.

The three compose freely. A function may simultaneously be
capability-typed `[Capability.Network(Tcp, Outbound)]`, carry
property `{Async, Fallible, IO}`, and require context
`using [Logger, MetricsSink]`. The full discussion is on the
[Three Orthogonal Axes — Capability, Property, Context](/docs/architecture-types/orthogonality)
page.

## 7. MTAC — the modal-temporal layer

Static architectural typing answers *what is permitted right
now*. Real systems also need answers to *when was this decided?*,
*who saw it?*, and *under what modality does it hold?* The
**Modal-Temporal Architectural Calculus (MTAC)** is ATS-V's
extension into time, observer-roles, and modal qualification.

MTAC ships seven primitives in the
[MTAC module](https://github.com/oldman/verum/blob/main/core/architecture/mtac.vr)
(173 LOC) plus a 575-line MTAC kernel intrinsic on the Rust side.
The carriers:

```verum
public type Observer is
    | Architect
    | Auditor
    | Developer
    | Operator
    | Adversary;

public type ModalAssertion is
    | Necessarily(prop: ArchProposition)         // □ P
    | Possibly(prop: ArchProposition)            // ◇ P
    | Before(point: TimePoint, prop: ArchProposition)
    | After(point: TimePoint, prop: ArchProposition)
    | Counterfactually(prop: ArchProposition)
    | Intentionally(prop: ArchProposition);
```

Six modal operators (`□`, `◇`, `before`, `after`,
`counterfactually`, `intentionally`) compose with five canonical
observer roles. Together they catch a class of defects pure
static typing cannot — premature observation (a request logged
before authentication completes), decision-without-context (a
recorded change without an attributable observer), modal
collision (two incompatible modal qualifications on the same
proposition). Six MTAC anti-patterns (AP-027..032) live at this
layer; see the [Modal-Temporal Architectural Calculus](/docs/architecture-types/mtac)
page.

## 8. Counterfactual reasoning

`verum audit --counterfactual` is a **non-destructive evaluator**
that answers *"what would happen to this project's invariants if
we changed one architectural primitive?"* without modifying any
source, without recompiling, and without disturbing the running
audit. The implementation lives in the
[Counterfactual module](https://github.com/oldman/verum/blob/main/core/architecture/counterfactual.vr)
on the Verum side and a 705-line counterfactual kernel intrinsic
on the Rust side.

Every counterfactual evaluation emits one of four verdicts:

| Verdict | Meaning |
|---------|---------|
| **HoldsBoth** | invariant holds in both base and counterfactual — the invariant is *stable* |
| **HoldsBaseOnly** | holds in base but breaks in counterfactual — the invariant is *fragile* |
| **HoldsVarOnly** | holds in counterfactual but not in base — an *unrealised improvement* |
| **HoldsNeither** | fails in both — *fundamentally unstable*; the project's claim is wrong |

Three motivating use cases the engine answers concretely. *Is
this invariant fragile?* — would relaxing one constraint break
soundness? *What if we dropped a primitive?* — which invariants
currently hold thanks to its existence? *Is the audit
non-vacuous?* — by constructing scenarios designed to violate
each anti-pattern, the engine confirms that "31 of 32 patterns
are `ok`" reflects substance rather than tautology. This is the
audit's *liveness pin*. See the
[Counterfactual Reasoning Engine](/docs/architecture-types/counterfactual)
page.

## 9. Architectural adjunctions

The adjunction analyzer recognises four canonical pairs of
design moves in the project's design graph:

| Left adjoint | Right adjoint | Move |
|--------------|---------------|------|
| **Inline** | **Extract** | fold a function's body into its call site / promote to its own cog |
| **Specialise** | **Generalise** | concrete instance / lift to generic |
| **Decompose** | **Compose** | split a cog into sub-cogs / merge sub-cogs into one |
| **Strengthen** | **Weaken** | tighten a precondition / relax it |

Each instance comes with a **preservation/gain manifest**:
preserved invariants (hold equally on both sides), lifted
obligations (one side carries, the other does not), acquired
obligations (new ones the move introduces), net delta. A "free"
adjunction (zero net delta) is the strongest classification — a
move reversible without changing the project's verdict.

`arch_adjunction.rs` (904 LOC) implements the recogniser. See the
[Architectural Adjunctions](/docs/architecture-types/adjunctions)
page.

## 10. Self-application — ATS-V types itself

Per the *no-foreign-concepts* discipline, ATS-V is itself a
Verum cog. The eight primitives (`Capability`, `Boundary`,
`Composition`, `Lifecycle`, `Foundation`, `Tier`, `Stratum`,
`Shape`) live in the
[Architecture types module](https://github.com/oldman/verum/blob/main/core/architecture/types.vr),
which carries its own `@arch_module(...)` annotation:

```verum
@arch_module(
    foundation: Foundation.ZfcTwoInacc,
    stratum:    MsfsStratum.LFnd,
    lifecycle:  Lifecycle.Theorem("v0.1"),
)
module core.architecture.types;
```

The cog declares itself as a `[T]` Theorem at foundation
ZFC + 2-inacc, stratum LFnd. The compiler verifies these claims
against the body, just as it would for any other annotated cog.
There is no privileged escape hatch.

Self-application is the load-bearing test that ATS-V's primitives
are sufficient: a primitive that ATS-V itself needs but cannot
express in its own surface is a primitive missing from the
canonical set. See the
[Self-Application — ATS-V annotated by ATS-V](/docs/architecture-types/self-application)
page.

## 11. The dual-audience surface

ATS-V serves two audiences with materially different needs.
Developers want terse, ergonomic syntax with single-line
feedback; auditors want exhaustive, machine-readable JSON with
enumerable claims and stable identifiers. A single annotation
surface that meets both needs would be either too verbose for
daily use or too thin for sign-off. ATS-V solves the asymmetry
by rendering *every artefact for both audiences from the same
source.*

**Developer view** — what the engineer reads while editing:

```verum
@arch_module(lifecycle: Lifecycle.Theorem("v3.2"))
module payment.settlement;
```

**Auditor view** — what `verum audit --arch-corpus --format json`
emits, with every default materialised, every metadata field
explicit:

```json
{
  "cog": "payment.settlement",
  "shape": {
    "lifecycle": { "variant": "Theorem", "since": "v3.2",
                   "rank": 6, "cve_glyph": "T" },
    "foundation": "ZfcTwoInacc", "stratum": "LFnd", "at_tier": "Aot",
    "exposes": [], "requires": [], "preserves": [],
    "composes_with": [], "strict": false
  }
}
```

The annotation reads in seconds; the JSON archives for years.
See the [Dual-Audience Surface](/docs/architecture-types/dual-audience)
page.

## 12. The audit protocol — ~45 gates → one verdict

`verum audit` exposes around **45 gates** organised into eight
bands:

- **Kernel-soundness** (10 gates) — `--kernel-rules`,
  `--kernel-recheck`, `--kernel-soundness`, `--kernel-v0-roster`,
  `--kernel-intrinsics`, `--kernel-discharged-axioms`,
  `--differential-kernel`, `--differential-kernel-fuzz`,
  `--reflection-tower`, `--codegen-attestation`.
- **ATS-V** (6 gates) — `--arch-discharges`, `--arch-coverage`,
  `--arch-corpus`, `--counterfactual`, `--adjunctions`,
  `--yoneda`.
- **Framework-axiom + citation** (10 gates) — including
  `--framework-axioms`, `--framework-soundness`,
  `--foundation-profiles`, `--apply-graph`,
  `--bridge-discharge`.
- **Hygiene + coherence** (8 gates) — `--hygiene[-strict]`,
  `--coord[-consistency]`, `--coherent`, `--epsilon`,
  `--proof-honesty`.
- **Cross-format + export** (3 gates) — `--round-trip`,
  `--cross-format`, `--owl2-classify`.
- **Roadmap / coverage** (6 gates) — `--htt-roadmap`,
  `--ar-roadmap`, `--manifest-coverage`, `--mls-coverage`,
  `--verify-ladder`, `--ladder-monotonicity`.
- **Tooling-side** (3 gates) — `--proof-term-library`,
  `--signatures`, `--docker`.
- **Aggregator** (1) — `--bundle`.

Gates are *idempotent* — running the same gate twice on
unchanged source produces byte-identical JSON output (modulo
timestamps). The aggregator is the user-facing UX:

```bash
$ VERUM_STDLIB_ROOT=/path/to/core verum audit --bundle
  Audit bundle — L1+L2+L3+L4 verdict
  ────────────────────────────────────────
    ✓  arch_discharges               passed
    ✓  arch_coverage                 passed
    ✓  arch_corpus                   passed
    ✓  counterfactual                passed
    ✓  adjunctions                   passed
    ✓  apply_graph                   passed
    ✓  bridge_discharge              passed
    ✓  cross_format_roundtrip        passed
    ✓  ladder_monotonicity           passed
    ...
    ✓ L4 load-bearing — every gate produced a clean verdict.
      Bundle: ./target/audit-reports/bundle.json
```

One command, one verdict, all evidence in one place. See
the [Audit Protocol — running the gates](/docs/architecture-types/audit-protocol)
page.

## 13. Why this matters in the era of model-written code

The previous twelve sections describe a discipline. This last
section is why the discipline became necessary.

For roughly forty years, programming-language design optimised
for a specific reader: another human, probably tired, probably
catching up on context. Documentation, naming conventions,
linters, tests, type systems — all assumed the reader is the
same kind of agent as the author. The agent might disagree with
the author, but they share a referential frame.

That assumption is breaking. A growing fraction of production code
is being produced by language models — current systems, with more
capable systems following. The model reads the file, generates a
change, and the human reviews. Sometimes they don't review. Often
they don't have to, and the tempo of work depends on them not
having to.

The shift produces five concrete problems for the architecture
of long-lived systems. ATS-V is the answer Verum gives to each.

### 13.1 The model lacks the project's specific context

A model that has read ten million Rust projects has *statistical
knowledge* of conventions but does not carry *this* project's
context. If the architectural intent lives in a `README.md`, a
slide deck, or a senior engineer's head, the model cannot
read it. The model will guess from training-distribution
priors, which is exactly the wrong move when the project's
discipline diverges from the prior.

ATS-V puts the architectural intent in the same file as the
code, behind the same compiler, surfaced through the same
diagnostic infrastructure. The model reads the
`@arch_module(...)` annotation as it reads the function
signature; the compiler refuses changes that violate the
declared `Shape`. The architecture is no longer something the
model can fail to know about.

### 13.2 Diagrams drift; types do not

Architecture diagrams in markdown (C4, UML, ArchiMate) are
wonderful for communication and structurally useless for
enforcement. The moment the team ships, the diagram and the
running system begin to drift apart. A model trained on the
codebase has no way to learn the *current* architecture from a
*stale* diagram; it learns the surface, not the intent.

The eight ATS-V primitives drift only as fast as the type system
drifts — which, in a sound type system, is not at all. A
`Shape` declared in the Architecture module either type-checks or
it does not. There is no version of the file where the
declarations and the implementation can disagree.

### 13.3 The cost of hidden behaviour is asymmetric

A human who writes a function carries the context in their head:
*this runs inside a tokio runtime, so a spawn here is fine; this
module has an implicit logger, so `log::info!` works*. A model
generating code does not carry *this* project's hidden
conventions. If the language admits an ambient global, a hidden
allocation, a coercion under a rarely-triggered flag, the
model's training distribution will guess wrong, confidently.

ATS-V's three orthogonal axes (capability, property, context)
make every hidden assumption explicit. `using [Database,
Logger]` is boring when a human writes it. It is *load-bearing*
when a model writes it for you, because the alternative is the
model assuming a default that does not match the project. Same
for `@arch_module(requires: [Capability.Network(...)])` — a
model adding a network call to a cog that has not declared the
requirement gets a compile error with stable RFC code
`ATS-V-AP-001`, not a silent runtime breach.

### 13.4 Unstable diagnostics are unusable training targets

A model that learned to fix `error[E0382]: borrow of moved
value` in 2020 would still recognise the error in 2026 because
Rust's diagnostic codes are stable. ATS-V follows the same
discipline: every anti-pattern carries a stable RFC code
(`ATS-V-AP-001` through `ATS-V-AP-032`) that *never changes*,
even when the prose explanation is rewritten. The catalog is
*append-only*: existing patterns are never renumbered or
removed.

The consequence is operational. A model fine-tuned on Verum
codebases can index its training on stable codes; a CI gate
that prints `ATS-V-AP-009 [error] LifecycleRegression` produces
a diagnostic the model can recognise and the human can grep
for in 2031. Diagnostic stability is what makes the discipline
*teachable* to non-human agents.

### 13.5 Audits become a social contract between humans and machines

Before, an open-source library's reputation rested on its
maintainer's judgment. The maintainer was the promise-maker;
the human reader was the promise-checker. In the
model-written-code era, both ends include non-human agents. A
model writes a change, a model (or several models) reviews it,
and a human signs off without re-reading every line.

The honest move is not "trust the AI" or "never trust the AI".
It is **make the evidence machine-checkable**. ATS-V's audit
protocol is that move. `verum audit --bundle` produces a
single L4-load-bearing verdict aggregating ~45 gates into a
machine-readable `bundle.json` with a top-level
`l4_load_bearing: bool`. A consumer takes a dependency and
reads the bundle; the bundle either *is* a green verdict or *is
not*. There is no judgement call to outsource.

The MTAC layer extends this further. *Who* observed a decision
(`Architect` / `Auditor` / `Developer` / `Operator` / `Adversary`)
and *when* (a typed `TimePoint` rather than a git timestamp)
become first-class fields of the audit record. A change made
by an automated agent is distinguishable from a change made by
a human; an architectural decision recorded without an
observer is `AP-028 DecisionWithoutContext`.

### 13.6 What ATS-V is *not*

A short list of claims ATS-V deliberately does *not* make.

- **It does not solve "the AI alignment problem".** ATS-V is a
  type system, not an alignment story. It limits what
  model-written code can silently do by making the
  architectural surface explicit; it does not certify the
  intent of the prompt that produced the code.
- **It does not replace code review.** Reviewers still read
  diffs, judge intent, ask design questions. ATS-V replaces the
  *mechanical* parts of architectural review — the parts that
  ask "does this change exceed its declared capability" or
  "does this composition cycle". The judgement parts remain
  human.
- **It does not eliminate runtime failure.** Capability checks
  are compile-time; the runtime can still encounter network
  partitions, disk-full conditions, OOM, and adversaries. ATS-V
  ensures the runtime failure surface is exactly the surface the
  cog declared, not a surface no human ever wrote down.
- **It does not pick a foundation for you.** A cog declares its
  `Foundation` (ZFC + 2-inacc, HoTT, Cubical, CIC, MLTT, Eff,
  Custom). Foundation drift across compositions is `AP-005`,
  not silently coerced. Verum is foundation-pluralist by
  design — see the [MSFS Coordinate](/docs/verification/msfs-coord)
  page for the mathematical justification.

## 14. Closing

ATS-V promotes eight primitives — Capability, Boundary,
Composition, Lifecycle, Foundation, Tier, Stratum, Shape — into
the type system; layers thirty-two canonical defects on top under
stable RFC codes (`ATS-V-AP-001` … `032`); pins the maturation
status of every artefact to one of seven CVE glyphs; and keeps
capability, property, and context as three orthogonal axes
instead of conflating them. The modal-temporal layer (MTAC), the
counterfactual reasoning engine, the four canonical adjunctions,
and the self-application discipline extend the static surface
into time, observer-roles, scenario reasoning, and refactor
equivalence. Around forty-five audit gates aggregate to a single
bundle verdict. The implementation is concrete: ~9 550 LOC across
the Architecture module of the standard library and the
Architectural kernel surface on the Rust side.

No single piece of this is novel. The combination is — under one
compiler-checked discipline, in a production systems language
whose surface reads naturally to a Rust or Swift programmer, at a
moment when much of the code is written by language models that
need the architecture to be machine-readable, not folkloric.

Whether the bet is right will be settled by practice, not by
essays. The complete reference is the
[Architecture-as-Types documentation](/docs/architecture-types);
the canonical Verum-side declarations live in the
[Architecture module](https://github.com/oldman/verum/tree/main/core/architecture)
of the standard library and the
[Architectural kernel surface](https://github.com/oldman/verum/tree/main/crates/verum_kernel/src)
of the trusted kernel; the runnable verdicts are catalogued on the
[Audit Protocol — running the gates](/docs/architecture-types/audit-protocol)
page. The implementation is open source; counter-examples and
better designs are welcome.

— The Verum team
