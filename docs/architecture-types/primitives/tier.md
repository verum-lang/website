---
sidebar_position: 7
title: "Tier — execution placement"
description: "The Tier primitive: where a cog's code runs (Interp, Aot, Gpu, TierCheck, MultiTier). Tier mismatches without explicit bridges trigger AP-004."
slug: /architecture-types/primitives/tier
---

# Tier — execution placement

A **tier** in ATS-V is the execution placement of a cog's code:
where does the runtime actually run the bytecode? Verum's
execution model carries multiple tiers that share the same VBC
bytecode but differ in their compilation and dispatch:

```verum
public type Tier is
    | Interp
    | Aot
    | Gpu
    | TierCheck
    | MultiTier(List<Tier>);
```

Five variants:

- **Interp** — Tier 0 interpreter. Instant startup, no compilation.
- **Aot** — Tier 1 ahead-of-time native binary via LLVM.
- **Gpu** — GPU-targeted code via MLIR lowering.
- **TierCheck** — abstract-interpretation only; no code emitted.
- **MultiTier(...)** — code that targets multiple tiers
  simultaneously.

A cog declares its tier via `@arch_module(at_tier: Tier.Aot)`.
Mismatches without an explicit bridge trigger
[`AP-004 TierMixing`](../anti-patterns/classical.md#ap-004).

## 1. The execution-tier landscape

Verum's runtime has three primary execution paths, all sharing
the same VBC bytecode:

```text
   .vr source
        ↓
     parse → typecheck → ATS-V → verify
        ↓
     VBC bytecode (canonical IR)
        ↓
   ┌────┴────┬─────────┬──────────┐
   │         │         │          │
   ▼         ▼         ▼          ▼
 Interp   Aot       Gpu        TierCheck
 (tier 0) (tier 1)  (tier 1g)   (no exec)
```

The bytecode is the same; the dispatch differs. Correctness is
identical across paths — a function that returns `42` returns
`42` regardless of tier — but performance, startup time, and
memory characteristics vary substantially.

## 2. `Tier.Interp` — the interpreter

The Tier-0 interpreter executes VBC bytecode directly:

- **Startup:** instant — no compilation step.
- **Steady-state speed:** ~10-30 % of native (typical interpreter).
- **Use cases:** development iteration, REPL, scripts, hot reload.

Cogs declared `Tier.Interp` are *expected* to be exercised via
the interpreter. They may still compile under AOT (the bytecode
is the same), but the cog's architectural intent is interpretive
execution.

## 3. `Tier.Aot` — the AOT compiler

The Tier-1 path lowers VBC bytecode to LLVM IR and emits a
native binary:

- **Startup:** LLVM compile time (seconds to minutes for large
  projects); incremental compilation amortises this.
- **Steady-state speed:** 85-95 % of native C.
- **Use cases:** production binaries, long-running services,
  performance-sensitive code.

Cogs declared `Tier.Aot` are the default for production code.
The AOT path enforces the no-libc invariant — Tier-1 binaries
talk directly to syscalls (Linux/FreeBSD/Embedded) or to the
platform-required boundaries (libSystem on macOS, ntdll on
Windows).

## 4. `Tier.Gpu` — GPU lowering

The GPU tier lowers a subset of VBC bytecode to MLIR for GPU
execution:

- **Startup:** MLIR compile time.
- **Steady-state:** parallel, vectorised, GPU-native.
- **Use cases:** tensor operations, parallel simulations,
  cryptographic primitives that benefit from parallelism.

The GPU tier supports a *subset* of VBC opcodes. Cogs declared
`Tier.Gpu` must use only the supported subset; unsupported
operations are diagnosed at GPU-lowering time.

## 5. `Tier.TierCheck` — abstract-interpretation only

The TierCheck tier runs the cog through abstract interpretation
without emitting code. Used for:

- Specification cogs whose only role is to document an
  interface.
- Stub cogs awaiting implementation.
- Test scaffolding whose behavior is checked statically.

A `Tier.TierCheck` cog is admissible at audit time but does not
produce a runtime artefact. Composing it with a `Tier.Aot` cog
without a bridge triggers `AP-004`.

## 6. `Tier.MultiTier([...])` — multi-tier targets

A cog that legitimately targets multiple tiers — for example, a
math library used both at Tier-0 (for REPL evaluation) and
Tier-1 (for production) — declares `MultiTier([Tier.Interp,
Tier.Aot])`. The compiler verifies the cog's body is admissible
under every listed tier.

A cog with `MultiTier(...)` may compose with cogs at any of its
listed tiers without bridge attributes.

## 7. The tier-mixing check

`AP-004 TierMixing` fires when a cog at tier T1 calls a cog at
tier T2 (different) without an explicit `@bridge_tier(...)`
attribute:

```verum
@arch_module(at_tier: Tier.Aot)
module my_app.production;

@arch_module(at_tier: Tier.Interp)
module my_app.repl_helpers;

// In production.vr:
mount my_app.repl_helpers;
fn process(tx: Tx) -> ... {
    repl_helpers.dump(tx)              // <-- AP-004 here
}
```

The diagnostic identifies the cross-tier call site and suggests
either:

1. Removing the call (production code should not depend on REPL
   helpers).
2. Adding a `@bridge_tier(from: Tier.Aot, to: Tier.Interp)`
   attribute to the receiving function.
3. Promoting the called cog to `Tier.MultiTier([Tier.Interp,
   Tier.Aot])`.

## 8. The `@bridge_tier(...)` attribute

When a cross-tier call is intentional, the bridge attribute makes
it load-bearing:

```verum
@bridge_tier(from: Tier.Aot, to: Tier.Interp)
public fn dump(tx: Tx) -> ()
```

The bridge:

- Lifts the architectural ban for *this specific function*.
- Inserts a runtime tier-transition at the call site (the AOT
  caller invokes the interpreter for the called function).
- Adds a performance-boundary cost to the audit chronicle.

The audit chronicle records every tier bridge for review.

## 9. Tier and CVE Lifecycle interaction

A `Tier.TierCheck` cog cannot declare `Lifecycle.Theorem(...)` —
without code emission, the И axis is absent, and a Theorem
requires И-positive. Such a cog must be `Lifecycle.Definition`
or `Lifecycle.Postulate(...)`.

The `verum audit --bundle` L4 check enforces this:

```text
warning[ATS-V-LIFECYCLE-TIER-MISMATCH]: lifecycle exceeds tier strength
  --> src/spec_only.vr:1:1
   |
 1 | @arch_module(
 2 |     at_tier:  Tier.TierCheck,
 3 |     lifecycle: Lifecycle.Theorem("v1.0"),
 4 | )
   |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ Theorem requires
   |                                          executable code,
   |                                          but tier is TierCheck.
   |
help: change lifecycle to Definition or Postulate, or
      change tier to Interp / Aot / Gpu.
```

## 10. Tier and Foundation orthogonality

Tier and [Foundation](./foundation.md) are orthogonal — every
combination is admissible:

| Foundation | Tier | Typical use |
|------------|------|-------------|
| ZfcTwoInacc | Aot | Production code |
| ZfcTwoInacc | Interp | Development scripts |
| Hott | TierCheck | Theorem-only research |
| Cic | Aot | Coq-verified production code |
| Cubical | Interp | Cubical-evaluator REPL |

The compatibility tables for Foundation and Tier are
independent. A cog at `(Foundation.Hott, Tier.Aot)` is
well-typed if and only if HoTT admits AOT extraction (it does,
for the constructive fragment) and the cog respects the AOT
no-libc invariant.

## 11. Cross-references

- [Stratum primitive](./stratum.md) — the MSFS moduli stratum
  that participates in `AP-006 RegisterMixing`.
- [Lifecycle primitive](./lifecycle.md) — the CVE 7-symbol
  taxonomy that interacts with Tier.
- [Foundation primitive](./foundation.md) — the meta-theoretic
  profile orthogonal to Tier.
- [Anti-pattern AP-004 TierMixing](../anti-patterns/classical.md#ap-004).
- [Architecture → runtime tiers](../../architecture/runtime-tiers.md)
  — implementation-level details of each tier.
- [Architecture → VBC bytecode](../../architecture/vbc-bytecode.md)
  — the shared IR.
