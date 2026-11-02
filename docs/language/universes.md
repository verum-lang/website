---
sidebar_position: 9
title: Universes and level checking
description: The Type(n) hierarchy, proposition universes, level constraints, and the boundaries of universe polymorphism.
---

# Universes

A universe classifies types. Ordinary value types such as `Int` and `Bool`
belong to `Type(0)`, also written `Type`. The universe `Type(0)` itself
belongs to `Type(1)`; `Type(1)` belongs to `Type(2)`, and so on.

Most programs need no universe annotations:

```verum
fn identity<A>(value: A) -> A { value }
```

Universe levels become relevant when an API accepts types or when a proof
quantifies over types. They distinguish a type from the universe that
contains it; a universe is not its own inhabitant.

## The hierarchy

| Expression | Universe that contains it |
|---|---|
| `Int`, `Bool` | `Type(0)` |
| `Type(0)` | `Type(1)` |
| `Type(1)` | `Type(2)` |
| `Prop` | `Type(1)` |

In mathematical notation, `Type(n) : Type(n + 1)`. This is a formation
rule, distinct from **cumulativity**: a type belonging to a lower universe
can be considered in a higher one when the required level inequality is
established. Neither rule permits identifying a level with its successor.

Concrete annotations use nonnegative integer levels:

```verum
fn retain_type(value: Type(1)) -> Type(1) { value }
```

This example checks a type-level signature. It does not introduce a runtime
representation for arbitrary types or an operation for inspecting proofs.

## Level expressions and constraints

The internal level representation contains constants, variables, successor
and maximum. Successor and maximum retain their complete operands,
including nested expressions. A variable has an opaque identity: its
identifier is never used as its numerical level.

The following equations describe the level algebra; they are mathematical
notation, not additional source syntax:

```text
succ(u)       = u + 1
max(u, v)     = max(v, u)
max(u, u)     = u
succ(max(u,v)) = max(succ(u), succ(v))
```

A level comparison and a constraint solution answer different questions:

- **Universal comparison:** does the relation hold for every natural-number
  assignment? For example, `u ≤ max(u, v)` is valid, while `u ≤ v` is not
  justified for independent parameters.
- **Existential constraint solving:** is there an assignment to inference
  metavariables that satisfies every collected constraint? The assignment
  must be checked against the original constraints before it is accepted.

Finding one assignment is not a proof that a relation holds for every
instantiation. The subtype and equality checks do not treat an unresolved
variable as evidence for a relation.

The implementation bounds expression size, search work and representable
solver results. Exhaustion, missing assignments, cycles and arithmetic
overflow cannot produce a successful level check. A failed bounded search
need not mean that the corresponding unbounded mathematical problem has
no solution.

## Explicit universe polymorphism

Concrete `Type` and `Type(n)` annotations are available without enabling
universe polymorphism. Symbolic annotations such as `Type(u)` require
`universe_polymorphism` in the project's type-system configuration:

```toml
[types]
universe_polymorphism = true
```

A declaration introduces a level name; annotations resolve it in that
lexical scope:

```verum
fn retain_at<universe u>(value: Type(u)) -> Type(u) { value }
```

The alternative binder spelling is `u: Level`. A level parameter is neither
a runtime value nor an ordinary type. An undeclared level is an error, and
two unrelated declarations using the name `u` have distinct identities.
Each call receives fresh inference variables for the declaration's level
parameters. Repeated occurrences of one parameter share that call's
substitution; independent calls do not share an inferred level:

```verum
fn retain_at<universe u>(value: Type(u)) -> Type(u) { value }
fn first(value: Type(1)) -> Type(1) { retain_at(value) }
fn second(value: Type(2)) -> Type(2) { retain_at(value) }
```

The parameter remains rigid while its function body is checked. A body
cannot equate independent declared levels merely because one call could
assign them the same value. Likewise, passing a value from `Type(2)`
through `retain_at` does not justify returning it as `Type(1)`.

A callable bound can refer to the same level as its enclosing function:

```verum
fn apply<universe u, F: fn() -> Type(u)>(f: F) -> Type(u) { f() }
fn one(f: fn() -> Type(1)) -> Type(1) { apply(f) }
fn two(f: fn() -> Type(2)) -> Type(2) { apply(f) }
```

Here `F: fn() -> Type(u)` constrains the result of invoking a callable; it
is not a formation bound `F: Type(u)`. The function body and its callable
bounds share one level substitution at each call. Named functions and
closures must satisfy the bound, and an explicit closure return annotation
cannot replace the required result. An immutable alias of a polymorphic
function retains its declaration's quantifiers and bounds. Typed function values and higher-order arguments retain pending obligations until their surrounding types have been inferred.

Free-function imports preserve level quantifiers through source modules
and typed library metadata. A metadata signature is elaborated in its
owning module using the source checking rules. Stale archive schemas and
malformed level binders require rebuilding or correcting the library;
they are not interpreted as unconstrained types.

Call inference handles structural level equalities, with checked
substitution composition and cycle detection. Equations requiring a
more general search over maximum expressions may be refused. Universe
kind bounds such as `A: Type(u)`, universe-bearing higher-rank signatures,
and universe-bearing method metadata are refused until their formation
and binder rules are fully carried through checking. Library export also
refuses universe-bearing nominal types, constants and statics until their
declarations have a complete metadata representation. These limitations
are distinct from the supported first-order free-function calls above.

A checked signature does not supply a runtime representation for arbitrary
types. The level algebra also does not imply support for `imax`, infinite
levels or arbitrary arithmetic inside `Type(...)`.

## Propositions and computation

`Prop` classifies propositions; `Bool` is a data type with distinguishable
values `true` and `false`. Checking a Boolean expression and constructing a
proof of a proposition are different operations.

Universe stratification alone establishes neither proof irrelevance nor
safe proof erasure. Those depend on the proof checker's equality and
elimination rules and on the execution backend. It would therefore be
incorrect to derive arbitrary equality between proof terms, or permission
to eliminate a proof into runtime data, from a successful universe check.

See the [Proof DSL](./proof-dsl.md) for checked proof construction and
[refinement types](./refinement-types.md) for obligations on ordinary values.

## Verification boundary

The level implementation uses a finite normal form consisting of a constant
and variable-plus-offset terms. Independent Lean proofs establish the
normalization semantics and the soundness of its universal ordering rule.
Replay checks bind a produced normal form to its exact source expression,
including variable identities and nested operands, before deriving a level
inequality. An unrelated witness cannot certify a different expression.

Independent replay also checks the exact declaration-to-metavariable map
and resolved level expressions produced by native instantiation. The
substitution theorem preserves denotation under explicit valuation
agreement; unresolved metavariables remain universally quantified. For
solved examples, the supplied assignment is checked against every
binding before an equation is certified. This distinguishes a valid
substitution from a solver's success flag.

This result concerns the level algebra and its checked witnesses. It is not
a proof of the entire compiler, runtime, polymorphic elaborator or language
consistency. Likewise, an SMT solver's success status alone does not certify
a universe assignment: the implementation re-evaluates the original
constraints and the resulting substitution.

## See also

- [Dependent types](./dependent-types.md)
- [Refinement types](./refinement-types.md)
- [Proof DSL](./proof-dsl.md)
- [Grammar reference — Types](../reference/grammar-ebnf.md#27-types)
