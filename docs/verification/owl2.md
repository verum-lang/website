---
sidebar_position: 21
title: OWL 2 Integration
---

# OWL 2 — Direct Semantics + Functional Style Syntax

> Verum ships OWL 2 Direct Semantics as a first-class framework
> axiom package. The OWL 2 DL surface that Protégé / HermiT /
> Pellet / FaCT++ / ELK / Konclude expose is a Verum stdlib
> citizen — every operator from the W3C OWL 2 Functional Style
> recommendation lives as a named
> `@framework(owl2_fs, "Shkotin 2019. ...")` axiom that
> `verum audit --framework-axioms --by-lineage owl2_fs`
> enumerates.

This page is the comprehensive surface for the OWL 2 stack. It
pairs the [framework-axiom system](framework-axioms.md) (which
provides the trusted-boundary discipline) with the
[MSFS coordinate projection](msfs-coord.md) (which positions
OWL 2 at `ν=1, τ=intensional` in the Diakrisis lattice).

---

## 1. Why OWL 2 in Verum?

OWL 2 is the W3C standard for ontology engineering — the formal
backbone of SNOMED-CT (medicine), the Gene Ontology (biology),
DBpedia (encyclopaedia knowledge), SUMO / Cyc (general-purpose
common-sense reasoning), DOLCE / BFO (philosophy of being), and
FIBO (financial regulation). Every mainstream knowledge graph is
either OWL 2 native or has an OWL 2 export.

Importing an OWL 2 corpus into a typed verifier without Verum
forces a choice between *a hand-rolled translation* (lossy) and
*a black-box DL reasoner with no formal connection to the typed
core* (unverifiable). Verum's stack closes both gaps:

- **Faithful translation** — every W3C OWL 2 DS derivation is a
  Verum derivation, by direct line-by-line encoding of
  [Shkotin 2019 (DS2HOL)](https://github.com/ashkotin/ds2hol)
  Tables 1–10.
- **Trusted boundary** — the OWL 2 dependency footprint of any
  corpus is enumerated by
  `verum audit --framework-axioms --by-lineage owl2_fs`, just
  as for any other Verum framework.
- **MSFS coordinate** — OWL 2 theorems land at
  `(owl2_fs, ν=1, τ=intensional)` in the Diakrisis lattice;
  cross-framework composition (e.g. medical SNOMED-CT
  subsumption proofs invoking Lurie HTT ∞-categorical
  infrastructure) is one `core.theory_interop.translate` call
  away.

Two complementary correspondence claims hold simultaneously:

| Claim | Direction | How it is established |
|---|---|---|
| **Faithful translation** | every OWL 2 DS derivation ⇒ Verum derivation | the Shkotin-literal encoding |
| **Morita-equivalence** | OWL 2 DS ↔ Verum-encoded OWL 2 *both* directions | unified Morita bridge pair `(owl2_to_htt, htt_to_owl2)` |

Faithful translation is what most consumers need — every OWL 2
fact proved in Verum is a fact in OWL 2. Morita-equivalence
elevates the claim to *"Verum's OWL 2 **is** OWL 2 up to
categorical equivalence"* through the unified Morita-pair
infrastructure in `core.theory_interop.bridges`: the forward
bridge (`owl2_to_htt.vr`) is paired with the inverse bridge
(`htt_to_owl2.vr`), 31 markers in each direction, registered as
`MORITA_PAIR_OWL2_HTT` and audited via the single generic
`bridge_round_trip_property` axiom every Morita pair shares.

---

## 2. Scope — Direct Semantics, not RDF-Based Semantics

W3C ships two OWL 2 semantics:

- **OWL 2 Direct Semantics (DS)** — the model-theoretic
  semantics every mainstream reasoner uses (HermiT, Pellet,
  FaCT++, ELK, Konclude). DS is a decidable fragment of SROIQ
  description logic with known complexity profiles per W3C
  profile (EL: P, QL: NL, RL: P, full DL: 2NEXPTIME).
- **OWL 2 RDF-Based Semantics (RBS)** — graph-based semantics
  over RDF triples. Undecidable; primarily used for SPARQL
  interop.

Verum targets **DS only**. Three reasons:

- DS gives decidability, matching Verum's verification ladder
  which expects predictable complexity per strategy.
- RBS triples don't map cleanly onto Verum's typed refinement
  structure without a graph-modelling layer that would
  duplicate `core.collections.Map<Text, Set<Text>>`.
- Shkotin 2019 — the formal bridge Verum imports — formalises
  DS only; RBS has no equivalent in-kernel formalisation.

A consumer that needs RBS (e.g. SPARQL interop) would layer a
separate `core.math.frameworks.owl2_rbs` package on top of DS;
the encoding here does not preclude that, it just keeps the two
semantics behind distinct module entry points.

---

## 3. Three-layer architecture

OWL 2 integration decomposes into three clean layers, each
mapping onto an existing Verum architectural slot. OWL 2 is
**lifted into existing surfaces** rather than introducing new
infrastructure.

| Layer | Module | Role |
|---|---|---|
| **L1 — Semantic framework** | `core.math.frameworks.owl2_fs` | 64 trusted `@framework(owl2_fs, ...)` axioms covering Shkotin Tables 1–10, plus the `count_o` quantifier-of-quantity primitive |
| **L2 — Vocabulary attributes** | seven typed `Owl2*Attr` attributes | preserve OWL 2 vocabulary at the source for byte-identical round-trip with external reasoners |
| **L3 — Verification obligations** | `@theorem` + `@verify(...)` ladder | subsumption, classification, consistency dispatched per the canonical routing table |

### 3.1 Layer 1 — semantic framework package

`core.math.frameworks.owl2_fs` ships every operator of the W3C
OWL 2 FS recommendation as a named axiom:

| Sub-module | Shkotin §X.Y / Table | Operators |
|---|---|---|
| `types` | §Notation | Individual (sort `o`), Literal (sort `d`), `count_o` axiom (1) |
| `count` | §21.5 | `count_o` function + `E_OWL2_UNBOUNDED_COUNT` diagnostic |
| `object_property` | §2.2.1 Table 1 | `ObjectInverseOf` (1) |
| `data_range` | §2.2.2 Table 3 | `DataIntersectionOf`, `DataUnionOf`, `DataComplementOf`, `DataOneOf`, `DatatypeRestriction` (5) |
| `class_expr` | §2.2.3 Table 4 | `ObjectIntersectionOf`, `ObjectUnionOf`, `ObjectComplementOf`, `ObjectOneOf`; 8 object-property restrictions; 8 data-property restrictions; 4 negative range constraints (24) |
| `class_axiom` | §2.3.1 Table 5 | `SubClassOf`, `EquivalentClasses`, `DisjointClasses`, `DisjointUnion` (4) |
| `object_property_axiom` | §2.3.2 Table 6 | hierarchy + chain (3) + equivalence/disjointness (2) + domain/range (2) + 7 characteristic flags = 14 |
| `data_property_axiom` | §2.3.3 Table 7 | Sub / Equivalent / Disjoint / Domain / Range / Functional (6) |
| `datatype_definition` | §2.3.4 Table 8 | `DatatypeDefinition` (1) |
| `key` | §2.3.5 Table 9 | `HasKey` with NAMED restriction (1) |
| `assertion` | §2.3.6 Table 10 | Same / Different + 4 ABox + 2 negative ABox (7) |

Each axiom is a **trusted-boundary marker**:

```verum
@framework(owl2_fs, "Shkotin 2019. DS2HOL-1 §2.3.1 Table 5: SubClassOf")
public axiom SubClassOf() -> Bool ensures true;
```

The axiom body is a citation discipline: `verum audit
--framework-axioms --by-lineage owl2_fs` enumerates the OWL 2
footprint of any corpus, grouped by Shkotin-table provenance.
The audit chronicle records exactly which OWL 2 operators a
corpus depends on — there is no hidden dependence.

### 3.2 Layer 2 — typed attribute family (`Owl2*Attr`)

Seven typed attributes preserve OWL 2 vocabulary at the source
so `verum export --to owl2-fs` round-trips cleanly to Protégé /
HermiT / Pellet:

```verum
@owl2_class
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
| `@owl2_class` | Mark a type as an OWL 2 Class (OWA per W3C §5.6 — no semantics arg admitted) | any argument is rejected |
| `@owl2_subclass_of(C)` | Subclass relation | wrong arg count |
| `@owl2_disjoint_with([...])` / `@owl2_disjoint_with(...)` | Disjointness | empty list |
| `@owl2_characteristic(F)` | One of seven flags | unknown flag (e.g. `Idempotent`) |
| `@owl2_property(domain, range, …)` | Object/data property | missing domain or range; unknown named-arg key |
| `@owl2_equivalent_class(C)` | Equivalence | wrong arg count |
| `@owl2_has_key(p, …)` | Key constraint (NAMED) | empty list |

Every attribute parser **rejects** typos rather than silently
discarding them — `@owl2_property(domian = Person, ...)` (typo
on `domain`) returns `Maybe::None` from the attribute parser.
The elaboration pass surfaces the `None` as a parse-time
diagnostic. This is non-negotiable: silent acceptance of a typo
would let a faulty ontology compile.

### 3.3 Layer 3 — verification obligations

The `@verify` ladder maps OWL 2 reasoning tasks to the
appropriate strategy:

| OWL 2 task | Strategy | ν-ordinal | Rationale |
|---|---|---|---|
| Consistency of an ontology | `@verify(formal)` | ω | SMT satisfiability on the joint refinement |
| Classification (EL/QL/RL) | `@verify(fast)` | 2 | Polynomial-time profile; bounded SMT timeout |
| Classification (full DL) | `@verify(thorough)` | ω·2 | 2NEXPTIME; portfolio dispatch |
| Subsumption `C ⊑ D` | `@verify(formal)` | ω | Closed-goal SMT obligation |
| Instance check `a : C` | `@verify(fast)` runtime / `@verify(formal)` compile | varies | Ordinary refinement check |
| HasKey with NAMED restriction | `@verify(proof)` | ω + 1 | DL-reasoner case per Shkotin §2.3.5 |
| Ontology alignment | `@verify(reliable)` | ω·2 + 1 | multi-backend agreement required |
| Federation coherence (Noesis) | `@verify(certified)` | ω·2 + 2 | certificate materialisation + export |

This commits dispatch semantics so user code has a fixed target.

---

## 4. Open World Assumption — the only semantics

OWL 2 Direct Semantics is **open-world** by definition (W3C OWL
2 Direct Semantics §5.6): an interpretation `I` is a model iff
it satisfies every stated axiom; it is *not* required to
enforce completeness about facts not stated.

The `owl2_fs` framework is **OWA-only**:

- `@owl2_class` admits **no** `semantics` argument. The
  attribute carries only the marker; any `semantics = ...`
  argument is a parse error.
- `@owl2_property` likewise carries no semantics flag.
- The audit JSON (`verum audit --owl2-classify --format json`)
  emits **no** per-class `"semantics"` field.

### 4.1 Where closed-world reasoning lives instead

Closed-world reasoning over a finite, named domain is a normal
Verum capability — but it lives at the **refinement-type /
value** layer, not at the OWL 2 attribute layer:

- **Refinement type with finite witness.** A user can declare
  `type FinitePerson is List<Person> { is_canonical_universe(self) }`
  and route OWA queries through that type's refinement. The
  closure is explicit, witnessed, and audit-checkable.
- **`count_o` + `assert_finite_domain`.** The
  `core.math.frameworks.owl2_fs.count` module carries an
  explicit finite-domain witness (`List<Individual>`) for each
  cardinality query. The HOL comprehension `|{y : I | P(y)}|`
  is well-defined iff the witness is supplied; an absent
  witness raises `E_OWL2_UNBOUNDED_COUNT` rather than silently
  closing the world.

Both surfaces preserve the OWL 2 OWA stance at the attribute
layer while admitting closed-domain reasoning where the user
explicitly claims a finite universe.

### 4.2 Why this stance is load-bearing

Three independent reasons together pin the OWA-only stance:

1. **Spec compliance.** A `@verify(certified)` claim requires
   the theorem's interpretation to match the cited semantic
   frame. Any CWA default would break this: a Verum-side proof
   of `subClassOf(C, D)` admitted under CWA does not transfer
   to a Pellet/HermiT verdict, because Pellet/HermiT run OWA.
   Round-trip identity fails.
2. **Soundness chronicle.** `verum audit --owl2-classify`
   reports inferences. CWA-default rendering would label
   inferences as correct that are not transferable to any
   external OWL 2 reasoner — a mechanical lie surfaced through
   the audit chronicle.
3. **Architectural separation.** A per-attribute semantics
   flag would compete with Verum's existing refinement-type
   machinery for the same closed-domain reasoning. Keeping
   them separate aligns the layer with its single role: a
   faithful OWL 2 DS frontend.

---

## 5. The `count_o` quantifier-of-quantity

Shkotin 2019 introduces a quantifier of quantity `#y:o P(y)` —
the number of OWL 2 Individuals satisfying P. Verum ships it
at `core.math.frameworks.owl2_fs.count`:

```verum
public fn count_o<I: Individual>(
    domain: List<I>,
    pred:   fn(I) -> Bool,
) -> Int;
```

The framework chooses constructive correctness (user supplies
the closed domain) over black-box decidability:

```verum
let people: List<Person> = [alice, bob, carol, dave];
let proven_count: Int = count_o(people, |p| has_passed_exam(p));
// proven_count is total — domain is finite by construction.
```

For unbounded queries (no explicit domain witness) the
companion `count_o_unbounded` returns `Maybe<Int>`:

```verum
match count_o_unbounded(maybe_domain, pred) {
    Some(n) => print(f"count = {n}"),
    None    => panic(E_OWL2_UNBOUNDED_COUNT),
}
```

The `Maybe.None` branch can be promoted automatically: when a
`count_o_unbounded` call appears inside a refinement type
carrying an explicit cardinality bound, the verifier
dispatches to Finite Model Finding instead of returning
`Maybe.None`.

### 5.1 Finite-Model-Finding dispatch — `count_o_dispatch`

When `count_o_unbounded` is called with `Maybe.None` *inside a
refinement type carrying an explicit cardinality bound* — the
canonical shape is `{ x : Int | x ≤ K ∧ x = count_o(_, P) }` —
the verifier dispatches to Finite Model Finding via a focused
dispatcher in the SMT layer.

The dispatcher constructs a `CountOQuery` carrying:

| Field | Meaning |
|---|---|
| `individual_sort` | uninterpreted-sort name (typically `Individual`) |
| `predicate_body` | SMT-LIB body of the predicate `pred(y)` |
| `predicate_var` | parameter variable name (typically `y`) |
| `bound` | cardinality bound — one of `LessEq` / `Equal` / `GreaterEq` / `Range` |
| `timeout_ms` | solver timeout |

It translates the query to a Finite-Model-Finding query over
an uninterpreted `Individual` sort with cardinality ≤ K:

```smtlib
(declare-sort Individual 0)
(declare-fun pred_o (Individual) Bool)
(assert (forall ((y Individual)) (= (pred_o y) <predicate_body>)))
```

The SMT backend enumerates satisfying interpretations; the
dispatcher extracts the count from the model's `pred_o`
definition (counts `(= y @Individual_<n>)` disjuncts; handles
`true` / `false` shorthand; clamps at the discovered domain
size).

The result classifies into four orthogonal outcomes:

| Outcome | Meaning |
|---------|---------|
| `Decided { count, model_smtlib, elapsed_ms }` | A finite interpretation was found; `count` is load-bearing. |
| `BoundExceeded { bound, elapsed_ms }` | No model satisfies the cardinality bound — the refinement type's claim is structurally false; promoted to a hard error. |
| `Unsupported { reason }` | The FMF backend is not available, or the predicate is outside FMF's encoding. The caller falls back to the `Maybe.None` semantics. |
| `Timeout { elapsed_ms }` | The FMF call exhausted its time budget. |

Capability-router integration: a flag on the goal's
characteristics signals "finite model finding required",
routing the query to a backend whose capability profile covers
FMF. The dispatcher reuses every existing piece of the SMT
infrastructure — the FMF query type and `find_finite_model`
for the actual solver call, the standard "backend not linked"
error for the stub-mode fallback, the existing capability
router for routing.

### 5.2 Recognizer + verifier pre-pass

The dispatcher is wired into the refinement-type verifier
through a pure AST-walking recognizer. Every refinement
predicate flowing through the verifier is first inspected for
the canonical conjunctive shape (a cardinality comparison on
the refinement variable + a `count_o_unbounded(_, |y| pred(y))`
call). When matched, the recognizer translates the closure
body through the existing expression-to-SMT-LIB translator and
constructs a `CountOQuery`; the dispatcher's verdict maps onto
the verification result:

| Recognizer / dispatcher outcome | `verify_refinement` action |
|---|---|
| Pattern matches → `Decided { count, … }` | Returns `Ok(ProofResult)` with `count_o_fmf: count=N` proof note. |
| Pattern matches → `BoundExceeded` | Returns `Err(SolverError("count_o_fmf: bound K cannot be satisfied — no finite model exists"))`. |
| Pattern matches → `Unsupported` / `Timeout` | Falls through to the standard SMT path (purely additive — never blocks the existing flow). |
| Pattern does not match | Falls through to the standard SMT path. |

`@verify(runtime)` skips the pre-pass entirely (preserving the
"no SMT, runtime checks only" semantics).

The recognizer's pattern matrix supports:

- Bound clauses on the refinement variable in any of the
  comparison shapes `it ≤ K`, `it < K`, `it ≥ K`, `it > K`,
  `it = K`. `Lt` / `Gt` bounds normalise to `LessEq(K-1)` /
  `GreaterEq(K+1)`.
- Either argument order: `it ≤ K` and `K ≥ it` are both
  recognised.
- Both unqualified (`count_o_unbounded(...)` after `mount
  core.math.frameworks.owl2_fs.count`) and fully-qualified
  (`core.math.frameworks.owl2_fs.count.count_o_unbounded(...)`)
  call paths.
- Nested conjunctions — `(it ≤ K ∧ B) ∧ count_call`.

Rejections are classified for telemetry: `NotCountOPredicate`
(no `count_o_unbounded` call), `NoBoundClause` (no comparison
binding the refinement variable), `UnsupportedClosure` (the
second arg is not a single-identifier closure), or
`UnsupportedPredicateBody` (the body cannot be translated to
SMT-LIB).

The cardinality bound is a Verum refinement-type-level claim,
distinct from any OWL-level CWA flag (which the framework does
not admit per [§4](#4-open-world-assumption--the-only-semantics)).
OWL 2 Direct Semantics remains open-world.

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

// A subsumption check.
@verify(formal)
@theorem
public fn person_is_animal(p: Person) -> (p is Animal)
    proof by simp[SubClassOf, owl2_subclass_chain];
```

The compiler:

1. Installs each `@framework(owl2_fs, ...)` axiom referenced
   by the typed attributes.
2. Emits subsumption / disjointness / characteristic-flag
   obligations per the verification ladder.
3. Routes each obligation to the appropriate SMT backend.
4. Records the framework-axiom set in the build receipt for
   `verum audit --framework-axioms` and `verum audit --coord`.

---

## 7. Graph audit semantics — `verum audit --owl2-classify`

`verum audit --owl2-classify` is a **graph-aware** audit, not
a flat marker enumeration. It walks every `Owl2*Attr` in the
project, constructs the canonical OWL 2 classification graph,
runs four graph-theoretic algorithms on it, and exits with a
non-zero status on any DL-unsatisfiability condition.

The graph type is the canonical `Owl2Graph` — a single source
of truth shared with the OWL 2 Functional-Syntax exporter
([§8](#8-owl-2-functional-syntax-export--verum-export---to-owl2-fs)).
Both consumers parse the project once and read the same
canonical graph.

### 7.1 Graph construction

`Owl2Graph` is a flat record of three components:

| Field | Carries |
|---|---|
| `entities` | `Map<Text, Owl2Entity>` — every declared class / property |
| `subclass_edges` | `Set<(Text, Text)>` — direct subclass relations |
| `equivalence_pairs` | `Set<(Text, Text)>` — symmetrised equivalence pairs |
| `disjoint_pairs` | `Set<(Text, Text)>` — symmetrised disjointness pairs |

Equivalence pairs and disjoint pairs are stored
**symmetrised**: when the user writes
`@owl2_disjoint_with([Pizza, IceCream])` on `Salad`, the graph
stores both `(Salad, Pizza)` and `(Pizza, Salad)`. This keeps
the closure walkers orientation-blind.

Each entity is either a Class or a Property. Multi-attribute
merging is built in: when a single declaration carries
`@owl2_class` *and* `@owl2_subclass_of` *and*
`@owl2_disjoint_with` *and* `@owl2_has_key`, all four feed
into the same `Owl2Entity` record without overwriting earlier
metadata. Property attributes similarly merge characteristic
flags from a flag-only `@owl2_characteristic` block into a
richer `@owl2_property` block on the same `fn`.

### 7.2 Subclass closure

`subclass_closure()` computes the **reflexive-transitive**
ancestor set of every class via iterative fixed-point — the
lattice of possible ancestor sets is finite (bounded above by
the entity count squared), so termination is guaranteed.

Each pass propagates one level deeper; the fixed-point is
reached after at most `depth(graph)` iterations. For the
canonical Pizza ontology (~200 classes, depth ~5) the closure
converges in microseconds.

### 7.3 Cycle detection

Any class C with `C ⊑* C` (transitively) is unsatisfiable in
DL. `detect_cycles` walks subclass edges and flags both halves
of every cycle:

- Direct self-loops (`@owl2_subclass_of(self)`) are detected
  via simple equality on the edge endpoints.
- Transitive cycles are detected via the closure: if `parent`
  is in the ancestor closure of `child` and `child` is in
  `parent`'s, both are added to the cyclic set.

Both `child` and `parent` are added when a transitive cycle is
detected, so the user sees the full ring rather than just one
edge. Ring length is implicit in the closure — every member of
the cycle gets the same closure set.

### 7.4 Equivalence partition

OWL 2 equivalences are pairwise; the canonical mathematical
object is the *equivalence-class partition*.
`equivalence_partition` computes it via union-find:

1. Initialise `parent[c] = c` for every class mentioned in an
   equivalence pair.
2. For each `(a, b)` in `equivalence_pairs`, union the two
   roots.
3. Group by final root; emit groups of size ≥ 2.

The output is `List<Set<Text>>` — each set is one equivalence
class. The downstream OWL 2 FS exporter uses this projection
to emit exactly one `EquivalentClasses(...)` axiom per
partition, rather than one redundant pairwise edge per
declaration.

### 7.5 Disjoint/subclass conflict detection

The canonical DL inconsistency: a class C declared *disjoint
from* D AND C is also a *subclass of* D (directly or
transitively). Such an ontology has no model.

`detect_disjoint_violations` returns every offending pair —
disjoint-with-self and subclass-conflict shapes both surface.
Both directions are checked (disjointness is symmetric); each
violation surfaces exactly once.

### 7.6 Inconsistency policy

`audit --owl2-classify` propagates cycles and disjoint
violations as **non-zero exit code**. The CLI is strict: any
inconsistency fails the build. CI dashboards consuming the
JSON output see the same `cycles[]` and
`disjoint_violations[]` arrays so dashboards can fail PRs that
introduce ontology defects without re-running the audit
themselves.

---

## 8. OWL 2 Functional-Syntax export — `verum export --to owl2-fs`

`verum export --to owl2-fs` walks the same `Owl2Graph` shared
with the audit ([§7](#7-graph-audit-semantics--verum-audit---owl2-classify))
and emits a Pellet / HermiT / Protégé / FaCT++ / ELK /
Konclude-compatible `.ofn` file per the W3C OWL 2
Functional-Style Syntax Recommendation (Second Edition,
11 December 2012).

### 8.1 Output structure

```text
# Exported by `verum export --to owl2-fs`.
# OWL 2 Functional-Style Syntax — round-trips through Pellet, HermiT,
# Protégé, FaCT++, ELK, Konclude. Sorted output for byte-deterministic
# CI diffs.

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

Every collection that contributes to the body is sorted
alphabetically. The same project produces the same bytes
across runs, file systems, and platforms — making the export a
CI-friendly artefact.
`verum export --to owl2-fs > old.ofn ; … edit … ;
verum export --to owl2-fs > new.ofn ; diff old.ofn new.ofn`
produces a minimal diff highlighting exactly the user's
change.

The de-symmetrisation step in `DisjointClasses` emission
deserves a note: the graph stores both `(Pizza, IceCream)` and
`(IceCream, Pizza)` symmetrised; the exporter keeps only the
lex-min ordering (`(IceCream, Pizza)` since
`IceCream < Pizza`) so the output has exactly one
`DisjointClasses(...)` axiom per declared pair, not two.

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

Characteristic flags map directly to their canonical W3C
axiom names: `Symmetric` → `SymmetricObjectProperty`,
`Transitive` → `TransitiveObjectProperty`, `Functional` →
`FunctionalObjectProperty`, etc. (seven total per Shkotin
Table 6).

### 8.4 Round-trip with external tools

The pair `verum export --to owl2-fs` /
`verum import --from owl2-fs` round-trips through every
mainstream OWL 2 reasoner. The contract for round-trip
identity: a Pellet-compatible `foaf.owl` consumed via
`verum import` and re-exported via `verum export` produces
byte-identical output to the input. The
`verum audit --round-trip --by-lineage owl2_fs` gate enforces
this property at audit time.

---

## 9. CLI workflow

```bash
verum audit --framework-axioms --by-lineage owl2_fs   # OWL 2 footprint
verum audit --coord                                    # MSFS coord projection
verum audit --owl2-classify                            # graph-aware classification (§7)
verum audit --hygiene                                  # articulation hygiene
verum audit --epsilon                                  # Actic ε-distribution (incl. ε_classify)
verum check --hygiene                                  # kernel-level hygiene
verum verify --strategy formal                         # subsumption / classification
verum export --to owl2-fs                              # OWL 2 FS emitter (§8)
verum import --from owl2-fs                            # OWL 2 FS importer
```

`verum audit --epsilon` recognises `ε_classify` as the eighth
Actic primitive — a function decorated
`@enact(epsilon: "ε_classify")` is classified as
ontology-classification work and surfaces in its own bucket of
the ε-distribution. See
[OC/DC dual stdlib](actic-dual.md#2-the-eight-ε-primitives)
for the full primitive table.

`verum audit --coord` projects every owl2_fs theorem to its
MSFS coordinate `(owl2_fs, ν=1, τ=intensional)` — the SROIQ
DL-decidable fragment. See [MSFS coordinate](msfs-coord.md)
for the full lattice arithmetic.

---

## 10. Cross-framework composition

A canonical bridge `owl2_fs → lurie_htt` carries OWL 2 facts
into the ∞-topos / categorical world via the
`@framework_translate` axiom family:

| OWL 2 operator | HTT image |
|---|---|
| Class | Presheaf on the discrete category of individuals (HTT 1.2.1) |
| ObjectProperty | Functor between class-presheaves |
| SubClassOf | Monomorphism in the presheaf topos |
| EquivalentClasses | Isomorphism |
| ObjectPropertyChain | Functor composition |
| HasKey | Representable-presheaf condition (HTT 5.1) |

The same bridge pattern extends to the rest of the standard
foundational six-pack (`baez_dolan`, `schreiber_dcct`,
`connes_reconstruction`, `petz_classification`) — each new
bridge contributes its `@framework_translate` axioms and an
OWL 2 corpus becomes interpretable in the target framework.

### Morita pairing — `MORITA_PAIR_OWL2_HTT`

The forward bridge `owl2_to_htt.vr` is paired with
`htt_to_owl2.vr` (31 markers in each direction). The pair is
registered as `MORITA_PAIR_OWL2_HTT` in
`core.theory_interop.bridges/mod.vr` and consumed by the
**single, unified** `bridge_round_trip_property` axiom that
backs every Morita pair Verum ships. There is no per-bridge
fidelity classifier or per-bridge round-trip module — the
canonical `TranslationVerdict` enum from
`core.theory_interop.coord` (`Morita | Strong | Moderate |
Weak | Untranslatable`) classifies every bridge pair
uniformly. Adding a new Morita pair is one entry in
`registered_morita_pairs()` plus the two directional
translation-marker files — no boilerplate.

---

## 11. Operational guarantees

The OWL 2 stack delivers the following observable contracts:

1. **Round-trip identity.** Pellet-compatible `foaf.owl` →
   `verum import` → `verum export` produces byte-identical
   output. Enforced by `verum audit --round-trip
   --by-lineage owl2_fs`.
2. **Reasoner agreement on standard corpora.** SNOMED-CT
   medical corpus classification produces the same class
   hierarchy as HermiT.
3. **Audit chronicle completeness.**
   `verum audit --framework-axioms --by-lineage owl2_fs`
   enumerates every used OWL 2 operator with Shkotin 2019
   table/row citation.
4. **Cross-framework non-interference.** A Verum corpus mixing
   `@framework(lurie_htt, …)` theorems with
   `@framework(owl2_fs, …)` ontologies compiles and verifies
   cleanly.
5. **Translation totality.**
   `core.theory_interop.translate(owl2_ontology, lurie_htt_target)`
   produces a well-typed result for the W3C OWL 2 Test Cases
   (Part 2).

---

## 12. Further reading

- [Framework axioms](framework-axioms.md) — the
  `@framework(name, citation)` system that produces the
  trusted boundary OWL 2 inhabits.
- [MSFS coordinate](msfs-coord.md) — the lattice projection
  that positions OWL 2 at `ν=1, τ=intensional`.
- [Articulation Hygiene](articulation-hygiene.md) — the
  surface hygiene that interacts with OWL 2 self-referential
  class expressions.
- [Trusted kernel](trusted-kernel.md) — the kernel rules
  (`K-FwAx`, `K-Refine`) that consume OWL 2 axioms.
- Shkotin 2019 *DS2HOL-1: OWL 2 Functional Style operators
  from HOL point of view* — the formal bridge between OWL 2
  Direct Semantics and Higher-Order Logic that this module's
  encoding follows.
- W3C OWL 2 Direct Semantics (Second Edition) Recommendation,
  11 December 2012. <https://www.w3.org/TR/owl2-semantics/>
- W3C OWL 2 Functional-Style Syntax (Second Edition)
  Recommendation. <https://www.w3.org/TR/owl2-syntax/>
- W3C OWL 2 Primer (Second Edition).
  <https://www.w3.org/TR/owl2-primer/>
