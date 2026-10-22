---
sidebar_position: 9
title: Proof Export
---

# Proof Export

`verum export` currently **refuses** Lean, Coq, Dedukti, Metamath and Agda
proof targets before creating output files. The project exporter does not yet
carry the exact typed source statement through to these renderers. Printing
`axiom name : Prop`, `sorry`, `Admitted` or an unknown proof body would not
establish that statement. A source citation or provenance sidecar cannot repair
that missing translation.

The refusal preserves existing user-selected output and emits an explicit
unsupported diagnostic. Repeating the command does not overwrite an old
artifact or silently replace it with a scaffold. Historical scaffolds remain
unfinished migration inputs wherever they were previously stored.

## Distinct artifacts

| Artifact | Meaning |
|---|---|
| `verum-native/1` judgment | Exact native statement and certificate replayed by the portable checker |
| `verum-source-pi-id/1` carrier | Actual source plus selected declaration, elaborated under an explicit logical profile |
| `.vproof` | Minimal closed certificate accepted by `check-proof` under its own input contract |
| `SmtCertificate` | Solver envelope with a separate replay trust boundary; structural replay is not proof authority |
| Typed IR | Program representation, not a foreign theorem proof |
| OWL 2 output | Ontology representation, not automatically a proof of the source contracts |
| Historical provenance sidecar | Source attribution, not a theorem certificate |

The retained foreign renderers and their formatting tests are implementation
components, not enabled proof-admission paths. Passing a renderer test does not
claim target-checker acceptance. For source/native checking today, use the
[knowledge-system profile](./knowledge-systems.md).

## Conditions for enabling a proof target

A completed translation must preserve the full source statement: binders,
universes, dependent types, premises, definitions and admitted axioms. A proof
term must inhabit its translated statement; a proposition itself is not its
proof. The target checker must replay that term with no undeclared assumption
or admitted hole. Source/target identities and checker outcomes must be retained.

Proof preservation is weaker than conservativity, faithfulness or equivalence
of foundations. Those properties need their own proofs. A single framework
label cannot establish any of them.

The project admission gate is in
[`commands/export.rs`](https://github.com/verum-lang/verum/blob/main/crates/verum_cli/src/commands/export.rs).
The independent source elaborator is in
[`verum_source_proof`](https://github.com/verum-lang/verum/tree/main/crates/verum_source_proof).
