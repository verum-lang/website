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

`rank` is the interesting one: its argument is a record whose *fields*
carry the refinement, and the solver needs `v.major >= 0` — a fact that
lives on the field, not on the parameter. Until recently it did not
reach the solver at all and this proof silently failed, which is worth
saying out loud on a page about proofs. It reaches it now.

`bump_patch` still does not discharge: its postcondition names a field
of the *result*, and a `result` bound to a record literal does not yet
reach that literal's fields. Written here rather than quietly omitted —
a guide that shows only what works teaches you to trust it in the cases
where it should not be trusted.

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

## A size is part of the type

A registry stores digests. A full digest is 32 bytes and a display
preview is 8, and mixing them is the class of bug that ends with two
packages sharing an address.

```verum
type Digest<const N: Int> is { bytes: List<Int> };

pure fn address_of(d: Digest<32>) -> Int { 32 }
pure fn preview_width(d: Digest<8>) -> Int { 8 }
```

Passing the short one where the long one is wanted is a compile error,
and the compiler says which widths:

```
error<E400>: Type mismatch: expected '32', found '8'
```

Not a runtime assert, not a comment above the constant, not a review
convention. C++ reaches this with templates and pays in diagnostics;
most languages do not reach it at all.

## A claim about the design is a declaration

`requires` and `ensures` describe what one function promises. They
cannot describe what the design as a whole guarantees — "a republish can
never move a package backwards" is a claim about the *relationship*
between two operations, and there is no single function to hang it on.

In most languages such a claim lives in a design document and drifts.
Here it is a declaration the compiler discharges:

```verum
pure fn rank(major: Int, minor: Int, patch: Int) -> Int
    requires major >= 0, minor >= 0, patch >= 0
    ensures result >= 0
{
    major * 1000000 + minor * 1000 + patch
}

theorem minor_outranks_any_patch(major: Int, minor: Int, patch: Int)
    requires major >= 0, minor >= 0, patch >= 0, patch < 1000
    ensures rank(major, minor + 1, 0) > rank(major, minor, patch)
{
    proof by smt
}
```

That second one is the rule a registry gets wrong when it packs a
version into an integer with too little room: `1.2.1000` must not
overtake `1.3.0`. As a theorem, the field width becomes a *proven*
property of the encoding rather than a comment beside a constant —
change the `1000` in `rank` and the build stops.

A proof that cannot fail proves nothing, so here is the control.
Widening the bound to `patch < 2000` admits `patch = 1500`, the claim
stops holding, and the theorem is refused:

```
✓ theorem patch_bump_moves_forward: Proved
✗ theorem minor_outranks_any_patch: Failed
```

Theorems are discharged at compile time. Nothing runs them; what runs is
ordinary code that relies on what they established.

## Three tiers of reference, chosen per use

A registry mirror hands out package bytes. Copying them per request is
wasteful; handing out a raw pointer is how mirrors get CVEs. Most
languages answer that once, for the whole program:

- a garbage collector — safe, and you pay on every allocation forever;
- C — free, and the safety argument lives in a review convention;
- Rust — free and safe, but the lifetime must be provable at every step,
  so the shapes it cannot prove are not expressible.

Verum makes it a decision per reference, with a safe default:

```verum
// tier 0 — nothing written, and the reference is generation-checked
pure fn describe(b: &Blob) -> Text { b.name }

// tier 1 — the same access with the check removed BY PROOF
pure fn size_of(b: &checked Blob) -> Int { b.size }
```

| Tier | Syntax | Cost | Who carries the argument |
|---|---|---|---|
| 0 | `&T` | ~1 ns measured | the runtime — a generation compare on deref |
| 1 | `&checked T` | 0 | the compiler — escape analysis proved it |
| 2 | `&unsafe T` | 0 | you, and it is written down |

`&checked` is a stronger claim than `&T`, not a weaker one: a reference
the compiler cannot prove **cannot be spelled that way**.

```verum
fn leak() -> &checked Blob {
    let local = Blob { size: 1 };
    &checked local        // error<E312>: `local` does not live long enough
}
```

The tier set is closed, too — `&totallyfake T` is a parse error, not an
unknown modifier quietly ignored.

What matters is the direction of the burden. Tier 0 is what you get by
writing nothing, so the unconsidered case is the safe one, and dropping
to a cheaper tier is deliberate, local, and visible to a reader.


## What this adds up to

Each feature above replaced something: a validation comment, a test that
samples, a database constraint, a code-review convention, a mocking
framework, a global. That is the point — not that the language has many
features, but that each one takes over a job the alternative was doing
badly.
