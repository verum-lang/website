---
sidebar_position: 1
title: Introduction
description: Verum — a verifiable systems language with a trusted kernel, refinement types, SMT routing, three-tier references, and gradual verification.
slug: /intro
---

# Introduction

**Verum** is a systems programming language built around a single
question: *what if the type system, memory model, and proof engine were
designed to collaborate, from day one?*

The result is a language where correctness moves from comments and
tests **into the types**, where memory safety is paid for **only when
you can't prove you don't need it**, and where every claim ("this
function is verified", "this module uses no axioms beyond Lurie HTT")
is **mechanically enumerable** rather than implicit.

If you've shipped a critical system in Rust and wished the borrow
checker understood your invariants, or written a Coq proof and wished
it produced a runnable binary, you are Verum's audience.

## 1. What sets Verum apart

| Capability | Other systems languages | Verum |
|------------|------------------------|-------|
| Type-level invariants | macros / runtime checks / external verifier | first-class refinement types `T { P(self) }` checked by SMT, erased at runtime |
| Dependent types | none / external (Liquid Haskell, F\*) | Σ, Π, identity types, cubical Path, integrated with unification |
| Trusted base | implicit (whole compiler) | LCF-style kernel `verum_kernel` (target < 5 K LOC) — everything outside re-checks against it |
| Memory safety | borrow checker (no opt-out without `unsafe`) | three tiers: `&T` (~0.93 ns), `&checked T` (compiler-proven, 0 ns), `&unsafe T` (you prove it, 0 ns) |
| Effects / contexts | hidden globals + ad-hoc thread-locals | `using [Database, Logger]` — explicit, propagates across async, no implicit injection |
| SMT integration | none / single backend | dual backend (Z3 + CVC5) with capability-based routing — the solver that fits the goal gets it |
| Proof export | external | `verum export` (Lean / Coq / Dedukti / Metamath / Agda) + `verum extract` (program extraction) |
| Stdlib type names | implementation-leaking (`Vec`, `String`, `HashMap`) | semantic-honest (`List`, `Text`, `Map`, `Heap`, `Shared`) |
| Framework axioms | implicit / undocumented | `@framework(lurie_htt, "HTT 6.2.2.7")` — every postulate carries its citation, enumerable by `verum audit --framework-axioms` |

## 2. Six load-bearing capabilities

### 2.1 Refinement types

```verum
type Probability is Float { 0.0 <= self && self <= 1.0 };
type Even        is Int   { self % 2 == 0 };
type NonEmpty<T> is List<T> { self.len() > 0 };
```

Refinements are first-class: they live in the type system, are checked
by an SMT backend at compile time, and **erase to nothing** at
runtime. They compose with generics, refine method receivers, and
appear in pre/postconditions:

```verum
@verify(formal)
fn binary_search(xs: List<Int> { self.is_sorted() },
                 target: Int) -> Maybe<Int>
    where ensures (result is Some(i) => xs[i] == target)
{ ... }
```

The SMT backend discharges the postcondition at compile time. No
runtime check is generated; the type system, not the implementation,
proves the property. **See [Verification → Refinement
reflection](/docs/verification/refinement-reflection).**

### 2.2 Three-tier reference model (CBGR)

| Tier | Syntax | Cost | When applicable |
|------|--------|------|-----------------|
| 0 | `&T` | ~0.93 ns (measured; target ≤ 15 ns) | always — the safe default |
| 1 | `&checked T` | 0 ns | the compiler can prove the reference is valid (escape analysis, scope-bound usage) |
| 2 | `&unsafe T` | 0 ns | you accept the proof obligation manually (FFI, custom allocators) |

Tier-0 references are guarded by **CBGR** (Capability-Based Generational
References) — a 16-byte fat pointer carrying a generation tag and an
epoch capability. Reads validate the generation in ~1 ns; writes are
gated by capability checks. Escape analysis routinely promotes tier-0
references to tier-1, eliminating 50–90 % of checks in typical code.
**See [Language → CBGR](/docs/language/cbgr) and [Architecture →
CBGR implementation](/docs/architecture/cbgr-internals).**

### 2.3 Dual SMT backend with capability routing

Verum links Z3 and CVC5 simultaneously. The capability router
(`verum_smt::capability_router`) inspects each obligation's theory
signature — quantifier complexity, datatype use, string operations,
nonlinear arithmetic — and dispatches to the backend with the best
fit. `@verify(reliable)` runs **both** backends and demands agreement
before accepting the result; `@verify(certified)` adds proof-term
extraction with kernel re-check.

Routing is observable: `verum smt-stats` dumps per-theory dispatch
counts; `verum verify --dump-smt` writes every emitted query to disk.
**See [Verification → SMT routing](/docs/verification/smt-routing).**

### 2.4 Trusted kernel and explicit TCB

The trusted computing base is exactly three items:

1. The Rust compiler and its linked dependencies (unavoidable).
2. The LCF-style kernel in `verum_kernel` — a small, audit-able
   `check / verify` loop targeting < 5 K lines.
3. Framework axioms, each registered with
   `FrameworkId { framework, citation }`.

Everything else — the elaborator, every tactic, every SMT backend, the
cubical NbE evaluator, the bytecode codegen — lives **outside** the
TCB. Every tactic produces a `CoreTerm` the kernel re-checks. Every
SMT backend produces an `SmtCertificate` that `replay_smt_cert`
re-derives into a kernel-checkable term. A bug in any of them
manifests as "refused a valid program" or "certificate replay failed";
never as "false theorem accepted".

The kernel ships 30+ rules covering Π / Σ / Path / PathOver / HComp /
Transp / Glue / Refine (with ordinal-depth gating) / Quotient / Inductive
(with strict-positivity) / SMT replay / Framework-axiom
(with subsingleton + body-is-Prop gates) / cohesive modalities (∫ ⊣ ♭ ⊣ ♯)
/ universe ascent. **See [Verification → trusted
kernel](/docs/verification/trusted-kernel).**

### 2.5 Explicit contexts (effect-style without algebraic effects)

```verum
fn promote(target: UserId) -> Result<User, Error>
    using [Database, Logger, Clock]
{
    let now = Clock.now();          // capability-typed access
    Logger.info(f"promoting {target} at {now}");
    Database.update_user_role(target, "admin")
}
```

A function's `using [...]` clause is part of its type. Callers must
supply matching providers via `provide` blocks; nothing is injected
implicitly. Contexts propagate naturally across async boundaries —
they are *not* algebraic effects (Verum does not have row-typed
effects in the sense of Koka), but they cover the same engineering
problem cleanly. **See [Language → Context
system](/docs/language/context-system).**

### 2.6 Three-mode execution

| Mode | Trigger | Cost | Use case |
|------|---------|------|----------|
| Tier-0 (interpreter) | `verum run --interp file.vr` | instant startup | scripts, REPL, hot reload |
| Tier-1 (AOT) | `verum build` | LLVM compile time | production binaries (85–95 % native speed) |
| Check-only | `verum check file.vr` | type-check only | CI fast-feedback loop |

The interpreter and AOT path **share the same VBC bytecode** —
correctness is identical; the difference is execution time vs.
startup time. **See [Architecture →
overview](/docs/architecture/overview).**

## 3. A first taste — verified, executable code

```verum
type UserId    is (Int) { self > 0 };
type EmailAddr is Text  { self.matches(rx#"^[^@]+@[^@]+$") };

type User is {
    id:    UserId,
    email: EmailAddr,
    age:   Int { 0 <= self && self <= 150 },
};

@verify(formal)
public fn promote(users: &List<User>, target: UserId) -> Maybe<User>
    using [Database, Logger]
    where ensures (result is Some(u) => u.id == target)
{
    users.iter().find(|u| u.id == target)
}
```

What's happening here:

- `UserId`, `EmailAddr`, and the inline refinement on `age` are
  **erased** at runtime — the SMT backend proves the predicates
  hold by construction at every constructor call site; no
  runtime check is generated.
- `@verify(formal)` discharges the postcondition (`result is Some(u)
  => u.id == target`) at compile time. The implementation is
  statically proved correct; if you change it to `users.first()`
  the build fails with a counterexample.
- `&List<User>` is a tier-0 reference. Escape analysis promotes
  it to tier-1 (zero overhead) at the call site if `promote` does
  not retain it past the borrow.
- `using [Database, Logger]` makes the function's capabilities
  explicit. Callers must supply both via a `provide { ... }` block;
  there is no implicit injection.

**Try it locally:**

```bash
verum check src/user.vr     # type-check + refinement check (~ms)
verum verify src/user.vr    # full verification with SMT
verum run src/user.vr       # tier-0 interpreter
verum build --release       # tier-1 AOT
```

## 4. The verification ladder

Verum's nine semantic strategies form a monotone lift — passing a
stronger strategy implies the weaker ones. Pick the strongest
strategy that fits your time budget:

| Strategy | Cost | Strength | Use case |
|----------|------|----------|----------|
| `runtime` | runtime assertion | weakest | rapid prototyping, test code |
| `static` | dataflow / CBGR / constant folding | type-level only | the default for unannotated functions |
| `fast` | bounded single-solver SMT (~100 ms) | partial | inner CI loop |
| `formal` | portfolio SMT (~5 s) | sound under the SMT TCB | "this is verified" — the day-to-day strategy |
| `proof` | user tactic + kernel recheck | sound under the kernel TCB | hand-proved theorems |
| `thorough` | `formal` + mandatory specs (decreases / invariant) | terminating + functional | hot loops, recursion |
| `reliable` | Z3 + CVC5 must agree | independent cross-check | safety-critical |
| `certified` | `reliable` + cert export + kernel recheck | re-checkable in any prover | regulatory, supply-chain |
| `synthesize` | inverse search | "find me a term" | spec-first development |

Plus four extension strategies: `complexity_typed` (bounded-arithmetic),
`coherent_static` / `coherent_runtime` / `coherent` (α/ε bidirectional
coherence) — see **[Verification →
gradual-verification](/docs/verification/gradual-verification)** for
the full ν-ordinal table.

## 5. Where the trust lives

Verum's soundness story is not "the SMT solver said so, trust us":

```text
                  Outside TCB                         Inside TCB
   ┌────────────────────────────────────┐    ┌──────────────────────┐
   │ Elaborator (verum_types)            │    │ Rust + linked deps   │
   │ Tactic library (22+ tactics)        │ ⇄ │ verum_kernel         │
   │ Z3 / CVC5 / E / Vampire             │    │ (< 5 K LOC target)   │
   │ Cubical NbE evaluator               │    │ Framework axioms     │
   │ Refinement reflection / SMT trans.  │    │ (cited, enumerable)  │
   │ VBC codegen + LLVM lowering         │    │                      │
   └────────────────────────────────────┘    └──────────────────────┘
              │                                         ▲
              ▼                                         │
        produces CoreTerm  ─────────────►  kernel re-checks
        produces SmtCert   ─────────────►  replay_smt_cert
```

A bug in any non-TCB component manifests as "refused a valid program"
or "certificate replay failed" — **never** "false theorem accepted".
**See [Verification → trusted kernel](/docs/verification/trusted-kernel).**

## 6. Audit-friendly by construction

Every claim Verum makes is mechanically observable:

```text
$ verum audit --framework-axioms       # enumerate every cited axiom
$ verum audit --hygiene                # articulation hygiene factorisation
$ verum audit --owl2-classify          # ontology-classification graph
$ verum audit --accessibility          # context-system surface
$ verum smt-stats                      # per-theory SMT dispatch counts
$ verum smt-info                       # backend versions / capabilities
$ verum --vva-version                  # kernel version stamp (single source of truth)
```

The trusted boundary of any proof corpus is exactly the set of
`@framework(...)` markers it carries; there are no implicit
extensions, no hidden axioms, and no opt-in flags that change
soundness.

## 7. What ships today

| Subsystem | Status |
|-----------|--------|
| Lexer / parser / AST | production |
| Type system (Hindley-Milner + dependent + refinement) | production |
| CBGR (memory safety, three-tier references) | production (~0.93 ns measured) |
| SMT integration (Z3 + CVC5 + capability routing) | production |
| Trusted kernel (`verum_kernel`) | production (30+ rules; < 5 K LOC at completion) |
| Tactic DSL (51 stdlib tactics across 7 cogs) | production |
| VBC bytecode + interpreter | production |
| AOT via LLVM | production |
| GPU lowering via MLIR | production (subset) |
| Proof export (Lean / Coq / Dedukti / Metamath / Agda / OWL 2 FS) | production (statement-only; full term-export per backend) |
| Program extraction (`verum extract`) | production (4 targets, 7 expression-kind lowerers, `realize=` directive) |
| Stdlib (`core/`) | production (40+ modules) |
| Linter (`verum lint`) | production-hardened |
| LSP / DAP | production |
| REPL + Playbook TUI | production |

Outside-of-TCB subsystems are versioned independently of the kernel.
The kernel constant `verum_kernel::VVA_VERSION` (also surfaced via
`verum --vva-version`) is the single source of truth for the verified
calculus version.

## 8. How this site is organised

- **[Getting Started](/docs/getting-started/installation)** —
  install the `verum` toolchain, write your first program, take the
  language tour.
- **[Philosophy](/docs/philosophy/principles)** — the design
  principles that shaped Verum and the tradeoffs they imply
  (semantic honesty, no magic, gradual safety, zero-cost
  abstractions).
- **[Language Reference](/docs/language/overview)** — full
  specification of syntax, types, memory model, patterns, generics,
  protocols, contexts, FFI, attributes, metaprogramming.
- **[Standard Library](/docs/stdlib/overview)** — `List`, `Map`,
  `Text`, `async`, `math`, `term`, `net`, `database`, `crypto`,
  and the rest of `core/`.
- **[Verification](/docs/category/verification)** — gradual
  verification, refinement reflection, contracts, the tactic DSL,
  framework axioms, proof export, program extraction, the trusted
  kernel.
- **[Architecture](/docs/architecture/overview)** — how the
  compiler, VBC bytecode, runtime tiers, dual SMT backends, and
  GPU MLIR lowering compose.
- **[Reference](/docs/reference/grammar-ebnf)** — EBNF grammar,
  keyword list, attribute registry, CLI commands, `verum.toml`
  schema, lint rules, glossary.
- **[Cookbook](/docs/cookbook)** — task-oriented recipes
  (HTTP server, validation, scheduler, calc proofs, FFI binding,
  …).
- **[Tutorials](/docs/tutorials)** — guided walkthroughs
  building real programs end-to-end.

## 9. Who Verum is for

Verum is for engineers who have accepted that bugs in critical systems
are not a Rust-vs-TypeScript question but an
"is-this-invariant-machine-checkable" question. It is a
production-track language unapologetically influenced by Coq, Agda,
Idris, F\*, Dafny, and Lean — borrowing what works for shipping code
(refinement types, SMT routing, gradual verification, AOT compilation)
without inheriting what doesn't (whole-program extraction overhead,
opaque tactic libraries, single-prover lock-in).

If you want `println`-by-default, Verum is probably wrong for you. If
you want `postcondition`-by-default — and you want the trusted boundary
of every claim to be enumerable in the source — read on.

:::tip Quickest path
Skip to **[Installation](/docs/getting-started/installation)** to get
`verum --version` on your terminal, then follow the **[Language
Tour](/docs/getting-started/tour)**. From there:

- Verifying everyday code → **[Gradual
  verification](/docs/verification/gradual-verification)**.
- Memory model → **[CBGR](/docs/language/cbgr)**.
- Shipping a verified spec to OCaml/Lean/Coq → **[Program
  extraction](/docs/verification/program-extraction)**.
- Trust boundary → **[Trusted
  kernel](/docs/verification/trusted-kernel)** + `verum audit
  --framework-axioms`.
:::
