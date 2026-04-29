---
sidebar_position: 18
title: Attributes
---

# Attributes

Attributes (written `@name` or `@name(args)`) are annotations processed
at compile time. They cover derives, FFI, verification, optimisation
hints, tests, conditional compilation, and custom macros.

This page is an overview. The comprehensive list is the
**[Attribute registry](/docs/reference/attribute-registry)**.

## Syntax

```verum
@derive(Clone)                             // on a type
@verify(thorough)                         // on a function
@cfg(feature = "gpu")                      // on any item
@test                                      // marks a test
pub fn api_entry() { ... }
```

Forms:
- `@name` — bare.
- `@name(args)` — with arguments.
- `@name[tokens]` — token-tree form.
- `@name{block}` — brace-delimited form.

Attributes attach to the **following** item. Inner attributes
(attaching to the enclosing item) use `#!` — rare in Verum.

## Common attribute families

### Derives — `@derive(...)`

```verum
@derive(Clone, Debug, Eq, Hash, Serialize, Deserialize)
type Config is { ... }
```

Each derive is a procedural macro under `core.derives`.

### Layout — `@repr`

```verum
@repr(C)           type CStruct   is { ... };   // C-compatible layout
@repr(transparent) type Wrapper   is (Inner);   // single-field transparent
@repr(align(16))   type Aligned   is { ... };   // force alignment
@repr(packed)      type Packed    is { ... };   // no padding
```

### Verification — `@verify`

```verum
@verify(runtime)      // assertions only
@verify(static)       // dataflow + CBGR (default)
@verify(formal)       // formal verification (recommended)
@verify(fast)         // short timeout; may give up on hard goals
@verify(thorough)     // race multiple strategies in parallel
@verify(certified)    // cross-validated + exportable proof certificate
@verify(synthesize)   // synthesise a term from the spec
```

The strategy controls **what kind of guarantee** you want; the
solver subsystem picks **which backend** discharges the
obligation (Z3, CVC5, portfolio) via the capability router.

**Strategy semantics:**

| Strategy | SMT? | Timeout multiplier | Cross-validation | Cert. export | Use when |
|---|:---:|:---:|:---:|:---:|---|
| `runtime` | — | n/a | — | — | dev / debug, accept runtime cost. |
| `static` | — | n/a | — | — | structural / CBGR-only checks. |
| `formal` | ✓ | 1× | — | — | default for refinement obligations. |
| `fast` | ✓ | 0.3× | — | — | IDE / on-type, accept partial coverage. |
| `thorough` | ✓ | 2× | portfolio | — | release builds, no time pressure. |
| `certified` | ✓ | 3× | portfolio + kernel-replay | ✓ | shipping proofs as artefacts. |
| `synthesize` | ✓ | 5× | — | — | derive function bodies from specs. |

Solver-side knobs (timeouts, memory caps, quantifier strategy,
caching, etc.) live in the manifest under `[verify.solver]` and
in the operator's manual at
**[verification → solver tuning](/docs/verification/solver-tuning)**.

The capability router (theory-class → backend) is documented in
**[verification → SMT routing](/docs/verification/smt-routing)**.

**Precedence** (highest → lowest, when multiple sources set a
verification policy):

1. CLI flag (`verum verify --strategy thorough`).
2. `[verify.profiles.<name>]` if `--verify-profile <name>` is set.
3. `[verify.modules."<path>"]` for functions in that module subtree.
4. `@verify(<strategy>)` attribute on the function.
5. Top-level `[verify].default_strategy`.
6. Built-in default (`formal`).

**Per-function override:**

```verum
@verify(certified)
@verify(timeout = 60_000)         // override per-strategy timeout multiplier
fn signature_verify(msg: &Bytes, sig: &Bytes, pk: &PublicKey) -> Bool {
    // ... formal proof body ...
}
```

The phase-level `VerificationConfig.mode` (set in `[verify]`)
acts as the fallback for **un**annotated functions:

| `[verify].mode` | Effect on `fn` without `@verify` |
|---|---|
| `runtime` | skip SMT entirely (mirror of `@verify(runtime)`) |
| `auto` | proceed with SMT (default `formal`-equivalent) |
| `proof` | (reserved — future kernel-replay routing) |

### FFI — `@extern`

```verum
@extern("C")
fn c_function(x: Int) -> Int;

@extern("C", calling_convention = "stdcall")
fn windows_call(...) -> ...;
```

### Optimisation — `@inline`, `@cold`, `@hot`, `@vectorize`, `@unroll`

```verum
@hot
@inline
fn tight_inner_loop(x: Int) -> Int { ... }

@cold
fn error_path() { ... }

@vectorize(lanes = 8)
fn sum(xs: &[Float]) -> Float { ... }

@unroll(factor = 4)
fn process(xs: &[Int]) { for x in xs { ... } }
```

### Testing — `@test`, `@bench`

```verum
@test
fn foo_works() { ... }

@test(property)
fn sort_is_idempotent(xs: List<Int>) { ... }

@bench
fn throughput_bench(c: &mut Criterion) { ... }
```

### Conditional compilation — `@cfg`

```verum
@cfg(feature = "gpu")
fn gpu_entry() { ... }

@cfg(target_os = "linux")
mount os.linux;

@cfg(not(debug_assertions))
const RELEASE: Bool = true;
```

### Serialisation helpers

```verum
@derive(Serialize, Deserialize)
type Message is {
    @serialize(rename = "user_id", skip_if_null)
    id: Maybe<Int>,
    payload: Bytes,
};
```

### Validation

```verum
type User is {
    @validate(min = 1, max = 120)
    age: Int,
    @validate(matches = rx#"^[a-z0-9]+$")
    username: Text,
};
```

### Documentation

`///` comments are sugar for `@doc("...")`. Attach doc strings
explicitly via `@doc("...")` when generating docs programmatically.

### Program extraction

```verum
// Extract a constructive proof as runnable code (default Verum target).
@extract
public fn double(n: Int) -> Int { n + n }

// Extract into Lean 4.
@extract(lean)
public theorem add_comm(a: Int, b: Int) -> Int { a + b }

// Bind a verified spec to a runtime intrinsic without losing
// the proof-checked surface signature.
@extract(realize = "verum_runtime_x25519_scalar_mult")
public fn x25519(scalar: [Byte; 32], u: [Byte; 32]) -> [Byte; 32] { ... }
```

See **[Verification → Program extraction](/docs/verification/program-extraction)**
for the full guide and **[Reference → Attribute registry](/docs/reference/attribute-registry#program-extraction)**
for the per-attribute table.

## Attribute targets

Each attribute declares which syntactic positions it may appear on.
A misapplied attribute is a compile error, not a warning:

```
error[V9001]: `@repr(C)` is not valid on function
  --> src/foo.vr:3:1
   |
 3 | @repr(C)
   | ^^^^^^^^
 4 | fn f() { ... }
   |
   = help: `@repr(C)` applies to records and variants, not functions.
```

See **[Attribute registry](/docs/reference/attribute-registry)** for
the complete target / semantics list.

## Custom attributes

User-defined attributes are procedural macros (see
**[Metaprogramming](/docs/language/meta/overview)**):

```verum
@meta_macro
meta fn benchmark(f: quote) -> quote {
    quote {
        ${f}
        @test
        fn ${f.name}_bench() {
            let start = Time.now();
            ${f.name}();
            print(f"${f.name} took {start.elapsed()}");
        }
    }
}

@benchmark
fn hot_path() { ... }
```

## Stacking

Multiple attributes stack top-to-bottom:

```verum
@cfg(feature = "gpu")
@derive(Debug, Clone)
@verify(thorough)
pub fn gpu_entry() { ... }
```

The compiler applies them in declared order.
