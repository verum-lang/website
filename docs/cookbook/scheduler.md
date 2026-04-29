---
title: "Scheduling work with `Interval`"
description: "Tick-based scheduling, cron-like recurrence, and jitter."
---

# Scheduling with `Interval`

Periodic work — heartbeats, polling, metrics flushes — is built on
`Interval`.

### Basic tick loop

```verum
use core.async::*;
use core.time::*;

async fn heartbeat() using [Logger] {
    let mut ticker = Interval.new(1.seconds());
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

```verum
let mut ticker = Interval.new(100.ms());
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
async fn scheduler() using [IO, Logger] {
    let mut fast = Interval.new(500.ms());
    let mut slow = Interval.new(10.seconds());
    let mut hourly = Interval.new(1.hours());

    loop {
        select {
            _ = fast.tick()   => handle_fast().await,
            _ = slow.tick()   => handle_slow().await,
            _ = hourly.tick() => handle_hourly().await,
        }
    }
}
```

### With stop signal

```verum
async fn run_until_stop(stop: Shared<AtomicBool>) using [Logger] {
    let mut ticker = Interval.new(1.seconds());
    while !stop.load(MemoryOrdering.Acquire) {
        select {
            _ = ticker.tick() => do_work().await,
            _ = sleep(50.ms()) => continue,     // quick check of the flag
        }
    }
}
```

### Jittered timers

Thundering herds (many clients reloading at the same moment) are bad
for downstream servers. Add jitter:

```verum
async fn reload_with_jitter() using [Logger, Random] {
    let base = 30.seconds();
    loop {
        // ±5 seconds of jitter
        let jitter_ms = Random.uniform(-5000, 5000);
        sleep(base + jitter_ms.milliseconds()).await;
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
        let now = Clock.system_time();
        let next = now.next_at(hour, minute);
        let wait = next.duration_since(&now).unwrap();
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
