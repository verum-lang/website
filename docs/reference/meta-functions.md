---
sidebar_position: 9
title: Meta Functions
description: The complete registry of `@`-prefix compile-time functions.
---

# Meta Functions

Verum uses the `@` prefix consistently for **compile-time** constructs:
attributes (`@derive(Debug)`), user-defined macros (`@sql_query("...")`),
and a set of compiler-built **meta functions** documented here. No
Rust-style `!` suffix exists anywhere in the language.

Every meta function:

- Runs at **compile time**, not runtime.
- Has **zero runtime cost** — its result is folded into the output.
- Can appear **anywhere an expression is expected** (and some also in
  attribute positions).

Grammar:

```ebnf
meta_function      = '@' , meta_function_name , [ '(' , [ argument_list ] , ')' ] ;
meta_function_name = 'const' | 'error' | 'warning' | 'stringify' | 'concat' | 'cfg'
                   | 'file' | 'line' | 'column' | 'module' | 'function'
                   | 'type_name' | 'type_fields' | 'field_access'
                   | 'type_of' | 'fields_of' | 'variants_of'
                   | 'is_struct' | 'is_enum' | 'is_tuple' | 'implements' ;
```

## Evaluation and diagnostics

### `@const(expr)`

Forces compile-time evaluation of an expression. Useful when the
compiler has not automatically constant-folded a call in a context
where constness is required (e.g. array sizes, refinements).

```verum
const MAX_WINDOW: Int = @const(compute_max_window(128, 16));

type Buffer is [Byte; @const(max_size())];
```

`@const` can only be applied to expressions that are *semantically*
pure and evaluable with only compile-time inputs. A call that reads
state (`&mut`, IO, tick counters) is a compile error.

### `@error("msg")`

Emits a compile-time error with the given message and aborts
compilation.

```verum
#[cfg(target_endian = "big")]
@error("verum_foo requires little-endian");
```

Often used conditionally under `@cfg(...)` to prevent unsupported
builds.

### `@warning("msg")`

Emits a compile-time warning but continues the compilation. The
message appears in `verum build` output with a `[W]` marker.

```verum
@warning("Deprecated: use the new API");
```

## Token manipulation

### `@stringify(tokens)`

Takes arbitrary tokens and returns their source form as a `Text`
literal, verbatim (with whitespace normalised).

```verum
let lhs = @stringify(x + 2 * y);       // "x + 2 * y"
```

Primarily used inside macros to produce human-readable error
messages.

### `@concat(a, b, ...)`

Concatenates its arguments — all literals — into a single `Text`,
`Ident`, or integer at compile time.

```verum
const GREETING: Text = @concat("Hello, ", "world!");
```

Used inside macros to synthesise new identifiers:

```verum
meta fn getter(name: ident) -> TokenStream {
    let g = @concat("get_", name);
    quote { fn $g(&self) -> Self.$name { self.$name } }
}
```

## Build configuration

### `@cfg(condition)`

Evaluates a **compile-time** configuration predicate. Returns a `Bool`.

Conditions can check:

- A build flag:    `@cfg(feature = "async")`
- A target:        `@cfg(target_os = "linux")`
- A profile:       `@cfg(profile = "release")`
- A combination:   `@cfg(all(unix, feature = "foo"))`
- A negation:      `@cfg(not(windows))`
- Any of:          `@cfg(any(debug, test))`

```verum
if @cfg(feature = "metrics") {
    record_metric("request", duration);
}

// Compile-time branch — dead code eliminated:
type Backend is @cfg(target_os = "linux") { EpollBackend }
                                    else  { KqueueBackend };
```

See `@cfg` conditions in the full form at
[reference/attribute-registry](/docs/reference/attribute-registry).

## Source location

These meta functions take **no arguments** and return the position
of the call site.

### `@file()`

Returns the source file path as a `Text`.

```verum
print(f"logged from {@file()}");       // logged from src/foo.vr
```

### `@line()`

Returns the source line number as an `Int`.

```verum
print(f"at line {@line()}");           // at line 42
```

### `@column()`

Returns the column (1-based) as an `Int`.

### `@module()`

Returns the current module's dotted path as a `Text`.

```verum
@module()   // "crate.net.server"
```

### `@function()`

Returns the current function's name as a `Text`.

```verum
fn handle(req: Request) -> Response {
    log(@function(), req);   // "handle"
    ...
}
```

## Type introspection

Compile-time type introspection lets macros inspect type structure.
All these return compile-time values used inside `meta fn` bodies.

### `@type_name<T>()`

Canonical name of `T` as a `Text`. Equivalent to `T.name` (see
[Type Properties](/docs/language/type-properties)).

```verum
@type_name<User>()            // "crate.models.User"
@type_name<List<Int>>()       // "core.collections.List<core.base.Int>"
```

### `@type_of(expr)`

The type of `expr`, as a compile-time type value.

```verum
let t = @type_of(user.email);       // Text
if @is_struct(@type_of(x)) { ... }
```

### `@type_fields<T>()`

Returns a compile-time `List<FieldDescriptor>` describing `T`'s fields
— name, type, offset, attributes.

```verum
meta fn describe<T>() {
    for field in @type_fields<T>() {
        @println(f"  {field.name}: {field.type_name}");
    }
}
```

### `@field_access<T>(instance, field_name)`

Produces an expression that accesses the named field on a value of
type `T`. Equivalent to `instance.field_name`, but computable at
compile time inside macros.

### `@fields_of<T>()`

Returns a compile-time `List<Text>` of `T`'s field names (in
declaration order). For records and tuple-like types.

### `@variants_of<T>()`

Returns the variant names of a variant (sum) type as a compile-time
`List<Text>`.

```verum
type Event is Click | Keypress | Tick;

const NAMES: List<Text> = @variants_of<Event>();   // ["Click", "Keypress", "Tick"]
```

### `@is_struct<T>()`

Is `T` a record type? Returns `Bool` at compile time.

### `@is_enum<T>()`

Is `T` a variant (sum) type?

### `@is_tuple<T>()`

Is `T` a tuple type?

### `@implements<T, P>()`

Does `T` implement protocol `P`?

```verum
meta fn debug_if_possible<T>(x: T) {
    if @implements<T, Debug>() {
        @println("{x:?}");
    } else {
        @println("<{@type_name<T>()}>");
    }
}
```

## Usage in macros

Meta functions are at their most useful inside `meta fn` bodies,
where they cooperate with `quote { ... }`:

```verum
meta fn derive_display<T>() -> TokenStream {
    let name = @type_name<T>();
    let fields = @type_fields<T>();

    quote {
        implement Display for $T {
            fn fmt(&self, f: &mut Formatter) -> FmtResult {
                f.write(f"{$name} {{");
                $[for field in fields {
                    f.write(f"  {${field.name}}: {self.${field.name}}");
                }]
                f.write("}")
            }
        }
    }
}
```

## Summary

| Function            | Returns                  | Stage   |
|---------------------|--------------------------|---------|
| `@const(e)`         | value of `e`             | compile |
| `@error(msg)`       | `!` (aborts)             | compile |
| `@warning(msg)`     | `()`                     | compile |
| `@stringify(t)`     | `Text`                   | compile |
| `@concat(a, b, …)`  | literal                  | compile |
| `@cfg(cond)`        | `Bool`                   | compile |
| `@file()`           | `Text`                   | compile |
| `@line()`           | `Int`                    | compile |
| `@column()`         | `Int`                    | compile |
| `@module()`         | `Text`                   | compile |
| `@function()`       | `Text`                   | compile |
| `@type_name<T>()`   | `Text`                   | compile |
| `@type_of(e)`       | type                     | compile |
| `@type_fields<T>()` | `List<FieldDescriptor>`  | compile |
| `@fields_of<T>()`   | `List<Text>`             | compile |
| `@variants_of<T>()` | `List<Text>`             | compile |
| `@is_struct<T>()`   | `Bool`                   | compile |
| `@is_enum<T>()`     | `Bool`                   | compile |
| `@is_tuple<T>()`    | `Bool`                   | compile |
| `@implements<T,P>()`| `Bool`                   | compile |
| `@field_access<T>(e, f)` | expression          | compile |

## See also

- **[Attributes](/docs/language/attributes)** — `@derive`, `@verify`,
  `@repr`, etc.
- **[Metaprogramming](/docs/language/metaprogramming)** — `meta fn`,
  `quote`, staged macros.
- **[Built-in Functions](/docs/reference/builtins)** — runtime
  counterparts (`print`, `assert`, `panic`).
- **[Type Properties](/docs/language/type-properties)** — `T.name`,
  `T.size`, runtime-reflected metadata.
