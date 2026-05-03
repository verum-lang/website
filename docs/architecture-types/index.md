---
sidebar_position: 1
title: "Architecture-as-Types (ATS-V)"
description: "Verum's Architectural Type System — making architecture itself a typed, compiler-checked artefact. Eight primitives, thirty-two anti-patterns, dual-audience surface."
slug: /architecture-types
---

# Architecture-as-Types (ATS-V)

The **Architectural Type System for Verum (ATS-V)** is the framework
that promotes architectural intent — *who can do what, across which
boundary, under which discipline* — from prose into the type system.
A diagram is a screenshot in time; an ATS-V `Shape` is a
compiler-checked obligation that travels with the code.

This page is the conceptual entry point. It introduces the eight
primitives, their compositional discipline, the canonical
anti-pattern catalog, and the dual-audience surface (developer-facing
ergonomics + auditor-facing rigor) that ATS-V exposes.

## 1. The drift problem

Every long-lived system carries two architectural artefacts:

- A **map** — diagrams (C4 / UML / ArchiMate), prose READMEs,
  whiteboard pictures.
- A **territory** — the running code: function signatures, module
  boundaries, runtime capabilities, deployed binaries.

The two drift apart the moment the team ships. Maps lag behind
refactors; refactors break invariants the maps codified; the
codebase becomes the only authoritative source, but the codebase
does not narrate *why* it is shaped the way it is. Reviewers must
reconstruct intent from grep, blame, and tribal memory.

ATS-V eliminates the drift by **collapsing the map into the
territory**. Architectural intent is expressed in the same surface
syntax as ordinary types — variants, records, protocols, attributes —
and is checked by the same compiler that checks `Int + Int : Int`.
There is exactly one source of truth, and it is the code.

## 2. The eight architectural primitives

Every ATS-V annotation is built from eight primitives, each
expressed via existing Verum syntax. None of them introduce a new
grammar production: variants, records, attributes, and protocols
already in the language carry the entire load.

| Primitive | Carrier | Question it answers |
|-----------|---------|---------------------|
| **[Capability](./primitives/capability.md)** | `type Capability is …` (variant) | What may this cog *do*? |
| **[Boundary](./primitives/boundary.md)** | `type Boundary is { … }` (record) | What crosses the cog's edge, and under what discipline? |
| **[Composition](./primitives/composition.md)** | `composes_with: List<Text>` | Which other cogs may legally compose with this one? |
| **[Lifecycle](./primitives/lifecycle.md)** | `type Lifecycle is …` (variant) | At which stage of maturation is this artefact? |
| **[Foundation](./primitives/foundation.md)** | `type Foundation is …` (variant) | Which meta-theoretic profile does the proof corpus inhabit? |
| **[Tier](./primitives/tier.md)** | `type Tier is …` (variant) | Where does this code execute? |
| **[Stratum](./primitives/stratum.md)** | `type MsfsStratum is …` (variant) | Which level of the Modular-Stratified Foundation moduli does it occupy? |
| **[Shape](./primitives/shape.md)** | `type Shape is { … }` (record) | The aggregate carrier — a `Shape` *is* a typed architectural fingerprint. |

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

The compiler reads this as an obligation. Every claim — *I expose this
capability, I require that one, I preserve these boundary invariants,
I run at this tier, my proof corpus rests on this foundation* — is
checked against the actual code body and against the surrounding
graph of cogs.

## 3. Architectural type-checking — what the compiler does

A regular type checker asks: *does the value flowing into this slot
have the right type?* The architectural type checker asks the same
question one level up: *does the cog flowing into this composition
slot have the right Shape?*

The check is structural, not nominal. If cog A's `Shape.exposes`
contains `Read(ResourceTag.Database("ledger"))` and cog B's
`Shape.requires` lists `Read(ResourceTag.Database("ledger"))`, then
B may import from A. If A only exposes `Read(ResourceTag.Database
("audit"))`, the import is rejected at compile time — *not* at the
type-of-values level (B may still legally call A's functions if the
value types match) but at the architectural-shape level. The
diagnostic carries a stable RFC code (`ATS-V-AP-001`,
`ATS-V-AP-005`, …) and points at both cogs by name.

Architectural mismatches are surfaced under the same diagnostic
infrastructure as ordinary type errors — same span pointers, same
LSP integration, same `verum check` workflow. Architecture is no
longer a separate review pass; it is part of the compiler.

## 4. The thirty-two anti-pattern catalog

The check above is the foundation; on top of it ATS-V layers a
canonical catalog of architectural defects, each registered as a
refinement-level predicate. As of the current revision the catalog
has thirty-two entries split into four bands:

- **Classical (AP-001 .. AP-009)** — capability escalation,
  boundary violation, dependency cycle, tier mixing, foundation
  drift, register mixing, lifecycle regression, composition
  associativity break, identity violation. See
  [classical anti-patterns](./anti-patterns/classical.md).

- **Articulation hygiene (AP-010 .. AP-018)** — circular
  self-reference, ungrounded assumption, over-quantified scope,
  retracted-citation use, undisclosed dependency, drift between
  declaration and body, hypothesis without maturation plan,
  interpretation in mature corpus, definition shadowing. See
  [articulation anti-patterns](./anti-patterns/articulation.md).

- **Coherence (AP-019 .. AP-026)** — α/ε bidirectional coherence
  failure, MSFS-coordinate divergence, framework-axiom collision,
  proof-export round-trip break, capability-laundering, foundation
  forgery, transitive lifecycle regression, reflection-tower
  exhaustion. See [coherence anti-patterns](./anti-patterns/coherence.md).

- **Modal-temporal (AP-027 .. AP-032)** — premature observation,
  decision-without-context, observer impersonation, modal
  collision, temporal cycle, counterfactual divergence. See
  [modal-temporal anti-patterns](./anti-patterns/mtac.md) and the
  full [MTAC primitive set](../verification/msfs-coord.md).

Each anti-pattern publishes:

1. **A stable RFC code** (`ATS-V-AP-NNN`) — the code never changes
   even when the prose explanation is rewritten.
2. **A refinement predicate** — the formal condition under which the
   pattern triggers.
3. **A canonical example** — the smallest synthetic Shape that
   reproduces the defect, used as a regression pin.
4. **A remediation recipe** — the concrete code transformation
   that resolves the defect.

The full catalog is enumerable via `verum audit --arch-discharges`
and is therefore part of the corpus's external interface, not a
private compiler concern.

## 5. The CVE alignment — Constructive / Verifiable / Executable

ATS-V's `Lifecycle` primitive carries the **CVE seven-symbol
canonical taxonomy**:

| Glyph | Variant | Constructive | Verifiable | Executable |
|-------|---------|--------------|------------|------------|
| `[Т]` | `Theorem(since)` | yes | yes | yes |
| `[О]` | `Definition` | yes | trivial | yes |
| `[С]` | `Conditional(conds)` | conditional | conditional | conditional |
| `[П]` | `Postulate(citation)` | yes | external | yes |
| `[Г]` | `Hypothesis(confidence)` | partial | absent | absent |
| `[И]` | `Interpretation(reason)` | absent | absent | absent |
| `[✗]` | `Retracted(reason, repl)` | n/a (withdrawn) | — | — |

CVE is the *universal correctness frame* Verum applies to every
proposition, not just to architecture. A function body is CVE-typed:
*does it carry a constructor (К), does it admit a check (В), does it
reduce to executable code (И)?* A theorem statement is CVE-typed.
An architectural Shape is CVE-typed. The seven symbols are the
cross-cutting taxonomy that lets the auditor enumerate, by glyph,
exactly which slots are mature ([Т]/[О]) and which still owe a
discharge ([Г]/[И]).

The full CVE framework — three axes, seven configurations, seven
layers L0..L6 — is documented in:

- [CVE — three axes](./cve/three-axes.md) — Constructive, Verifiable,
  Executable as orthogonal dimensions.
- [CVE — seven configurations](./cve/seven-configurations.md) — the
  truth-table over the three axes and what each cell means.
- [CVE — seven symbols](./cve/seven-symbols.md) — the canonical
  glyph taxonomy used in Lifecycle, audit reports, and the
  dual-audience surface.
- [CVE — seven layers](./cve/seven-layers.md) — L0 (object) up to
  L6 (anti-philosophical), and why ATS-V's internal sub-layers
  L0..L7 inhabit CVE-L4 only.
- [Articulation hygiene](./cve/articulation-hygiene.md) — the
  CVE-L6 register-prohibition discipline.

## 6. Three orthogonal axes — Capability, Property, Context

Verum carries three independent dimensions that are routinely
confused. ATS-V makes the orthogonality explicit and checkable.

| Axis | Carrier | Phase | Cost | What it tracks |
|------|---------|-------|------|----------------|
| **Capability** | `@arch_module(exposes: …)`, `Capability` enum | compile-time architectural | 0 ns | What the cog is *permitted* to do |
| **Property** | `PropertySet` (Pure / IO / Async / Fallible / Mutates / …) | compile-time on function types | 0 ns | What the function's *body* actually does |
| **Context** | `using [Database, Logger, Clock]` | runtime DI | ~5–30 ns lookup | Which providers the function needs *now* |

The three compose freely. A function may simultaneously:

- Be capability-typed `[Capability.Network(Tcp, Outbound)]` (it
  *may* open TCP connections architecturally).
- Carry property `{Async, Fallible, IO}` (its body actually
  performs async I/O that may fail).
- Require context `using [Logger, MetricsSink]` (the runtime must
  inject these providers).

A capability *without* the corresponding property is an
[`AP-001 CapabilityEscalation`](./anti-patterns/classical.md#ap-001).
A property *without* the corresponding context is an under-specified
function and the type checker rejects the call site. A context
*without* the corresponding capability is an
[`AP-005 FoundationDrift`](./anti-patterns/classical.md#ap-005)
candidate at the architectural boundary.

For the full discussion see [Three orthogonal axes](./orthogonality.md).

## 7. The dual-audience surface

ATS-V has two simultaneous audiences, and every artefact it produces
is rendered for both:

**Developer surface** — terse, ergonomic, optional.

```verum
@arch_module(lifecycle: Lifecycle.Theorem("v1.0"))
module my_app.checkout;
```

The annotation reads in seconds. The compiler emits zero diagnostics
when the body matches; the developer is not asked to repeat any
information already inferable from imports and exports.

**Auditor surface** — exhaustive, machine-readable, mandatory.

```bash
$ verum audit --arch-discharges     # 32 anti-patterns × all annotated cogs
$ verum audit --counterfactual      # what changes if we drop a primitive?
$ verum audit --adjunctions         # Inline ⊣ Extract / Specialise ⊣ Generalise / …
$ verum audit --differential-kernel # two independent kernels agree
$ verum audit --reflection-tower    # ordinal-indexed meta-soundness
$ verum audit --bundle              # all gates load-bearing as a single L4 verdict
```

The auditor sees stable RFC codes, citations, transitive
proof-graph dependencies, framework-axiom inventories — none of
which the developer had to manually maintain. The same source
produces both views.

The detailed layout is in [Dual-audience surface](./dual-audience.md);
the audit gates are catalogued in [Audit protocol](./audit-protocol.md).

## 8. Beyond the static checks — modal & counterfactual reasoning

ATS-V is not only a static-shape checker. It carries two reasoning
engines that operate over the architectural graph:

- **[Modal-Temporal Architectural Calculus (MTAC)](./mtac.md)** —
  primitives for talking about *when* an architectural decision
  was made, *who* observed it, and *under which modality* it holds.
  Six modal operators (□ / ◇ / before / after / counterfactually /
  intentionally) compose with five canonical observer roles
  (Architect, Auditor, Developer, Operator, Adversary) to express
  obligations like "this capability is available *only* during
  the bootstrap phase, *only* to the Operator role".

- **[Counterfactual reasoning engine](./counterfactual.md)** — a
  non-destructive evaluator that answers *what if?* questions about
  the architectural graph. Drop a primitive, change a Foundation,
  promote a `[Г]` to `[Т]` — the engine reports which invariants
  hold under both scenarios (`HoldsBoth` — stable), only the base
  (`HoldsBaseOnly` — regression), only the variant (`HoldsVarOnly`
  — improvement), or neither (`HoldsNeither` — fundamentally
  unstable). A counterfactual report is a first-class artefact; it
  carries a schema-versioned JSON form and is suitable for
  long-term storage in audit chronicles.

- **[Adjunction analyzer](./adjunctions.md)** — recognises four
  canonical adjunctions in the design graph (Inline ⊣ Extract,
  Specialise ⊣ Generalise, Decompose ⊣ Compose, Strengthen ⊣
  Weaken). Each instance comes with a preservation/gain manifest
  describing which invariants are conserved across the move and
  which obligations are lifted.

## 9. Self-application — ATS-V types itself

Per the *no-foreign-concepts* discipline, ATS-V itself is a Verum
cog: `core.architecture.types` declares its own `@arch_module(...)`
annotation. The type definitions for `Capability`, `Boundary`,
`Lifecycle`, `Shape`, &c live in `.vr` files that the very same
type checker validates. There is no privileged escape hatch. If the
ATS-V type system rejects a Shape, that includes Shapes belonging
to its own implementation.

This is more than aesthetics. Self-application is the *test* that
ATS-V's primitives are sufficient. A primitive that ATS-V itself
needs but cannot express in its own surface is, by construction, a
primitive that does not belong in the canonical set.

For the formal self-attestation see
[Self-application](./self-application.md).

## 10. What this section contains

This category fans out from this overview into the following
substantial documents. Each is self-contained — you can read any
one of them as a starting point and follow internal cross-references
back to the others.

```text
architecture-types/
├── index.md                         (this page)
│
├── primitives/
│   ├── overview.md                  · the eight primitives summarised
│   ├── capability.md                · first-class possibility
│   ├── boundary.md                  · cross-cog typed traffic discipline
│   ├── composition.md               · cog-composition algebra
│   ├── lifecycle.md                 · CVE 7-symbol taxonomy
│   ├── foundation.md                · meta-theoretic profile
│   ├── tier.md                      · execution placement
│   ├── stratum.md                   · MSFS moduli stratum
│   └── shape.md                     · aggregate carrier
│
├── cve/
│   ├── overview.md                  · the universal correctness frame
│   ├── three-axes.md                · К / В / И dimensions
│   ├── seven-configurations.md      · truth-table semantics
│   ├── seven-symbols.md             · canonical glyph taxonomy
│   ├── seven-layers.md              · L0 .. L6 stratification
│   └── articulation-hygiene.md      · CVE-L6 self-application discipline
│
├── anti-patterns/
│   ├── overview.md                  · the catalog at a glance
│   ├── classical.md                 · AP-001 .. AP-009
│   ├── articulation.md              · AP-010 .. AP-018
│   ├── coherence.md                 · AP-019 .. AP-026
│   └── mtac.md                      · AP-027 .. AP-032
│
├── orthogonality.md                 · Capability / Property / Context — three axes
├── mtac.md                          · modal-temporal architectural calculus
├── counterfactual.md                · counterfactual reasoning engine
├── adjunctions.md                   · canonical architectural adjunctions
├── audit-protocol.md                · the corpus-audit workflow
├── dual-audience.md                 · developer surface vs auditor surface
└── self-application.md              · ATS-V annotated by ATS-V
```

A reader new to architectural typing should follow the path
**[primitives/overview](./primitives/overview.md) →
[lifecycle](./primitives/lifecycle.md) →
[anti-patterns/overview](./anti-patterns/overview.md) →
[orthogonality](./orthogonality.md) → [audit-protocol](./audit-protocol.md)**.
A reader coming from a verification-engineering background may
prefer **[CVE/overview](./cve/overview.md) →
[primitives/foundation](./primitives/foundation.md) →
[mtac](./mtac.md) → [counterfactual](./counterfactual.md)**.

## 11. Where ATS-V fits in the wider Verum picture

ATS-V is one of three intersecting type-system dimensions Verum
carries:

- The **value type system** — Hindley-Milner with refinements,
  dependent types, linearity, row polymorphism. Documented under
  [Language → Type system](/docs/category/language-types).
- The **verification ladder** — nine semantic strategies from
  `runtime` up to `certified`, with per-strategy proof-obligation
  generators. Documented under [Verification](/docs/category/verification).
- The **architectural type system** — what *this* category covers.

The three dimensions share the same compiler, the same diagnostic
infrastructure, and the same trusted boundary. A bug in the
verification machinery cannot make ATS-V unsound; a bug in the
architectural checker cannot inject false theorems into the proof
corpus. The orthogonality is structural, not just stylistic.

For the high-level vision tying all three together see
[Philosophy → Principles](/docs/foundations/principles).
