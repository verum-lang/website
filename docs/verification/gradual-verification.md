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

## Two-layer architecture

Verification intent in Verum passes through **two distinct layers**.
Understanding both is the difference between writing annotations that
happen to compile and writing annotations that route the obligation
where you want it to go.

### Layer 1 — compile-time gradient (`VerificationLevel`)

This is the coarse three-way switch `Runtime | Static | Proof` that
drives *pipeline* decisions: whether the SMT backend is invoked,
whether runtime assertion checks are emitted, whether a proof
certificate is produced. Defined in `verum_verification::level`.

### Layer 2 — operational strategy (`VerifyStrategy`)

This is the seven-way per-obligation strategy
`Runtime | Static | Formal | Fast | Thorough | Certified | Synthesize`
that drives *solver* decisions: which backend, how aggressive the
timeout, whether to race a portfolio, whether to require cross-
validation, whether to treat the goal as synthesis. Defined in
`verum_smt::verify_strategy`; dispatch lives in
`BackendSwitcher::solve_with_strategy`.

Every `@verify(strategy)` attribute you write is projected onto
*both* layers — the coarse gradient controls the pipeline, the fine
strategy controls the solver.

## The thirteen strategies

The grammar production `verify_strategy` (see the
[Grammar reference — Functions](../reference/grammar-ebnf.md#25-functions))
admits exactly these **thirteen** keywords today. Each has a
**distinct** operational behaviour (no aliases — `proof` and
`reliable` are no longer collapsed into `formal` and `thorough` per
the verification spec). The pre-VFE-6/8 baseline shipped nine; VFE-6 added three
*coherence* strategies and VFE-8 added one *complexity-typed*
strategy:

| Strategy            | ν-ordinal      | Gradient | What it does | When to use |
|---------------------|:--------------:|----------|--------------|-------------|
| `runtime`           | 0              | Runtime  | runtime assertion check only; no SMT | prototyping, dev builds |
| `static`            | 1              | Static   | static type-level verification; no solver calls on the fast path | the default fast path |
| `fast`              | 2              | Proof    | capability router with 0.3× timeout; unknowns don't block | iterative development |
| `complexity_typed`  | < ω (n)        | Proof    | bounded-arithmetic verification (V_0 / V_1 / S^1_2 / V_NP / V_PH / IΔ_0); polynomial-time; CI budget ≤ 30 s | crypto protocols, real-time, embedded |
| `formal`            | ω              | Proof    | full SMT verification, capability router picks backend | recommended production default |
| `proof`             | ω + 1          | Proof    | user-supplied tactic block; kernel rechecks. Dominates SMT and admits induction. | theorems, foundational lemmas |
| `thorough`          | ω · 2          | Proof    | portfolio race with 2× timeout — first success wins; mandatory `decreases` / `invariant` / `frame` | hard obligations |
| `reliable`          | ω · 2 + 1      | Proof    | `thorough` + Z3 ∧ CVC5 must both return UNSAT; any disagreement → UNKNOWN | critical code, security audits |
| `certified`         | ω · 2 + 2      | Proof    | `reliable` + certificate materialisation, kernel re-check, multi-format export | security-critical, external audit, `.verum-cert` export |
| `coherent_static`   | ω · 2 + 3      | Proof    | α-cert + symbolic ε-claim; polynomial in `|P|·|φ|`; CI ≤ 60 s | weak coherence; production fallback for VFE-6 |
| `coherent_runtime`  | ω · 2 + 4      | Hybrid   | α-cert + runtime ε-monitor; trace-bounded; CI ≤ 5 min | hybrid coherence; runtime monitoring |
| `coherent`          | ω · 2 + 5      | Proof    | α/ε bidirectional check via 108.T-bridge; single-exponential; CI ≤ 30 min | critical-safety code requiring full operational coherence |
| `synthesize`        | ≤ ω · 3 + 1    | Proof    | treat goal as synthesis problem; capability router dispatches to the synthesis-capable backend (CVC5 SyGuS today) | program synthesis, hole filling, invariant generation |

**Strict monotonicity.** The ν-ordinals are pinned to make the
ladder strictly monotone:

```text
ν-rank:   0 < 1 < 2 < n<ω < ω < ω+1 < ω·2 < ω·2+1 < ω·2+2 < ω·2+3 < ω·2+4 < ω·2+5 < ω·3+1
strategy: runtime < static < fast < complexity_typed < formal < proof < thorough <
          reliable < certified < coherent_static < coherent_runtime < coherent < synthesize
```

**VFE-6 coherence triplet.** The `coherent_*` family realises Theorem
18.T1 (operational coherence): for a program `P` with property `φ`,
the strict `coherent` strategy verifies BOTH the static α-certificate
AND the runtime ε-monitor for the dual `T_108(φ)` and rejects the
verdict iff either side fails or they disagree. The polynomial /
trace-bound variants give practical fallbacks. See VFE foundational-
extensions.md §6 for full semantics.

**VFE-8 complexity_typed strategy.** Routes the goal through the
bounded-arithmetic stratum (V_0 / V_1 / S^1_2 / V_NP / V_PH / IΔ_0
per `core.math.frameworks.bounded_arithmetic`). Verification is
*polynomial-time* per the system's complexity class, and the
weak-AFN-T result (Theorem 137.T) guarantees that no L_Abs can be
realised inside the weak stratum — bounded-arithmetic verification is
strictly weaker than full-arithmetic verification but with a tractable
performance budget.

The Diakrisis ν-invariant lives at the level of countable ordinals;
Verum's `verum_smt::verify_strategy::NuOrdinal` enum encodes the
thirteen strata exactly so a CI check can assert distinct ranks per
strategy. See the
[MSFS coordinate page](msfs-coord.md#2-the-ordinal-type) for the
full Cantor-normal-form encoding used for theorem-level coords.

**Synthesize orthogonality.** `synthesize` is *modally orthogonal*
to the linear ladder: it returns a `(GoalShape, WitnessShape)`
pair rather than a Bool verdict, so its ν is an **upper bound**,
not a fixed value. A successful synthesis collapses to the
witness-strategy's ν (per MSFS Thm 4.4).

`formal` is the recommended default today and is what `verum verify`
selects when no `--mode` is passed; `@verify` without an argument
behaves the same.

`formal` is the recommended default today and is what `verum verify`
selects when no `--mode` is passed; `@verify` without an argument
behaves the same.

### Where the dispatch lives

When the compiler sees `@verify(thorough)` on a function, the chain is:

1. `verum_verification::level::VerificationLevel::from_annotation("thorough") → Proof`
2. `verum_smt::verify_strategy::VerifyStrategy::from_attribute_value("thorough") → Thorough`
3. `verum_smt::backend_switcher::BackendSwitcher::solve_with_strategy(&obligations, &Thorough)`
   temporarily sets `self.current = BackendChoice::Portfolio`, runs
   every capable backend in parallel, accepts the first success, and
   restores the caller's backend.

`certified` additionally goes through `solve_cross_validate`, which
runs two orthogonal verification techniques and raises a hard build
error if they disagree — a solver bug or an encoding mismatch in
either pipeline is caught at that gate, not silently folded into an
accepted theorem.

### Project-level mapping

For the matching project-level configuration and per-module overrides,
see the `[verify]` / `[verify.modules."..."]` schema below.

## Requesting a strategy

```verum
@verify(runtime)    fn prototype()  { ... }
@verify(proof)      fn critical()   { ... }
@verify(cubical)    fn path_proof() { ... }
@verify(dependent)  fn sigma_proof(){ ... }
```

The corresponding CLI invocations:

```bash
verum verify --mode runtime      # runtime assertions only
verum verify --mode proof        # full SMT (default)
verum verify --mode compare      # runtime + proof side-by-side
verum verify --mode cubical      # cubical-tactic focused proof
verum verify --mode dependent    # dependent-type focused proof
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
The router picks the SMT backend based on the obligation's theory mix.

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
to the SMT backend, the portfolio executor, or the tactic evaluator based
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

## Framework axioms — making trusted boundaries visible

Not every theorem can be — or should be — re-proved from first
principles. Some results come from the rest of mathematics: Lurie's
Higher Topos Theory, Schreiber's Differential Cohesion, Connes's
reconstruction theorem, the Petz classification of monotone quantum
metrics, the Arnold–Mather catastrophe normal forms, Baez–Dolan
tricategory coherence, and so on. Verum lets you *postulate* these
results as axioms while keeping the boundary absolutely explicit.

### Declaring a framework axiom

```verum
@framework(lurie_htt, "HTT 6.2.2.7")
axiom sheafification_is_topos(c: Int) -> Bool
    ensures c >= 0;

@framework(connes_reconstruction, "Connes 2008 axiom (vii)")
axiom first_order_condition(m: Int) -> Bool
    ensures m >= 0;
```

`@framework(identifier, "citation-string")` is a typed attribute. The
identifier is a short machine-readable framework name (by convention
matching a file under `core/math/frameworks/<name>.vr`); the citation
is a free-form human-readable reference to the specific result being
postulated.

### Enumerating the trusted boundary

Before accepting a proof corpus, every external reviewer wants to see
the exact set of trusted results it rests on. Verum emits that set on
demand:

```bash
$ verum audit --framework-axioms

Framework-axiom trusted boundary
────────────────────────────────────────
  Parsed 42 .vr file(s), skipped 0 unparseable file(s).
  Found 12 marker(s) across 4 framework(s):

  ▸ connes_reconstruction (1 marker)
    · axiom first_order_condition  —  Connes 2008 axiom (vii)  (src/physics.vr)
  ▸ lurie_htt (5 markers)
    · axiom sheafification_is_topos  —  HTT 6.2.2.7      (src/category.vr)
    · axiom presentable_localization —  HTT 5.5.4.15     (src/category.vr)
    …
  ▸ petz_classification (2 markers)
    …
  ▸ schreiber_dcct (4 markers)
    …
```

Malformed `@framework(...)` attributes (wrong arg shape) make the
command exit non-zero, so CI gates on "no hidden axioms".

### Stratified theorem tags

For corpora that distinguish rigorous, framework-conditional, and
stratified theorems (the Unitary Holonomic Monism formalisation is the
canonical one), the convention is to mark each axiom's reason on the
`@framework` line and use the output of `verum audit --framework-axioms`
as the canonical audit trail — every theorem's trusted base is a
simple file grep away.

## The trusted kernel — `verum_kernel`

All the proof machinery above (elaboration in `verum_types`, tactics
in `verum_verification`, SMT dispatch in `verum_smt`, cubical NbE,
framework-axiom registry) produces proof terms in an **explicit typed
calculus**. A separate crate — `verum_kernel`, target size under
5 000 lines of Rust — is the **sole trusted checker**. If the kernel
accepts a term, the theorem is considered proved; if it rejects one,
no downstream pass can rescue it.

The kernel's public API is:

```rust
pub fn infer(ctx: &Context, term: &CoreTerm, axioms: &AxiomRegistry)
    -> Result<CoreTerm, KernelError>;

pub fn verify_full(ctx: &Context, term: &CoreTerm,
                   expected: &CoreTerm, axioms: &AxiomRegistry)
    -> Result<(), KernelError>;

pub fn replay_smt_cert(ctx: &Context, cert: &SmtCertificate)
    -> Result<CoreTerm, KernelError>;
```

Two implications flow from this boundary:

1. **SMT is outside the TCB.** Z3 / CVC5 / E / Vampire / Alt-Ergo each
   produce an `SmtCertificate`; the kernel re-derives a checkable
   proof term from the certificate via `replay_smt_cert`. A bug in a
   solver that produced a spurious "proof" fails the replay — it
   cannot leak into an accepted theorem.

2. **Tactics are outside the TCB.** Every tactic — including every
   one of the 22 built-ins — produces a `CoreTerm`, which the kernel
   re-checks. A buggy tactic can refuse to build, or build an
   ill-typed term, but it can never lie to the kernel.

The explicit trusted computing base after the kernel lands is
therefore exactly:

- the Rust compiler and its linked dependencies (unavoidable),
- the `verum_kernel::{check, infer, verify_full}` loop and its
  sub-routines (`substitute`, `structural_eq`, universe rules), and
- the axioms registered via `AxiomRegistry::register` (each one
  carries its `FrameworkId` attribution).

Every other subsystem — the elaborator, the 22 tactics, the
SMT backends, the cubical NbE evaluator, the exporters — can have
bugs, but those bugs manifest as "the elaborator refused a valid
program" or "the SMT cert replay failed", never as "a false theorem
was accepted".

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

## The `core.verify` stdlib surface

Library code that needs to reason about its own verification
posture uses the user-facing mirror of the internal policy
types exposed under `core.verify`:

| Module                      | Surface                                                                                   |
|-----------------------------|-------------------------------------------------------------------------------------------|
| `core.verify.level`         | `VerificationLevel { Runtime \| Static \| Proof }` + `parse_level` / `to_annotation` / `requires_smt` / `allows_runtime_fallback` |
| `core.verify.attempt`       | `ProofAttempt { Proven \| Failed(Text) \| Unattempted }` + `VerificationOutcome { ElideCheck \| EmitRuntimeCheck \| FallbackWithWarning(Text) \| HardFail(Text) }` + `evaluate_attempt` policy dispatch |
| `core.verify.certificate`   | `CertificateSummary` (read-only view of `verum_kernel::SmtCertificate` envelope fields) + `validate_schema` + `get_metadata` |

Callers that want the same "prove or fall-back" semantics the
compiler enforces go through `evaluate_attempt(level, attempt)
-> outcome`. The outcome table:

| Level   | `Proven`    | `Failed(r)`                | `Unattempted`                |
|---------|-------------|----------------------------|------------------------------|
| Runtime | `EmitRuntimeCheck` | `EmitRuntimeCheck`  | `EmitRuntimeCheck`           |
| Static  | `ElideCheck`       | `FallbackWithWarning(r)` | `FallbackWithWarning(…)` |
| Proof   | `ElideCheck`       | `HardFail(r)`       | `HardFail(…)`                |

This is exactly the table enforced by the compiler's
`VerificationLevel::evaluate_attempt` — user libraries
cannot roll their own policy without diverging from the
compiler's enforcement.

Construction of real certificates remains on the kernel
side; `CertificateSummary` is an inspection-only view, so
user code cannot forge trace bytes. The envelope carries a
`schema_version` field and a free-form `metadata` key-value
list for diagnostic context; `validate_schema` rejects any
certificate whose version exceeds the kernel's current
`CERTIFICATE_SCHEMA_VERSION`.

## See also

- **[Refinement reflection](/docs/verification/refinement-reflection)**
  — making `@logic` functions available to the solver.
- **[SMT routing](/docs/verification/smt-routing)** — how the
  capability router picks between the available SMT backends.
- **[Contracts](/docs/verification/contracts)** — `requires`,
  `ensures`, `invariant`.
- **[Proofs](/docs/verification/proofs)** — the tactic DSL.
- **[Cubical & HoTT](/docs/verification/cubical-hott)** — higher
  equational reasoning.
- **[Reference → verum.toml](/docs/reference/verum-toml#verify--formal-verification)**
  — full `[verify]` schema.
- **[Architecture → verification pipeline](/docs/architecture/verification-pipeline)**
  — the solver-side internals.
- **[Architecture → trusted kernel](/docs/architecture/verification-pipeline#trusted-kernel)**
  — the LCF-style check loop in `verum_kernel`, the sole trusted
  checker in the stack.
