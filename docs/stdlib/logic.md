---
sidebar_position: 6
title: logic
description: Modal logic (Kripke) and linear logic — the metatheory behind session types, capabilities, and affine modifiers.
---

# `core.logic` — Modal and linear logic

Term algebras for two logical systems used as Verum's metatheory:

- **Kripke modal logic** (`kripke.vr`) — worlds, accessibility,
  `□ / ◇` modalities. Used for reasoning about state-dependent
  properties and by the security/capability verifier.
- **Linear logic** (`linear.vr`) — multiplicative / additive /
  exponential connectives. Used for linearity analyses, session
  types, and affine / linear modifiers.

Most user code never imports this module directly. The modules exist
so the *specifications* Verum's compiler relies on are themselves
expressed in Verum, provable by the compiler, and available to
proof-heavy user code that wants to reason about these systems.

| File        | What's in it                                                        |
|-------------|---------------------------------------------------------------------|
| `kripke.vr` | `World`, `Edge`, `KripkeFrame`, `ModalForm`, `WorldFact`, `Valuation`, `evaluate` |
| `linear.vr` | `LinForm` + smart constructors + dualities + predicates             |

---

## Kripke semantics — `kripke.vr`

### Frames

```verum
public type World       is { id: Text };
public type Edge        is { from: World, to: World };
public type KripkeFrame is { worlds: List<World>, edges: List<Edge> };

// Smart constructors
public fn world(id: Text) -> World;
public fn edge(from: World, to: World) -> Edge;
public fn frame(worlds: List<World>, edges: List<Edge>) -> KripkeFrame;
public fn accessible(f: KripkeFrame, w: World) -> List<World>;
```

A **Kripke frame** is a set of worlds plus a binary accessibility
relation. Modal formulas are evaluated **at a world**.

### Valuations

```verum
public type WorldFact  is { world_id: Text, atom: Text, truth: Bool };
public type Valuation  is { facts: List<WorldFact> };

public fn valuation(facts: List<WorldFact>) -> Valuation;
public fn lookup(v: Valuation, w: World, atom: Text) -> Bool;
```

A `Valuation` is a flat list of `(world, atom, truth)` facts; a
`lookup` defaults to `false` for atoms with no entry.

### Formulas

```verum
public type ModalForm is
    | True
    | False
    | Atom    { name: Text }                               // propositional atom p
    | Not     { inner: Heap<ModalForm> }                   // ¬φ
    | And     { left: Heap<ModalForm>, right: Heap<ModalForm> }
    | Or      { left: Heap<ModalForm>, right: Heap<ModalForm> }
    | Implies { left: Heap<ModalForm>, right: Heap<ModalForm> }
    | Box     { inner: Heap<ModalForm> }                   // □φ — necessarily
    | Diamond { inner: Heap<ModalForm> };                  // ◇φ — possibly

// Smart constructors — wrap children in Heap<ModalForm>
public fn modal_atom(name: Text) -> ModalForm;
public fn modal_not(inner: ModalForm) -> ModalForm;
public fn modal_and(a: ModalForm, b: ModalForm) -> ModalForm;
public fn modal_or(a: ModalForm, b: ModalForm) -> ModalForm;
public fn modal_implies(a: ModalForm, b: ModalForm) -> ModalForm;
public fn modal_box(inner: ModalForm) -> ModalForm;
public fn modal_diamond(inner: ModalForm) -> ModalForm;
```

### Evaluation

```verum
public fn evaluate(
    formula: ModalForm,
    f:       KripkeFrame,
    v:       Valuation,
    w:       World,
) -> Bool;
```

- `□φ` is true at `w` iff φ is true at **every** world reachable from
  `w`.
- `◇φ` is true at `w` iff φ is true at **some** world reachable from
  `w`.

### Frame classes

| Class | Axiom          | Accessibility constraint                |
|-------|----------------|------------------------------------------|
| K     | (none)         | No constraint — base modal logic.       |
| T     | □p → p         | Reflexive — every world sees itself.    |
| B     | p → □◇p        | Symmetric.                              |
| 4     | □p → □□p       | Transitive. S4 = T + 4.                 |
| 5     | ◇p → □◇p       | Euclidean.                              |
| S5    | (T + B + 4)    | Equivalence relation — universal.       |

Verum's capability verifier uses **S4** for reasoning about
monotonically-growing evidence.

### Example

```verum
// Frame with two worlds and w0 → w1.
let f: KripkeFrame = frame(
    list![world("w0".into()), world("w1".into())],
    list![edge(world("w0".into()), world("w1".into()))],
);

// Valuation: "p" holds at w1.
let v: Valuation = valuation(list![
    WorldFact { world_id: "w1".into(), atom: "p".into(), truth: true },
]);

// □p holds at w0 (every world reachable from w0 satisfies p):
assert(evaluate(modal_box(modal_atom("p".into())), f, v, world("w0".into())));

// But p itself does NOT hold at w0:
assert(!evaluate(modal_atom("p".into()), f, v, world("w0".into())));
```

---

## Linear logic — `linear.vr`

### Connectives

```verum
type LinForm is
    | Atom     { name: Text }                                          // propositional atom
    | MTensor  { left: Heap<LinForm>, right: Heap<LinForm> }           // A ⊗ B   — multiplicative conjunction ("MTensor" to avoid collision with `math.tensor.Tensor`)
    | Par      { left: Heap<LinForm>, right: Heap<LinForm> }           // A ⅋ B   — multiplicative disjunction
    | With     { left: Heap<LinForm>, right: Heap<LinForm> }           // A & B   — additive conjunction ("choose one")
    | Plus     { left: Heap<LinForm>, right: Heap<LinForm> }           // A ⊕ B   — additive disjunction ("one of")
    | OfCourse { inner: Heap<LinForm> }                                // !A      — exponential (reusable)
    | WhyNot   { inner: Heap<LinForm> }                                // ?A      — exponential dual
    | One                                                               // 1       — multiplicative unit
    | Bottom                                                            // ⊥       — ⅋ unit
    | Top                                                               // ⊤       — & unit
    | Zero                                                              // 0       — ⊕ unit
    | Dual     { inner: Heap<LinForm> };                               // A^⊥     — involutive negation
```

---

## Smart constructors

```verum
lin_atom(name: Text) -> LinForm

lin_tensor(a: LinForm, b: LinForm) -> LinForm
lin_par(a: LinForm, b: LinForm) -> LinForm
lin_with(a: LinForm, b: LinForm) -> LinForm
lin_plus(a: LinForm, b: LinForm) -> LinForm

lin_of_course(a: LinForm) -> LinForm
lin_why_not(a: LinForm) -> LinForm

lin_dual(a: LinForm) -> LinForm

// Derived connective
lin_lolli(a: LinForm, b: LinForm) -> LinForm
    // A ⊸ B := A^⊥ ⅋ B  (linear implication)
```

---

## Predicates

```verum
public fn is_unrestricted(f: LinForm) -> Bool;
    // true iff f is of the form !A — can be duplicated freely

public fn is_weakenable(f: LinForm) -> Bool;
    // true iff f is of the form !A — can be discarded freely
```

A proposition is **linear** by default (must be used exactly once).
The `!` / `?` modalities relax this:
- `!A` is always reusable and discardable.
- `?A` is the dual — the "promise" side.

---

## De Morgan dualities

Linear logic has perfect duality via `(·)^⊥`:

```
(A ⊗ B)^⊥  =  A^⊥ ⅋ B^⊥
(A ⅋ B)^⊥  =  A^⊥ ⊗ B^⊥
(A & B)^⊥  =  A^⊥ ⊕ B^⊥
(A ⊕ B)^⊥  =  A^⊥ & B^⊥
(!A)^⊥     =  ?(A^⊥)
(?A)^⊥     =  !(A^⊥)
1^⊥        =  ⊥
⊥^⊥        =  1
⊤^⊥        =  0
0^⊥        =  ⊤
A^⊥⊥       =  A
```

## NNF normaliser + structural utilities

```verum
public fn lin_to_nnf(f: LinForm) -> LinForm;
public fn lin_is_nnf(f: LinForm) -> Bool;
public fn lin_eq(a: LinForm, b: LinForm) -> Bool;
public fn lin_size(f: LinForm) -> Int;
public fn lin_atom_count(f: LinForm) -> Int;
```

- `lin_to_nnf` rewrites every formula to **negation-normal form** —
  every `Dual` constructor wraps an `Atom` only; every other
  connective appears with positive (non-dualised) arguments. The
  function applies the de Morgan / involutivity rewrites above.
  Idempotent: `lin_to_nnf(lin_to_nnf(g))` ≡ `lin_to_nnf(g)`.
- `lin_is_nnf` is the postcondition predicate.
- `lin_eq` is **structural** equality on the constructor tree
  (LinForm has no binders). For semantic equivalence, normalise
  both sides with `lin_to_nnf` first.
- `lin_size` counts non-leaf connectives (each binary connective
  contributes 1; each unary modality contributes 1; atoms /
  units contribute 0). Use as a termination metric for proof
  search.
- `lin_atom_count` — number of `Atom` leaves.

```verum
let f = lin_dual(lin_tensor(lin_atom("A"), lin_atom("B")));
let g = lin_to_nnf(f);
// g ≡ lin_par(lin_dual(lin_atom("A")), lin_dual(lin_atom("B")))
assert(lin_is_nnf(g));
```

## Frame validity + axiom-correspondence predicates (Kripke)

```verum
public fn valid_in_frame(
    f: KripkeFrame, v: Valuation, formula: ModalForm
) -> Bool;
public fn semantically_equivalent(
    f: KripkeFrame, v: Valuation, a: ModalForm, b: ModalForm
) -> Bool;

public fn is_serial(f: KripkeFrame) -> Bool;       // axiom D
public fn is_reflexive(f: KripkeFrame) -> Bool;    // axiom T
public fn is_transitive(f: KripkeFrame) -> Bool;   // axiom 4
public fn is_symmetric(f: KripkeFrame) -> Bool;    // axiom B
public fn is_euclidean(f: KripkeFrame) -> Bool;    // axiom 5
public fn is_s5(f: KripkeFrame) -> Bool;           // T + 4 + B
```

`valid_in_frame` lifts the per-world `evaluate` to a frame-level
"holds at every world" judgement. The five frame-property
predicates correspond to the modal axioms in the table above —
checking `is_reflexive(f) && is_transitive(f) && is_symmetric(f)`
is the bridge from `evaluate` to "this frame is an S5 model".

---

## Connection to Verum's type system

- **Affine types** (`type affine T is …`) correspond to propositions
  without `!`/`?` modalities but with weakening (can be discarded).
- **Linear types** (`type linear T is …`) correspond to strict linear
  propositions (exactly once).
- **Session types** are encoded as linear-logic propositions — `Send`
  becomes `!`, `Recv` becomes `?`, `Offer` becomes `&`, `Select`
  becomes `⊕`.
- **Context capabilities** (`Database with [Read]`) use the subset
  ordering that linear logic's `&` induces.

---

## Example

```verum
// A resource that can be either read or written, but only once.
let read_or_write = lin_with(
    lin_atom("ReadDB"),
    lin_atom("WriteDB"),
);

// Equivalent to Verum's:
//   Database with [Read] & Database with [Write]

// Its dual:
let req = lin_dual(read_or_write);
// = ReadDB^⊥ ⊕ WriteDB^⊥  — "promise to honour either a read or a write request"
```

---

## See also

- **[concurrency → session types](/docs/stdlib/concurrency#session-types--sessionvr)** — the linear-logic reading of channel protocols.
- **[Language → types → affine](/docs/language/types#affine-types)** — the user-level `affine` / `linear` modifiers.
