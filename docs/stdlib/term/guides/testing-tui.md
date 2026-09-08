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

The two models below are YOURS, not the library's — a TUI model is
whatever record your `update` is implemented on. `CounterModel` is
introduced on the model page; `DataModel` is the second one this file
uses, and it is spelled out here so the block stands alone:

```verum
type DataModel is { rows: List<Text>, loading: Bool };

implement DataModel {
    public fn default() -> DataModel {
        DataModel { rows: [], loading: false }
    }
}

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

:::danger The render half does not run at Tier 0 yet
Measured 2026-09-08: `Buffer.new` fills every cell with a `Style` that
holds one of its five fields, so any widget whose `render` touches a
cell style — `Block` does, through `Buffer.set_style` — panics inside
`Style.patch` before drawing. Five lines reproduce it:

```verum
let buf = Buffer.new(2, 1);
print(f"{buf.get(0, 0).style.has_bg()}");
// Panic: field access out of bounds: field index 1 (offset 8+8 = 16)
//   exceeds object data size 8 … at Style.has_bg
```

Tracked as T1271. The seam described above is the right one and the
assertions are the right shape; they cannot be executed until the cell
style is whole. Building widgets and asserting on what the builders
stored DOES work today, and is what `vcs/specs/core/term/widget_builders_run.vr`
exercises.
:::

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
// SHAPE ONLY — none of these names exists; see the caution above.
let mut vt = VirtualTerminal.new(80, 24);
let mut app = MyModel.new();

vt.type_keys("hello\n");
vt.run_one_frame(&mut app);
vt.expect_row(0).contains("Hello, hello!");

vt.paste("pasted text");
vt.run_one_frame(&mut app);
vt.expect_row(1).contains("pasted text");
```

Such a `VirtualTerminal` WOULD own an in-memory `EscapeWriter`, a fake
`EventStream` and a `Buffer`, so that feeding it events and running
ticks reproduced the real terminal loop deterministically. There is no
`core.term.testing` module today — the whole of `core/term` is `app`,
`event`, `layout`, `raw`, `render`, `style` and `widget`.

### Deterministic async

For tests of `Command.Async`, replace the runtime's executor with a
manual one:

```verum
// SHAPE ONLY — `ManualRuntime` and `block_on_with_fake_clock` do not
// exist either.
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
