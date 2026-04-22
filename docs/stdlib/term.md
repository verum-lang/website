---
sidebar_position: 4
title: term
description: 7-layer TUI framework — raw I/O, events, style, render, layout, widgets, app.
---

# `core.term` — Terminal / TUI framework

A seven-layer TUI framework. Each layer is self-contained; higher
layers are optional, so you can drop down to raw mode when you need
to.

```
Layer 6  App framework            App, Model, Update, View, Router, CommandPalette, prompts
Layer 5  Widget library           Block, Paragraph, List, Table, Chart, Tree, Menu, Dialog, Spinner
Layer 4  Layout engine            Rect, Constraint, Flex, CSS Grid, Responsive
Layer 3  Rendering engine         Cell, Buffer, Frame, DiffRender, Viewport, Terminal
Layer 2  Style & color            Color, Rgb, Hsl, Style, Theme, Modifier, ColorProfile
Layer 1  Event system             Event, KeyEvent, MouseEvent, InputParser, EventStream
Layer 0  Raw terminal I/O         RawTerminal, TerminalMode, TermiosState, EscapeWriter
```

---

## Layer 0 — raw terminal

```verum
type TerminalMode is Raw | Cooked | CBreak;
type TerminalSize is { cols: Int, rows: Int };
type TermiosState is { ... };                     // saved state for restore
type CursorShape is Block | Line | Underline | BlinkingBlock | BlinkingLine | BlinkingUnderline;

type RawTerminal is { ... };
type EscapeWriter is { ... };

type ClearMode is Entire | AfterCursor | BeforeCursor | Line | LineAfter | LineBefore;

type TermCapabilities is { ... };

RawTerminal.new() -> IoResult<RawTerminal>      
t.enable_raw_mode() -> IoResult<()>
t.disable_raw_mode() -> IoResult<()>
t.enable_mouse_capture()                          t.disable_mouse_capture()
t.enable_focus_events()                           t.disable_focus_events()
t.enable_bracketed_paste()                        t.disable_bracketed_paste()
t.show_cursor(visible: Bool) -> IoResult<()>
t.set_cursor_shape(shape: CursorShape)
t.move_cursor(x: Int, y: Int)                      t.clear(mode: ClearMode)
t.size() -> IoResult<TerminalSize>
t.enter_alternate_screen()                         t.leave_alternate_screen()

EscapeWriter.new(&mut t) -> EscapeWriter
ew.style(&Style)            ew.fg(Color)          ew.bg(Color)
ew.reset()                   ew.write_cell(&Cell)
```

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

type KeyEvent is {
    code: KeyCode,
    modifiers: Modifiers,
    kind: KeyEventKind,
    state: KeyEventState,
};
type KeyCode is
    | Char(Char)
    | Backspace | Enter | Left | Right | Up | Down
    | Home | End | PageUp | PageDown
    | Tab | BackTab | Delete | Insert | Esc
    | F(Int)
    | Null | CapsLock | ScrollLock | NumLock | PrintScreen | Pause | Menu
    | Media(MediaKey);
type KeyEventKind is Press | Repeat | Release;
type Modifiers is bitflags { Shift, Control, Alt, Super, Hyper, Meta };
type MouseEvent is { kind: MouseEventKind, column: Int, row: Int, modifiers: Modifiers };
type MouseEventKind is
    | Down(MouseButton) | Up(MouseButton) | Drag(MouseButton)
    | Moved | ScrollDown | ScrollUp | ScrollLeft | ScrollRight;
type MouseButton is Left | Right | Middle;
type ResizeEvent is { cols: Int, rows: Int };

type InputParser is { ... };                      // ANSI FSM
InputParser.new() -> InputParser
parser.feed(bytes: &[Byte]) -> List<Event>

type EventStream is { ... };
EventStream.new(&RawTerminal) -> EventStream
stream.next() -> Poll<Event>                      // via Stream protocol
stream.poll_with_timeout(duration) -> Maybe<Event>
```

---

## Layer 2 — style & colour

```verum
type Color is
    | Reset | Black | Red | Green | Yellow | Blue | Magenta | Cyan | White
    | DarkGray | LightRed | LightGreen | LightYellow | LightBlue | LightMagenta | LightCyan | LightWhite
    | Indexed(UInt8)
    | Rgb(Rgb)
    | Hsl(Hsl);

type Rgb is { r: UInt8, g: UInt8, b: UInt8 };
type Hsl is { h: Float, s: Float, l: Float };

Color::from_hex(&"#ff8c00") -> Result<Color, ColorError>
Rgb::to_hsl() -> Hsl              Hsl::to_rgb() -> Rgb
adapt_color(desired: Color, profile: ColorProfile) -> Color

type ColorProfile is Mono | Ansi16 | Ansi256 | TrueColor;
detect_color_profile() -> ColorProfile            

type Modifier is bitflags {
    Bold, Dim, Italic, Underline, SlowBlink, RapidBlink,
    Reversed, Hidden, CrossedOut,
};

type Style is {
    fg: Maybe<Color>,
    bg: Maybe<Color>,
    modifier: Modifier,
    underline_color: Maybe<Color>,
};

Style.new()
    .fg(Color.Red)
    .bg(Color.Rgb(Rgb { r: 10, g: 10, b: 30 }))
    .add_modifier(Modifier.Bold | Modifier.Underline)
    .remove_modifier(Modifier.Italic)

type Theme is { ... };
Theme.builtin(&"dark") / Theme.builtin(&"light")
Theme.from_colors(palette: &Map<Text, Color>) -> Theme
theme.style(&"headline")             theme.color(&"accent")
```

---

## Layer 3 — rendering

```verum
type Cell is {
    ch: Char,
    style: Style,
    symbol: Maybe<Text>,           // for multi-char grapheme clusters
};

type Buffer is { ... };
Buffer.new(width: Int, height: Int) -> Buffer
b.set_cell(x, y, ch, style)        b.get_cell(x, y) -> Maybe<&Cell>
b.clear()                           b.clear_region(&rect)
b.resize(cols, rows)

type Frame is { ... };              // conceptually a Buffer + metadata
type Viewport is { ... };
vp.scroll(dx: Int, dy: Int)         vp.set_scroll(x, y)

type Terminal is { ... };
Terminal.new(backend: Backend) -> IoResult<Terminal>   
t.draw(|f: &mut Frame| { widget.render(f, &area) })      // diff-based render
t.clear()                            t.size() -> IoResult<TerminalSize>
t.flush() -> IoResult<()>
t.hide_cursor()                      t.show_cursor()      t.set_cursor(col, row)
```

---

## Layer 4 — layout

```verum
type Rect is { x: Int, y: Int, width: Int, height: Int };
rect.area() -> Int              rect.contains(x, y) -> Bool
rect.inner(margin: Margin) -> Rect           rect.split_horizontal(widths: &[Int]) -> List<Rect>

type Margin is { top: Int, bottom: Int, left: Int, right: Int };

type Constraint is
    | Fixed(Int)
    | Percentage(UInt8)         // 0..=100
    | Ratio(UInt16, UInt16)
    | Min(Int) | Max(Int)
    | Length(Int)
    | Fill;

type Direction is Horizontal | Vertical;

type Flex is { ... };
type FlexDirection is Row | RowReverse | Column | ColumnReverse;
type FlexItem is { grow: Float, shrink: Float, basis: Constraint };

Flex.new(direction)
    .constraints(&[Constraint.Fill, Constraint.Length(20), Constraint.Fill])
    .margin(1)
    .split(rect) -> List<Rect>

type GridLayout is { ... };
type GridTrack is Fixed(Int) | Fraction(Float) | Auto;
Grid.new()
    .columns(&[GridTrack::Fixed(20), GridTrack::Fraction(1.0)])
    .rows(&[GridTrack::Auto])
    .split(rect) -> GridAreas
```

---

## Layer 5 — widgets

### Protocols

```verum
type Widget is protocol {
    fn render(&self, f: &mut Frame, area: &Rect);
}
type StatefulWidget is protocol {
    type State;
    fn render_stateful(&self, f: &mut Frame, area: &Rect, state: &mut Self.State);
}
type Styled is protocol {
    fn style(&self) -> &Style;
    fn with_style(self, style: Style) -> Self;
}
```

### Primitive widgets

```verum
Block.new()
    .title(&"  Title  ")
    .borders(Borders.All)              // All | Top | Left | Right | Bottom | None
    .border_type(BorderType.Round)     // Round | Double | Thick | Thin | Plain
    .border_style(Style.new().fg(Color.Cyan))
    .style(Style.new().bg(Color.Rgb(Rgb { r: 10, g: 10, b: 30 })))

Paragraph.new(&"body text")
    .block(Block.new().borders(Borders.All))
    .alignment(Alignment.Left)
    .wrap(Wrap.Wrap)                   // No | Wrap | Truncate
    .style(Style.new().fg(Color.White))

Line.new(&spans)           // a single styled line
Span.new(&"text").fg(Color.Red)      // an inline styled run
```

### Interactive widgets

```verum
type ListState is { selected: Maybe<Int>, offset: Int };
SelectableList.new(&items)
    .block(Block.new())
    .highlight_style(Style.new().modifier(Modifier.Reversed))
    .highlight_symbol(&">> ")
    .render_stateful(f, area, &mut state)

type TableState is { selected: Maybe<Int>, offset: Int };
Table.new(&rows)
    .header(Row.new(&[Cell::from("id"), Cell::from("name")]))
    .widths(&[Constraint.Length(8), Constraint.Fill])
    .column_spacing(1)
    .highlight_style(Style.new().modifier(Modifier.Bold))

type TreeState is { selected: Vec<Int>, opened: Set<Vec<Int>> };
Tree.new(&items)
    .render_stateful(f, area, &mut state)

Menu.new(&items)
    .orientation(Direction.Horizontal)
    .render_stateful(f, area, &mut state)

type TextInputState is { buffer: Text, cursor: Int, selection: Maybe<(Int, Int)> };
TextInput.new()
    .placeholder(&"type…")
    .password(false)
    .render_stateful(f, area, &mut state)

Gauge.new()
    .ratio(0.72)                       // 0.0..=1.0
    .label(&"72%")
    .gauge_style(Style.new().fg(Color.Green))

Tabs.new(&titles)
    .select(current_index)
    .divider(&"|")

type ScrollbarState is { content_length: Int, position: Int, viewport_content_length: Int };
Scrollbar.new(direction: ScrollDirection)
    .thumb_style(Style.new().fg(Color::DarkGray))
    .render_stateful(f, area, &mut state)

Canvas.new()
    .x_bounds([0.0, 100.0])
    .y_bounds([0.0, 100.0])
    .paint(|ctx| {
        ctx.draw_line(0.0, 0.0, 50.0, 50.0, Color.Red);
        ctx.print(25.0, 25.0, "hi");
    })

Sparkline.new(&values)
    .style(Style.new().fg(Color.Green))

BarChart.new(&bars)
    .bar_width(3)
    .bar_gap(1)
    .value_style(Style.new().modifier(Modifier.Bold))

Dialog.new()
    .title(&"Confirm")
    .body(&"Delete this file?")
    .buttons(&[DialogButton.new(&"Cancel"), DialogButton.new(&"Delete").primary()])
    .render_stateful(f, area, &mut state)

Spinner.new()
    .frames(&SpinnerFrames.Dots)      // Dots | Line | Arc | …
    .style(Style.new().fg(Color.Yellow))

Notification.new(NotificationLevel.Warning, &"disk nearly full")
    .render(f, area)
```

---

## Layer 6 — application framework

Elm-architecture loop. Implement `Model` and run.

```verum
type Model is protocol {
    type Message;
    fn update(&mut self, msg: Self.Message) -> Command<Self.Message>;
    fn view(&self, f: &mut Frame);
    fn subscriptions(&self) -> List<Subscription<Self.Message>>;
}

type Command<M> is { ... };
Command.none()     Command::batch(&cmds)     Command::message(m)
Command.task(future)     Command::delay(duration, m)

type Subscription<M> is { ... };
Subscription.events(|event| maybe_map_to_message(event))
Subscription.interval(duration, |_| tick_msg)

type AppMessage is Exit | Resize(ResizeEvent) | ...;

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
            Msg.Increment => { self.count += 1; Command.none() }
            Msg.Decrement => { self.count -= 1; Command.none() }
            Msg.Quit      => { self.running = false; Command.exit() }
        }
    }

    fn view(&self, f: &mut Frame) {
        let area = f.area();
        Paragraph.new(&f"Count: {self.count}")
            .block(Block.new().title(&" counter ").borders(Borders.All))
            .render(f, area);
    }

    fn subscriptions(&self) -> List<Subscription<Msg>> {
        list![
            Subscription.events(|e| match e {
                Event.Key(k) => match k.code {
                    KeyCode.Char('+') | KeyCode.Up   => Maybe.Some(Msg.Increment),
                    KeyCode.Char('-') | KeyCode.Down => Maybe.Some(Msg.Decrement),
                    KeyCode.Char('q') | KeyCode.Esc  => Maybe.Some(Msg.Quit),
                    _ => Maybe.None,
                },
                _ => Maybe.None,
            }),
        ]
    }
}

async fn main() {
    run(Counter { count: 0, running: true }).await.expect("tui");
}
```

### Interactive prompts (non-TUI)

Drop-in for simple scripts:

```verum
confirm(&"Proceed?") -> IoResult<Bool>                               
select::<T: Display>(&"Pick", &items) -> IoResult<T>                  
multi_select::<T: Display>(&"Pick", &items) -> IoResult<List<T>>      
input(&"Your name") -> IoResult<Text>                                  
password(&"Password") -> IoResult<Text>                                
```

### Router (multi-screen apps)

```verum
type Router<State, Msg> is { ... };
router.route(&"/home", |s| HomeScreen.new(s))
      .route(&"/settings", |s| SettingsScreen.new(s))
      .navigate(&"/settings")
```

### Command palette

```verum
type CommandPalette<Msg> is { ... };
palette.register(&"Save", &"Ctrl+S", Msg.Save)
       .register(&"Quit", &"Ctrl+Q", Msg.Quit)
```

### Accessibility zones

```verum
write_semantic_zone(f, &area, SemanticZone.Heading, &"Dashboard")
write_semantic_zone(f, &area, SemanticZone.ListItem { level: 2 }, &text)
```

The rendering layer emits standards-compliant accessibility markers
(OSC 133 semantic zones) that screen readers and terminal multiplexers
can consume.

---

## Cross-cutting idioms

### Differential rendering

`Terminal::draw(|f| ...)` builds a new `Frame`, diffs it against the
previous frame, and emits only the changed cells. Enables smooth
animations without flicker.

### Style composition

Styles are additive — `Style.new().fg(Red).add_modifier(Bold)` builds
incrementally. `Style::reset()` clears everything.

### Responsive layout

```verum
let layout = if area.width > 120 {
    Flex.new(Direction.Horizontal).constraints(&[...])
} else {
    Flex.new(Direction.Vertical).constraints(&[...])
};
```

---

## See also

- **[Getting Started → tour](/docs/getting-started/tour)** — quick
  TUI example.
- **[async → streams](/docs/stdlib/async)** — event streams.
- **[sys → raw terminal](/docs/stdlib/sys)** — platform termios / kqueue.
