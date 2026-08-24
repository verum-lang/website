---
sidebar_position: 5
title: Playground
description: The notebook TUI — cells, guided tours, and research lenses over the same vocabulary agents use.
---

# Playground (`verum play`)

`verum play` opens Verum's notebook TUI — the human client of the
same machine surface that agents and the CLI speak. One derivation of
every truth, three transports: the CLI for scripts, the Agent
Protocol for machines, the Playground for people.

```bash
$ verum play                 # empty launch → the gallery
$ verum play notes.vrbook    # open a book
$ verum play demo.vr         # preload a source file
```

(`verum playbook` is the same command; `play` is the short alias.)

## The gallery

An empty launch opens a chooser, not a bare buffer:

- **blank sheet** — an empty notebook;
- **guided tours** — built from
  [`docs/by-example`](https://github.com/verum-lang/verum/tree/main/docs/by-example)
  at compile time: *First steps*, *Collections & functions*,
  *Abstraction*, *Researcher: memory, proofs, contexts*, plus every
  remaining chapter. The tours **are** the by-example chapters — one
  truth of the examples, embedded at build time, zero drift;
- **recent books** — the working directory's newest `.vrbook` files.

## Cells and the state law

A notebook is a sequence of markdown and code cells. The accumulated
session is a **growing module**: cell *k* runs against the module
formed by cells 1..k, recomputed from source through the same
compiler `verum run` uses — state lives in the question, not in a
hidden kernel. There is no Jupyter-style invisible state to
un-reproduce, and cells reach the entire stdlib through `mount`,
exactly like any script.

The status line always teaches the next 3–5 keys; `?` opens the full
key map. Run a cell with `F5` (or `x` in vim mode), all cells with
`F9` / `X`.

## Lenses

`Tab` cycles the sidebar through one lens at a time — one cell, many
truths; the lens picks which to show:

| Lens | Shows | Source |
|---|---|---|
| Vars | top-level bindings with values FROM the last run | the run's VARS channel |
| Cells | outline of the notebook | session |
| **Arch** | the notebook-as-module's inferred capability surface, its `@arch_module` pin, escalations (red) and dead rights (yellow), unresolved calls | `verum arch query` |
| **VBC** | the bytecode of the notebook, disassembled from the same `VbcModule` artifact the interpreter runs | in-process disassembler |
| **Tiers** | interpreter-vs-AOT verdict — on demand only: press `t` (it builds both tiers and reports its cost) | `verum diff-tiers` |
| **Journal** | the session's glass mind: every question asked — runs, queries, judgments — with wall time and chain address | session ledger |
| **Console** | anything the process wrote outside the notebook — compiler diagnostics, warnings, a worker's panic message | captured stdout/stderr |
| Session | execution stats | session |

The Arch lens refreshes itself whenever its subject may have changed
while visible. The VBC lens compiles the whole notebook, so it works
on a background thread and shows `disassembling…` until the answer
arrives — switching tabs never blocks the interface. The expensive
lens (Tiers) answers only when explicitly asked, and the answer wears
its price.

Writes that are not the notebook's own output — a diagnostic from the
compiler, a warning, a stray message from a worker — are captured for
the **Console** lens rather than printed over the interface. A cell
that produces no output says so, so an empty panel never has to be
distinguished from a broken one.

## Books: `.vrbook` v2 and bit-for-bit replay

A saved book carries its **content-address chain**: cell *k*'s
address is `sha256(address[k-1] ‖ source[k])` over the code cells.
The chain makes books replayable:

```bash
$ verum play --replay notes.vrbook
    Finished replay identical: 9 cells (7 compared, 2 unrecorded), chain head 368f81f5af26
```

- a book whose recorded chain does not match its sources (an
  out-of-step hand edit) is refused **before execution** — exit 2;
- a recorded output that does not reproduce bit-for-bit names its
  cell and address — exit 3;
- identical — exit 0.

Execution timing is a price badge, not a result: it is stripped from
the comparison, so replays never diverge on the clock.

`--freeze report.md` replays and then writes a frozen snapshot — the
sources, chain addresses, and the outputs that *actually happened* on
that run. The frozen book is a report; the live book stays the truth.

## The cell editor

Editing a cell opens a real code editor, not a line buffer: syntax
highlighting, bracket-match highlighting, a `Ln, Col` status in the
frame title, and horizontal panning for long lines. It stays fast on
megabyte-class buffers — undo history is stored as line-span deltas,
so typing in a 40 000-line cell costs the same as in a 4-line one.

**Modal fullscreen**: `Ctrl+F` / `F11` expands the editor over the
whole terminal — the notebook disappears until you leave. The first
`Esc` collapses the modal back into the notebook; the second leaves
edit mode.

| Editing | |
|---|---|
| `Enter` | auto-indents; after `{` opens an indented block; inside `{}` splits it into open / body / close |
| `(` `[` `{` `"` | auto-close; typing the closer skips over it; with a selection, wraps it |
| `Backspace` on an empty pair | removes both halves |
| `Ctrl+D` | duplicate line / selected block |
| `Ctrl+Shift+K` | delete line(s) |
| `Alt+↑/↓` | move line / block up / down |
| `Ctrl+/` | toggle `//` comments |
| `Tab` / `Shift+Tab` | indent / dedent a multi-line selection |
| `Ctrl+K` · `Ctrl+J` | kill to end of line · join lines |
| `Ctrl+←/→` | move by word · `Ctrl+Backspace/Del` delete by word |
| `Home` | smart home (first non-blank ↔ column 0) |
| `Ctrl+Z` / `Ctrl+Shift+Z` | undo / redo (word-level coalescing) |
| `Ctrl+C/X/V` | system clipboard · `Ctrl+A` select all |
| `Tab` (bare cursor) | complete word (cycles) |
| `F5` / `Ctrl+R` / `Alt+Enter` | run the cell from inside the editor |

## Keys (defaults)

| | |
|---|---|
| `↑/↓` (`j/k`) | move between cells |
| `Enter` (`i`) | edit the cell; `Esc` leaves |
| `F5` (`x`) | run cell · `F9` (`X`) run all |
| `Ins` (`o`) | new cell · `Del` (`D`) delete |
| `Tab` | next lens · `Ctrl+B` toggle sidebar |
| `t` | (in the Tiers lens) run the tier judge |
| `/` | search across cells (both binding modes) |
| `?` | the full key map |
| `Ctrl+S` | save · `q` quit |

`--vim` enables the vim-style bindings shown in parentheses.
