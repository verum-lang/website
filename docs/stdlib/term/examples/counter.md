---
sidebar_position: 1
title: Counter
description: The "hello world" of TEA — an incrementing counter in 40 lines.
---

# Counter

```verum
mount core.term.prelude.*;

type Model is { count: Int };

type Msg is Increment | Decrement | Reset | Quit;

implement Model for Model {
    type Msg = Msg;

    fn update(&mut self, msg: Msg) -> Command<Msg> {
        match msg {
            Increment => { self.count = self.count + 1; Command.none() }
            Decrement => { self.count = self.count - 1; Command.none() }
            Reset     => { self.count = 0;               Command.none() }
            Quit      => Command.quit(),
        }
    }

    fn view(&self, f: &mut Frame) {
        let area = f.size();
        let title = f" Counter: {self.count} ";
        let block = Block.new()
            .title(title)
            .borders(Borders.ALL)
            .border_type(BorderType.Rounded);
        let hint = Paragraph.new()
            .text([Line.raw("↑ increment · ↓ decrement · r reset · q quit")])
            .alignment(Alignment.Center);

        block.render(area, f.buffer);
        hint.render(block.inner(area), f.buffer);
    }

    fn handle_event(&self, event: Event) -> Maybe<Msg> {
        match event {
            Event.Key(ke) => match ke.code {
                KeyCode.Up    | KeyCode.Char('+') => Some(Msg.Increment),
                KeyCode.Down  | KeyCode.Char('-') => Some(Msg.Decrement),
                KeyCode.Char('r')                 => Some(Msg.Reset),
                KeyCode.Char('q') | KeyCode.Esc   => Some(Msg.Quit),
                _ => None,
            },
            _ => None,
        }
    }
}

fn main() -> IoResult<()> {
    run(Model { count: 0 })
}
```

## What to notice

* **`run(model)`** is the entire boot sequence — terminal init, event loop,
  async runtime, and restore-on-exit are all included.
* **`update` is pure.** Incrementing a field and returning `Command.none()`
  keeps every transition testable in isolation.
* **`Esc`/`q` both quit** because `handle_event` returns `Quit`, which maps
  to `Command.quit()` and tears down cleanly.
* **Resize-safe.** `view` reads `f.size()` each frame; resizing the terminal
  does nothing visible except re-center the hint line.

## Adding persistence

```verum
fn init(&self) -> Command<Msg> {
    Command.perform(|| match fs.read_text("counter.txt") {
        Ok(t) => Msg.Loaded(t.parse::<Int>().unwrap_or(0)),
        Err(_) => Msg.Loaded(0),
    })
}

fn on_quit(&mut self) {
    let _ = fs.write_text("counter.txt", &f"{self.count}");
}
```

Add `Loaded(Int)` to `Msg` and handle it in `update`.
