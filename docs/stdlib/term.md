---
sidebar_position: 4
title: term
---

# `core::term` — Terminal / TUI framework

A 7-layer terminal framework, from raw termios to a full application
model (Elm-style Model → Update → View).

## Architecture

```
Layer 6  App framework            App, Screen, Router, CommandPalette
Layer 5  Widget library           Block, Paragraph, List, Table, Chart, ...
Layer 4  Layout engine            Rect, Constraint, Flex, Grid, Responsive
Layer 3  Rendering engine         Cell, Buffer, Frame, DiffRender
Layer 2  Style & color            Color, Rgb, Hsl, Style, Theme, Modifier
Layer 1  Event system             Event, KeyEvent, MouseEvent, InputParser
Layer 0  Terminal I/O             RawTerminal, TerminalMode, EscapeWriter
```

## Layer 0 — raw terminal

```verum
let mut term = RawTerminal::new()?;
term.enter_raw_mode()?;
term.enable_mouse_capture()?;
term.show_cursor(false)?;
term.size();                // TerminalSize { cols, rows }
```

## Layer 1 — events

```verum
let mut events = EventStream::new(&term);
while let Event::Key(k) = events.next().await? {
    match k.code {
        KeyCode.Char('q') => break,
        KeyCode.Up        => model.move_up(),
        KeyCode.Down      => model.move_down(),
        _ => {}
    }
}
```

## Layer 2 — style

```verum
let style = Style::new()
    .fg(Color.Rgb(0xff, 0x8c, 0x00))
    .bg(Color.Indexed(16))
    .modifier(Modifier.Bold | Modifier.Underline);

let theme = Theme::builtin("dark");
```

## Layer 5 — widgets

```verum
let block  = Block::new()
    .title("  Tasks  ")
    .borders(Borders.All)
    .border_style(Style::new().fg(Color.Cyan));

let list = List::new(items)
    .block(block)
    .highlight_style(Style::new().modifier(Modifier.Reversed));

let chart = Chart::new()
    .dataset(&[("cpu", cpu_data), ("mem", mem_data)])
    .x_axis(Axis::new().range(0..60))
    .y_axis(Axis::new().range(0..100));
```

## Layer 6 — application

```verum
type Model is { count: Int, running: Bool };

type Msg is
    | Increment
    | Decrement
    | Quit;

fn update(model: &mut Model, msg: Msg) {
    match msg {
        Msg.Increment => model.count += 1,
        Msg.Decrement => model.count -= 1,
        Msg.Quit      => model.running = false,
    }
}

fn view(model: &Model, f: &mut Frame) {
    Paragraph::new(f"Count: {model.count}")
        .block(Block::new().borders(Borders.All))
        .render(f, f.size());
}

async fn main() using [IO] {
    App::new(Model { count: 0, running: true })
        .on(Event::Key(KeyCode.Up),        Msg.Increment)
        .on(Event::Key(KeyCode.Down),      Msg.Decrement)
        .on(Event::Key(KeyCode.Char('q')), Msg.Quit)
        .update(update)
        .view(view)
        .run().await?;
}
```

## See also

- **[architecture → vbc-bytecode](/docs/architecture/vbc-bytecode)** —
  term is pure Verum, no special VBC opcodes.
