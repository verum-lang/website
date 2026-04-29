---
sidebar_position: 16
title: Foreign-system import
---

# `verum foreign-import` — Read Coq / Lean4 / Mizar / Isabelle theorems

`verum foreign-import` is the **inverse of cross-format export**.
It reads a Coq / Lean4 / Mizar / Isabelle source file and emits a
Verum `.vr` skeleton with one `@axiom`-bodied declaration per
imported theorem, attributed back to the original source via
`@framework(<system>, "<source>:<line>")`.

The user / LLM-tactic then fills in the proof body with Verum
tactics, or keeps the `@axiom` and treats the foreign system as the
trust boundary.  Either way, the **citation chain is preserved**:
`verum audit --framework-axioms` surfaces every foreign-attributed
theorem in the corpus.

## Mental model

A Verum corpus and a foreign corpus describe the same theorems from
different foundational angles.  Importing makes the foreign corpus
**reachable from Verum source**: a Lean4 `Mathlib.Algebra.Group.Basic`
file becomes a `.vr` file with one Verum theorem skeleton per Lean
theorem, ready to be (a) discharged with a Verum tactic, or (b)
admitted via `@axiom` while keeping Lean as the trust boundary.

## Subcommand

```bash
verum foreign-import --from <coq|lean4|mizar|isabelle> <FILE> \
                     [--out <PATH>] [--format skeleton|json|summary]
```

### `--from` system tag

Canonical names + aliases:

| Canonical | Aliases | Source extension |
|---|---|---|
| `coq` | `rocq` | `.v` |
| `lean4` | `lean`, `mathlib`, `mathlib4` | `.lean` |
| `mizar` | `mml` | `.miz` |
| `isabelle` | `isabelle/hol`, `hol` | `.thy` |

### `--format`

| Format | Output |
|---|---|
| `skeleton` (default) | A complete `.vr` source you can copy into your project. |
| `json` | Structured payload for tooling — every imported theorem listed with `name`, `kind`, `line`, `statement`, `framework_citation`. |
| `summary` | Human-readable count + name list. |

### `--out`

Without `--out` the output goes to stdout.  With `--out <PATH>` it
is written to disk.

## Examples

### Importing a Coq file

```bash
$ cat algebra.v
Theorem add_comm : forall a b : nat, a + b = b + a.
Proof. admit. Qed.

Lemma succ_pos : forall n : nat, S n > 0.
Proof. admit. Qed.

Axiom choice : forall {A : Type}, (exists x : A, True) -> A.

$ verum foreign-import --from coq algebra.v
// Auto-imported from coq source: algebra.v
// 3 declaration(s) extracted.  Proof bodies admitted as
// `@axiom`; replace with a Verum proof to discharge
// each citation.

// imported from coq: algebra.v:1
//
//   forall a b : nat, a + b = b + a
@framework(coq, "algebra.v:1")
public theorem add_comm()
    ensures /* TODO: translate the foreign statement above */ true
    proof by axiom;

// imported from coq: algebra.v:4
//
//   forall n : nat, S n > 0
@framework(coq, "algebra.v:4")
public lemma succ_pos()
    ensures /* TODO: translate the foreign statement above */ true
    proof by axiom;

// imported from coq: algebra.v:7
//
//   forall {A : Type}, (exists x : A, True) -> A
@framework(coq, "algebra.v:7")
public axiom choice()
    ensures /* TODO: translate the foreign statement above */ true
    proof by axiom;
```

You then translate the original Coq statements (preserved as
comments) into Verum propositions and replace `proof by axiom`
with a Verum tactic body.

### Importing a Lean4 / Mathlib file

```bash
$ verum foreign-import --from lean4 \
    Mathlib/Algebra/Group/Basic.lean \
    --out imports/algebra-group-basic.vr

# imports/algebra-group-basic.vr now contains one `@axiom`-bodied
# Verum declaration per Mathlib theorem, attributed back to the
# original line numbers.
```

### JSON output for tooling

```bash
$ verum foreign-import --from lean4 src.lean --format json
{
  "schema_version": 1,
  "system": "lean4",
  "source": "src.lean",
  "count": 1,
  "theorems": [
    { "name": "add_comm", "kind": "theorem", "line": 1,
      "statement": "∀ a b : Nat, a + b = b + a",
      "framework_citation": "src.lean:1" }
  ]
}
```

### Summary output

```bash
$ verum foreign-import --from coq algebra.v --format summary
Imported 3 declaration(s) from coq source `algebra.v`:

  By kind:
    axiom        1
    lemma        1
    theorem      1

  Names:
    algebra.v:1  add_comm
    algebra.v:4  succ_pos
    algebra.v:7  choice
```

## Per-system extraction contract

The V0 importers extract **statements** (signature + proposition);
proof bodies are admitted as `@axiom`.  Statement-level extraction
is sufficient to populate a Verum corpus with the foreign theorem
inventory; full proof-term translation is a follow-up.

### Coq

Recognises top-level keywords `Theorem` / `Lemma` / `Corollary` /
`Axiom` / `Definition`.  Statement runs from the `:` after the name
to the terminating `.` (Coq's statement terminator).  `(* ... *)`
comments are stripped before extraction.

### Lean 4

Recognises `theorem` / `lemma` / `axiom` / `def`.  Statement runs
from `:` after the name to `:=` (the proof separator).  Stops at
end-of-line if there's no `:=` (axioms).  `-- ...` line comments
are stripped before extraction.

### Mizar

Recognises `theorem` / `definition`.  Statement runs to the next
`;` (Mizar's statement terminator).  `:: ...` line comments are
stripped before extraction.

### Isabelle/HOL

Recognises `theorem` / `lemma` / `axiomatization`.  Statement
extends until the next `proof` / `by` / `apply` keyword (where the
proof body begins).  `(* ... *)` block comments are stripped before
extraction.

## Validation contract

| Rule | Error |
|---|---|
| `--from` not in canonical / alias list | `--from must be one of coq / lean4 / mizar / isabelle (or aliases ...)` |
| `--format` not `skeleton`/`json`/`summary` | `--format must be 'skeleton', 'json', or 'summary'` |
| Source file does not exist | I/O error reported on stderr, non-zero exit. |

## Reproducibility envelope

The `@framework(<system>, "<source>:<line>")` attribution survives
into Verum's audit pipeline: `verum audit --framework-axioms` lists
every imported theorem grouped by source system, so reviewers see
exactly which theorems Verum is delegating to which foreign
foundation.  Combined with the auto-paper generator, your published
artefacts cite the foreign-system source as a first-class trust
boundary.

## Bidirectional reproducibility

Together with `verum export`, this command closes the
foundation-neutral loop:

```text
   foreign source                 Verum corpus                   foreign target
   (Coq / Lean4 /                                                (Coq / Lean4 /
    Mizar / Isabelle)                                             Dedukti / Metamath)
       │                              │                                │
       │  verum foreign-import        │  verum export                  │
       └────────────────────────────► │ ─────────────────────────────► │
                                      │
                                      │  Verum-side proof body
                                      │  (or kept as @axiom)
```

A theorem proved in Verum can be exported to Lean; a theorem proved
in Lean can be imported to Verum and (re-)proved by Verum's kernel.
Disagreement at any step is a bug somewhere in the chain — the
**cross-system consistency check** uses the round-trip identity to
shake out bugs in either system's kernel.

## CI usage

```bash
# Daily Mathlib import: pull the latest Mathlib, regenerate Verum
# axiom skeletons, run `verum audit --framework-axioms` to see the
# delta from yesterday's import.
git -C deps/mathlib pull
verum foreign-import --from lean4 deps/mathlib/Mathlib/Algebra/Group/Basic.lean \
    --out imports/mathlib-algebra-group-basic.vr
verum audit --framework-axioms --format json > today.json
diff yesterday.json today.json
```

## Cross-references

- **[Verification → proof export](/docs/verification/proof-export)**
  — the inverse direction (Verum → foreign).
- **[Verification → framework axioms](/docs/verification/framework-axioms)**
  — what `@framework(...)` attribution means and how the audit
  surfaces consume it.
- **[Auto-paper generator](/docs/tooling/auto-paper)** — every
  imported theorem appears in the rendered paper with its
  source-system attribution.
- **[Verification → proof corpora](/docs/verification/proof-corpora)**
  — corpus-level conventions (file layout, attribution, hygiene).
