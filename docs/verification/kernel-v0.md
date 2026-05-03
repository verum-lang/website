---
sidebar_position: 6
title: "kernel_v0 — Verum's bootstrap meta-theory"
description: "The 10-rule Verum-language mirror of the trusted base. Hand-auditable bootstrap, the Milawa pattern, and the trust-base shrinkage roadmap."
slug: /verification/kernel-v0
---

# `kernel_v0` — Verum's bootstrap meta-theory

`kernel_v0` is the **Verum-language** mirror of the Rust-side
trusted-base proof-term checker. It lives at
`core/verify/kernel_v0/` and ships a hand-auditable 10-rule
minimal kernel that justifies every other inference rule in
`verum_kernel`.

The architectural role is **self-hosting** — at completion,
the kernel's logic is *fixed-point compilable by Verum itself*,
shrinking the Rust trusted base from ~800 LOC to a ~100 LOC
bootstrap shim. This is the **Milawa pattern**: kernel(N+1)
verified by kernel(N), descending to a tiny bootstrap.

For the layered three-kernel architecture see
[Trusted kernel](./trusted-kernel.md). For the differential
testing that runs against `kernel_v0` see
[Two-kernel architecture](./two-kernel-architecture.md).

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

   verum_kernel::proof_checker (Rust)  — generated from kernel_vN
   verum_kernel::* dispatcher  (Rust)  — uses kernel_vN's verdict
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
| K-Pi-Form | `rules/k_pi_form.vr` | Admitted | Π-type formation: `(A:U(n)) → (B:U(m))` in `U(max(n,m))` |
| K-Lam-Intro | `rules/k_lam_intro.vr` | Admitted | λ introduction: body's type under binder gives Π type |
| K-App-Elim | `rules/k_app_elim.vr` | Admitted | Apply elimination + substitution |
| K-Beta | `rules/k_beta.vr` | Admitted | β-reduction `(λx.M) N ⤳ M[N/x]` is type-preserving |
| K-Eta | `rules/k_eta.vr` | Admitted | η-equivalence `λx.(f x) ≡ f` when `x ∉ FV(f)` |
| K-Sub | `rules/k_sub.vr` | Admitted | Subtyping (universe cumulativity) |
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

The end-state goal is a ~100 LOC bootstrap shim that interprets
the kernel_v0 Verum source files; all kernel logic is verified
*in Verum*, not in Rust. The roadmap:

| Stage | Trust base | Status |
|-------|-----------|--------|
| Pre-#157 | 10K LOC `verum_kernel` Rust + 38 rules with 34 admits | historical |
| Post-#157 | 796 LOC `proof_checker.rs` Rust + 6 rules | **current** |
| Phase 3 (#154) — kernel_v0 self-hosted | ~500 LOC Verum + 10 rules | in-flight |
| Phase 3 closed — bootstrap chain complete | ~100 LOC bootstrap shim | target |

Each stage shrinks the trusted base. The progression follows
the *Milawa pattern* — a self-verified kernel chain descending
to a hand-auditable bootstrap.

## 4. The differential-kernel role

Once self-hosting lands, `kernel_v0` becomes the **third slot**
in `verum audit --differential-kernel`:

| Slot | Implementation | Status |
|------|----------------|--------|
| 1 | `proof_checker` (Rust, bidirectional + WHNF) | active |
| 2 | `proof_checker_nbe` (Rust, NbE) | active |
| 3 | `kernel_v0` (Verum, self-hosted) | `NotYetSelfHosting` (pending parser blocker) |

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

## 7. The IOU dashboard

The six admitted rules each carry a *concrete IOU* — a named
missing meta-theoretic lemma. The dashboard:

```text
$ verum audit --soundness-iou

  rule           status        IOU
  ─────────────  ───────────   ───────────────────────────────────
  K-Pi-Form      admitted      universe-bound preservation
  K-Lam-Intro    admitted      binder-introduction confluence
  K-App-Elim     admitted      substitution lemma (Barendregt 1984)
  K-Beta         admitted      β-confluence (Newman's lemma)
  K-Eta          admitted      η-elaboration soundness
  K-Sub          admitted      subtyping reflexivity + transitivity

  6 / 10 rules admitted with IOU
  4 / 10 rules proved structurally (K-Var, K-Univ, K-FwAx, K-Pos)
```

The IOU payloads are not opaque — each names a specific
meta-theoretic lemma whose proof would close the admit. The
six admits are tracked individually as discharge work.

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
- [Two-kernel architecture](./two-kernel-architecture.md) — the
  differential layer that will register `kernel_v0` as a third
  slot.
- [Reflection tower](./reflection-tower.md) — the meta-soundness
  layer above the kernels.
- [Soundness gates](./soundness-gates.md) — the predicate-level
  formalisation.
- [Audit protocol](../architecture-types/audit-protocol.md) —
  the `--kernel-v0-roster` and `--soundness-iou` gates.
