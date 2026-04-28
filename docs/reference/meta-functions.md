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

## Build-asset embedding

Compile-time file loading is sandboxed behind the `BuildAssets`
context. All paths are restricted to the project root and
configured asset directories — absolute paths and `..`
traversal are rejected with a meta error.

### `@embed(path)` — file bytes literal

Loads the file at `path` (relative to the project root) and
substitutes its bytes as a `Bytes` constant in the AST. Equivalent
to calling `include_bytes(path)` from inside a `meta fn` but
spelled as an attribute-style macro call so it composes
naturally with constant declarations.

```verum
const ICON: Bytes = @embed("assets/icon.png");
const FONT: Bytes = @embed("fonts/Inter-Regular.ttf");
```

The macro call evaluates at compile time; the resulting bytes
are baked into the binary. Path traversal (`..`) and absolute
paths produce a compile error rather than reaching the
filesystem.

### `@embed_glob(pattern)` — match-many bytes literal

Walk the project tree once and return every file matching the
pattern as a `List<(Text, Bytes)>` keyed on the relative path.
Single-level glob today (`*` / `?` in the basename component);
recursive `**` lands in a follow-up.

```verum
const ICONS: List<(Text, Bytes)> = @embed_glob("assets/icons/*.png");
// ICONS[0] = ("assets/icons/error.png", <bytes>)
// ICONS[1] = ("assets/icons/info.png",  <bytes>)
// ICONS[2] = ("assets/icons/warn.png",  <bytes>)
```

Pattern grammar:

| Token | Meaning |
|-------|---------|
| `*`   | zero or more chars within one path component |
| `?`   | exactly one char |
| literal | verbatim match |
| `**`  | reserved (recursive walk) — rejected today with a clear diagnostic |

Wildcards in the directory component require `**` support and
are rejected for the single-level MVP. Output is sorted by path
so generated bytecode is deterministic regardless of platform
readdir ordering.

### `include_bytes(path)` — meta-fn form

```verum
meta fn embed_icon(name: Text) -> Bytes using [BuildAssets] {
    let path = text_concat("icons/", name, ".png");
    include_bytes(path)
}
```

Same dispatcher as `@embed`; pick whichever form composes
better with the surrounding code. The meta-fn form is the right
choice when the path is computed (loops, cog-info-driven
prefixes, etc.); `@embed` is the right choice for a literal
constant declaration.

### `load_text(path)` / `include_str(path)` — UTF-8 text

Read a file as `Text` instead of `Bytes`. Both names register
the same dispatcher; pick whichever reads better at the call
site.

```verum
meta fn load_template(name: Text) -> Text using [BuildAssets] {
    let path = text_concat("templates/", name, ".html");
    include_str(path)
}
```

### `@codegen(path)` / `load_toml(path)` — declarative spec parsing

Parse a TOML document at compile time and lift it into a
`Map<Text, Any>` for downstream meta-fn consumption. The MVP
foundation for `@codegen` user-meta-fn invocation: once a meta
fn can take the parsed spec as a `Map`, it can build whatever
declarations it needs from the data — record types from a
schema table, intrinsic stubs from a syscall list, lookup
tables from a config file.

```verum
const SPEC: Map<Text, Any> = @codegen("schemas/users.toml");
// SPEC["table"]   == Text("users")
// SPEC["columns"] == Array([Map{name=..., kind=...}, ...])
```

| TOML shape          | `MetaValue` shape                |
|---------------------|----------------------------------|
| string              | `Text`                           |
| integer             | `Int`                            |
| float               | `Float`                          |
| boolean             | `Bool`                           |
| datetime (RFC 3339) | `Text` (Display form)            |
| array               | `Array<MetaValue>`               |
| table               | `Map<Text, MetaValue>`           |

The root document **must** be a top-level table. Bare values
(`name = "x"` is a table with one key, but `[42, 43]` as the
whole document) are rejected with a clear diagnostic.

Both `load_toml` (function-call form) and `codegen` (macro-call
attribute form) resolve to the same dispatcher; pick whichever
reads better at the call site. Both inherit the standard
`BuildAssets` sandbox: absolute paths, `..` traversal, and
symlinks crossing the project root all fail before the
filesystem is touched.

### Asset queries

| Function                | Signature                                            | Description                       |
|-------------------------|------------------------------------------------------|-----------------------------------|
| `asset_exists(path)`    | `(Text) -> Bool`                                     | True if the file exists           |
| `asset_list_dir(path)`  | `(Text) -> List<Text>`                               | List directory entries            |
| `asset_metadata(path)`  | `(Text) -> (UInt, UInt, Bool, Bool, Bool)`           | size, mtime ns, is_dir/file/symlink |

All four require `using [BuildAssets]` in a `meta fn`; the
attribute forms (`@embed`, `@include_str`) inherit the same
sandbox automatically.

### Sandbox guarantees

- **Absolute paths rejected.** `/etc/passwd` and similar fail
  the precheck before any filesystem syscall fires.
- **No `..` traversal.** A path containing `..` returns
  `MetaError::Other("Path traversal …")`.
- **No symlinks across the root boundary.** A symlink under the
  project root that resolves outside the root fails the same
  precheck.
- **No environment variable expansion.** Paths are taken as
  literal source-relative paths.

## Version stamping

Compile-time injection of (cog version, git revision, build time)
without forcing the build to drag in network or environment-
variable access. The pipeline driver populates the underlying
data substrate (`ProjectInfoData.git_revision`,
`build_time_unix_ms`); the builtins read it.

### `@version_stamp()` — canonical triple

```verum
const STAMP: (Text, Text, UInt) = @version_stamp();
// (cog version, git SHA-1, build time ms since unix epoch)
```

The triple is the canonical shape. Each component has a
deterministic fallback so the generated bytecode is identical
regardless of whether `git` is on PATH or whether the build is
running in `--no-version-stamp` reproducible mode:

| Component | Source | Fallback |
|-----------|--------|----------|
| version | `version` field of `Verum.toml` | the field itself (cogs MUST declare a version) |
| git revision | `git rev-parse HEAD` at pipeline start | empty string `""` |
| build time ms | `SystemTime::now()` at pipeline start | `0` |

### `@project_git_revision()` — bare SHA

```verum
const REV: Text = @project_git_revision();
```

Returns just the SHA-1 (or empty string when unavailable).
Useful for log banners, HTTP `User-Agent`, panic-handler
breadcrumbs — anywhere only the revision is needed and pulling
in version + timestamp would be noise.

### `@project_build_time_ms()` — bare timestamp

```verum
const BUILT_AT: UInt = @project_build_time_ms();
```

Returns just the millisecond stamp (or `0` when suppressed).

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
| `@embed(path)`      | `Bytes`                  | compile (BuildAssets) |
| `@embed_glob(pat)`  | `List<(Text, Bytes)>`    | compile (BuildAssets) |
| `@codegen(p)` / `load_toml(p)` | `Map<Text, Any>` | compile (BuildAssets) |
| `include_bytes(p)`  | `Bytes`                  | compile (BuildAssets, meta-fn form) |
| `load_text(p)` / `include_str(p)` | `Text`     | compile (BuildAssets) |
| `asset_exists(p)`   | `Bool`                   | compile (BuildAssets) |
| `asset_list_dir(p)` | `List<Text>`             | compile (BuildAssets) |
| `asset_metadata(p)` | `(UInt, UInt, Bool, Bool, Bool)` | compile (BuildAssets) |
| `@version_stamp()`  | `(Text, Text, UInt)`     | compile (ProjectInfo) |
| `@project_git_revision()` | `Text`             | compile (ProjectInfo) |
| `@project_build_time_ms()` | `UInt`            | compile (ProjectInfo) |

## See also

- **[Attributes](/docs/language/attributes)** — `@derive`, `@verify`,
  `@repr`, etc.
- **[Metaprogramming](/docs/language/meta/overview)** — `meta fn`,
  `quote`, staged macros.
- **[Built-in Functions](/docs/reference/builtins)** — runtime
  counterparts (`print`, `assert`, `panic`).
- **[Type Properties](/docs/language/type-properties)** — `T.name`,
  `T.size`, runtime-reflected metadata.
