---
sidebar_position: 1
title: Introduction
description: Verum — a systems programming language with opt-in correctness depth. Scales from microcontroller firmware to verified theorem corpora. Pay only for what you use.
slug: /intro
---

# Introduction

**Verum** is a systems programming language that scales from
**microcontroller firmware** to **verified theorem corpora** —
the same source language, the same toolchain, the same binary
format. It is shaped by a single engineering question:

> What if the type system, the memory model, the proof engine,
> and the architectural-design layer were designed to *cooperate*,
> from day one, without forcing any of them on a developer who
> does not need them?

The result is a language where:

- **Plain systems code costs you what plain systems code costs
  anywhere.** No language runtime, no hidden allocator, no
  garbage collector, no exception machinery. The interpreter
  starts instantly; the AOT compiler emits binaries that run at
  near-C speeds.
- **Memory safety is paid for only when you cannot prove you do
  not need it.** Three reference tiers cover the safe / proven-safe
  / unsafe spectrum, chosen per use site rather than per language
  dialect.
- **Correctness moves into the types when it earns its keep.**
  Refinement types in the type system, dependent types and
  cubical paths for equational reasoning, machine-checked proofs
  for load-bearing claims — all opt-in, all erased at runtime.
- **Architecture moves into the types as a typed annotation.**
  Capability discipline, boundary invariants, lifecycle maturity,
  meta-theoretic foundation profile — all checked by the compiler,
  surfaced through stable diagnostic codes, audited at sign-off
  time.
- **Every claim is mechanically observable.** "This function is
  verified", "this module uses no axioms beyond cited upstream
  proofs", "this codegen pipeline preserves observable behaviour"
  — each claim is structured audit output, not a prose assertion.

Verum is for embedded developers writing firmware that must
never page-fault, for systems programmers wanting Rust's safety
without its compile-time cost, for application developers who
want explicit dependencies, for correctness engineers who want
SMT discharge with kernel re-check, for working mathematicians
who want a trusted base small enough to read in one sitting,
and for architects who want the diagram and the code to be the
same source.

## 1. The five surfaces

Verum exposes five surfaces that compose without forcing each
other on you:

### 1.1 The systems surface

Plain code, plain types, plain control flow. List, Map, Text,
Heap, Shared — semantic-honest names that describe meaning, not
implementation. Async with structured concurrency. A no-libc,
no-runtime AOT path that produces a single statically-linked
binary. An interpreter that runs the same bytecode for instant
iteration.

```verum
fn parse_packet(buf: &Bytes) -> Result<Packet, Error> {
    let header = read_header(buf)?;
    if header.magic != MAGIC { return Err(Error.BadMagic); }
    Ok(Packet { header, payload: buf.slice(HEADER_LEN..) })
}
```

This is the surface most users live on. Everything that follows
is opt-in.

### 1.2 The refinement-type surface

Predicates that live in the type system, are checked at compile
time, and erase to nothing at runtime.

```verum
type Probability is Float { 0.0 <= self && self <= 1.0 };
type Even        is Int   { self % 2 == 0 };
type NonEmpty<T> is List<T> { self.len() > 0 };
type Sorted<T: Ord> is List<T> { self.is_sorted() };
```

A refinement is part of a type, not a comment, not a linter, not
a separate tool. It composes with generics, refines method
receivers, and appears in pre/post conditions. The SMT layer
discharges it during type checking; the runtime sees the bare
underlying type. **See [Language → Refinement
types](/docs/language/refinement-types).**

### 1.3 The contract surface

Pre-conditions, post-conditions, loop invariants, termination
measures, frame conditions.

```verum
@verify(formal)
fn binary_search(xs: &List<Int> { self.is_sorted() },
                 target: Int) -> Maybe<Int>
    where ensures (result is Some(i) => xs[i] == target)
{ /* body */ }
```

The compiler discharges the post-condition. Change the body to
something incorrect and the build fails with a counterexample
the SMT layer extracted. **See [Verification →
contracts](/docs/verification/contracts).**

### 1.4 The proof surface

When the SMT layer cannot close an obligation — induction over
inductive types, transport along paths, theorems whose statements
quantify over arbitrary structure — you write a proof. The proof
is a typed program in its own right; the kernel checks it.

```verum
@verify(proof)
theorem sort_preserves_length<T: Ord>(xs: &List<T>)
    ensures sort(xs).len() == xs.len()
{
    proof by induction(xs) {
        case Nil => trivial
        case Cons(x, tail) => simp; apply ih(tail)
    }
}
```

The proof is checked twice — by the trusted base and by an
independent algorithmic kernel; disagreement fails the audit.
**See [Verification → proofs](/docs/verification/proofs).**

### 1.5 The architecture surface

Architectural intent — what a module is allowed to do, what it
depends on, what invariants its boundaries preserve, what stage
of maturity it is at — is a typed annotation the compiler
enforces.

```verum
@arch_module(
    lifecycle: Lifecycle.Theorem("v3.2"),
    exposes:   [Capability.Network(Tcp, Outbound),
                Capability.Read(Database("ledger"))],
    requires:  [Capability.Read(Logger)],
    preserves: [BoundaryInvariant.AllOrNothing,
                BoundaryInvariant.AuthenticatedFirst],
    composes_with: ["payment.fraud", "payment.audit"],
    strict:        true,
)
module payment.settlement;
```

Capability escalation, boundary violation, lifecycle regression,
foundation drift — each is a stable architectural diagnostic
emitted at build time. **See
[Architecture-as-Types](/docs/architecture-types).**

## 2. What sets Verum apart

| Capability | Other systems languages | Verum |
|------------|------------------------|-------|
| Type-level invariants | macros / runtime checks / external verifier | first-class refinement types `T { P(self) }` checked by SMT, erased at runtime |
| Dependent types | external (Liquid Haskell, F\*) or unavailable | Σ, Π, identity types, cubical paths, integrated with unification |
| Architectural typing | diagrams, READMEs, code-review folklore | typed `@arch_module(...)` annotation; capability + boundary + lifecycle + foundation discipline enforced at build time |
| Trusted base | implicit (whole compiler) | layered kernel — a hand-auditable Verum-source bootstrap, a minimal Rust trusted-base proof checker, an audit registry decomposing every rule's meta-theoretic footprint |
| Differential testing | typically none | two independent algorithmic kernels run in parallel + mutation fuzzing; any disagreement fails the audit |
| Memory safety | borrow checker (no opt-out without `unsafe`) | three tiers: safe by default, compiler-proven-safe where provable, manually-proven-safe at FFI boundary |
| Effects / contexts | hidden globals + ad-hoc thread-locals | explicit `using [...]` clause — propagates across async, no implicit injection. Same grammar drives runtime DI and compile-time meta-contexts |
| SMT integration | none / single backend | multi-backend (Z3, CVC5, specialised dependent / exhaustiveness / refinement) with capability routing |
| Proof export | external | Lean / Coq / Dedukti / Metamath / Isabelle export plus program extraction |
| Stdlib type names | implementation-leaking (`Vec`, `String`, `HashMap`) | semantic-honest (`List`, `Text`, `Map`, `Heap`, `Shared`) |
| Framework axioms | implicit / undocumented | every cited axiom carries a structured citation; the trusted boundary is enumerable |
| Audit surface | per-tool, ad-hoc | every claim mechanically observable; gates aggregate to a single load-bearing verdict |

## 3. Operational lifecycle — the K/V/И status taxonomy

Every Verum artefact carries a canonical *operational status*
drawn from a finite vocabulary. The status answers three
engineering questions about every claim:

- *Constructive (К) — is there a witness?* Can someone hand you
  an instance of the thing being claimed (a value, a proof term,
  an inhabitant of the type)?
- *Verifiable (В) — is there a check?* Is there an effective
  procedure that, given a candidate witness, decides whether it
  satisfies the claim?
- *Executable (И) — does it run?* Does the witness reduce to
  runnable code on a target machine?

The triple maps onto seven canonical statuses, each rendered as
a single glyph:

| Glyph | Status | When to use |
|-------|--------|-------------|
| `[Т]` | **Theorem** | Fully proved, kernel-checked, executable. The strongest claim. |
| `[О]` | **Definition** | A boundary set by fiat — types, capability ontology entries, configuration constants. |
| `[С]` | **Conditional** | Proved under listed assumptions. Reads as a Theorem inside the conditions. |
| `[П]` | **Postulate** | Accepted via external citation (an upstream theorem, a kernel-discharge axiom). |
| `[Г]` | **Hypothesis** | A speculation under active design. Carries a maturation plan. |
| `[И]` | **Interpretation** | Descriptive only — written down but not realised, checked, or extracted. Transitional. |
| `[✗]` | **Retracted** | Withdrawn. Record preserved as a negative example. |

The status is part of the architectural type and part of the
audit chronicle. A `[Т]` cog citing a `[Г]` cog is a compile
error — mature artefacts cannot rest on speculations. Promoting a
status is an explicit engineering action with its own audit
trail. **See [Architecture-as-Types → CVE seven
symbols](/docs/architecture-types/cve/seven-symbols).**

## 4. The verification ladder

Verum's verification strategies form a strictly monotone ladder
indexed by countable ordinals — each strategy is at least as
strong as every weaker one. Pick the strongest tier your time
budget supports.

| Tier | Strategy | What it does | When to use |
|------|----------|--------------|-------------|
| Runtime | `runtime` | runtime assertion check; no SMT | rapid prototyping, dev builds |
| Static | `static` | dataflow / constant folding / type-level only | the default for unannotated code |
| Static + SMT | `fast` | bounded single-solver SMT | inner CI loop |
| Static + bounded arithmetic | `complexity_typed` | bounded-arithmetic verification | crypto, real-time, embedded |
| Static + portfolio | `formal` | full portfolio SMT | the recommended production default |
| Proof | `proof` | user tactic + kernel re-check | hand-proved theorems |
| Proof + specs | `thorough` | `formal` + mandatory decreases / invariant / frame | hot loops, recursion |
| Proof + cross-check | `reliable` | multiple SMT backends must agree | safety-critical |
| Proof + certified | `certified` | `reliable` + certificate export + kernel re-check | regulatory, supply-chain |
| Coherence (weak / hybrid / strict) | `coherent_*` | bidirectional α/ε check | full operational coherence |
| Synthesis | `synthesize` | inverse search via SyGuS | spec-first development |

The strict monotonicity is a property the audit gate verifies —
no implementation drift can silently weaken a strategy. **See
[Verification → gradual
verification](/docs/verification/gradual-verification).**

## 5. Where the trust lives

Verum's soundness story is *not* "the SMT solver said so, trust
us":

```text
        Outside the trusted base               Inside the trusted base
   ┌──────────────────────────────────┐    ┌────────────────────────────┐
   │ Elaborator                       │    │ Rust + linked deps         │
   │ Tactic library                   │ ⇄ │ Layered kernel:            │
   │ Multiple SMT backends            │    │   – Verum-source bootstrap │
   │ Cubical NbE evaluator            │    │   – minimal Rust checker   │
   │ Refinement reflection            │    │   – audit registry         │
   │ Bytecode codegen + LLVM          │    │ Two independent kernels    │
   │ ATS-V architectural type checker │    │ Framework axioms           │
   │ Counterfactual / adjunction      │    │   (cited, enumerable)      │
   │ engines                          │    │                            │
   └──────────────────────────────────┘    └────────────────────────────┘
              │                                         ▲
              ▼                                         │
        produces a CoreTerm  ─────────►  both kernels re-check
        produces an SmtCert   ─────────►  certificate replay
        differential fuzz ◄────────────►  agreement enforced
```

A bug in any non-TCB component manifests as "refused a valid
program" or "certificate replay failed" — *never* "false theorem
accepted". A bug in a kernel implementation surfaces as a
differential disagreement and fails the audit immediately.

Adding a new framework axiom requires citing it. A theorem that
uses an uncited axiom (e.g. an undeclared classical principle)
is rejected — the trust boundary is enumerable. **See
[Verification → trusted
kernel](/docs/verification/trusted-kernel).**

## 6. Audit-friendly by construction

Every claim Verum makes is mechanically observable. The audit
surface is organised in eight bands — kernel-soundness,
architectural typing, framework citations, articulation hygiene,
cross-format proof export, mechanisation roadmaps, tooling, and
a single bundle aggregator that produces a single load-bearing
verdict for the project.

```bash
$ verum audit --bundle              # aggregate verdict
$ verum audit --framework-axioms    # enumerate every cited axiom
$ verum audit --differential-kernel # two-kernel agreement
$ verum audit --counterfactual      # non-destructive scenario battery
$ verum audit --arch-discharges     # architectural anti-pattern catalog
```

The audit chronicle is the project's record of "what we know
and how we know it". Diff two chronicles to see how the project
evolved between releases. **See [Architecture-as-Types → audit
protocol](/docs/architecture-types/audit-protocol).**

## 7. Three execution modes

| Mode | Trigger | Cost | Use case |
|------|---------|------|----------|
| Interpreter | `verum run [--interp] file.vr` | instant startup | dev iteration, REPL, hot reload |
| AOT | `verum build` / `verum run --aot file.vr` | LLVM compile time | production binaries (near-C speed) |
| GPU | `@device(GPU)` markers | MLIR compile time | tensor / parallel work |

The interpreter and AOT path **share the same bytecode** —
correctness is identical; the difference is execution time vs.
startup time.

A Verum *script* is a `.vr` file with a `#!` shebang line and no
`fn main()` — top-level statements are the program. Scripts run
directly via `verum hello.vr` or `./hello.vr` with no
`verum.toml`, no boilerplate, full access to refinement types,
the standard library, and the typed shell-scripting framework.
This makes Verum a viable replacement for shell-grade scripts
(`bash`, `python`, `awk`) while keeping every guarantee that
distinguishes it as a verified systems language. **See [Getting
Started → Script
mode](/docs/getting-started/script-mode).**

## 8. How this site is organised

- **[Getting Started](/docs/getting-started/installation)** —
  install the toolchain, write your first program, take the
  language tour.
- **[Foundations](/docs/foundations/principles)** — the engineering
  principles that shape every Verum decision; how the surfaces
  compose; what each surface is suitable for.
- **[Architecture-as-Types (ATS-V)](/docs/architecture-types)** —
  the architectural type system. Eight typed primitives,
  thirty-two architectural anti-patterns, the canonical
  operational lifecycle taxonomy, modal-temporal calculus,
  counterfactual reasoning, the audit protocol.
- **[Language Reference](/docs/language/overview)** — full
  specification of syntax, types (Σ / Π / refinement / cubical /
  linear), memory model, patterns, generics, protocols, contexts,
  FFI, attributes, metaprogramming.
- **[Standard Library](/docs/stdlib/overview)** — `List`, `Map`,
  `Text`, `async`, `math`, `term`, `net`, `database`, `crypto`,
  the typed shell-scripting framework, the Diakrisis enactment
  layer, and the rest of `core/`.
- **[Verification](/docs/category/verification)** — the gradual
  verification ladder, refinement reflection, contracts, the
  tactic DSL, framework axioms, proof export, program
  extraction, the trusted kernel, the two-kernel architecture,
  the reflection tower, separation logic, codegen attestation,
  the kernel module map, the kernel_v0 bootstrap.
- **[Architecture](/docs/architecture/overview)** — how the
  compiler, bytecode, runtime tiers, multi-backend SMT, and GPU
  MLIR lowering compose.
- **[Tooling](/docs/category/tooling)** — the `verum` CLI (with
  every audit subcommand), LSP, REPL, Playbook TUI, build
  system, test runner, benchmarking, package registry.
- **[Reference](/docs/reference/grammar-ebnf)** — EBNF grammar,
  keyword list, attribute registry, CLI commands, `verum.toml`
  schema, lint rules, glossary.
- **[Cookbook](/docs/cookbook)** — task-oriented recipes (HTTP
  server, validation, scheduler, calc proofs, FFI binding,
  shell scripting, OWL 2 reasoning, …).
- **[Tutorials](/docs/tutorials)** — guided walkthroughs
  building real programs end-to-end.

## 9. Who Verum is for

Verum is for engineers who have accepted that bugs in critical
systems are not a "Rust vs. TypeScript" question but an
"*is-this-invariant-machine-checkable*" question. It is a
production-track language unapologetically influenced by Rust,
Zig, Swift, Idris, F\*, Dafny, Coq, Lean, and Agda — borrowing
what works for shipping code (memory safety, refinement types,
dependent types, AOT compilation) without inheriting what
doesn't (whole-program extraction overhead, opaque tactic
libraries, single-prover lock-in, hidden runtime cost).

Verum is also for *architects* who have watched their diagrams
drift from the codebase across release cycles. Architecture-as-Types
collapses the diagram-vs-code gap into a typed annotation the
compiler enforces — `@arch_module(...)` is the single source of
truth, and the audit chronicle is the sign-off record.

If you write firmware, you can use Verum like idiomatic Rust
without ever opening the verification chapter. If you write
applications, refinement types let you encode invariants once
and have them checked everywhere. If you write proofs, the
trusted base is small enough to read in one sitting and the
audit chronicle leaves no room for invisible assumptions.

If you want `println`-by-default, Verum supports that. If you
want `postcondition`-by-default, it supports that. If you want
the trusted boundary of every claim to be enumerable in the
source, it supports that. The choice is yours, per function, per
module, per project.

:::tip Quickest path
Skip to **[Installation](/docs/getting-started/installation)** to
get `verum --version` on your terminal, then follow the
**[Language Tour](/docs/getting-started/tour)**. From there:

- Embedded firmware → **[Cookbook → embedded
  drivers](/docs/cookbook)** + the `@no_std` discipline.
- Application code with verification → **[Gradual
  verification](/docs/verification/gradual-verification)**.
- Architectural types → **[Architecture-as-Types
  overview](/docs/architecture-types)**.
- Memory model → **[CBGR](/docs/language/cbgr)**.
- Shipping a verified spec to OCaml/Lean/Coq → **[Program
  extraction](/docs/verification/program-extraction)**.
- Trust boundary → **[Trusted
  kernel](/docs/verification/trusted-kernel)** +
  `verum audit --bundle`.
:::
