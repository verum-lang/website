---
sidebar_position: 1
title: Engineering Principles
description: The engineering principles that shape every decision in Verum — pay-for-what-you-use, semantic honesty, three-axis closure, no hidden runtime, and the principles that make a single source span microcontroller firmware to verified theorem corpora.
---

# Engineering Principles

Verum is a maximally expressive, multi-purpose systems language.
Its principles are stated as **constraints** — engineering laws
that draw a line and have a concrete consequence in the grammar,
the type system, the memory model, the runtime, the toolchain.
None of them is a stylistic preference. Each one is what makes
the language scale across embedded firmware, application code,
correctness engineering, and pure mathematics — all from the
same source.

The principles compose. Removing any one of them changes the
language; weakening any one of them shifts the audience. They
are stated here in the order in which a reader meets them while
writing code.

## 1. Pay only for what you use

The defining cost discipline of a systems language is *what does
this construct cost when I do not use it?* Verum's answer is
**zero, by construction, at every layer**.

- A function with no annotations runs the same machine code that
  the equivalent C / Rust / Zig function would run. There is no
  hidden runtime check, no shadow allocation, no implicit
  exception machinery, no garbage collector pause.
- A refinement type compiles to a compile-time obligation and
  erases at runtime. The runtime sees the bare underlying type.
- A capability declaration compiles to type-checker discipline
  and erases at runtime. The binary carries no architectural
  metadata unless you explicitly opt in.
- A `using [Logger]` clause resolves through compile-time DI
  type-checking; the runtime cost is one provider lookup, on
  the order of nanoseconds.
- A proof certificate is a compile-time artefact; the
  runtime never sees it. Promoting from `@verify(formal)` to
  `@verify(certified)` changes the build's cost, not the
  binary's.

This discipline is **load-bearing for embedded use**. A
microcontroller binary built with Verum carries no runtime that
the developer did not write. The `@no_std` profile strips even
the standard library; what remains is what the developer
imported. The same discipline scales upward: a long-running
application built at `@verify(formal)` produces a binary
indistinguishable in size and shape from the same application
built at `@verify(runtime)` — the verification work happened at
build time and erased.

**Anti-pattern:** Languages that smuggle runtime cost into a
"safe by default" feature. A "free" feature whose cost shows up
when the binary runs is not free. Verum rejects features that
cannot be shown to cost zero unless explicitly invoked.

**Consequence:** Verum's three reference tiers, the verification
ladder, the architecture-as-types annotation surface, and the
context system are all explicitly designed so that the unused
levels cost nothing. The compiler cannot accept a feature whose
runtime cost cannot be controlled per use site.

## 2. Semantic honesty

Type names describe **meaning**, not **implementation**. A list
is a `List`. Text is `Text`. A map is a `Map`. A heap-allocated
value is a `Heap`. A reference-counted shared value is a
`Shared`. None of these names leaks the implementation
strategy.

The discipline runs deep:

- `List<T>` is a list — the implementation may be a contiguous
  buffer, a chunked rope, or a B-tree, depending on the
  inserted optimisation passes. User code never depends on the
  representation.
- `Map<K, V>` is a map — hash table, B-tree, robin-hood, all
  hidden behind the same surface.
- `Heap<T>` is "this value lives on the heap". If the optimiser
  can prove the heap allocation is unnecessary, it elides it.
- `Shared<T>` is "this value has shared ownership". The
  reference-counting mechanics are not part of the user's
  vocabulary.

**Anti-pattern:** `Vec` (vector — a specific implementation
choice). `String` (a specific UTF-8 byte buffer). `HashMap` (a
specific hash strategy). `Box` (a specific name for
heap-allocation that does not generalise to embedded
single-allocation patterns or arena-based contexts).

**Consequence:** Verum's standard library is *swappable* by
implementation. A target where heap allocation is forbidden can
provide an arena-backed `List` and the user's code does not
change. A target where hash maps are too expensive can provide
a B-tree-backed `Map` without source changes. A user who imports
`core.collections.{List, Map, Text}` writes code that runs on
any target the standard library supports.

## 3. Three-axis closure — C / V / E

Every claim worth making is worth asking three questions about:

- **Constructive (C) — is there a witness?** Can someone hand
  you an instance of the thing being claimed (a value, a proof
  term, an inhabitant of the type)?
- **Verifiable (V) — is there a check?** Is there an effective
  procedure that, given a candidate witness, decides whether it
  satisfies the claim?
- **Executable (E) — does it run?** Does the witness reduce to
  runnable code on a target machine?

The three axes are *independent*. Different combinations
produce qualitatively different statuses. Verum's lifecycle
taxonomy uses the three axes to assign every artefact in the
codebase to one of seven canonical statuses — Theorem,
Definition, Conditional, Postulate, Hypothesis, Interpretation,
Retracted. The status is part of the artefact's externally
observable interface, surfaced through audit gates and the
type system, never demoted to a comment.

This is the **operational lifecycle** of every claim:

```text
Hypothesis → Postulate / Conditional → Theorem
   [H]          [P]   /   [C]            [T]
```

A `[T]` Theorem cannot rest on a `[H]` Hypothesis. The compiler
walks the citation graph and rejects regressions. Promoting a
status is an explicit engineering action.

The three-axis discipline is *not* Verum-specific. It is a
universal pattern that organises:

- Mathematics (a constructive proof is C-positive; a
  non-constructive existence proof is C-absent).
- Software engineering (a TODO comment is C-absent; a property
  test passing 1000 inputs is C-partial / V-partial /
  E-positive).
- Documentation (a citation to an external source is
  C-external / V-external / E-trivial).
- Architecture (a hand-drawn diagram is C-partial / V-absent /
  E-absent; a typed `@arch_module(...)` annotation is
  C-positive / V-positive / E-trivial).

Verum's contribution is the *mechanisation* of the discipline:
every artefact's C/V/E status is computed by the compiler,
surfaced by the tooling, and load-bearing in the audit gates.
**See [Architecture-as-Types → CVE
overview](/docs/architecture-types/cve).**

## 4. Verification is a spectrum

A language that demands proofs everywhere prices itself out of
the systems-engineering space. A language that admits proofs
nowhere prices itself out of the safety-critical space. Verum
admits both ends and every level between, indexed by a strictly
monotone ordinal so the strength of each tier is comparable.

The verification ladder runs from runtime assertions through
static type-level checks, single-solver SMT, portfolio SMT,
user-supplied tactics with kernel re-check, mandatory
specifications (decreases / invariant / frame), cross-validated
multi-solver agreement, certificate export with kernel re-check,
operational coherence under bidirectional bridges, and
synthesis. Each tier is **at least as strong** as every weaker
tier — promoting a function never weakens a guarantee.

The discipline is per function, per module, or per project. A
prototype starts at `runtime`. A merged feature climbs to
`static` or `formal`. A safety-critical function climbs to
`certified`. A theorem central to the project's correctness
story climbs to `proof` or `coherent`. Each promotion is one
attribute change; the function body does not move.

**Anti-pattern:** A "verified" or "unverified" binary
distinction. A function that "doesn't compile in the verified
mode" because verification is the language's central use case.
Verum has no verified mode — verification is opt-in per call
site, and the unannotated default is what most users live on.

**Consequence:** Verum is comfortable as the implementation
language for a microcontroller bootloader (zero verification),
a network handler (refinement types on the parser),
cryptographic primitives (`@verify(formal)` on the
constant-time properties), a payment ledger
(`@verify(certified)` on the double-entry invariant), and a
research theorem corpus (`@verify(proof)` across the whole
module) — *in the same project*. **See [Verification →
gradual verification](/docs/verification/gradual-verification).**

## 5. No hidden state, no hidden effects

Every dependency is **explicit**. A function that needs a
`Database` declares `using [Database]`. A function that needs a
`Logger` declares `using [Logger]`. A function that needs the
current time declares `using [Clock]`. Callers must supply
matching providers via a `provide { ... }` block; nothing is
injected implicitly.

The same `using [...]` grammar drives **runtime DI** and
**compile-time meta**:

- Runtime: `Database`, `Logger`, `Clock`, `FileSystem`, `Random`
  — providers wired at the application's root.
- Compile time: `TypeInfo`, `AstAccess`, `CodeSearch`, `Schema`,
  `DepGraph`, `Hygiene` — providers wired at the metaprogramming
  call site.

One lookup discipline, one cost model. The runtime cost is a
provider lookup (nanoseconds); the compile-time cost is zero.
There are no thread-locals, no ambient state, no global
singletons, no environment variables read implicitly by the
standard library.

**Anti-pattern:** Hidden globals (an "if `LOG_LEVEL` is set..."
check inside a logger), monkey-patched stdlib (a test that
silently rewrites the system clock), implicit exceptions
(throwing changes the function's signature without changing the
declaration). Verum rejects each of these — every effect a
function has is part of its type, every dependency is part of
its signature.

**Consequence:** Refactoring is mechanical. Moving a function to
a different context is a question of which providers the new
context exposes; the function's signature tells you whether the
move is admissible. Testing is mechanical: the test wires up
the providers it wants. There is no "test-mode" stdlib — every
target builds with the same standard library.

## 6. Architecture is a type

Architectural intent — *what may this module do, what does it
depend on, what invariants does it preserve, what stage of
maturity is it at, what meta-theoretic foundation does it rest
on* — is a typed annotation the compiler enforces. Eight
primitives (Capability, Boundary, Composition, Lifecycle,
Foundation, Tier, Stratum, Shape) cover the vocabulary; an
`@arch_module(...)` annotation carries a cog's full
architectural type.

Capability escalation, boundary violation, lifecycle regression,
foundation drift, tier mixing, register mixing, composition
associativity break, transitive citation regression — each is a
stable diagnostic emitted at build time, with a stable error
code that survives prose rewrites. The diagnostic is structured
output that downstream tooling can consume.

This is the principle that makes Verum scale to **federated
systems** without losing the discipline that makes it work on a
single embedded chip. A federation of services, each with its
own boundary invariants and capability surface, is an
architectural type the compiler validates project-wide. A drift
in any service's annotation surfaces as a diagnostic, not as a
production incident.

**Anti-pattern:** Architecture-by-diagram. Diagrams drift from
code; code is the source of truth, and diagrams document a
historical state. Verum collapses the diagram-vs-code gap by
making the diagram a typed annotation: there is one source of
truth, and it is checked.

**Consequence:** Code review of an architectural change becomes
a review of a single annotation diff. The compiler does the
graph walk. The audit chronicle records the change. **See
[Architecture-as-Types](/docs/architecture-types).**

## 7. The trusted base is small enough to read in one sitting

Verum's correctness story is *not* "the SMT solver said so,
trust us". The trusted base is **explicit, layered, and
auditable**:

- A hand-readable Verum-source bootstrap kernel — minimal
  inference rules, organised as one file per rule, plus the
  supporting context, judgment, and soundness scaffolding. A
  reviewer can read it end-to-end without external dependencies.
- A minimal trusted-base proof checker, performing direct
  rule-matching with explicit substitution. A reviewer can read
  this end-to-end too.
- An audit registry decomposing each kernel rule's
  meta-theoretic footprint — which set-theoretic axioms it
  rests on, which Grothendieck universes it requires, what
  external citations it admits.

A second algorithmic kernel — normalisation-by-evaluation,
structurally distinct from the first — runs in parallel.
Differential testing fails the audit the moment the two
disagree on any certificate. Mutation fuzzing extends the
differential check to arbitrarily-shaped certificates the
canonical roster does not cover. A synthetic always-accept
liveness pin keeps the differential check non-vacuous.

Every external citation is registered with a structured triple
(framework name, lemma path, citation string). Citing an
unregistered axiom is a compile error. The trust boundary is
*enumerable*: `verum audit --framework-axioms` lists every
external assumption the project depends on.

**Anti-pattern:** A trusted base too large to read in one
sitting. A "we trust LLVM" boundary that is documented but not
enumerated. A proof system whose cited axioms become invisible
because they are part of the standard library prelude. Verum
rejects each — the trust boundary is what reviewers can audit,
and audit requires enumeration.

**Consequence:** Adding a new framework axiom is a load-bearing
engineering decision visible in the audit chronicle. Removing a
cited axiom is a measurable trust-base reduction. Promoting an
admitted-with-IOU rule to discharged-by-framework is a
concrete, attributable improvement. **See [Verification →
trusted kernel](/docs/verification/trusted-kernel).**

## 8. Single source, no fork between dialects

A Verum project's source compiles for the interpreter, the AOT
target, the GPU target, the embedded target, the verification
audit, the proof export, and the program extraction — all from
the same `.vr` files. There is no "research dialect" vs
"production dialect", no "checked mode" vs "unchecked mode", no
"strict mode" that disables half the language.

Profiles narrow what the toolchain emits (an embedded profile
strips the heap-allocator dependency; a `@no_std` profile
strips the standard library), but they do not change the source
language. A function that works in the desktop profile compiles
identically in the embedded profile if it does not depend on a
profile-restricted feature.

The same discipline applies to verification levels:
`@verify(runtime)` and `@verify(certified)` are two attribute
values; the body of the function is identical. Promoting a
verification level is a pure attribute change, not a rewrite.

**Anti-pattern:** Languages that fork into incompatible dialects
across the verification or platform-target axis. Languages that
require a separate "specification language" alongside the
implementation language. Languages where the verified subset is
strictly smaller than the implementation language and forces
re-implementation when a function gets verified. Verum rejects
each.

**Consequence:** Refactoring a function from "shipped without
verification" to "shipped with formal verification" is a
verification-level promotion plus possibly a refinement-type
declaration. The function body does not move. The same applies
in reverse — demoting a function (a research prototype crumbling
back into a quick experiment) is a single attribute change.

## 9. Audit-friendly by construction

Every claim Verum makes is **mechanically observable**. The
audit gates emit structured JSON — schema-versioned, pinned to
a kernel version, suitable for archival. Diff two reports across
releases to see exactly what changed in the project's
trust posture.

The audit categories are organised in bands — kernel-soundness,
architectural typing, framework citations, articulation hygiene,
cross-format proof export, mechanisation roadmaps, tooling, and
a single bundle aggregator that produces a project-wide
load-bearing verdict. A green bundle is a structured commitment
that *every* listed claim is mechanically verified at the time
of the audit.

**Anti-pattern:** A "trust me, it's verified" claim that no
structured artefact backs. A status badge whose meaning depends
on which CI run it came from. A verification mode whose absence
of warnings is interpreted as success. Verum rejects each — a
green audit is a structured artefact with a stable schema and a
diff-able shape.

**Consequence:** A project's verification posture is a
maintainable artefact. Onboarding a new contributor includes
reading the audit chronicle, not interrogating senior engineers
about the project's "real" trust boundary. Compliance audits
become an automated compare-the-chronicle operation. **See
[Architecture-as-Types → audit
protocol](/docs/architecture-types/audit-protocol).**

## 10. Radical expressiveness where it earns its keep

The principles above are constraints. The flip side — what Verum
*does* admit — is built around the discipline of "expressiveness
where it earns its keep". The language admits:

- **Refinement types** in the type system, not as a separate
  layer. `Int { self > 0 }` is a type; functions over it work
  through normal type inference; the SMT layer discharges the
  predicates at use sites; the runtime never sees the
  refinement.
- **Dependent types** with Σ, Π, identity types, and cubical
  paths. A `Vec<T, n: Int>` whose length is a type-level
  integer composes with normal generic-function call sites. A
  path `Path<A>(a, b)` between two values is a first-class
  proof of their equality.
- **Linear and affine types** for resources that must be used
  exactly once or at most once. The `@quantity(0|1|omega)`
  attribute on a binding selects the substructural quantity
  without leaving the standard type-checking discipline.
- **Higher-rank polymorphism** (`fn<R>(...)`) for
  transducer-style abstractions and CPS-transformed code.
- **Row polymorphism** for structurally-typed records and the
  open-ended message types that distributed systems frameworks
  use.
- **Quotient inductive types and HITs** for reasoning about
  equivalence classes, free monads, and higher-categorical
  structures.
- **Tactic DSL with metaprogramming** for proofs the SMT layer
  cannot close. Tactics produce kernel terms; the kernel checks
  them; nothing escapes the trust boundary.
- **Compile-time evaluation** through the same context system
  the runtime uses. Metaprogramming has access to type
  information, AST access, code search, schema reflection.
- **GPU lowering** through MLIR for tensor-shaped work that
  needs parallelism beyond what the CPU's SIMD layer
  provides.

Each feature is gated by the same discipline as the rest of the
language: pay only for what you use, no hidden state, no hidden
runtime, machinery erases unless you explicitly request it. A
project that does not need cubical paths sees no cubical-path
machinery in its compiled binary.

## How the principles compose

The principles compose into a single coherent discipline:

- **Pay-for-what-you-use** + **semantic honesty** → a standard
  library that is implementation-swappable per target without
  changing call sites.
- **Three-axis closure** + **architecture is a type** → an
  architectural lifecycle taxonomy where every cog's status is
  visible to the compiler and surfaced in audit reports.
- **Verification is a spectrum** + **single source no
  dialects** → smooth migration from prototype to verified code
  without rewriting bodies.
- **No hidden state** + **trusted base small enough to read** →
  a trust boundary that is enumerable and checkable end-to-end.
- **Audit-friendly** + **architecture is a type** → diff-able
  audit chronicles where every architectural change leaves a
  trace.
- **Pay-for-what-you-use** + **radical expressiveness** → a
  language that admits dependent types, cubical paths, linear
  resources, and metaprogramming without imposing the cost on
  the simple use case.

Removing any of the ten changes the language. Weakening any of
the ten shifts the audience. The combination is what makes
Verum a single source language across embedded firmware,
application code, correctness engineering, and pure
mathematics.

## Where to go next

- The [language tour](/docs/getting-started/tour) shows the
  discipline in code.
- [Architecture-as-Types](/docs/architecture-types) is where
  the third-axis-closure and the "architecture is a type"
  principles meet at scale.
- [Verification](/docs/category/verification) is where the
  spectrum is realised end-to-end.
- The [grammar reference](/docs/reference/grammar-ebnf) is
  where the surface forms are pinned.
- The [audit protocol](/docs/architecture-types/audit-protocol)
  is where the mechanical observability is operationalised.
