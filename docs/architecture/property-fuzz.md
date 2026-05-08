---
sidebar_position: 13
title: Property Fuzz
description: "Mutation-based + generative property fuzz over the canonical-battery seed roster.  Each iteration picks a seed, samples a 1–3-element mutation chain, applies it, and runs the mutant through the default kernel registry (Slot A / B / C).  Disagreements are auto-shrunk to a minimal failing case; sampling bias is observable through per-mutation, per-seed, and chain-length-distribution coverage instrumentation."
---

# Property Fuzz

> Status: load-bearing CI gate.  500 fuzz iterations on every
> release.  Disagreements auto-shrink to minimal failing case
> for triage; coverage instrumentation surfaces sampling bias
> when the gate passes.

## 1. Why this gate exists

The canonical 24-cert battery exercises the curated surface — the
shapes the kernel author thought to test.  But a kernel can match
on every curated certificate yet diverge on a corner case the
curator never considered.  Two algorithmically-distinct kernels
sharing a fast-rejection path is the classic blind spot: both
reject early on the same family of malformed terms and look
identical, while differing subtly on near-well-typed shapes.

**Property fuzz** is the long-tail complement: it takes the
accept-path canonical certs as **seeds**, applies structural
mutations (1–3 per iteration), and runs each mutant through every
registered kernel.  The property invariant is:

> *For every mutant, every registered kernel reaches the same
> verdict (accept or reject).*

Disagreement is the audit-failure signal — a kernel-implementation
bug is exactly that case.  500 iterations runs in ~50ms; CI-cheap
and bug-dense.

The gate complements
[`--differential-kernel`](./three-kernel-differential.md) (which
runs the *curated* canonical battery through the same registry)
and [`--differential-lean-checker`](./differential-lean-checker.md)
(which runs the curated battery cross-language Rust↔Lean).

## 2. Architecture

```
        seed_certificates() (16 accept-path canonical certs +
                             1 hand-built K-combinator deeper seed)
                       ↓
     [iteration N — seed[N % seeds.len()]]
                       ↓
     sample_mutation_chain(rng, MAX_MUTATION_CHAIN_LEN=3)
                       ↓
        chain = [m₁, m₂, m₃]    ← 1–3 mutations from grammar of 11
                       ↓
     apply_mutation_chain(seed, chain)
                       ↓
     mutant : Certificate
                       ↓
     KernelRegistry::default().verify_all(&mutant)
                       ↓
        MultiVerdict { agreement: Unanimous|UnanimousReject|Disagreement }
                       ↓
     ┌── Unanimous → coverage++  ─────────────────────────┐
     ├── UnanimousReject → coverage++  ───────────────────┤
     └── Disagreement → SHRINK ──────────────────────────►│
                       ↓                                   │
            shrink_disagreement(registry, seed, chain)     │
                       ↓                                   │
            ShrinkReport { minimal_chain, steps_taken }    │
                       ↓                                   │
                       └───────────────────────────────────┘
                       ↓
     FuzzCampaignReport (verdicts + shrink reports + coverage)
```

## 3. Seed roster

The seed set is sourced from the **canonical battery's accept-path
certs** — the 15 certs that every registered kernel accepts.  This
shares the seed roster with `--differential-kernel`: a regression
in either gate exercises the same term surface.

Augmented with one extra hand-built seed — the **K combinator**
(`λA. λB. λa. λ_. a` at type `ΠA. ΠB. Πa. Π_. A`) — which has
4-binder nesting, deeper than anything in the canonical battery.
This gives mutation chains room to reach novel shapes that the
shallow canonical seeds couldn't produce alone.

Total: 16 seeds.  Adding a new accept-path cert to the canonical
battery automatically adds it to the fuzz seed roster.

## 4. Mutation grammar

11 mutations cover the load-bearing edges of the kernel:

| Mutation | What it does | Typical effect |
|----------|--------------|----------------|
| `LiftAllUniverses { delta }` | Add `delta` to every `Universe(n)` in BOTH term and type | Usually preserves typeability (cumulativity test) |
| `LiftTermUniversesOnly` | Lift only term-side universes | Usually breaks — both kernels MUST reject identically |
| `LiftClaimedTypeUniversesOnly` | Lift only type-side universes | Usually breaks — same |
| `ReplaceTermWithUniverseZero` | Replace term with `Universe(0)` | Usually breaks |
| `ReplaceClaimedTypeWithUniverseZero` | Replace type with `Universe(0)` | Usually breaks |
| `ReplaceTermWithFreeVariable { idx }` | Replace term with `Var(idx)` (free in empty ctx) | MUST reject as `UnboundVariable` |
| `AppToNonFunction` | Wrap term in `App(term, Universe(0))` | MUST reject (App on non-function) |
| `WrapTermInExtraLam { domain }` | Wrap term in extra lambda layer | Usually breaks (term type changes) |
| `SwapTermAndType` | Swap `term` and `claimed_type` fields | Usually breaks |
| `PiDomainToUniverseZero` | Replace top Pi-binder's domain with `Universe(0)` | Often breaks body compatibility |
| `LamDomainToUniverseZero` | Replace top Lam-binder's domain with `Universe(0)` | Often breaks |

A **mutation chain** is 1–3 mutations applied in sequence.
Chains > 3 saturate (mutations stop producing novel shapes) and
waste CI budget.  `MAX_MUTATION_CHAIN_LEN = 3` is the constant.

## 5. Determinism + reproducibility

The PRNG is xorshift64* seeded by the campaign's `base_seed`
constant (`0xA174_F022_5EE7_DEAD`).  No `rand` crate dependency —
the kernel keeps its dependency surface minimal.

**Same seed → same mutant sequence.**  A disagreement found in CI
is bisectable by re-running locally with the recorded seed; the
exact `(iteration, seed_index, chain_tags)` triple in the audit
report uniquely identifies the failing mutant.

## 6. Shrinking

When a disagreement is found, the harness **automatically shrinks**
the chain to a minimal failing case.

Algorithm: greedy 1-element-removal, repeated to fixpoint.  At
each step try removing one mutation from the chain (every
position) and re-run through the registry.  The first removal
that *preserves* the disagreement becomes the new chain;
iterate.  Terminates when no single-element removal preserves
disagreement.

For `MAX_MUTATION_CHAIN_LEN = 3` this takes at most 6 registry
calls per shrink — negligible cost vs CI runtime budget.

A shrunk-to-empty chain is the highest-priority bug class: the
seed alone disagrees, meaning the kernel-implementation drift
exists on the *unmutated* curated surface.  This is reported
distinctly in the audit output.

## 7. Coverage instrumentation

Three coverage axes are recorded for every campaign:

* **`per_mutation_hits`** — count per mutation tag.  A
  mutation with zero hits across 500 iters is suspicious (likely
  a `sample_mutation` bug or tag rename).
* **`per_seed_hits`** — count per seed index.  In a
  500-iter campaign over 16 seeds, every seed should have ≈ 31
  hits (round-robin scheduling).
* **`chain_length_distribution`** — histogram of chain lengths
  observed.  Index `i` holds the count of iterations whose chain
  had length `i+1`.  Distribution should be roughly uniform over
  1..=`MAX_MUTATION_CHAIN_LEN`.

Surfaced in the plain-format output when the gate **passes** —
catches sampling bias before it hides a kernel bug.

## 8. Defects this gate is designed to catch

The classes of bugs this gate catches that
`--differential-kernel` (curated battery) cannot:

* **Wrong de Bruijn shift in one kernel** — a shift that
  agrees with itself but disagrees with a closure-based
  kernel.  Mutation chains that lift universes deeply
  exercise the shift cascade.
* **Off-by-one in universe arithmetic** — every
  `LiftAllUniverses`-led chain probes the universe ladder.
* **η-equivalence drift** — `WrapTermInExtraLam` produces η-
  redex shapes; a kernel missing η-equivalence diverges.
* **Substitution-capture on shadowed binders** — chained
  domain rewrites (`PiDomainToUniverseZero` then
  `WrapTermInExtraLam`) build the shadowing pattern.

## 9. Running locally

```bash
verum audit --differential-kernel-fuzz

# JSON output (full disagreement details + coverage matrix).
verum audit --differential-kernel-fuzz --format json
```

Output (excerpt — passing gate):

```
Differential-kernel fuzz — mutation-based property testing
──────────────────────────────────────────────────────────
Iterations:            500
Base seed:             0xa174f0225ee7dead
Registered kernels:    proof_checker, proof_checker_nbe, kernel_v0
Unanimous accept:      X
Unanimous reject:      Y
✓ Disagreements:       0

Mutation coverage:
  app_to_non_function                       ~45
  lam_domain_to_universe_zero               ~45
  lift_all_universes                        ~45
  lift_claimed_type_universes_only          ~45
  ... (11 mutations, all > 0)

Chain-length distribution: len=1 → 167  len=2 → 167  len=3 → 166
```

## 10. Wiring in CI

Part of `verum audit --bundle`.  No external dependencies — fully
in-process Rust.

```yaml
- name: Property fuzz over kernel registry
  run: verum audit --differential-kernel-fuzz
```

## 11. Maintenance

**Adding a seed**: append an accept-path cert to the canonical
battery.  The fuzz seed roster picks it up automatically.

**Adding a mutation**:

1. Add a variant to the `Mutation` enum in the differential-
   fuzz module.
2. Implement its `apply_mutation` arm.
3. Extend the variant's stable diagnostic tag.
4. Extend `sample_mutation` to draw it.
5. Run `verum audit --differential-kernel-fuzz`; the new tag
   should appear in the coverage matrix with non-zero hits.

**Triaging a disagreement**:

1. Read the disagreement details + shrunk minimal chain from
   the audit report.
2. Reconstruct the mutant by applying the minimal chain to
   `seed_certificates()[seed_index]`.
3. Step the disagreeing kernels independently — the kernel
   producing the wrong verdict per the typing rules
   (`docs/research/proof-tree-formalization.md`) is the bug.
4. Add a regression cert mirroring the minimal mutant to the
   canonical battery so the bug never resurfaces silently.

## 12. Cross-references

- [Trusted Kernel](./trusted-kernel.md) — Slot A.
- [Three-Kernel Differential](./three-kernel-differential.md) —
  the curated-battery sister gate (same registry, different
  input distribution).
- [Differential Lean Checker](./differential-lean-checker.md) —
  cross-language complement.
- [`verum audit` CLI surface](../tooling/cli.md#kernel-soundness-band-12-gates)
  — full audit-flag table.
