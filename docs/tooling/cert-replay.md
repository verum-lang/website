---
sidebar_position: 20
title: SMT certificate inspection
---

# SMT certificate inspection

`verum cert-replay` inspects SMT certificate formats and collects adapter results. The kernel-only adapter checks the body hash, recognized theory, syntax and registered rule names. It does **not** verify the logical validity of each inference from its premises to its conclusion. Its successful result is `StructuralOnly`, not `Accepted`.

A certificate can contain a false conclusion and a freshly computed, perfectly matching hash. Likewise, recognizing the name `refl` does not establish that the two terms in its conclusion are equal. Integrity and rule-name coverage are useful diagnostics, but neither removes an SMT solver from the trusted computing base.

For native proof terms use [native judgment replay](./native-proof-replay.md), which checks an exact statement using both Verum native checkers.

## Commands

```sh
verum cert-replay replay --backend kernel_only --cert proof.cert.json --output json
verum cert-replay cross-check --cert proof.cert.json --require-consensus --output json
verum cert-replay formats --output json
verum cert-replay backends --output json
```

`replay` always performs structural inspection first. A structural-only result does not satisfy its proof-success exit condition. `cross-check --require-consensus` also fails when any available participant has only structural evidence. Missing tools are reported separately; an empty set of successful checks is not a proof.

Production external adapters report unavailable until actual solver replay is connected. A mock adapter is a test double, not a supported proof backend. Listing a format or recognizing its rule names does not imply semantic replay support for that format.

## Result authority

| Outcome | Meaning |
| --- | --- |
| `StructuralOnly` | Integrity and syntax inspected; inference validity not established. |
| `Accepted` | The selected adapter reports successful replay. Its implementation and trust boundary must be identified. |
| `Rejected` | Inspection or replay rejected the artifact; inspect the diagnostic stage. |
| `ToolMissing` | The requested adapter could not run. |
| `Error` | Replay did not produce a usable result. |

Native theorem certification requires a well-formed statement, a proof term checked against it, explicit assumptions and a faithful elaboration from the source. Cross-format certification additionally requires a statement-preserving translation and actual checking by the destination system. Neither a certificate filename nor a successful export command establishes these obligations.
