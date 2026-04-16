---
title: Timeouts, retries, circuit breakers
description: Patterns for graceful failure against flaky remote services.
---

# Resilience

Three primitives compose for robust clients: **timeout** (give up
eventually), **retry** (try again after backoff), **circuit breaker**
(stop hammering an unhealthy service).

### Timeout

```verum
async fn call_with_budget(url: &Text) -> Result<Bytes, Error> using [Http] {
    match timeout(5.seconds(), Http.get(url)).await {
        Result.Ok(resp) => resp.body().await,
        Result.Err(TimeoutError) => Result.Err(Error.new(&"timed out")),
    }
}
```

### Retry with exponential backoff

```verum
async fn robust(url: &Text) -> Result<Bytes, Error> using [Http] {
    execute_with_retry_config(|| Http.get(url).and_then(|r| r.body()),
        RetryConfig {
            max_attempts: 5,
            initial_backoff_ms: 200,
            max_backoff_ms: 10_000,
            backoff_factor: 2.0,
            jitter: true,
        }).await
}
```

`jitter: true` adds randomness so N clients don't converge on the
same retry instant — critical against downstream overload.

### Circuit breaker

```verum
let breaker = Shared.new(CircuitBreaker.new(CircuitBreakerConfig {
    failure_threshold: 5,
    reset_timeout_ms: 30_000,
    half_open_max_calls: 1,
}));

async fn call_breaker(b: &CircuitBreaker, url: &Text)
    -> Result<Bytes, Error> using [Http]
{
    if !b.is_call_allowed() {
        return Result.Err(Error.new(&"circuit open"));
    }
    match Http.get(url).and_then(|r| r.body()).await {
        Result.Ok(v)  => { b.record_success(); Result.Ok(v) }
        Result.Err(e) => { b.record_failure(); Result.Err(e) }
    }
}
```

State machine: **Closed** → N failures → **Open** (all calls fail
fast) → cooldown → **HalfOpen** (1 trial call) → success returns to
Closed; failure back to Open.

### Composition — the full stack

```verum
async fn resilient_call(url: &Text, breaker: &CircuitBreaker)
    -> Result<Bytes, Error> using [Http]
{
    timeout(10.seconds(),
        execute_with_retry_config(
            || call_breaker(breaker, url),
            RetryConfig.exponential(3, 200.ms()))
    ).await?
}
```

Inside-out: *breaker → retry → timeout*. You want the breaker to see
every attempt (including retries) so failure counts work; the timeout
wraps the entire sequence.

### Per-call timeouts vs global budget

```verum
async fn with_deadline(deadline: Instant, tasks: List<Task>) -> Result<(), Error> {
    for t in tasks {
        let now = Instant.now();
        if now >= deadline {
            return Result.Err(Error.new(&"deadline exceeded"));
        }
        let remaining = deadline.duration_since(&now);
        timeout(remaining, t.run()).await??;
    }
    Result.Ok(())
}
```

Per-call timeouts are easier; global deadlines preserve end-to-end
SLOs across call chains.

### See also

- **[async → retry and circuit breaker](/docs/stdlib/async#retry-and-circuit-breaker)**
- **[HTTP client](/docs/cookbook/http-client)** — retries on real requests.
- **[Performance](/docs/guides/performance)**
