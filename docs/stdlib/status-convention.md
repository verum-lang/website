---
sidebar_position: 0
title: Status Convention
description: Conformance labels, supported badge properties, and the evidence required to update module coverage.
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

The rendered `<StdlibStatus />` component has a smaller vocabulary:
**`complete`, `partial`, `regression-only`, `unaudited`**. It does not
convert inventory labels automatically. Keep frontmatter labels separate
from component props, and describe the actual evidence in `detail` rather
than implying a stronger level of coverage. `unaudited` means no conformance
assessment is published for this surface; consult the module documentation
and tests. It does not assert that no tests exist.

Aggregate pages must not claim coverage stronger than their submodules.
An `unverified` row cannot be treated as a passing result when assessing
an aggregate. Consult the repository's comparison gate when reconciling
page metadata with the inventory:

```sh
python3 scripts/ci/check_doc_status_matches_inventory.py
```

## Frontmatter contract

Frontmatter records a concise coverage statement:

```markdown
---
sidebar_position: 3
title: runtime
description: Runtime backend coverage and limitations.
status: partial
status_detail: "Interpreter root-supervisor access has coverage; native accessor results require separate validation."
---
```

| Field | Required | Notes |
|---|---|---|
| `status` | yes | Use the inventory label for the same module and retain its coverage scope. |
| `status_detail` | when coverage is incomplete | Summarize covered APIs, execution backend and the largest open limitation in one short sentence. Keep test totals and editorial dates in the engineering evidence, not the public badge. |

Frontmatter does not automatically render a badge. Pages that use the
component pass its props explicitly and keep their text consistent with
the frontmatter and module body.

## Component usage

```mdx
import StdlibStatus from '@site/src/components/StdlibStatus';

<StdlibStatus
  status="partial"
  detail="Interpreter root-supervisor access has coverage; native accessor results require separate validation."
  defects={[
    {area: 'root supervisor', summary: 'Native accessor results must preserve the initialized supervisor identity and name.'},
  ]}
/>
```

Props:

- **`status`** — `complete | partial | regression-only | unaudited`.
- **`detail`** — optional summary of the supported APIs, backend and limitations.
- **`defects`** — optional list of `{area, summary}` entries for open limitations.

## Aggregate-page convention

Family pages such as `base`, `collections` and `async` include a table of
submodule coverage. Link each row to its conformance suite and state the
backend explicitly:

```markdown
| Module | Status | Conformance suite |
|---|---|---|
| `<submodule>.vr` | **<status>** | [Conformance suite](https://github.com/verum-lang/verum/tree/main/core-tests/<family>/<submodule>) — covered APIs, backend and open limitation. |
```

A passing constructor does not establish lifecycle correctness. An
interpreter result does not establish native parity. A focused native
control does not establish every API in a module.

## Update procedure

When verified coverage changes:

1. Record the command, tested artifact or source scope, results and remaining
   limitations in the per-module `core-tests/<...>/audit.md`.
2. Update the matching `core-tests/INVENTORY.md` row with that evidence.
3. Update the page's frontmatter and API limitations to reflect the verified
   behaviour. Preserve unresolved limitations unless evidence closes them.
4. Keep body tables and explicit badge props consistent with those statements.
5. Commit the coherent documentation change and check its links.

The audit precedes the inventory and public reference. Changing a status
keyword or adding a component value requires updating its consumers and
checking the rendered site; a label is not a substitute for validation.
