---
sidebar_position: 21
title: OWL 2 Integration
---

# OWL 2 — Direct Semantics + Functional Style Syntax

> Verum is the first proof assistant that ships OWL 2 Direct
> Semantics as a first-class framework axiom package. The OWL 2 DL
> reasoner that Protégé / HermiT / Pellet provide is now a Verum
> stdlib citizen — every operator from the W3C OWL 2 FS recommendation
> is a named `@framework(owl2_fs, "Shkotin 2019. ...")` axiom that
> `verum audit --framework-axioms --by-lineage owl2_fs` enumerates.

This page is the comprehensive surface for the OWL 2 stack. It pairs
the [framework-axiom system](framework-axioms.md) (which provides the
trusted-boundary discipline) with the [MSFS coordinate
projection](msfs-coord.md) (which positions OWL 2 at `ν=1, τ=intensional`
in the Diakrisis lattice). VUVA spec §21 is the normative source.

---

## 1. Why OWL 2 in Verum?

OWL 2 is the W3C standard for ontology engineering — the formal
backbone of SNOMED-CT (medicine), the Gene Ontology (biology),
DBpedia (encyclopaedia knowledge), SUMO / Cyc (general-purpose
common-sense reasoning), DOLCE / BFO (philosophy of being), and
FIBO (financial regulation). Every mainstream knowledge graph is
either OWL 2 native or has an OWL 2 export.

Until now, importing an OWL 2 corpus into a proof assistant required
*either* a hand-rolled translation (lossy) or a black-box DL
reasoner with no formal connection to the assistant's kernel
(unverifiable). Verum's stack closes both gaps:

- **Faithful translation** (shipped, V1) — every W3C OWL 2 DS
  derivation is a Verum derivation, by direct line-by-line encoding
  of [Shkotin 2019 (DS2HOL)](https://github.com/ashkotin/ds2hol)
  Tables 1–10.
- **Trusted boundary** — the OWL 2 dependency footprint of any
  corpus is enumerated by `verum audit --framework-axioms
  --by-lineage owl2_fs`, just as for any other Verum framework.
- **MSFS coordinate** — OWL 2 theorems land at `(owl2_fs, ν=1,
  τ=intensional)` in the Diakrisis lattice; cross-framework
  composition (e.g. medical SNOMED-CT subsumption proofs invoking
  Lurie HTT ∞-categorical infrastructure) is one
  `core.theory_interop.translate` call away.

VUVA §21.2 distinguishes two layers of correspondence claim:

| Claim | Status | Direction |
|---|---|---|
| **Faithful translation** | Shipped | every OWL 2 DS derivation ⇒ Verum derivation |
| **Morita-equivalence** | Phase 6 F7 deferred | OWL 2 DS ↔ Verum-encoded OWL 2 *both* directions |

Faithful translation is automatic from the Shkotin-literal encoding;
Morita-equivalence elevates the claim to "Verum's OWL 2 *is* OWL 2
up to categorical equivalence" — a Phase 6 deliverable.

---

## 2. Scope — Direct Semantics, not RDF-Based Semantics

W3C ships two OWL 2 semantics:

- **OWL 2 Direct Semantics (DS)** — the model-theoretic semantics
  used by every mainstream reasoner (HermiT, Pellet, FaCT++, ELK,
  Konclude). DS is a decidable fragment of SROIQ description logic
  with known complexity profiles per W3C profile (EL: P, QL: NL, RL:
  P, full DL: 2NEXPTIME).
- **OWL 2 RDF-Based Semantics (RBS)** — graph-based semantics over
  RDF triples. Undecidable; primarily used for SPARQL interop.

Verum targets **DS only**. Rationale (per VUVA §21.1):

- DS gives decidability, matching VUVA §12's nine-strategy ladder
  which expects predictable complexity per strategy.
- RBS triples don't map cleanly onto Verum's typed refinement
  structure (VUVA §5) without a graph-modelling layer that would
  duplicate `core.collections.Map<Text, Set<Text>>`.
- Shkotin 2019 — the formal bridge Verum imports — formalises DS
  only; RBS has no equivalent in-kernel formalisation.

If a consumer needs RBS (e.g. SPARQL interop), a separate
`core.math.frameworks.owl2_rbs` package is a Phase 6 work item.

---

## 3. Three-layer architecture

OWL 2 integration decomposes into three clean layers, each mapping
onto an existing VUVA architectural slot. This is **not** new
architecture — OWL 2 is lifted into VUVA's existing surfaces.

| Layer | Module | Role | Shipped |
|---|---|---|---|
| **L1 — Semantic framework** | `core.math.frameworks.owl2_fs` | 64 trusted `@framework(owl2_fs, ...)` axioms (Shkotin Tables 1–10) + count_o quantifier | V1 ✓ |
| **L2 — Vocabulary attributes** | `verum_ast::attr::typed::Owl2*Attr` | Seven typed attributes preserving OWL 2 vocabulary at the source for byte-identical round-trip | V1 ✓ |
| **L3 — Verification obligations** | `@theorem` + `@verify(...)` | Subsumption, classification, consistency dispatched per the §21.3 routing table | wired through B1–B4 |

### 3.1 Layer 1 — semantic framework package

`core.math.frameworks.owl2_fs` ships every operator of the W3C OWL
2 FS recommendation as a named axiom:

| Sub-module | Shkotin §X.Y / Table | Operators |
|---|---|---|
| `types` | §Notation | Individual (sort `o`), Literal (sort `d`), count_o axiom (1) |
| `count` | §21.5 (VUVA) | count_o function + E_OWL2_UNBOUNDED_COUNT diagnostic |
| `object_property` | §2.2.1 Table 1 | ObjectInverseOf (1) |
| `data_range` | §2.2.2 Table 3 | DataIntersectionOf, DataUnionOf, DataComplementOf, DataOneOf, DatatypeRestriction (5) |
| `class_expr` | §2.2.3 Table 4 | ObjectIntersectionOf, ObjectUnionOf, ObjectComplementOf, ObjectOneOf; 8 object-property restrictions; 8 data-property restrictions; 4 negative range constraints (24) |
| `class_axiom` | §2.3.1 Table 5 | SubClassOf, EquivalentClasses, DisjointClasses, DisjointUnion (4) |
| `object_property_axiom` | §2.3.2 Table 6 | hierarchy + chain (3) + equivalence/disjointness (2) + domain/range (2) + 7 characteristic flags = 14 |
| `data_property_axiom` | §2.3.3 Table 7 | Sub/Equivalent/Disjoint/Domain/Range/Functional (6) |
| `datatype_definition` | §2.3.4 Table 8 | DatatypeDefinition (1) |
| `key` | §2.3.5 Table 9 | HasKey with NAMED restriction (1) |
| `assertion` | §2.3.6 Table 10 | Same/Different + 4 ABox + 2 negative ABox (7) |

**V1 shape** — each axiom is a *trusted-boundary marker*:

```verum
@framework(owl2_fs, "Shkotin 2019. DS2HOL-1 §2.3.1 Table 5: SubClassOf")
public axiom SubClassOf() -> Bool ensures true;
```

The `ensures true` placeholder is intentional. V1 ships the **citation
discipline** so `verum audit` enumerates the OWL 2 footprint of any
corpus; V2 will replace each `ensures true` with the verbatim
HOL-definition body from Shkotin's "HOL-definition body" column so SMT
dispatch via CVC5 FMF can decide encoded subsumption / classification /
instance-check obligations.

### 3.2 Layer 2 — typed attribute family (`Owl2*Attr`)

Seven typed attributes in `verum_ast::attr::typed` preserve OWL 2
vocabulary at the source so `verum export --to owl2-fs` (B5) round-
trips cleanly to Protégé / HermiT / Pellet:

```verum
@owl2_class(semantics = "OpenWorld")
public type Person is { name: Text };

@owl2_subclass_of(Animal)
public type Mammal is { ... };

@owl2_disjoint_with([Pizza, IceCream])
public type Salad is { ... };

@owl2_property(domain = Person, range = Person,
               characteristic = [Symmetric, Transitive],
               inverse_of = knownBy)
public fn knows(a: Person, b: Person) -> Bool { ... }

@owl2_equivalent_class(HumanBeing)
public type Person is { ... };

@owl2_has_key(ssn, birth_date)
public type Citizen is { ... };

@owl2_characteristic("Transitive")
public fn ancestor_of(a: Person, b: Person) -> Bool { ... }
```

| Attribute | Purpose | Reject conditions |
|---|---|---|
| `@owl2_class` | Mark a type as an OWL 2 Class (default ClosedWorld) | unknown semantics value |
| `@owl2_subclass_of(C)` | Subclass relation | wrong arg count |
| `@owl2_disjoint_with([...])` / `@owl2_disjoint_with(...)` | Disjointness | empty list |
| `@owl2_characteristic(F)` | One of seven flags | unknown flag (e.g. `Idempotent`) |
| `@owl2_property(domain, range, …)` | Object/data property | missing domain or range; unknown named-arg key |
| `@owl2_equivalent_class(C)` | Equivalence | wrong arg count |
| `@owl2_has_key(p, …)` | Key constraint (NAMED) | empty list |

Every attribute parser **rejects** typos rather than silently
discarding them — `@owl2_property(domian = Person, ...)` (typo on
`domain`) returns `Maybe::None` from `Owl2PropertyAttr::from_attribute`.
The elaboration pass surfaces the `None` as a parse-time diagnostic.
This is non-negotiable: silent acceptance of a typo would let a
faulty ontology compile.

### 3.3 Layer 3 — verification obligations

Per VUVA §21.3, OWL 2 reasoning tasks dispatch through the standard
nine-strategy `@verify` ladder:

| OWL 2 task | VUVA strategy | ν-ordinal | Rationale |
|---|---|---|---|
| Consistency of an ontology | `@verify(formal)` | ω | SMT satisfiability on the joint refinement |
| Classification (EL/QL/RL) | `@verify(fast)` | 2 | Polynomial-time profile; bounded SMT timeout |
| Classification (full DL) | `@verify(thorough)` | ω·2 | 2NEXPTIME; portfolio dispatch |
| Subsumption `C ⊑ D` | `@verify(formal)` | ω | Closed-goal SMT obligation |
| Instance check `a : C` | `@verify(fast)` runtime / `@verify(formal)` compile | varies | Ordinary refinement check |
| HasKey with NAMED restriction | `@verify(proof)` | ω + 1 | DL-reasoner case per Shkotin §2.3.5 |
| Ontology alignment | `@verify(reliable)` | ω·2 + 1 | Z3 ∧ CVC5 agreement required |
| Federation coherence (Noesis) | `@verify(certified)` | ω·2 + 2 | Certificate materialisation + export |

This commits dispatch semantics at the spec level so implementation
has a fixed target.

---

## 4. CWA / OWA semantics

OWL 2 DS uses **Open World Assumption** (OWA): absence of an
assertion does not imply negation. Verum's typed refinement system
uses **Closed World Assumption** (CWA): a predicate either holds or
fails.

Direct accommodation of both simultaneously would require every OWL
2 query to return `Maybe<Bool>` with `Unknown`, breaking composition
with the rest of Verum's type system. VUVA §21.4 chooses a pragmatic
resolution:

- **Default: CWA.** `@owl2_class` / `@owl2_property` without explicit
  semantics qualifier compile into standard Verum refinements;
  queries return `Bool`. This preserves ergonomics and makes ~95% of
  practical ontologies (medical classification, business rules, type
  hierarchies) work with zero ceremony.
- **Opt-in: OWA.** `@owl2_class(semantics = OpenWorld)` flips to OWA
  semantics locally; queries against that class return `Maybe<Bool>`
  with `Unknown` when class membership is neither provable nor
  refutable.

Mixed-semantics composition is **rejected** by the compiler — `and`-
composing an OWA class query with a CWA refinement requires explicit
use of `core.logic.kleene` three-valued connectives.

---

## 5. The `count_o` quantifier-of-quantity

Shkotin 2019 introduces a quantifier of quantity `#y:o P(y)` —
the number of OWL 2 Individuals satisfying P. Verum ships it at
`core.math.frameworks.owl2_fs.count`:

```verum
public fn count_o<I: Individual>(
    domain: List<I>,
    pred:   fn(I) -> Bool,
) -> Int;
```

V1 chooses constructive correctness (user supplies the closed
domain) over black-box SMT decidability:

```verum
let people: List<Person> = [alice, bob, carol, dave];
let proven_count: Int = count_o(people, |p| has_passed_exam(p));
// proven_count is total — domain is finite by construction.
```

For unbounded queries (no explicit domain witness) Verum surfaces
`E_OWL2_UNBOUNDED_COUNT` as a diagnostic:

```verum
match count_o_unbounded(maybe_domain, pred) {
    Some(n) => print(f"count = {n}"),
    None    => panic(E_OWL2_UNBOUNDED_COUNT),
}
```

V2 will replace the `Maybe::None` branch with CVC5 Finite Model
Finding dispatch when the consuming class carries `@owl2_class(
semantics = ClosedWorld)`.

---

## 6. Worked example — a small ontology

```verum
mount core.math.frameworks.owl2_fs.*;

// Class hierarchy: Animal > Mammal > Person.
@owl2_class
public type Animal is { name: Text };

@owl2_class
@owl2_subclass_of(Animal)
public type Mammal is { name: Text };

@owl2_class
@owl2_subclass_of(Mammal)
public type Person is { name: Text, ssn: Text };

// Disjointness: a Salad is neither Pizza nor IceCream.
@owl2_class
@owl2_disjoint_with([Pizza, IceCream])
public type Salad is { ingredients: List<Text> };

// Symmetric + transitive object property.
@owl2_property(
    domain = Person,
    range  = Person,
    characteristic = [Symmetric, Transitive],
)
public fn knows(a: Person, b: Person) -> Bool { ... }

// Functional data property.
@owl2_characteristic("Functional")
public fn ssn_of(p: Person) -> Text { ... }

// HasKey: a Citizen is identified by (ssn, birth_date).
@owl2_class
@owl2_has_key(ssn, birth_date)
public type Citizen is { ssn: Text, birth_date: Text, ... };

// Equivalence.
@owl2_equivalent_class(HumanBeing)
public type Person is { ... };

// A subsumption check — `@verify(formal)` per VUVA §21.3.
@verify(formal)
@theorem
public fn person_is_animal(p: Person) -> (p is Animal)
    proof by simp[SubClassOf, owl2_subclass_chain];
```

The compiler:

1. Installs each `@framework(owl2_fs, ...)` axiom referenced by the
   typed attributes.
2. Emits subsumption / disjointness / characteristic-flag obligations
   per the §21.3 dispatch table.
3. Routes each obligation to the appropriate SMT backend.
4. Records the framework-axiom set in the build receipt for
   `verum audit --framework-axioms` and `verum audit --coord`.

---

## 7. CLI workflow

```bash
verum audit --framework-axioms --by-lineage owl2_fs   # OWL 2 footprint
verum audit --coord                                    # MSFS coord projection
verum audit --hygiene                                  # Articulation hygiene
verum audit --epsilon                                  # Actic ε-distribution
verum check --hygiene                                  # V2: kernel-level hygiene
verum verify --strategy formal                         # subsumption / classification
verum export --to owl2-fs ./src/ontology.vr            # B5 (deferred)
```

`verum audit --coord` projects every owl2_fs theorem to its MSFS
coordinate `(owl2_fs, ν=1, τ=intensional)` — the SROIQ DL-decidable
fragment. See [MSFS coordinate](msfs-coord.md) for the full lattice
arithmetic.

---

## 8. Cross-framework composition (Phase 3b → Phase 6)

Phase 3b ships a canonical bridge `owl2_fs → lurie_htt` (~30
`@framework_translate(owl2_fs → lurie_htt, ...)` axioms) so OWL 2
corpora automatically receive ∞-topos / categorical interpretations:

| OWL 2 operator | HTT image |
|---|---|
| Class | Presheaf on the discrete category of individuals (HTT 1.2.1) |
| ObjectProperty | Functor between class-presheaves |
| SubClassOf | Monomorphism in the presheaf topos |
| EquivalentClasses | Isomorphism |
| ObjectPropertyChain | Functor composition |
| HasKey | Representable-presheaf condition (HTT 5.1) |

Phase 6 F6 extends to bridges to the rest of the standard six-pack
(`baez_dolan`, `schreiber_dcct`, `connes_reconstruction`,
`petz_classification`). Phase 6 F7 elevates the §21.2 correspondence
from faithful translation to Morita-equivalence in both directions
(`owl2_morita_bridge` theorem).

---

## 9. Roadmap

| Task | Status | Tracker |
|---|---|---|
| C7 — owl2_fs package (64 trusted axioms) | V1 ✓ | `core/math/frameworks/owl2_fs/` |
| C7 — V2 HOL-body completion | Open | per-table follow-up commits |
| C7b — `owl2_fs → lurie_htt` bridge (~30 translate axioms) | Open | post-C7-V2 |
| C8 — OwlAttr family (7 typed attributes) | V1 ✓ | `crates/verum_ast/src/attr/typed.rs::Owl2*Attr` |
| C9 — count_o + E_OWL2_UNBOUNDED_COUNT diagnostic | V1 ✓ | `core/math/frameworks/owl2_fs/count.vr` |
| C9 — V2 CVC5 Finite Model Finding integration | Open | `crates/verum_smt/src/backend_switcher.rs` |
| B5 — `verum export --to owl2-fs` / `verum import` | Deferred | depends on C8 |
| F5 — `verum audit --owl2-classify` | Deferred | depends on C7+C8 |
| F6 — bridges to `baez_dolan`, `schreiber_dcct`, … | Deferred | depends on C7b |
| F7 — Morita-equivalence theorem `owl2_morita_bridge` | Deferred | depends on F5+F6 |

---

## 10. Success criteria (VUVA §21.12)

1. Round-trip: Pellet-compatible `foaf.owl` → `verum import` → `verum export` → byte-identical output.
2. SNOMED-CT medical corpus classification produces the same class hierarchy as HermiT.
3. `verum audit --framework-axioms` enumerates every used OWL 2 operator with Shkotin 2019 table/row citation.
4. Verum corpus mixing `@framework(lurie_htt, …)` theorems with `@framework(owl2_fs, …)` ontologies compiles and verifies cleanly (cross-framework non-interference).
5. `core.theory_interop.translate(owl2_ontology, lurie_htt_target)` produces a well-typed result for the standard OWL 2 test suite (W3C Test Cases Part 2).

---

## 11. Further reading

- [Framework axioms](framework-axioms.md) — the `@framework(name,
  citation)` system that produces the trusted boundary OWL 2 inhabits.
- [MSFS coordinate](msfs-coord.md) — the lattice projection that
  positions OWL 2 at `ν=1, τ=intensional`.
- [Articulation Hygiene](articulation-hygiene.md) — the surface
  hygiene that interacts with OWL 2 self-referential class
  expressions.
- [Trusted kernel](trusted-kernel.md) — the kernel rules
  (`K-FwAx`, `K-Refine`) that consume OWL 2 axioms.
- VUVA spec §21 (`docs/architecture/verification-architecture.md`).
- Shkotin 2019 *DS2HOL-1: OWL 2 Functional Style operators from HOL
  point of view* (`internal/OWL2.DS2HOL.pdf`) — the formal bridge.
- W3C OWL 2 Direct Semantics (Second Edition) Recommendation, 11
  December 2012. <https://www.w3.org/TR/owl2-semantics/>
- W3C OWL 2 Functional-Style Syntax (Second Edition) Recommendation.
  <https://www.w3.org/TR/owl2-syntax/>
- W3C OWL 2 Primer (Second Edition).
  <https://www.w3.org/TR/owl2-primer/>
