---
sidebar_position: 5
title: "Kernel module map — the trusted infrastructure inventory"
description: "Every module in the `kernel` crate, what it does, what trust it bears, and how the audit gates consume it."
slug: /verification/kernel-module-map
---

# Kernel module map

The `verum_kernel` crate is the trusted infrastructure for Verum's
verification machinery. As of the current revision it ships **67
top-level modules + an 11-file `soundness/` submodule**. This page
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
| `support` | The shared CoreTerm normaliser (`normalize_core` + `NormaliseCtx`), capture-avoiding `substitute`, definitional equality, the cubical face/interval markers, and the SMT-cert replay surface. Not Layer-A trusted in the Π/Σ/Id sense — but Layer-A trusted for **every** broader kernel rule that consumes a normaliser. |
| `term` | The `CoreTerm` data type — proof-term representation. 32 constructors covering Π/Σ/Id + cubical (PathTy/Refl/PathOver/HComp/Transp/Glue) + refinement + quotient (HIT) + inductive + Diakrisis (ε/α/Modal*/Shape/Flat/Sharp). |
| `ctx` | Type-checking context with `iter_outer_to_inner` raw-type API. |
| `errors` | `CheckError` / `KernelError` — the kernel's error surface. |
| `verdict` | `VerificationVerdict` + `DischargeMethod` (ATS-V foundation). |
| `canonical_battery` | The 24-cert canonical battery — single source of truth shared by `verum audit --differential-kernel` (in-process N-kernel) and `--differential-lean-checker` (Rust ↔ Lean). Each `CanonicalCert` carries its own `expected_outcome` (no parallel lookup table). |

These nine modules are the **trusted-base TCB**. A reviewer
auditing Verum's soundness reads these top-to-bottom; every
other module either *cites* one of these or *consumes* its
output without modifying its trust.

---

## 2. Trust layer B — the differential and registry layer

| Module | Role |
|--------|------|
| `differential` | Differential-kernel testing harness — runs every certificate through every registered kernel. |
| `differential_fuzz` | Property-based mutation fuzzer over the kernel registry (11-variant mutation grammar). |
| `kernel_registry` | N-kernel registry trait `KernelImpl` for differential testing. |

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
| `arch` | Eight architectural primitives: Capability / Boundary / Composition / Lifecycle / Foundation / Tier / Stratum / Shape. |
| `arch_parse` | `@arch_module(...)` named-args → `Shape` parser. |
| `arch_phase` | the architectural-type-checking phase — the architectural type-checking phase wired into the compiler pipeline. |
| `arch_anti_pattern` | The 40-pattern anti-pattern catalog (AP-001..AP-040) with stable RFC error codes. |
| `arch_composition` | Composition algebra `Shape ⊗ Shape`. |
| `arch_corpus` | Cross-cog corpus invariants (cycle detection, transitive lifecycle regression). |
| `arch_mtac` | Modal-Temporal Architectural Calculus primitives (Decision / Observer / ModalAssertion / TimePoint / ArchProposition). |
| `arch_counterfactual` | Counterfactual reasoning engine + metric extraction. |
| `arch_adjunction` | Adjunction analyzer for refactoring (4 canonical adjunctions). |
| `arch_yoneda` | Yoneda-equivalence checker per ATS-V spec §20.7. |

For the surface documentation see
[Architecture-as-Types](../architecture-types/index.md).

---

## 5. Verification goals & dispatchers

| Module | Role |
|--------|------|
| `verification_goal` | The verification goal carrier — pure-value obligations. |
| `separation_logic` | Heap-aware separation-logic primitives ([separation logic](./separation-logic.md)). |
| `cert` | `Certificate` envelope: schema_version + verum_version + metadata + replay payload. |
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
| `adjoint_functor` | Adjoint pairs L ⊣ R |
| `cartesian_fibration` | Cartesian / coCartesian fibrations (Lurie HTT §2.4) |
| `cofibration` | Cofibration / fibration discipline |
| `factorisation` | Factorisation systems |
| `grothendieck` | Grothendieck construction (∫: Cat^op → Cat) |
| `infinity_category` | (∞,1)-category primitives |
| `infinity_topos` | (∞,1)-topos primitives |
| `limits_colimits` | Limit / colimit dispatchers |
| `pronk_fractions` | Pronk's bicategory of fractions (1996) |
| `reflective_subcategory` | Reflective subcategory machinery |
| `truncation` | n-truncation τ_{≤n} (Lurie HTT 5.5.6) |
| `universe_ascent` | Universe hierarchy + the K-Univ kernel rule |
| `whitehead` | Whitehead's theorem promotion |
| `yoneda` | Yoneda lemma + the equivalence at L4 |

These modules cite the published mathematical literature; their
content is admitted under `@framework(...)` markers visible to
the [framework-axiom audit](./framework-axioms.md).

---

## 7. Soundness adapters

| Module | Role |
|--------|------|
| `axiom` | `CoreTerm::Axiom` constructor — the only path from external citation into a kernel-checkable term. |
| `framework_citation` | `@framework(name, "...")` → `FrameworkCitation` data layer + manifest collector. |
| `accessibility` | `@accessibility(λ)` Diakrisis Axi-4 marker enumeration. |
| `foundation_profile` | Foundation profiles (ZFC / HoTT / Cubical / Cic / MLTT / Eff / Custom). |
| `foreign_system` | External system citations (Coq, Lean, Isabelle, the SMT backend). |
| `diakrisis_bridge` | The α/ε bidirectional bridge primitives (Diakrisis 108.T). |
| `eps_mu` | ε-μ-style coherence machinery. |
| `depth` | M-iteration depth witnesses for K-Refine. |

### 7a. The `soundness/` submodule

The kernel exports a per-foundation soundness theorem to **three
independent proof assistants** (Lean 4, Coq, Isabelle/HOL). The
exporter lives in its own submodule:

| Module | Role |
|--------|------|
| `soundness::mod` | The IOU axiom registry (`iou_axiom_specs`), the canonical 38-rule list (`canonical_rules`) with `LemmaStatus = Proved | DischargedByFramework | Admitted`, and the cross-foundation drift checker. Currently 29 Proved + 9 DischargedByFramework + 0 Admitted. |
| `soundness::lean` | `LeanBackend` — emits `inductive Typing : Ctx → CoreTerm → CoreTerm → Prop` with structural per-rule constructors, plus the case-analysis `kernel_soundness` theorem. |
| `soundness::coq` | `CoqBackend` — emits the same shape in Coq syntax, with `apply (T_var ...)` style lemma proofs. |
| `soundness::isabelle` | `IsabelleBackend` — emits Isabelle/HOL `inductive Typing` with ⊢ turnstile syntax + per-rule `lemma … by (rule T_*)` proofs and the Π-form `Soundness :: KernelRule ⇒ bool` definition. |
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
| `tactic_elaborator` | Tactic-DSL elaborator: `proof { ... }` block → `CoreTerm`. |
| `tactics_industrial` | Industrial-strength tactic library (the 56-tactic stdlib's kernel-side dispatch). |
| `proof_tree` | `KernelProofNode` — the inference-tree representation. |
| `proof_view` | Proof-tree presentation (auditor-facing rendering). |
| `mechanisation_roadmap` | The HTT / Arnold mechanisation roadmap manifests. |

---

## 10. Round-trip + cross-format

| Module | Role |
|--------|------|
| `round_trip` | Proof-export + re-import round-trip verification (`verum audit --round-trip`). |
| `cross_format_gate` | Cross-format coverage matrix (which proofs export to which prover). |

These modules underwrite the [proof-export](./proof-export.md)
pipeline's soundness claims.

---

## 11. Performance + caching

| Module | Role |
|--------|------|
| `normalize_cache` | `StructuralHash` + β-reduction memoisation cache; the `definitional_eq` fast-path. |
| `ordinal` | Ordinal-arithmetic primitives (used by `NuOrdinal` and the reflection tower). |

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
ATS-V                                   : 11 modules (incl. arch_capability_inference)
Verification goals / dispatchers        :  6 modules
Categorical infrastructure              : 14 modules
Soundness adapters                      :  8 modules + soundness/ submodule (11 files)
Codegen attestation                     :  1 module
Tactics / proof tree                    :  5 modules
Round-trip / cross-format               :  2 modules
Performance / caching                   :  2 modules
Library entry point                     :  1 module (lib.rs)
                                        ─────
                                          78 files total
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
