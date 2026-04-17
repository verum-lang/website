---
sidebar_position: 4
title: LSP
description: Language Server Protocol 3.17 — diagnostics, completion, hover, refinement counter-examples, CBGR hints.
---

# Language Server

`verum lsp` runs a **Language Server Protocol 3.17** server over
stdin/stdout. Every major editor can connect. The server shares its
indexing infrastructure with
[Playbook](/docs/tooling/playbook) and the REPL.

## Features

### Diagnostics

- Real-time parse, type, and verification errors.
- **Refinement-type violations** with **counter-examples** inline.
- **CBGR warnings** with escape-analysis explanations.
- Under `@verify(formal)`, SMT results on save (or on-type, if fast
  enough).

Example — a violating refinement:

```
error[V3402]: postcondition violated
   ┌─ src/foo.vr:12:5
   │
12 │     result
   │     ^^^^^^
   │     counter-example:   x = -7  =>  result = -7  (not Positive)
   │
help: add `where ensures result > 0` or change the body to abs(x)
```

### Code navigation

- **Go to definition / declaration / type definition / implementation.**
- **Find references** — including protocol method dispatches.
- **Document symbols** — collapsible tree of top-level items.
- **Workspace symbols** — fuzzy-search across cogs.
- **Call hierarchy** — who calls this function, who does it call.
- **Type hierarchy** — who implements this protocol, who extends that.

### Editing

- **Completion** — context-aware, protocol methods after `.`,
  pattern completions in `match`, module items after `mount`.
  Attribute arguments with a finite allowed-values set emit LSP
  choice snippets: typing `@inline(` offers `always | never | hint
  | release` inline; `@repr(` offers `C | packed | transparent |
  cache_optimal`; `@optimize(` offers `none | size | speed |
  balanced`; `@device(` offers `cpu | gpu`.
- **Signature help** — live argument hints as you type a call.
- **Hover** — full type, refinements, contracts, attributes, doc
  comments, and computed **effective** properties (e.g. "promoted to
  `&checked`").
- **Inlay hints**:
  - Inferred types on `let` bindings.
  - CBGR tier (`&T` → `&checked T` after promotion).
  - Capability bits (`Database with [Read]`).
  - `using [...]` effect clauses (when implicit).
  - Refinement predicates (when inferred).
- **Rename** — symbol-aware, respects visibility.
- **Code actions**:
  - Auto-import.
  - Derive missing protocol methods.
  - Add `@verify(...)` annotation.
  - Split / merge `match` arms.
  - Promote to `&checked` where proof succeeds.
  - Convert `if let` to `match`.
  - Expand macros inline.
  - "Extract function" with automatic `using [...]` propagation.

### Formatting

- **Full-file and range formatting** via `verum fmt`.
- Configurable via `.verumfmt.toml`:

```toml
# .verumfmt.toml
[formatter]
indent            = 4                # 2 | 4 | "tab"
max_line_length   = 100
trailing_comma    = "always"         # never | smart | always
align_refinements = true             # align { self... } predicates
align_where       = true
space_around_arrow = true
```

### Refactoring

- **Extract function / variable.**
- **Inline function / variable.**
- **Convert refinement form** — inline ↔ type-level ↔
  `where requires`.
- **Lift / sink** — move a binding up or down the block structure.
- **Desugar** — `if let Some(x) = … else { return }` ↔
  `let Some(x) = … else { return };` ↔ `let x = …?;`.

### Semantic tokens

Fine-grained syntax highlighting based on static analysis:

- Distinguishes **unused** / mutated / moved variables.
- Colours **capability-bearing references** differently.
- Indicates **verified** vs unverified code paths.
- Different shade for **pure** versus effectful functions.

## Configuration

Editor-agnostic settings live in `Verum.toml` or `.verum/lsp.toml`:

```toml
[lsp]
diagnostics_on_save = false     # run on-type by default
inlay_hints         = true
check_on_save       = true
smt_inline          = false     # show SMT results inline (slow for some files)
refinement_hints    = true
cbgr_hints          = true
capability_hints    = true
max_diagnostics     = 100
```

Editor-side overrides (VS Code example):

```json
{
  "verum.server.path": "~/.verum/bin/verum",
  "verum.server.trace": "verbose",
  "verum.lint.strategy": "formal",
  "verum.inlayHints.refinements": true,
  "verum.inlayHints.cbgr": true,
  "verum.inlayHints.contexts": true,
  "verum.verify.onSave": true
}
```

## Editor integration

### VS Code

```
ext install verum-lang.verum
```

Features unique to the VS Code extension:

- Inline counter-example explorer.
- "Run test at cursor" code lens.
- Run `@verify(formal)` from the gutter.
- Embedded Playbook panel.

### Neovim (nvim-lspconfig)

```lua
require('lspconfig').verum.setup{
  cmd = {'verum', 'lsp'},
  filetypes = {'verum'},
  root_dir = require('lspconfig.util').root_pattern('Verum.toml'),
  settings = {
    verum = {
      verify = { strategy = "static" },
      inlayHints = {
        refinements = true,
        cbgr = true,
        contexts = true,
      },
    },
  },
}

vim.filetype.add({ extension = { vr = 'verum' } })
```

### Emacs (lsp-mode)

```elisp
(use-package lsp-mode
  :config
  (add-to-list 'lsp-language-id-configuration '(verum-mode . "verum"))
  (lsp-register-client
   (make-lsp-client
    :new-connection (lsp-stdio-connection '("verum" "lsp"))
    :major-modes '(verum-mode)
    :server-id 'verum)))
```

### JetBrains IDEs

Install the **Verum** plugin from the marketplace. It registers a
native LSP client and exposes the Verum-specific quick-fixes in the
IntelliJ intention menu.

### Helix

```toml
# ~/.config/helix/languages.toml
[[language]]
name = "verum"
file-types = ["vr"]
language-servers = ["verum-lsp"]

[language-server.verum-lsp]
command = "verum"
args = ["lsp"]
```

### Kate / Sublime / any LSP-capable editor

Generic LSP setup: command `verum lsp`, root marker `Verum.toml`,
filetype `.vr`.

## Custom LSP extensions

Beyond standard LSP 3.17, the Verum server exposes:

| Method                       | Purpose                                       |
|------------------------------|-----------------------------------------------|
| `verum/refinementProof`      | Show SMT proof term for a hovered refinement. |
| `verum/cbgrReport`           | Full CBGR tier analysis for a file.           |
| `verum/expandMacros`         | Show macro expansion at a range.              |
| `verum/verifyAtPoint`        | Run SMT on the enclosing function.            |
| `verum/runTestAtPoint`       | Execute the test at the cursor.               |
| `verum/runPlaybookCall`      | Invoke a function with Playbook's evaluator.  |
| `verum/typeHierarchy`        | Full protocol implementation tree.            |
| `verum/smtStats`             | Aggregate SMT timings across the session.     |

Editor extensions light up features that use these (the VS Code
extension uses all of them; others use a subset).

## Performance

- **Incremental**: a keystroke triggers only the changed functions'
  re-verification.
- **Typical responsiveness on a 50 K-LOC project**:
  - Diagnostics: within 100 ms.
  - Completion: within 50 ms.
  - Hover: within 30 ms.
  - Go-to-def: within 20 ms.
- SMT verification runs in the background; results stream in as they
  arrive.
- An on-disk **proof cache** (`target/proof-cache/`) keeps already-
  discharged goals hot across restarts.

## Diagnostics over time

The LSP streams partial results. For slow verification goals, the
"verification pending" marker appears immediately and upgrades to
success or failure once the solver finishes. Expect to see
`@verify(thorough)` results arrive over seconds for heavy proofs.

## Performance tuning

Large projects benefit from background workers:

```toml
[lsp.workers]
type_check    = 4               # parallel type-check workers
smt           = 2               # parallel SMT workers
completion    = 1               # single completion worker (CPU-light)
```

## Logging and diagnostics

Enable verbose logging:

```bash
VERUM_LSP_LOG=debug verum lsp   # verbose server logs to stderr
```

Or set the editor's `trace` level to `"verbose"`. Logs include
request timing, cache hit rates, and solver dispatch decisions.

## See also

- **[CLI](/docs/tooling/cli)** — `verum lsp` subcommand.
- **[Playbook](/docs/tooling/playbook)** — TUI built on the same
  indexer.
- **[REPL](/docs/tooling/repl)** — line-oriented interactive mode.
- **[Installation](/docs/getting-started/installation)** — editor
  setup.
