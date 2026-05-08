---
sidebar_position: 11
title: Differential Lean Checker
description: "Cert-by-cert agreement gate between the Rust kernel (`Certificate::verify`) and the Lean executable `verum_replay_checker`. A 24-cert canonical battery is run through both; per-cert verdicts must agree. Where the tri-prover replay checks the meta-theory shape of the soundness export, this gate checks the operational kernel — same accept/reject judgements as a re-implementation."
---

# Differential Lean Checker

> Status: load-bearing CI gate (FV-3, landed 2026-05-08). The 24-cert
> canonical battery is run through the Rust kernel and the Lean
> ReferenceChecker on every release; cert-by-cert verdict
> disagreement fails the audit.

## 1. Why this gate exists

The kernel-soundness export pipeline ([`--kernel-soundness`](../verification/cli-workflow.md))
verifies that the **theorem statements** of the 38 kernel rules
typecheck. The tri-prover replay
([`--external-prover-replay`](./external-prover-verification.md))
verifies that those theorem statements typecheck across **three
independent foundations** (Lean 4, Coq / Rocq, Isabelle / HOL).

Neither of those checks ever asks the question:

> *Given the same certificate, do the Rust kernel and an
> independent re-implementation of the same rules produce the
> same verdict?*

A bug in either kernel that doesn't surface as a meta-theory shape
mismatch — a wrong de Bruijn shift, a missed eta case, an
incorrect substitution, an off-by-one in universe arithmetic — is
exactly the kind of bug the meta-theory checker can't catch. The
load-bearing fix is to **run the same certificate through both
implementations and compare verdicts**.

That's `--differential-lean-checker`. On its first run, the gate
immediately surfaced a real disagreement
(**[DEFECT-5](#5-defects-found-by-this-gate)**) and pinned it. The
DEFECT-5 fix is the load-bearing value of the gate.

## 2. The two kernels

| Kernel | Path | Implementation |
|--------|------|----------------|
| **Rust** | `crates/verum_kernel/src/proof_checker.rs::Certificate::verify` | The trusted base: ~826 LOC bidirectional bidirectional type checker over de Bruijn `Term`. |
| **Lean** | `verification/external/lean/VerumExternalReplay/ReferenceChecker.lean::verifyCertificate` | Independent re-implementation in Lean 4 over a structurally-identical `Term` ADT. |

The two implementations were authored separately against the same
abstract specification (the typing rules in
`docs/research/proof-tree-formalization.md`) — they are intended
to disagree only when one of them has a bug.

## 3. The 24-cert canonical battery

The battery (`verum_cli::commands::audit::load_differential_battery`)
is hand-crafted to exercise every load-bearing kernel pathway. It
covers four orthogonal axes:

### Structural fragment (the parts both kernels must accept)

| Cert ID | Term | Claimed type | Why |
|---------|------|--------------|-----|
| `univ-0-in-1` | `Universe(0)` | `Universe(1)` | T-Univ at lowest universe |
| `univ-3-in-4` | `Universe(3)` | `Universe(4)` | T-Univ mid-tower |
| `id-at-univ0` | `λ.0` | `Π Universe(0). Universe(0)` | Identity at type 0 |
| `id-at-univ1` | `λ.0` | `Π Universe(1). Universe(1)` | Identity at type 1 |
| `polymorphic-id-shape` | `λ. λ. 0` | `Π Universe(0). Π 0. 0` | Polymorphic identity |
| `pi-form-univ0` | `Π Universe(0). Universe(0)` | `Universe(1)` | T-Pi-Form |
| `app-elim-correct` | `(λ.0) Universe(0)` | `Universe(0)` | T-App-Elim with correct arg |
| `nested-binders-deep4` | 4-deep nested λ | matching Π chain | Deep de Bruijn shift |
| `const-function` | `λ. λ. 1` | const-function type | Variable shadowing |
| `eta-redex-via-app` | `(λ.0) (λ.0)` at `Π U(0).U(0)` | `λ.0` shape | η-equivalence |

### Negative cases (both kernels must reject)

| Cert ID | Why rejected |
|---------|-------------|
| `univ-mismatch` | T-Univ violated: `Universe(0) : Universe(2)` (skips a level) |
| `app-on-non-function` | T-App applied to a non-function |
| `app-elim-domain-mismatch` | T-App-Elim with wrong domain type |
| `unbound-var-deep` | de Bruijn index past Γ length |
| `claimed-not-a-type` | claimed_type doesn't itself have a universe kind |

### DEFECT mirrors (regression pins for past kernel bugs)

| Cert ID | Defect pinned |
|---------|---------------|
| `defect-1-mirror` | DEFECT-1 (substitution capture in dependent codomain) |
| `defect-2-univ-max-overflows` | DEFECT-2 (universe overflow at u32::MAX) |
| `defect-2-univ-max-minus-one-ok` | DEFECT-2 boundary: `MAX-1 : MAX` accepted |
| `defect-3-mirror` | DEFECT-3 (Pi-introduction without binder-type kind check) |
| `defect-4-claimed-is-value` | DEFECT-4 (claimed_type validation: must itself be a type) |
| `defect-4-claimed-is-pi-of-value` | DEFECT-4 nested case |

### Polymorphic / cross-instantiation shapes

| Cert ID | Why |
|---------|-----|
| `polymorphic-id-applied` | identity instantiated at `Universe(0)` |
| `polymorphic-id-instantiated-at-univ1` | identity instantiated at `Universe(1)` |
| `nested-app-pipeline` | App nested 3-deep through structural fragment |

Total: 24 certificates. The battery is closed under regression — any
new defect found against the kernel adds a `defect-N-mirror` cert.

## 4. The protocol

```
    ┌──────────────────────────────────────────────────────────┐
    │   verum audit --differential-lean-checker                │
    └────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
        ┌──────────────────────────────────┐
        │  load_differential_battery()     │
        │  → 24 BatteryCert structs        │
        └────────────────────┬─────────────┘
                             │
            ┌────────────────┴────────────────┐
            │                                 │
            ▼                                 ▼
  ┌──────────────────┐             ┌────────────────────┐
  │  Rust kernel     │             │  Serialise battery │
  │                  │             │  → JSON file       │
  │  Certificate::   │             └─────────┬──────────┘
  │  verify(cert)    │                       │
  │  for each cert   │                       ▼
  │                  │             ┌────────────────────┐
  │  → Vec<Verdict>  │             │  lake build        │
  └────────┬─────────┘             │  verum_replay_     │
           │                       │  checker (Lean exe)│
           │                       └─────────┬──────────┘
           │                                 │
           │                                 ▼
           │                       ┌────────────────────┐
           │                       │  Run Lean exe      │
           │                       │    binary path:    │
           │                       │    .lake/build/    │
           │                       │    bin/verum_      │
           │                       │    replay_checker  │
           │                       │  → JSON verdicts   │
           │                       └─────────┬──────────┘
           │                                 │
           └─────────────────┬───────────────┘
                             ▼
                  ┌──────────────────────┐
                  │  Cross-check         │
                  │  cert-by-cert ok     │
                  │  field parity        │
                  └──────────┬───────────┘
                             │
                             ▼
                ┌──────────────────────────┐
                │  Total: 24, Agreements:  │
                │  24, Disagreements: 0    │
                └──────────────────────────┘
```

The Lean executable (`verum_replay_checker`) is a Lake target
defined in `verification/external/lean/lakefile.toml`. The Rust
audit harness builds it on demand (cached after the first build),
then invokes it with the battery JSON path as `argv[0]`. Output is
read from stdout, parsed, and cross-compared against the Rust
verdicts.

Verdicts compare by the `ok : Bool` field only — error tags are
stored for diagnostic reading but **not** required to match
between implementations (different error categories are an
implementation choice, not a correctness claim).

## 5. Defects found by this gate

### DEFECT-5 — universe-tower-top escape hatch (2026-05-08, fixed in
the same commit that landed the gate)

When `Certificate::verify` infers the kind of `claimed_type`, a
`Universe(u32::MAX)` triggers `UniverseOverflow` on its successor —
even though the claimed_type *is* a valid type at the top of the
universe tower. Lean's `Nat` is unbounded, so the Lean checker
accepted the cert; the Rust checker rejected it.

The fix: `Certificate::verify` now treats
`Err(UniverseOverflow)` from the DEFECT-4 kind-check as
"claimed_type lives at the top of the universe tower — still a
type." Step 2 (`def_eq` on inferred-vs-claimed) catches any
genuine type mismatch downstream.

The cert `defect-5-universe-tower-top` (which is `defect-2-univ-
max-minus-one-ok` under its original name) is now part of the
regression battery.

## 6. Running locally

```bash
# Default — runs Rust kernel + Lean exe, reports per-cert verdicts.
verum audit --differential-lean-checker

# JSON output for machine consumption.  Battery + Rust verdicts
# saved to target/audit-reports/differential-lean/battery.json;
# Lean verdicts and final verdict to stdout.
verum audit --differential-lean-checker --format json
```

Prerequisites:
- Lean 4 via elan: <https://leanprover.github.io/get_started/>
- The Lake build step is incremental — first run is ~30s, repeat
  runs are ~1s.

## 7. Wiring in CI

The gate is part of `verum audit --bundle` (the umbrella audit).
Add to the GitHub Actions matrix alongside the tri-prover replay:

```yaml
- name: Differential Lean checker (FV-3)
  run: |
    # elan + lake (required for both gates)
    curl -sSf https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh \
      | sh -s -- -y --default-toolchain leanprover/lean4:v4.29.1
    source $HOME/.elan/env
    verum audit --differential-lean-checker
```

CI failure mode: if any cert disagrees, the harness exits non-zero
and prints the disagreeing cert IDs alongside both verdicts. The
debug investigation pattern is:

1. Read the cert's `term` and `claimed_type` from the battery
   JSON.
2. Step both implementations (Rust via `cargo test
   -p verum_kernel proof_checker -- --nocapture`; Lean via
   `lake env lean` REPL on `ReferenceChecker.lean`).
3. The kernel that produces the *wrong* verdict per the typing
   rules of `docs/research/proof-tree-formalization.md` is the one
   with the bug.

## 8. Maintenance

When **adding a new cert** to the battery:

1. Append a `BatteryCert` to `load_differential_battery()` in
   `crates/verum_cli/src/commands/audit.rs`. Use a stable ID for
   future regression-bibliography reference.
2. Run `verum audit --differential-lean-checker`. The new cert
   must reach 24+1 unanimous agreement before merge.

When **finding a kernel disagreement** (i.e., the gate failed):

1. Add a `defect-N-mirror` cert to the battery that captures the
   minimal failing shape.
2. Fix the kernel(s). Document the defect in the audit ledger
   (`docs/architecture/verum-kernel-audit-2026.md`).
3. Confirm the cert flips to unanimous agreement.

## 9. Cross-references

- [External-Prover Verification](./external-prover-verification.md)
  — the complementary gate that checks **theorem statements**
  across three foundations (vs this page checks runtime verdicts
  in two implementations).
- [Trusted Kernel](./trusted-kernel.md) — the TCB this gate is one
  layer of differential second-opinion on.
- [`verum audit` CLI surface](../tooling/cli.md#kernel-soundness-band-12-gates)
  — full audit-flag table.
