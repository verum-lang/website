---
sidebar_position: 6
title: logic
description: Modal logic (Kripke) and linear logic — the metatheory behind session types, capabilities, and affine modifiers.
---

# `core::logic` — Modal and linear logic

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
| `kripke.vr` | `World`, `Edge`, `KripkeFrame`, `ModalFormula`, `Valuation`, `evaluate` |
| `linear.vr` | `LinForm` + smart constructors + dualities + predicates             |

---

## Kripke semantics — `kripke.vr`

### Frames

```verum
public type World      is { id: Text };
public type Edge       is { from: World, to: World };
public type KripkeFrame is { worlds: List<World>, edges: List<Edge> };
```

A **Kripke frame** is a set of worlds plus a binary accessibility
relation. Modal formulas are evaluated **at a world**.

### Formulas

```verum
public type ModalFormula is
    | Atom    { name: Text }                            // propositional atom p
    | Not     { inner: Heap<ModalFormula> }             // ¬φ
    | And     { left: Heap<ModalFormula>, right: Heap<ModalFormula> }
    | Or      { left: Heap<ModalFormula>, right: Heap<ModalFormula> }
    | Implies { hyp: Heap<ModalFormula>, conc: Heap<ModalFormula> }
    | Box     { inner: Heap<ModalFormula> }             // □φ — necessarily
    | Diamond { inner: Heap<ModalFormula> };            // ◇φ — possibly
```

### Evaluation

```verum
public fn evaluate(
    formula: &ModalFormula,
    frame:   &KripkeFrame,
    v:       &Valuation,          // maps (world, atom) → Bool
    at:      &World,
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
let frame = KripkeFrame {
    worlds: list![world("w0"), world("w1")],
    edges:  list![edge(world("w0"), world("w1"))],
};

// Valuation: "p" holds at w1.
let v = Valuation.empty().with("w1", "p", true);

// □p holds at w0 (every world reachable from w0 satisfies p):
assert(evaluate(&modal_box(modal_atom("p")), &frame, &v, &world("w0")));

// But p itself does NOT hold at w0:
assert(!evaluate(&modal_atom("p"), &frame, &v, &world("w0")));
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
is_unrestricted(f: &LinForm) -> Bool
    // true iff f is of the form !A — can be duplicated freely

is_weakenable(f: &LinForm) -> Bool
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
