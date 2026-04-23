---
sidebar_position: 3
title: mathesis
description: ∞-Topos of formal theories — Yoneda loading, Kan translation, descent coherence.
---

# `core.mathesis` — ∞-Topos of formal theories

A research-facing module: organise, translate, and audit formal
theories as objects in an ∞-topos. Used by proof infrastructure and
by external tooling (e.g. LLM-driven theorem translation) via the
JSON-RPC protocol.

:::caution Audience
If you are writing application code you do not need this module. If
you are building a theorem-prover on top of Verum or integrating
external automated reasoners, read on.
:::

| File | What's in it |
|---|---|
| `core.vr` | `MathesisRegistry`, `LoadedTheory`, `TranslationResult`, `CoherenceResult`, `AuditResult`, core operations |
| `protocol.vr` | JSON-RPC 2.0 wire protocol (`JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcError`, `MathesisServer`, `serve_request`) |
| `mod.vr` | re-exports |

Foundations come from the [`math`](/docs/stdlib/math) sub-modules
`epistemic`, `infinity_topos`, `kan_extension`, `quantum_logic`,
`giry`, `cohesive`, `day_convolution`.

---

## Core types

### Registry

```verum
public type MathesisRegistry is {
    theories: List<LoadedTheory>,
    translations: List<TranslationRecord>,
    next_handle: Int,
};

public fn new_registry() -> MathesisRegistry;
```

### `LoadedTheory`

```verum
public type LoadedTheory is {
    /// The underlying theory data (statements + dependencies).
    theory: Theory,
    /// Sheaf handle: the Yoneda image y(T) in the sheaf category.
    sheaf_handle: Int,
    /// Number of claims in the theory.
    claim_count: Int,
    /// Number of dependency edges.
    dependency_count: Int,
};
```

Theories are keyed **by name** (Text) rather than by a separate id
type — the sheaf handle exists for internal bookkeeping and is not
part of the query surface.

### Loading

```verum
public fn load_theory(registry: &mut MathesisRegistry, theory: Theory) -> LoadedTheory;
public fn find_theory(registry: &MathesisRegistry, name: &Text) -> Maybe<&LoadedTheory>;
public fn list_theories(registry: &MathesisRegistry) -> List<Text>;
```

Conceptually, `load_theory` is the **Yoneda embedding**: the theory
becomes a representable sheaf y(T)(S) = Hom(S, T) over its own
syntactic category. The registry is the collection of loaded
representables; `next_handle` monotonically assigns fresh sheaf
handles.

Properties (SMT-discharged on registration):

- *y is fully faithful*: `Hom(T₁, T₂) ≃ Hom(y(T₁), y(T₂))`
- *y preserves limits*: `y(lim Tᵢ) = lim y(Tᵢ)`
- *y(T) is always a sheaf*: representables are sheaves

---

## Translation

### `TranslationResult`

```verum
public type TranslationResult is {
    /// Left Kan extension Lan_F: optimistic translation.
    /// Each target claim mapped to the colimit of matching source claims.
    optimistic: List<KanExtensionResult>,
    /// Right Kan extension Ran_F: conservative translation.
    /// Each target claim mapped to the limit of matching source claims.
    conservative: List<KanExtensionResult>,
    /// Obstruction data: measures information loss per claim.
    obstruction: ObstructionData,
    /// Overall translation quality (0 = perfect, 1 = total loss).
    quality: Float,
};

public type TranslationRecord is {
    source_name: Text,
    target_name: Text,
    result: TranslationResult,
};
```

Every translation surfaces **both** the optimistic (`Lan_F`) and the
conservative (`Ran_F`) readings — downstream callers pick based on
risk tolerance. The `obstruction` measures the deviation
`Ran_F ∘ F* - Id`, the categorical witness for information loss.

### Operations

```verum
public fn translate(
    source: &LoadedTheory,
    target: &LoadedTheory,
    partial_map: &List<(Int, Int)>,   // (source_claim_idx, target_claim_idx)
) -> TranslationResult;

public fn translate_with_oracle<C, D: InfinityCategory>(
    source: &LoadedTheory,
    target: &LoadedTheory,
    oracle: &InfinityFunctor<C, D>,
) -> TranslationResult;
```

Translation is implemented as a **Kan extension** along the partial
functor `F: C_S → C_T` specified by `partial_map`. The oracle variant
consumes a suggested ∞-functor (typically from an LLM or another
solver); the compiler re-verifies every suggestion against descent
coherence before accepting it.

---

## Coherence

A translation is **coherent** iff it respects the descent conditions
of the ∞-topos: the translated image of every gluing condition in
the source remains gluing in the target.

### `CoherenceResult`

```verum
public type CoherenceResult is
    /// All translations coherent: a global section exists.
    | Coherent { global_quality: Float }
    /// Translations incoherent: descent fails.
    | Obstruction { violations: List<CoherenceViolation>, severity: Float };
```

The result is a **sum type**, not a record — callers pattern-match
and extract either the global quality score or the list of descent
violations.

### Operations

```verum
public fn check_coherence(
    registry: &MathesisRegistry,
    translation_pairs: &List<(Text, Text)>,
) -> CoherenceResult;
```

`check_coherence` consumes a web of `(source_name, target_name)`
pairs and verifies three properties:

1. **Functorial composition**: `F_jk ∘ F_ij ≈ F_ik`
2. **Descent condition**: the Čech nerve of the covering resolves
3. **No circular contradictions** in epistemic status

An incoherent result is still informative — callers can reduce the
target theory (drop gluing conditions), enrich the translation
(supply more witnesses), or accept the obstruction and operate
piecewise.

---

## Auditing

```verum
public type AuditResult is {
    theory_name: Text,
    claim_count: Int,
    dependency_count: Int,
    /// Claims with status downgrades after propagation.
    status_changes: List<StatusChange>,
    /// Detected circular dependencies (each path listed by claim id).
    circular_dependencies: List<List<Text>>,
    /// Dependency targets that reference non-existent claims.
    dangling_references: List<(Text, Text)>,
    /// Overall health score (0 = broken, 1 = perfect).
    health: Float,
};

public fn audit_theory(theory: &mut Theory) -> AuditResult;
public fn audit_meta() -> AuditResult;
```

`audit_theory` checks four invariants:

1. **Status propagation** — no claim has a stronger status (e.g.
   `Proven`) than its weakest dependency.
2. **Circular dependencies** — no claim transitively depends on
   itself.
3. **Dangling references** — every dependency target exists.
4. **Epistemic coherence** — theorem claims have valid proof chains.

`audit_meta` runs Mathesis's self-audit — the mathesis module's
own internal consistency check, independent of any loaded theory.

The audit checks: unbound names, type mismatches, circular definitions,
missing proofs for theorems, statements whose justifications the
coherence check cannot replay.

---

## JSON-RPC protocol (`protocol.vr`)

Mathesis can run as a service — handy for integrations with external
tools (notebooks, LLM harnesses, proof-browsers).

### Envelope types

```verum
type JsonRpcRequest is {
    jsonrpc: Text,                    // "2.0"
    method: Text,                     // "load_theory", "translate", "check_coherence", ...
    params: JsonValue,
    id: Maybe<JsonValue>,
};
type JsonRpcResponse is {
    jsonrpc: Text,
    result: Maybe<JsonValue>,
    error: Maybe<JsonRpcError>,
    id: Maybe<JsonValue>,
};
type JsonRpcError is { code: Int, message: Text, data: Maybe<JsonValue> };
```

### Server

```verum
type MathesisServer is { registry: MathesisRegistry, config: ServerConfig };

new_server(config: ServerConfig) -> MathesisServer
server.serve_request(&req: &JsonRpcRequest) -> JsonRpcResponse
server.serve(&"tcp://0.0.0.0:4711").await -> IoResult<()>   
```

### Method catalogue

| Method | Purpose |
|---|---|
| `load_theory` | load a theory from path |
| `list_theories` | enumerate loaded theories |
| `translate` | produce a translation record |
| `translate_with_oracle` | LLM-guided translation |
| `check_coherence` | descent check |
| `audit_theory` | one-theory audit |
| `audit_meta` | whole-registry audit |

---

## Example

```verum
fn main() {
    let mut reg = new_registry();
    let zfc = reg.load(&Path.from("theories/zfc.math"))?;
    let hott = reg.load(&Path.from("theories/hott.math"))?;

    let zfc_theory = reg.find(zfc).unwrap();
    let hott_theory = reg.find(hott).unwrap();

    let tr = translate(zfc_theory, hott_theory);
    for lost in &tr.lost {
        eprint(f"could not translate: {lost:?}");
    }

    match check_coherence(hott_theory) {
        CoherenceResult { ok: true, .. } => print("theory is coherent"),
        CoherenceResult { obstructions, .. } => {
            for o in &obstructions {
                eprint(f"obstruction: {o.reason}");
            }
        }
    }
}
```

---

## See also

- **[math → infinity_topos](/docs/stdlib/math)** — the underlying
  ∞-topos constructions.
- **[math → kan_extension](/docs/stdlib/math)** — theorem-preserving
  functorial translation.
- **[proof](/docs/stdlib/proof)** — proof certificates for translated
  theorems.
- **[Verification → proofs](/docs/verification/proofs)** — how
  Mathesis-translated theorems become Verum `theorem` declarations.
