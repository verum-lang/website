---
sidebar_position: 9
title: Meta Diagnostics
description: Diagnostic categories emitted by the metaprogramming subsystem — structured errors, linter advisories, and the shape of every message.
---

# Meta subsystem diagnostics

The metaprogramming subsystem emits diagnostics in the same format
as the rest of the compiler: severity, message, one primary span
with a labelled source excerpt, zero or more secondary spans, and a
machine-parseable JSON form when `--format json` is passed.

This page catalogues the **diagnostic categories** — the shapes of
error and warning the meta subsystem can produce. Specific error
codes and wording are stable across minor releases but not across
major ones; when a code changes, the release notes call it out.

## Diagnostic categories

Meta diagnostics group into five structured classes, each
represented internally by a distinct error type:

| Class                   | Produced by                                                 |
|-------------------------|-------------------------------------------------------------|
| `ParseError`            | Malformed quote, unbalanced splice, stray `$` outside a quote |
| `MacroError`            | Expansion-time failure — mismatched shapes, bad arguments  |
| `SandboxError`          | An attempt at a forbidden operation inside a meta function  |
| `TypeError` (meta)      | A spliced expression fails type-check at the splice site    |
| `InterpreterError`      | Resource-limit or nondeterminism violation during expansion |

All five integrate with the standard diagnostic pipeline: they
appear in `verum build`, the LSP surfaces them inline, and CI can
filter them by class name.

## `ParseError` — quote / splice syntax

Raised when the meta-subsystem's parser rejects a quote body or a
splice form. Typical triggers:

- Unbalanced braces inside `quote { ... }`.
- A `$ident` or `${expr}` outside any enclosing `quote`.
- Malformed iteration: `$[for x in xs { ... ]` missing the closing
  `]`, or a separator-repetition mismatch.
- An invalid stage specifier: `quote(abc)` or `$(stage bad){ expr }`.
- A token tree containing unknown characters after tokenisation.

The diagnostic always labels the offending character and, when the
context makes it possible, suggests the correct form:

```
error: unbalanced quote body
  --> src/macros.vr:24:12
   |
24 |     quote { let x = 1 ;
   |            ^ opening `{` is never closed
   |
   = help: add `}` at the end of the quote body, or use `$[for …]` for
           iteration that produces multiple statements.
```

## `MacroError` — expansion-time failure

Raised when a macro expands but the output is not the shape the
splice site expected, or when a macro explicitly aborts via
`CompileDiag.abort()`. Typical triggers:

- The splice site is an expression position and the macro produced
  an item, or vice versa.
- A macro's `using [...]` clause omits a required meta context.
- A macro parses an argument that should be a string literal and
  receives a non-literal token tree.
- A derive macro runs on a type it cannot handle (a protocol type,
  a type with no fields, a type whose generics cannot be bounded).
- A macro's `TypeInfo`-driven branch emits a diagnostic via
  `CompileDiag.emit_error(...)` without aborting.

The diagnostic typically carries two spans: the macro invocation
and the offending construct inside the generated output.

## `SandboxError` — forbidden compile-time operation

Raised when a meta function body references an operation the
sandbox refuses to permit. The forbidden operations and their
sanctioned alternatives are enumerated in
[Compilation model → meta sandbox](./compilation-model#the-meta-sandbox);
the short list:

- System clock (`Clock.*`, `Time.*`) — forbidden. Use
  `ProjectInfo.build_id()` if you need a deterministic marker.
- Randomness (`Random.*`) — forbidden. If you need a deterministic
  per-invocation identifier, use `Hygiene.gensym(...)`.
- Network I/O (`Http`, `tcp_*`, `udp_*`) — forbidden at any stage.
  External data must flow through the build system.
- Filesystem (general) — forbidden outside `BuildAssets` and only
  inside the project's declared asset roots.
- Process spawning — forbidden entirely.

Every `SandboxError` message ends with a **help** line pointing at
the sanctioned alternative, when one exists.

## `TypeError` (at splice site)

Raised when a macro's generated code reaches the Pass-3 type
checker and the checker rejects it. These are the most common
bugs in new derives and attribute macros. Typical shapes:

- A generated call passes the wrong number of arguments (often a
  bug in a `$[for ...]` that omits or duplicates an entry).
- A generated expression has the wrong type (often from `lift`ing
  a value whose `Quotable` implementation emits a type the splice
  site doesn't expect).
- A generated function references an identifier that is not in
  scope at the splice site — either because the hygiene model
  rejected the capture or because the identifier was spliced with
  the wrong context.

The diagnostic's primary span is **the splice site**, not the
quote that produced the bad code. A secondary span points back to
the quote. This matters: the bug is usually in the macro, but the
error manifests in the user's file. Both spans in the output make
that relationship obvious.

## `InterpreterError` — resource limits

Raised when a macro exceeds one of its budgets:

- **Recursion limit** — default 256 nested calls.
- **Time limit** — default 10 seconds per invocation.
- **Memory limit** — default 256 MB per invocation.
- **Nondeterminism trip** — the incremental cache observed
  divergent output for identical inputs. Should be impossible; it
  indicates a compiler bug.

All four can be relaxed (for a specific meta function) with
`@meta[recursion_limit = N]`, `@meta[timeout = N]`,
`@meta[memory = N]` attributes applied to the function's
declaration.

## Severity

Every meta diagnostic has one of four severities, inherited from
the wider diagnostic system:

| Severity  | Behaviour                                                      |
|-----------|----------------------------------------------------------------|
| `error`   | Fails the build. Expansion aborts and no output is produced.   |
| `warning` | Printed but does not fail the build. Configurable via `[lint]` |
| `note`    | Emitted alongside a primary message; carries context only.     |
| `help`    | Points at the sanctioned fix. Always optional.                 |

Macro authors emit these via the `CompileDiag` context:

```verum
CompileDiag.emit_error(message, span);
CompileDiag.emit_warning(message, span);
CompileDiag.emit_note(message, span);
CompileDiag.emit_help(message, span);
CompileDiag.abort() -> !;
```

Or, for a fully structured diagnostic with multiple spans:

```verum
CompileDiag.emit_diagnostic(
    Diagnostic.error("unsupported variant")
        .with_primary_span(v.span, "this variant uses a tuple shape")
        .with_secondary_span(t.span, "but the derive only handles records")
        .with_help("convert the variant to a record, or add `@derive(ClonePartial)`")
);
```

## Linter advisories (warnings by default)

Beyond hard errors, a static-analysis pass emits advisories for
patterns that are permitted but suspicious. Representative
categories:

- **Recursive macros without a visible base case.**
- **Macro output that references a runtime-only context from inside
  a quote** — the splice site won't have access to that context.
- **Unused declared meta context** — the macro requested a
  capability it never used.
- **Empty `implement` block** emitted by a derive.
- **Interpolation handler missing a safety attribute** — the
  handler emits user-controlled text without declaring its escaping
  behaviour; the project can elevate this to an error via
  `[lint.require_interpolation_safety = "error"]`.
- **Cyclic derive dependencies** — `@derive(A)` requires B which
  requires A.
- **Attribute ordering inconsistency** — e.g. `@verify` applied
  after `@derive` when the usual convention is `@verify` first.

Each advisory can be individually silenced, demoted to note, or
elevated to error under `[lint]` in `verum.toml`:

```toml
[lint]
meta = "warn"                              # default
"meta.recursive_macro" = "error"
"meta.unused_context" = "allow"
"meta.interpolation_safety_missing" = "error"
```

## Reading a diagnostic

Every meta diagnostic has a consistent shape:

```
error: hygiene violation — accidental capture
  --> src/macros.vr:24:21
   |
24 |         let y = x + 1;
   |                 ^ this identifier resolves to the caller's `x`
   |
   = help: receive `x` as a parameter to the macro and splice it with `${x}`,
           or apply `@capture(x)` to the meta function to inherit the
           caller's binding explicitly.
   = note: see https://verum-lang.org/docs/language/meta/quote-and-hygiene
```

The four mandatory components:

1. **Severity** (`error`) and **message** (the human-readable
   summary).
2. **Primary span** (`--> file:line:col`) — where to put the cursor.
3. **Labelled source line** — the offending construct highlighted.
4. **Help line** — the sanctioned fix, or a link to the deeper
   explanation.

Where relevant, diagnostics include **secondary spans** (related
locations: the type declaration that forced the derive, the
mismatching parameter, etc.) and **notes** that link back into this
documentation.

## JSON output

`verum build --format json` emits one JSON object per diagnostic:

```json
{
  "level": "error",
  "class": "MacroError",
  "message": "hygiene violation — accidental capture",
  "primary_span": {
    "file": "src/macros.vr",
    "start_line": 24, "start_col": 21,
    "end_line": 24,   "end_col": 22
  },
  "secondary_spans": [],
  "help": [
    "receive `x` as a parameter to the macro and splice it with `${x}`"
  ],
  "notes": [
    "see https://verum-lang.org/docs/language/meta/quote-and-hygiene"
  ]
}
```

Suitable for feeding into editor plugins, CI dashboards, or custom
test harnesses.

## See also

- **[Compilation model](./compilation-model)** — where these
  diagnostics originate in the pipeline.
- **[Quote and hygiene](./quote-and-hygiene)** — the source of
  most `MacroError` / hygiene-related diagnostics.
- **[Macro kinds](./macro-kinds)** — the four macro forms and the
  diagnostics each tends to produce.
- **[stdlib → meta → `CompileDiag`](/docs/stdlib/meta)** — the API
  macro authors use to emit diagnostics.
