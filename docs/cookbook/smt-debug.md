---
title: Debugging an SMT failure
description: "When the solver can't prove your obligation — a diagnostic playbook."
---

# Debugging SMT failures

You added `@verify(smt)` to a function, the compiler says the
solver can't prove the postcondition, and you don't know why. This
page is the playbook.

### The four states

| Solver says | Meaning | Your move |
|---|---|---|
| `unsat` | obligation is true | nothing — compile proceeds |
| `sat` + counter-example | **false** — the obligation can be violated | fix the code or weaken the contract |
| `unknown` | can't decide in time / too hard | make the obligation easier |
| timeout | didn't finish in `smt_timeout_ms` | simplify or raise the budget |

### Read the counter-example

Verum prints the counter-example verbatim:

```
error[V3402]: postcondition violated
  --> src/stack.vr:17:5
   |
17 |     stack.push(x);
   |     ^^^^^^^^^^^^^ obligation failed:
   |   self.len() == old(self.len()) + 1
   = counter-example:
      stack.len() = 2147483647      (UInt32::MAX)
      x           = 42
   = help: add `where requires self.len() < UInt32::MAX`
```

Often the counter-example reveals an edge case you hadn't
considered (overflow, empty collection, NaN).

### Diagnostic flags

Emit the SMT-LIB sent to the solver:

```bash
$ verum verify --emit-smtlib src/stack.vr
# writes target/smtlib/*.smt2 — one per obligation
```

Run Z3 or CVC5 interactively on it:

```bash
$ z3 -st target/smtlib/push_postcond.smt2
$ cvc5 --stats target/smtlib/push_postcond.smt2
```

Time each obligation:

```bash
$ verum analyze --report smt
 obligation                          routed      ms   result
 stack::push/postcond#1              z3           8   unsat
 stack::push/postcond#2              z3         340   unsat   ← slow
 stack::merge/postcond#3             cvc5        72   unsat
 stack::balance/postcond#1           portfolio  800   unknown  ← problem
```

### Playbook — "solver can't prove a true obligation"

#### 1. Is it actually true?

Obvious but essential. Trace by hand; write a property test:

```verum
@test(property)
fn push_grows_len(s: Stack<Int>, x: Int) {
    let before = s.len();
    let after = s.push(x).len();
    assert_eq(after, before + 1);
}
```

If the property test finds a counter-example, the claim is false.

#### 2. Missing invariant

For loops: the `invariant` clauses must imply the postcondition
when combined with the exit condition. Common omissions:

- Loop-variable bounds (`0 <= i && i <= n`).
- Accumulator invariants (`sum == i * (i+1) / 2`).
- Structural invariants (`xs.iter().take(i).all(|x| pred(x))`).

Write the post-loop state as a conjunction; each conjunct needs
explicit support from an invariant.

#### 3. Missing `decreases`

Loop termination isn't proven automatically for complex loops.
Supply an explicit `decreases measure;` clause.

#### 4. Quantifier trouble

`forall x: Int. P(x)` — unbounded — forces the solver to synthesise
instantiations. Bound it:

```verum
forall i in 0..n. P(i)               // has bounds
forall x: Int where 0 <= x && x <= max. P(x)
```

#### 5. Nonlinear arithmetic

Z3's nonlinear engine is limited; CVC5's is better.

```verum
@verify(cvc5) fn nonlinear_fn(...) -> ... { ... }
```

Or supply lemmas that linearise the reasoning.

#### 6. Missing `@logic` axiom

If the predicate refers to a helper function, that function must be
reflected via `@logic`. Without it, the solver sees an uninterpreted
function it can't unfold.

See [Logic functions](/docs/cookbook/logic-functions).

#### 7. Too many obligations in one function

Split the function. Each obligation is solved independently; smaller
goals are easier.

### Playbook — "solver times out"

1. **Raise the budget** (temporarily, to see if it's a hard-limit
   issue):

   ```toml
   [verification]
   smt_timeout_ms = 30_000
   ```

2. **Simplify the body**. Extract intermediate computations into
   helper functions with their own contracts. Split conjunctive
   postconditions.

3. **Switch backend**:

   ```verum
   @verify(cvc5)    // nonlinear, strings, finite-model finding
   @verify(z3)      // LIA, bitvectors, arrays
   ```

4. **Supply inductive hints**:

   ```verum
   // Prove a lemma separately; use it inside the main proof.
   lemma helper_monotonic(a: Int, b: Int)
       where requires a <= b
       ensures f(a) <= f(b)
   { by induction a { ... } }
   ```

5. **Use `assume` sparingly** to prune search:

   ```verum
   if !likely_to_help { return result; }
   assume(condition_that_holds);       // hint to solver
   // ... rest of function ...
   ```

### Playbook — "counter-example is weird"

"Weird" usually means one of:

- **Integer overflow**: `Int` is 64-bit; the counter-example may
  involve values near `Int::MAX`. Add explicit bounds.
- **NaN / infinity**: Floats allow NaN which is ≠ to everything.
  Use `is_finite()` guard.
- **Empty collection**: sizes zero break many invariants. Add a
  `self.len() > 0` refinement or handle the empty case.
- **Ghost field**: a field whose value is unconstrained. Add an
  invariant linking it to observable state.

### Playbook — "portfolio disagreement"

With `@verify(portfolio)`, a disagreement means Z3 and CVC5 returned
conflicting verdicts:

```
warning[V6104]: portfolio solvers disagreed
  obligation: critical_invariant#3
  z3:   unsat (142 ms)
  cvc5: sat  (counter-example: x = 17, y = 0)
```

This is exceedingly rare and indicates a potential solver bug. Action:

1. **Extract the SMT-LIB** and test each solver manually.
2. **Check for timeouts** — sometimes `unknown` is reported as `sat`
   by one tool and `unsat` by another due to resource limits.
3. **File a bug** with the minimal reproducer — both to Verum and
   to the upstream solver maintainer.

### General tips

- **Start small**: verify one short function completely before
  adding `@verify(smt)` project-wide.
- **Incremental proving**: prove sub-claims as named `lemma`s that
  the main theorem can `apply`.
- **Cache awareness**: if you edit only the body and the solver
  suddenly complains, try `verum proof-cache clear`.
- **Print debug info**: `verum verify --trace obligation_id=push_postcond#1`
  shows the SMT interaction step by step.

### See also

- **[Verification → SMT routing](/docs/verification/smt-routing)** —
  which solver handles what.
- **[Verification → proofs](/docs/verification/proofs)** — when SMT
  isn't enough, write a proof.
- **[Architecture → verification pipeline](/docs/architecture/verification-pipeline)**
  — internal architecture of Phase 5.
