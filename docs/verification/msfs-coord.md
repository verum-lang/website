---
sidebar_position: 20
title: MSFS Coordinate (Framework, ν, τ)
---

# MSFS Coordinate — `(Framework, ν, τ)` Lattice for Theorems

> Every theorem in Verum has a canonical MSFS coordinate
> `(Framework, ν, τ)`: which Rich foundations it depends on, at
> what Diakrisis ν-stratum it lives, and whether its proof is
> intensional (τ=1) or extensional (τ=0). The coordinate is
> computed at audit time and projects the theorem into the
> classifying 2-stack `𝔐` of MSFS.


---

## 1. The MSFS classifier

The Modular Sequent-Foundation Stack `𝔐` is a 2-stack over the
category of Rich-Sequent foundations
([Sereda 2026](../architecture/verification-pipeline.md)) whose
points are *foundations* — pairs `(F, S)` with F a deductive
formalism and S a sequent calculus internalising it.

A theorem T has a *coordinate* `(Fw, ν, τ)` in `𝔐`:

- **Fw** — the framework footprint: the set of `@framework(name,
  citation)` axioms T depends on. Computed by walking T's CoreTerm
  and extracting every `FrameworkAxiom` node.
- **ν** — the Diakrisis depth-stratification ordinal: how
  M-iterated T's reasoning is. Finite for ordinary inductive
  proofs; ω for proofs invoking ∞-categorical infrastructure;
  ω·n+k for proofs that compose multiple ω-stratum dependencies.
- **τ** — the intensional flag: `true` (intensional, MLTT-slice)
  for proofs that respect intensional equality; `false`
  (extensional, ETT-slice) for proofs that depend on operator-
  algebraic or definitional collapse (e.g. Connes
  reconstruction, Petz classification).

The coordinate is computed and surfaced through:

```bash
verum audit --coord src/   # plain output
verum audit --coord --format json src/   # CI-friendly
```

---

## 2. The Ordinal type

ν is a *countable ordinal*; `core.theory_interop.coord` ships an
encoding that covers everything below ε₀ — far more than the
standard six-pack needs. The encoding is the canonical Cantor-
normal-form prefix below ε₀:

```verum
@derive(Clone)
public type Ordinal is {
    omega_coefficient: Int,   // 0 ⇒ finite; 1 ⇒ ω; 2 ⇒ ω·2; …
    finite_offset:     Int,   // additive remainder
};
```

The pair `(omega_coefficient, finite_offset)` encodes the ordinal
`ω·omega_coefficient + finite_offset`, so:

| Ordinal | `omega_coefficient` | `finite_offset` |
|---|---|---|
| 0 | 0 | 0 |
| 1, 2, 3, … | 0 | 1, 2, 3, … |
| ω | 1 | 0 |
| ω + 1, ω + 2 | 1 | 1, 2 |
| ω·2 | 2 | 0 |
| ω·2 + 1 | 2 | 1 |
| ω·n + k | n | k |

Constructors:

```verum
ord_zero()                   // 0
ord_finite(n)                // n
ord_omega()                  // ω
ord_omega_plus(k)            // ω + k
ord_omega_times(n)           // ω · n
ord_omega_times_plus(n, k)   // ω·n + k
```

Comparison `ord_lt(a, b)` is lexicographic on the pair —
strictly faithful to the ordinal `<` relation up to ε₀:
`ω·a₁ + b₁ < ω·a₂ + b₂  ⇔  a₁ < a₂ ∨ (a₁ = a₂ ∧ b₁ < b₂)`.
`ord_max` returns the lex-max; `ord_eq` is structural equality.

The same encoding lives in `<implementation>
commands/audit.rs::CliOrdinal` so the `.vr` stdlib and the CLI
agree byte-for-byte on the ν-rendering. The shared encoding is
the single source of truth.

---

## 3. The standard six-pack ν-table

`core.theory_interop.coord::known_ordinal` ships the curated
`(framework, ν)` lookup for the VVA standard six-pack
([the verification surface](framework-axioms.md)) plus the neutral Actic
articulation:

| Framework | ν | Justification |
|---|---|---|
| `actic.raw` | 0 | No foundation; neutral element of the lattice. |
| `lurie_htt` | ω | ∞-cat completions, ω-stratum infrastructure. |
| `schreiber_dcct` | ω + 2 | Cohesive ∞-topos extends `lurie_htt` with `∫ ⊣ ♭ ⊣ ♯` (two extra modalities). |
| `connes_reconstruction` | ω | Operator-algebraic ∞-presentation; same depth as Lurie HTT. |
| `petz_classification` | 2 | Finite-dim matrix metrics; bounded analysis. |
| `arnold_catastrophe` | 2 | Codim ≤ 4 normal-form classifier; bounded codim. |
| `baez_dolan` | ω + 1 | n-categories with stabilisation hypothesis. |
| `owl2_fs` | 1 | SROIQ DL-decidable fragment; first-order with bounded modal depth. |

User-defined frameworks fall through to `(0, intensional)`. The
table is *curated* — community frameworks request entries via
the standard `@framework` registration pipeline.

---

## 4. The τ-flag

τ separates *intensional* foundations (Per Martin-Löf — types
are propositions, equality is path) from *extensional* foundations
(Bishop — types are sets, equality is decidable). Verum's kernel
is τ=1 (intensional, CCHM cubical baseline); a framework axiom
package is τ=1 if its body talks about intensional structure
(equivalence, paths, homotopy) and τ=0 if it talks about
extensional structure (operator algebras, Hilbert-space
projections, bounded matrix metrics).

| Framework | τ | Notes |
|---|---|---|
| `actic.raw` | extensional | Trivially extensional — no foundation. |
| `lurie_htt` | intensional | Quasi-categories, ∞-categorical equivalence. |
| `schreiber_dcct` | intensional | Cohesive ∞-topos primitives are paths. |
| `connes_reconstruction` | extensional | Spectral-triple definitional collapse. |
| `petz_classification` | extensional | Operator-monotone functions decided up to definitional equality. |
| `arnold_catastrophe` | intensional | Topological catastrophe normal forms. |
| `baez_dolan` | intensional | n-categorical infrastructure is intensional. |
| `owl2_fs` | intensional | DL syntax tree carries intensional path information. |

The `coord_of(α)` function returns `(α.framework, ν, τ)` —
straight from the lookup table.

---

## 5. The `theorem_coord` projection

A theorem typically depends on **multiple** framework axioms.
`theorem_coord` projects a list of MSFS coordinates to the
upper bound in the `(Set<Framework>, Ordinal, TauFlag)`
lattice:

```verum
public type MsfsTheoremCoord is {
    frameworks: List<Text>,    // sorted, deduplicated
    ordinal:    Ordinal,       // sup of dependencies
    tau:        Bool,          // ∧ (intensional iff all dependencies intensional)
};

public fn theorem_coord(coords: List<MsfsCoord>) -> MsfsTheoremCoord;
```

Lattice-theoretic semantics:

- **`frameworks`** — set union of the per-axiom framework names.
  The list is the *footprint*: which Rich foundations the proof
  inhabits.
- **`ordinal`** — supremum (lex max) of the per-axiom ordinals.
  A theorem invoking `lurie_htt` (ω) and `petz_classification` (2)
  has ν = ω; one invoking `schreiber_dcct` (ω+2) and `lurie_htt`
  (ω) has ν = ω+2.
- **`tau`** — *conjunctive*: a theorem is intensional only if
  every dependency is intensional. A single extensional dependency
  flips the whole theorem to extensional — extensionality is the
  *absorbing* element of the τ-conjunction, mirroring the
  metatheoretic fact that an extensional axiom in any context
  forces its consumer into the extensional slice.

Empty-dependency theorems land at `(∅, 0, intensional)` — the
lattice's bottom element, matching the kernel-only baseline.

### 5.1 Worked example

```verum
mount core.action.articulation;
mount core.theory_interop.coord;

let mut deps: List<MsfsCoord> = List.new();
deps.push(coord_of(articulation_new("lurie_htt", "Lurie 2009", "yoneda")));
deps.push(coord_of(articulation_new("schreiber_dcct", "Schreiber 2013", "shape")));
deps.push(coord_of(articulation_new("petz_classification", "Petz 1996", "monotone")));

let agg: MsfsTheoremCoord = theorem_coord(deps);

// sup over { ω, ω+2, 2 } = ω+2
assert(ord_eq(agg.ordinal.clone(), ord_omega_plus(2)));

// petz_classification is extensional ⇒ whole theorem is extensional
assert(!agg.tau);

// Three frameworks recorded.
assert(agg.frameworks.len() == 3);
```

---

## 6. The `verum audit --coord` CLI

`verum audit --coord` walks every `@framework(name, "citation")`
marker in the project (theorems, lemmas, corollaries, axioms) and
projects each unique framework to its `(Framework, ν, τ)`
coordinate. Plain output groups by framework with ν / τ banner;
JSON output emits the structured `(omega_coefficient,
finite_offset)` pair so consumers can sort lex without re-parsing
the Unicode rendering.

```bash
$ verum audit --coord
         --> Computing MSFS coordinate (Framework, ν, τ) per theorem

MSFS coordinate (Framework, ν, τ) per theorem
──────────────────────────────────────────────────
  Parsed 1 .vr file(s), skipped 0 unparseable file(s).

  Found 4 theorem-level marker(s) across 4 framework(s):

  ▸ connes_reconstruction  ν=ω  τ=extensional  (1 marker)
    · axiom spectral_reconstruction  —  Connes-Chamseddine 2008  (src/lib.vr)

  ▸ lurie_htt  ν=ω  τ=intensional  (1 marker)
    · axiom yoneda_full  —  Lurie 2009 — HTT 6.2.2.7  (src/lib.vr)

  ▸ petz_classification  ν=2  τ=extensional  (1 marker)
    · axiom monotone_metrics  —  Petz 1996  (src/lib.vr)

  ▸ schreiber_dcct  ν=ω+2  τ=intensional  (1 marker)
    · axiom cohesive_modalities  —  Schreiber arXiv:1310.7930  (src/lib.vr)
```

JSON output (truncated):

```json
{
  "schema_version": 1,
  "frameworks": [
    {
      "framework": "lurie_htt",
      "ordinal": "ω",
      "ordinal_omega_coefficient": 1,
      "ordinal_finite_offset": 0,
      "tau": true,
      "usages": [
        {
          "item_kind": "axiom",
          "item_name": "yoneda_full",
          "citation": "Lurie 2009 — HTT 6.2.2.7",
          "file": "src/lib.vr"
        }
      ]
    }
  ]
}
```

The structured pair `(ordinal_omega_coefficient,
ordinal_finite_offset)` lets dashboards sort
`{ω, ω+2, 2, 0}` correctly without parsing Unicode glyphs.

---

## 7. The three theory-interop operations

`core.theory_interop.core` ships three operations from the verification surface:

```verum
public fn load_theory(T: TheoryDescriptor) -> Articulation;        // §10.1
public fn translate(source, target, partial)                       // §10.2
    -> Result<ArticulationFunctor, ObstructionReport>;
public fn check_coherence(translations: List<ArticulationFunctor>) // §10.3
    -> Result<DescentWitness, CoherenceFailure>;
```

### 7.1 `load_theory` — Yoneda embedding

Loads an external theory `T` (axioms + signature + optional model
category) and registers it as an Articulation via the Yoneda
embedding `y: T → PSh(T)`. The embedding is fully faithful, so
the registered Articulation is categorically equivalent to the
input theory.

### 7.2 `translate` — Kan extension

Computes a partial functor `F₀: source.generators → target` then
the pointwise left Kan extension `Lan F₀`. Returns either an
`ArticulationFunctor` (the witness) or an `ObstructionReport`
with metric `Obs(F) ∈ [0, 1]`.

The §10.2 verdict thresholding (shipped in
`core.theory_interop.coord::TranslationVerdict`):

| Range | Verdict | Admits? |
|---|---|---|
| `Obs(F) == 0` | Morita-equivalence witness | yes |
| `(0, 0.05]` | Strong translation | yes |
| `(0.05, 0.20]` | Moderate translation | yes |
| `(0.20, 0.50]` | Weak translation | yes |
| `(0.50, 1]` | Untranslatable (reject) | no |

```verum
let verdict: TranslationVerdict = verdict_of(0.10);
match verdict {
    Moderate => print("translation admitted with caveats"),
    _        => panic("expected Moderate"),
}
assert(verdict_admits(Moderate));
assert(!verdict_admits(Untranslatable));
```

### 7.3 `check_coherence` — Čech descent

Builds the cosimplicial diagram of pairwise intersections from a
list of translations and verifies the cocycle condition on triple
overlaps. Returns either a `DescentWitness` (success) or a
`CoherenceFailure` (with the specific cocycle that failed).

This is the **descent operation** that lets a *web* of theory
translations form a globally consistent picture: the translations
agree on triple overlaps, hence they glue to a single global
section.

---

## 8. Where to look in the codebase

| Surface | Source |
|---------|--------|
| §10.1 `load_theory` (Yoneda) | `core/theory_interop/core.vr` |
| §10.2 `translate` (Kan extension) and `TranslationVerdict` | `core/theory_interop/core.vr`, `core/theory_interop/coord.vr` |
| §10.3 `check_coherence` (Čech descent) | `core/theory_interop/core.vr` |
| §10.4 `coord_of(α)` per-articulation projection | `core/theory_interop/coord.vr` |
| §10.4 `theorem_coord` multi-framework upper bound | `core/theory_interop/coord.vr` |
| `verum audit --coord` plain + JSON output | `audit` module |
| Structured `Ordinal` type (Cantor normal form) | `core/theory_interop/coord.vr` |
| `register_framework_coord` API for user-defined frameworks | `core/theory_interop/coord.vr` |

`verum self-verify --corpus-coord` is functionally covered by
`verum audit --coord`; both names emit the same artefact.

---

## 9. Further reading

- [Framework axioms](framework-axioms.md) — the `@framework(name,
  citation)` system that produces the Articulations consumed here.
- [OC / DC dual stdlib](actic-dual.md) — the dependency-centric side
  of the duality; the source of `Articulation` and `Enactment`.
- [Articulation Hygiene](articulation-hygiene.md) — surface hygiene
  for self-referential constructs that interact with the
  framework-axiom layer.
- [Trusted kernel](trusted-kernel.md) — the kernel rules
  (`K-FwAx`, `K-Refine`) that consume framework axioms.
- 
- The MSFS specification — defines the moduli 2-stack `𝔐` and the
  `(Fw, ν, τ)` projection that this module's API follows. The
  upstream document (Sereda preprint, MSFS) is the normative
  reference for the four strata `L_Fnd ⊋ L_Cls ⊋ L_Cls_top ⊋ L_Abs`
  and the AFN-T proof that `L_Abs == ∅`.
