---
sidebar_position: 13
title: "Audit protocol — running the gates"
description: "How to run, interpret, and archive the architectural audit gates. The bundle aggregator, per-gate semantics, and the dual verdict surface."
slug: /architecture-types/audit-protocol
---

# Audit protocol — running the gates

ATS-V's compile-time machinery emits diagnostics; the **audit
protocol** is the runtime workflow that converts those diagnostics
into archival reports suitable for sign-off. The protocol revolves
around a single CLI surface (`verum audit ...`) with a small set of
gates that compose into a top-level **bundle aggregator**.

This page documents:

1. The catalog of audit gates and what each one verifies.
2. The bundle aggregator and the scope of its evidence.
3. How to read the JSON outputs, archive them, and integrate them
   into CI.
4. The dual verdict surface (developer-facing summary + auditor-
   facing detail).

## 0. Termination through declared Purpose {#purpose-termination}

A naïve audit has no built-in termination criterion: every
inspection might reveal a refinement, and the protocol drifts into
infinite polishing. Per
[CVE — audit termination via declared Purpose](./cve/overview.md#purpose-disclosure),
the audit closes relative to the **declared purpose** of each
artefact: the role for which it is built, with explicit thresholds
on the K/V/E axes.

The Verum-side `Shape.declarations.purpose: Maybe<Purpose>` carries
this declaration:

```verum
@arch_module(
    lifecycle: Lifecycle.Theorem("v1.0"),
    declarations: ShapeDeclarations {
        purpose: Some(Purpose {
            role: "payment.checkout fan-out router",
            k_min: CveThresholdK.FullWitness,
            v_min: CveThresholdV.TypecheckPlusTests,
            e_min: CveThresholdE.StructurallyReady,
        }),
        substrate: Some(CognitiveSubstrate.AnalyticDecompositional),
        anchoring: Some(FormalAnchoring.CurryHowardLawvere),
        e_sense: Some(ExecutabilitySense.StructuralReadiness),
    },
)
module my_app.payment.checkout;
```

The audit is **complete** when every artefact's configuration meets
its declared thresholds. Strict-mode invocation against a Shape
with no declared `Purpose` is the canonical
[`AP-037 BoundlessAudit`](anti-patterns/articulation.md#ap-037)
register collision: the audit has no termination criterion and
degenerates into perennial critique.

**Four functions of every audit round** (per
[CVE — audit termination via declared Purpose](./cve/overview.md#purpose-disclosure)):

1. **Differentiating** — determines on which axis the artefact is
   closed and on which it is not.
2. **Goal-directing** — compares observed configuration against
   declared thresholds.
3. **Translating** — converts observed defects into one of the
   three actions: replenish (Action A), downgrade (Action B),
   delete (Action C).
4. **Terminating** — issues "audit complete" or "another round
   needed" verdict.

The fourth function is what distinguishes audit from perennial
critique. Without an explicit terminating function, the first
three run idle.

## 1. The catalog of audit gates — `verum audit` {#1-the-catalog-of-audit-gates}

`verum audit` exposes the gates as flags. Each flag runs exactly
one gate; combinations are explicit. As of the current revision
the catalog has **~45 gates** organised into eight bands:

### 1.1 Kernel-soundness band

| Flag | Verifies | Output |
|------|----------|--------|
| `--kernel-rules` | The trusted-base inference rule list (one row per rule with citation) | `kernel-rules.json` |
| `--kernel-recheck` | Re-checks every theorem in the project against the trusted base | `kernel-recheck.json` |
| `--kernel-soundness` | Per-rule discharge inventory + parallel Coq / Lean / Isabelle export | `kernel-soundness/` (multi-file) |
| `--kernel-v0-roster` | The kernel_v0 Verum-self-hosted manifest vs filesystem | `kernel-v0-roster.json` |
| `--kernel-intrinsics` | Kernel intrinsic registry — every `kernel_*` dispatch entry | `kernel-intrinsics.json` |
| `--kernel-discharged-axioms` | Intrinsic evidence inventory; structural status and zero proof discharges | `kernel-discharged-axioms.json` |
| `--differential-kernel` | Two-kernel agreement (trusted base vs NbE) | `differential-kernel.json` |
| `--differential-kernel-fuzz` | Mutation property fuzzer over the kernel registry | `differential-kernel-fuzz.json` |
| `--reflection-tower` | Declared footprints and finite reflection diagnostics, without theorem replay | `reflection-tower.json` |
| `--codegen-attestation` | Per-pass codegen kernel-discharge status (6 codegen passes) | `codegen-attestation.json` |

### 1.2 ATS-V (architectural-types) band

| Flag | Verifies | Output |
|------|----------|--------|
| `--arch-discharges` | The 40-pattern anti-pattern catalog | `arch-discharges.json` |
| `--arch-coverage` | Annotation density + missing-Shape report | `arch-coverage.json` |
| `--arch-corpus` | Per-Lifecycle inventory of annotated cogs | `arch-corpus.json` |
| `--counterfactual` | Non-destructive scenario battery over Shapes | `counterfactual.json` |
| `--adjunctions` | Architectural adjunction detection (4 canonical pairs) | `adjunctions.json` |
| `--yoneda` | Yoneda-equivalence checker per spec §20.7 | `yoneda.json` |

### 1.3 Framework-axiom + citation band

| Flag | Verifies | Output |
|------|----------|--------|
| `--framework-axioms` | Citation roster — every `@framework(name, "...")` marker | `framework-axioms.json` |
| `--framework-conflicts` | Detect citation pairs whose proofs are mutually inconsistent | `framework-conflicts.json` |
| `--framework-soundness` | Corpus-side citation metadata classifier; references do not certify proofs | `framework-soundness.json` |
| `--foundation-profiles` | Foundation-by-cog inventory (ZFC / HoTT / Cubical / Cic / MLTT / Eff / Custom) | `foundation-profiles.json` |
| `--accessibility` | `@accessibility(λ)` Diakrisis Axi-4 marker enumeration | `accessibility.json` |
| `--soundness-iou` | Outstanding "admitted" lemmas + IOU manifest | `soundness-iou.json` |
| `--dependent-theorems <axiom>` | Apply-graph walker for downstream theorem impact | `dependent-theorems-<axiom>.json` |
| `--apply-graph` | Dependency resolution, separately reported unverified theorem obligations | `apply-graph.json` |
| `--bridge-discharge` | Diakrisis-bridge `@effect(...)` marker discharge | `bridge-discharge.json` |
| `--bridge-admits` | Bridge-marker admits + their citation IOUs | `bridge-admits.json` |

### 1.4 Hygiene + coherence band

| Flag | Verifies | Output |
|------|----------|--------|
| `--hygiene` | Articulation-hygiene check: every self-X factorises as `(Φ, κ, t)` | `hygiene.json` |
| `--hygiene-strict` | Strict-mode hygiene; warnings promoted to errors | `hygiene-strict.json` |
| `--coord` | MSFS coord enumeration per cog (Foundation × Stratum) | `coord.json` |
| `--coord-consistency` | Cross-cog MSFS-coord consistency (M4.B; supremum-of-cited-coords gate) | `coord-consistency.json` |
| `--no-coord` | Cogs missing MSFS-coord declarations | `no-coord.json` |
| `--coherent` | Operational coherence (M4.E): α/ε bidirectional certificate verdicts | `coherent.json` |
| `--epsilon` | ε-side enactment audit (Diakrisis 108.T duality) | `epsilon.json` |
| `--proof-honesty` | Syntactic proof-body classification; no proof replay | `proof-honesty.json` |

### 1.5 Cross-format + export band

| Flag | Verifies | Output |
|------|----------|--------|
| `--round-trip` | Lean / Coq / Dedukti / Metamath / Isabelle proof-export round-trip | `round-trip.json` |
| `--cross-format` | Cross-format coverage matrix (which proofs export to which prover) | `cross-format.json` |
| `--owl2-classify` | OWL 2 FS ontology classification graph for the corpus | `owl2-classify.json` |

### 1.6 Roadmap / coverage band

| Flag | Verifies | Output |
|------|----------|--------|
| `--htt-roadmap` | Lurie HTT mechanisation roadmap status | `htt-roadmap.json` |
| `--ar-roadmap` | Arnold-Stability mechanisation roadmap status | `ar-roadmap.json` |
| `--manifest-coverage` | Manifest-vs-filesystem coverage per kernel-component manifest | `manifest-coverage.json` |
| `--mls-coverage` | MSFS-corpus coverage classification | `mls-coverage.json` |
| `--verify-ladder` | Per-cog verification-strategy ladder enumeration | `verify-ladder.json` |
| `--ladder-monotonicity` | The ν-ordinal monotonicity check on the verify ladder | `ladder-monotonicity.json` |

### 1.7 Tooling-side band

| Flag | Verifies | Output |
|------|----------|--------|
| `--proof-term-library` | Inventory of canonical proof-term examples | `proof-term-library.json` |
| `--signatures` | Cross-format-roundtrip signatures audit | `signatures.json` |
| `--docker` | Container-image reproducibility check | `docker.json` |

### 1.8 Aggregator

| Flag | Verifies | Output |
|------|----------|--------|
| `--bundle` | Summary of the configured audits, with each gate's scope and obligations retained | `bundle.json` |

Gates are *idempotent* — running the same gate twice on
unchanged source produces byte-identical JSON output (modulo
timestamps).

## 2. The bundle aggregator

`verum audit --bundle` orchestrates configured audit gates. Read the emitted
report to determine which gates and artifacts were actually checked. A
summary is not an implicit replay of every theorem in a repository.

The meaning of success is specific to each gate. Dependency resolution,
metadata consistency, finite diagnostic samples, and certificate replay
answer different questions. A positive result in one does not discharge an
unverified obligation in another. `VerificationVerdict::StructuralOnly`
keeps that distinction during verdict aggregation.

For a proof-admission workflow, archive the exact source statement, its
explicit assumptions, the elaboration receipt and the native certificate
result. A green architectural audit or successful external compilation of
a generated scaffold cannot replace those artifacts.

## 3. Gate-by-gate semantics

### 3.1 `--arch-discharges` — the catalog gate

Runs every entry in the [40-pattern catalog](./anti-patterns/overview.md)
against every annotated cog. Verdict per pattern:

- `ok` — no occurrences in the project.
- `violations` — at least one occurrence; the JSON lists each.
- `suppressed` — pattern was suppressed via `@suppress(...)` with
  a documented rationale.

Severity respects per-project overrides in `verum.toml`. An
`error`-severity violation fails the gate; `warning` and `hint`
do not (but are reported).

### 3.2 `--counterfactual` — non-destructive scenario battery

The counterfactual gate runs a synthetic battery covering every
canonical
[`ArchProposition`](./mtac.md) cross-product
with the [11-metric baseline `ArchMetric` set](./counterfactual.md).
Each battery entry asks:

> *Given this Shape, if we change one primitive, does the
> invariant still hold?*

The gate verdict is `stable` when every battery entry returns
`HoldsBoth` (the invariant holds in both base and counterfactual).
A `HoldsBaseOnly` entry indicates a *fragile* invariant — it
holds today but would break under the counterfactual change. A
`HoldsNeither` entry indicates the invariant is *fundamentally
unstable* — the gate fails.

The output JSON carries each battery entry's `InvariantStatus`
(four arms: `HoldsBoth` / `HoldsBaseOnly` / `HoldsVarOnly` /
`HoldsNeither`) so auditors can spot fragile invariants without
re-running the gate.

### 3.3 `--differential-kernel` — two-kernel agreement

Runs the canonical certificate battery through distinct checking
implementations. The substitution and normalization paths are:

1. The **trusted-base** kernel (`verum_kernel::proof_checker`),
   the LCF-style implementation Verum considers authoritative.
2. The **NbE kernel** (`verum_kernel::proof_checker_nbe`), an
   independent normalisation-by-evaluation implementation written
   to a different algorithmic specification.

Per rule, the gate reports:

- `BothAccept` — both kernels admit the certificate. ✓
- `BothReject` — both kernels reject. ✓ (intentional negative)
- `Disagreement` — kernels disagree. ✗ — fails the gate;
  indicates a kernel-implementation bug.
- `NotYetSelfHosting` — observability only; one kernel has no
  certificate to check (transitional).

Agreement concerns the supplied certificates. It does not mean that every
source theorem was elaborated and checked, and does not constitute a proof
of the checkers' own soundness. A disagreement fails the audit.

### 3.4 `--differential-kernel-fuzz` — mutation property fuzzing

Layered atop `--differential-kernel`. Takes the canonical-
certificate roster, applies an 11-variant mutation grammar
(universe lifts, subterm swaps, binder rewrites, application
injections, ...), and runs every mutant through every kernel.
The property invariant: every mutant produces unanimous agreement
between kernels. Any disagreement is a kernel bug.

The campaign is bounded (default 500 iterations, deterministic
xorshift64* seed) so disagreements are reproducible across runs.

### 3.5 `--reflection-tower` — structural diagnostics

Inspects the model's four named stages: `Base`,
`StableUnderUniverseAscent`, `BoundedByOneInaccessible` and
`AbsoluteBoundaryEmpty`. Their data consists of declared rule footprints,
finite witness samples and citations.

The report carries `proof_status: "structural_only"` and
`load_bearing: false`. Positive stage and sample counts remain available as
diagnostics; both proof-discharge counts are zero. The command returns
nonzero because no proof of the named mathematical obligations was replayed.

Comparing declared cardinal indices does not establish a consistency bound.
Checking finitely many universe indices does not establish universal
stabilisation. See [Reflection tower](../verification/reflection-tower.md)
for the full field contract.

### 3.6 `--codegen-attestation` — per-pass discharge status

Verum's codegen pipeline is a chain of passes (VBC lowering,
SSA construction, register allocation, linear-scan reg-alloc,
LLVM emission, machine-code emission). Each pass has a published
soundness invariant (e.g., "register allocation preserves
program semantics"). The codegen-attestation gate reports per
pass:

- `Discharged` — the invariant has a published proof internal to
  Verum.
- `AdmittedWithIou` — the invariant is admitted with a citation
  to a published external proof (CompCert, Vellvm, CompCertELF,
  ...).
- `NotYetAttested` — the invariant is "trusted by code review
  only" — no published or admitted proof yet.

Verum's V0 baseline is `AdmittedWithIou` for every pass; the
discharge work is a multi-year project that flips entries
individually.

### 3.7 `--framework-axioms` — citation roster

Walks every `@framework(name, "citation")` marker on axioms,
theorems, and lemmas; groups by framework; emits the structured
inventory. This *is* the project's external trust boundary.

Auditors reading the inventory should be able to enumerate, by
citation, exactly which external corpora the project's proof
soundness depends on. There is no implicit framework axiom — a
proof that uses an uncited classical axiom (e.g., AC, LEM)
triggers `AP-014 UndisclosedDependency`.

### 3.8 `--kernel-soundness` — external rule models

Emits rule-model files under `target/audit-reports/kernel-soundness/`.
These models and their assumptions must be reviewed separately. An external
assistant accepting a generated definition or axiomatization does not prove
that it faithfully represents Verum's implementation or a source theorem.
This audit is distinct from the public `verum export` command, which rejects
unsupported foreign theorem exports. See
[Proof export](../verification/proof-export.md).

## 4. JSON schema

Schema versions belong to individual report types. Consumers must dispatch
on the report kind and its supported version, not assume that all audit
commands share one schema.

| Report | Version | Proof-authority fields |
|---|---|---|
| `--proof-honesty` | `1` | Syntactic classification only; no proof replay result. |
| `--kernel-discharged-axioms` | `3` | `proof_status`, `citation_count`, `discharge_count`, `evidence_breakdown`. |
| `--reflection-tower` | `4` | `proof_status`, `load_bearing`, `structurally_consistent`, positive diagnostic counts and separate zero discharge counts. |

The apply-graph report exposes `dependencies_resolved` for each theorem
separately from `proof_status` and the `unverified_theorems` total. Unknown
schemas require an explicit adapter; do not silently interpret missing proof
status as successful certification.

For intrinsic reports, `computed`, `cited` and `needs_structural_args`
describe evidence origin. For reflection reports, `diagnostic_holds`
describes an observation and `discharges: false` states its proof limit.
Preserve these distinctions in dashboards and archives.

## 5. CI integration

A typical CI pipeline runs `verum audit --bundle` on every PR
and on the main branch's tip:

```yaml
# .github/workflows/ats-v-audit.yml
name: ATS-V audit

on: [push, pull_request]

jobs:
  bundle:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cargo install verum-cli
      - run: verum audit --bundle
      - uses: actions/upload-artifact@v4
        with:
          name: audit-reports
          path: target/audit-reports/
```

Two patterns worth establishing:

1. **Archive every bundle.json on main.** The `bundle.json`
   files form the project's *audit chronicle* — a
   chronologically-ordered record of every revision's verdict.
   Auditors review the chronicle, not just the latest snapshot.
2. **Diff per-gate verdicts across PRs.** A PR that flips
   `arch-discharges` from `ok` to `violations` is more
   informative than the absolute count of violations. The CI
   should surface deltas.

## 6. The dual verdict surface

Plain output gives a concise developer summary; JSON preserves detailed
observations for review and archival. Both must retain the scope of the
result. A user interface must not turn `structural_only` into a verified
badge merely because all diagnostic flags are positive.

## 7. What "load-bearing" means

Interpret `load_bearing` under the contract of the report that produced it.
An architectural consistency check is not a proof of every theorem in the
project. A successful native replay establishes a particular formal judgment
under its declared assumptions; source correspondence is a separate part of
source-level certification.

The intrinsic, reflection and apply-graph audits do not carry the proof
terms needed for their named mathematical obligations. Their structural
observations remain useful, but cannot acquire proof authority through a
bundle summary, a citation, or a successful check of a different statement.

## 8. Liveness pins — the audit's audit

A natural question: *"how do I know the audit gates are not
silently passing?"* Verum's answer is **liveness pins** — synthetic
inputs designed to *fail* the gate. Every gate ships with at
least one liveness pin:

- The differential-kernel gate has a *synthetic always-accept*
  kernel registered alongside the real ones. The gate's
  invariant is that the synthetic kernel will *disagree* with
  the real ones on rejected certificates; if the gate ever
  reports "no disagreements" with the synthetic in the registry,
  the gate itself has a bug.

These negative controls detect silent acceptance and broken diagnostics in
the exercised cases. They strengthen the test evidence but do not constitute
a proof of checker soundness or certify untested corpus declarations.

## 9. Adversarial diagnostic intrinsics

The intrinsic registry includes checks addressing attack patterns on the
ATS-V declarative surface. Their results are structural diagnostics, not
proofs of the annotated axiom declarations. See
[adversarial threat modelling](./red-team.md) for the attack catalog:

| Intrinsic | Pattern | Diagnostic purpose |
|---|---|---|
| `kernel_arch_capability_ontology_check`            | AT-1   | Every `Capability.CustomCapability(tag)` must have its `tag` registered before passing the ATS-V phase.  Blocks injection of fake high-privilege capabilities. |
| `kernel_arch_theorem_cve_required`                 | AT-2   | `Lifecycle.Theorem(...)` requires full CVE-closure regardless of the `strict` flag — Theorem-status semantically implies CVE+. |
| `kernel_arch_yoneda_canonical_roster_complete`     | AT-3   | A Yoneda equivalence verdict is binding only when the `agreements` list spans the full canonical 5-roster.  Blocks single-observer fabrication. |
| `kernel_arch_consumes_format_check`                | AT-5   | `consumes` field entries must match `<resource>/<positive_int> <unit>`.  Format violations surface as AP-025 DeclarationDrift. |

AT-4 (composition path traversal in `composes_with` resolution)
is delegated to the module-loader; documented for completeness in
[adversarial threat modelling](./red-team.md).

These names have Verum declarations and corresponding
`dispatch_intrinsic` arms. Cross-side alignment checks, including
`crates/verum_kernel/tests/k_arch_v_alignment.rs`, can detect drift between
those registries. Alignment does not supply a proof of an annotated theorem:
its statement, premises and proof term still require actual verification.

## 10. The transitive peer-resolution layer

Most ATS-V checks are *local* — they inspect a single cog's
declared shape against its own body.  Two checks operate at the
*cross-cog* level: AP-019 `FoundationDowngrade` and AP-024
`TransitiveLifecycleRegression`.  Both walk the
`composes_with` graph, but the walks behave differently from
the local checks in two ways:

1. **The graph is built incrementally.**  Each cog's parsed
   `@arch_module(...)` shape is registered as it is compiled,
   building a session-scoped peer registry.  A peer not yet
   registered when the resolver runs is silently skipped (no
   false positive).  The single-pass architecture is preserved.
2. **The walk is depth-aware.**  Direct one-hop drift is
   already caught by the standard peer-resolution check.  The
   transitive layer walks *deeper* — depth `≥ 2` only — so it
   produces a strictly different diagnostic class.

### 10.1 The transitive walker

A depth-first walker iterates the peer graph from a starting
cog, visiting every reachable cog with cycle prevention and a
depth fuse of **32** hops (sufficient for every observed
real-world graph).  Each visit carries the `path` traversed,
the visited cog's `shape`, and the current `depth`; callers
filter by `depth ≥ 2` to isolate the transitive class.

Two policy adapters use the walker:

- `resolve_transitive_lifecycle_regressions` — reports any
  reachable peer whose `Lifecycle.rank()` exceeds the starting
  cog's, surfacing the `(intermediate, terminal,
  regressed_lifecycle)` tuple.
- `resolve_transitive_foundation_downgrades` — reports any
  reachable peer whose `foundation` is not subsumed by the
  starting cog's foundation, surfacing the `(peer,
  peer_foundation, self_foundation)` tuple.

Both adapters are *pure functions* over the peer registry
snapshot — re-runnable, deterministic, idempotent.

### 10.2 Wiring into the audit pipeline

Each cog's ATS-V phase calls the two adapters against the
session peer registry, populating two new diagnostic-context
fields.  The regular AP-019 and AP-024 emitters then consume
these alongside the direct-edge findings, so a single cog's
audit report contains both immediate and transitive
violations.

The per-attribute fast path (used when no peer registry is
available) leaves these fields empty: cross-cog claims are only
supported in the registry-aware entry point that snapshots the
peer graph before resolving.

### 10.3 Verifying the layer

The cross-side pin band has four entries dedicated to this
layer (raising the alignment count from **39 → 43**); see
[Cross-side pin tests §7](./cross-side-pin#7-transitive-peer-walker-pins)
for the full contract.

The bundle gate `--arch-discharges` walks every reported
violation.  Transitive entries surface in the JSON with an
explicit `via` chain so auditors can read the path:

```json
{
  "ap": "AP-024",
  "kind": "TransitiveLifecycleRegression",
  "module": "core.prove.zfc.choice",
  "via":    ["core.prove.zfc.lemma_a", "core.prove.zfc.hypothesis_b"],
  "regressed_to": "Hypothesis { confidence: Low }",
  "depth": 2
}
```

This makes the multi-hop reasoning *machine-readable*: a CI
diff can flag a PR that introduces a new transitive regression
chain even when no individual edge regresses.

### 10.4 Reusing the walker

Future cross-cog anti-patterns that need depth-aware traversal
share the same walker, so that cycle prevention and depth
bounds stay consistent across the audit catalog:

- AP-018 `CompositionPathDeception` — currently surfaces only
  on direct edges; the transitive variant ("a cog launders a
  capability through two intermediate cogs neither of which
  individually advertises the handoff") will share the
  transitive infrastructure.
- AP-022 `CapabilityLaundering` — already a multi-hop check on
  the privilege chain; a future consolidation onto the shared
  walker eliminates duplicated cycle-prevention logic.

Adapters that only need the *first* violation can short-circuit
the traversal — a useful optimisation for high-fanout peer
graphs.

## 11. Cross-references

- [Anti-pattern overview](./anti-patterns/overview.md) —
  the 40-pattern catalog the `--arch-discharges` gate consumes.
- [Adversarial threat modelling](./red-team.md) — detailed
  exposition of AT-1..AT-10 attack vectors and their closures.
- [Cross-side pin tests](./cross-side-pin.md) — kernel ↔ Verum
  alignment discipline that prevents drift in the discharge
  catalog.
- [Operationalisation surface](./operationalisation.md) — the
  pure-data helpers the audit reports cite.
- [Counterfactual reasoning](./counterfactual.md) — the
  underlying engine for the `--counterfactual` gate.
- [Adjunctions](./adjunctions.md) — the recogniser for the
  `--adjunctions` gate.
- [Verification → soundness gates](../verification/soundness-gates.md)
  — the predicate-level formalisation of every gate.
- [Verification → trusted kernel](../verification/trusted-kernel.md)
  — the trusted base the kernel-recheck and differential-kernel
  gates verify against.
- [Tooling → CLI](../tooling/cli.md) — the full `verum audit`
  CLI surface.
