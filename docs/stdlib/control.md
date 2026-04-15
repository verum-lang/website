---
sidebar_position: 4
title: control
description: Delimited continuations — shift / reset term algebra.
---

# `core::control` — Delimited continuations

Term algebra for **delimited continuations** via `shift` / `reset`.
The implementation is primarily for compiler research and for users
encoding advanced control operators (coroutines, exception handlers,
effect systems) without leaving the language.

| File | What's in it |
|---|---|
| `continuation.vr` | `CcTerm`, smart constructors, substitution |

---

## Terms

```verum
type CcTerm is
    | Const  { payload: Text }                                       // atomic
    | Var    { name: Text }                                          // x
    | Lam    { param: Text, body: Heap<CcTerm> }                     // λx. body
    | App    { func: Heap<CcTerm>, arg: Heap<CcTerm> }               // f arg
    | Reset  { inner: Heap<CcTerm> }                                 // reset M
    | Shift  { binder: Text, body: Heap<CcTerm> };                   // shift k. M
```

`reset` installs a delimited continuation boundary; `shift` captures
the continuation up to the nearest enclosing `reset` and binds it to
a variable.

---

## Smart constructors

```verum
cc_const(payload: Text) -> CcTerm
cc_var(name: Text) -> CcTerm
cc_lam(param: Text, body: CcTerm) -> CcTerm
cc_app(f: CcTerm, x: CcTerm) -> CcTerm
cc_reset(m: CcTerm) -> CcTerm
cc_shift(binder: Text, body: CcTerm) -> CcTerm
```

## Predicates & substitution

```verum
cc_is_value(t: &CcTerm) -> Bool
cc_substitute(t: CcTerm, from: Text, to: CcTerm) -> CcTerm    // capture-avoiding
```

---

## Reduction rules

```
(λx. M) N                  ↦ M[x := N]                      (β)
reset V                    ↦ V                              (when V is a value)
reset (E[shift k. M])      ↦ reset (M[k := λx. reset E[x]]) (continuation capture)
```

The third rule is the distinguishing feature: `shift` captures the
context `E` up to the enclosing `reset`, and the captured
continuation `k` becomes a first-class value that can be called
(and re-called) any number of times.

---

## Example — implementing `yield` via continuations

```verum
fn producer(depth: Int) -> CcTerm {
    cc_reset(
        cc_shift("k",
            cc_const(f"produced at depth {depth}")
        )
    )
}
```

This is a sketch; the real compiler lowers `yield` via specialised
machinery, but conceptually every generator-style construct can be
reduced to a shift/reset pair.

For user-level async and generator syntax, see
[Language → async & concurrency](/docs/language/async-concurrency).
