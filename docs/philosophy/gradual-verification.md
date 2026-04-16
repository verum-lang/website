---
sidebar_position: 3
title: Gradual Verification
description: The nine-strategy ladder from runtime assertions to cross-validated proof certificates.
---

# Gradual Verification

Verification in Verum is a **spectrum**, not a mode. A single program
typically uses all nine strategies — `runtime` on prototypes,
`formal` on business logic, `certified` on the one page of code that
must be right or the rocket falls out of the sky.

This page explains the ladder, its semantics, its costs, and when to
climb a rung.

## Principle: intent, not backend

`@verify(...)` takes a **strategy**, not a solver name. The compiler
dispatches to Z3, CVC5, portfolio, synthesis, or pure tactic search
via its capability router based on goal shape. When a future version
adds a better backend, your annotations don't change.

```verum
@verify(formal)
fn transfer(from: &mut Account, to: &mut Account, amount: Money)
    where requires amount > 0 && from.balance >= amount
    where ensures  from.balance == old(from.balance) - amount
    where ensures  to.balance   == old(to.balance)   + amount
{ ... }
```

The `@verify(formal)` attribute says "use whatever works". The router
examines the obligation's theory — linear integer arithmetic,
quantifier-free arrays, bitvectors — and picks Z3 or CVC5 accordingly.

See [verification/smt-routing](/docs/verification/smt-routing) for
the dispatch rules.

## The nine strategies

The grammar's own enumeration:

```ebnf
verify_attribute = 'verify' , '(' ,
    ( 'runtime' | 'static' | 'formal' | 'proof'
    | 'fast' | 'thorough' | 'reliable'
    | 'certified' | 'synthesize' ) ,
    ')' ;
```

### `runtime`

**Intent**: "check it at runtime".

- `assert`, `requires`, `ensures`, and refinement predicates become
  **runtime panics**.
- No SMT. No static proof.
- Cost: per-call nanoseconds to microseconds; the check is elided
  when `debug_assert` is used and the build is release.
- Use: prototypes, exploratory code, hot code where the invariant
  isn't yet fully known.

```verum
@verify(runtime)
fn experimental(x: Int) -> Int
    where requires x > 0
    where ensures  result > 0
{
    x * 2                // requires + ensures checked at runtime
}
```

### `static`

**Intent**: "check what the type system can".

- Dataflow: unused mutable state, uninitialised reads, missing
  matches.
- CBGR: reference tiers (see
  [language/cbgr](/docs/language/cbgr)).
- Refinement typing where the predicate is SMT-native and decidable.
- No solver runs for non-trivial obligations — those become runtime
  checks.
- Cost: compile-time only; the default for *unannotated* code.
- Use: everywhere the compiler's static checks suffice.

```verum
// Implicit @verify(static) for any fn without @verify annotation:
fn safe_div(a: Int, b: Int { self != 0 }) -> Int {
    a / b                // no division-by-zero check needed
}
```

### `formal`  (and alias `proof`)

**Intent**: "prove every obligation with the SMT engine".

- All SMT-dischargeable goals are sent to the solver.
- The solver runs with the default timeout (500 ms per obligation by
  default; configurable per-build).
- Unsatisfiable goals become compile errors with a counter-example.
- Cost: 10 ms – 10 s per obligation.
- Use: business logic, domain invariants, critical functions in
  normal services.
- This is **the recommended starting rung**. It catches the vast
  majority of verification wins without dragging compile times.

```verum
@verify(formal)
fn balance_after_debit(balance: Money, debit: Money) -> Money
    where requires debit >= 0 && balance >= debit
    where ensures  result == balance - debit
    where ensures  result >= 0
{
    balance - debit
}
```

`proof` is a strict alias — use it to emphasise that the proof term
should be **extracted and preserved** for later inspection.

### `fast`

**Intent**: "prove as much as we can quickly; degrade the rest to
runtime".

- SMT with a tight timeout (default 100 ms per obligation).
- Obligations that time out are silently demoted to runtime checks.
- The compiler records which ones demoted (see `verum verify --report`).
- Cost: 3× quicker than `formal` on compilation; zero extra runtime
  cost for proved obligations, small cost for demoted ones.
- Use: iterative development loops, CI on branches, low-critical
  code where build time dominates the pain.

Trade-off: you may merge code that the hotter strategy would have
rejected. Run `@verify(formal)` on main before release.

### `thorough`  (and alias `reliable`)

**Intent**: "throw everything at it in parallel".

- Races Z3, CVC5, and a tactic-search strategy in parallel.
- The first successful close wins.
- Failed strategies are retried with different tactics, lemma sets,
  and heuristics.
- Cost: 2× slower than `formal` on compile time; zero extra runtime
  cost.
- Use: Hard goals that `formal` couldn't close; verification-heavy
  modules; the pre-release tightening pass.

`reliable` is a strict alias — use it to emphasise *result
reliability* in review contexts.

### `certified`

**Intent**: "prove it, and have the proof independently re-checkable".

- Runs `thorough`.
- **In addition**, cross-verifies the proof term with an orthogonal
  technique (a different solver, a small independent kernel, a
  hand-written tactic invariant).
- Refuses to succeed if any axioms are transitively used.
- Produces a `.verum-cert` archive consumable by external kernels
  (Coq, Lean, Dedukti, Metamath).
- Cost: 3× `formal`. The certificate adds build-artefact size.
- Use: security-critical code (crypto, consensus, auth boundaries),
  code going to certification (DO-178C, IEC 62304), code being
  audited externally.

```verum
@verify(certified)
fn verify_signature(msg: &[Byte], sig: &Signature, pk: &PublicKey) -> Bool
    where ensures result => signature_valid(msg, sig, pk)
{ ... }
```

Export: `verum check --export-proofs` produces the certificate.

### `synthesize`

**Intent**: "don't check my implementation; generate one from the
spec".

- Treats the specification as a synthesis problem.
- Produces a function body that provably satisfies the given
  `requires` / `ensures` / type signature.
- Useful for simple algebraic code, lookup tables, state machines
  that are too tedious to write by hand.
- Cost: search-depth-bound — 5× `formal` for practical cases.
- Use: boilerplate generation, "I know what I want, not how to get
  it" problems.

```verum
@verify(synthesize)
fn maximum(xs: &List<Int>) -> Int
    where requires xs.len() > 0
    where ensures  result == max_of(xs)
    where ensures  xs.contains(result)
{
    // body synthesised by the compiler
}
```

The synthesis engine is bounded; complex synthesis goals (with
existentials or recursion) currently fail. Prefer writing the code
and using `formal` unless the function is genuinely mechanical.

## Default without a `@verify` annotation

An unannotated function runs at **`static`** by default. You get
dataflow, CBGR, and refinement typing for free; you *don't* get
SMT-discharged `ensures` clauses until you opt in.

To change the project-wide default:

```toml
# Verum.toml
[verify]
default_strategy = "formal"
default_timeout_ms = 500
```

## A realistic mixture

```verum
// Hot path, aggressively proven
@verify(certified)
pub fn verify_signature(msg: &[Byte], sig: &Signature, pk: &PublicKey) -> Bool
    where ensures result => pk.verifies(msg, sig)
{ ... }

// Domain logic; SMT at full power
@verify(formal)
pub fn transfer(from: &mut Account, to: &mut Account, amount: Money)
    where requires amount > 0
    where ensures  from.balance + to.balance == old(from.balance + to.balance)
{ ... }

// Ordinary code — static by default
pub fn format_duration(d: Duration) -> Text { ... }

// Prototype code; refine later
@verify(runtime)
fn experimental_retry_policy(attempt: Int) -> Duration { ... }
```

Every annotation is explicit. At review time you can scan for
strategy labels and ask "why is this `runtime` still?" or "does this
deserve `certified`?".

## Moving up the ladder

Promotion is **mechanical**:

1. Start at `runtime`. Write assertions. Test.
2. Inspect `verum verify --report` — it shows which runtime
   assertions would be dischargeable statically.
3. Annotate those with refinement types or `ensures` clauses.
4. Upgrade to `@verify(formal)`; the compiler emits SMT obligations.
5. For the critical slice, escalate to `@verify(thorough)` or
   `@verify(certified)`.

At each step **the code does not change** — only the guarantee does.

## Costs summary

| Strategy       | Compile time vs. baseline | Runtime cost       |
|----------------|---------------------------|--------------------|
| `runtime`      | same                      | per-call panic check |
| `static`       | same (baseline)           | zero               |
| `formal`       | +20-50% per function      | zero               |
| `fast`         | +5-15% per function       | some panic checks  |
| `thorough`     | +50-150% per function     | zero               |
| `certified`    | +200-500% per function    | zero               |
| `synthesize`   | +500%+ per function       | zero               |

Relative to fully-unverified baseline. Real numbers depend on goal
complexity; expect closer to 10× for well-tuned projects and 100× on
the rare pathological cases.

## What gradual does *not* mean

Gradual verification is not "pay more to get more." SMT discharge is
**free at runtime** — proved obligations are erased entirely.

What you pay for is compile time and the cognitive cost of writing
the invariant. The *product* — the binary — is often **smaller** when
more is proved, because redundant runtime checks fall away.

Gradual is also not a **continuity** of trust: a `runtime` function
is not partially-trusted by a `formal` caller. The caller's own
`formal` annotation means "prove your obligations"; if some come from
a `runtime` callee, the solver will see them as axioms — which is
clearly marked in the proof output and in the `.verum-cert`
certificate.

## Interaction with `@verify` strategies across call boundaries

When a `@verify(formal)` function calls a `@verify(runtime)` one:

- The callee's `ensures` becomes a **compile-time assumption** in the
  caller's context.
- The callee's `requires` must still be discharged at the call site
  (by the caller's strategy).

This is the one place strategies are not strictly additive — but
it's the right default. It lets the "formal core, runtime shell"
architecture work: shell functions use `runtime`, prove nothing,
but their signatures feed the core's proofs.

## Tooling

- **`verum check`** — run the verifier at the current strategy.
- **`verum check --strategy formal`** — temporarily upgrade all
  unannotated functions.
- **`verum verify --report`** — print per-function verification
  status, solver times, and upgrade suggestions.
- **`verum check --export-proofs`** — emit `.verum-cert` archive
  for `certified` functions.

See [tooling/cli](/docs/tooling/cli) for the full command surface.

## See also

- **[Design Principles](/docs/philosophy/principles)** — principle 2.
- **[verification/gradual-verification](/docs/verification/gradual-verification)** —
  the mechanics of how strategies compose.
- **[verification/smt-routing](/docs/verification/smt-routing)** —
  how the router picks backends.
- **[verification/proofs](/docs/verification/proofs)** — a worked
  example promoting a function up the ladder.
- **[language/proof-dsl](/docs/language/proof-dsl)** — theorem-level
  proofs that back up the `formal` / `certified` strategies.
