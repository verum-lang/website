---
title: Coord-consistency + framework-soundness audits
sidebar_position: 19
---

# Coord-consistency + framework-soundness audits

These subcommands inspect declaration syntax and framework metadata. They do
not prove propositions, establish consistency, or replace proof checking.

| Audit | Inputs | What it surfaces |
|---|---|---|
| `verum audit --framework-soundness` | Public axiom proposition syntax | Literal `true` and conjunctions made entirely of `true` |
| `verum audit --coord-consistency` | Framework citations and verification annotations | Verification annotations without recorded framework lineage, plus coordinate classifications |

Both commands support text and JSON output on standard output. Redirect JSON
when a report file is needed. The coordinate audit fails on missing-framework
rows; the framework audit reports classifications without failing on placeholders.

## `verum audit --framework-soundness`

Walks every `public axiom` in the project and classifies its
**proposition** (the parser's requires-AND-ensures conjunction stored
on `AxiomDecl::proposition: Heap<Expr>`):

| Classification | Definition | What it means |
|---|---|---|
| `sound` | proposition is not a literal `true` or conjunction made entirely of `true` | A syntax classification; truth and consistency are not established |
| `trivial-placeholder` | proposition is just `Literal::Bool(true)` (or an AND-chain of `true` literals) | The proposition carries no claim beyond `true`; review its intended meaning |

The implementation is `expr_is_trivially_true` in
`crates/verum_cli/src/commands/audit.rs`. It does not invoke the kernel's
`AxiomRegistry::register` checks. Even literal `false` receives the `sound`
classification because it is not a trivial `true` expression; that label is
not a proof verdict.

### Illustrative output

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

### Interpreting placeholder rows

A placeholder may mark a definition, source citation or intended trust boundary.
Its name or citation does not establish the associated mathematical law. A
marker whose proposition is `true` proves only `true`. Before claiming the law,
state its actual proposition and supply checked evidence or an explicit,
reviewed assumption.

## `verum audit --coord-consistency`

Collects per-declaration coordinates from framework citations and verification
annotations using `invert_to_per_theorem`. It compares each reported coordinate
with the cited framework's bare coordinate and classifies missing citations:

| Classification | Definition | What it means |
|---|---|---|
| `consistent` | `inferred_nu` matches the bare ν of the maximum-cited framework | Theorem's ν is purely from framework citations |
| `verify-lift` | `inferred_nu` differs from the inferred framework's bare coordinate | Reports the annotation-derived coordinate difference; does not check a proof |
| `missing-framework` | Theorem has `@verify(...)` but **no** `@framework(...)` citation | **Violation** — the theorem's claim has no recorded framework lineage |

This metadata audit does not establish enforcement at every proof-term node.
In `crates/verum_kernel/src/infer.rs`, `infer_with_full_context` checks a direct
axiom reference when both coordinates are available. Recursive inference calls
currently reset the theorem coordinate, so nested axiom references do not
receive the same check. An audit classification does not close that limitation.

### Illustrative output

```text
$ verum audit --coord-consistency
--> Coord-consistency audit (corpus-side supremum-of-cited-coords gate)
scanned 33 files, 219 per-theorem-coord rows + 0 no-citation @verify items
  consistent           84
  verify_lift          135
  missing_framework    0
```

The walker exits with code 1 if any `missing_framework` rows are found.

### Reading the classifications

- `consistent` means the reported coordinate matches the cited framework's
  bare coordinate. It is not a theorem-validity result.
- `verify-lift` records a coordinate difference associated with the verification
  strategy. An annotation alone does not discharge its proof obligations.
- `missing-framework` means a declaration has a verification annotation without
  a framework citation. This is a lineage-policy violation, not a demonstration
  that the proposition is false.

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
expected to be nonzero on a corpus containing such markers).

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
