---
title: Adding `@verify(formal)` to an existing function
description: Walk a plain function up the verification ladder.
---

# Adding `@verify(formal)`

Existing code already gets `@verify(static)` — dataflow + CBGR +
basic refinements. Here's how to graduate one function up to SMT.

### Starting point

```verum
fn clamp(lo: Int, hi: Int, x: Int) -> Int {
    if x < lo { lo }
    else if x > hi { hi }
    else { x }
}
```

### Step 1 — state the cross-parameter invariant

`hi >= lo` is required for `clamp` to make sense. Encode it:

```verum
fn clamp(lo: Int, hi: Int { self >= lo }, x: Int) -> Int { ... }
```

Callers who can't prove `hi >= lo` now get a compile error.

### Step 2 — add postcondition

```verum
fn clamp(lo: Int, hi: Int { self >= lo }, x: Int) -> Int
    where ensures result >= lo,
          ensures result <= hi,
          ensures result == x || result == lo || result == hi
{
    if x < lo { lo }
    else if x > hi { hi }
    else { x }
}
```

### Step 3 — turn on SMT

```verum
@verify(formal)
fn clamp(lo: Int, hi: Int { self >= lo }, x: Int) -> Int
    where ensures result >= lo,
          ensures result <= hi,
          ensures result == x || result == lo || result == hi
{
    if x < lo { lo }
    else if x > hi { hi }
    else { x }
}
```

Build:

```
[verify] clamp   ✓ (formal/z3, 6 ms)
```

Done — the capability router dispatched to the SMT backend and the postcondition
is proven across every branch.

### Graduating a loop — add invariants

```verum
@verify(formal)
fn sum_to(n: Int { self >= 0 }) -> Int
    where ensures result == n * (n + 1) / 2
{
    let mut sum = 0;
    let mut i = 0;
    while i < n
        invariant 0 <= i && i <= n
        invariant sum == i * (i + 1) / 2
        decreases n - i
    {
        i += 1;
        sum += i;
    }
    sum
}
```

Three ingredients:

- **`invariant`** holds at loop entry and after each iteration.
- **`decreases`** strictly decreases each iteration — proves termination.
- The invariant + loop exit condition `!(i < n)` implies the postcondition.

### Graduating to portfolio

For the critical 1% of your code:

```verum
@verify(thorough)
fn critical_security_function(...) -> ... { ... }
```

Runs the SMT backend in parallel and confirms they agree. ~2× compile
cost on that one function. Disagreement → CI failure with detailed
diagnostics.

### When SMT fails

Common failure modes and fixes:

**"Timed out after 5000 ms"**: unbounded quantifier, heavy
nonlinearity, or a predicate the solver can't decompose.

- Add an intermediate assertion: `assert(helper_lemma());` — splits
  the proof.
- Move a complex predicate into a named `@logic fn` that the solver
  can reuse.
- Escalate to `@verify(thorough)` — races the SMT backend, and tactic-based
  proof search in parallel; CVC5 handles nonlinear arithmetic and
  strings better than Z3 so this often unblocks hard goals.
- Bound quantifiers: `forall x: Int. P(x)` → `forall x in 0..n. P(x)`.

**"Counter-example: …"**: the solver found an input that violates
the contract.

- Read the counter-example carefully — sometimes the contract is
  wrong, not the code.
- Or the code is wrong for a case you hadn't considered.

**"Cannot prove termination"**: missing or wrong `decreases`.

- Every well-founded measure works: `n - i`, `xs.len()`, pair-order
  `(xs.len(), ys.len())` lex.
- For unusual recursion, supply a `decreases measure_fn(&inputs)`.

### Workflow tip

Start strict, loosen if needed:

```
@verify(runtime)      →   prototype; asserts only
@verify(static)       →   default; free
@verify(formal)          →   annotate invariants; the SMT backend proves
@verify(thorough)    →   safety-critical; both solvers
@verify(certified)    →   kernel-class; proof term required
```

And keep moving items down the list as the code matures.

### See also

- **[Gradual verification](/docs/verification/gradual-verification)**
- **[SMT routing](/docs/verification/smt-routing)** — how the SMT backend are chosen.
- **[Verified data structure tutorial](/docs/tutorials/verified-data-structure)**
  — full walkthrough with loop invariants.
