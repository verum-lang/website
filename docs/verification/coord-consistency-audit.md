---
title: Coord-consistency + framework-soundness audits
sidebar_position: 19
---

# Coord-consistency + framework-soundness audits (M4.A / M4.B)

Two complementary audit subcommands close the corpus-side gap between
**kernel-time** soundness gates (which fire only at axiom registration
or proof re-check) and **audit-time** validation (which catches issues
in CI before any kernel work runs):

| Audit | Mirrors kernel-side | What it surfaces |
|---|---|---|
| `verum audit --framework-soundness` | V8.1 #222 — `AxiomRegistry::register` defaults to `SubsingletonRegime::ClosedPropositionOnly` | every `public axiom` whose proposition is just `true` (no propositional content) |
| `verum audit --coord-consistency` | V8.1 #232 — `check_coord_cite` auto-fires at every `CoreTerm::Axiom` reference site | every `@verify(...)`-annotated theorem that has no `@framework(...)` citation |

Both commands emit `audit-reports/<name>.json` (schema_version=1) +
non-zero exit on hard violations, suitable for CI `make` targets.

## `verum audit --framework-soundness` (M4.A)

Walks every `public axiom` in the project and classifies its
**proposition** (the parser's requires-AND-ensures conjunction stored
on `AxiomDecl::proposition: Heap<Expr>`):

| Classification | Definition | What it means |
|---|---|---|
| `sound` | proposition has non-trivial structure (binop / call / refinement etc.) | Real propositional content — passes K-FwAx-light gate |
| `trivial-placeholder` | proposition is just `Literal::Bool(true)` (or AND-chain of `true` literals) | Documentation-only marker; consider strengthening to witness-parameterised form, promoting to `@theorem`, or accepting as Definition-anchor / external-paper citation / trust-boundary marker |

The walker uses the same machinery as the kernel's
`axiom::register_with_regime`
`SubsingletonRegime::ClosedPropositionOnly` gate, projected into AST
form so it runs without kernel registration.

### Sample output

```text
$ verum audit --framework-soundness
--> Framework-soundness audit (corpus-side K-FwAx light gate)
scanned 33 files, 85 axioms classified
  sound                   38
  trivial_placeholder     47

trivial-placeholder axioms (consider strengthening or promoting to @theorem):
  msfs_definition_7_5_lawvere_scope                            [msfs] in theorems/msfs/07_five_axis/...
  msfs_theorem_5_1_proof_template                              [msfs] in theorems/msfs/05_afnt_alpha/...
  ... (etc.)
```

### JSON schema (v1)

```jsonc
{
  "schema_version": 1,
  "scanned_files": 33,
  "total_axioms": 85,
  "totals": {
    "sound": 38,
    "trivial_placeholder": 47
  },
  "rows": [
    {
      "name": "msfs_theorem_5_1_proof_template",
      "kind": "trivial-placeholder",
      "framework_lineage": "msfs",
      "file": "theorems/msfs/05_afnt_alpha/theorem_5_1.vr"
    }
    // ...
  ]
}
```

### Acceptable trivial-placeholder kinds

Not every `trivial-placeholder` row is a defect. The following shapes
are **structurally appropriate** as `@axiom ... ensures true`:

* **Definition anchors** — `msfs_definition_7_5_lawvere_scope`,
  `msfs_definition_8_3_display_class`, etc. The definitional content
  is fully expressed in the function's signature; the proposition body
  is just a marker.
* **External-paper citations** — `msfs_lemma_A_1_kelly_2_categorical`,
  `msfs_lemma_A_8_adamek_rosicky`. Verbatim admissions of authoritative
  external publications.
* **Trust-boundary markers** — `diakrisis_uhm_noesis_223_path_b_anchor`,
  `msfs_stage_m_4_anchor`. Mark a downstream-extension boundary.

Verum-MSFS baseline post-M4.A: 38 sound / 47 trivial-placeholder of
85 total axioms (45% sound; remaining 47 are all in the appropriate
trivial-placeholder shapes listed above).

## `verum audit --coord-consistency` (M4.B)

Walks every public theorem / axiom and validates the **(Fw, ν, τ)
supremum invariant** — every theorem's inferred coordinate must be
≥ max(cited frameworks' coordinates). Reuses the
`invert_to_per_theorem` collector + `PerTheoremCoord` row from the
existing `--coord` audit; classification:

| Classification | Definition | What it means |
|---|---|---|
| `consistent` | `inferred_nu` matches the bare ν of the maximum-cited framework | Theorem's ν is purely from framework citations |
| `verify-lift` | `inferred_nu` exceeds max(cited fw ν) due to `@verify(...)` strategy | Informational — the strategy lift is intentional per VVA §2.3 |
| `missing-framework` | Theorem has `@verify(...)` but **no** `@framework(...)` citation | **Violation** — the theorem's claim has no recorded framework lineage |

Mirror of V8.1 #232 kernel-side typing-judgment integration
(`infer_with_full_context` auto-fires `check_coord_cite` at every
`CoreTerm::Axiom` reference site). Pre-M4.B the gate fired only at
kernel re-check time; the corpus-side walker now surfaces violations
at audit time (CI catchable).

### Sample output

```text
$ verum audit --coord-consistency
--> Coord-consistency audit (corpus-side supremum-of-cited-coords gate)
scanned 33 files, 219 per-theorem-coord rows + 0 no-citation @verify items
  consistent           84
  verify_lift          135
  missing_framework    0
```

Verum-MSFS baseline post-M4.B: 84 consistent / 135 verify-lift / 0
missing-framework. The walker exits with code 1 if any
`missing_framework` rows surface.

### Why three classes?

* **`consistent`** — theorem's ν is purely from its `@framework(...)`
  citations. Common case for "axiom-postulated" theorems.
* **`verify-lift`** — theorem's ν exceeds bare-framework ν because
  the user annotated `@verify(formal)` (lifts to ν=ω) or stricter.
  This is the intended use of the gradual-verification ladder
  (VVA §2.3) — kernel discharges obligation at the higher tier than
  the framework alone provides.
* **`missing-framework`** — theorem has a verify-strategy but no
  framework citation. This means the kernel can't trace which
  framework axiom set the proof depends on. Catches the
  refactor-induced defect class where someone strengthens
  `@verify(runtime)` → `@verify(proof)` but forgets the
  `@framework(...)` annotation.

## CI gate pattern

Both audits integrate into the corpus-side `Makefile`:

```makefile
.PHONY: audit-framework-soundness
audit-framework-soundness:
    $(VERUM) audit --framework-soundness --format json > audit-reports/framework-soundness.json
    @$(VERUM) audit --framework-soundness | head -5

.PHONY: audit-coord-consistency
audit-coord-consistency:
    $(VERUM) audit --coord-consistency --format json > audit-reports/coord-consistency.json
    @$(VERUM) audit --coord-consistency | head -10
```

`audit-coord-consistency` returns non-zero exit on any violation —
`make audit-coord-consistency` fails the build. `audit-framework-soundness`
emits the report but doesn't fail (the trivial-placeholder set is
expected to non-zero on any corpus that ships Definition-anchors).

## Related surfaces

* **[Proof-honesty audit](./proof-honesty.md)** — `verum audit
  --proof-honesty` walker for proof-body shape classification.
* **[`verum audit --coord`](./msfs-coord)** — per-theorem
  `(Framework, ν, τ)` MSFS coordinate (the substrate this audit
  validates).
* **[`verum audit --coherent`](./actic-dual)** — operational
  coherence (α-cert ⟺ ε-cert correspondence).
* **[Trusted kernel](./trusted-kernel)** — the LCF core +
  `K-FwAx` admission gate at `axiom` module.
