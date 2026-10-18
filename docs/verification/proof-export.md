---
sidebar_position: 9
title: Proof Export
---

# Proof Export

Verum exports declarations, provenance and supported proof-body shapes to
external proof systems. Export is useful for inspection and further proof
work. Its success does not establish that the exact source theorem has been
proved in the target: declarations can be schematic and bodies can contain
admitted placeholders.

The source-theorem-to-`.vproof` path, the general external exporter and the
kernel-soundness corpus exporter are separate mechanisms. Their input
languages and guarantees must be checked separately. In particular, the
minimal source bridge does not export theorem parameters, `requires` clauses,
source function contracts or source refinement types as supported goals.
It reports unsupported translation without emitting a certificate. See the [source-to-goal boundary](./knowledge-systems.md#source-to-goal-boundary).

## 1. What gets exported

`verum export` walks project declarations. For proof-system targets it can
use a cached solver certificate, a recognized simple `apply` body, or a
structural `CoreTerm` body when available. Unsupported cases fall back to
target-specific placeholders. This is partial translation, not uniform
full-proof export.

The distinction also applies to the statement. For example, the Lean
project emitter can produce `axiom name : Prop` and `def name : Prop ...`.
These declare a proposition or a value of the proposition sort; they do
not establish the original source assertion. A printed proof body cannot
repair a missing or changed theorem statement by itself.

The authoritative implementations are
[`commands/export.rs`](https://github.com/verum-lang/verum/blob/main/crates/verum_cli/src/commands/export.rs)
and [`proof_export.rs`](https://github.com/verum-lang/verum/blob/main/crates/verum_codegen/src/proof_export.rs).
A body lowerer recognizes particular constructors; unsupported constructors
remain explicit in its output. An external verifier must check the resulting
artifact, and a consumer must establish statement correspondence.

## 2. Artifacts and provenance

The export command writes target-language source. `--with-provenance` adds
a JSON sidecar describing collected declarations and their source/framework
attribution. The sidecar is evidence about provenance, not a replacement
for the target proof or a proof of complete dependency closure.

Keep these formats distinct:

| Artifact | Role |
|---|---|
| `.vproof` | Closed minimal term and claimed type, checked by `check-proof` |
| `SmtCertificate` | Solver envelope and goal identity, with its own replay trust boundary |
| External source | Translated or schematic declarations and supported bodies |
| Provenance sidecar | Declaration origin and attribution used for auditing |
| Typed IR | A separately checked typed-AST export; not a theorem certificate |

A reusable proof receipt additionally needs the exact statement, imports,
checker identity and assumptions. See the
[knowledge-system profile](./knowledge-systems.md).

## 3. Export targets

### 3.1 Lean 4

The emitter and structural lowerer produce Lean source for supported
constructors. Unsupported bodies can contain `sorry`; schematic declarations
can have type `Prop` rather than the intended source proposition. Inspect
both the statement and proof before interpreting a successful Lean build.

### 3.2 Coq

The Coq target uses Gallina declarations and supported proof/body translations.
`Axiom` and `Admitted` retain assumptions and missing proofs. Target acceptance
is relative to those assumptions; it is not proof of the source statement's
faithful translation.

### 3.3 Dedukti

The Dedukti target emits declarations and supported term shapes in its
exchange syntax. A supported printing rule is not a verified reconstruction
of every native solver inference. Imports and rewrite rules form part of
the receiving checker environment.

### 3.4 Metamath

The Metamath target can retain statements, axiom declarations and incomplete
proof markers. A placeholder is unfinished proof work. Do not report a
completed proof without the corresponding checker accepting the actual
proof steps under the recorded database.

The format parser also provides Agda, OWL 2 Functional Syntax and typed-IR
targets. Their artifact meanings differ: an ontology export or typed program
representation is not a foreign theorem proof merely because it uses the
same command.

## 4. Round-trip guarantees

A completed cross-system proof claim requires all of the following:

1. The exported statement corresponds to the source statement under an
   explicit interpretation, including universes and assumptions.
2. The target artifact contains a complete derivation or identifies each
   accepted additional assumption.
3. The selected target checker actually accepts that artifact with pinned
   imports and configuration.
4. The receipt distinguishes source correspondence, target checking and
   trusted assumptions rather than combining them into one success flag.

Neither a matching name nor a zero exit code for an axiom-bearing scaffold
establishes these conditions. The exporter does not supply a universal
proof-preservation theorem between the source and target calculi.

## 5. CLI — `verum export` {#5-cli}

Run in the project whose declarations should be exported:

```bash
verum export --to lean --output target/lean/export.lean --with-provenance
verum export --to coq --output target/coq/export.v --with-provenance
verum export --to dedukti --output target/dk/export.dk
verum export --to metamath --output target/mm/export.mm
```

`verum export-proofs` is an alias. Proof-system targets walk the project;
the optional positional source file belongs to the separate `typed-ir`
route. Inspect the summary for skipped files. An empty or incomplete scan
must not be treated as complete project coverage.

The command does not accept `--selective`, `--include-framework`, `--bundle`,
`--verify-after` or `--on-mismatch`. Rechecking with the receiving tool is a
separate step. Consult `verum export --help` for the selected executable.

## 6. Round-trip test suite

A useful export test records source input, emitted statement, proof body,
assumption inventory and target-checker output. It must contain negative
controls for changed conclusions, missing premises, unsupported constructors
and skipped files. A target accepting a file containing placeholders is
not the same test as a target rejecting an invalid derivation.

For the separate kernel-soundness corpus gate, see
[external-prover verification](../architecture/external-prover-verification.md).
Its encoded rule declarations do not cover every application export.

## 7. Limitations

- Structural printers do not provide a general faithful interpretation of
  cubical, modal, refinement or inductive reasoning into every target.
- Solver attribution and an obligation hash do not replace rule-by-rule
  proof reconstruction. See [the SMT boundary](../architecture/trusted-kernel.md#the-smt-certificate).
- Framework names and bibliographic citations do not pin imported definitions
  or prove that a cited theorem has been instantiated correctly.
- A missing body, unsupported constructor, placeholder or incomplete scan
  must remain visible in the stored result.

## 8. Why export matters

The goal is portable, independently checkable knowledge: a result can outlive
its original tool and participate in another theory without losing its
assumptions or changing its meaning. Verum's explicit term language and
export interfaces provide places to implement that contract. Completing it
requires statement-preserving translation and actual target verification
for the supported fragment.

- [Proof-term checking](./trusted-kernel.md)
- [Kernel trust boundaries](../architecture/trusted-kernel.md)
- [Knowledge-system verification profile](./knowledge-systems.md)
