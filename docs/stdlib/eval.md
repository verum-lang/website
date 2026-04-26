---
sidebar_position: 3
title: eval
description: Call-by-push-value term algebra — foundations for effects and evaluation strategies.
---

# `core.eval` — Call-by-Push-Value

Term algebra for **Call-by-Push-Value** (CBPV) — Levy's unifying
framework that sits between call-by-value and call-by-name. This
module is the user-facing surface for the CBPV analysis core in
[`verum_types::cbpv`](/docs/architecture/crate-map); the Rust crate
does the reduction, this Verum module gives you the syntactic
algebra.

Use this module to:

- Study CBPV as a calculus.
- Translate between CBV and CBN programs.
- Build IRs that need a principled treatment of thunked / forced
  computations.
- Verify properties of effect-tracking translations.

## Why CBPV?

CBPV separates syntax into **values** and **computations**:

- A **value** is pure, copyable, and erasable. Functions, variables,
  numeric literals, thunks — all values.
- A **computation** is a potentially-effectful action. It **must** be
  sequenced to yield a value; it cannot be casually duplicated.

This division gives effects and evaluation strategy a clean home.
Call-by-value and call-by-name are both encodable as CBPV:

- CBV = "every argument is a `return V` computation".
- CBN = "every argument is a `thunk (return V)` value".

CBPV is the intermediate representation of choice when you care about
both laziness and strictness at once, which is why Verum's compiler
uses it to analyse `pure` functions, lower staged meta code, and
verify `Async` / `IO` separation.

## Module shape

| File       | What's in it                                                         |
|------------|----------------------------------------------------------------------|
| `cbpv.vr`  | `CbpvKind`, `CbpvTerm`, smart constructors, kind predicate, canonicality predicate |

## Kinds

```verum
public type CbpvKind is Value | Computation;
```

Every CBPV term has exactly one kind. Knowing a term's kind lets the
compiler reject nonsense like forcing a computation directly or
returning a thunked value as a value.

## Terms

```verum
public type CbpvTerm is
    | Var    { name: Text }                                   // x              (V)
    | Lam    { param: Text, body: Heap<CbpvTerm> }            // λx. body       (C)
    | Thunk  { inner: Heap<CbpvTerm> }                        // thunk C        (V)
    | Return { value: Heap<CbpvTerm> }                        // return V       (C)
    | SeqTo  { producer: Heap<CbpvTerm>, binder: Text,
               body: Heap<CbpvTerm> }                         // C to x. C'     (C)
    | Force  { value: Heap<CbpvTerm> }                        // force V        (C)
    | App    { func: Heap<CbpvTerm>, arg: Heap<CbpvTerm> };   // C V            (C)
```

- `Var` — variable reference (**value**).
- `Lam` — function abstraction (**computation**). Unlike in ordinary
  λ-calculus, a lambda is a computation, not a value, because forcing
  it runs its body.
- `Thunk` — suspended computation, held as a value.
- `Return` — lift a value into a trivial computation.
- `SeqTo` — sequencing: run the producer, bind its returned value,
  continue with the body.
- `Force` — run a thunk.
- `App` — apply a function computation to a value argument.

## Smart constructors

Prefer these over raw variant constructors — they wrap children in
`Heap<T>`:

```verum
public fn cbpv_var(name: Text) -> CbpvTerm
public fn cbpv_lam(param: Text, body: CbpvTerm) -> CbpvTerm
public fn cbpv_thunk(c: CbpvTerm) -> CbpvTerm
public fn cbpv_return(v: CbpvTerm) -> CbpvTerm
public fn cbpv_seq_to(producer: CbpvTerm, binder: Text, body: CbpvTerm) -> CbpvTerm
public fn cbpv_force(v: CbpvTerm) -> CbpvTerm
public fn cbpv_app(f: CbpvTerm, x: CbpvTerm) -> CbpvTerm
```

## Predicates

### `cbpv_kind_of(t: CbpvTerm) -> CbpvKind`

Returns the syntactic kind of `t`. Never fails — every well-formed
term has a unique kind.

```verum
assert_eq(cbpv_kind_of(cbpv_var("x")),      CbpvKind.Value);
assert_eq(cbpv_kind_of(cbpv_return(cbpv_var("x"))), CbpvKind.Computation);
assert_eq(cbpv_kind_of(cbpv_thunk(cbpv_return(cbpv_var("x")))), CbpvKind.Value);
```

### `cbpv_is_canonical(t: CbpvTerm) -> Bool`

A term is **canonical** if it is in normal form: `Var`, `Lam`,
`Thunk`, or `Return(V)` where `V` is itself canonical. Canonical
terms are values that an observer can inspect without further
reduction.

```verum
assert(cbpv_is_canonical(cbpv_var("x")));
assert(cbpv_is_canonical(cbpv_lam("x", cbpv_return(cbpv_var("x")))));
assert(!cbpv_is_canonical(cbpv_force(cbpv_thunk(cbpv_return(cbpv_var("x"))))));
```

## Reduction rules

```
(λx. C) V                     ↦   C[x := V]                         (β)
force (thunk C)               ↦   C                                  (force/thunk)
(return V) to x. C            ↦   C[x := V]                         (bind)
```

These three rules are complete for pure CBPV. Effects extend them —
a real implementation adds rules for `IO`, `State`, and friends; the
pure algebra above is what Verum's `pure` checker operates on.

## Substitution + reduction surface

```verum
public fn cbpv_occurs_free(t: CbpvTerm, name: Text) -> Bool;
public fn cbpv_substitute(t: CbpvTerm, from: Text, to: CbpvTerm) -> CbpvTerm;

public type CbpvStep is
    | Stepped { next: CbpvTerm }
    | Normal  { term: CbpvTerm };

public fn cbpv_step(t: CbpvTerm) -> CbpvStep;
public fn cbpv_normalise(t: CbpvTerm, gas: Int) -> (CbpvTerm, Int);
public fn cbpv_alpha_eq(a: CbpvTerm, b: CbpvTerm) -> Bool;
```

- `cbpv_substitute` is **capture-avoiding**: when descending under
  a binder that would capture a free variable of the replacement,
  the binder is α-renamed to a fresh name.
- `cbpv_step` returns the term back in either branch
  (`Stepped` / `Normal`) so iteration doesn't require Clone — the
  ADT carries `Heap<CbpvTerm>` children and ownership is threaded
  through the loop.
- `cbpv_normalise(t, gas)` drives the small-step reducer to a
  fixed point with a hard step budget. Returns
  `(final_term, steps_used)`; `steps_used < gas` means a normal
  form was reached, `steps_used == gas` means the budget was
  exhausted on a non-terminating reduction (e.g. `ω = thunk (force x)`).
- `cbpv_alpha_eq` compares two terms up to consistent renaming of
  bound variables, via depth-tracking renaming contexts (de
  Bruijn-level approach).

```verum
let prog   = cbpv_app(cbpv_lam("x", cbpv_return(cbpv_var("x"))),
                      cbpv_var("y"));
let (norm, steps) = cbpv_normalise(prog, 100);
// norm ≡ return y; steps == 1.
```

## Worked example — CBV vs. CBN encoding

Consider the expression `(λx. x + x) (1 + 2)`.

### CBV encoding (argument is a `return V`)

```verum
// Source: (λx. x + x) (1 + 2)
// CBV:    (1 + 2) to y. (λx. x + x) y

let arg = cbpv_return(/* 1 + 2 encoded */);
let fn_ = cbpv_lam("x", /* x + x */);

let program = cbpv_seq_to(arg, "y", cbpv_app(fn_, cbpv_var("y")));
```

The argument is **evaluated first**, then bound, then fed into the
function.

### CBN encoding (argument is a `thunk (return V)`)

```verum
// CBN:    (λx. (force x) + (force x)) (thunk (return (1 + 2)))

let arg  = cbpv_thunk(cbpv_return(/* 1 + 2 */));
let fn_  = cbpv_lam(
    "x",
    /* cbpv_force(x) + cbpv_force(x) — uses x twice, reruns */
);

let program = cbpv_app(fn_, arg);
```

Under CBN, the argument is suspended; each use of `x` in the function
body re-forces the thunk — the work of `1 + 2` runs twice.

CBPV makes both shapes syntactically explicit. The compiler can pick
either encoding — or an analysis can decide which is faster per-call.

## Use by the Verum compiler

The compiler maps user-level constructs into CBPV for verification:

- `pure fn` body → a pure CBPV computation.
- `async fn` body → a CBPV computation with `IO`/`Async` effects.
- `@const expr` → a CBPV computation evaluated at compile time.
- `fn*` generator yields → CBPV `SeqTo` with a resumable binder.

The mapping is not exposed as user API — this module is the *term
algebra* those translations produce.

## Limitations

The module is intentionally minimal:

- No reducer — use `cbpv_is_canonical` + pattern-matching to drive a
  step-by-step reducer if you need one.
- No typing judgements — the intended use is post-type-checking
  (the Rust core already verifies kinds).
- No effects layer — the user-level effect system is encoded by
  context tracking, not by CBPV operators.

## Relationship to `core.control`

Both modules expose term algebras for control-flow studies:

| Module              | Calculus                                       |
|---------------------|------------------------------------------------|
| `core.control`     | Delimited continuations (shift/reset).         |
| `core.eval`        | Call-by-push-value (CBPV).                     |

They are **orthogonal** — each suits a different kind of semantic
study. CBPV is the canonical home for monadic semantics and effect
analysis; shift/reset is the canonical home for expressive control
(coroutines, backtracking, handlers).

## See also

- **[`stdlib/control`](/docs/stdlib/control)** — delimited
  continuations.
- **[Functions → modifiers](/docs/language/functions#function-modifiers)**
  — `pure` uses the CBPV pure fragment.
- **[Architecture → compilation pipeline](/docs/architecture/compilation-pipeline)**
  — where CBPV fits in the lowering.
- Paper: *Call-by-Push-Value: A Subsuming Paradigm* (Paul Blain Levy, 2003).
