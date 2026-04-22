---
sidebar_position: 1
title: Introduction
description: Welcome to Verum — a verifiable systems language.
slug: /intro
---

# Introduction

**Verum** is a systems programming language built around a single
question: _what if the type system, memory model, and proof engine were
designed to collaborate, from day one?_

The result is a language where correctness moves from the comments and
tests into the types themselves, and where safety guarantees are
negotiated — not imposed — by an explicit verification ladder.

## What Verum gives you

- **Refinement types**: `Float { 0.0 <= self && self <= 1.0 }` is a real
  type, checked by an SMT solver, erased at runtime.
- **Dependent types**: Σ-types, Π-types, and path types (cubical HoTT),
  integrated with unification — not bolted on.
- **Dual SMT backends**: the SMT backend with capability-based routing, so
  the solver that best handles your proof obligation actually gets it.
- **Three-tier references**: `&T` (~0.93 ns CBGR check, measured;
  target ≤ 15 ns), `&checked T` (zero overhead, compiler-proven),
  `&unsafe T` (zero overhead, you prove it).
- **Explicit contexts**: no hidden globals; capabilities flow through
  typed context parameters that propagate across async boundaries.
- **Semantic-honest types**: `List`, `Text`, `Map`, `Heap`, `Shared` —
  types describe meaning, not implementation. `Vec`, `String`,
  `HashMap` don't appear anywhere.
- **Gradual verification**: nine operational strategies — `runtime`,
  `static`, `formal`, `proof`, `fast`, `thorough`, `reliable`,
  `certified`, `synthesize` — dispatched distinctly through a
  two-layer architecture (coarse `VerificationLevel` gradient +
  fine-grained `VerifyStrategy` routing). See
  **[Gradual verification](/docs/verification/gradual-verification)**.
- **LCF-style trusted kernel** (`verum_kernel`, target &lt; 5 K LOC at
  completion): every tactic, every SMT backend, every elaboration step
  produces a proof term that the kernel re-checks. A bug outside the
  kernel can refuse a valid program or fail a certificate replay, but
  **never** accept a false theorem. See
  **[Architecture → trusted kernel](/docs/architecture/trusted-kernel)**.
- **Framework axioms with explicit attribution**:
  `@framework(lurie_htt, "HTT 6.2.2.7")` marks a postulate as coming
  from a specific external result. `verum audit --framework-axioms`
  enumerates the full trusted boundary of any proof corpus — no
  hidden axioms. Six stdlib packages (Lurie HTT, Schreiber DCCT,
  Connes reconstruction, Petz classification, Arnold–Mather, Baez–
  Dolan) ship 36 citation-tagged axioms today. See
  **[Framework axioms](/docs/verification/framework-axioms)**.

## A first taste

```verum
type UserId     is (Int) { self > 0 };
type EmailAddr  is Text  { self.matches(rx#"[^@]+@[^@]+") };

type User is {
    id:    UserId,
    email: EmailAddr,
    age:   Int { 0 <= self && self <= 150 },
};

@verify(formal)
fn promote(users: &List<User>, target: UserId) -> Maybe<User>
    using [Database, Logger]
    where ensures result is Some(u) => u.id == target
{
    users.iter().find(|u| u.id == target)
}
```

The SMT solver checks the postcondition at compile time. The refinement
types on `UserId` and `age` are erased — there is no runtime cost. The
`using [...]` clause makes the function's effects explicit. The `&List`
reference is CBGR-checked unless escape analysis promotes it to
`&checked List`, which costs nothing.

## Where the trust lives

Verum's soundness story is not "the SMT solver said so, trust us".
The explicit trusted computing base is exactly three items:

1. The Rust compiler and its linked dependencies (unavoidable).
2. The **LCF-style kernel** in `verum_kernel` — a small, audit-able
   check loop targeting &lt; 5 K lines of code at completion.
3. **Framework axioms**, each registered with an explicit
   `FrameworkId { framework, citation }`.

Everything else — the elaborator, all 22 tactics, the SMT backends
(Z3, CVC5, ...), the cubical NbE evaluator — lives **outside** the
TCB. Every tactic produces a proof term the kernel re-checks. Every
SMT backend produces a certificate that `replay_smt_cert` re-derives
into a kernel-checkable term. A bug in any one of them manifests as
"refused a valid program" or "certificate replay failed"; never as
"false theorem accepted".

The trusted boundary is *enumerable*: `verum audit --framework-axioms`
walks every `.vr` file in a project, collects every
`@framework(name, "citation")` marker, groups them by framework, and
prints the exact set of external results the corpus depends on. No
implicit extensions, no hidden axioms.

## How this site is organised

<div className="row" style={{marginTop: '1.5rem', gap: '1rem'}}>

- **[Getting Started](/docs/getting-started/installation)** — download
  the `verum` binary, write your first program, tour the language.
- **[Philosophy](/docs/philosophy/principles)** — the design principles
  that shaped Verum and the tradeoffs they imply.
- **[Language Reference](/docs/language/overview)** — detailed
  specifications of syntax, types, memory, patterns, and more.
- **[Standard Library](/docs/stdlib/overview)** — `List`, `Map`, `async`,
  `math`, `term`, and friends.
- **[Verification](/docs/verification/gradual-verification)** — how
  refinement types, SMT routing, contracts, and proofs fit together.
- **[Architecture](/docs/architecture/overview)** — how the compiler,
  VBC bytecode, runtime tiers, and SMT backends compose.
- **[Reference](/docs/reference/grammar-ebnf)** — EBNF grammar, keyword
  list, attribute registry, CLI, `verum.toml`, glossary.

</div>

## Who Verum is for

Verum is for engineers who have accepted that bugs in critical systems
are not a Rust-vs-TypeScript question but an "is-this-invariant-
machine-checkable" question. It is a production-track language
unapologetically influenced by Coq, Agda, Idris, F\*, Dafny, and Lean.
If you want `println`-by-default, Verum is probably wrong for you. If
you want `postcondition`-by-default, read on.

:::tip Quickest path
Skip to **[Installation](/docs/getting-started/installation)** to get
`verum --version` on your terminal, then follow the **[Language Tour](/docs/getting-started/tour)**.
:::
