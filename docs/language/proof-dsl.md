---
sidebar_position: 27
title: Proof DSL
description: Theorems, lemmas, tactics, and calculational proofs in Verum.
---

# The Proof DSL

Verum's proof DSL is the language-level surface for formal verification
beyond refinement types and `ensures` clauses. It lets you state and
prove theorems directly in source, write custom tactics, and extract
machine-checkable certificates.

This page documents the syntax and semantics of `theorem`, `lemma`,
`axiom`, `corollary`, `tactic`, `calc`, and structured proofs
(`have`/`show`/`obtain`). For the tactic catalogue, see
**[reference/tactics](/docs/reference/tactics)**. For how the engine
chooses a backend, see
**[verification/smt-routing](/docs/verification/smt-routing)**.

## Five declaration forms

### `theorem` — the canonical form

A theorem is a named proposition with a proof.

```verum
theorem add_comm(a: Int, b: Int)
    ensures result == a + b == b + a
{
    proof by auto
}
```

- The parameter list gives the universally quantified variables.
- `requires` / `ensures` state the pre- and post-conditions.
- The `proof` body is the proof term — a tactic expression, an explicit
  term, or a structured block.

### `lemma` — auxiliary results

Syntactically identical to `theorem`; intended for helpers used only
inside other proofs. Lemmas participate in tactic search
(`auto`, `blast`, `smt`) when their name is in scope.

```verum
lemma mod_periodic(n: Int, k: Int)
    requires k > 0
    ensures (n + k) % k == n % k
{
    proof by omega
}
```

### `axiom` — unproven assumptions

An `axiom` states a fact without proof. The compiler accepts it; the
**certified** verification strategy refuses to terminate on a proof
that transitively depends on axioms (so axiom use is visible and
audited).

```verum
axiom choice<T>(predicate: fn(T) -> Bool) -> T;
```

Use sparingly — each axiom is a leak in the trust model.

### `corollary` — consequences

A corollary derives from a prior `theorem` or `lemma` via the `from`
clause. The proof is then allowed to reference that theorem directly.

```verum
corollary add_zero_right(a: Int)
    ensures a + 0 == a
    from add_comm
{
    proof by simp
}
```

### `tactic` — custom proof strategies

A user-defined tactic composes existing tactics into new ones:

```verum
tactic arith_closure(n: Int) {
    simp;
    rewrite mod_periodic(n);
    omega
}
```

Named tactics can then appear in `by` positions anywhere:

```verum
theorem closure_test(n: Int, k: Int)
    requires k > 0
    ensures (n * 2 + k) % k == (n * 2) % k
{
    proof by arith_closure(n * 2)
}
```

Tactics are **generic**, **typed**, and **structured**. A single
tactic declaration can:

- open type variables — `tactic category_law<C>() { … }`,
  invoked with `category_law<F.Source>()`;
- take typed parameters with defaults — `oracle(goal: Prop, confidence: Float = 0.9)`;
- use `let`, `match`, `if`/`else`, and `fail` inside the body for
  monadic composition and pattern-directed proof search.

```verum
tactic oracle(goal: Prop, confidence: Float = 0.9) {
    let candidates: Giry<Prop> = @llm_oracle(goal);
    let best: Maybe<Prop>      = sample_above(candidates, confidence);
    match best {
        Maybe.Some(proof_term) => {
            apply(proof_term);
            try { smt } else { fail("oracle candidate rejected by SMT") }
        },
        Maybe.None => fail("oracle confidence below threshold"),
    }
}
```

See **[reference/tactics — User-defined tactics](/docs/reference/tactics#user-defined-tactics)**
for the full grammar, parameter-kind table, and combinator reference.

## Three proof-body shapes

```ebnf
proof_body       = 'proof' , ( proof_by_tactic | proof_by_term | proof_structured ) ;
proof_by_tactic  = 'by' , tactic_expr ;
proof_by_term    = '=' , expression ;
proof_structured = '{' , { proof_step } , '}' ;
```

### `proof by tactic`

The compact form. The tactic expression can be a single tactic, a
sequence (`t1; t2`), or any combinator.

```verum
theorem distributivity(a: Int, b: Int, c: Int)
    ensures a * (b + c) == a * b + a * c
{
    proof by ring
}
```

### `proof = term`

A proof term — an explicit expression of the proposition's type. Used
when you already have a constructive witness.

```verum
theorem refl<T>(x: T) -> Path<T>(x, x)
{
    proof = path_refl(x)
}
```

Proof terms interoperate with dependent types — the body is an ordinary
expression at the type level.

### Structured proofs — `proof { ... }`

Human-readable, step-by-step proofs that name intermediate facts.

```verum
theorem sqrt_lt(n: Int)
    requires n >= 4
    ensures sqrt(n) < n
{
    proof {
        have n_pos: n > 0 by omega;
        have sqrt_pos: sqrt(n) > 0 by sqrt_positive(n_pos);
        show sqrt(n) < n by {
            simp;
            induction n { cases; omega }
        }
    }
}
```

Steps:

- `have name: prop by ...` — introduce a named hypothesis.
- `show prop by ...` — discharge the current goal.
- `obtain pattern from expr` — eliminate an existential or sum.
- A bare `tactic;` — apply a tactic to the current goal.

## Calculational proofs — `calc`

Chain of relations, each justified, useful for algebraic manipulation:

```verum
theorem chain(a: Int, b: Int)
    ensures (a + b) * (a + b) == a * a + 2 * a * b + b * b
{
    proof {
        calc {
            (a + b) * (a + b)
            == { by ring }           a * a + a * b + b * a + b * b
            == { by simp }           a * a + a * b + a * b + b * b
            == { by ring }           a * a + 2 * a * b + b * b
        }
    }
}
```

The relation can be any of `==`, `!=`, `<`, `<=`, `>`, `>=`. Each
step's justification feeds the named tactic or lemma.

## Tactic combinators

The tactic grammar supports five combinators that let you build larger
strategies:

| Combinator                           | Meaning                                                   |
|--------------------------------------|-----------------------------------------------------------|
| `t1 ; t2`                            | Apply `t1`, then `t2` on the remaining goal(s).           |
| `try { t } else { t2 }`              | Run `t`; on failure fall back to `t2`.                    |
| `try { t }`                          | Run `t`; on failure do nothing.                           |
| `repeat { t }`                       | Apply `t` until it fails, or `repeat(n) { t }` for bounded. |
| `first { t1 ; t2 ; t3 }`             | Apply the first `t*` that succeeds.                       |
| `all_goals { t }`                    | Apply `t` to every open goal.                             |
| `focus(i) { t }`                     | Apply `t` to only the *i*-th open goal.                   |

Example:

```verum
tactic cleanup() {
    try { simp };
    all_goals {
        first {
            omega;
            ring;
            assumption
        }
    }
}
```

## Built-in tactic catalogue

A concise summary — see [reference/tactics](/docs/reference/tactics)
for signatures and counterexamples.

| Group         | Tactics                                                                 |
|---------------|-------------------------------------------------------------------------|
| Trivial       | `trivial`, `assumption`, `contradiction`                                |
| Introduction  | `intro`, `intros`, `exact`, `apply`                                     |
| Simplification | `simp`, `unfold`, `rewrite`                                            |
| Arithmetic    | `omega` (Presburger), `ring` (commutative rings), `field`               |
| Structural    | `induction`, `cases`, `blast`                                           |
| Automation    | `auto`, `smt`                                                           |
| Cubical       | `cubical`                                                               |
| Category      | `category_simp`, `category_law`, `descent_check`                        |

`auto` is the workhorse — it composes `simp`, `assumption`, and a
bounded search over hypotheses and lemmas in scope.

`smt` dispatches to the SMT engine with whichever backend wins
the **capability router** — the SMT backend, see
[verification/smt-routing](/docs/verification/smt-routing).

## Interaction with `@verify`

A function with `@verify(formal)` and an `ensures` clause is
equivalent to generating an anonymous theorem at the function's
boundary:

```verum
@verify(formal)
fn add(a: Int, b: Int) -> Int
    where ensures result == a + b
{
    a + b
}
```

is, to the verifier, the same as:

```verum
theorem _add_post(a: Int, b: Int)
    ensures add(a, b) == a + b
{
    proof by auto
}
```

When `@verify(formal)` fails, you can drop into the explicit `theorem`
form, write a structured proof, and diagnose why `auto` could not
close the goal.

## Quantifiers

Quantifier expressions can appear anywhere an expression is expected —
in specifications, refinements, and tactic arguments.

```verum
theorem all_positive(xs: &List<Int>)
    requires forall i in 0..xs.len(). xs[i] > 0
    ensures  forall i in 0..xs.len(). xs[i] * 2 > 0
{
    proof by auto
}

theorem exists_root(p: fn(Int) -> Bool)
    requires exists n: Int. p(n) && n >= 0
    ensures  exists n: Int. p(n) && n < 1000000
{
    proof by smt
}
```

See [Quantifiers](/docs/language/quantifiers) for the full grammar.

## Trust boundaries and certificates

The `certified` strategy produces an independently checkable
certificate: the generated proof term is exported and re-checked by
the minimal kernel. Axioms invalidate the certificate.

```verum
@verify(certified)
theorem banking_invariant(account: &Account) {
    // proof must be axiom-free and pass the external kernel check
    proof {
        have balance_ok: account.balance >= 0 by account.invariant();
        show account.balance + 0 == account.balance by omega
    }
}
```

Export: `verum check --export-proofs` writes a `.verum-cert` archive
acceptable to the external kernels (Coq, Lean, Dedukti, Metamath).

## See also

- **[reference/tactics](/docs/reference/tactics)** — tactic catalogue.
- **[verification/gradual-verification](/docs/verification/gradual-verification)** — the full ladder.
- **[verification/smt-routing](/docs/verification/smt-routing)** — how the SMT backend are picked.
- **[verification/proofs](/docs/verification/proofs)** — a worked tutorial.
- **[verification/cubical-hott](/docs/verification/cubical-hott)** — cubical
  tactics and path types.
- **[language/quantifiers](/docs/language/quantifiers)** — `forall`, `exists`.
