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
type MathesisRegistry is { ... };

new_registry() -> MathesisRegistry
registry.load(path: &Path) -> Result<TheoryId, LoadError>
registry.find(id: TheoryId) -> Maybe<&LoadedTheory>
registry.list() -> List<TheoryId>
registry.unload(id: TheoryId) -> Bool
registry.size() -> Int
```

### `LoadedTheory`

```verum
type LoadedTheory is {
    id: TheoryId,
    name: Text,
    version: Text,
    statements: List<Statement>,          // axioms, definitions, theorems
    dependencies: List<TheoryId>,
    metadata: TheoryMetadata,
};

type Statement is
    | Axiom       { name: Text, body: Text }
    | Definition  { name: Text, body: Text }
    | Theorem     { name: Text, body: Text, proof: Maybe<Text> }
    | Tactic      { name: Text, body: Text };
```

### Loading

```verum
load_theory(path: &Path) -> Result<LoadedTheory, LoadError>
find_theory(registry: &MathesisRegistry, id: TheoryId) -> Maybe<&LoadedTheory>
list_theories(registry: &MathesisRegistry) -> List<TheoryId>
```

Conceptually, loading is a **Yoneda embedding**: the theory becomes a
presheaf over its own syntactic category, and the registry tracks all
such presheaves.

---

## Translation

### `TranslationResult`

```verum
type TranslationResult is {
    source_id: TheoryId,
    target_id: TheoryId,
    mapping: ExtensionMap,             // symbol map + sort map
    preserved: List<Statement>,        // statements translated successfully
    lost: List<Statement>,             // statements that could not be translated
    records: List<TranslationRecord>,
};
type TranslationRecord is {
    kind: TranslationKind,
    statement: Text,
    justification: Text,
};
type TranslationKind is
    | Identity
    | ParameterInstantiation
    | KanExtension
    | OracleGuidance
    | Descent;
```

### Operations

```verum
translate(src: &LoadedTheory, tgt: &LoadedTheory) -> TranslationResult
translate_with_oracle(src: &LoadedTheory, oracle: &LlmOracle) -> TranslationResult
```

Translation is implemented as a **Kan extension** along the shared
language between source and target theories:
- **Left Kan extension** when translating *from* a richer theory to a
  coarser one (lossy, but syntactically minimal).
- **Right Kan extension** when translating *to* a richer theory (fills
  in universally-quantified details).

The LLM oracle variant is used to suggest mappings for unrecognised
statements; the compiler ultimately checks every oracle suggestion for
coherence (see below).

---

## Coherence

A translation is **coherent** iff it respects the descent conditions
of the ∞-topos: the translated image of every gluing condition in
the source remains gluing in the target.

### `CoherenceResult`

```verum
type CoherenceResult is {
    ok: Bool,
    obstructions: List<DescentObstruction>,
};
type DescentObstruction is {
    statement: Text,
    witness_required: Text,
    reason: Text,
};
```

### Operations

```verum
check_coherence(t: &LoadedTheory) -> CoherenceResult
check_translation_coherence(r: &TranslationResult) -> CoherenceResult
```

An incoherent translation is still a partial function; it simply
cannot be trusted as a theorem-transporting map. Users can:

- reduce the target theory (drop gluing conditions);
- enrich the translation (supply more witnesses);
- accept the incoherence and operate piecewise.

---

## Auditing

```verum
type AuditResult is {
    theory_id: TheoryId,
    checks_passed: Int,
    checks_failed: Int,
    findings: List<AuditFinding>,
};
type AuditFinding is {
    severity: Severity,              // Info | Warning | Error
    statement: Text,
    message: Text,
};

audit_theory(t: &LoadedTheory) -> AuditResult
audit_meta(registry: &MathesisRegistry) -> AuditResult    // audit all loaded theories
```

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
server.serve(&"tcp://0.0.0.0:4711").await -> IoResult<()>    using [IO]
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
fn main() using [IO] {
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
