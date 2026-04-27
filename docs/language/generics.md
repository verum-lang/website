---
sidebar_position: 7
title: Generics
description: Type parameters, bounds, HKT, existentials, kind annotations, context polymorphism, universe polymorphism.
---

# Generics

Generics in Verum parameterise items by **types**, **const values**,
**kinds**, **contexts**, and (rarely) **universe levels**. This page
walks through every form.

## Type parameters

```verum
type Pair<A, B> is { first: A, second: B };

fn swap<A, B>(p: Pair<A, B>) -> Pair<B, A> {
    Pair { first: p.second, second: p.first }
}
```

Conventionally:

- `T`, `U`, `V` — general-purpose element types.
- `K`, `V` — map key / value.
- `A`, `B`, `C` — curried composition (functors, transducers).
- `E` — error type.
- `F<_>`, `G<_>` — type constructors (HKT).
- `I` — iterator; `S` — stream.

The compiler doesn't enforce these conventions; the standard library
follows them.

## Explicit type arguments

Verum uses the spaceless `<T>` form everywhere — both in type position and
when supplying explicit type arguments to a generic call:

```verum
let xs: List<Int> = List.new();    // type position
let xs = List.new<Int>();          // explicit type arg on a generic call
let n  = size_of<Int>();           // explicit type arg on a free function
```

Verum has **no Rust-style turbofish (`::<T>`)**: `::` is not a token in
[`grammar/verum.ebnf`](../reference/grammar-ebnf.md). The grammar disambiguates
`foo<T>(args)` from `foo < T` by lookahead — the parser knows whether the
identifier names a generic-capable function in scope, and switches arms
accordingly.

## Bounds

```verum
fn max<T: Ord>(a: T, b: T) -> T {
    if a > b { a } else { b }
}

fn serialise<T: Serialize + Send + !Sync>(x: T) -> List<Byte> { ... }
```

Semantics:

- `T: Bound1 + Bound2` — intersection (both must hold).
- `T: !Bound` — **negative** bound. The type must **not** implement
  `Bound`.
- `T: Protocol<A, B>` — parameterised bound.
- `T: Protocol<Item = U>` — bound with an associated-type binding.

### Associated-type bounds

Constrain a protocol's associated type:

```verum
fn show_all<I: Iterator>(it: I)
    where I.Item: Display,
          I.Item: Clone
{
    for item in it { print(item); }
}
```

### Conditional implementations

Implementations can themselves be generic over bounds:

```verum
implement<T: Display> Display for List<T> {
    fn fmt(&self, f: &mut Formatter) -> FmtResult {
        f.write("[");
        let mut first = true;
        for item in self.iter() {
            if !first { f.write(", "); }
            item.fmt(f)?;
            first = false;
        }
        f.write("]")
    }
}
```

`List<T>` implements `Display` **only when** `T` does.

### Per-instantiation dispatch

When an inherent `implement` block pins one or more type parameters to
a concrete type, the methods defined there are **only** reachable on
matching instantiations. This is how the stdlib models access-tagged
types like `Register<T, MODE>`:

```verum
// `read` only exists when MODE = ReadOnly / ReadWrite / WriteOneToClear.
implement<T: Copy> Register<T, ReadOnly>  { fn read(&self) -> T { … } }
implement<T: Copy> Register<T, ReadWrite> { fn read(&self) -> T { … } }

// `write` only exists when MODE = WriteOnly / ReadWrite / …
implement<T: Copy> Register<T, WriteOnly>  { fn write(&self, value: T) { … } }
implement<T: Copy> Register<T, ReadWrite>  { fn write(&self, value: T) { … } }

fn drive(status: Register<UInt32, ReadOnly>) {
    let v = status.read();       // ✓ ReadOnly has `read`
    status.write(0x0001);        // ✗ E400 at type check — ReadOnly has no `write`
}
```

Slot-matching rules:

- An impl-level generic slot (`T` in `implement<T: Copy> Register<T,
  ReadOnly>`) matches **any** concrete argument at the same position.
- A concrete slot (like `ReadOnly`) must match the receiver's
  corresponding argument structurally.
- A receiver whose slot is still a type variable stays permissive so
  inference isn't pinned prematurely.

## Where clauses

When bounds get complex, move them to `where`:

```verum
fn process<T, U>(xs: List<T>, f: fn(T) -> U) -> List<U>
    where T: Clone + Debug,
          U: Eq,
          type U.Item: Display      // associated-type bound
{
    xs.iter().map(|x| f(x.clone())).collect()
}
```

Four clause forms stack on one function — two under `where`
(bounds / meta) and two as bare keywords on their own signature
lines (contract clauses):

- `where T: Bound` — generic constraints (after the `where` keyword).
- `where meta <expr>` — compile-time predicates on generics.
- `requires <expr>` — runtime precondition. Bare, on its own
  signature line; repeat the keyword for multiple preconditions
  (no comma-joining).
- `ensures <expr>` — runtime postcondition. Bare; one keyword per
  clause (no comma-joining).

`where requires` / `where ensures` forms that combine a `where`
prefix with the contract keyword do **not** parse today — use the
bare forms.

See [language/functions](/docs/language/functions#contracts) and
[verification → contracts](/docs/verification/contracts) for the
full grammar.

## Const generics

Parameters that are **compile-time values**:

```verum
type Matrix<const R: Int, const C: Int, T> is {
    data: [[T; C]; R],
};

fn identity<const N: Int, T: Numeric>() -> Matrix<N, N, T> {
    let mut m = Matrix { data: [[T.zero(); N]; N] };
    for i in 0..N { m.data[i][i] = T.one(); }
    m
}

// Usage:
let m3: Matrix<3, 3, Float> = identity::<3, Float>();
```

Const generics can carry **refinements**:

```verum
type RingBuffer<const N: Int { self > 0 }, T> is {
    data: [T; N],
    head: Int { 0 <= self && self < N },
    len:  Int { 0 <= self && self <= N },
};
```

The refinement `N > 0` is checked at every instantiation; `identity::<0, Float>()`
is a compile error.

### Const expressions in generic positions

```verum
fn double_sized<const N: Int>(xs: [Int; N]) -> [Int; N * 2] { ... }

type Concat<const A: Int, const B: Int, T> is [T; A + B];
```

The grammar restricts const expressions in type positions to a
**bounded arithmetic fragment** — `+`, `-`, `*`, `/`, and references
to other const generics. Anything more complex requires an explicit
`const fn` evaluation.

## Higher-kinded types (HKT)

Type constructors — types that take types — are first-class:

```verum
type Functor<F<_>> is protocol {
    fn map<A, B>(x: F<A>, f: fn(A) -> B) -> F<B>;
};

implement Functor<Maybe> for Maybe {
    fn map<A, B>(x: Maybe<A>, f: fn(A) -> B) -> Maybe<B> {
        match x {
            Maybe.Some(a) => Maybe.Some(f(a)),
            Maybe.None    => Maybe.None,
        }
    }
}
```

`F<_>` is a type constructor of kind `Type -> Type`.
`F<A>` applies it.

### Explicit kind annotations

Two equivalent syntaxes:

```verum
// Placeholder form:
type Functor<F<_>> is protocol { ... };

// Kind-annotation form:
type Functor<F: Type -> Type> is protocol { ... };
```

Higher kinds:

```verum
type Arr<F: Type -> Type, G: Type -> Type> is protocol {
    fn run<A>(x: F<A>) -> G<A>;
};

type HigherOrder<F: (Type -> Type) -> Type> is protocol { ... };
```

## Existential types

Hide concrete type behind protocol bounds:

```verum
fn make_iter() -> some I: Iterator<Item = Int> {
    (0..10).filter(|n| n % 2 == 0)
}
```

The caller sees "*some* iterator of `Int`" — they can iterate, but
they don't know the concrete type. `some` differs from `impl`:

- `impl T` — existential return type; callers can use the value.
- `some T` (in bound position) — universal consumption; caller
  promises to handle any `T` bound by the protocol.
- `dyn T` — runtime polymorphism via vtable; less efficient but
  heterogeneous collections work.

Existential type aliases:

```verum
type Plugin is some P: PluginInterface;
```

See [language/types](/docs/language/types#existential-opaque-types).

## Type-level functions

Compute types from types at compile time:

```verum
type Apply<F<_>, A> = F<A>;

type ListOr<T> = List<Maybe<T>>;
```

The right side is a type expression using the parameters; there's
no function body to run — the compiler substitutes at instantiation.

## Meta parameters

Compile-time values with refinements, usable in types:

```verum
fn ring_buffer<n: meta Int { n > 0 }>() -> RingBuffer<n> { ... }

fn statically_sized_vec<dim: meta Int>() -> Vector<dim>
    where meta dim > 0 && dim <= 4
{ ... }
```

`n: meta Int` declares `n` as a compile-time value of type `Int`.
`where meta <expr>` adds a compile-time constraint; it's evaluated
during monomorphisation.

## Context parameters

A function can abstract over *which* context it uses:

```verum
fn forward<using C>(msg: Message) using [C, Logger]
    where C: MessageSink
{
    C.send(msg);
    Logger.info("forwarded");
}

// Callers specialise:
forward::<Kafka>(msg);
forward::<Redis>(msg);
```

Context polymorphism lets you write higher-order combinators that
**propagate** contexts from callback to caller:

```verum
fn map_context<T, U, using C>(
    items: List<T>,
    f: fn(T) -> U using C,
) -> List<U>
    using [C]       // caller must provide C too
{
    items.iter().map(f).collect()
}
```

## Rank-2 polymorphism

Some function types quantify internally — the **caller cannot pick
the inner type parameter**:

```verum
type Transducer<A, B> is {
    transform: fn<R>(Reducer<B, R>) -> Reducer<A, R>,
};
```

`fn<R>(...) -> ...` reads "for every `R`, this function produces…"
The caller supplies a `Reducer` for an `R` of *its* choice; the
transducer does not know `R` in advance.

Rank-2 is how Verum expresses:

- **Transducers** (data-independent stream transformers).
- **CPS combinators** that work for any answer type.
- **Stream fusion** primitives.

See [cookbook/calc-proofs](/docs/cookbook/calc-proofs) for a rank-2
example building a verified fold-combinator.

## Lifetime / region parameters

CBGR makes lifetimes mostly implicit, but they can be named
explicitly when they appear in signatures:

```verum
fn longest<'r>(a: &'r Text, b: &'r Text) -> &'r Text {
    if a.len() >= b.len() { a } else { b }
}
```

In practice, lifetime-annotated signatures are **rare** in Verum;
CBGR and escape analysis handle the common cases automatically. Use
explicit lifetimes when:

- The function returns a reference whose lifetime relates to multiple
  inputs in a non-obvious way.
- You want to document a lifetime relationship at the API boundary.

## Universe polymorphism

For dependent-type-heavy code, universe polymorphism prevents
"Type is too big for itself" paradoxes:

```verum
fn id<universe u, A: Type(u)>(x: A) -> A { x }
```

`u` is a universe level; `Type(u)` is the type of types at level `u`.
A polymorphic `id` works for types in `Type(0)` (ordinary values),
`Type(1)` (types themselves), or higher.

Alternative spelling using a `Level` bound:

```verum
fn id<u: Level, A: Type(u)>(x: A) -> A { x }
```

Most code never touches universes — only proof-heavy code and
dependently-typed libraries need them. See
[language/dependent-types](/docs/language/dependent-types).

## Defaults on generic parameters

```verum
type Config<T = DefaultConfig> is { ... };
type HashMap<K, V, H: Hasher = FxHasher> is { ... };
```

The default is used when the caller omits the type argument:

```verum
let m: HashMap<Text, Int> = HashMap.new();
// H is FxHasher by default

let m: HashMap<Text, Int, SipHasher> = HashMap.new();
// H explicitly SipHasher
```

## Coherence and orphan rules

`implement P for T` is rejected unless *either*:

- `T` is defined in the current cog, *or*
- `P` is defined in the current cog.

This is the **orphan rule**: prevents two cogs from implementing the
same protocol for the same external type in incompatible ways.

A specialisation hierarchy allows *more specific* impls to override
*less specific* ones:

```verum
implement<T: Display> MyProto for T { ... }          // generic impl
@specialize
implement MyProto for Text { ... }                    // wins when T = Text
```

See [language/protocols](/docs/language/protocols#specialisation).

## Generic unification gotchas

### `T: U` instead of `T = U`

`T: U` is a bound (*T implements U*). `T = U` is an equality
constraint (*T is the same type as U*). They look similar but do
different things:

```verum
where T: Into<U>     // T can be converted to U
where T = U          // T is literally U (restrictive)
```

### Variance

Verum does not expose variance annotations on type parameters.
Subtyping between `Container<T>` and `Container<U>` requires `T = U`
except for a few standard-library types (`&T` covariant in `T`,
`fn(T) -> U` contravariant in `T` + covariant in `U`). This keeps
the type system simple; at the cost of a few conversions you'd
otherwise get for free.

### Type inference depth

Deeply nested generics can stall inference. Annotate intermediate
types when the solver complains:

```verum
let processed: List<Result<Parsed, Error>> =
    raw.iter()
       .map(|x| parse(x))
       .collect();
```

## See also

- **[Types](/docs/language/types)** — the type grammar.
- **[Protocols](/docs/language/protocols)** — associated types, GATs.
- **[Dependent types](/docs/language/dependent-types)** — Σ / Π / path.
- **[Capability types](/docs/language/capability-types)** — `T with [...]`.
- **[Refinement types](/docs/language/refinement-types)** —
  refinements on parameters.
