---
sidebar_position: 13
title: Modules
---

# Modules

Verum's module system is directory-driven: each `.vr` file is a module;
each directory containing `mod.vr` is a module; imports are explicit
with `mount`.

## File = module

```
src/
├── lib.vr            // module `my_cog` (root)
├── util.vr           // module `my_cog::util`
├── http/
│   ├── mod.vr        // module `my_cog::http`
│   ├── client.vr     // module `my_cog::http::client`
│   └── server.vr     // module `my_cog::http::server`
```

The root module is `src/lib.vr` (for libraries) or `src/main.vr` (for
applications). Its name is the `name` field of `Verum.toml`.

## `mount` — import

```verum
mount std.io;                // imports a specific module
mount std.{io, fmt};         // imports two modules
mount util.*;                // glob import (public items only)
mount http.client as hc;     // aliased import
mount .self.internal;        // import from the current cog
mount .super.sibling;        // import from the parent module's sibling
mount .crate.util;           // import from the cog's root
```

A `mount` brings names into scope. There is no implicit import; even
items from the same cog must be mounted.

## Visibility

```verum
pub       fn public_api()       { ... }   // exported from the cog
internal  fn cog_visible()      { ... }   // visible within this cog
          fn module_private()   { ... }   // visible in this module only
protected fn type_relative()    { ... }   // see below
```

- `pub` items are the cog's surface area — what other cogs see.
- `internal` items cross module boundaries within the cog but are not
  part of the public surface.
- No modifier → visible only in the defining module.
- `protected` — visible to types that extend or implement this one.
  Relevant for protocol internals and specialisation.

## Protocol coherence (orphan rule)

For any `implement P for T`, at least one of `P` or `T` must be defined
in the cog providing the implementation. This is the **orphan rule**.

Without it, two cogs could both provide an `implement Display for
ThirdPartyType`, and downstream users would be ambiguous about which
instance to call.

If you need to extend a foreign type with a foreign protocol, wrap the
type in a newtype:

```verum
type MyWrapper is (std.some.Foreign);

implement std.other.Protocol for MyWrapper {
    ...
}
```

## Re-exports

```verum
pub use .self.internal.Tool;    // makes `Tool` part of this module's API
pub use .self.util.*;           // re-exports everything public from `util`
```

Re-exports let you build a flat public API from a deeper internal
structure.

## Module-level items

The following items are valid at module scope:

- `type T is ...` — type definitions.
- `fn ...` — functions.
- `const X: T = v;` — constants.
- `static X: T = v;` — statics (require `unsafe` for `mut`).
- `implement ...` — protocol implementations.
- `module M { ... }` — inline submodules.
- `extern "C" { ... }` — FFI declarations.
- `context ...` — context definitions.
- `mount ...` — imports.
- `pub use ...` — re-exports.

## Cyclic modules

Cyclic `mount` is allowed — the compiler resolves cycles via
declaration-order reasoning and delayed elaboration. The practical
limit is that cyclic **type** definitions require an indirection
(`Heap<T>` or `Shared<T>`) to break the infinite-size cycle:

```verum
type Tree is
    | Leaf
    | Node { left: Heap<Tree>, right: Heap<Tree>, value: Int };
```

## Privacy is by item, not by file

A `pub` item inside a non-`pub` module is still reachable by its fully
qualified path — visibility is per item, not per path segment. The
compiler enforces the minimum visibility along the path for a given
use site.

## `cog` — the package

A cog is the unit of distribution. Cogs are described in `Verum.toml`;
see **[Cog Packages](/docs/tooling/cog-packages)** and
**[verum.toml reference](/docs/reference/verum-toml)**.

Within code, `.crate` refers to the cog's root module. `cog::name`
refers to a dependency cog.

## Reserved module names

- `core` — the built-in standard library.
- `std` — an alias for `core` at compile time.
- `meta` — the compile-time standard library.
- `intrinsics` — compiler intrinsics.

These names cannot be shadowed.
