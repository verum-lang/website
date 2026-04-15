---
sidebar_position: 5
title: Proofs
---

# Proofs

When SMT cannot discharge an obligation — because the theory is
undecidable, the quantifier structure is hard, or the invariant
requires induction — you write a **proof term**.

Verum's proof DSL is inspired by Coq's tactics and Lean's term-mode
proofs, but integrated directly into the language.

## Theorem, lemma, axiom

```verum
theorem reverse_reverse<T>(xs: List<T>) -> xs.reverse().reverse() == xs {
    by induction xs {
        case [] => qed;
        case [x, ..rest] => {
            have h: rest.reverse().reverse() == rest by ih;
            calc {
                [x, ..rest].reverse().reverse()
              = (rest.reverse() ++ [x]).reverse()       by def reverse;
              = [x] ++ rest.reverse().reverse()         by reverse_append;
              = [x] ++ rest                             by h;
              = [x, ..rest]                             by def concat;
            };
            qed
        }
    }
}
```

- **`theorem`** — a named proof used in further verification.
- **`lemma`** — a local helper (same as `theorem`, lower visibility).
- **`axiom`** — an unchecked assertion. Used sparingly.
- **`corollary`** — syntactic sugar for "follows from X".

## Tactics

```
qed                 // discharge a trivially true goal
auto                // try SMT + common decision procedures
ring                // ring-axiom rewriting (for arithmetic)
omega               // linear integer arithmetic
simp [rules]        // simplification rewriting
induction x         // induct on x
cases x             // case-split on x
contradiction       // derive false from hypotheses
rewrite [= lemma]   // rewrite using a lemma
apply  lemma        // apply a named lemma
have   h : T by ... // introduce a local assumption with proof
show   goal         // assert what we're proving
suffices T by ...   // reduce to showing T
obtain (a, b) by ex // destructure an existential
```

## `calc` — equational reasoning

```verum
theorem sum_first_n(n: Int { self >= 0 }) -> sum(0..=n) == n * (n+1) / 2 {
    by induction n {
        case 0 => qed;
        case k + 1 => {
            calc {
                sum(0..=k+1)
              = sum(0..=k) + (k+1)       by def sum;
              = k*(k+1)/2 + (k+1)        by ih;
              = (k+1)*(k+2)/2            by ring;
            };
            qed
        }
    }
}
```

## Machine checking

`@verify(certified)` requires a proof term; the compiler machine-checks
it against the obligation via `verum_verification::proof_validator`. A
valid proof is permanent — it does not need to be rechecked unless the
underlying axioms change.

## Proof-carrying bytecode

Verum's VBC format optionally embeds proof certificates alongside the
bytecode (via `verum_smt::proof_carrying_code`). A consumer of the
module can:

- verify the proofs independently (without re-running the compiler);
- trust the certificate and skip verification;
- reject the module if the certificate is invalid.

This enables distribution of verified libraries whose consumers can
audit proofs offline.

## Building a proof bottom-up

1. Start with `by auto` and see how far SMT gets.
2. If it fails, examine the counter-example.
3. Introduce lemmas (`have h: T by ...`) that decompose the problem.
4. Induct where needed.
5. Reach `qed`.

Typical experienced-user workflow: 60% of obligations are `by auto`,
30% are `by induction X; auto`, 10% need real work.

## Common patterns

### Structural induction on lists

```verum
lemma map_length<A, B>(xs: List<A>, f: fn(A) -> B) ->
    xs.map(f).len() == xs.len()
{
    by induction xs {
        case []            => qed;
        case [h, ..t]      => by rewrite ih; auto
    }
}
```

### Case analysis on sum types

```verum
lemma roundtrip(x: Maybe<Int>) -> from_maybe(to_maybe(x)) == x {
    by cases x {
        case None    => qed;
        case Some(n) => qed;
    }
}
```

### Contradiction

```verum
lemma no_negative_length(xs: List<T>) -> xs.len() >= 0 {
    by contradiction {
        assume xs.len() < 0;
        // ... derive absurdity from how len() is defined
        qed
    }
}
```

## Tactic extensibility

Users can define custom tactics via `meta fn` (see
**[Metaprogramming](/docs/language/metaprogramming)**):

```verum
@tactic
meta fn my_tactic(goal: quote) -> quote { ... }

theorem foo() -> ... {
    by my_tactic;
}
```

## See also

- **[Gradual verification](/docs/verification/gradual-verification)**
  — when to reach for proofs.
- **[Cubical & HoTT](/docs/verification/cubical-hott)** — proof
  techniques for path types.
- **[Architecture → SMT integration](/docs/architecture/smt-integration)**
  — how tactics invoke the solver.
