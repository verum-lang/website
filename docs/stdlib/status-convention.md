---
sidebar_position: 0
title: Status Convention
description: How the stdlib module pages declare their conformance status — taxonomy, frontmatter contract, and update procedure.
---

# Stdlib Module Status Convention

Every page under `docs/stdlib/` on this site declares a
**conformance status** in its YAML frontmatter.  The status tells
readers, at a glance, how thoroughly the module's API contract has
been pinned by the conformance suite at `core-tests/`, and which
defect classes (if any) are still open.

This convention is the **single source of truth** for status semantics,
frontmatter syntax, and the update procedure.  It is shared between
three places — `core-tests/INVENTORY.md` (the per-module truth-table),
each module page's frontmatter (`status` + `status_detail`), and the
`<StdlibStatus />` MDX component (rendered badge).

## Status keywords

| Status | Emoji | Meaning |
|---|---|---|
| `complete` | ✅ | All public APIs covered by unit tests; algebraic laws pinned by property tests; cross-stdlib integration verified; audit findings landed or routed.  The module's contract is fully exercised end-to-end on both the interpreter (Tier 0) and AOT (Tier 1) paths. |
| `stable` | 🟢 | Suite fully green under `--interp` and the covered surface is trusted for use, but the coverage bar for `complete` (property laws + cross-stdlib integration + routed audit) is not fully met. Graduates to `complete` when those land. |
| `partial`  | ⚠️ | A subset of the public API is conformance-tested and stable.  The rest is exercised in `regression_test.vr` via `@ignore`d tests pinning the specific defects that block coverage.  The non-`@ignore`'d API surface is safe; everything else is documented per-module under "Open defects". |
| `regression-only` | ⛔ | Module is gated by upstream stdlib / language-level defects (function-id remap, archive-driven default-method dispatch, CBGR generation tracking on returned `&Text`, …).  Few or no public-API tests pass yet — only `@ignore`d regressions exist to lock the bug shapes.  Avoid in production until promoted to `partial` or `complete`. |
| `undocumented` | ❔ | Documentation in this reference is authoritative, but the module has not yet been routed through the `core-tests/` conformance suite.  The current page is a best-effort snapshot of the source; it may drift from runtime behaviour.  New modules start here; aim to graduate to `regression-only` (write the tests, even if all `@ignore`'d) before merging. |

The five statuses are **mutually exclusive**.  Aggregate modules (`base`,
`async`, `collections`, …) carry the **weakest** status across their
submodules — if any submodule is `regression-only`, the aggregate is at
most `partial`.

:::caution The aggregate rule cannot be evaluated today
Measured 2026-09-03, comparing all 46 status-bearing pages against the
589 rows of `core-tests/INVENTORY.md`:

**247 of those rows carry `unverified`, a sixth token this table does
not define.** It was introduced by the liveness gate to mark a row
whose status had never actually been asserted — the ABSENCE of a
conformance level rather than one of the five. Taking it as "weakest"
propagates it into every aggregate: 32 of the 46 pages would become
`unverified`, which says less than what they say now.

So the aggregate rule as written is not applicable while that token
exists, and the two sources are only comparable where both use the five.
Where they were — `signal` and `simd` — the pages were one status
PESSIMISTIC and have been corrected against the measurement.

The fix is not to relabel the pages. It is to decide what `unverified`
means in this table: either it is a sixth status with its own row and
rank, or those 247 inventory rows need real measurements. Until then, a
disagreement between a page and the inventory is not evidence of drift
in the page.
:::

## Frontmatter contract

Each module page declares its status in YAML frontmatter so search /
sidebar widgets can read it without parsing the body:

```markdown
---
sidebar_position: 3
title: text
description: …
status: partial
status_detail: 189 / 222 (≈85%) tests green under `--interp` as of 2026-05-16; §Y AOT typechecker mount-scoped name resolution deferred.
---
```

| Field | Required | Type | Notes |
|---|---|---|---|
| `status` | **yes** | one of `complete`, `partial`, `regression-only`, `undocumented` | Mirrors `core-tests/INVENTORY.md` for the same module.  Renaming a status keyword anywhere requires the same rename in both places. |
| `status_detail` | yes when `status` ≠ `complete` | one-line string under 256 chars | Conformance numbers (`N/M green under --interp` style) + date + the largest open defect class. |

`status_detail` is mirrored into the visible badge body.  Keep it short
— per-module deep findings belong in `core-tests/<...>/audit.md`, not
the badge.

## Component usage (optional, badge rendering)

Pages that want a visible badge in the page body — instead of relying
on sidebar widgets reading the frontmatter — embed the
`<StdlibStatus />` MDX component:

```mdx
import StdlibStatus from '@site/src/components/StdlibStatus';

<StdlibStatus
  status="partial"
  detail="121/218 Text + 75/86 Char + … unit tests pass on 2026-05-13."
  defects={[
    {area: 'text', summary: '~18 defect classes — KMP find, Iterator.next dispatch, ...'},
    {area: 'char', summary: '5 defect classes — &mut Char mutation, ...'},
  ]}
  sweepDate="2026-05-13"
/>
```

Props:

  * **`status`** — one of `complete | partial | regression-only | undocumented`.
  * **`detail`** *(optional)* — string mirroring the `status_detail`
    frontmatter; rendered in the badge body.
  * **`defects`** *(optional)* — list of `{area, summary}` rows shown
    in a collapsible defect-class table.
  * **`sweepDate`** *(optional)* — last conformance-sweep date.

## Aggregate-page convention

Pages that document a *family* of submodules (`base.md`, `collections.md`,
`async.md`, …) carry the **aggregate status** in frontmatter and a
**per-submodule status table** in the body.  The aggregate is the
weakest status across submodules.

Template for the body table:

```markdown
| Module | Status | Conformance suite |
|---|---|---|
| `<submodule>.vr` | **\<status\>** | [core-tests/\<...\>/\<submodule\>](https://github.com/verum-lang/verum/tree/main/core-tests/<...>/<submodule>) — \<short detail\>. |
```

Each row links to the matching `core-tests/<...>/<submodule>/` folder
so readers can drill into the test surface.

## Update procedure

When a module's conformance numbers change:

  1. **Update the per-module audit**: edit `core-tests/<...>/<module>/audit.md`
     with the new findings, closed defects, and deferred items.
  2. **Append a row to the inventory**: edit
     `core-tests/INVENTORY.md` with the new sweep numbers.  Single-line
     row; do **not** restructure the table.
  3. **Update the module page's frontmatter**: bump `status` if the
     status keyword changed; refresh `status_detail` to mirror the new
     sweep numbers + date.
  4. **Refresh the body**: if the page has an aggregate per-submodule
     status table or a `<StdlibStatus />` badge, update those too.
  5. **Commit**: one logical commit per module sweep.  Commit message
     names the module under sweep + delta in green count.

Step 1 → 2 → 3 is the **mandatory order** — the audit is authoritative,
the inventory is the per-module digest, and the website page is the
public face.  Drift between any two of those three is itself a finding.

## Status taxonomy stability

These four status keywords are pinned: renaming any of them is a
**website-wide** edit (across every stdlib doc page that uses the
keyword) plus an `INVENTORY.md` audit row.  Adding a fifth status
requires opening a tracking task first to scope the cascade.

The aggregate-page convention (status = weakest submodule) is a
**hard rule**: a single `regression-only` submodule rules the whole
family out of `complete`.  This is the design that lets readers trust
the badge — a `complete` aggregate page promises *every* submodule it
documents is `complete`, not just "most".
