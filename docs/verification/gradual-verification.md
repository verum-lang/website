---
sidebar_position: 1
title: Gradual Verification
---

# Gradual Verification

> A single program spans the verification spectrum — runtime checks
> for prototypes, static analysis for ordinary code, formal proofs
> for critical invariants, certified cross-validated proofs for the
> kernel.

Verification in Verum is **semantic, not backend-specific**. You pick
how much you want proved (the *intent*); the compiler picks the
technique (the *implementation*). This lets the in-house solver
improve without changing user code, and it lets a single project mix
strategies file by file.

## The nine strategies

The grammar admits these nine surface keywords (the seven distinct
behaviours plus two historical aliases):

| Strategy      | What it does | When to use |
|---------------|--------------|-------------|
| `runtime`     | runtime assertion check only; no formal proof | prototyping, dev builds |
| `static`      | static type-level verification only; no solver | the default fast path |
| `formal`      | formal verification with the default strategy | production code |
| `proof`       | alias of `formal` — emphasises proof extraction | when you want to look at the term |
| `fast`        | optimise for fast verification; may give up on hard goals | iterative development |
| `thorough`    | maximum completeness — races several strategies, takes the first success | hard obligations |
| `reliable`    | alias of `thorough` — emphasises result reliability | critical code |
| `certified`   | independently cross-verified; required for exporting proof certificates (Coq / Lean / Dedukti / Metamath) | security-critical, external audit |
| `synthesize`  | synthesis — generate a term satisfying the spec instead of checking one | program synthesis, hole filling |

`formal` is the recommended default. It's what `@verify` without an
argument selects.

## Requesting a strategy

```verum
@verify(runtime)    fn prototype()  { ... }
@verify(static)     fn ordinary()   { ... }
@verify(formal)     fn critical()   { ... }
@verify(thorough)   fn safety()     { ... }
@verify(certified)  fn kernel()     { ... }
@verify(synthesize) fn synth()      { ... }
```

At the project level, set a default and per-module overrides in the
`[verify]` section of `verum.toml`:

```toml
[verify]
default_strategy  = "formal"
solver_timeout_ms = 10000
enable_telemetry  = true        # write .verum/state/smt-stats.json
persist_stats     = true

[verify.modules."crypto.signing"]
strategy          = "certified"
solver_timeout_ms = 60000
```

Strategy-specific timeout multipliers apply: `fast 0.3×`,
`thorough 2×`, `certified 3×`, `synthesize 5×`.

## What each strategy actually does

### `runtime`

Refinements become `assert` calls. `ensures` clauses become
post-return checks. A failure panics the current task. Useful for
rapid iteration.

### `static`

- **Dataflow**: narrows types by control flow. `if x > 0 { ... }`
  strengthens `x` inside the branch.
- **CBGR**: generation-check elision, escape analysis, reference-tier
  promotion (documented in
  **[cbgr internals](/docs/architecture/cbgr-internals#compile-time-analysis-suite)**).
- **Refinement typing**: predicates checked via subtyping rules; no
  solver calls on the fast path.

### `formal` / `proof`

When a refinement or contract cannot be discharged syntactically, the
compiler translates it to SMT-LIB and dispatches through the
**capability router** (see **[SMT routing](/docs/verification/smt-routing)**).
The router picks Z3 or CVC5 based on the obligation's theory mix.

Results are cached keyed on the SMT-LIB fingerprint — a proof stays
valid until the function or its dependencies change. Compile time
scales linearly with the number of *new* obligations.

### `fast`

Like `formal` but the solver timeout is reduced to 30 % of the base,
and non-trivial strategies (portfolio, proof extraction) are skipped.
Goals that need more than a few hundred milliseconds are returned as
"unknown" rather than blocking the build.

### `thorough` / `reliable`

Races the available strategies in parallel — direct SMT, SMT with
quantifier hints, proof search, congruence closure — and accepts the
first success. Timeout is 2× the base.

### `certified`

Runs `thorough` *and* cross-validates the result with an orthogonal
verification technique. A disagreement between the two pipelines is a
hard build error. The resulting proof is embedded in the VBC archive
as a certificate exportable to Coq, Lean, Dedukti, or Metamath. Use
this for code that will be externally audited.

### `synthesize`

Treats the goal as a *synthesis problem*: given a specification,
generate a term (function body, witness, tactic) that satisfies it.
Useful for filling in proof obligations or stubbing out code against
a contract.

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

The obligation is dispatched through the capability router and fed
to Z3, CVC5, the portfolio executor, or the tactic evaluator based
on the selected strategy.

## Telemetry and stats

Telemetry is opt-out via `[verify] enable_telemetry`. After a build
that touched any verification:

```bash
$ verum smt-stats
  Strategy                      Goals   Median (ms)   p95     Hit rate
  formal                        14221   34           210     92.4 %
  thorough                         68  2840         9210      —
  certified                         4  7500        16400     100 %
```

```bash
$ verum smt-stats --json        # machine-readable
$ verum smt-stats --reset       # clear after printing
```

Stats persist in `.verum/state/smt-stats.json` when
`[verify] persist_stats = true` (the default).

## Moving up the ladder

There is no flag-day — functions upgrade independently:

1. Write at `@verify(runtime)`.
2. Annotate invariants; the compiler reports what it proved at
   `@verify(static)`.
3. Fill in `ensures` / refinement types for the invariants you care
   about, and add `@verify(formal)`.
4. For hard-to-prove invariants, escalate to `@verify(thorough)`.
5. For the critical 0.01 %, use `@verify(certified)` and review the
   exported proof.

## See also

- **[Refinement reflection](/docs/verification/refinement-reflection)**
  — making `@logic` functions available to the solver.
- **[SMT routing](/docs/verification/smt-routing)** — how the
  capability router picks Z3 vs CVC5 vs portfolio.
- **[Contracts](/docs/verification/contracts)** — `requires`,
  `ensures`, `invariant`.
- **[Proofs](/docs/verification/proofs)** — the tactic DSL.
- **[Cubical & HoTT](/docs/verification/cubical-hott)** — higher
  equational reasoning.
- **[Reference → verum.toml](/docs/reference/verum-toml#verify--formal-verification)**
  — full `[verify]` schema.
- **[Architecture → verification pipeline](/docs/architecture/verification-pipeline)**
  — the solver-side internals.
