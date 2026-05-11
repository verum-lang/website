---
sidebar_position: 5
title: "Kernel module map — the trusted infrastructure inventory"
description: "Every module in the `kernel` crate, what it does, what trust it bears, and how the audit gates consume it."
slug: /verification/kernel-module-map
---

# Kernel module map

The `verum_kernel` crate is the trusted infrastructure for Verum's
verification machinery. As of the current revision it ships **67
top-level modules + a 12-file `soundness/` submodule**. This page
is the canonical inventory: every module listed, what it does,
which trust layer it sits on, and which audit gate consumes it.

The discipline of an enumerable trust boundary cuts both ways:
auditors get a complete map; new contributors learn the codebase
faster. There is no implicit trust — every module's role is
documented.

For the layered architecture overview see
[Trusted kernel](./trusted-kernel.md). For the audit gates that
consume these modules see
[Audit protocol](../architecture-types/audit-protocol.md).

---

## 1. Trust layer A — the irreducible core

The minimum that must be trusted for soundness:

| Module | Role |
|--------|------|
| `proof_checker` | **The trusted base (Algorithm A).** Extended-CoC checker (Π/Σ/Id with universe polymorphism + the four DEFECT-{1,2,3,4} fixes) — 13 inference rules, bidirectional `infer` + `check`, fuel-bounded `whnf`, capture-avoiding `subst`. |
| `proof_checker_nbe` | **Second algorithmic kernel (Algorithm B).** Normalisation-by-Evaluation with closures + level-indexed `quote`. Mirrors all four DEFECT fixes including `Neutral::NStuck` for the App-of-non-function gate. See [differential testing](./two-kernel-architecture.md). |
| `kernel_registry::KernelV0Kernel` | **Third algorithmic kernel (Algorithm C).** Manifest-driven bootstrap verifier — anchors structural type-check, manifest audit-cleanness, meta-soundness footprint, per-rule strict-intrinsic dispatch. |
| `proof_checker_meta` | Universe-lift mechanism for meta-mode (Gödel-2nd workaround foundation). Hosts the canonical `shift_universes` walker + the binding-site-correct `shift_universes_in_context`. |
| `support` | The shared CoreTerm normaliser family (`normalize` / `normalize_full` / `normalize_with_axioms` / `normalize_with_inductives` over a `NORMALIZE_STEP_LIMIT`-bounded driver), capture-avoiding `substitute`, `definitional_eq` / `definitional_eq_with_axioms`, the cubical face/interval markers (`is_face_top` / `is_face_bot` / `is_interval_one`), and the SMT-cert replay surface (`replay_smt_cert` / `replay_smt_cert_with_obligation`). Not Layer-A trusted in the Π/Σ/Id sense — but Layer-A trusted for **every** broader kernel rule that consumes a normaliser. |
| `term` | The `CoreTerm` data type — proof-term representation. 31 constructors covering Π/Σ + cubical (PathTy/Refl/PathOver/HComp/Transp/Glue) + refinement + quotient (Quotient/QuotIntro/QuotElim) + inductive (Inductive/Elim) + SMT-proof + framework axiom + Diakrisis (EpsilonOf/AlphaOf/ModalBox/ModalDiamond/ModalBigAnd/Shape/Flat/Sharp). |
| `ctx` | Typing context (`Context`) + framework-axiom attribution (`FrameworkId`). Surface: `extend` / `lookup` / `depth`; every registered axiom carries a `FrameworkId` so `verum audit --framework-axioms` can enumerate the full external-trust set. |
| `errors` | `CheckError` / `KernelError` — the kernel's error surface. |
| `verdict` | Canonical `VerificationVerdict` type — single source of truth for verification verdicts across the kernel + audit surface (replaces 5 parallel verdict types from earlier revisions). |
| `canonical_battery` | The 24-cert canonical battery — single source of truth shared by `verum audit --differential-kernel` (in-process N-kernel) and `--differential-lean-checker` (Rust ↔ Lean). Each `CanonicalCert` carries its own `expected_outcome` (no parallel lookup table). |

These ten modules are the **trusted-base TCB**. A reviewer
auditing Verum's soundness reads these top-to-bottom; every
other module either *cites* one of these or *consumes* its
output without modifying its trust.

---

## 2. Trust layer B — the differential and registry layer

| Module | Role |
|--------|------|
| `differential` | Differential-kernel testing harness — runs every certificate through every registered kernel. |
| `differential_fuzz` | Property-based mutation fuzzer over the kernel registry (11-variant mutation grammar). |
| `kernel_registry` | N-kernel registry trait `KernelChecker` (`name` + `description` + `verify`) + `KernelV0Kernel` (Algorithm C) + `verify_all` aggregator producing an `AgreementVerdict`. |

These modules surface *kernel-implementation* trust at audit time
(`verum audit --differential-kernel{,-fuzz}`).

---

## 3. Trust layer C — the audit registry & meta-soundness

| Module | Role |
|--------|------|
| `zfc_self_recognition` | The 7-rule `KernelRuleId` audit registry + per-rule ZFC + inaccessible decomposition. |
| `reflection_tower` | MSFS-grounded 4-stage meta-soundness ([reflection tower](./reflection-tower.md)). |
| `reflection` | Meta-level reflection primitives (Gödel-coding, term reflection). |
| `godel_coding` | Gödel-numbering for meta-level proof manipulation. |
| `proof_checker_meta` | Universe-lift wrapper running the proof_checker with one extra inaccessible. |

These modules realise the *meta-soundness* layer that protects
the trusted base from Gödel-2nd-style self-reference.

---

## 4. Architectural type system (ATS-V)

| Module | Role |
|--------|------|
| `arch` | Six top-level architectural primitives — `Capability` / `Boundary` / `Lifecycle` / `Foundation` / `Tier` / `Shape` (composition relations live in `arch_composition`, MSFS-stratum classification in `MsfsStratum`). |
| `arch_parse` | `@arch_module(...)` named-args → `Shape` parser. |
| `arch_phase` | the architectural-type-checking phase — the architectural type-checking phase wired into the compiler pipeline. |
| `arch_anti_pattern` | The 40-pattern anti-pattern catalog (AP-001..AP-040) with stable RFC error codes. |
| `arch_composition` | Composition algebra `Shape ⊗ Shape`. |
| `arch_corpus` | Cross-cog corpus invariants (cycle detection, transitive lifecycle regression). |
| `arch_mtac` | Modal-Temporal Architectural Calculus primitives (Decision / Observer / ModalAssertion / TimePoint / ArchProposition). |
| `arch_counterfactual` | Counterfactual reasoning engine + metric extraction. |
| `arch_adjunction` | Adjunction analyzer for refactoring (4 canonical adjunctions). |
| `arch_yoneda` | Yoneda-equivalence checker per ATS-V spec §20.7. |
| `arch_capability_inference` | Capability ontology — primitive-call → `Capability` resolver feeding `PhaseInputs.inferred_used_capabilities` (AP-001 CapabilityEscalation). |
| `arch_transitive` | Transitive peer-graph traversal for multi-hop ATS-V checks (AP-019 FoundationDowngrade, etc.). |

For the surface documentation see
[Architecture-as-Types](../architecture-types/index.md).

---

## 5. Verification goals & dispatchers

| Module | Role |
|--------|------|
| `verification_goal` | Unified `VerificationGoal` type — the single verification surface covering function contracts, theorem propositions, and refinement-type predicates. |
| `separation_logic` | Heap-aware separation-logic primitives — the verification surface for stateful programs ([separation logic](./separation-logic.md)). |
| `cert` | `SmtCertificate` envelope (schema-versioned) carrying a backend-specific proof trace plus obligation hash; the mechanism that takes Z3 / CVC5 / E / Vampire / Alt-Ergo **out of the TCB** — a buggy solver's spurious proof fails replay rather than leaking into accepted theorems. |
| `intrinsic_dispatch` | Kernel intrinsic registry dispatch (every `kernel_*` audit-time function). |
| `inductive` | Inductive type registration + strict-positivity walker (`K-Pos`). |
| `infer` | Type inference machinery for the broader kernel surface. |

---

## 6. Categorical infrastructure

A substantial part of the kernel ships ∞-categorical primitives
used by the proof corpora. Each module corresponds to a named
mathematical structure:

| Module | Mathematical structure |
|--------|----------------------|
| `adjoint_functor` | Adjoint Functor Theorem (HTT 5.5.2.9 / Special AFT) — V0 algorithmic kernel rule constructing adjoint pairs L ⊣ R from solution-set conditions. |
| `cartesian_fibration` | Cartesian / coCartesian fibrations (HTT 3.1) + Straightening / Unstraightening (HTT 3.2.0.1) — algorithmic kernel rules. |
| `cofibration` | Cubical cofibration calculus — interval subsumption + face-formula algebra (M-VVA-FU Sub-2.4-cubical). |
| `factorisation` | Factorisation systems on (∞,1)-categories — V0 algorithmic kernel rule (HTT 5.2.8). |
| `grothendieck` | ∞-Grothendieck construction (HTT 5.1.4) — algorithmic kernel rule. |
| `infinity_category` | Native (∞,n)-categorical kernel infrastructure. |
| `infinity_topos` | (∞,1)-topos infrastructure — algorithmic kernel rule (Lurie HTT 6.1). |
| `limits_colimits` | Limits and colimits in (∞,1)-categories — algorithmic kernel rule (HTT 1.2.13 + HTT 5.5.3 + HTT 4.4). |
| `pronk_fractions` | Pronk's bicategory of fractions (Pronk 1996, *Compositio Mathematica* 102.3). |
| `reflective_subcategory` | Reflective subcategories (HTT 5.2.7) — algorithmic kernel rule. |
| `truncation` | n-truncation τ_{≤n} for (∞,1)-categories — V0 algorithmic kernel rule (HTT 5.5.6). |
| `universe_ascent` | Categorical-coherence `K-Universe-Ascent` kernel rule + `UniverseTier` — verifies meta-classifier applications `M_stack(α)` ascend the universe hierarchy soundly. |
| `whitehead` | Whitehead criterion for (∞,n)-equivalence — V0 algorithmic kernel rule (HTT 1.2.4.3 generalised). |
| `yoneda` | Yoneda embedding + ∞-Kan extensions — algorithmic kernel rules. |

These modules cite the published mathematical literature; their
content is admitted under `@framework(...)` markers visible to
the [framework-axiom audit](./framework-axioms.md).

---

## 7. Soundness adapters

| Module | Role |
|--------|------|
| `axiom` | `CoreTerm::Axiom` constructor — the only path from external citation into a kernel-checkable term. |
| `framework_citation` | `@framework(name, "...")` → `FrameworkCitation` data layer + manifest collector. |
| `accessibility` | Adámek-Rosický 1.26 — algorithmic λ-filtered colimit closure of κ-accessible categories (the second MSFS load-bearing pivot after HTT 5.1.4 Grothendieck construction; unblocks MSFS §6.1 β-part Step 4 and the AR-AFT-based Lemma 10.3 (ι, r) construction). |
| `foundation_profile` | The `FoundationProfile` enum — 10 variants spanning the ZFC family (`Zfc`, `ZfcOneInaccessible`, `ZfcTwoInaccessibles`, `ZfcThreeInaccessibles`), the MLTT family (`Mltt`, `MlttUip`, `PredicativeMltt`), `Hott`, `Cubical`, and `Cic`. Drives per-corpus foundation classification + audit filtering. |
| `foreign_system` | The `ForeignSystem` enum — single source of truth for the 7 external proof systems Verum exports / re-checks against (`Coq`, `Lean4`, `Mizar`, `Isabelle`, `Agda`, `Dedukti`, `Metamath`). |
| `diakrisis_bridge` | Diakrisis bridge admits + `BridgeAudit` ledger — explicit named axioms that surface type-theoretic results currently outside the kernel's decidable fragment (confluence-of-modal-rewrite, quotient canonical-representative, cohesive adjunction unit/counit, ε-μ τ-witness, Drake reflection extended). Trusted boundary for `K-Round-Trip`'s universal-canonicalize discipline. |
| `eps_mu` | `K-Eps-Mu` kernel-rule machinery — verifies the canonical 2-natural equivalence `τ : ε ∘ M ≃ A ∘ ε` from Diakrisis Proposition 5.1 / Corollary 5.10 (ν = e ∘ ε). |
| `depth` | M-iteration depth witnesses for the refinement family — both `m_depth` (finite-valued, Diakrisis T-2f*, used by baseline `K-Refine`) and `m_depth_omega` (ordinal-valued via Cantor-normal-form prefix below ε₀, Theorem 136.T transfinite stratification, used by `K-Refine-omega`). |

### 7a. The `soundness/` submodule

The kernel exports a per-foundation soundness theorem to **four
independent proof assistants** (Lean 4, Coq / Rocq, Isabelle/HOL,
Cubical Agda). The exporter lives in its own submodule:

| Module | Role |
|--------|------|
| `soundness::mod` | The IOU axiom registry (`iou_axiom_specs`), the canonical 38-rule list (`canonical_rules`) with `LemmaStatus = Proved | DischargedByFramework | Admitted`, and the cross-foundation drift checker. Empty IOU registry (`iou_axiom_specs()` returns `vec![]`) — every kernel rule is either `Proved` or `DischargedByFramework` with a cited upstream proof. |
| `soundness::lean` | `LeanBackend` — emits `inductive Typing : Ctx → CoreTerm → CoreTerm → Prop` with all 38 introduction rules + a case-analysis `theorem kernel_soundness : ∀ rule, Soundness rule`. |
| `soundness::coq` | `CoqBackend` — emits the same shape in Coq syntax, with `apply (T_var ...)` style lemma proofs and the same case-analysis aggregate theorem. |
| `soundness::isabelle` | `IsabelleBackend` — emits Isabelle/HOL with the 9 structural rules as an `inductive Typing` declaration; the remaining 29 rules as **independent per-rule `axiomatization where T_<n>: "..."` blocks** (no `and`-chaining), each axiom statement data-driven from the rule's `assumes`/`shows` lemma signature. Per-rule lemmas with status `Admitted` / `DischargedByFramework` emit as their own `axiomatization where K_<n>_sound: "..."` blocks (the lemma name registers as a kernel-level fact without requiring `quick_and_dirty` mode). The aggregate theorem is the `lemmas kernel_full_soundness =` bundle — no case-of `definition Soundness`, since Isabelle's eager `definition` elaboration cannot handle a 38-branch case-of body at universe-polymorphic free-variable density. |
| `soundness::agda` | `AgdaBackend` — emits Cubical Agda (`{-# OPTIONS --cubical #-}`); per-rule `K_<n>-sound` postulates whose signatures are type-checked end-to-end, plus per-IOU `<Rule>_iou : Ctx → … → Set` postulate blocks generated via `render_iou_axioms_agda()` (the `_agda` member of the four-foundation IOU lockstep — see `IouArgType::agda_repr()`). Cubical Agda is the only major prover with native CCHM cubical support, so it closes the cubical-fragment gap that Lean / Coq / Isabelle leave at the meta-theoretic level. |
| `soundness::discharge_status` | The `DischargeStatus` / `LemmaStatus` ADT shared with `kernel_v0_manifest` and `codegen_attestation`. |
| `soundness::kernel_v0_manifest` | The `kernel_v0` manifest verifier table (10 bootstrap rules: K-Var/K-Univ/K-Pi-Form/…). |
| `soundness::apply_graph` | Apply-graph audit walker for `verum audit --apply-graph`. |
| `soundness::corpus_export` | Per-foundation corpus serialiser. |
| `soundness::expr_translate` + `soundness::proof_body_translate` | AST → per-foundation expression / tactic-script translators. |

The trust-extension report (`verum audit --trust-extension-report`)
walks `iou_axiom_specs()` and emits the structured Proved /
DischargedByFramework / Admitted breakdown — see
[framework axioms](./framework-axioms.md#the-iou-axiom-registry--kernel-rule-trust-extension)
for the full discharge protocol.

---

## 8. Codegen-attestation

| Module | Role |
|--------|------|
| `codegen_attestation` | Per-pass codegen kernel-discharge manifest (CompCert-style simulation theorems). |

The audit gate `verum audit --codegen-attestation` walks every
codegen pass's per-pass invariant.

---

## 9. Tactic + proof infrastructure

| Module | Role |
|--------|------|
| `tactic_elaborator` | Tactic-to-proof-term elaboration — connects Verum proof bodies (`proof { ... }` blocks) to kernel-checkable `Certificate` values via `CoreTerm`. |
| `tactics_industrial` | Industrial-grade tactic infrastructure — production tactics (`lia` / `decide` / `induction` / `congruence` / `eauto` / …) that close subgoals via decision procedures or structural recursion, **not** via SMT delegation. |
| `proof_tree` | `KernelProofNode` + Phase-2 proof-tree replay foundation for Z3 `(proof …)` and CVC5 ALETHE proof-format consumption. |
| `proof_view` | Interactive proof-state explorer — current surface for stepping through the kernel's inference tree. |
| `mechanisation_roadmap` | The HTT + Adámek-Rosický mechanisation roadmap manifests — V0 algorithmic kernel rule pinning the trajectory from cited admits to fully kernel-checked discharges. |

---

## 10. Round-trip + cross-format

| Module | Role |
|--------|------|
| `round_trip` | `K-Round-Trip` kernel rule — OC/DC translation round-trip admission (Theorem 108.T / Theorem 16.10). Surface: `check_round_trip{,_v2}`, `canonical_form`, `enumerate_bridge_admits`. Drives `verum audit --round-trip` (108.T round-trip per theorem). |
| `cross_format_gate` | Cross-format CI hard gate — coverage matrix tracking which proofs export to which prover, surfacing gaps to the audit pipeline. |

These modules underwrite the [proof-export](./proof-export.md)
pipeline's soundness claims.

---

## 11. Performance + caching

| Module | Role |
|--------|------|
| `normalize_cache` | `NormalizeCache` — DashMap memo for `support::normalize` / `normalize_with_axioms` / `normalize_with_inductives` keyed on a stable structural hash; the `definitional_eq` fast-path. |
| `ordinal` | Native ordinal arithmetic for the kernel — Cantor normal form with large-cardinal extensions; consumed by the modal-depth machinery (`depth::m_depth_omega`) and the reflection tower. |

(`support` was previously listed here; it is now in Layer A —
the unified `normalize_core` driver makes it load-bearing for
every kernel rule that consumes a normaliser.)

---

## 12. The library entry point

| Module | Role |
|--------|------|
| `lib` | The crate's `lib.rs` — re-exports the public API plus integration code (the `KERNEL_RULE_NAMES` constant, the public-API `KernelProofNode` re-export, the `record_inference` helper, etc). |

---

## 13. Module count summary

```
Layer A — irreducible core              : 10 modules
Layer B — differential / registry       :  3 modules
Layer C — meta-soundness                :  4 modules (includes proof_checker_meta)
ATS-V                                   : 12 modules (incl. arch_capability_inference + arch_transitive)
Verification goals / dispatchers        :  6 modules
Categorical infrastructure              : 14 modules
Soundness adapters                      :  8 modules + soundness/ submodule (12 files)
Codegen attestation                     :  1 module
Tactics / proof tree                    :  5 modules
Round-trip / cross-format               :  2 modules
Performance / caching                   :  2 modules
Library entry point                     :  1 module (lib.rs)
                                        ─────
                                          79 files total
```

The Layer A irreducible core (`proof_checker.rs` + the supporting
`support.rs` driver that every kernel rule consumes for
normalisation and definitional equality) is the auditor-readable
trusted base. Everything else either cites Layer A or consumes
its output. `cargo test -p verum_kernel --lib` pins an extensive
lib-test suite plus integration tests against this boundary.

---

## 14. Cross-references

- [Trusted kernel](./trusted-kernel.md) — the three-layer rule
  architecture.
- [Three-kernel architecture](./two-kernel-architecture.md) — Layer B.
- [Reflection tower](./reflection-tower.md) — Layer C.
- [Separation logic](./separation-logic.md) — the
  `separation_logic` module's user surface.
- [Framework axioms](./framework-axioms.md) — the citation
  inventory consuming `framework_citation`.
- [Architecture-as-Types](../architecture-types/index.md) — the
  `arch_*` modules.
- [Audit protocol](../architecture-types/audit-protocol.md) —
  the gates consuming all of the above.
