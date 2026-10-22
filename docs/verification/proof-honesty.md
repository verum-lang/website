---
title: Proof-honesty audit (`verum audit --proof-honesty`)
sidebar_position: 18
---

# Proof-honesty audit

`verum audit --proof-honesty` classifies public theorem and axiom declarations
by proof-body shape. It helps locate missing bodies, shallow wrappers and
concentrated dependencies. It does not type-check the reported proof terms
or establish that a formal statement faithfully expresses a source theorem.

A long body can prove the wrong proposition. A one-line term can prove the
right one. Step counts organize review; they are not a measure of verified
mathematics.

## Companion audits {#companion-audits-v2--v3-trusted-boundary-surfaces}

| Flag | Observed evidence |
|---|---|
| `--proof-honesty` | Declaration kind and syntactic proof-body shape. |
| `--kernel-discharged-axioms` | Intrinsic annotations, diagnostic calculations and citations. |
| `--apply-graph` | Named dependencies and their resolution. |
| `--reflection-tower` | Declared universe footprints and finite reflection samples. |
| `--bridge-admits` | Registered bridge assumptions and their provenance. |
| `--framework-soundness` | Framework citation metadata and its classification. |
| `--coord-consistency` | Coordinates assigned to declarations and their dependencies. |

### Evidence, not proof authority {#evidence-not-just-a-count}

`--kernel-discharged-axioms` uses schema version 3. It reports
`proof_status: "structural_only"`, `discharge_count: 0` and a separate
`citation_count`. Its `evidence_breakdown` preserves the origin of evidence:

- `computed`: a diagnostic computation ran; this alone supplies no proof term
  for the annotated theorem.
- `cited`: a reference was recorded; its content and formal translation were
  not checked by citing it.
- `needs_structural_args`: the dispatcher lacks structural inputs needed for
  its diagnostic.

The command exits nonzero when it encounters these unverified intrinsic
obligations or malformed annotations. The historical command name does not
change this contract.

`--apply-graph` similarly reports `dependencies_resolved` separately from
`proof_status`, counts `unverified_theorems`, and fails the proof gate when
those obligations are present. A resolved name does not check an application,
its arguments, or its premises.

The common kernel verdict `StructuralOnly` preserves this boundary during
aggregation. See [Reflection tower](./reflection-tower.md) for the analogous
separation between positive samples and proof discharge.

## Standard-library proof coverage

There is no sound coverage estimate obtained by counting `theorem`
declarations or subtracting `axiom` declarations. Review each claimed result
against its mathematical statement, quantified objects, assumptions and
actual proof. A carrier accessor, numeric bound, citation year or declaration
marker can express useful metadata without proving the named theorem.

A source-level coverage inventory must distinguish an unchecked statement,
an assumed statement, a checked judgment under explicit assumptions, and a
checked judgment with a validated correspondence to its source. Keep the
assumptions and checker identities available for each accepted result.

## Quick start

```bash
verum audit --proof-honesty
verum audit --proof-honesty --format json > honesty.json
```

Use the result to select declarations for inspection. Run actual proof
certification separately; this command does not perform it implicitly.

## Classification semantics

The labels describe the classifier's syntactic categories:

| Kind | Classification | Interpretation |
|---|---|---|
| `axiom-placeholder` | A public axiom declaration. | An assumption or marker requiring review, not a proved theorem. |
| `theorem-no-proof-body` | A theorem without a proof body. | No proof body was available to this walker. |
| `theorem-trivial-true` | A body with no counted proof steps. | Historical label for an empty shape; it does not determine the proposition. |
| `theorem-axiom-only` | A nonempty body with at most one counted apply step and no counted let binding. | Includes proof terms and method bodies; the name does not establish an axiom dependency. |
| `theorem-multi-step` | A nonempty body with multiple counted apply steps or at least one counted let binding. | Structured syntax, not evidence of successful kernel replay. |

The walker descends into tactic sequences. Term bodies and method bodies are
counted as one step. `apply_count`, `let_bindings` and `proof_body_steps`
therefore describe the representation of the body, not its mathematical
strength. The classifier lives in
`crates/verum_cli/src/commands/audit.rs::classify_proof_body`.

## JSON schema (v1)

| Field | Content |
|---|---|
| `schema_version` | `1` for the proof-body inventory. |
| `scanned_files` | Number of files inspected. |
| `totals` | Counts by classification. |
| `by_lineage` | Path-based partitions of those counts. |
| `rows` | Declaration name, kind, source file and syntactic step counts. |

The `by_lineage` grouping recognizes `/msfs/` and `/diakrisis/` in paths.
This is an organizational convention, not a semantic analysis of a theory.
Other audit commands have their own schema versions.

## CI gate pattern

A project may use the inventory to reject missing proof bodies or unexpected
axiom declarations. Such checks enforce source hygiene. Do not require more
proof steps as a proxy for correctness: that rewards splitting a term into
irrelevant intermediate bindings.

For proof admission, require a matching formal statement, explicit
assumptions and successful certificate replay. Add negative controls that
change the conclusion, a premise or a bound variable and require rejection.
The syntactic inventory and the certificate gate serve different purposes.

## Promoting `@axiom` to `@theorem`

1. State the original mathematical claim with its full scope and assumptions.
2. Define the carriers and relations that give those words formal meaning.
3. Construct a proof term of that exact statement. Any remaining premise is
   part of the resulting conditional theorem and must remain visible.
4. Check the term, preserve its source correspondence, and verify that
   materially altered conclusions are rejected.

Replacing an assertion with an accessor returning `true`, assuming the
conclusion, or adding `apply` steps does not complete this process. A useful
abstract theorem may quantify over an interface, but applying it to a concrete
model still requires establishing that interface's conditions.

## Carrier protocols shipped in `core.math`

Modules such as `core.math.s_definable.class_s_s`,
`core.math.absolute_layer`, `core.math.strata` and
`core.math.diakrisis_primitive` provide carrier interfaces. Their names and
Boolean accessors do not certify the corresponding mathematical results.
For example, a nonnegative closure-depth field does not establish membership
in a semantic closure class without the representation and closure proofs.

## Aggregator `@theorems`

Combining named results requires checking the exact types and premises of
their applications. Resolving every dependency in an `apply` graph is useful,
but does not prove the aggregate conclusion. The same rule applies when
some dependencies already have valid native certificates: their judgments
must match the statements used by the aggregate proof.

## Related surfaces

- [Proof export](./proof-export.md): admitted formats and source-linked certification.
- [Framework axioms](./framework-axioms.md): explicit trust inventory.
- [Kernel module map](./kernel-module-map.md): checkers and diagnostic modules.
- [Audit protocol](../architecture-types/audit-protocol.md): per-gate evidence and exit behavior.
