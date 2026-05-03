---
sidebar_position: 9
title: "Shape — aggregate carrier"
description: "The Shape record: the aggregate of every architectural primitive a cog declares. Reading and writing shapes via @arch_module."
slug: /architecture-types/primitives/shape
---

# Shape — aggregate carrier

A **Shape** in ATS-V is the aggregate carrier — the record that
holds *every* architectural primitive a cog declares, packaged
as a single typed value. The Shape is what the architectural
type checker reads, what the audit gates consume, and what the
project's composition algebra reasons about.

If you read only one ATS-V deep-dive, this is the one to round
out the others — it ties every primitive together.

## 1. The Shape record

```verum
public type Shape is {
    exposes:        List<Capability>,
    requires:       List<Capability>,
    preserves:      List<BoundaryInvariant>,
    consumes:       List<Text>,
    at_tier:        Tier,
    foundation:     Foundation,
    stratum:        MsfsStratum,
    cve_closure:    CveClosure,
    lifecycle:      Lifecycle,
    composes_with:  List<Text>,
    strict:         Bool,
};
```

Eleven fields — seven of the eight ATS-V primitives plus
`consumes`, `cve_closure`, and `strict`.

| Field | Type | What it carries |
|-------|------|-----------------|
| `exposes` | `List<Capability>` | What the cog *may* do |
| `requires` | `List<Capability>` | What the cog *needs* from the runtime context |
| `preserves` | `List<BoundaryInvariant>` | The Boundary's invariants the cog honours |
| `consumes` | `List<Text>` | Renewable / one-time runtime resources |
| `at_tier` | `Tier` | Execution placement |
| `foundation` | `Foundation` | Meta-theoretic profile |
| `stratum` | `MsfsStratum` | MSFS moduli stratum |
| `cve_closure` | `CveClosure` | К / В / И triple summary |
| `lifecycle` | `Lifecycle` | CVE 7-symbol status |
| `composes_with` | `List<Text>` | Composition allowlist |
| `strict` | `Bool` | Whether to apply strict-mode anti-patterns |

The eighth ATS-V primitive — *Boundary* — is not a single Shape
field; it is *synthesised* from `preserves` + the cog's public
function signatures + the project-wide wire encoding + the
`physical_layer` defaulted from the deployment target.

## 2. The CveClosure triple

`Shape.cve_closure` summarises the cog's CVE-axis posture as a
record:

```verum
public type CveClosure is {
    constructive:        Maybe<Text>,
    verifiable_strategy: Maybe<VerifyStrategy>,
    executable:          Maybe<Text>,
};
```

Three fields, each `Maybe`-typed:

- **`constructive`** — `Some(description)` if the cog ships a
  constructor, with a free-form description; `None` if the cog
  is descriptive only.
- **`verifiable_strategy`** — `Some(strategy)` if the cog's
  content admits a verification strategy from the
  [verification ladder](../../verification/gradual-verification.md);
  `None` otherwise.
- **`executable`** — `Some(extraction_command)` if the cog's
  content extracts; `None` if the cog is paper-only.

The CveClosure is *redundant* with the Lifecycle (which already
encodes the К/В/И state) but provides finer-grained
information for audit reports. The two must be consistent; a
mismatch triggers
[`AP-015 DeclarationBodyDrift`](../anti-patterns/articulation.md#ap-015).

## 3. The strict flag

`Shape.strict: Bool` controls how aggressive the architectural
type checker is. Default: `false`.

In `strict: true` mode:

- Lifecycle is mandatory. A cog without `lifecycle: ...` is
  rejected.
- `Lifecycle.Interpretation` is forbidden
  ([`AP-017`](../anti-patterns/articulation.md#ap-017)).
- All warnings are promoted to errors.
- Capability-inference hints are upgraded to required
  declarations.

`strict: true` is the recommended setting for production cogs.
Mature codebases enable strict mode for every annotated cog;
the discipline is incremental — turn on strict mode one cog at a
time as it matures.

## 4. The `@arch_module(...)` attribute — full surface

```verum
@arch_module(
    foundation:    Foundation.ZfcTwoInacc,
    stratum:       MsfsStratum.LFnd,
    lifecycle:     Lifecycle.Theorem("v3.2"),
    at_tier:       Tier.Aot,
    exposes:       [
        Capability.Read(ResourceTag.Database("ledger")),
        Capability.Write(ResourceTag.Database("settlement")),
        Capability.Network(NetProtocol.Grpc, NetDirection.Outbound),
    ],
    requires:      [
        Capability.Read(ResourceTag.Logger),
        Capability.Read(ResourceTag.Clock),
    ],
    preserves:     [
        BoundaryInvariant.AllOrNothing,
        BoundaryInvariant.AuthenticatedFirst,
        BoundaryInvariant.BackpressureHonoured,
    ],
    consumes:      ["randomness/16 bytes per call"],
    composes_with: ["payment.fraud", "payment.audit"],
    cve_closure:   CveClosure {
        constructive:        Some("explicit_settlement_constructor"),
        verifiable_strategy: Some(VerifyStrategy.Certified),
        executable:          Some("verum extract --target=rust"),
    },
    strict:        true,
)
module payment.settlement;
```

Every field optional. Defaults are sensible:

| Field | Default |
|-------|---------|
| `foundation` | `Foundation.ZfcTwoInacc` |
| `stratum` | `MsfsStratum.LFnd` |
| `lifecycle` | `Lifecycle.Plan("unspecified")` (in non-strict) |
| `at_tier` | `Tier.Aot` |
| `exposes` | `[]` |
| `requires` | `[]` |
| `preserves` | `[]` |
| `consumes` | `[]` |
| `composes_with` | (permissive default — imports allowed) |
| `cve_closure` | all `None` |
| `strict` | `false` |

A cog with all-default Shape carries no architectural information
beyond its existence. The compiler does not reject it, but the
audit chronicle marks it as `unannotated` and
`verum audit --arch-coverage` reports it as a coverage gap.

## 5. How the Shape is checked

The architectural type checker verifies the Shape against the
cog body in five phases:

1. **Field validation.** Each field's type is checked
   independently. Invalid values (`Foundation.UnknownProfile(...)`
   without a citation) are rejected.
2. **Body-against-Shape.** The cog body is walked; every
   capability the body exercises is matched against `exposes`.
   Under-declaration triggers `AP-001`. Over-declaration is
   permitted.
3. **Cross-cog graph.** The composes_with edges are walked
   project-wide. Cycles trigger `AP-003`. Lifecycle ordering
   triggers `AP-009` / `AP-026`. Foundation compatibility
   triggers `AP-005`.
4. **CVE closure consistency.** The Lifecycle and CveClosure
   are cross-checked for consistency. Mismatches trigger
   `AP-015`.
5. **Strictness checks.** If `strict: true`, the rules of §3
   are applied.

Each phase emits its own diagnostics with stable RFC codes.

## 6. Reading a project's Shapes

`verum audit --arch-corpus` walks every annotated cog and emits
a structured inventory:

```text
$ verum audit --arch-corpus

corpus: 267 annotated cogs

  by lifecycle:
    Theorem        : 89
    Definition     : 121
    Conditional    : 31
    Postulate      : 17
    Plan           : 4
    Hypothesis     : 4
    Interpretation : 0
    Retracted      : 1
    Obsolete       : 0

  by tier:
    Aot       : 213
    Interp    : 38
    Gpu       : 12
    TierCheck : 4

  by foundation:
    ZfcTwoInacc       : 256
    Hott              : 8
    Cubical           : 1
    CustomFoundation  : 2

  by stratum:
    LFnd     : 256
    LCls     : 8
    LClsTop  : 1

  strict mode: 121 cogs (45%)
  composes_with cycles: 0

  audit duration: 1.4s
```

The inventory is suitable for archival. A revision's `arch-corpus.json`
forms part of the audit chronicle.

## 7. Programmatic access

The `verum_kernel::arch::Shape` type exposes the following
accessors used by the audit pipeline:

- `Shape::lifecycle.cve_glyph()` — canonical CVE glyph as `&str`.
- `Shape::lifecycle.tag()` — single-token Lifecycle tag.
- `Shape::lifecycle.rank()` — integer rank.
- `Shape::lifecycle.is_mature_corpus_forbidden()` — true iff the
  Lifecycle is forbidden in mature corpora (`Interpretation`).

Tooling that consumes audit reports — IDEs, code-review bots —
should use these accessors rather than re-deriving the values.

## 8. Shape erasure

`Shape` is *compile-time only*. After ATS-V phase completes, the
compiler erases the Shape and emits no runtime metadata. The
architectural information is *not* present in production
binaries.

Two exceptions:

1. **`@embed_shape(...)`** — opt-in attribute that embeds the
   Shape's serialised form as a constant in the binary, for
   runtime introspection (rare, used for self-describing
   services).
2. **Capability handoffs** — capabilities that flow across
   network boundaries are serialised as part of the wire format;
   the runtime check on the receiving side enforces the
   capability's invariant. This is *not* the Shape itself but a
   Capability value.

The default is full erasure. Production binaries are no larger,
no slower, and no more memory-hungry than they would be without
ATS-V annotations.

## 9. Cross-references

- [Capability](./capability.md) · [Boundary](./boundary.md) ·
  [Composition](./composition.md) · [Lifecycle](./lifecycle.md) ·
  [Foundation](./foundation.md) · [Tier](./tier.md) ·
  [Stratum](./stratum.md) — the seven typed primitives Shape
  aggregates.
- [CVE overview](../cve/overview.md) — the CveClosure triple's
  underlying frame.
- [Anti-pattern overview](../anti-patterns/overview.md) — the 32
  patterns that consume Shapes.
- [Audit protocol](../audit-protocol.md) — the gate runner.
- [Three orthogonal axes](../orthogonality.md) — capability vs
  property vs context.
