---
sidebar_position: 16
title: Error Handling
---

# Error Handling

Verum has a five-level defence for errors:

1. **Prevent with types** — refinements make entire error classes unrepresentable.
2. **Static verification** — SMT proves obligations before runtime.
3. **Explicit handling** — `Result<T, E>` and `Maybe<T>` are values.
4. **Fault tolerance** — supervision, restart, circuit breakers.
5. **Panic containment** — `panic` as last resort, isolated.

## `Result<T, E>`

The canonical error type:

```verum
type Result<T, E> is
    | Ok(T)
    | Err(E);
```

### Propagating with `?`

```verum
fn load_config() -> Result<Config, Error> {
    let bytes = fs.read("config.toml")?;    // on Err, return early
    let text  = Text.from_utf8(&bytes)?;
    toml.parse(&text)
}
```

`?` unwraps an `Ok` or propagates an `Err`. For `Maybe`, `?` propagates
`None` from a function whose return type is `Maybe<_>` or `Result<_,
E>` (with `None` lifted to a specific error).

## `throws`

Some functions declare a typed error boundary:

```verum
fn parse_addr(s: Text) -> Addr throws(ParseError | DnsError) {
    let text_addr = validate_syntax(s)?;   // may throw ParseError
    resolve(text_addr)?                    // may throw DnsError
}
```

- `throws(E)` is a checked effect. Every call-site must handle the
  error or re-propagate via `throws`.
- `throw ErrorValue` constructs and propagates.
- Multiple error types are written `throws(A | B | C)` — the compiler
  synthesises the sum type.

## `try` / `recover` / `finally`

Structured error handling:

```verum
try {
    risky_op()
} recover {
    Error.NotFound     => default_value(),
    Error.Timeout      => retry_op()?,
} finally {
    cleanup();
}
```

- `try` — block that may throw.
- `recover` — pattern-matching over the error.
- `finally` — always runs (success, failure, or early return).

A closure-style variant:

```verum
try { risky_op() } recover |e| {
    log_error(&e);
    default_value()
}
```

## Preventing errors with refinements

Refinement types make whole categories of errors unreachable:

```verum
fn divide(a: Int, b: Int { self != 0 }) -> Int { a / b }
```

There is no `Err(DivByZero)` case because `b` cannot be zero — it is
a type error to call `divide` with a `b` that might be.

## Supervision

For long-running concurrent systems, `Supervisor` restarts failed
tasks per a policy:

```verum
let sup = Supervisor.new(SupervisionStrategy.OneForOne);
sup.spawn(ChildSpec {
    name: "worker",
    task: worker_loop(),
    restart: RestartPolicy.Permanent,
});
sup.run().await;
```

Policies:
- `OneForOne` — restart the failed task, leave siblings running.
- `OneForAll` — restart the failed task and all its siblings.
- `RestForOne` — restart the failed task and all started after it.

## Circuit breakers

For flaky downstream dependencies:

```verum
let breaker = CircuitBreaker.new(CircuitBreakerConfig {
    failure_threshold: 5,
    cooldown:          30.seconds,
});

async fn call_remote() -> Result<Data, Error> {
    breaker.call(|| remote_api.fetch()).await
}
```

After 5 consecutive failures the breaker opens for 30 s, short-circuiting
calls with `Err(CircuitOpen)` instead of retrying.

## Retries

```verum
let cfg = RetryConfig {
    attempts: 3,
    backoff:  Backoff.Exponential(100.ms),
};
execute_with_retry(cfg, || fetch()).await
```

## `panic` and `assert`

```verum
assert(x > 0);
assert_eq(left, right);
panic("invariant violated");
```

- `assert(cond)` panics if `cond` is false (or is stripped in release
  builds with `@cfg(release)` + `@verify(static)` proof).
- `panic(msg)` unwinds the current task. In a supervised context, the
  supervisor decides how to respond. Outside a supervisor, `panic`
  aborts the process.

`unreachable()` and `todo()` are panics with conventional semantics.

## Don't use panic for control flow

Panics are for "this should never happen." Use `Result` / `Maybe` for
"this might not succeed."

## Errors and `Drop`

A value's `drop` method cannot throw. If cleanup can fail, expose a
fallible `close()` method and document that dropping without closing
may hide errors.

## Worked example — composing the five layers

A resilient client for a flaky remote service touches every layer
in the right order:

```verum
type Error is
    | InvalidInput(Text)
    | Upstream { status: Int, body: Text }
    | CircuitOpen
    | Exhausted;

type NonEmpty<T> is List<T> { self.len() > 0 };

async fn push_all(events: NonEmpty<Event>) -> Result<(), Error>
    using [Http, Logger]
{
    let breaker = CircuitBreaker.new(CircuitBreakerConfig {
        failure_threshold: 3, cooldown: 10.seconds,
    });
    let retry = RetryConfig {
        attempts: 4, backoff: Backoff.Exponential(200.ms),
    };

    for ev in events.iter() {
        let outcome = retry.execute(|| async {
            breaker.call(|| post_event(ev)).await
        }).await;

        match outcome {
            Result.Ok(_)                 => Logger.info(&f"sent {ev.id}"),
            Result.Err(Error.CircuitOpen) => return Result.Err(Error.CircuitOpen),
            Result.Err(e) if retry.exhausted() =>
                return Result.Err(Error.Exhausted),
            Result.Err(e) => Logger.warn(&f"retrying {ev.id}: {e}"),
        }
    }
    Result.Ok(())
}
```

Layer-by-layer:

1. **Prevent** — `events: NonEmpty<Event>` removes the empty-batch
   edge case at the call boundary.
2. **Verify** — `retry.exhausted()` is refinement-tracked so the
   compiler knows the branch is reachable only after the retry budget
   is spent.
3. **Handle** — `Result` is threaded through, no `?`-shortcuts that
   would hide the circuit-open signal.
4. **Tolerate** — `CircuitBreaker` and `RetryConfig` compose; a
   supervisor above this function would restart it on panic.
5. **Contain** — no `panic` anywhere; the caller always sees a typed
   `Error`.

See **[Cookbook → resilience](/docs/cookbook/resilience)** for the
supervision-tree wiring around this function.

## See also

- **[Functions](/docs/language/functions)** — `throws`, `ensures`,
  `requires`.
- **[Stdlib → base](/docs/stdlib/base)** — `Result`, `Maybe`, error
  types.
- **[Verification → contracts](/docs/verification/contracts)** — how
  contracts turn errors into compile-time obligations.
- **[Cookbook → resilience](/docs/cookbook/resilience)** — retry +
  circuit breaker + supervision in a full pipeline.
- **[Async & concurrency](/docs/language/async-concurrency)** —
  structured concurrency and cancellation interact with error flow.
