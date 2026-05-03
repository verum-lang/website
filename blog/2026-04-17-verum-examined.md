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

Most verified-language proposals ask the programmer to commit to formal proof up front. Verum does not. The `@verify(...)` attribute names a **thirteen-strategy ladder**, which is the main interface to verification:

| Strategy             | Intent                                                       | Cost / guarantee                 |
|----------------------|--------------------------------------------------------------|----------------------------------|
| `runtime`            | Check the predicate at runtime                               | Cheapest, unverified             |
| `static`             | Type-level static checks only                                | Fast, partial                    |
| `fast`               | Prefer speed over completeness                               | Fastest verify, may skip         |
| `formal` / `proof`   | Balanced default; standard SMT discharge                     | Per-obligation seconds           |
| `thorough` / `reliable` | Race multiple techniques in parallel                      | Slower, robust                   |
| `certified`          | Independent cross-verification across foreign tools          | Slowest, strongest               |
| `synthesize`         | Generate a term satisfying the specification                 | Variable                         |
| `complexity_typed`   | Add an honest cost-bound type to the verdict                 | Adds a separate refinement       |
| `coherent`           | Categorical-coherence check on diagrams                      | Specialised; targets §10/§9 of MSFS |
| `coherent_static`    | Coherence at compile time only                               | Specialised, no runtime witness  |
| `coherent_runtime`   | Coherence with runtime witness                               | Specialised, runtime overhead    |

The ladder is **strict ν-monotone**: a strategy succeeding implies every coarser one succeeds. The CI gate `verum audit --ladder-monotonicity` refuses any inversion. `formal`/`proof` and `thorough`/`reliable` are alias spellings — same strategy, two surface keywords — so the grammar admits thirteen tokens but the ladder has eleven distinct rungs.

The same body of code moves up the ladder as trust becomes a requirement. Ship a library at `@verify(runtime)`. When a caller depends on a stronger guarantee, promote to `@verify(formal)` or `@verify(certified)` — no rewrite. If the solver times out, drop a tactic script or fall back to `@verify(runtime)` with a visible apology in the type.

No other language in production use has this shape. Liquid Haskell is all-or-nothing. F\* is all-or-nothing. Dafny is all-or-nothing. Kotlin contracts, TypeScript `asserts` clauses, and Java JML annotations are strictly weaker (runtime-only or unsound). Rust has no SMT integration in the language at all. Coq and Lean are not systems languages.

The closest spiritual neighbour is probably **SPARK/Ada**, which has a gold/silver/bronze hierarchy for verification. But SPARK inherits Ada's surface and toolchain; Verum is the first attempt to put this hierarchy into a modern systems language whose syntax would feel familiar to a Rust, Swift, or Kotlin reader.

## 4. Dependent types and cubical HoTT — in a systems language

Dependent types let a type depend on a value. The canonical example is `Vec<T, n>` — a vector whose length is part of its type, so that `vec_concat : Vec<T, n> → Vec<T, m> → Vec<T, n + m>` makes the shape law a type-level fact. Idris, Agda, Coq, Lean, F\* all live in this space.

Verum includes dependent types, sigma-type refinements of the form `x: Int where x > 0`, cubical path-equality types written `Path<A>(a, b)`, and a cubical normaliser with higher-inductive types and computational univalence. The language's dependent-types, cubical-normaliser, HoTT-primitives, and verification-pipeline phases are all in the shipped release; conformance tests cover every production.

The combination — dependent types **and** `&mut T` **and** systems-language syntax **and** production tooling — is rare. Idris 2 ships a linear-types extension but has no CBGR-style runtime safety; Lean 4 is a proof assistant first and a systems language a distant second; ATS has dependent types and linear types but a notoriously difficult surface.

The useful question is: *when does dependent typing actually earn its cost?* Verum's position is that it does when a library's API has shape invariants that today become runtime assertions or doc-comment folklore — tensor shape checks for ML (`Tensor<T, [B, H, L, D]>`), index bounds for buffer code, protocol state machines, cryptographic nonce uniqueness. For the rest, the refinement-type layer is sufficient.

The cubical layer is where Verum becomes experimental. Computational univalence (Cohen/Coquand/Huber/Mörtberg, 2015) makes equivalence between types a definitional equality. It is powerful — you can transport programs along proofs of type isomorphism — and rarely needed. Verum ships it because the machinery was a prerequisite for the proof system, not because every program will use it.

## 5. Memory without a one-size answer: the three-tier reference model

The memory-safety debate has historically offered two choices. Either you get garbage collection (Go, Java, Haskell, OCaml; cheap to write, unpredictable latency) or you get ownership and lifetimes (Rust, Cyclone; predictable, but one model for everything). Verum picks a third shape: **three tiers of reference, chosen per use site**.

| Tier | Syntax          | Cost      | Guarantee                                  |
|------|-----------------|-----------|--------------------------------------------|
| 0    | `&T`, `&mut T`  | <1 ns*    | Capability-Based Generational References   |
| 1    | `&checked T`    | 0 ns      | Compiler-proven safe (escape analysis)     |
| 2    | `&unsafe T`     | 0 ns      | Caller proves safety; requires `unsafe`    |

\* the original target was an order-of-magnitude headroom (~15 ns); the measured per-dereference cost on current x86_64 / aarch64 (production_targets bench) is **~0.93 ns** — a single load, a single comparison, a predicted branch.

CBGR (Capability-Based Generational References) is the name of the Tier 0 mechanism. The compact reference form — the one you use when the pointee is a sized value — is sixteen bytes: an eight-byte pointer, a four-byte generation counter, and a four-byte word that packs a sixteen-bit epoch next to sixteen bits of capability flags. The extended form, used for slices, trait objects, and interior references, layers an eight-byte metadata word (length for slices, vtable for trait objects), a four-byte offset, and a four-byte reserved field on top of the compact one — thirty-two bytes total. The allocation header carries the current generation; on every dereference the reference's generation is compared against the header's. A free or explicit revoke atomically bumps the header's generation; every subsequent deref through a now-stale reference is rejected before it can touch memory. Capabilities are eight monotonic bits — `CAP_READ`, `CAP_WRITE`, `CAP_EXECUTE`, `CAP_DELEGATE`, `CAP_REVOKE`, `CAP_BORROWED`, `CAP_MUTABLE`, `CAP_NO_ESCAPE` — that can be attenuated, never expanded: an API that hands you a read-only reference cannot itself be used to widen it.

Tier 1 is the escape hatch. The compiler's reference-analysis suite — escape analysis, non-lexical lifetimes, Polonius-style borrow checking, points-to, dominance, type-sensitive and concurrency-sensitive flow, ownership and lifetime inference, plus tier-aware and array-bounds analysis — proves where Tier 0 can be lowered to a raw load. The compiler silently **promotes** `&T` to `&checked T` where this is safe; it never demotes silently — `&unsafe T` is always a source-level opt-in written by the programmer.

Compare this to the prior art:

- **Rust**: one tier. `&T`/`&mut T` go through the borrow checker; if the check fails you rewrite the program. There is no "pay a little at runtime and move on" — the only escape is `unsafe { ... }`.
- **Cyclone, ATS**: lifetimes or linear types, no runtime tier. Strong proofs, steep learning curve.
- **Swift, ObjC**: ARC at runtime. One tier, always.
- **Pony**: six reference capabilities. Closest in spirit to Verum's capability bits, but Pony binds the capability system to an actor model; Verum keeps it orthogonal to concurrency.
- **Fil-C, CheckedC**: retrofit runtime checks onto C. Similar in motivation to CBGR but tied to C's surface.

Verum's claim is not that three tiers are objectively better than one. It's that committing to one tier at the language level forces the programmer into a trade-off that should be made per function. The language should permit both answers; the compiler should make the cheaper answer automatic where it's provably safe.

## 6. One context system for runtime and compile time — and why it isn't an effect system

Dependency injection, dynamic scoping, reader monads, algebraic effects, effect rows, context parameters — every modern language has a different name for the same underlying need: **a function sometimes wants a value from an enclosing scope without passing it as a positional argument**. The range of answers is wide; the algebraic-effects end is the most expressive, and worth examining before we say where Verum lands.

**The algebraic-effects option.** Eff, Koka, Effekt, Frank, and OCaml 5 take the most expressive approach: treat every external interaction (logging, I/O, non-determinism, exceptions, parsing, mutable state) as an *effect operation* that a surrounding *handler* interprets. Handlers can resume the suspended computation with a value, abort it, run it many times (enabling non-deterministic search), or compose with other handlers to stack interpretations. Theoretically this subsumes dependency injection, exception handling, coroutines, generators, transactional state, and logic programming in a single mechanism — a very real achievement.

The cost of that generality is non-trivial. An effect operation can in principle capture its own continuation, which means every call site has to be compiled as if it might perform a stack-switch. Koka's evidence-passing transform reduces this cost by specialising handlers that never resume, but code in the general case still pays for a handler frame on every effectful call. Effekt compiles to capability-passing form. OCaml 5's fibres use a runtime stack-switching primitive. Published micro-benchmarks put the cost of a handled effect op in the tens of nanoseconds in the best case, higher with less specialised handlers. More importantly, **the cost is paid whether or not the program actually uses the resumption/reinterpretation power** — the surface-level function call is forced to go through the effect machinery because, in principle, the handler *might* do something non-trivial.

The empirical observation that drove Verum's design is that in real codebases, the vast majority of what looks like "effectful" code is simple dependency injection: *"give this function a `Logger`, a `Database`, a `Clock` — but let the test suite swap in mocks."* That use case is served by a vtable and task-local storage. It does not require delimited continuations. And for the rare cases where you do want reinterpretation — non-deterministic search, probabilistic programming, parser combinators — Verum offers metaprogramming and tactic languages that keep that power available without forcing every function in the program to pay for it.

So Verum makes a deliberate trade. The context system is **capability-based dependency injection**, not an algebraic-effect system. The syntactic surface is a single `using [...]` clause; the runtime cost is a single task-local lookup on the order of two to thirty nanoseconds depending on whether the context sits in the 256-slot inline array or in the dynamic fallback map, and often zero when the AOT compiler can monomorphise the provider away entirely. You lose the ability to `resume` a suspended operation from a handler. You gain a runtime cost that is independent of how many effectful operations the function performs, a testing story that is just "swap the provider," and a compilation model that every systems programmer already understands.

For reference, here is the landscape the `using [...]` clause has to compete with:

- **Rust**: services are threaded by hand through arguments, or through trait objects, or through ecosystem frameworks (`tokio::spawn_local`, `anyhow`-wrapped services). No language-level story. Async tasks lose their caller's logger unless you pass it explicitly.
- **Haskell**: the `Reader` monad (or `ReaderT` transformer). Elegant, unifies with other effects via `mtl`, but "infectious" in that every function's type now mentions the transformer stack.
- **Scala 3**: `given` / `using` — the closest syntactic ancestor. Resolution is compile-time, so there is no runtime lookup, but also no runtime provider swap without explicit helper machinery.
- **Kotlin**: receivers for some cases and `CoroutineContext` for others — two disjoint mechanisms for the same problem, with different semantics for cancellation and inheritance.
- **Koka, Effekt, Eff, OCaml 5**: algebraic effects, as discussed above. More expressive than Verum's contexts, more expensive per operation, and a steeper learning curve.
- **Verum**: one clause, `using [...]`, with one cost model, one inheritance rule on `spawn`, and one lookup machinery.

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

## 7. Concurrency: structured, contextual, and cancellable

`async fn`, `await`, `spawn`, `nursery { ... }`, `select { ... }`, `for await`. None of these are novel individually; `async`/`await` is from C#, structured concurrency is the Nathaniel Smith/Trio tradition, `nursery` + scoped cancellation came out of that.

Verum's contribution is not a new primitive but the integration:

- A task's `using [...]` context stack is part of its identity. A child task inherits it by default; `spawn using [A, B]` drops everything else. There is no ambient cancellation token passed through magic.
- The `nursery(on_error: cancel_all) { ... }` block owns every task spawned inside it. Leaving the scope waits for every child. No task outlives its scope. This is the Trio invariant, stated in the language.
- `async fn` does not infect callees. A `fn` is `fn`, and `async fn` is different. There is no automatic async-in-async coloring beyond what is visible in the type. (Async colouring remains a real language-design cost, discussed openly — Verum does not claim to solve it, only to make it explicit.)

Under this surface sits a work-stealing per-core executor, a platform-native I/O reactor, and a context stack that is saved at every `.await` and restored before resumption — so that a function suspended for an hour and resumed in a different worker thread still sees the same `using [Database, Logger]` stack it had when it yielded.

## 8. The runtime, in one structure

Most languages treat memory, capabilities, errors, and concurrency as four separate systems that happen to coexist at runtime. The allocator is one library, the dependency-injection framework is another, error handling is structured exceptions, and the scheduler is a third thing entirely. Integration between them is the programmer's problem.

Verum merges all four into a single typed value — the **Execution Environment**, written **θ+** in the sources. Every task, from `fn main()` downwards, carries one. The layout is fixed at 2,560 bytes total (declared verbatim at `core/runtime/env.vr`) — a 64-byte header (task id, parent id, creation timestamp, flags) plus four pillars, all at known offsets:

- **Memory** (128 B) — CBGR safety tier, allocator reference, shared-ownership registry, generation and epoch trackers.
- **Capabilities** (2,048 B) — a 256-slot inline array of typed contexts (compile-time-assigned slots reach constant-time lookup at ~2 ns), plus a map for dynamic ones at ~20 ns.
- **Recovery** (192 B) — supervisor reference, eight inline circuit breakers (64 B each), four inline retry policies (32 B each), `defer` stack.
- **Concurrency** (128 B) — executor handle, I/O driver reference, isolation model, parallelism configuration, task ID.

The arithmetic is `64 + 128 + 2048 + 192 + 128 = 2560`.

Nothing in that list requires a heap allocation on the hot path. An inline circuit breaker is a struct, not a pointer-to-struct. A retry policy is a struct. A context in the fast path is an index into an array. The combined result: task spawn costs ~150 ns; task fork costs ~50–70 ns; a context lookup through a compile-time slot is two nanoseconds.

A programmer never writes `env.` anywhere. The mapping from language features to pillars is automatic: `&T` reads the memory pillar; `using [Logger]` reads the capabilities pillar; `defer { ... }` writes the recovery pillar; `spawn` reads all four and forks them for the child. Four systems, one lookup.

This matters concretely when programs get large. The failure modes that plague long-running services — "the async runtime was spun up after my logger was configured, so logs from request 47 went to the void"; "a panic in a worker thread took down the supervisor that would have restarted it"; "a context set in a spawned task leaked after the task panicked" — disappear when the four concerns share one structure whose lifecycle is the task's lifecycle. A panic in Verum runs the task's defers, restores the `parent_snapshot` of the capability pillar, and forwards to the supervisor — all using a single unwinder pass over the same environment, not four separate cleanup protocols.

The runtime ships in **five profiles**: `full` for servers, `single_thread` for WASM and single-core targets, `no_async` for blocking CLIs, `no_heap` for real-time and safety-critical code, and `embedded` for microcontrollers. A program that requests more than its profile supports is a compile error, not a runtime failure. The same language, the same `ExecutionEnv` type, and the same source files — with different executor, allocator, and I/O-driver implementations chosen at link time.

## 9. Errors as values, supervision as a language feature

Verum has no exceptions in the unwinding sense. It has three mechanisms that compose:

**`Result<T, E>` and `throws E`**. Errors travel as values. The `throws E` clause on a function signature is a type-level declaration that the function may fail with errors of type `E`; the `?` operator propagates. Nothing here is new — the surprise is how far the type system carries it. An `E` that is a union of several specific error shapes can be narrowed at the catch site; a refinement type on an error payload is a type; `@verify(formal)` can prove a function whose signature is `-> Result<T, E>` always returns `Ok` on a given subset of inputs.

**`defer` and `errdefer`**. RAII cleanup without destructors. `defer { cleanup(); }` pushes a handler onto the task's `RecoveryContext.defer_stack`; when control leaves the scope — by return, by `?`-propagation, or by panic — the handler runs. `errdefer { rollback(); }` runs only on the error path. The stack is LIFO; combined with refinement types, this replaces a large class of "we forgot to release the lock in error path 17" bugs.

**Supervision trees**. When a task fails in a way its caller cannot handle locally, Verum's runtime consults the task's supervisor (if any) and applies one of four strategies: `OneForOne` (restart only the failing child), `OneForAll` (restart every sibling), `RestForOne` (restart the failing child and everyone started after it), `SimpleOneForOne` (restart spec-homogeneous children). Each child carries a restart policy — `Permanent`, `Transient`, `Temporary` — and a `RestartIntensity` (max N restarts per M-millisecond window) that, when exceeded, escalates to the parent supervisor.

This is Erlang/OTP's idea, translated to a statically typed systems language. Four supervision strategies, three restart policies, configurable intensity, escalation to a parent supervisor, named children, orderly shutdown with per-child timeouts — the full OTP menu. A web server whose handlers crash does not take down the process; the supervisor restarts the handler, the circuit breaker in the task's `RecoveryContext` trips after five failures, and the log line has a stack trace.

Most systems languages leave this story to frameworks. Verum gives it a type system, a runtime structure, and a set of primitives — because fault tolerance is a language concern if safety is.

## 10. The standard library is Verum

Almost every production programming language has a layer it doesn't own. C's `stdio` is glibc (or musl, or Apple's libSystem). Rust's `std` builds on libc for anything OS-adjacent — threads, file I/O, the memory allocator. Go writes its own runtime but links against glibc on many targets. Swift's `Foundation` is Objective-C.

Verum's standard library is written in Verum. Specifically:

- The allocator — the capability-based generational-reference arena — is in `core/mem/allocator.vr`. No `malloc` dependency.
- Threads, TLS, futexes, atomics — all in `core/sync/` and `core/runtime/thread.vr`, implemented over VBC intrinsics that map to platform syscalls directly. No `pthread`.
- File I/O, networking, time — `core/io/`, `core/net/`, `core/time/`. Platform syscalls through VBC intrinsics, no libc.
- Regex in `core/text/regex.vr`; JSON, base64, hex in `core/encoding/`; the tagged-literal compile-time validators for SQL, URL, UUID, email, CIDR, datetime, and the rest of the `tag#"..."` family in `core/text/tagged_literals.vr`. All `.vr`.
- The concurrency runtime — executor, I/O driver, supervision tree, circuit breakers — all in `core/runtime/` and `core/async/`. No Rust `tokio` dependency, no C `libuv`.

The zero-FFI path works because VBC opcodes `0xF1` (mmap/munmap), `0xF2` (futex, atomics), `0xF4` (io_uring, kqueue, IOCP), and `0xF5` (clock_gettime) are first-class language primitives that the VBC interpreter and the LLVM backend both lower directly. There is no hidden C ABI anywhere in a Verum binary. The consequence for security audits and proof-carrying distribution is large: a `.cog` archive's VBC is a closed artefact that can be validated offline against declared capabilities without the validator needing to trust a distro's libc version.

On macOS the one exception is `libSystem.B.dylib`, Apple's stable ABI entry point — Apple doesn't guarantee syscall ABI stability, so programs linking directly to syscalls would break across macOS versions. `libSystem` is linked, nothing else. No Rust `std`, no glibc, no `libuv`.

The standard library is also where Verum's **framework-axiom packages** live. The cleanest worked example is `core.math.frameworks.owl2_fs` — a sixty-five-axiom verbatim encoding of the W3C OWL 2 Direct Semantics (the standard backing SNOMED-CT, Gene Ontology, DBpedia, FIBO, and most production knowledge graphs). Every operator the OWL 2 Functional-Style Syntax recognises is a named `@framework(owl2_fs, "Shkotin 2019. ...")` axiom that the audit gate `verum audit --framework-axioms --by-lineage owl2_fs` enumerates exactly. A typed-attribute layer (`@owl2_class`, `@owl2_property(domain, range, characteristic)`, `@owl2_subclass_of`, `@owl2_has_key`, ...) adds the OWL 2 vocabulary to ordinary Verum types; `verum import --from owl2-fs` and `verum export --to owl2-fs` give a byte-deterministic round-trip with Pellet/HermiT-compatible `.ofn` files. The OWL 2 layer also ships a cross-framework bridge to higher-topos theory (`core.theory_interop.bridges.owl2_to_htt`): Class becomes a presheaf, ObjectProperty a functor, SubClassOf a monomorphism, HasKey representability — meaning any OWL 2 ontology automatically gets an `(∞, 1)`-topos interpretation. Verum is the first proof assistant with kernel-checked OWL 2 semantics and an automatic translation of ontologies into a categorical language.

## 11. Metaprogramming without a second language

Rust's macros have an exclamation mark. Scheme's have `quasiquote`. Scala 3 has `inline` plus `Quotes`. Each tells the reader "you've stepped out of the main language now." Verum keeps you in one language. The compile-time sub-language **is the same language**, run at an earlier stage.

A `meta fn` is a function. A `quote { ... }` block is an expression of type `TokenStream`. An `@-attribute` invokes a meta function at a specific syntactic site. Splicing (`$expr`, `$[for ...]`) pastes a quoted value back. Staging is explicit (stage 0 = runtime, 1 = first meta, etc.).

The reason this matters for the rest of the language is that every attribute in Verum — `@derive`, `@verify`, `@repr`, `@specialize`, `@logic`, `@cfg`, `@intrinsic`, `@arch_module` (the architecture-as-types annotation that pins each cog's foundation, stratum, and lifecycle in the type system, used end-to-end across the standard library and the MSFS corpus), `@delegate` (declarative proof-body synthesis), `@framework` (the trusted-boundary citation marker), and more than forty others — is uniformly an invocation of something you could write yourself in a `meta fn`. There is no distinction between a language-level compile-time construct and a user-level one. You do not have to petition for a new attribute; you can write one.

Compare:
- Rust: proc-macros are a separate crate type with separate compilation rules and restrictions.
- C++: templates + constexpr are two different languages glued together.
- Lisp: `defmacro` is uniform but untyped.
- Template Haskell: typed but infamously hostile to tooling.
- Scala 3 macros: uniform-ish but dependent on the metaprogramming API.
- Verum: one language, one type system, one set of rules, staged.

## 12. Proof-carrying code and the distribution model

A `cog` is Verum's package — not an archive of source, but an archive of VBC bytecode plus optional proof certificates, type metadata, and signatures. When a downstream consumer takes a dependency at `@verify(certified)`, they can validate the included proofs **offline**, without running the compiler over the source.

The precedent here is the Proof-Carrying Code tradition (Necula, Lee, 1996) and WebAssembly's validation step. Java's bytecode verifier checks type safety; WebAssembly's validator checks more. Verum goes further: the verifier can check refinement predicates up to `@verify(certified)`. Proof terms are exportable to **five active foreign systems with automated re-check** (`verum audit --cross-format` driving `coqc`, `lean`, `agda`, `isabelle build`, `dkcheck` — the `ExportFormat` enum at `crates/verum_kernel/src/cross_format_gate.rs`) plus **Metamath as a static-export target** (`.mm` files for offline verification). The five active re-check backends cover three foundational families — calculus of inductive constructions (Coq, Lean 4), Martin-Löf type theory (Agda), classical higher-order logic (Isabelle), and λΠ-modulo (Dedukti) — so a theorem passing all five is robust across the three families simultaneously.

Inside the validator itself, Verum runs **three independent kernel implementations** in parallel — an LCF-style direct rule-matcher (Algorithm A), a normalisation-by-evaluation kernel (Algorithm B), and a manifest-driven kernel registry (Algorithm C). Every certificate is checked by all three, and the differential gate fails the audit the moment any pair disagrees. This is a structural defence against kernel-implementation bugs that single-kernel systems (Coq, Lean, HOL Light, Isabelle, Agda) cannot match — a substitution bug, a binder-capture mistake, a universe off-by-one is invisible to peer review of the rules but visible the instant a second implementation following orthogonal algorithmic choices disagrees.

The single-command verdict is `verum audit --bundle`: it runs every load-bearing gate (bridge-discharge, kernel-discharged-axioms, apply-graph, cross-format-roundtrip, three-kernel differential, framework footprint, signatures, proof-honesty, ladder monotonicity, …), aggregates them into one `bundle.json` with top-level `l4_load_bearing: bool`, and gives a CI a single yes/no answer about whether the cog is ready to ship.

This is not theatre. Supply-chain attacks on code registries are the main way modern software is compromised; the question "does this package do what it says?" is no longer hypothetical. A cog's certificate cannot rule out every attack, but it raises the lower bound of what a consumer knows about the code they just linked against.

## 13. One IR, two executions

Verum is **VBC-first**. Every program compiles to VBC (Verum Bytecode); VBC is either interpreted directly or lowered through LLVM to native code ahead of time (with MLIR handling `@device(gpu)` kernels). There is no JIT tier and no second path from source to execution.

The consequence is architectural rather than performance-headline-worthy:

- `verum run` starts in milliseconds because it skips native codegen. Every VBC opcode has a direct interpreter handler; the primary plus extended opcode tables together approach the scale of a real machine's instruction set.
- `verum build --release` runs the same front end, the same type checker, the same CBGR analysis, and only differs in the final lowering step.
- Behaviour under the two paths is the same. A test that passes under the interpreter passes under AOT; a panic reproduces on both; a verification obligation discharges once.
- Tooling — LSP, DAP, REPL, Playbook — sits on the same pipeline. There is no "dev mode semantics vs release mode semantics." Python grew that and now spends a significant chunk of its design energy managing the gap.

Languages with this property: BEAM (Erlang/Elixir), the JVM, the CLR, LuaJIT. Languages without it: C, C++, Rust (separate rustdoc/test/compile paths with differences), Swift, Go. Verum is firmly in the VBC-first camp, which is unusual for a systems language targeting native.

## 14. The mathematical foundation: MSFS

Most proof assistants make an unspoken architectural choice: pick one foundation — ZFC for Mizar, calculus of inductive constructions for Coq and Lean, Martin-Löf type theory for Agda, classical higher-order logic for Isabelle — and treat that choice as if it were the foundation. The choice is a historical artefact (whichever option the original implementers preferred), and the resulting tool inherits both its strengths and its blind spots. A theorem proved in Coq does not transfer to Lean without manual translation; a result that depends on classical excluded middle does not survive the move to a constructive foundation.

Verum is built on a different mathematical premise. The MSFS preprint (Sereda 2026, *The Moduli Space of Formal Systems*) studies all formal foundations of mathematics simultaneously — as a single classifying 2-stack `𝔐` whose points are Morita-equivalence classes of foundations satisfying conditions R1–R5. The space stratifies into four levels of growing rigidity, the boundary level (an absolute foundation that classifies everything) is provably empty (the Absolute Foundation No-Go Theorem, AFN-T), and the interior is structurally plural: `(∞, 1)`-topos theory, Univalent Foundations, and cohesive ∞-topoi are pairwise non-equivalent partial classifiers. Every classical no-go result — Cantor, Russell, Gödel, Tarski, Lawvere, Ernst — is a specialisation of one structural law, holding uniformly along five orthogonal axes.

This is not background reading. Four load-bearing pieces of the language sit directly on MSFS:

- **The MSFS coordinate `(Framework, ν, τ)`** — every theorem in Verum is automatically projected to its location in `𝔐`: which foundations it depends on, at what meta-classification depth it lives, whether its proof is intensional or extensional. The coordinate is computed at audit time and cross-checked for internal consistency by `verum audit --coord-consistency`. See [MSFS Coordinate](/docs/verification/msfs-coord).
- **The dual standard library** — MSFS Theorem 10.4 (AC/OC Morita duality) is realised as two parallel layers, `core.math.*` (object-centric: what *exists*) and `core.action.*` (dependency-centric: what *is done*), connected by an explicit α ⊣ ε adjunction whose unit is enforced by the kernel and whose counit is witnessed up to gauge canonicalisation. What a program *knows* and what it *does* are two equivalent descriptions of the same object, and that equivalence is mechanical, not declarative. See [Actic — OC/DC Dual Stdlib](/docs/verification/actic-dual).
- **The reflection tower as a finite four-stage structure** — Gödel's second incompleteness theorem says no consistent system strong enough for arithmetic can prove its own consistency, which naively suggests an unbounded tower of meta-theories. MSFS Theorems 9.6 (meta-classification stabilises) + 8.2 (reflective tower bounded by one inaccessible cardinal) + 5.1 (AFN-T) collapse that tower into four stages: Base / Stable / Bounded / AbsoluteEmpty. Verum implements the short tower because the long one is provably the same theory. See [Reflection Tower](/docs/verification/reflection-tower).
- **The trusted base is exactly ZFC + 2 inaccessible cardinals + the Verum kernel** — the same base as MSFS itself. The kernel's seven inference rules (`K-Refine`, `K-Univ`, `K-Pos`, `K-Norm`, `K-FwAx`, `K-Adj-Unit`, `K-Adj-Counit`) decompose into ZFC + 2-inacc; AFN-T proves there is no larger base to aim for; the MSFS self-containment theorem proves the base cannot be made smaller without losing expressiveness. Both directions of the trust boundary are mathematically pinned, not merely engineered. See [Trusted Kernel](/docs/verification/trusted-kernel).

The companion artefact — every theorem of MSFS with a machine-checked proof in Verum, exported and re-checkable in Coq, Lean 4, Agda, Dedukti, and Metamath — lives at [github.com/gst-st/msfs](https://github.com/gst-st/msfs). It is also the largest proof corpus written in Verum, and the one whose architecture the rest of the standard library follows.

The practical consequence is that Verum is not committed to a foundation in the way other proof assistants are. Each `@framework(name, "citation")` marker is a point in `𝔐`; each cross-format export is a translation along an adjunction between points; each cog's trusted base is a sub-region of `𝔐` that the audit makes explicit. A user who needs classical excluded middle invokes `@framework(classical_lem, "...")` and the audit surfaces it; a user who needs univalence invokes `@framework(hott, "...")` and gets a different region; theorems that mention both surfaces force a foreground discussion of compatibility instead of a silent miscompilation. This is what it means for a system's architecture to be subordinate to a proven mathematical law rather than to historical convention.

## 15. The LLM-era angle — why this language matters now

Here is where we return to the question at the top.

For roughly forty years a programming language's job was to help a human write software. Documentation, naming conventions, linters, tests, and type systems were all optimised for a specific reader: another human, probably tired, probably catching up on context. The human was the bottleneck, so the language should help the human.

That bottleneck has moved. In 2026, a growing percentage of production code is not written by the human holding the keyboard but by a language model they are prompting. The human reads, approves, and merges. Sometimes they don't read — and the tempo of work depends on them not having to, often.

This shift changes what a programming language is actually for in three ways, and each one is what Verum was built around:

**First, the spec moves from docstrings to types.** An LLM that reads `/// Returns the first index where xs[i] == key; returns -1 if missing.` treats that English sentence as a suggestion. An LLM that reads `where ensures result.is_some() => xs[result.unwrap()] == *key` treats the refinement as a verifier it will be graded against. Types-as-specification is not new — Hoare's preconditions date to 1969 — but making it ergonomic enough that every function carries one was always the blocker. Semantic honesty plus gradual verification is how Verum attempts to break that blocker.

**Second, the cost of hidden behaviour is asymmetric.** When a human writes a function, they carry the context in their head: *this runs inside a tokio runtime, so a spawn here is fine; this module has an implicit logger, so `log::info!` works*. An LLM that has read ten million Rust projects has statistical knowledge of those conventions but does not carry *this* project's context. If the language lies — an ambient global, a hidden allocation, a coercion under a rarely-triggered flag — the LLM's training distribution will guess wrong, confidently. `using [...]` is boring when you write it by hand. It's load-bearing when a model writes it for you.

**Third, verification becomes the social contract.** Before, an open-source library's reputation was built on its maintainer's judgment. That is still true, but many eyes now include non-human ones, and the fraction of code that is machine-transcribed from another machine's output will keep rising. The honest answer is not "trust the AI" or "never trust the AI." It is "make the evidence machine-checkable." Proof-carrying cogs, `@verify(certified)`, tactic scripts, exportable proof terms to Lean and Coq — these are instruments for a world where not every reader of your code is a person, and not every writer is either.

None of this is to say Verum "solves the LLM problem." It is to say that the language-design decisions Verum has been making for the last three years — explicit context, refinement types, gradual verification, semantic honesty, a single stable IR, proof-carrying distribution — happen to line up with what the current and next few years of software will need. They would have been defensible features in 2021. They are close to necessary features in 2026.

## 16. Trade-offs Verum actually makes

A blog post about a language that does not list its costs is a marketing document. These are the real costs.

- **Compile times.** Refinement-type SMT discharge costs real seconds per function in hard cases. The incremental compilation cache, per-obligation fingerprinting, and the `@verify(fast)` strategy exist because this is a real tax. It is not gone; it is amortised.
- **Syntax weight.** `using [...]`, `where ensures ...`, `{ self > 0 }` are all more characters than their absent Rust equivalents. The tradeoff for explicitness is, always, verbosity. Verum bets the verbosity is worth it.
- **Learning curve.** The refinement-type + dependent-type + cubical stack is academically heavy. You do not need any of it to ship a CLI — `@verify(runtime)` on plain `Int` and `Text` is a complete program — but the full surface is larger than Go's.
- **Ecosystem age.** Verum's registry is new; the package count is measured in dozens, not tens of thousands. Using Verum for a problem that is two `cargo add` calls away in Rust today is a worse trade than Rust. That changes only with time and adoption.
- **Async colouring.** `async fn` is a different type from `fn`. This is a language-design cost Koka and Scala have partially avoided with effect systems; Verum does not. The choice was deliberate — an explicit `async` colour is more honest than an implicit one — but it is a real cost.
- **LLVM dependency.** AOT native builds require LLVM 21 (and MLIR for GPU targets). That is a several-hundred-megabyte build dependency. Distributions that cannot tolerate it can ship the interpreter only, but lose native speed.

None of these are show-stoppers. All of them deserve to be named.

## 17. Closing

The shortest honest description of Verum is this: it takes refinement types from Liquid Haskell, a thirteen-rung gradual-verification ladder generalising SPARK's gold/silver/bronze, a three-tier memory model descended from CBGR and Pony's capability ideas, a capability-based context system in the place where other languages grew algebraic effects, a dependent-type layer with cubical HoTT support, a three-kernel differential-tested trusted base that no other production proof assistant runs, a single bytecode IR that runs both the interpreter and the AOT backend, a unified per-task execution environment that merges memory, capabilities, errors, and concurrency into one structure, OTP-style supervision in the language runtime, a standard library that is itself written in Verum with no libc / `pthread` / Rust-std dependency, the first proof assistant with kernel-checked OWL 2 Direct Semantics, and a mathematical foundation — the MSFS classification of all formal foundations — that pins both ends of the trusted base to a proven law rather than to historical convention. It wires all of that together under one rule — semantic honesty — and refuses to include features that break the rule.

No single piece of this is new. The combination is — in a production systems language whose surface reads naturally to a Rust or Swift programmer, at a point when much of the software travelling to production was first written by a language model.

Whether the bet is right will be settled by practice, not by essays. The language is open, documented end-to-end, and instrumented. If the questions raised above sound like yours, the easiest next thing is to read the [language tour](/docs/getting-started/tour), pick one example, and try to break it. We built the language expecting to be argued with.

— The Verum team
