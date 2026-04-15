---
sidebar_position: 7
title: SMT Integration
---

# SMT Integration

`verum_smt` is the bridge between the type checker and the SMT
solvers. It runs during **Phase 3a** (contract verification) and
the refinement / dependent-verifier sub-step of **Phase 4**
(semantic analysis) — see the **[verification pipeline](/docs/architecture/verification-pipeline)**
for the subsystem-internal stages (5.1–5.7 below are the solver's
own numbering, not public compilation phases).

## Architecture

```
Obligation (AST)
      │
      ▼
┌─────────────────────────────────────┐
│ expr_to_smtlib  (AST → SMT-LIB)     │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ refinement_reflection               │
│   (inject @logic axioms)            │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ capability_router                   │
│   (classify theories → pick solver) │
└─────────────────────────────────────┘
      │
      ├───────────────┬─────────────────┐
      ▼               ▼                 ▼
  z3_backend    cvc5_backend    portfolio_executor
      │               │                 │
      └───────────────┴─────────────────┘
                      ▼
              cache + telemetry
```

## Translation

`expr_to_smtlib.rs` walks a refinement / contract expression and
emits SMT-LIB:

```
Verum: x > 0 && x < 100
SMT:   (and (> x 0) (< x 100))

Verum: forall i in 0..xs.len(). xs[i] < key
SMT:   (forall ((i Int)) (=> (and (>= i 0) (< i (List.len xs))) (< (List.get xs i) key)))
```

Datatypes, generics, and refinement types are encoded in the solver's
native datatype / sort system.

## Refinement reflection

User `@logic` functions become `define-fun-rec` in SMT-LIB:

```
(define-fun-rec is_sorted ((xs (List Int))) Bool
  (match xs
    ((nil) true)
    ((cons x rest) (match rest
      ((nil) true)
      ((cons y _) (and (<= x y) (is_sorted rest)))))))
```

## Capability routing

`capability_router.rs` classifies each obligation by theory usage:

- LIA, bitvector, array → **Z3**.
- Strings, nonlinear, SyGuS, FMF → **CVC5**.
- Mixed that both support → Z3 (faster on average).
- Mixed only CVC5 supports → CVC5.

Classification is by AST walk: tag nodes with theories, union, look
up in capability table.

## Backend switcher

`backend_switcher.rs` implements four strategies:

- **Manual** — fixed backend.
- **Auto** — router-driven per obligation.
- **Fallback** — try primary, fall back to other on timeout.
- **Portfolio** — both solvers in parallel.

## Portfolio

`portfolio_executor.rs`:

1. Spawn Z3 and CVC5 on the same obligation.
2. Wait for both or timeout.
3. Cross-validate:
   - both unsat → accepted.
   - both sat (counter-example) → rejected, user sees one.
   - one unsat, one sat → **disagreement**; flagged.
   - timeouts handled per policy.

Used for `@verify(portfolio)` and `@verify(cross_validate)`.

## Caching

Every obligation has an SMT-LIB fingerprint (SHA-256). Proof results
are cached per project (`target/smt-cache/`). Invalidation:

- Cache hit: verify the saved result against the current obligation.
- Solver upgrade: fingerprints include solver version; upgrades
  invalidate partial.

## Telemetry

Opt-in via `VERUM_SMT_TELEMETRY=1`. Every obligation's theories, routed
solver, time, and outcome are logged. Used to tune the router.

## Proof search

`proof_search.rs` (230 K LOC) implements tactics:

- `auto` — call solver with default configuration.
- `omega` — linear integer fragment.
- `ring` — ring-axiom rewriting.
- `simp [rules]` — simplification rewriting.
- `induction` — structural induction.
- `cases` — case split.

Tactics can compose via the `tactics.rs` combinator language.

## Proof extraction

`proof_extraction.rs` (135 K LOC) extracts a proof term from an SMT
unsat response. Both Z3 and CVC5 emit proof logs; the translator
normalises them to Verum's proof-term representation for machine
checking.

## Cubical tactic

`cubical_tactic.rs` (1058 lines) handles cubical / HoTT obligations
that general SMT cannot discharge:

- Path reduction.
- HIT coherence.
- Transport normalisation.
- Glue / unglue simplification.
- Category-theoretic rewrites (associativity, identity laws, etc.).

It decomposes obligations into smaller fragments, dispatches the
decidable ones to SMT, and applies rewrites for the rest.

## Performance

Typical obligation mix (measured on a 50 KLOC Verum project):

| Theory | Count | Avg time (ms) | p95 |
|--------|------:|--------------:|----:|
| LIA only | 2,100 | 8 | 35 |
| LIA + bv | 940 | 14 | 60 |
| LIA + string | 110 | 45 | 180 |
| Nonlinear | 42 | 320 | 1,800 |
| Cubical | 18 | 120 | 400 |

Overall: ~92% of obligations discharge in under 50 ms.

## See also

- **[Verification → SMT routing](/docs/verification/smt-routing)** —
  user-facing policy.
- **[Verification → refinement reflection](/docs/verification/refinement-reflection)**
  — how `@logic` functions reach the solver.
- **[Verification → proofs](/docs/verification/proofs)** — the
  tactic DSL.
