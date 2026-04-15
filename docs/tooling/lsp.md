---
sidebar_position: 4
title: LSP
---

# Language Server

`verum lsp` runs a Language Server Protocol 3.17 server over
stdin/stdout. Every major editor can connect.

## Features

### Diagnostics

- Real-time parse / type / verification errors.
- Refinement-type violations with counter-examples.
- CBGR warnings with escape-analysis explanations.

### Code navigation

- Go to definition / declaration / type definition / implementation.
- Find references.
- Document symbols.
- Workspace symbols.
- Call hierarchy.
- Type hierarchy.

### Editing

- Completion (context-aware, protocol methods, patterns).
- Signature help.
- Hover: full type, refinements, contracts, documentation.
- Inlay hints: inferred types, CBGR tier (`&T` → `&checked T` after
  promotion), capability bits.
- Rename (symbol-aware, respects visibility).
- Code actions:
  - Auto-import.
  - Derive missing protocol methods.
  - Add `@verify` annotation.
  - Split / merge `match` arms.
  - Promote to `&checked` where proof succeeds.

### Formatting

- Full-file and range formatting.
- Configurable via `.verumfmt.toml`.

### Refactoring

- Extract function / variable.
- Inline function / variable.
- Convert refinement form (inline ↔ type-level ↔ `where requires`).

### Semantic tokens

- Fine-grained syntax highlighting based on static analysis:
  - Distinguishes unused / mutated / moved variables.
  - Colours capability-bearing references differently.
  - Indicates verified vs unverified code paths.

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
```

## Editor integration

### VS Code

```
ext install verum-lang.verum
```

### Neovim

```lua
require('lspconfig').verum.setup{
  cmd = {'verum', 'lsp'},
  filetypes = {'verum'},
  root_dir = require('lspconfig.util').root_pattern('Verum.toml'),
}
```

### Emacs

```elisp
(use-package lsp-mode
  :config
  (lsp-register-client
   (make-lsp-client :new-connection (lsp-stdio-connection '("verum" "lsp"))
                    :major-modes '(verum-mode)
                    :server-id 'verum)))
```

### IntelliJ / Helix / Kate

Generic LSP configuration — command `verum lsp`, root marker `Verum.toml`.

## Extensions

Verum's LSP exposes custom capabilities beyond LSP 3.17:

- `verum/refinement-proof` — show SMT proof term for a hovered refinement.
- `verum/cbgr-report` — run CBGR analysis on a file.
- `verum/expand-macros` — show macro expansion for a location.
- `verum/verify-at-point` — run SMT on the enclosing function, report
  obligations.

## Performance

Incremental under the hood: a keystroke triggers only the changed
functions' re-verification. Typical responsiveness on a 50 K-LOC
project: diagnostics within 100 ms, completion within 50 ms.

## See also

- **[CLI](/docs/tooling/cli)** — `verum lsp` subcommand.
- **[Playbook](/docs/tooling/playbook)** — interactive TUI driven by
  the same indexing machinery.
