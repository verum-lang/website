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
@test
fn increment_bumps_counter() {
    let mut m = CounterModel { count: 0 };
    let cmd = m.update(Msg.Increment);
    assert_eq(m.count, 1);
    assert(cmd.is_noop());
}

@test
fn load_dispatches_async_fetch() {
    let mut m = DataModel.default();
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

`Frame` has no public constructor — a test cannot build one — so a
snapshot test goes one level down, to the `Buffer` a widget renders
into. `Widget.render(area, buf)` is the seam:

```verum
@test
fn counter_renders_expected_frame() {
    let m = CounterModel { count: 7 };
    let mut buf = Buffer.new(30, 5);
    m.widget().render(Rect.new(0, 0, 30, 5), &mut buf);

    let lines = buf.to_lines();
    assert_eq(lines[0], "╭─ Counter: 7 ──────────────╮");
    assert_eq(lines[2], "│ ↑ increment · ↓ decrement │");
}
```

`Buffer` also carries `from_rect`, `get`, `set_string`, `set_style`,
`fill`, `merge` and `reset`.

:::caution No snapshot helper
`snapshot_assert` and `core.test.snapshot` do not exist — there is no
`core/test/` directory. Compare against literals as above, or write the
file yourself; nothing in the library does the write-then-diff dance.
:::

## 3. Integration tests with a virtual terminal

:::caution Not shipped
None of this section exists. `VirtualTerminal`, `ManualRuntime`,
`type_keys`, `expect_row`, `run_one_frame` and
`block_on_with_fake_clock` are absent from `core/` — measured, not
guessed: each name has zero occurrences in the tree. The shape below is
what such a harness would look like; today, layers 1 and 2 are the
whole story, and they cover more than they look like they do because
`update` is pure and `view` renders into a `Buffer` you own.
:::

For tests that need real event → Msg → render round-trips, drive a mock
terminal:

```verum
let mut vt = VirtualTerminal.new(80, 24);
let mut app = MyModel.new();

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
        events.push(Msg.Tick(Instant.from_nanos(0)));
        events.push(Msg.Tick(Instant.from_nanos(0) + Duration.from_secs(1)));
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
regenerate the stored buffer by hand — there is no snapshot-update
flag today — and the diff in the PR makes the change reviewable
line-by-line.
