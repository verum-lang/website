---
sidebar_position: 3
title: theory interop
description: Theory registry, translation, coherence audit, JSON-RPC interchange protocol.
---

# `core.theory_interop` — theory interchange primitives

A research-facing stdlib module that organises, translates, and
audits **formally represented theories** as objects in an
∞-topos. Intended for proof infrastructure and external tooling
that needs to exchange or compare theories across tools
(theorem-prover bridges, IDE plugins, LLM-driven translators).

:::note Name migration
The module's public re-exports are currently reachable under two
paths during a transition window: the neutral
`core.theory_interop.*` and the legacy `core.mathesis.*`. New
code should use the neutral path; the legacy path is retained
for source compatibility until downstream consumers migrate.
:::

:::caution Audience
If you are writing application code you do not need this module.
If you are building a theorem-prover on top of Verum or
integrating external automated reasoners, read on.
:::

| File | What's in it |
|---|---|
| `core.vr` | `TheoryRegistry`, `LoadedTheory`, `TranslationResult`, `CoherenceResult`, `AuditResult`, core operations |
| `protocol.vr` | JSON-RPC 2.0 wire protocol (`JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcError`, `TheoryInteropServer`, `serve_request`) |
| `mod.vr` | re-exports |

Foundations come from the [`math`](/docs/stdlib/math) sub-modules
`epistemic`, `infinity_topos`, `kan_extension`, `quantum_logic`,
`giry`, `cohesive`, `day_convolution`.

---

## Core types

### Registry

```verum
public type TheoryRegistry is {
    theories: List<LoadedTheory>,
    translations: List<TranslationRecord>,
    next_handle: Int,
};

public fn new_registry() -> TheoryRegistry;
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
public fn load_theory(registry: &mut TheoryRegistry, theory: Theory) -> LoadedTheory;
public fn find_theory(registry: &TheoryRegistry, name: &Text) -> Maybe<&LoadedTheory>;
public fn list_theories(registry: &TheoryRegistry) -> List<Text>;
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
    registry: &TheoryRegistry,
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

`audit_meta` runs the registry's self-audit — the module's
own internal consistency check, independent of any loaded
theory.

The audit checks: unbound names, type mismatches, circular definitions,
missing proofs for theorems, statements whose justifications the
coherence check cannot replay.

---

## JSON-RPC protocol (`protocol.vr`)

The theory-interop layer can run as an MCP-style service — handy
for integrations with external tools (notebooks, LLM harnesses,
proof-browsers).

### Envelope types

```verum
public type JsonRpcRequest is {
    id:     Int,        // -1 signals a notification
    method: Text,       // e.g. "theory/list"
    params: Text,       // method-specific payload as a JSON Text blob
};

public type JsonRpcResponse is {
    id:     Int,
    result: Maybe<Text>,                  // present on success
    error:  Maybe<JsonRpcError>,          // present on failure
};

public type JsonRpcError is {
    code:    Int,
    message: Text,
};
```

**Shape notes.** The envelopes are intentionally minimal — no
`jsonrpc: "2.0"` version field, `params` is a raw JSON Text blob the
handler parses, and `id` is a plain `Int` rather than an arbitrary
JSON value. The error record has no `data` field. Exactly one of
`result` / `error` is `Some`.

### Typed parameter records

```verum
public type TranslateParams   is { source: Text, target: Text, map_json: Text };
public type AuditParams       is { theory_name: Text };
public type LoadParams        is { name: Text, body: Text };
public type CoherenceParams   is { pairs_json: Text };

public fn parse_translate_params(params: &Text) -> Maybe<TranslateParams>;
public fn parse_audit_params(params: &Text) -> Maybe<AuditParams>;
public fn parse_load_params(params: &Text) -> Maybe<LoadParams>;
public fn parse_coherence_params(params: &Text) -> Maybe<CoherenceParams>;
```

### Server

```verum
public type TheoryInteropServer is { registry: TheoryRegistry };

public fn new_server() -> TheoryInteropServer;

public fn handle_request(server: &mut TheoryInteropServer, req: &JsonRpcRequest)
    -> JsonRpcResponse;
public fn serve_request(server: &mut TheoryInteropServer, json_line: &Text) -> Text;

public fn make_request(method: Text, params: Text) -> JsonRpcRequest;
public fn is_ok(resp: &JsonRpcResponse) -> Bool;
public fn is_err(resp: &JsonRpcResponse) -> Bool;
public fn error_code(resp: &JsonRpcResponse) -> Int;
```

### Method catalogue

| Method | Purpose |
|--------|---------|
| `theory/list` | enumerate loaded theories |
| `theory/load` | load a theory from an inline JSON body |
| `theory/audit` | one-theory audit |
| `theory/coherence` | descent check across named translation pairs |
| `claim/translate` | produce a translation record via Kan extension |

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

## Cross-framework bridges (`bridges/`)

Concrete translations between named external frameworks. Each
bridge is a load-bearing artefact registered with
`@framework(...)` markers and audited by
`verum audit --bridge-discharge`.

### `bridges/owl2_to_htt.vr`

The OWL 2 Direct Semantics → Higher Topos Theory canonical
translation. Maps OWL 2 ontologies (classes / properties /
individuals + the 65 framework axioms in
`core.math.frameworks.owl2_fs`) into HTT (∞,1)-topos objects via
Lurie HTT's classifier-of-monics + nerve constructions.

**Soundness claim.** The translation is faithful — every OWL 2
DS derivation lifts to a HTT derivation; preserving OWA per W3C
§5.6 (no closed-world assumption is silently injected at
translation time). The Morita-equivalence inverse is currently
asserted as a citation; mechanised round-trip identity is
tracked as outstanding work.

**Cross-references:**

- [Verification → OWL 2 integration](/docs/verification/owl2)
  — the full OWL 2 stack including the framework axioms this
  bridge consumes.
- [`owl2_fs` framework package](/docs/verification/framework-axioms)
  — the 11-package / 71-axiom inventory.

### `bridges/oc_dc_bridge.vr`

The Object-Centric ↔ Dependency-Centric bridge — the Diakrisis
108.T α/ε Morita-duality made operational. Translates between
the AC-side (`core.math.*` articulations — *what exists*) and the
DC-side (`core.action.*` enactments — *what is done*) for any
proposition. Used by the `coherent_*` verification strategies
([gradual-verification](/docs/verification/gradual-verification))
to recognise α/ε bidirectional games.

---

## MSFS coordinate (`coord.vr`)

The Modular-Stratified-Foundation coordinate type. Every
imported theory acquires a position in the MSFS lattice — a
`(Foundation, ν, τ)` triple where `Foundation` names the
meta-theoretic profile (ZFC / HoTT / Cubical / CIC / MLTT / Eff /
custom), `ν` is the verification ladder ν-ordinal (see
[gradual-verification](/docs/verification/gradual-verification)),
and `τ` is the intensional / extensional axis.

```verum
public type Ordinal is { ... };

public fn ord_zero() -> Ordinal;
public fn ord_finite(n: Int) -> Ordinal;
public fn ord_omega() -> Ordinal;
public fn ord_omega_plus(k: Int) -> Ordinal;
public fn ord_omega_times(n: Int) -> Ordinal;
public fn ord_omega_times_plus(n: Int, k: Int) -> Ordinal;
public fn ord_lt(a: Ordinal, b: Ordinal) -> Bool;
public fn ord_eq(a: Ordinal, b: Ordinal) -> Bool;
public fn ord_max(a: Ordinal, b: Ordinal) -> Ordinal;
public fn ord_is_finite(o: Ordinal) -> Bool;
```

`Ordinal` encodes Cantor-normal-form ordinals below ε_0 — the
range Verum's verification ladder occupies. Audit gates
(`--coord`, `--coord-consistency`, `--no-coord`) consume the
coord values to verify cross-cog and cross-theory consistency.

```verum
public type TranslationVerdict is
    | Faithful
    | Approximating
    | Refuted;

public fn verdict_of(obstruction: Float) -> TranslationVerdict;
public fn verdict_admits(v: TranslationVerdict) -> Bool;
```

`TranslationVerdict` classifies each cross-framework translation
attempt; the audit chronicle archives the verdict per bridge
edge.

---

## Congruence closure (`congruence_closure.vr`)

A union-find-based congruence-closure machinery for the equality
fragment of imported theories. Used by the SMT-replay path when
the trusted base needs to recognise structural equalities lifted
from the external prover's proof object. The implementation is
the standard Nelson-Oppen-style E-graph plus quotient
representatives.

---

## See also

- **[math → infinity_topos](/docs/stdlib/math)** — the underlying
  ∞-topos constructions.
- **[math → kan_extension](/docs/stdlib/math)** — theorem-preserving
  functorial translation.
- **[proof](/docs/stdlib/proof)** — proof certificates for translated
  theorems.
- **[Verification → proofs](/docs/verification/proofs)** — how
  interop-translated theorems become Verum `theorem` declarations.
- **[Verification → MSFS coord](/docs/verification/msfs-coord)** —
  the operational coord-consistency machinery.
- **[Verification → OWL 2](/docs/verification/owl2)** — the OWL 2
  side of the `owl2_to_htt` bridge.
- **[Verification → actic-dual](/docs/verification/actic-dual)** —
  the AC/OC duality that the `oc_dc_bridge` realises.
