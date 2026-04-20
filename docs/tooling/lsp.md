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

The server honours every configuration knob the client sends through
`initializationOptions` (on startup) **and** through
`workspace/didChangeConfiguration` (live, no restart). The VS Code
extension wires these keys directly to `verum.lsp.*` / `verum.cbgr.*` /
`verum.verification.*` settings — edit `settings.json` and the server
picks up changes on the fly.

### `initializationOptions` keys

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `enableRefinementValidation` | bool | `true` | Master switch for refinement diagnostics. |
| `validationMode` | `"quick"` \| `"thorough"` \| `"complete"` | `"quick"` | Per-call SMT latency cap — 100ms / 1s / 600s. |
| `showCounterexamples` | bool | `true` | Include concrete counter-examples in diagnostics. |
| `maxCounterexampleTraces` | int | `5` | Cap on execution-trace steps in a counter-example. |
| `smtSolver` | `"z3"` \| `"cvc5"` \| `"auto"` | `"z3"` | SMT backend selection. |
| `smtTimeout` | int (ms) | `50` | Per-query SMT timeout. |
| `cacheValidationResults` | bool | `true` | Cache SMT queries so unchanged refinements don't re-run. |
| `cacheTtlSeconds` | int | `300` | Cache entry TTL. |
| `cacheMaxEntries` | int | `1000` | Cache capacity. On downsize, oldest entries are evicted. |
| `cbgrEnableProfiling` | bool | `false` | Turn on CBGR runtime profiling instrumentation. |
| `cbgrShowOptimizationHints` | bool | `false` | Opt-in CBGR inlay hints (`0ns` / `~15ns` badges). |
| `verificationShowCostWarnings` | bool | `true` | Publish diagnostics when a function is slow to verify. |
| `verificationSlowThresholdMs` | int | `5000` | Threshold above which a function counts as "slow". |

The server applies these keys once at `initialize` time and re-applies
them every time it sees `workspace/didChangeConfiguration`. The cache
gets `resize`d in place — warm entries survive when the new capacity
allows.

### Editor-side overrides (VS Code)

```json
{
  "verum.lsp.serverPath": "verum",
  "verum.lsp.enableRefinementValidation": true,
  "verum.lsp.validationMode": "quick",
  "verum.lsp.showCounterexamples": true,
  "verum.lsp.maxCounterexampleTraces": 5,
  "verum.lsp.smtSolver": "z3",
  "verum.lsp.smtTimeout": 50,
  "verum.lsp.cacheValidationResults": true,
  "verum.lsp.cacheTtlSeconds": 300,
  "verum.lsp.cacheMaxEntries": 1000,
  "verum.cbgr.enableProfiling": false,
  "verum.cbgr.showOptimizationHints": false,
  "verum.verification.showCostWarnings": true,
  "verum.verification.slowThresholdMs": 5000
}
```

### Custom `verum/*` JSON-RPC methods — architecture

All five `verum/*` methods are live — see the table above under "Custom
LSP extensions". Their call path is:

1. The client sends `verum/validateRefinement` (or similar) over the
   stdio / TCP / pipe transport.
2. tower-lsp's router dispatches to the matching `Backend::handle_*`
   async method, registered through the
   `LspService::build(...).custom_method(...)` chain in
   [`crates/verum_cli/src/commands/lsp.rs`](https://github.com/verum-lang/verum/blob/main/crates/verum_cli/src/commands/lsp.rs).
3. The handler awaits `RefinementValidator::{validate_refinement,
   promote_to_checked, infer_refinement}`, which in turn push SMT work
   onto the `verum-smt-worker` thread via
   [`SmtWorkerHandle`](https://github.com/verum-lang/verum/blob/main/crates/verum_lsp/src/smt_worker.rs).
4. The worker thread exclusively owns the Z3 context; it returns
   `SmtCheckResult` through a `tokio::sync::oneshot`. Only `Send`
   types cross the await boundary.
5. `getEscapeAnalysis` and `getProfile` don't touch Z3 — they run in
   the handler's async context directly.

Complementary client-side surfaces:

- `verum.showEscapeAnalysis` (VS Code command) repositions the cursor
  and invokes `editor.action.showHover` — the hover bubble already
  contains the full CBGR markdown the server returned.
- Quick-fixes / promote-to-checked are also available through
  standard `textDocument/codeAction`, which the LSP already routes.
- The `verum profile` / `verum verify --profile` CLI commands remain
  the non-interactive entry points.

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

Beyond standard LSP 3.17, the Verum server routes these JSON-RPC methods:

| Method                       | Status | Purpose                                                                                                     |
|------------------------------|--------|-------------------------------------------------------------------------------------------------------------|
| `verum/validateRefinement`   | live   | Validate the refinement at a cursor position; returns `{ valid, diagnostics, performanceMs }` with counter-examples and quick-fix edits. |
| `verum/promoteToChecked`     | live   | Upgrade `&T` → `&checked T` with proof comment; returns the `TextEdit`s to apply.                           |
| `verum/inferRefinement`      | live   | Infer the tightest refinement type for a symbol from its usages; returns `{ inferredType, confidence, usages, edits }`. |
| `verum/getEscapeAnalysis`    | live   | CBGR escape-analysis report for the reference sigil under the cursor; returns `{ markdown, range, sigil, tier, derefCostNs, promotable }`. |
| `verum/getProfile`           | live   | Return the cached per-document compilation / CBGR profiling summary used by the dashboard webview.           |

All five methods are registered through tower-lsp's
`LspService::build(...).custom_method(...)` chain in
`crates/verum_cli/src/commands/lsp.rs`. The Z3 session driving the
refinement methods runs on a dedicated OS thread
(`verum-smt-worker`) isolated by `crates/verum_lsp/src/smt_worker.rs`, so
the futures that cross tower-lsp's `Future: Send` bound never capture
`Rc` / `NonNull` from the Z3 bindings.

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
