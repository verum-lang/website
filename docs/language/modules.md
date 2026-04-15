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

Verum has a **five-level** visibility system. From most restrictive to
most permissive:

| Modifier              | Scope | Common use |
|-----------------------|-------|------------|
| (none) `Private`      | defining module only | implementation helpers |
| `pub(super)`          | parent module and descendants | sibling collaboration |
| `pub(in path)`        | a specific subtree named by `path` | curated APIs |
| `internal` / `pub(crate)` | entire current cog, not downstream | cog-wide utilities |
| `pub`                 | anywhere, including downstream cogs | the cog's stable API |

```verum
pub           fn public_api()       { ... }   // exported from the cog
internal      fn cog_visible()      { ... }   // aka pub(crate)
pub(super)    fn parent_visible()   { ... }
pub(in .crate.net) fn net_visible() { ... }   // just the net subtree
              fn module_private()   { ... }   // no modifier → private
protected     fn type_relative()    { ... }   // see below
```

- `protected` — visible to types that extend or implement this one.
  Relevant for protocol internals and specialisation; it is not a
  fifth visibility level but a protocol-local refinement.
- Visibility is evaluated per item, not per file — a `pub` item inside
  a non-`pub` module is still reachable by its full path, and the
  compiler enforces the **minimum** visibility along that path.

## Protocol coherence

For any `implement P for T`, at least one of `P` or `T` must be defined
in the cog providing the implementation. This is the **orphan rule**.
Without it, two cogs could both provide an `implement Display for
ThirdPartyType`, and downstream users would be ambiguous about which
instance to call.

Verum's `CoherenceChecker` enforces four guarantees at compile time:

1. **Orphan** — the `P`/`T` co-location rule above.
2. **Overlap detection** — two impls that can apply to the same value
   are rejected, even if neither is strictly more specialised.
3. **Specialisation checking** — an `impl<T: A> for Vec<T>` and a more
   specific `impl<T: A + B> for Vec<T>` form a well-founded
   hierarchy; diamonds are rejected.
4. **Cross-crate conflict detection** — when two dependency cogs both
   provide impls, the linker flags the conflict rather than silently
   picking one.

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

When a cycle cannot be resolved, the diagnostic includes a ranked list
of **break strategies** drawn from the actual dependency graph:

| Strategy            | What the compiler suggests you do |
|---------------------|-----------------------------------|
| `ExtractInterface`  | Lift a shared protocol into a new module both sides depend on. |
| `InvertDependency`  | Pass a callback or provider in instead of importing directly. |
| `LazyInit`          | Defer initialisation to a first-use helper. |
| `MergeModules`      | Collapse two tightly-coupled modules into one. |
| `MoveItems`         | Relocate the offending items to break the edge. |
| `RuntimeDependency` | Accept the cycle with runtime dispatch (dyn / `@injectable`). |

Strategies are ranked 1–5 on refactor complexity so you can pick the
cheapest option that fits.

## Conditional modules

Modules can be gated by `@cfg` attributes; the loader skips gated
modules whose predicate evaluates to false and does not parse them at
all, keeping the dependency graph minimal.

```verum
@cfg(feature = "gpu")
module gpu_backend;

@cfg(target_os = "linux")
module linux_specific;

@cfg(all(feature = "async", not(runtime = "embedded")))
module async_runtime;
```

Use this for optional backends, platform-specific code, and
runtime-tier-specific implementations without IFDEF-style noise.

## Language profiles

Every cog picks a **profile** that constrains which features are
available. The profile is declared in `Verum.toml` and propagates to
every module of the cog.

| Profile       | `async` | `unsafe` | Heap | Typical target |
|---------------|---------|----------|------|----------------|
| `application` | ✓       | — opt-in | ✓    | services, CLI tools, apps |
| `systems`     | ✓       | ✓        | ✓    | allocators, drivers, engines |
| `research`    | ✓       | ✓        | ✓    | proof-heavy code with `cubical`, `hott` |
| `embedded`    | —       | ✓        | stack-only | MCUs, bare-metal |

A module's profile determines which runtime it can target:
`embedded` triggers the async-to-sync transformation, `application`
requires `full` or `single_thread`, and `systems` permits `no_heap`
and raw `@repr(C)` exports.

## Incremental and parallel loading

The module loader is **VBC-first** and tracks a content hash on every
module; on rebuild, only modules whose hash changed (plus their
transitive dependents) are re-parsed and re-typed. Independent
modules in the same dependency layer load in parallel via `tokio`
(async builds) or `rayon` (synchronous builds). Typical effect on a
clean rebuild with warm caches: 3–8× speedup on multi-core machines.
See **[Architecture → incremental compilation](/docs/architecture/incremental-compilation)**
for the full cache layout.

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

## Shadowing and deprecation warnings

| Code | Meaning |
|------|---------|
| W001 | `PreludeShadowing` — a `mount` hides a prelude item |
| W002 | `UnusedImport` — the import brings nothing into use |
| W003 | `GlobImportShadowing` — a glob import silently overrode an explicit one |
| W004 | `DeprecatedItem` — the imported item is `@deprecated` |
| W005 | `SelfShadowing` — a re-export shadows an item with the same name |
| W006 | `ModuleNameCollision` — two modules resolve to the same canonical path |

Each code is individually suppressible with `@allow(W0NN)` on the
offending module or item.

## See also

- **[Tooling → cog packages](/docs/tooling/cog-packages)** — how
  modules map onto the distribution unit.
- **[Reference → verum.toml](/docs/reference/verum-toml)** — profile
  declaration, feature gates, dependency syntax.
- **[Architecture → incremental compilation](/docs/architecture/incremental-compilation)**
  — the cache and parallel-loading machinery.
- **[Cookbook → adding verification](/docs/cookbook/adding-verification)**
  — cross-module refinement contracts.
