---
title: Channels (MPSC, broadcast, one-shot)
description: Message-passing between tasks — bounded, unbounded, broadcast, one-shot, and the patterns that go with each.
---

# Channels

A channel is a typed message queue between tasks. Verum ships four
flavours:

| Constructor                 | Senders | Receivers | Guarantees                                |
|-----------------------------|---------|-----------|-------------------------------------------|
| `bounded<T>(n)`             | many    | one       | FIFO, bounded at `n`, backpressure.       |
| `channel<T>()`              | many    | one       | FIFO, unbounded — no backpressure.        |
| `broadcast_channel<T>(n)`   | many    | many      | Every receiver gets every message; lag drops oldest. |
| `oneshot<T>()`              | one     | one       | Single value; either delivered or dropped. |

`bounded_channel<T>(n)` and `unbounded_channel<T>()` are aliases of the
first two rows — the same pair of functions under the names a reader
coming from another language expects. Every one of them takes its
capacity POSITIONALLY: a call argument in Verum is an expression, never
`name: value`.

## MPSC — the workhorse

```verum
let (tx, mut rx) = bounded<Event>(100);

// Producer — the blocking form, from an ordinary function:
for i in 0..10 {
    tx.send(Event.Tick(i)).unwrap();     // blocks while full
}

// Consumer — the async form, from an async function:
async fn consume(mut rx: Receiver<Event>) {
    while let Maybe.Some(e) = rx.recv_fut().await {
        handle(e);
    }
}
```

Each direction has a blocking form and a suspending one, and they are
DIFFERENT METHODS — nothing is implicitly async:

| Want                        | Sender                  | Receiver           |
|-----------------------------|-------------------------|--------------------|
| block the thread            | `send(v)`               | `recv()`           |
| suspend the task            | `send_async(v).await`   | `recv_fut().await` |
| never wait                  | `try_send(v)`           | `try_recv()`       |
| block with a deadline       | `send_timeout(v, d)`    | —                  |

- **`send`** returns `Result<(), SendError<T>>`; on a bounded channel
  that is full it parks on a futex until a receiver pops.
- **`send_async`** returns a `SendFut<T>` whose output is that same
  `Result` — on full it yields `Pending` and registers the waker.
- **`try_send`** returns `Result.Err(TrySendError.Full(value))` rather
  than waiting, handing the value back so nothing is lost.
- **`recv`** returns `Maybe<T>`; **`try_recv`** returns
  `Result<T, TryRecvError>` and answers `TryRecvError.Empty`
  immediately.
- **Closing the channel** makes pending `recv` calls return
  `Maybe.None` and `send` return `Result.Err(SendError(value))` — the
  error carries the value back.

### Bounded vs unbounded

Use bounded wherever a producer can outpace a consumer:

```verum
let (tx, rx) = bounded<Event>(100);                 // bounded
let (tx, rx) = channel<Event>();                    // unbounded
```

Unbounded is only appropriate when queue depth is small by
construction (e.g. one signal per heartbeat). An unbounded channel
fed by a fast producer is an **out-of-memory bug** waiting for the
right load.

### Multiple producers

`tx.clone()` produces another sender; all senders feed the same
queue.

```verum
let (tx, mut rx) = bounded<Event>(100);

for worker_id in 0..N {
    let tx = tx.clone();
    spawn async move {
        let events = produce(worker_id).await;
        for ev in events {
            tx.send_async(ev).await.unwrap();
        }
    };
}
drop(tx);      // drop the original so N clones == all senders gone when done
```

`Sender<T>` implements `Drop` and `clone` bumps the same counter, so
dropping the last sender is what signals "no more data": the
consumer's `recv` answers `Maybe.None` once the queue is drained.

## One-shot — single-use reply channel

```verum
async fn with_reply<T>(req: Request) -> Result<T, Error>
    using [Worker]
{
    let (tx, rx) = oneshot<Result<T, Error>>();
    Worker.enqueue(Job { req, reply: tx });
    rx.await.map_err(|_| Error.new("worker dropped"))?
}
```

Use when the receiver expects **exactly one** response to a request.
A `oneshot` channel is cheaper than an `MPSC` of capacity 1.

## Broadcast — fan-out

```verum
let (tx, rx_first) = broadcast_channel<ConfigChange>(64);

// `subscribe()` lives on the SENDER, and hands out one more receiver.
// The pair's own receiver is already subscribed.
let rx_audit = tx.subscribe();

spawn async move {
    let mut rx = rx_first;
    while let Result.Ok(change) = rx.recv().await {
        apply_config(change);
    }
};

spawn async move {
    let mut rx = rx_audit;
    while let Result.Ok(change) = rx.recv().await {
        audit(change);
    }
};

// Publish to all subscribers. `send` here is NOT a future: it returns
// `Result<Int, BroadcastSendError<T>>`, and the `Int` is how many
// receivers the message reached.
let reached = tx.send(ConfigChange.Reload).unwrap();
```

Subscribers that fall more than `capacity` messages behind receive
`Result.Err(BroadcastRecvError.Lagged(n))` — a different error type
from the MPSC side, with just two variants, `Closed` and `Lagged(Int)`
— and then resume from the oldest message still held. Strategies for
handling lag:

- **Tolerate**: read it, skip, keep going.
- **Bail**: break the loop — upstream expected you to keep up.
- **Slow the producer**: use a separate rate limiter that observes
  subscriber progress.

## `select` over multiple channels

```verum
async fn merge(mut a: Receiver<Msg>, mut b: Receiver<Msg>)
   
{
    loop {
        select {
            m = a.recv_fut().await => match m {
                Maybe.Some(msg) => handle_a(msg),
                Maybe.None      => break,
            },
            m = b.recv_fut().await => match m {
                Maybe.Some(msg) => handle_b(msg),
                Maybe.None      => break,
            },
            _ = sleep(5.secs()).await => {
                print("idle");
            }
        }
    }
}
```

`select` polls each arm concurrently; the first to be ready wins.
See [language/async-concurrency](/docs/language/async-concurrency#select).

## Backpressure pattern — bounded work queue

An MPSC channel has **one** receiver — `Receiver<T>` is not cloneable,
and the declaration says so in place. A worker POOL therefore gets one
channel each, and the feeder round-robins; the backpressure is the same,
because a full worker queue suspends the feeder just as a shared one
would.

```verum
async fn process<T>(items: List<T>,
                    workers: Int,
                    f: fn(T) -> Future<Output = ()>)
{
    let mut senders: List<Sender<T>> = List.new();

    nursery {
        // One bounded queue per worker.
        for _ in 0..workers {
            let (tx, mut rx) = bounded<T>(2);
            senders.push(tx);
            spawn async move {
                while let Maybe.Some(item) = rx.recv_fut().await {
                    f(item).await;
                }
            };
        }

        // Feeder — suspends on whichever worker is behind.
        let mut i = 0;
        for item in items {
            senders[i % workers].send_async(item).await.unwrap();
            i = i + 1;
        }

        // Last sender gone → every worker's loop ends.
        senders.clear();
    }
}
```

Each queue's capacity caps the work outstanding at that worker, and
`send_async` suspends when the chosen worker is slow — natural
backpressure. Using one SHARED queue instead would need a receiver that
several tasks can read, which this channel deliberately does not
provide; see the `select` recipe above for the shape that merges
several channels into one consumer.

## Pub/sub — broadcast with topic filters

```verum
type TopicMsg is {
    topic: Text,
    body:  List<Byte>,
};

let (tx, _rx) = broadcast_channel<TopicMsg>(1024);

// Subscriber with filter — one receiver per subscriber, from the sender:
let mut rx = tx.subscribe();
spawn async move {
    while let Result.Ok(msg) = rx.recv().await {
        if msg.topic.starts_with("alerts.") {
            handle_alert(msg);
        }
    }
};
```

For complex filtering at volume, consider a true pub-sub system;
Verum's broadcast is for light fan-out within a process.

## Channel of channels — request/reply

```verum
type Request is {
    body:  List<Byte>,
    reply: OneshotSender<Response>,
};

let (tx, mut rx) = bounded<Request>(100);

// Worker:
spawn async move {
    while let Maybe.Some(req) = rx.recv_fut().await {
        let resp = process(req.body).await;
        // `OneshotSender.send` consumes the sender and hands the value
        // back in `Result.Err` if nobody is listening any more.
        let _ = req.reply.send(resp);
    }
};

// Caller:
async fn call(tx: &Sender<Request>, body: List<Byte>) -> Response {
    let (reply_tx, reply_rx) = oneshot<Response>();
    tx.send_async(Request { body, reply: reply_tx }).await.unwrap();
    reply_rx.await.unwrap()
}
```

Each request carries its own one-shot reply channel. Ergonomic;
scales to large available parallelism.

## Pitfalls

### Dropping every sender without draining the receiver

```verum
let (tx, mut rx) = bounded<T>(10);
drop(tx);
// rx.recv() answers Maybe.None once drained — not an error, just EOF
```

This is correct behaviour — it's how consumers detect "done". Note the
order: the backlog is not discarded, so a consumer still reads
everything already queued before it sees `Maybe.None`. `rx.close()` is
the other end of the same switch, for when the CONSUMER is the one that
is finished.

### Holding the receiver while doing slow work per message

`recv()` blocks the whole thread and `recv_fut().await` parks the task;
either way the consumer is not reading while it works. If that work is
slow *per message*, producers pile up against the capacity. Move it
into a separate nursery-supervised task so the receive loop stays
responsive.

### Channels are not for shared mutable state

Don't put a `Shared<T>` in a channel as a handle to shared memory.
For shared state, use `Shared<Mutex<T>>` directly. Channels are for
**handing a value** from one task to another — ownership transfer,
not aliasing.

### Broadcast with a slow consumer

A broadcast channel's slowest subscriber caps the whole channel's
memory usage (up to `capacity`). Slow consumers get
`BroadcastRecvError.Lagged(n)` — `n` is how many messages they missed —
and resume from the oldest message still held. If you can't tolerate
drops, give each consumer its own MPSC channel.

### Forgotten `drop(tx)` in workers

```verum
for _ in 0..4 {
    let tx = tx.clone();
    spawn async move {
        produce(tx).await;
        // missing: drop(tx);  — but this drops at task-exit anyway
    };
}
drop(tx);    // drop the main handle
```

Task-exit drops captured values; explicit `drop(tx)` at the feeder's
end is the canonical way to signal end-of-input to consumers.

## See also

- **[`stdlib/async`](/docs/stdlib/async)** — full channel API.
- **[Nursery](/docs/cookbook/nursery)** — supervised fan-out with
  bounded-parallelism patterns.
- **[Scheduler](/docs/cookbook/scheduler)** — priority-aware task
  dispatch.
- **[Resilience](/docs/cookbook/resilience)** — retry / circuit
  breakers layered on channel patterns.
- **[Async pipeline tutorial](/docs/tutorials/async-pipeline)** —
  production-shaped example using all four channel kinds.
