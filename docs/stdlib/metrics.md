---
title: metrics
description: Prometheus-compatible metrics registry
---

# `core.metrics`

**Layer 4.96 — Prometheus-compatible metrics**

Concurrent-safe Counter / UpDownCounter / Gauge / Histogram primitives
with bounded label cardinality, a pluggable exporter surface, and a
Prometheus text-format (0.0.4) encoder.

## Module layout

| Submodule | Purpose |
|-----------|---------|
| `metrics.label` | `LabelSet` — ordered value list |
| `metrics.value` | `AtomicF64` — IEEE 754 atomic via AtomicU64 bit-pattern |
| `metrics.instrument` | `Counter` / `UpDownCounter` / `Gauge` |
| `metrics.histogram` | `HistogramBuckets` + `Histogram` + `HistogramSnapshot` |
| `metrics.registry` | `Registry`, `*Config`, `MetricFamily`, handles |
| `metrics.exporter` | `MetricsExporter` protocol |
| `metrics.prometheus` | Text-format (0.0.4) encoder |

## Instrument semantics

| Instrument | Semantics | Prometheus TYPE |
|------------|-----------|-----------------|
| `Counter` | Monotonic; `add(v < 0)` panics | `counter` |
| `UpDownCounter` | Bi-directional (OTel-style) | `gauge` |
| `Gauge` | Arbitrary settable | `gauge` |
| `Histogram` | Fixed bucket counts + sum + count | `histogram` |

All scalar instruments are backed by `AtomicF64` (lock-free CAS-loop
add). Histogram bucket counts are per-bucket `AtomicU64`, sum is
`AtomicF64`, total count is `AtomicU64`.

## Registration + recording

```verum
mount core.metrics.*;

let registry = Registry.new();

let requests = registry.counter(CounterConfig {
    name: "http_requests_total".into(),
    help: "Total HTTP requests".into(),
    labels: ["method".into(), "status".into()].to_list(),
});

// Bind label values and record
requests.with(&[&"GET".into(), &"200".into()]).inc();
requests.with(&[&"POST".into(), &"201".into()]).add(3.0);
```

`*.with(values)` returns a `Shared<Counter>` / `Shared<Gauge>` / … that
can be cached by the caller if needed — repeated `.with(values)` calls
with the same values hit the same underlying atomic (linear scan in the
family's entry table).

## Histogram

```verum
let h = registry.histogram(HistogramConfig {
    name: "request_duration_seconds".into(),
    help: "Request latency".into(),
    labels: ["route".into()].to_list(),
    buckets: HistogramBuckets.exponential(0.001, 2.0, 12),
});

h.with(&[&"/v1/orders".into()]).observe(0.023);
```

Default buckets cover ~5 ms to 10 s in Prometheus-default steps. Custom
buckets available via `HistogramBuckets.custom(&[...])`,
`.linear(start, width, count)`, or `.exponential(start, factor, count)`.

## Prometheus text format

```verum
// Snapshot the registry and serialise
let body = core.metrics.prometheus.encode(&registry);

// Or stream into a caller-provided buffer (HTTP response body)
let mut buf = Text.with_capacity(4096);
core.metrics.prometheus.encode_into(&registry, &mut buf);
```

The encoder produces Prometheus exposition format 0.0.4 with `# HELP`
and `# TYPE` comments, properly-escaped label values
(`\\` → `\\\\`, `"` → `\\"`, `\n` → `\\n`), and cumulative
histogram buckets with a synthetic `le="+Inf"` bucket for the total.

## Performance

- `Counter.inc()` and `Gauge.set()` are single-atomic operations (~5 ns
  uncontended, ~40 ns under contention).
- `Histogram.observe(v)` walks buckets — O(bucket count) atomic ops.
  Default 11 buckets ⇒ ~60 ns uncontended.
- Cardinality lookup is O(n_entries) per family; designers should keep
  label cardinality ≤ a few dozen per family (Prometheus best practice).

## Label-cardinality control

There is no built-in hard limit on entries per family; callers are
expected to enforce bounded cardinality at instrumentation time (e.g.
avoid raw user-IDs / request-IDs as label values). A future
`CardinalityBudget` helper may enforce this at the registry boundary.

## `ewma` — moving-average estimators

Three layered primitives for "recent-heavy" smoothed quantities in
constant memory. Used by Unix load averages, TCP SRTT estimator
(RFC 6298 α=0.125), load-balancer response-time tracking, storage
write-amplification monitors.

### Fixed-α `Ewma`

```
S_t = α × x_t + (1 - α) × S_{t-1}
```

```verum
let mut srtt = Ewma.new(0.125);   // TCP SRTT
srtt.update(rtt_ms);
let smoothed = srtt.value();
```

Presets `Ewma.one_minute()` / `five_minute()` / `fifteen_minute()`
match the Unix `uptime` load-average constants. First `update`
seeds without mixing; `is_seeded()` and `reset()` expose the
pre-seeded state.

### `TimeDecayingEwma` (Dropwizard-style)

For observations arriving at non-uniform cadence:

```
decay = exp(-Δt / τ)
S_t = S_{t-1} × decay + x_t × (1 - decay)
```

In-module `exp(-x)` approximation — no math-intrinsic dependency;
accuracy ~1e-6 for x ∈ [0, 20].

### `RateMeter`

Convenience wrapper over `TimeDecayingEwma`. 1/5/15-minute
events-per-second windows — the familiar Dropwizard output
shape every Prometheus / Grafana / Datadog dashboard renders.

```verum
let mut meter = RateMeter.new();
meter.mark(1_u64);
meter.one_minute_rate();
meter.five_minute_rate();
meter.fifteen_minute_rate();
meter.count();
```
