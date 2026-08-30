---
sidebar_position: 8
title: One service, every feature
description: A package registry built with the features Verum has and most languages do not — each one earning its place on a real rule.
---

# One service, every feature

A package registry is a good place to see what Verum is for. It has rules
that matter and are easy to state: a published version never goes
backwards, an upload token is spent once, a signature must be recorded,
time is an input rather than an ambient fact. Every rule below is
expressed in the type system or proved by the compiler, and each section
says what the alternative would have cost.

Nothing here is aspirational — the code is compiled and run.

## The invariant lives in the type

```verum
type Component is n: Int where n >= 0;

type Version is {
    major: Component,
    minor: Component,
    patch: Component,
};
```

A *refinement type* carries its predicate. `Component` is not "an `Int`
that we validate in the constructor" — it is the integers that are not
negative, and the compiler knows that everywhere the type appears.

The alternative is a smart constructor plus a comment, and the invariant
has to be re-established at each use site because the type has forgotten
it.

## The central rule is proved, not tested

```verum
pure fn rank(v: Version) -> Int
    ensures result >= 0
{
    v.major * 1000000 + v.minor * 1000 + v.patch
}

pure fn bump_patch(v: Version) -> Version
    ensures result.patch > v.patch
{
    Version { major: v.major, minor: v.minor, patch: v.patch + 1 }
}
```

`ensures` is discharged by an SMT solver for **all** inputs. A test suite
samples; this does not.

When a postcondition does not hold, the compiler does not merely refuse —
it hands back the values that break it:

```
✗ bump: Failed
   Counterexample:
     major = 0
     result = 1
   Violates: postcondition violation
```

That is the difference between "your proof failed" and "here is your
counterexample."

## Spending a token is a compile-time property

```verum
type affine UploadToken is { nonce: Int };

fn publish(store: &mut MemStore, name: Text, next: Version, token: UploadToken) -> Bool {
    let spent = token.nonce;
    // …
}
```

Replaying a publish token is a supply-chain attack. `affine` makes the
second use a **compile error**, caught where the mistake is written —
rather than a uniqueness constraint discovered on the far side of a
network call, after the second request has already been accepted.

## Losing an audit record is also a compile error

```verum
type linear Receipt is { entry: Int };
```

Verum separates two obligations that most languages merge:

| Modifier | Obligation | Dropping it |
|---|---|---|
| `affine` | at most once | allowed — the client gave up |
| `linear` | exactly once | **rejected** — the record would be lost |

```
error<E303>: linear value `r` must be consumed exactly once
```

Rust's move semantics give you the first row. The second — a value that
may not be quietly dropped — is what a transparency log needs, and it is
a different guarantee.

## The compiler decides what is pure

```verum
pure fn name_is_valid(n: PackageName) -> Bool {
    let len = n.text.len();
    len > 0 && len <= 64
}
```

Five computational properties — `Pure`, `IO`, `Async`, `Fallible`,
`Mutates` — are **inferred from the body**. `pure` is not a promise the
compiler takes on faith; it is a claim it checks:

```
pure fn a() -> Int { print("x"); 1 }         E503 … side effects: IO
pure fn b() -> Int { impure_helper() }       E503 … side effects: IO
pure fn c() -> Int { spawn { 1 }; 2 }        E503 … side effects: Spawns
pure fn d(x: &mut Int) -> Int { *x = 1; 1 }  E503 … side effects: Mutates
```

Note what is *not* refused: a `pure fn` may assign to its own locals. A
loop accumulating into `let mut acc` is as pure as the fold it is written
out from, because no caller can observe it. The property tracks
observable effects, not syntax.

In Haskell this layering is done by hand with monad transformers. Here it
is inferred, and the annotation is checked against the inference.

## Time is an input, not an ambient fact

```verum
context Clock {
    fn now(&self) -> Int;
}

fn stamp(version: Int) -> Stamped using [Clock] {
    Stamped { version: version, at: Clock.now() }
}

fn main() {
    provide Clock = FixedClock { at: 1700000000 };
    let s = stamp(3);
}
```

The `using [Clock]` clause is part of the signature: a reader sees which
ambient capabilities a function needs, and a test provides a fixed clock
without touching the code under test.

This is dependency injection as a language construct rather than a
framework. No container, no global, no reflection — and the requirement
is visible in the type.

## Three tiers of reference, chosen per use

| Tier | Syntax | Cost | When |
|---|---|---|---|
| 0 | `&T` | ~15 ns | default — full generational protection |
| 1 | `&checked T` | 0 | the compiler proved the lifetime |
| 2 | `&unsafe T` | 0 | you proved it; you carry the obligation |

Most languages offer one of these and make you accept its price
everywhere. Here the choice is per reference, and the default is the safe
one.

## What this adds up to

Each feature above replaced something: a validation comment, a test that
samples, a database constraint, a code-review convention, a mocking
framework, a global. That is the point — not that the language has many
features, but that each one takes over a job the alternative was doing
badly.
