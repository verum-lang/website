---
sidebar_position: 8
title: UHM — Verum's Flagship Proof Corpus
description: The Unitary Holonomic Monism (UHM) formal-verification project — the first large-scale proof corpus built with Verum's dependent / refinement / cubical / framework-axiom infrastructure.
---

# UHM — Verum's flagship proof corpus

> UHM (Unitary Holonomic Monism) is the formal-verification project
> Verum's architecture was **designed to support**. Every feature
> documented elsewhere in this section — the 9-strategy
> `@verify(...)` dispatch, `@framework(name, "citation")` axiom
> attribution, the LCF-style `verum_kernel`, `verum audit
> --framework-axioms`, `verum export --to {dedukti, coq, lean}` —
> is exercised against the UHM corpus end-to-end.

This page describes the corpus layout, the six-layer stratification
of UHM theorems, and the mechanisation-status tracking that the CI
gate enforces. It is the "so what did you build it for?" page for
every feature in the rest of the verification section.

:::note Repository location
The UHM corpus lives at `internal/verum-proofs-uhm/` in the Verum
monorepo. The directory is outside the main Verum tracking
(gitignored at the repository root — `internal/` is the symlink
farm for sibling projects like `internal/website`, `internal/holon`,
`internal/synarc-omega`). It is its own publishable artefact.
:::

## What UHM is

UHM is a physico-mathematical theory with **223 theorems** spanning
quantum-dynamical foundations (density matrices on ℂ⁷, CPTP
channels, Lindbladian evolution), combinatorial structure (Fano
plane PG(2, 2), octonions, G₂ = Aut(𝕆)), analytical predictions
(critical exponents, purity threshold P_crit = 2/7 via five
independent derivations, φ-tower convergence), statistical physics
(Jaynes MaxEnt, Petz monotone metrics, quantum Chernoff bound),
categorical / ∞-topos foundations (Grothendieck sites, cohesive
modalities, tricategory coherence), and self-reference / HoTT
(Lawvere fixed point T-96, hard-problem meta T-214, Putnam
foreclosure 7-lemma cascade T-223).

After the 2026-04 proof-audit the 223 theorems stratify as:

| Stratum                     | Count | Description |
|-----------------------------|-------|-------------|
| **Rigorous core**           | ~50   | Provable from first principles inside Verum's dependent / refinement / cubical type theory. The Phase-1 target is 80% of these. |
| **Framework-conditional**   | ~80   | Rely on postulated results from Lurie HTT, Schreiber DCCT, Connes reconstruction, Petz classification, Arnold–Mather catastrophe, or Baez–Dolan coherence. Every such dependency is declared via `@framework(name, "citation")`. |
| **Stratified / interpretive** | ~50 | Mixed [T] + [O] + [И] + [С] content; deferred to future work. |
| **Miscellaneous**           | ~43   | Historical notes, corollaries, definitional unpackings. |

## Corpus layout

```
internal/verum-proofs-uhm/
├── verum.toml              # research-profile manifest
├── README.md               # project intro + navigation
├── src/
│   ├── foundations/        Layer 1 — Γ ∈ 𝒟(ℂ⁷), CPTP, Lindbladians,
│   │                       balance formulas, Evans–Spohn primitivity
│   ├── combinatorial/      Layer 2 — Fano PG(2,2), BIBD(7,3,1),
│   │                       octonions, G₂, 14 + 7 = 21 decomposition
│   ├── analytical/         Layer 3 — critical exponents,
│   │                       P_crit = 2/7, φ-tower convergence (Banach)
│   ├── statistical/        Layer 4 — MaxEnt, Petz, Bures, QCB
│   ├── categorical/        Layer 5 — Grothendieck site, cohesive,
│   │                       ∞-topos closure (framework-conditional)
│   ├── hott/               Layer 6 — Lawvere fixed point (T-96),
│   │                       φ-tower HoTT (T-191), hard-problem meta
│   │                       (T-214), Putnam foreclosure (T-223)
│   ├── core_theorems/      Top-level: T-38a, T-96, T-98, T-142,
│   │                       T-148, T-149, T-153, T-161, T-187
│   └── fundamental_closures/ T-210..T-223 — positivity, foreclosure,
│                              7-lemma cascade
├── tests/                  Regression + cross-check against numerical reference
├── certificates/           Exported `.v` / `.lean` / `.dk` via
│   ├── coq/                `verum export --to {coq, lean, dedukti}`
│   ├── lean/
│   └── dedukti/
└── docs/
    └── theorem_index.md    Auto-regenerated status map — every theorem,
                             its rigour tag, its framework-axiom deps
```

## Why every Verum feature matters for UHM

| Verum feature | UHM use-site |
|---|---|
| **Refinement types** | `type FanoDim is Dimension { self == 7 };` pins the dimension constraint at the type level — SMT discharges compatibility with ℂ⁷ at every call site without run-time checks. |
| **Dependent Σ / Π** | Length-indexed arrays of Kraus operators; Π-types for the φ-tower; Σ-types for spectral-triple data. |
| **Cubical HoTT** | T-96 Lawvere fixed point is a `Path<A>(ρ*, φ(ρ*))` — computational, not axiomatic. T-214 hard-problem meta is a Gödel-Lawvere positivity argument that requires path types. |
| **`@framework(...)`** | Every citation from Lurie / Schreiber / Connes / Petz / Arnold–Mather / Baez–Dolan is a typed attribute. `verum audit --framework-axioms` enumerates the exact set. |
| **`verum verify`** | Discharges refinement + `ensures` obligations via Z3/CVC5 capability router. Counterexamples surface automatically in the diagnostic when a step fails. |
| **`verum export`** | Emits Coq / Lean / Dedukti certificates with every framework-axiom marker carried inline as a comment — external reviewers can replay the proof under their own axiomatization. |
| **`verum_kernel`** | The LCF-style trusted checker — every UHM proof term reaches it; every SMT discharge re-derives a CoreTerm witness via `replay_smt_cert`. The only trust the external reviewer must extend is to the kernel loop + the explicitly-registered framework axioms. |

## Status and Phase-1 target

**Phase 1** (6 months from spec date 2026-04-21):

- **Layer 1 core** (20 theorems): T-15, T-38a, T-39a, T-62, T-82,
  T-41d–T-41m, T-42d.
- **Layer 2 combinatorial** (10): T-41g/h, T-43c, T-82, T-42a statement.
- **Layer 3 analytical** (6): P_crit = 2/7 five-path, T-110 α = 2/3.
- **Layer 6 HoTT** (2): T-96 Lawvere, T-214 hard-problem.

**Total**: 40 theorems mechanised, ~20K LOC — 80% of the rigorous
core.

**Phase 2** (6–18 months) adds Layer 4 statistical (Petz-conditional
Bures / Uhlmann) and Layer 5 categorical (Lurie / Schreiber-
conditional ∞-topos). **Phase 3** (research frontier) tackles
T-217 tricategorical coherence and T-222 MRQT 25-monotone Pareto —
both blocked on infrastructure Verum doesn't yet ship.

## Current snapshot (bring-up)

Today the corpus carries:

| File | Theorems | Status |
|---|---|---|
| `src/foundations/bridge.vr` | T-15 Bridge to N = 7 | 🟡 partial — steps 3, 5 mechanised; steps 4, 6 postulated via `baez_dolan` + `petz_classification` framework axioms. 4 lemmas + 1 headline theorem + 1 corollary across 1 file. |
| `src/hott/lawvere_fixed_point.vr` | T-96 Lawvere, T-96-corollary | ⏳ pending — statement + proof scaffold landed; `by cubical` discharge depends on the full cubical NbE in `verum_smt::cubical_tactic`. 1 theorem + 1 corollary. |

Audit output on the current state:

```
$ verum audit --framework-axioms

Framework-axiom trusted boundary
────────────────────────────────────────
  Parsed 2 .vr file(s), skipped 0 unparseable file(s).
  Found 3 marker(s) across 2 framework(s):

  ▸ baez_dolan (2 markers)
    · axiom g2_has_dimension_fourteen    — dim(𝔤₂) = 14 — Lie-algebra root-system classification (src/foundations/bridge.vr)
    · axiom aut_octonions_is_g_two       — Aut(𝕆) = G₂ — Cartan 1914 / Freudenthal 1951            (src/foundations/bridge.vr)

  ▸ petz_classification (1 marker)
    · axiom bures_canonical_on_c7        — Petz 1996 classification — specialisation to ℂ⁷         (src/foundations/bridge.vr)
```

Export on the current state: 9 declarations → 3 certificate files
(`certificates/{coq,lean,dedukti}/export.{v,lean,dk}`), each
carrying the three framework-axiom citations as inline comments.

## See also

- **[Gradual verification](/docs/verification/gradual-verification)**
  — the 9-strategy / 2-layer model the UHM corpus uses.
- **[Framework axioms](/docs/verification/framework-axioms)** — the
  `@framework(...)` attribute; the six framework packages the UHM
  corpus consumes.
- **[Architecture → trusted kernel](/docs/architecture/trusted-kernel)**
  — the LCF loop that admits every UHM proof term.
- **[Proofs DSL](/docs/verification/proofs)** — `theorem` / `lemma`
  / `axiom` / `corollary` / tactics / structured proofs — the
  surface the UHM corpus writes in.
- **[Cubical & HoTT](/docs/verification/cubical-hott)** — the
  feature Layer 6 theorems rely on.
