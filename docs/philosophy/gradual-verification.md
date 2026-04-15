---
sidebar_position: 3
title: Gradual Verification
---

# Gradual Verification

Verification is a spectrum. A single Verum program typically spans it.

## The spectrum of strategies

Every function (and many other items) can be annotated with a
verification strategy via `@verify(...)`. The backend (Z3 / CVC5 /
portfolio) is picked by the capability router — you choose the
*intent*, not the solver. The nine real strategies:

| Strategy       | What runs | Typical cost |
|----------------|-----------|--------------|
| `runtime`      | `assert`, bounds, refinements as panics | per-call µs |
| `static`       | dataflow, CBGR, refinement typing | compile time |
| `formal`       | above + SMT dischargeable obligations (default for `@verify` without args) | 10 ms – 10 s per obligation |
| `proof`        | alias of `formal` — emphasises extracting the proof term | same |
| `fast`         | formal with tight timeout (0.3×); hard goals fall back to runtime | cheap |
| `thorough`     | races Z3 + CVC5 + tactic search in parallel | 2× formal |
| `reliable`     | alias of `thorough` | same |
| `certified`    | thorough **plus** orthogonal cross-validation with exportable proof certificate | 3× formal |
| `synthesize`   | generates a term satisfying the specification | 5× formal |

Unannotated code defaults to `static` — you always get dataflow and
CBGR, you opt into solver work for the predicates you care about.
See **[reference → attribute registry](/docs/reference/attribute-registry#verification)**
for the full grammar definition.

## Why a spectrum

Some invariants must hold. A kernel page-table walker, a consensus
protocol's safety lemma, a cryptographic key-schedule — these earn
`@verify(thorough)` or `@verify(certified)`.

Most code should hold. Business logic, CRUD handlers, data pipelines —
these earn `@verify(static)` or `@verify(formal)`. A predicate that
"should" be true becomes one that _is_ true, checked before you ship.

Prototype code does not yet know what it wants to hold. For this,
`@verify(runtime)` is honest. An `assert` in development becomes an
obligation once the design settles.

## A realistic mixture

```verum
// Hot path, aggressively proven.
@verify(thorough)
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
Annotate them. Next, annotate your invariants with refinement types
or `ensures` clauses. Upgrade to `@verify(formal)`; the compiler
emits SMT obligations and the router picks the right solver. Finally,
for the critical slice, escalate to `@verify(thorough)` or
`@verify(certified)`.

At each step the code does not change — only the guarantee does.

## What gradual does not mean

Gradual verification is not "pay more to get more." SMT discharge is
free at runtime (obligations are erased). What you pay for is compile
time and the cognitive cost of writing an invariant down. The
_product_ — the binary — is often smaller when more is proved, because
redundant runtime checks fall away.
