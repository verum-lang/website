---
sidebar_position: 9
title: "Reflection tower — structural diagnostics"
description: "Inspect declared universe footprints and finite reflection samples without mistaking them for checked mathematical proofs."
slug: /verification/reflection-tower
---

# Reflection tower

`verum audit --reflection-tower` inspects declared rule footprints and
finite reflection samples. It does not replay a proof of consistency,
meta-classification stabilisation, a cardinal bound, or an empty absolute
stratum. Its proof status is `structural_only`, even when every observed
structural condition holds.

This distinction determines how to use the report. It can expose drift in
metadata and sampled calculations. It cannot establish a universal theorem
from a finite set of indices, turn a citation into a proof, or circumvent
Gödel's incompleteness theorems.

## What the stages describe

The report retains four named stages from the reflection model:

| Constructor | Inspected data | What is not established |
|---|---|---|
| `Base` | Declared per-rule axioms and inaccessible-cardinal footprint. | That the rule is derivable from those assumptions. |
| `StableUnderUniverseAscent` | Sampled witness flags at selected universe indices. | Stabilisation at every index or equivalence of the underlying theories. |
| `BoundedByOneInaccessible` | Comparison of declared cardinal indices with the configured ceiling. | A relative-consistency theorem for an entire reflective tower. |
| `AbsoluteBoundaryEmpty` | The model's recorded boundary condition and citation. | Nonexistence of a mathematical object satisfying the source statement. |

Names such as `ConstructiveMetaStabilisationWitness` and legacy fields
containing `discharge` belong to the model's API. Their Boolean values are
observations, not inhabitants of the propositions named by the model.
The authoritative proof status accompanies them explicitly.

## Run the diagnostic

```bash
verum audit --reflection-tower --format json
```

The command writes `target/audit-reports/reflection-tower.json`. It exits
nonzero because the report contains unverified proof obligations. A positive
structural observation does not make that proof gate pass.

The report uses `schema_version: 4` and separates these fields:

| Field | Meaning |
|---|---|
| `proof_status` | `structural_only`: no mathematical proof was replayed by this audit. |
| `load_bearing` | `false`: structural diagnostics do not discharge the stated obligations. |
| `structurally_consistent` | Whether the inspected structural conditions agree. |
| `structurally_positive_stage_count` | Number of stages with positive diagnostics. |
| `structurally_positive_sample_count` | Number of sampled indices with positive diagnostics. |
| `discharged_stage_count` | Zero; not an alias for the positive-stage count. |
| `constructive_discharged_count` | Zero; not an alias for the positive-sample count. |
| `base_footprint.declared_footprint_within_ceiling` | Whether the declared footprint fits the configured ceiling. |

Each entry in `stages` contains `diagnostic_holds`,
`proof_status: "structural_only"`, and `discharges: false`. Entries in the
legacy `constructive_discharges_at_sampled_indices` array have the same
separation. Bibliographic references and source paths identify the intended
mathematics; they do not certify its translation or proof.

## Trust boundary

`VerificationVerdict::StructuralOnly` prevents aggregation from treating a
positive diagnostic as a proof. An accepted certificate for some other
statement cannot discharge these remaining obligations.

To establish one of the mathematical claims, supply its exact formal
statement, all assumptions, and a proof term checked against that statement.
The native proof route replays judgments using the substitution and
normalization checkers in `verum_proof`. Source-level certification also
requires faithful elaboration of the selected source declaration. Neither
route derives an external theorem from the reflection model's flags.

The implementation is in `crates/verum_kernel/src/reflection_tower.rs`;
CLI serialization and exit behavior are in
`crates/verum_cli/src/commands/audit.rs`.

## Related documentation

- [Proof-honesty audit](./proof-honesty.md): proof-body shape and evidence inventories.
- [Proof export](./proof-export.md): source correspondence and certificate boundaries.
- [Kernel module map](./kernel-module-map.md): distinct verification and audit surfaces.
- [Audit protocol](../architecture-types/audit-protocol.md): interpretation of per-gate reports.
