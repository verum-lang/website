---
sidebar_position: 2
title: time
description: Duration, Instant, SystemTime, Interval — monotonic and wall-clock time.
status: partial
status_detail: >-
  2026-07-09 full re-audit: all 9 submodules (mod.vr's `Time` namespace suite added — mirror closure) GREEN under `--interp` (an extensive test set) except 5 pins of two open cross-cutting defects (List.sort-on-records raw-Value compare; test-pipeline `Duration / Int` misroute). §G dual-representation CLOSED — the Duration/Instant raw-Int intrinsic alias surface was deleted; the Verum record bodies are the single implementation on both tiers. Signed-Duration arithmetic coherence (checked_add/sub, carry normalisation, signed timeline), pre-1970 floor semantics (rfc3339/cron), ONE canonical monotonic+realtime clock source, and the Time.sleep Tier-0 no-op/negative-hang are all fixed and regression-pinned. AOT parity campaign: the 2026-07-10 round closed FOUR name-resolution-coherence roots in codegen (declare-shadow — real bodies landed in LLVM-auto-renamed `.N` functions while call sites hit bodyless declares/zero-stubs; body-dedup order diverging from Tier-0 dispatch — the `&self` duplicate of `Int.checked_mul` was lowered instead of the by-value one; duplicate switch case values in dyn/runtime-type dispatch = verifier-invalid IR; a post-terminator emission in the is_utf8 IR helper) and RE-LANDED the uniform-i64 register-slot model (its earlier revert was judged against a base still poisoned by the declare-shadow class). Result: `parse("30s")` correct under AOT for the first time; duration_parse AOT the covered subset → the covered subset; julian the covered subset (one pre-existing crash). The night round then landed two more language-level fixes: local type declarations now claim their simple name over stdlib archive imports (a user `type Entry` had been resolving its literal field indices against `http_cache.Entry`'s layout — every field wrote slot 0), and a zero-param function referenced in value position is now a callable value instead of being invoked at the binding (`let f = my_test; f()` previously called at `let` and crashed at `f()` — this was why entire AOT test suites failed while every test body passed when called directly: the test harness invokes tests indirectly). Remaining characterised blockers: reference-model coherence for call receivers and ref chains (`Duration < Duration`, cron's parse_int), and a variant-tag numbering divergence for archive-built error values at AOT (`Overflow` matching `is Empty`) — tasks a tracked toolchain task.
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
| `duration.vr`        | **partial** | [core-tests/time/duration](https://github.com/verum-lang/verum/tree/main/core-tests/time/duration) — 62 unit + 20 property + 11 integration + 19 regression. interp 105/107 (2 reds pin the open List.sort-on-records and test-pipeline `d / Int` defects — tasks filed). **§G/§H CLOSED 2026-07-09**: the raw-Int intrinsic alias surface (`from_*`/`as_*`/`is_zero`/`add`/`saturating_*`/`subsec_nanos`) was deleted — accessors divided heap POINTERS whenever the ctor family and the intercept disagreed; the record bodies are now the only surface on both tiers, pinned by `regression_test.vr §G` over both ctor families, record literals, operator results, and the signed decomposition identity. Signed Debug (`-1.500s`) and the `Int.MIN × -1` checked_mul guard pinned in §H. AOT: 67/107 pre-campaign baseline; re-run pending the as_slice/const-zero root fixes. |
| `duration_parse.vr` | **partial** | [core-tests/time/duration_parse](https://github.com/verum-lang/verum/tree/main/core-tests/time/duration_parse) — interp 60/60 GREEN. AOT 55/60 final battery 2026-07-12 (was 9/60 at campaign start; the unit sub-suite re-runs to 34/34 — residual failures are the layer-4 compile-crash flake, not value defects; the historical error-path pair is CLOSED via four stacked fixes ending in the text-free plausibility contract). |
| `instant.vr`        | **partial** | [core-tests/time/instant](https://github.com/verum-lang/verum/tree/main/core-tests/time/instant) — interp 32/33 (1 red = sort-on-records pin). **Clock unification 2026-07-09**: `Instant.now` mounted `sys.<os>.time.monotonic_nanos` (boot-relative) while `Time.monotonic` used the process-relative intrinsic — two monotonic epochs in one program; both now read `core.intrinsics.runtime.time.monotonic_nanos`. Signed `checked_add`/`checked_sub` arms pinned (`regression_test.vr §F`); the §G record round-trip pinned in §G. NOTE: the canonical clock is process-relative — tests must anchor instants away from nanos=0 before subtracting. |
| `system_time.vr`    | **partial** | [core-tests/time/system_time](https://github.com/verum-lang/verum/tree/main/core-tests/time/system_time) — interp 55/56 (1 red = sort pin). Carry-normalised signed `checked_add`/`checked_sub` (the `nanos ∈ [0,1e9)` invariant held for negative durations pre-fix only by luck); **signed-timeline semantics** — `Maybe.None` signals Int64 overflow only, pre-epoch results are valid (consistent with `from_timestamp(-100)`); `from_timestamp_millis` floor-normalises negative inputs. Pinned in `regression_test.vr §B–§D`. |
| `interval.vr`       | **partial** | [core-tests/time/interval](https://github.com/verum-lang/verum/tree/main/core-tests/time/interval) — interp 33/33 GREEN incl. the FIRST live-blocking `tick()` coverage (in `time/mod` integration): pre-2026-07-09 the suite only pinned period STORAGE while `Time.sleep` was a Tier-0 NO-OP and `tick()` never blocked — the stale-green the new tests caught. Negative-period clamp pinned (`regression_test.vr §A`). |
| `rfc3339.vr`        | **partial** | [core-tests/time/rfc3339](https://github.com/verum-lang/verum/tree/main/core-tests/time/rfc3339) — interp 52/52 GREEN. **Pre-1970 formatting fixed** (truncating→Euclidean day split; `format_utc(-1)` rendered "1970-01-01T00:00:01Z" pre-fix) and round-trip pinned (`regression_test.vr §E`). Offset unit tests were themselves defective (2026 dates with epoch-anchored expectations) — corrected. |
| `cron.vr`           | **partial** | [core-tests/time/cron](https://github.com/verum-lang/verum/tree/main/core-tests/time/cron) — the full suite passes under the interpreter, including the floor semantics of `decompose` and minute alignment for instants before the epoch.  |
| `julian.vr`         | **partial** | [core-tests/time/julian](https://github.com/verum-lang/verum/tree/main/core-tests/time/julian) — interp 49/49 GREEN; AOT 48/49 (best of the family — pure Int/Float math, no byte-slice walking). |
| `mod.vr`            | **partial** | [core-tests/time/mod](https://github.com/verum-lang/verum/tree/main/core-tests/time/mod) — **NEW 2026-07-09** (the `Time` namespace previously had NO suite — a mirror-contract breach). interp 29/29 GREEN. Pins: negative-sleep hang clamp (`ns as UInt64` reinterpretation slept ~forever), §G ctor→accessor round-trip on the live clock, monotonic/`Instant` bracketing on the unified clock, `Interval.tick()` blocking/missed-period/zero-period behaviour. |

**Why every row says "partial" rather than "stable"**: the status
convention requires BOTH tiers green. The interpreter legs above are
green (modulo the two pinned cross-cutting defects); the AOT legs are
mid-campaign — two systemic AOT roots (`as_slice` byte-stride over
Value-boxed buffers; unresolved-CallM const-zero degrades) were fixed
on 2026-07-09 and the per-module AOT re-baseline is the next gate.
Rows flip to **stable** when their AOT leg is 100%.

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
5.nanos()       5.micros()      5.millis()
5.secs()        5.mins()        5.hours()
// The family stops at `hours` on purpose: it mirrors `Duration`'s own
// short constructors exactly, with no synonyms. For longer spans name
// the constructor — `Duration.from_days(5)`, `Duration.from_weeks(2)`.
```

### Inspection

```verum
d.as_nanos() -> Int        d.as_micros() -> Int
d.as_millis() -> Int       d.as_secs() -> Int
d.as_minutes() -> Int      d.as_hours() -> Int
d.as_days() -> Int         d.as_weeks() -> Int
d.as_secs_f64() -> Float
d.subsec_nanos() -> Int    d.subsec_micros() -> Int    d.subsec_millis() -> Int
d.is_zero() -> Bool
```

### Arithmetic

```verum
d + d2        d - d2        d * n         d / n
d.checked_add(d2) / checked_sub / checked_mul / checked_div -> Maybe<Duration>
d.saturating_add(d2) / saturating_sub / saturating_mul
// Scaling is by `Int`. There is no float-factor multiply and no
// `saturating_div`: division can only fail on a zero divisor, which
// `checked_div` already reports.
```

Implements `Eq`, `Ord`, `Clone`, `Copy`, `Hash`, `Debug`, `Display`.

---

## `Instant` — monotonic time

Always moves forward. Unaffected by wall-clock adjustments (NTP, DST,
manual time changes). Use for measuring elapsed time.

```verum
Instant.now() -> Instant

i.elapsed() -> Duration                 // since this instant
i.duration_since(earlier) -> Maybe<Duration>   // None if i < earlier
i.saturating_duration_since(earlier) -> Duration  // zero if i < earlier

i.checked_add(duration) -> Maybe<Instant>
i.checked_sub(duration) -> Maybe<Instant>
Instant.from_nanos(nanos) -> Instant     i.as_nanos() -> Int
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

Two types, and picking the wrong one is the usual mistake: `Interval`
**blocks the calling thread**, `AsyncInterval` is a `Stream`.

```verum
Interval.new(period: Duration) -> Interval        // first tick after one period
Interval.immediate(period: Duration) -> Interval  // first tick fires at once

iv.tick() -> Int          // BLOCKS until the next tick; see below
iv.period() -> Duration
iv.reset()                // next tick one full period from now
```

`tick()` returns **how many periods elapsed**, normally `1`. A slow
caller that missed ticks gets the count it fell behind by, and the
schedule advances past them — so the interval does not accumulate drift,
and you decide what a missed tick means:

```verum
let mut iv = Interval.new(1.secs());
loop {
    let missed = iv.tick() - 1;
    if missed > 0 {
        print(f"fell behind by {missed} tick(s)");
    }
    heartbeat();
}
```

There is no `MissedTickBehavior` knob: the return value is the report,
and catching up is the fixed policy.

### `AsyncInterval` — the stream form

```verum
interval(period: Duration) -> AsyncInterval
interval_ms(ms: Int) -> AsyncInterval
AsyncInterval.new(period) -> AsyncInterval
aiv.reset()
```

It implements `Stream` with `Item = ()`, so it composes with the stream
combinators rather than being ticked by hand:

```verum
interval(Duration.millis(100))
    .take(5)
    .for_each(|_| { print("tick"); })
    .await;
```

---

## `Time` namespace

Convenience static methods. Wall-clock time is deliberately not here:
it is a capability, reached through the `Clock` context, not a static
anyone can call. For a monotonic point use `Instant.now()`.

```verum
Time.now() -> Duration                  // monotonic, since epoch
Time.monotonic() -> Int                 // raw nanoseconds
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

## Open defects

| ID | Module | Surface | Resolution path |
|---|---|---|---|
| `duration §A` | `duration.vr` | `Duration.nanos(-1).as_nanos() == 0` (Verum body clamps via `n.max(0)`) but `Duration.from_nanos(-1).as_nanos() == -1` (runtime intrinsic `time_duration_from_nanos` is pure identity). Same split for the 4 scale-tier constructor pairs. | Two options. **A** — update VBC inline sequences (`DurationFromNanos`/`FromMicros`/`FromMillis`/`FromSecs`) to clamp; breaks `duration_parse` negative-input contract. **B** — drop `.max(0)` from Verum body + Sub/Mul impls; Duration becomes signed; aligns with Go/Java/C++ + duration_parse "-15m" surface. Author preference: B. |
| `duration_parse §A` | `duration_parse.vr` | `parse("-15m").as_nanos() < 0` relies on duration §A intrinsic identity. | Gated on duration §A resolution. |
| `system_time §A` | `system_time.vr` | `duration_since` arithmetic `secs * NANOS_PER_SEC + nanos` overflows Int64 around `secs ≈ 9.2e9` ≈ year 2262. | Add `SystemTimeError.Overflow` variant + boundary guard + property pin. ~30 min. |
| `cron §A` | `cron.vr` | No support for vixie-cron extensions (`@hourly`/`W`/`L`/`#n`). | Documented feature gap; ~3h to land behind `extensions: bool` constructor flag. |
| `rfc3339 §A/§B/§C` | `rfc3339.vr` | Empty fraction / 10+ digit truncation / out-of-range offset pins missing. | ~20 min total for 3 unit tests + 1 boundary guard. |
| `interval §A/§B` | `interval.vr` | Blocking `Interval.tick()` and `AsyncInterval.poll_next` live-poll tests gated on `@slow` marker + executor harness. | Pin in `vcs/specs/L2-standard/async/` once executor harness lands. |

## See also

- **[async → timers](/docs/stdlib/async#timers)** — `sleep`, `timeout`, `Interval`.
- **[intrinsics](/docs/stdlib/intrinsics)** — `monotonic_nanos`, `rdtsc`, `rdtscp`.
- **[sys](/docs/stdlib/sys)** — platform `clock_gettime` / libSystem equivalents.
- **[`stdlib/database`](/docs/stdlib/database)** — native SQLite consumes `julian` for `julianday(...)` / `date(...)` timestamps.
