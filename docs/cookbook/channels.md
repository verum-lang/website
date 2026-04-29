---
title: Channels (MPSC, broadcast, one-shot)
description: Message-passing between tasks — bounded, unbounded, broadcast, one-shot, and the patterns that go with each.
---

# Channels

A channel is a typed message queue between tasks. Verum ships four
flavours:

| Channel            | Senders | Receivers | Guarantees                                |
|--------------------|---------|-----------|-------------------------------------------|
| `channel<T>`       | many    | one       | FIFO, bounded, backpressure.              |
| `unbounded_channel<T>` | many | one       | FIFO, no backpressure — cap by convention. |
| `broadcast<T>`     | many    | many      | Every receiver gets every message; lag drops oldest. |
| `oneshot<T>`       | one     | one       | Single value; either delivered or dropped. |

## MPSC — the workhorse

```verum
let (tx, mut rx) = channel<Event>(capacity: 100);

// Producer:
spawn async move {
    for i in 0..10 {
        tx.send(Event.Tick(i)).await.unwrap();  // suspends if full
    }
};

// Consumer:
async fn consume(mut rx: Receiver<Event>) {
    while let Maybe.Some(e) = rx.recv().await {
        handle(e);
    }
}
```

Semantics:

- **`send`** suspends when the channel is full.
- **`recv`** suspends when the channel is empty.
- **`try_send`** returns `Err(TrySendError.Full(value))` rather than
  suspending.
- **`try_recv`** returns `Err(TryRecvError.Empty)` rather than
  suspending.
- **Dropping every sender** causes pending `recv` calls to return
  `Maybe.None`.
- **Dropping the receiver** causes pending `send` calls to return
  `Err(SendError.Closed(value))`.

### Bounded vs unbounded

Use bounded wherever a producer can outpace a consumer:

```verum
let (tx, rx) = channel<Event>(capacity: 100);       // bounded
let (tx, rx) = unbounded_channel<Event>();          // unbounded
```

Unbounded is only appropriate when queue depth is small by
construction (e.g. one signal per heartbeat). An unbounded channel
fed by a fast producer is an **out-of-memory bug** waiting for the
right load.

### Multiple producers

`tx.clone()` produces another sender; all senders feed the same
queue.

```verum
let (tx, mut rx) = channel<Event>(capacity: 100);

for worker_id in 0..N {
    let tx = tx.clone();
    spawn async move {
        let events = produce(worker_id).await;
        for ev in events {
            tx.send(ev).await.unwrap();
        }
    };
}
drop(tx);      // drop the original so N clones == all senders gone when done
```

Dropping every sender signals "no more data"; the consumer's
`rx.recv().await` returns `Maybe.None`.

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
let (tx, rx_template) = broadcast_channel<ConfigChange>(capacity: 64);

// Each subscriber sees every message sent from subscription forward.
spawn async move {
    let mut rx = rx_template.subscribe();
    while let Result.Ok(change) = rx.recv().await {
        apply_config(change);
    }
};

spawn async move {
    let mut rx = rx_template.subscribe();
    while let Result.Ok(change) = rx.recv().await {
        audit(change);
    }
};

// Publish to all subscribers:
tx.send(ConfigChange.Reload).await.unwrap();
```

Subscribers that fall more than `capacity` messages behind receive
`Result.Err(RecvError.Lagged(n))` and then resume from the newest
message. Strategies for handling lag:

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
            m = a.recv().await => match m {
                Maybe.Some(msg) => handle_a(msg),
                Maybe.None      => break,
            },
            m = b.recv().await => match m {
                Maybe.Some(msg) => handle_b(msg),
                Maybe.None      => break,
            },
            _ = sleep(5.seconds()).await => {
                print("idle");
            }
        }
    }
}
```

`select` polls each arm concurrently; the first to be ready wins.
See [language/async-concurrency](/docs/language/async-concurrency#select).

## Backpressure pattern — bounded work queue

```verum
async fn process<T>(items: List<T>,
                    workers: Int,
                    mut f: fn(T) -> Future<Output=()>)
{
    let (tx, rx) = channel<T>(capacity: workers * 2);

    nursery {
        // Workers
        for _ in 0..workers {
            let rx = rx.clone();
            spawn async move {
                while let Maybe.Some(item) = rx.recv().await {
                    f(item).await;
                }
            };
        }
        // Feeder
        for item in items {
            tx.send(item).await.unwrap();       // suspends when workers are behind
        }
        drop(tx);                               // close channel → workers exit
    }
}
```

The channel's capacity caps in-flight work. The feeder's `tx.send`
suspends when workers are slow, producing natural backpressure.

## Pub/sub — broadcast with topic filters

```verum
type TopicMsg = {
    topic: Text,
    body:  Bytes,
};

let (tx, rx_t) = broadcast_channel<TopicMsg>(capacity: 1024);

// Subscriber with filter:
spawn async move {
    let mut rx = rx_t.subscribe();
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
type Request = {
    body:  Bytes,
    reply: oneshot.Sender<Response>,
};

let (tx, mut rx) = channel<Request>(capacity: 100);

// Worker:
spawn async move {
    while let Maybe.Some(req) = rx.recv().await {
        let resp = process(req.body).await;
        let _ = req.reply.send(resp);          // send() returns the channel status
    }
};

// Caller:
async fn call(tx: &Sender<Request>, body: Bytes) -> Response {
    let (reply_tx, reply_rx) = oneshot<Response>();
    tx.send(Request { body, reply: reply_tx }).await.unwrap();
    reply_rx.await.unwrap()
}
```

Each request carries its own one-shot reply channel. Ergonomic;
scales to large in-flight parallelism.

## Pitfalls

### Dropping every sender without draining the receiver

```verum
let (tx, mut rx) = channel<T>(capacity: 10);
drop(tx);
// rx.recv().await returns Maybe.None immediately — not an error, just EOF
```

This is correct behaviour — it's how consumers detect "done".

### Holding the receiver while awaiting an unbounded consumer

A single `rx.recv()` blocks the consumer task. If that task is doing
slow work *per message*, producers pile up. Move the slow work into
a separate nursery-supervised task so `rx.recv()` stays responsive.

### Channels are not for shared mutable state

Don't put a `Shared<T>` in a channel as a handle to shared memory.
For shared state, use `Shared<Mutex<T>>` directly. Channels are for
**handing a value** from one task to another — ownership transfer,
not aliasing.

### Broadcast with a slow consumer

A broadcast channel's slowest subscriber caps the whole channel's
memory usage (up to `capacity`). Slow consumers get a `Lagged` error
and must reset. If you can't tolerate drops, give each consumer its
own MPSC channel.

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
