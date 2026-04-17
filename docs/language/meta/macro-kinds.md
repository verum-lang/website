---
sidebar_position: 3
title: The Four Macro Kinds
description: Derive, attribute, function-like, and declarative macros — when to use each, what they look like, and how the compiler handles them.
---

# The four macro kinds

Verum ships four surface forms for macros. They differ in where they
appear syntactically, what inputs they receive, and what output shape
they are expected to produce. All four are ultimately `meta fn`s —
pure compile-time functions operating on token trees — but the
compiler treats each form distinctly so that the surface syntax
stays clean.

| Kind               | Syntax                            | Input                       | Typical output               |
|--------------------|-----------------------------------|-----------------------------|------------------------------|
| **Derive**         | `@derive(Protocol)` on a type     | The type declaration's AST  | One or more `implement` blocks |
| **Attribute**      | `@name(args)` on any item         | Item AST + args             | Transformed item(s)          |
| **Function-like**  | `@name!(…)` in expr/stmt position | Arbitrary token tree        | An expression or block       |
| **Declarative**    | `macro_rules`-style patterns      | Pattern-matched tokens      | Pattern-substituted tokens   |

The rest of this page treats each in turn.

## Derive macros

A derive synthesises a protocol implementation from the structural
shape of a type. The user writes one line of `@derive(P)`; the
compiler produces an `implement P for T { ... }` block.

### Shape

```verum
@proc_macro_derive(Clone)
pub meta fn derive_clone<T>() -> TokenStream
    using [TypeInfo, AstAccess]
{
    let name = TypeInfo.name_of<T>();
    let fields = TypeInfo.fields_of<T>();

    quote {
        implement Clone for ${name} {
            fn clone(&self) -> Self {
                Self {
                    $[for f in fields {
                        ${f.name}: self.${f.name}.clone(),
                    }]
                }
            }
        }
    }
}
```

### Reference-type awareness

A derive that blindly calls `.clone()` on every field will produce
broken code for fields whose type is a reference (`&T`, `&checked T`,
`&unsafe T`) — references don't have a `clone` method and you rarely
want to deep-copy them anyway. Every shipped derive inspects field
types via `TypeInfo` and generates the appropriate handling:

- `&T` fields: copy the reference (it's just a `Copy` of the 16-byte
  `ThinRef`).
- `Heap<T>` fields: call `.clone()` which goes through `Clone` on
  `T`.
- `Shared<T>` fields: call `.clone()` which bumps the ref count.
- `Mut<T>` fields: call `.clone()` only if `T: Clone`; otherwise
  emit `E4102 cannot derive Clone for field f: Mut<T> where T: !Clone`
  with a suggestion.

### Variant handling

Sum types get one arm per variant. For each variant the compiler
emits a destructure, clones each payload field by the rules above,
and reconstructs.

```verum
type Shape is | Circle { r: Float } | Rect { w: Float, h: Float };

// @derive(Clone) generates:
implement Clone for Shape {
    fn clone(&self) -> Self {
        match self {
            Shape.Circle { r } => Shape.Circle { r: r.clone() },
            Shape.Rect { w, h } => Shape.Rect { w: w.clone(), h: h.clone() },
        }
    }
}
```

### The shipped derive catalogue

The initial-release core ships six built-in derives — `Clone`,
`Debug`, `Default`, `PartialEq`, `Serialize`, `Deserialize` — with
additional derives (`Display`, `Error`, `Builder`, …) available as
standard-library derives. See [Derives catalogue](./derives) for
the full list with exact generated-code semantics.

### User-defined derives

Any meta function marked `@proc_macro_derive(Name)` and taking a
single `<T>` type parameter becomes available as `@derive(Name)` on
type declarations.

## Attribute macros

An attribute macro attaches to a declaration and transforms it. The
input is the annotated item's AST; the output replaces the item.
This is the most flexible form and the one most at risk of abuse —
use attribute macros when derive macros are too restrictive but
function-like macros would hide too much of the item's structure.

### Shape

```verum
@proc_macro_attribute(traced)
pub meta fn traced_fn(f: FnAst) -> TokenStream
    using [AstAccess, Hygiene, CompileDiag]
{
    // f.name is an Ident, f.params is List<Param>, f.body is BlockAst, etc.
    let span_var = Hygiene.gensym("_tracer_span");
    quote {
        fn ${f.name}(${f.params}) -> ${f.return_type} using ${f.contexts} {
            let ${span_var} = Tracer.enter(${lift(f.name.to_text())});
            let _result = ${f.body};
            Tracer.exit(${span_var}, &_result);
            _result
        }
    }
}
```

### Usage

```verum
@traced
fn compute(x: Int) -> Int using [Tracer] {
    x * x + 1
}
```

### Composition

Attributes compose top-to-bottom. If you write

```verum
@traced
@verify(formal)
@logic
fn add(x: Int, y: Int) -> Int { x + y }
```

the expander runs `@logic`, then `@verify(formal)`, then `@traced`.
The macro author can ask for the current invocation order via
`AstAccess.attribute_chain()` and decide whether to pre-process or
post-process.

### Mutating vs wrapping

Attribute macros come in two conventional flavours:

- **Wrapping** (`@traced` above): take the original function, emit
  a new function that calls it.
- **Mutating** (`@derive`-like): examine the structure, synthesise
  additional items, leave the original in place.

Both are expressible. Convention is to prefer wrapping when the
attribute adds behaviour and mutating when it adds protocol
implementations.

## Function-like macros

Function-like macros appear in expression or statement position and
consume arbitrary token trees. They are what you reach for when you
want a DSL, an inline code generator, or a terse syntax for a
pattern the compiler does not have built in.

### Shape

```verum
@proc_macro(sql_query)
pub meta fn sql_query(tokens: TokenStream) -> TokenStream
    using [AstAccess, CompileDiag]
{
    let query_text = tokens.as_text_literal()?;
    let parsed = match sql.parse(&query_text) {
        Result.Ok(p) => p,
        Result.Err(e) => {
            CompileDiag.emit_error(&f"sql: {e.message}", e.span);
            return TokenStream.empty();
        }
    };
    quote {
        Database.execute(${lift(query_text)}, ${lift(parsed.param_names())})
    }
}
```

### Usage

```verum
let rows = @sql_query!("SELECT * FROM users WHERE id = :id");
```

The brace forms `@name[…]` and `@name{…}` exist for DSLs that prefer
square brackets (array-like) or braces (block-like):

```verum
let m = @matrix[
    1 0 0;
    0 1 0;
    0 0 1;
];

let dsl = @html_block{
    <div class="card">
      <h2>{title}</h2>
    </div>
};
```

All three forms have identical semantics; they differ only in which
closing delimiter the parser expects.

### Expression vs item position

A function-like macro may appear:

- In **expression** position: the output must parse as an expression.
- In **statement** position: the output may parse as a statement or
  a block.
- In **item** position: the output may contain one or more
  declarations.

The compiler picks the expected shape from syntactic context and
reports a diagnostic if the expansion does not match.

## Declarative macros (pattern-based)

A declarative macro is pure syntax-directed rewriting, no meta
function body required. It is Verum's answer to Rust's
`macro_rules!` or Scheme's `syntax-rules`.

### Shape

```verum
@declarative
pub macro vec3 {
    ( $x:expr , $y:expr , $z:expr ) => quote {
        Vec3 { x: $x, y: $y, z: $z }
    };

    ( $v:expr ; $n:expr ) => quote {
        {
            let value = $v;
            Vec3 { x: value, y: value, z: value }
        }
    };
}
```

### Usage

```verum
let a = @vec3!(1.0, 2.0, 3.0);   // matches the first rule
let b = @vec3!(0.0; 3);          // matches the second rule
```

### Token-tree fragments

Inside a pattern, `$name:kind` captures a token tree of a given
kind. Supported kinds:

| Kind          | Matches                                      |
|---------------|----------------------------------------------|
| `expr`        | A full expression                            |
| `stmt`        | A statement                                  |
| `ty`          | A type expression                            |
| `pat`         | A pattern                                    |
| `ident`       | An identifier                                |
| `literal`     | A literal token                              |
| `path`        | A dotted or `::`-separated path              |
| `block`       | A `{ ... }` block                            |
| `meta`        | A meta token (used in attribute composition) |
| `tt`          | A single token tree (any shape)              |

### Repetition

Fragments can be repeated with `$( … )sep` where `sep` is an
optional separator token:

```verum
@declarative
pub macro println {
    ( $fmt:literal $( , $arg:expr )* ) => quote {
        IO.println(&f"${fmt}"$(, ${arg})*)
    };
}

@println!("x = {}, y = {}", x, y);
```

### When to reach for each form

Pick the minimum power:

1. If you're deriving a protocol from a type's shape → **derive macro**.
2. If you're transforming a single item (function, type, impl) →
   **attribute macro**.
3. If your input is pure syntactic pattern-matching with no
   semantic analysis → **declarative macro**.
4. If you need arbitrary computation over token trees, interleaved
   with type reflection or build-asset access → **function-like
   macro**.

Using a more powerful form than necessary makes macros harder to
read, harder to maintain, and slower to compile. The declarative
form is strictly faster to expand than the function-like form because
it does not need to invoke the meta interpreter.

## Error handling inside macros

Every form can emit compile errors through `CompileDiag`:

```verum
CompileDiag.emit_error("can only derive for records", span);
CompileDiag.emit_warning("this macro is deprecated — prefer @NewApi",
                         Span.current());
CompileDiag.emit_note("see docs at /docs/language/meta/...",
                      Span.current());
CompileDiag.abort();   // stop expansion; produce no output
```

The emitted diagnostics participate in the normal Verum error
pipeline: they appear in `verum build` output, the LSP shows them
inline, and they are fully structured (severity, class, primary
and secondary spans, notes, help) so test suites can match them
programmatically. See [Diagnostics](./error-codes).

## Integration with the context system

Every macro declares its capabilities with `using [...]`. The set
of contexts the macro *may* request is the 14 compile-time
meta-contexts documented under
[stdlib → meta](/docs/stdlib/meta). The most common combinations:

| For …                                   | Use                                               |
|-----------------------------------------|---------------------------------------------------|
| a simple derive                         | `[TypeInfo, AstAccess]`                           |
| a derive that emits diagnostics         | `[TypeInfo, AstAccess, CompileDiag]`              |
| a derive that needs fresh identifiers   | `[TypeInfo, AstAccess, Hygiene]`                  |
| an attribute that reads project state   | `[AstAccess, ProjectInfo, CompileDiag]`           |
| a literal handler                       | `[AstAccess, CompileDiag]`                        |
| a schema-driven code generator          | `[BuildAssets, TypeInfo, Schema, CompileDiag]`    |
| a build-time feature flag               | `[ProjectInfo, CompileDiag]`                      |

A macro that requests a context it never uses emits a linter
warning. A macro that uses a context it did not declare is a
`MacroError` — the compiler refuses to expand it.

## See also

- **[Compilation model](./compilation-model)** — how macros are
  scheduled in the multi-pass pipeline.
- **[Quote and hygiene](./quote-and-hygiene)** — the `quote { ... }`
  template language.
- **[Token-stream API](./token-api)** — the `TokenStream`, `FnAst`,
  and related types macro bodies manipulate.
- **[Derives](./derives)** — the shipped derive catalogue with
  exact generated-code semantics.
- **[Diagnostics](./error-codes)** — diagnostic categories and
  structure.
