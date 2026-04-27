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
| `@derive(Debug)` | type | generate `Debug::debug` |
| `@derive(Display)` | type | generate `Display::format` |
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
solver (the SMT backend, portfolio, …) is an implementation detail picked by
the capability router. The full set admitted by the grammar:

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@verify(runtime)`    | fn, type | runtime assertion check only; no formal proof |
| `@verify(static)`     | fn, type | static type-level verification only |
| `@verify(formal)`     | fn, type | formal verification with the default strategy (recommended) |
| `@verify(proof)`      | fn, type | alias of `formal`, emphasising proof extraction |
| `@verify(fast)`       | fn, type | optimise for fast verification; may sacrifice completeness on hard goals |
| `@verify(thorough)`   | fn, type | maximum completeness; races multiple strategies, returns the first success |
| `@verify(reliable)`   | fn, type | alias of `thorough`, emphasising result reliability |
| `@verify(certified)`  | fn, type | independently cross-verified; required for proof-certificate export (Coq/Lean/Dedukti/Metamath) |
| `@verify(synthesize)` | fn, type | synthesis mode — generate a term satisfying the spec rather than checking it |
| `@framework(name, "citation")` | axiom, theorem, lemma | Mark a statement as a trusted axiom borrowed from an external framework. `name` is the framework identifier (identifier syntax); the string is a human-readable citation (paper / URL / section). Surfaced by `verum audit --framework-axioms` for supply-chain review. |

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

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@inline` | fn | suggest inlining |
| `@inline(always)` | fn | force inlining |
| `@inline(never)` | fn | forbid inlining |
| `@hot` | fn | mark as hot path; bias optimisation / layout |
| `@cold` | fn | mark as cold path; bias away |
| `@vectorize(lanes = N)` | fn | request SIMD vectorisation |
| `@unroll(factor = N)` | fn | request loop unrolling |
| `@multiversion` | fn | emit multiple versions for CPU feature dispatch |
| `@link_section("name")` | fn, static | place into a named section |
| `@no_mangle` | fn, static | disable name mangling |
| `@vbc_direct_lowering` | fn (intrinsic) | Intrinsic function lowers directly to a VBC opcode without a regular call frame. Used on time/CPU/sleep primitives in `core/intrinsics/runtime/`; users should not hand-apply this attribute. |

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
