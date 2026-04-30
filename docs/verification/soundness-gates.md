---
sidebar_position: 30
title: Soundness gates in proof validation
---

# Soundness gates in proof validation

The proof validator (`crates/verum_verification/src/proof_validator.rs`)
sits between user-supplied proof terms and the kernel. Its job is to
turn every "trust the user" path into an explicit verification gate
that either accepts a proof for a real reason or rejects it with a
diagnostic. This page enumerates the soundness gates that guard each
proof rule, what happens when the gate trips, and how to extend the
gate set when adding a new rule.

The architectural rule across every gate is the same: **the
validator never advances state from a proof term unless the term
structurally corresponds to the goal it claims to discharge**.
Syntactic similarity is not a proof of mathematical property;
shared shape under the wrong operator is not equality.

## Catalogue of gates

### `apply` — user-defined inference rules

Path: `validate_apply` → `apply_inference_rule` → catch-all arm.

The catch-all arm routes through `lookup_registered_rule`, which
reads `self.inference_rules` populated via
`register_inference_rule(name, premises, conclusion)`. There is
**no fallback** to "trust the user" when the rule name is unknown:
the gate returns
`ValidationError::ValidationFailed { "unknown inference rule '<name>'" }`
with a hint pointing at `register_inference_rule` as the
remediation.

Arity check happens at the same gate: the user must supply exactly
the number of premises the rule schema declares, otherwise
`"rule '<name>' expects N premises, got M"`.

### `forall_elim` / `exists_intro` — quantifier rules

Path: `apply_inference_rule` → `"forall_elim" | "univ_elim"` and
`"exists_intro" | "exist_intro"` arms.

The `forall_elim` gate requires `premises[0]` to be syntactically
`ExprKind::Forall { .. }`. The `exists_intro` gate requires the
expected conclusion to be syntactically `ExprKind::Exists { .. }`.
Without these gates, both rules accepted any premise + any
expected, mirroring the catch-all soundness leak.

Full higher-order matching (verifying expected = body[x := t] for
some t) is tracked separately; the current shape gates catch the
common misuse of applying these rules to non-quantified terms.

### `Hypothesis { id, formula }` — referencing a hypothesis

Path: `validate_hypothesis`.

Three gates fire:

1. **Sanity**: `formula == expected` (user's formula matches the
   claim).
2. **Reference**: `h{id}` is in scope.
3. **Content**: the hypothesis at `h{id}` actually carries
   `formula` as its proposition. Without this gate, a hypothesis
   `h0 : P` could be re-labeled by the user as proving `Q`
   whenever `Q == expected` syntactically.

Mismatch on (3) returns
`ValidationError::PropositionMismatch { expected, actual }`.

### `Rewrite { hypothesis, ... }` — substitution via equality

Path: `try_rewrite` (proof_search) and `try_rewrite_at`.

The named hypothesis is resolved through `find_hypothesis_index`.
The resolved hypothesis must structurally be a `Binary { op: Eq,
.. }`; otherwise the gate returns
`"rewrite: hypothesis '<name>' is not an equality"`. There is no
fallback to scanning for the first equality regardless of name —
the user's choice of hypothesis is honoured, including the
diagnostic when that choice is wrong.

The recursive walker `try_rewrite_once` covers the full ExprKind
shape — Call, MethodCall, Field, TupleIndex, Index, Tuple, Array,
Cast, Pipeline, NullCoalesce, Try — so subterm matching reaches
into function calls and structured literals, not just
arithmetic / Boolean trees.

### `Exact { term }` — discharging by exhibition

Path: `apply_exact` (tactic_evaluation).

Discharges the goal only when the term satisfies one of:

1. A `Path` whose name resolves to a hypothesis whose proposition
   is structurally equal to the goal — the canonical `exact h`
   shape.
2. The goal expression itself, by structural equality (covers
   literal `true ⊢ true`, reflexive equalities, and verbatim
   re-statement of the goal).

Anything else returns `TacticError::Failed` naming the proof term
shape and the goal it failed to discharge.

### `Commutativity { left, right }` — algebraic equation

Path: `validate_commutativity` → `is_commutative_pair`.

The operator must be on a whitelist of mathematically commutative
operators: `Add`, `Mul`, `And`, `Or`, `Eq`, `Ne`, `BitAnd`, `BitOr`,
`BitXor`. Anything else (notably `Sub`, `Div`, `Imply`, `Lt`,
`Le`, `Gt`, `Ge`, `Concat`, `Shl`, `Shr`, `In`) returns false from
the structural matcher even when operands are syntactically swapped.
Without this gate, "commutativity" proofs of `5 - 3 = 3 - 5` were
accepted.

The Call arm of `is_commutative_pair` returns false unconditionally
— arbitrary user-defined functions are not assumed commutative by
the validator. Registering specific commutative functions is a
future extension.

### `SkHack { formula, skolemized }` — Skolemization premise shape

Path: `validate_sk_hack`.

Skolemization is the transformation `∃x. P(x) → P(f(free_vars))`.
The gate requires `formula.kind` to be `ExprKind::Exists { .. }` —
otherwise SkHack is being applied to a non-existential formula
and the rule cannot soundly fire. Pre-fix the formula parameter
was `_`-bound and completely ignored, so a user could Skolemize
any term (literal `true`, an arithmetic expression, anything) as
long as `skolemized == expected` matched syntactically.

Full Skolemization soundness — verifying
`skolemized = body[x := f(free_vars)]` for some fresh `f` —
requires higher-order substitution and is tracked separately. The
shape gate covers the most common misuse: applying SkHack to a
formula that isn't existential at all.

### `PullQuantifier` / `PushQuantifier` / `ElimUnusedVars` — quantifier rewrites

Path: `validate_pull_quantifier`, `validate_push_quantifier`,
`validate_elim_unused_vars`.

Each rule has a structural prerequisite on its input formula:

- **Pull**: `(∀x.P) ∧ Q → ∀x.(P ∧ Q)` requires the input to be a
  `Binary { left, right, .. }` where at least one operand is a
  quantifier. Otherwise there is nothing to pull out.
- **Push**: `∀x.(P ∧ Q) → (∀x.P) ∧ (∀x.Q)` requires a quantifier
  whose body is a `Binary { .. }`. Otherwise there is no inner
  structure to push the quantifier into.
- **ElimUnusedVars**: `∀x.P → P` (when x ∉ FV(P)) requires the
  input to be a quantifier. Non-quantified formulas have nothing
  to eliminate.

Pre-fix all three validators had their `_formula` parameter bound
to `_` and ignored it entirely; only `result == expected` was
checked. A user could apply any of these "rewrites" to a literal
`true` and the rule passed. Post-fix each rule rejects
shape-mismatched inputs with a diagnostic naming the formula that
failed the shape check. Full free-variable / freshness checks are
tracked separately.

### `IffOEq { iff_proof, left, right }` — biconditional to oriented equality

Path: `validate_iff_oeq`.

After validating `iff_proof` internally and checking the claim
shape `(left = right) == expected`, the gate verifies that
`iff_proof.conclusion()` is structurally `Binary { op: Iff | Eq,
left: l, right: r }` where `l == left` and `r == right`. Without
this gate, a user could pair an iff proof of `P <=> Q` with a
claim `A = B` for unrelated `A`, `B` — pre-fix accepted the
mismatch since the iff-proof internally validated and `(A = B) ==
expected` matched.

Symmetry is NOT silently inferred: `B <=> A` does not satisfy a
claim of `A = B` even though equality is commutative, because the
gate checks structural shape rather than semantic equivalence —
explicit symmetry must come from a separate proof step.

### `Distributivity { formula }` — algebraic equation

Path: `validate_distributivity` → `is_distributivity_shape`.

The formula must structurally match one of the canonical
distributivity shapes for one of the recognised (outer, inner)
operator pairs:

| Outer    | Inner    | Domain     |
|----------|----------|------------|
| `Mul`    | `Add`    | arithmetic |
| `And`    | `Or`     | logical    |
| `Or`     | `And`    | logical, dual |
| `BitAnd` | `BitOr`  | bitwise    |
| `BitOr`  | `BitAnd` | bitwise, dual |

Both directions check: left distributivity
`a OUTER (b INNER c) = (a OUTER b) INNER (a OUTER c)` and right
distributivity `(a INNER b) OUTER c = (a OUTER c) INNER (b OUTER c)`.
Sub-expression comparison uses `expr_eq`, so arbitrary
sub-expressions work — the rule is structural, not literal. A
formula like `BoolLit(true)` does not match any shape and is
rejected.

### Rewrite-rule conditions — `discharge_rewrite_condition`

Path: `validate_rewrite_rule_application` → for each
`rule.conditions[i]`: `discharge_rewrite_condition`.

A conditional rewrite (e.g. `safe_div(a, b) → a / b` requiring
`b ≠ 0`) is only sound when each instantiated condition holds.
The gate accepts exactly four shapes:

1. The literal `true`.
2. Reflexive equality `x == x`.
3. The condition matches a registered axiom.
4. The condition matches a hypothesis currently in scope.

Anything else returns
`ValidationError::RewriteError { "unverified condition" }`
naming the condition. There is no silent acceptance — without one
of these structural matches, the rewrite is rejected with a
remediation hint pointing at `register_axiom` /
`add_hypothesis`.

### `recheck_with_smt` — translating hypotheses

Path: `recheck_with_smt`.

Each hypothesis in scope is translated to a Z3 expression via the
shared translator and asserted on the solver. Hypotheses that
don't translate cleanly are skipped (sound conservative — operates
without that assumption rather than asserting vacuous truth).
Pre-fix the loop bound a fresh `Bool::new_const(name)` and
asserted **that**, completely discarding the hypothesis's
proposition. Z3 saw every hypothesis as `h0 := true` regardless of
content; re-checks that should have found counterexamples
silently passed.

### `recheck_with_smt` — sort tracking for free variables

Path: `interpolation::quantifier_eliminate`.

Walks the formula's AST via
`collect_typed_variables_from_bool` to harvest each variable's
actual sort (Int, Bool, Real, Bool, …). Bound-variable
construction uses `Dynamic::fresh_const(name, &sort)` so the
existential quantifier binds the same Z3 constants that appear
free in the body. Pre-fix all variables were defaulted to Bool,
which left the QE tactic operating on a vacuous quantifier (Z3
distinguishes constants by name AND sort, so `Bool::new_const("x")`
does not bind a free `Int::new_const("x")`).

## Hypothesis context

`HypothesisContext::iter_propositions` walks every hypothesis in
every scope, giving soundness-checking code an O(n) way to
recognise a target proposition is currently assumed regardless of
which name it was bound to. Used by `discharge_rewrite_condition`
and by ad-hoc gates that need to recognise an instantiated
condition as already-in-context.

## Bool-typed hypotheses

The proof search engine carries an externally-populated
`bool_typed_hypotheses: HashSet<Text>` registry. Callers register a
hypothesis as Bool via `register_bool_hypothesis(name)`. When the
`cases_on h` flow encounters a Path-shaped hypothesis whose name is
in this set, it splits into two subgoals: one carrying
`hyp == true` and one carrying `hyp == false` as derived
hypotheses (not bare boolean literals — the equalities connect
the chosen branch back to the variable being analysed).

The engine ships with the registry empty: there are no hardcoded
"this name looks like a Bool" heuristics. Bool-ness comes from the
caller's typing context.

## Variant-type metadata

A single registry, `variant_map: HashMap<TypeName, Vec<CtorName>>`
populated via `register_variant_type(type_name, ctors)`, drives
multiple gates:

- **Constructor case-analysis** (`try_cases_on`): a `Call` whose
  head is in some registered variant produces one subgoal per
  registered constructor of that variant.
- **Variable-type inference** (`infer_variable_type`): walks the
  goal/hypotheses for `var == Ctor(...)` shapes, looks Ctor up in
  `variant_map`, returns the parent type. No name heuristics, no
  default to "Nat".
- **Constructor lookup for induction** (`get_type_constructors`):
  reads ctor names from the registry; recursive-arg metadata
  comes from the parallel `variant_recursive_args` registry
  populated via `register_variant_recursion`.

The proof engine carries no hardcoded knowledge of stdlib type
names. Every variant-type-aware decision flows through the
registries.

## Reading a soundness diagnostic

When a gate trips, the diagnostic carries enough information to
locate the offending proof step and the remediation. Typical
shapes:

- `unknown inference rule '<name>'. Register it via
  ProofValidator::register_inference_rule before referencing it
  in a proof.`
- `rule '<name>' expects N premises, got M`
- `rewrite: hypothesis '<name>' is not an equality (got <kind>)`
- `rewrite rule '<name>' has unverified condition '<expr>' —
  register it as an axiom or introduce it as a hypothesis before
  rewriting`
- `commutativity: expressions are not commutative variants`
- `distributivity: formula <expr> does not match a canonical
  distributivity shape`
- `induction: type '<name>' is not registered. Call
  ProofSearchEngine::register_variant_type first.`
- `induction: cannot infer type of variable '<var>'. Register the
  variant type via register_variant_type, or attach the type to a
  hypothesis like '<var> == SomeCtor(...)'.`

Each diagnostic names what failed, why, and the API call that
fixes it. The validator never emits a generic "proof failed" — if
the user's tactic is wrong, they know which gate tripped.

## Adding a new rule

When implementing `validate_<new_rule>`:

1. Identify the **structural premise** the rule depends on (e.g.
   "the formula must be an equality with two halves", "the
   premise must be quantified").
2. Implement that premise as a separate `is_<shape>` predicate so
   it can be exercised independently in tests.
3. The validator function calls `is_<shape>(args)` first; on
   mismatch returns `ValidationError::ValidationFailed` with a
   diagnostic that names the actual shape and the expected shape.
4. **Never** return `Ok(expected.clone())` after a no-op pass.
   The catch-all arm of `apply_inference_rule` was the source of
   multiple soundness leaks (see `inference_rule_soundness.rs` and
   `commutativity_soundness.rs` regression suites) precisely
   because it took that shortcut.

## Regression test corpus

Each gate is locked by a regression test that constructs a proof
term that pre-fix would have silently passed and asserts the
post-fix rejects it. The corpus lives under
`crates/verum_verification/tests/`:

- `inference_rule_soundness.rs` — unknown rules + arity + quantifier
  shape gates.
- `hypothesis_content_check.rs` — hypothesis-content gate.
- `rewrite_condition_soundness.rs` — conditional rewrite gate.
- `recheck_smt_hypothesis_translation.rs` — SMT recheck context.
- `expr_eq_alpha_equivalence.rs` — α-equivalence in `expr_eq_with_binding`.
- `commutativity_soundness.rs` — commutativity-operator whitelist.
- `exact_tactic_soundness.rs` — `exact` structural verification.
- `vcgen_errdefer_normal_path.rs` — errdefer no-op on normal path.
- `iff_oeq_soundness.rs` — iff_proof-to-claimed-pair link in
  `IffOEq`.

Across the corpus, every "for now, just trust the user" path
documented in the source has at least one negative test that
exercises the soundness gate.
