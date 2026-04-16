---
sidebar_position: 3
title: SMT Routing
---

# SMT Routing — Z3 + CVC5

Verum ships with **two** SMT solvers. Z3 is the default; CVC5 handles
the theories Z3 cannot; portfolio mode runs both and cross-validates.
This page documents how the compiler decides which solver to use.

## Why two solvers

No single SMT solver is best at everything. Empirically:

| Theory                                    | Best solver | Why |
|-------------------------------------------|-------------|-----|
| Linear integer arithmetic (LIA)           | Z3          | Mature LIA core, fast |
| Bitvectors                                | Z3          | Extensive decision procedures |
| Arrays                                    | Z3          | Fast, feature-complete |
| Quantifiers (general)                     | Z3 (MBQI)   | Typically faster |
| Strings                                   | **CVC5**    | Z3 strings are experimental; CVC5's are mature |
| Nonlinear arithmetic (real)               | **CVC5**    | CVC5's cylindrical algebraic decomposition |
| Finite model finding                      | **CVC5**    | CVC5's FMF is designed for it |
| SyGuS synthesis                           | **CVC5**    | Only CVC5 supports SyGuS |
| Abductive reasoning                       | **CVC5**    | CVC5 is the reference impl |
| Optimisation (MaxSMT)                     | Z3          | Z3 has the OPT module |
| Interpolation                             | Z3          | CVC5 lacks interpolants |

Verum's **capability router** classifies each obligation by the
theories it uses and dispatches accordingly.

## How you request routing

You do not select solvers directly. The capability router picks the
solver based on the obligation's theory mix; you pick the *strategy*
(how much effort to spend). The strategies that touch the SMT layer:

### `@verify(formal)` — single solver via the router (default)

The router inspects each obligation. If it uses only LIA + bitvectors
+ arrays, Z3 gets the call. If strings, nonlinear, or finite-model
finding appear, CVC5 gets it. Mixed obligations go to whichever solver
supports all the theories involved; if both support them, Z3 goes
first (benchmarks favour Z3 for generic cases).

### `@verify(fast)` — single solver, tight timeout

Same router decision, but the solver gets 30 % of the base timeout
and expensive techniques (portfolio, proof extraction) are skipped.
Obligations that don't resolve quickly come back as `unknown` and
fall through to a runtime check.

### `@verify(thorough)` / `@verify(reliable)` — portfolio

Each obligation is dispatched to **both** solvers plus tactic-based
proof search, all in parallel. The first `unsat` wins:

- Both `unsat`: accepted.
- Both `sat` with matching counter-examples: rejected with the
  counter-example.
- `unsat` from one, `sat` from the other: **solver disagreement** —
  the goal is flagged and requires manual review (very rare).
- Timeouts: handled per `[verify]` policy.

Timeout multiplier: 2× the base. Recommended for safety-critical
code.

### `@verify(certified)` — portfolio plus orthogonal cross-validation

Runs `thorough` and additionally re-checks the resulting proof with
an orthogonal technique. Disagreement is a hard build error. The
resulting proof term is embedded in the VBC archive as an exportable
certificate (Coq / Lean / Dedukti / Metamath). Timeout multiplier: 3×.

## Classification

The capability router lives in `verum_smt::capability_router`. The
classification algorithm:

1. Walk the obligation's AST.
2. Tag each node with its theory:
   - arithmetic (LIA / NIA)
   - bitvector
   - array
   - string
   - sequence
   - datatype
   - quantifier
3. Compute the theory union.
4. Look up (theory-set, preference) → solver in the capability table.

Stats on the final routing decisions are emitted at `--report smt`:

```
solver    obligations   avg-ms   p95-ms   cache-hit
z3              3,281      12       48     88.2%
cvc5              502      34      120     76.1%
portfolio         47       56      210     50.0%
```

## Fallback

If the preferred solver times out, the obligation is re-dispatched to
the fallback solver:

```
z3 timeout  →  cvc5
cvc5 timeout →  z3
```

Configurable via `Verum.toml`:

```toml
[verify]
default_strategy  = "formal"
solver_timeout_ms = 5000

[verify.modules."crypto.signing"]
strategy          = "certified"
solver_timeout_ms = 60000
```

## Caching

Every obligation has an SMT-LIB fingerprint. Proof results (ignoring
provenance) are cached across builds. The cache:

- is per-project (`target/smt-cache/`);
- survives solver upgrades if the obligation's SMT-LIB is identical;
- is invalidated when solver versions change in ways that could alter
  semantics (patched theories, new decision procedures).

Inspect:

```bash
$ verum smt-stats
$ verum smt-stats --reset      # force full re-verification
```

## Telemetry

When `VERUM_SMT_TELEMETRY=1` is set, the compiler logs every routing
decision to `.verum/telemetry/routing.jsonl`:

```json
{"obligation": "binary_search/invariant#3", "theories": ["lia"], "routed": "z3", "ms": 8}
{"obligation": "parse/postcond#1", "theories": ["lia","string"], "routed": "cvc5", "ms": 72}
```

Used by the Verum team to tune the router; anonymised when submitted
as feedback.

## Writing solver-friendly obligations

- **Avoid unbounded quantifiers** where possible. `forall i: Int. P(i)`
  is a last resort; `forall i in 0..n. P(i)` is usually enough.
- **Keep nonlinearity local**. `a * b * c` is fine; `(a * b * c) /
  (d * e * f)` invites slowness.
- **Prefer named predicates** (via `@logic`) over inlined formulas —
  the solver can reuse proof fragments.

## Limitations

- Solver upgrades are tested against the full VCS conformance suite
  (1 506/1 507 passing), but solver behaviour is not bit-reproducible
  across versions.
- The router is tuned against a benchmark set; unusual workloads may
  see suboptimal routing. Escalate the strategy (`@verify(thorough)`)
  rather than forcing a solver — the router always picks correctly
  given enough time.

## See also

- **[Gradual verification](/docs/verification/gradual-verification)**
- **[Refinement reflection](/docs/verification/refinement-reflection)**
- **[Architecture → SMT integration](/docs/architecture/smt-integration)**
  — the compiler's internal handling of obligations.
