---
sidebar_position: 4
title: Quote, Splice, and Hygiene
description: The `quote { ... }` template language, splice forms, and the mark-based hygiene model.
---

# `quote { ... }`, splicing, and hygiene

The single most important thing a meta function does is produce
code. Verum exposes two mechanisms for building code at compile time:
the imperative `TokenStream` builder (documented on the
[Token-stream API](./token-api) page), and the declarative `quote {
... }` template, which is the shape almost all macro bodies will use.

This page explains the quote form, the splice operators, and the
**hygiene model** that prevents the classic "macro introduced a
variable that shadows mine" bug.

## `quote { ... }` — an AST-valued expression

`quote { tokens }` is an expression whose value is a `TokenStream`
— a sequence of tokens that the compiler will splice back into the
program at macro expansion time. The tokens inside a quote are **not
type-checked** against the surrounding meta function; they are
type-checked once, at the expansion site, after splicing.

```verum
meta fn simple() -> TokenStream {
    quote {
        print("hello");
        let x = 42;
        x + 1
    }
}
```

The result of `simple()` is a `TokenStream`. When it is spliced into
the program, the parser sees those three statements and type-checks
them against the splice site's context.

### Multi-token quotes

A quote can contain any shape the grammar permits in the target
position:

- **Expression quote**: `quote { x + 1 }`
- **Statement quote**: `quote { let y = f(); }`
- **Item quote**: `quote { pub fn g(x: Int) -> Int { x * 2 } }`
- **Block quote**: `quote { { let a = 1; a + 1 } }`

The compiler checks at splice time that the splice site is
compatible with the shape; mismatches emit **E0410 unexpected token
in splice** with a pointer back to the `quote { ... }` that produced
them.

## Splice forms

A quote is useful only if it can reference its surroundings. Verum
provides five splice forms, each with distinct semantics.

### `${expr}` — value-into-AST splice

Evaluate `expr` at meta time and splice its value into the
surrounding quote. The spliced value must be something the compiler
can turn back into tokens: a `TokenStream`, a literal, an `Ident`,
or any type for which a `Quotable` implementation is in scope.

```verum
meta fn answer() -> TokenStream {
    let n: Int = 42;
    quote { let result = ${n}; }          // splices the literal `42`
}
```

### `$var` — shorthand for `${var}` on identifiers

A convenience form. These two lines are equivalent:

```verum
quote { let $name = 0; }
quote { let ${name} = 0; }
```

The `$var` form requires that `var`'s name would parse as an
identifier in the target position. For anything else (expressions,
paths, type expressions) use `${...}`.

### `$[ for ... ]` — iteration

Produce a sequence of tokens by iterating. The body of the
comprehension is itself a quote-like form that can contain further
splices.

```verum
meta fn derive_get<T>() -> TokenStream using [TypeInfo] {
    let fields = TypeInfo.fields_of<T>();
    let type_name = TypeInfo.name_of<T>();
    quote {
        implement ${type_name} {
            $[for f in fields.iter() {
                pub fn ${Ident.from(&f"get_{f.name}")}(&self) -> ${f.ty} {
                    self.${f.name}.clone()
                }
            }]
        }
    }
}
```

You can emit separators with `$[ for ..., sep = "," ]` when you
need a list that is comma-separated (as in argument lists).

### Conditional emission

A quote body does not have a dedicated `$[if ...]` form. To emit
tokens conditionally, build the quote at meta time:

```verum
let emit_trace = debug_mode;
let trace = if emit_trace {
    quote { CompileDiag.emit_note(&"generated fn foo", Span.current()); }
} else {
    TokenStream.empty()
};
quote {
    fn foo() {
        let x = 1;
        ${trace}
        x
    }
}
```

The conditional lives in Verum, not in the splice grammar, which
keeps the surface forms small and composable.

### `$$var` — raw splice (multi-stage escape)

In a multi-stage quote (`quote(2) { ... }`, `quote(3) { ... }`)
references from an outer stage must be written with `$$` to cross
one stage boundary, `$$$` to cross two, and so on. This is the only
place double-dollar appears. See the
[Staging](./staging) page for when this is needed.

## Quoting non-identifier values

The `Quotable` protocol defines how a value turns into tokens. The
standard implementations cover the common cases:

| Type                | Quoted form                                 |
|---------------------|---------------------------------------------|
| `Int`, `Float`, `Bool` | the literal                              |
| `Text`              | a `"..."` string literal                    |
| `Ident`             | the identifier verbatim                     |
| `TokenStream`       | the tokens inline                           |
| `List<T: Quotable>` | comma-separated token sequence              |
| `Span`              | **not** quotable — spans live in metadata   |

For your own types, implement `Quotable`:

```verum
implement Quotable for Color {
    fn to_tokens(&self) -> TokenStream {
        quote { Color { r: ${self.r}, g: ${self.g}, b: ${self.b} } }
    }
}
```

`lift(value)` is sugar for `value.to_tokens()` that makes the intent
explicit at the call site:

```verum
quote { let name = ${lift(current_type_name)}; }
```

## The hygiene model

The problem macros solve — "replace this source pattern with that
expansion" — comes with a well-known hazard: the expansion may
introduce names that accidentally collide with names the caller
expected. Verum's hygiene model eliminates this by tracking an
**expansion context** (a set of *marks*) on every identifier.

### Marks

A mark is an opaque token generated by the compiler each time a
quote block is entered. Every identifier introduced inside a quote
is stamped with the current mark. Two identifiers are considered
the same binding only if they share a compatible set of marks.

```verum
meta fn opaque_bind() -> TokenStream {
    quote {
        let y = 200;
        y
    }
}

fn caller() {
    let y = 100;
    let result = @opaque_bind!();   // expansion's `y` is not caller's `y`
    // result is 200; caller's `y` is still 100
}
```

The expansion's `y` and the caller's `y` have different mark sets, so
the compiler treats them as different bindings even though they share
a name.

### Spliced identifiers keep caller marks

When you splice an identifier into a quote via `${expr}`, the
identifier carries the marks of *where it was created*, not of
*where it is spliced*:

```verum
meta fn assign_to(name: Ident, val: Int) -> TokenStream {
    quote {
        let $name = ${val};   // $name carries the caller's marks
    }
}

fn caller() {
    let counter = 0;
    @assign_to!(counter, 99);
    // caller.counter is now 99 — the spliced `counter`
    // resolves to the caller's binding, as expected.
}
```

This is the property that makes macros compositional: a macro
author can receive an identifier from the caller, weave it into a
quote, and the identifier will still refer to the caller's binding
at the splice site.

### Explicit capture — the escape hatches

The opaque default catches the entire class of accidental-capture
bugs. When you *want* a macro to see the caller's binding — the
case for a truly inline-like macro — pass the identifier in as a
parameter and splice it with `${name}` or `$name`. The splice
retains the caller's marks, so the identifier resolves to the
caller's binding even though the quote body never declared it.

When an identifier inside a quote was neither introduced there nor
spliced in, the compiler raises a **hygiene violation** (classified
as a `MacroError`) with both spans:

- Primary span: the offending identifier inside the quote.
- Secondary span: the nearest binding in the caller's scope that
  the identifier would otherwise have resolved to.

The diagnostic's help line always suggests the safe fix —
receiving the identifier as a parameter or using `Hygiene.gensym`
for a fresh binding.

### `Hygiene.gensym`

When you need a fresh identifier — a loop counter, a temporary
variable for a borrow — use `Hygiene.gensym`:

```verum
meta fn with_lock(body: BlockAst) -> TokenStream using [Hygiene] {
    let g = Hygiene.gensym("_lock_guard");
    quote {
        let $g = self.lock.acquire();
        let _result = ${body};
        drop($g);
        _result
    }
}
```

`gensym("foo")` produces an identifier that renders as `foo_{N}`
for a fresh `N` and carries a brand-new mark. It is guaranteed not
to collide with anything the caller wrote, or with any other
`gensym` in the same or any other macro.

### `Hygiene.call_site()` and `def_site()`

Two spans are frequently needed in diagnostics:

- `Hygiene.call_site()` — the span where the macro was invoked.
- `Hygiene.def_site()` — the span where the macro was defined.

Use `call_site()` for errors that are the caller's fault ("your type
has no `name` field") and `def_site()` for errors that are the
macro's fault ("internal: malformed AST passed to my_helper").

## Quote debugging

Passing `--show-expansions` to `verum build` (or `verum check`)
dumps the post-expansion source for every macro in the build,
preserving spans and hygiene marks so you can see exactly which
identifier carries which context. The LSP exposes the same
expansion output inline when you hover over a macro invocation.

When a hygiene question is subtle, emit a structured diagnostic
from inside the macro itself via `CompileDiag.emit_note(...)` —
the note participates in the standard diagnostic pipeline and its
source span carries the hygiene context the compiler assigned.

## Worked example — a getter/setter derive with hygiene

```verum
@proc_macro_derive(Accessors)
pub meta fn derive_accessors<T>() -> TokenStream
    using [TypeInfo, AstAccess, Hygiene]
{
    let name = TypeInfo.name_of<T>();
    let fields = TypeInfo.fields_of<T>();

    quote {
        implement ${name} {
            $[for f in fields.iter() {
                pub fn ${Ident.from(&f"get_{f.name}")}(&self) -> &${f.ty} {
                    &self.${f.name}
                }

                pub fn ${Ident.from(&f"set_{f.name}")}(&mut self, value: ${f.ty}) {
                    self.${f.name} = value;
                }
            }]
        }
    }
}
```

Every generated identifier (`get_*`, `set_*`, the parameter `value`,
the `self` reference) carries the macro's hygiene context. A caller
who defines a field called `self` or `value` is unaffected; the
getters and setters see *their own* bindings, not the caller's.

## See also

- **[Compilation model](./compilation-model)** — when quote
  expansion runs.
- **[Macro kinds](./macro-kinds)** — how quotes are used in each
  macro form.
- **[Staging](./staging)** — multi-stage quotes, `$$` escapes.
- **[Token-stream API](./token-api)** — the imperative side of
  code construction.
- **[Diagnostics](./error-codes)** — the shape of hygiene errors
  and how to read them.
