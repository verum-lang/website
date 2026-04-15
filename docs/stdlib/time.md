---
sidebar_position: 2
title: time
---

# `core::time` — Durations, instants, timers

## `Duration`

```verum
let d: Duration = 5.seconds();
let d2 = 100.milliseconds();
let d3 = 1.hours() + 30.minutes();

d.as_nanos();     d.as_millis();     d.as_secs();
d + d2;           d - d2;            d * 3;
```

Convenience constructors on numeric literals:

```verum
42.nanoseconds()     42.microseconds()
42.milliseconds()    42.seconds()
42.minutes()         42.hours()       42.days()
```

## `Instant`

```verum
let start = Instant::now();
do_work();
let elapsed: Duration = start.elapsed();
```

`Instant` is monotonic — always forward, unaffected by wall-clock
changes. For human-facing times, use `SystemTime`.

## `SystemTime`

```verum
let now: SystemTime = SystemTime::now();
let since_epoch: Result<Duration, SystemTimeError> = now.duration_since(SystemTime.UNIX_EPOCH);
```

## Intervals

```verum
let mut ticker = Interval::new(1.seconds());
loop {
    ticker.tick().await;    // fires every second
    pulse();
}
```

## Sleep

```verum
Time.sleep(100.milliseconds());           // sync
async { sleep(5.seconds()).await }        // async
```

## Timeouts

```verum
let result = timeout(5.seconds(), async_op()).await?;
```

## `Time` namespace

```verum
Time.now()         -> Duration    // since monotonic epoch
Time.monotonic()   -> UInt64      // raw nanoseconds
Time.system_time() -> SystemTime
Time.sleep(d)
```
