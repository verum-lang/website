---
sidebar_position: 3
title: mathesis
---

# `core::mathesis` — ∞-Topos of formal theories

`mathesis` is a research-facing module for organising, translating,
and auditing formal theories as objects in an ∞-topos.

:::caution
`mathesis` is advanced. If you are writing application code, you do
not need this module. If you are writing a proof assistant on top of
Verum, you do.
:::

## Core concepts

A **theory** in Mathesis is a structured document: axioms, definitions,
theorems, tactics, and their proofs. Mathesis provides:

- **Registry**: load, find, list theories.
- **Translation**: apply a Kan extension to translate one theory into
  another (change of base).
- **Coherence**: descent-based checking that translated theorems still
  hold.
- **Auditing**: generate audit trails.

## Types

```verum
type MathesisRegistry;
type LoadedTheory is { id: TheoryId, statements: List<Statement>, ... };

fn load_theory(path: Path) -> Result<LoadedTheory, LoadError>;
fn find_theory(id: TheoryId) -> Maybe<LoadedTheory>;
fn list_theories() -> List<TheoryId>;
```

## Translation

```verum
type TranslationResult is {
    source:  TheoryId,
    target:  TheoryId,
    mapping: ExtensionMap,
    preserved: List<Statement>,
    lost:     List<Statement>,
};

fn translate(src: &LoadedTheory, tgt: &LoadedTheory) -> TranslationResult;
fn translate_with_oracle(src: &LoadedTheory, oracle: &LlmOracle) -> TranslationResult;
```

## Coherence

```verum
type CoherenceResult is {
    ok:        Bool,
    obstructions: List<DescentObstruction>,
};

fn check_coherence(t: &LoadedTheory) -> CoherenceResult;
```

## JSON-RPC server

Mathesis can run as a service, exposing its operations over JSON-RPC
2.0 — useful for integration with external tooling:

```verum
let server = MathesisServer::new(Config::default());
server.serve("tcp://0.0.0.0:4711").await?;
```

## Foundations

`mathesis` builds on `math` modules:

- `math.epistemic` — theories as sites.
- `math.infinity_topos` — the topos of theories.
- `math.kan_extension` — translation as Kan extension.
- `math.quantum_logic` — orthomodular lattices for epistemic contexts.
- `math.giry` — probabilistic semantics.
- `math.cohesive` — cohesive structure.
- `math.day_convolution` — cognitive extensions.

## See also

- **[math](/docs/stdlib/math)** — the mathematical foundation.
- **[Verification → proofs](/docs/verification/proofs)** — proof DSL
  that interacts with Mathesis theories.
