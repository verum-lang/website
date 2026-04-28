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

## Recent stdlib promotion (2026-04-28)

The 2026-04-28 sweep promoted **47 tautological framework-citation
axioms** to V2 witness-parameterised theorems across the entire
`core/action/` module hierarchy:

| Module | Axioms removed | Theorems added |
|--------|----------------|-----------------|
| `core/action/monads/{pure,reader,writer,state,probability,quantum}.vr` | 29 | 29 |
| `core/action/effects.vr` | 10 | 10 (route through `is_commutative_effect`) |
| `core/action/ludics.vr` + `ludics_lazy.vr` | 8 | 8 (gate via productivity / cut-elim classifier) |

**Result**: Zero tautological axioms remain in `core/action/`. The
entire monad / effect / ludics layer now ships with theorems whose
ensures clauses **state the actual law** rather than just `true`.

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
