---
sidebar_position: 30
title: theory_interop
description: ∞-Topos of Formally Represented Theories — Yoneda loading, Kan-extension translation, descent coherence, JSON-RPC protocol for IDE/prover/LLM bridges.
---

# `core.theory_interop` — Theory interoperation layer

A computational **∞-topos of formally represented theories**: each
theory lives as a sheaf, translations between theories are Kan
extensions, coherence across translation chains is verified through
descent conditions. The module surfaces this category-theoretic
machinery as an ergonomic Verum API + a JSON-RPC wire protocol for
external tools (IDE plugins, theorem-prover bridges, LLM-driven
translators).

## Module layout

| File | Lines | What's in it |
|---|---:|---|
| `core.vr` | 704 | Theory loading (Yoneda), translation (Kan), coherence (descent), audit |
| `protocol.vr` | 614 | JSON-RPC server — theory/list, claim/translate, coherence/check, audit/run, … |
| `congruence_closure.vr` | 420 | Decision procedure for theory-internal congruence over function symbols |
| `coord.vr` | 467 | Theory-coordinate system + canonical identifier resolution across registries |
| `mod.vr` | 139 | Re-exports + crate header |
| `bridges/owl2_to_htt.vr` | 559 | OWL2 description-logic → HoTT translation |
| `bridges/htt_to_owl2.vr` | 245 | HoTT → OWL2 translation (partial — only ∞-groupoid-free fragment) |
| `bridges/oc_dc_bridge.vr` | 174 | Open-/closed-world ↔ description-logic bridge |
| `bridges/mod.vr` | 174 | Bridge registry + dispatch |

3 496 lines total.

## Architecture stack

```
Theory-interop application layer (this module)
 ├── core.vr — load_theory, translate, check_coherence, audit
 └── protocol.vr — JSON-RPC server (theory/list, claim/translate, …)
        │
        ▼
Mathematical foundation (core/math/)
 ├── epistemic.vr      — EpistemicStatus, Theory, EpistemicTopology
 ├── infinity_topos.vr — ∞-Topos, descent, coherence violations
 ├── kan_extension.vr  — Lan/Ran, comma categories, obstruction
 ├── quantum_logic.vr  — Quantum epistemic states, density matrices
 ├── giry.vr           — Giry monad, LLM oracle
 ├── cohesive.vr       — Cohesive modalities (Π ⊣ Disc ⊣ Γ ⊣ coDisc)
 ├── day_convolution.vr — Day ⊗, cognitive extension
 └── hott.vr           — Cubical HoTT, Path types, equivalences
```

`core.theory_interop` is the **application layer** of a much larger
mathematical stack at `core/math/`. Users get a one-liner API
(`load_theory` / `translate` / `check_coherence`); the heavy
category theory is invisible at the call site.

## Quick start

```verum
mount core.theory_interop.*;

let mut reg = new_registry();
let a = load_theory(&mut reg, first_theory);
let b = load_theory(&mut reg, second_theory);

// Translate with partial mapping
let result = translate(&a, &b, &partial_map);
print(f"Translation quality: {result.quality}");

// Check coherence across translations
let coherence = check_coherence(&reg, &pairs);
match coherence {
    CoherenceResult.Coherent { global_quality } =>
        print(f"Coherent! Quality: {global_quality}"),
    CoherenceResult.Obstruction { violations, severity } =>
        print(f"Incoherent: {violations.len()} violations, severity {severity}"),
}
```

## Core operations (`core.vr`)

### Yoneda-loading

```verum
public fn load_theory(reg: &mut Registry, t: Theory) -> TheoryHandle;
```

Loading a theory is **Yoneda-embedding** the theory `T` into the
presheaf category `Set^(T^op)`. The returned `TheoryHandle` is the
representable functor `y(T) = Hom(-, T)`; subsequent calls fetch
arrows / objects via the standard hom-set query interface.

### Kan-extension translation

```verum
public fn translate(
    source: &TheoryHandle,
    target: &TheoryHandle,
    partial_map: &PartialMap,
) -> TranslationResult;

public type TranslationResult is {
    morphism:    TheoryMorphism,    // resolved functor
    quality:     Float,              // 0.0 … 1.0 — proportion of source
                                     // arrows preserved; 1.0 = full faithful
    obstructions: List<Obstruction>, // arrows that could not be transported
};
```

The translation is computed as the **left Kan extension** `Lan_F G`
of the source presheaf along the partial map `F`. The
`obstructions` list surfaces every arrow that the Kan extension
could not transport coherently (cocone failure at the colimit
construction). Quality < 1.0 means the translation is partial; the
caller decides whether to accept (lossy translation acceptable for
the use case) or reject (require full-faithful translation).

### Descent-coherence

```verum
public fn check_coherence(
    reg: &Registry,
    pairs: &List<(TheoryHandle, TheoryHandle)>,
) -> CoherenceResult;

public type CoherenceResult is
      Coherent { global_quality: Float }
    | Obstruction { violations: List<CoherenceViolation>, severity: Severity };
```

Coherence checking is the **descent condition** in the ∞-topos:
given a cover `{U_i → X}` of pairwise translations, the result is
coherent iff the local data (per-pair morphisms) glues to a
global section. Violations surface the specific cocycle that
fails to descend.

### Audit

```verum
public fn audit(reg: &Registry) -> AuditReport;
```

A full descent + Kan-extension audit across the entire registry:
every pairwise translation re-derived, every coherence cocycle
re-verified, every quality score recomputed. The report carries
cog-level granular telemetry — useful for CI integration that
wants to fail-on-coherence-regression.

## JSON-RPC protocol (`protocol.vr`)

```
theory/list                — enumerate loaded theories
theory/load                — register a new theory
theory/forget              — remove a theory from the registry
claim/translate            — translate a claim from theory A → theory B
claim/explain              — explain a translation's obstructions
coherence/check            — descent check over a list of pairs
audit/run                  — full registry audit
registry/snapshot          — serialize the registry to disk
registry/restore           — load a registry snapshot
```

Wire-format is JSON-RPC 2.0 over stdio (default) or a Unix domain
socket. Used by:

* **IDE plugins** — hover-translate a claim from the active proof
  buffer into a target theory.
* **Theorem-prover bridges** — `verum ↔ Coq` / `verum ↔ Lean` /
  `verum ↔ Agda` translation pipelines invoke `claim/translate`.
* **LLM-driven translators** — LLM proposes a partial map; the
  Verum engine computes the Kan extension and surfaces obstructions
  for LLM refinement.

## Congruence-closure procedure (`congruence_closure.vr`)

A theory-internal decision procedure for the
**congruence closure** of a finite set of equations:
given `a = b`, `f(a) = c` derive `f(b) = c` and all transitively-
closed consequences. Used by the translation pipeline to factor
out provable-equal terms before Kan-extension.

## Theory coordinates (`coord.vr`)

```verum
public type TheoryCoord is {
    registry: Text,             // registry identifier (e.g. "mml", "afp", "isabelle.dist")
    library:  Text,             // library within registry (e.g. "Topology", "Algebra")
    module:   Text,             // module within library
    version:  Maybe<Text>,      // optional version pin
};
```

Theory coordinates are stable identifiers across registries.
Resolution is `(registry, library, module, version) →
TheoryHandle`. Coordinate-equal theories are guaranteed
interchangeable in `translate(...)` invocations.

## Bridges (`bridges/`)

| Bridge | Direction | Status | Notes |
|---|---|---|---|
| `owl2_to_htt.vr` | OWL2 DL → HoTT | **stable** | Surjective on description-logic fragment |
| `htt_to_owl2.vr` | HoTT → OWL2 | **partial** | Only ∞-groupoid-free fragment — ∞-groupoid translation requires extending OWL2 with type-theoretic primitives |
| `oc_dc_bridge.vr` | Open/Closed-world ↔ DL | **stable** | Closed-world DL semantics ↔ open-world HoTT semantics |

Each bridge is itself a registered `Bridge` value in the
`bridges/mod.vr` registry; the dispatch is data-driven, so new
bridges are purely additive — no compiler change.

## Status

| File | Status | Notes |
|---|---|---|
| `core.vr` | **stable** | full load / translate / check_coherence / audit |
| `protocol.vr` | **stable** | 9 JSON-RPC methods |
| `congruence_closure.vr` | **stable** | union-find + congruence rule + saturation |
| `coord.vr` | **stable** | full registry + resolver |
| `bridges/` | mixed | see per-bridge table above |

## Foundational alignment

This module is built on top of `core/math/`, which provides the
heavy lift (∞-topos, Kan extension, descent, cohesive modalities,
Cubical HoTT, Day convolution, Giry monad). The split is
intentional: the **library** at `core/math/` is the canonical
home of the mathematical primitives (reusable from any other
module); the **application** at `core/theory_interop/` is the
narrow user-facing surface for theory interoperation. Other
modules building on `core/math/` (verification, kernel-soundness
meta-theorems, separation logic) don't pay the import cost of
the JSON-RPC server or the bridge registry.
