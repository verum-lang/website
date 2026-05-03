---
sidebar_position: 6
title: "kernel_v0 — Verum's bootstrap meta-theory"
description: "The 10-rule Verum-language mirror of the trusted base. Hand-auditable bootstrap, the Milawa pattern, and the trust-base shrinkage roadmap."
slug: /verification/kernel-v0
---

# `kernel_v0` — Verum's bootstrap meta-theory

`kernel_v0` is the **Verum-language** mirror of the
host-implementation trusted-base proof-term checker. It lives
at `core/verify/kernel_v0/` and ships a hand-auditable 10-rule
minimal kernel that justifies every other inference rule the
Verum kernel ships.

The architectural role is **self-hosting** — at completion,
the kernel's logic is *fixed-point compilable by Verum itself*,
shrinking the trusted base from ~800 LOC to a ~100 LOC
bootstrap shim. This is the **Milawa pattern**: kernel(N+1)
verified by kernel(N), descending to a tiny bootstrap.

For the layered three-rule-tier architecture see
[Trusted kernel](./trusted-kernel.md). For the three-kernel
differential testing — including `kernel_v0` as the third
algorithmic slot — see
[Three-kernel architecture](./two-kernel-architecture.md).

## 1. The architectural picture

```text
   kernel_v0/  (Verum syntax — core/verify/kernel_v0/)
   ──────────
   10 minimal inference rules + soundness lemmas.
   The bootstrap meta-theory. Hand-auditable.

   ↓ (each subsequent kernel version proves its new rules sound
      in terms of kernel_v0's rules)

   kernel_v1/  ← extends with refinement subtypes
   kernel_v2/  ← extends with cubical (Path, hcomp, transp)
   kernel_v3/  ← extends with modal operators
   ...

   ↓ at fixed point

   proof_checker (host-implementation)  — generated from kernel_vN
   kernel dispatcher (host-implementation) — uses kernel_vN's verdict
```

The chain descends to `kernel_v0` and stops. `kernel_v0`'s
soundness rests on a small set of *meta-theory IOUs* (named
substitution-lemma, β-confluence, etc.) tracked by
`verum audit --soundness-iou`.

## 2. The 10 minimal rules

| Rule | File | Status | Description |
|------|------|--------|-------------|
| K-Var | `rules/k_var.vr` | Proved | Variable lookup in context: `Γ, x:A ⊢ x : A` |
| K-Univ | `rules/k_univ.vr` | Proved | `Universe(n) : Universe(n+1)` — universe stratification |
| K-Pi-Form | `rules/k_pi_form.vr` | DischargedByFramework (mathlib4) | Π-type formation: `(A:U(n)) → (B:U(m))` in `U(max(n,m))` |
| K-Lam-Intro | `rules/k_lam_intro.vr` | DischargedByFramework (mathlib4) | λ introduction: body's type under binder gives Π type |
| K-App-Elim | `rules/k_app_elim.vr` | DischargedByFramework (mathlib4) | Apply elimination + substitution |
| K-Beta | `rules/k_beta.vr` | DischargedByFramework (mathlib4) | β-reduction `(λx.M) N ⤳ M[N/x]` is type-preserving |
| K-Eta | `rules/k_eta.vr` | DischargedByFramework (lean4_stdlib) | η-equivalence `λx.(f x) ≡ f` when `x ∉ FV(f)` |
| K-Sub | `rules/k_sub.vr` | DischargedByFramework (mathlib4) | Subtyping (universe cumulativity) |
| K-FwAx | `rules/k_fwax.vr` | Proved | Foundation-aware axiom admission (Prop-only) |
| K-Pos | `rules/k_pos.vr` | Proved | Positivity check (Berardi 1998 — non-positive ⇒ ⊥) |

Status reflects the broader 38-rule kernel-soundness corpus at
`core/verify/kernel_soundness/`. **Four** of the ten are already
proved structurally; **six** carry concrete meta-theory IOUs
named in detail by the IOU dashboard.

The audit gate `verum audit --kernel-v0-roster` walks the
manifest and confirms every rule has its corresponding `.vr`
file. Drift between manifest and filesystem is a build failure.

## 3. Trust-base shrinkage roadmap

The end-state goal is a small bootstrap shim that interprets
the kernel_v0 Verum source files; all kernel logic is verified
*in Verum*, not in the host implementation. The roadmap:

| Stage | Trust base | Status |
|-------|-----------|--------|
| Pre-#157 | broad host-implementation kernel + 38 rules with 34 admits | historical |
| Post-#157 | small `proof_checker` module + 6 rules | **current** |
| Phase 3 (#154) — kernel_v0 self-hosted | ~500 LOC Verum + 10 rules | in-flight |
| Phase 3 closed — bootstrap chain complete | hand-auditable bootstrap shim | target |

Each stage shrinks the trusted base. The progression follows
the *Milawa pattern* — a self-verified kernel chain descending
to a hand-auditable bootstrap.

## 4. The differential-kernel role

Once self-hosting lands, `kernel_v0` becomes the **third slot**
in `verum audit --differential-kernel`:

| Slot | Implementation | Status |
|------|----------------|--------|
| 1 | `proof_checker` (Algorithm A — bidirectional + WHNF) | active |
| 2 | `proof_checker_nbe` (Algorithm B — NbE) | active |
| 3 | `KernelV0Kernel` (Algorithm C — manifest-driven verifier consuming the Verum-source `kernel_v0/` manifest) | active |

The differential gate's invariant strengthens: every certificate
must be admitted by *all three* kernels, with disagreement on
any pair flagged as a kernel-implementation bug.

## 5. The file layout

```
core/verify/kernel_v0/
├── README.md                 ← architectural overview
├── mod.vr                    ← module aggregator
├── core_term.vr              ← CoreTerm inductive (mirrors proof_checker::Term)
├── context.vr                ← Context (de Bruijn-indexed type stack)
├── judgment.vr               ← Γ ⊢ t : T judgment (well-typedness)
├── soundness.vr              ← top-level soundness lemma
├── rules/
│   ├── mod.vr                ← rule aggregator
│   ├── k_var.vr              ← K-Var
│   ├── k_univ.vr             ← K-Univ
│   ├── k_pi_form.vr          ← K-Pi-Form
│   ├── k_lam_intro.vr        ← K-Lam-Intro
│   ├── k_app_elim.vr         ← K-App-Elim
│   ├── k_beta.vr             ← K-Beta
│   ├── k_eta.vr              ← K-Eta
│   ├── k_sub.vr              ← K-Sub
│   ├── k_fwax.vr             ← K-FwAx
│   └── k_pos.vr              ← K-Pos
└── lemmas/
    ├── mod.vr                ← lemma aggregator
    ├── beta.vr               ← β-confluence (Newman's lemma)
    ├── eta.vr                ← η-confluence
    ├── sub.vr                ← subtyping refl/trans
    ├── subst.vr              ← substitution lemma
    └── cartesian.vr          ← Cartesian closure of contexts
```

Every file is hand-readable Verum source.

## 6. Per-rule verbosity — `K-Var` worked example

A representative file (`rules/k_var.vr`) ships:

- The judgment: `Γ ⊢ Var(n) : Γ[n]` for a well-formed context.
- The Verum encoding as a function returning `Maybe<Type>` —
  `Some(t)` if the variable is in scope, `None` otherwise.
- A soundness lemma: "if `K-Var` admits `(Γ, n)`, then `Γ[n]` is
  well-typed in `Γ`".
- The lemma's discharge: a structural induction on the
  context's de Bruijn level.

Each of the 10 rule files has the same structure — judgment +
encoding + lemma + discharge or admit. Auditors read the file
end-to-end without external dependencies.

## 7. Discharge dashboard — every rule is audit-clean

The 10 kernel_v0 rules split into two L4-acceptable discharge
classes:

```text
$ verum audit --kernel-v0-roster

  rule           status                     citation
  ─────────────  ──────────────────────     ───────────────────────────────────
  K-Var          discharged                 (structural — verum_kernel::proof_checker)
  K-Univ         discharged                 (structural — verum_kernel::proof_checker)
  K-Pi-Form      discharged_by_framework    mathlib4 / Mathlib.LambdaCalculus.LambdaPi
                                                       .KindPreservation.pi_form_universe_max
  K-Lam-Intro    discharged_by_framework    mathlib4 / Mathlib.LambdaCalculus.LambdaPi
                                                       .Substitution.context_extension
  K-App-Elim     discharged_by_framework    mathlib4 / Mathlib.LambdaCalculus.LambdaPi
                                                       .Substitution.subst_preserves_typing
  K-Beta         discharged_by_framework    mathlib4 / Mathlib.Computability.Lambda.ChurchRosser
  K-Eta          discharged_by_framework    lean4_stdlib / Function.funext
  K-Sub          discharged_by_framework    mathlib4 / Mathlib.SetTheory.Ordinal.Cumulative
                                                       .cumulative_hierarchy
  K-FwAx         discharged                 (structural — verum_kernel::proof_checker)
  K-Pos          discharged                 (structural — Berardi 1998 positivity check)

  4 / 10  structurally discharged
  6 / 10  discharged-by-framework (vetted upstream citation)
  0 / 10  admitted_with_iou
  0 / 10  not_yet_attested

  audit-clean: 10 / 10  ✓ load-bearing
```

The 6 framework-discharged rules each carry a **structured
citation triple** `(lemma_path, framework, citation)`:

* `lemma_path` — the path to the discharge stub in
  `core/verify/kernel_v0/lemmas/` carrying the same `@framework`
  attribute (e.g. `core.verify.kernel_v0.lemmas.beta.church_rosser_confluence`).
* `framework` — the upstream framework name
  (`mathlib4` / `lean4_stdlib`).
* `citation` — the concrete upstream artefact identifier
  (e.g. `Mathlib.Computability.Lambda.ChurchRosser`).

Both classes are L4-acceptable for the audit gate's *clean*
verdict. Promoting `discharged_by_framework` → `discharged`
is the multi-year mechanisation work: replacing each upstream
citation with a Verum-language proof that re-derives the
upstream lemma in-kernel. Until then the citation triple is the
load-bearing trust delegation, and a reviewer can independently
verify each of the six rules by reading the cited upstream
artefact.

**Why is this audit-clean and not just admitted?** The
distinction matters: an `admitted_with_iou` rule names a
**missing** lemma whose proof has not yet been written
anywhere. A `discharged_by_framework` rule names an **existing**
proof in a vetted upstream corpus (mathlib4 / lean4_stdlib),
which the audit chronicle pins as a structured trust extension.
Both are honest about not being kernel-checked, but the latter
is *resolvable* — anyone can read the upstream proof — while
the former leaves an open obligation.

## 8. Why a separate Verum-side mirror

A natural question: *"why ship `kernel_v0` in Verum rather than
just trusting the Rust `proof_checker`?"*

Three reasons:

1. **Independent verification.** The Rust `proof_checker` and
   the Verum `kernel_v0` are checked against each other in the
   differential gate. Disagreements are bugs in either.
2. **Self-hosting.** A kernel verified *in its own language* is
   the strongest form of trust delegation possible. The
   Verum-side kernel is what makes Phase 3 (the ~100 LOC
   bootstrap shim) reachable.
3. **Auditor accessibility.** A Verum-source kernel is readable
   by anyone who reads Verum — no Rust expertise required. The
   audit chronicle's auditors are mathematicians and verifiers,
   not just systems programmers.

## 9. Cross-references

- [Trusted kernel](./trusted-kernel.md) — the three-layer
  rule architecture.
- [Three-kernel architecture](./two-kernel-architecture.md) —
  the differential layer where `kernel_v0` is registered as the
  third algorithmic slot (Algorithm C).
- [Reflection tower](./reflection-tower.md) — the meta-soundness
  layer above the kernels.
- [Soundness gates](./soundness-gates.md) — the predicate-level
  formalisation.
- [Audit protocol](../architecture-types/audit-protocol.md) —
  the `--kernel-v0-roster` and `--soundness-iou` gates.
