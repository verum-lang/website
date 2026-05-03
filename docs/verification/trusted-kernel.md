---
sidebar_position: 4
title: Trusted Kernel
---

# The Trusted Kernel

> The kernel is the sole trusted component of Verum's verification
> pipeline. Every other subsystem — the SMT backends, the tactic
> engine, the translator, the framework-axiom registry, the
> monomorphizer, even the typechecker — can have bugs and the
> language remains sound, provided the kernel replays every
> certificate before admitting a theorem.

This page is the canonical reference for the kernel's design,
its **three-layer rule architecture**, the `Certificate` lifecycle,
the replay loop, and the auditor's checklist. It is the closest
thing Verum has to a "definition of soundness."

The kernel is **not** monolithic. Three layers cooperate, each
with its own rule list, its own auditing surface, and its own
trust delegation:

| Layer | Where | Rules | Purpose |
|-------|-------|-------|---------|
| **kernel_v0** | `core/verify/kernel_v0/` (Verum source) | 10 | Verum-side bootstrap meta-theory; hand-auditable |
| **proof_checker** | `crates/verum_kernel/src/proof_checker.rs` | 6 | Rust-side minimal CoC checker; the trusted base |
| **KernelRuleId audit registry** | `crates/verum_kernel/src/zfc_self_recognition.rs` | 7 | Audit-time meta-soundness footprint enumeration |

This page covers all three layers, their interfaces, and how the
[differential testing](./two-kernel-architecture.md) and
[reflection-tower](./reflection-tower.md) layers consume them.

---

## 1. Why LCF, and why so small

The kernel follows the **LCF ("Logic for Computable Functions")**
tradition established by Robin Milner at Edinburgh in the 1970s and
refined across Coq, HOL, Isabelle, and Lean. The core idea is to
split the logic implementation into two parts:

1. A **small, fixed set of primitive inference rules**. Every
   theorem in the system is ultimately a tree of these rules.
2. A **large, untrusted automation layer** that produces trees of
   those rules. Its job is to be fast, creative, and often wrong;
   the kernel's job is to catch the wrong ones.

The soundness guarantee reduces to: *if the kernel's rule
implementations are correct and the programming language of the
kernel doesn't lie, every theorem the kernel accepts is derivable
from its axioms.* Everything else — tactic engines, SMT proofs,
user programs — is reduced to *"did the kernel accept it?"* and
becomes inspection-only at audit time.

Verum's discipline is *more aggressive* than typical LCF kernels
on size. The trusted-base proof_checker (Layer B) targets **&lt;
1000 LOC Rust** — order-of-magnitude smaller than HOL Light
(~5K SML) or Lean (~5K C++) or Coq's `coqchk` (~10K OCaml). The
trade-off is deliberate: the checker rejects MOST Verum programs
(those using refinement / cubical / modal / SMT-axiom features),
but the programs it accepts have an iron-clad independent verdict.
The full Verum kernel infrastructure handles the broader surface;
the proof_checker handles the irreducible core.

---

## 2. Layer A — `kernel_v0` (Verum-side bootstrap, 10 rules)

`kernel_v0` is the **Verum-language** mirror of the trusted-base
checker. It lives at `core/verify/kernel_v0/` and ships:

- A canonical 10-rule manifest (one `.vr` file per rule).
- Soundness lemmas under `lemmas/`.
- Per-rule judgment forms under `judgment.vr`.
- Context structure under `context.vr`.

The ten rules:

| File | Rule | What it does |
|------|------|--------------|
| `k_var.vr` | `K-Var` | Variable lookup `Γ, x:A ⊢ x : A` |
| `k_univ.vr` | `K-Univ` | Universe formation `Γ ⊢ Universe(n) : Universe(n+1)` |
| `k_pi_form.vr` | `K-Pi-Form` | Π-type formation `Γ ⊢ A : U`, `Γ, x:A ⊢ B : U` ⊢ `Π x:A.B : U` |
| `k_lam_intro.vr` | `K-Lam-Intro` | λ-abstraction introduction |
| `k_app_elim.vr` | `K-App-Elim` | Application elimination |
| `k_sub.vr` | `K-Sub` | Substitution lemma |
| `k_beta.vr` | `K-Beta` | β-conversion `(λx:A. b) a ↝ b[x ↦ a]` |
| `k_eta.vr` | `K-Eta` | η-equivalence `λx. f x ≡ f` |
| `k_pos.vr` | `K-Pos` | Strict positivity (Berardi 1998) |
| `k_fwax.vr` | `K-FwAx` | Framework-axiom admission |

The audit gate `verum audit --kernel-v0-roster` walks the
manifest and confirms every rule has its corresponding `.vr`
file. Drift between manifest and filesystem is a build failure.

`kernel_v0` is intentionally Verum-source, not Rust. The
manifest authored under `core/verify/kernel_v0/` is consumed by
`KernelV0Kernel` — the third independent slot in the
[differential-kernel gate](./two-kernel-architecture.md). The
slot anchors structural type-check, manifest audit-cleanness,
the meta-soundness footprint, and per-rule strict-intrinsic
dispatch; future revisions can additionally compile the Verum
manifest itself into a self-hosted checker.

---

## 3. Layer B — `proof_checker.rs` (Rust trusted base, 6 rules)

The Rust-side trusted base lives in
`crates/verum_kernel/src/proof_checker.rs` and implements a
minimal Calculus of Constructions (CoC) fragment. **Six
inference rules** are exhaustive:

| # | Rule | Signature (informal) |
|---|------|---------------------|
| 1 | T-Var | `Γ, x:A ⊢ x : A` |
| 2 | T-Univ | `Γ ⊢ Universe(n) : Universe(n+1)` |
| 3 | T-Pi-Form | `Γ ⊢ A : U_i`, `Γ, x:A ⊢ B : U_j` ⟹ `Γ ⊢ Π x:A.B : U_max(i,j)` |
| 4 | T-Lam-Intro | `Γ, x:A ⊢ t : B` ⟹ `Γ ⊢ λx:A.t : Π x:A.B` |
| 5 | T-App-Elim | `Γ ⊢ f : Π x:A.B`, `Γ ⊢ a : A` ⟹ `Γ ⊢ f a : B[x ↦ a]` |
| 6 | T-Conv | `Γ ⊢ t : A`, `A ≡_β B` ⟹ `Γ ⊢ t : B` |

The Term language carries five variants — exactly what the six
rules require:

```rust
pub enum Term {
    Var(usize),                       // de Bruijn index
    Universe(u32),                    // Universe(n) lives in Universe(n+1)
    Pi(Box<Term>, Box<Term>),         // dependent function type Π x:A.B
    Lam(Box<Term>, Box<Term>),        // type-annotated λ-abstraction
    App(Box<Term>, Box<Term>),        // application
}
```

The public API is bidirectional:

```rust
pub fn infer(ctx: &Context, term: &Term) -> Result<Term, CheckError>;
pub fn check(ctx: &Context, term: &Term, expected: &Term) -> Result<(), CheckError>;
```

`infer` synthesises a type for a term in a context; `check`
verifies that a term has a given type. Together they implement
the full type-checking discipline of the six rules.

### 3.1 What this layer DOES NOT do

A deliberate scope restriction. The trusted base does NOT:

- Type-check refinement types (`Int { p }` requires SMT — handled
  by the broader infrastructure, not the trusted base).
- Decide propositional equality up to η beyond α + β.
- Inspect `@framework`-cited axioms (those are leaves the
  apply-graph audit handles).
- Aspire to feature parity with Coq's `coqchk` — it aspires to
  feature parity with HOL Light's kernel: minimal, exhaustive,
  hand-readable.

The trade-off is deliberate. A wider kernel admits more programs
directly; a narrower kernel makes the *surface a reviewer must
audit* smaller. Verum chooses the narrower kernel and lifts the
broader features to user-side discharge mechanisms.

### 3.2 The `Certificate` lifecycle at this layer

A `Certificate` is the structured witness the trusted base
consumes:

```rust
pub struct Certificate {
    pub term:      Term,    // the proof term
    pub claim_ty:  Term,    // the type the term is claimed to inhabit
}
```

The audit gate `verum audit --kernel-recheck` runs every
theorem in the project's corpus through the trusted base via
`check(ctx, &cert.term, &cert.claim_ty)`. A non-`Ok` result
fails the audit.

---

## 4. Layer C — `KernelRuleId` audit registry (7 rules)

The third layer is *not* a checker — it is an **audit registry**
for meta-soundness footprint enumeration. Lives in
`crates/verum_kernel/src/zfc_self_recognition.rs`. Seven canonical
rules, each carrying an explicit ZFC + inaccessible decomposition:

```rust
pub enum KernelRuleId {
    Refine,    // K-Refine    — depth-strict comprehension
    Univ,      // K-Univ      — universe consistency
    Pos,       // K-Pos       — strict positivity (Berardi 1998)
    Norm,      // K-Norm      — strong normalisation
    FwAx,      // K-FwAx      — framework-axiom admission (Prop-only)
    AdjUnit,   // K-Adj-Unit  — α ⊣ ε unit identity (Diakrisis 108.T)
    AdjCounit, // K-Adj-Counit — α ⊣ ε counit identity
}
```

Each rule's `required_meta_theory()` returns the precise ZFC
axioms (out of the 9 in `ZfcAxiom::full_list()`) plus the
inaccessibles (out of `InaccessibleLevel = { Kappa1, Kappa2 }`)
the rule rests on:

| Rule | ZFC axioms | Inaccessibles | Citation |
|------|-----------|---------------|----------|
| K-Refine | Separation, Replacement | — | Comprehension is Separation |
| K-Univ | Replacement | κ_1 + κ_2 | Type_1 ↪ κ_1, Type_2 ↪ κ_2 |
| K-Pos | Foundation, Separation | — | Berardi 1998 |
| K-Norm | Foundation, Replacement | κ_1 | Huber 2019 + transfinite induction |
| K-FwAx | Pairing, Union, Separation | — | Prop-only side condition |
| K-Adj-Unit | Replacement | κ_1 | Adjunction lives in (∞,1)-Cat ↪ U_{κ_1} |
| K-Adj-Counit | Replacement | κ_1 | Same as Unit |

Together, the seven rules' union requires the **9 ZFC axioms**
(Extensionality, Pairing, Union, PowerSet, Infinity, Separation,
Replacement, Foundation, Choice) plus **2 strongly-inaccessible
cardinals** (κ_1 and κ_2) — the canonical
"ZFC + 2-inaccessibles" base.

### 4.1 The kernel-meta-soundness predicate

`zfc_self_recognition` exposes:

```rust
pub fn kernel_meta_soundness_holds() -> bool;
```

…which walks every kernel rule's `required_meta_theory()` and
confirms each requirement is bounded by ZFC + 2-inaccessibles.
For the current rule set this holds vacuously — the seven rules'
union *is* ZFC + 2-inacc.

This predicate is the **base discharge** for the
[reflection tower](./reflection-tower.md)'s `REF^0` stage. The
[MSFS Theorem 9.6 / 8.2 / 5.1](./reflection-tower.md) layer
extends it to the higher stages.

---

## 5. The multi-kernel differential layer

Layer B (`proof_checker`) has two siblings:
`proof_checker_nbe` — a **second independent algorithmic
kernel** using Normalisation-by-Evaluation — and
`KernelV0Kernel` — a **third manifest-driven verifier**
anchoring structural type-check, manifest audit-cleanness, the
meta-soundness footprint, and per-rule strict-intrinsic
dispatch. The three implement the same input/output relation
via orthogonal strategies; disagreements are bugs in any one.

The differential layer is documented in detail in
[Three-kernel architecture](./two-kernel-architecture.md). At a
glance:

- `verum audit --differential-kernel` — runs every certificate
  through all three kernels.
- `verum audit --differential-kernel-fuzz` — runs an 11-variant
  mutation grammar over canonical certificates and verifies
  unanimous agreement.
- A *synthetic always-accept* slot is registered as a liveness
  pin: the differential is non-vacuous because the synthetic
  *should* disagree with the real kernels on rejected
  certificates.

This is a structural property no other production proof
assistant ships.

---

## 6. The kernel registry pattern

The three rule layers + the differential layer + future Verum
self-hosted kernel cooperate via a **kernel registry**
(`crates/verum_kernel/src/kernel_registry.rs`). The registry
exposes a uniform `KernelImpl` trait that lets the audit pipeline
query every registered kernel without caring which is which:

```rust
pub trait KernelImpl {
    fn name(&self) -> &str;
    fn check(&self, cert: &Certificate) -> KernelVerdict;
}
```

Verdicts are `Accepted` / `Rejected { reason }` /
`NotYetSelfHosting`. The differential gate iterates the registry,
collects per-kernel verdicts, and reports `BothAccept` /
`BothReject` / `Disagreement` per certificate.

Adding a new kernel is therefore additive — the audit pipeline
need not change when (e.g.) the Verum self-hosted kernel
becomes exercisable; only the registry registration changes.

---

## 7. The framework-axiom layer

Outside the trusted base but inside the trusted infrastructure:
**framework-axioms**. A theorem may rest on cited external
results — Lurie's HTT, Schreiber's DCCT, Connes's NCG, Joux's
group lower bound. Each citation is registered:

```verum
@framework("lurie_htt", "HTT 6.2.2.7")
@axiom
public theorem some_external_result : ...;
```

The `verum audit --framework-axioms` gate enumerates every
citation reachable from a module's public API. The gate's
output IS the project's external trust boundary — there is no
implicit framework dependency.

[`AP-014 UndisclosedDependency`](../architecture-types/anti-patterns/articulation.md#ap-014)
fires when a proof uses an axiom not registered via
`@framework`. The discipline ensures auditors can enumerate
the project's complete external trust.

---

## 8. The codegen-attestation layer

The kernel's verdicts cover *proofs*. A separate layer covers
*the compiler that emits the binary*: `codegen-attestation`.

Per `crates/verum_kernel/src/codegen_attestation.rs`, the codegen
pipeline has 6+ canonical passes (VBC lowering, SSA construction,
register allocation, linear-scan reg-alloc, LLVM emission,
machine-code emission). Each publishes a *simulation invariant*
(à la CompCert): "this pass preserves observable behaviour".

The audit gate `verum audit --codegen-attestation` reports per
pass:

The audit reports per pass via the **canonical `DischargeStatus`
enum** (`crate::soundness::DischargeStatus`) shared with the
kernel_v0 manifest. Four states cover the full discharge
lifecycle:

- `Discharged` — invariant has a kernel-checked structural proof
  internal to Verum.
- `DischargedByFramework { lemma_path, framework, citation }` —
  invariant resolved via a vetted upstream proof
  (mathlib4 / lean4_stdlib / CompCert / Vellvm) with a structured
  citation triple. **L4-acceptable.**
- `AdmittedWithIou { iou }` — invariant admitted with a named
  missing structural lemma. Honest about the gap; not yet
  L4-acceptable.
- `NotYetAttested` — trusted by code review only.

The audit-clean predicate `is_audit_clean()` returns true for
the first two states. All 6 codegen passes currently sit at
`AdmittedWithIou` with concrete CompCert / Vellvm / Beringer-Stark
/ George-Appel / Poletto-Sarkar / Wang-Wilke-Leroy IOUs;
mechanisation work flips entries individually as Verum-language
proofs of the simulation diagrams land.

(For comparison: the kernel_v0 manifest's 6 admitted bootstrap
rules — K-Pi-Form, K-Lam-Intro, K-App-Elim, K-Beta, K-Eta,
K-Sub — have already been promoted to `DischargedByFramework`
with mathlib4 / lean4_stdlib citations, demonstrating the
audit-clean discipline. See [kernel_v0](./kernel-v0.md) §7.)

---

## 9. The trust delegation summary

After the trusted base accepts a `(term, expected_type)` pair,
the only things a reviewer needs to trust are:

1. **`proof_checker.rs`** (~600 LOC, exhaustive pattern-matching,
   no `unsafe`).
2. **The Rust compiler's correctness** (or, after self-hosting
   lands, the Verum-self-hosted kernel that consumes the
   trusted-base output as a verifiable artifact).
3. **The serialisation format of `.vproof` files** — simple JSON
   or s-expression, separately auditable.
4. **The framework axioms cited** — each `@framework(...)` marker
   is a load-bearing assumption tracked in the
   `--framework-axioms` inventory.
5. **MSFS Theorems 5.1 / 8.2 / 9.6** for the reflection-tower
   meta-soundness layer (machine-verified in the corpus).

The delegation is *enumerable*. There is no implicit trust;
every assumption is cited and auditable.

---

## 10. Cross-references

- [Three-kernel architecture](./two-kernel-architecture.md) — the
  differential layer that runs Layer B against `proof_checker_nbe`.
- [Reflection tower](./reflection-tower.md) — the MSFS-grounded
  meta-soundness layer above Layer C.
- [Framework axioms](./framework-axioms.md) — the citation
  inventory.
- [Soundness gates](./soundness-gates.md) — the predicate-level
  formalisation of every audit gate.
- [Audit protocol](../architecture-types/audit-protocol.md) — the
  full ~45-gate catalog.
- [Architecture → trusted kernel](../architecture/trusted-kernel.md)
  — hardware/ABI perspective on the same kernel.
- [Architecture → SMT integration](../architecture/smt-integration.md)
  — integration points for replacing backends.
