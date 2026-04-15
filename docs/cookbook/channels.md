---
title: Channels (MPSC, broadcast, one-shot)
description: Message-passing between tasks — with backpressure.
---

# Channels

### MPSC (multi-producer, single-consumer)

```verum
let (tx, mut rx) = channel::<Event>(capacity: 100);     // bounded

// Producers (any number of clones of tx)
spawn async move {
    for i in 0..10 {
        tx.send(Event::Tick(i)).await.unwrap();         // suspends if full
    }
};

// Consumer (single rx)
async fn consume(mut rx: Receiver<Event>) {
    while let Maybe.Some(e) = rx.recv().await {
        handle(e);
    }
}
```

Drop all senders → `rx.recv()` returns `Maybe.None`.

### Unbounded

```verum
let (tx, rx) = unbounded_channel::<Event>();     // no backpressure
```

Use bounded wherever producer rate can outpace consumer rate; unbounded
only when you know the queue depth is small by construction.

### One-shot — single-use

```verum
async fn with_reply<T>(req: Request) -> Result<T, Error>
    using [Worker]
{
    let (tx, rx) = oneshot::<Result<T, Error>>();
    Worker.enqueue(Job { req, reply: tx });
    rx.await.map_err(|_| Error::new("worker dropped"))?
}
```

One-shot = "I'll answer you exactly once." Used to carry a response
back from a worker task.

### Broadcast (MPMC — multi-producer, multi-consumer)

```verum
let (tx, rx_template) = broadcast_channel::<ConfigChange>(capacity: 64);

// Subscribe per-listener — each sees every message from that point on.
spawn async move {
    let mut rx = rx_template.subscribe();
    while let Result.Ok(change) = rx.recv().await {
        apply(change);
    }
};
spawn async move {
    let mut rx = rx_template.subscribe();
    while let Result.Ok(change) = rx.recv().await {
        audit(change);
    }
};

// Fan-in publisher
tx.send(ConfigChange::Reload).await.unwrap();
```

Slow subscribers that fall more than `capacity` messages behind receive
`Result.Err(RecvError::Lagged)` and then resume; drop the receiver if
you can't tolerate lag.

### `select` over multiple channels

```verum
async fn merge(mut a: Receiver<Msg>, mut b: Receiver<Msg>) using [IO] {
    loop {
        select {
            m = a.recv() => match m {
                Maybe.Some(msg) => handle_a(msg),
                Maybe.None     => break,
            },
            m = b.recv() => match m {
                Maybe.Some(msg) => handle_b(msg),
                Maybe.None     => break,
            },
            _ = sleep(5.seconds()) => { println(&"idle"); }
        }
    }
}
```

### Backpressure idiom — bounded work queue

```verum
async fn process<T, F>(items: List<T>, workers: Int, mut f: F)
    where F: FnMut(T) -> Future<Output=()>
{
    let (tx, rx) = channel::<T>(capacity: workers * 2);

    // Fan out
    let mut handles = list![];
    for _ in 0..workers {
        let rx = rx.clone();
        handles.push(spawn async move {
            while let Maybe.Some(item) = rx.recv().await {
                f(item).await;
            }
        });
    }

    // Feed
    for item in items {
        tx.send(item).await.unwrap();    // suspends if workers are behind
    }
    drop(tx);                             // signals end-of-stream

    // Drain
    for h in handles { h.await; }
}
```

### Pitfalls

- **Dropping the sender closes the channel**. If you `clone` it, drop
  every clone; otherwise receivers will block forever.
- **`recv` on a closed empty channel returns `None` immediately**. Use
  that signal to shut down workers cleanly.
- **Broadcast lag**: if your consumer can't keep up with `capacity`,
  it will drop messages. Either raise capacity or use an MPSC channel
  per consumer.
- **Don't use channels to share mutable state**. That's what `Mutex<T>`
  is for. Channels are for handing a value from one task to another.

### See also

- **[async → channels](/docs/stdlib/async#channels)**
- **[Nursery](/docs/cookbook/nursery)** — supervised fan-out with
  bounded-parallelism patterns.
