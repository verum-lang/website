---
sidebar_position: 2
title: Compilation Model
description: How Verum's compiler schedules metaprogramming — multi-pass architecture, meta sandbox, determinism guarantees.
---

# The metaprogramming compilation model

Metaprogramming is not an afterthought in Verum; the compiler is
designed around it. This page is the ground-level explanation of
**how** compile-time code runs, **when** it runs, **what** it is
allowed to do, and **why** these constraints exist. If you want to
write a macro, a derive, or a literal handler, you should read this
page before anything else in the metaprogramming section.

## The chicken-and-egg problem

A naive compilation pipeline looks like this:

1. Parse the whole source file.
2. Resolve every identifier against a fully populated symbol table.
3. Type-check every expression.
4. Expand macros… wait.

If macro expansion is last, how can step 2 resolve a call to a macro
that has not been expanded yet? If macro expansion is first, how can
the macro inspect types it needs to generate code from?

Verum resolves this with a **multi-pass compilation model** that
reverses the usual order and runs cross-file registration before any
per-function type checking. The order is:

### Pass 1 — Parse + Register

Every file in the cog (and its transitive dependencies) is parsed in
parallel. Each pass-1 worker:

- Builds the AST for its file.
- Walks the top-level declarations and registers every `type`,
  `fn`, `meta fn`, `context`, `protocol`, and `@meta_macro` into a
  **meta registry** keyed by fully-qualified path.
- Records each item's attribute list, generic parameters, and
  signature — but *not* its body.
- Records which `@-attribute` invocations appear in the file and
  what their arguments are.

At the end of pass 1 the compiler knows every name the program
defines, every macro it will need to invoke, and where each
invocation appears — but not yet what any function body does.

### Pass 2 — Expand Macros

The meta registry from pass 1 is now the oracle for resolution during
expansion. For each `@-attribute` invocation in the program:

1. Look up the macro's `meta fn` in the registry.
2. Parse the invocation's arguments as token trees.
3. Run the meta function in the **meta sandbox** (see below) with
   those tokens as input.
4. Receive a `TokenStream` as output.
5. Splice the output back into the AST in place of the original
   invocation.

Expansion happens bottom-up when nested and is iterated to fixpoint
when a macro's output contains further macro invocations. The
compiler enforces a maximum expansion depth to prevent runaway
recursion; see **Compilation-time budget** below.

### Pass 3 — Semantic Analysis

Only after every macro has expanded does the compiler run type
inference, refinement checking, CBGR analysis, context checking, and
the rest of the semantic pipeline on the **fully expanded AST**.
Everything the programmer sees in error messages, everything the LSP
shows in hover tooltips, operates on this expanded form.

### Why this order matters

- **Cross-file name resolution works** without a separate build
  system: a macro in file *A* can reference a type defined in file
  *B* because pass 1 registered *B*'s types before pass 2 expanded
  *A*'s macro invocations.
- **Type information available to macros** is precise: `TypeInfo.
  fields_of<T>()` inside a derive sees the fields the programmer
  declared, not some half-formed placeholder.
- **Errors blame the right location**: a type error inside a
  generated function body points at the `quote { ... }` line that
  produced it, not at the call site. The span-mapping machinery
  tracks provenance through every splice.

### Cross-file resolution in practice

```verum
// file: domain/user.vr
pub type User is { id: Int, name: Text, email: Text };

// file: api/endpoints.vr
mount domain.user;

@derive(Serialize, Deserialize)       // pass 1 registers @derive,
pub type UserDto is User;             // pass 1 registers UserDto,
                                      // pass 2 expands @derive using
                                      // both User's fields (from
                                      // file domain/user.vr) and
                                      // UserDto's declaration
```

A single-pass compiler would need the programmer to manually order
the files or manually forward-declare types. Verum does neither.

## The meta sandbox

A `meta fn` runs inside the compiler. If a meta function could perform
network I/O, read the clock, or spawn arbitrary subprocesses, the
compiler's output would stop being a pure function of its inputs — two
builds of the same source on two machines could produce different
binaries. That is a non-starter for a language whose cog distribution
model depends on deterministic compilation and proof-carrying
artefacts.

Verum enforces a **sandbox** on every meta function. The sandbox is
enforced at **three layers**: parser, interpreter, and type checker.
Escaping one layer is not enough to violate it.

### What the sandbox allows

| Category              | Allowed operations                                                    |
|-----------------------|----------------------------------------------------------------------|
| Arithmetic            | All operators, all numeric types                                     |
| Collections           | `List`, `Map`, `Set`, `Text` — full APIs                             |
| Quoting               | `quote { ... }`, `unquote`, token-tree manipulation                  |
| Reflection            | `TypeInfo`, `AstAccess`, `SourceMap`, `DepGraph`, `ProjectInfo`      |
| Diagnostics           | `CompileDiag.emit_error`, `emit_warning`, `emit_note`, `abort`       |
| Hygiene               | `Hygiene.gensym`, `call_site`, `def_site`                            |
| Build assets          | `BuildAssets.load_text`, `load_bytes` — *project-directory-scoped*   |
| Cache                 | `MacroState.cache_get` / `cache_put` — keyed by input fingerprint    |
| Parallel computation  | `meta async fn` for CPU-bound parallel compile-time work             |

### What the sandbox forbids

| Category              | Forbidden operations                                                 |
|-----------------------|----------------------------------------------------------------------|
| Network I/O           | `tcp_connect`, `http.get`, `udp_bind`, anything that crosses a socket |
| File I/O (outside)    | Any path outside the project directory or its declared asset roots  |
| Clock / randomness    | `Clock.now`, `Random.next`, `Time.monotonic` — non-deterministic    |
| Process spawning      | `Process.spawn`, `Command.run`, FFI to `execve`                     |
| Mutable globals       | There are none to begin with; any attempt to synthesise one is caught |
| Thread spawning       | Bare `spawn` is rejected; only `meta async fn` is allowed, and only for CPU-bound parallel work |

The sandbox is **not a runtime permission check**. Forbidden
operations are *rejected statically* — the first time a meta
function body references one, the parser or interpreter raises a
`SandboxError` that references the forbidden call and points at the
sanctioned alternative.

### Determinism guarantees

Given the sandbox, the following guarantees hold:

1. **Input-determined output.** A meta function called with the same
   token tree inputs and the same `BuildAssets` contents produces the
   same output, bit for bit, on every build and every machine.
2. **Cacheable.** The incremental compilation cache can fingerprint a
   meta function's inputs and reuse its previous output verbatim.
   `MacroState.cache_put` is an *explicit* cache that the meta fn
   controls; the compiler also keeps an *implicit* cache keyed on the
   full input fingerprint.
3. **Reproducible builds.** Two builds of the same cog on two
   different machines (or two days apart on the same machine) produce
   identical VBC output. Proof certificates, byte offsets, and
   embedded metadata all match.
4. **Safe to distribute.** Because a cog's VBC payload is a pure
   function of its source, a cog consumer can validate the proof
   certificate against the source without trusting the author's
   build machine.

### `BuildAssets` — the narrow file-I/O exception

File reads are a special case. A build script that loads `VERSION` or
embeds a schema is a legitimate, common pattern. The `BuildAssets`
context exposes a scoped file-I/O API:

```verum
meta fn embed_version() -> TokenStream
    using [BuildAssets, CompileDiag]
{
    match BuildAssets.load_text("VERSION") {
        Result.Ok(v) => quote { const VERSION: Text = ${lift(v.trim())}; },
        Result.Err(e) => {
            CompileDiag.emit_error(&f"failed to read VERSION: {e}", Span.current());
            TokenStream.empty()
        }
    }
}
```

Semantics:

- Paths are always resolved against the cog's manifest root or
  against a directory explicitly listed in the `[assets]` section of
  `verum.toml`. Absolute paths and paths with `..` segments are
  rejected.
- Reads are recorded in the build's dependency graph. Editing an
  asset invalidates every `BuildAssets`-using macro that read it.
- No write API exists. Meta functions cannot modify the filesystem.

## Meta async functions

A `meta async fn` is the only way to run parallel work at compile
time. It is intended for **CPU-bound** meta computations that can be
decomposed — running fifty independent derives for fifty types, for
example, or parsing fifty GraphQL schemas.

```verum
meta async fn generate_all<T: TypeList>() -> TokenStream
    using [TypeInfo, AstAccess]
{
    let types = T.enumerate();
    let streams = types.iter()
        .par_map(|t| generate_one(t).await)   // runs meta work in parallel
        .collect();
    TokenStream.concat(streams)
}
```

The sandbox rules do not relax inside `meta async`. In particular,
`meta async fn` **cannot** be used to do I/O concurrently — because
it cannot do I/O at all. The compiler enforces this at the type level:
inside a meta function, `Http`, `FileSystem`, `Database`, and other
runtime contexts are not in scope.

## The meta linter

Beyond the hard sandbox, a static analysis pass warns about patterns
that are *permitted but suspicious*. Examples:

- A derive macro that reads a private field of the type it derives
  for. Usually a bug in the derive.
- A meta function that recursively expands itself without a base
  case. The compiler enforces a depth limit anyway, but the lint
  catches it earlier.
- An attribute macro whose output contains a `@-invocation` that
  cannot be resolved at the current stage.
- A `meta fn` that is observably non-deterministic despite the
  sandbox — e.g. relying on iteration order of a `Map` with an
  untyped key.

Linter findings are visible in `verum build` output and in the LSP.
The active set is configured under `[meta.linter]` in
`verum.toml`; individual checks can be silenced with
`@allow(...)` attributes at the meta function's declaration site.
See the [Diagnostics](./error-codes) page for the authoritative
list of diagnostic categories.

## Observability — `--show-expansions`

Compile-time code is hidden from runtime debuggers by nature.
Passing `--show-expansions` to `verum build` (or `verum check`)
dumps the post-expansion source for every macro invocation in the
build, with generated tokens flagged by a
`/* generated by @derive(Clone) at src/user.vr:3 */` comment that
traces back to the invocation.

The same information is available interactively through the LSP —
hover over a macro invocation to see its expansion inline in the
editor.

## Compilation-time budget

Metaprogramming has a cost, and the cost is visible. Four limits
apply:

- **Time limit** — a single meta function invocation is given a
  default 10-second budget.
- **Memory limit** — a single meta function's heap is capped at
  256 MB by default.
- **Depth limit** — meta-function recursion is capped at a default
  of 256 calls deep.
- **Determinism check** — if the incremental-compilation cache
  ever reports that two invocations with identical fingerprints
  produced different output, the build aborts rather than cache
  the result. This is a safety net; hitting it indicates a
  compiler bug.

Every limit is adjustable per-function with a meta attribute
applied to the meta function itself:

```verum
@meta[recursion_limit = 1000]
meta fn deep_walker(node: AstNode) -> TokenStream { ... }

@meta[timeout = 60_000]        // 60 seconds
@meta[memory   = 1024]         // 1 GB
meta fn heavy_codegen(schema: Text) -> TokenStream { ... }
```

Raising these limits in production is rarely the right answer;
usually it means the macro should cache intermediate results via
`MacroState.cache_*` or be split into several smaller invocations.
When a limit is hit, the diagnostic identifies the offending meta
function, its configured budget, and the point at which the budget
was exhausted.

## See also

- **[Macro kinds](./macro-kinds)** — derive, attribute, function-like,
  declarative — the four surface forms and when to use each.
- **[Quote and hygiene](./quote-and-hygiene)** — how `quote { ... }`
  constructs token trees and how the hygiene model prevents capture.
- **[Staging](./staging)** — N-stage quotes, `lift`, cross-stage
  references.
- **[Token-stream API](./token-api)** — the `TokenStream`, `Ident`,
  `Literal`, and `Span` types that meta functions manipulate.
- **[Error codes](./error-codes)** — every M4xx, M5xx, ML6xx code
  emitted by the meta subsystem.
