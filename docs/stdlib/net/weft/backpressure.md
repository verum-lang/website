---
sidebar_position: 10
title: Backpressure & load shedding
description: Three-layered backpressure (poll_ready / bounded channels / flow control). ConcurrencyLimitLayer, RateLimitLayer, LoadShedLayer, AdaptiveConcurrencyLayer (Vegas), CoDelLayer (sojourn-time admission), tenant-aware WFQ.
---

# `core.net.weft.backpressure`

Three layers of backpressure, none of them hideable, every one
typed and explicit.

Sources:

- `core/net/weft/backpressure.vr` (517 LOC) — fixed-limit layers and
  CoDel sojourn-time admission.
- `core/net/weft/adaptive.vr` (184 LOC) — Vegas adaptive
  concurrency.

## Three-axis model

| Axis | Where | Mechanism |
|---|---|---|
| 1. `Service.poll_ready` | Service protocol level | Returns `Pending` (capacity) or `Err(Overloaded)` (rejection). |
| 2. Bounded nursery channels | Inter-task communication | Producer blocks when downstream queue is full. |
| 3. Transport flow control | Wire level | HTTP/2 `WINDOW_UPDATE`, HTTP/3 stream credits, TCP receive window. |

Hidden queues (unbounded `mpsc`, eager spawn-and-forget) are
**impossible** to introduce by construction — Verum's bounded
channel is the default and the unbounded variant is not in the
public stdlib.

## Layer 1: `ConcurrencyLimitLayer`

Bounds in-flight requests at a fixed integer.

```verum
public type ConcurrencyLimitLayer is { max: Int };

implement ConcurrencyLimitLayer {
    public fn new(max: Int) -> ConcurrencyLimitLayer
}
```

Behaviour:

- Tracks current in-flight count.
- `poll_ready` returns `Pending` when at the cap.
- `call` increments before dispatching and decrements after.

Use case: protect a downstream service that has a known concurrency
limit (e.g. a database with a small connection pool).

## Layer 1: `RateLimitLayer`

Token-bucket rate limiter.

```verum
public type RateConfig is {
    rps: Int,
    burst: Int,
};

public type RateLimitLayer is { config: RateConfig };

implement RateLimitLayer {
    public fn new(config: RateConfig) -> RateLimitLayer
}
```

Behaviour:

- Refills tokens at `rps` per second.
- Caps the bucket at `burst`.
- `poll_ready` returns `Pending` until a token is available.
- `call` consumes one token.

The `Pending` semantics means a backpressure-aware client (or
upstream layer) sees the limit as a queue, not a rejection. To
reject instead, wrap the inner with `LoadShedLayer`.

## Layer 1: `LoadShedLayer`

Converts `Pending` from inner into immediate `Err(Overloaded)`.

```verum
public type LoadShedLayer<S> is { inner: S };

implement<S: Service<...>> LoadShedLayer<S> {
    public fn new(inner: S) -> LoadShedLayer<S>
}
```

The inner service's `poll_ready == Pending` translates to
`call(req) -> Err(Overloaded)` immediately. The framework's response
is 503 Service Unavailable with a `Retry-After` header.

Use case: edge servers preferring fast-fail over indefinite queuing.
The client retries after the suggested delay, freeing the server
from holding queue depth.

## Layer 1: `AdaptiveConcurrencyLayer` (Vegas)

The Netflix concurrency-limits algorithm (Vegas), ported.

```verum
public type AdaptiveConcurrencyLayer is { /* opaque */ };

implement AdaptiveConcurrencyLayer {
    public fn vegas() -> AdaptiveConcurrencyLayer
}
```

Behaviour:

- Continuously measures min-RTT (`alpha`) and current RTT.
- If current RTT is rising relative to alpha — suggesting queue
  buildup at downstream — narrows the concurrency limit.
- If current RTT is at or below alpha — capacity is not the
  bottleneck — widens the limit.
- Limits scale up to a cap, down to a floor, with a damped step.

Self-tuning: no manual `max` to tune. Pair with `LoadShedLayer` for
edge use cases where rejection is preferred to queueing under
overload.

## Layer 1: `CoDelLayer` — sojourn-time admission

Application-layer FQ-CoDel.

```verum
public type CoDelConfig is {
    target_ms: Int,                  // default 100 ms
    interval_ms: Int,                // default 5_000 ms
    min_concurrency: Int,            // floor
};

public type CoDelLayer is { config: CoDelConfig };

implement CoDelLayer {
    public fn new(config: CoDelConfig) -> CoDelLayer
}
```

Behaviour:

- Reads the `x-weft-submitted-at` header stamped by the listener
  to compute sojourn time per request.
- Tracks p95 sojourn time.
- If p95 exceeds `target_ms` for `interval_ms` consecutive seconds,
  narrows the inner concurrency limit by 25 %.
- If p95 stays below for `interval_ms`, widens by 25 %, up to
  whatever ceiling the inner allows.

Use case: protect the application against bufferbloat at the
application layer, independent of kernel-level queue management.

## Layer 1: tenant-aware WFQ (Weighted Fair Queueing)

```verum
public type WfqConfig is {
    weights: Map<TenantId, Int>,
    default_weight: Int,
};

public type WfqLayer is { /* opaque */ };
```

Behaviour:

- Each request is tagged with a tenant identifier (extracted from
  SPIFFE SVID, `Authorization` header claim, or custom extractor).
- Pending requests are queued per-tenant.
- Dispatch picks the tenant whose **virtual finish time** is
  smallest under the WFQ formula:

  ```
  vftime(tenant) = max(now, last_vftime(tenant)) + service_time / weight(tenant)
  ```

- Result: an aggressive tenant cannot starve a quiet one even
  under sustained overload — its weight cap dominates as the queue
  saturates.

The WFQ layer pairs with SPIFFE identity to make tenant identification
authenticated.

## `select biased` for handler event-loop

For handler authors writing connection-event-loops:

```verum
select biased {
    _ = shutdown_signal.await => return drain_and_stop(),
    req = high_priority_queue.recv() => handle_critical(req).await,
    req = normal_queue.recv() => handle(req).await,
    req = low_priority_queue.recv() => {
        if admission_limit.try_acquire() {
            handle(req).await
        } else {
            respond(503, "Retry-After: 5")
        }
    },
    _ = timeout(100.ms()) => continue,
}
```

`select biased` checks arms in declaration order; without `biased`
the runtime randomises arm order to prevent starvation. Use `biased`
for explicit prioritisation, plain `select` for fairness.

## Composition order

A typical edge-server backpressure stack:

```verum
let svc = ServiceBuilder.new(handler)
    .layer(WfqLayer.new(tenant_weights))
    .layer(CoDelLayer.new(CoDelConfig.default()))
    .layer(AdaptiveConcurrencyLayer.vegas())
    .layer(LoadShedLayer.new())                  // converts Pending to Err
    .build();
```

Outer to inner:

1. WFQ schedules across tenants — fairness gate.
2. CoDel narrows the inner concurrency under bufferbloat — health gate.
3. Vegas adapts the concurrency limit — capacity gate.
4. LoadShed converts any remaining `Pending` into 503 — fast-fail gate.

## Load-shedding policy

When `poll_ready() == Err(Overloaded)`, the framework responds:

- HTTP/1.1 / HTTP/2 / HTTP/3: `503 Service Unavailable` with a
  `Retry-After` header (seconds).
- WebSocket: `Close` frame with code 1013 (Try Again Later).
- Connect / gRPC: status `RESOURCE_EXHAUSTED` plus the equivalent
  retry hint.

The retry-after value is taken from the failing layer's hint, or
defaults to a layer-specific constant.

## Status

- **Implementation**: ConcurrencyLimit, RateLimit, LoadShed, Vegas
  adaptive, CoDel, WFQ — all complete.
- **Conformance**: `backpressure_basic`, `adaptive_basic`,
  `codel_wfq_admission`, `slow_loris_pool_exhaustion` tests passing.
- **Phase**: 2 closed; cross-tenant SLA prioritisation is a Phase 6
  follow-up.

## Related documentation

- [Service / Layer / ServiceBuilder](./service)
- [Connection — HTTP/1.1 pipeline](./connection)
- [Error model](./error)
