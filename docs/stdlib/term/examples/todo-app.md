---
sidebar_position: 2
title: TODO app
description: Input, list, keyboard navigation, async persistence — a complete TODO.
---

# TODO app

A compact TODO app with:

* `TextInput` for adding items
* `SelectableList` with keyboard navigation
* `Command.Async` persistence to disk
* `Dialog` confirm on clear-all

```verum
mount core.term.prelude.*;
mount core.term.widget.textarea.*;

// --------------------------------------------------------------------------
// Domain
// --------------------------------------------------------------------------
type Item is { text: Text, done: Bool };

type Mode is Browsing | Adding | Confirming;

type Model is {
    items:   List<Item>,
    input:   TextInputState,
    list:    ListState,
    confirm: DialogState,
    mode:    Mode,
};

type Msg is
    | StartAdd
    | FinishAdd
    | CancelAdd
    | InputKey(KeyEvent)
    | Toggle
    | Delete
    | Up
    | Down
    | AskClearAll
    | ConfirmClearAll
    | CancelClearAll
    | Saved(Bool)
    | Quit;

// --------------------------------------------------------------------------
// Update
// --------------------------------------------------------------------------
implement Model for Model {
    type Msg = Msg;

    fn init(&self) -> Command<Msg> {
        Command.task(async { Msg.Saved(load_from_disk().await) })
    }

    fn update(&mut self, msg: Msg) -> Command<Msg> {
        match msg {
            StartAdd => { self.mode = Mode.Adding; self.input.clear(); Command.none() }

            CancelAdd => { self.mode = Mode.Browsing; Command.none() }

            InputKey(ke) => {
                let _ = self.input.handle_key(ke);
                Command.none()
            }

            FinishAdd => {
                if self.input.value.len() > 0 {
                    self.items.push(Item { text: self.input.value.clone(), done: false });
                }
                self.mode = Mode.Browsing;
                self.input.clear();
                self.persist()
            }

            Toggle => {
                match self.list.get_selected() {
                    Some(i) => { self.items[i].done = !self.items[i].done; self.persist() }
                    None => Command.none(),
                }
            }

            Delete => {
                match self.list.get_selected() {
                    Some(i) => { self.items.remove(i); self.persist() }
                    None => Command.none(),
                }
            }

            Up   => { self.list.select_previous(); Command.none() }
            Down => { self.list.select_next();     Command.none() }

            AskClearAll     => { self.mode = Mode.Confirming; Command.none() }
            CancelClearAll  => { self.mode = Mode.Browsing;   Command.none() }
            ConfirmClearAll => {
                self.items.clear();
                self.mode = Mode.Browsing;
                self.persist()
            }

            Saved(_) => Command.none(),
            Quit     => Command.quit(),
        }
    }

    fn handle_event(&self, event: Event) -> Maybe<Msg> {
        let Event.Key(ke) = event else { return None; };
        match self.mode {
            Browsing => match ke.code {
                KeyCode.Char('a')                 => Some(Msg.StartAdd),
                KeyCode.Char(' ') | KeyCode.Enter => Some(Msg.Toggle),
                KeyCode.Char('d') | KeyCode.Delete => Some(Msg.Delete),
                KeyCode.Char('c')                 => Some(Msg.AskClearAll),
                KeyCode.Up                        => Some(Msg.Up),
                KeyCode.Down                      => Some(Msg.Down),
                KeyCode.Char('q') | KeyCode.Esc   => Some(Msg.Quit),
                _ => None,
            },
            Adding => match ke.code {
                KeyCode.Esc                       => Some(Msg.CancelAdd),
                KeyCode.Enter                     => Some(Msg.FinishAdd),
                _                                 => Some(Msg.InputKey(ke)),
            },
            Confirming => match ke.code {
                KeyCode.Char('y') | KeyCode.Enter => Some(Msg.ConfirmClearAll),
                _                                 => Some(Msg.CancelClearAll),
            },
        }
    }

    fn view(&self, f: &mut Frame) {
        let chunks = Layout.new()
            .direction(Direction.Vertical)
            .constraints([Constraint.Length(3), Constraint.Min(1), Constraint.Length(1)])
            .split(f.size());

        // Header
        Block.new()
            .title(" TODO — a:add  space:toggle  d:delete  c:clear  q:quit ")
            .borders(Borders.ALL)
            .render(chunks[0], f.buffer);

        // Body: list or input
        match self.mode {
            Adding => {
                TextInput.new()
                    .block(Block.new().title("Add item").borders(Borders.ALL))
                    .placeholder("type and press Enter…")
                    .render_stateful(f, chunks[1], &mut self.input.clone());
            }
            _ => {
                let lines: List<Text> = self.items.iter().map(|it| {
                    let mark = if it.done { "☑" } else { "☐" };
                    f"{mark} {it.text}"
                }).collect();
                SelectableList.new(&lines)
                    .highlight_style(Style.new().reversed())
                    .highlight_symbol(&"▸ ")
                    .render_stateful(f, chunks[1], &mut self.list.clone());
            }
        }

        // Status line
        let status = f"{self.items.len()} items";
        f.buffer.set_string(chunks[2].x, chunks[2].y, &status, Style.new().dim());

        // Confirm modal
        if self.mode is Mode.Confirming {
            let area = centered(f.size(), 40, 6);
            Dialog.new("Clear all items? [y/N]").render(area, f.buffer);
        }
    }
}

// --------------------------------------------------------------------------
// Side effects
// --------------------------------------------------------------------------
impl Model {
    fn persist(&self) -> Command<Msg> {
        let snapshot = self.items.clone();
        Command.task(async {
            let ok = save_to_disk(&snapshot).await;
            Msg.Saved(ok)
        })
    }
}

async fn load_from_disk() -> Bool { /* … */ true }
async fn save_to_disk(items: &List<Item>) -> Bool { /* … */ true }

// --------------------------------------------------------------------------
// main
// --------------------------------------------------------------------------
fn main() -> IoResult<()> {
    run(Model {
        items: List.new(),
        input: TextInputState.new(),
        list:  ListState.new(),
        confirm: DialogState.new(),
        mode:  Mode.Browsing,
    })
}
```

## Why this is a good reference

* **Three modes, one state machine.** `Browsing` / `Adding` / `Confirming`
  drive both event routing and view rendering — a common pattern.
* **Input re-uses `TextInput.handle_key`.** No custom keybindings needed.
* **Persistence is reified.** `self.persist()` returns a `Command.task(...)`
  so the caller can decide whether to chain, batch, or ignore it.
* **Async doesn't leak into `update`.** Saving is a future; its result
  (`Msg.Saved`) is just another message.
