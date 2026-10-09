---
title: Async / await basics
description: Eager async calls, explicit futures, spawned tasks, and handling completion correctly.
---

# Async / await basics

The current implementation has different completion paths for `async fn`
calls, explicit values implementing `Future`, and tasks created with
`spawn`. The limitations below matter when composing them. For the syntax, see
[Async and Concurrency](/docs/language/async-concurrency).

## An `async fn`

**Current implementation limitation:** calling an `async fn` runs its
body eagerly and returns its result. The lowering does not create a
suspended future that waits for `.await` to start. The `async` modifier
permits await points inside the function; it does not delay the call's
side effects.

A `spawn` block places the operation in a child task. Awaiting the
keyword's task handle retrieves that task's result:

```verum
async fn double(value: Int) -> Int {
    print("double ran");
    value * 2
}

fn main() {
    print("before call");
    let value: Int = double(21);
    print("after call");
    assert(value == 42);

    let handle = spawn { double(3).await };
    let completed = handle.await;
    assert(completed == 6);
    print("async-basics: ok");
}
```

Expected output:

```text
before call
double ran
after call
double ran
async-basics: ok
```

The first `double` call runs before `after call` is printed. The second
runs inside the spawned block. `.await` on a direct async call is a yield
point around an eagerly computed value; `.await` on the keyword's handle
waits for the child. See the
[async call semantics](/docs/language/async-concurrency#async-functions)
and the [keyword await handler](https://github.com/verum-lang/verum/blob/main/crates/verum_vbc/src/interpreter/dispatch_table/handlers/async_nursery.rs).

## Driving an explicit future

An explicit future implements `core.async.future.Future`. Its `poll`
method returns `Poll.Pending` while work remains and `Poll.Ready(output)`
when it completes. `.await` yields the associated `Output` type; that
output can itself be a `Result`.

This is different from assigning the result of an eager async call to a
variable. Adding a `Future<T>` annotation does not defer the call.

`block_on` is an executor API for an explicit future. Do not pass an
already computed async result expecting the executor to run its earlier
side effects. Consult the
[executor limitations](/docs/stdlib/async#localexecutor) before choosing
that path; `block_on` and the explicit executor APIs do not have the same
validated coverage as the keyword example above.

## Task results and join errors

The current implementation exposes two different completion paths:

| Value being awaited | Completion value |
|---|---|
| A handle inferred from the `spawn` keyword | The task body's result `T` on the current keyword path. If the body returns `Result<T, E>`, that is the result you receive. |
| The library `core.async.task.JoinHandle<T>` through its declared `Future` implementation | `Result<T, JoinError>`. If `T` is already `Result<Value, WorkError>`, completion has two `Result` layers. |

For the library contract, `Ok(Ok(value))` is application success,
`Ok(Err(error))` is application refusal, and `Err(JoinError.Cancelled)`
or `Err(JoinError.Panicked)` is a join failure. The two `JoinError`
variants have no payload. Its cancellation method is `cancel()`.

**Known limitation:** the keyword task representation and the library
record are not interchangeable. Explicit annotations, record fields and
imported generic wrappers can select a different checking or await path.
Do not add a library handle annotation to a keyword task to obtain
cancellation or an extra error layer. In particular, a keyword task
failure is not established to arrive as `JoinError` simply because that
variant is declared in the library. The distinction is visible in the
[checker await rules](https://github.com/verum-lang/verum/blob/main/crates/verum_types/src/infer/expr.rs),
[await lowering](https://github.com/verum-lang/verum/blob/main/crates/verum_vbc/src/codegen/expressions.rs)
and [library task implementation](https://github.com/verum-lang/verum/blob/main/core/async/task.vr).

When collecting task results, consume each handle once. If your operation
must finish every child before committing data, retain failures while
joining the remaining children, then decide whether to commit. Returning
on the first application error does not establish that siblings have
finished. Success-only examples do not establish panic or cancellation
cleanup; validate those paths in the execution mode you deploy.

## Timeouts and cancellation

Arguments are evaluated before a function receives them. Passing an
eager async call to `timeout`, `join` or another future combinator does
not make that call lazy. Use an explicit future or the API's documented
deferred-operation form when the boundary must surround the operation.
Even a deferred blocking call needs an interruption mechanism or
cooperative polling for a timeout to stop its work.

An `.await` is not a universal cancellation check. Cancellation and
cleanup depend on the operation, executor and backend. Keep blocking
work out of a critical section, and avoid holding a lock while waiting
for unrelated I/O. See the
[cancellation APIs](/docs/stdlib/async#cancellation) and
[guard lifetime limitations](/docs/language/async-concurrency#mutex--rwlock).

## Discarded results

Discarding an eager async call's result still runs its body. Discarding an
explicit future does not drive its `poll` implementation, and discarding
a task handle does not establish that its child finished. Handle the
application result and retain the relevant future or task handle until
your operation's completion requirements are met.

## See also

- [Async and Concurrency](/docs/language/async-concurrency) — syntax and execution boundaries.
- [`core.async`](/docs/stdlib/async) — API signatures and backend limitations.
- [Nursery](/docs/cookbook/nursery) — task scopes.
- [Channels](/docs/cookbook/channels) — communication between tasks.
- [Generators](/docs/cookbook/generators) — `fn*` and `async fn*`.
