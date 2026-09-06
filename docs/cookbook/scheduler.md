---
title: "Scheduling work with `Interval`"
description: "Tick-based scheduling, cron-like recurrence, and jitter."
---

# Scheduling with `Interval`

Periodic work — heartbeats, polling, metrics flushes — is built on
`Interval`.

### Basic tick loop

```verum
mount core.async.*;
mount core.time.*;

async fn heartbeat() using [Logger] {
    let mut ticker = Interval.new(1.secs());
    loop {
        ticker.tick().await;
        Logger.info(&"still alive");
    }
}
```

`ticker.tick().await` returns an `Instant` — the time the tick
fired. The interval is precise: if `tick().await` is 50 ms late,
the next tick still fires on schedule (not 50 ms later).

### "Catch up on missed ticks" behaviour

:::caution Not shipped
`MissedTickBehavior` and `set_missed_tick_behavior` do not exist —
measured, not guessed: zero occurrences in the tree.  `Interval` is real
(`core/async/interval.vr:69`) with `new(period)` and `tick()`, but the
behaviour is not configurable.  What it does instead is REPORT: `tick()`
returns the number of periods elapsed since the last one — "normally 1, but
can return more if the caller was slow and missed one or more ticks" — so
the caller decides whether to catch up or skip.

```verum
let mut ticker = Interval.new(100.millis());
let missed = ticker.tick();           // 1 when on time, >1 when behind
if missed > 1 { /* skip the backlog, or replay it — your choice */ }
```

The table below is the shape a configurable policy would take.
:::

```verum
let mut ticker = Interval.new(100.millis());
ticker.set_missed_tick_behavior(MissedTickBehavior.Skip);
```

| `MissedTickBehavior` | What happens if multiple ticks are missed |
|---|---|
| `Burst` | fire all missed ticks back-to-back |
| `Delay` | skip missed, restart from now |
| `Skip` (default) | skip missed, keep original schedule |

Pick `Burst` for event-sourcing where every tick matters; `Skip` for
status updates where freshness matters more than count.

### Running several schedules concurrently

```verum
async fn scheduler() using [Logger] {
    let mut fast = Interval.new(500.millis());
    let mut slow = Interval.new(10.secs());
    let mut hourly = Interval.new(1.hours());

    loop {
        select {
            _ = fast.tick().await   => handle_fast().await,
            _ = slow.tick().await   => handle_slow().await,
            _ = hourly.tick().await => handle_hourly().await,
        }
    }
}
```

### With stop signal

```verum
async fn run_until_stop(stop: Shared<AtomicBool>) using [Logger] {
    let mut ticker = Interval.new(1.secs());
    while !stop.load(MemoryOrdering.Acquire) {
        select {
            _ = ticker.tick().await => do_work().await,
            _ = sleep(50.millis()).await => continue,     // quick check of the flag
        }
    }
}
```

### Jittered timers

Thundering herds (many clients reloading at the same moment) are bad
for downstream servers. Add jitter:

```verum
async fn reload_with_jitter() using [Logger, Random] {
    let base = 30.secs();
    loop {
        // ±5 seconds of jitter
        let jitter_ms = Random.int_range(-5000, 5000);
        sleep(base + jitter_ms.millis()).await;   // `millis`, not `milliseconds`
        reload_config().await;
    }
}
```

### Cron-like recurrence

The stdlib doesn't ship a full cron parser, but for simple cases:

```verum
/// Run `task` every day at HH:MM (local time).
async fn daily_at(hour: Int, minute: Int, task: fn() -> Future<()>)
    using [Clock]
{
    loop {
        // `SystemTime` is UNIX_EPOCH / checked_add / checked_sub /
        // duration_since / duration_since_epoch / elapsed /
        // from_timestamp / from_timestamp_millis / now / timestamp /
        // timestamp_millis / timestamp_nanos. There is no `next_at`,
        // and `core/time` ships no calendar type at all — no `Date`,
        // no `DateTime` — so "the next HH:MM" is arithmetic you do on
        // the epoch second yourself, including the local-offset and
        // DST questions the stdlib does not answer for you.
        let now  = Clock.system_time();
        let secs = now.timestamp();
        let today_midnight = secs - (secs % 86_400);          // UTC
        let mut target = today_midnight + hour * 3600 + minute * 60;
        if target <= secs { target = target + 86_400; }
        let wait = Duration.secs(target - secs);
        sleep(wait).await;
        task().await;
    }
}
```

### High-precision scheduling

For sub-millisecond scheduling, `Interval` isn't ideal — OS timer
resolution. Use `Instant`-based spin-loops in short bursts:

```verum
fn spin_until(deadline: Instant) {
    while Instant.now() < deadline { spin_hint(); }
}
```

Don't do this on a shared executor — it blocks the worker. Dedicate
a thread (`spawn_blocking`).

### Timer wheels

If you need thousands of independent deadlines (e.g., TCP
retransmission timers), see `time.TimerWheel` (lib-level):
O(1) insertion and expiration instead of O(n) per-timer.

### See also

- **[time](/docs/stdlib/time)** — `Duration`, `Instant`, `Interval`.
- **[async → timers](/docs/stdlib/async#timers)** — `sleep`,
  `timeout`, etc.
- **[Nursery](/docs/cookbook/nursery)** — if your schedule spawns
  tasks.
