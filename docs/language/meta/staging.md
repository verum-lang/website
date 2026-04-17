---
sidebar_position: 5
title: Multi-Stage Quoting
description: Running meta functions that produce meta functions — cross-stage references, `lift`, and the `$$` escape.
---

# Multi-stage quoting

In ordinary meta programming, a `meta fn` at **stage 1** produces
code that runs at **stage 0** (the program proper). That is enough
for derives, simple DSLs, and most compile-time code generation.
Sometimes it is not enough.

Verum supports **N-stage quoting** — a meta function can itself
produce a meta function, which produces another, and so on. Each
additional stage opens new ways to factor compile-time work, but it
also adds conceptual complexity. This page is about when you need
more than one stage, how to manage the extra bookkeeping, and how
the compiler tracks references that cross stage boundaries.

## Stages at a glance

| Stage | What runs where                                                  |
|:-----:|------------------------------------------------------------------|
| 0     | Runtime — the program the user executes                          |
| 1     | Compile time — meta functions, derive expansions, attribute macros |
| 2     | Meta-meta — a meta function that generates a meta function        |
| 3     | Meta-meta-meta — rarely needed; reserved for extension-writing    |

An ordinary `meta fn` is at stage 1. Its body can contain
`quote { ... }` blocks that target stage 0. When the meta function
returns, the returned `TokenStream` is spliced into stage-0 code.

A `meta(2) fn` is at stage 2. Its body can contain `quote(2) { ... }`
blocks that target stage 1. Inside a stage-2 quote you can nest a
stage-1 quote — that is how you build a meta function that builds a
meta function.

## When multi-stage is worth it

Most metaprogramming tasks need exactly one stage. Reach for
`meta(2)` only when you have a genuine two-level code-generation
need:

- **Macro-generating libraries** — a library that exports a
  `@declare_codec<Proto>()` meta fn, where the user wants to define
  their own `@derive(Codec)`-style macro specialised to that proto.
- **Staged evaluation for performance** — produce a specialised
  meta fn at compile time that itself elaborates further at a later
  build stage (common in ML frameworks: shape-specialise kernels
  now, fuse passes later).
- **Proof scripts that produce tactics** — a `meta(2) fn` generates
  a tactic combinator that the proof engine will run at stage 1
  against a specific goal.

If you cannot point at one of these needs, you probably want a
one-stage `meta fn`. Multi-stage quoting has a real cognitive cost.

## Declaring a multi-stage function

```verum
meta(2) fn generator_for<T>() -> quote(2)
    using [TypeInfo, AstAccess]
{
    let name = TypeInfo.name_of<T>();

    quote(2) {
        // This is stage 2, producing stage 1.
        meta fn inner() -> TokenStream
            using [TypeInfo, Hygiene]
        {
            // This is stage 1, producing stage 0.
            quote {
                fn make_${lift(name)}() -> ${lift(name)} {
                    ${lift(name)} { ... }
                }
            }
        }
    }
}
```

Reading from the outside in:

1. `meta(2) fn generator_for<T>` runs at compile time.
2. It returns a `quote(2)` — tokens that, when spliced, become a
   `meta fn` (stage 1).
3. That `meta fn`, when called at compile time, returns a quote
   that, when spliced, becomes a stage-0 function.

## Cross-stage references

The interesting bookkeeping is how a value bound at stage N becomes
available inside a stage-(N − 1) quote. The rule:

> A stage-N binding is **invisible** inside a stage-(N − 1) quote
> unless you explicitly transport it across the stage boundary.

Two operations transport values across stages:

### `lift(value)` — value-into-tokens

`lift` converts a compile-time value into a literal token. The
value must implement `Quotable`.

```verum
meta fn staged() -> TokenStream {
    let x = compute_at_compile_time();   // stage-1 binding
    quote {
        let y = ${lift(x)};              // the value of x is baked in
                                         //   as a stage-0 literal
    }
}
```

`${lift(x)}` and `${x}` are equivalent for most types; `lift` makes
the crossing explicit. Prefer `lift` in multi-stage code to make
the boundary legible.

### `$(stage N){ expr }` — cross-stage evaluation splice

The general form. `$(stage N){ expr }` evaluates `expr` at stage N
and splices the result into the enclosing quote. Shorthand: `${expr}`
when the stage is unambiguous (usually the next stage up).

```verum
meta(2) fn outer() -> quote(2) {
    let fields = compute_fields();   // stage-2 binding

    quote(2) {
        meta fn generated() -> TokenStream {
            let f_list = $(stage 2){ lift(fields) };
                                     // evaluates at stage 2,
                                     // splices the literal f_list
                                     // into the stage-1 meta body
            quote {
                $[for f in f_list { ${f.to_tokens()} }]
            }
        }
    }
}
```

### `$$var` — raw tokens across one stage boundary

When you want to splice a **token tree** (not a value) from an
outer stage into an inner quote, `$$var` performs one stage
unescape. Every additional `$` strips one stage.

```verum
meta(2) fn replicate(body: TokenStream) -> quote(2) {
    quote(2) {
        meta fn inner() -> TokenStream {
            quote {
                $$body          // these tokens come from stage 2,
                                //   verbatim, into stage 0
            }
        }
    }
}
```

A common mistake is writing `$body` inside a doubly nested quote
expecting tokens — you will get an error because `$body` is looking
for a stage-1 binding, not a stage-2 one.

## Stage mismatch errors

The compiler tracks the stage of every binding and every splice.
Mismatches are raised as a `MacroError` with a diagnostic that
identifies the bindings on both sides. The common shapes:

| Error                                                | Fix                                          |
|------------------------------------------------------|----------------------------------------------|
| Referring to a stage-2 value as `${x}` from stage 0  | Use `${lift(x)}` or `$(stage 2){ x }`        |
| Splicing stage-1 tokens with `$x` into stage 0       | Use `$$x` or compute at stage 1 then `lift`  |
| Calling `TypeInfo.…` at stage 0 from inside a quote  | Move the call outside the `quote { ... }`     |
| Using `$expr` where `expr` is not `Quotable`         | Implement `Quotable` for the type, or `lift` |

## `lift` limits

Not every value can be lifted. The compiler requires a `Quotable`
implementation — which exists for all built-in literal types,
`TokenStream`, `Ident`, and any `List<T: Quotable>` — but not for
things that have no canonical token form. You cannot `lift`:

- A function pointer or closure (no source form).
- A `&T` or `&checked T` (a reference has no compile-time value).
- An opaque handle (file descriptor, mutex, etc.).

Failed lifts surface as a `MacroError` pointing at the offending
`lift(...)` call and naming the type that lacks a `Quotable`
implementation. The fix is almost always to extract the relevant
serialisable information before lifting — for example, lift the
numeric ID of a type, not the type itself.

## Staging and hygiene

Each stage has its own hygiene context. An identifier introduced in
a stage-1 quote is invisible from stage 0 unless explicitly
transported by splicing it at the stage-crossing point.

```verum
meta(2) fn cross_hygiene() -> quote(2) {
    let outer_name = Hygiene.gensym("outer");

    quote(2) {
        meta fn inner() -> TokenStream using [Hygiene] {
            let inner_name = Hygiene.gensym("inner");
            quote {
                let ${lift(outer_name)} = 1;   // outer stage-2
                let $inner_name = 2;           // inner stage-1
                // ${outer_name} and $inner_name
                // are two distinct bindings, guaranteed.
            }
        }
    }
}
```

## Debugging multi-stage code

Staging bugs are notoriously opaque; the compiler gives you three
tools:

1. **`verum build --show-expansions`** dumps the post-expansion
   source of every quote in the build, preserving stage information
   so you can see exactly where a splice crosses a boundary.

2. **`StageInfo.current()` / `StageInfo.target()`** are meta-context
   methods that return the current stage and the stage a surrounding
   quote will be spliced into. Call them from a meta fn body and
   emit the result with `CompileDiag.emit_note(...)` to sanity-check
   where you are.

3. **Stage-mismatch diagnostics** always show **four** spans: the
   offending splice, the binding it tried to reach, the stage each
   one lives in, and a suggested fix (lift / raw-splice / move the
   expression). Read all four; the fix is usually obvious once you
   see them side-by-side.

## Practical example — a staged specialisation

A neural-network library exposes a `@specialise_for(shape)` attribute
that produces a type-specialised version of a forward-pass function
at compile time. The macro itself takes a shape parameter, then
produces a meta function that can be specialised further at runtime
build:

```verum
@proc_macro_attribute(specialise_for)
pub meta(2) fn specialise_for(
    shape: List<Int>,
    f: FnAst
) -> quote(2)
    using [TypeInfo, AstAccess, Hygiene]
{
    quote(2) {
        // Stage-1 meta fn specialised to this shape.
        meta fn generated_for_shape() -> TokenStream
            using [TypeInfo, Hygiene]
        {
            let tile = pick_tile_size($(stage 2){ lift(shape) });
            quote {
                fn specialised_forward(input: ${lift_type(shape)})
                    -> ${lift_type(shape)}
                {
                    // Shape-specific kernel with tile = $tile.
                    ${lift(expand_kernel(shape, tile))}
                }
            }
        }

        // Immediately invoke the generated meta fn.
        @generated_for_shape
    }
}
```

Usage:

```verum
@specialise_for([32, 64, 64, 256])
fn forward(input: Tensor) -> Tensor { ... }
```

At compile time, `specialise_for` produces a stage-1 meta fn
`generated_for_shape` which itself is expanded immediately, yielding
a stage-0 `specialised_forward` function baked for the chosen tile
size. The original `forward` is left as a reference implementation
for correctness testing; the specialised variant is what runs in
production.

## See also

- **[Compilation model](./compilation-model)** — how stages fit into
  the multi-pass compilation pipeline.
- **[Quote and hygiene](./quote-and-hygiene)** — single-stage
  quoting (the common case).
- **[Token-stream API](./token-api)** — the types you'll use to
  carry values between stages.
- **[Diagnostics](./error-codes)** — stage-mismatch and lift-failure
  diagnostics.
