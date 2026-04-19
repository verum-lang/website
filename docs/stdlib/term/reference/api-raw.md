---
sidebar_position: 6
title: API reference — raw terminal
description: RawTerminal, EscapeWriter, TermCapabilities, CursorShape, clipboard.
---

# API reference — raw terminal

All types live in `core.term.raw`. This is the lowest layer: if you need
the framework's guarantees (restore-on-exit, Mode 2026, capability
detection) but not its Elm loop, this is your level.

## `RawTerminal`

```verum
public type RawTerminal is protocol extends Read + Write { ... };

public type TerminalMode is Raw | Cooked | CBreak;

public type TerminalSize is { cols: Int, rows: Int };

public type CursorShape is
    | Block         | Line          | Underline
    | BlinkingBlock | BlinkingLine  | BlinkingUnderline;

public type ClearMode is
    | Entire  | AfterCursor  | BeforeCursor
    | Line    | LineAfter    | LineBefore;

impl RawTerminal {
    fn enable_raw_mode(&mut self) -> IoResult<()>
    fn disable_raw_mode(&mut self) -> IoResult<()>
    fn enable_mouse_capture(&mut self) -> IoResult<()>
    fn disable_mouse_capture(&mut self) -> IoResult<()>
    fn enable_bracketed_paste(&mut self) -> IoResult<()>
    fn disable_bracketed_paste(&mut self) -> IoResult<()>
    fn enable_focus_events(&mut self) -> IoResult<()>
    fn disable_focus_events(&mut self) -> IoResult<()>
    fn enter_alternate_screen(&mut self) -> IoResult<()>
    fn leave_alternate_screen(&mut self) -> IoResult<()>
    fn show_cursor(&mut self, visible: Bool) -> IoResult<()>
    fn set_cursor_shape(&mut self, shape: CursorShape) -> IoResult<()>
    fn move_cursor(&mut self, x: Int, y: Int) -> IoResult<()>
    fn clear(&mut self, mode: ClearMode) -> IoResult<()>
    fn size(&self) -> IoResult<TerminalSize>
    fn begin_sync(&mut self) -> IoResult<()>
    fn end_sync(&mut self) -> IoResult<()>
    fn flush(&mut self) -> IoResult<()>
}
```

## `PosixTerminal`

```verum
PosixTerminal.stdin()  -> IoResult<PosixTerminal>
PosixTerminal.stdout() -> IoResult<PosixTerminal>

impl RawTerminal for PosixTerminal { /* ... */ }
```

## `EscapeWriter`

Low-level helpers for writing CSI / OSC / DCS / SS3 sequences. Most code
should not need to talk at this level; use `RawTerminal` methods.

```verum
public type EscapeWriter is protocol {
    fn write_all(&mut self, data: &[Byte]) -> IoResult<()>;
    fn write_csi(&mut self, params: &[Int], final_byte: Byte) -> IoResult<()>;
    fn write_osc(&mut self, code: Int, payload: &Text) -> IoResult<()>;
    fn write_dcs(&mut self, body: &[Byte]) -> IoResult<()>;
    fn write_ss3(&mut self, code: Byte) -> IoResult<()>;
    fn flush(&mut self) -> IoResult<()>;

    fn move_to(&mut self, x: Int, y: Int) -> IoResult<()>;
    fn begin_sync(&mut self) -> IoResult<()>;
    fn end_sync(&mut self) -> IoResult<()>;
};
```

## `TermCapabilities`

```verum
public type TermCapabilities is {
    color_profile: ColorProfile,
    unicode_support: UnicodeSupport,
    mouse_protocol: MouseProtocol,
    has_alternate_screen: Bool,
    has_synchronized_output: Bool,
    has_bracketed_paste: Bool,
    has_focus_events: Bool,
    has_kitty_keyboard: Bool,
    has_kitty_graphics: Bool,
    has_sixel: Bool,
    has_iterm_images: Bool,
    has_hyperlinks: Bool,
    has_osc52_clipboard: Bool,
    has_cursor_shape: Bool,
    term_name: Text,
    term_program: Maybe<Text>,
    is_tmux: Bool,
    is_screen: Bool,
};

public fn detect_capabilities(fd: FileDesc) -> TermCapabilities;
public fn query_background_color(fd: FileDesc) -> Maybe<Rgb>;  // blocking, 100 ms timeout
```

Built from `$TERM`, `$COLORTERM`, `$TERM_PROGRAM`, `$TMUX`, `$STY`,
`$NO_COLOR`, `$LANG` / `$LC_ALL` heuristics and known-good-program lists
(`iTerm.app`, `kitty`, `WezTerm`, `Alacritty`, `foot`, `ghostty`, ...).

## Clipboard (OSC 52)

```verum
mount core.term.raw.clipboard.*;

fn clipboard_set(writer: &mut (dyn EscapeWriter), text: &Text) -> IoResult<()>;
fn clipboard_get(writer: &mut (dyn EscapeWriter))              -> IoResult<()>;
```

`clipboard_get` emits a read request; the response arrives as an input
event and must be parsed by the `InputParser`. Most modern terminals
support this with per-app permission (Kitty, iTerm2, foot, WezTerm).
