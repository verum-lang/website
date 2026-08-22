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
session is a **growing module**: conceptually, cell *k* runs against
the module formed by cells 1..k — state lives in the question, not in
a hidden kernel. There is no Jupyter-style invisible state to
un-reproduce; re-running from the top always means the same thing.

The status line always teaches the next 3–5 keys; `?` opens the full
key map. Run a cell with `F5` (or `x` in vim mode), all cells with
`F9` / `X`.

## Lenses

`Tab` cycles the sidebar through one lens at a time — one cell, many
truths; the lens picks which to show:

| Lens | Shows | Source |
|---|---|---|
| Vars | bindings with inferred types and value previews | execution context |
| Cells | outline of the notebook | session |
| **Arch** | the notebook-as-module's inferred capability surface, its `@arch_module` pin, escalations (red) and dead rights (yellow), unresolved calls | `verum arch query` |
| **VBC** | the bytecode of the notebook, disassembled from the same `VbcModule` artifact the interpreter runs | in-process disassembler |
| **Tiers** | interpreter-vs-AOT verdict — on demand only: press `t` (it builds both tiers and reports its cost) | `verum diff-tiers` |
| **Journal** | the session's glass mind: every question asked — runs, queries, judgments — with wall time and chain address | session ledger |
| Session | execution stats | session |

The cheap lenses (Arch, VBC) refresh themselves whenever their
subject may have changed while visible — landing on the tab,
executing cells with the tab open. The expensive lens (Tiers) answers
only when explicitly asked, and the answer wears its price.

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

## Keys (defaults)

| | |
|---|---|
| `↑/↓` (`j/k`) | move between cells |
| `Enter` (`i`) | edit the cell; `Esc` leaves |
| `F5` (`x`) | run cell · `F9` (`X`) run all |
| `Ins` (`o`) | new cell · `Del` (`D`) delete |
| `Tab` | next lens · `Ctrl+B` toggle sidebar |
| `t` | (in the Tiers lens) run the tier judge |
| `?` | the full key map |
| `Ctrl+S` | save · `q` quit |

`--vim` enables the vim-style bindings shown in parentheses.
