---
sidebar_position: 2
title: Compilation Pipeline
---

# Compilation Pipeline

The compiler runs in **9 main phases** (with three inline sub-phases),
orchestrated by `verum_compiler::pipeline::Pipeline`.

## Phase map

| # | Phase | Parallel? | Key files |
|---|---|---|---|
| 0 | Stdlib preparation | once per build | `phases/phase0_stdlib.rs` |
| 1 | Lexical & parsing | per-file | `verum_lexer`, `verum_fast_parser`, `macro_expansion.rs` |
| 2 | Meta registry & AST registration | sequential | `phases/meta_registry.rs` |
| 3 | Macro expansion & literal desugaring | sequential | `phases/macro_expansion.rs` |
| 3a | **Contract verification** | per-obligation | `phases/contract_verification.rs` |
| 4 | Semantic analysis (type checking) | per-module | `verum_types::infer`, `phases/semantic_analysis.rs` |
| 4a | Autodiff compilation | per `@differentiable` | `phases/autodiff_compilation.rs` |
| 4b | FFI boundary processing | per FFI fn | `phases/ffi_boundary.rs` |
| 5 | Verification (SMT + bounds elim.) | per-obligation | `phases/verification_phase.rs` + `verum_smt` |
| 6 | MIR lowering & optimisation | per-function | `phases/mir_lowering.rs`, `phases/optimization.rs`, `vbc_mono.rs` |
| 7 | Code generation (VBC + LLVM/MLIR) | per-function | `phases/vbc_codegen.rs`, `verum_codegen::{llvm,mlir}` |
| 8 | Linking | per-target, sequential | `phases/linking.rs` + embedded LLD |
| 9 | Artefact emission | sequential | `pipeline.rs` |

## Phase 0 — Stdlib preparation

Compiles `core/` modules once per build and caches stdlib metadata
for the type checker. A persistent disk cache (`target/.verum-cache/stdlib/`)
reuses results across builds; invalidation is content-hash-based.

## Phase 1 — Lexical & parsing

- Tokenisation via `verum_lexer` (logos-generated DFA).
- Recursive-descent parsing via `verum_fast_parser` — produces a
  lossless green-tree AST with preserved trivia (comments, whitespace).
- Entry-point discovery (`main`, `@test`, `@bench`).

## Phase 2 — Meta registry & AST registration

Registers every `@derive`, tagged-literal handler, `@verify` attribute,
and user-defined `meta fn` into a global `MetaRegistry`. This makes
Phase 3 order-independent — a macro can refer to a type defined later
in the same file.

## Phase 3 — Macro expansion & literal desugaring

- Procedural macros (`@derive`, `@meta_macro`-registered).
- Tagged-literal parsing (`json#`, `sql#`, `rx#`, `url#`, etc.). Each
  tag validates its content at compile time; invalid content is a
  **compile error**, not a runtime failure.
- `quote` / `unquote` / `lift` hygiene.

Contract literals (`contract#"..."`) are **parsed** here but
**verified** in Phase 3a.

## Phase 3a — Contract verification

```
contract#"""ensures result >= 0""" -> SMT-LIB obligation -> Z3/CVC5 -> verified / error
```

- Collects contract obligations from `contract#` literals
  encountered during Phase 3.
- Translates to SMT-LIB via `verum_smt::expr_to_smtlib`.
- Dispatches to the solver(s) per the function's `@verify(...)` mode.
- Fails the compilation with a counter-example on violation.

This is a distinct phase because a contract's proof may reference
`@logic` functions registered in Phase 2, but must complete before
Phase 4's type checker sees the annotated function.

## Phase 4 — Semantic analysis

- **Bidirectional inference**: `verum_types::infer`. Fast — 3–5×
  faster than Algorithm W on mixed HM/dependent code.
- **Refinement types**: narrowed by flow analysis where possible;
  unresolved predicates become obligations for Phase 5.
- **Context clauses**: `using [...]` resolved; capability subtyping
  checked.
- **CBGR annotation**: every `&T` receives a tier annotation (managed /
  checked / unsafe) and reference metadata. Escape analysis does a
  preliminary pass for optimisation hints (full promotion to
  `&checked T` happens in Phase 6).
- **Cubical bridge**: `Type::Eq` values translated via
  `verum_types::cubical_bridge` to cubical terms before unification.

## Phase 4a — Autodiff compilation

For every `@differentiable fn`, builds the computational graph and
synthesises a VJP (vector-Jacobian product) function. See
[`math::autodiff`](/docs/stdlib/math#layer-6--automatic-differentiation).

## Phase 4b — FFI boundary processing

Validates `extern "C"` declarations and `ffi { ... }` contracts;
generates trampolines; checks that boundary contracts
(`memory_effects`, `errors_via`, `@ownership`) make sense together.

Phases 4, 4a, and 4b run in parallel after Phase 3a.

## Phase 5 — Verification (SMT + bounds elimination)

See [Verification Pipeline](/docs/architecture/verification-pipeline)
for the full internal architecture. Sub-phases:

- **5.1 Obligation collection**: refinement-type obligations, loop
  invariants, `ensures`/`requires` clauses.
- **5.2 SMT encoding**: `verum_smt::expr_to_smtlib`.
- **5.3 Capability routing**: classify obligations by theory
  (LIA/bitvector/array/string/nonlinear); dispatch to Z3 or CVC5.
  See [SMT Routing](/docs/verification/smt-routing).
- **5.4 Portfolio execution** (if `@verify(portfolio)`): run Z3 + CVC5
  in parallel, cross-validate.
- **5.5 Proof extraction and certification**: for
  `@verify(certified)`, extract proof terms and machine-check them.
- **5.6 Caching**: results cached in `target/smt-cache/` by SMT-LIB
  fingerprint.
- **5.7 Bounds elimination**: CBGR escape analysis + refinement
  results feed into optimisation hints for Phase 6.

Each obligation dispatches independently; the per-obligation SMT cache
yields ~60–70% hit rate on incremental builds.

## Phase 6 — MIR lowering & optimisation

- **Lowering**: typed HIR → MIR (control-flow graph).
- **Optimisation passes**: inlining, dead-code elimination, constant
  folding, loop optimisations, CBGR **tier promotion** (`&T` →
  `&checked T` where escape analysis proves safety).
- **Monomorphisation**: specialises generics per concrete argument
  types; deduplicates equivalent instantiations.
- **Fingerprinting**: each MIR function is hashed; cache key for
  Phase 7.

## Phase 7 — Code generation

- **VBC emission** (always): every function → 200+-opcode bytecode
  module (`verum_vbc`).
- **LLVM IR** (AOT): VBC → LLVM via `verum_codegen::llvm::vbc_lowering`;
  LLVM runs its own optimisation pipeline and emits object files.
- **MLIR** (JIT + GPU): VBC → MLIR via `verum_codegen::mlir`; GPU
  kernels lower further to Metal IR (Apple) or SPIR-V (Vulkan).
- **Debug info**: DWARF (Linux/macOS) or PDB (Windows).

## Phase 8 — Linking

Static linking via **embedded LLD** — Verum ships its own linker.

- **No-libc freestanding**: the runtime is a freestanding C shim
  (~8.3K LOC in `verum_toolchain`); there is no musl / MSVC CRT /
  libSystem dependency except for macOS where `libSystem.B.dylib` is
  Apple's stable ABI entry point.
- **LLD backends**: ELF (Linux), Mach-O (macOS), COFF (Windows).
- **LTO**: thin by default; full optionally.
- **Targets**: x86_64, aarch64, riscv64, wasm32, plus embedded
  (thumbv7em, riscv32imac).

## Phase 9 — Artefact emission

Binaries (`target/{debug,release}/`), library archives (`.cog`),
optional proof certificates (`target/proofs/`), debug info, docs.

---

## Phase dependencies & parallelisation

```
Phase 0  (stdlib)
   │ once
   ▼
Phase 1  (parse) ──────────────┐
                                │ per-file
Phase 2  (meta registry) ◄──────┤
                                │ sequential
Phase 3  (expand)               │
                                │
Phase 3a (contract verify) ─────┤ per-obligation
                                │
Phase 4  (type check) ──────────┼─ Phase 4a (autodiff)   per-function
                                ├─ Phase 4b (ffi)         per-fn
                                │
Phase 5  (verify) ──────────────┤ per-obligation
                                │
Phase 6  (MIR + opt) ───────────┤ per-function
                                │
Phase 7  (codegen) ─────────────┤ per-function
                                │
Phase 8  (link) ◄───────────────┤ sequential, per target
                                │
Phase 9  (emit)                 ▼
```

Rationale:

| Phase | Parallel strategy | Why |
|---|---|---|
| 0 | once | stdlib metadata is global |
| 1 | per-file | files are independent at tokenisation |
| 2–3 | sequential | global type / macro registries must be built in order |
| 3a | per-obligation | obligations are independent; SMT pool parallelises |
| 4 | per-module | modules have no mutual type dependencies after Phase 2 |
| 4a / 4b | parallel | independent of Phase 4 completion |
| 5 | per-obligation | same as 3a |
| 6 / 7 | per-function | no intra-function ordering; MIR optimisation local |
| 8 | sequential | LTO needs whole-program visibility |
| 9 | sequential | final artefact emission |

## Incremental compilation

See [Incremental Compilation](/docs/architecture/incremental-compilation)
for the full strategy. Key points:

- **Fingerprinting**: source + type + dependency + config hash per function.
- **Cache location**: `target/.verum-cache/{functions,stdlib,smt}/`.
- **Hit rate**: 10–15× faster rebuild after a one-function edit on
  50 K-LOC projects.

## Pipeline diagnostics

```bash
$ verum build --timings
phase 0  (stdlib)         0.2s   (cache hit)
phase 1  (parse)          0.245s
phase 2  (meta registry)  0.018s
phase 3  (expand)         0.14s
phase 3a (contracts)      0.09s  (12 obligations, z3)
phase 4  (type-check)     0.612s
phase 4a (autodiff)       0.04s
phase 4b (ffi)            0.02s
phase 5  (verify)         1.480s (SMT: 1.402s, cache hit rate 67%)
phase 6  (mir + opt)      0.534s
phase 7  (codegen)        2.112s
phase 8  (link)           0.318s
phase 9  (emit)           0.05s
total                     5.88s
```

## See also

- **[Verification pipeline](/docs/architecture/verification-pipeline)**
  — Phase 5 internals.
- **[Incremental compilation](/docs/architecture/incremental-compilation)**
  — fingerprinting, cache strategy, performance.
- **[Execution environment (θ+)](/docs/architecture/execution-environment)**
  — how memory / capabilities / recovery / concurrency unify at runtime.
- **[VBC bytecode](/docs/architecture/vbc-bytecode)** — phase 7 output.
- **[SMT integration](/docs/architecture/smt-integration)** — phase 3a/5 solver dispatch.
- **[Codegen](/docs/architecture/codegen)** — phase 7 in detail.
