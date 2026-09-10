---
sidebar_position: 4
title: term
description: 7-layer TUI framework — raw I/O, events, style, render, layout, widgets, app.
status: undocumented
---

import StdlibStatus from '@site/src/components/StdlibStatus';

# `core.term` — Terminal / TUI framework

<StdlibStatus status="undocumented" />

A seven-layer TUI framework. Each layer is self-contained; higher
layers are optional, so you can drop down to raw mode when you need
to.

```
Layer 6  App framework            Model, run, Command, Subscription, prompts, OSC 133 zones
Layer 5  Widget library           Block, Paragraph, List, Table, Chart, Tree, Menu, Dialog, Spinner
Layer 4  Layout engine            Rect, LayoutConstraint, TermLayout, Flex, FlexLayout, GridLayout
Layer 3  Rendering engine         Cell, Buffer, Frame, DiffRender, Viewport, Terminal
Layer 2  Style & color            Color, Rgb, Hsl, Style, Theme, Modifier, ColorProfile
Layer 1  Event system             Event, KeyEvent, MouseEvent, InputParser, EventStream
Layer 0  Raw terminal I/O         RawTerminal, TerminalMode, TermiosState, EscapeWriter
```

---

## Layer 0 — raw terminal

```verum
// `TerminalMode` is a RECORD holding what a restore needs — it is not a
// Raw / Cooked / CBreak enumeration.
type TerminalMode is {
    original: TermiosState,
    fd: FileDesc,
    is_raw: Bool,
    is_alternate: Bool,
};

// The width field is `columns`, and the size carries the pixel
// dimensions a terminal may report alongside the cell grid.
type TerminalSize is {
    columns: Int,
    rows: Int,
    pixel_width: Maybe<Int>,
    pixel_height: Maybe<Int>,
};

type TermiosState is { ... };                     // saved state for restore

// Each shape is a BLINKING/STEADY pair — there is no bare `Block`,
// `Line` or `Underline`, and the third pair is `Bar`, not `Line`.
type CursorShape is
    | BlinkingBlock     | SteadyBlock
    | BlinkingUnderline | SteadyUnderline
    | BlinkingBar       | SteadyBar;

type RawTerminal is { ... };
type EscapeWriter is { ... };

type ClearMode is
    | All            // entire screen          (CSI 2 J)
    | Purge          // screen + scrollback    (CSI 3 J)
    | AfterCursor    // cursor → end of screen (CSI 0 J)
    | BeforeCursor   // start → cursor         (CSI 1 J)
    | CurrentLine    // the line               (CSI 2 K)
    | UntilNewLine;  // cursor → end of line   (CSI 0 K)

type TermCapabilities is { ... };

// `RawTerminal` is a PROTOCOL (`core/term/raw/mod.vr:112`, extends
// Read + Write), not a type you construct. `termios.vr` and `wincon.vr`
// implement it; you obtain one from the platform layer.
t.enable_raw_mode() -> IoResult<()>          t.disable_raw_mode() -> IoResult<()>
t.enter_alternate_screen() -> IoResult<()>   t.leave_alternate_screen() -> IoResult<()>
t.size() -> IoResult<TerminalSize>           t.is_tty() -> Bool

// ONE setter per mode, taking a Bool — there is no enable_/disable_ pair.
t.set_mouse_capture(enable: Bool)   -> IoResult<()>
t.set_focus_events(enable: Bool)    -> IoResult<()>
t.set_bracketed_paste(enable: Bool) -> IoResult<()>
t.set_cursor_visible(visible: Bool) -> IoResult<()>
t.set_cursor_shape(shape: CursorShape) -> IoResult<()>

// `EscapeWriter` is also a PROTOCOL (`core/term/raw/escape.vr:44`,
// extends Write), and it is where cursor movement and clearing live —
// not on RawTerminal.
ew.write_csi(params: &[Int], final_byte: Byte) -> IoResult<()>
ew.write_osc(code: Int, data: &Text)           -> IoResult<()>
ew.write_dcs(data: &Text)                      -> IoResult<()>
ew.move_to(col: Int, row: Int)                 -> IoResult<()>
ew.clear(mode: ClearMode)                      -> IoResult<()>
ew.begin_sync()                                 ew.end_sync()
```

:::caution Styling is not on `EscapeWriter`

`ew.style()`, `ew.fg()`, `ew.bg()`, `ew.reset()` and `ew.write_cell()`
do not exist. The protocol emits escape sequences —
`write_csi` / `write_osc` / `write_dcs` — and styling is composed at
Layer 3 through `Style` and the render `Buffer`.

:::

Use Layer 0 when you need raw control or are targeting environments
higher layers don't support.

---

## Layer 1 — events

```verum
type Event is
    | Key(KeyEvent)
    | Mouse(MouseEvent)
    | Resize(ResizeEvent)
    | Paste(Text)
    | FocusGained | FocusLost;

// Three fields, not four — there is no `state`.
type KeyEvent is {
    code: KeyCode,
    modifiers: Modifiers,
    kind: KeyEventKind,
};

// The function-key variant is `Fn`, not `F`; the escape key is
// `Escape`, not `Esc`; and there is no `Media(MediaKey)`. `Space` and
// `KeypadBegin` are real and were missing.
type KeyCode is
    | Char(Char)
    | Fn(Int)                            // F1–F35
    | Backspace | Enter | Tab | BackTab
    | Escape | Space | Delete | Insert
    | Left | Right | Up | Down
    | Home | End | PageUp | PageDown
    | CapsLock | NumLock | ScrollLock
    | PrintScreen | Pause | Menu
    | KeypadBegin                        // keypad 5 with numlock off
    | Null;                              // Ctrl+Space or a NUL byte

type KeyEventKind is Press | Release | Repeat;

// `Modifiers` is a RECORD of bits with UPPERCASE constants — there is
// no `bitflags` construct in the language.
type Modifiers is { bits: UInt8 };
// Modifiers.SHIFT / .CTRL / .ALT / .SUPER / .HYPER / .META
// m.contains(flag) -> Bool     m.is_empty() -> Bool
type MouseEvent is { kind: MouseEventKind, column: Int, row: Int, modifiers: Modifiers };
type MouseEventKind is
    | Down(MouseButton) | Up(MouseButton) | Drag(MouseButton)
    | Moved | ScrollDown | ScrollUp | ScrollLeft | ScrollRight;
type MouseButton is Left | Right | Middle;
type ResizeEvent is { columns: Int, rows: Int };   // `columns`, not `cols`

type InputParser is { ... };                      // ANSI FSM
InputParser.new() -> InputParser
parser.feed(bytes: &[Byte]) -> List<Event>

type EventStream is { ... };
EventStream.new(...)   EventStream.stdin()
stream.read()          // blocking
stream.try_read()      // non-blocking
stream.poll(...)       stream.drain_pending()      stream.reset()

// `next()` is on the ASYNC one, and there is no `poll_with_timeout`
// on either.
type AsyncEventStream is { ... };
AsyncEventStream.new(...)   AsyncEventStream.stdin()   astream.next()
```

---

## Layer 2 — style & colour

```verum
// The 16 ANSI colours are named base/Dark, not base/Light — `DarkRed`
// is the dim half of `Red`, and there is no `Light*` family at all.
type Color is
    | Reset
    | Black   | DarkGrey
    | Red     | DarkRed
    | Green   | DarkGreen
    | Yellow  | DarkYellow
    | Blue    | DarkBlue
    | Magenta | DarkMagenta
    | Cyan    | DarkCyan
    | White   | Grey
    | Ansi256(Int)                  // not `Indexed`, and Int not UInt8
    | TrueColor(Rgb)                // not `Rgb(Rgb)`
    | FromHsl(Hsl);                 // not `Hsl(Hsl)`

type Rgb is { r: UInt8, g: UInt8, b: UInt8 };
type Hsl is { h: Float, s: Float, l: Float };

// Parsing lives on Rgb and answers Maybe, not Result — there is no
// `Color.from_hex` and no `ColorError`.
Rgb.from_hex(hex: &Text) -> Maybe<Rgb>          // "#RRGGBB" or "RRGGBB"
hex(h: Text) -> Color                            // core.term.style.color_utils
Rgb.to_hsl() -> Hsl              Hsl.to_rgb() -> Rgb
Rgb.to_lab() -> Lab              adapt_color(color: Color, profile: ColorProfile) -> Color

type ColorProfile is NoColor | Base16 | Ansi256 | TrueColor;
// A profile is passed IN to `adapt_color`; nothing in core.term detects
// one for you — there is no `detect_color_profile`.
darken(color: Rgb, amount: Float) -> Rgb    lighten(color: Rgb, amount: Float) -> Rgb
lerp_color(a: Rgb, b: Rgb, t: Float) -> Rgb gradient(start: Rgb, end: Rgb, steps: Int) -> List<Rgb>

type Modifier is bitflags {
    Bold, Dim, Italic, Underline, SlowBlink, RapidBlink,
    Reversed, Hidden, CrossedOut,
};

// TWO modifier fields, not one. `Style` is patchable: `add_modifier`
// is what a patch turns ON and `sub_modifier` what it turns OFF, so
// `.not_italic()` is representable rather than a hole in the API.
type Style is {
    fg: Maybe<Color>,
    bg: Maybe<Color>,
    underline_color: Maybe<Color>,
    add_modifier: Modifier,
    sub_modifier: Modifier,
};

Style.new()
    .fg(Color.Red)
    .bg(Color.TrueColor(Rgb.new(10, 10, 30)))
    .bold()
    .underlined()
    .not_italic()

type Theme is { ... };
Theme.dark() -> Theme                Theme.light() -> Theme
Theme.auto_detect(bg_color: Maybe<Rgb>) -> Theme
theme.role(&"primary")               theme.role(&"text_dim")
```

---

## Layer 3 — rendering

```verum
// The cell type is `RenderCell`, and it stores the grapheme as TEXT —
// a cluster can be several code points, so a `Char` would not hold one.
// `skip` marks the trailing cell of a wide cluster.
type RenderCell is {
    grapheme: Text,
    style: Style,
    skip: Bool,
};

type Buffer is { ... };
Buffer.new(width: Int, height: Int) -> Buffer
Buffer.from_rect(area: Rect) -> Buffer

// Cells are REACHED, not set through a setter: `get_mut` hands back the
// `&mut RenderCell` you write. And `get` answers a `&RenderCell`
// directly — NOT a `Maybe` — so an out-of-range index is a bounds
// error, not a None. `in_bounds` is the check.
b.get(x: Int, y: Int) -> &RenderCell
b.get_mut(x: Int, y: Int) -> &mut RenderCell
b.in_bounds(x: Int, y: Int) -> Bool
b.set_string(x: Int, y: Int, text: &Text, style: Style) -> Int
b.set_style(area: Rect, style: Style)
b.fill(ch: &Text, style: Style)     // the WHOLE buffer, not a region
b.reset()                            b.to_lines() -> List<Text>
b.merge(&other: &Buffer, area: Rect)  // the area is not optional

type Frame is { ... };              // conceptually a Buffer + metadata
f.size()   f.width()   f.height()   f.render_widget(...)   f.set_cursor(...)

// `Viewport` is a SUM, not a scrollable object:
type Viewport is Fullscreen | Inline { height: Int } | Fixed { area: Rect };

// `Terminal.new` takes NOTHING — it opens the process's own terminal.
// Cursor and clearing are NOT on it: `set_cursor` is a `Frame` method,
// and hiding/showing/clearing/flushing live on the raw backend
// (`EscapeWriter.clear(mode)`, `set_cursor_visible`, `flush`), reachable
// through `backend_mut()`.
type Terminal is { ... };
Terminal.new() -> IoResult<Terminal>
t.init() -> IoResult<()>             t.restore() -> IoResult<()>
t.draw(|f: &mut Frame| { … })        // diff-based render
t.size() -> IoResult<TerminalSize>
t.color_profile() -> ColorProfile    t.capabilities() -> &TermCapabilities
t.backend_mut() -> &mut PosixTerminal
```

---

## Layer 4 — layout

```verum
type Rect is { x: Int, y: Int, width: Int, height: Int };
rect.area() -> Int              rect.contains(x, y) -> Bool
rect.left() / .right() / .top() / .bottom() -> Int
rect.is_empty() -> Bool         rect.centered(width, height) -> Rect
rect.intersection(&other) -> Rect               rect.union(&other) -> Rect
rect.inner(margin: Margin) -> Rect
// `split_horizontal` cuts at ONE position and returns the PAIR — it is
// not the constraint solver. Splitting by constraints is `TermLayout`.
rect.split_horizontal(at: Int) -> (Rect, Rect)
rect.split_vertical(at: Int) -> (Rect, Rect)

type Margin is { top: Int, right: Int, bottom: Int, left: Int };   // CSS order
Margin.uniform(n) / .horizontal(n) / .vertical(n) / .symmetric(h, v)

// The type is `LayoutConstraint`. (`Constraint` is a different type in
// core.database.) There is no `Fixed` — exact size is `Length` — and
// `Fill` carries a WEIGHT rather than standing alone.
type LayoutConstraint is
    | Length(Int)               // exact size in cells
    | Min(Int) | Max(Int)
    | Percentage(Int)           // 0..=100
    | Ratio(Int, Int)           // numerator, denominator
    | Fill(Int);                // share of the remainder, weight > 0

type Direction is Horizontal | Vertical;

// `Flex` is an ENUM — how free space is distributed — not a builder.
type Flex is Start | Center | End | SpaceBetween | SpaceAround;

// `TermLayout` is what splits a Rect. `Fill` carries a WEIGHT, `margin`
// takes a `Margin` record, and `split` takes the Rect by value.
TermLayout.horizontal() / TermLayout.vertical() -> TermLayout
    .constraints(cs: List<LayoutConstraint>)
    .margin(m: Margin)          // { top, right, bottom, left }
    .flex(f: Flex) / .spacing(n)
    .split(area: Rect) -> List<Rect>

// A separate flexbox engine, for the CSS model:
FlexLayout.row() / .column()
    .wrap(..) .justify(..) .align_items(..) .align_content(..) .gap(..)
    .compute(..)

type GridLayout is { ... };
type GridTrack is Fixed(Int) | Fr(Float) | MinMax(Int, Int) | Auto;

// Tracks are CONSTRUCTOR arguments, not builders, and the result is a
// list of rows of Rect — there is no `GridAreas` type.
GridLayout.new(columns: List<GridTrack>, rows: List<GridTrack>) -> GridLayout
    .column_gap(n) / .row_gap(n) / .gap(n)
    .compute(&area: &Rect) -> List<List<Rect>>
```

---

## Layer 5 — widgets

### Protocols

```verum
// From core/term/widget/protocol.vr. Both take an owned `Rect` and the
// BUFFER — not a `&mut Frame` — and the stateful one is also called
// `render`; there is no `render_stateful`. Note the receivers differ:
// `Widget` borrows, `StatefulWidget` consumes.
type Widget is protocol {
    fn render(&self, area: Rect, buf: &mut Buffer);
}
type StatefulWidget is protocol {
    type State;
    fn render(self, area: Rect, buf: &mut Buffer, state: &mut Self.State);
}
type Styled is protocol {
    fn style(self, style: Style) -> Self;
}
```

### Primitive widgets

```verum
Block.new()
```

| | |
|---|---|
| `.title("  Title  ")` |  |
| `.title_alignment(Alignment.Center)` | Left \| Center \| Right |
| `.borders(Borders.ALL)` | `Borders` is a BIT SET, not a sum type: the constants are `NONE`, `TOP`, `RIGHT`, `BOTTOM`, `LEFT`, `ALL`, combined with `.union(…)` |
| `.border_type(BorderType.Rounded)` | None \| Plain \| Rounded \| Double \| Thick \| Custom { chars } |
| `.border_style(Style.new().fg(Color.Cyan))` |  |
| `.padding(Margin.uniform(1))` |  |
| `.style(Style.new().bg(Color.TrueColor(Rgb.new(10, 10, 30))))` |  |
| `Paragraph.new()` | takes NO text argument — the text is a builder |
| `.text([Line.raw("body"), Line.styled("hi", st)])` | `List<Line>` |
| `.block(Block.new().borders(Borders.ALL))` |  |
| `.alignment(Alignment.Left)` |  |
| `.wrap(Wrap.WordWrap)` | NoWrap \| WordWrap \| CharWrap |
| `.scroll((0, 0))` | `(x, y)` offset |
| `.style(Style.new().fg(Color.White))` |  |
| `Line.from(spans)` | a single styled line — the constructor is `from`, and `Line.raw(text)` / `Line.styled(text, style)` build one directly |
| `TextSpan.raw("text")` | an inline run; the styled form is `TextSpan.styled("text", Style.new().fg(Color.Red))` |

The span type is `TextSpan`. Bare `Span` is not it, and not one other
thing but two — re-measured 2026-09-11:

```
grep -rnE '^ *public type (Span|TextSpan)\b' core/ --include='*.vr'
# core/term/widget/paragraph.vr   TextSpan   <- the one you want
# core/meta/span.vr               Span = MetaSpan   (macro hygiene)
# core/tracing/data.vr            Span              (a tracing span)
```

So `Span.new(…)` written by analogy binds to whichever of the other two
your mounts bring in, without a word of complaint.

### Interactive widgets

Every line below was read off the `implement` block that declares it.
Where the older page carried a plausible-looking form, the real one is
named next to it — a builder that never existed reads exactly like one
that does.

```verum
// --- selectable list ------------------------------------------------
type ListState is { selected: Maybe<Int>, offset: Int };
SelectableList.new(items)                 // items: List<Line>
    .block(Block.new())
    .highlight_style(Style.new().reversed())
    .highlight_symbol(">> ")
    .render(area, f.buffer, &mut state)

// --- table ----------------------------------------------------------
type TableState is { selected: Maybe<Int>, offset: Int };
// The column widths are a CONSTRUCTOR argument, not a `.widths(…)`
// builder, and the row/cell types are `TableRow` / `TableCell`.
// `TableRow.new` takes the cell TEXTS; `TableCell` is for styled cells.
Table.new(rows, [LayoutConstraint.Length(8), LayoutConstraint.Fill(1)])
    .header(TableRow.new(["id", "name"]))
    .footer(TableRow.new(["", "2 rows"]))
    .column_spacing(1)
    .highlight_style(Style.new().bold())
    .highlight_spacing(HighlightSpacing.WhenSelected)

// --- tree -----------------------------------------------------------
type TreeState is {
    selected: Maybe<List<Int>>,   // path to the selected node
    expanded: List<List<Int>>,    // paths of expanded nodes
    offset: Int,
};
Tree.new(items)                           // items: List<TreeItem<T>>
    .render(area, f.buffer, &mut state)

// --- menu -----------------------------------------------------------
// A menu is vertical; orientation is not a knob. Horizontal tabs are
// `Tabs`.
Menu.new([
    MenuItem.new("New").shortcut("Ctrl+N"),
    MenuItem.separator(),
    MenuItem.new("Export").submenu([MenuItem.new("JSON")]),
])
    .highlight_style(Style.new().reversed())
    .shortcut_style(Style.new().dim())
    .render(area, f.buffer, &mut state)

// --- text input -----------------------------------------------------
// The state keeps `value` plus a cursor/anchor PAIR — a selection is
// the span between them, not a `Maybe<(Int, Int)>` field.
type TextInputState is {
    value: Text, cursor: Int, anchor: Int, scroll_offset: Int,
    undo: List<Snapshot>, redo: List<Snapshot>, history_cap: Int,
};
TextInput.new()
    .placeholder("type…")
    .mask('*')                            // password field: mask the glyph
    .render(area, f.buffer, &mut state)

// --- gauge ----------------------------------------------------------
// `.label` takes a `TextSpan`; the plain-text one is `.label_text`.
TermGauge.new()
    .ratio(0.72)                          // 0.0..=1.0   (or .percent(72))
    .label_text("72%")
    .gauge_style(Style.new().fg(Color.Green))

// --- tabs -----------------------------------------------------------
Tabs.new(titles)                          // titles: List<Text>
    .select(current_index)
    .divider("|")

// --- scrollbar ------------------------------------------------------
type ScrollbarState is {
    content_length: Int, position: Int, viewport_length: Int,
};
// Orientation picks the CONSTRUCTOR; there is no `Scrollbar.new`.
Scrollbar.vertical()                      // or Scrollbar.horizontal()
    .thumb_style(Style.new().fg(Color.DarkGrey))
    .no_arrows()
    .render(area, f.buffer, &mut state)

// --- canvas ---------------------------------------------------------
// `paint` takes a SHAPE, not a closure, and the bounds are two Floats
// rather than an array. The drawing primitives (`line`, `circle`,
// `rect_outline`, `set_color`) live on `Painter`, which the shape's own
// `draw` receives — the canvas never hands the caller a `ctx`.
Canvas.new()
    .x_bounds(0.0, 100.0)
    .y_bounds(0.0, 100.0)
    .marker(Marker.Braille)
    .paint(Heap.new(LineShape.new(0.0, 0.0, 50.0, 50.0, Color.Red)))
    .paint(Heap.new(CircleShape.new(25.0, 25.0, 10.0, Color.Cyan)))

// --- sparkline / bar chart -------------------------------------------
Sparkline.new(values)                     // values: List<Float>
    .max(100.0)
    .style(Style.new().fg(Color.Green))

// A bar chart takes GROUPS of bars; the per-bar knobs are on `Bar`.
BarChart.new([BarGroup.new([Bar.new(3.0).label("mon")])])
    .bar_width(3)
    .bar_gap(1)

// --- dialog ---------------------------------------------------------
// The body is a constructor argument. There is no `.primary()` on a
// button: which button is highlighted is `DialogState`'s business, and
// the two per-button knobs are `.style` and `.focused_style`.
Dialog.new("Delete this file?")
    .title("Confirm")
    .buttons([DialogButton.new("Cancel"), DialogButton.new("Delete")])
    .width_percent(40)
    .render(area, f.buffer, &mut state)    // state: DialogState

// --- spinner / notification ------------------------------------------
// The frame set is a constructor argument, and the named sets are
// FUNCTIONS: `SpinnerFrames.dots()`, or the shorthand `Spinner.dots()`.
Spinner.dots()                            // = Spinner.new(SpinnerFrames.dots())
    .label_text("working…")
    .style(Style.new().fg(Color.Yellow))

// A notification is built from its LEVEL: info / warning / error /
// success. There is no `Notification.new`.
Notification.warning("disk nearly full")
    .title("storage")
    .width(40)
    .render(area, f.buffer)
```

---

## Layer 6 — application framework

Elm-architecture loop. Implement `Model` and run.

```verum
// Copied from core/term/app/app.vr. The associated type is `Msg`, not
// `Message`; `subscriptions` returns ONE `Subscription`, not a list; and
// terminal input arrives through `handle_event` rather than through a
// subscription. `init`, `handle_event`, `subscriptions` and `on_quit`
// all have defaults — `update` and `view` are the two you must write.
type Model is protocol {
    type Msg;
    fn init(&self) -> Command<Self.Msg>;                   // default
    fn update(&mut self, msg: Self.Msg) -> Command<Self.Msg>;
    fn view(&self, frame: &mut Frame);
    fn handle_event(&self, event: Event) -> Maybe<Self.Msg>;  // default
    fn subscriptions(&self) -> Subscription<Self.Msg>;        // default
    fn on_quit(&mut self);                                    // default
}

type Command<Msg> is Noop | Perform(fn() -> Msg) | Async(...)
                   | Batch(...) | Sequence(...) | Tick(...) | Quit;
// FREE FUNCTIONS, not associated ones — `Command.none()` does not exist.
none()            perform(|| msg)        task(future)
batch(cmds)       sequence(cmds)         tick(delay, || msg)
quit()

type Subscription<Msg> is { ... };
// Also free functions. Re-exported from `core.term.app` under aliases
// where the name would collide with the Command builder of the same
// name: `none` -> `sub_none`, `batch` -> `sub_batch`,
// `from_stream` -> `sub_from_stream`.
sub_none()        interval(period, || msg)      every(period, |at| msg)
once(delay, || msg)   sub_from_stream(stream)   sub_batch(subs)

// The runtime's envelope around the user's own Msg. A model only ever
// observes `Msg`; `AppMessage<Msg>` is what the loop passes around.
type AppMessage<Msg> is User(Msg) | TermEvent(Event) | Tick(Instant) | Quit;

fn run<M: Model>(initial: M) -> IoResult<()>    
```

### Example

```verum
type Counter is { count: Int, running: Bool };
type Msg is Increment | Decrement | Quit;

implement Model for Counter {
    type Message = Msg;

    fn update(&mut self, msg: Msg) -> Command<Msg> {
        match msg {
            Msg.Increment => { self.count += 1; none() }
            Msg.Decrement => { self.count -= 1; none() }
            Msg.Quit      => { self.running = false; Command.exit() }
        }
    }

    fn view(&self, f: &mut Frame) {
        let area = f.area();
        Paragraph.new().text([Line.raw(&f"Count: {self.count}")])
            .block(Block.new().title(&" counter ").borders(Borders.All))
            .render(f, area);
    }

    fn handle_event(&self, e: Event) -> Maybe<Msg> {
        match e {
            Event.Key(k) => match k.code {
                KeyCode.Char('+') | KeyCode.Up   => Maybe.Some(Msg.Increment),
                KeyCode.Char('-') | KeyCode.Down => Maybe.Some(Msg.Decrement),
                KeyCode.Char('q') | KeyCode.Escape  => Maybe.Some(Msg.Quit),
                _ => Maybe.None,
            },
            _ => Maybe.None,
        }
    }
}

async fn main() {
    run(Counter { count: 0, running: true }).await.expect("tui");
}
```

### Interactive prompts (non-TUI)

Drop-in for simple scripts. `select` and `multi_select` answer with the
chosen INDEX (or indices) into the options you passed — not with the
option value, and they are not generic.

```verum
mount core.term.app.{confirm, select, multi_select, input, password};

confirm(message: Text)                        -> IoResult<Bool>
select(message: Text, options: &List<Text>)   -> IoResult<Maybe<Int>>
multi_select(message: Text, opts: &List<Text>) -> IoResult<List<Int>>
input(message: Text)                          -> IoResult<Text>
password(message: Text)                       -> IoResult<Text>
```

`core.shell.interactive` carries a second family with the same names and
no `IoResult` wrapper — `confirm(prompt: &Text) -> Bool`,
`select<T: Clone>(prompt: &Text, options: &[(Text, T)]) -> T`,
`input_default`, `input_validated`, `input_required`. Mount one or the
other; the return shapes differ.

### Router and command palette — not shipped

:::caution Not shipped
`Router`, `Screen` and `CommandPalette` are not part of the terminal
framework. Measured 2026-09-10:

```
grep -rlE '^ *(public )?type (App|Router|Screen|CommandPalette)\b' \
    core/term/ --include='*.vr' | wc -l          # 0
```

The `\b` is load-bearing: without it the pattern also matches
`public type AppMessage`, which IS shipped, and the command would
contradict the box it is evidence for.

```
```

Scope matters here, and an earlier wording of this box got it wrong by
claiming zero declarations under `core/` at large. Two of the four names
ARE declared elsewhere and mean something else — `core/net/weft/router.vr`
has a `Router` that routes HTTP, `core/cli/runtime.vr` an `App` that is a
command-line program. Under `core/term/` there is neither. The page once
showed a `router.route(…).navigate(…)` builder and a `palette.register(…)`
chain; neither name is callable.

The shipped Layer 6 surface is the five re-exports of
`core/term/app/mod.vr` — `grep '^public mount' core/term/app/mod.vr` —
and nothing else:

    Model, AppMessage, run, run_async          the Elm loop above
    Command  + none/perform/task/batch/sequence/tick/quit
    Subscription + none/interval/every/once/from_stream/batch
    confirm, select, input, multi_select, password
    SemanticZone, Politeness, write_semantic_zone

A multi-screen app today is one `Model` whose state carries the current
screen, with `handle_event` switching on it.
:::

### Accessibility zones

`write_semantic_zone` takes the escape WRITER and a zone — two
arguments, not a frame and an area — and the zones are OSC 133 shell
zones. There is no `Heading` and no `ListItem`; the nearest thing is
`Region { role, label }`, which the declaration marks as a future
extension.

```verum
type SemanticZone is
    | Prompt                                  // OSC 133;A
    | CommandInput                            // OSC 133;B
    | CommandOutput                           // OSC 133;C
    | CommandEnd { exit_code: Int }           // OSC 133;D
    | Region { role: Text, label: Text }      // future extension
    | Live { politeness: Politeness };        // future: live regions

type Politeness is Off | Polite | Assertive;

write_semantic_zone(writer: &mut dyn EscapeWriter, zone: SemanticZone)
    -> IoResult<()>

// The named shorthands, same file:
mark_prompt_start(writer)     mark_command_input(writer)
```

The rendering layer emits standards-compliant OSC 133 markers that
shells, terminal multiplexers and screen readers can consume.

---

## Cross-cutting idioms

### Differential rendering

`Terminal.draw(|f| ...)` builds a new `Frame`, diffs it against the
previous frame, and emits only the changed cells. Enables smooth
animations without flicker.

### Style composition

Styles are additive — `Style.new().fg(Color.Red).bold()` builds
incrementally. `Style.reset()` clears everything.

### Responsive layout

```verum
let layout = if area.width > 120 {
    TermLayout.horizontal().constraints(cs)
} else {
    TermLayout.vertical().constraints(cs)
};
```

---

## See also

- **[Getting Started → tour](/docs/getting-started/tour)** — quick
  TUI example.
- **[async → streams](/docs/stdlib/async)** — event streams.
- **[sys → raw terminal](/docs/stdlib/sys)** — platform termios / kqueue.
