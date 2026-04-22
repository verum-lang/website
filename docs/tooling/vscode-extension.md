---
sidebar_position: 7
title: VS Code Extension
description: Verum Language Support for Visual Studio Code — syntax, LSP, inlay hints, debugger, profile dashboard.
---

# VS Code Extension

The **Verum Language Support** extension is the primary IDE integration
for Verum. It is a thin VS Code wrapper around `verum lsp` and
`verum dap` — the heavy lifting (parsing, type-checking, refinement
validation, CBGR analysis, SMT-backed verification) happens in the
`verum` binary. The extension contributes the editor surface:
highlighting, snippets, commands, inlay hints, code actions, the
profile dashboard, and the debug integration.

## Install

### From the Marketplace

```
ext install verum-lang.verum
```

### From a `.vsix` file

```bash
code --install-extension verum-language-0.2.0.vsix
```

The extension requires the `verum` binary on `$PATH` (or set
`verum.lsp.serverPath` to an absolute path). Install the toolchain
per [Installation](/docs/getting-started/installation).

## What ships inside

| Component | What it does | Powered by |
|-----------|--------------|-----------|
| **TextMate grammar** | Offline syntax highlighting grammar-complete against `grammar/verum.ebnf` — keywords, refinement predicates, raw multiline strings, tagged literals, `@attribute(args)`. | `syntaxes/verum.tmLanguage.json` |
| **Semantic highlighting** | LSP-driven additions on top of TextMate: refinement vs. regular types, CBGR reference tiers, proof identifiers, context providers / consumers. | `verum lsp` → `textDocument/semanticTokens` |
| **Snippets** | Prefix-driven scaffolds for `type is`, `is protocol { }`, `implement for`, `mount`, `fn-verify-formal`, `nursery`, `select`, refinement shapes, tagged literals, proof blocks. | `snippets/verum.json` |
| **Diagnostics** | Parse errors, type errors, refinement counter-examples, CBGR warnings — on-type, debounced, with concrete witness values. | `verum lsp` → `textDocument/publishDiagnostics` |
| **Code actions** | Promote `&T` → `&checked T`, insert runtime-check fallback, weaken refinement, convert to sigma type. | `verum/getQuickFixes` custom request |
| **Inlay hints** | Inferred refinement types, inferred generic parameters, CBGR tier hints. | `verum/getInlayHints` custom request |
| **Profile dashboard** | Webview showing verification / CBGR / compile metrics, hot-spot navigation. | `verum/getProfile` custom request |
| **Debug adapter** | Launch / step / breakpoints via `verum dap` speaking DAP over stdio. | `verum dap --transport stdio` |
| **Task provider** | `build` / `run` / `test` / `check` wired to `verum` with the `$verum` problem matcher. | VS Code task API |
| **Terminal links** | `file.vr:42:10` in any terminal becomes a clickable link. | VS Code terminal-link API |

## Activation

The extension activates on any of:

- Opening a `.vr` file (`onLanguage:verum`).
- Opening a workspace that contains `verum.toml` or any `.vr` file.
- Starting a debug session of `type: verum`.

On activation the extension spawns:

```
${verum.lsp.serverPath} lsp --transport stdio
```

and keeps the client alive for the life of the window. The first
`.vr` you open triggers the LSP's project analysis; subsequent edits
reuse the incremental pipeline.

## Commands

All commands live under the **`Verum`** category (Ctrl/Cmd-Shift-P):

| Command | Default binding | Effect |
|---------|-----------------|--------|
| `Verum: Run Current File` | `Cmd+Shift+R` | `verum run <file>` in an editor terminal. |
| `Verum: Run Test` | — | `verum test <file> --filter <fn>` at the cursor. |
| `Verum: Verify Function Contracts` | — | Re-verify `@verify(...)` obligations under the cursor. |
| `Verum: Show Escape Analysis` | — | Show the CBGR escape-analysis report for the `&` sigil at the cursor. Re-dispatches to `editor.action.showHover`; the hover bubble already contains the structured markdown (tier, mutability, escape verdict, promotion availability). Emitted by the LSP code-action "View escape analysis details". |
| `Verum: Promote to &checked Reference` | `Cmd+Alt+C` | Ask the server to upgrade `&T` → `&checked T` with proof comment. |
| `Verum: Add Runtime Check (Result<T, E>)` | — | Wrap in a runtime fallback when escape-analysis fails. |
| `Verum: Infer Refinement Type` | `Cmd+Alt+R` | Ask the server for a refinement suggestion for the symbol at cursor. |
| `Verum: Validate Refinement at Cursor` | `Cmd+Alt+V` | One-shot SMT validation of the refinement at the cursor. |
| `Verum: Profile Current File` | — | Run profiling; results populate the dashboard. |
| `Verum: Open Profile Dashboard` | — | Focus the explorer-pane webview. |
| `Verum: Restart Language Server` | — | Kill and respawn `verum lsp`. |
| `Verum: Show Language Server Status` | — | Current state + crash count. |
| `Verum: Format Document` | `Cmd+Shift+F` | Delegates to LSP formatter. |

All five `verum/*` JSON-RPC methods backing these commands are live;
the server routes them through
`LspService::build(...).custom_method(...)`. Z3 is isolated behind a
dedicated `verum-smt-worker` OS thread so the handler futures are
`Send` — see
[LSP → Custom `verum/*` JSON-RPC methods — architecture](/docs/tooling/lsp#custom-verum-json-rpc-methods--architecture)
for the full call path.

## Configuration

The extension reads settings under `verum.*`. The defaults match the
recommendations in [CLI](/docs/tooling/cli) and
[LSP](/docs/tooling/lsp).

### LSP

| Setting | Default | Meaning |
|---------|---------|---------|
| `verum.lsp.enable` | `true` | Master switch. |
| `verum.lsp.serverPath` | `"verum"` | Path to the `verum` binary. |
| `verum.lsp.validationMode` | `"quick"` | `quick` (&lt; 100 ms) / `thorough` (&lt; 1 s) / `complete` (unbounded). |
| `verum.lsp.enableRefinementValidation` | `true` | Run SMT-backed refinement validation while typing. |
| `verum.lsp.showCounterexamples` | `true` | Attach concrete witness values to refinement errors. |
| `verum.lsp.showInlayHints` | `true` | Inline inferred types and CBGR tiers. |
| `verum.lsp.diagnosticDelay` | `200` ms | Debounce between keystroke and validation. |
| `verum.lsp.smtSolver` | `"auto"` | `auto` / `z3` / `cvc5`. `auto` lets the compiler's capability router pick. Override only to reproduce a specific result. |
| `verum.lsp.smtTimeout` | `50` ms | Per-obligation SMT timeout for live validation (build-time timeout is separate; see `verum.toml [verify] solver_timeout_ms`). |
| `verum.lsp.cacheValidationResults` | `true` | Cache SMT results keyed by goal hash. |
| `verum.lsp.cacheTtlSeconds` | `300` | Cache entry TTL. The server hot-swaps capacity/TTL on `workspace/didChangeConfiguration` — no restart. |
| `verum.lsp.cacheMaxEntries` | `1000` | Cache capacity. On downsize, oldest entries are evicted. |
| `verum.lsp.maxCounterexampleTraces` | `5` | Max execution-trace steps attached to a counter-example. |
| `verum.lsp.trace.server` | `"off"` | `messages` / `verbose` dumps LSP traffic to the output channel. |

### CBGR

| Setting | Default | Meaning |
|---------|---------|---------|
| `verum.cbgr.enableProfiling` | `false` | Enable CBGR per-deref profiling (≈ 15 ns overhead). |
| `verum.cbgr.showOptimizationHints` | `false` | Opt-in inlay hints on every `&` reference — compact badges (`0ns` for promotable, `~15ns` for CBGR-tier-0, nothing on `&checked` / `&unsafe`). Skipped in type positions (`fn f(p: &T)`). Off by default; the hover bubble already shows this information on demand. |

### Verification

| Setting | Default | Meaning |
|---------|---------|---------|
| `verum.verification.showCostWarnings` | `true` | Warn when a single obligation exceeds the slow threshold. |
| `verum.verification.slowThresholdMs` | `5000` | Slow-verification threshold. |

### Code lens / formatting / debug

| Setting | Default | Meaning |
|---------|---------|---------|
| `verum.codeLens.enable` | `true` | All code lenses on/off. |
| `verum.codeLens.showRunButton` | `true` | "▶ Run" above `fn main`. |
| `verum.codeLens.showTestButton` | `true` | "▶ Test" above `@test fn`. |
| `verum.codeLens.showReferences` | `true` | Reference count above every top-level symbol. |
| `verum.formatting.enable` | `true` | Format on save. |
| `verum.semanticHighlighting.enable` | `true` | Use LSP semantic tokens on top of TextMate. |
| `verum.debug.defaultTier` | `"interpreter"` | `interpreter` (VBC, full step/breakpoint support) or `aot` (LLVM, reduced). |
| `verum.debug.dapServerPath` | `""` | Override the DAP server path; empty falls back to `verum.lsp.serverPath`. |

Settings changes are forwarded live via
`workspace/didChangeConfiguration` — no restart needed for any of
them.

## Syntax-highlighting model

The grammar is **grammar-driven**: every keyword, literal form, and
attribute shape in [`grammar/verum.ebnf`](https://github.com/verum-lang/verum/blob/main/grammar/verum.ebnf)
has a corresponding TextMate pattern. Key points:

- **Keywords**. All four tiers — reserved (`let` / `fn` / `is`),
  primary (`type` / `where` / `using`), control-flow, async, proof —
  are matched exhaustively. Rust-style `struct` / `enum` / `trait` /
  `impl` / `ref` / `move` / `drop` are **not** Verum syntax and are
  not highlighted.
- **Strings**. Triple-quoted `"""..."""` (always raw, always
  multiline), byte strings `b"..."`, interpolated `f"..."` /
  `f"""..."""` (with `{expr:format}` format-spec scope inside),
  character literals `'x'`.
- **Tagged literals**. `sql#"""..."""` and its ~40 format-tag
  friends (`json`, `json5`, `yaml`, `toml`, `xml`, `html`, `csv`,
  `rx`, `url`, `d`, `dur`, `ip`, `b64`, `hex`, `sh`, `css`, `lua`,
  `asm`, …) with language-specific embedded scopes where it makes
  sense, plus `${expr}` interpolation.
- **Refinement predicates**. The `{ self > 0 && self <= 100 }`
  shape after a type reference is detected heuristically and
  scoped as `meta.refinement.verum`, with `self` highlighted as a
  language variable.
- **Attributes**. `@derive(A, B)` highlights each derivee;
  `@verify(formal)` validates against the 9 strategies in the
  spec; `@name(args)` gets generic parameter/value scopes.
- **No `#[...]`**. Verum uses `@` exclusively; there are no
  Rust-style hash attributes.
- **No `name!` macros**. Verum has no macro-bang syntax —
  compile-time constructs all use `@` (`@derive`, `@const`,
  `@cfg`, `@sql_query`, user-defined `@my_macro`).

## Snippets cheatsheet

The most common prefixes:

| Prefix | Expands to |
|--------|-----------|
| `fn` | Function definition |
| `fn-verify-formal` | `@verify(formal) fn ... requires ... ensures ...` |
| `fn-throws` | Function with typed error boundary |
| `fn-using` | Function with `using [Context]` clause |
| `type` | Type alias |
| `type-refined` | Refinement type (`Int { self > 0 }`) |
| `type-record` / `type-variant` | Record / sum type |
| `type-newtype` | Opaque wrapper (`type X is (Int);`) |
| `protocol` | `type X is protocol { ... }` |
| `impl` / `impl-generic` / `impl-where` | `implement [Proto] for Type` forms |
| `mount` / `mount-items` / `mount-as` / `mount-glob` | Module imports |
| `match-maybe` / `match-result` | Pattern-match on `Maybe<T>` / `Result<T, E>` |
| `try` / `try-finally` / `try-full` | Error handling blocks |
| `defer` / `errdefer` | Scoped cleanup |
| `async-fn` / `spawn` / `nursery` / `select` | Async / structured concurrency |
| `ref-checked` / `ref-unsafe` | CBGR tier sigils |
| `theorem` / `lemma` / `proof` / `calc` / `forall` / `exists` | Proof constructs |
| `sql` / `rx` / `json` / `html` / `url` / `date` | Tagged literal scaffolds |
| `fstring` / `fstring-multi` / `raw-string` | String literal shapes |

## Debugging

The extension ships a VS Code debug configuration type `verum`.
Press F5 inside any `.vr` file to launch the default config:

```jsonc
{
  "type": "verum",
  "request": "launch",
  "name": "Debug Verum Program",
  "program": "${file}",
  "stopOnEntry": false,
  "tier": "interpreter"
}
```

`tier: "interpreter"` runs the program through the VBC interpreter
with full DAP support (step-into, step-over, breakpoints, variable
inspection). `tier: "aot"` links native and exposes a reduced
breakpoint set. The initial configuration palette provides three
scaffolds: *Debug Current File*, *Debug with Arguments*, *Debug
(Stop on Entry)*.

## Tasks

The extension registers a `verum` task type. In `.vscode/tasks.json`:

```jsonc
{
  "type": "verum",
  "task": "build",   // build | run | test | check
  "problemMatcher": ["$verum"]
}
```

The `$verum` problem matcher parses `error[V####]: …` / `--> file.vr:L:C`
outputs and surfaces them as diagnostics in the Problems panel.

## Troubleshooting

### Status bar shows `Verum: Error`

The LSP server failed to start. Check the *Verum Language Server*
output channel for the actual stderr. Most likely causes:

- `verum` not on `$PATH` — fix `verum.lsp.serverPath`.
- `verum` version too old for the grammar in your file — re-download the
  binary from [GitHub Releases](https://github.com/verum-lang/verum/releases)
  and replace `/usr/local/bin/verum`.
- Corporate VPN rewrites certificates — unrelated; LSP uses stdio.

### `verum.lsp.smtSolver` set to `z3` produces different results from `auto`

Expected — `auto` races Z3 and CVC5 according to the goal shape.
Prefer `auto` for correctness-critical work and `z3` or `cvc5` only
when reproducing a specific solver's trace. See
[Verification / SMT routing](/docs/verification/smt-routing).

### `@verify(formal)` obligations time out while typing

`verum.lsp.validationMode` defaults to `quick` (≤ 100 ms budget).
For hot files you're actively proving, bump to `thorough` — it
accepts a 1 s ceiling and retries with a different tactic. For full
solver budgets, verify at build time via `verum check` rather than
on-type.

### "Cannot promote: escape analysis could not prove safety"

`Verum: Promote to &checked Reference` asks the compiler to upgrade
a CBGR reference to the zero-cost tier. If the escape analysis can't
prove that the reference is stack-local, the promotion is refused.
Use `Verum: Add Runtime Check (Result<T, E>)` instead, which wraps
the deref in a fallible result.

## See also

- **[LSP](/docs/tooling/lsp)** — the protocol-level feature set the
  extension surfaces.
- **[CLI](/docs/tooling/cli)** — the commands invoked by task /
  run / test / debug actions.
- **[Installation](/docs/getting-started/installation)** — install
  the `verum` binary the extension drives.
- **[Playbook](/docs/tooling/playbook)** — terminal UI with the
  same indexing infrastructure.
