---
sidebar_position: 5
title: "Kernel module map — the trusted infrastructure inventory"
description: "Every module in `crates/verum_kernel/`, what it does, what trust it bears, and how the audit gates consume it."
slug: /verification/kernel-module-map
---

# Kernel module map

The `verum_kernel` crate is the trusted infrastructure for Verum's
verification machinery. As of the current revision it ships **63
modules**. This page is the canonical inventory: every module
listed, what it does, which trust layer it sits on, and which
audit gate consumes it.

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

| Module | LOC | Role |
|--------|-----|------|
| `proof_checker` | ~786 | **The trusted base.** Minimal CoC checker (6 rules). Bidirectional `infer` + `check`. |
| `proof_checker_nbe` | ~713 | **Second algorithmic kernel.** Normalisation-by-Evaluation for [differential testing](./two-kernel-architecture.md). |
| `proof_checker_meta` | — | Universe-lift mechanism for meta-mode (Gödel-2nd workaround foundation). |
| `term` | — | The `CoreTerm` data type — proof-term representation. |
| `ctx` | — | Type-checking context (de Bruijn-indexed binders). |
| `errors` | — | `CheckError` / `KernelError` — the kernel's error surface. |
| `verdict` | — | `VerificationVerdict` + `DischargeMethod` (ATS-V foundation). |

These seven modules are the **trusted-base TCB**. A reviewer
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
| `arch_phase` | Phase 6.5 — the architectural type-checking phase wired into the compiler pipeline. |
| `arch_anti_pattern` | The 32-pattern anti-pattern catalog with stable RFC error codes. |
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
| `foreign_system` | External system citations (Coq, Lean, Isabelle, Z3, CVC5). |
| `diakrisis_bridge` | The α/ε bidirectional bridge primitives (Diakrisis 108.T). |
| `eps_mu` | ε-μ-style coherence machinery. |
| `depth` | M-iteration depth witnesses for K-Refine. |

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
| `normalize_cache` | β-reduction memoisation cache for the trusted-base normaliser. |
| `support` | Shared utilities (text, formatting, common types). |
| `ordinal` | Ordinal-arithmetic primitives (used by `NuOrdinal` and the reflection tower). |

---

## 12. The library entry point

| Module | Role |
|--------|------|
| `lib` | The crate's `lib.rs` — re-exports the public API and ships ~837 LOC of integration code (the `KERNEL_RULE_NAMES` constant, the public-API `KernelProofNode` re-export, the `record_inference` helper, etc). |

---

## 13. Module count summary

```
Layer A — irreducible core              :  7 modules
Layer B — differential / registry       :  3 modules
Layer C — meta-soundness                :  5 modules
ATS-V                                   : 10 modules
Verification goals / dispatchers        :  6 modules
Categorical infrastructure              : 14 modules
Soundness adapters                      :  8 modules
Codegen attestation                     :  1 module
Tactics / proof tree                    :  5 modules
Round-trip / cross-format               :  2 modules
Performance / caching                   :  3 modules
Library entry point                     :  1 module (lib.rs)
                                        ─────
                                          63 modules total (~58 KLOC)
```

The trusted-base subset (Layer A) is **&lt; 1500 LOC** — the
auditor-readable irreducible core. Everything else either cites
Layer A or consumes its output.

---

## 14. Cross-references

- [Trusted kernel](./trusted-kernel.md) — the three-layer rule
  architecture.
- [Two-kernel architecture](./two-kernel-architecture.md) — Layer B.
- [Reflection tower](./reflection-tower.md) — Layer C.
- [Separation logic](./separation-logic.md) — the
  `separation_logic` module's user surface.
- [Framework axioms](./framework-axioms.md) — the citation
  inventory consuming `framework_citation`.
- [Architecture-as-Types](../architecture-types/index.md) — the
  `arch_*` modules.
- [Audit protocol](../architecture-types/audit-protocol.md) —
  the gates consuming all of the above.
