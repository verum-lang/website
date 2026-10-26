---
sidebar_position: 4
title: Trusted Kernel
---

# The Trusted Kernel

Verum has a small proof-term checker and a broader verification
infrastructure in the same crate. This page describes the minimal
certificate calculus and the audit mechanisms around it. An accepted
certificate establishes the formal judgment checked by that entry point,
subject to its implementation and execution environment.

| Surface | Role |
|---|---|
| `proof_checker` | Direct checking of closed dependent-type and ordinary-induction certificates |
| `proof_checker_nbe` | Alternative conversion and checking algorithm for the same fragment |
| `kernel_v0` and `KernelRuleId` | Bootstrap descriptions, rule manifests and declared metatheory requirements |

The [architecture boundary](../architecture/trusted-kernel.md) distinguishes
these from the broader `CoreTerm` calculus and SMT attestations. The
[knowledge-system profile](./knowledge-systems.md) describes reproducible
admission and use in Noesis.

---

## 1. Why LCF, and why so small

The proof-term route follows the small-trusted-checker principle also
central to LCF-style systems and modern proof assistants. Proof construction
may be complex; acceptance is determined by explicit checking rules.

1. A fixed calculus specifies the terms, judgments and conversion rules.
2. Tactics or other producers propose terms in that calculus.
3. The checker validates each term against its full claimed type.

The conditional argument is precise: if these checking rules are sound
and their implementation and execution preserve them, an accepted term
establishes its formal judgment under the stated assumptions. This argument
does not certify a source translation or replace a solver witness with a
native derivation. The broader SMT and registry routes have additional
trust dependencies, described in the [kernel boundary reference](../architecture/trusted-kernel.md).

The minimal checker deliberately supports a smaller language than the
broader compiler. This makes its contract easier to inspect, but does not
establish a size or soundness advantage over other proof assistants.
Refinement, cubical, modal and SMT-axiom terms do not become admissible
merely because their implementations share the `verum_kernel` crate.

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
`KernelV0Kernel` — the manifest-backed wrapper slot in the
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
types (Id), first-order inductives and transparent local definitions, with
universe-polymorphic level expressions.

The checking rules are:

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
| 14 | T-Data | Index domains and constructor fields are well formed; fields lie within the declared universe; recursive and result indices check against the index telescope |
| 15 | T-Construct | The constructor belongs to the complete declaration; its arguments check against dependent fields and determine the result indices |
| 16 | T-Induct | The motive ranges over all indices and the indexed value; every branch checks against its generated telescope, including recursively indexed hypotheses |
| 17 | T-Let | Check the value, then check the body with that transparent definition in scope |

Definitional equality (T-Conv) decides `α + β + η + level-eq + ι`,
where `ι` is path induction's β-rule `J(_, h, refl) → h` and
β-projection `fst(a, _) → a` / `snd(_, b) → b`. Ordinary induction reduces
at a constructor, inserting recursive calls only at declared recursive fields.
A local definition unfolds by capture-safe substitution.

The `Term` language carries these variants:

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
| `Data { name, level, indices, constructors }` | complete declaration and index telescope | indexed datatype identity |
| `Construct { data, constructor, args }` | declaration + constructor index + fields | owned constructor application |
| `Induct { scrutinee, motive, cases }` | value + result family + branches | ordinary dependent induction |
| `Let { value, body }` | checked value + body binding index zero | transparent local definition |

Datatype identity includes the complete declaration, not just its name.
A constructor field is `Value(type)`, `Dependent(type)`, `Recursive` or
`RecursiveAt(indices)`.
`Value` types use the surrounding context; `Dependent` types additionally see
one binder for each preceding field, with the most recent field at index zero.
`Recursive` denotes the same unindexed declaration; `RecursiveAt` applies the
enclosing family to indices in the preceding-field context. Each constructor
also supplies its result indices in the context of all its fields. Index domains
may depend on earlier indices. Construction checks each argument and derives
the result from those indices; it does not trust a claimed result index.
All field types must be
well formed within the declaration's universe. Branches bind each field in
declaration order, followed immediately by its induction hypothesis when the
field is recursive. Later dependent fields refer to field values, not to the
inserted hypotheses. This representation
checks positivity by construction and does not admit forward-name aliases.

Transparent local definitions retain their checked types. Reusing a definition
checks conversion against that type before considering its body; expected
dependent-pair families can still require checking the original introduction.
The substitution checker memoizes only the expansion of acyclic definitions
within their original binder prefix. It weakens each use into its actual context.
This avoids repeated proof checking without adding a certificate authority or
allowing later binders to change a stored definition.

Native admission bounds input size, logical nodes and binder depth separately
from physical JSON nesting. The isolated worker also enforces CPU and wall-clock
budgets and a memory termination threshold. Exceeding any resource budget is an
inconclusive refusal, never an accepted proof or a counterexample.

### 3.0 Universe polymorphism — Level expressions

Universes are not a flat 32-bit ladder; the carrier is a
structured `Level` expression supporting universe-polymorphic
schemas. A level has the following forms:

- **`Concrete(n)`** — a closed level `Type@n` for some natural `n`.
- **`Var(u)`** — a level variable `Type@u`, used by polymorphic
  schemas.
- **`Succ(l)`** — the successor `l + 1`.
- **`Max(a, b)`** — the join `max(a, b)` of two levels.
- **`Offset(l, n)`** — exact addition `l + n`, stored compactly instead of
  allocating one successor node per unit.

Equality on levels uses algebraic normalization of successors and maxima.
Closed expressions whose values fit the concrete carrier can reduce to a
`Concrete` level. A successor beyond that carrier must retain its exact
symbolic structure; saturating it to the largest concrete level would
identify different universes. The direct and NbE checkers share this level
algebra, so comparison between them alone cannot detect every defect in it.
The independent Lean reference checker also decodes and normalizes compact
`Offset` expressions. Its replay controls cover large and nested shifts,
common-prefix factoring, concrete overflow and altered level bounds. Both
wire decoders reject out-of-range integer fields and ambiguous constructor
objects. Compact representation avoids work proportional to the numeric shift;
equality remains conservative for symbolically different expressions.

Concrete universe inference can still reject a successor that cannot be
represented by its bounded API. Exact symbolic normalization does not
establish completeness for arbitrarily large levels or eliminate resource
limits. The decoder accepts legacy numeric levels and the supported
structured forms. A consumer that does not implement `Offset` must reject
that constructor; it must not reinterpret it as a saturated concrete level.
Checker and certificate-format identities belong in the verification profile.

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
- Decide arbitrary propositions or equality beyond the implemented conversion rules.
- Type-check cubical primitives (HComp / Transp / Glue) — those
  layer above the trusted base via the broader kernel's rule set.
- Inspect `@framework`-cited axioms (those are leaves the
  apply-graph audit handles).
- Mutually recursive datatypes, and nested or function-valued recursive fields.
  First-order datatypes and indexed families, including length-indexed vectors,
  are supported directly.
  A `kernel_v0` axiom does not extend `proof_checker::Term`.

The trade-off is deliberate. A wider kernel admits more programs
directly; a narrower kernel makes the *surface a reviewer must
audit* smaller. Verum balances the trade-off by including Π / Σ /
Id and first-order structural induction. Cubical operations, refinements and
richer datatype signatures remain separate from this portable certificate
fragment. Neither a rule manifest nor an audit label supplies missing evidence.

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

`verum check-proof file.vproof` invokes `Certificate::verify` on a closed
JSON certificate. Its `metadata` is diagnostic, not a source of additional
axioms. `verum audit --proof-term-library` exercises the checked-in
certificate collection, including rejecting controls.

Source elaboration is a narrower interface. `from_theorem_decl` refuses
generic/value parameters and `requires` clauses; `from_fn_decl` and
`from_refined_type` refuse their source forms. This leaves explicit formal
goal construction and proof-term checking available without claiming a
faithful AST translation. See the [source-to-goal boundary](./knowledge-systems.md#source-to-goal-boundary).

`verum audit --kernel-recheck` is a different route: it scans project
modules and invokes the broader `KernelRecheck` façade for selected
refinement, universe and coherence checks. It is not an assertion that
every theorem in those modules was translated to this minimal calculus.
Inspect skipped files and the actual checker named in each report.

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

Each rule's `required_meta_theory()` returns its declared ZFC
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

This is a policy check on the declared requirement table. It does not
derive normalization, consistency or semantic soundness from that table.
The implementation uses it as the base audit condition for the
[reflection tower](./reflection-tower.md)'s `REF^0` stage. The
[MSFS Theorem 9.6 / 8.2 / 5.1](./reflection-tower.md) layer
extends it to the higher stages.

---

## 5. The multi-kernel differential layer

Layer B has an alternative algorithm in `proof_checker_nbe` and a
manifest-backed wrapper in `KernelV0Kernel`. The latter first calls
`Certificate::verify`, then checks bootstrap declarations and policy.
It therefore shares the direct checker's term verdict and is not an
independent third implementation of substitution or conversion.
The direct and NbE implementations also share the `Term`, `Level` and
error representations; independence is algorithmic and has a stated scope.

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

Agreement is useful regression evidence on the tested fragment. It does
not exclude shared defects or establish completeness over all inputs.

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
Disagreement is an investigation signal. It may expose an implementation
bug, a policy mismatch or different completion limits; the report must
preserve the reason rather than merge every non-acceptance into falsity.

Adding a new kernel is therefore additive — the audit pipeline
need not change when (e.g.) the Verum self-hosted kernel
becomes exercisable; only the registry registration changes.

---

## 7. The framework-axiom layer

Framework-axiom declarations associate assumptions with sources. The
`verum audit --framework-axioms` command scans project declarations and
reports their framework attribution. Its coverage is the scanned input;
complete transitive dependency coverage must be checked separately.

A citation can identify a theorem in another corpus, but does not itself
supply that theorem's formal proof or an interpretation into Verum's
calculus. Consumers should retain both the citation and the evidence kind.
The minimal certificate language has no framework-axiom constructor;
assumptions must be explicit in its formal statement or use another profile.

---

## 8. The codegen-attestation layer

A proof about a source-level program and a proof that its compiled binary
preserves the same behavior are different obligations.
`codegen_attestation` records compiler passes and their declared simulation
invariants. Its `DischargeStatus` distinguishes structural proof,
framework attribution, a named outstanding obligation and no attestation.

A reference to CompCert or Vellvm does not instantiate their results for
Verum's implementation. A completed preservation claim needs the actual
source/target semantics, the implemented transformation, and a checked
simulation theorem connecting them. Audit policy may accept a cited status;
knowledge-system consumers must keep it distinct from a locally replayed proof.

---

## 9. The trust delegation summary

A closed minimal certificate is checked against the implemented calculus,
its decoder and execution environment. Its formal statement must also match
the intended claim. These are the dependencies of that particular route;
MSFS classification results and framework bibliographies do not become
additional proof premises merely by appearing elsewhere in the crate.

Broader verification routes retain their own registered assumptions and
solver/translation dependencies. The requirement is explicit provenance,
not a universal “verified” label shared by all routes. See the
[Noesis integration profile](./knowledge-systems.md) for the corresponding
receipt contract.

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
  — the distinct calculus, solver and assumption boundaries.
- [Architecture → SMT integration](../architecture/smt-integration.md)
  — integration points for replacing backends.
