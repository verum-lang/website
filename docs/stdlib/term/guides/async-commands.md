---
sidebar_position: 1
title: Async commands &amp; subscriptions
description: Side effects done the Verum way — reified, cancellable, async.
---

# Async commands & subscriptions

The `Command` / `Subscription` duality is how a TUI app keeps `update` pure
while still doing real work — network, disk, timers, streams. This page is
a working guide; for the types themselves see [the Elm pattern](../concepts/elm-pattern.md).

## TL;DR

| You want… | Use this |
|---|---|
| Run a sync thunk and turn its return value into a `Msg` | `Command.perform(thunk)` |
| Kick an async future, deliver its result as a `Msg` | `Command.task(future)` |
| Several commands in parallel | `Command.batch([c1, c2, c3])` |
| Several commands sequentially | `Command.sequence([c1, c2, c3])` |
| One-shot timer → Msg after `d` | `Command.tick(d, \|\| Msg.Timeout)` |
| Periodic tick | `Subscription.interval(d, \|\| Msg.Tick)` |
| Tick with timestamp | `Subscription.every(d, \|t\| Msg.Clock(t))` |
| Receive from a long-lived stream | `Subscription.from_stream(Heap(stream))` |
| Quit | `Command.quit()` |

All async work observes the app's global `CancellationToken` — when the
user quits, every in-flight future is notified and bows out cleanly.

## Example: fetch data

```verum
type State is {
    loading: Bool,
    users: List<User>,
    error: Maybe<Text>,
};

type Msg is
    | Load
    | Loaded(Result<List<User>, Text>);

impl Model for State {
    type Msg = Msg;

    fn init(&self) -> Command<Msg> {
        Command.task(async { Msg.Loaded(fetch_users().await) })
    }

    fn update(&mut self, msg: Msg) -> Command<Msg> {
        match msg {
            Load => {
                self.loading = true;
                self.error = None;
                Command.task(async { Msg.Loaded(fetch_users().await) })
            }
            Loaded(Ok(users)) => {
                self.loading = false;
                self.users = users;
                Command.none()
            }
            Loaded(Err(e)) => {
                self.loading = false;
                self.error = Some(e);
                Command.none()
            }
        }
    }

    fn view(&self, f: &mut Frame) { /* … */ }
}
```

* `init` kicks the first fetch.
* `update` on `Load` starts another fetch.
* `Loaded(Ok|Err)` records the result. No `.await` in `update` — only value
  construction.

## Example: a clock

```verum
impl Model for ClockApp {
    type Msg = Msg;
    fn update(&mut self, msg: Msg) -> Command<Msg> {
        match msg {
            Tick(now) => { self.time = now; Command.none() }
        }
    }
    fn subscriptions(&self) -> Subscription<Msg> {
        Subscription.every(Duration.from_secs(1), |now| Msg.Tick(now))
    }
    fn view(&self, f: &mut Frame) { /* show self.time */ }
}
```

## Example: combining timer + stream

```verum
fn subscriptions(&self) -> Subscription<Msg> {
    Subscription.batch([
        Subscription.interval(Duration.from_millis(60), || Msg.AnimationTick),
        Subscription.from_stream(Heap(self.log_stream.clone())),
    ])
}
```

Both run concurrently; the loop drains messages round-robin.

## Cancellation

All tasks spawned from `Command.Async`, `Command.Tick`, and every
`Subscription` variant observe the app's `CancellationToken`. On quit:

1. Loop breaks out (returns `Ok(())` or whatever error).
2. `cancel_src.cancel()` flips the token.
3. Every running task checks `token.is_cancelled()` and returns early.
4. Their `Sender<Msg>` clones drop, closing the channel.
5. `model.on_quit()` runs; terminal is restored.

You rarely need to write explicit cancellation handling; it is all wired.
If you're doing something exceptional (e.g. keeping a TCP connection open
after the UI exits), spawn your own task with `core.async.spawn` outside
the Command system.

## Backpressure

The message channel is unbounded. A stream that produces faster than the
loop can `update` will grow the channel buffer until memory pressure.
Two remedies:

1. **Throttle / debounce at the source.**
   ```verum
   Subscription.from_stream(Heap(raw.throttle(Duration.from_millis(50))))
   ```
2. **Drop duplicates in `update`.** If the newest Msg supersedes older
   ones, just discard the stale state transition.

## Testing async commands

Because `Command` is a *value*, not an effect, you can inspect it:

```verum
#[test]
fn increment_starts_no_fetch() {
    let mut m = State.default();
    let cmd = m.update(Msg.Increment);
    assert(cmd.is_noop());
}

#[test]
fn load_starts_fetch_task() {
    let mut m = State.default();
    let cmd = m.update(Msg.Load);
    match cmd {
        Command.Async(_) => {}
        _ => panic("expected an async command"),
    }
}
```

Drop into an integration test with a real runtime when you want to exercise
the full path.
