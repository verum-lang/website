---
title: A simple TUI with the Elm loop
description: Model / update / view — an interactive counter in 40 lines.
---

# A minimal TUI

Verum's `term` module follows the Elm architecture: a **Model**
holds state, **update(msg)** returns a new model, **view** renders
the model as a frame.

### The whole program

```verum
mount core.term.*;

type Counter is { count: Int };

type Msg is
    | Increment
    | Decrement
    | Reset
    | Quit;

implement Counter {
    fn new() -> Counter { Counter { count: 0 } }
}

implement Model for Counter {
    type Message = Msg;

    fn update(&mut self, msg: Msg) -> Command<Msg> {
        match msg {
            Msg.Increment => { self.count += 1;       none() }
            Msg.Decrement => { self.count -= 1;       none() }
            Msg.Reset     => { self.count = 0;        none() }
            Msg.Quit      => Command.exit(),
        }
    }

    fn view(&self, f: &mut Frame) {
        let area = f.area();
        let color = if self.count >= 0 { Color.Green } else { Color.Red };

        Paragraph.new(&f"Count: {self.count}")
            .block(Block.new()
                .title(&" counter ")
                .borders(Borders.All)
                .border_style(Style.new().fg(Color.Cyan)))
            .alignment(Alignment.Centre)
            .style(Style.new().fg(color).add_modifier(Modifier.Bold))
            .render(f, area);
    }

    // Terminal input arrives through `handle_event`, not through a
    // subscription: `Subscription` carries timers and streams
    // (`interval`, `every`, `once`, `sub_from_stream`, `sub_batch`) and
    // has no event variant. The protocol method is
    // `fn handle_event(&self, event: Event) -> Maybe<Self.Msg>`, and
    // returning `Maybe.None` means "not for me".
    fn handle_event(&self, e: Event) -> Maybe<Msg> {
        match e {
            Event.Key(k) => match k.code {
                KeyCode.Char('+') | KeyCode.Up    => Maybe.Some(Msg.Increment),
                KeyCode.Char('-') | KeyCode.Down  => Maybe.Some(Msg.Decrement),
                KeyCode.Char('r') | KeyCode.Char('R') => Maybe.Some(Msg.Reset),
                KeyCode.Char('q') | KeyCode.Escape   => Maybe.Some(Msg.Quit),
                _ => Maybe.None,
            },
            _ => Maybe.None,
        }
    }
}

async fn main() {
    run(Counter.new()).await.expect("tui");
}
```

Run:

```bash
$ verum run --release
```

You see:

```
╭──────────── counter ────────────╮
│                                 │
│            Count: 0             │
│                                 │
╰─────────────────────────────────╯
```

Press **Up** / **Down** (or `+` / `-`) to change the counter, **R**
to reset, **Q** / **Esc** to quit.

### The three pieces

**1. Model + Message**. The `Counter` record + `Msg` variants
enumerate every possible transition.

**2. `update`**. Pure function: old state + message → new state +
`Command` (side effect). `none()` = no side effect.
`Command.exit()` = quit the app.

**3. `view`**. Pure function: state → drawn `Frame`. Widgets are
stacked/laid-out using the `layout` sub-module.

**4. `subscriptions`**. Event sources mapped to messages. Most TUIs
just subscribe to key events; you can also subscribe to timers
(`interval(1.seconds(), |_| Msg.Tick)`) or streams.

### Layering widgets

```verum
fn view(&self, f: &mut Frame) {
    let area = f.area();
    let layout = Flex.new(Direction.Vertical)
        .constraints(&[
            LayoutConstraint.Length(3),     // header
            Constraint.Fill,          // body
            LayoutConstraint.Length(1),     // status
        ])
        .split(area);

    render_header(f, layout[0]);
    render_body(f, layout[1], self);
    render_status(f, layout[2], self);
}
```

### Scrollable list

```verum
type AppState is { items: List<Text>, list_state: ListState };

implement Model for AppState {
    type Message = Msg;

    fn view(&self, f: &mut Frame) {
        SelectableList.new(&self.items)
            .block(Block.new().title(&"Files").borders(Borders.All))
            .highlight_style(Style.new().modifier(Modifier.Reversed))
            .highlight_symbol(&">> ")
            .render(f.area(), f.buffer, &mut self.list_state.clone());
    }

    fn update(&mut self, msg: Msg) -> Command<Msg> {
        match msg {
            Msg.Up   => self.list_state.previous(self.items.len()),
            Msg.Down => self.list_state.next(self.items.len()),
            _ => (),
        }
        none()
    }
    // ... subscriptions ...
}
```

### Async commands

Trigger work from `update`:

```verum
Msg.Load(path) => {
    let path = path.clone();
    task(async move {
        match fs.read_to_string_async(&path).await {
            Result.Ok(text) => Msg.Loaded(text),
            Result.Err(e)   => Msg.Error(e.to_string()),
        }
    })
}
```

`task(async { … })` spawns the async work; when it
completes, its result is delivered back to `update` as a message.

### Text input

```verum
type AppState is { input: TextInputState };

fn view(&self, f: &mut Frame) {
    TextInput.new()
        .placeholder(&"type a name")
        .render(area, f.buffer, &mut self.input.clone());
}

// Every event, forwarded verbatim. `handle_event` is the protocol
// method for terminal input; `subscriptions` carries timers and
// streams and returns ONE `Subscription`, not a list.
fn handle_event(&self, e: Event) -> Maybe<Msg> {
    Maybe.Some(Msg.InputEvent(e))
}

fn update(&mut self, msg: Msg) -> Command<Msg> {
    match msg {
        Msg.InputEvent(e) => {
            self.input.handle_event(&e);
            if e.is_enter() {
                // ... submit self.input.buffer ...
                self.input.clear();
            }
            none()
        }
        _ => none()
    }
}
```

### Colour themes

```verum
let theme = Theme.builtin("dark");
// or
let theme = Theme.from_colors(&Map.from([
    ("headline", Color.Rgb(Rgb { r: 255, g: 140, b: 0 })),
    ("body",     Color.White),
    ("accent",   Color.Cyan),
]));

Paragraph.new(text)
    .style(theme.style(&"body"))
    .render(f, area);
```

### See also

- **[term](/docs/stdlib/term)** — 7-layer TUI framework with every
  widget.
- **[Language → async & concurrency](/docs/language/async-concurrency)**
  — what `Command.task` and `Subscription` compose over.
