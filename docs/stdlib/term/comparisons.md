---
sidebar_position: 6
title: Comparison
description: How core.term stacks up against Ratatui, Textual, Ink and Bubble Tea.
---

# Comparison with other TUI frameworks

Verum's TUI stack is a late-comer to an industry with mature options. It
borrows freely from all of them, and differs in a few opinionated ways.

## At a glance

| Aspect | Verum `core.term` | Ratatui (Rust) | Textual (Python) | Ink (Node) | Bubble Tea (Go) |
|---|---|---|---|---|---|
| Architecture | TEA — Elm | Immediate | Reactive / CSS | React + hooks | TEA — Elm |
| Rendering | Double-buffer + diff + row-skip + sync-output | Double-buffer + diff | Diff + dirty regions | VDOM diff | Double-buffer + diff |
| Layout | Constraint + **Flex** + **Grid** | Constraint only | CSS Grid / Flex | Yoga flex | Lip Gloss manual |
| Widgets | 20 built-in | ~20 | ~40 | ~15 via Ink UI | Bubbles set (~15) |
| Async | `Command.task(future)` native | `tokio` you wire yourself | `async def`, native | async/await | `tea.Cmd` = `func() Msg` |
| Subscriptions | First-class `Subscription` | Manual | CSS watchers, reactive | `useEffect` | `tea.Sub` (deprecated — now `Cmd`) |
| Cancellation | Structured, automatic | Manual | Automatic | Manual | Manual |
| Unicode | Grapheme-aware; ZWJ emoji, flags | Via `unicode-width` | Full | Full | `runewidth` |
| Mouse | SGR 1006 | SGR 1006 | SGR 1006 | SGR 1006 | SGR 1006 |
| Graphics | Kitty + Sixel + iTerm2 + Braille fallback | Via third-party | Limited | No | No |
| Clipboard | OSC 52 built-in | Via third-party | Via `pyperclip` | `clipboardy` | `clipboard-go` |
| Accessibility | OSC 133 zones | No | Partial | No | No |
| Colour profile | Auto-detect + CIELAB downsampling | Auto-detect (naive) | CSS variables | Truecolor only | Auto-detect |
| Testing | Pure `update`, snapshot `Buffer` | Mock terminal | `pytest` snapshots | `ink-testing-library` | Model testing |

## What Verum does better

* **Out-of-box graphics.** Kitty + Sixel + iTerm + Braille fallback is
  one function call (`create_graphics_renderer(caps, writer)`).
* **Structured async.** `Command.task(future)` is spawned on the same
  runtime that backs `core.async`; cancellation is wired automatically.
* **Perceptual colour adaptation.** CIELAB distance gives the right
  fallback on 16-colour shells; naive RGB distance (Ratatui, Bubble Tea)
  does not.
* **Full Flex + Grid.** Ratatui ships only `Constraint`; Verum has CSS
  Flex Level 1 plus CSS Grid Level 1 with `fr` units and `minmax()`.
* **Strong typing end-to-end.** Verum's `Command<Msg>` is parameterised;
  Bubble Tea's is `func() tea.Msg` with `interface{}` payloads.

## What Textual does better (today)

* **Declarative CSS.** Textual's TCSS is the most ergonomic terminal
  styling language. Verum's `Theme` + `Style` builder is equivalent in
  expressive power but not in terseness for static skins. This is on the
  roadmap — see the [theming guide](./guides/styling-theming.md).
* **40+ widgets.** Textual's widget library is the biggest in the
  industry. Verum ships 20 production-grade widgets; most missing ones
  (`DataTable`, `Switch`, `TabbedContent`, `Markdown`, `DirectoryTree`)
  can be assembled from existing primitives in < 200 lines.
* **Web deployment.** Textual apps can run in a browser via `textual serve`.
  Verum's path here goes through WASM + xterm.js; not yet shipped.

## What Ink/React-style does better

* **Component reuse.** React hooks make per-widget state trivial to share
  between components. Verum's `StatefulWidget` with an associated `State`
  type is equivalent but more boilerplate.

## Migration notes

* **From Ratatui.** The rendering layer (`Buffer`, `Frame`, `Widget`) is
  almost 1:1 — `Cell`, `set_string`, `set_style`, `get_mut` — so porting
  widgets is mostly a syntax exercise. The `app` layer is different (TEA
  vs immediate); but if your Ratatui app used `tokio` + a state machine
  you're halfway to TEA already.
* **From Bubble Tea.** The Elm architecture maps straight across.
  `tea.Cmd` ↔ `Command`; `tea.Sub` ↔ `Subscription`; `tea.Model.Update`
  ↔ `Model::update`; `tea.Model.View` ↔ `Model::view`. The biggest
  difference: Verum commands are typed by `Msg`, not `interface{}`.
* **From Textual.** Reactive attributes become explicit `Msg` transitions
  in `update`. CSS rules become `Theme` + `Style` at render time. Timer
  watchers become `Subscription.interval`.
