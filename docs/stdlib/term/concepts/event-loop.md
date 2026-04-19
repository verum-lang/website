---
sidebar_position: 3
title: The event loop
description: How events flow from termios up to `update`, and how async commands round-trip back.
---

# The event loop

Understanding the runtime's loop is the key to reasoning about performance,
ordering, and concurrency in a TUI app. This page walks through one tick of
the loop end-to-end.

## The tick

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant K as Kernel (tty)
    participant S as EventStream
    participant L as Main loop
    participant M as Model
    participant D as Dispatcher
    participant C as channel&lt;Msg&gt;

    L->>+L: draw(frame) { model.view(frame) }
    L->>C: try_recv (drain up to 64 msgs)
    C-->>L: msgs
    L->>M: update(msg) per drained msg
    M-->>L: Command
    L->>D: dispatch(Cmd)
    D->>C: send(msg) from spawned async
    U->>K: keypress
    K->>S: byte stream
    L->>S: poll(16ms)
    S-->>L: Event
    L->>M: handle_event(Event) -> Maybe<Msg>
    L->>M: update(msg)
    M-->>L: Command
    L->>D: dispatch(Cmd)
    L->>L: next tick
```

Each tick performs **render → drain → poll**. Under no load, the loop
blocks in `poll` for up to one frame (16 ms by default), then unblocks on
either an event or the timeout — yielding a steady ~60 FPS cadence even
when idle, so `Subscription.interval`s fire on time.

## Frame budget

The default budget is 16 ms (~60 FPS). To choose a different rate, you can
(currently) only adjust by wrapping the app and replacing the poll timeout;
the next release will expose this via `AppOptions` passed to `run`.

## Message priority

Inside a single tick, the drain runs **before** the event poll. This means
messages produced by `Command.Async` or subscriptions land first and can
change model state before the user's next keypress is processed. Drain is
bounded (default 64) so even a badly-behaved stream can't starve input.

## Async commands — round trip

```mermaid
flowchart LR
    update -->|Command.Async(fut)| D[dispatch]
    D -->|spawn_detached| Task
    Task -->|fut.await| Msg2[Msg value]
    Msg2 -->|try_send| C["channel&lt;Msg&gt;"]
    C --> Loop
    Loop -->|update| NewCmd
```

* **spawn_detached** from `core.async.task` puts the future on the executor;
  the task is governed by the same `CancellationToken` as the app loop.
* **`try_send`** is lock-free in the hot path (single push onto an MPSC queue
  + wake).
* If the app is quitting, the token flips to cancelled and the task returns
  early — no message is delivered to a torn-down channel.

## Subscriptions — round trip

Each `Subscription` variant hoists to one detached task on startup:

| Variant | Task body |
|---|---|
| `Interval(d, f)` | `loop { sleep(d).await; tx.try_send(f()) }` |
| `Every(d, f)` | `loop { sleep(d).await; tx.try_send(f(Instant.now())) }` |
| `Once(d, f)` | `sleep(d).await; tx.try_send(f())` |
| `StreamSub(s)` | `async for x in s { tx.try_send(x) }` |
| `Batch([s…])` | spawn one detached task per nested subscription |

All tasks check `cancel.is_cancelled()` around every `try_send`, so a `Quit`
or `Ctrl+C` tears them down cleanly.

## Ordering guarantees

* Commands produced from a single `update` call are dispatched in the order
  you wrote them inside `Batch`/`Sequence`.
* `Sequence(a, b)` guarantees `a` completes before `b` starts.
* `Batch(a, b)` makes no ordering guarantee; interleaving is arbitrary.
* Inside a tick, messages drain FIFO from the channel.

## Global hotkeys

Regardless of `handle_event`, the runtime intercepts:

* `Ctrl+C` → graceful quit (like typing SIGINT).
* (Planned) `Ctrl+Z` → suspend / resume with SIGTSTP/SIGCONT cooperation.

You can disable this by overriding `handle_event` to match `Ctrl+C` first
and swallow it — the runtime checks happen *before* `handle_event`, so it
is *not* possible to prevent Ctrl+C from quitting through `handle_event`
alone. A future option `AppOptions { intercept_ctrl_c: false }` will
expose this.

## Backpressure

The default channel is unbounded — fast async producers can outrun the
loop's drain. If this is a concern, wrap your producers in the
`throttle`/`debounce` combinators from `core.async.timer`:

```verum
Subscription.from_stream(Heap(
    raw_stream.throttle(Duration.from_millis(50))
))
```
