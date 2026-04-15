---
sidebar_position: 7
title: Generics
---

# Generics

Generics in Verum parameterise items by types, const values, lifetimes,
kinds, and context capabilities.

## Type parameters

```verum
type Pair<A, B>            is { first: A, second: B };
fn swap<A, B>(p: Pair<A,B>) -> Pair<B, A> { Pair { first: p.second, second: p.first } }
```

## Bounds

```verum
fn max<T: Ord>(a: T, b: T) -> T {
    if a > b { a } else { b }
}

fn serialise<T: Serialize + Send + !Sync>(x: T) -> List<Byte> { ... }
```

- `T: Bound1 + Bound2` — intersection.
- `T: !Bound` — negative bound.

## Where clauses

When bounds get complex, move them to `where`:

```verum
fn process<T, U>(xs: List<T>, f: fn(T) -> U) -> List<U>
    where T: Clone + Debug,
          U: Eq,
{
    xs.iter().map(|x| f(x.clone())).collect()
}
```

## Const generics

```verum
type StaticMatrix<const R: Int, const C: Int, T> is { data: [[T; C]; R] };

fn identity<const N: Int, T: Numeric>() -> StaticMatrix<N, N, T> {
    let mut m = StaticMatrix { data: [[T.zero(); N]; N] };
    for i in 0..N { m.data[i][i] = T.one(); }
    m
}
```

Const generics can carry refinements:

```verum
fn buffer<const N: Int { self > 0 }, T>() -> [T; N] { ... }
```

## Higher-kinded parameters

```verum
type Functor<F<_>> is protocol {
    fn map<A, B>(x: F<A>, f: fn(A) -> B) -> F<B>;
};
```

`F<_>` is a type constructor of kind `Type -> Type`. `F<A>` applies it.
Explicit kind annotations look like:

```verum
type Natural<F: Type -> Type, G: Type -> Type> is protocol {
    fn transform<A>(x: F<A>) -> G<A>;
};
```

## Meta parameters

Compile-time values with refinements, available in types:

```verum
fn ring_buffer<n: meta Int { n > 0 }>() -> RingBuffer<n> { ... }
```

## Context parameters

A function can abstract over _which_ context it uses:

```verum
fn forward<using C>(msg: Message) using [C, Logger]
    where C: MessageSink
{
    C.send(msg);
    Logger.info("forwarded");
}
```

## Rank-2 polymorphism

Some function types quantify internally — the caller cannot pick the
inner type parameter:

```verum
type Transducer<A, B> is {
    transform: fn<R>(Reducer<B, R>) -> Reducer<A, R>,
};
```

`fn<R>(...)` reads "for every `R`, this function can produce..." The
caller supplies a `Reducer` for some `R` of _its_ choice; the
transducer does not know `R` in advance.

## Lifetime / region parameters

CBGR makes lifetimes mostly implicit, but they can be named explicitly
when they appear in signatures:

```verum
fn longest<'r>(a: &'r Text, b: &'r Text) -> &'r Text {
    if a.len() >= b.len() { a } else { b }
}
```

In practice, lifetime-annotated signatures are rare in Verum; CBGR and
escape analysis handle the common cases automatically.

## Universe polymorphism

For dependent-type-heavy code, universe polymorphism prevents "Type is
too big for itself" paradoxes:

```verum
fn id<universe u, A: Type(u)>(x: A) -> A { x }
```
