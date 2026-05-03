---
sidebar_position: 4
title: "Coherence anti-patterns — merged into ontology band"
description: "Redirect notice: the coherence band has been consolidated with the articulation band into a single ontology page (AP-011..AP-026)."
slug: /architecture-types/anti-patterns/coherence
---

# Coherence anti-patterns — merged

The previous four-band catalog (classical / articulation /
coherence / MTAC) has been consolidated to match the canonical
anti-pattern catalog, which uses three bands:

1. **Capability / composition core** (AP-001 .. AP-010) —
   see [classical](./classical.md).
2. **Boundary / lifecycle / capability ontology** (AP-011 .. AP-026) —
   see [articulation](./articulation.md). This page consolidates
   the previous "articulation" + "coherence" bands.
3. **Modal-temporal architectural calculus** (AP-027 .. AP-032) —
   see [mtac](./mtac.md).

The renaming is *not* an architectural change — it brings the
documentation surface in line with the kernel's source of truth.
Tooling that referenced specific AP-NNN codes is unaffected;
the codes themselves are stable.

## Pattern → page map

| AP code | Previous page | Current page |
|---|---|---|
| AP-011 .. AP-018 | articulation | [articulation](./articulation.md) |
| AP-019 .. AP-026 | coherence | [articulation](./articulation.md) |

For the canonical full catalog see
[anti-pattern overview](./overview.md).
