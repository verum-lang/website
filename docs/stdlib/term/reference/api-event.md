---
sidebar_position: 5
title: API reference — events
description: Event, KeyEvent, MouseEvent, EventStream, InputParser, Modifiers.
---

# API reference — events

All types live in `core.term.event`.

## `Event`

```verum
public type Event is
    | Key(KeyEvent)
    | Mouse(MouseEvent)
    | Resize(ResizeEvent)
    | Paste(Text)
    | FocusGained
    | FocusLost;

impl Event {
    fn is_key(&self)    -> Bool
    fn is_mouse(&self)  -> Bool
    fn is_resize(&self) -> Bool
    fn as_key(&self)    -> Maybe<KeyEvent>
    fn as_mouse(&self)  -> Maybe<MouseEvent>
}
```

## `KeyEvent`

```verum
public type KeyEvent is {
    code: KeyCode,
    modifiers: Modifiers,
    kind: KeyEventKind,
};

public type KeyEventKind is Press | Release | Repeat;

impl KeyEvent {
    fn press(code: KeyCode) -> KeyEvent
    fn with_mods(code: KeyCode, mods: Modifiers) -> KeyEvent
    fn is_ctrl_c(&self) -> Bool
    fn is_escape(&self) -> Bool
    fn is_enter(&self)  -> Bool
}
```

## `KeyCode`

```verum
public type KeyCode is
    | Char(Char)
    | Backspace | Enter  | Tab  | BackTab
    | Delete    | Insert | Esc
    | Up   | Down | Left | Right
    | Home | End  | PageUp | PageDown
    | Space
    | F(Int)                // F1..F35
    | Media(MediaKey)
    | Modifier(ModifierKey)
    | CapsLock | ScrollLock | NumLock
    | PrintScreen | Pause  | Menu;
```

## `Modifiers`

```verum
public type Modifiers is { bits: UInt8 };

Modifiers.NONE
Modifiers.SHIFT   Modifiers.CTRL
Modifiers.ALT     Modifiers.SUPER
Modifiers.HYPER   Modifiers.META

impl Modifiers {
    fn contains(&self, m: Modifiers) -> Bool
    fn union(&self, m: Modifiers)    -> Modifiers
    fn empty(&self) -> Bool
}
```

## `MouseEvent`

```verum
public type MouseEvent is {
    kind: MouseEventKind,
    column: Int,
    row: Int,
    modifiers: Modifiers,
};

public type MouseEventKind is
    | Down(MouseButton) | Up(MouseButton) | Drag(MouseButton)
    | Moved
    | ScrollUp | ScrollDown | ScrollLeft | ScrollRight;

public type MouseButton is Left | Right | Middle;
```

## `EventStream`

```verum
public type EventStream is { ... };

EventStream.new(fd: FileDesc) -> EventStream
EventStream.stdin() -> EventStream
    fn poll(&mut self, timeout: Duration) -> Maybe<Event>
    fn read(&mut self) -> IoResult<Event>
    fn try_read(&mut self) -> Maybe<Event>
    fn drain_pending(&mut self) -> List<Event>
    fn reset(&mut self)
```

## `AsyncEventStream`

```verum
public type AsyncEventStream is { ... };

AsyncEventStream.new(fd: FileDesc) -> AsyncEventStream
AsyncEventStream.stdin() -> AsyncEventStream

impl AsyncIterator for AsyncEventStream {
    type Item = Event;
    async fn next(&mut self) -> Maybe<Event>
}
```

Usage:
```verum
let mut events = AsyncEventStream.stdin();
async for event in &mut events {
    match event { Event.Key(ke) => ..., _ => ... }
}
```

## Mouse protocol helpers

```verum
mount core.term.event.mouse.*;

fn parse_sgr_mouse(params: &List<Int>, final_byte: Byte) -> Maybe<MouseEvent>;
fn mouse_enable_sequence()  -> Text;   // enable tracking (X10 + Any + SGR)
fn mouse_disable_sequence() -> Text;
```
