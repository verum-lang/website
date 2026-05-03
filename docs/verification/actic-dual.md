---
sidebar_position: 19
title: OC / DC Dual Stdlib (Actic)
---

# Object-Centric vs Dependency-Centric — the Dual Stdlib

> Per Diakrisis 108.T (AC/OC Morita-duality), every articulation
> α has a canonical enactment ε(α). Verum ships the dual as a
> first-class stdlib layer: `core.math.*` (OC, articulations) and
> `core.action.*` (DC, enactments). The α ⊣ ε adjunction is
> realised by the `epsilon` / `alpha_of` pair, with the unit
> identity enforced by the kernel and the counit identity
> witnessed up to gauge canonicalisation.

This page is normative for the verification spec

---

## 1. The duality, briefly

A **mathematical theory** can be presented in two complementary
ways:

- **Object-centric (OC)** — what *exists*: the objects, morphisms,
  axioms, the universe of discourse.
- **Dependency-centric (DC)** — what *is done*: the practices,
  the steps an agent takes, the operational record of a derivation.

Classical proof assistants (Coq, Lean, Agda, F\*, …) ship the OC
side: theorems, types, tactics. The DC side — the trace of which
ε-primitive (math, compute, observe, prove, decide, translate,
construct) was activated for which articulation — is left to the
user / IDE / tooling. Diakrisis 108.T (the AC/OC Morita-duality
theorem) shows that the two sides are categorically equivalent:
every articulation auto-induces a canonical enactment, and every
enactment carries a unique articulation.

Verum is the first proof assistant to ship **both** halves of the
duality as stdlib. The DC side enables:

- Per-function ε-coordinate audit (`verum audit --epsilon`).
- Per-theorem MSFS coordinate `(Framework, ν, τ)` projection.
- Compositional reasoning about *which* ε-primitive was activated
  at which step of a chain — a granularity unavailable in
  pure-OC systems.

---

## 2. The eight ε-primitives

`core.action.primitives` ships seven canonical Diakrisis primitive
acts plus the catalogue extension `ε_classify` introduced by the verification spec
(OWL 2 V1 ecosystem). All eight are leaves of the Actic dual:

| Primitive | Surface name | Diakrisis intent |
|---|---|---|
| `EpsilonMath` | `ε_math` | Pure mathematical reasoning (intuitionistic, propositions-as-types). |
| `EpsilonCompute` | `ε_compute` | Total computable function evaluation. |
| `EpsilonObserve` | `ε_observe` | Read-only observation of an external state. |
| `EpsilonProve` | `ε_prove` | Production of a proof witness via tactic / kernel re-check. |
| `EpsilonDecide` | `ε_decide` | Branch on a decidable predicate. |
| `EpsilonTranslate` | `ε_translate` | Cross-framework articulation translation (Kan extension). |
| `EpsilonConstruct` | `ε_construct` | Constructive existence proof producing a witness. |
| `EpsilonClassify` | `ε_classify` | Ontology classification / subsumption / instance check (the verification spec extension). |

Classifier predicates (`is_observational`, `is_constructive`,
`is_proof_producing`, `is_decision_point`, `is_translation`,
`is_classification`) lift each primitive to a Bool so user code can
pattern-match on the *kind* of ε without enumerating all eight cases.

```verum
mount core.action.primitives;

assert(primitive_as_text(EpsilonProve) == "ε_prove");
assert(is_proof_producing(EpsilonProve));
assert(is_observational(EpsilonObserve));
assert(is_constructive(EpsilonMath));
```

---

## 3. The Articulation type

`core.action.articulation` ships the syntactic projection of an
Articulation — a flat record carrying the framework name,
citation, and lineage:

```verum
@derive(Clone)
public type Articulation is {
    framework: Text,
    citation:  Text,
    lineage:   Text,
};
```

The neutral element `raw_actic_articulation()` is used by
enactments lifted directly from a bare ε-primitive — it captures
"this is Diakrisis Actic §1 (canonical primitive), no specific
foundation chosen yet". `primitive_articulation(p)` produces the
per-primitive Actic articulation; `articulation_eq(a, b)` is
structural equality.

This is a *syntactic* projection of the Diakrisis 2-categorical
notion: a true Articulation is an object of `⟨⟨·⟩⟩` (the
classifying 2-stack of Rich-Sequent foundations). The flat record
is enough for stdlib-level arithmetic; the full 2-categorical
structure lives in [`core.theory_interop`](msfs-coord.md).

---

## 4. Enactments

`core.action.enactments` ships the Enactment type — a sequence of
ε-primitives plus an A-modality activation rank, attached to the
Articulation it enacts:

```verum
@derive(Clone)
public type Enactment is {
    name:            Text,
    steps:           List<Primitive>,
    activation_rank: Int,
    articulation:    Articulation,
};
```

### 4.1 Constructors and elementary operations

| Operation | Diakrisis-canonical alias | Semantics |
|---|---|---|
| `primitive_enact(p)` | — | Lift one ε-primitive into an Enactment with `articulation = primitive_articulation(p)`. |
| `identity_enact()` | — | Empty enactment; activation rank 0; `articulation = raw_actic_articulation()`. |
| `compose(a, b)` | `enact_then(a, b)` | Sequential composition `a then b`. Step lists concatenate; activation rank = max; articulation absorbs (raw absorbs into non-raw; non-raw mismatch falls back to raw to flag a gauge clash). |
| `enact_par(a, b)` | — | Parallel composition `a ‖ b`. At the stdlib layer observationally identical to `compose`; kept as separate public surface so future CCS-style parallelism can specialise without breaking call sites. |
| `activation(e)` | `activate(e)` | A-modality applied once; bumps `activation_rank` by 1. |
| `activation_iterate(e, n)` | `activate_n(e, n)` | A-modality bounded iteration by finite n. |
| `is_autopoietic(e)` | — | Predicate: `activation_rank ≥ AUTOPOIETIC_THRESHOLD = 64`. |
| `autopoiesis(e)` | — | Closure operation: `canonicalise(e)` if autopoietic, else `e` unchanged. |

Both Diakrisis-canonical names (`enact_then`, `enact_par`,
`activate`, `activate_n`, `autopoiesis`) and Verum-historic names
(`compose`, `activation`, `activation_iterate`, `is_autopoietic`)
are public and stable; user code may pick either.

### 4.2 The α ⊣ ε adjunction (the verification spec)

```verum
public fn epsilon(alpha: Articulation) -> Enactment {
    Enactment {
        name:            "ε(" ++ articulation_as_text(alpha) ++ ")",
        steps:           List.new(),
        activation_rank: 0,
        articulation:    alpha,
    }
}

public fn alpha_of(e: Enactment) -> Articulation = e.articulation;

public fn is_adjoint(alpha: Articulation, e: Enactment) -> Bool {
    articulation_eq(alpha, alpha_of(e))
}
```

The adjunction `α ⊣ ε` is realised at the level of *core data*:

- **Unit identity** `η_α : α ≡ alpha_of(epsilon(α))` is **definitional**
  — the kernel emits an equality after canonicalisation. The typing
  rule `K-Adj-Unit` gives this status:

  ```
    Γ ⊢ α : Articulation
    ─────────────────────────────────────── (K-Adj-Unit)
    Γ ⊢ alpha_of(epsilon(α)) ≡ α
  ```

- **Counit identity** `ε_e : epsilon(alpha_of(e)) ↦ canonicalise(e)`
  is a **proper lax 2-cell** for general `e` — `epsilon(alpha_of(e))`
  is the syntactic self-enactment of `e`'s articulation, which has
  no steps; a generic `e` has steps of its own. The two are
  *gauge-equivalent* iff `e` is gauge-equivalent to its syntactic
  self (decided by `gauge_equivalent`). When they agree:

  ```
    Γ ⊢ e : Enactment    gauge_equivalent(epsilon(alpha_of(e)), e)
    ─────────────────────────────────────────────────────────────── (K-Adj-Counit)
    Γ ⊢ canonicalise(epsilon(alpha_of(e))) ≡ canonicalise(e)
  ```

Diakrisis 108.T states the duality as a strict (∞, ∞)-categorical
equivalence; Verum's stdlib realisation is faithful to the unit
direction (strict equality) and lax in the counit direction (gauge
equivalence). The lax counit is exactly what a stdlib data layer can
witness without leaving first-order types — strengthening it to the
strict form would require kernel-level 2-functor machinery, which
this layer deliberately stays out of.

### 4.3 Gauge canonicalisation

`core.action.gauge` ships the canonicalisation that decides which
enactments are "the same up to gauge":

```verum
public fn canonicalise(e: Enactment) -> Enactment;
public fn gauge_equivalent(a: Enactment, b: Enactment) -> Bool;
```

`canonicalise` collapses adjacent observation runs (idempotency of
`ε_observe ∘ ε_observe = ε_observe`), preserves the activation
rank, and preserves the articulation. `gauge_equivalent` decides
equivalence by reducing both sides to canonical form.

### 4.4 ε-Audit

`core.action.verify` ships the operational ε-audit:

```verum
public type AuditVerdict is
    Consistent | TooWeak | TooStrong | GaugeMismatch;

public fn verify_epsilon(declared: Primitive, observed: Enactment) -> AuditVerdict;

public type ConsistencyReport is { ... };
public fn gauge_consistency(epsilon: Primitive, observed: List<Enactment>) -> ConsistencyReport;
```

`verify_epsilon` checks whether the *declared* ε-coordinate
(what the user marked with `@enact(epsilon = "ε_prove")`) is
consistent with the *observed* enactment (the actual chain of
primitives executed). For example, declaring `ε_prove` but never
producing a proof witness yields `TooStrong`; declaring
`ε_observe` while running a constructive primitive yields
`TooWeak`. Audit is wired into the CLI via `verum audit --epsilon`.

---

## 5. The `@enact` annotation

```verum
@enact(epsilon: "ε_prove")
public fn prove_yoneda() -> Proven<Yoneda> using [Theorem] { ... }

@enact(epsilon = "ε_observe")
public fn read_state() -> State using [Database] { ... }

@enact("ε_construct")
public fn build_witness() -> Witness { ... }
```

Three equivalent surface shapes:

| Form | Lowering |
|---|---|
| `@enact(epsilon: "...")` | named-arg colon ⇒ `Binary { op: Assign, left: Path("epsilon"), right: Literal }` |
| `@enact(epsilon = "...")` | named-arg equals ⇒ same Binary Assign shape |
| `@enact("...")` | positional ⇒ bare string literal |

The `EnactAttr::from_attribute` parser accepts all three;
canonicalisation maps ASCII fallback names (`epsilon_prove`,
`epsilon_decide`, …) to their Unicode primitives (`ε_prove`,
`ε_decide`).

`verum audit --epsilon src/` walks the project and prints the
ε-distribution: how many functions live in each ε-bucket. Malformed
markers (unknown primitive, missing argument) are flagged with the
canonical primitive list for fix-suggestion.

---

## 6. Cross-checking against the Diakrisis specification

The DC layer's Diakrisis specification is structured into six
chapters: basic dual primitive (Ch 02), the seven canonical
operations (Ch 03–05), the Actic-side theorems (Ch 06), the
soundness argument (Ch 07–08), and a Verum-stdlib mapping (Ch 09).
Verum's implementation matches the Ch 09 mapping verbatim for the
seven primitives and the canonical operation names; it diverges in
two places:

| Aspect | Diakrisis sketch | Verum implementation |
|---|---|---|
| `activate_n(e, n: Ordinal)` | n is a transfinite Ordinal | n is a finite `Int` |
| `enact_par` semantics | "true parallel composition" (CCS-style) | observationally identical to `compose` (sequential) — same observable trace, no CCS scheduling layer |
| α ⊣ ε counit identity | strict (∞, ∞)-categorical equivalence per 108.T | lax 2-cell up to gauge canonicalisation |

These divergences are deliberate stratification: the stdlib layer
delivers as much of the duality as can be witnessed in first-order
types and finite arithmetic, and the kernel layer carries the
machinery for the strict / transfinite forms.

---

## 7. Worked example — the `prove_yoneda` enactment

```verum
mount core.action.*;

let alpha: Articulation = articulation_new(
    "lurie_htt",
    "Lurie 2009 — HTT 6.2.2.7",
    "yoneda_embedding_fully_faithful",
);

// Build a proof-producing enactment over the Lurie HTT articulation.
let e: Enactment = compose(
    primitive_enact(EpsilonObserve),    // observe the diagram
    compose(
        primitive_enact(EpsilonMath),   // mathematical reasoning step
        primitive_enact(EpsilonProve),  // produce the witness
    ),
);

// alpha_of returns "actic.raw" because the chain was built from raw
// primitives — to attach the Lurie HTT articulation, compose with
// epsilon(alpha):
let attached: Enactment = compose(epsilon(alpha.clone()), e);

// Adjunction unit: alpha_of round-trips the articulation.
assert(is_adjoint(alpha.clone(), attached.clone()));

// ε-audit: declared ε_prove must match the observed chain.
match verify_epsilon(EpsilonProve, attached) {
    Consistent => print("ok"),
    other      => panic(verdict_as_text(other)),
}
```

The example illustrates the three operational layers:

1. **Primitive composition** — sequential `then` chaining of the
   seven ε-primitives.
2. **Articulation attachment** — `compose(epsilon(α), e)` lifts a
   raw chain into a chain attached to a specific Rich foundation.
3. **Audit** — `verify_epsilon` decides whether the declared
   intent (`ε_prove`) is consistent with the observed chain.

---

## 8. Where to look in the standard library

| Surface | Source |
|---------|--------|
| `core.action.*` skeleton — types, constructors, traversal | `core/action/` |
| Articulation + α ⊣ ε pair (`epsilon`, `alpha_of`) | `core/action/articulation.vr`, `core/action/enactments.vr` |
| `@enact` attribute and `verum audit --epsilon` | `crates/verum_cli/src/commands/audit.rs` |
| `core.theory_interop` Yoneda / Kan / descent — see also [MSFS coordinate](msfs-coord.md) | `core/theory_interop/` |
| Diakrisis-canonical aliases (`enact_then`, `enact_par`, `activate`, `activate_n`, `autopoiesis`) | `core/action/enactments.vr` |

---

## 9. Further reading

- [Operational coherence (VVA-6 stdlib preview)](coherence.md) —
  M4.E `core/verify/coherence.vr`: the `CoherenceCert` carrier
  protocol that operationalises the AC/OC duality at the
  `@verify(coherent)` strategy layer. Provides the bidirectional
  α-cert ⟺ ε-cert witness consumed by `verum audit --coherent`.
- [Coord-consistency + framework-soundness audits](coord-consistency-audit.md)
  — M4.A / M4.B audit walkers that cross-check Articulation
  citations at corpus-audit time.
- [MSFS coordinate](msfs-coord.md) — `core.theory_interop` and the
  `(Framework, ν, τ)` lattice projection that consumes Articulations.
- [Articulation Hygiene](articulation-hygiene.md) — the surface
  hygiene check that pairs with the OC/DC stdlib at the type level.
- [Framework axioms](framework-axioms.md) — how `@framework(name,
  citation)` axioms install Articulations into the kernel.

## Implementation surface — kernel modules

The α/ε bidirectional system lives in three kernel modules
(see [kernel-module-map](./kernel-module-map.md) for the full
trust layout):

| Module | Role |
|--------|------|
| `verum_kernel::eps_mu` | ε-μ-style coherence machinery; ships `check_eps_mu_coherence` and `check_eps_mu_coherence_v3_final` predicates that the `@verify(coherent_*)` strategies invoke. |
| `verum_kernel::diakrisis_bridge` | Trusted boundary for K-Round-Trip's universal canonicalize. Each `BridgeId` admit names a specific Diakrisis preprint result (paragraph + theorem number) — e.g. `BridgeId::ConfluenceOfModalRewrite` cites Diakrisis Theorem 16.10. When the preprint resolves and the result lands as a structural algorithm, the corresponding admit is removed and call sites are re-checked against the now-derivable lemma. |
| `verum_kernel::adjoint_functor` | Adjoint pairs L ⊣ R — the categorical infrastructure the α ⊣ ε pair instantiates. |

The `verum audit --bridge-discharge` and
`verum audit --bridge-admits` gates enumerate every active
BridgeId admit, surfacing the IOU manifest per release so users
can track which Diakrisis preprint results are still admitted vs
discharged. See
[Audit protocol](../architecture-types/audit-protocol.md).

- the verification spec.
- Diakrisis Ch 12-actic — the upstream specification this layer
  implements. Key chapters: Ch 02 (the AC primitive and the
  ε-primitive list), Ch 04 (the 108.T duality theorem), Ch 09
  (the Verum-stdlib mapping prescription that this module follows
  verbatim).
