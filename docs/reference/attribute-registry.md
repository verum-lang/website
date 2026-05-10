---
sidebar_position: 4
title: Attribute Registry
---

# Attribute Registry

All standard attributes, organised by purpose. Each row lists the
attribute, its valid targets, and a one-line semantics.

## Derive

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@derive(Clone)` | type | generate `Clone` impl |
| `@derive(Copy)` | type | mark as `Copy` (requires all fields `Copy`) |
| `@derive(Debug)` | type | generate `Debug.debug` |
| `@derive(Display)` | type | generate `Display.format` |
| `@derive(Eq, PartialEq)` | type | generate equality |
| `@derive(Ord, PartialOrd)` | type | generate ordering (lexical) |
| `@derive(Hash)` | type | generate `Hash` |
| `@derive(Default)` | type | generate `Default` (fields must impl `Default`) |
| `@derive(Serialize)` | type | generate serialisation |
| `@derive(Deserialize)` | type | generate deserialisation |
| `@derive(Builder)` | type | generate fluent builder |
| `@derive(Error)` | type | generate `Error` impl with `Display` delegation |
| `@derive(From<T>)` | type | generate `From<T>` conversion (one-field newtypes) |
| `@derive(Into<T>)` | type | dual of `From<T>` |

## Layout

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@repr(C)` | type | C-compatible layout, no reordering |
| `@repr(transparent)` | type (one field) | identical layout to inner |
| `@repr(align(N))` | type | force alignment to N |
| `@repr(packed)` | type | no padding between fields |
| `@repr(u8/u16/u32/u64)` | variant | sum-type discriminant size |

## Verification

The `@verify` attribute takes a **semantic strategy** — the underlying
solver (single adapter, portfolio, …) is an implementation detail picked
by the capability router. Strategies are arranged on a strictly
monotone ν-ordinal ladder; see
**[verification → gradual verification](../verification/gradual-verification.md)**
for the full ladder and its operational semantics.

The complete set admitted by the grammar:

| Attribute | Targets | ν-ordinal | Semantics |
|-----------|---------|:---------:|-----------|
| `@verify(runtime)`           | fn, type | 0          | runtime assertion check only; no formal proof |
| `@verify(static)`            | fn, type | 1          | static type-level verification only |
| `@verify(fast)`              | fn, type | 2          | optimise for fast verification (capability router with reduced timeout); may sacrifice completeness on hard goals |
| `@verify(complexity_typed)`  | fn, type | < ω (n)    | bounded-arithmetic verification (V₀ / V₁ / S¹₂ / V_NP / V_PH / IΔ₀); polynomial-time; CI budget ≤ 30 s. Use for crypto protocols, real-time, embedded |
| `@verify(formal)`            | fn, type | ω          | full SMT verification with the default strategy (recommended production default) |
| `@verify(proof)`             | fn, type | ω + 1      | user-supplied tactic block; kernel rechecks. Dominates SMT and admits induction. Use for theorems / foundational lemmas |
| `@verify(thorough)`          | fn, type | ω · 2      | maximum completeness; portfolio race with extended timeout; mandatory `decreases` / `invariant` / `frame` |
| `@verify(reliable)`          | fn, type | ω · 2 + 1  | `thorough` + cross-solver agreement: two independent solver adapters must both return UNSAT; any disagreement → UNKNOWN |
| `@verify(certified)`         | fn, type | ω · 2 + 2  | `reliable` + certificate materialisation, kernel re-check, multi-format export — required for `.verum-cert` export (Coq / Lean / Dedukti / Metamath) |
| `@verify(coherent_static)`   | fn, type | ω · 2 + 3  | weak operational coherence — α-cert + symbolic ε-claim; polynomial in `\|P\|·\|φ\|`; CI ≤ 60 s |
| `@verify(coherent_runtime)`  | fn, type | ω · 2 + 4  | hybrid operational coherence — α-cert + runtime ε-monitor; trace-bounded; CI ≤ 5 min |
| `@verify(coherent)`          | fn, type | ω · 2 + 5  | strict operational coherence — α/ε bidirectional check; single-exponential; CI ≤ 30 min. Use for critical-safety code requiring full operational coherence |
| `@verify(synthesize)`        | fn, type | ≤ ω · 3 + 1 | synthesis mode — generate a term satisfying the spec rather than checking it; capability router dispatches to a synthesis-capable adapter (SyGuS-based) |
| `@verify(assume)`            | fn, type | —          | escape hatch — trust the programmer; **no verification is performed**. Off-ladder; use only when the obligation is established by means outside the verification pipeline (manual review, external tooling, foundational axiom). Audit-tracked via `verum audit --assumptions` |
| `@framework(name, "citation")` | axiom, theorem, lemma | — | Mark a statement as a trusted axiom borrowed from an external framework. `name` is the framework identifier (identifier syntax); the string is a human-readable citation (paper / URL / section). Surfaced by `verum audit --framework-axioms` for supply-chain review. |

Multiple strategies may be chained (`@verify([proof, static, runtime])`)
to express a verification *fallback chain* — the first successful
strategy wins; later strategies serve as a safety net for obligations
the earlier strategies couldn't discharge. Chains are written
left-to-most-trusted; the kernel-side strategy ladder enforces strict
monotonicity, so `@verify([runtime, proof])` is rejected as an
ill-formed chain (the runtime fallback can never strengthen a proof).

## Safety

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@trusted` | fn | mark function as verified-safe despite unsafe ops (audit-tracked) |
| `@unsafe_fn` | fn | mark function as requiring an unsafe context |
| `@must_use` | fn, type, param | warn if return value is unused |
| `@unreachable` | match arm, expr | document that this code path is unreachable |
| `@deterministic_fp` | fn | bit-for-bit reproducible floating-point semantics. Locks round-mode to round-to-nearest-even; forbids FMA contraction (codegen emits separate mul+add even on FMA-capable targets); restricts libm calls to `core.math.ieee754_deterministic` (CORE-MATH-derived correctly-rounded transcendentals). Default warn-on-non-determ-callee (eases incremental adoption). |
| `@deterministic_fp(strict)` | fn | strict mode: any call to a non-deterministic-fp function is a compile-time error rather than a warning. Required for consensus paths, CPTP-step Lindbladian dynamics, STARK trace generation. |

Note: pure-function status uses the **`pure fn`** keyword form in the
function signature (checked by `verum_types::computational_properties`
as a 0 ns compile-time property), not an attribute. See
**[language → attributes](/docs/language/attributes)** for the
canonical syntax.

## Program extraction

`@extract*` attributes mark constructive proofs and theorems for
**program extraction** by `verum extract`: the emitted file contains
the function's *computational content* in the chosen target language.
This is distinct from `verum export`, which emits *proof certificates*
for re-checking by an external prover.

### Argument grammar

```text
extract_attr_call    = "(" extract_args? ")"
extract_args         = ( extract_target | realize_kwarg )
                     | extract_target "," realize_kwarg
extract_target       = "verum" | "ocaml" | "lean" | "coq"
realize_kwarg        = "realize" "=" string_literal
```

The `realize=` kwarg short-circuits the body-synthesis path —
the emitter generates a thin wrapper that delegates to the named
native function. This preserves the verified surface signature
while binding the extracted scaffold to a hand-written runtime
primitive (crypto stub, intrinsic wrapper, foreign syscall).

### Attribute table

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@extract` | fn, theorem, lemma, corollary | extract as a runnable program in the default target (`verum`). |
| `@extract(<target>)` | same | extract into `verum` \| `ocaml` \| `lean` \| `coq`. |
| `@extract(realize="fn")` | same | bind the verified surface to native function `fn` instead of synthesising. Default target = `verum`. |
| `@extract(<target>, realize="fn")` | same | explicit target + native binding combined. |
| `@extract_witness` | theorem | emit only the existential witness from a constructive existence proof; the proof obligation is discharged in the Verum verification ladder, not re-emitted. |
| `@extract_witness(<target>)` | theorem | same with explicit target. |
| `@extract_witness(realize="fn")` | theorem | witness binding to a native function. |
| `@extract_witness(<target>, realize="fn")` | theorem | full combination. |
| `@extract_contract` | refinement-typed fn | preserve the refinement as a runtime contract check in the extracted code. |
| `@extract_contract(<target>)` | same | with explicit target. |
| `@extract_contract(realize="fn")` | same | contract wrapper bound to a native primitive. |
| `@extract_contract(<target>, realize="fn")` | same | full combination. |

A single declaration can carry multiple `@extract*` attributes —
each one emits a separate file in its target's directory.

### Output paths

`verum extract` writes one file per (declaration, target) pair:

| Target | Path | Re-checkable by |
|--------|------|-----------------|
| `verum` | `extracted/<name>.vr` | `verum check` |
| `ocaml` | `extracted/<name>.ml` | `dune build` / OCaml 5.x |
| `lean`  | `extracted/<name>.lean` | `lake build` / Lean 4 |
| `coq`   | `extracted/<name>.v` | `coqc` / Coq 8.x |

Override the parent directory with `verum extract --output <dir>`.

### Examples

```verum
// Default Verum extraction — re-checkable by `verum check`.
@extract
public theorem add_comm(a: Int, b: Int) -> Int { a + b }

// OCaml extraction with full body.
@extract(ocaml)
public fn double(n: Int) -> Int { n + n }

// Witness-only extraction (Coq).
@extract_witness(coq)
public theorem isqrt(n: Int { :: n >= 0 }) -> Int
    where (Int { result :: result * result <= n })
{ ... }

// Contract-preserving extraction across an FFI boundary.
@extract_contract(ocaml)
public fn safe_divide(a: Int, b: Int { :: b != 0 }) -> Int { a / b }

// Bind a verified spec to a runtime intrinsic wrapper.
@extract(realize = "verum_runtime_x25519_scalar_mult")
public fn x25519(scalar: [Byte; 32], u: [Byte; 32]) -> [Byte; 32] { ... }

// Coq target + native binding combined.
@extract(coq, realize = "ext_decode")
public fn decode(input: List<Byte>) -> Result<Frame, Error> { ... }

// Multi-target deployment of one verified definition.
@extract(verum)
@extract(coq)
@extract(lean)
public theorem div_uniqueness(
    a: Int,
    b: Int { :: b != 0 }
) -> Int { a / b }
```

For the full guide — coverage matrix, audit trail, common
pitfalls, build-pipeline integration — see
**[Verification → Program extraction](/docs/verification/program-extraction)**.

Project-wide defaults and per-module overrides live in the `[verify]`
section of `verum.toml` — see **[reference → verum.toml](/docs/reference/verum-toml#verify--formal-verification)**.

## FFI

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@extern("C")` | fn, extern block | C linkage |
| `@extern("C", calling_convention = "X")` | fn | override calling convention |
| `@ownership(transfer_to = "caller" \| "callee")` | ffi item | ownership transfer at boundary |
| `@ownership(borrow = [...])` | ffi item | params are borrowed, not transferred |

## Target & dispatch

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@device(cpu)` | fn | run on CPU (default, usually implicit) |
| `@device(gpu)` | fn | route through MLIR GPU pipeline — triggers `VbcToMlirGpuLowering` in Phase 7 |
| `@gpu.kernel` | fn | mark as a GPU kernel (implies `@device(gpu)`) with kernel-launch semantics |
| `@differentiable` | fn | synthesise a VJP companion in Phase 4a autodiff |
| `@thread_local` | static | per-thread storage |
| `@naked` | fn | no prologue / epilogue (assembly trampolines only) |
| `@intrinsic("name")` | fn | compiler-provided primitive (forward decl) |

## Optimisation

### Inlining

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@inline`            | fn | suggest inlining (compiler decides — equivalent to `@inline(suggest)`) |
| `@inline(always)`    | fn | force inlining at every call site |
| `@inline(never)`     | fn | forbid inlining (e.g. for cold error paths) |
| `@inline(release)`   | fn | inline only in release builds; treated as `suggest` in debug builds |
| `@hot`               | fn | mark as hot path; bias optimisation / layout |
| `@cold`              | fn | mark as cold path; bias away |
| `@likely`            | branch | branch-prediction hint — taken-likely |
| `@unlikely`          | branch | branch-prediction hint — taken-unlikely |

### Loops & vectorisation

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@unroll`             | loop | bare form requests full unrolling — equivalent to `@unroll(full)` |
| `@unroll(N)`          | loop | unroll exactly `N` iterations |
| `@unroll(full)`       | loop | fully unroll the loop |
| `@no_unroll`          | loop | prevent loop unrolling |
| `@vectorize`          | loop | enable auto-vectorisation (default — equivalent to `@vectorize(auto)`) |
| `@vectorize(force)`   | loop | force vectorisation; emit a diagnostic if the loop cannot vectorise |
| `@simd(prefer)`       | loop | try vectorisation, fall back to scalar if it would be unsafe |
| `@simd(never)` / `@no_vectorize` | loop | disable vectorisation entirely |
| `@vectorize(width: N)` | loop | optional width hint (e.g. 4, 8, 16); orthogonal to the mode |
| `@no_alias`           | loop | assert pointers in the loop body don't alias |
| `@ivdep`              | loop | assert no inter-iteration data dependencies (Intel-style hint) |
| `@parallel`           | loop | mark for auto-parallelisation |
| `@reduce(op)`         | loop | declare a reduction operator (`add` / `multiply` / `min` / `max` / `bitand` / `bitor` / `bitxor` / `and` / `or`; the operator form `+` / `*` / `&` / `|` / `^` / `&&` / `||` parses to the same variant) |
| `@prefetch(read \| write, locality: N)` | expr | cache-prefetch hint; `locality` is 0–3 (0 = streaming / no temporal locality; 3 = high temporal locality) |
| `@access_pattern(sequential \| random \| streaming)` | field, expr | declare access pattern for layout / prefetch optimisations |

### Code generation

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@optimize(none \| size \| speed \| balanced)` | fn | override the global optimisation level for this function |
| `@multiversion`         | fn | emit multiple versions for CPU feature dispatch |
| `@cpu_dispatch(features)` | fn | per-target-feature dispatch table |
| `@target_cpu("name")`   | fn, module | force a specific target CPU (e.g. `"znver3"`, `"apple-m1"`) |
| `@target_feature("+f1,-f2")` | fn | enable / disable specific CPU features |
| `@black_box`            | fn, expr | optimisation barrier — prevents constant folding through the value |
| `@const_eval` / `@const_fold` / `@const_prop` | fn | force compile-time evaluation / fold-with-optimisation / aggressive propagation respectively |
| `@deterministic_fp` / `@deterministic_fp(strict)` | fn | bit-for-bit reproducible floating-point semantics — see [Safety](#safety) |

### LTO & linkage

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@no_lto`              | fn, module | exclude from link-time optimisation |
| `@lto(always)`         | fn, module | force LTO even in debug builds |
| `@lto(thin)`           | fn, module | use Thin LTO for this unit |
| `@visibility(hidden \| default \| protected)` | fn, static | symbol visibility |
| `@linkage(external \| internal \| private \| weak \| linkonce \| linkonce_odr \| common \| available_externally)` | fn, static | fine-grained linkage. `weak` / `linkonce*` / `common` admit multiple definitions (linker-merged); the others require a single definition. |
| `@weak`                | fn, static | shorthand for `@linkage(weak)` |
| `@naked`               | fn | emit no prologue / epilogue (assembly-level control) |
| `@used`                | fn, static | retain the symbol even if appears unreferenced |
| `@no_return`           | fn | function never returns (panics / aborts / loops forever) |
| `@link_section("name")` | fn, static | place into a named ELF / Mach-O / PE section |
| `@no_mangle`           | fn, static | disable name mangling |
| `@link_name("name")`   | fn, static | override the linker name |

### PGO (profile-guided optimisation)

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@profile`                   | fn | mark for profiling (instrumentation pass collects counts) |
| `@profile("name")`           | fn | profile under a named bucket (segregate hot / cold reports) |
| `@frequency(N)`              | fn | hand-supplied expected calls per second; the optimiser treats this as an oracle when no PGO data is available |
| `@branch_probability(P)`     | branch | hand-supplied branch-taken probability (`0.0`–`1.0`) |

### Memory layout

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@align(N)`            | type, field | force alignment to `N` bytes |
| `@bit_offset(N)` / `@bits(N)` | bitfield | bit-level placement / width |
| `@endian(little \| big)` | type, field | byte-order for serialisation |
| `@section(idx)`        | static | place in a non-default linker section index |
| `@register_block` / `@register_offset(N)` | type | memory-mapped I/O layout |
| `@bitfield`            | type | declare a packed bitfield record |

### Tier discipline

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@vbc_direct_lowering` | fn (intrinsic) | Intrinsic function lowers directly to a VBC opcode without a regular call frame. Used on time / CPU / sleep primitives in `core/intrinsics/runtime/`; users should not hand-apply this attribute. |
| `@llvm_only`           | fn | function cannot run in the VBC interpreter (Tier 0). The compiler rejects `--tier=interpret` runs that reach this function. |
| `@requires_runtime`    | fn | declares a specific runtime feature dependency (e.g. async runtime, GPU dispatch); failure to provide produces a typed link-time diagnostic. |

## Testing

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@test` | fn (no args) | register as a unit test; passes iff it returns without panicking |
| `@property` | fn (typed params) | property-based test — harness feeds N random inputs per invocation (default 100) and performs integrated shrinking on failure. See **[Tooling → Property testing](/docs/tooling/property-testing)**. |
| `@property(runs = N)` | fn | override per-property iteration count (positive integer). |
| `@property(seed = 0x…)` | fn | pin a single deterministic seed — useful for CI and reproducing a specific failure. |
| `@test_case(args…)` | fn (positional params) | parametrise a test. Repeating the attribute expands the function into `fn_name[0]`, `fn_name[1]`, … Each case runs as a separate test entry. Args accept `Int`, `Bool`, `Text`, `Float` literals (and negated forms). |
| `@ignore` / `@ignored` | fn | skip in normal runs. Surfaces in `--format pretty` with `… ignored`. Re-enable with `--include-ignored` (all) or `--ignored` (only ignored). |
| `@bench` | fn | register as a benchmark — see **[Tooling → Benchmarking](/docs/tooling/testing#benchmarking)** for the harness flags (`--warm-up-time`, `--measurement-time`, baselines, etc.). |
| `@bench(group)` | fn | associate the bench with a named group (shown in the report and preserved in JSON/CSV output). |
| `@fuzz` | fn | register as a fuzz target (VCS fuzz infra — distinct from PBT). |


## Conditional compilation

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@cfg(feature = "X")` | any | include if feature X is enabled |
| `@cfg(target_os = "X")` | any | OS guard |
| `@cfg(target_arch = "X")` | any | architecture guard |
| `@cfg(debug_assertions)` | any | debug-only |
| `@cfg(not(X))`, `@cfg(any(...))`, `@cfg(all(...))` | any | compose |

## Parameters & fields

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@unused` | param | silence unused-param warnings |
| `@must_use` | fn, type, field | warn if result is discarded |
| `@validate(min = X, max = Y)` | field | derive a refinement |
| `@validate(matches = rx#"...")` | field | regex validation |
| `@serialize(rename = "...", skip, skip_if_null)` | field | serialisation control |
| `@deserialize(default, alias = "...")` | field | deserialisation control |

## Meta

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@const expr` | expr | force compile-time evaluation |
| `@meta_macro` | meta fn | expose as a callable `@name(...)` macro |
| `@tactic` | meta fn | expose as a proof tactic |
| `@logic` | fn | mark as reflection-eligible |
| `@llvm_only` | fn | cannot run in VBC interpreter |
| `@requires_runtime` | fn | needs a specific runtime feature |

## Documentation

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@doc("...")` | any | documentation comment |
| `@doc(hidden)` | any | exclude from generated docs |
| `@deprecated(since = "...", note = "...")` | any | mark deprecated |

## Miscellaneous

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@std` | any | standard library marker |
| `@internal` | any | internal-only (ignored by `verum doc`) |
| `@specialize` | impl | specialisation instance |
| `@universe_poly` | fn, type | enable universe polymorphism |
| `@cap(name = "X", domain = "Y")` | fn | declares a capability it holds |

## Lint suppression / promotion

In-source severity overrides for `verum lint`. The first arg is the
**string-literal** rule name (kebab-case, matches `[lint.severity]`
keys exactly); `reason = "..."` is optional today but recommended.

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@allow("rule", reason = "...")` | fn, type, theorem/lemma/corollary, axiom, module-level | suppress diagnostics of the named rule for everything inside the item's source span |
| `@deny("rule")` | same | force the rule to **error** for everything inside the item's span |
| `@warn("rule")` | same | force the rule to **warning** |

Examples:

```verum
@allow("redundant-refinement", reason = "kept for documentation")
type Always is Int{ true };

@deny("todo-in-code")
public fn release_critical() { … }

@warn("deprecated-syntax")
fn experimental() { … }
```

Most-specific (smallest source-span) suppression wins on overlap;
in-source attributes always beat `[lint.severity]` and CLI flags.
See **[Reference → Lint configuration → precedence stack](/docs/reference/lint-configuration#precedence-stack)**.

## Diakrisis Part B advisory attributes

These attributes annotate functions / theorems / types along Diakrisis
foundational axes. They are *advisory* — the compiler does not
dispatch on them; they are validated by meta-fns in
`core/meta/diakrisis_attrs.vr` and surfaced to downstream tooling
(audit, IDE, future verification ladders) without grammar bloat.

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@effect(<kind>)` | fn, theorem | computational-effect classifier. Kinds: `pure` \| `io` \| `state` \| `async` \| `exception` (alias `exn`) \| `nondet` (alias `non_det`) \| `quantum`. |
| `@infinity_category(<level>)` | type | (∞,∞)-categorical level. Level: integer \| `omega` \| `omega_omega`. |
| `@autopoietic(epsilon = <str>, depth = <int>)` | fn | ε-fixpoint coordinate + finite-depth approximation budget (Theorem 141.T). |
| `@ludic_design` | type, value | marks a value as a ludics design (lazy-evaluated proof tree). |
| `@cut_elimination[(bound = <int>)]` | fn, theorem | cut-elimination step bound. Default 1000. |

Examples:

```verum
// Function classified as performing IO.
@effect(io)
public fn read_config() -> Result<Config, Error> { ... }

// (∞, 1)-category type marker (Lurie HTT level).
@infinity_category(omega)
public type Topos is { ... };

// Autopoietic recursive computation with depth-32 cutoff.
@autopoietic(epsilon = "ε_construct", depth = 32)
public fn fold_autonomy(seed: Genome) -> Organism { ... }

// Ludics proof design with default cut-elimination bound (1000).
@ludic_design
@cut_elimination
public theorem cut_admissible() -> Bool { ... }

// Explicit lower bound for budget-tight CI.
@cut_elimination(bound = 100)
public theorem fast_cut() -> Bool { ... }
```

**Architectural note**: these attributes are advisory markers, not
compiler-dispatch primitives. They live in the meta-system per the
principle *typed-attrs are reserved for compiler-internal dispatch*.
Validation lives in the meta-fns `parse_effect_attr`,
`parse_infinity_category`, `parse_autopoietic`, `parse_ludic_design`,
`parse_cut_elimination` (all in `core/meta/diakrisis_attrs.vr`).

## Custom attributes

User-defined via `@meta_macro` (see
**[Language → metaprogramming](/docs/language/meta/overview)**).

The Diakrisis Part B advisory attributes above are themselves
implemented through this same meta-macro infrastructure — users can
add their own classifiers in sibling meta-modules without modifying
the compiler.

## See also

- **[Language → attributes](/docs/language/attributes)** — usage-level
  guide.
- **[Language → metaprogramming](/docs/language/meta/overview)** —
  writing your own.
- **[Reference → grammar](/docs/reference/grammar-ebnf#22-visibility-and-attributes)** —
  full attribute classification (compiler-internal vs meta-system).
