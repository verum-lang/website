---
title: core.metrics — Prometheus- and OTel-compatible instrumentation
description: Lock-free Counter / UpDownCounter / Gauge / Histogram primitives, a bounded-cardinality registry, a Prometheus text-format (0.0.4) encoder, a pluggable exporter protocol, and Dropwizard-style EWMA meters.
---

# `core.metrics` — metrics registry

A Prometheus-native, OTel-compatible metrics surface. Every family
(Counter, UpDownCounter, Gauge, Histogram) maps one-to-one to both a
[Prometheus metric type](https://prometheus.io/docs/concepts/metric_types/)
and an [OpenTelemetry instrument](https://opentelemetry.io/docs/specs/otel/metrics/api/),
so the same application code can be scraped by Prometheus or pushed
via OTLP by swapping the exporter.

## Design invariants

- **Lock-free fast path.** Scalar instruments are a single
  `AtomicF64` CAS-loop add (~5 ns uncontended). Histogram observations
  are O(bucket count) atomic ops.
- **Bounded cardinality.** Each `MetricFamily` owns a small linear
  table of (label-set → instrument) entries. A few dozen label-sets
  per family is the fast path; thousands is a design smell and should
  be rejected at the instrumentation boundary, not at the registry.
- **Snapshot semantics.** Exporters see a *point-in-time* clone of the
  registry — observations in flight during a scrape may land in the
  next snapshot, never corrupt the current one.
- **Zero allocation on the recording path.** Once a metric and its
  labels are resolved (via `.with(...)`), recording is a single
  atomic op; callers are encouraged to cache the resolved handle.

## Module layout

| Submodule | Purpose |
|-----------|---------|
| `core.metrics` (mod) | Flat re-exports of the public surface |
| `core.metrics.label` | `LabelSet`, `LabelValue` — ordered list keyed by family labels |
| `core.metrics.value` | `AtomicF64` — IEEE-754 double via `AtomicU64` bit-pattern |
| `core.metrics.instrument` | `Counter`, `UpDownCounter`, `Gauge` |
| `core.metrics.histogram` | `HistogramBuckets`, `Histogram`, `DEFAULT_BUCKETS` |
| `core.metrics.registry` | `Registry`, `MetricFamily`, `MetricKind`, `*Config` types |
| `core.metrics.exporter` | `MetricsExporter` protocol, `ExportResult` |
| `core.metrics.prometheus` | Text-format 0.0.4 encoder (`encode`, `encode_into`) |
| `core.metrics.ewma` | `Ewma`, `TimeDecayingEwma`, `RateMeter` — smoothed rate estimators |

## Instrument taxonomy

| Instrument | Semantics | Prometheus `# TYPE` | OTel instrument |
|------------|-----------|---------------------|-----------------|
| `Counter` | Monotonic; `add(v)` with `v < 0` panics | `counter` | `Counter` |
| `UpDownCounter` | Bi-directional; `add(±v)` | `gauge` | `UpDownCounter` |
| `Gauge` | Arbitrary `set(v)` + `add(v)` | `gauge` | `ObservableGauge` |
| `Histogram` | Fixed bucket bounds + sum + count | `histogram` | `Histogram` |

All scalar instruments are backed by `AtomicF64` (a `UInt64` whose bit
pattern represents an IEEE-754 double). Histogram bucket counts use
per-bucket `AtomicU64`; the sum is an `AtomicF64` and the total count
is an `AtomicU64`. All atomics use `MemoryOrdering.Relaxed` — scrape
semantics tolerate slight read skew.

## Registration

Every family is created via a typed config record that pins name,
help, label schema, and (for histograms) bucket bounds:

```verum
public type CounterConfig is
    { name: Text, help: Text, labels: List<Text> };
public type UpDownCounterConfig is
    { name: Text, help: Text, labels: List<Text> };
public type GaugeConfig is
    { name: Text, help: Text, labels: List<Text> };
public type HistogramConfig is
    { name: Text, help: Text, labels: List<Text>, buckets: HistogramBuckets };
```

```verum
mount core.metrics.{Registry, CounterConfig, HistogramConfig, HistogramBuckets};

let registry = Registry.new();

let requests = registry.counter(CounterConfig {
    name: "http_requests_total".into(),
    help: "Total HTTP requests".into(),
    labels: ["method".into(), "status".into()].to_list(),
});

let latency = registry.histogram(HistogramConfig {
    name: "request_duration_seconds".into(),
    help: "Request latency (seconds)".into(),
    labels: ["route".into()].to_list(),
    buckets: HistogramBuckets.exponential(0.001, 2.0, 12),
});
```

## Recording

`family.with(&[&label_value_1, &label_value_2, …])` returns a
`Shared<Counter>` / `Shared<Gauge>` / `Shared<Histogram>` bound to that
label tuple. Repeated calls with identical values hit the same
underlying atomic.

```verum
requests.with(&[&"GET".into(),  &"200".into()]).inc();
requests.with(&[&"POST".into(), &"201".into()]).add(3.0);

latency.with(&[&"/v1/orders".into()]).observe(0.023);
```

**Caching tip.** Hot paths should resolve the instrument once at
setup and keep the `Shared<Counter>` handle — `.with(...)` does a
linear scan over the family's entry table.

## Histogram buckets

```verum
implement HistogramBuckets {
    public fn defaults() -> HistogramBuckets;                       // 11 buckets, 5 ms–10 s, 2× steps
    public fn custom(bounds: &[Float]) -> HistogramBuckets;         // sorted + deduped on construction
    public fn linear(start: Float, width: Float, count: Int) -> HistogramBuckets;
    public fn exponential(start: Float, factor: Float, count: Int) -> HistogramBuckets;
}
```

The default set (`DEFAULT_BUCKETS`) is the Prometheus client\_golang
default: `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]`.
A `+Inf` bucket is implicit in the encoded output — total count minus
the sum of all bounded-bucket counts.

| Bucket recipe | When to use |
|---------------|-------------|
| `defaults()` | HTTP/RPC latency, any "a few ms to a few seconds" phenomenon |
| `exponential(start, factor, count)` | Wide dynamic range (queue depth, file sizes) |
| `linear(start, width, count)` | Narrow uniform range (error-rate buckets 0–100%) |
| `custom(&bounds)` | SLO bucket alignment (0.2 / 0.5 / 1.0 / … for P95/P99 dashboards) |

## `Registry` + `MetricKind`

```verum
public type MetricKind is KCounter | KUpDownCounter | KGauge | KHistogram;

public type MetricFamily is { /* name, help, kind, label_names, entries */ };

implement Registry {
    public fn new() -> Registry;
    public fn counter(&self, cfg: CounterConfig) -> Shared<MetricFamily>;
    public fn up_down_counter(&self, cfg: UpDownCounterConfig) -> Shared<MetricFamily>;
    public fn gauge(&self, cfg: GaugeConfig) -> Shared<MetricFamily>;
    public fn histogram(&self, cfg: HistogramConfig) -> Shared<MetricFamily>;

    public fn families(&self) -> List<Shared<MetricFamily>>;  // snapshot for export
}
```

Re-registering a family under the same name returns the existing
`Shared<MetricFamily>` — callers SHOULD treat the registry as the
source of truth and never construct a family manually.

## Prometheus text format

```verum
mount core.metrics.prometheus;

// Full snapshot → Text
let body: Text = core.metrics.prometheus.encode(&registry);

// Streaming into an HTTP response buffer
let mut buf = Text.with_capacity(4096);
core.metrics.prometheus.encode_into(&registry, &mut buf);
```

Output conforms to Prometheus exposition format 0.0.4:

- `# HELP` and `# TYPE` comments per family
- Label values escaped (`\\` → `\\\\`, `"` → `\\"`, newline → `\\n`)
- Histograms emitted as *cumulative* bucket counts plus a synthetic
  `le="+Inf"` bucket carrying the total
- Counter output suffix convention: `_total` if the name does not
  already end in it — callers who want strict control should name
  their counters with the `_total` suffix explicitly

## Exporter protocol

```verum
public type ExportResult is Success | Failure(Text);

public type MetricsExporter is protocol {
    fn export(&self, registry: &Registry) -> ExportResult;
    fn shutdown(&self, timeout: Duration) -> ExportResult;
};
```

In-tree implementation is `core.metrics.prometheus` (text format +
HTTP scrape handler). Out-of-tree exporters (OTLP, StatsD, Datadog,
Graphite, CloudWatch) live in separate cogs and all conform to the
same two-method protocol. `shutdown` MUST drain any outstanding
export work — pushing exporters typically flush on shutdown.

## `core.metrics.ewma` — smoothed rate estimators

Three layered primitives for "recent-heavy" quantities that need
constant memory instead of a full histogram. Used by Unix load
averages, the TCP SRTT estimator (RFC 6298 α = 0.125), load balancer
response-time tracking, and storage write-amplification monitors.

### Fixed-α `Ewma`

$$S_t = \\alpha \\cdot x_t + (1 - \\alpha) \\cdot S_{t-1}$$

```verum
mount core.metrics.ewma.{Ewma};

let mut srtt = Ewma.new(0.125);  // TCP SRTT per RFC 6298
srtt.update(rtt_ms);
let smoothed = srtt.value();
```

Presets align with Unix `uptime` load averages:
`Ewma.one_minute()`, `Ewma.five_minute()`, `Ewma.fifteen_minute()`.
The first `update` seeds without mixing; `is_seeded()` and `reset()`
expose the pre-seeded state.

### `TimeDecayingEwma` (Dropwizard-style)

For observations arriving at non-uniform cadence — the decay factor
accounts for the actual elapsed time:

$$\\text{decay} = e^{-\\Delta t / \\tau}, \\quad S_t = S_{t-1} \\cdot \\text{decay} + x_t \\cdot (1 - \\text{decay})$$

The module ships its own `exp(-x)` approximation (accuracy ~1e-6 for
x ∈ [0, 20]) — no dependency on a math intrinsic.

### `RateMeter` — Dropwizard 1/5/15-minute rate

```verum
mount core.metrics.ewma.{RateMeter};

let mut meter = RateMeter.new();
meter.mark(1_u64);
let one_min: Float = meter.one_minute_rate();
let five_min: Float = meter.five_minute_rate();
let fifteen_min: Float = meter.fifteen_minute_rate();
let total: UInt64 = meter.count();
```

Events-per-second in three windows — the familiar shape every
Prometheus / Grafana / Datadog dashboard renders out of the box.

## Performance notes

| Operation | Cost (uncontended) | Under contention |
|-----------|--------------------|------------------|
| `Counter.inc()` | ~5 ns (single atomic add) | ~40 ns |
| `Gauge.set(v)` | ~5 ns | ~40 ns |
| `Histogram.observe(v)` | ~60 ns (11-bucket default, linear bucket scan + 2 atomics) | ~150 ns |
| `family.with(&labels)` | O(entries) linear scan | same |
| `prometheus.encode(&registry)` | proportional to total (family × label-set) pairs | n/a — snapshotted |

The intentional linear scan in label lookup is a factor of ~3× faster
than hashing for the typical ≤ 50-entry family; beyond that, the
cost flips and the caller should re-examine the label schema. High
cardinality is almost always a design bug, not a registry bug.

## Label-cardinality control

There is no built-in hard limit on entries per family; callers are
expected to enforce bounded cardinality at instrumentation time (e.g.
avoid raw user-IDs or request-IDs as label values — use a bucketed
percentile or a dedicated trace instead). A future `CardinalityBudget`
helper may enforce this at the registry boundary as an opt-in guard.

## See also

- [`stdlib/tracing`](/docs/stdlib/tracing) — distributed-trace spans;
  complementary to metrics (per-event vs per-aggregate).
- [`stdlib/sync`](/docs/stdlib/sync) — `AtomicU64` / `AtomicF64` used
  by the atomic fast path.
- [`stdlib/time`](/docs/stdlib/time) — `Duration` used by exporter
  `shutdown(timeout)` and by `RateMeter`.
