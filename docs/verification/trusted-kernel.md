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
| **proof_checker** | `proof_checker` module | 13 | extended CoC checker (Π / Σ / Id with universe polymorphism); the trusted base |
| **KernelRuleId audit registry** | `zfc_self_recognition` module | 7 | Audit-time meta-soundness footprint enumeration |

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
on size. The trusted-base proof_checker (Layer B) targets a
small footprint that an external auditor can read end-to-end —
order-of-magnitude smaller than HOL Light, Lean, or Coq's
`coqchk`. The trade-off is deliberate: the checker rejects MOST
Verum programs (those using refinement / cubical / modal /
SMT-axiom features), but the programs it accepts have an
iron-clad independent verdict. The full Verum kernel
infrastructure handles the broader surface; the proof_checker
handles the irreducible core.

---

## 2. Layer A — `kernel_v0` (Verum-side bootstrap, 10 rules)

`kernel_v0` is the **Verum-language** mirror of the trusted-base
checker. It lives at `core/verify/kernel_v0/` and ships:

- A canonical 10-rule manifest (one `.vr` file per rule under
  `rules/`).
- Soundness lemmas under `lemmas/` (one file per derived structural
  lemma: `beta.vr`, `eta.vr`, `sub.vr`, `subst.vr`, `cartesian.vr`).
- Per-rule judgment forms in `judgment.vr` (top-level alongside
  `context.vr` and `core_term.vr`).

The ten rules:

| File | Rule | What it does |
|------|------|--------------|
| `rules/k_var.vr` | `K-Var` | Variable lookup `Γ, x:A ⊢ x : A` |
| `rules/k_univ.vr` | `K-Univ` | Universe formation `Γ ⊢ Universe(n) : Universe(n+1)` |
| `rules/k_pi_form.vr` | `K-Pi-Form` | Π-type formation `Γ ⊢ A : U`, `Γ, x:A ⊢ B : U` ⊢ `Π x:A.B : U` |
| `rules/k_lam_intro.vr` | `K-Lam-Intro` | λ-abstraction introduction |
| `rules/k_app_elim.vr` | `K-App-Elim` | Application elimination |
| `rules/k_sub.vr` | `K-Sub` | Substitution lemma |
| `rules/k_beta.vr` | `K-Beta` | β-conversion `(λx:A. b) a ↝ b[x ↦ a]` |
| `rules/k_eta.vr` | `K-Eta` | η-equivalence `λx. f x ≡ f` |
| `rules/k_pos.vr` | `K-Pos` | Strict positivity (Berardi 1998) |
| `rules/k_fwax.vr` | `K-FwAx` | Framework-axiom admission |

The audit gate `verum audit --kernel-v0-roster` walks the
manifest and confirms every rule has its corresponding `.vr`
file. Drift between manifest and filesystem is a build failure.

`kernel_v0` is intentionally written in Verum source, not in
the host implementation language. The
manifest authored under `core/verify/kernel_v0/` is consumed by
`KernelV0Kernel` — the third independent slot in the
[differential-kernel gate](./two-kernel-architecture.md). The
slot anchors structural type-check, manifest audit-cleanness,
the meta-soundness footprint, and per-rule strict-intrinsic
dispatch; future revisions can additionally compile the Verum
manifest itself into a self-hosted checker.

---

## 3. Layer B — `proof_checker` (the trusted base)

The trusted base lives in the `proof_checker` module and
implements an extended Calculus of Constructions: dependent
functions (Π), dependent pairs (Σ), and intensional identity
types (Id) with universe-polymorphic level expressions.

**Thirteen inference rules** are exhaustive:

| # | Rule | Signature (informal) |
|---|------|---------------------|
| 1 | T-Var | `Γ, x:A ⊢ x : A` |
| 2 | T-Univ | `Γ ⊢ Universe(l) : Universe(succ l)` |
| 3 | T-Pi-Form | `Γ ⊢ A : U_i`, `Γ, x:A ⊢ B : U_j` ⟹ `Γ ⊢ Π x:A.B : U_max(i,j)` |
| 4 | T-Lam-Intro | `Γ, x:A ⊢ t : B` ⟹ `Γ ⊢ λx:A.t : Π x:A.B` |
| 5 | T-App-Elim | `Γ ⊢ f : Π x:A.B`, `Γ ⊢ a : A` ⟹ `Γ ⊢ f a : B[x ↦ a]` |
| 6 | T-Sigma-Form | `Γ ⊢ A : U_i`, `Γ, x:A ⊢ B : U_j` ⟹ `Γ ⊢ Σ x:A.B : U_max(i,j)` |
| 7 | T-Pair-Intro | `Γ ⊢ a : A`, `Γ ⊢ b : B[x ↦ a]` ⟹ `Γ ⊢ (a, b) : Σ x:A.B` |
| 8 | T-Fst-Elim | `Γ ⊢ p : Σ x:A.B` ⟹ `Γ ⊢ fst p : A` |
| 9 | T-Snd-Elim | `Γ ⊢ p : Σ x:A.B` ⟹ `Γ ⊢ snd p : B[x ↦ fst p]` |
| 10 | T-Id-Form | `Γ ⊢ A : U_i`, `Γ ⊢ a, b : A` ⟹ `Γ ⊢ Id(A, a, b) : U_i` |
| 11 | T-Refl-Intro | `Γ ⊢ a : A` ⟹ `Γ ⊢ refl a : Id(A, a, a)` |
| 12 | T-J-Elim | `Γ ⊢ P : Π_:A. U_i`, `Γ ⊢ h : P a`, `Γ ⊢ p : Id(A, a, b)` ⟹ `Γ ⊢ J(P, h, p) : P b` |
| 13 | T-Conv | `Γ ⊢ t : A`, `A ≡ B` ⟹ `Γ ⊢ t : B` |

Definitional equality (T-Conv) decides `α + β + η + level-eq + ι`,
where `ι` is path induction's β-rule `J(_, h, refl) → h` and
β-projection `fst(a, _) → a` / `snd(_, b) → b`.

The Term language carries twelve variants:

| Variant | Carries | Role |
|---|---|---|
| `Var(i)` | de-Bruijn index `i` | bound variable lookup |
| `Universe(l)` | level expression `l` | a universe; lives in `Universe(succ l)` |
| `Pi(A, B)` | domain + codomain | dependent function type `Π x:A. B` |
| `Lam(A, b)` | type-annotated body | typed λ-abstraction |
| `App(f, x)` | function + argument | application |
| `Sigma(A, B)` | domain + codomain | dependent pair type `Σ x:A. B` |
| `Pair(a, b)` | both components | pair constructor `(a, b)` |
| `Fst(p)` | the pair | first projection |
| `Snd(p)` | the pair | second projection |
| `Id { ty, lhs, rhs }` | carrier + endpoints | identity type `Id(A, a, b)` |
| `Refl(value)` | the value | reflexivity proof `refl a` |
| `J { motive, base, scrutinee }` | predicate + base case + path | path induction |

### 3.0 Universe polymorphism — Level expressions

Universes are not a flat 32-bit ladder; the carrier is a
structured `Level` expression supporting universe-polymorphic
schemas. A level is one of four shapes:

- **`Concrete(n)`** — a closed level `Type@n` for some natural `n`.
- **`Var(u)`** — a level variable `Type@u`, used by polymorphic
  schemas.
- **`Succ(l)`** — the successor `l + 1`.
- **`Max(a, b)`** — the meet `max(a, b)` of two levels.

Equality on levels is decided by canonical normalisation
(idempotency `max(x, x) = x`; identity `max(0, x) = x`;
common-Succ factoring `max(succ a, succ b) = succ(max a b)`;
flatten + sort + dedupe `Max` summands). The procedure is
**sound** (no false positives) and **complete on closed levels**
(every closed level reduces to a single `Concrete`); on open
levels with the same canonical form it is decidable, conservative
on structurally-distinct expressions over the same variables.

A polymorphic schema `λ(A : Type@u). λ(x : A). x` typechecks at
`Π(A : Type@u). Π(_ : A). A` for every level variable `u` —
the kernel never needs to instantiate `u`.

A maximally-saturated `Concrete(MAX)` has no successor, so
`Universe(Concrete(MAX))` is rejected with `UniverseOverflow`
rather than wrapping to `Universe(Concrete(0))` (the unsound
corner that DEFECT-2 closed).

The kernel exposes a bidirectional API: `infer` synthesises a
type for a term in a context; `check` verifies that a term has
a given type. Together they implement the full type-checking
discipline of the thirteen rules.

### 3.1 What this layer DOES NOT do

A deliberate scope restriction. The trusted base does NOT:

- Type-check refinement types (`Int { p }` requires SMT — handled
  by the broader infrastructure, not the trusted base).
- Decide propositional equality up to η beyond α + β + ι.
- Type-check cubical primitives (HComp / Transp / Glue) — those
  layer above the trusted base via the broader kernel's rule set.
- Inspect `@framework`-cited axioms (those are leaves the
  apply-graph audit handles).
- Inductive types beyond Σ — booleans, naturals, lists, etc. are
  Church-encoded via Π or admitted by `kernel_v0` axioms; native
  inductives are a future extension.

The trade-off is deliberate. A wider kernel admits more programs
directly; a narrower kernel makes the *surface a reviewer must
audit* smaller. Verum balances the trade-off by including Π / Σ /
Id (the foundational equality type former) — sufficient to encode
every "exists" proposition and every transport/symm/trans/cong
proof — while leaving cubical / inductive / refinement to the
broader infrastructure.

### 3.1a Derived constructions in the trusted base

With Π / Σ / Id all kernel-checkable, the following are derivable
without any further rule additions:

- **Conjunction** as `Σ x:A. B` (non-dependent Σ)
- **Existential** as `Σ x:A. P x` (dependent Σ)
- **Symmetry** of equality: `J(λx. Id(A, x, a), refl_a, p)` has
  type `Id(A, b, a)` given `p : Id(A, a, b)`
- **Transitivity** as nested `J`
- **Transport** along a path: `J(λx. P x, h, p)` carries
  `h : P a` to a value of type `P b`
- **Congruence** of `f`: motive `λx. Id(B, f(a), f(x))` discharged
  by `J` at `refl_(f(a))`
- **Function extensionality** (with Π and Id) — an axiom in this
  fragment, but provable in the cubical extension layered above

These derivations are kernel-checked once the user names them; the
trusted base does not need to recognise them syntactically.

### 3.2 The `Certificate` lifecycle at this layer

A `Certificate` is the structured witness the trusted base
consumes — a pair `(term, claimed_type)` where `term` is the
proof term and `claimed_type` is the type the term is claimed
to inhabit.

The audit gate `verum audit --kernel-recheck` runs every
theorem in the project's corpus through the trusted base by
calling `check(ctx, term, claimed_type)`. A non-accept result
fails the audit.

---

## 4. Layer C — `KernelRuleId` audit registry (7 rules)

The third layer is *not* a checker — it is an **audit registry**
for meta-soundness footprint enumeration. Lives in the
`zfc_self_recognition` module. Seven canonical rules carry an
explicit ZFC + inaccessible decomposition:

| Tag | Purpose |
|---|---|
| `K-Refine` | depth-strict comprehension |
| `K-Univ` | universe consistency |
| `K-Pos` | strict positivity (Berardi 1998) |
| `K-Norm` | strong normalisation |
| `K-FwAx` | framework-axiom admission (Prop-only) |
| `K-Adj-Unit` | α ⊣ ε unit identity (Diakrisis 108.T) |
| `K-Adj-Counit` | α ⊣ ε counit identity |

Each rule's `required_meta_theory()` returns the precise ZFC
axioms (out of the 9 in `ZfcAxiom::full_list()`) plus the
inaccessibles (out of `InaccessibleLevel = { Kappa1, Kappa2 }`)
the rule rests on:

| Rule | ZFC axioms | Inaccessibles | Citation |
|------|-----------|---------------|----------|
| K-Refine | Separation, Replacement, Foundation | — | Depth-stratification over comprehension (Yanofsky 2003) |
| K-Univ | Replacement, Pairing, Union, PowerSet | κ_1 + κ_2 | Grothendieck-universe model: κ_1 ⇒ Type_1, κ_2 ⇒ Type_2 (host for ∞-cat classifier) |
| K-Pos | Foundation, Separation | — | Berardi 1998: non-positive recursion ⇒ ⊥; blocking proof uses ∈-induction (Foundation) |
| K-Norm | Foundation, Replacement, Separation | κ_1 | Huber 2019 + K-FwAx side-condition; transfinite SN model lives in U_κ_1 |
| K-FwAx | Pairing, Union, Separation | — | Prop-only admission; Pairing+Union build the axiom set, Separation gates the body type |
| K-Adj-Unit | Replacement, Pairing, Union | κ_1 | α ⊣ ε unit (Diakrisis 108.T); (∞,1)-categorical adjunction modelled in U_κ_1 |
| K-Adj-Counit | Replacement, Pairing, Union | κ_1 | α ⊣ ε counit (Diakrisis 108.T); same adjunction shape as Unit |

Taking the union across all seven rules, the kernel reaches into
**6 of the 9 ZFC axioms** — Pairing, Union, Separation,
Replacement, Foundation, PowerSet — plus **2 strongly-inaccessible
cardinals** (κ_1 and κ_2). Extensionality, Infinity, and Choice
are unused by any current kernel rule. The seven-rule union is
therefore a strict subset of the canonical "ZFC + 2-inaccessibles"
base, which is what makes the meta-soundness verdict
(see [§4.1](#41-the-kernel-meta-soundness-predicate)) holdable.

### 4.1 The kernel-meta-soundness predicate

`zfc_self_recognition` exposes a `kernel_meta_soundness_holds()`
predicate that walks every kernel rule's `required_meta_theory()`
and confirms each requirement is **bounded by** ZFC + 2-inaccessibles
(set inclusion, not equality). The full nine-axiom + two-inaccessible
base is the headroom the kernel commits to; the actual six-axiom
+ two-inaccessible footprint is what the audit accumulator reports.

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

- `verum audit --differential-kernel` — runs the canonical-cert
  battery (`verum_kernel::canonical_battery::canonical_battery()`,
  built from `CanonicalCert::accept` / `CanonicalCert::reject`
  entries) through all three kernels.
- `verum audit --differential-kernel-fuzz` — chains 1–3 mutations
  per iteration over a fuzz-seed roster (the canonical battery's
  accept-path certs + a K-combinator deeper seed; see
  `verum_kernel::differential_fuzz::seed_certificates`), auto-
  shrinks any disagreement to a minimal failing case via greedy
  1-element removal, and surfaces per-mutation / per-seed /
  chain-length coverage instrumentation.  See
  [property-fuzz](../architecture/property-fuzz.md).
- `verum audit --differential-lean-checker` — same canonical battery
  through the Rust kernel and a Lean ReferenceChecker exe; verdict-
  by-verdict agreement asserted.
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
(`kernel_registry` module). The registry exposes a uniform
`KernelChecker` trait (`name()` + `description()` +
`verify(cert) -> Result<(), CheckError>`) so the audit pipeline
can query every registered kernel without caring which is which.

Per-kernel verdicts are `Result<(), CheckError>` (accept = `Ok`,
reject = `Err` with a typed `CheckError`).  The differential gate
calls `KernelRegistry::verify_all(cert)` which collects per-kernel
results and produces an `AgreementVerdict`: `Unanimous` (every
kernel accepted), `UnanimousReject` (every kernel rejected), or
`Disagreement { accepting, rejecting }` (the kernels split).
Disagreement is the failure signal — proof of a real bug in at
least one kernel implementation.

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

Per `codegen_attestation` module, the codegen
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
audit-clean discipline. See [kernel_v0](./kernel-v0.md) §7.
The full kernel-rule registry now sits at **Proved +
DischargedByFramework only** with the IOU axiom registry empty
(`iou_axiom_specs()` returns `vec![]`); see
[framework axioms](./framework-axioms.md#the-iou-axiom-registry--kernel-rule-trust-extension)
for the discharge protocol.)

---

## 9. The trust delegation summary

After the trusted base accepts a `(term, expected_type)` pair,
the only things a reviewer needs to trust are:

1. **The `proof_checker` module** (small enough to read
   end-to-end, exhaustive pattern-matching, no unsafe code).
2. **The host compiler's correctness** (or, after self-hosting
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
