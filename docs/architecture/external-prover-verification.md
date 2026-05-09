---
sidebar_position: 10
title: External-Prover Verification
description: "Multi-prover replay gate for the kernel-soundness corpus — Lean 4, Coq/Rocq, Isabelle/HOL, and Cubical Agda. The audit drives KernelSoundness.lean / kernel_soundness.v / KernelSoundness.thy / KernelSoundness.agda through real `lake build` / `coqc` / `isabelle build` / `agda --cubical` invocations and reports per-backend pass / iou-only / hard-error verdicts. Four independent foundations agreeing on the same soundness claims."
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

1. Drift-checked the kernel rule registry against the `.vr` corpus.
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
- The kernel rule registry — the canonical 38-rule list with
  per-rule status (`Proved` / `Admitted` / `DischargedByFramework`).
- The cross-export pipeline — emits parallel Lean / Coq /
  Isabelle / Agda theory files from the rule registry.

The audit gate `--kernel-soundness` drift-checks all four.

### 2.2 Foreign-tool re-check

`verum audit --external-prover-replay` extends the gate with a real
shell-out across **four foundations**:

| Backend | Tool | Project | Invocation |
|---------|------|---------|------------|
| Lean 4 (4.29.1+) | `lake build` | `verification/external/lean/` | builds `VerumExternalReplay/KernelSoundness.lean` |
| Coq / Rocq (9.0+) | `coqc -Q . VerumExternalReplay kernel_soundness.v` | `verification/external/coq/` | type-checks the export |
| Isabelle/HOL (2025-2+) | `isabelle build -d . KernelSoundness` | `verification/external/isabelle/` | re-elaborates `KernelSoundness.thy` |
| Cubical Agda (2.8+) | `agda --cubical KernelSoundness.agda` | `verification/external/agda/` | re-elaborates `KernelSoundness.agda` under cubical mode |

Four meaningfully-different foundations: Lean 4 is dependent type
theory (predicative + impredicative `Prop`); Coq / Rocq is CIC
(impredicative `Prop` + universe polymorphism); Isabelle/HOL is
classical higher-order logic with extensible foundations; Cubical
Agda is the only major prover with native CCHM cubical support
(`--cubical` mode), which closes the cubical-fragment gap that the
other three foundations leave at the meta-theoretic level.
Multi-prover agreement on the structural-fragment soundness lemmas
is the load-bearing gate.

Each backend reports one of four verdicts:

- **`clean`** — backend exited 0 with no diagnostics. The
  kernel-soundness theorem typechecks unconditionally.
- **`iou-only`** — backend exited 0; the only diagnostics are
  honest IOUs (typed-axiom declarations of shape `axiom <Rule>_iou`
  in Lean, `Axiom <Rule>_iou` in Coq, `axiomatization` blocks in
  Isabelle, `postulate <Rule>-sound` blocks in Agda) whose count
  matches the corpus's declared admit list.
  **The IOU registry is currently empty**
  (`iou_axiom_specs() == vec![]`) — every rule is structurally
  `Proved` or `DischargedByFramework`. A future brand-new rule
  that hasn't yet been proved would re-introduce an `iou-only`
  verdict; the audit gate's drift-check catches the
  re-introduction.
- **`hard-error`** — backend rejected the export with a real
  type / parse / scoping error. Load-bearing regression. Exits
  non-zero.
- **`not-available`** — backend binary missing. Advisory unless
  `--strict`; CI uses `--strict`.

## 3. The structural fragment (real inductive constructors)

The kernel-soundness export ships a **real `Typing` inductive
predicate** across the Lean / Coq / Isabelle foundations — not
opaque `well_typed t T` placeholders. (Cubical Agda currently
emits per-rule `postulate <Rule>-sound` declarations whose
signatures are still type-checked end-to-end; promoting Agda
postulates to a structural `data Typing : Ctx → CoreTerm →
CoreTerm → Set` mirrors the Lean/Coq trajectory and is tracked
as future work.) The structural fragment of the
kernel (variable lookup, universe formation, dependent-product
formation / introduction / elimination, framework axiom,
recursion positivity, plus all the structural pieces of cubical
/ refinement / quotient / modal layers) is encoded as
**inductive constructors** of `Typing`. Every `K_*_sound` theorem
proof becomes "by `intros`, then apply the corresponding
constructor".

Historically there were a handful of non-structural rules — those
that genuinely depended on deep meta-theory not yet ported to
mathlib / Coq stdlib / Isabelle's HOL — admitted via per-rule typed
axioms named `<Rule>_iou`. The open-IOU set is now empty: every
former IOU has been either promoted to a structural-premises
constructor (the preferred route) or marked
`DischargedByFramework` with a vetted upstream citation. The
`<Rule>_iou` axiom shape is preserved so that future
re-introductions stay drift-checked; each axiom takes the rule's
actual operands and returns a `Prop`, so the soundness lemma's
operand types are *checked* by the foreign tool even when the
IOU itself discharges the conclusion.

So `external-prover-replay` verifies:

- ✅ Every emitted theorem statement parses and type-checks in
  the foreign tool.
- ✅ For every structural rule, the proof uses a real `Typing`
  constructor — not a placeholder. A bug in the structural
  emission (wrong arity, wrong name, missing premise) fails the
  build.
- ✅ Every IOU axiom name + arity + positional arg-type
  sequence matches the rule registry (drift-detected).  The
  drift surface is closed in **seven dimensions** — every
  dimension fires a pin test at audit time with an actionable
  diagnostic:
   * **Rule status ↔ IOU presence**: per-rule status (`Proved`
     / `Admitted` / `DischargedByFramework`) is cross-validated
     against the actual `<Rule>_iou` axiom presence in the
     emitted theory files.  Catches `Admitted`-without-axiom
     (status drift), `Proved`-with-orphan-axiom (incomplete
     discharge), and `DischargedByFramework`-with-axiom
     (redundant trust extension).
   * **Registry ↔ each foundation (set)**: each foundation's
     IOU axiom block is parsed and its rule-name set asserted
     equal to the canonical IOU registry.  Catches single-
     foundation-only edits (e.g. axiom added to Lean but
     forgotten in Coq).
   * **Three-way set agreement**: direct `Lean = Coq =
     Isabelle` set equality, separating axiom-name drift from
     rule-status drift in the audit output.
   * **Three-way arity agreement**: argument-arrow counts (`→`
     / `->` / `\<Rightarrow>`) are parsed per foundation; all
     three must agree per axiom.  Catches same-name-different-
     arity drift (e.g. `K_Refine_Intro_iou` has 4 args in Lean
     but 5 in Coq).
   * **Registry ↔ each foundation (arity)**: the IOU registry
     declares the canonical arity per axiom; pin tests assert
     each foundation's parsed arity matches the registry,
     anchoring the three-way agreement on a single source of
     truth.
   * **Three-way per-position arg-type agreement**: the
     positional type sequence (excluding `Ctx` and the return
     type) is parsed per foundation; all three must agree per
     axiom in both length and per-position type.  Catches the
     drift class where one foundation has the same arity as
     another but with the args in a different order — invisible
     to arity-only checks.
   * **Kernel registry ↔ Verum corpus (status + citations)**:
     `core/verify/kernel_soundness/theorems.vr` carries the
     parallel Verum-side narrative — per-rule
     `KernelRule.K<Name> => LemmaStatus.<Status>` entries plus,
     for every `DischargedByFramework` rule, the citation triple
     `(lemma_path, framework, citation)`.  Pin tests parse the
     `.vr` corpus and assert per-rule status + citation parity
     with the kernel rule registry (whitespace-normalized so
     multi-line continuations don't generate spurious diffs).
     Catches drift in the framework attribution that cites
     mathlib4 / Coq stdlib / ZFC upstream artifacts — the
     trust-extension surface a foreign auditor clicks through
     to verify a discharge.
- ✅ The shape of `CoreTerm`, `CoreType`, `KernelRule` mirrors the
  kernel's data definitions exactly (encoder bug surface).
- ✅ The IOU axiom registry is currently **empty**
  (`iou_axiom_specs()` returns `vec![]`) — every kernel rule has
  been promoted from open IOU to either a structurally-premised
  `Proved` constructor or a `DischargedByFramework` rule citing
  a vetted upstream proof. See [framework axioms — IOU registry](/docs/verification/framework-axioms#the-iou-axiom-registry--kernel-rule-trust-extension)
  for the full discharge protocol. The historical IOU enumeration
  in §4 below is preserved as context — every entry there has
  since been closed; the drift-check in
  `SoundnessExporter::drift_check` continues to enforce the
  empty-registry invariant.

For a complementary check that exercises the **runtime kernel** —
not just the meta-theory shape — see [differential-lean-checker](./differential-lean-checker.md).
That gate runs a 24-cert battery through both the trusted-base
kernel and the Lean ReferenceChecker and asserts cert-by-cert
verdict agreement.

## 4. Trust extension surface (steady state)

The kernel's trust-extension surface used to admit a handful of
**open IOU axioms** — kernel rules whose soundness lemma was
exported as `axiom <Rule>_iou : Ctx → … → Prop` rather than
proved structurally. The registry is now **empty**:
`iou_axiom_specs()` returns `vec![]`, and every `KernelRule`
carries either a `Proved` or `DischargedByFramework` status in
`canonical_rules()`.

Each entry below names how the rule is currently discharged.
The historical "open IOU" framing is preserved alongside, since
the same shape would re-apply if a brand-new kernel rule were
added that hadn't yet been proved (the registry would re-acquire
an `Admitted` entry plus an `iou_axiom_specs` row, the
`drift_check` would notice, and the audit gate would flip until
the structural proof landed).

### Cubical (CCHM / HoTT mechanisation)

* `K_Path_Ty_Form`, `K_Refl_Intro`, `K_Path_Over_Form`,
  `K_HComp`, `K_Transp`, `K_Glue` — **all `Proved`** via the
  structural-premises template; the side conditions (CCHM
  regularity, Kan-filling compatibility, univalence-via-Glue)
  are the kernel's input contract — verified at runtime in
  `support.rs::normalize_core` rather than re-proved in the
  soundness theorem.

### Refinement (predicate decidability at value)

* `K_Refine`, `K_Refine_Omega`, `K_Refine_Erase`,
  `K_Refine_Intro` — **all `Proved`**. `K_Refine_Intro` uses a
  3-premise structural constructor (`Typing Γ a base`,
  `Typing Γ base (Universe i)`,
  `Typing Γ predicate (Pi x base (Universe 0))`).
  Predicate-truth-at-the-introduced-value remains the kernel's
  runtime contract (mirroring `K_Quot_Elim` discipline).

### Quotient (HIT)

* `K_Quot_Form`, `K_Quot_Intro`, `K_Quot_Elim` — **all `Proved`**
  with structural premises (scrutinee at the quotient, motive
  at the dependent universe, case_fn at the dependent product).
  The respect-of-equivalence side condition that mathlib's
  `Quotient.lift` requires its caller to discharge externally
  remains the kernel's input contract.

### Inductive

* `K_Inductive`, `K_Pos`, `K_Elim` — **all `Proved`**. `K_Elim`
  uses the structural-premises template (mirroring
  `K_Quot_Elim`); `K_Inductive` is premise-free at the export
  layer — by the time the kernel sees an `Inductive_(path,
  args)` term, the strict-positivity invariant has already been
  verified at registration time by the `inductive` keyword
  analogue.

### SMT / replay correctness

* `K_Smt` — **`Proved`**. Discharged via the structural premise
  `T : Universe i ⇒ SmtProof solver_tag : T`; the SMT-certificate
  replay is a kernel runtime contract enforced by
  `replay_smt_cert`.

### Diakrisis (biadjunction + bridge-audit)

* `K_Modal_Box`, `K_Modal_Diamond`, `K_Modal_Big_And`, `K_Shape`,
  `K_Flat`, `K_Sharp`, `K_Universe_Ascent`, `K_Epsilon_Of`,
  `K_Alpha_Of` — **all `Proved`** via the wrap-preserves-typing
  template; the modal-depth recursion / cohesive adjunction
  content is the kernel's input contract.
* `K_Eps_Mu` — **`DischargedByFramework`** citing Mac Lane,
  *Categories for the Working Mathematician*, Theorem IV.7.3
  (biadjunction triangle identities).
* `K_Round_Trip` — **`DischargedByFramework`** citing the
  internal bridge-audit specification.

These nine `DischargedByFramework` entries (the seven structural
mathlib4 rules — K_Pi_Form / K_Lam_Intro / K_App_Elim /
K_Sigma_Form / K_Pair_Intro / K_Fst_Elim / K_Snd_Elim — plus
K_Eps_Mu and K_Round_Trip) are exactly what
`#print axioms kernel_soundness` enumerates.

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

The gate is wired into CI via `.github/workflows/audit-gates.yml`.
Three job tiers:

1. **In-process gates** (every push + PR, ~5 minutes) —
   `--differential-kernel`, `--differential-kernel-fuzz`,
   `--kernel-soundness` (which runs the drift guard),
   `--kernel-rules`, `--kernel-recheck`.  No external toolchain.
2. **Differential Lean checker** (every push + PR, ~10 minutes
   uncached / ~2 minutes cached) — Lake artefacts cached.
3. **Tri-prover replay** (push to main only, ~30 minutes
   uncached / ~5 minutes cached) — Isabelle 2025-2 distribution
   + HOL heap cached; this caching is the load-bearing
   optimisation since first-build of the HOL heap takes 8-12
   minutes on its own.

All three tiers upload `target/audit-reports/` as workflow
artefacts (14-day retention for tiers 1-2, 30-day for tier 3) so
any drift / disagreement detected in CI has a downloadable
forensic record.

The minimal manual `--external-prover-replay` invocation if
you're scripting it outside CI:

```yaml
- name: External-prover replay (Lean + Coq + Isabelle)
  run: |
    # elan + lake
    curl -sSf https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh \
      | sh -s -- -y --default-toolchain leanprover/lean4:v4.29.1
    source $HOME/.elan/env
    # rocq via apt or brew, depending on runner OS
    sudo apt-get install -y coq rocq-prover
    # isabelle 2025-2 (download + extract; brew --cask isabelle on macOS)
    curl -fsSL https://isabelle.in.tum.de/dist/Isabelle2025-2_linux.tar.gz \
      | sudo tar xz -C /opt
    export PATH="/opt/Isabelle2025-2/bin:$PATH"
    # pre-build HOL heap (slowest part on a fresh runner)
    isabelle build -b HOL
    # the tri-prover gate itself
    verum audit --external-prover-replay --strict
```

## 7. Maintenance

When **adding** a kernel rule:

1. Append the rule's identifier to the kernel rule enum.
2. Append a rule spec to the canonical rule registry with status
   set to admitted, citing the meta-theory dependency.
3. Mirror the entry in `core/verify/kernel_soundness/theorems.vr`
   (the drift gate cross-validates the two sides).
4. Run `verum audit --external-prover-replay`.  The gate must
   stay green: `iou-only` is fine, `hard-error` means the
   Lean / Coq / Isabelle emission is broken — fix the emitter
   before merging.

When **promoting** an admit to a real proof:

1. Flip the rule's status from admitted to proved (or
   discharged-by-framework if upstream-cited), supplying a
   concrete tactic chain for each foundation.
2. Provide a tactic chain that closes the goal against the
   placeholder axioms (or — better — a real proof that doesn't
   rely on them).
3. Rerun the gate.  The IOU count decreases; CI doesn't care
   about the absolute number, only about hard-errors.

## 8. Cross-references

- [Trusted Kernel](./trusted-kernel.md) — the TCB this gate gives
  an external second opinion on.
- [Differential Lean Checker](./differential-lean-checker.md) —
  the complementary gate that checks **runtime kernel verdicts**
  against the Lean ReferenceChecker cert-by-cert. Different layer:
  this page proves theorem statements type-check; that page proves
  the operational kernel returns the same accept/reject judgements.
- [Three-Kernel Differential](./three-kernel-differential.md) —
  the within-process complement: the same 24-cert canonical
  battery also flows through three structurally-distinct
  in-process kernels (bidirectional / NbE / manifest-driven) and
  unanimity is asserted cert-by-cert.
- [Verification Pipeline](./verification-pipeline.md) — the
  broader verification strategy this gate is one node of.
- [`verum audit` CLI surface](../tooling/cli.md#kernel-soundness-band-13-gates)
  — full audit-flag table.
- [Trust-extension report](../verification/proof-honesty.md) —
  enumerates every IOU axiom seen by external provers.
