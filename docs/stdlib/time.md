---
sidebar_position: 2
title: time
description: Duration, Instant, SystemTime, Interval — monotonic and wall-clock time.
---

# `core.time` — Durations, instants, timers

Monotonic time (`Instant`), wall-clock time (`SystemTime`), durations,
and interval streams.

| File | What's in it |
|---|---|
| `duration.vr` | `Duration` — time span |
| `duration_parse.vr` | Human-readable duration string parser (`"1h30m"`, `"500ms"`, ISO 8601 `"PT…"`) |
| `instant.vr` | `Instant` — monotonic point in time |
| `system_time.vr` | `SystemTime`, `SystemTimeError` |
| `interval.vr` | `Interval`, `AsyncInterval` — tick streams |
| `rfc3339.vr` | RFC 3339 timestamp parser and printer |
| `cron.vr` | POSIX 5-field crontab parser and next-fire scheduler |
| `julian.vr` | Julian Day ↔ Unix / Gregorian conversions (Richards 1998) |
| `mod.vr` | `Time` namespace + re-exports |

## Module status

Each `core.time.*` module carries an explicit conformance status — same
contract as [`core.base`](./base.md#module-status) and
[`core.collections`](./collections.md#module-status). The status row is
the truth-table over the module's public API exercised by
`core-tests/time/<module>/` under both Tier 0 (interpreter) and Tier 2
(AOT). Disagreement between tiers is itself a test failure.

| Status | Meaning |
|---|---|
| **stable** | Every public method conformance-tested under interp + AOT; algebraic laws pinned. |
| **partial** | Subset stable; remainder gated by upstream defects, documented per-module. |
| **regression-only** | Tests gate on language-level defects (function-id remap on cross-module helper calls, archive-driven `monotonic_nanos` resolution, …). |
| **undocumented** | Snapshot from source; no runtime conformance pin yet. |

| Module | Status | Conformance suite |
|---|---|---|
| `duration.vr`        | **partial** | [core-tests/time/duration](https://github.com/verum-lang/verum/tree/main/core-tests/time/duration) — 5/32 (regressed from 12 by parallel changes to the typechecker's primitive `inherent_methods` table — separate timeline, not a Tier-0 dispatch issue). Arithmetic, accessors, equality green on the source side; runtime gates hit cross-module helper resolution. |
| `duration_parse.vr` | **undocumented** | Documented below; no `core-tests/time/duration_parse/` suite yet. |
| `instant.vr`        | **regression-only** | [core-tests/time/instant](https://github.com/verum-lang/verum/tree/main/core-tests/time/instant) — 0/8. Every test fails on `FunctionNotFound(FunctionId(N))` — the `monotonic_nanos` syscall helper lives in `core.sys.linux.time` (or darwin/windows equivalents) which the user-test's lazy-load `wanted_module_prefixes` never reaches. Closes when the transitive module loader (#118) lands. |
| `system_time.vr`    | **partial** | [core-tests/time/system_time](https://github.com/verum-lang/verum/tree/main/core-tests/time/system_time) — 1/3. `SystemTime.now`/`as_unix_nanos` stable; `duration_since` blocked. |
| `interval.vr`       | **undocumented** | Documented below; no conformance suite. |
| `rfc3339.vr`        | **undocumented** | Documented below; no `core-tests/time/rfc3339/` suite yet. |
| `cron.vr`           | **undocumented** | Documented below; no `core-tests/time/cron/` suite yet. |
| `julian.vr`         | **partial** | [core-tests/time/julian](https://github.com/verum-lang/verum/tree/main/core-tests/time/julian) — 9/19. Round-trip fixtures and Gregorian-day-of-week tables pass. Failures cluster on the same cross-module dispatch class as `instant.vr`. |
| `mod.vr`            | **stable** | Re-export surface only — every name lifts to the originating module's status row above. |

The status table is the runtime truth, not the file's `lifecycle`
annotation: `lifecycle: Lifecycle.Theorem("v0.1")` is the *spec*
lifecycle (what the contract promises); the table above is the
*implementation* lifecycle (what the runtime currently delivers).
When the two diverge, the table is the source of truth for callers.

---

## `Duration`

Time span with nanosecond resolution.

### Construction

```verum
Duration.new(secs: Int, nanos: Int) -> Duration
Duration.from_secs(secs)    Duration.from_millis(ms)    Duration.from_micros(us)
Duration.from_nanos(ns)     Duration.from_secs_f64(f)
Duration.ZERO              Duration.MAX
```

### Literal sugar (on any integer)

```verum
5.nanoseconds()       5.microseconds()      5.milliseconds()
5.seconds()           5.minutes()           5.hours()
5.days()
// Aliases: 5.ns(), 5.us(), 5.ms()
```

### Inspection

```verum
d.as_nanos() -> Int        d.as_micros() -> Int
d.as_millis() -> Int       d.as_secs() -> Int
d.as_secs_f64() -> Float   d.as_secs_f32() -> Float
d.subsec_nanos() -> Int    d.subsec_micros() -> Int    d.subsec_millis() -> Int
d.is_zero() -> Bool
```

### Arithmetic

```verum
d + d2        d - d2        d * n         d / n
d.checked_add(d2) / checked_sub / checked_mul / checked_div -> Maybe<Duration>
d.saturating_add(d2) / saturating_sub / saturating_mul
d.mul_f64(factor) -> Duration         d.div_f64(divisor) -> Duration
```

Implements `Eq`, `Ord`, `Clone`, `Copy`, `Hash`, `Debug`, `Display`.

---

## `Instant` — monotonic time

Always moves forward. Unaffected by wall-clock adjustments (NTP, DST,
manual time changes). Use for measuring elapsed time.

```verum
Instant.now() -> Instant

i.elapsed() -> Duration                 // since this instant
i.duration_since(&earlier) -> Duration  // panics if i < earlier
i.checked_duration_since(&earlier) -> Maybe<Duration>
i.saturating_duration_since(&earlier) -> Duration

i.checked_add(duration) -> Maybe<Instant>
i.checked_sub(duration) -> Maybe<Instant>
i + duration        i - duration
i < other    i == other                   // comparison
```

### Typical measurement

```verum
let start = Instant.now();
do_work();
let elapsed = start.elapsed();
print(f"took {elapsed.as_millis()} ms");
```

---

## `SystemTime` — wall-clock time

Tied to real-world time. Subject to adjustments (NTP, DST, leap seconds).

```verum
SystemTime.now() -> SystemTime
SystemTime.UNIX_EPOCH                    // 1970-01-01T00:00:00Z

t.duration_since(&earlier) -> Result<Duration, SystemTimeError>
t.elapsed() -> Result<Duration, SystemTimeError>
t.checked_add(duration) -> Maybe<SystemTime>
t.checked_sub(duration) -> Maybe<SystemTime>
t + duration        t - duration
t < other    t == other

type SystemTimeError is { /* negative duration */ };
err.duration() -> Duration
```

### Unix epoch helper

```verum
let now = SystemTime.now();
let unix_ms = now.duration_since(&SystemTime.UNIX_EPOCH)
    .unwrap_or(Duration.ZERO)
    .as_millis();
```

### When to use which

| Need | Use |
|---|---|
| Measure elapsed time | `Instant` |
| Schedule future work | `Instant.now() + duration` |
| Timestamp for logs, user display | `SystemTime` |
| Compare with filesystem `mtime` | `SystemTime` |
| Store as persistent record | `SystemTime` (convert to UNIX epoch) |

---

## Sleep

```verum
Time.sleep(duration)                            // blocking
Time.sleep_ms(ms)                               Time.sleep_secs(secs)

sleep(duration).await                            // async (from core.async)
sleep_until(instant).await
```

---

## `Interval` — repeating timer

```verum
Interval.new(period: Duration) -> Interval
interval(period) -> Interval                     // re-exported from async

iv.tick().await -> Instant                       // fires at `period` intervals
iv.reset()                                        // restart from now
iv.period() -> Duration
iv.missed_tick_behavior() -> MissedTickBehavior
iv.set_missed_tick_behavior(behaviour)
```

```verum
type MissedTickBehavior is
    | Burst                  // fire all missed ticks immediately
    | Delay                  // skip missed, restart from now
    | Skip;                  // skip and keep original schedule
```

### Example

```verum
async fn heartbeat() using [Logger] {
    let mut iv = Interval.new(1.seconds());
    loop {
        iv.tick().await;
        Logger.info(&"heartbeat");
    }
}
```

---

## `Time` namespace

Convenience static methods:

```verum
Time.now() -> Duration                 // monotonic, since epoch
Time.monotonic() -> Int                 // raw nanoseconds
Time.system_time() -> SystemTime
Time.instant() -> Instant
Time.sleep(duration)
Time.sleep_ms(ms)                       Time.sleep_secs(secs)
```

---

## Low-level intrinsics

```verum
monotonic_nanos() -> UInt64              // CLOCK_MONOTONIC / equivalent
realtime_nanos() -> UInt64               // CLOCK_REALTIME / equivalent
realtime_secs() -> Int64
sleep_ms(ms)                             sleep_ns(ns)
```

These are `@requires_runtime` intrinsics backing the higher-level API.

---

## Timestamps for logs

Common idiom — record absolute time and monotonic elapsed:

```verum
type LogLine is {
    wall_time: SystemTime,
    elapsed_ms: Int,
    message: Text,
};

fn now_line(msg: Text, program_start: Instant) -> LogLine {
    LogLine {
        wall_time: SystemTime.now(),
        elapsed_ms: program_start.elapsed().as_millis(),
        message: msg,
    }
}
```

---

## `rfc3339` — ISO 8601 timestamps

```verum
mount core.time.rfc3339.{Rfc3339Time, parse, format_utc, format_with_offset};

// Parse.
let t = rfc3339.parse(&Text.from("2026-04-22T14:30:00.123Z"))?;
// t.unix_seconds = 1777213800  (UTC)
// t.nanos        = 123_000_000
// t.offset_minutes = 0         (Z preserved)

// Format.
let s = rfc3339.format_utc(t.unix_seconds, t.nanos);
let tz = rfc3339.format_with_offset(t.unix_seconds, 0, 180);  // +03:00
```

Full RFC 3339 grammar with Howard Hinnant civil-from-days date
arithmetic (no external math-intrinsic dependency). Case-
insensitive `T` / `Z` separators, space-for-`T` tolerance,
nanosecond-precision fractions (padded/truncated to 9 digits),
offset preserved on parse and applied to shift `unix_seconds`
into true UTC. Out-of-range fields typed as
`Rfc3339Error.OutOfRange`. Pre-2012 `:60` leap seconds
accepted on parse, collapsed to `:59` in the unix-seconds output.

## `cron` — crontab expression evaluator

```verum
mount core.time.cron.{CronExpr};

let c = CronExpr.parse(&Text.from("*/5 8-18 * * MON-FRI"))?;
let next_unix = c.next_after_unix(now_unix)?;
```

Parses the POSIX 5-field crontab:

```
┌─── minute (0-59)
│ ┌── hour (0-23)
│ │ ┌─ day-of-month (1-31)
│ │ │ ┌ month (1-12; JAN-DEC)
│ │ │ │ ┌ day-of-week (0-6; SUN-SAT)
│ │ │ │ │
* * * * *
```

Every syntactic form (`*`, literal, `a-b`, `a-b/s`, `*/s`, `a,b,c`),
case-insensitive `JAN..DEC` / `SUN..SAT` aliases, and vixie-cron
OR-semantics when both DOM and DOW are explicitly constrained
(the default cron behaviour since Paul Vixie's 1987 rewrite).

`next_after_unix` uses coarsest-field skip scheduling to reduce
the worst-case scan from minute-by-minute to month-by-month
when far from a match. 8-year search ceiling guards against
pathological specs that admit no firing.

---

## `duration_parse` — human-readable duration strings

```verum
mount core.time.duration_parse;

let d: Duration = duration_parse.parse(&Text.from("1h30m"))?;       // 1 h + 30 min
let t: Duration = duration_parse.parse(&Text.from("500ms"))?;       // 500 ms
let f: Duration = duration_parse.parse(&Text.from("1.5s"))?;        // 1.5 s
let n: Duration = duration_parse.parse(&Text.from("-15m"))?;        // negative span
let i: Duration = duration_parse.parse(&Text.from("PT1H30M"))?;     // ISO 8601
```

Two grammars recognised:

| Form | Example | Notes |
|------|---------|-------|
| Compact Go-style | `1h30m`, `500ms`, `2h 30m` | whitespace tolerated; fractional OK |
| ISO 8601 duration | `PT1H30M`, `P1D`, `PT0.5S` | cross-language config files |

### Supported units

| Unit | Suffix | Example |
|------|--------|---------|
| nanoseconds | `ns` | `100ns` |
| microseconds | `us` / `µs` | `250us` |
| milliseconds | `ms` | `500ms` |
| seconds | `s` | `30s` |
| minutes | `m` | `5m` |
| hours | `h` | `2h` |
| days | `d` | `7d` |
| weeks | `w` | `1w` |

Used in config files (`timeout = "30s"`), CLI flags (`--interval 5m`),
and scheduler APIs. Typos surface as `DurationParseError.UnknownUnit`
rather than silently defaulting.

## `julian` — Julian Day ↔ Unix / Gregorian

```verum
mount core.time.julian;
```

Julian Day (JD) is the continuous count of days since noon UTC on
4713-01-01 BC (proleptic Julian calendar). SQLite's
`julianday(...)` / `strftime('%J', ...)` store timestamps in this
form; astronomy and ephemeris computations use it too.

### Epoch constants

| Constant | Value | Reference |
|----------|-------|-----------|
| `JD_UNIX_EPOCH` | 2440587.5 | 1970-01-01 00:00 UTC |
| `JD_J2000` | 2451545.0 | 2000-01-01 12:00 UTC |
| `JD_MJD_EPOCH` | 2400000.5 | Modified Julian Day base (1858-11-17) |

### Conversion surface

```verum
public fn julian_from_unix_ms(ms: Int64) -> Float64;
public fn unix_ms_from_julian(jd: Float64) -> Int64;
public fn julian_from_unix_secs(s: Int64) -> Float64;
public fn unix_secs_from_julian(jd: Float64) -> Int64;

public fn julian_from_ymd(year: Int, month: Int, day: Int) -> Float64;
public fn ymd_from_julian(jd: Float64) -> (Int, Int, Int);

public fn time_fraction_from_hms(hour: Int, min: Int, sec: Int, ms: Int) -> Float64;
public fn hms_from_julian(jd: Float64) -> (Int, Int, Int, Int);  // (h, m, s, ms)

public fn julian_from_gregorian(y: Int, mo: Int, d: Int,
                                h: Int, mi: Int, s: Int, ms: Int) -> Float64;
public fn gregorian_from_julian(jd: Float64)
    -> (Int, Int, Int, Int, Int, Int, Int);  // (y, mo, d, h, mi, s, ms)

public fn mjd_from_julian(jd: Float64) -> Float64;
public fn julian_from_mjd(mjd: Float64) -> Float64;
```

Algorithms are Richards (*Mapping Time*, 1998). The day-number path
is integer arithmetic; only the fractional time-of-day uses
`Float64` — Float64's 53-bit mantissa carries millisecond resolution
losslessly for ±80 million years around 1970.

---

## See also

- **[async → timers](/docs/stdlib/async#timers)** — `sleep`, `timeout`, `Interval`.
- **[intrinsics](/docs/stdlib/intrinsics)** — `monotonic_nanos`, `rdtsc`, `rdtscp`.
- **[sys](/docs/stdlib/sys)** — platform `clock_gettime` / libSystem equivalents.
- **[`stdlib/database`](/docs/stdlib/database)** — native SQLite consumes `julian` for `julianday(...)` / `date(...)` timestamps.
