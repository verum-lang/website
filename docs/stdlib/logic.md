---
sidebar_position: 6
title: logic
description: Linear logic connectives — ⊗, ⅋, &, ⊕, !, ? — the dual structure behind session types.
---

# `core::logic` — Linear logic

Term algebra for the connectives of **linear logic** (Girard 1987).
Used internally for linearity analyses, session types, and affine
types. User code rarely imports it directly; this reference is for
completeness.

| File | What's in it |
|---|---|
| `linear.vr` | `LinForm` + constructors |

---

## Connectives

```verum
type LinForm is
    | Atom     { name: Text }                                          // propositional atom
    | Tensor   { left: Heap<LinForm>, right: Heap<LinForm> }           // A ⊗ B   — multiplicative conjunction
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
