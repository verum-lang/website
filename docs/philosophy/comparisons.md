---
sidebar_position: 4
title: Comparisons
description: How Verum positions against Rust, OCaml, Swift, Idris, Dafny, and F*.
---

# How Verum compares

A positioning against the languages whose ideas Verum borrows from and
whose users Verum is most likely to attract. Positions are honest:
when a competing language is the right choice for a task, this page
says so.

## TL;DR table

| Feature / Concern                    | Verum             | Rust          | Swift             | OCaml           | Haskell      | Idris 2      | Dafny        | F\*         |
|--------------------------------------|-------------------|---------------|-------------------|-----------------|--------------|--------------|--------------|-------------|
| Refinement types                     | first-class       | no            | no                | no              | via TH/LH    | no           | yes          | yes         |
| Dependent types                      | yes (Σ/Π/path)    | const generics| no                | GADTs           | via LH       | yes          | limited      | yes         |
| SMT-driven                           | yes (Z3 + CVC5)   | via kani      | no                | no              | LH uses Z3   | no           | yes (Z3)     | yes (Z3)    |
| Ownership / borrow                   | three-tier + CBGR | borrow-ck     | ARC               | no              | no           | linear opt.  | GC           | F\*→C       |
| Lifetimes in signatures              | no                | yes           | no                | no              | no           | no           | no           | no          |
| Effects visible in signature         | contexts + throws | no*           | throws            | effects (OCaml 5)| type class | effects      | specs        | effects     |
| First-class async                    | yes               | yes           | yes               | yes (OCaml 5)   | IO           | no           | no           | no          |
| Structured concurrency (nursery)     | built-in          | tokio crate   | task groups       | lwt / eio       | stm          | no           | no           | no          |
| Capability-based attenuation         | built-in          | no            | no                | no              | no           | no           | no           | no          |
| Semantic-honest stdlib names         | yes               | `Vec` etc.    | `Array` etc.      | `list` / `array`| `[]`         | `List`       | `seq` etc.   | `list`      |
| Reserved keywords                    | 3                 | 52            | 70+               | 42              | ~50          | ~40          | ~50          | ~40         |
| Tagged literals (`sql#`, `rx#`)      | 40+ built-in      | no            | no                | no              | TH           | no           | no           | no          |
| Zero-cost default for safety         | tier-1 automatic  | debug_assert  | ARC elision       | —               | —            | linear opt.  | —            | —           |
| Native binary via LLVM               | yes               | yes           | yes               | yes (flambda)   | GHC→LLVM     | LLVM backend | —            | extract→C   |
| Proof certificates                   | yes (cert strat)  | no            | no                | no              | LH via Z3    | yes          | no           | yes         |
| Cubical HoTT / paths                 | yes               | no            | no                | no              | no           | no           | no           | no          |

\* Rust signals async via `async fn` and purity via `const fn`, but
has no first-class *effect* annotation that covers IO, state, etc.

---

## Verum vs Rust

**Shared DNA**: systems focus, strong types, no GC pauses, ownership,
zero-cost abstractions, LLVM codegen.

### Where Verum differs

**Refinement types are first-class.** `Int { self > 0 }` is a type,
not a runtime-checked newtype. Rust's nearest equivalents are
`typed-builder`, runtime `assert!`, or external tools like
[`kani`](https://model-checking.github.io/kani/) and
[`creusot`](https://github.com/creusot-rs/creusot).

**Dependent types.** `type Vec is n: Int, data: [Int; n];` expresses
"length `n`, payload of exactly `n` `Int`s" — the compiler can prove
index accesses safe. Rust has const generics with significant
restrictions (no dependent return types, no refinement interaction).

**SMT-backed verification as a compiler phase.** Verum integrates Z3
and CVC5 directly; `@verify(formal)` is first-class grammar. In Rust,
SMT-based verification lives in external tools that re-parse source.

**Three-tier references.** Verum has `&T` (managed, CBGR-checked,
≈ 15 ns), `&checked T` (compiler-proven, 0 ns), `&unsafe T`
(programmer-proven, 0 ns). Rust has `&T` (borrow-checked, 0 ns) and
`unsafe` (programmer-proven). Rust's single tier is more restrictive
at the source level — CBGR admits patterns Rust's borrow checker
rejects. Rust's single tier is also simpler.

**No lifetimes in signatures.** CBGR's generation counter absorbs most
of what lifetimes encode. `fn head<T>(xs: &List<T>) -> &T` — no `'a`.
This simplifies signatures and makes higher-order generic code
substantially easier to write. The cost: the CBGR runtime check (tier 0).

**Semantic-honest standard library names.** `List`, `Text`, `Map` —
not `Vec`, `String`, `HashMap`. See
[Semantic Honesty](/docs/philosophy/semantic-honesty).

**`@`-prefix macros, no `!` suffix.** `@derive(Clone)` replaces
`#[derive(Clone)]`. `print("x")` is an ordinary function. `f"{x}"`
is a literal, not a macro. See
[Metaprogramming](/docs/language/meta/overview).

**Explicit contexts.** `using [Database, Logger]` replaces ambient
state, thread locals, and `once_cell` globals. See
[Context System](/docs/language/context-system).

**Capability types.** `Database with [Read]` is a subtype of
`Database` — a function that needs only read-access can't perform
writes, proven at the type level. No Rust equivalent.

**40+ tagged literals built-in.** `sql#"..."`, `json#"..."`,
`rx#"..."`, `url#"..."`, `d#"2026-04-17"`, compile-time validated.
Rust's closest equivalents are external macros and
`proc-macro`-driven validation, per crate.

### When Rust is the right call

- You need the crates.io ecosystem today.
- You are doing `no_std` embedded where Rust has a mature story.
- Your team is already deep in Rust and the project will not
  significantly benefit from refinement types.
- You want a simpler type system that still catches ownership bugs.

---

## Verum vs Swift

**Shared DNA**: ARC-style reference counting available (`Shared<T>`),
`throws` clauses on functions, pattern matching, protocols.

### Where Verum differs

- **Three-tier references vs uniform ARC.** Verum's tier 0 is CBGR
  (not ARC); `Shared<T>` exists but is opt-in.
- **Refinement types.** Swift has none.
- **Dependent types.** Swift has none (opaque result types are the
  closest, and they're existentials).
- **SMT verification.** Swift has none.
- **Semantic-honest stdlib.** Swift's `Array`, `String`,
  `Dictionary` are closer to operational-honest.
- **3 reserved keywords.** Swift has 70+; Verum has 3.

### When Swift is the right call

- iOS / macOS development.
- You want ARC's predictability and the Apple ecosystem.

---

## Verum vs OCaml

**Shared DNA**: ML-family syntax bones, variants with pattern
matching, type inference, fast compilation, functional-first
expressiveness.

### Where Verum differs

- **Ownership and references.** OCaml has a uniform GC; Verum has
  three reference tiers with no GC.
- **Refinement types.** OCaml has none.
- **Dependent types.** OCaml has GADTs but no Σ/Π/path types.
- **Effects.** OCaml 5 has algebraic effects with resumable handlers
  and fibre-based stack switching. Verum has **capability-based
  contexts** (`using [...]`) plus explicit `throws` — a deliberately
  lighter alternative. Contexts are vtable dispatch on task-local
  storage (~5–30 ns); they do not support `resume`, but they do not
  pay the effect-operation cost on every call either. The trade-off
  is explained in detail under
  [Language → Context system → What contexts are *not*](/docs/language/context-system#what-contexts-are-not-a-deliberate-alternative-to-algebraic-effects).
- **Concurrency.** Verum ships structured concurrency (`nursery`)
  and `select` natively; OCaml relies on `eio` / `lwt` libraries.
- **Proof DSL.** OCaml has none; Verum integrates theorems and tactics.

### When OCaml is the right call

- You need the tight native-code compile loop OCaml is famous for.
- You want algebraic effects as library primitives.
- Your problem decomposes cleanly over a GC; you do not need
  fine-grained memory control.

---

## Verum vs Haskell

**Shared DNA**: strong, expressive type system; pure-by-default
inclinations; type classes (*protocols* in Verum).

### Where Verum differs

- **Purity.** Haskell encodes effects with IO, State, etc. Verum
  uses contexts — an orthogonal but equally expressive mechanism
  (see [Principle 3](/docs/philosophy/principles)).
- **Laziness.** Haskell is lazy by default. Verum is strict; lazy
  data structures are opt-in.
- **Memory model.** Haskell has a GC. Verum has three reference tiers.
- **SMT / verification.** Haskell relies on LiquidHaskell (an
  add-on); Verum integrates SMT as a first-class phase.
- **Proof DSL.** Haskell has no integrated proof language; Verum has
  theorems and tactics.
- **Dependent types.** Haskell has `DataKinds` + `TypeFamilies`;
  Verum has Σ/Π/path types and cubical HoTT.

### When Haskell is the right call

- Your team thrives in a lazy-functional world.
- You want the existing Hackage ecosystem.

---

## Verum vs Idris 2 / Agda / Coq / Lean

**Shared DNA**: dependent types, proofs as programs, tactic
verification, sometimes HoTT.

### Where Verum differs

- **Systems focus.** Verum produces native LLVM binaries with C-level
  performance. Coq/Agda/Lean are primarily interactive theorem
  provers; Idris 2 targets both but its runtime is heavier.
- **Gradual verification.** A Verum program does not have to be
  100% proved. Strategies range from `@verify(runtime)` to
  `@verify(certified)`, chosen per function.
- **SMT-first.** Most goals in Verum are discharged automatically by
  Z3 / CVC5; only the hard goals need tactics. In Coq / Agda, the
  default is interactive proof.
- **No built-in totality requirement.** Functions need not be total
  by default. Coinduction is opt-in via `cofix`.
- **No universe ceremony** in day-to-day code. Universe polymorphism
  is available (`universe u`) but invisible unless needed.

### When a proof assistant is the right call

- You are doing formal mathematics without a software deliverable.
- You need a total language because the thing you're proving cannot
  admit partiality (e.g. a kernel for a trusted theorem prover).
- You need tactic infrastructure and mathematical libraries
  (`mathlib` for Lean, `MathComp` for Coq).

---

## Verum vs F\*

**Shared DNA**: refinement types, SMT-driven verification, focus on
practical verification.

### Where Verum differs

- **Dual-solver portfolio.** Verum routes between Z3 and CVC5 based
  on goal shape. F\* is Z3-only.
- **Memory model.** Verum has CBGR with three tiers built into the
  language. F\* compiles to C via Low\* (or to OCaml, for
  higher-level fragments) — the memory model lives in the C output.
- **Cubical HoTT** is available for advanced equational reasoning.
  F\* has no cubical support.
- **Structured concurrency** is first-class; F\* has no built-in
  async.
- **Tooling.** Verum ships an LSP, a Playbook TUI, and an REPL as
  part of the language. F\*'s tooling sits on top of Emacs.

### When F\* is the right call

- You are writing Low\*-targeted systems code (cryptography, network
  stacks) and the existing F\* stdlib and proofs are load-bearing.
- You are already deep in the F\* ecosystem.

---

## Verum vs Dafny

**Shared DNA**: refinement types, SMT-driven verification (Z3),
developer-oriented verification.

### Where Verum differs

- **Memory model.** Dafny compiles to C#/Java/JS, with their GCs.
  Verum ships its own runtime with three-tier references.
- **Semantic-honest stdlib.** Dafny's standard collections are
  `seq<T>`, `set<T>`, `map<K, V>` — thin wrappers on the host
  language's collections.
- **Cubical HoTT and coinduction.** Dafny has neither.
- **Concurrency.** Dafny has no async story beyond the host
  runtime's.
- **Proof strategies.** Dafny has one: "let Z3 handle it." Verum has
  nine (`runtime`, `static`, `formal`, `fast`, `thorough`,
  `certified`, `synthesize`, plus aliases).

### When Dafny is the right call

- You need tight integration with .NET or the JVM.
- You want the language's battle-tested teaching toolkit — the
  online playground is excellent for verification onboarding.

---

## Verum vs Zig

**Shared DNA**: systems focus, explicit control, comptime (Verum's
`meta`), no hidden allocations.

### Where Verum differs

- **Types.** Verum has refinement and dependent types; Zig does
  not.
- **Verification.** Verum has SMT verification as a compiler phase;
  Zig relies on runtime testing and `unreachable`.
- **Ownership.** Zig has none; the programmer manages allocators
  explicitly. Verum has CBGR + three tiers.
- **Async.** Zig removed async in 0.11; Verum's async is
  structured-concurrency-first.
- **Reserved keywords.** Verum 3, Zig ~40.

### When Zig is the right call

- You want manual allocator control at every boundary.
- You want a smaller language than Verum.
- You need Zig's C-compatibility story.

---

## Verum vs Go / Java / Kotlin / Swift for servers / C#

Verum is not competing directly. These languages target different
priorities — fast iteration, managed runtimes, broad ecosystems,
industrial tooling. Verum is harder to learn and slower to write
initially.

The question is whether the invariants you ship with are worth the
learning cost. A CRUD service that is not verified is not
catastrophically worse than a CRUD service that is. A consensus
algorithm that is not verified sometimes *is*. Choose accordingly.

---

## When Verum is the right call

- **Safety-critical systems**: kernels, hypervisors, crypto,
  consensus, transaction processors.
- **Protocol implementations** where an off-by-one means a CVE.
- **Financial systems** where correctness beats time-to-market.
- **Research projects** that need real compile performance *and*
  real proofs.
- **Data pipelines and ETLs** where shape invariants are load-bearing
  (see [cookbook/shape-safe](/docs/cookbook/shape-safe)).
- **Anywhere you currently write** `// SAFETY: ...` **and wish a
  solver would check.**

## When Verum is the wrong call

- You need a crate / package that doesn't yet exist in the Verum
  ecosystem and the cost of porting is prohibitive.
- The team is not ready to reason about refinement types (they can
  be skipped, but that removes half the value).
- The domain's correctness budget does not justify the learning
  investment (quick prototypes, scripts, one-shot tooling).
- You need managed-runtime features specific to .NET / JVM / JS
  platforms.

---

## See also

- **[Design Principles](/docs/philosophy/principles)** — the six
  constraints Verum imposes on itself.
- **[Semantic Honesty](/docs/philosophy/semantic-honesty)** — the
  naming philosophy that shapes the stdlib.
- **[Gradual Verification](/docs/philosophy/gradual-verification)** —
  the nine-strategy ladder that sets Verum apart from both Rust and
  Coq.
- **[Migrating from Rust / TypeScript / Go](/docs/migrating/from-rust)**
  — concrete translation guides.
