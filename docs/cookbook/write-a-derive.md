---
title: Writing a derive
description: A small `meta fn` that generates a protocol implementation.
---

# Writing a derive

We'll build `@derive(DisplayAll)` — a Display impl that prints every
field of a record.

### The macro

`src/derives.vr`:

```verum
use core.meta.*;

@meta_macro
pub meta fn derive_display_all<T>() -> TokenStream
    using [TypeInfo, AstAccess, CompileDiag]
{
    let name = TypeInfo.name_of::<T>();
    let fields = TypeInfo.fields_of::<T>();

    if fields.is_empty() {
        CompileDiag.emit_warning(
            Span.call_site(),
            &f"DisplayAll has nothing to display for unit type {name}",
        );
    }

    quote {
        implement Display for ${name} {
            fn fmt(&self, f: &mut Formatter) -> FmtResult {
                f.write_str(&f"${lift(name)} {{")?;
                $[for (i, field) in fields.iter().enumerate() {
                    $[if i > 0 {
                        f.write_str(&", ")?;
                    }]
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

### Using it

```verum
use .self.derives.derive_display_all;

@derive(DisplayAll)
type User is { id: Int, name: Text, email: Text };

fn main() {
    let u = User { id: 42, name: "Alice".to_string(), email: "a@b.c".to_string() };
    println(&f"{u}");
    // => User {id: 42, name: Alice, email: a@b.c}
}
```

### How it works

**`using [TypeInfo, AstAccess, CompileDiag]`** declares the three
capability contexts we need:

- `TypeInfo`: read the type's name and fields.
- `AstAccess`: build the generated tokens with `quote`.
- `CompileDiag`: emit warnings if the derive is misapplied.

**`TypeInfo.fields_of::<T>()`** returns `List<FieldInfo>` — each
entry has `.name`, `.type_name`, `.type_kind`, `.visibility`, etc.

**`quote { … }`** is hygienic. Interpolation forms:

- `${expr}` — splice the result of `expr` (a `TokenStream`).
- `$var` — shorthand for `${var}`.
- `$[for x in iter { … }]` — repetition.
- `$[if cond { … }]` — conditional.
- `lift(v)` — convert a runtime value (`Text`, `Int`, etc.) to a
  splice-able token.

### Debugging the expansion

```bash
$ verum expand-macros src/user.vr
```

Prints the post-expansion source so you can read exactly what
`@derive(DisplayAll)` produced.

### A more useful example — `@derive(Getters)`

```verum
@meta_macro
pub meta fn derive_getters<T>() -> TokenStream
    using [TypeInfo, AstAccess]
{
    let name = TypeInfo.name_of::<T>();
    let fields = TypeInfo.fields_of::<T>();

    let getters: List<TokenStream> = fields.iter().map(|f| {
        quote {
            pub fn ${f.name}(&self) -> ${f.type_name} {
                self.${f.name}.clone()
            }
        }
    }).collect();

    quote {
        implement ${name} {
            $[for g in getters { ${g} }]
        }
    }
}
```

Now `@derive(Getters) type Point is { x: Float, y: Float };` gets
`.x()` and `.y()` methods for free.

### Testing a derive

```verum
@cfg(test)
module tests {
    @derive(DisplayAll)
    type Pair is { a: Int, b: Int };

    @test
    fn renders_pair() {
        let p = Pair { a: 1, b: 2 };
        assert_eq(f"{p}", "Pair {a: 1, b: 2}".to_string());
    }
}
```

### Best practices for derives

- **Use the minimum capability set**. Most derives need
  `[TypeInfo, AstAccess]`; add `CompileDiag` if you need warnings;
  `MacroState` for caching across invocations.
- **Emit clear diagnostics on misuse**. A derive that silently
  produces wrong code is a future hour of debugging.
- **Use `quote` — don't string-concatenate Verum source**. The quote
  system handles hygiene; strings don't.
- **Prefer `lift(value)` over `format!` into the quote**. Cleaner,
  and it keeps spans right.

### See also

- **[Language → metaprogramming](/docs/language/meta/overview)**
- **[meta](/docs/stdlib/meta)** — contexts, reflection, TokenStream.
