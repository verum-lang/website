---
sidebar_position: 17
title: Metaprogramming
---

# Metaprogramming

Verum's metaprogramming system has three parts:

1. **`@attribute` invocation** — how macros are _called_.
2. **`meta fn`** — compile-time functions.
3. **`quote { ... }`** — structured AST templates.

No `!` suffix. No opaque syntax macro transformers. All expansions
are visible, hygienic, and debuggable.

## Calling a macro

```verum
@derive(Clone, Eq, Debug)
type User is { id: Int, name: Text };

@repeat(3, { print("warming"); })
fn warmup() using [IO] { ... }

@sql_query("""
    SELECT id, name FROM users WHERE id = :id
""")
fn get_user(id: Int) -> User using [Database] { ... }
```

- `@name(args)` — macro invocation with parenthesised args.
- `@name[tokens]` — token-tree form for DSLs.
- `@name{tokens}` — brace form for block-like macros.

## Built-in `meta` functions

| Macro | Purpose |
|-------|---------|
| `@derive(...)` | synthesise protocol impls |
| `@repr(C)`, `@repr(transparent)`, `@repr(align(N))` | control memory layout |
| `@cfg(feature = "x")` | conditional compilation |
| `@const expr` | force compile-time evaluation |
| `@cold`, `@hot`, `@inline`, `@never_inline` | optimisation hints |
| `@unused`, `@must_use` | parameter / return-value markers |
| `@file`, `@line`, `@column`, `@module`, `@function` | source-location info |
| `@type_name`, `@type_fields`, `@variants_of` | reflection |
| `@implements(Protocol)` | compile-time protocol check |
| `@verify(mode)` | set verification strategy |
| `@extern("C")` | FFI linkage |
| `@test`, `@bench` | test / benchmark markers |

## `meta fn`

A `meta fn` runs at compile time. Its arguments are `quote`d token
streams; its return value is a `quote` to splice back in.

```verum
meta fn repeat(n: meta Int, body: quote) -> quote {
    quote {
        for _ in 0..${n} { ${body} }
    }
}

// Callers:
fn demo() using [IO] {
    @repeat(3, { print("tick") })
}
```

## `quote { ... }`

`quote { ... }` builds a hygienic AST:

```verum
let call = quote { println("hello", ${name}) };
// `call` is a token tree; `name` is substituted at quote-expansion time.
```

Splicing forms:
- `${expr}` — splice an expression or token tree.
- `$var` — short form for a single identifier.
- `$[for x in xs { ... }]` — iterate to produce a sequence.
- `$$var` — double-escape (for multi-stage quotes).

## Hygiene

Verum quotes are **opaque by default**: identifiers introduced inside
`quote { ... }` cannot accidentally capture bindings from the caller,
and references inside the quote resolve at the quote's *definition
site*, not the expansion site.

```verum
meta fn opaque() -> quote {
    quote {
        let x = 200;   // introduced by the macro
        x              // resolves to 200, not to any caller's `x`
    }
}

fn caller() {
    let x = 100;
    @opaque();         // `caller.x` is untouched; macro's `x` is fresh
}
```

### How it works

Every identifier carries a **syntax context** — an expansion chain
plus a set of *marks*. When the quote expander enters a quote block
it stamps a fresh mark on every binding it introduces. Two
identifiers resolve to the same binding only if their mark sets are
compatible. Caller marks never collide with callee marks, so capture
is impossible without an explicit opt-in.

### Splicing preserves hygiene

```verum
meta fn assign(name: Ident, value: Int) -> quote {
    quote {
        let $name = ${value};   // $name carries caller-site marks;
                                // ${value} evaluates in the macro
    }                           // before being stamped and spliced in
}
```

Spliced identifiers retain the marks of where they originated, so a
spliced name shadows exactly what the *caller* expected it to shadow.

### Intentional capture

If you *want* to refer to a caller binding, say so explicitly. These
attributes control the default transparency:

| Attribute | Effect |
|-----------|--------|
| `@transparent` | Inherit the caller's scope entirely (like an inline function). |
| `@semi_transparent` | Caller types visible, caller values not. |
| `@capture(x, y)` | Opaque, except `x` and `y` are bound from the caller. |

Without one of these, referring to a caller binding is rejected with
`M408 capture not declared`.

### `gensym` for fresh, unnameable identifiers

```verum
meta fn with_guard() -> quote {
    let g = gensym("guard");
    quote {
        let $g = acquire_lock();
        critical_section();
        drop($g);
    }
}
```

`gensym(prefix)` mints an identifier that is guaranteed not to shadow
or collide with anything in the caller's scope, even if the caller
happens to have a binding of the same source name.

## Multi-stage quoting

A `meta(N) fn` produces code that produces code N−1 times. Each stage
has its own hygiene context; references across stages require an
explicit bridge.

```verum
meta(2) fn double_stage() -> quote(2) {
    quote(2) {
        meta fn generated() -> quote {
            quote { 42 }
        }
    }
}
```

### Cross-stage references

Values bound at stage N are invisible to stage N−1 quotes unless you
transport them with `lift` (value) or `${ expr }` (expression
evaluated now):

```verum
meta fn cross_stage() -> quote {
    let x = 42;              // stage 1 binding
    quote {
        // let y = x;        // M405 stage mismatch — x lives at stage 1
        let y = lift(x);     // OK — lifts 42 into the stage-0 AST
        let z = ${x + 1};    // OK — computes 43 at stage 1, splices the literal
    }
}
```

### Stage-escaped splices

`$(stage N){ expr }` evaluates `expr` at stage N and splices the
result into the enclosing quote. It is the explicit form of the `${ }`
shorthand and is the only way to reach into a higher stage from a
lower one.

## Error codes

| Code  | Meaning |
|-------|---------|
| M400 | malformed quote expression |
| M401 | `$` or unquote used outside a quote |
| M402 | hygiene violation — accidental capture |
| M403 | gensym collision (internal) |
| M404 | cannot resolve identifier inside quote |
| M405 | stage mismatch in quote / unquote |
| M406 | cannot `lift` a value of this type |
| M407 | malformed token tree |
| M408 | capture attempted without `@capture` / `@transparent` |
| M409 | length mismatch in `$[for ...]` expansion |

## `lift(value)`

Converts a compile-time value into a token that can be spliced:

```verum
meta fn make_greeting(who: meta Text) -> quote {
    let msg = f"Hello, {who}!";
    quote { print(${lift(msg)}); }
}
```

## Derives

`@derive(P)` expands into `implement P for T { ... }`. The expansion is
deterministic and inspectable with `verum expand-macros`.

Standard derives live in `core::derives`: `Clone`, `Copy`, `Debug`,
`Display`, `Eq`, `Hash`, `Ord`, `PartialEq`, `PartialOrd`, `Default`,
`Builder`, `Serialize`, `Deserialize`, `Error`, `From`, `Into`.

## Procedural macros

User-defined procedural macros are `meta fn`s exported as macros:

```verum
@meta_macro
meta fn sql_query(query: quote) -> quote {
    let parsed = sql::parse(&query.to_text()?)?;
    let sig    = parsed.to_function_signature();
    let body   = parsed.to_binding_code();
    quote {
        fn _inner(${sig.params}) -> ${sig.ret} using [Database] {
            ${body}
        }
    }
}
```

## Capability-gated execution

A `meta fn` is pure by default — it can:
- inspect types (via `@type_fields`, `@variants_of`);
- produce diagnostics (via `CompileDiag`);
- access build-time assets (via `BuildAssets`);
- evaluate other `meta` functions.

It **cannot** perform IO, network, or file access — unless it
explicitly requests the capability:

```verum
meta fn read_schema() -> quote using [meta.BuildAssets] {
    let content = BuildAssets.load("schema.sql")?;
    quote { ${lift(content)} }
}
```

This keeps compilation deterministic and caches valid.

## Debugging

```bash
$ verum expand-macros src/main.vr
$ verum expand-macros --filter "@derive"
```

Emits the post-expansion source so you can read what `@derive(Clone)`
actually produced.

## Worked example — a small `@derive(DisplayAll)`

```verum
@meta_macro
pub meta fn derive_display_all<T>() -> TokenStream
    using [TypeInfo, AstAccess, CompileDiag]
{
    let name = TypeInfo::name_of::<T>();
    let fields = TypeInfo::fields_of::<T>();

    quote {
        implement Display for ${name} {
            fn fmt(&self, f: &mut Formatter) -> FmtResult {
                f.write_str(&f"${lift(name)} {{")?;
                $[for (i, field) in fields.iter().enumerate() {
                    $[if i > 0 { f.write_str(&", ")?; }]
                    f.write_str(&${lift(field.name.clone())})?;
                    f.write_str(&": ")?;
                    self.${field.name}.fmt(f)?;
                }]
                f.write_str(&"}")?;
                Result.Ok(())
            }
        }
    }
}
```

Usage:

```verum
@derive(DisplayAll)
type User is { id: Int, name: Text, email: Text };

print(&f"{User { id: 42, name: \"Alice\".to_string(), email: \"a@b.c\".to_string() }}");
// => User {id: 42, name: Alice, email: a@b.c}
```

See **[Writing a derive](/docs/cookbook/write-a-derive)** for a
full walk-through (debugging with `verum expand-macros`, handling
variants, using `CompileDiag`).

## See also

- **[Stdlib → meta](/docs/stdlib/meta)** — `TokenStream`, `quote`,
  reflection types, the 13 capability contexts.
- **[Attributes](/docs/language/attributes)** — the full registry of
  `@` annotations.
- **[Reference → attribute registry](/docs/reference/attribute-registry)**
  — every standard `@` with target and semantics.
- **[Cookbook → write a derive](/docs/cookbook/write-a-derive)** —
  task-oriented walkthrough.
- **[Cookbook → `@logic` functions](/docs/cookbook/logic-functions)** —
  how `meta` composes with SMT reflection.
