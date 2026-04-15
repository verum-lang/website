---
sidebar_position: 1
title: Gradual Verification
---

# Gradual Verification

> A single program spans the verification spectrum — runtime checks
> for prototypes, static analysis for ordinary code, SMT for critical
> invariants, certified proofs for the kernel.

## The five levels

```
runtime  →  static  →  smt  →  portfolio  →  certified
```

| Level         | What is checked                                     | Cost at compile | Cost at runtime |
| ------------- | --------------------------------------------------- | ---------------- | --------------- |
| `runtime`     | `assert`, bounds, refinements as panics             | trivial          | each assertion |
| `static`      | dataflow, CBGR, refinement typing                   | ms – sec         | 0               |
| `smt`         | above + SMT obligations discharged                  | sec per fn       | 0               |
| `portfolio`   | Z3 + CVC5, cross-validated                          | 2× smt           | 0               |
| `certified`   | proof terms machine-checked against axioms          | variable         | 0               |

Default: `static`. Functions get dataflow + CBGR + refinement checking
out of the box.

## Requesting a level

```verum
@verify(runtime)   fn prototype()   { ... }
@verify(static)    fn ordinary()    { ... }
@verify(smt)       fn critical()    { ... }
@verify(portfolio) fn safety()      { ... }
@verify(certified) fn kernel()      { ... }
```

At the project level, set a default:

```toml
# Verum.toml
[verification]
default_level = "smt"
```

## What each level actually does

### `runtime`

Refinements become `assert`s. `ensures` clauses become post-return
checks. If a runtime check fails, the task panics. Useful for rapid
iteration.

### `static`

- **Dataflow**: narrow types by control flow (`if x > 0 { ... }`
  strengthens `x` inside the branch).
- **CBGR**: generation-check elision, escape analysis, reference-tier
  promotion.
- **Refinement typing**: refinement predicates checked via subtyping
  rules, no solver calls (fast path for the obvious cases).

### `smt`

When a refinement or contract cannot be discharged syntactically, the
compiler translates it to SMT-LIB and calls Z3 or CVC5 (chosen by the
capability router; see **[SMT routing](/docs/verification/smt-routing)**).

Obligations are cached (a proof is valid until the function's source
or its dependencies change). Compile-time is linear in the number of
new obligations.

### `portfolio`

Both Z3 and CVC5 independently discharge every obligation. The
compiler confirms they agree; a disagreement is treated as a bug in
one of the solvers and reported with full context.

Portfolio mode is the recommended setting for critical infrastructure:
kernel components, cryptographic primitives, consensus invariants.

### `certified`

The developer supplies a proof term; the compiler machine-checks it
against the obligation. Tactics (`auto`, `induction`, `cases`, `ring`,
`omega`) generate proofs for routine obligations.

## Proof obligations

When the compiler cannot discharge an obligation syntactically it
produces an obligation that looks like:

```
obligation binary_search/postcond at src/search.vr:25:5
  context:
    xs: List<Int>
    key: Int
    result: Maybe<Int>
  goal:
    result is Some(i) => xs[i] == key
```

The obligation is dispatched to the solver(s) per the function's
verification level.

## Caching

Proof results are cached keyed on the obligation's SMT-LIB
fingerprint. A source edit that does not change a function's
obligations does not re-run the solver. You can inspect the cache:

```bash
$ verum proof-cache stats
  cached obligations: 14,221
  hit rate (this build): 92.4%
  average proof time: 34 ms
  slowest: binary_search/postcond  (2.3 s, cvc5)
```

## Moving up the ladder

There is no flag-day. Functions can upgrade independently:

1. Write at `@verify(runtime)`.
2. Annotate invariants; the compiler reports what it could prove
   statically.
3. Fill in `ensures` / refinement types for the invariants you care
   about. Upgrade to `@verify(smt)`.
4. For the critical 1% of functions, upgrade to `@verify(portfolio)`.
5. For the critical 0.01%, supply proof terms.

## See also

- **[Refinement reflection](/docs/verification/refinement-reflection)**
  — making `@logic` functions available to the solver.
- **[SMT routing](/docs/verification/smt-routing)** — how Z3 and
  CVC5 divide the work.
- **[Contracts](/docs/verification/contracts)** — `requires`,
  `ensures`, `invariant`.
- **[Proofs](/docs/verification/proofs)** — the tactic DSL.
- **[Cubical & HoTT](/docs/verification/cubical-hott)** — higher
  equational reasoning.
