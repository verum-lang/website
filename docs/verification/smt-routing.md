---
sidebar_position: 3
title: SMT Routing
---

# SMT Routing

Verum's verification layer dispatches each obligation through a
**capability router** that classifies the obligation by theory
and picks an appropriate backend. This page documents the
routing policy.

:::note Implementation detail vs language contract
The language itself makes **no commitment to a specific
verification backend**. The current release bundles multiple
SMT backends behind the router because that combination covers
the theories Verum's verification layer needs. Anywhere a
specific backend profile is named below, treat it as a note
about the current implementation — the router's contract is
what is load-bearing. A future revision may replace the
underlying solvers entirely with a Verum-native verifier; the
contract above this page does not change.
:::

## Why more than one backend

No single decision procedure is best at every theory.
Empirically, theories cluster into capability profiles, and the
router classifies obligations into one of these profiles before
dispatching:

| Theory                                    | Capability profile |
|-------------------------------------------|--------------------|
| Linear integer arithmetic (LIA)           | `arith-core` |
| Bitvectors                                | `bv` |
| Arrays                                    | `array` |
| Quantifiers (general, MBQI-style)         | `quantifier-mbqi` |
| Strings                                   | `strings` |
| Nonlinear real arithmetic                 | `nlra` |
| Finite model finding                      | `fmf` |
| Synthesis (SyGuS)                         | `synthesis` |
| Abductive reasoning                       | `abduction` |
| Optimisation (MaxSMT)                     | `optimisation` |
| Interpolation                             | `interpolation` |

Verum's **capability router** classifies each obligation by
the theories it uses and dispatches to a backend whose profile
covers them.

## How you request routing

You do not select backends directly. The capability router
picks the backend based on the obligation's theory mix; you
pick the *strategy* (how much effort to spend). The strategies
that touch the SMT layer:

### `@verify(formal)` — single backend via the router (default)

The router inspects each obligation. Obligations that mix
classical theories (LIA + bitvectors + arrays) take the
`arith-core` path; obligations involving strings, nonlinear
arithmetic, or finite-model finding take the
`strings`/`nlra`/`fmf` paths. Mixed obligations go to whichever
profile covers all the theories involved.

### `@verify(fast)` — single backend, tight timeout

Same router decision, but the backend gets 30 % of the base
timeout and expensive techniques (portfolio, proof extraction)
are skipped. Obligations that don't resolve quickly come back
as `unknown` and fall through to a runtime check.

### `@verify(thorough)` / `@verify(reliable)` — portfolio

Each obligation is dispatched to **multiple backends** plus
tactic-based proof search, all in parallel. The first `unsat`
wins:

- Both `unsat`: accepted.
- Both `sat` with matching counter-examples: rejected with the
  counter-example.
- `unsat` from one, `sat` from another: **backend disagreement**
  — the goal is flagged and requires manual review (very rare).
- Timeouts: handled per `[verify]` policy.

Timeout multiplier: 2× the base. Recommended for safety-critical
code.

### `@verify(certified)` — portfolio plus orthogonal cross-validation

Runs `thorough` and additionally re-checks the resulting proof
with an orthogonal technique. Disagreement is a hard build
error. The resulting proof term is embedded in the VBC archive
as an exportable certificate (Coq / Lean / Dedukti / Metamath).
Timeout multiplier: 3×.

### `@verify(synthesize)` — synthesis

Treats the obligation as a *synthesis problem* — given a
specification, the verifier should generate a term that
satisfies it rather than check a provided one. The router
dispatches to a backend whose capability profile covers the
synthesis surface. The obligation must carry at least one
`synth-fun` declaration (via `@synth_fun` or explicit
`SyGuSProblem` construction); synthesis requests without a
target function signature are rejected with a clear error
rather than silently routed through satisfiability. Used for
invariant generation, hole filling, and tactic writing.
Timeout multiplier: 5×.

## Classification

The capability router classifies each obligation by walking its
AST:

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
4. Look up `(theory-set, preference) → backend profile` in the
   capability table.

Stats on the final routing decisions are emitted at
`--report smt`:

```
profile                obligations   avg-ms   p95-ms   cache-hit
arith-core                   3,281      12       48     88.2%
strings + nlra                  502     34      120     76.1%
portfolio                        47     56      210     50.0%
```

## Fallback

Verum treats secondary backends not as a "second choice" but as
a **complementary decision-procedure portfolio**. Different
backends have disjoint strengths: when one returns `unknown` on
an obligation, another has a substantial chance of deciding it
(measured across the stdlib verification suite), and vice
versa. The fallback is automatic and transparent — users never
select backends manually.

### Two levels of routing

**Level 1 — top-level capability router.** Inspects the
obligation's theory mix and picks the *preferred* backend
profile upfront. This is what `@verify(formal)` uses: one
backend per obligation, decided by theory classification (see
table above).

**Level 2 — proof-path discharge fallback.** Fires inside the
theorem-proof pipeline (`proof by auto`, `proof by smt`,
tactic-level SMT dispatch). The pipeline submits the goal to
the primary backend first. On `Unknown`, the fallback
re-submits the *same obligation* to a complementary backend
with a different decision procedure. Results:

- `Unsat` from any backend → goal is valid; the proof term
  records which backend decided it.
- `Sat` → counterexample, reject.
- All `Unknown` → `SmtTimeout`, falls through to the next
  tactic or reports as unproved.

Certificate consumers (`verum audit --framework-axioms`,
LCF replay, Coq/Lean export) see the backend tag on every
`SmtProof` term so they know which decision procedure's
soundness they're relying on.

### Fallback triggers

```
primary Unknown    →  complementary backend (same obligation, new context)
complementary Tmo  →  primary (symmetric — less common in practice)
```

Configurable via `verum.toml`:

```toml
[verify]
default_strategy  = "formal"
solver_timeout_ms = 5000

[verify.modules."crypto.signing"]
strategy          = "certified"
solver_timeout_ms = 60000
```

## Caching

Every obligation has an SMT-LIB fingerprint. Proof results
(ignoring provenance) are cached across builds. The cache:

- is per-project (`target/smt-cache/`);
- survives backend upgrades if the obligation's SMT-LIB is
  identical;
- is invalidated when backend versions change in ways that
  could alter semantics (patched theories, new decision
  procedures).

Inspect:

```bash
$ verum smt-stats
$ verum smt-stats --reset      # force full re-verification
```

## Telemetry

When `VERUM_SMT_TELEMETRY=1` is set, the compiler logs every
routing decision to `.verum/telemetry/routing.jsonl`:

```json
{"obligation": "binary_search/invariant#3", "theories": ["lia"], "routed": "arith-core", "ms": 8}
{"obligation": "parse/postcond#1", "theories": ["lia","string"], "routed": "strings", "ms": 72}
```

Used by the Verum team to tune the router; anonymised when
submitted as feedback.

## Writing solver-friendly obligations

- **Avoid unbounded quantifiers** where possible.
  `forall i: Int. P(i)` is a last resort;
  `forall i in 0..n. P(i)` is usually enough.
- **Keep nonlinearity local**. `a * b * c` is fine;
  `(a * b * c) / (d * e * f)` invites slowness.
- **Prefer named predicates** (via `@logic`) over inlined
  formulas — the verifier can reuse proof fragments.

## Limitations

- Backend upgrades are tested against the full VCS conformance
  suite, but backend behaviour is not bit-reproducible across
  versions.
- The router is tuned against a benchmark set; unusual
  workloads may see suboptimal routing. Escalate the strategy
  (`@verify(thorough)`) rather than forcing a backend — the
  router always picks correctly given enough time.

## The router, the kernel, and the TCB

The capability router picks *which* backend to dispatch to; it
does not decide *whether* to trust the result. Every SMT
success produces an `SmtCertificate` — a backend-neutral proof
trace normalised by the proof-extraction layer. The kernel's
`replay_smt_cert` reconstructs a `CoreTerm` witness from the
certificate, and that reconstruction runs inside the trusted
kernel.

This is why every backend the router dispatches to lives
**outside** Verum's trusted computing base. A bug in a routed
backend that produced a spurious `unsat` fails the kernel's
replay; it cannot accept a false theorem. See
**[Architecture → trusted kernel](/docs/architecture/trusted-kernel)**
for the full structural guarantee.

## The `SolverChoice` decision surface

The router's verdict is a typed `SolverChoice` value. Variants
cover every dispatch outcome:

| Variant | When the router picks it |
|---------|--------------------------|
| `Primary { confidence, reason }` | the obligation matches a profile a single primary backend handles efficiently (e.g. LIA, bitvectors, arrays, MaxSMT, interpolation) |
| `Complementary { confidence, reason }` | strings, FMF, synthesis, abductive reasoning, nonlinear-with-quantifiers — profiles where a complementary backend is preferred |
| `Portfolio { timeout_ms, tie_breaker }` | both backends launched in parallel, first `unsat` wins; `tie_breaker` orders simultaneous returns |
| `CrossValidate { strictness, ... }` | `@verify(reliable)` and `@verify(certified)` — both backends must independently agree, `strictness` controls how strict |

The `confidence` field is a `[0.0, 1.0]` scalar surfaced in
`verum smt-stats --explain` so users can see why the router
made the call. `reason` is a free-form human-readable
explanation that ships into the audit chronicle.

`TieBreaker` and `CrossValidationStrictness` are enumerated in
the `--explain` output; the audit gate
`verum smt-stats --routing-protocol` enumerates dispatch
counts per `SolverChoice` variant.

## Specialised backends beyond the general-purpose pool

Three additional backends are registered:

| Backend | Purpose |
|---------|---------|
| `dependent_backend` | Π/Σ obligations the general SMT layer cannot discharge directly |
| `exhaustiveness_backend` | pattern-match exhaustiveness proofs |
| `refinement_backend` | refinement-type subsumption checks |

The router classifies each obligation into the *narrowest*
backend that can decide it; the broader general-purpose
backends are fallback when the specialised ones reject. This
keeps fast specialised paths fast and the slow general path
slow only when needed.

## Domain-specific dispatchers

Beyond the general-purpose backends, Verum ships focused
*dispatchers* — one per Verum-language concept that has a
verification-level decision procedure. Each dispatcher reuses
the existing capability-router infrastructure (no new FFI
surface) and produces a structured outcome the verifier maps
onto a diagnostic level.

| Dispatcher | Purpose |
|---|---|
| `count_o_dispatch` | OWL 2 `count_o_unbounded` → Finite Model Finding when the surrounding refinement type carries a cardinality bound. See [OWL 2 §5](./owl2.md#5-the-count_o-quantifier-of-quantity). |
| `count_o_recognizer` | AST-walking pre-pass invoked from `RefinementVerifier::verify_refinement`. Detects the canonical conjunctive `count_o_unbounded` shape, builds a `CountOQuery`, and routes through the dispatcher above — making the extended framework load-bearing rather than standalone. |

The `count_o_dispatch` example is illustrative of the pattern:

1. Verum-side refinement check encounters
   `count_o_unbounded(None, P)` in a context like
   `{x : Int | x ≤ K ∧ x = count_o(_, P)}`.
2. The dispatcher constructs a `CountOQuery` (predicate body
   in SMT-LIB, individual-sort name, cardinality bound).
3. A capability-router flag indicates "finite model finding
   required", routing the query to a backend whose profile
   covers FMF.
4. The dispatcher emits an `FmfQuery` over an uninterpreted
   sort with cardinality ≤ K, calls the FMF backend, and
   extracts the count from the discovered model.
5. The 4-variant `CountOResult` (`Decided` / `BoundExceeded` /
   `Unsupported` / `Timeout`) maps onto promote-to-error /
   silent-fallback / fail-soft per the diagnostic level.

In stub mode (the FMF backend not linked) the dispatcher
returns `Unsupported` and the caller's V1 `Maybe.None`
fallback runs — keeping the build path open without
hard-depending on a specific external solver.

## See also

- **[Gradual verification](/docs/verification/gradual-verification)**
  — the 13-strategy surface and the two-layer dispatch architecture.
- **[Refinement reflection](/docs/verification/refinement-reflection)**
  — how `@logic` functions extend the verifier's vocabulary
  without expanding the TCB.
- **[Framework axioms](/docs/verification/framework-axioms)** —
  explicit postulates (Lurie HTT, Connes, Petz, ...) for results
  no SMT backend can discharge.
- **[Architecture → SMT integration](/docs/architecture/smt-integration)**
  — the compiler's internal handling of obligations.
- **[Architecture → trusted kernel](/docs/architecture/trusted-kernel)**
  — how `SmtCertificate` replay keeps every SMT backend outside
  the TCB.
