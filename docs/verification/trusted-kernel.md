---
sidebar_position: 4
title: Trusted Kernel
---

# The Trusted Kernel

> The kernel is the sole trusted component of Verum's verification
> pipeline. Every other subsystem — the SMT backends, the tactic
> engine, the translator, the framework-axiom registry, the
> monomorphizer, even the typechecker — can have bugs and the
> language remains sound, provided the kernel replays every
> certificate before admitting a theorem.

This page is the canonical reference for the kernel's design,
its rule set, the `SmtCertificate` lifecycle, the replay loop, and
the auditor's checklist. It is the closest thing Verum has to a
"definition of soundness."

---

## 1. Why LCF, and why so small

The kernel follows the **LCF ("Logic for Computable Functions")**
tradition established by Robin Milner at Edinburgh in the 1970s and
refined across Coq, HOL, Isabelle, and Lean. The core idea is to
split the logic implementation into two parts:

1. A **small, fixed set of primitive inference rules**. Every
   theorem in the system is ultimately a tree of these rules.
2. A **large, untrusted automation layer** that produces trees of
   those rules. Its job is to be fast, creative, and often wrong;
   the kernel's job is to catch the wrong ones.

The soundness guarantee reduces to: *if the kernel's rule
implementations are correct and the programming language of the
kernel doesn't lie, every theorem the kernel accepts is derivable
from its axioms.* Everything else — tactic engines, SMT proofs,
user programs — is reduced to *"did the kernel accept it?"* and
becomes inspection-only at audit time.

Verum's kernel lives in `crates/verum_kernel/`. At the time of
writing it is ~2 000 LOC of Rust, has zero calls into user code,
and has 39 unit tests specifically targeting its primitive rules.

---

## 2. What the kernel trusts

Concretely, the kernel is the **only** piece of Verum code that
may:

- Construct a `CoreTerm::Axiom` from scratch with a framework tag.
- Replay an `SmtCertificate` and return a theorem witness.
- Discharge a `CoreTerm::SmtProof` node.
- Check a kernel term against a `CoreType` under a de Bruijn
  context.

Any code path that produces a theorem without going through the
kernel is — by definition — outside the TCB and can be wrong. The
tactic engine, the proof-search, and the SMT translator all
**produce** `CoreTerm` values; the kernel **accepts** or
**rejects** them.

Corollary: *bugs in the type checker or the tactic engine can only
cause the kernel to reject proofs that would otherwise succeed, or
(worse) fabricate terms that the kernel still correctly rejects.*
They cannot silently admit false theorems.

---

## 3. The core term language

`CoreTerm` is an enum in `verum_kernel::core::term`. Every theorem
body, tactic output, and SMT certificate collapses to a tree of
these constructors:

```rust
pub enum CoreTerm {
    // Variables and bindings (de Bruijn indices)
    Var(u32),
    Lam { name: Text, ty: Heap<CoreType>, body: Heap<CoreTerm> },
    App { func: Heap<CoreTerm>, arg: Heap<CoreTerm> },

    // Dependent product (Π) and sum (Σ)
    Pi     { name: Text, ty: Heap<CoreType>, body: Heap<CoreType> },
    Sigma  { name: Text, ty: Heap<CoreType>, body: Heap<CoreType> },

    // Inductive types and their constructors/eliminators
    Inductive { path: Text, args: List<CoreTerm> },
    Ctor      { inductive: Text, name: Text, args: List<CoreTerm> },
    Match     { scrutinee: Heap<CoreTerm>, arms: List<MatchArm> },

    // Propositional equality (Martin-Löf)
    Eq      { ty: Heap<CoreType>, lhs: Heap<CoreTerm>, rhs: Heap<CoreTerm> },
    Refl    { ty: Heap<CoreType>, term: Heap<CoreTerm> },

    // Cubical paths (HoTT layer)
    PathTy  { ty: Heap<CoreType>, lhs: Heap<CoreTerm>, rhs: Heap<CoreTerm> },
    HComp   { ty: Heap<CoreType>, phi: Heap<CoreTerm>, u: Heap<CoreTerm>, u0: Heap<CoreTerm> },
    Transp  { ty: Heap<CoreType>, phi: Heap<CoreTerm>, term: Heap<CoreTerm> },
    Glue    { a: Heap<CoreType>, phi: Heap<CoreTerm>, t: Heap<CoreTerm>, e: Heap<CoreTerm> },

    // Universes
    Universe(u32),

    // Axioms and SMT proofs
    Axiom    { name: Text, ty: Heap<CoreType>, framework: FrameworkId },
    SmtProof { cert: SmtCertificate, claim: Heap<CoreTerm> },
}
```

### Constructor discipline

Only the kernel may construct `Axiom`, `SmtProof`, or the cubical
primitives (`HComp`, `Transp`, `Glue`). Every other constructor is
freely constructible by any code path, but the kernel will only
accept them after type-checking.

The `Heap<T>` wrapper is Verum's semantic equivalent of `Box<T>`
— a managed heap allocation with a stable address. Its use here is
for the same reason Lean's `Expr` uses `@[reducible]` pointers:
structural sharing of common subtrees is critical for proof-term
size.

---

## 4. The kernel rules

The kernel implements **18 primitive inference rules**, grouped
into five families. Each rule is a Rust function in
`verum_kernel::rules::*` that takes a `Context`, a `CoreTerm`, and
(in some cases) a `CoreType`, and returns either a typed term or a
`KernelError`. Rules are numbered for citation; the numbering is
stable across versions.

### 4.1 Structural rules (`rules::structural`)

| # | Rule            | Signature (informal)                                       | Purpose                                                   |
|---|-----------------|-------------------------------------------------------------|-----------------------------------------------------------|
| 1 | `Var`           | `Γ, x:A ⊢ x : A`                                            | Variable reference via de Bruijn index.                   |
| 2 | `Lam`           | `Γ, x:A ⊢ t : B`  ⟹  `Γ ⊢ λx:A. t : Π x:A. B`               | Abstraction.                                              |
| 3 | `App`           | `Γ ⊢ f : Π x:A.B`, `Γ ⊢ a : A`  ⟹  `Γ ⊢ f a : B[x↦a]`         | Application (with substitution).                          |
| 4 | `Pi-Form`       | `Γ ⊢ A : U_i`, `Γ, x:A ⊢ B : U_j` ⟹ `Γ ⊢ Π x:A. B : U_max`   | Dependent-product formation at the correct universe level. |

### 4.2 Inductive rules (`rules::inductive`)

| # | Rule              | Purpose                                                                         |
|---|-------------------|---------------------------------------------------------------------------------|
| 5 | `Ind-Form`        | Verify the constructor list is strictly positive, no negative occurrences.      |
| 6 | `Ind-Intro`       | `Ctor(args)` well-typed iff args match the declared constructor signature.      |
| 7 | `Ind-Elim`        | Pattern-match exhaustive over constructors; each arm typed uniformly in the motive. |

#### `K-Pos` — strict positivity in detail

`Ind-Form` is operationalised via the `K-Pos` walker
(`crates/verum_kernel/src/lib.rs::check_strict_positivity`). The kernel
runs the walker on **every** constructor's argument types when an
`InductiveRegistry::register(...)` call is made; the first violation
rejects the whole declaration with `KernelError::PositivityViolation`.

The discipline ():

- `Pi(domain, codomain)` — the type's name MUST NOT appear anywhere in
  `domain` (the negative position of the arrow); `codomain` itself
  must be strictly positive in the type's name.
- `Inductive(name, args)` — every `arg` must itself be strictly
  positive in the type's name. This catches indirect non-positive
  recursion via parametrised types (e.g. `BadList = Cons(BadList →
  A)` where the function smuggles `BadList` into a negative position
  through its own argument list).
- `Sigma`, `App`, `Refine`, `Lam`, `PathTy` — descend into both
  halves; strict positivity is closed under products, applications,
  refinements, lambdas, and path types.
- Atoms (`Universe`, `Var`, `Axiom`, `SmtProof`, `Elim`) — vacuously
  OK.

**Why it matters.** Berardi 1998 establishes that a system with even
minimal impredicativity admits `False` whenever a non-positive
inductive is admissible. Concretely the witness:

```verum
type Bad is Wrap(Bad -> A);    // would derive False if admitted
```

The diagnostic carries a breadcrumb to the offending site — for
`Wrap(Bad -> A)` the kernel returns:

```text
strict positivity violation in inductive 'Bad': constructor 'Wrap'
has 'Bad' in constructor 'Wrap' arg #0 → left of an arrow (negative
position)
```

so the user can fix the offending constructor without a debugger.

**Closed under nesting.** The walker handles second-order non-
positivity (e.g. `Bad2 = Wrap((Bad2 → A) → A)`) by treating *every*
arrow domain as a hard barrier — even when the outer position is a
positive codomain, an inner negative occurrence still fails the
check.

**Test coverage.** Thirteen end-to-end tests at
`crates/verum_kernel/tests/k_pos_strict_positivity.rs` cover:

- accept paths: `Nat = Zero | Succ(Nat)`, `List<A> = Nil | Cons(A,
  List<A>)`, `Tree<A> = Leaf(A) | Branch(Tree<A>, Tree<A>)`,
  `Rose<A> = Node(A, List<Rose<A>>)`, `InductiveRegistry::register`
  admits `Nat`;
- reject paths: direct `Bad = Wrap(Bad → A)`, second-order
  `Bad2 = Wrap((Bad2 → A) → A)`, indirect non-positive via
  `BadList = Cons(BadList → A)`, `InductiveRegistry::register`
  rejects `Bad`, duplicate-name registration;
- atom invariants: universe, variable, arrow-codomain occurrence
  (positive position) all admitted.

### 4.3 Equality rules (`rules::equality`)

| # | Rule              | Purpose                                                                         |
|---|-------------------|---------------------------------------------------------------------------------|
| 8 | `Refl`            | `Refl(t) : Eq(A, t, t)` for any `t : A`.                                        |
| 9 | `Eq-Elim` (J)     | Martin-Löf's J rule: pattern-match on `Eq(A, a, b)` with `Refl(x)` as the only case. |
| 10 | `UIP-Free`       | Reject uniqueness-of-identity-proofs as an axiom (HoTT-compatibility).          |

### 4.4 Cubical rules (`rules::cubical`)

| # | Rule              | Purpose                                                                         |
|---|-------------------|---------------------------------------------------------------------------------|
| 11 | `PathTy-Form`    | `PathTy(A, a, b) : U` for `a, b : A`.                                           |
| 12 | `HComp`          | Homogeneous composition; constructs a path in `A` from a partial cube of paths. |
| 13 | `Transp`         | Transport along a path of types; `Transp(A, p, x) : B` when `p : Path(U, A, B)`. |
| 14 | `Glue`           | Glue types at a face `φ`; the univalence-enabling rule.                         |
| 15 | `Univalence`     | Derived rule: `ua : Equiv(A, B) → Path(U, A, B)`. Reduces to `Glue`.            |

### 4.5 Axiom and certificate rules (`rules::axiom`, `rules::smt`)

| # | Rule              | Purpose                                                                         |
|---|-------------------|---------------------------------------------------------------------------------|
| 16 | `Axiom-Intro`    | Admit a `CoreTerm::Axiom` given its `FrameworkId` is registered.                |
| 17 | `SmtProof-Replay` | Reconstruct a `CoreTerm::Axiom` witness from an `SmtCertificate` trust-tag trace. |
| 18 | `Universe-Cumul` | `Γ ⊢ A : U_i` ⟹ `Γ ⊢ A : U_{i+1}` (cumulative hierarchy).                        |

Rule 17 is the bridge from SMT to kernel. Before it, SMT results are
strings the solver asserts to be unsat; after it, they are kernel-
admitted theorems with a framework tag identifying the backend and
rule family.

---

## 5. The `SmtCertificate` lifecycle

When an SMT backend returns `unsat` for an obligation, the
translator constructs an `SmtCertificate`:

```rust
pub struct SmtCertificate {
    pub backend:          Text,   // "z3" | "cvc5" | "portfolio" | "tactic"
    pub trace:            Vec<u8>, // trust-tag byte sequence
    pub obligation_hash:  Text,   // blake3 of the SMT-LIB obligation body
    pub solver_version:   Text,
    pub duration_ms:      u64,
    pub schema_version:   u32,
}
```

### 5.1 Trust tags

A `trace` is a sequence of bytes where each byte identifies a
**rule family** the backend used to close the obligation:

| Tag    | Rule family        | Meaning                                                 |
|--------|--------------------|----------------------------------------------------------|
| `0x01` | `refl`             | Syntactic `E == E`.                                      |
| `0x02` | `asserted`         | Matches an asserted hypothesis.                          |
| `0x03` | `smt_unsat`        | Theory-combination unsat (catch-all for Z3/CVC5 close).  |
| `0x04` | `quant_instance`   | Quantifier instantiation closed the goal.                |
| `0x05` | `arith_linear`     | LIA/LRA discharged the goal.                             |
| `0x06` | `bitvector`        | Bitblast unsat.                                          |
| `0x07` | `array_extensionality` | Array theory + extensionality closed the goal.       |
| `0x08` | `string_theory`    | CVC5 string theory closed the goal.                      |

Unknown tags cause the kernel to reject the certificate
(`KernelError::UnknownRule`). New tag families are added only when
a corresponding kernel rule is implemented to verify them.

### 5.2 Replay

`replay_smt_cert(ctx, cert) -> Result<CoreTerm, KernelError>`
(implemented as `rules::smt::replay` in `verum_kernel::rules::smt`):

1. **Backend allow-list check.** If `cert.backend` is not in
   `{z3, cvc5, portfolio, tactic}`, return `UnknownBackend`.
2. **Trace non-empty check.** `cert.trace[0]` must exist; else
   return `EmptyCertificate`.
3. **Rule tag lookup.** Map the byte to a rule name. Unknown tags
   return `UnknownRule { backend, tag }`.
4. **Obligation hash validation.** `cert.obligation_hash` must be
   non-empty; else return `MissingObligationHash`.
5. **Framework tagging.** Construct a `FrameworkId { framework:
   "backend:rule_name", citation: obligation_hash }` to make the
   kernel-admitted witness traceable.
6. **Witness construction.** Return a `CoreTerm::Axiom { name:
   "smt_cert:backend:rule:hash", ty: claimed_type, framework }`.
7. **Caller-side verification.** The caller must compare the
   returned witness's obligation hash to the compiler-computed
   hash for the obligation in question. A lying backend that
   forges a certificate with a different hash will fail this step.

The replay operates in two layers:

**Trust-tag replay.** The certificate's single-byte tag
identifies one of three rule families — `refl` / `asserted`
/ `smt_unsat` — produced by the `Unsat`-means-valid
protocol. Accepted for obligations the SMT portfolio closes
via the standard unsat contract.

**Proof-tree replay.** For backends emitting richer proof
traces (Z3's `(proof …)` format, CVC5's ALETHE format), the
kernel parses the trace as an S-expression tree, validates
every rule name against the backend's allowlist, and
recursively replays each rule to build a `CoreTerm`
witness. Hierarchical composition: sub-proof children are
replayed and threaded as `CoreTerm::App` arguments to the
parent rule's axiom, so a legitimate outer rule wrapping a
forged inner rule fails the allowlist at any depth.

Allowlist coverage:

| Backend       | Rules | Completeness invariant |
|---------------|-------|-------------------------|
| Z3            | 28    | machine-checked by `replay_covers_every_rule_in_allowlist` |
| CVC5 ALETHE   | 29    | parallel invariant for `replay_aletha_tree` |

### 5.3 What the kernel cannot catch

Even with rule-level replay, there remain residual gaps:

- A **buggy solver** that returns `unsat` for a satisfiable
  formula, *and* constructs a locally consistent proof tree,
  produces a kernel-accepted theorem. Mitigation: the
  `Certified` strategy runs the portfolio with
  cross-validation — two disagreeing backends required to
  admit a false theorem.
- A **semantically wrong proof** whose every rule name is
  in the allowlist but whose conclusions don't actually
  follow from its premises. Current replay catches forged
  *rule names*, but not forged *conclusions*. Rule-specific
  conclusion-type checking (every rule's conclusion type
  is computed from its children's conclusion types under
  the rule's own semantics) is the final soundness tightening
  and depends on an S-expression-to-`CoreTerm` expression
  bridge.

---

## 6. The auditor's checklist

If you are reviewing Verum's kernel for soundness, check the
following in order:

1. **Crate size.** `wc -l crates/verum_kernel/src/**/*.rs` — the
   kernel grows exactly when rule additions are added. Any PR
   that grows the crate for reasons unrelated to rules is
   suspicious.
2. **Dependency scope.** `cargo tree -p verum_kernel --depth 1` —
   the kernel should depend only on `verum_common`, `verum_core`,
   `serde`, and (optionally) `blake3` for hashing. No SMT
   backends, no type-checker, no parser.
3. **No `unsafe` blocks.** `grep -rn unsafe crates/verum_kernel/src/`
   — the kernel is 100% safe Rust.
4. **No external calls.** `grep -rn 'std::process\|std::os\|std::fs'
   crates/verum_kernel/src/` — the kernel does no I/O, no process
   spawning, no environment reads. It is a pure function from
   terms to terms.
5. **Rule correspondence.** Every `Coreterm` constructor should be
   handled by at least one rule module. Run
   `grep -c 'CoreTerm::' crates/verum_kernel/src/core/term.rs`
   and `grep -rn 'CoreTerm::' crates/verum_kernel/src/rules/`.
6. **Test coverage.** `cargo test -p verum_kernel` should pass
   with ≥ 39 tests at the time of writing; each rule has at least
   one positive and one negative test.
7. **Certificate round-trip.** `cargo test -p verum_kernel
   smt_cert_roundtrip` validates the serialisation / deserialisation /
   replay loop for every tag in the allow-list.

If all seven pass, the kernel is in its expected shape. Any audit
that finds a discrepancy should file an issue tagged
`area/kernel` and `severity/critical`.

---

## 7. What is NOT in the kernel (and why)

- **The type-checker.** `verum_types` is the largest crate in the
  compiler (~60K LOC) and absolutely cannot be in the TCB. Its
  job is to produce kernel terms that the kernel can check; bugs
  in it only cause missed proofs, not admitted false ones.
- **The tactic engine.** `verum_smt::proof_search` and the
  `@tactic meta fn` machinery live outside the kernel. Tactics
  produce `CoreTerm` values that the kernel validates on
  acceptance.
- **The SMT backends.** Z3 and CVC5 are linked into
  `verum_smt`, never into `verum_kernel`. Their output flows
  through the certificate interface — the kernel never sees a
  `z3::Solver` handle.
- **The parser, the LSP, the codegen.** Obviously not in the TCB.
- **The stdlib, even `core.base`.** User-defined types may
  participate in proofs (via inductive rules); but their Rust
  counterparts do not get to define new kernel terms.

This strict separation is why the kernel stays small. Growing it
is a deliberate design act, not a side effect of feature work.

---

## 8. Soundness argument (informal)

Assume:

- The 18 rules are implemented correctly (tested, audited, in the
  TCB).
- The Rust type system and the Verum compiler (for the kernel's
  own Rust code) are correct with respect to memory safety.
- The serialisation of `SmtCertificate` is collision-free (hash
  field is blake3 over canonical SMT-LIB).
- The backend allow-list does not include a known-unsound solver.

Then: any `CoreTerm::Axiom` emitted by the kernel corresponds to
a valid derivation in the logical system described by the 18
rules. Consequently, the Verum proof corpus — if it consists
entirely of kernel-admitted theorems — is as sound as the 18
rules plus the allow-listed backends.

Caveats (the honest list):

- SMT proof replay currently validates rule *names* (every
  rule the backend cites must be in the kernel's allowlist)
  and *structure* (every sub-proof is recursively replayed).
  Rule-specific conclusion types — checking that each rule's
  conclusion follows from its premises' conclusions under
  the rule's semantics — is the final soundness tightening
  and gates on the S-expression-to-`CoreTerm` expression
  bridge.
- Cubical rules (HComp, Transp, Glue) are typed correctly
  but their normalization behaviour has not yet been
  validated against the full cubical-type-theory equation
  set. The type-inference paths are exercised by the kernel
  test suite; the reduction rules are scheduled as a
  dedicated cubical-kernel pass.

---

## 9. Extending the kernel

When you add a new primitive rule:

1. Write the rule in `rules::<family>::<rule_name>`.
2. Add a test to `tests::<family>` — at least one positive and
   one negative case.
3. Add an entry to the rule table in this document.
4. Increment `KERNEL_SCHEMA_VERSION` in `verum_kernel::lib`.
5. Update `SmtCertificate::schema_version` consumers if the trust-
   tag table changed.
6. Update `audit::enumerate_rules` so `verum audit --kernel-rules`
   lists the new rule.

Rule additions are the only reason the kernel grows. Fixes to
existing rules do not touch the schema version.

---

## 10. Further reading

- [Gradual verification](./gradual-verification.md) — how the
  Certified strategy consumes the kernel.
- [SMT routing](./smt-routing.md) — what the backends do before
  producing a certificate.
- [Proofs](./proofs.md) — the tactic DSL that produces
  `CoreTerm` values.
- [Proof export](./proof-export.md) — certificate envelope
  schema and cross-tool targets.
- [Counterexamples](./counterexamples.md) — what happens when
  the backend returns `sat` instead.
- [Architecture → trusted kernel](../architecture/trusted-kernel.md)
  — hardware/ABI perspective on the same component.

Historical background (non-Verum):

- Robin Milner, *A Theory of Type Polymorphism in Programming*
  (1978) — the original LCF paper.
- John Harrison, *Handbook of Practical Logic and Automated
  Reasoning* (2009) — Ch. 4 covers LCF-style implementation in
  OCaml, the closest analogue to what Verum's kernel does.
- Christine Paulin-Mohring, *Inductive Definitions in the System
  Coq* (1993) — the inductive rules we adopt are a simplified
  version of the CIC rules in this paper.
