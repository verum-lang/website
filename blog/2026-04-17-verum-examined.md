---
slug: verum-examined
title: "Verum, examined — a systems language for an age when humans write less code"
authors: [verum-team]
tags: [design, philosophy, verification, llm, types, memory]
---

Most language announcements read as feature lists. This one won't. Verum exists because a specific, uncomfortable question has become unavoidable in the last two years: **if large language models write an increasing fraction of our code, what stops the resulting systems from silently decaying?** The older answers — code review, tests, strict type systems — are useful but incomplete. They treat a program's intent as something only humans ever possess. That assumption is breaking.

This post explains what Verum actually is, feature by feature, grounded in the grammar and the compiler that implements it, with honest comparisons to the other languages these ideas come from. At the end we return to the question above: why this language, why now.

<!-- truncate -->

## 1. The premise: semantic honesty

Verum's single foundational rule is *semantic honesty*: every name, every syntax form, every annotation must reflect what the compiler actually does with it. The name of a reference must describe its cost and its guarantee, not the duration of its target; the name of an effect must describe the effect, not the machinery that implements it; the name of an attribute must describe what the compiler will do on encountering it, not what it looked like in the language this one borrowed the idea from. No implicit coercions. No hidden globals. No magic that activates under some configuration but not another.

This sounds obvious. It is also the reason a great many language features you may know are **not** in Verum:

- No exceptions that unwind silently past function boundaries.
- No `static` lifetime that means "statically checked" but is named after duration.
- No ambient globals pretending to be language features. Dependencies travel in `using [...]` clauses, always.
- No `!` macro suffix to mark "this isn't really a function call" — everything compile-time uses `@`, everything runtime does not.
- No coherence loopholes; orphan and overlap rules are hard.

Every one of these choices costs something (occasional verbosity, a few familiar idioms ruled out). The payoff is that the language stops lying to its reader. In 2024 the reader was human. In 2026 it is often not. A language that lies — even a little — to a model that doesn't know it's being lied to is a liability, not a convenience.

The three reserved keywords are `let`, `fn`, `is`. Everything else — `type`, `using`, `where`, `async`, `spawn`, `meta`, `theorem` — is a contextual keyword that rebinds to an identifier when used as one. The authoritative grammar is a single EBNF file of a little under twenty-five hundred lines; everything in the language below has a production in it.

## 2. Types that carry their invariants

A refinement type is a base type plus a predicate: `Int { self > 0 }`, `List<T> { self.is_sorted() }`, `Text { valid_email(self) }`. The predicate is part of the type — not a comment, not a test, not a linter annotation. SMT discharges it at compile time.

This idea is old (Rondon, Kawaguchi, Jhala's *Liquid Types*, 2008) and has been explored in Liquid Haskell, F\*, LiquidJava, SPARK/Ada 2012. The gap between these and a production systems language has always been pragmatics — usable error messages, a memory model that survives ownership, and an escape hatch when the SMT solver gives up.

Here is what makes Verum's treatment specific.

**The refinement is syntactically part of the type.** In Liquid Haskell you write an annotation comment `{-@ ... @-}` alongside a plain Haskell function; the refinement lives in a parallel universe. In F\* you write `(n : nat{n > 0})`, which is closer, but F\* is not a systems language — its memory model is not `&T`/`&mut T`. In Verum:

```verum
type Port      is Int  { 1 <= self && self <= 65535 };
type NonEmpty<T> is List<T> { self.len() > 0 };

@verify(formal)
fn bind(p: Port) -> Socket { ... }   // the compiler knows p is in [1, 65535]
```

If you pass `bind(70000)`, the error is reported at the call site, not at a runtime panic. If the value is dataflow-derived, the compiler narrows its refinement along control flow — a guard `if p > 0 && p < 65536` is enough to prove the obligation.

**Predicates are first-class.** User-defined `@logic` functions (`@logic fn is_sorted<T: Ord>(xs: &List<T>) -> Bool { forall i in 0..xs.len()-1. xs[i] <= xs[i+1] }`) are reflected as SMT axioms; calling them from a refinement is not a syntactic trick. This is closer to Dafny's ghost functions than to Rust's `const fn`.

**When SMT fails, there are tactics, not panic.** The language admits twenty-two named tactics: `auto`, `simp`, `ring`, `field`, `omega`, `blast`, `smt`, `trivial`, `assumption`, `contradiction`, `induction`, `cases`, `rewrite`, `unfold`, `apply`, `exact`, `intro`, `intros`, `cubical`, `category_simp`, `category_law`, `descent_check`. Arbitrary user-registered tactics are named by identifier. Combinators — `try`, `else`, `repeat`, `first`, `all_goals` — compose them. This is a plain-old Coq/Lean tactic language embedded in a systems language — not a separate prover invoked from the outside.

The trade-off is real: refinement types do not come for free in compile time, and complex predicates can exceed the SMT solver's decidable fragment. That is why the next feature exists.

## 3. Gradual verification — the spectrum

Most verified-language proposals ask the programmer to commit to formal proof up front. Verum does not. The `@verify(...)` attribute names **seven distinct strategies**, which is the main interface to verification:

| Strategy       | Intent                                           | Cost / guarantee            |
|----------------|--------------------------------------------------|-----------------------------|
| `runtime`      | Check the predicate at runtime                   | Cheapest, unverified        |
| `static`       | Type-level static checks only                    | Fast, partial               |
| `fast`         | Prefer speed over completeness                   | Fastest verify, may skip    |
| `formal`       | Balanced default                                 | Standard SMT discharge      |
| `thorough`     | Race multiple techniques in parallel             | Slower, robust              |
| `certified`    | Independent cross-verification                   | Slowest, strongest          |
| `synthesize`   | Generate a term satisfying the specification     | Variable                    |

The grammar also accepts two alias spellings — `@verify(proof)` for `formal` and `@verify(reliable)` for `thorough` — so the surface keyword count is nine, but the behaviours collapse to these seven.

The same body of code moves up the ladder as trust becomes a requirement. Ship a library at `@verify(runtime)`. When a caller depends on a stronger guarantee, promote to `@verify(formal)` or `@verify(certified)` — no rewrite. If the solver times out, drop a tactic script or fall back to `@verify(runtime)` with a visible apology in the type.

No other language in production use has this shape. Liquid Haskell is all-or-nothing. F\* is all-or-nothing. Dafny is all-or-nothing. Kotlin contracts, TypeScript `asserts` clauses, and Java JML annotations are strictly weaker (runtime-only or unsound). Rust has no SMT integration in the language at all. Coq and Lean are not systems languages.

The closest spiritual neighbour is probably **SPARK/Ada**, which has a gold/silver/bronze hierarchy for verification. But SPARK inherits Ada's surface and toolchain; Verum is the first attempt to put this hierarchy into a modern systems language whose syntax would feel familiar to a Rust, Swift, or Kotlin reader.

## 4. Memory without a one-size answer: the three-tier reference model

The memory-safety debate has historically offered two choices. Either you get garbage collection (Go, Java, Haskell, OCaml; cheap to write, unpredictable latency) or you get ownership and lifetimes (Rust, Cyclone; predictable, but one model for everything). Verum picks a third shape: **three tiers of reference, chosen per use site**.

| Tier | Syntax          | Cost      | Guarantee                                  |
|------|-----------------|-----------|--------------------------------------------|
| 0    | `&T`, `&mut T`  | ~15 ns*   | Capability-Based Generational References   |
| 1    | `&checked T`    | 0 ns      | Compiler-proven safe (escape analysis)     |
| 2    | `&unsafe T`     | 0 ns      | Caller proves safety; requires `unsafe`    |

\* target overhead per dereference on current hardware; the precise cost is a small number of cycles for a single comparison and a predicted branch.

CBGR (Capability-Based Generational References) is the name of the Tier 0 mechanism. A reference is three fields: pointer (8 B), generation (4 B), capability-and-epoch bits (4 B) — sixteen bytes for the common case, twenty-four for references into unsized data (slices, trait objects) where a length or vtable pointer must travel along. The allocation header carries the current generation; on every dereference the reference's generation is compared against the header's. A free or explicit revoke atomically bumps the header's generation; every subsequent deref through a now-stale reference is rejected before it can touch memory. Capabilities are eight monotonic bits — `READ`, `WRITE`, `EXECUTE`, `DELEGATE`, `REVOKE`, `BORROWED`, `MUTABLE`, `NO_ESCAPE` — that can be attenuated, never expanded: an API that hands you a read-only reference cannot itself be used to widen it.

Tier 1 is the escape hatch. The compiler's reference-analysis suite — escape analysis, non-lexical lifetimes, Polonius-style borrow checking, points-to, dominance, type-sensitive and concurrency-sensitive flow, ownership and lifetime inference, plus tier-aware and array-bounds analysis — proves where Tier 0 can be lowered to a raw load. The compiler silently **promotes** `&T` to `&checked T` where this is safe; it never demotes silently — `&unsafe T` is always a source-level opt-in written by the programmer.

Compare this to the prior art:

- **Rust**: one tier. `&T`/`&mut T` go through the borrow checker; if the check fails you rewrite the program. There is no "pay a little at runtime and move on" — the only escape is `unsafe { ... }`.
- **Cyclone, ATS**: lifetimes or linear types, no runtime tier. Strong proofs, steep learning curve.
- **Swift, ObjC**: ARC at runtime. One tier, always.
- **Pony**: six reference capabilities. Closest in spirit to Verum's capability bits, but Pony binds the capability system to an actor model; Verum keeps it orthogonal to concurrency.
- **Fil-C, CheckedC**: retrofit runtime checks onto C. Similar in motivation to CBGR but tied to C's surface.

Verum's claim is not that three tiers are objectively better than one. It's that committing to one tier at the language level forces the programmer into a trade-off that should be made per function. The language should permit both answers; the compiler should make the cheaper answer automatic where it's provably safe.

## 5. One context system for runtime and compile time

Dependency injection, dynamic scoping, reader monads, effect rows, context parameters — every modern language has a different name for the same underlying need: **a function sometimes wants a value from an enclosing scope without passing it as a positional argument**. The range of answers is wide and mostly incoherent:

- Rust: services threaded manually, or trait objects, or frameworks (`tokio::spawn_local`, etc.).
- Haskell: the `Reader` monad transformer. Elegant, but infectious.
- Scala 3: `given`/`using` — the closest ancestor, but restricted to compile-time resolution.
- Kotlin: receivers and `CoroutineContext` — two unrelated systems.
- Koka, Effekt: algebraic effects. Principled, but small community and separate from type-based DI.
- Verum: one clause, `using [...]`.

The grammar production for `using [C1, C2, ...]` applies **identically** to a runtime function taking a `Database`/`Logger`/`Clock` and to a `meta fn` taking a `TypeInfo`/`BuildAssets`/`Schema`. The call-site must provide a matching set; child tasks spawned with `spawn` inherit the parent's stack; `spawn using [A, B]` drops everything else. There is no ambient global; there is no conditional import; there is one lookup rule.

The numbers are concrete. Fourteen compile-time meta-contexts are shipped with the language:

| Meta-context   | Purpose                                                    |
|----------------|------------------------------------------------------------|
| `TypeInfo`     | Reflect on types: fields, variants, size, alignment, names |
| `AstAccess`    | Inspect and transform AST nodes                            |
| `CodeSearch`   | Query the whole program (definitions, callers, uses)       |
| `DepGraph`     | Navigate the dependency graph between items                |
| `Schema`       | Read project-level schemas (SQL, JSON, Proto)              |
| `Hygiene`      | Name generation and identifier freshness                   |
| `MacroState`   | Per-expansion storage, guard recursion                     |
| `SourceMap`    | Span manipulation and source-line lookup                   |
| `StageInfo`    | Query the current meta-stage and phase                     |
| `CompileDiag`  | Emit errors, warnings, help text                           |
| `BuildAssets`  | Load files and emit constants at build time                |
| `ProjectInfo`  | Manifest fields, workspace members, feature flags          |
| `MetaRuntime`  | Controlled evaluation at compile time                      |
| `MetaBench`    | Benchmark compile-time work                                |

The standard runtime set is ten contexts: `Logger`, `Database`, `Auth`, `Config`, `Cache`, `Metrics`, `Tracer`, `Clock`, `Random`, `FileSystem`. Across the fourteen meta-contexts there are on the order of two hundred and thirty public methods, each a typed, documented API — not a reflection surface groped through strings.

Why unify these two worlds? Because from the programmer's perspective, a `meta fn` that inspects a type via `TypeInfo` is doing the same thing as a runtime function that reads a config via `Config`: reaching into an outer scope for an authorised value. The surface syntax for both should be the same. Having *separate* systems for compile-time and runtime dependency is how languages grow two subtly different sets of rules for the same concept. That is exactly the kind of hidden complexity semantic honesty is meant to prevent.

## 6. Dependent types and cubical HoTT — in a systems language

Dependent types let a type depend on a value. The canonical example is `Vec<T, n>` — a vector whose length is part of its type, so that `vec_concat : Vec<T, n> → Vec<T, m> → Vec<T, n + m>` makes the shape law a type-level fact. Idris, Agda, Coq, Lean, F\* all live in this space.

Verum includes dependent types, sigma-type refinements of the form `x: Int where x > 0`, cubical path-equality types written `Path<A>(a, b)`, and a cubical normaliser with higher-inductive types and computational univalence. The language's dependent-types, cubical-normaliser, HoTT-primitives, and verification-pipeline phases are all in the shipped release; conformance tests cover every production.

The combination — dependent types **and** `&mut T` **and** systems-language syntax **and** production tooling — is rare. Idris 2 ships a linear-types extension but has no CBGR-style runtime safety; Lean 4 is a proof assistant first and a systems language a distant second; ATS has dependent types and linear types but a notoriously difficult surface.

The useful question is: *when does dependent typing actually earn its cost?* Verum's position is that it does when a library's API has shape invariants that today become runtime assertions or doc-comment folklore — tensor shape checks for ML (`Tensor<T, [B, H, L, D]>`), index bounds for buffer code, protocol state machines, cryptographic nonce uniqueness. For the rest, the refinement-type layer is sufficient.

The cubical layer is where Verum becomes experimental. Computational univalence (Cohen/Coquand/Huber/Mörtberg, 2015) makes equivalence between types a definitional equality. It is powerful — you can transport programs along proofs of type isomorphism — and rarely needed. Verum ships it because the machinery was a prerequisite for the proof system, not because every program will use it.

## 7. Metaprogramming without a second language

Rust's macros have an exclamation mark. Scheme's have `quasiquote`. Scala 3 has `inline` plus `Quotes`. Each tells the reader "you've stepped out of the main language now." Verum keeps you in one language. The compile-time sub-language **is the same language**, run at an earlier stage.

A `meta fn` is a function. A `quote { ... }` block is an expression of type `TokenStream`. An `@-attribute` invokes a meta function at a specific syntactic site. Splicing (`$expr`, `$[for ...]`) pastes a quoted value back. Staging is explicit (stage 0 = runtime, 1 = first meta, etc.).

The reason this matters for the rest of the language is that every attribute in Verum — `@derive`, `@verify`, `@repr`, `@specialize`, `@logic`, `@cfg`, `@intrinsic`, and more than forty others — is uniformly an invocation of something you could write yourself in a `meta fn`. There is no distinction between a language-level compile-time construct and a user-level one. You do not have to petition for a new attribute; you can write one.

Compare:
- Rust: proc-macros are a separate crate type with separate compilation rules and restrictions.
- C++: templates + constexpr are two different languages glued together.
- Lisp: `defmacro` is uniform but untyped.
- Template Haskell: typed but infamously hostile to tooling.
- Scala 3 macros: uniform-ish but dependent on the metaprogramming API.
- Verum: one language, one type system, one set of rules, staged.

## 8. Concurrency: structured, contextual, and cancellable

`async fn`, `await`, `spawn`, `nursery { ... }`, `select { ... }`, `for await`. None of these are novel individually; `async`/`await` is from C#, structured concurrency is the Nathaniel Smith/Trio tradition, `nursery` + scoped cancellation came out of that.

Verum's contribution is not a new primitive but the integration:

- A task's `using [...]` context stack is part of its identity. A child task inherits it by default; `spawn using [A, B]` drops everything else. There is no ambient cancellation token passed through magic.
- The `nursery(on_error: cancel_all) { ... }` block owns every task spawned inside it. Leaving the scope waits for every child. No task outlives its scope. This is the Trio invariant, stated in the language.
- `async fn` does not infect callees. A `fn` is `fn`, and `async fn` is different. There is no automatic async-in-async coloring beyond what is visible in the type. (Async colouring remains a real language-design cost, discussed openly — Verum does not claim to solve it, only to make it explicit.)

Under this surface sits a work-stealing per-core executor, a platform-native I/O reactor, and a context stack that is saved at every `.await` and restored before resumption — so that a function suspended for an hour and resumed in a different worker thread still sees the same `using [Database, Logger]` stack it had when it yielded.

## 9. Proof-carrying code and the distribution model

A `cog` is Verum's package — not an archive of source, but an archive of VBC bytecode plus optional proof certificates, type metadata, and signatures. When a downstream consumer takes a dependency at `@verify(certified)`, they can validate the included proofs **offline**, without running the compiler over the source.

The precedent here is the Proof-Carrying Code tradition (Necula, Lee, 1996) and WebAssembly's validation step. Java's bytecode verifier checks type safety; WebAssembly's validator checks more. Verum goes further: the verifier can check refinement predicates up to `@verify(certified)`. Proof terms are exportable to Coq, Lean, Dedukti, and Metamath so a paranoid consumer can re-validate against an unrelated tool.

This is not theatre. Supply-chain attacks on code registries are the main way modern software is compromised; the question "does this package do what it says?" is no longer hypothetical. A cog's certificate cannot rule out every attack, but it raises the lower bound of what a consumer knows about the code they just linked against.

## 10. One IR, two executions

Verum is **VBC-first**. Every program compiles to VBC (Verum Bytecode); VBC is either interpreted (Tier 0) or lowered through LLVM to native code (Tier 1). There is no second path from source to execution.

The consequence is architectural rather than performance-headline-worthy:

- `verum run` starts in milliseconds because it skips native codegen. Every VBC opcode has a direct interpreter handler; the primary plus extended opcode tables together approach the scale of a real machine's instruction set.
- `verum build --release` runs the same front end, the same type checker, the same CBGR analysis, and only differs in the final lowering step.
- Behaviour under the two paths is the same. A test that passes under the interpreter passes under AOT; a panic reproduces on both; a verification obligation discharges once.
- Tooling — LSP, DAP, REPL, Playbook — sits on the same pipeline. There is no "dev mode semantics vs release mode semantics." Python grew that and now spends a significant chunk of its design energy managing the gap.

Languages with this property: BEAM (Erlang/Elixir), the JVM, the CLR, LuaJIT. Languages without it: C, C++, Rust (separate rustdoc/test/compile paths with differences), Swift, Go. Verum is firmly in the VBC-first camp, which is unusual for a systems language targeting native.

## 11. The LLM-era angle — why this language matters now

Here is where we return to the question at the top.

For roughly forty years a programming language's job was to help a human write software. Documentation, naming conventions, linters, tests, and type systems were all optimised for a specific reader: another human, probably tired, probably catching up on context. The human was the bottleneck, so the language should help the human.

That bottleneck has moved. In 2026, a growing percentage of production code is not written by the human holding the keyboard but by a language model they are prompting. The human reads, approves, and merges. Sometimes they don't read — and the tempo of work depends on them not having to, often.

This shift changes what a programming language is actually for in three ways, and each one is what Verum was built around:

**First, the spec moves from docstrings to types.** An LLM that reads `/// Returns the first index where xs[i] == key; returns -1 if missing.` treats that English sentence as a suggestion. An LLM that reads `where ensures result.is_some() => xs[result.unwrap()] == *key` treats the refinement as a verifier it will be graded against. Types-as-specification is not new — Hoare's preconditions date to 1969 — but making it ergonomic enough that every function carries one was always the blocker. Semantic honesty plus gradual verification is how Verum attempts to break that blocker.

**Second, the cost of hidden behaviour is asymmetric.** When a human writes a function, they carry the context in their head: *this runs inside a tokio runtime, so a spawn here is fine; this module has an implicit logger, so `log::info!` works*. An LLM that has read ten million Rust projects has statistical knowledge of those conventions but does not carry *this* project's context. If the language lies — an ambient global, a hidden allocation, a coercion under a rarely-triggered flag — the LLM's training distribution will guess wrong, confidently. `using [...]` is boring when you write it by hand. It's load-bearing when a model writes it for you.

**Third, verification becomes the social contract.** Before, an open-source library's reputation was built on its maintainer's judgment. That is still true, but many eyes now include non-human ones, and the fraction of code that is machine-transcribed from another machine's output will keep rising. The honest answer is not "trust the AI" or "never trust the AI." It is "make the evidence machine-checkable." Proof-carrying cogs, `@verify(certified)`, tactic scripts, exportable proof terms to Lean and Coq — these are instruments for a world where not every reader of your code is a person, and not every writer is either.

None of this is to say Verum "solves the LLM problem." It is to say that the language-design decisions Verum has been making for the last three years — explicit context, refinement types, gradual verification, semantic honesty, a single stable IR, proof-carrying distribution — happen to line up with what the current and next few years of software will need. They would have been defensible features in 2021. They are close to necessary features in 2026.

## 12. Trade-offs Verum actually makes

A blog post about a language that does not list its costs is a marketing document. These are the real costs.

- **Compile times.** Refinement-type SMT discharge costs real seconds per function in hard cases. The incremental compilation cache, per-obligation fingerprinting, and the `@verify(fast)` strategy exist because this is a real tax. It is not gone; it is amortised.
- **Syntax weight.** `using [...]`, `where ensures ...`, `{ self > 0 }` are all more characters than their absent Rust equivalents. The tradeoff for explicitness is, always, verbosity. Verum bets the verbosity is worth it.
- **Learning curve.** The refinement-type + dependent-type + cubical stack is academically heavy. You do not need any of it to ship a CLI — `@verify(runtime)` on plain `Int` and `Text` is a complete program — but the full surface is larger than Go's.
- **Ecosystem age.** Verum's registry is new; the package count is measured in dozens, not tens of thousands. Using Verum for a problem that is two `cargo add` calls away in Rust today is a worse trade than Rust. That changes only with time and adoption.
- **Async colouring.** `async fn` is a different type from `fn`. This is a language-design cost Koka and Scala have partially avoided with effect systems; Verum does not. The choice was deliberate — an explicit `async` colour is more honest than an implicit one — but it is a real cost.
- **LLVM dependency.** Tier 1 requires LLVM 21. That is a several-hundred-megabyte build dependency. Distributions that cannot tolerate it can run Tier 0 only, but then they lose native speed.

None of these are show-stoppers. All of them deserve to be named.

## 13. Closing

The shortest honest description of Verum is this: it takes refinement types from Liquid Haskell, gradual verification from SPARK, a three-tier memory model descended from CBGR and Pony's capability ideas, a context system that unifies compile-time and runtime DI, a dependent-type layer with cubical HoTT support, and a single bytecode IR that runs both the interpreter and the AOT backend. It wires them together under one rule — semantic honesty — and refuses to include features that break that rule.

The pitch is not that any one of these ideas is new. They are not. The pitch is that they have never been combined in a production systems language whose surface a Rust or Swift programmer could read comfortably, and that the current moment — where software increasingly travels through a language model before it reaches production — is the moment where having them combined actually pays.

Whether the bet is right will be settled by practice, not by essays. The language is open, documented end-to-end, and instrumented. If the questions raised above sound like yours, the easiest next thing is to read the [language tour](/docs/getting-started/tour), pick one example, and try to break it. We built the language expecting to be argued with.

— The Verum team
