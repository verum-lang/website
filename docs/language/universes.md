---
sidebar_position: 9
title: Universes & proof irrelevance
description: The Type(n)/Prop hierarchy, predicativity, proof irrelevance, and universe polymorphism.
---

# Universes

> **TL;DR.** Verum has a predicative hierarchy of type universes
> `Type(0) : Type(1) : Type(2) : ...` plus an *impredicative*
> universe of propositions `Prop`. You rarely see these directly
> in everyday code — the compiler infers levels for you — but they
> become visible when you write generic proof code, protocol laws,
> or highly polymorphic library APIs.

```verum
// Universe inference in ordinary code — no annotation needed.
fn id<A>(x: A) -> A { x }

// Explicit universe polymorphism — `u` ranges over any level.
fn id_poly<universe u, A: Type(u)>(x: A) -> A { x }

// A proposition lives in Prop (proof-irrelevant).
theorem add_comm(a: Int, b: Int) -> (a + b == b + a) : Prop { ... }
```

:::info Status
The four universe-level forms (Concrete / Variable / Max / Succ),
the universe solver, and the `Prop` / `Type(n)` primitive types
are wired end-to-end. User-facing universe polymorphism is
exposed through the `universe` keyword; proof irrelevance for
`Prop` is active in the type checker. Kind-inference interaction
is mature for common patterns; cumulative Prop→Type coercion is
in the *maturing* column.
:::

## Why universes?

The short answer: **to keep the language consistent.** A type
system that lets `Type : Type` is inconsistent (Girard's paradox).
Splitting types into an infinite hierarchy avoids this.

The long answer has three parts.

### 1. Girard's paradox in one breath

If `Type : Type` you can define the type of "all types that don't
contain themselves", ask whether *it* contains itself, and derive
`False`. The fix is to stratify: `Type(0) : Type(1) : Type(2) :
...`. Every type lives in *some* level, and no level contains
itself.

### 2. Proof irrelevance

You want to say "two proofs of the same proposition are
interchangeable." That discipline is what makes a proof **erasable
at runtime**. But in a single unstratified universe, proofs would
compete with values and you'd lose this property.

`Prop` — a separate universe — is the home of proof-irrelevant
statements. Its inhabitants compute to unit at runtime.

### 3. Generic library code

Library authors write code that must work for types of *any* size
or complexity — from `Int` all the way up to `Type(17)`. Universe
polymorphism (`<universe u, A: Type(u)>`) is the mechanism that
keeps a single implementation valid across the hierarchy.

## The hierarchy at a glance

```
            Type(ω)  ...
                │
            Type(2)
                │
            Type(1)        Prop : Type(1)
                │            │
            Type(0)       (propositions)
            /   │   \
        Int  Float  List<Int>  ...
```

- `Type(0)` (written `Type` when the level is inferred) holds
  ordinary value types: `Int`, `Float`, `List<Int>`, `User`,
  `Option<T>` for small `T`, etc.
- `Type(1)` holds *descriptions* of things in `Type(0)`: for
  example `Type(0)` itself, or a type family `Int -> Type(0)`.
- `Type(n+1)` holds things that need `Type(n)` to be described.
- `Prop` is the universe of propositions. `Prop : Type(1)`.

### The golden rule

> `Type(a) : Type(b)` iff `a < b`.

Everything else — universe polymorphism, level arithmetic,
refinement checking — is derived from this inequality.

## `Prop`: proof-irrelevant propositions

A proposition is a statement that is *either true or not*. The
content of a proof does not matter; only its existence does.

```verum
type NonZero is Int { self != 0 };
// Membership of n in NonZero is a Prop:
//   NonZero(n) ≡ n != 0 : Prop
```

Two proofs of the same proposition are definitionally equal:

```verum
theorem both_proofs_equal(n: Int, p1: n != 0, p2: n != 0) -> (p1 == p2) : Prop
{ by refl }  // holds by proof irrelevance
```

Practically, this is what makes refinement types erasable: the
runtime value is just `Int`; the proof that `self != 0` holds is a
`Prop` inhabitant, stripped before codegen.

### What lives in `Prop`?

- Equality statements: `a == b`, `a <= b`, `x in s`.
- Refinement predicates: `self > 0`, `self.len > 0`.
- Protocol laws / axioms inside `protocol { ... }` blocks.
- Theorems and lemmas: `theorem`, `lemma`, `axiom`, `corollary`.

### What does *not* live in `Prop`?

- `Bool` — it has computational content (`true` and `false` are
  distinguishable at runtime).
- `Option<T>` — the shape of the value matters.
- Any type you pattern-match on for runtime branching.

:::note Rule of thumb
If the proof would tell you *how* something is true (which index,
which branch), it's not in `Prop`. If the proof just confirms
*that* it's true, it's in `Prop`.
:::

## Writing level annotations

### Implicit (the usual case)

```verum
fn id<A>(x: A) -> A { x }
```

The compiler picks `A : Type(u)` for a fresh level variable `u`
and solves for it later. Most code never sees universes.

### Explicit universe polymorphism

```verum
fn id<universe u, A: Type(u)>(x: A) -> A { x }
```

`universe u` declares a level variable. `A: Type(u)` asks for a
type in `Type(u)` — so `id_poly` works at any level.

### Alternative `level` syntax

```verum
fn id2<u: Level, A: Type(u)>(x: A) -> A { x }
```

Both forms elaborate to the same thing. Pick `universe u` for
clarity; pick `u: Level` when you want to emphasize that `u` is
bounded like any other type parameter.

### Level arithmetic

The compile-time operators `max`, `imax`, and successor `+1` work
inside level expressions:

```verum
fn compose<universe u, universe v, A: Type(u), B: Type(v)>
          (f: fn(A) -> B) -> fn(A) -> B { f }
// Result type lives in Type(max(u, v)).
```

Available operators:

| Form | Meaning |
|---|---|
| `u` | a level variable |
| `0`, `1`, `2`, ... | concrete level |
| `u + 1` | successor |
| `max(u, v)` | take the greater (predicative) |
| `imax(u, v)` | impredicative max: `0` if `v = 0`, else `max(u, v)` |

`imax` is what makes `Prop` *impredicative*: a Π-type that lands in
`Prop` stays in `Prop`, regardless of how high its domain lives.
This is what lets you quantify `forall P : Prop. P -> P` and have
the result still be a proposition.

### Calling with explicit level arguments

You almost never write them; when you do, the syntax mirrors type
arguments:

```verum
let j: fn(Int) -> Int = id_poly<0, Int>;  // instantiate u := 0
```

## The universe solver

Verum's inference treats levels like any other type variable: it
records **constraints** (e.g., `u < v`, `u <= 3`, `u = max(a, b)`)
and solves them once all sources are visible.

```
user writes:    fn double<A>(a: A) -> (A, A)
solver records: A : Type(u_1)          (fresh level var)
                result : Type(?)
solver solves:  result : Type(u_1)     (tuple inherits level)
```

Errors from the solver look like this:

```
error[E1102]: universe inconsistency
  --> src/bad.vr:7:14
   |
 7 |     let x: Type(0) = Type(0);
   |                      ^^^^^^^ this has type Type(1), not Type(0)
   = note: `Type(n) : Type(n+1)` always, so `Type(0)` cannot
           inhabit itself.
```

The solver is exposed through the `@universe_info(expr)` meta
function for debugging; it reports the level your expression
resides in.

## Universes and refinements

A refinement `T { P }` is sugar for a Σ-type
`Σ (x: T) . P(x) : Prop`. Because the proof half lives in `Prop`,
it is erased. Refinement types inhabit the **same** universe as the
underlying `T`:

```verum
type NonZero is Int { self != 0 };
// NonZero : Type(0), exactly like Int.
```

This is the property that makes refinements "free" in the Verum
memory model.

## Universes and protocols

A protocol is a record living in some `Type(n)` — usually `Type(1)`
or higher because its fields *are* types.

```verum
type Monoid<A: Type(u)> is protocol {
    fn unit() -> A;
    fn combine(x: A, y: A) -> A;
    axiom left_id: forall a: A. combine(unit(), a) == a;
    axiom right_id: forall a: A. combine(a, unit()) == a;
    axiom assoc: forall a, b, c: A. combine(combine(a,b), c) == combine(a, combine(b,c));
};
```

The axioms live in `Prop`. The method signatures live at whatever
level `A` does. Inference handles all of this; you just write the
protocol.

## Cumulativity

Verum uses **non-cumulative** universes by default:
`Type(0)` is not automatically a subtype of `Type(1)`. If you need
something in a higher universe, you explicitly lift:

```verum
@lift(+1)
type Bigger<A: Type(u)> is { inner: A };
// Bigger<X> : Type(u + 1)
```

Non-cumulativity has two benefits:
- Error messages are precise (the level you wrote is the level the
  compiler believes).
- Universe inference terminates more quickly because there is one
  canonical answer, not a lattice of possibilities.

For ergonomic generics, `universe u` captures "any level" —
covering the use case cumulativity exists for elsewhere.

## Practical catalogue

### `Option<T>` — level-polymorphic

```verum
type Option<universe u, T: Type(u)> is
    | None
    | Some(T);
```

Lives in `Type(u)` — same level as its parameter. You get one
definition that works for `Option<Int>` *and* `Option<Type>` *and*
`Option<Monoid<Int>>`.

### The category of types

```verum
type Functor<F<_>> is protocol {
    fn map<universe u, universe v, A: Type(u), B: Type(v)>
          (self: F<A>, f: fn(A) -> B) -> F<B>;
    axiom id_law:    forall (x: F<A>). self.map(x, |a| a) == x;
    axiom comp_law:  forall (x: F<A>, f: fn(A) -> B, g: fn(B) -> C).
                       self.map(x, |a| g(f(a))) == self.map(self.map(x, f), g);
};
```

Double-polymorphic over the levels of source and target categories.

### Sized heterogeneous containers

```verum
type HList<universe u, Ts: List(Type(u))> is ...;
```

`HList` takes a *type-level list of types* (all in `Type(u)`) and
builds a heterogeneous record.

## Interaction with other features

| With... | Behaviour |
|---|---|
| **Refinements** | Refined type shares its base type's universe. |
| **Dependent types** | Σ/Π types take `max(u, v)` of their parts (predicative); Π into `Prop` uses `imax`. |
| **Protocols & GATs** | Associated types have their own universe; the impl must match or be higher. |
| **Meta staging** | Staged code at stage N sees types as values in `Type(N)`; the universe of the quoted term is shifted by N. |
| **FFI** | Extern types are postulated at `Type(0)` by default (override with `@universe`). |

## Common errors and fixes

### `error[E1103]: universe variable not in scope`

You referred to `Type(u)` without declaring `u`. Add `universe u`
to the generics.

### `error[E1104]: failed to solve universe constraints`

The solver found an unsatisfiable constraint, typically from
trying to put a large type in a small universe. Add `universe u`
to the enclosing function or explicitly annotate the intended
level.

### `warning[W1105]: forced cumulative lift`

You used a `Type(0)` value where a `Type(1)` value was expected and
the compiler auto-lifted. Quiet it with an explicit `@lift(+1)` or
make the definition universe-polymorphic.

## FAQ

**Do I ever have to write `universe u` in normal code?** Only in
generic library code that really must work across levels. The
compiler infers what it can.

**Is `Prop` the same as `Bool`?** No. `Bool` has two runtime-
distinguishable values. `Prop` inhabitants are indistinguishable
at runtime — all that matters is their existence.

**Why not make everything cumulative?** Because cumulativity
complicates inference, slows the solver, and breaks error locality.
`universe u` gives the same ergonomics where you actually need it.

**Can I have `Type(-1)`?** No. Level `0` is the floor. `Prop` is
*not* `Type(-1)` — it is a separate sort that happens to be small.

**Does this add runtime cost?** No. Universes exist only for the
type checker. After elaboration, all level information is erased.

**What about `Type : Type`?** It's inconsistent, and Verum refuses
to accept it. If you need a quick-and-dirty polymorphism, use
`universe u`.

## See also

- [Dependent types](./dependent-types.md) — Σ, Π, and their
  universes.
- [Refinement types](./refinement-types.md) — how `Prop`
  underpins erasable refinements.
- [Proof DSL](./proof-dsl.md) — where propositions actually live.
- [Grammar reference — Types](../reference/grammar-ebnf.md#27-types) —
  the formal universe-level productions.
