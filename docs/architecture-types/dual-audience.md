---
sidebar_position: 14
title: "Dual-audience surface"
description: "Every ATS-V artefact is rendered for two audiences simultaneously: terse developer ergonomics + exhaustive machine-readable auditor surface."
slug: /architecture-types/dual-audience
---

# Dual-audience surface

ATS-V serves two audiences with materially different needs:

- **Developers** — want terse, ergonomic syntax, single-line
  feedback, fast iteration. They are reading and writing code
  hundreds of times a day.
- **Auditors** — want exhaustive, machine-readable JSON,
  enumerable claims with stable identifiers, archival-quality
  reports. They are reviewing the same code at sign-off events
  weeks or months apart.

A single annotation surface that meets both needs would be
either too verbose for daily use or too thin for sign-off. ATS-V
solves the asymmetry by rendering *every artefact for both
audiences from the same source*. This page documents the
discipline.

## 1. Two views of the same Shape

A cog declares its `Shape` once. The compiler renders the Shape
in two views:

### 1.1 Developer view — the source

```verum
@arch_module(
    lifecycle:     Lifecycle.Theorem("v3.2"),
    foundation:    Foundation.ZfcTwoInacc,
    exposes:       [Capability.Network(NetProtocol.Grpc, NetDirection.Outbound)],
    composes_with: ["payment.fraud", "payment.audit"],
    strict:        true,
)
module payment.settlement;
```

The annotation is what the developer reads while editing. It is
≤ 10 lines, every field is named, defaults are implicit. The
LSP shows a one-line summary on hover.

### 1.2 Auditor view — the JSON

```json
{
  "schema_version":  2,
  "verum_version":   "0.x.y",
  "cog":             "payment.settlement",
  "shape": {
    "lifecycle": {
      "variant":     "Theorem",
      "since":       "v3.2",
      "rank":        6,
      "cve_glyph":   "T",
      "tag":         "theorem"
    },
    "foundation":     "ZfcTwoInacc",
    "stratum":        "LFnd",
    "at_tier":        "Aot",
    "exposes": [
      {
        "kind":      "Network",
        "protocol":  "Grpc",
        "direction": "Outbound"
      }
    ],
    "requires":       [],
    "preserves":      [],
    "consumes":       [],
    "composes_with":  ["payment.fraud", "payment.audit"],
    "cve_closure": {
      "constructive":        null,
      "verifiable_strategy": null,
      "executable":          null
    },
    "strict":         true
  }
}
```

The JSON is what the auditor consumes. It is verbose, every
field is explicit, every default is materialised, every value
has its associated metadata (rank, glyph, tag).

## 2. Two views of the same diagnostic

When a check fails, the compiler renders the diagnostic in two
forms.

### 2.1 Developer view — the message

```text
error[ATS-V-AP-001]: capability escalation
  --> src/payment.vr:42:5
   |
42 |     net.tcp.connect("fraud.svc:443")
   |     ^^^^^^^^^^^^^^^ body opens outbound TCP, but cog
   |                     does not expose Network capability.
   |
note: cog declares
        @arch_module(exposes: [Capability.Read(Database("ledger"))])
help: add `Capability.Network(Tcp, Outbound)` to `exposes`,
      or move the network call into a child cog whose Shape
      encapsulates the capability.
```

Compact, span-pointed, with help text. The developer fixes it in
seconds.

### 2.2 Auditor view — the JSON

```json
{
  "diagnostic": {
    "code":     "ATS-V-AP-001",
    "name":     "CapabilityEscalation",
    "severity": "error",
    "phase":    "arch-check",
    "stable":   true,
    "occurrence": {
      "cog":          "payment.settlement",
      "file":         "src/payment.vr",
      "line":         42,
      "column":       5,
      "span_length":  19
    },
    "predicate": {
      "kind":      "capability_escalation",
      "exercised": "Network(Tcp, Outbound)",
      "exposed":   ["Read(Database(\"ledger\"))"]
    },
    "remediation": [
      "add Capability.Network(Tcp, Outbound) to exposes",
      "factor the network call into a child cog"
    ]
  }
}
```

Every field is enumerable. Auditors can filter by code, by cog,
by phase. They can compute deltas across revisions. They can
archive the JSON as a permanent record.

## 3. Two views of the same audit gate

`verum audit --bundle` produces both views simultaneously.

### 3.1 Developer view — the summary

```text
ATS-V audit · 14/14 gates · load-bearing · 12.4s
```

A single line for the PR description.

### 3.2 Auditor view — the bundle

```text
target/audit-reports/
├── arch-discharges.json
├── arch-coverage.json
├── arch-corpus.json
├── counterfactual.json
├── adjunctions.json
├── framework-axioms.json
├── kernel-rules.json
├── kernel-recheck.json
├── kernel-soundness/
│   ├── kernel.thy        # Isabelle export
│   ├── kernel.lean       # Lean export
│   └── kernel.v          # Coq export
├── differential-kernel.json
├── differential-kernel-fuzz.json
├── reflection-tower.json
├── codegen-attestation.json
└── bundle.json           # the aggregate
```

Multi-file output. The bundle.json carries the aggregate
verdict; the per-gate files carry exhaustive detail. Auditors
inspect the bundle once and zoom into specific gates as needed.

## 4. The discipline — one source, two renderings

Three principles make the dual-audience surface work:

1. **One source of truth.** Both views are computed from the
   *same* compiled Shape. There is no parallel "developer
   format" and "auditor format" with possible drift.
2. **Stable codes.** Every diagnostic, every Lifecycle, every
   capability, every anti-pattern carries a stable RFC code or
   variant tag. The codes survive prose rewrites; tooling
   relies on them as permanent identifiers.
3. **Schema-versioned JSON.** Every machine-readable output
   carries a `schema_version` field. Schema changes are
   versioned; older schemas have published adapters.

The result: developers read terse text, auditors read structured
JSON, and both views describe the *same* underlying artefact.

## 5. The renderers

The compiler ships two renderer families:

- **Text renderer** — produces ANSI-coloured developer output,
  LSP hover text, terminal diagnostics.
- **JSON renderer** — produces auditor JSON with full schema.

Both are pure functions over the compiled Shape and the
diagnostic context. There is no shared mutable state. A bug in
the text renderer cannot corrupt the JSON; a bug in the JSON
renderer cannot corrupt the text.

## 6. CI integration patterns

Two recommended CI patterns leveraging the dual surface:

### 6.1 PR description gets the developer view

```yaml
- name: Run ATS-V audit
  run: verum audit --bundle | tee audit-summary.txt

- name: Comment on PR
  uses: peter-evans/commit-comment@v3
  with:
    body-path: audit-summary.txt
```

The PR description gets the one-line summary plus per-gate
verdicts. Reviewers see the verdict at a glance.

### 6.2 Audit chronicle gets the auditor view

```yaml
- name: Archive bundle
  uses: actions/upload-artifact@v4
  with:
    name: bundle-${{ github.sha }}
    path: target/audit-reports/
```

The structured JSON is archived per commit. The audit chronicle
forms a chronological record of the project's verdicts; auditors
diff revisions to see how the project's claims evolved.

## 7. Why not a single format?

A natural design instinct: *"why not a single format with optional
verbosity flags?"* Two reasons:

- **Different consumers.** A `--verbose` flag on the developer
  output would still render text; auditors want JSON. A
  `--format=json` flag on the JSON output would not satisfy
  developers; the JSON is too verbose for inline diagnostics.
- **Different stability guarantees.** The text format is
  optimised for human readability and may be reformatted across
  releases (typography, colours, span-pointer style). The JSON
  format is *schema-locked* — fields cannot be removed or
  renamed without a schema-version bump.

The two formats are intentionally distinct *in their stability
guarantees*. The developer view evolves freely; the auditor view
evolves only with explicit schema versioning.

## 7.5. The CVE-zone boundary

The dual-audience surface mechanises the **transmissible
articulable contour** of every artefact. Every knowledge
artefact has a part that survives transfer between executors
without identity loss (the **CVE-zone**) and a part that arises
only in the work of an individual master and is not
transmissible by instruction (**outside the CVE-zone**); see
[CVE — CVE-zone vs out-of-CVE-zone](./cve/overview.md#cve-zone)
for the canonical distinction.

| | CVE-zone | Outside CVE-zone |
|---|----------|------------------|
| **Substrate** | `AnalyticDecompositional` (default); plus the articulable contour of `HolisticRelational`, `ActionCentric`, `TraditionTransmitting` | The non-articulable surface of those substrates — aesthetic taste, idiosyncratic style, unique decisions in unprecedented situations |
| **What ATS-V audits** | Capability discipline, lifecycle, CVE-closure, declared purpose, declared substrate, declared anchoring | Nothing — these aspects are legitimate but outside ATS-V's audit by construction |
| **Transmissibility** | A second executor can reproduce the artefact from the declared `Shape` and the documented procedure | Reproduction requires individual mastery work; not derivable from the artefact alone |
| **Mature practice's posture** | Knows what is transmissible (CVE-zone) and what is mastery-bound (outside CVE-zone) and does not conflate the registers | — |

A craft cog whose declared lifecycle is `[T]` Theorem must have
its CVE-zone fully closed (the protocol, the measurable markers,
the certification surface). Aspects sitting outside the CVE-zone
(the master's idiosyncratic timing, the unique aesthetic
calibration) are **legitimate** but not subject to ATS-V audit.
The dual-audience surface renders only the CVE-zone — the auditor
view is not deficient when it omits non-articulable mastery; it is
correctly bounded.

Conflating the two registers — claiming `[T]` while the artefact's
identity actually resides outside the CVE-zone — triggers
[`AP-038 ImplicitSubstrate`](./anti-patterns/articulation.md#ap-038)
(if the substrate is omitted) or
[`AP-035 InterpretationInMatureCorpus`](./anti-patterns/articulation.md#ap-035)
(if the artefact is silently `[I]` despite the `[T]` claim).

## 8. Cross-references

- [Audit protocol](./audit-protocol.md) — the gate runner
  producing both views.
- [Anti-pattern overview](./anti-patterns/overview.md) — the
  catalog whose diagnostics are dual-rendered.
- [Self-application](./self-application.md) — ATS-V's
  self-attestation, also dual-rendered.
- [CVE overview — cognitive substrate disclosure](./cve/overview.md#substrate-disclosure)
  — the spec primitive that bounds the CVE-zone.
