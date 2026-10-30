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

Open documents are parsed and type-checked against a captured project source
generation. The service shares module candidate resolution, export visibility,
import resolution and declaration preparation with the compiler. Project types,
functions, aliases and re-exports therefore feed diagnostics, imported-name
completion, hover and definition navigation from the same source registry.

The workspace root selects `src/` when present. `Verum.toml` or `verum.toml`
supplies the cog name and local path dependencies. Open buffers override captured
disk contents. Changing or closing a dependency rechecks open consumers, including
consumers whose document version has not changed. File watcher notifications and
analysis requests also detect changed disk sources and manifests.

Each published diagnostic set includes its document version; snapshot requests
also return a project generation hash. Stale diagnostic generations cannot
replace current results. Positions use LSP UTF-16 columns, including non-BMP
characters and CRLF line endings. Without a workspace root, analysis remains
module-local.

The release CLI supplies its embedded standard-library type metadata to this
service. Library imports use the compiler's module-export projection and type
checker, including declaration ownership, public visibility, constants and static
values. Snapshots include `library_metadata.sha256`; the artifact identity also
participates in the project generation hash. Library symbols without source text
provide type information without an invented navigation location.

Standalone hosts can supply the matching release `.core_metadata` artifact.
Without it, `analysis_scope` reports analysis with builtins. Registry-installed
binary cogs are not loaded by the editor service. Source-only blanket protocol
seeding remains a compiler responsibility. An empty diagnostics list covers the
open module bodies and available dependency
declarations, not every dependency body or whole-project contracts. Use the CLI
project checker for build acceptance. Optional disk lint runs only when the saved
source matches the buffer; cursor refinement validation is a separate request.

The `verum/documentSnapshot` and `verum/projectSnapshot` requests expose these
same declarations, resolved bindings, source hashes, project revision and capture
issues to Studio, VS Code's Architecture view and reviewed agent tools. Source
capture is bounded to 4,096 files, 512 KiB per file and 64 MiB total; exceeding a
limit reports unavailable analysis instead of retaining an older generation.
Explicit source-library directories can be supplied through the startup
`initializationOptions.libraryRoots` map from cog name to absolute source root.
Custom build feature selection, file-relative mounts and binary archive loading
remain compiler build responsibilities.

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
  - `using [...]` context clauses (when implicit).
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
  bare `requires` clause.
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
| `validationMode` | `"quick"` \| `"thorough"` \| `"complete"` | `"quick"` | Per-call deadline: 100 ms, 1 s, or the configured `smtTimeout`. |
| `showCounterexamples` | bool | `true` | Include concrete counter-examples in diagnostics. |
| `maxCounterexampleTraces` | int | `5` | Cap on execution-trace steps in a counter-example. |
| `smtSolver` | `"auto"` \| `"z3"` \| `"cvc5"` | `"auto"` | Cursor validation uses Z3 for `auto`/`z3`; CVC5 is inconclusive in this worker. |
| `smtTimeout` | int (ms) | `50` | Per-query SMT timeout. |
| `cacheValidationResults` | bool | `true` | Cache SMT queries so unchanged refinements don't re-run. |
| `cacheTtlSeconds` | int | `300` | Cache entry TTL. |
| `cacheMaxEntries` | int | `1000` | Cache capacity. On downsize, oldest entries are evicted. |
| `cbgrEnableProfiling` | bool | `false` | Turn on CBGR runtime profiling instrumentation. |
| `cbgrShowOptimizationHints` | bool | `false` | Opt-in CBGR inlay hints (`0ns` / `~1.5ns` badges). |
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
  "verum.lsp.smtSolver": "auto",
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

The supported `verum/*` methods are listed under [Custom LSP extensions](#custom-lsp-extensions). Their call path is:

1. The client sends `verum/validateRefinement` (or similar) over the
   stdio / TCP / pipe transport.
2. The LSP router dispatches to the matching `handle_*` async
   method, registered through the standard custom-method chain.
3. Refinement handlers capture the open document and analyze that exact source.
   Validation sends SMT work to a dedicated `verum-smt-worker` thread. A response
   is refused if the document was changed, closed or reopened during analysis.
4. The worker thread exclusively owns the solver-adapter context; it returns
   `SmtCheckResult` through a `tokio.sync.oneshot`. Only `Send`
   types cross the await boundary.
5. `getEscapeAnalysis` and `getProfile` don't touch the SMT layer — they run in
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
- Explicit cursor refinement validation with distinct inconclusive outcomes.
- Embedded Playbook panel.

### Neovim (nvim-lspconfig)

```lua
require('lspconfig').verum.setup{
  cmd = {'verum', 'lsp'},
  filetypes = {'verum'},
  root_dir = require('lspconfig.util').root_pattern('verum.toml'),
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

Generic LSP setup: command `verum lsp`, root marker `verum.toml`,
filetype `.vr`.

## Custom LSP extensions

Beyond standard LSP 3.17, the Verum server routes these JSON-RPC methods:

| Method                       | Status | Purpose                                                                                                     |
|------------------------------|--------|-------------------------------------------------------------------------------------------------------------|
| `verum/validateRefinement`   | live   | Validate the refinement at a cursor position; returns `{ status, valid, diagnostics, performance_ms }` with counter-examples and quick-fix edits. |
| `verum/promoteToChecked`     | live   | Upgrade `&T` → `&checked T` with proof comment; returns the `TextEdit`s to apply.                           |
| `verum/inferRefinement`      | live   | Infer the tightest refinement type for a symbol from its usages; returns `{ inferred_type, confidence, usages, edits }`. |
| `verum/getEscapeAnalysis`    | live   | CBGR escape-analysis report for the reference sigil under the cursor; returns `{ markdown, range, sigil, tier, derefCostNs, promotable }`. |
| `verum/getProfile`           | live   | Return the cached per-document compilation / CBGR profiling summary used by the dashboard webview.           |

These methods are registered through the LSP service's
custom-method chain. The SMT-adapter session driving the refinement
methods runs on a dedicated OS thread (`verum-smt-worker`)
isolated from the async runtime, so the futures that cross the
`Send` bound never capture non-`Send` adapter binding types.

## Analysis revisions and verification outcomes

`verum/documentSnapshot` accepts `{ textDocument: { uri }, version }` and returns
`verum-document-analysis/1`: the exact source hash, version, compiler diagnostics,
declaration ranges, context requirements and mounts. A mismatched version is
refused with `ContentModified`. `verum/projectSnapshot` returns analyzed document
snapshots with `coverage: "analyzed-documents-only"`; it is not a whole-project
proof. [Studio](./studio.md) and the [VS Code extension](./vscode-extension.md)
consume these shared projections.

The refinement methods use snake_case fields: `text_document`, `include_proof`,
`inferred_type` and `performance_ms`. The document must be open in the LSP session.
`verum/validateRefinement` reports one of:

| Status | Meaning |
|--------|---------|
| `valid` | The selected refinement obligation was discharged. |
| `invalid` | A counterexample was found for that obligation. |
| `unknown` | Validation was disabled, unsupported by the selected worker, timed out, or inconclusive. |
| `not_applicable` | No supported refinement obligation was found at the cursor. |

The compatibility field `valid` is true only for status `valid`. An absent
obligation, missing result or timeout must never be presented as a proof.
Validation caches are bound to source content, cursor position, mode and
configuration. Inconclusive results are not cached. The current cursor-validation
worker uses Z3; selecting CVC5 yields `unknown` rather than relabelling a Z3 result.
This cursor operation does not establish whole-function or whole-project
correctness; use the verification commands for those obligations.

## Performance

Document updates reparse and type-check the module. Analysis is not yet an
incremental dependency graph that rechecks only changed functions. Refinement
queries have per-call deadlines; their in-memory cache avoids repeated work on
identical source and settings. Actual latency depends on document size and query
complexity, so the editor does not treat a deadline as a verification success.

## Logging and diagnostics

Enable verbose logging:

```bash
VERUM_LSP_LOG=debug verum lsp   # verbose server logs to stderr
```

Or set the editor's `trace` level to `"verbose"`. Logs include
request timing, cache hit rates, and solver dispatch decisions.

## Robustness against adversarial input

The LSP runs in the editor's process or as a long-lived server
subprocess; a panic in any request handler kills the language-server
connection and forces a manual restart.  Verum's LSP holds a hard
**no-panic-on-any-input** contract: every entry point that ingests
arbitrary document text and a cursor position must terminate
without crashing, even on:

- **Multi-byte UTF-8 cursors** — combining accents (`U+0301`),
  emoji (`🦀`, 4 bytes), CJK identifiers (`测试`, `函数`), Greek
  / Cyrillic / Hebrew / Arabic letters in identifier or comment
  position.  The cursor position transported by LSP can land
  inside a multi-byte sequence (UTF-16 ↔ UTF-8 column rounding);
  the server clamps to the nearest preceding char boundary
  rather than panicking on the slice.
- **Unbalanced delimiters** (e.g. `((((((`, `}}}}}}`,
  interleaved `({[<({[<({[<`).
- **Truncated tokens** — every keyword and structural form cut
  mid-word.
- **Pathological structural inputs** — 256-deep nested generics,
  1000-arm `match`, 1000-step method chain, 256-stacked `@inline`
  attributes, 64 KB single-line, 100K-blank-line documents.
- **Malformed escape sequences** in string and char literals,
  including unterminated forms.
- **NUL bytes** mid-source.

The server's UTF-8-safe text primitives live in
`verum_common.text_utf8` and are shared across LSP, REPL,
diagnostics, and the bytecode disassembler:

- `clamp_to_char_boundary(text, byte_offset)` — round a byte
  offset DOWN to the nearest preceding char boundary.
- `safe_prefix(text, byte_offset)` — UTF-8-safe `&text[..n]`
  replacement.
- `truncate_chars(text, max_chars)` — character-count truncation
  (for diagnostic preview snippets).
- `find_word_bounds(text, byte_offset, is_word_char)` — returns
  word start/end byte bounds at char boundaries; used by
  `prepare_rename`, `word_at_position`, `complete_at_position`.

Primitives are zero-allocation on the hot path, stdlib-only
(`is_char_boundary` / `char_indices`), and run in
`O(prefix-length)` — the same bound as the buggy ad-hoc code
they replace.

## See also

- **[CLI](/docs/tooling/cli)** — `verum lsp` subcommand.
- **[Playbook](/docs/tooling/playbook)** — TUI built on the same
  indexer.
- **[REPL](/docs/tooling/repl)** — line-oriented interactive mode.
- **[Installation](/docs/getting-started/installation)** — editor
  setup.
