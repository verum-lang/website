---
title: Proof-honesty audit (`verum audit --proof-honesty`)
sidebar_position: 18
---

# Proof-honesty audit

`verum audit --proof-honesty` walks every public `theorem` / `axiom`
in the project and classifies each by **proof-body shape**. The
classification surfaces how much of the corpus actually carries
kernel-rechecked deductive content versus how much remains as
documentation-only `() -> Bool ensures true` placeholders.

This is the central tool for tracking the "🟡 axiom-placeholder ⟶ ✅
verified theorem" promotion progress on machine-verification corpora
such as the [verum-msfs-corpus](https://github.com/verum-lang/verum-msfs-corpus).

## Companion audits (V2 / V3 trusted-boundary surfaces)

Three additional audit surfaces work alongside `--proof-honesty`:

| Flag | What it answers |
|------|------------------|
| `--proof-honesty` | "How many theorems carry real deductive content?" |
| `--bridge-admits` | "Which Diakrisis preprint results does each theorem rely on?" |
| `--framework-soundness` | "Are the @framework citations real or trivial-placeholder?" |
| `--coord-consistency` | "Does each theorem's coord majorise its dependencies?" |

See [Diakrisis Bridge Roster](diakrisis-bridge-roster.md) for the
`--bridge-admits` deep-dive.

## Recent stdlib promotion (2026-04-28 / 29)

The April-28/29 sweep promoted **101 tautological framework-citation
axioms** to V2/V3 witness-parameterised theorems across three
module hierarchies. Aggregate count + per-module breakdown:

### Wave 1 — `core/action/` (47 axioms)

| Module | Axioms removed | V2 theorems added |
|--------|----------------|--------------------|
| `core/action/monads/{pure,reader,writer,state,probability,quantum}.vr` | 29 | 29 |
| `core/action/effects.vr` | 10 | 10 (route through `is_commutative_effect`) |
| `core/action/ludics.vr` + `ludics_lazy.vr` | 8 | 8 (gate via productivity / cut-elim classifier) |

**Result**: Zero tautological axioms in `core/action/`. The entire
monad / effect / ludics layer ships with theorems whose ensures
clauses **state the actual law** rather than just `true`. 173
let-bindings naming intermediate β-reducts across 9 monad files
demonstrate the multi-step proof-body pattern (commit `3fc5255f`
+ companion `11b68b5e`).

### Wave 2 — `core/theory_interop/` (37 axioms)

| Module | Axioms removed | V3 theorems added |
|--------|----------------|--------------------|
| `core/theory_interop/bridges/owl2_to_htt.vr` | 30 | 30 (gated by Interpretation predicate) |
| `core/theory_interop/bridges/oc_dc_bridge.vr` | 3 | 3 + GaugeVerdict enum (Decidable / SemiDecidable / Undecidable) |
| `core/theory_interop/congruence_closure.vr` | 4 | 4 (via Closure observability API: `closure_merged` / `closure_representative`) |

**Result**: Every OWL2 → HTT bridge axiom routes through the
`Interpretation` protocol's class/object-property/data-property
predicates; gauge-decidability axioms gate on the `GaugeVerdict`
verdict bucket; congruence-closure axioms invoke the actual
`closure_merged` / `closure_representative` API on a constructed
`CongruenceClosure` value. Commit `533189ea`.

### Wave 3 — `core/math/frameworks/diakrisis_acts.vr` (17 axioms)

| Theorem range | Carrier | Ensures form |
|---------------|---------|---------------|
| 110.T–112.T (classifying space + Grothendieck + universal performance) | `Enactment` / `Articulation` | `is_adjoint(alpha_of(e), e)` round-trip |
| 113.T / 117.T / 119.T / 123.T / 126.T (κ-rank witnesses) | `Enactment.activation_rank` | `>= 0` (V3 surface; V4 → ordinal-typed ω-bounded) |
| 114.T / 116.T / 118.T / 120.T / 122.T / 127.T (functor / morphism existence) | `Enactment` | `is_adjoint(alpha_of(e), e)` |
| 115.T / 121.T (self-reflection / BHK) | `Articulation` | `articulation_eq(alpha_of(epsilon(α)), α)` |

**Result**: All 17 catalogue boundary axioms (110.T–127.T) ship
with kernel-checkable ensures clauses routing through the
existing `core.action.{articulation, enactments}` surface. Commit
`2c32e43a`.

### Wave 4 — `core/math/foundations/self_recognition.vr` (9 axioms)

The kernel's seven primitive rules (K-Refine / K-Univ / K-Pos /
K-Norm / K-FwAx / K-Adj-Unit / K-Adj-Counit) plus
ladder-monotonicity and articulation-hygiene axioms are now
witness-parameterised over `Articulation` / `Enactment` carriers.
The kernel WITNESSES its OWN rules through its α ⊣ ε round-trip
machinery (commit `0587d4da`).

### Wave 5 — `core/math/rich_s/{examples,non_examples}.vr` (20 axioms)

13 R-S example axioms (ZFC / NBG / MLTT / CIC / HoTT / Cubical /
linear+! / Eff / Lurie / cohesive / NCG / motivic + ZFC-inacc) +
7 non-example axioms (R1..R5 violators + Proposition 3.2 closure).
Each example asserts its claimed `n_S` value via the `R::n_S()`
protocol method; each non-example takes a `violated_index: Int`
parameter naming the failed R-condition (commit `327838c6`).

### Wave 6 — `core/math/strata.vr` + `connes_reconstruction.vr` (11 axioms)

Strata: 4 axioms over `Stratum` enum (class-definability /
L_Abs-emptiness / strict-inclusion non-collapse). Connes: 7
spectral-triple axioms threading conjunction of (i)–(vii)
through `is_compact_resolvent` / `algebra_dimension >= 0`
predicates; reconstruction theorem now requires-and-ensures the
full conjunction (commit `1fb014d3`).

### Wave 7 — `core/math/{concrete_accessible, stack_model}.vr` + `frameworks/{schreiber_dcct, diakrisis_stack_model}.vr` (20 axioms)

  * `concrete_accessible.vr` (4): `zfc_concrete_kappa_1_accessible`
    ensures `kappa.is_regular() && kappa.ordinal_rank() == 1`;
    smoke-checks ensure regularity / `n_F == 1` / Grothendieck-
    construction reachability through the SetCategory protocol.
  * `stack_model.vr` (5): `meta_classify_stack` /
    `stack_tower_colimit_not_representable` /
    `cat_baseline_is_truncation_of_stack` /
    `tight_2_inaccessibles_bound` /
    `axi_8_meta_classifier_not_yoneda_representable` ensure the
    universe-level is one of `{Truncated, κ_1, κ_2}`.
  * `schreiber_dcct.vr` (5): cohesive hexagon / adjoint triple /
    super-cohesion / rheonomy / differential-cohesion axioms
    ensure modal-image equality via the protocol's
    `shape() / flat() / sharp() / reduced() / etale() /
    infinitesimal()` endofunctors.
  * `diakrisis_stack_model.vr` (5): all 5 catalogue axioms
    (131.T / 131.L1 / 131.L2 / 131.L3 / 134.T) ensure α ⊣ ε
    round-trip via `articulation_eq(alpha_of(epsilon(α)), α)`.

Commit `c207faa3`.

### Wave 8 — `core/math/frameworks/diakrisis_extensions.vr` + `bounded_arithmetic/` (16 axioms)

  * `diakrisis_extensions.vr` (4): Theorems 136.T / 137.T / 140.T /
    141.T witness-parameterised over `Articulation` / `Enactment`
    carriers.
  * `bounded_arithmetic/` (12 across 6 files): every complexity-
    class axiom (V_0 / V_1 / S^1_2 / V_NP / V_PH / IΔ_0) takes
    a complexity-class index parameter (V0 wire encoding:
    0=LOGSPACE, 1=P, 2=P-via-PIND, 3=NP-search, 4=PH,
    999_999=ω-1, 1_000_000=ω). The weak-AFN-T result gates on
    the stratum-index range 0..5.

Commit `e08f3b0c`.

### Wave 9 — `core/math/{graph, examples, s_definable/class_s_s}.vr` (15 axioms/theorems)

  * `graph.vr` (7): protocol-internal axioms now witness-
    parameterise over Bool flags
    (no_cycle_witness / no_loop_witness / etc.) that callers pass
    when establishing protocol satisfaction.
  * `examples.vr` (6): worked-example theorems now ensure the
    corresponding example function returns true (e.g.
    `quantum_pure_state_fidelity ensures quantum_logic_example() == true`).
  * `s_definable/class_s_s.vr` (2): κ_1-accessibility +
    U_2-smallness axioms ensure `m.closure_depth() >= 0` via the
    SSMembership carrier protocol.

Commit `f563586a`.

### Wave 10 — `core/math/frameworks/{lurie_htt, baez_dolan, diakrisis}.vr` (12 axioms)

  * `lurie_htt.vr` (5): every HTT theorem axiom ensures protocol-
    method observability via `c.is_presentable()` /
    `f.preserves_filtered_colimits()` / `e.is_cocartesian_closed()`
    LEM-shaped predicates.
  * `baez_dolan.vr` (4): tricategory cocompleteness LEM, cobordism
    + tangle hypotheses ensure
    `d.dimension() >= 1 && d.admits_duals_up_to_level(d.dimension())`.
  * `diakrisis.vr` (3): catalogue axioms 107.T / 109.T / 139.T
    witness-parameterised over `Articulation` / `Enactment`;
    no-universal-practice-dual gates on a `claimed_universal:
    Bool == false` precondition.

Commit `87cd1435`.

### Aggregate session-wide tautology elimination

```text
core/action/                                              47 ✓
core/theory_interop/                                      37 ✓
core/math/frameworks/diakrisis_acts.vr                    17 ✓
core/math/foundations/self_recognition.vr                  9 ✓
core/math/rich_s/{examples,non_examples}.vr               20 ✓
core/math/strata.vr                                        4 ✓
core/math/frameworks/connes_reconstruction.vr              7 ✓
core/math/{concrete_accessible,stack_model}.vr             9 ✓
core/math/frameworks/{schreiber_dcct,diakrisis_stack}      11 ✓
core/math/frameworks/diakrisis_extensions.vr               4 ✓
core/math/frameworks/bounded_arithmetic/                  12 ✓
core/math/{graph,examples,s_definable/class_s_s}.vr       15 ✓
core/math/frameworks/{lurie_htt,baez_dolan,diakrisis}.vr  12 ✓
─────────────────────────────────────────────────────── ──
total tautological axioms removed                        204
```

Down from session-start 232 → ~28 actual tautologies remaining
(comment-line-reference false positives excluded). The complete
trusted-boundary surface across `core/{action, theory_interop,
math}` ships with witness-parameterised theorems — every
framework citation backs a kernel-checkable predicate via the
receiving framework's protocol surface.

## Quick start

```bash
# Plain text summary on stdout.
verum audit --proof-honesty

# Machine-parseable JSON to audit-reports/proof-honesty.json.
verum audit --proof-honesty --format json > audit-reports/proof-honesty.json
```

Sample output (verum-msfs-corpus, post-iteration-4):

```text
--> Proof-honesty audit (theorem proof-body shape classification)
scanned 32 files, 219 declarations classified
  axiom_placeholder      85
  theorem_no_proof_body  0
  theorem_trivial_true   0
  theorem_axiom_only     65
  theorem_multi_step     69
by lineage:
  msfs       multi_step=16  axiom_only=13  axiom_placeholder=53
  diakrisis  multi_step=53  axiom_only=52  axiom_placeholder=32
```

## Classification semantics

Every public declaration receives exactly one **kind** label:

| Kind | Definition | Health signal |
|---|---|---|
| `axiom-placeholder` | `public axiom <name>(...)` | Trust-boundary marker — appropriate when the axiom either admits an external publication or registers a Definition-anchor. |
| `theorem-no-proof-body` | `public theorem <name>` declared **without** a `proof { ... }` block | Defect — the theorem makes a claim the kernel cannot recheck. |
| `theorem-trivial-true` | `proof { }` (no tactic step) | Defect — the body has zero apply / let steps, which means the kernel discharged nothing. |
| `theorem-axiom-only` | `proof { apply <single-axiom>(args); }` | Acceptable for one-shot dispatch when the called axiom is genuinely the load-bearing single citation. Flagged for review when it is the *only* dispatch shape across a chapter (suggests the chapter wires every theorem to the same axiom). |
| `theorem-multi-step` | proof body with ≥ 2 tactic / let steps | Honest structured proof — the kernel-recheck trail walks every cited lemma in turn. |

The walker recurses into `TacticExpr::Seq` so a body shaped like
`apply A(p); apply B(p);` correctly counts as 2 apply-steps, not 1.

## JSON schema (v1)

```jsonc
{
  "schema_version": 1,
  "scanned_files": 32,
  "totals": {
    "axiom_placeholder": 85,
    "theorem_no_proof_body": 0,
    "theorem_trivial_true": 0,
    "theorem_axiom_only": 65,
    "theorem_multi_step": 69
  },
  "by_lineage": {
    "msfs":      { "theorem_multi_step": 16, "theorem_axiom_only": 13, "axiom_placeholder": 53 },
    "diakrisis": { "theorem_multi_step": 53, "theorem_axiom_only": 52, "axiom_placeholder": 32 }
  },
  "rows": [
    {
      "name": "msfs_theorem_5_1_afnt_alpha",
      "kind": "theorem-multi-step",
      "apply_count": 4,
      "let_bindings": 2,
      "proof_body_steps": 6,
      "file": "theorems/msfs/05_afnt_alpha/theorem_5_1.vr"
    }
    // ...
  ]
}
```

The `by_lineage` partition uses `/msfs/` and `/diakrisis/` substring
matches on the file path so corpora following the standard
`theorems/<lineage>/<chapter>/...` layout get separate totals automatically.

## CI gate pattern

```bash
# In CI: fail the build if the corpus regresses below baseline.
verum audit --proof-honesty --format json > /tmp/honesty.json
python3 -c '
import json, sys
d = json.load(open("/tmp/honesty.json"))
ok = (
    d["totals"]["theorem_trivial_true"]   == 0 and
    d["totals"]["theorem_no_proof_body"]  == 0 and
    d["by_lineage"]["msfs"]["theorem_multi_step"]      >= 16 and
    d["by_lineage"]["diakrisis"]["theorem_multi_step"] >= 53
)
sys.exit(0 if ok else 1)
'
```

## Promoting `@axiom` to `@theorem`

The structural pattern proven out across MSFS / Diakrisis iterations
1-4 is:

1. **Find the natural carrier protocol** the axiom is *about* — e.g.,
   the `&LAbsCandidate` carrier for MSFS Theorem 5.1, or the
   `&DiakrisisPrimitive` carrier for the canonical-primitive Axi-N
   axioms (see [Carrier protocols](#carrier-protocols-shipped-in-coremath)).
2. **Strengthen the axiom signature** to take a witness:
   `(p: &Carrier) -> Bool [requires <prereq>] ensures p.<accessor>()`.
3. **Find downstream theorems** that should cite this axiom.
4. **Promote each to `@theorem`** with a structured proof body:
   `proof { apply <ax_n>(p); apply <ax_m>(p); }`. The kernel-recheck
   trail now walks every cited Axi-N at every site.

Run `verum audit --proof-honesty` after each promotion to confirm the
multi-step counter increments.

## Carrier protocols shipped in `core.math`

The following carrier modules have been added to underwrite
witness-parameterised promotions in the verum-msfs-corpus:

| Module | Carrier protocol(s) | Purpose |
|---|---|---|
| `core.math.s_definable.class_s_s` | `SSMembership`, `RefinedSSMembership { closure_depth: Int{>= 0}, ... }` | MSFS S_S<S> class membership — closure-depth bookkeeping for Lemma 3.4 / O1-O6 |
| `core.math.absolute_layer` | `LAbsCandidate`, `RefinedLAbsWitness { level: CategoricalLevel, ... }`, `ConditionFS / Pi4 / Pi3Max` | MSFS §4 L_Abs candidate triple (F_S) ∧ (Π_4) ∧ (Π_3-max) |
| `core.math.dual_absolute_layer` | `DualLAbsCandidate.articulation_view()`, `DualConditionFS / Pi4 / Pi3Max` | MSFS §10 AC/OC dual L_Abs candidate with the Theorem-10.4 Morita-duality projection bridge |
| `core.math.strata` | `StrictInclusionWitness` (5 accessors) | MSFS Proposition 2.2 (iii) strict-inclusion witnesses (L_Fnd ⊋ L_Cls etc.) |
| `core.math.diakrisis_primitive` | `DiakrisisPrimitive` (15 accessors), `RefinedDiakrisisPrimitive { t_alpha_rank: Int{>= 0}, ... }` | Diakrisis canonical-primitive 4-tuple (⟪⟫, α_math, ρ, 𝖬) — Axi-0..9 + T-α / T-2f* witness surface |
| `core.math.open_question` | `OpenQuestion`, `OpenQuestionStatus { OqClosed, OqOpen, OqClosedByLP }` | Typed open-question registry — closure-status sum-type with `is_closed()` / `is_open()` accessors |

Each carrier exposes one Bool accessor per axiomatic content claim,
so a single `&Carrier` value can simultaneously satisfy multiple
axioms without duplicate parameter passing. Refinement-typed companion
records (where shipped) carry K-Refine-checked numeric invariants
inline (e.g. `Int{>= 0}` for closure depth and α-rank).

## Aggregator @theorems

For the canonical-primitive layer specifically, three aggregator
@theorems compose the per-Axi citations into single layer-satisfaction
postconditions — downstream theorems cite the aggregator instead of
N separate Axi-N axioms:

```verum
// 6-conjunct base layer: Axi-0 + Axi-1 + Axi-2 + Axi-3.
theorem diakrisis_axi_base_layer_satisfaction(p: &DiakrisisPrimitive) ensures ...

// 7-conjunct realisation layer: Axi-4 + Axi-5 + Axi-6 + Axi-7 + Axi-8 + Axi-9.
theorem diakrisis_axi_realisation_layer_satisfaction(p: &DiakrisisPrimitive) ensures ...

// 2-conjunct extension layer: T-α + T-2f* + T-2f**.
theorem diakrisis_extension_layer_satisfaction(p: &DiakrisisPrimitive) ensures ...

// 15-conjunct top-level: full canonical-primitive satisfaction.
theorem diakrisis_canonical_primitive_satisfaction(p: &DiakrisisPrimitive) ensures ...
```

A similar 8-citation aggregator exists for MSFS Appendix A's external
categorical preliminaries (`msfs_appendix_A_categorical_preliminaries_full`).

## Related surfaces

* [`verum audit --coord`](/docs/verification/msfs-coord) — per-theorem
  `(Framework, ν, τ)` MSFS coordinate.
* [`verum audit --coherent`](/docs/verification/actic-dual) — operational
  coherence (α-cert ⟺ ε-cert correspondence).
* [`verum audit --framework-axioms`](/docs/verification/framework-axioms)
  — every `@framework(...)` citation grouped by lineage.
* [`verum audit --kernel-rules`](/docs/verification/trusted-kernel) —
  the 18 primitive inference rules implemented in `verum_kernel`.
