---
sidebar_position: 1
title: Introduction
description: Verum — a verifiable systems language with architecture-as-types, three-layer trusted kernel, two-kernel differential testing, MSFS-grounded reflection tower, 13-strategy verification ladder, and ~45 mechanically-observable audit gates.
slug: /intro
---

# Introduction

**Verum** is a systems programming language built around a single
question: *what if the type system, the memory model, the proof
engine, and the architectural-design layer were designed to
collaborate, from day one?*

The result is a language where:

- **Correctness moves into the types.** Refinement types,
  dependent types, cubical paths — checked by SMT, by tactics,
  and by two independent algorithmic kernels.
- **Architecture moves into the types.** A cog declares its
  capability discipline, boundary invariants, lifecycle
  maturity, and meta-theoretic foundation as a typed
  `@arch_module(...)` annotation. The compiler enforces 32
  named architectural anti-patterns at build time.
- **Memory safety is paid for only when you cannot prove you
  do not need it.** Three-tier references — `&T` (~0.93 ns
  CBGR-checked), `&checked T` (compiler-proven, 0 ns),
  `&unsafe T` (you prove it, 0 ns).
- **Every claim is mechanically enumerable.** *"This function
  is verified", "this module uses no axioms beyond Lurie HTT",
  "this binary's codegen pipeline preserves observable
  behaviour"* — each claim is an audit-gate JSON output, not a
  prose assertion.

If you have shipped a critical system in Rust and wished the
borrow checker understood your invariants, written a Coq proof
and wished it produced a runnable binary, or stared at an
architecture diagram wondering whether the code still matches
it — you are Verum's audience.

## 1. What sets Verum apart

| Capability | Other systems languages | Verum |
|------------|------------------------|-------|
| Type-level invariants | macros / runtime checks / external verifier | first-class refinement types `T { P(self) }` checked by SMT, erased at runtime |
| Dependent types | none / external (Liquid Haskell, F\*) | Σ, Π, identity types, cubical Path / HComp / Transp / Glue, integrated with unification |
| **Architectural typing** | diagrams, READMEs, code-review folklore | **`@arch_module(...)` carrying eight typed primitives + 32-pattern anti-pattern catalog enforced at build time** |
| Trusted base | implicit (whole compiler) | three-layer kernel (`kernel_v0` 10 rules + `proof_checker` 6 rules in &lt; 1K LOC + `KernelRuleId` 7 audit-registry rules) |
| **Differential testing** | typically none | **two independent algorithmic kernels (bidirectional + NbE) + 11-variant mutation fuzz with synthetic-pin liveness check** |
| Memory safety | borrow checker (no opt-out without `unsafe`) | three tiers: `&T` (~0.93 ns), `&checked T` (compiler-proven, 0 ns), `&unsafe T` (you prove it, 0 ns) |
| Effects / contexts | hidden globals + ad-hoc thread-locals | `using [Database, Logger]` — explicit, propagates across async, no implicit injection. **Same `using` for runtime DI and 14 compile-time meta-contexts** |
| SMT integration | none / single backend | dual backend (Z3 + CVC5) plus dependent / exhaustiveness / refinement specialised backends, capability-routed |
| **Meta-soundness** | informal trust | **MSFS-grounded reflection tower in 4 stages — Theorem 9.6 / 8.2 / 5.1 collapse the naive ordinal hierarchy** |
| Proof export | external | `verum export` (Lean / Coq / Dedukti / Metamath / Isabelle) + `verum extract` (program extraction with `realize=`) |
| Stdlib type names | implementation-leaking (`Vec`, `String`, `HashMap`) | semantic-honest (`List`, `Text`, `Map`, `Heap`, `Shared`) |
| Framework axioms | implicit / undocumented | `@framework(lurie_htt, "HTT 6.2.2.7")` — 11 packages × 71 axioms enumerable by `verum audit --framework-axioms` |
| **Codegen attestation** | typically none | **CompCert-style 6-pass simulation manifest with explicit `Discharged` / `AdmittedWithIou` / `NotYetAttested` per pass** |
| Audit surface | per-tool, ad-hoc | **~45 audit gates in 8 bands aggregated into a single L4-load-bearing `verum audit --bundle` verdict** |

## 2. Eight load-bearing capabilities

### 2.1 Refinement types

```verum
type Probability is Float { 0.0 <= self && self <= 1.0 };
type Even        is Int   { self % 2 == 0 };
type NonEmpty<T> is List<T> { self.len() > 0 };
```

Refinements are first-class: they live in the type system, are
checked by an SMT backend at compile time, and **erase to
nothing** at runtime. They compose with generics, refine method
receivers, and appear in pre/postconditions:

```verum
@verify(formal)
fn binary_search(xs: List<Int> { self.is_sorted() },
                 target: Int) -> Maybe<Int>
    where ensures (result is Some(i) => xs[i] == target)
{ ... }
```

The SMT backend discharges the postcondition at compile time. No
runtime check is generated; the type system, not the
implementation, proves the property. **See [Verification →
Refinement reflection](/docs/verification/refinement-reflection).**

### 2.2 Architecture-as-Types (ATS-V)

Every cog declares its architectural intent as a typed
annotation. Eight primitives — Capability / Boundary /
Composition / Lifecycle / Foundation / Tier / Stratum / Shape —
expressed in existing Verum syntax (variants, records,
attributes), no new grammar productions.

```verum
@arch_module(
    foundation:    Foundation.ZfcTwoInacc,
    stratum:       MsfsStratum.LFnd,
    lifecycle:     Lifecycle.Theorem("v3.2"),
    at_tier:       Tier.Aot,
    exposes:       [Capability.Read(ResourceTag.Database("ledger")),
                    Capability.Network(NetProtocol.Grpc, NetDirection.Outbound)],
    requires:      [Capability.Read(ResourceTag.Logger)],
    preserves:     [BoundaryInvariant.AllOrNothing,
                    BoundaryInvariant.AuthenticatedFirst],
    composes_with: ["payment.fraud", "payment.audit"],
    strict:        true,
)
module payment.settlement;
```

The compiler reads this as eight obligations. Mismatches between
the Shape and the body produce stable RFC-coded diagnostics
(`ATS-V-AP-001` through `ATS-V-AP-032`). The audit gates
(`--arch-discharges`, `--counterfactual`, `--adjunctions`,
`--yoneda`) consume the Shape at sign-off time. **See
[Architecture-as-Types](/docs/architecture-types).**

### 2.3 Three-tier reference model (CBGR)

| Tier | Syntax | Cost | When applicable |
|------|--------|------|-----------------|
| 0 | `&T` | ~0.93 ns (measured; target ≤ 15 ns) | always — the safe default |
| 1 | `&checked T` | 0 ns | the compiler can prove the reference is valid (escape analysis, scope-bound usage) |
| 2 | `&unsafe T` | 0 ns | you accept the proof obligation manually (FFI, custom allocators) |

Tier-0 references are guarded by **CBGR** (Capability-Based
Generational References) — a 16-byte fat pointer carrying a
generation tag and an epoch capability. Reads validate the
generation in ~1 ns; writes are gated by capability checks.
Escape analysis routinely promotes tier-0 references to tier-1,
eliminating 50–90 % of checks in typical code. **See [Language →
CBGR](/docs/language/cbgr) and [Architecture → CBGR
implementation](/docs/architecture/cbgr-internals).**

### 2.4 Multi-backend SMT with capability routing

Verum links Z3 and CVC5 simultaneously and adds three
specialised backends (dependent, exhaustiveness, refinement) for
domain-specific obligations. The capability router
(`verum_smt::capability_router`) inspects each obligation's
theory signature — quantifier complexity, datatype use, string
operations, nonlinear arithmetic — and dispatches to the backend
with the best fit. `@verify(reliable)` runs **both** Z3 and
CVC5 and demands agreement; `@verify(certified)` adds proof-term
extraction with kernel re-check; `@verify(coherent)` adds α/ε
bidirectional verification.

Routing is observable: `verum smt-stats` dumps per-theory
dispatch counts; `verum verify --dump-smt` writes every emitted
query to disk. **See [Verification → SMT
routing](/docs/verification/smt-routing).**

### 2.5 Three-layer trusted kernel + two-kernel differential

The trusted base is *layered* and *enumerable*:

| Layer | Where | Rules | Trust role |
|-------|-------|-------|-----------|
| **A — kernel_v0** | `core/verify/kernel_v0/` (Verum source) | 10 | hand-auditable bootstrap meta-theory |
| **B — proof_checker** | `proof_checker.rs` (Rust, &lt; 1K LOC) | 6 | irreducible verdict authority — minimal CoC |
| **C — KernelRuleId registry** | `zfc_self_recognition.rs` | 7 | per-rule ZFC + κ decomposition for meta-soundness |

Layer B has a sibling — `proof_checker_nbe` — running
**Normalisation-by-Evaluation** as a structurally distinct
algorithm. Both kernels check every certificate; disagreement
fails the audit. An 11-variant mutation fuzz layer plus a
*synthetic always-accept liveness pin* keep the differential
non-vacuous.

Verum is the first production proof assistant to ship two
algorithmic kernels with continuous differential testing.

```text
   Outside TCB                              Inside TCB
   ┌──────────────────────────┐    ┌────────────────────────┐
   │ Elaborator (verum_types) │    │ Layer A: kernel_v0     │
   │ 51-tactic DSL            │    │   (10 rules, Verum)    │
   │ Z3/CVC5/dep/exhaust/refn │ ⇄ │ Layer B: proof_checker │
   │ Cubical NbE evaluator    │    │   + proof_checker_nbe  │
   │ Refinement reflection    │    │ Layer C: KernelRuleId  │
   │ VBC codegen + LLVM       │    │   audit registry       │
   └──────────────────────────┘    └────────────────────────┘
            │                               ▲
            ▼                               │
      produces CoreTerm  ──────────►   both kernels re-check
      produces SmtCert   ──────────►   replay_smt_cert
```

A bug in any non-TCB component manifests as "refused a valid
program" or "certificate replay failed"; **never** as "false
theorem accepted". **See [Verification → trusted
kernel](/docs/verification/trusted-kernel)** and
**[Two-kernel architecture](/docs/verification/two-kernel-architecture)**.

### 2.6 MSFS-grounded reflection tower (structured Gödel-2nd escape)

The trust delegation is *enumerable*. Every kernel rule
publishes its required meta-theory; the reflection tower
verifies the hierarchy explicitly. Naive proof-theoretic
intuition expects an unbounded ordinal hierarchy
(REF^0..REF^ω₁); MSFS theorems collapse it to **four canonical
stages**:

| Stage | Discharge | Citation |
|-------|-----------|----------|
| `REF^0` Base | per-rule footprint over ZFC + 2·κ | `kernel_meta_soundness_holds` |
| `REF^≥1` Stable | every `k ≥ 1` reduces to base | MSFS Theorem 9.6 (meta-stabilisation) |
| `REF^ω` Bounded | tower instantiation ≤ 3 inaccessibles | MSFS Theorem 8.2 (reflective-tower boundedness) |
| `REF^Abs` Empty | `𝓛_Abs = ∅` | MSFS Theorem 5.1 (AFN-T α — Boundary Lemma) |

The MSFS-grounded picture is *strictly stronger* than the naive
ordinal-indexed one — it eliminates false-content levels and
provides explicit upper bounds. **See [Reflection
tower](/docs/verification/reflection-tower).**

### 2.7 Explicit contexts (effect-style without algebraic effects)

```verum
fn promote(target: UserId) -> Result<User, Error>
    using [Database, Logger, Clock]
{
    let now = Clock.now();          // capability-typed access
    Logger.info(f"promoting {target} at {now}");
    Database.update_user_role(target, "admin")
}
```

A function's `using [...]` clause is part of its type. Callers
must supply matching providers via `provide` blocks; nothing is
injected implicitly. Contexts propagate naturally across async
boundaries — they are *not* algebraic effects (Verum does not
have row-typed effects in the sense of Koka), but they cover the
same engineering problem cleanly. The same `using` grammar drives
**14 compile-time meta-contexts** (TypeInfo, AstAccess,
CodeSearch, Schema, DepGraph, Hygiene + 8 more — 230+ stage-aware
methods). One lookup rule across runtime and compile time.
**See [Language → Context system](/docs/language/context-system).**

### 2.8 Three-mode execution + script mode

| Mode | Trigger | Cost | Use case |
|------|---------|------|----------|
| Tier-0 (interpreter) | `verum run [--interp] file.vr` | instant startup | dev iteration, REPL, hot reload |
| Tier-1 (AOT) | `verum build` / `verum run --aot file.vr` | LLVM compile time | production binaries (85–95 % native speed) |
| Check-only | `verum check file.vr` | type-check only | CI fast-feedback loop |
| GPU lowering | `@device(GPU)` markers | MLIR compile time | tensor / parallel work |

The interpreter and AOT path **share the same VBC bytecode** —
correctness is identical; the difference is execution time vs.
startup time. **See [Architecture →
overview](/docs/architecture/overview).**

Verum draws a strict line between two source roles. A
**Verum application** declares `fn main()` and runs via the
interpreter or the AOT pipeline above. A **Verum script** is a
`.vr` file with a `#!` shebang line at byte 0 and **no
`fn main()`** — top-level statements are the program. Scripts run
directly via `verum hello.vr` or `./hello.vr` with no
`verum.toml`, no boilerplate, and full access to refinement
types, CBGR memory safety, the `core.shell` typed-shell
framework, and the standard library. The script's tail expression
becomes its process exit code. This separation makes Verum a
viable replacement for shell-grade scripts (`bash`, `python`,
`awk`) while keeping every guarantee that distinguishes it as a
verified systems language. **See [Getting Started → Script
mode](/docs/getting-started/script-mode).**

## 3. A first taste — verified, executable code

```verum
type UserId    is (Int) { self > 0 };
type EmailAddr is Text  { self.matches(rx#"^[^@]+@[^@]+$") };

type User is {
    id:    UserId,
    email: EmailAddr,
    age:   Int { 0 <= self && self <= 150 },
};

@arch_module(
    lifecycle: Lifecycle.Theorem("v1.0"),
    exposes:   [Capability.Read(ResourceTag.Database("users"))],
    requires:  [Capability.Read(ResourceTag.Logger)],
    strict:    true,
)
module my_app.user;

@verify(formal)
public fn promote(users: &List<User>, target: UserId) -> Maybe<User>
    using [Database, Logger]
    where ensures (result is Some(u) => u.id == target)
{
    users.iter().find(|u| u.id == target)
}
```

What's happening here:

- **Refinement types** — `UserId`, `EmailAddr`, and the inline
  refinement on `age` are erased at runtime. The SMT backend
  proves the predicates hold by construction at every constructor
  call site; no runtime check is generated.
- **Architectural type** — the `@arch_module(...)` declares the
  cog at `Lifecycle.Theorem("v1.0")` (the strongest CVE status),
  exposing only `Read(Database("users"))` and requiring `Logger`.
  Citing this cog from a non-Theorem cog triggers
  `AP-009 LifecycleRegression`; using a network capability inside
  the body triggers `AP-001 CapabilityEscalation`.
- **Verification** — `@verify(formal)` discharges the
  postcondition at compile time. The implementation is statically
  proved correct; if you change it to `users.first()` the build
  fails with a counterexample.
- **Three-tier reference** — `&List<User>` is a tier-0 reference.
  Escape analysis promotes it to tier-1 (zero overhead) at the
  call site if `promote` does not retain it past the borrow.
- **Explicit contexts** — `using [Database, Logger]` makes the
  function's runtime capabilities explicit. Callers must supply
  both via a `provide { ... }` block; there is no implicit
  injection.

**Try it locally:**

```bash
verum check src/user.vr     # type-check + refinement check (~ms)
verum verify src/user.vr    # full verification with SMT
verum run src/user.vr       # tier-0 interpreter
verum build --release       # tier-1 AOT
verum audit --bundle        # ~45 gates aggregated into one L4 verdict
```

## 4. The verification ladder — thirteen strategies

Verum's **thirteen semantic strategies** form a monotone lift —
passing a stronger strategy implies the weaker ones. The ν-ordinal
index is strictly monotone (countable ordinals encoded in
`verum_smt::verify_strategy::NuOrdinal`). Pick the strongest
strategy that fits your time budget:

| ν | Strategy | What it does | Use case |
|---|----------|--------------|----------|
| 0 | `runtime` | runtime assertion check; no SMT | rapid prototyping |
| 1 | `static` | dataflow / CBGR / constant folding | the default for unannotated functions |
| 2 | `fast` | bounded single-solver SMT (~100 ms) | inner CI loop |
| 3 | `complexity_typed` | bounded-arithmetic verification (V_0 / V_1 / S^1_2 / IΔ_0) | crypto, real-time, embedded |
| ω | `formal` | full portfolio SMT (~5 s) | recommended production default |
| ω+1 | `proof` | user tactic + kernel recheck | hand-proved theorems |
| ω·2 | `thorough` | `formal` + mandatory specs (decreases / invariant / frame) | hot loops, recursion |
| ω·2+1 | `reliable` | Z3 + CVC5 must agree | safety-critical |
| ω·2+2 | `certified` | `reliable` + cert export + kernel recheck | regulatory, supply-chain |
| ω·2+3 | `coherent_static` | α-cert + symbolic ε-claim | weak operational coherence |
| ω·2+4 | `coherent_runtime` | α-cert + runtime ε-monitor | hybrid coherence |
| ω·2+5 | `coherent` | α/ε bidirectional check via 108.T-bridge | full operational coherence |
| ω·3+1 | `synthesize` | inverse search via SyGuS | "find me a term" — spec-first development |

The strict monotonicity is enforced by an audit gate
(`verum audit --ladder-monotonicity`) — every adjacent pair must
have a strict ν-ordinal increase. **See [Verification →
gradual-verification](/docs/verification/gradual-verification).**

## 5. Where the trust lives

Verum's soundness story is *not* "the SMT solver said so, trust
us":

```text
                  Outside TCB                           Inside TCB
   ┌──────────────────────────────────┐    ┌────────────────────────────┐
   │ Elaborator (verum_types)          │    │ Rust + linked deps         │
   │ 51-tactic DSL, 7 cogs             │ ⇄ │ verum_kernel (3 layers)    │
   │ Z3 / CVC5 / dep / exhaust / refn  │    │   A: kernel_v0 (10 rules)  │
   │ Cubical NbE evaluator             │    │   B: proof_checker (6)     │
   │ Refinement reflection / SMT trans │    │      + proof_checker_nbe   │
   │ VBC codegen + LLVM lowering       │    │   C: KernelRuleId (7)      │
   │ ATS-V architectural type checker  │    │ Framework axioms           │
   │ Counterfactual / adjunction / MTAC│    │   (11 packages, 71 axioms) │
   └──────────────────────────────────┘    └────────────────────────────┘
              │                                         ▲
              ▼                                         │
        produces CoreTerm  ─────────────►  both kernels re-check
        produces SmtCert   ─────────────►  replay_smt_cert
        differential fuzz ◄─────────────►  agreement enforced

                                         ↓ above the kernel ↓

                                   ┌────────────────────────────┐
                                   │ Reflection tower (4 stages)│
                                   │  Base / Stable / Bounded / │
                                   │  AbsoluteEmpty             │
                                   │  citing MSFS Thm 9.6 / 8.2 │
                                   │  / 5.1                     │
                                   └────────────────────────────┘
```

A bug in any non-TCB component manifests as "refused a valid
program" or "certificate replay failed" — **never** "false theorem
accepted". A bug in a *kernel implementation* surfaces as a
differential disagreement and fails the audit immediately. A
bug in the *meta-theory* would have to be a bug in the cited
MSFS theorem itself — peer-review territory.

**See [Verification → trusted
kernel](/docs/verification/trusted-kernel)** and **[Two-kernel
architecture](/docs/verification/two-kernel-architecture)**.

## 6. Audit-friendly by construction — ~45 gates

Every claim Verum makes is mechanically observable. The audit
catalog has **~45 gates** organised in eight bands:

| Band | Count | Examples |
|------|-------|----------|
| **Kernel-soundness** | 10 | `--kernel-rules`, `--kernel-recheck`, `--kernel-soundness`, `--kernel-v0-roster`, `--differential-kernel{,-fuzz}`, `--reflection-tower`, `--codegen-attestation` |
| **ATS-V** | 6 | `--arch-discharges`, `--arch-coverage`, `--arch-corpus`, `--counterfactual`, `--adjunctions`, `--yoneda` |
| **Framework + citation** | 10 | `--framework-axioms`, `--framework-conflicts`, `--framework-soundness`, `--accessibility`, `--apply-graph`, `--bridge-discharge` |
| **Hygiene + coherence** | 8 | `--hygiene{,-strict}`, `--coord{,-consistency}`, `--coherent`, `--epsilon`, `--proof-honesty` |
| **Cross-format + export** | 3 | `--round-trip`, `--cross-format`, `--owl2-classify` |
| **Roadmap + coverage** | 6 | `--htt-roadmap`, `--ar-roadmap`, `--manifest-coverage`, `--mls-coverage`, `--verify-ladder`, `--ladder-monotonicity` |
| **Tooling** | 3 | `--proof-term-library`, `--signatures`, `--docker` |
| **Aggregator** | 1 | `--bundle` — runs every gate above and emits a single L4 load-bearing verdict |

```bash
$ verum audit --bundle              # all ~45 gates aggregated into one L4 verdict
$ verum audit --framework-axioms    # 11 packages × 71 axioms enumerated
$ verum audit --differential-kernel # two-kernel agreement
$ verum audit --reflection-tower    # MSFS-grounded 4-stage discharge
$ verum audit --counterfactual      # non-destructive scenario battery
$ verum audit --arch-discharges     # 32-pattern anti-pattern catalog
$ verum --vva-version               # kernel version stamp
```

The trusted boundary of any proof corpus is exactly the set of
`@framework(...)` markers it carries plus the cited MSFS
theorems; there are no implicit extensions, no hidden axioms,
and no opt-in flags that change soundness. **See [Audit
protocol](/docs/architecture-types/audit-protocol).**

## 7. What ships today

| Subsystem | Status |
|-----------|--------|
| Lexer / parser / AST | production |
| Type system (Hindley-Milner + dependent + refinement + linearity) | production |
| **Architectural type system (ATS-V)** | **production (8 primitives, 32-pattern catalog, MTAC + counterfactual + adjunction + Yoneda engines)** |
| CBGR (memory safety, three-tier references) | production (~0.93 ns measured) |
| SMT integration (Z3 + CVC5 + dependent + exhaustiveness + refinement, capability routing) | production |
| Trusted kernel — Layer A `kernel_v0` (Verum, 10 rules) | active (4 proved / 6 admitted with named IOU) |
| Trusted kernel — Layer B `proof_checker` (Rust, 6 rules, &lt; 1K LOC) | production |
| Trusted kernel — Layer B `proof_checker_nbe` (Rust, NbE) | production |
| Trusted kernel — Layer C `KernelRuleId` audit registry (7 rules) | production |
| **Differential testing + 11-variant mutation fuzz** | **production with synthetic-pin liveness check** |
| **MSFS-grounded reflection tower (4 stages)** | **production — Theorems 9.6 / 8.2 / 5.1 cited and machine-verified** |
| Tactic DSL (51 stdlib tactics across 7 cogs) | production |
| Separation logic (kernel + Verum mirror + bridge) | production (6-arm minimal kernel, BridgeFidelity classifier) |
| VBC bytecode + interpreter | production |
| AOT via LLVM | production |
| GPU lowering via MLIR | production (subset) |
| **Codegen attestation** (CompCert-style, 6 passes) | V0 (manifest + audit gate; per-pass discharge in flight) |
| Proof export (Lean / Coq / Dedukti / Metamath / Isabelle) | production (statement + per-backend term export) |
| Program extraction (`verum extract`) | production (4 targets, 7 expression-kind lowerers, `realize=` directive) |
| Stdlib (`core/`) | production (38 top-level modules) |
| Framework axioms (11 packages, 71 axioms) | production (`verum audit --framework-axioms`) |
| `core.shell` typed shell-scripting framework | production |
| Linter (`verum lint`) | production-hardened |
| LSP / DAP | production |
| REPL + Playbook TUI | production |

Outside-of-TCB subsystems are versioned independently of the
kernel. The kernel constant `verum_kernel.VVA_VERSION` (also
surfaced via `verum --vva-version`) is the single source of
truth for the verified calculus version.

## 8. How this site is organised

- **[Getting Started](/docs/getting-started/installation)** —
  install the `verum` toolchain, write your first program, take
  the language tour.
- **[Philosophy](/docs/philosophy/principles)** — the design
  principles that shaped Verum and the tradeoffs they imply
  (semantic honesty, no magic, gradual safety, zero-cost
  abstractions).
- **[Architecture-as-Types (ATS-V)](/docs/architecture-types)** —
  the eight architectural primitives, the 32-pattern anti-pattern
  catalog, the CVE 7-symbol Lifecycle taxonomy, MTAC,
  counterfactual reasoning, adjunctions, the audit protocol.
- **[Language Reference](/docs/language/overview)** — full
  specification of syntax, types (Σ / Π / refinement / cubical /
  linear), memory model, patterns, generics, protocols, contexts,
  FFI, attributes, metaprogramming.
- **[Standard Library](/docs/stdlib/overview)** — `List`, `Map`,
  `Text`, `async`, `math`, `term`, `net`, `database`, `crypto`,
  `core.shell`, `core.action` (DC-side enactments), and the rest
  of `core/`.
- **[Verification](/docs/category/verification)** — gradual
  verification ladder, refinement reflection, contracts, the
  tactic DSL, framework axioms, proof export, program extraction,
  the trusted kernel, two-kernel architecture, reflection tower,
  separation logic, codegen attestation, kernel module map,
  kernel_v0 bootstrap.
- **[Architecture](/docs/architecture/overview)** — how the
  compiler, VBC bytecode, runtime tiers, multi-backend SMT, and
  GPU MLIR lowering compose.
- **[Tooling](/docs/category/tooling)** — `verum` CLI (with all
  ~45 audit subcommands), LSP, REPL, Playbook TUI, build system,
  test runner, benchmarking, `cog-packages`.
- **[Reference](/docs/reference/grammar-ebnf)** — EBNF grammar,
  keyword list, attribute registry, CLI commands, `verum.toml`
  schema, lint rules, glossary.
- **[Cookbook](/docs/cookbook)** — task-oriented recipes (HTTP
  server, validation, scheduler, calc proofs, FFI binding, shell
  scripting, …).
- **[Tutorials](/docs/tutorials)** — guided walkthroughs building
  real programs end-to-end.

## 9. Who Verum is for

Verum is for engineers who have accepted that bugs in critical
systems are not a Rust-vs-TypeScript question but an
"is-this-invariant-machine-checkable" question. It is a
production-track language unapologetically influenced by Coq,
Agda, Idris, F\*, Dafny, and Lean — borrowing what works for
shipping code (refinement types, SMT routing, gradual
verification, AOT compilation) without inheriting what doesn't
(whole-program extraction overhead, opaque tactic libraries,
single-prover lock-in).

Verum is also for *architects* who have watched their diagrams
drift from the codebase across release cycles. Architecture-as-Types
collapses the diagram-vs-code gap into a typed annotation the
compiler enforces — `@arch_module(...)` is the single source of
truth, and `verum audit --bundle` is the sign-off chronicle.

If you want `println`-by-default, Verum is probably wrong for
you. If you want `postcondition`-by-default, *and* you want the
trusted boundary of every claim to be enumerable in the source,
*and* you want the architectural intent to type-check against the
code — read on.

:::tip Quickest path
Skip to **[Installation](/docs/getting-started/installation)** to
get `verum --version` on your terminal, then follow the
**[Language Tour](/docs/getting-started/tour)**. From there:

- Verifying everyday code → **[Gradual
  verification](/docs/verification/gradual-verification)**.
- Architectural types → **[Architecture-as-Types
  overview](/docs/architecture-types)**.
- Memory model → **[CBGR](/docs/language/cbgr)**.
- Shipping a verified spec to OCaml/Lean/Coq → **[Program
  extraction](/docs/verification/program-extraction)**.
- Trust boundary → **[Trusted
  kernel](/docs/verification/trusted-kernel)** + **[Two-kernel
  architecture](/docs/verification/two-kernel-architecture)** +
  `verum audit --bundle`.
:::
