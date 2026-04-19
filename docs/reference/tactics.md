---
sidebar_position: 10
title: Tactic Catalogue
description: Every built-in tactic — signatures, semantics, and when to reach for which.
---

# Tactic Catalogue

Tactics are the verbs of Verum's proof DSL. A tactic transforms a proof
state — zero or more open goals, each with a context of hypotheses —
into a new proof state. A `proof by T` succeeds when `T` drives the
proof state to zero goals.

This page is the reference to every **built-in** tactic. For the DSL
syntax, see [Proof DSL](/docs/language/proof-dsl).

Grammar:

```ebnf
tactic_expr  = tactic_name , [ '<' , type_args , '>' ] , [ '(' , [ argument_list ] , ')' ]
             | tactic_expr , ';' , tactic_expr
             | '(' , tactic_expr , ')'
             | 'try' , '{' , tactic_expr , '}' , [ 'else' , '{' , tactic_expr , '}' ]
             | 'repeat' , [ '(' , integer_lit , ')' ] , '{' , tactic_expr , '}'
             | 'first' , '{' , tactic_expr , { ';' , tactic_expr } , '}'
             | 'first' , '[' , tactic_expr , { ',' , tactic_expr } , ']'
             | 'all_goals' , '{' , tactic_expr , '}'
             | 'focus' , '(' , integer_lit , ')' , '{' , tactic_expr , '}' ;

tactic_name  = 'auto' | 'simp' | 'ring' | 'field' | 'omega' | 'blast' | 'smt'
             | 'trivial' | 'assumption' | 'contradiction' | 'induction' | 'cases'
             | 'rewrite' | 'unfold' | 'apply' | 'exact' | 'intro' | 'intros'
             | 'cubical' | 'category_simp' | 'category_law' | 'descent_check'
             | identifier ;
```

## Trivial tactics

### `trivial`

Solves goals that are definitionally true: `true`, `0 <= 0`,
`forall x: Unit. x == ()`, and simple reflexive equalities.

```verum
theorem t_zero() ensures 0 == 0 { proof by trivial }
```

### `assumption`

Closes a goal if it is **exactly** one of the current hypotheses.

```verum
theorem h(p: Bool) requires p ensures p { proof by assumption }
```

### `contradiction`

Closes any goal if the hypotheses include a logical contradiction
(e.g. `h: False`, or `a > b` together with `a <= b`).

```verum
theorem ex_falso(p: Bool, h: p, nh: !p) ensures forall x: Int. x == x
{
    proof by contradiction
}
```

## Introduction tactics

### `intro`

Introduces one variable or hypothesis from the goal:

- `forall x: T. P(x)` → `P(x)` with `x: T` in context.
- `P -> Q` → goal becomes `Q` with `h: P` in context.

```verum
// Goal: forall n: Int. n == n
proof {
    intro n;
    // Now: n: Int, goal: n == n
    exact Eq.refl(n)
}
```

### `intros`

Repeats `intro` until the goal is no longer a `forall` or an
implication. A common opening move.

### `exact(term)`

Provides the exact proof term — used when the caller has a witness.

```verum
theorem refl<T>(x: T) -> Path<T>(x, x)
{
    proof by exact(path_refl(x))
}
```

### `apply(lemma)`

Applies a lemma or hypothesis. Matches the goal against the lemma's
conclusion; remaining premises become new subgoals.

```verum
// Goal: 0 <= n * n
proof {
    apply square_nonneg;    // square_nonneg: forall n. 0 <= n * n
}
```

## Simplification tactics

### `simp`

Rewrite-based simplifier. Applies a curated lemma set — *simp lemmas*
— plus user-marked rewrites (`@simp`) until a fixed point is reached.

```verum
proof by simp
```

`simp` is the first thing to try for algebraic identities, trivial
containers, and standard-library lemmas.

Parameterised form: `simp(on = [lemma1, lemma2])` restricts to a lemma
set; `simp(off = [lemma3])` excludes specific lemmas from the default
set.

### `unfold(name)`

Expands a definition one step. Useful when `simp` refuses because of
opacity:

```verum
proof {
    unfold is_sorted;          // expand the predicate
    simp;
    omega
}
```

### `rewrite(eq)`

Rewrites the goal left-to-right by the given equality. Right-to-left
is `rewrite(eq, ltr = false)`.

```verum
proof {
    rewrite add_comm(a, b);    // replaces `a + b` with `b + a`
    simp
}
```

## Arithmetic tactics

### `omega`

Decision procedure for **Presburger arithmetic** — linear integer
arithmetic with +, −, ·-by-constant, <, ≤, =, ≠, and quantifiers.

Solves:

```verum
ensures 2 * (a + b) == 2 * a + 2 * b
ensures forall i in 0..n. 0 <= i < n
```

Does **not** solve non-linear goals (`a * b == b * a` may fail,
`a * a >= 0` fails). Use `ring` for those.

### `ring`

Decides equalities in commutative rings — polynomial identities in
`Int`, `Float`, `Rational`, and user-defined rings.

```verum
proof by ring          // for (a + b)² = a² + 2ab + b²
```

### `field`

Like `ring` but over fields — allows division by nonzero. Requires
hypotheses that denominators are nonzero.

```verum
theorem div_dist(a: Float, b: Float, c: Float, h: c != 0.0)
    ensures (a + b) / c == a/c + b/c
{
    proof by field
}
```

## Structural tactics

### `induction(target)`

Structural induction over a target: a list, a nat, a variant type.
Generates one subgoal per constructor.

```verum
theorem sum_nonneg(xs: List<Int>)
    requires forall x in xs. x >= 0
    ensures  xs.sum() >= 0
{
    proof by induction xs
}
```

Equivalent explicit form:

```verum
proof {
    induction xs;
    // Generates:
    //  goal 1: when xs = Nil
    //  goal 2: when xs = Cons(h, t), with IH: t.sum() >= 0
    all_goals { simp; omega }
}
```

### `cases(target)`

Case-splits on a target without recursion — one subgoal per
constructor, no induction hypothesis.

```verum
match x {
    Maybe.Some(v) => ...,
    Maybe.None    => ...,
}
// Proof side: `cases x` splits into two goals.
```

### `blast`

Heavy structural search — tries `intro`s, `cases`, `simp`,
`assumption`, and a bounded set of lemma applications. Best when
`auto` is not strong enough but the goal is still propositional or
simply quantified.

## Automation

### `auto`

The workhorse. Composes `intros`, `simp`, `assumption`, `omega`, and a
bounded search over in-scope lemmas. The default when no tactic is
specified by an `@verify(formal)` function.

Parameterised form:

```verum
auto(depth = 8, lemmas = [my_lemma, other])
```

Settings:

- `depth`: bound on the search depth. Default 4.
- `lemmas`: lemmas in addition to the default in-scope set.
- `timeout`: milliseconds. Default 500.

### `smt`

Hands the goal to the SMT backend — the SMT backend, or a portfolio,
selected by the router. See
[verification/smt-routing](/docs/verification/smt-routing).

```verum
proof by smt
```

Parameterised form:

```verum
smt(backend = "z3",      // force backend
    logic   = "QF_LIA",  // force SMT-LIB logic
    timeout = 10000)     // milliseconds
```

Useful when you know the goal fits a specific theory; otherwise let
the router pick.

## Cubical type theory

### `cubical`

Solves equalities by cubical reasoning: `transport`, `hcomp`, and
coherence laws in cubical type theory. Required for proofs involving
`Path<T>(a, b)` paths.

See [verification/cubical-hott](/docs/verification/cubical-hott).

```verum
theorem loop_equiv<T>(p: Path<T>(a, b))
    ensures transport(p, transport(p.inv(), x)) == x
{
    proof by cubical
}
```

## Category theory

### `category_simp`

Simplifies commutative diagrams and categorical identities. Knows
`id ; f = f`, `f ; (g ; h) = (f ; g) ; h`, functor laws, monad laws,
adjunction laws.

```verum
theorem unit_law<F: Monad>(m: F<T>)
    ensures m.bind(F.pure) == m
{
    proof by category_simp
}
```

### `category_law(name)`

Applies a specific categorical law by name (e.g.,
`associativity`, `yoneda`, `kan_extension`).

### `descent_check`

Verifies that a construction over a category of covers coheres — used
in sheaf-theoretic and scheme-theoretic verification contexts.

## Combinators

### `;`  (sequencing)

Runs tactics in order. Common idiom:

```verum
proof {
    intros;
    simp;
    omega
}
```

### `try { t } else { t2 }`

If `t` fails (leaves goals unchanged or errors), run `t2` instead.

```verum
proof by try { auto } else { smt }
```

### `try { t }`

Short for `try { t } else { trivial }` — never fails, even if `t`
did nothing.

### `repeat { t }` and `repeat(n) { t }`

Apply `t` until it stops making progress. With a bound `n`, at most
`n` times.

```verum
proof by repeat { simp; rewrite some_rule }
```

### `first { t1 ; t2 ; t3 }`

Try each `t_i` in order; the first one that succeeds wins. If all
fail, `first` fails.

```verum
proof by first {
    omega ;         // cheap, often works
    ring ;
    smt             // heavy last resort
}
```

### `all_goals { t }`

Apply `t` to every remaining subgoal. After an `induction` that
spawns several cases, use `all_goals` to close them uniformly:

```verum
proof {
    induction xs;
    all_goals { simp; omega }
}
```

### `focus(i) { t }`

Apply `t` only to the *i*-th subgoal (1-based). Useful when different
subgoals need different approaches.

```verum
proof {
    induction xs;
    focus(1) { simp };          // base case
    focus(2) { apply IH; ring } // step case
}
```

## User-defined tactics

`tactic name<generics>(params) { body }` declares a tactic that
composes built-in and user-defined tactics. Tactics are polymorphic,
typed, and structured — they can take typed parameters with defaults,
open type variables, and build their proof search with `let`, `match`,
`if`, and `fail` in addition to the usual combinators.

### Minimal form

```verum
tactic arith_full(x: Int) {
    try { simp };
    try { unfold definition_of_foo };
    first { omega ; ring ; smt }
}

theorem use_it(a: Int, b: Int)
    ensures 2 * (a + b) == 2 * a + 2 * b
{
    proof by arith_full(a + b)
}
```

### Generic tactics

Tactics can be parameterised by types — essential for writing once,
applying across every model of a theory:

```verum
tactic category_law<C>() {
    repeat {
        first {
            rewrite(C.assoc);
            rewrite(C.id_left);
            rewrite(C.id_right);
        }
    };
    simp
}

tactic functor_law<F>() {
    repeat {
        first {
            rewrite(F.map_id);
            rewrite(F.map_compose);
        }
    };
    category_law<F>()
}
```

Type arguments are passed with angle brackets at call sites:
`category_law<C>()`, `functor_law<F.Source>()`.

### Typed parameters

Parameters accept both the classical *kind* forms (`Expr`, `Type`,
`Tactic`, `Hypothesis`, `Int`, `Prop`) and any concrete type. An
optional default value is supplied with `= expr`:

```verum
tactic oracle(goal: Prop, confidence: Float = 0.9) {
    let candidates: Giry<Prop> = @llm_oracle(goal);
    let best: Maybe<Prop> = sample_above(candidates, confidence);
    match best {
        Maybe.Some(proof_term) => {
            apply(proof_term);
            try { smt } else {
                fail("oracle candidate rejected by SMT backend")
            }
        },
        Maybe.None => fail("oracle confidence below threshold"),
    }
}
```

| Parameter kind | Meaning                                                     |
|----------------|-------------------------------------------------------------|
| `Expr`         | Any expression — bound as-is, substituted into the body     |
| `Type`         | A type expression                                            |
| `Tactic`       | A higher-order tactic (a tactic that takes tactics)         |
| `Hypothesis`   | A simple identifier referring to an in-scope hypothesis     |
| `Int`          | An integer literal                                          |
| `Prop`         | A first-class proposition                                   |
| *any type*     | Arbitrary typed parameter — `Float`, `List<T>`, `Maybe<U>`, …|

### Structured tactic bodies

Tactic bodies are not only sequences of combinators — they can thread
local state and branch on values:

- `let name: T = expr;` — local binding, analogous to Lean's monadic
  `let x ← …`. The bound value is available to the rest of the tactic
  sequence.
- `match scrutinee { P => tactic, … }` — pattern-directed branching;
  each arm is a full tactic expression.
- `if cond { t1 } else { t2 }` — conditional tactic execution.
- `fail("reason")` — abort this proof branch with a diagnostic; feeds
  into enclosing `try`/`first` combinators for recovery.

### Grammar

```ebnf
tactic_decl   = [ visibility ] , 'tactic' , identifier ,
                [ generic_params ] , '(' , [ tactic_param_list ] , ')' ,
                [ where_clause ] , tactic_body ;

tactic_param  = identifier , ':' , tactic_param_type ,
                [ '=' , expression ] ;

tactic_param_type = 'Expr' | 'Type' | 'Tactic' | 'Hypothesis' | 'Int'
                  | 'Prop' | type_expr ;

tactic_body   = tactic_expr | '{' , { tactic_stmt } , '}' ;

tactic_stmt   = 'let' , identifier , [ ':' , type_expr ] , '=' , expression , ';'
              | 'if' , expression , '{' , tactic_expr , '}' ,
                [ 'else' , ( 'if' , … | '{' , tactic_expr , '}' ) ]
              | 'match' , expression , '{' , { match_arm } , '}'
              | 'fail' , '(' , expression , ')'
              | tactic_expr , ';' ;
```

## Cheat-sheet: when to reach for which

| Goal kind                                   | First try       | Fallback           |
|---------------------------------------------|-----------------|--------------------|
| Trivial equality                            | `trivial`       | —                  |
| `H ⊢ H`                                     | `assumption`    | —                  |
| Linear integer arithmetic                   | `omega`         | `smt`              |
| Polynomial identity                         | `ring`          | `field`, `smt`     |
| List, nat, ADT structural                   | `induction`     | `blast`, `auto`    |
| One-shot case split                         | `cases`         | `blast`            |
| Rewrite by a known lemma                    | `rewrite`       | `simp(on = [...])` |
| Expand a named definition                   | `unfold`        | `simp`             |
| Unknown — general SMT theory                 | `smt`           | `auto(depth = 12)` |
| Cubical path / HoTT                         | `cubical`       | —                  |
| Category / functor / monad law              | `category_simp` | `category_law`     |
| "I have a witness"                           | `exact`         | `apply`            |
| "Eliminate universals and implications"     | `intros`        | `auto`             |
| Don't know — just let the engine try        | `auto`          | `smt`, `blast`     |

## See also

- **[Proof DSL](/docs/language/proof-dsl)** — theorem/lemma/axiom
  declarations, `calc`, structured proofs.
- **[verification/smt-routing](/docs/verification/smt-routing)** — how
  `smt` picks between the SMT backend, portfolio.
- **[verification/cubical-hott](/docs/verification/cubical-hott)** —
  the `cubical` tactic in depth.
- **[cookbook/calc-proofs](/docs/cookbook/calc-proofs)** — calc-chain
  examples.
