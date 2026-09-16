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

:::info What a name outside that production does

The production above is the grammar's enumeration. The compiler recognises
a larger set — the numeric family (`@abs`, `@sqrt`, `@min`, `@max`,
`@clamp`, `@pow`, …), the backend hatches (`@intrinsic`, `@vbc`, `@asm`),
and a handful of runtime helpers — and **every name outside what it
recognises is refused, by name, at the call.**

```verum
let v = @zzznotathing(1);
// error<E0410>: unknown meta-function `@zzznotathing`: no compiler builtin
//               and no `meta` declaration of that name is in scope
```

Arity and argument kinds are checked too:

```verum
@abs(1, 2, 3)   // error<E0443>: `@abs` takes exactly 1 argument, but 3 were given
@abs()          // error<E0443>: `@abs` takes exactly 1 argument, but 0 were given
@sqrt("text")   // error<E0444>: `@sqrt` argument 1 must be a number, but it is `Text`
```

A name the language reserves and the compiler cannot yet lower is refused
as well, and says which of the two it is:

```verum
@type_name(Int)
// error<E0442>: `@type_name` is not implemented: the grammar's
//               `meta_function_name` production lists it, but no lowering
//               exists, so the call has no value to produce
```

:::

:::note How it used to behave, and why the change matters

Until this was fixed, none of the four calls above stopped the build. The
parser emitted `warning<E0410>: unknown meta-function`, the expression took
the type `Unit`, and the call lowered to `nil`.

`nil` is indistinguishable from a legitimate answer, so the failure was
loud only where `Unit` happened not to fit:

```verum
const REV: Text = @project_git_revision();
// warning: unknown meta-function `@project_git_revision`
// error<E400>: Type mismatch: expected 'Text', found 'Unit'
```

That is the loud half. The quiet half had no second line at all — in
*statement* position `Unit` is exactly what the position wants, so nothing
was mismatched and nothing was reported:

```verum
// From the standard library, until 2026-09-10. `Thread.yield_now`'s
// Linux branch was written as an open-coded syscall:
@cfg(target_arch = "x86_64")  { @syscall(24); }
@cfg(target_arch = "aarch64") { @syscall(124); }
// warning: unknown meta-function `@syscall`
// …and nothing else. Both branches compiled to nothing, so a spin loop
// calling yield_now never gave way to the scheduler — no crash, no
// wrong value, no diagnostic anyone reads.
```

The same silence cost `File.size()` its answer: `core/io/file.vr` built the
`fstat(2)` buffer with `@zeroed()`, which is not a meta-function, so the
buffer was a zero-byte object handed to an FFI.

:::

Sections marked **Not yet callable** below are in this state: the builtin
is implemented in the compiler, but no spelling reaches it yet. Calling one
is now an error naming the name, not a silent `nil`.

:::

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
@cfg(target_endian = "big")
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
fn handle(duration: Int) {
    if @cfg(feature = "metrics") {
        record_metric("request", duration);
    }
}

// Compile-time branch — dead code eliminated:
@cfg(target_os = "linux")
type Backend is EpollBackend;
@cfg(target_os = "macos")
type Backend is KqueueBackend;
```

See `@cfg` conditions in the full form at
[reference/attribute-registry](/docs/reference/attribute-registry).

## Source location

These meta functions take **no arguments** and return the position
of the call site.

:::caution `@line()` and `@column()` answer 0, and `@file()` answers a module

Measured against the shipped compiler: `@line()` and `@column()` return
**0** everywhere, and `@file()` returns the enclosing function's module
prefix rather than a path. Code generation carries no source position for
the call, and the accessors behind these three say `Placeholder` in their
own bodies.

The signatures below are the contract; the values are not yet the ones the
contract promises. They are documented here rather than in a changelog
because a reader who logs `@line()` and sees `0` needs to know it is the
compiler, not their program.

`@module()` and `@function()` do answer correctly.

:::

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

## Numeric

Thirteen numeric meta-functions fold to a single VBC instruction each.
They are not in the grammar's `meta_function_name` production — they reach
expression position through `meta_call`, which admits any path — but the
compiler implements every one.

`@abs`, `@min`, `@max`, `@clamp` and `@pow` are polymorphic over `Ord`, so
integer arguments give an integer answer. The rest are float-in, float-out.

```verum
@abs(0 - 5)          // 5
@min(3, 7)           // 3
@max(3, 7)           // 7
@clamp(9, 1, 5)      // 5
@pow(2, 3)           // 8

@sqrt(4.0)           // 2.0
@floor(1.7)          // 1.0
@ceil(1.2)           // 2.0
@round(1.5)          // 2.0
@sin(x) @cos(x) @tan(x) @log(x) @exp(x)
```

The polymorphic result type is what makes the common shape work — a
dynamic-programming recurrence over `Int` stays `Int`:

```verum
dp[i][j] = @max(dp[i - 1][j], dp[i][j - 1]);
```

Each name's arity is fixed and checked: `@pow(2)` and `@clamp(9, 1)` are
errors, not silently-defaulted calls.

## Type introspection

:::caution Not yet callable

Every name in this section is **reserved and refused**. The compiler
recognises each one — they are in the grammar's own `meta_function_name`
production — and has no lowering for any of them, because lowering needs
the type checker's view of the argument threaded into code generation and
that path does not exist yet.

```verum
@type_name(Int)
// error<E0442>: `@type_name` is not implemented: the grammar's
//               `meta_function_name` production lists it, but no lowering
//               exists, so the call has no value to produce
```

The signatures below describe the intended behaviour and are the contract
an implementation has to meet. Until then, a refusal naming the name is the
honest answer — these used to evaluate to `nil` in silence.

:::

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

### `@implements(T, P)`

Does `T` implement protocol `P`?

```verum
meta fn debug_if_possible<T>(x: T) {
    if @implements(T, Debug) {
        @println("{x:?}");
    } else {
        @println("<{@type_name<T>()}>");
    }
}
```

## Build-asset embedding

:::caution Not yet callable

`@embed`, `@embed_glob` and `@codegen` are implemented in the compiler's
builtin registry, but no `@`-spelling reaches them: written as shown they
warn `E0410` and evaluate to `Unit`. The behaviour described in this
section is the design; treat the code blocks as the intended surface, not
as working examples.

Both halves of that are one command each, so this box can be checked
rather than believed:

```
grep -c '"embed"'  crates/verum_compiler/src/meta/builtins/build_assets.rs
grep -rc '"@embed"' crates/ --include='*.rs'     # 0 — the sigil form
```

The first finds the registration; the second finds nothing. Re-measured
2026-09-10.

:::

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

Walk the project tree and return every file matching the
pattern as a `List<(Text, Bytes)>` keyed on the relative path.

```verum
// Direct children of assets/icons/
const ICONS: List<(Text, Bytes)> = @embed_glob("assets/icons/*.png");

// Every PNG anywhere under assets/, at any depth
const ALL_IMAGES: List<(Text, Bytes)> = @embed_glob("assets/**/*.png");

// Every file in the project, at any depth
const ALL_FILES: List<(Text, Bytes)> = @embed_glob("**");
```

Pattern grammar:

| Token | Meaning |
|-------|---------|
| `*`     | zero or more chars within one path component (does not cross `/`) |
| `?`     | exactly one char within one path component |
| `**`    | zero or more path components — recursive descent. Must be a standalone component (`a**b` is rejected) |
| literal | verbatim match |

Output is sorted lexicographically by relative path so
generated bytecode is reproducible across platforms regardless
of `readdir` ordering. Walk depth is capped at 64 levels to
prevent symlink-induced cycles from exhausting the stack.

Sandbox: absolute paths and `..` traversal are rejected before
the filesystem walk starts; symlinks crossing the project root
are rejected by the per-file `resolve_path` precheck.

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
| `asset_exists(path)`    | `(Text) -> Bool`                                     | True if the file exists           | not yet callable |
| `asset_list_dir(path)`  | `(Text) -> List<Text>`                               | List directory entries            | not yet callable |
| `asset_metadata(path)`  | `(Text) -> (UInt, UInt, Bool, Bool, Bool)`           | size, mtime ns, is_dir/file/symlink | not yet callable |

All four require `using [BuildAssets]` in a `meta fn`; the
attribute forms (`@embed`, `@include_str`) inherit the same
sandbox automatically.

### Sandbox guarantees

- **Absolute paths rejected.** `/etc/passwd` and similar fail
  the precheck before any filesystem syscall fires.
- **No `..` traversal.** A path containing `..` returns
  `MetaError.Other("Path traversal …")`.
- **No symlinks across the root boundary.** A symlink under the
  project root that resolves outside the root fails the same
  precheck.
- **No environment variable expansion.** Paths are taken as
  literal source-relative paths.

## Version stamping

:::caution Not yet callable

`@version_stamp`, `@project_git_revision` and `@project_build_time_ms`
are implemented in the compiler's builtin registry, but no `@`-spelling
reaches them: written as shown they warn `E0410` and evaluate to `Unit`.
The measured output is in the note at the top of this page; the two
halves of WHY are one grep each, re-measured 2026-09-10:

```
grep -rn '"version_stamp"\|"project_git_revision"\|"project_build_time_ms"' crates/ --include='*.rs'
# three hits, all in verum_compiler/src/meta/builtins/project_info.rs
#   — the implementations exist

grep -c 'version_stamp\|project_git_revision\|project_build_time_ms' crates/verum_fast_parser/src/expr.rs
# 0 — and KNOWN_META_FUNCTIONS in that file is the list the PARSER
#     consults, so no `@`-spelling can reach the three implementations
```

Two registries, and a name in one but not the other is exactly this
failure. Treat the code blocks below as the intended surface.

:::

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
| build time ms | `SystemTime.now()` at pipeline start | `0` |

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

The **Status** column is the compiler's own answer, not a plan: a name
marked *refused* is rejected at the call with a diagnostic naming it.

| Function            | Returns                  | Stage   | Status |
|---------------------|--------------------------|---------|--------|
| `@const(e)`         | value of `e`             | compile | works |
| `@error(msg)`       | `!` (aborts)             | compile | works |
| `@warning(msg)`     | `()`                     | compile | works |
| `@stringify(t)`     | `Text`                   | compile | works |
| `@concat(a, b, …)`  | literal                  | compile | works |
| `@cfg(cond)`        | `Bool`                   | compile | works |
| `@file()`           | `Text`                   | compile | answers a module name |
| `@line()`           | `Int`                    | compile | answers 0 |
| `@column()`         | `Int`                    | compile | answers 0 |
| `@module()`         | `Text`                   | compile | works |
| `@function()`       | `Text`                   | compile | works |
| `@abs(x)`           | `Int` or `Float`         | compile | works |
| `@min(a, b)`        | `Int` or `Float`         | compile | works |
| `@max(a, b)`        | `Int` or `Float`         | compile | works |
| `@clamp(v, lo, hi)` | `Int` or `Float`         | compile | works |
| `@pow(a, b)`        | `Int` or `Float`         | compile | works |
| `@sqrt(x)` `@sin` `@cos` `@tan` `@log` `@exp` `@floor` `@ceil` `@round` | `Float` | compile | works |
| `@type_name<T>()`   | `Text`                   | compile | refused |
| `@type_of(e)`       | type                     | compile | refused |
| `@type_fields<T>()` | `List<FieldDescriptor>`  | compile | refused |
| `@fields_of<T>()`   | `List<Text>`             | compile | refused |
| `@variants_of<T>()` | `List<Text>`             | compile | refused |
| `@is_struct<T>()`   | `Bool`                   | compile | refused |
| `@is_enum<T>()`     | `Bool`                   | compile | refused |
| `@is_tuple<T>()`    | `Bool`                   | compile | refused |
| `@implements(T,P)`| `Bool`                   | compile | refused |
| `@field_access<T>(e, f)` | expression          | compile | refused |
| `@embed(path)`      | `Bytes`                  | compile (BuildAssets) | not yet callable |
| `@embed_glob(pat)`  | `List<(Text, Bytes)>`    | compile (BuildAssets) | not yet callable |
| `@codegen(p)` / `load_toml(p)` | `Map<Text, Any>` | compile (BuildAssets) | not yet callable |
| `include_bytes(p)`  | `Bytes`                  | compile (BuildAssets, meta-fn form) | not yet callable |
| `load_text(p)` / `include_str(p)` | `Text`     | compile (BuildAssets) | not yet callable |
| `asset_exists(p)`   | `Bool`                   | compile (BuildAssets) | not yet callable |
| `asset_list_dir(p)` | `List<Text>`             | compile (BuildAssets) | not yet callable |
| `asset_metadata(p)` | `(UInt, UInt, Bool, Bool, Bool)` | compile (BuildAssets) | not yet callable |
| `@version_stamp()`  | `(Text, Text, UInt)`     | compile (ProjectInfo) | not yet callable |
| `@project_git_revision()` | `Text`             | compile (ProjectInfo) | not yet callable |
| `@project_build_time_ms()` | `UInt`            | compile (ProjectInfo) | not yet callable |

## See also

- **[Attributes](/docs/language/attributes)** — `@derive`, `@verify`,
  `@repr`, etc.
- **[Metaprogramming](/docs/language/meta/overview)** — `meta fn`,
  `quote`, staged macros.
- **[Built-in Functions](/docs/reference/builtins)** — runtime
  counterparts (`print`, `assert`, `panic`).
- **[Type Properties](/docs/language/type-properties)** — `T.name`,
  `T.size`, runtime-reflected metadata.
