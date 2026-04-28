---
sidebar_position: 7
title: Diakrisis Bridge Roster
description: Trusted-boundary surface — explicit, named admits surfacing
  preprint-blocked type-theoretic results into the Verum kernel.
---

# Diakrisis Bridge Roster

The **Diakrisis bridge** mechanism makes preprint dependencies in the
Verum kernel **explicit at the kernel surface** rather than silent
in proof bodies. Each bridge admit names a specific Diakrisis result
(paragraph + theorem number) and is surfaced via the
[`BridgeAudit`](#bridgeaudit-api) audit trail.

## Why Bridges?

Pre-V2 the kernel had a binary choice when encountering a type-
theoretic obligation outside its decidable fragment: **reject** (the
proof fails) or **silently admit** (any user `axiom` implicitly
discharges). Neither is acceptable for an industrial proof
assistant.

V2 (shipped 2026-04-28 across multiple commits) introduces a third
option: **named bridge admits** — the kernel records WHICH preprint
result is being admitted, produces a structured audit trail, and
surfaces the dependency to downstream auditors via
`verum audit --bridge-admits`.

## Roster

The complete inventory of bridge admits as of 2026-04-28:

| `BridgeId` | Audit string | Diakrisis result | K-rule consumer |
|------------|--------------|------------------|------------------|
| `ConfluenceOfModalRewrite` | `diakrisis-16.10` | Theorem 16.10 (confluence of modal rewrite) | K-Round-Trip V2 |
| `QuotientCanonicalRepresentative` | `diakrisis-16.7` | Theorem 16.7 (quotient canonical-rep) | K-Round-Trip V2 |
| `CohesiveAdjunctionUnitCounit` | `diakrisis-14.3` | Theorem 14.3 (cohesive triple adjunction) | K-Round-Trip V2 |
| `EpsMuTauWitness` | `diakrisis-A-3` | Axiom A-3 (σ_α / π_α τ-witness) | K-Eps-Mu V3-final |
| `DrakeReflectionExtended` | `diakrisis-131.L4` | Lemma 131.L4 (extended Drake reflection) | K-Universe-Ascent V2 |

### Diakrisis 16.10 — Confluence of Modal Rewrite

**Statement** (preprint, paraphrased): the rewrite system over the
modal operators `Box`, `Diamond`, `Shape`, `Flat`, `Sharp` (cohesive
modalities) is confluent. Two distinct reductions of a modal-bearing
term meet at a common further reduct.

**Why preprint-blocked**: the proof relies on the cohesive triple
adjunction `(∫ ⊣ ♭ ⊣ ♯)` interaction with `Box`/`Diamond` necessitation,
which has not yet landed as a structural algorithm in the Verum
kernel. The Diakrisis preprint contains the full proof; until the
result is mechanised, V2 admits.

**Where invoked**: `verum_kernel::round_trip::canonical_form` —
when the iteration budget (`CANONICALIZE_ITERATION_BUDGET = 64`) is
exhausted, `admit_confluence_of_modal_rewrite` is recorded.

**V3 promotion path**: replace the body of
`admit_confluence_of_modal_rewrite` with the structural common-reduct
computation. Every previously-admitted call site mutates from
`audit = {16.10}` to `audit = {}`, monotonically shrinking the
trusted boundary.

### Diakrisis 16.7 — Quotient Canonical Representative

**Statement**: decidable equality of quotient representatives modulo
the equivalence relation, for `Quotient(base, equiv)`.

**Why preprint-blocked**: the canonical-representative selector
relies on the choice of a section of the projection map, which is
non-trivial for non-finite quotients. Diakrisis 16.7 establishes
existence under a definability hypothesis; the algorithmic content
has not yet been mechanised.

**Where invoked**: not yet wired into `canonical_form`; reserved for
the V2.5 quotient-rewrite extension.

### Diakrisis 14.3 — Cohesive Adjunction Unit/Counit

**Statement**: unit/counit naturality for the `(∫ ⊣ ♭ ⊣ ♯)` cohesive
adjunction triple.

**Why preprint-blocked**: required for `Flat(Sharp(x))` and
`Sharp(Flat(x))` collapse on the appropriate adjunction side.
Diakrisis 14.3 contains the proof.

**Where invoked**: not yet wired into `canonical_form` — reserved for
the cohesive-adjacent rewrite extension.

### Diakrisis A-3 — K-Eps-Mu τ-Witness

**Statement**: σ_α / π_α τ-witness construction for the K-Eps-Mu
naturality rule. Concretely: given a 2-functor `M` and a articulation
`α`, construct the natural equivalence `τ : ε ∘ M ≃ A ∘ ε`.

**Why preprint-blocked**: the witness is the Code_S morphism
combined with Perform_{ε_math} naturality through axiom A-3. The
preprint contains the full construction; mechanisation pending.

**Where invoked**: `verum_kernel::eps_mu::check_eps_mu_coherence_v3_final`
records `EpsMuTauWitness` for non-identity canonical naturality
squares (after V3-incremental gates accept).

**V3-incremental coverage**: depth-preservation, free-variable-
preservation, and β-normalisation invariance gates are decidable
and don't invoke the bridge — they fully cover the V0/V1 admit set
plus the K-Adj-Unit/Counit identity sub-cases.

### Diakrisis 131.L4 — Extended Drake Reflection

**Statement**: `κ_n → κ_n` Drake reflection at arbitrary inaccessible
levels `n ≥ 3`, beyond the Theorem 134.T tight `κ_2` bound.

**Why preprint-blocked**: Theorem 134.T establishes that the κ_2
universe is sufficient for the (∞,2)-stack model; Lemma 131.L4
extends Drake-reflection closure to higher κ-tower levels but
requires a multi-step ascent argument that has not yet been
mechanised.

**Where invoked**: `verum_kernel::universe_ascent::check_universe_ascent_v2`
admits this for any ascent involving `KappaN(n)` with `n ≥ 3` or
multi-step jumps `κ_s → κ_t` with `t > s + 1`.

## BridgeAudit API

The audit trail is `verum_kernel::diakrisis_bridge::BridgeAudit`.
Its surface:

```rust
pub struct BridgeAudit { /* private */ }

impl BridgeAudit {
    pub fn new() -> Self;
    pub fn record(&mut self, bridge: BridgeId, context: impl Into<Text>);
    pub fn admits(&self) -> &[BridgeAdmit];
    pub fn is_decidable(&self) -> bool;
    pub fn bridges(&self) -> List<&'static str>;
}
```

**Idempotence invariant**: `record(bridge, ctx)` is idempotent on
`(bridge, context)` pairs. The same bridge invoked from the same
callsite logs once.

**Decidability invariant**: `audit.is_decidable() == audit.admits().is_empty()`.
A run that completes within the V0/V1 decidable fragment leaves the
audit empty.

## Strict-Stronger Invariant

Every V2/V3 promotion is **strictly stronger** than its V0/V1
predecessor:

> ∀ pair `p` admitted by V0/V1, `p` is also admitted by V2/V3 with
> empty audit (`audit.is_decidable() == true`).

Pairs that V2/V3 admit but V0/V1 reject produce **non-empty audit
trails**. The trusted boundary monotonically shrinks as bridges are
promoted to structural algorithms.

## Auditor Workflow

External auditors use `verum audit --bridge-admits` (shipped with
schema_v=1 JSON) to enumerate every theorem in a corpus that
relies on a bridge admit. A clean run reports:

```
scanned files: N
theorems with bridge-admits: 0
  (decidable corpus — every theorem proves within V0/V1 fragment)
```

A non-empty footprint:

```
scanned files: N
theorems with bridge-admits: 12

by bridge:
  diakrisis-16.10       3
  diakrisis-A-3         9

per-theorem footprint:
  msfs_lemma_3_4_outputs_in_s_s_global   diakrisis-A-3 :: core/math/s_definable/lemma_3_4.vr
  ...
```

## Cross-Format Implications

The five-format proof-export pipeline (`verum_codegen::proof_export`)
emits **Lean 4 / Coq / Agda / Dedukti / Metamath** terms for every
exportable theorem. Bridge admits surface in the exported term as:

| Format | Bridge admit lowered to |
|--------|-------------------------|
| Lean 4 | `axiom diakrisis_16_10 : ...` (with `@axiom` attribute) |
| Coq | `Axiom diakrisis_16_10 : ...` (Module-level `Admitted.`) |
| Agda | `postulate diakrisis-16-10 : ...` |
| Dedukti | `diakrisis_16_10 : ...` (no body — Dedukti's symbol) |
| Metamath | `$a` (axiom-step) at the corresponding label |

Downstream verifiers see the same trusted-boundary surface as
the Verum auditor — every external verification re-validates the
proof modulo the same bridge admits.

## V3 Promotion Roadmap

When a Diakrisis bridge becomes mechanisable, the V3 promotion is a
**single-commit** change:

1. Replace the body of `admit_<bridge>` with the structural algorithm.
2. The `BridgeAudit` machinery is unchanged — every call site that
   previously recorded an admit now silently completes (because the
   structural algorithm succeeds without invoking `audit.record`).
3. The `verum audit --bridge-admits` walker reports `0` for the
   newly-discharged bridge.
4. External verifier files emitted via `proof_export` no longer
   reference the corresponding axiom — Lean's `axiom` becomes a
   `theorem`, Coq's `Admitted` becomes `Qed`, Agda's `postulate`
   becomes a definition.

The trusted boundary shrinks monotonically.

## Audit Reports

The bridge-admits audit produces machine-parseable JSON at
`audit-reports/bridge-admits.json` (schema_v=1) when invoked with
`--format json`. Sample:

```json
{
  "schema_version": 1,
  "scanned_files": 245,
  "total_with_admits": 12,
  "by_bridge": {
    "diakrisis-16.10": 3,
    "diakrisis-A-3": 9
  },
  "rows": [
    {
      "theorem": "msfs_lemma_3_4_outputs_in_s_s_global",
      "file": "core/math/s_definable/lemma_3_4.vr",
      "bridges": ["diakrisis-A-3"]
    }
  ]
}
```

Consume in CI:

```yaml
- name: Bridge-admit footprint must not grow
  run: |
    verum audit --bridge-admits --format json > audit-reports/bridge-admits.json
    # Compare against baseline; fail if any bridge count increased.
    python3 scripts/audit-bridge-diff.py \
      --baseline baseline/bridge-admits.json \
      --current  audit-reports/bridge-admits.json
```

## See Also

- [Trusted Kernel](trusted-kernel.md) — V0/V1 K-rule reference
- [Proof Honesty](proof-honesty.md) — corpus-wide theorem-body audit
- [Proof Export](proof-export.md) — five-format cross-verifier emit
- [Framework Axioms](framework-axioms.md) — `@framework(name, "citation")` attribution
