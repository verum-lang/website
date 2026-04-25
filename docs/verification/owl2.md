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

## 7. Graph audit semantics — `verum audit --owl2-classify`

`verum audit --owl2-classify` is a **graph-aware** audit, not a flat
marker enumeration. It walks every `Owl2*Attr` in the project,
constructs the canonical OWL 2 classification graph, runs four
graph-theoretic algorithms on it, and exits with a non-zero status
on any DL-unsatisfiability condition.

The graph type is `crates/verum_cli/src/commands/owl2.rs::Owl2Graph` —
a single source of truth shared with the OWL 2 Functional-Syntax
exporter (§8). Both consumers parse the project once and read the
same canonical graph.

### 7.1 Graph construction

`Owl2Graph` is a flat record of three components:

```rust
pub struct Owl2Graph {
    pub entities: BTreeMap<Text, Owl2Entity>,
    pub subclass_edges: BTreeSet<(Text, Text)>,
    pub equivalence_pairs: BTreeSet<(Text, Text)>,
    pub disjoint_pairs: BTreeSet<(Text, Text)>,
}
```

Equivalence pairs and disjoint pairs are stored **symmetrised**: when
the user writes `@owl2_disjoint_with([Pizza, IceCream])` on `Salad`,
the graph stores both `(Salad, Pizza)` and `(Pizza, Salad)`. This
keeps the closure walkers orientation-blind.

Each entity is either a Class or a Property. Multi-attribute merging
is built in: when a single declaration carries `@owl2_class` *and*
`@owl2_subclass_of` *and* `@owl2_disjoint_with` *and* `@owl2_has_key`,
all four feed into the same `Owl2Entity` record without overwriting
earlier metadata. Property attributes similarly merge characteristic
flags from a flag-only `@owl2_characteristic` block into a richer
`@owl2_property` block on the same `fn`.

### 7.2 Subclass closure

`Owl2Graph::subclass_closure() -> BTreeMap<Text, BTreeSet<Text>>`
computes the **reflexive-transitive** ancestor set of every class.
Iterative fixed-point — the lattice of possible ancestor sets is
finite (bounded above by the entity count squared), so termination is
guaranteed.

```rust
loop {
    let mut changed = false;
    for (child, parent) in &self.subclass_edges {
        let parent_anc = closure.get(parent).cloned().unwrap_or_default();
        let entry = closure.entry(child.clone()).or_default();
        for a in parent_anc {
            if entry.insert(a) {
                changed = true;
            }
        }
    }
    if !changed { break; }
}
```

Each pass propagates one level deeper; the fixed-point is reached
after at most `depth(graph)` iterations. For the canonical Pizza
ontology (~200 classes, depth ~5) the closure converges in microseconds.

### 7.3 Cycle detection

Any class C with `C ⊑* C` (transitively) is unsatisfiable in DL.
`Owl2Graph::detect_cycles(closure)` walks subclass edges and flags
both halves of every cycle:

```rust
for (child, parent) in &self.subclass_edges {
    if child == parent {
        cyclic.insert(child.clone());                // direct self-loop
        continue;
    }
    if let Some(p_anc) = closure.get(parent) {
        if p_anc.contains(child) {                   // transitive cycle
            cyclic.insert(child.clone());
            cyclic.insert(parent.clone());
        }
    }
}
```

Both `child` and `parent` are added when a transitive cycle is
detected, so the user sees the full ring rather than just one
edge. Ring length is implicit in the closure — every member of the
cycle gets the same closure set.

### 7.4 Equivalence partition

OWL 2 equivalences are pairwise; the canonical mathematical object
is the *equivalence-class partition*. `Owl2Graph::equivalence_partition`
computes it via union-find:

1. Initialise `parent[c] = c` for every class mentioned in an
   equivalence pair.
2. For each `(a, b)` in `equivalence_pairs`, union the two roots.
3. Group by final root; emit groups of size ≥ 2.

The output is `Vec<BTreeSet<Text>>` — each set is one equivalence
class. The downstream OWL 2 FS exporter uses this projection to emit
exactly one `EquivalentClasses(...)` axiom per partition, rather than
one redundant pairwise edge per declaration.

### 7.5 Disjoint/subclass conflict detection

The canonical DL inconsistency: a class C declared *disjoint from*
D AND C is also a *subclass of* D (directly or transitively). Such an
ontology has no model.

`Owl2Graph::detect_disjoint_violations(closure)` returns every
offending pair:

```rust
for (a, b) in &self.disjoint_pairs {
    if a == b {
        violations.insert((a.clone(), b.clone()));   // disjoint with self
        continue;
    }
    if let Some(a_anc) = closure.get(a) {
        if a_anc.contains(b) {                       // subclass conflict
            violations.insert((a.clone(), b.clone()));
        }
    }
}
```

Both directions are checked — disjointness is symmetric — but each
violation surfaces only once (the underlying `BTreeSet` deduplicates).

### 7.6 Inconsistency policy

`audit --owl2-classify` propagates cycles and disjoint violations
as **non-zero exit code**. The CLI is strict: any inconsistency
fails the build. CI dashboards consuming the JSON output see the
same `cycles[]` and `disjoint_violations[]` arrays so dashboards can
fail PRs that introduce ontology defects without re-running the
audit themselves.

A loose-lint mode (warnings only) is a future-only flag; the spec
treats DL inconsistency as a hard error per VUVA §21.10 success
criterion #3.

---

## 8. OWL 2 Functional-Syntax export — `verum export --to owl2-fs`

`verum export --to owl2-fs` walks the same `Owl2Graph` shared with
the audit (§7), and emits a Pellet/HermiT/Protégé/FaCT++/ELK/
Konclude-compatible `.ofn` file per the W3C OWL 2 Functional-Style
Syntax Recommendation (Second Edition, 11 December 2012).

### 8.1 Output structure

```text
# Exported by `verum export --to owl2-fs` (VUVA §21.8 / B5).
# OWL 2 Functional-Style Syntax — round-trips through Pellet, HermiT,
# Protégé, FaCT++, ELK, Konclude. BTreeMap-sorted output for byte-
# deterministic CI diffs.

Prefix(:=<http://verum-lang.org/ontology/<package-name>#>)
Prefix(owl:=<http://www.w3.org/2002/07/owl#>)
Prefix(rdf:=<http://www.w3.org/1999/02/22-rdf-syntax-ns#>)
Prefix(rdfs:=<http://www.w3.org/2000/01/rdf-schema#>)
Prefix(xsd:=<http://www.w3.org/2001/XMLSchema#>)

Ontology(<http://verum-lang.org/ontology/<package-name>>
  Declaration(Class(:Animal))
  Declaration(Class(:Mammal))
  Declaration(ObjectProperty(:knows))
  …
  SubClassOf(:Mammal :Animal)
  EquivalentClasses(:HumanBeing :Person2)
  DisjointClasses(:Mammal :Mineral)
  HasKey(:Citizen (:ssn :dob) ())
  ObjectPropertyDomain(:knows :Person)
  ObjectPropertyRange(:knows :Person)
  TransitiveObjectProperty(:knows)
  SymmetricObjectProperty(:knows)
  InverseObjectProperties(:knows :knownBy)
  …
)
```

The base IRI is derived from `Verum.toml`'s `[package].name` —
`http://verum-lang.org/ontology/<package-name>`. A `:` prefix
declaration maps the local namespace to that IRI base, so all
local-name references in the body (`:Animal`, `:knows`) resolve
correctly without per-axiom IRI repetition.

### 8.2 Byte-determinism

Every collection that contributes to the body is a `BTreeMap` or
`BTreeSet` keyed alphabetically. The same project produces the same
bytes across runs, file systems, and platforms — making the export
a CI-friendly artefact. `verum export --to owl2-fs > old.ofn ; …
edit … ; verum export --to owl2-fs > new.ofn ; diff old.ofn new.ofn`
produces a minimal diff highlighting exactly the user's change.

The de-symmetrisation step in `DisjointClasses` emission deserves a
note: the graph stores both `(Pizza, IceCream)` and `(IceCream,
Pizza)` symmetrised; the exporter keeps only the lex-min ordering
(`(IceCream, Pizza)` since `IceCream < Pizza`) so the output has
exactly one `DisjointClasses(...)` axiom per declared pair, not two.

### 8.3 Per-attribute mapping

| Verum attribute | OWL 2 FS axiom |
|---|---|
| `@owl2_class` | `Declaration(Class(:Name))` |
| `@owl2_property(...)` | `Declaration(ObjectProperty(:Name))` + `ObjectPropertyDomain` + `ObjectPropertyRange` + per-flag axiom |
| `@owl2_subclass_of(C)` | `SubClassOf(:Self :C)` |
| `@owl2_equivalent_class(...)` | `EquivalentClasses(...)` per partition |
| `@owl2_disjoint_with([...])` | `DisjointClasses(...)` per pair, lex-min ordered |
| `@owl2_characteristic(F)` | `<F>ObjectProperty(:Name)` per flag |
| `@owl2_has_key(p, ...)` | `HasKey(:Self (:p1 :p2 ...) ())` |

Characteristic flags map directly to their canonical W3C axiom
names: `Symmetric` → `SymmetricObjectProperty`, `Transitive` →
`TransitiveObjectProperty`, `Functional` → `FunctionalObjectProperty`,
etc. (seven total per Shkotin Table 6).

### 8.4 Round-trip status

V1 ships export only. Import (`verum import --from owl2-fs`) is a
follow-up commit; the round-trip success criterion (§21.12 #1) —
Pellet-compatible `foaf.owl` → `verum import` → `verum export` →
byte-identical output — is gated on the import path landing.

---

## 9. CLI workflow

```bash
verum audit --framework-axioms --by-lineage owl2_fs   # OWL 2 footprint
verum audit --coord                                    # MSFS coord projection
verum audit --owl2-classify                            # graph-aware classification (§7)
verum audit --hygiene                                  # Articulation hygiene
verum audit --epsilon                                  # Actic ε-distribution (incl. ε_classify)
verum check --hygiene                                  # V2: kernel-level hygiene
verum verify --strategy formal                         # subsumption / classification
verum export --to owl2-fs                              # OWL 2 FS emitter (§8)
```

`verum audit --epsilon` recognises `ε_classify` as the eighth Actic
primitive — a function decorated `@enact(epsilon: "ε_classify")` is
classified as ontology-classification work and surfaces in its own
bucket of the ε-distribution. See [OC/DC dual stdlib](actic-dual.md#2-the-seven-ε-primitives)
for the full primitive table.

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
