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
├── util.vr           // module `my_cog.util`
├── http/
│   ├── mod.vr        // module `my_cog.http`
│   ├── client.vr     // module `my_cog.http.client`
│   └── server.vr     // module `my_cog.http.server`
```

The root module is `src/lib.vr` (for libraries) or `src/main.vr` (for
applications). Its name is the `name` field of `verum.toml`.

## `mount` — import

```verum
mount core.io;               // stdlib module (`core` is the stdlib root)
mount core.{io, text};       // imports two modules
mount core.math.frameworks.lurie_htt;
                             // deep path into a stdlib subtree
mount util.*;                // glob import (public items only)
mount http.client as hc;     // aliased import
mount .self.internal;        // import from the current cog
mount .super.sibling;        // import from the parent module's sibling
mount .crate.util;           // import from the cog's root
```

A `mount` brings names into scope. Verum's stdlib lives under the `core`
root (not `std`) — every stdlib module is `core.<subpath>`.

:::caution The stdlib is visible without a mount

This page used to say "there is no implicit import; even items from the
same cog must be mounted." For your own cog that holds. For the standard
library it does not, and the difference matters when you are reasoning
about what a module can reach.

Every **public** `core` symbol resolves bare, however deep it lives:

```verum
fn main() { print(WAL_MAGIC_LE); }   // compiles, with no mount at all
```

`WAL_MAGIC_LE` is declared in
`core/database/sqlite/native/l1_pager/journal/wal.vr` — nine module levels
down, nowhere near a prelude. The same holds for `OUTPUT_SIZE`
(`core/hash/crypto/sha256.vr`) and `MAX_EXPAND_OUTPUT_256`
(`core/security/kdf/hkdf.vr`).

This is not blanket leniency: a name that does not exist is still an error
(`ZZ_NO_SUCH_CONST_ZZ` gives `E100`). The stdlib's public surface is simply
all in scope.

Two consequences worth planning around:

- **A `mount` of a stdlib value documents intent; it does not restrict
  reach.** Deleting one rarely breaks a build, so the imports in a file are
  not a reliable inventory of what it actually uses.
- **A misspelled import can land on a namesake instead of failing.** If the
  module you name does not export the symbol but some *other* module
  declares one with that name, the bare visibility satisfies it. In the
  standard library this has bound X.509 certificate validity fields to the
  unit type `Time` from `core.time`, and an HTTP/2 `Frame` to a terminal
  render frame — each time with no diagnostic at the import.

:::

:::caution `mount core.*` costs a great deal and buys nothing

A glob of the stdlib root is not a shorter way to write the mount you
meant. Every public `core` symbol already resolves bare (above), so the
glob adds no reach — and it makes the compiler enumerate a surface it
would otherwise never look at.

Checked on one three-line program, identical but for the
mount line:

```verum
// none.vr — and the same body under each mount below
fn main() {
    let xs = [1, 2, 3];
    print(f"n={xs.len()}");
}
```

```
verum run none.vr                                 # n=3   exit 0    6s
verum run glob.vr     # mount core.*;             #       exit 124  killed at 400s
```

Exit 124 is `timeout` cutting it off, not the program finishing: the
glob build had not produced an answer after six and a half minutes,
against six seconds for the identical program. The page used to say
"minutes", which was true and understated.

**The cost is in building, not in checking.** `verum check` answers in
about a second for all three spellings — no mount, the precise
`mount core.collections.list.{List};`, and the glob — so a type-check
will not warn you about this. It surfaces when you run or build.

**And it buys nothing.** The same file without any mount at all
type-checks `let m: Map<Text, Int> = Map.new();`, because every public
`core` symbol already resolves bare (above). The glob is not being
ignored — `mount core.nosuchmodule.*;` is refused with
`error<E402>: module not found` — it is doing real work that changes no
answer.

Mount the module or the item you mean. If you want the import list to
document what a file uses, the precise form is also the only form that
does that.
:::

## Visibility

Visibility modifiers apply to individual declarations. `public` and `pub`
are equivalent spellings; an unmarked declaration is private. The grammar also
accepts restricted public forms, `internal`, `protected` and explicit `private`.

The current module access checker applies these rules when an exported item
reaches it:

| Modifier | Rule in the module access checker |
|----------|-----------------------------------|
| (none) or `private` | Defining module only. |
| `pub(super)` | Immediate parent module only; it does not grant access to siblings or more distant ancestors. |
| `pub(in path)` | The named module and its subtree. |
| `pub(cog)` | Modules in the same cog. |
| `public` or `pub` | Any module. |
| `internal` | Defining module only in the current implementation. |
| `protected` | Defining module only in the current implementation. |

**Implementation limitation:** `internal` is parsed as a distinct modifier,
not as an alias of `pub(cog)`. Although it expresses intended visibility within
the cog, the module checker does not give it the same access as `pub(cog)`.
Similarly,
`protected` does not grant access to submodules or implementing types through
this check. See the
[visibility parser](https://github.com/verum-lang/verum/blob/main/crates/verum_fast_parser/src/decl.rs),
[declaration model](https://github.com/verum-lang/verum/blob/main/crates/verum_ast/src/decl.rs)
and [`VisibilityChecker`](https://github.com/verum-lang/verum/blob/main/crates/verum_modules/src/visibility.rs).

:::caution Import visibility is not uniform across compiler paths

The access rules above apply only after an item reaches an export table.
Ordinary source export extraction includes unrestricted `public` declarations
only. It omits restricted forms such as `pub(cog)`, `pub(super)` and
`pub(in path)`, as well as private, `internal` and `protected` declarations.
A restricted helper can therefore be refused during import even when its
intended scope includes the caller.

The compiler uses that public-only extraction for source cog dependencies and
cross-file module registration. A separate project-file loading path places
otherwise non-public declarations in its export table as public. Consequently,
accepting an import through one path does not establish that private helpers
remain hidden through every compilation path. These are current implementation
limitations.

The relevant boundaries are
[`extract_exports_with_policy`](https://github.com/verum-lang/verum/blob/main/crates/verum_modules/src/exports.rs),
[dependency and project-file loading](https://github.com/verum-lang/verum/blob/main/crates/verum_compiler/src/pipeline/loading.rs)
and [cross-file registration](https://github.com/verum-lang/verum/blob/main/crates/verum_compiler/src/pipeline/cross_file.rs).

There is also a separate name-resolution fallback in the
[code generator](https://github.com/verum-lang/verum/blob/main/crates/verum_vbc/src/codegen/mod.rs):
a failed qualified lookup can bind a bare name instead. A `[mount-fallback]`
warning identifies that route. A successful call through it is not evidence
that the written module path or its visibility was respected.

:::

## Protocol coherence

For any `implement P for T`, at least one of `P` or `T` must be defined
in the cog providing the implementation. This is the **orphan rule**.
Without it, two cogs could both provide an `implement Display for
ThirdPartyType`, and downstream users would be ambiguous about which
instance to call.

Verum's `CoherenceChecker` checks four guarantees at compile time and
reports violations as `[coherence]` warnings — measured on the current
toolchain, an orphan implementation and a pair of overlapping
implementations both compile and run:

1. **Orphan** — the `P`/`T` co-location rule above.
2. **Overlap detection** — two implement blocks that can apply to the same value
   are flagged, even if neither is strictly more specialised.
3. **Specialisation checking** — an `implement<T: A> P for List<T>`
   and a more specific `implement<T: A + B> P for List<T>` form a
   well-founded hierarchy; diamonds are flagged.
4. **Cross-cog conflict detection** — when two dependency cogs both
   provide impls, the linker flags the conflict rather than silently
   picking one.

If you need to extend a foreign type with a foreign protocol, wrap the
type in a newtype:

```verum
mount third_party.some.Foreign;
mount third_party.other.Protocol;

type MyWrapper is (Foreign);

implement Protocol for MyWrapper {
    ...
}
```

## Re-exports

```verum
public mount .self.internal.Tool;    // makes `Tool` part of this module's API
public mount .self.util.*;            // re-exports everything public from `util`
```

Re-exports let you build a flat public API from a deeper internal
structure.

A glob — whether mounted or re-exported — carries the target's public
types, protocols and constants, and carries free functions that reach
you through the prelude's re-export chain:

* `mount core.prelude.*` then `range(0, 5)` — works;
* `mount core.base.iterator.*` then `range(0, 5)` — works.

One case does **not** yet hold: a direct glob of a module whose free
functions do not travel that chain. `mount core.text.format.*` followed
by a bare `println_empty()` still fails to resolve; name the function
(`mount core.text.format.println_empty;`) until that is closed. This is
a known gap, not a design decision.

## Using a name without mounting it

A fully-qualified path is an expression, so a name can be used once
without bringing it into scope at all:

```verum
print(core.hash.crypto.sha256.OUTPUT_SIZE);   // 32
```

This is the same resolution `mount` performs, run for that one
occurrence: the module is loaded and the item resolved exactly as a
mount would, but the short name is **not** left bound afterwards. Writing
`core.a.b.NAME` once does not make `NAME` visible on the next line — for
that, mount it.

Prefer a `mount` when a name is used more than once; the qualified form
earns its keep where a single reference would otherwise force an import
that reads as a dependency the file does not really have.

Both spellings load the same modules and compile in the same time, so
the choice is about readability alone.

```verum
mount core.base.iterator.*;

fn main() {
    let r = range(0, 5);      // a free function, in scope from the glob
    let e: Range<Int> = r;    // a type, likewise
}
```

Inherent methods (`List.push`) are not module-level names and are never
introduced by a mount — they are reached through their receiver.

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
- `public mount ...` — re-exports.

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
available. The profile is declared in `verum.toml` and propagates to
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

`public` marks a declaration's intended exported API. The module must also
resolve and the item must reach its export table. See the
[visibility limitations](#visibility) for the current differences between
source imports and project-file loading; a modifier alone does not establish
that every qualified access path enforces the same boundary.

## `cog` — the package

A cog is the unit of distribution. Cogs are described in `verum.toml`;
see **[Cog Packages](/docs/tooling/cog-packages)** and
**[verum.toml reference](/docs/reference/verum-toml)**.

Within code, `.crate` refers to the cog's root module. `cog.name`
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
| W001 | `PreludeShadowing` — a local declaration shadows a prelude item of the same name |
| W002 | `UnusedImport` — the import brings nothing into use |
| W003 | `GlobImportShadowing` — the same name arrives from two glob mounts |
| W004 | `DeprecatedItem` — the imported item is `@deprecated` |
| W005 | `SelfShadowing` — a definition shadows one of the same name in an outer scope |
| W006 | `ModuleNameCollision` — one module name is declared both by a file and inline |

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
