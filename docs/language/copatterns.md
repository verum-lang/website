---
sidebar_position: 29
title: Copatterns & Coinduction
description: Infinite data structures via observations — `cofix`, copattern bodies, and productivity.
---

# Copatterns & Coinduction

Most data in Verum is **inductive**: built by constructors, consumed by
pattern matching. Lists are `Nil | Cons(head, tail)`; you build them
bottom-up, you destructure top-down.

Coinductive data is the opposite: **built by observations, consumed
one step at a time, potentially infinite**. A `Stream<Int>` is not a
finite list of integers — it is a promise to answer, for every natural
number *n*, "what is the nth element?".

Verum's syntax for this is the `cofix` function modifier with a
**copattern body**.

## The basic shape

Inductive definition, for contrast:

```verum
type List<T> is Nil | Cons(head: T, tail: Heap<List<T>>);

fn range(lo: Int, hi: Int) -> List<Int> {
    if lo >= hi { List.Nil }
    else        { List.Cons(lo, Heap.new(range(lo + 1, hi))) }
}
```

Coinductive — a `Stream<T>` defined by its observations `.head` and
`.tail`:

```verum
type Stream<T> is protocol {
    fn head(&self) -> T;
    fn tail(&self) -> Stream<T>;
};

cofix fn nats_from(n: Int) -> Stream<Int> {
    .head => n,
    .tail => nats_from(n + 1),
}
```

Each arm answers one observation. The whole value is the *observation
function*: ask `.head`, get `n`; ask `.tail`, get the continuation.

The resulting stream is lazy — no work happens until an observation
fires. `nats_from(0).tail().tail().head()` evaluates to `2` without
constructing an infinite list.

## Grammar

```ebnf
fn_keyword      = 'fn' , [ '*' ] ;
function_modifiers = [ 'pure' ] , [ meta_modifier ] , [ 'async' ]
                   , [ 'cofix' ] , [ 'unsafe' ] | epsilon ;

copattern_body  = '{' , copattern_arm , { ',' , copattern_arm } , [ ',' ] , '}' ;
copattern_arm   = '.' , identifier , '=>' , expression ;
```

The body is *only* valid on functions marked `cofix`. Each arm pairs
an **observation** — a `.name` referring to a protocol method — with
the expression to return when that observation fires.

## Productivity

For a `cofix fn` to be well-defined, every observation must **make
progress** — it must produce *something* before recursing. The
productivity check is structural:

```verum
cofix fn ones() -> Stream<Int> {
    .head => 1,                 // progress: delivers 1
    .tail => ones(),            // tail-call into self, but .head was served
}
```

A definition that recurses in `.head` without a guarding constructor
is meant to be rejected:

```verum
cofix fn bad() -> Stream<Int> {
    .head => bad().head(),       // no progress
    .tail => bad(),
}
```

This is the dual of induction's termination check: induction demands
the input shrink; coinduction demands the output grow.

:::warning A copattern arm body is not checked — write it with care
Re-measured 2026-09-05, and the finding is worse than the one this note
carried before. On 2026-09-04 a copattern body produced an inference
error. It now produces **silence**: the arm bodies are not checked at
all, neither their types nor their names.

    cofix fn spin() -> Stream<Int> { .head => "not an int", .tail => spin() }
      -> accepted, by `verum check` AND `verum build`

    cofix fn spin() -> Stream<Int> { .head => undefined_name_xyz, ... }
      -> accepted

    fn plain() -> Int { "not an int" }        // the control
      -> error<E400>: Type mismatch: expected 'Int', found 'Text'

The control fails in the same invocation, so the checker is running —
the silence is specific to copattern arms.

The productivity check inherits the silence. `spin()` with every
self-call unguarded — `.head => spin().head(), .tail => spin().tail()` —
is accepted, so **nothing on this page rejects an unproductive
definition today**. `check_cofix_productivity` is wired and reachable;
it has nothing to work on. Tracked as A79.

Read the examples below as the shape of the definition. The compiler
will not catch a mistake inside an arm for you yet.
:::

## Coinductive protocols

The protocol a `cofix` function answers against is ordinary:

```verum
type Stream<T> is protocol {
    fn head(&self) -> T;
    fn tail(&self) -> Stream<T>;
};

type Conway is protocol {
    fn value(&self) -> Int;
    fn left(&self)  -> Conway;
    fn right(&self) -> Conway;
};
```

Any protocol whose methods return the same protocol (or another
coinductive type) is admissible as a `cofix` target.

## Worked example: Hamming numbers

The Hamming sequence (numbers of the form 2^i · 3^j · 5^k) is a
textbook coinductive definition.

:::caution This example does not compile today
It is written the way the feature is meant to read, not the way it
currently behaves. Two things are missing, both measured 2026-09-04:

* copattern arm bodies are not checked at all (the warning above), so
  `hamming()` does not typecheck — it is *accepted without being
  checked*, which is not the same thing and is worse;
* `merge3` and `map_stream` are declared nowhere in `core/`, and
  `.take(10)` is not available here: the `Stream<T>` protocol on this
  page declares `.head` and `.tail` and nothing else. (`core.async.
  stream` does have a `take`, on a different, asynchronous `Stream` —
  which is why the call reads as though it should work.)

Read it as the shape of the definition. The `.head`/`.tail` walk in
the section above is the part you can write today.
:::

```verum
cofix fn hamming() -> Stream<Int> {
    .head => 1,
    .tail => merge3(
        map_stream(|n| n * 2, hamming()),
        map_stream(|n| n * 3, hamming()),
        map_stream(|n| n * 5, hamming()),
    ),
}

fn main() {
    let first_ten: List<Int> = hamming().take(10).collect();
    // [1, 2, 3, 4, 5, 6, 8, 9, 10, 12]
    print(first_ten);
}
```

## Combinators: `take`, `zip`, `map_stream`

A coinductive library looks familiar:

```verum
cofix fn map_stream<A, B>(f: fn(A) -> B, s: Stream<A>) -> Stream<B> {
    .head => f(s.head()),
    .tail => map_stream(f, s.tail()),
}

cofix fn zip<A, B>(a: Stream<A>, b: Stream<B>) -> Stream<(A, B)> {
    .head => (a.head(), b.head()),
    .tail => zip(a.tail(), b.tail()),
}

fn take<T>(s: Stream<T>, n: Int) -> List<T> {
    if n == 0 { List.new() }
    else      { List.prepend(s.head(), take(s.tail(), n - 1)) }
}
```

`take` is ordinary (inductive): it peels a finite prefix off the
stream. You consume a coinductive value with inductive recursion and
produce it with coinductive recursion — the two never mix on the same
side of the definition.

## Bisimulation proofs

To prove two streams equal you need bisimulation: agreement on `.head`,
and a bisimulation on the two `.tail`s. The verifier implements it —
`verum_smt::coinductive::CoinductiveChecker` discharges stream equality
through Z3 — but it is reachable only from Rust today. There is no
surface tactic: `bisimulation` appears nowhere in `grammar/verum.ebnf`,
and the block below is rejected with `expected proof step (have, show,
suffices, let, obtain, …)`.

The shape the surface syntax is meant to take:

```verum
// not yet supported: `bisimulation` is not a surface tactic — see above
theorem nat_plus_zero(n: Int)
    ensures nats_from(n) == map_stream(|x| x + 0, nats_from(n))
{
    proof by bisimulation {
        head_step => by omega,
        tail_step => by induction,
    }
}
```

See [verification/cubical-hott](/docs/verification/cubical-hott) for
path equalities between coinductive values and the `cubical` tactic.

## `cofix` and `async`

`cofix` composes with `async`. An async-coinductive function produces
a `Stream` whose observations perform I/O:

```verum
async cofix fn readings() -> AsyncStream<Reading>
    using [SensorBus]
{
    .head => bus.read().await,
    .tail => readings(),
}
```

Each observation performs a bus read; the stream is infinite until
the underlying bus fails.

## Relationship with generators (`fn*`)

Generators (`fn*`) are the imperative counterpart. A generator uses
`yield` to produce values step by step, but its shape is a
**function** whose control returns to the caller at each yield point.
A `cofix` definition is **data**: an object answering observations on
demand.

| Feature                           | `fn* generator`        | `cofix` stream        |
|-----------------------------------|------------------------|-----------------------|
| Shape                             | imperative with `yield`| observational         |
| Required protocol                 | `Iterator`             | user-defined          |
| Natural result                    | `Iterator<T>`          | coinductive type      |
| Bisimulation proofs               | indirect               | direct via `cofix`    |
| Composes with `async`             | yes                    | yes                   |

Use generators for control-flow-heavy producers; use `cofix` for
data-flow-heavy infinite values.

## See also

- **[Patterns](/docs/language/patterns)** — for **inductive** destructuring.
- **[Functions → generators](/docs/language/functions#generator-functions)**.
- **[Proof DSL](/docs/language/proof-dsl)** — `bisimulation` tactic.
- **[verification/cubical-hott](/docs/verification/cubical-hott)**.
