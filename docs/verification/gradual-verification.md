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

## The nine strategies

The grammar production `verify_strategy` (grammar/verum.ebnf §2)
admits exactly these nine keywords — seven distinct operational
behaviours plus two pairs of aliases. All nine are **live today**:

| Strategy      | Gradient | Operational shape | What it does | When to use |
|---------------|----------|-------------------|--------------|-------------|
| `runtime`     | Runtime  | Runtime           | runtime assertion check only; no SMT | prototyping, dev builds |
| `static`      | Static   | Static            | static type-level verification; no solver calls on the fast path | the default fast path |
| `formal`      | Proof    | Formal            | full SMT verification, capability router picks backend | recommended production default |
| `proof`       | Proof    | Formal            | alias of `formal`, emphasises proof extraction | when you want to inspect the term |
| `fast`        | Proof    | Fast              | capability router with 0.3× timeout; unknowns don't block | iterative development |
| `thorough`    | Proof    | Thorough          | portfolio race with 2× timeout — first success wins | hard obligations |
| `reliable`    | Proof    | Thorough          | alias of `thorough`, emphasises reliability | critical code |
| `certified`   | Proof    | Certified         | cross-validation: two independent techniques must agree; 3× timeout | security-critical, external audit, `.verum-cert` export |
| `synthesize`  | Proof    | Synthesize        | treat goal as synthesis problem; capability router dispatches to the synthesis-capable backend (CVC5 SyGuS today) | program synthesis, hole filling, invariant generation |

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
