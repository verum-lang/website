---
sidebar_position: 2
title: Service / Layer / ServiceBuilder
description: Tower-style service abstraction with mandatory poll_ready backpressure declaration. Rank-2 Layer composition without dynamic dispatch. Foundation of every Weft middleware chain.
---

# `core.net.weft.service`

The fundamental three-protocol abstraction underneath every Weft
component. Modelled on the Tower service trait — battle-tested in
production servers and clients across the ecosystem — with one
normative change: `poll_ready` is mandatory.

Source: `core/net/weft/service.vr` (60 LOC).

## Protocol — `Service<Req, Resp>`

```verum
mount core.async.poll.{Poll};
mount core.async.waker.{Context};

public type Service<Req, Resp> is protocol {
    type Error;

    /// Returns `Ready` if the service can immediately handle a request.
    /// `Pending` means the service is on backpressure — capacity
    /// exhausted, queue full, circuit-breaker paused.
    /// Calling `call()` before `poll_ready() == Ready` is a contract
    /// violation that framework middleware rejects.
    fn poll_ready(&mut self, cx: &mut Context) -> Poll<Result<(), Self.Error>>;

    /// Process a request. Returns the response future.
    async fn call(&mut self, req: Req) -> Result<Resp, Self.Error>;
};
```

### Why mandatory `poll_ready`?

In other Tower-style frameworks it is technically possible to
implement `poll_ready` as `always Ready` — silently disabling
backpressure. This is the bug class that adaptive concurrency-limit
libraries exist to detect in production.

Verum's protocol machinery requires every `Service` impl to declare
`poll_ready` explicitly. Default-Ready is allowed, but the explicit
formulation forces the implementer to think about capacity at the
same site they think about handling. Result: hidden queues are not
just discouraged — they are impossible without conscious effort.

## Protocol — `Layer<Inner>`

```verum
public type Layer<Inner> is protocol {
    type Wrapped;
    fn wrap(&self, inner: Inner) -> Self.Wrapped;
};
```

A `Layer` is a service transformer. Its `wrap` method takes an
inner service and returns a new service, typically wrapping the
inner with logging, tracing, timeouts, retries, rate limiting,
circuit breaking, and so on.

### Rank-2 generality

Verum's `Layer.wrap<Req, Resp, S: Service<Req, Resp>>` is rank-2 —
one and the same `TimeoutLayer` works simultaneously for
HTTP services (`Service<HttpRequest, HttpResponse>`), gRPC
(`Service<GrpcReq, GrpcResp>`), and raw TCP echo
(`Service<&[Byte], List<Byte>>`). No type erasure, no boxed dynamic
dispatch, no performance cost.

The same Tower-Layer abstraction in other systems requires
`dyn Service` boxing because they lack rank-2 polymorphism. Verum
supports it natively — see the language reference on rank-2
function types.

## `ServiceBuilder<S>` — fluent layer composition

```verum
public type ServiceBuilder<S> is { inner: S };

implement<S> ServiceBuilder<S> {
    public fn new(svc: S) -> ServiceBuilder<S> { ... }

    public fn layer<L: Layer<S>>(self, l: L) -> ServiceBuilder<L.Wrapped> {
        ServiceBuilder { inner: l.wrap(self.inner) }
    }

    public fn build(self) -> S { self.inner }
}
```

Usage pattern — outer-to-inner chain:

```verum
let svc = ServiceBuilder.new(my_handler)
    .layer(TracingLayer.new())
    .layer(TimeoutLayer.ms(5000))
    .layer(RateLimitLayer.new(rps = 1000))
    .layer(AuthLayer.jwt(secret))
    .build();
```

Order matches Tower semantics: the **first layer attached** is
**outermost** at request time. In the example above:

1. `AuthLayer` runs first (innermost wrap, outermost gate) — the
   request is authenticated before anything else sees it.
2. Authenticated requests flow through `RateLimitLayer`.
3. Rate-limited requests get a `TimeoutLayer` deadline.
4. The deadline-bearing request enters `TracingLayer`, which
   creates a span across the whole chain.
5. Finally the inner `my_handler` runs.

### `Identity` layer

```verum
public type Identity is {};

implement Identity {
    public fn new() -> Identity { Identity {} }
}

implement<S> Layer<S> for Identity {
    type Wrapped = S;
    fn wrap(&self, inner: S) -> S { inner }
}
```

Useful for conditional layering:

```verum
let svc = ServiceBuilder.new(handler)
    .layer(if cfg.tracing_enabled { TracingLayer.new() } else { Identity.new() })
    .build();
```

Identity has zero runtime cost — `wrap` is a pass-through.

## Protocol composition rules

### `poll_ready` propagation

A wrapping layer's `poll_ready` must consult its inner's
`poll_ready` first:

```verum
implement<S: Service<Req, Resp>> Service<Req, Resp> for TimeoutWrapped<S> {
    type Error = TimeoutError<S.Error>;

    fn poll_ready(&mut self, cx: &mut Context) -> Poll<Result<(), Self.Error>> {
        // Always defer to inner — we add latency, not capacity.
        self.inner.poll_ready(cx).map_err(TimeoutError.Inner)
    }

    async fn call(&mut self, req: Req) -> Result<Resp, Self.Error> {
        match select { /* ... timeout vs inner ... */ }
    }
}
```

Some layers shape backpressure differently. `ConcurrencyLimitLayer`
returns `Pending` when its semaphore is exhausted, even if inner is
ready. `RateLimitLayer` returns `Err(Overloaded)` when the bucket
is empty. Each chooses based on whether the limit is *capacity*
(Pending — wait) or *rejection* (Err — load shed).

### Effect-system contract

Computational properties (`Pure`, `IO`, `Async`, `Fallible`,
`Mutates`, `Spawns`, `FFI`) flow through layer composition. The
Verum compiler verifies, at type-check time:

- `TracingLayer.wrap` has properties subset of `{Pure, Allocates}`.
  A trace layer that quietly opens a database connection is a
  compile error.
- `AuthLayer.wrap` may add `IO + Fallible` (token validation may
  fail and may hit an identity provider). Composition propagates.
- `TimeoutLayer.wrap` adds `Async`. Trivially satisfies any inner.

This means the framework can audit a middleware chain by effect
profile: at compile time we know `AuthLayer + TracingLayer +
TimeoutLayer` cannot quietly look in the database, because they do
not declare `using [Database]` and do not have effect `IO` other
than auth's narrow identity-provider call.

## Comparison with mainstream frameworks

| Aspect | Mainstream Tower-style | Weft |
|---|---|---|
| `poll_ready` mandatory | Optional | Part of protocol |
| `Layer` rank-2 generic | Requires `Box<dyn>` | Via Verum rank-2 fn types |
| Effect audit | None | Compile-time |
| `Layer.wrap` zero-cost | Partial (with monomorphisation effort) | Always |

## Status

- **Implementation**: complete (60 LOC).
- **Conformance**: `service_basic` test passing.
- **Phase**: 1 (Core Service Layer) — closed.
- **Next**: middleware chain effect-system audit — Phase 6.

## Related documentation

- [Handler & extractors](./handler) — converts Verum functions into Services.
- [Router](./router) — radix-tree dispatcher implementing Handler (and therefore Service).
