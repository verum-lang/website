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
| Dependent types                      | Σ/Π; paths†       | const generics| no                | GADTs           | promoted kinds / type families | yes          | limited      | yes         |
| SMT-driven                           | yes (routed)      | via kani      | no                | no              | LH (external)| no           | yes          | yes         |
| Ownership / borrow                   | three-tier + CBGR | borrow-ck     | ARC               | no              | no           | linear opt.  | GC           | F\*→C       |
| Lifetimes in signatures              | no                | yes           | no                | no              | no           | no           | no           | no          |
| Effects visible in signature         | contexts + throws | no*           | throws            | effects (OCaml 5)| IO / effect types | effects      | specs        | effects     |
| First-class async                    | yes               | yes           | yes               | yes (OCaml 5)   | IO           | no           | no           | no          |
| Structured concurrency (nursery)     | built-in          | tokio crate   | task groups       | lwt / eio       | stm          | no           | no           | no          |
| Capability-based attenuation         | built-in          | no            | no                | no              | no           | no           | no           | no          |
| Semantic-honest stdlib names         | yes               | `Vec` etc.    | `Array` etc.      | `list` / `array`| `[]`         | `List`       | `seq` etc.   | `list`      |
| Reserved keywords                    | 3                 | 52            | 70+               | 42              | ~50          | ~40          | ~50          | ~40         |
| Tagged literals (`sql#`, `rx#`)      | 40+ built-in      | no            | no                | no              | TH           | no           | no           | no          |
| Zero-cost default for safety         | tier-1 automatic  | debug_assert  | ARC elision       | —               | —            | linear opt.  | —            | —           |
| Native binary via LLVM               | yes               | yes           | yes               | yes (flambda)   | GHC→LLVM     | LLVM backend | —            | extract→C   |
| Proof certificates                   | yes (cert strat)  | no            | no                | no              | LH (external)| yes          | no           | yes         |
| Cubical HoTT / paths                 | CoreTerm fragment† | no            | no                | no              | no           | no           | no           | no          |

\* Rust signals async via `async fn` and purity via `const fn`, but
has no first-class *effect* annotation that covers IO, state, etc.

† Verum's broader `CoreTerm` represents cubical/path operations. The minimal
`.vproof` calculus supports Π/Σ and its identity-type fragment; it does not
check arbitrary cubical derivations. Source elaboration, proof export and
execution coverage must be assessed separately. See the
[kernel boundary reference](../architecture/trusted-kernel.md).

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

**SMT-backed verification as a compiler phase.** Verum integrates an
SMT backend as a first-class compilation phase; `@verify(formal)` is
grammar, not an external-tool hook. (The current implementation
bundles solver adapters behind a capability router; a Verum-native solver
is on the roadmap.) In Rust, SMT-based verification lives in external
tools that re-parse source.

**Three-tier references.** Verum has `&T` (managed, CBGR-checked,
**1.2–1.7 ns measured**), `&checked T` (compiler-proven, 0 ns), `&unsafe T`
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
[Semantic Honesty](/docs/foundations/semantic-honesty).

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

**Tagged literals built into the language, not bolted on.**
`sql#"..."`, `json#"..."`, `rx#"..."`, `url#"..."`, `d#"2026-04-17"`
are lexed and typed by the compiler itself; Rust's closest equivalents
are external macros and `proc-macro`-driven validation, per crate.

:::warning Most of them do not produce a usable value yet

the compiler recognises 71 tag spellings mapping to
48 distinct types, and **16 of those types exist in `core/` — 32 do
not**. `d#"2026-04-17"` types as `DateTime`, which `core/time/` does not
declare, so nothing can be called on it; `sql#"..."` types as
`SqlQuery`, likewise absent. Even for the sixteen that do exist, the
literal stores a plain string at run time, so a method call dispatches
against a `Text` — with measured consequences on
[cookbook/regex](/docs/cookbook/regex).

Three of the five forms named in this paragraph are in that group.
Check any one of them the same way — the answer is the whole test:

```bash
grep -rnE '^ *(public |pub )?type +DateTime\b' core/ --include='*.vr'
grep -rnE '^ *(public |pub )?type +Url\b'      core/ --include='*.vr'
```

The first prints nothing and the second prints a declaration. The count
above is real and the lexing is real; the typed value at the end of it
mostly is not.
:::

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
- **Type abstraction and dependency.** Swift's `some P` hides a concrete
  type while preserving its identity; `any P` is an existential container
  whose underlying type can vary. Neither should be identified with Verum's
  value-indexed Π/Σ constructs. These are different mechanisms, not a
  hierarchy of strength. See [Swift's opaque and boxed protocol types](https://docs.swift.org/latest/documentation/the-swift-programming-language/opaquetypes/).
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

- **Effects and dependencies.** Haskell's `IO` represents actions with
  explicit sequencing; Verum's `using [...]` exposes required context
  capabilities. Dependency access and effect composition are different
  contracts. A claim of equal expressive power would require a defined
  translation preserving behavior, effects and handlers; none is established
  here. See the [Haskell I/O semantics](https://www.haskell.org/onlinereport/haskell2010/haskellch7.html)
  and [Verum context system](/docs/language/context-system).
- **Laziness.** Haskell is lazy by default. Verum is strict; lazy
  data structures are opt-in.
- **Memory model.** Haskell has a GC. Verum has three reference tiers.
- **SMT / verification.** Haskell relies on LiquidHaskell (an
  add-on); Verum integrates SMT as a first-class phase.
- **Proof DSL.** Haskell has no integrated proof language; Verum has
  theorems and tactics.
- **Type-level programming.** GHC's `DataKinds` promotes suitable datatypes
  to kinds, and type families support type-level functions. Verum exposes
  dependent-function and dependent-pair constructs; its broader cubical
  representation has the fragment boundaries described above. These facts
  alone establish no containment between the full languages. See
  [GHC datatype promotion](https://ghc.gitlab.haskell.org/ghc/doc/users_guide/exts/data_kinds.html).

### When Haskell is the right call

- Your team thrives in a lazy-functional world.
- You want the existing Hackage ecosystem.

---

## Verum vs Idris 2 / Agda / Coq / Lean

These systems share dependent types and the separation of proof construction
from proof checking. Their calculi, runtime models and supported libraries
differ; a feature checklist is not a ranking of mathematical strength.

### Lean's actual baseline

Lean combines a programming language with formal reasoning. Its kernel
checks explicit terms, and independent checker implementations exist in
Rust and Lean. Multiple checkers are therefore a shared engineering
technique, not an exclusive advantage of Verum.
[Lean's kernel reference](https://lean-lang.org/doc/reference/latest/Elaboration-and-Compilation/).

Lean also supports executable `partial` and `unsafe` definitions with
explicit restrictions on their use in proofs. General recursion in
application code does not require every program to be proved total.
[Lean's recursion reference](https://lean-lang.org/doc/reference/latest/Definitions/Recursive-Definitions/).

For either system, accepting a proof and establishing that its statement
means what the author intended are separate checks. Imported axioms and
native-evaluation trust also belong to the chosen profile.
[Validating a Lean proof](https://lean-lang.org/doc/reference/latest/ValidatingProofs/).

### Verum's concrete direction

Verum aims to connect systems programming, memory/reference discipline,
contracts and proof artifacts in one language platform. Its useful
extension points are specific:

| Mechanism | Present surface | Required boundary |
|---|---|---|
| Proof-term replay | Closed Π/Σ/identity-type certificates | State the exact calculus, checked statement and supported source bridge |
| Multiple checking strategies | Direct and NbE checking, plus manifest policy | Retain shared dependencies and incomplete outcomes |
| Foundation inventories | Citation classification and known-conflict checks | Classification does not construct an interpretation or prove consistency |
| Theory interoperability | Export and framework attribution | Separate statement scaffolds from translated derivations |
| Application verification | Contracts, solver routing and execution tooling | Identify solver trust and runtime-preservation obligations |

The [kernel boundary reference](../architecture/trusted-kernel.md) specifies
what those interfaces establish. The [source bridge](../verification/knowledge-systems.md#source-to-goal-boundary)
explicitly refuses AST forms whose types and scopes it cannot faithfully
translate; this is separate from accepting manually supplied formal terms.
Their combination is valuable for
[knowledge-system integration](../verification/knowledge-systems.md):
assumptions, evidence and executable behavior can be kept visible together.
It does not establish greater soundness, stronger foundations, superior
performance or complete feature parity with another prover.

### Choosing a tool

Use the prover and libraries that already formalize the mathematics your
project depends on. Evaluate Verum when its application-language integration
and explicit verification interfaces solve a concrete engineering problem;
check the relevant backend and proof fragment on your own workload.
Neither choice requires treating the other system as a theoretical limit.

---

## Verum vs F\*

**Shared DNA**: refinement types, SMT-driven verification, focus on
practical verification.

### Where Verum differs

- **Automation interfaces.** Verum exposes solver routing and verification
  modes. F\* combines SMT automation with programmable Meta-F\* tactics;
  solver selection alone does not rank their proof power. Compare the
  supported goals, retained evidence and trust boundaries. See
  [F\* tactics](https://fstar-lang.org/tutorial/book/part5/part5_meta.html).
- **Systems integration.** Verum develops its three-tier reference model
  inside the language platform. F\* has several extraction routes and
  verified imperative programming facilities, including Pulse for concurrent
  code. Their memory and concurrency guarantees depend on the selected
  source fragment and extraction path, not simply the output language.
- **Cubical representation.** Verum's broader `CoreTerm` contains cubical
  operations. This is a concrete extension surface; it is not a claim that
  arbitrary cubical HoTT proofs are accepted by its minimal checker or
  translated through every backend.
- **Tooling.** Verum provides an LSP and interactive tools. F\* supports both
  Emacs and VS Code, including incremental interactive development. Evaluate
  the relevant editor and workflow directly. The
  [official F\* overview](https://github.com/FStarLang/FStar/blob/master/README.md)
  describes editor support, extraction and Pulse.

### When F\* is the right call

- You are writing Low\*-targeted systems code (cryptography, network
  stacks) and the existing F\* stdlib and proofs are load-bearing.
- You are already deep in the F\* ecosystem.

---

## Verum vs Dafny

**Shared DNA**: refinement types, SMT-driven verification,
developer-oriented verification.

### Where Verum differs

- **Runtime integration.** Dafny uses its selected compilation backend;
  Verum develops a runtime with three-tier references. Compare concrete
  allocation and verification contracts for the target workload.
- **Collections.** Dafny's sequences, sets and maps are mathematical value
  types with language-defined semantics. Their compiled representations do
  not reduce them to thin wrappers around host collections. Verum's naming
  choices are an API preference, not a stronger mathematical guarantee.
- **Coinduction.** Dafny supports coinductive datatypes and greatest lemmas.
  Those mechanisms are distinct from the cubical/path constructors in
  Verum's broader representation; neither substitutes for the other.
- **Proof development.** Dafny combines SMT discharge with explicit lemmas,
  induction, assertions, `assert ... by` blocks and `calc` proofs. Verum's
  verification modes configure checking policy and automation; counting
  mode names does not measure proof expressiveness. A useful comparison
  tracks proof structure, assumptions and reproducible evidence for the
  same obligations.

These Dafny mechanisms are specified in its
[reference manual](https://dafny.org/dafny/DafnyRef/DafnyRef).

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

- **[Design Principles](/docs/foundations/principles)** — the six
  constraints Verum imposes on itself.
- **[Semantic Honesty](/docs/foundations/semantic-honesty)** — the
  naming philosophy that shapes the stdlib.
- **[Gradual Verification](/docs/foundations/gradual-verification)** —
  the thirteen-strategy ladder that sets Verum apart from both Rust
  and Coq.
- **[Migrating from Rust / TypeScript / Go](/docs/migrating/from-rust)**
  — concrete translation guides.
