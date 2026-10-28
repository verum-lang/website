---
slug: verum-examined
title: "Verum, examined: making program intent checkable"
authors: [verum-team]
tags: [design, philosophy, verification, llm, types, memory]
---

AI agents make it easier to produce code, tests, and explanations together. They also make it easier for the same misunderstanding to appear in all three. A convincing explanation and a green test suite can agree with an implementation while disagreeing with the requirement.

Verum is a language platform being developed around a practical response: put more of a program's intent into forms that tools can check, and make the strength of each result explicit. Systems programming, contracts, theorem declarations, architectural analysis, and proof replay belong in a connected workflow.

That is the direction of the platform. It is not a claim that every Verum program, standard-library operation, backend, or mathematical corpus is already verified. Understanding Verum means understanding both its mechanisms and the boundaries between them.

<!-- truncate -->

## A language surface that exposes intent

Verum uses records, variants, protocols, functions, modules, and explicit dependencies. A record is introduced with `type … is`, a protocol implementation with `implement`, and a module dependency with `mount`. Compile-time attributes use `@`; there is no Rust-style macro invocation suffix.

The [grammar](https://github.com/verum-lang/verum/blob/main/grammar/verum.ebnf) is the syntax reference. It is more precise than the slogan that Verum has only three keywords: `let`, `fn`, and `is` are core vocabulary, but additional control-flow and other words are reserved in particular positions. A familiar spelling from another language is not automatically valid Verum.

The design principle is semantic honesty. A name should explain a concept; an annotation should create a traceable obligation; a diagnostic should say what failed. This is a standard against which the implementation must be tested, not a guarantee obtained by naming the principle.

## Types and contracts make requirements inspectable

A refinement adds a predicate to a type. For example, a port value can carry its permitted range:

```verum
type Port is Int { 1 <= self && self <= 65535 };

fn preserve_port(port: Port) -> Port {
    port
}
```

The useful step is moving the range from scattered comments into an API. Whether a particular obligation is discharged depends on the verification mode, the supported expression fragment, and the proof path involved. An arbitrary predicate over a collection, foreign call, or recursive function does not become decidable because it appears inside braces.

Verum also has `requires` and `ensures` contracts, theorem declarations, and tactics such as `omega`, `simp`, and `auto`. These provide different ways to express and discharge obligations. The names of tactics describe a user interface; they do not imply identical algorithms or completeness to similarly named tactics in another prover. See [refinement reflection](/docs/verification/refinement-reflection) for the supported connection between function bodies and logical expressions.

For systems code, the arithmetic interpretation matters. A mathematical-integer theorem does not automatically establish the behavior of a fixed-width machine operation. Overflow, signedness, truncation, and the selected backend must appear in the relevant semantics. Likewise, an assertion about a heap needs ownership and layout semantics, not only an integer address.

## Verification results have different meanings

Verum supports verification strategies including `runtime`, `static`, `formal`, `thorough`, and `certified`. The [verification pipeline](/docs/architecture/verification-pipeline) describes their implementation and supported routes. Strategy selection is a request for a kind of checking; a stronger-sounding name is not evidence that every requested obligation was handled.

Three distinctions matter in practice:

| Result | What it establishes | What still needs evidence |
|---|---|---|
| A source file parses and type-checks | The accepted program satisfies the checks that ran | Its intended behavior, omitted contracts, and execution paths |
| A tactic discharges a proposition | The declared goal follows through that proof-search path and its assumptions | A replayable certificate and correspondence to the intended requirement |
| A kernel accepts a proof artifact | The encoded proposition follows under that kernel and axiom boundary | That the proposition models the implementation and the deployed artifact |

The compiler itself makes this distinction: [`ProofSummary`](https://github.com/verum-lang/verum/blob/main/crates/verum_compiler/src/phases/proof_verification.rs) is verification metadata, not a replayable kernel certificate. A failed written theorem proof is a compilation error on the SMT-enabled proof path; an admitted proof carries an incomplete-proof warning. Those outcomes must remain distinguishable in release policy.

External replay provides another useful boundary. Verum's Lean models include exact finite probability laws, state transitions, ownership relationships, and injective encodings. Some have adapters that compare frozen native exports with the model. That is concrete verification work, but neither an export format nor a successful finite replay proves arbitrary source-to-machine-code correctness. See [three-kernel differential checking](/docs/architecture/three-kernel-differential) for a related distinction: independent implementations can expose disagreement, while agreement alone does not prove that a shared specification is right.

## Memory safety has an explicit cost model

Verum's reference vocabulary separates three choices:

| Reference form | Intended discipline |
|---|---|
| `&T`, `&mut T` | Capability-based generational references, with runtime validation where required |
| `&checked T` | A reference whose required safety conditions are established by compiler analysis |
| `&unsafe T` | Explicit responsibility for safety outside those automatic guarantees |

Generational identities help detect stale references; capabilities describe permitted operations. Compiler analysis can remove checks when the necessary conditions are established. This is an engineering trade-off between static reasoning, runtime checking, and explicit unsafe boundaries.

It is not meaningful to assign one universal nanosecond cost to a reference form. The result depends on target, optimization, access pattern, instrumentation, and which checks actually remain. Nor does the presence of a CBGR type prove that every pointer-producing intrinsic, foreign call, or AOT lowering preserves its representation. The [memory-safety reference](/docs/language/cbgr) and backend-specific tests are the appropriate places to assess a concrete use.

## Dependencies, computation, and architecture answer different questions

A `using [...]` clause describes context providers a function needs. Function properties describe aspects of its computation. Architectural capabilities describe permitted operations and boundaries. These are related, but one cannot substitute for another.

For example, injecting a database provider says where an operation obtains a dependency. It does not establish authorization, transaction atomicity, or safe cancellation. An architectural declaration can make those obligations visible; a contract or transition model must describe the relevant behavior; the implementation and its failure paths must satisfy it.

The language and standard library contain concurrency, cancellation, supervision, and execution-environment machinery. Their existence is useful, but a declaration or runtime data structure is not a proof of fault tolerance. A service still needs validation of scheduling, resource exhaustion, partial I/O, shutdown, and recovery on its chosen execution path. See [architecture as types](/blog/architecture-as-types) for how declarations and evidence should interact.

## One compilation architecture, separately validated executions

Verum is VBC-first: the main compilation pipeline produces Verum Bytecode, which is interpreted or lowered through the native backend. Sharing the front end reduces duplicated language machinery. It does not make the interpreter and AOT implementation equivalent by construction.

Each operation still needs consistent representation, dispatch, failure behavior, and platform interaction. Differential tests, intrinsic-contract checks, and explicit refusals for unsupported operations help detect divergence. A successful interpreter test is evidence about that execution; a native claim needs its own execution or a justified correspondence argument. The [compilation pipeline](/docs/architecture/compilation-pipeline) explains this division.

The standard library is largely written in Verum and calls into runtime intrinsics and platform interfaces. The strict **no-libc requirement applies to generated AOT artifacts**, subject to the documented macOS system-ABI exception. The host CLI and interpreter may use baseline OS libraries and have a separate clean-system portability requirement. The [no-libc reference](/docs/architecture/no-libc-architecture) records implementation gaps and artifact checks; a source-level policy is not a substitute for inspecting a produced binary.

## Packages and foundations need an auditable trust boundary

A cog is Verum's package unit. Packaging code together with type metadata, provenance, signatures, and proof artifacts is part of the platform's direction. These pieces establish different properties: a signature can authenticate an artifact, while a proof concerns a proposition. Neither establishes the other.

Likewise, a framework annotation records a logical dependency; it does not prove the cited mathematics. A proof corpus must expose its assumptions, checked theorem statements, unresolved obligations, and replay results. Supporting dependent or cubical constructs, architectural foundation profiles, or a foreign export target does not certify an entire mathematical framework or every translation between foundations.

The relevant question for a consumer is specific: which statement was checked, under which axioms, by which checker, against which artifact? Verum's [proof-corpus guidance](/docs/verification/proof-corpora) and [trusted-kernel discussion](/docs/verification/trusted-kernel) should be read with that question in mind.

## The platform we are building

The aim is to let a developer state an invariant once and reuse it across implementation, testing, proof, optimization, and distribution. AI agents can then propose code and proof candidates while mechanically checked obligations constrain what counts as completion.

Making this productive requires more than adding theorem syntax. It requires useful libraries of contracts, exact models of effects on program state, reliable diagnostics, affordable incremental checking, and correspondence between proofs and executed code. Those are active implementation responsibilities.

Verum should earn trust by making its evidence inspectable and its missing guarantees visible. The [language tour](/docs/getting-started/tour) introduces the surface; [why a green build is insufficient when agents write the tests](/blog/ai-agents-tests-and-proofs) explains the verification workflow this platform is working toward.
