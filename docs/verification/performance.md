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
   Linear in proposition size, plus one defining axiom per
   reflected function the proposition reaches.
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
each theory class. Typical costs measured on a desktop-class
machine running the standard solver-adapter pair:

| Theory                     | Typical time per obligation | Backend             | Escalation cost                     |
|----------------------------|------------------------------|---------------------|--------------------------------------|
| Bool / LIA                 | 1–10 ms                      | primary adapter     | Rare; if it happens, reflect.        |
| LRA (linear reals)         | 5–30 ms                      | primary adapter     | Nonlinear bump.                      |
| Bitvector (< 64 bits)      | 5–20 ms                      | primary adapter     | Width blow-up at 256+.               |
| Arrays + LIA               | 10–50 ms                     | primary adapter     | Extensionality ~ 200 ms.             |
| Strings (basic)            | 20–200 ms                    | string-capable adapter | Quantified strings can hit seconds. |
| Nonlinear arith            | 50–5,000 ms                  | NLA-capable adapter | Highly dependent on degree.          |
| FMF quantifiers            | 100–10,000 ms                | FMF-capable adapter | Add triggers; often cuts 10×.        |
| Mixed + quantifiers        | 500+ ms                      | Portfolio           | Biggest wins from reflection hints.  |

If your obligation sits in the top two rows, it's already fast.
If it sits in the bottom two, the remediation patterns in §5
apply.

---

## 3. What reflection costs

Reflection is automatic: a pure, single-expression, parameterised
function whose body is inside the translated fragment becomes one
`declare-fun` plus one universally-quantified defining axiom. There is
no unfolding knob to turn, because there is no recursive encoding —
a self-calling function is simply not reflected.

Cost per reflected function:

- **One definition.** A quantified equality the solver instantiates on
  demand. Negligible on its own.
- **Its declarations.** Opaque parameter sorts and any field or method
  projections the body uses add `declare-sort` / `declare-fun` lines,
  deduplicated across the module.
- **Its callers.** A composite predicate is a call, not a copy: the
  cost of `a() && b()` is the two definitions plus one more, not their
  inlined bodies.

What actually gets expensive is the goal side — quantifiers in a
predicate body, and non-linear arithmetic underneath them.

**Fix patterns**:

1. Keep leaves small and non-quantified. A field projection or a
   comparison is free; a `forall` in a body is not.
2. Where a predicate must be recursive, leave it unreflected and state
   what it guarantees as explicit `requires` / `ensures`. The
   obligation becomes visible instead of silently unconstrained.
3. If a goal will not close, run with `VERUM_TRACE_PROOFS=1` before
   tuning anything — an unproved goal caused by a predicate that never
   reflected looks exactly like one caused by a hard obligation, and
   the remedies are opposite.

See [Refinement reflection](./refinement-reflection.md) for the
fragment, the sorts and the emitted SMT-LIB.

---

## 4. Quantifier trigger costs

Universal quantifiers (`forall x. P(x)`) are the single biggest
source of solver runaway. SMT solvers handle them via
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
| W503  | Missing bound vars                            | Partial coverage — the listed variables aren't mentioned. The solver can't instantiate them through this trigger alone. Add them to the pattern or provide a second trigger. |
| W504  | Interpreted head                              | Trigger's outermost head is `+` / `<=` / `=` / Boolean combinators. SMT solvers never instantiate on interpreted heads — the trigger is dead code. Wrap the operand in an uninterpreted function or drop the trigger entirely. |

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
// Use an auxiliary reflected function so the solver has
// something to instantiate on.
public pure fn sum(x: Int, y: Int) -> Int { x + y }

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
2. Give a recursive predicate a non-recursive formulation, or
   leave it unreflected and state its guarantee as an explicit
   `requires` / `ensures`.
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
smt-backend-version   = "4.12.2"
smt-backend-version = "1.0.9"
```

### 5.3 "The predicate seems to mean nothing"

A goal over a predicate that never reflected is not hard — it is
unconstrained, and it fails the same way a genuinely open obligation
does. Run `VERUM_TRACE_PROOFS=1` and check the reflection warnings
first: a skipped entry names the leaf that took it down. Tuning the
solver for an unconstrained goal is time spent on the wrong layer.

### 5.4 "Portfolio disagreement"

`Certified` strategy requires both backends to agree. If they
disagree:

```bash
verum verify --mode proof --strategy certified <target> --on-disagreement=log
```

This logs the disagreement without failing the build, so you can
inspect whether a solver is buggy or the encoding is ambiguous.
Common causes: non-linear arithmetic handled differently by each
adapter, or an unreflected user-defined function whose symbol each
solver leaves uninterpreted in its own way.

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
overhead. Both `verum_smt::backend` and
`verum_smt::backend` thread through the same
`solver_diagnostics` helpers — a single IDE adapter can
consume either backend's output without special-casing.

### 7.3 Round-trippable dumps

The `--dump-smt` output is directly replayable:

```bash
verum verify --dump-smt /tmp/queries src/
# … queries dumped to /tmp/queries/smt-backend-query-*.smt2 …

verum verify --check-smt-formula /tmp/queries/smt-backend-query-00042.smt2
# sat
```

Use this loop when a specific obligation is slow and you
want to iterate on solver flags without running the full
Verum pipeline each time.

---

## 8. When slow is the right answer

Some obligations are genuinely expensive. Examples:

- **Cross-stratum proofs** (a physics-level theorem invoking a
  category-theory axiom from a different layer) can run
  10s–60s in the Certified strategy. This is the cost of
  cross-validation.
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
path = "src/foundations/*"
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
- Reflected definitions — a `(declare-fun …)` plus its
  `(assert (forall …))` per predicate the goal reaches.
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
- [Refinement reflection](./refinement-reflection.md) — which
  functions reflect, into what, and where the fragment ends.
- [CLI workflow](./cli-workflow.md) §6–7 — `smt-stats` /
  `smt-info` commands.
- [Counterexamples](./counterexamples.md) — when a proof
  *fails* rather than slows.
