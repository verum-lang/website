---
title: Module system
description: How the loader, registry, and ID allocators cooperate
---

# Module system

The module subsystem is the sole source of truth for resolving dotted
paths like `core.mesh.xds.resources` into (a) a concrete file on disk
and (b) a stable set of exported items visible to importers. Three
interlocking invariants must hold for this to be correct:

1. **One canonical key per module.** A given source file must be
   addressable by exactly one dotted path after canonicalisation,
   regardless of which import form reached it.
2. **One `ModuleId` per module.** Even if multiple subsystems
   independently ask to resolve the same module, they must all agree
   on the same numeric `ModuleId`.
3. **One `ModuleRegistry` per compilation.** There can be multiple
   *views* into the registry (through `Shared<RwLock<…>>` handles),
   but the state behind them must be a single authoritative record.

Violating any of the three produces the same class of symptom:
`Conflicting export: 'X' already exported from ModuleId(Y)` warnings
where the same name and the same source file appear twice under
different IDs.

## The three subsystems

| Subsystem | Crate | Role |
|-----------|-------|------|
| `ModuleLoader` | `verum_modules` | Finds `.vr` files on disk, parses, caches ASTs |
| `ModuleRegistry` | `verum_modules` | Owns loaded `ModuleInfo` + ID allocation |
| `Session` | `verum_compiler` | Owns the authoritative registry + ID allocators |

Each compilation is anchored by a single `Session`. Every loader and
every downstream consumer (type inference, VBC codegen, verification)
reads through the session's handles.

## Canonicalisation — ensuring invariant #1

The same file can appear under two dotted paths:

- The *absolute* form declared in the source:
  `module core.mesh.xds.resources;`
- The *relative* form derived from the filesystem (the loader's root
  is `core/`, so the fs-derived key is `mesh.xds.resources`).

Both must resolve to the same key. This is what `cog_name` on
`ModuleLoader` and `ModuleRegistry` does: when set, any path whose
first segment matches the cog name is canonicalised by stripping
that segment. `Pipeline::new_core` and `Pipeline::new` both pin
`cog_name = "core"` on the session-wide registry and on every loader
derived from the session.

```rust
let mut loader = session.create_module_loader();
loader.set_cog_name("core");           // strips "core." prefix
session.module_registry().write().set_cog_name("core");
```

## Unified ID allocation — ensuring invariants #2 and #3

Before the unification, three monotonic counters handed out
`ModuleId` values independently:

- `Session::next_file_id` (a `FileId` counter that was *also* used
  for `ModuleId`s in some paths)
- `ModuleRegistry::next_id`
- `ModuleLoader::next_file_id` (the same field used as both
  FileId *and* ModuleId allocator — a separate bug)

Since the three counters ran independently, a `ModuleId` allocated
by one could easily collide with a `ModuleId` already in use by
another. The fix:

- `Session` owns:
  - `next_file_id: Shared<AtomicU32>` — the authoritative FileId
    allocator.
  - Indirectly, the `ModuleRegistry::next_id: Shared<AtomicU32>`
    allocator (because Session owns the registry handle).
- `ModuleLoader` has `set_file_id_allocator` and
  `set_module_id_allocator` — both optional; when attached, the
  loader uses the shared counter instead of its local one.
- `Session::create_module_loader` wires both allocators into every
  loader it creates.
- `Session::module_id_allocator()` and `Session::file_id_allocator()`
  hand out the `Shared<AtomicU32>` handles to secondary loaders
  created elsewhere (e.g. `Pipeline::new`'s `lazy_resolver`).
- `ModuleLoader::next_file_id` is split into two fields:
  `next_file_id` (FileId) and `next_module_id` (ModuleId). The
  conflation was a bug.

The practical rule: **every `ModuleLoader` created during a
compilation must be constructed via
`session.create_module_loader()` OR must have both allocators
attached manually via the setters**. Loaders that cheat with
`ModuleLoader::new(path)` alone get their own private counters and
break invariant #2.

## One registry, not a clone — invariant #3

`TypeChecker::set_module_registry` used to `.read().clone()` the
session registry's contents into a second `Shared<ModuleRegistry>`.
The two copies drifted: lazy-loaded modules landed in the session's
registry, but the type-checker's local snapshot kept its stale
state.

The field `TypeChecker::module_registry` is now
`Shared<parking_lot::RwLock<ModuleRegistry>>` — the **same** type
and the **same** handle `Session` owns. `set_module_registry` just
clones the handle (a refcount bump), not the contents. Both
`self.module_registry` and `self.session_registry` now point at the
single authoritative registry.

## Export deduplication — the other half

With invariants #1–#3 holding, `ExportTable::add_export` can
dedupe correctly. Its rule:

- Same name + same kind + same `source_module` → no-op (re-export
  dedupe).
- Same name + one `Module`, one non-`Module` → non-module wins
  (e.g. `public module panic;` + `public mount .panic.panic;`).
- Same name + `Type` vs `Function` + **same** `source_module` →
  a *variant-vs-type namespace collision* inside one module.
  Emits a targeted diagnostic:

  > variant constructor `Cluster` clashes with the `type Cluster`
  > declared in the same module — variants flatten into the
  > parent module's namespace; rename the variant or the type

- Otherwise → **real** conflict. Different `source_module` with
  the same name and kind means two truly different modules both
  export the same name; importer scope cannot disambiguate. Emits:

  > conflicting export: `Cluster` already exported as type from
  > `ModuleId(N)`; both sides resolve to the same name in the
  > importing scope — rename one or scope one behind a non-public
  > re-export

## Privacy at AST-walk fallback

`find_type_declaration_in_module` used to walk the module AST by
name match only, ignoring visibility. Private types therefore
leaked through to importers whose exports table missed the item,
and the importer would then try to resolve the private type's
transitive type dependencies against its own (wrong) scope —
producing misleading "type not found: X" errors.

The check now respects `Visibility::Public`: private declarations
are invisible to importers, matching the explicit exports table.

## Failure modes we no longer see

| Observed symptom | Root cause | Fixed by |
|------------------|------------|----------|
| `Conflicting export: 'X' from ModuleId(N)` (multiple distinct N) | Parallel ID allocators | Unified counter |
| Same file registered twice | Path canonicalisation miss | `cog_name` stripping |
| `type not found: Y` when resolving imported `type X { Y }` | Private type leak | Public-only AST walk |
| Type-checker sees stale module set after lazy load | Registry clone drift | Shared handle dedupe |

## Reserved keywords and parameter names

Before: using a keyword as a parameter name (`fn f(mount: Text)`,
`fn f(fn: Int)`) produced a generic `expected pattern` parse error.

Now the parser lexer has a central `is_reserved_keyword_token`
check; any keyword appearing where an identifier is required emits:

> 'mount' is a reserved keyword and cannot be used as an identifier
> here — rename to `mount_` or similar

The full list tracks all 41 keywords: `let, fn, is, type, match,
mount, link, where, if, else, while, for, loop, break, continue,
return, yield, mut, const, volatile, static, pure, meta, stage,
lift, implement, protocol, extends, module, async, await, spawn,
select, nursery, unsafe, ref, move, as, in, public`.

## Byte-string literals in patterns

`match buf { b"GET" => ..., b"POST" => ... }` — previously broke the
pattern parser with `expected pattern`. The lexer already produced
`TokenKind::ByteString`; the parser now accepts it in
`parse_literal_pattern` and in the literal-or-range dispatch.

## Smart-pointer auto-deref on assignment target

`g.val = 100` where `g: MutexGuard<Inner>` used to fail with
"field 'val' not found in type 'MutexGuard'". Read-mode field
access (`let x: Int = g.val`) already dereferenced smart-pointer
receivers; assignment-mode did not.

`check_expr_assignment_target`'s Field branch now walks the
`Deref::Target` chain via `protocol_checker.try_find_associated_type
(ty, "Target")` until a type with the requested field appears (or
no further Target is defined). Bounded to 8 hops. The stdlib's
`Deref`/`DerefMut` protocol declarations are the single source of
truth — no hardcoded list of smart pointers. Chains compose
naturally: `Shared<Mutex<T>>` → `Mutex<T>` → `T`.

## Protocol method-level type-param scoping

A protocol declaration like

```verum
type Iterator is protocol {
    fn map<B, F: fn(Self.Item) -> B>(self, f: F) -> MappedIter<Self, F>;
    ...
}
```

has two layers of generics in play when an impl registers:

- impl-level params (e.g. `implement<T, F: fn() -> T> Iterator for OnceWith<T, F>`)
- method-level params (`B`, `F` on `map`)

If the two layers share a spelling (`F` is a common example),
three guards must cooperate to keep them structurally distinct:

1. **At protocol-registration time**, each method-level generic is
   bound to a fresh `TypeVar` in a dedicated scope. Without this,
   `fn map<B, F>` lowers with `Type::Named("B")` / `Type::Named("F")`
   instead of `Type::Var(fresh)` — which then cannot be disambiguated
   from free-standing same-name references in impl scope.

2. **`ProtocolMethod.type_param_names`** records the list of
   method-level generic names. This is not used at the wire level
   of protocol definition itself, but it is read during any
   subsequent substitution on the method's signature.

3. **`lookup_all_protocol_methods`** prunes method-level names
   from the impl-level `subst_map` before calling
   `substitute_type_params`. This prevents a Named-keyed
   impl-level binding from capturing a Named-keyed method-level
   reference of the same spelling.

`generalize_ordered` was similarly hardened: a new
`generalize_with_vars` variant takes the ordered list of
`TypeVar`s directly, with no name-based lookup, for cases (like
`register_impl_block`) where the caller already owns both
impl-level and method-level `TypeVar`s and wants positional
alignment guarantees.

### Positional-alignment reordering

When an impl declares more type parameters than the `for_type`
mentions, the extras must be placed AFTER the positional-
alignment slots. Example:

```verum
implement<I: Iterator, B, F: fn(I.Item) -> B> Iterator for MappedIter<I, F>
```

- Declaration order: `[I, B, F]`.
- `for_type = MappedIter<I, F>` — only 2 slots.
- `receiver.args.len()` at any call site = 2.

If `scheme.vars` is stored in declaration order, `bind_limit = 2`
binds `receiver.args[0]` to `I` and `receiver.args[1]` to `B` —
exactly wrong: `F`'s slot is skipped and `B` is poisoned with
the closure type. `Maybe<B>` then surfaces as
`Maybe<fn(Int) -> Int>` at `.next()` calls, and user code
fails with misleading "expected Int, found fn(Int) -> Int".

Fix: at scheme-formation time, partition impl-level TypeVars
by whether they appear in `for_type.free_vars()`:

1. **First block** — impl TypeVars IN `for_type`, in declaration
   order. `receiver.args` positionally bind here.
2. **Second block** — impl TypeVars NOT in `for_type`. Left free;
   inferred from bounds / unification during the actual call.
3. **Third block** — method-level TypeVars (method's own `<U>`).

`impl_var_count` stores the size of the first block — so
`bind_limit = impl_var_count` aligns with `receiver.args.len()`.
Applied in both the Inherent and Protocol branches of
`register_impl_block_inner`.

Regression coverage:
`vcs/specs/L2-standard/iterator/impl_param_reorder.vr` — the
`once_with(|| 5).map(|x| x*10).next()` reproducer.

## Smart-pointer receivers calling protocol methods

### Auto-deref cascade at method-resolution entry

`infer_method_call_inner_impl` now walks the receiver's
`Deref::Target` chain (bounded to 8 hops) before running method
lookup. The cascade stops as soon as the current level owns the
method — so `mutex.lock()` still binds to `Mutex`, not to the
inner `T`. When an unwrap produces a `Type::DynProtocol`
(inherently unsized), the receiver is wrapped in `&dyn ...`
because dyn-protocol must live behind a reference to serve as
a valid method receiver.

The helper `type_or_dyn_has_method` structurally answers "does
this type own the method here?" without special-casing any
smart-pointer type — it queries the inherent methods table, the
protocol-impl set, and (for dyn-protocol) the protocol
declarations. No hardcoded Heap/Shared/MutexGuard list: the
stdlib's `Deref::Target` associated-type declarations drive the
cascade entirely.

### Dyn-protocol method lookup

`ProtocolChecker::lookup_all_protocol_methods` now handles
`Type::DynProtocol { bounds }` as a first-class receiver: when
no concrete impl is registered (as is always the case for a
bare dyn), method signatures are served directly from each
bound protocol's `ProtocolDecl.methods`. This mirrors how
`(&dyn Protocol).method(...)` has always dispatched; the
dyn-protocol type is now a first-class citizen in the lookup
path.

### Diagnostic fallback

When auto-deref still doesn't find a match, the
`MethodNotFound` diagnostic embeds a targeted hint pointing at
the dyn-protocol target:

```
error<E400>: no method named `start_span` found for type
             `Heap<dyn Tracer>`
  help: did you mean `deref to access `start_span` on
        `dyn Tracer` — `Heap<dyn Protocol>.method()` dispatch
        requires vtable codegen (tracked)`?
```

### Post-cascade dyn-protocol resolution

The cascade lands on `&dyn P` for `Heap<dyn P>` /
`Shared<dyn P>`, but the **early** DynProtocol branch (which
matches bare `DynProtocol` receivers) runs before the cascade,
so wrapped forms would otherwise miss it. A **post-cascade**
resolution mirrors the early branch:

1. Peel one reference layer (`&T`, `&checked T`, `&unsafe T`,
   `Ownership<T>`) off `recv_ty`.
2. If the peeled type is `Type::DynProtocol { bounds, .. }`,
   iterate `bounds` and serve the method from
   `protocol_checker.get_method_type(protocol_name, method)`.
3. Type-check arguments and return the protocol's method type.

Combined with the cascade, this closes the full chain:

```
Heap<dyn Tracer>       (receiver)
  ↓ Deref::Target      (stdlib protocol)
dyn Tracer             (unsized — cascade wraps)
  ↓ wrap in &
&dyn Tracer            (cascade exit)
  ↓ peel reference
dyn Tracer             (post-cascade)
  ↓ protocol_checker
Tracer::start_span     ✔ resolved
```

`type_or_dyn_has_method` likewise peels one reference layer so
the cascade's halt-condition agrees with the post-cascade
resolver: if `&dyn P` already owns the method, the cascade
stops rather than fruitlessly walking further targets.

Regression coverage:
`vcs/specs/L1-core/types/dynamic/heap_dyn_dispatch.vr` covers
all three forms — `Heap<dyn P>`, `Shared<dyn P>`, and direct
`&dyn P`.
