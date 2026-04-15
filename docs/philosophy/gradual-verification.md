---
sidebar_position: 3
title: Gradual Verification
---

# Gradual Verification

Verification is a spectrum. A single Verum program typically spans it.

## The five levels

Every function (and many other items) can be annotated with a verification
strategy via `@verify(...)`:

| Level         | What runs                                      | Typical cost       |
| ------------- | ---------------------------------------------- | ------------------ |
| `runtime`     | `assert`, bounds checks, refinement as panics  | microseconds       |
| `static`      | dataflow, CBGR, refinement typing              | compile time       |
| `smt`         | above + SMT dischargeable obligations          | 10 ms – 10 s per obligation |
| `portfolio`   | Z3 **and** CVC5, cross-validated               | 2× SMT cost        |
| `certified`   | proof terms machine-checked against axioms     | variable           |

Unannotated code defaults to `static` — you always get dataflow and
CBGR, you opt into SMT for the predicates you care about.

## Why a spectrum

Some invariants must hold. A kernel page-table walker, a consensus
protocol's safety lemma, a cryptographic key-schedule — these earn
`@verify(portfolio)` or `@verify(certified)`.

Most code should hold. Business logic, CRUD handlers, data pipelines —
these earn `@verify(static)` or `@verify(smt)`. A predicate that
"should" be true becomes one that _is_ true, checked before you ship.

Prototype code does not yet know what it wants to hold. For this,
`@verify(runtime)` is honest. An `assert` in development becomes an
obligation once the design settles.

## A realistic mixture

```verum
// Hot path, aggressively proven.
@verify(portfolio)
pub fn verify_signature(msg: &[Byte], sig: &Signature, pk: &PublicKey) -> Bool
    where ensures result => pk.verifies(msg, sig)
{ ... }

// Ordinary code — static + SMT when applicable.
pub fn format_duration(d: Duration) -> Text { ... }

// Prototype; refine later.
@verify(runtime)
fn experimental_retry_policy(attempt: Int) -> Duration { ... }
```

## Moving up the ladder

Promotion is mechanical. Start at `runtime`. The compiler reports
which assertions in your tests would be dischargeable statically.
Annotate them. Next, annotate your invariants with refinement types or
`ensures` clauses. The compiler emits SMT obligations; Z3 or CVC5
proves them. Finally, for the critical slice, request `portfolio` or
`certified`.

At each step the code does not change — only the guarantee does.

## What gradual does not mean

Gradual verification is not "pay more to get more." SMT discharge is
free at runtime (obligations are erased). What you pay for is compile
time and the cognitive cost of writing an invariant down. The
_product_ — the binary — is often smaller when more is proved, because
redundant runtime checks fall away.
