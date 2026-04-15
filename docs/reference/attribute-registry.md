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

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@verify(runtime)` | fn, type | refinements → `assert`, run at runtime |
| `@verify(static)` | fn, type | dataflow + CBGR + refinement typing (default) |
| `@verify(smt)` | fn, type | discharge via Z3/CVC5 via router |
| `@verify(z3)` | fn, type | force Z3 |
| `@verify(cvc5)` | fn, type | force CVC5 |
| `@verify(portfolio)` | fn, type | Z3 + CVC5 cross-validated |
| `@verify(cross_validate)` | fn, type | portfolio, disagreement = error |
| `@verify(certified)` | fn, type | proof term required and machine-checked |

## FFI

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@extern("C")` | fn, extern block | C linkage |
| `@extern("C", calling_convention = "X")` | fn | override calling convention |
| `@ownership(transfer_to = "caller" \| "callee")` | ffi item | ownership transfer at boundary |
| `@ownership(borrow = [...])` | ffi item | params are borrowed, not transferred |

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

## Testing

| Attribute | Targets | Semantics |
|-----------|---------|-----------|
| `@test` | fn | register as a unit test |
| `@test(property)` | fn | property-based test |
| `@test(ignore)` | fn | skip in normal runs |
| `@bench` | fn | register as a benchmark |
| `@fuzz` | fn | register as a fuzz target |

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

## Custom attributes

User-defined via `@meta_macro` (see
**[Language → metaprogramming](/docs/language/metaprogramming)**).

## See also

- **[Language → attributes](/docs/language/attributes)** — usage-level
  guide.
- **[Language → metaprogramming](/docs/language/metaprogramming)** —
  writing your own.
