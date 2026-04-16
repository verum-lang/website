---
sidebar_position: 10
title: Memory Safety (CBGR)
---

# Tutorial: Memory Safety with CBGR

CBGR (Compile-time Borrow + Generation References) is Verum's memory
safety system. Three reference tiers give you control over the
performance–safety tradeoff.

## Reference tiers

| Tier | Syntax | Cost | Safety |
|------|--------|------|--------|
| 0 (managed) | `&T` | ~15 ns | Full generation-based checking |
| 1 (checked) | `&checked T` | 0 ns | Compiler-proven safe via escape analysis |
| 2 (unsafe) | `&unsafe T` | 0 ns | No checking — you prove safety manually |

```verum
fn example() {
    let x = 42;

    let r: &Int = &x;            // Tier 0 — runtime gen check (~15 ns)
    let c: &checked Int = &x;    // Tier 1 — zero cost, compiler-proven
    // let u: &unsafe Int = &x;  // Tier 2 — requires unsafe block
}
```

## How it works

1. **Compile time**: The CBGR phase runs escape analysis on every function.
   References that provably don't escape their scope are promoted from
   Tier 0 to Tier 1 automatically — zero overhead with full safety.

2. **Runtime**: Tier 0 references carry a 16-byte `ThinRef` (ptr +
   generation + epoch_caps). Reads validate the generation matches,
   preventing use-after-free.

## Configuration

```toml
[runtime]
cbgr_mode = "mixed"     # managed | checked | mixed | unsafe
```

| Mode | Behavior |
|------|----------|
| `mixed` (default) | Escape analysis promotes where safe; rest stays managed |
| `managed` | All refs stay Tier 0 (~15 ns each) — maximum safety |
| `checked` | Promote aggressively — requires compiler proof |
| `unsafe` | Skip all CBGR analysis — zero cost, no safety |

Override per-build:

```bash
verum build --cbgr checked
verum build -Z runtime.cbgr_mode=unsafe
```

## See also

- **[CBGR internals](/docs/architecture/cbgr-internals)**
- **[`[runtime]` config](/docs/reference/verum-toml#runtime)**
