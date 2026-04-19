---
sidebar_position: 4
title: Keyboard &amp; mouse
description: Handling input at every level — from KeyCode pattern-match to SGR mouse.
---

# Keyboard & mouse

## Key events

Every keyboard input becomes an `Event.Key(KeyEvent)` where:

```verum
KeyEvent { code: KeyCode, modifiers: Modifiers, kind: KeyEventKind }
```

`kind` is `Press` by default on most terminals. Kitty keyboard protocol
also delivers `Release` and `Repeat`; if you depend on release events,
check `caps.has_kitty_keyboard` first.

### Matching

```verum
match event {
    Event.Key(ke) => match ke.code {
        KeyCode.Char('q') if ke.modifiers.empty() => quit(),
        KeyCode.Char('s') if ke.modifiers.contains(Modifiers.CTRL) => save(),
        KeyCode.F(5) => refresh(),
        KeyCode.Esc | KeyCode.Char('q') => quit(),
        _ => {}
    },
    _ => {}
}
```

### Common patterns

* **Vim-like navigation** — `KeyCode.Char('j') | KeyCode.Down` in one arm.
* **Global hotkeys** — intercept before per-mode dispatch in `handle_event`:
  ```verum
  if let Event.Key(ke) = &event {
      if ke.is_ctrl_c() { return Some(Msg.Quit); }
  }
  ```
* **Mode switches** — store a `Mode` in your model and match on it first.

## Mouse events

SGR Extended 1006 is auto-enabled if supported:

```verum
Event.Mouse(MouseEvent { kind, column, row, modifiers })
```

Variants of `MouseEventKind`:

* `Down(button)` / `Up(button)` / `Drag(button)` with `button: Left | Right | Middle`
* `Moved` — pointer over terminal without button
* `ScrollUp` / `ScrollDown` / `ScrollLeft` / `ScrollRight`

### Hit testing

```verum
let r = some_widget_area;
if r.contains(me.column, me.row) {
    // clicked inside widget
}
```

### Drag handling

Keep a `dragging: Bool` flag in state and use `Drag(button)` while it's
set. The `Split` widget's `handle_mouse` demonstrates the pattern.

## Paste events

If bracketed paste is enabled (default in the app framework), the whole
pasted payload arrives as a single `Event.Paste(Text)` — never
interleaved with keystrokes. This matters for password prompts and any
input that could be exploited by paste-spoofing.

## Focus events

`Event.FocusGained` / `Event.FocusLost` on terminals supporting mode 1004.
Useful for:

* pausing animations / timers when the window is in the background
* writing a "currently editing" marker for shell prompts
* refreshing data that may have changed while unfocused

## Default dispatchers

Widgets with built-in key handling expose `handle_key(ke)` returning
`Bool`:

| Widget | Bindings |
|---|---|
| `TextInput` | Emacs-style (see [reference](../reference/api-widgets.md#textinput)) |
| `TextArea` | Emacs-lite + Enter-inserts-newline |
| `Dropdown` | Up/Down/PgUp/PgDn/Home/End/Enter/Esc/Backspace for search |
| `Split` via `SplitState.handle_resize_key` | Ctrl+Arrow resize |

Your `handle_event` should:

1. Dispatch global hotkeys first.
2. Route to the focused widget's `handle_key`.
3. Fall back to app-level actions.

```verum
fn handle_event(&self, event: Event) -> Maybe<Msg> {
    let Event.Key(ke) = event else { return None; };

    // Global
    if ke.is_ctrl_c() { return Some(Msg.Quit); }

    // Per-focused-widget
    match self.focus {
        FocusSearch => Some(Msg.SearchKey(ke)),
        FocusList   => match ke.code {
            KeyCode.Up   => Some(Msg.ListUp),
            KeyCode.Down => Some(Msg.ListDown),
            _ => None,
        },
    }
}
```

Then in `update`:

```verum
Msg.SearchKey(ke) => {
    let _ = self.search.handle_key(ke);
    Command.none()
}
```
