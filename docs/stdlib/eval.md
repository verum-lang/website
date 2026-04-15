---
sidebar_position: 3
title: eval
description: Call-by-push-value term algebra — foundations for effects & evaluation strategies.
---

# `core::eval` — Call-by-push-value

Formal term algebra for **Call-by-Push-Value** (CBPV) — a unifying
framework for call-by-value and call-by-name evaluation strategies.
Used internally by the compiler for effect analysis and by user code
that encodes lazy / strict transformations.

| File | What's in it |
|---|---|
| `cbpv.vr` | `CbpvKind`, `CbpvTerm`, smart constructors, predicates |

---

## Terms

CBPV partitions syntax into two categories:

```verum
type CbpvKind is Value | Computation;
```

- **Values** are pure data — they can be duplicated and erased.
- **Computations** are potentially-effectful sequents — they can be
  thunked into values and forced back into computations.

### Term algebra

```verum
type CbpvTerm is
    | Var    { name: Text }                                   // x
    | Lam    { param: Text, body: Heap<CbpvTerm> }            // λx. body    (computation)
    | Thunk  { inner: Heap<CbpvTerm> }                        // thunk C     (value: thunked computation)
    | Return { value: Heap<CbpvTerm> }                        // return V    (computation returning a value)
    | SeqTo  { producer: Heap<CbpvTerm>, binder: Text,
               body: Heap<CbpvTerm> }                         // C to x. C'  (sequencing)
    | Force  { value: Heap<CbpvTerm> }                        // force V     (computation)
    | App    { func: Heap<CbpvTerm>, arg: Heap<CbpvTerm> };   // C V         (application)
```

---

## Smart constructors

```verum
cbpv_var(name: Text) -> CbpvTerm
cbpv_lam(param: Text, body: CbpvTerm) -> CbpvTerm
cbpv_thunk(c: CbpvTerm) -> CbpvTerm
cbpv_return(v: CbpvTerm) -> CbpvTerm
cbpv_seq_to(producer: CbpvTerm, binder: Text, body: CbpvTerm) -> CbpvTerm
cbpv_force(v: CbpvTerm) -> CbpvTerm
cbpv_app(f: CbpvTerm, x: CbpvTerm) -> CbpvTerm
```

## Predicates

```verum
cbpv_kind_of(t: &CbpvTerm) -> CbpvKind
cbpv_is_canonical(t: &CbpvTerm) -> Bool
```

Canonicality: a term is canonical iff it is in one of the normal
forms — `Var`, `Lam`, `Thunk`, or `Return(value)`.

---

## Reduction rules

Conceptually (the compiler implements the actual rewriter):

```
(λx. C) V           ↦   C[x := V]                    (β-reduction)
force (thunk C)     ↦   C                             (force/thunk)
(return V) to x. C  ↦   C[x := V]                    (bind)
```

These correspond to the familiar "call-by-value" reductions, but the
CBPV stratification makes the operational model explicit.

---

## Why CBPV?

- **Effect analysis**: pure values and effectful computations become
  syntactically distinct.
- **Evaluation strategy encoding**: CBV ≈ "all args are `return V`";
  CBN ≈ "all args are `thunk (return V)`".
- **Compiler IR**: a natural intermediate for lowering Verum's
  `pure`-annotated functions.

For the user-level consequences, see
[Language → functions → `pure`](/docs/language/functions#function-modifiers).
