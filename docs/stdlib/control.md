---
sidebar_position: 4
title: control
description: Delimited continuations — shift / reset term algebra.
---

# `core::control` — Delimited Continuations

Term algebra for **delimited continuations** via `shift` and `reset`.

The module exposes the continuation calculus as a data structure plus
its reduction rules. Verum's own concurrency primitives — `async fn`,
generator functions (`fn*`), and the `Result` error ladder — do not
use first-class continuations; they are compiled directly. What this
module gives you is a way to **model**, **prove properties of**, or
**translate** code from languages that do use shift/reset: OCaml
effect handlers, Scheme's `call/cc` in delimited form, Racket's
delimited prompts, F\#'s computation expressions, and any algebraic
effect system.

Use this module when you want to:

- Study a delimited-continuation calculus operationally.
- Translate an effect-handler program into Verum code without a
  runtime shift/reset.
- Verify properties of higher-order control-flow programs.

## Module shape

| File              | What's in it                                               |
|-------------------|------------------------------------------------------------|
| `continuation.vr` | `CcTerm` algebra, smart constructors, predicates, capture-avoiding substitution |

The module is intentionally small. There is no reducer here — Verum's
compiler research uses [`verum_types::continuation_calculus`] (Rust
crate) for the actual reduction engine; the pure-Verum shim is the
type algebra.

## Terms

```verum
public type CcTerm is
    | Const  { payload: Text }                                       // atomic value
    | Var    { name: Text }                                          // x
    | Lam    { param: Text, body: Heap<CcTerm> }                     // λx. body
    | App    { func: Heap<CcTerm>, arg: Heap<CcTerm> }               // f arg
    | Reset  { inner: Heap<CcTerm> }                                 // reset M
    | Shift  { binder: Text, body: Heap<CcTerm> };                   // shift k. M
```

- `Const` — an atomic value payload. The `Text` field is a free-form
  label; the calculus is polymorphic over the value domain.
- `Var`, `Lam`, `App` — the ordinary lambda-calculus core.
- `Reset` — a **delimiter**. Evaluating `reset M` evaluates `M` fully,
  but any `shift` inside `M` captures only up to this boundary.
- `Shift` — **continuation capture**. Inside `reset`, `shift k. M`
  captures the surrounding computation as `k` (a continuation value)
  and evaluates `M` with `k` bound.

### Field shape

Children of `Lam`, `App`, `Reset`, and `Shift` are held in `Heap<T>`
because `CcTerm` is recursive. The heap indirection is unavoidable for
a sized representation of an unbounded tree.

## Smart constructors

```verum
public fn cc_const(payload: Text) -> CcTerm                 // atomic constant
public fn cc_var(name: Text) -> CcTerm                      // free variable
public fn cc_lam(param: Text, body: CcTerm) -> CcTerm       // λ-abstraction
public fn cc_app(f: CcTerm, x: CcTerm) -> CcTerm            // application
public fn cc_reset(m: CcTerm) -> CcTerm                     // reset M
public fn cc_shift(binder: Text, body: CcTerm) -> CcTerm    // shift k. M
```

Prefer the smart constructors to the raw variant constructors — they
handle the `Heap<T>` wrapping for you.

## Predicates

### `cc_is_value(t: CcTerm) -> Bool`

A term is a **value** if it cannot reduce further on its own. In this
calculus, only `Const` and `Lam` are values. Variables, applications,
`reset`, and `shift` are all redexes (or contain redexes).

```verum
assert(cc_is_value(cc_const("42")));
assert(cc_is_value(cc_lam("x", cc_var("x"))));
assert(!cc_is_value(cc_app(cc_lam("x", cc_var("x")), cc_const("y"))));
```

## Capture-avoiding substitution

### `cc_substitute(t: CcTerm, from: Text, to: CcTerm) -> CcTerm`

Substitutes `to` for every **free** occurrence of the variable named
`from` in `t`. Respects the scoping of binders — does not substitute
under a `Lam` or `Shift` that rebinds `from`.

```verum
let e = cc_lam("y", cc_app(cc_var("x"), cc_var("y")));
// e = λy. x y
let e' = cc_substitute(e, "x", cc_const("hello"));
// e' = λy. "hello" y
```

## Reduction rules

The three-rule operational semantics:

```
(λx. M) N                  ↦ M[x := N]                      (β)
reset V                    ↦ V                              (when V is a value)
reset (E[shift k. M])      ↦ reset (M[k := λx. reset E[x]]) (shift-capture)
```

**β-reduction** is ordinary function application.

**reset-value** says: once the delimited sub-computation reaches a
value, the delimiter is removed.

**shift-capture** is the distinguishing rule. `E` is the evaluation
context — everything strictly outside `shift` but inside `reset`. The
captured continuation is `λx. reset E[x]`: a function that, when
called with `x`, plugs `x` back into the hole in `E` and resets the
resulting computation so the next `shift` inside `E[x]` binds to
*this* `reset`, not some outer one.

### What makes `shift`/`reset` powerful

A captured continuation is a **first-class value**:

- It can be **called zero times** (abort the continuation).
- It can be **called once** (the usual case — `yield`-style behaviour).
- It can be **called many times** (non-deterministic search,
  backtracking, coroutines).

Almost every higher-order control construct reduces to one of these
patterns.

## Encoding control operators

### `yield` (one-shot capture)

A generator that yields once and resumes:

```verum
// reset ( ... shift k. (yield_value, k) ... )
let producer =
    cc_reset(
        cc_app(
            cc_lam("x", cc_app(cc_var("consume"), cc_var("x"))),
            cc_shift("k", cc_const("yield-value"))
        )
    );
```

After reduction, `k` is bound to the captured `consume _`. The
generator's yielded value is `"yield-value"`; invoking `k` on a new
input drives the generator forward.

### Exception handling (zero-shot capture)

An exception that ignores the captured continuation:

```verum
// reset ( ... shift k. handler ... )     (discards k)
let with_exception =
    cc_reset(
        cc_app(
            cc_lam("x", cc_var("use_result")),
            cc_shift("k",
                cc_const("error!")          // body ignores k
            )
        )
    );
```

Because `k` is unused, the surrounding computation is **aborted** and
replaced by the shift body's value. This is exactly how `throw` and
`try/recover` desugar in some languages.

### Non-deterministic choice (multi-shot capture)

```verum
// shift k. (k "left", k "right")
let choice_body =
    cc_shift("k",
        cc_app(
            cc_app(cc_var("pair"),
                   cc_app(cc_var("k"), cc_const("left"))),
            cc_app(cc_var("k"), cc_const("right"))
        )
    );

let non_det = cc_reset(cc_app(cc_var("consume"), choice_body));
```

The continuation `k` is invoked twice. The result is a pair of what
the continuation would produce for each of the two possible inputs —
classic angelic non-determinism.

## Why Verum ships this as a library, not a language feature

The Verum design picks a **small, specialised** set of control
mechanisms:

- `async fn` for suspension (desugars to a state machine, no
  continuations).
- `fn*` / `async fn*` for generators (iterator protocol, no
  continuations).
- `Result<T, E>` + `?` for exceptions (sum types, no unwinding).
- `panic` + `recover` for unwinding (per-task; no continuation
  capture).

This stack is **zero-cost**, **interoperable with C**, and **verifiable**.
First-class delimited continuations would add a runtime cost — a
call-stack copy on capture — and a verification burden. By exposing
the calculus as a pure term algebra, Verum lets you reason about
continuation-based programs while keeping the language's runtime
predictable.

## Reduction engine

If you need an actual reducer (e.g. to test equivalences), build one
atop `cc_substitute` and pattern matching on `CcTerm`. A minimal call-
by-value small-step reducer fits in about thirty lines and is a good
exercise; a starter is available in
[`vcs/specs/L3-extended/continuation_reducer.vr`](/docs/verification/gradual-verification).

## See also

- **[Async & Concurrency](/docs/language/async-concurrency)** —
  Verum's chosen suspension story.
- **[`stdlib/eval`](/docs/stdlib/eval)** — a different term-reducing
  module: compile-time expression evaluation.
- **[`stdlib/logic`](/docs/stdlib/logic)** — type-level logic,
  orthogonal to this runtime algebra.
- Paper: *A Monadic Framework for Delimited Continuations* (Dybvig,
  Peyton Jones, Sabry).
