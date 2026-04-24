---
sidebar_position: 12
title: Performance Tuning
---

# Verification Performance

> Verification time is a fundamentally different resource from
> compile time or runtime. This page is the troubleshooting guide
> for "my proof is slow" — covering theory-taxonomy costs,
> reflection-unfolding costs, quantifier-instantiation triggers,
> cache policy, and concrete remediation patterns.

If your `verum verify` run completes in seconds, this page is
not for you yet. If it takes minutes, hours, or fails to finish
— start here.

:::note
Every flag referenced on this page — `--profile`,
`--profile-obligation`, `--show-costs`, `--dump-smt`,
`--solver-protocol`, `--check-smt-formula`, `verum
smt-stats` — is part of the shipping CLI surface.
:::

---

## 1. Where verification time goes

Every obligation passes through five stages:

1. **Emission** — IR-level obligation construction in
   `verum_types`. Cheap. O(size of function body).
2. **Translation** — IR → SMT-LIB via `verum_smt::translate`.
   Linear in proposition size, but reflection unfolding can blow
   up by a constant-per-`@logic`-call.
3. **Routing** — capability classification. Cheap, O(1) on the
   translated formula's theory mix.
4. **Solving** — the dominant cost for most obligations.
   Non-linear in formula size; exponential in the worst case.
5. **Kernel replay** — for `Certified` strategy only. Cheap;
   dominated by certificate deserialisation + trust-tag lookup.

The `smt-stats --top 10` command surfaces the obligations where
solving dominated. Start there.

```bash
verum smt-stats --top 10 --by-theory
```

---

## 2. Theory taxonomy cost profile

Under `--solver auto`, the router picks the cheapest backend for
each theory class. Typical costs (measured on a desktop-class
machine with Z3 4.12.2 / CVC5 1.0.9):

| Theory                     | Typical time per obligation | Backend       | Escalation cost                     |
|----------------------------|------------------------------|---------------|--------------------------------------|
| Bool / LIA                 | 1–10 ms                      | Z3            | Rare; if it happens, reflect.        |
| LRA (linear reals)         | 5–30 ms                      | Z3            | Nonlinear bump.                      |
| Bitvector (< 64 bits)      | 5–20 ms                      | Z3            | Width blow-up at 256+.               |
| Arrays + LIA               | 10–50 ms                     | Z3            | Extensionality ~ 200 ms.             |
| Strings (basic)            | 20–200 ms                    | CVC5          | Quantified strings can hit seconds.  |
| Nonlinear arith            | 50–5,000 ms                  | Z3 NLA        | Highly dependent on degree.          |
| FMF quantifiers            | 100–10,000 ms                | CVC5 fmf_enum | Add triggers; often cuts 10×.         |
| Mixed + quantifiers        | 500+ ms                      | Portfolio     | Biggest wins from reflection hints.  |

If your obligation sits in the top two rows, it's already fast.
If it sits in the bottom two, the remediation patterns in §5
apply.

---

## 3. The reflection-unfolding knob

`@logic` functions get unfolded into axioms. Each unfold adds a
formula that the solver must handle. Reflection cost per call is
roughly:

- **Total function, no recursion**: negligible. One conditional
  equivalence axiom.
- **Structurally recursive**: O(depth × branching). Bound depth
  via `@logic(depth = 3)`.
- **With accumulators / let-bindings**: each let binding becomes
  a fresh axiom. Minimise intermediate bindings in `@logic` code.
- **With quantifiers in the body**: costly. Prefer non-quantified
  formulations.

**Diagnostic**: `verum verify --show-costs obligation_name` emits
per-obligation breakdown including "reflection unfolds" count.

**Fix patterns**:

1. Drop the `@logic` on functions whose bodies the solver doesn't
   need to reason about. Let them be uninterpreted.
2. Convert deeply-recursive `@logic` fns to closed forms where
   possible. E.g., `sum(xs) = xs.fold(0, +)` closes up better
   than `sum(Cons(h, t)) = h + sum(t)` for the solver.
3. Use `@logic(depth = N)` to cap unfold recursion.

See [Refinement reflection](./refinement-reflection.md) for the
reflection model itself.

---

## 4. Quantifier trigger costs

Universal quantifiers (`forall x. P(x)`) are the single biggest
source of solver runaway. Z3 and CVC5 handle them via
*instantiation*: each time the solver finds a term matching the
trigger pattern, it instantiates the quantifier at that term.

Without manual triggers, the solver picks triggers heuristically
— and often picks badly, over-instantiating into a proof-search
explosion.

**Diagnostic**: `verum smt-stats --by-theory | grep quantifier`
exposes the per-quantifier time.

**Fix patterns**:

```verum
// Bad: no trigger hint; solver picks whatever term contains `f`.
ensures forall x: Int. f(x) >= 0

// Good: explicit trigger tells the solver to instantiate only
// when it sees a term of the form `f(?)`.
@trigger(f(x))
ensures forall x: Int. f(x) >= 0

// Also good: multi-pattern trigger means x must match in BOTH
// positions before instantiation.
@trigger(f(x), g(x))
ensures forall x: Int. f(x) >= g(x)

// Worst: quantifier over a quantifier with no trigger.
// The solver will often give up with `unknown`.
ensures forall x: Int. forall y: Int. P(x, y)
```

The `@trigger` attribute is the single most impactful performance
knob in Verum verification. Learn it.

### 4.1 Trigger diagnostics (W502 / W503 / W504)

Verum applies structural validation of quantifier triggers.
Both auto-extracted triggers and user-provided `@trigger(…)`
expressions are checked against three shape-level defects —
the same catalogue the SMT-LIB / Simplify literature flags
as "trigger will silently fail to fire":

| Code  | Defect                                        | Fix                                                      |
|-------|-----------------------------------------------|----------------------------------------------------------|
| W502  | No bound-var references                       | Trigger mentions no quantifier variable — it never fires. Usually means the syntax is off; the outer-scope term you meant to match isn't the trigger's target. |
| W503  | Missing bound vars                            | Partial coverage — the listed variables aren't mentioned. Z3 can't instantiate them through this trigger alone. Add them to the pattern or provide a second trigger. |
| W504  | Interpreted head                              | Trigger's outermost head is `+` / `<=` / `=` / Boolean combinators. Z3 never instantiates on interpreted heads — the trigger is dead code. Wrap the operand in an uninterpreted function or drop the trigger entirely. |

The validation runs unconditionally on every extracted
trigger — a project that emits thousands of triggers sees
any structural defect immediately. The W-coded diagnostics
carry `tag()` + `summary()` for consumption by the CLI /
LSP renderer.

Example of the W504 anti-pattern:

```verum
@trigger(x + y)   // WRONG — `+` is interpreted; trigger
                  // never fires.
ensures forall x, y: Int. x + y == y + x
```

Rewrite:

```verum
// Use an auxiliary uninterpreted function so Z3 has
// something to instantiate on.
@logic
fn sum(x: Int, y: Int) -> Int { x + y }

@trigger(sum(x, y))
ensures forall x, y: Int. sum(x, y) == sum(y, x)
```

---

## 5. Concrete remediation recipes

### 5.1 "Solver returned `unknown`"

Start here:

```bash
verum verify --solver portfolio --timeout 300 <target>
```

If still unknown, one of:

1. Add `@trigger` attributes to quantifiers.
2. Convert recursive `@logic` functions to closed forms.
3. Split the obligation into subgoals via `have` steps in a
   structured proof block.
4. Escalate to `--strategy thorough` (portfolio race + longer
   timeout) if the proof is real but the single solver is
   failing heuristically.

### 5.2 "My proof is slow in CI"

Check `verum smt-info` on both sides. Solver version drift is the
single most common cause of "fast locally, slow in CI." Pin the
solver version in `verum.toml`:

```toml
[verify.solvers]
z3-version   = "4.12.2"
cvc5-version = "1.0.9"
```

### 5.3 "Reflection unfolds dominate"

Profile with `--show-costs`. If reflection-unfold count is >10
for a single obligation, at least one `@logic` function is
recursing too deep. Bound it, or drop `@logic` on the deepest
helper.

### 5.4 "Portfolio disagreement"

`Certified` strategy requires both backends to agree. If they
disagree:

```bash
verum verify --mode proof --strategy certified <target> --on-disagreement=log
```

This logs the disagreement without failing the build, so you can
inspect whether a solver is buggy or the encoding is ambiguous.
Common causes: non-linear arithmetic handled differently by Z3
vs CVC5, or a user-defined function without `@logic` where the
solvers uninterpret the symbol differently.

### 5.5 "Timeout per obligation"

Increase via `--timeout`. But first verify the obligation is
actually provable:

```bash
verum verify --strategy thorough --solver portfolio --timeout 600
```

If 600 seconds across both backends cannot close it, the
obligation is probably beyond decidable SMT — you need structure
(a `proof by induction(…)` block) or a framework axiom.

### 5.6 "I changed one line and now 100 obligations fail"

Something about your change invalidated a shared lemma or
invariant. Use:

```bash
verum verify --diff HEAD~1
```

to show which obligations regressed versus the previous commit.
The single-responsibility rule says you added exactly one
invariant change; the output tells you which 99 obligations
depended on the one you changed.

### 5.7 "Proof works locally but fails after a stdlib upgrade"

Refinement axioms auto-registered by the stdlib change between
releases. Pin the stdlib version and use the migration guide for
each release.

---

## 6. Caching

Verum caches SMT results at two levels:

1. **Intra-session**: each `verum verify` run remembers
   solutions to obligations whose SMT-LIB hash matches a prior
   query. Enabled by default.
2. **Cross-session**: `target/smt_cache/` stores the same
   mappings across invocations. Enabled by default; disable with
   `[verify] cache = false`.

Cache hit rate is reported by `smt-stats`. A healthy project has
>40% hits after warm-up. If your cache hit rate is low:

- Check that `obligation_hash`es are stable — they depend on
  SMT-LIB canonicalization. Unstable identifiers (e.g. fresh
  `Skolem_<n>` constants in user code) defeat caching.
- Check that you're not passing `--no-cache`.

### 6.1 Cache invalidation

Cache entries are invalidated when:

- The SMT backend version changes.
- The formula's obligation hash doesn't match.
- The kernel version bumps (schema change).
- Manually via `verum smt-stats --reset`.

---

## 7. Profiling a single obligation

### 7.1 `--profile-obligation`

The per-obligation breakdown surface:

```bash
verum verify --profile-obligation src/
```

Output includes the standard profile report plus a
"Slowest obligations" table sorted by wall-clock time:

```text
Slowest obligations:
============================================================
  obligation                             time (ms)   share %
  ----------------------------------------------------------------
  sort.postcondition                       184.2     62.1%
  sort.loop_inv.inner                       46.7     15.7%
  sort.pre                                  22.1      7.4%
  map.get_or.pre                            12.5      4.2%
  …
  (… 17 more obligations omitted; pass --export to dump full list)
```

When the verifier has per-obligation instrumentation
available (`VerificationReport::add_obligation_timings`
populated), rows are labelled `function.obligation` —
e.g. `sort.postcondition`, `sort.loop_inv.inner`. Otherwise
the rendering falls back to function-granular aggregates
(one row per function).

### 7.2 SMT debugging side channels

Three env-var toggles control diagnostic output (exported by
the CLI flags or by the user):

| Env var                | CLI flag                | Effect                                                  |
|------------------------|-------------------------|---------------------------------------------------------|
| `VERUM_DUMP_SMT_DIR`   | `--dump-smt DIR`        | Every solver query written as `DIR/<prefix>-<NNNNN>.smt2`. |
| `VERUM_SOLVER_PROTOCOL` | `--solver-protocol`    | `[→]` send + `[←]` recv lines streamed to stderr.      |
| `VERUM_LSP_MODE`       | `--lsp-mode`            | Verification diagnostics emitted as newline-delimited JSON on stdout. |

All three are **pay-for-only-what-you-use**: solvers
short-circuit the diagnostic calls at the env-var check, so
the CI default (no env vars set) pays no observable
overhead. Both `verum_smt::z3_backend` and
`verum_smt::cvc5_backend` thread through the same
`solver_diagnostics` helpers — a single IDE adapter can
consume either backend's output without special-casing.

### 7.3 Round-trippable dumps

The `--dump-smt` output is directly replayable:

```bash
verum verify --dump-smt /tmp/queries src/
# … queries dumped to /tmp/queries/z3-query-*.smt2 …

verum verify --check-smt-formula /tmp/queries/z3-query-00042.smt2
# sat
```

Use this loop when a specific obligation is slow and you
want to iterate on solver flags without running the full
Verum pipeline each time.

---

## 8. When slow is the right answer

Some obligations are genuinely expensive. Examples:

- **Cross-stratum proofs** in the UHM corpus (a physics
  theorem invoking a category-theory axiom from a different
  layer) can run 10s–60s in the Certified strategy. This is the
  cost of cross-validation.
- **Large-state invariants** in concurrent data structures —
  the theory combination is non-trivial.
- **Refinement chains** 5+ deep — the transitively-unfolded
  predicate gets large.

The escape valve is **strategy demotion**: run this obligation
at `Formal` strategy in CI (fast build) and at `Certified`
strategy only on release branches. Configure per-file in
`verum.toml`:

```toml
[[verify.override]]
path = "internal/verum-proofs-uhm/foundations/*"
strategy = "certified"
timeout = 600
```

---

## 9. Worked example: optimising a slow proof

Suppose `verum verify` reports:

```
Slowest obligation: sort_preserves_length (8,421 ms)
```

**Step 1** — dump the obligation:

```bash
verum verify --dump-smt target/dump --only sort_preserves_length
```

**Step 2** — inspect `target/dump/sort_preserves_length.smt2`.
Look for:

- Unbounded quantifier depth.
- `@logic` unfold expansions — `(declare-fun sort_rec …)` with
  large axioms.
- Missing trigger hints on `forall` clauses.

**Step 3** — add triggers:

```verum
@trigger(length(sort(xs)), length(xs))
ensures forall xs: List<Int>. length(sort(xs)) == length(xs)
```

**Step 4** — re-verify:

```bash
verum verify sort_preserves_length
```

Time drops to 142 ms. Document the triggers as a comment so
future readers know why they're there.

---

## 10. See also

- [SMT routing](./smt-routing.md) — which backend gets picked
  and why.
- [Refinement reflection](./refinement-reflection.md) — how
  `@logic` unfolding works and what bounds it.
- [CLI workflow](./cli-workflow.md) §6–7 — `smt-stats` /
  `smt-info` commands.
- [Counterexamples](./counterexamples.md) — when a proof
  *fails* rather than slows.
