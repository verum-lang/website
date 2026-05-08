---
sidebar_position: 10
title: External-Prover Verification
description: "Tri-prover replay gate for the kernel-soundness corpus — Lean 4, Coq/Rocq, and Isabelle/HOL. The audit drives KernelSoundness.lean / kernel_soundness.v / KernelSoundness.thy through real `lake build` / `coqc` / `isabelle process` invocations and reports per-backend pass / iou-only / hard-error verdicts. Three independent foundations agreeing on the same soundness claims."
---

# External-Prover Verification

> Status: load-bearing CI gate. The kernel-soundness corpus is
> regenerated and re-checked through Lean 4 (`lake build`) and
> Coq / Rocq (`coqc`) on every release. Hard-error verdicts block
> merges. Honest IOUs (`sorry` / `Admitted`) are accountability
> surface, not failures — their count is pinned and surfaces
> immediately if it drifts.

## 1. Why this gate exists

Verum's kernel-soundness pipeline ([`verum audit --kernel-soundness`](../verification/cli-workflow.md))
historically did three things:

1. Drift-checked the Rust-side rule list against the `.vr` corpus.
2. Enumerated per-rule status (`Proved` / `Admitted` / `DischargedByFramework`).
3. **Emitted** parallel Lean 4 + Coq theory files into
   `target/audit-reports/kernel-soundness/` for "independent re-checking".

Step 3 was load-bearing **on paper** but never invoked in CI. A
foreign auditor was supposed to run `lake build` / `coqc`
themselves. This is exactly the kind of trust-trap the pipeline was
meant to *prevent*: the output existed, it looked plausible, and
nothing mechanical confirmed Lean / Coq would actually accept it.

When this gate first ran it caught **four type errors** in the
supposedly-proved lemmas — broken proof tactics that had been in
the emitter for the entire history of the corpus:

| Rule | Error | Root cause |
|------|-------|------------|
| `K_Var_sound`   | `ctx_lookup_sound Hrule Hwf` applied a Prop where a `CoreTerm` was expected | proof emitter used the wrong names from `intros` |
| `K_Univ_sound`  | `exact universe_form_sound` left ∀-residue | `intros d Hrule` consumed only 2 binders, leaving `t T : CoreTerm` |
| `K_FwAx_sound`  | `axiom_body_typed_in_prop body_prop` — `body_prop` undefined | the emitter `rcases`'d a Prop as a tuple |
| `K_Pos_sound`   | `strict_positivity_sound strict_pos` — `strict_pos` was a `ByteArray` | same `rcases` mistake |

`verum audit --kernel-soundness` had reported the gate green for
all four because it never asked Lean. `verum audit --external-prover-replay`
fails immediately on this kind of regression.

## 2. What gets verified

### 2.1 Verum-side source of truth

- `core/verify/kernel_soundness/` — the corpus (rule list, lemma
  names, admit reasons, framework citations).
- `crates/verum_kernel/src/proof_tree.rs::KernelRule` — the
  Rust-side enum mirror (38 rules).
- `crates/verum_kernel/src/soundness/` — the cross-export pipeline
  (`SoundnessExporter`, `LeanBackend`, `CoqBackend`).

The audit gate `--kernel-soundness` drift-checks all three.

### 2.2 Foreign-tool re-check

`verum audit --external-prover-replay` extends the gate with a real
shell-out across **three foundations**:

| Backend | Tool | Project | Invocation |
|---------|------|---------|------------|
| Lean 4 (4.29.1+) | `lake build` | `verification/external/lean/` | builds `VerumExternalReplay/KernelSoundness.lean` |
| Coq / Rocq (9.0+) | `coqc -Q . VerumExternalReplay kernel_soundness.v` | `verification/external/coq/` | type-checks the export |
| Isabelle/HOL (2025-2+) | `isabelle process -T KernelSoundness -d .` | `verification/external/isabelle/` | re-elaborates `KernelSoundness.thy` |

Three meaningfully-different foundations: Lean 4 is dependent type
theory (predicative + impredicative `Prop`); Coq / Rocq is CIC
(impredicative `Prop` + universe polymorphism); Isabelle/HOL is
classical higher-order logic with extensible foundations.  Tri-prover
agreement on the structural-fragment soundness lemmas is the
load-bearing gate.

Each backend reports one of four verdicts:

- **`clean`** — backend exited 0 with no diagnostics. The
  kernel-soundness theorem typechecks unconditionally.
- **`iou-only`** — backend exited 0; the only diagnostics are
  honest IOUs (typed-axiom declarations of shape `axiom <Rule>_iou`
  in Lean, `Axiom <Rule>_iou` in Coq, `axiomatization` blocks in
  Isabelle) whose count matches the corpus's declared admit list.
  *This is the default green state.* The export ships **16
  outstanding IOU axioms** (one per genuinely non-structural rule
  — the rest are real inductive constructors of the `Typing`
  predicate).  Down from 27 before FV-9 + 17 before the
  Quotient-elimination discharge.
- **`hard-error`** — backend rejected the export with a real
  type / parse / scoping error. Load-bearing regression. Exits
  non-zero.
- **`not-available`** — backend binary missing. Advisory unless
  `--strict`; CI uses `--strict`.

## 3. The structural fragment (real inductive constructors)

As of FV-9, the kernel-soundness export ships a **real `Typing`
inductive predicate** across all three foundations — not just
opaque `well_typed t T` placeholders. The structural fragment of
the kernel (variable lookup, universe formation, dependent-product
formation / introduction / elimination, framework axiom, recursion
positivity, plus all the structural pieces of cubical / refinement
/ quotient / modal layers) is encoded as **inductive constructors**
of `Typing`. Every `K_*_sound` theorem proof becomes "by `intros`,
then apply the corresponding constructor".

The remaining non-structural rules — those that genuinely depend on
deep meta-theory not yet ported to mathlib / Coq stdlib / Isabelle's
HOL — are honestly admitted via per-rule typed axioms named
`<Rule>_iou`. There are **16** such IOUs (down from 27 before
FV-9 and 17 before the Quotient-elimination discharge). Each
axiom takes the rule's actual operands and returns a `Prop`, so
the soundness lemma's operand types are still *checked* by the
foreign tool — the IOU just discharges the conclusion.

So `external-prover-replay` verifies:

- ✅ Every emitted theorem statement parses and type-checks in
  the foreign tool.
- ✅ For every structural rule, the proof uses a real `Typing`
  constructor — not a placeholder. A bug in the structural
  emission (wrong arity, wrong name, missing premise) fails the
  build.
- ✅ Every IOU axiom name + arity matches the rule registry
  (drift-detected).
- ✅ The shape of `CoreTerm`, `CoreType`, `KernelRule` mirrors the
  Rust enums exactly (encoder bug surface).
- ❌ It does **not** verify that the 16 IOU rules are actually
  sound with respect to a denotational model. That's a separate,
  deeper effort tracked under "Kernel meta-theory in Mathlib" in
  the verification roadmap.

For a complementary check that exercises the **runtime kernel** —
not just the meta-theory shape — see [differential-lean-checker](./differential-lean-checker.md).
That gate runs a 24-cert battery through both the Rust kernel and
the Lean ReferenceChecker and asserts cert-by-cert verdict
agreement.

## 4. The 16 outstanding IOUs

Each IOU axiom names exactly the meta-theory it depends on. The
audit's plain output enumerates every reason verbatim; here they
group by category. The bracketed `(N→M)` shows the per-category
drop as structural pieces became real inductive constructors:
the pre-FV-9 corpus had 27; FV-9 brought it to 17; the
Quotient-elimination discharge brought it to 16.

### Cubical (6→4) — CCHM / HoTT mechanisation

`K_Path_Over_Form`, `K_HComp`, `K_Transp`, `K_Glue`

(Structural now: `K_Path_Ty_Form`, `K_Refl_Intro`.)

Discharge plan: port the cubical-type-theory chapter of
[`agda/cubical`](https://github.com/agda/cubical) to a Lean 4
fragment; or wait for `mathlib4`'s nascent CCHM port.

### Refinement (4→3) — Definition 136.D1 + Lemma 136.L0

`K_Refine`, `K_Refine_Omega`, `K_Refine_Intro`

(Structural now: `K_Refine_Erase`.)

Discharge plan: formalise the refinement-typing hierarchy +
ordinal modal-depth bound. Both are stated in
`crates/verum_kernel/src/eps_mu.rs` but the Lean-side proofs are
admitted.

### Quotient (3→0) — equivalence-relation properties

*All Quotient rules now structural.*  `K_Quot_Form` + `K_Quot_Intro`
discharged in FV-9; `K_Quot_Elim` discharged in the Quotient-
elimination pass — its constructor takes structural premises
(scrutinee at the quotient, motive at the dependent universe,
case_fn at the dependent product) directly, mirroring the shape
of `K_Quot_Form` / `K_Quot_Intro`.  The respect-of-equivalence
side condition that mathlib's `Quotient.lift` requires its caller
to discharge externally remains the kernel's input contract,
audited at the Verum side via `verum audit --proof-honesty`
rather than silently axiomatized in the export.

### Inductive (2→2) — positivity decision procedure

`K_Inductive`, `K_Elim`

Discharge plan: port Verum's strict-positivity checker into a
Lean `Decidable` instance.

### SMT/Axiom (1→1) — replay correctness

`K_Smt`

Discharge plan: state "every cert that
`verum_kernel::replay_smt_cert` accepts denotes a well-typed
CoreTerm derivation" as a Lean predicate over a model of SMT
certificates.

### Diakrisis (11→6) — universe ascent, cohesive modalities, Eps/Mu

`K_Eps_Mu`, `K_Universe_Ascent`, `K_Round_Trip`, `K_Epsilon_Of`,
`K_Alpha_Of`, `K_Modal_Big_And`

(Structural now: `K_Modal_Box`, `K_Modal_Diamond`, `K_Shape`,
`K_Flat`, `K_Sharp`.)

Discharge plan: these depend on Schreiber DCCT (`schreiber_dcct`
framework, 5 axioms in `core/math/frameworks/`), Shulman 2018 §3,
and Lurie HTT — none has a mature mathlib port today. Tracked
separately under the Diakrisis bridge-roster.

## 5. Running locally

```bash
# Prerequisites:
#   • Lean 4 via elan: https://leanprover.github.io/get_started/
#   • Rocq / Coq 9.x: brew install rocq  (macOS)
#                     apt install coq    (Debian/Ubuntu, pre-Rocq)

# Default — runs all three backends, soft-fails on missing tools.
verum audit --external-prover-replay

# Lean only (faster on a fresh machine — Lake bootstraps quickly).
verum audit --external-prover-replay --backend lean

# Isabelle only.
verum audit --external-prover-replay --backend isabelle

# CI-grade strict mode.  Fails the gate if any backend isn't
# installed; required reading for `--strict` is "if you can't
# install it, you can't claim it works".
verum audit --external-prover-replay --strict

# JSON for machine consumption.  Output written to
# target/audit-reports/external-prover-replay.json + stdout.
verum audit --external-prover-replay --format json
```

## 6. Wiring in CI

The gate is part of `verum audit --bundle` (the umbrella audit).
Add to the GitHub Actions matrix:

```yaml
- name: External-prover replay (Lean + Coq + Isabelle)
  run: |
    # elan + lake
    curl -sSf https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh \
      | sh -s -- -y --default-toolchain leanprover/lean4:v4.29.1
    source $HOME/.elan/env
    # rocq via apt or brew, depending on runner OS
    sudo apt-get install -y coq
    # isabelle 2025-2 (download + extract; brew --cask isabelle on macOS)
    curl -fsSL https://isabelle.in.tum.de/dist/Isabelle2025-2_linux.tar.gz | tar xz -C /opt
    export PATH="/opt/Isabelle2025-2/bin:$PATH"
    # the tri-prover gate
    verum audit --external-prover-replay --strict
```

## 7. Maintenance

When **adding** a kernel rule:

1. Append to `KernelRule` enum in `crates/verum_kernel/src/proof_tree.rs`.
2. Append a `RuleSpec` to `canonical_rules()` in
   `crates/verum_kernel/src/soundness/mod.rs` with status set to
   `admitted("<concrete IOU citing meta-theory dependency>")`.
3. Mirror in `core/verify/kernel_soundness/theorems.vr` (drift gate).
4. Run `verum audit --external-prover-replay`. The gate must stay
   green: `iou-only` is fine, `hard-error` means the Lean / Coq
   emission is broken — fix the emitter before merging.

When **promoting** an admit to a real proof:

1. Replace `admitted(...)` with `proved(coq_tactics, lean_tactics)`.
2. Provide a concrete tactic chain that closes the goal against
   the placeholder axioms (or — better — a real proof that doesn't
   rely on them).
3. Rerun the gate. The IOU count decreases; CI doesn't care about
   the absolute number, only about hard-errors.

## 8. Cross-references

- [Trusted Kernel](./trusted-kernel.md) — the TCB this gate gives
  an external second opinion on.
- [Differential Lean Checker](./differential-lean-checker.md) —
  the complementary gate that checks **runtime kernel verdicts**
  against the Lean ReferenceChecker cert-by-cert. Different layer:
  this page proves theorem statements type-check; that page proves
  the operational kernel returns the same accept/reject judgements.
- [Three-Kernel Differential](./three-kernel-differential.md) —
  the within-Rust complement: the same 24-cert canonical battery
  also flows through three structurally-distinct in-process Rust
  kernels (`proof_checker` bidirectional / `proof_checker_nbe` NbE
  / `kernel_v0` manifest-driven) and unanimity is asserted
  cert-by-cert.
- [Verification Pipeline](./verification-pipeline.md) — the
  broader verification strategy this gate is one node of.
- [`verum audit` CLI surface](../tooling/cli.md#kernel-soundness-band-12-gates)
  — full audit-flag table.
- [Trust-extension report](../verification/proof-honesty.md) —
  enumerates every IOU axiom seen by external provers.
