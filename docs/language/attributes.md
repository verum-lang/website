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

Each derive is a procedural macro under `core::derives`.

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

The solver (Z3, CVC5, or portfolio) is picked by the capability
router, not by you — see
**[verification → SMT routing](/docs/verification/smt-routing)**.

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
**[Metaprogramming](/docs/language/metaprogramming)**):

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
