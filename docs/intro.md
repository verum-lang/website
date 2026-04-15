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
- **Dual SMT backends**: Z3 and CVC5 with capability-based routing, so
  the solver that best handles your proof obligation actually gets it.
- **Three-tier references**: `&T` (~15 ns CBGR check), `&checked T`
  (zero overhead, compiler-proven), `&unsafe T` (zero overhead, you
  prove it).
- **Explicit contexts**: no hidden globals; capabilities flow through
  typed context parameters that propagate across async boundaries.
- **Semantic-honest types**: `List`, `Text`, `Map`, `Heap`, `Shared` —
  types describe meaning, not implementation.
- **Gradual verification**: five levels from `@verify(runtime)` all the
  way to `@verify(certified)` for machine-checked proofs.

## A first taste

```verum
type UserId     is (Int) { self > 0 };
type EmailAddr  is Text  { self.matches(rx#"[^@]+@[^@]+") };

type User is {
    id:    UserId,
    email: EmailAddr,
    age:   Int { 0 <= self && self <= 150 },
};

@verify(smt)
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

## How this site is organised

<div className="row" style={{marginTop: '1.5rem', gap: '1rem'}}>

- **[Getting Started](/docs/getting-started/installation)** — install
  the toolchain, write your first program, tour the language.
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
are not a Rust-vs-TypeScript question but an "is-this-invariant-machine-checkable"
question. It is a production language (v0.32, phase D complete) — but
it is also unapologetically influenced by Coq, Agda, Idris, F\*, Dafny,
and Lean. If you want `println!`-by-default, Verum is probably wrong
for you. If you want `postcondition`-by-default, read on.

:::tip Quickest path
Skip to **[Installation](/docs/getting-started/installation)** to get
`verum --version` on your terminal, then follow the **[Language Tour](/docs/getting-started/tour)**.
:::
