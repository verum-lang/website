---
sidebar_position: 5
title: Testing TUI apps
description: Unit tests for `update`, snapshot tests for `view`, and integration tests with a virtual terminal.
---

# Testing TUI applications

Because the Elm architecture reifies all effects as `Command` values and
`view` is a pure function, Verum TUI apps are unusually amenable to
testing. Three layers of tests cover the whole stack:

## 1. Unit-test `update`

```verum
#[test]
fn increment_bumps_counter() {
    let mut m = CounterModel { count: 0 };
    let cmd = m.update(Msg.Increment);
    assert_eq(m.count, 1);
    assert(cmd.is_noop());
}

#[test]
fn load_dispatches_async_fetch() {
    let mut m = DataModel::default();
    let cmd = m.update(Msg.Load);
    match cmd {
        Command.Async(_) => {}       // good — we asked for a task
        _ => panic("expected Async"),
    }
}
```

Because `update` is pure, you can drive entire user journeys with a list
of `Msg`s and assert the final model state — no mocking required.

## 2. Snapshot-test `view`

Render into a buffer of fixed size and compare its string projection:

```verum
#[test]
fn counter_renders_expected_frame() {
    let m = CounterModel { count: 7 };
    let mut buf = Buffer.new(30, 5);
    let mut frame = Frame.over(&mut buf, Rect.new(0, 0, 30, 5));
    m.view(&mut frame);

    let lines = buf.to_lines();
    assert_eq(lines[0], "╭─ Counter: 7 ──────────────╮");
    assert_eq(lines[2], "│ ↑ increment · ↓ decrement │");
}
```

Or with a snapshot file:

```verum
let lines = buf.to_lines();
snapshot_assert("tests/snapshots/counter_7.txt", &lines.join("\n"));
```

`snapshot_assert` is provided by `core.test.snapshot`. First run writes
the file; subsequent runs compare and diff.

## 3. Integration tests with a virtual terminal

For tests that need real event → Msg → render round-trips, drive a mock
terminal:

```verum
let mut vt = VirtualTerminal.new(80, 24);
let mut app = MyModel::new();

vt.type_keys("hello\n");
vt.run_one_frame(&mut app);
vt.expect_row(0).contains("Hello, hello!");

vt.paste("pasted text");
vt.run_one_frame(&mut app);
vt.expect_row(1).contains("pasted text");
```

`VirtualTerminal` (in `core.term.testing`) owns an in-memory
`EscapeWriter`, a fake `EventStream`, and a `Buffer`. Feeding it events
and running ticks reproduces what the real terminal loop would do, but
deterministically.

### Deterministic async

For tests of `Command.Async`, replace the runtime's executor with a
manual one:

```verum
let mut rt = ManualRuntime.new();
let (done_rx, result) = rt.block_on_with_fake_clock(
    run_async(my_model),
    |events| {
        events.push(Msg.Tick(Instant::epoch()));
        events.push(Msg.Tick(Instant::epoch() + Duration::from_secs(1)));
    },
);
```

`ManualRuntime` never schedules real timers; `sleep(d)` returns instantly
with the simulated clock advanced by `d`.

## What to test, what to skip

Test:

* Every `Msg` → state transition in `update` (happy path + edge cases).
* `view` for each significant model shape (empty, loading, error, populated).
* Command routing: make sure `Command.task` is returned from the right
  Msgs and with the right inputs.
* Key dispatchers: map key combos to Msgs.

Don't test:

* The runtime's event loop itself (trust the framework).
* Exact escape-sequence byte output (the diff algorithm may change).
* Timing-dependent behaviour with real clocks — use `ManualRuntime`.

## CI snapshots

Check buffer snapshots into git. When rendering changes intentionally,
regenerate with `cargo test --features snapshot-update` or the Verum
equivalent; the diff in the PR makes changes reviewable line-by-line.
