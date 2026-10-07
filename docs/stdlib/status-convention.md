---
sidebar_position: 0
title: Status Convention
description: Conformance labels, API and backend coverage, and the evidence required to update module status.
---

# Stdlib Module Status Convention

Module pages describe the APIs and execution backends covered by the
conformance suites in `core-tests/`. A status is meaningful only together
with that scope and the remaining limitations.

The per-module audit records the evidence, `core-tests/INVENTORY.md`
summarizes it, and the website presents the supported behaviour to users.
A documentation edit alone does not establish a new conformance result.

## Status keywords

Inventory rows and page frontmatter use these labels:

| Status | Meaning |
|---|---|
| `complete` | Public API behaviour, algebraic laws and cross-module integration are covered, with audit findings resolved or explicitly accounted for. Completion requires end-to-end checks on both the interpreter and native AOT paths. |
| `stable` | The covered interpreter suite passes. Broader coverage and native parity require separate evidence. |
| `partial` | A subset of the API has conformance coverage. The page and audit identify the untested or failing paths. |
| `regression-only` | Upstream defects block most public-API use. Regression tests record the failing shapes and any working subset. |
| `undocumented` | Conformance evidence has not been documented for the module's API surface. The source reference alone does not establish runtime behaviour. |
| `unverified` | The inventory records no asserted conformance result. This is an absence of evidence, not a passing or failing result. |

The status panel displays the inventory's `undocumented` label as
**`unaudited`**: no conformance assessment is published for this surface;
consult the module documentation and tests. This does not assert that no
tests exist. The other labels retain their inventory names and meaning.

Aggregate pages must not claim coverage stronger than their submodules.
An `unverified` row cannot be treated as a passing result when assessing
an aggregate. Consult the repository's comparison gate when reconciling
page metadata with the inventory:

```sh
python3 scripts/ci/check_doc_status_matches_inventory.py
```

## Reading the status panel

The status identifies the coverage level. Its detail states the APIs,
execution backend and remaining limits. Where a panel lists known
limitations, each row identifies the affected area and observable behaviour.
Those rows remain part of the module's contract even when other controls pass.

A missing panel does not imply complete or stable coverage. Consult the
module's API notes and conformance audit before relying on a particular path.

## Aggregate-page convention

Family pages such as `base`, `collections` and `async` include a table of
submodule coverage. Each row links to its conformance suite and states the
backend and open paths covered by that evidence.

A passing constructor does not establish lifecycle correctness. An
interpreter result does not establish native parity. A focused native
control does not establish every API in a module.

## Update procedure

When verified coverage changes:

1. Record the command, tested artifact or source scope, results and remaining
   limitations in the per-module `core-tests/<...>/audit.md`.
2. Update the matching `core-tests/INVENTORY.md` row with that evidence.
3. Update the page's coverage statement and API limitations to reflect the
   verified behaviour. Preserve unresolved limitations unless evidence closes them.
4. Keep the status panel and submodule tables consistent with that evidence.
5. Commit the coherent documentation change and check its links.

The audit precedes the inventory and public reference. Changing a status
keyword requires updating its consumers and checking the rendered reference;
a label is not a substitute for validation.
