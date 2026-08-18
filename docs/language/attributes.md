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
obligation (single adapter or portfolio) via the capability router.

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

### Determinism — `@deterministic_fp`

```verum
@deterministic_fp                 // warn-on-non-determ-callee (default)
fn cptp_step(rho: &Matrix7x7, h_eff: &Matrix7x7, dt: Float) -> Matrix7x7 { ... }

@deterministic_fp(strict)         // error-on-non-determ-callee
fn consensus_state_root(state: &State) -> [Byte; 32] { ... }
```

`@deterministic_fp` is a **load-bearing FP-determinism contract**.
It locks the function to bit-for-bit reproducible floating-point
semantics across every conformant implementation:

1. **Round mode** — round-to-nearest-even. The body cannot open a
   `with_rounding(...)` scope.
2. **No FMA contraction** — codegen emits separate `mul + add` even
   on hardware with native FMA. Two roundings, not one.
3. **libm restriction** — calls into the runtime libm are limited to
   the canonical [`core.math.ieee754_deterministic`](/docs/stdlib/math)
   subset (CORE-MATH-derived correctly-rounded transcendentals).
   System-libm (where glibc and macOS-libm differ in the last bit on
   `sin/cos/exp/log`) is diagnostics-flagged.

The property *propagates*: a `@deterministic_fp` body that calls a
non-deterministic-fp function emits a diagnostic at the call site —
**warning** under default strictness (eases incremental adoption),
**hard error** under `(strict)` (the consensus / kernel path).

#### Why this exists, not `@pure`

`@pure` (and the first-class `pure fn` keyword form) asserts no
side effects — the orthogonal Pure property in the
`verum_types::computational_properties` set. FP-determinism is a
*different* property: a function can be Pure-but-non-deterministic
(uses FMA, glibc `sin`) or non-Pure-but-deterministic (logs, but
only via the deterministic-libm subset). Two attributes, two axes.

#### When to use it

| Path | Recommendation |
|---|---|
| Consensus block-hash / state-root computation | `@deterministic_fp(strict)` |
| CPTP / Lindbladian step on holon density matrices | `@deterministic_fp(strict)` |
| STARK / Halo2 trace polynomial generation | `@deterministic_fp(strict)` |
| Reproducible-build numerical kernel | `@deterministic_fp(strict)` |
| Performance-bound UI rendering, simulation hot loops | leave un-annotated (system libm + FMA welcome) |

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

`@cfg` is not restricted to declarations. It also gates a **block of
statements**, a **method inside an `implement` block**, and it can be read
as a **`Bool` value**:

```verum
fn tune() {
    // Statement block: excluded blocks are not compiled AND not
    // type-checked, so they may reference platform-only names.
    @cfg(target_arch = "x86_64") {
        let _ = arch_prctl(ARCH_SET_FS, tcb);
    }

    // Value position: the predicate's own truth value.
    let wide: Bool = @cfg(target_pointer_width = "64");
}
```

A gated block is a **statement**, and that is the one place the two roles
are easy to confuse. A statement produces no value, so a chain of `@cfg`
blocks cannot be a function's result — the function falls off the end and
yields `Unit`:

```verum
// WRONG — the body is two statements, so `pick` returns Unit and the
// declared type is never satisfied.  The diagnostic lands on the
// signature, not on either block.
fn pick() -> Text {
    @cfg(target_os = "windows")      { ";" }
    @cfg(not(target_os = "windows")) { ":" }
}
```

Say it with `return`, which leaves the per-platform structure intact:

```verum
fn pick() -> Text {
    @cfg(target_os = "windows")      { return ";"; }
    @cfg(not(target_os = "windows")) { return ":"; }
}
```

or, when the platforms differ only in a value, lift the predicate into an
expression and keep one exit:

```verum
fn pick() -> Text {
    if @cfg(target_os = "windows") { ";" } else { ":" }
}
```

Prefer the second form when the arms are values and the first when they
are procedures — a body of `@asm` or syscall statements is a statement
block already, and gating it needs nothing else.

The `return` form also carries the answer to the question it raises: what
happens on a target no arm names. Nothing forces the arms to be exhaustive,
so give the function a plain tail expression as its general case and let the
gated arms be the exceptions:

```verum
fn page_size() -> Int {
    @cfg(target_os = "linux") { return 4096; }
    @cfg(target_os = "macos") { return getpagesize(); }

    // Every other target — this is the function's value when no arm ran.
    4096
}
```

A function written this way is total by construction: adding a fourth
platform cannot silently turn it into a `Unit`-returning stub, because the
tail is always there. Reach for it whenever a sensible default exists — and
where none does, the absence should be loud, not a body that quietly ends
after the last arm.

```verum
implement UnixStream {
    // One body per platform under a single name — this is the idiom,
    // not a workaround. Exactly one survives for a given target.
    @cfg(target_os = "linux")
    public fn peer_cred(&self) -> Result<PeerCred, UnixError> { ... }

    @cfg(target_os = "macos")
    public fn peer_cred(&self) -> Result<PeerCred, UnixError> { ... }

    @cfg(target_os = "windows")
    public fn peer_cred(&self) -> Result<PeerCred, UnixError> { ... }
}
```

An excluded body is **dropped**, not merely skipped at run time: it is
never type-checked, so it may use imports and intrinsics that exist only
on its own target — which is what makes the per-platform method idiom
usable at all. Conversely, a name a block needs must be gated the same
way the block is; an import gated for one platform and used unguarded is
an error on every other.

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

Each attribute declares which syntactic positions it may appear on —
that's the design intent, and it does not currently hold as tested.
`@repr(C)` applied directly to a function (`@repr(C) fn f() {}`) was
checked with both `verum check` and `verum verify`: neither rejected
it, both reported the function proved/clean. **The transcript that
was here has been removed rather than corrected** — attribute-target
validation for `@repr(C)` on a function does not currently reject it,
so a "compile error" transcript would misrepresent what actually
happens. Whether this is enforced for other misapplied attributes is
untested.

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
