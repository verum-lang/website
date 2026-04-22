---
title: Sharing state across tasks
description: Mutex, RwLock, actors, channels — pick the right one.
---

# Sharing state across tasks

You have one logical piece of state; several tasks need to read/write
it. Which primitive fits?

## The decision matrix

| State | Contention | Use |
|---|---|---|
| Read-only, frozen at start | — | `Shared<T>` (no lock) |
| Read-mostly, rare writes | Low | `Shared<RwLock<T>>` |
| Read-write, simple CAS | — | `AtomicU64` / `AtomicBool` / `AtomicPtr<T>` |
| Read-write, short critical sections | Low–medium | `Shared<Mutex<T>>` |
| Read-write, long critical sections | Any | Actor via `channel` |
| Append-only log | High | `channel` (MPMC if many readers) |
| Multi-writer accumulator | High | Atomic + fan-in |

---

## `Shared<T>` — frozen at start

```verum
let cfg = Shared.new(load_config()?);
for _ in 0..num_workers {
    let c = cfg.clone();
    spawn async move {
        use_config(&c);          // immutable; no lock
    };
}
```

Cheapest option. Use whenever the data never changes after creation.

---

## `Shared<Mutex<T>>` — short critical sections

```verum
let state = Shared.new(Mutex.new(Counter { value: 0 }));

let c = state.clone();
spawn async move {
    for _ in 0..1000 {
        let mut g = c.lock().await;
        g.value += 1;
    }
};
```

**Rule**: critical sections should not contain `.await` on unrelated
futures. If they must, consider an actor.

---

## `Shared<RwLock<T>>` — read-mostly

```verum
let cache = Shared.new(RwLock.new(Map::<Text, Value>.new()));

async fn get_or_compute(cache: &Shared<RwLock<Map<Text, Value>>>, key: &Text) -> Value {
    // Fast path: reader lock
    {
        let r = cache.read().await;
        if let Maybe.Some(v) = r.get(key) { return v.clone(); }
    }
    // Slow path: writer lock
    let v = compute_slow(key).await;
    let mut w = cache.write().await;
    w.insert(key.clone(), v.clone());
    v
}
```

Multiple concurrent readers; exactly one writer. Watch for writer
starvation on very read-heavy workloads.

---

## Atomics — lock-free counters / flags

```verum
let counter = Shared.new(AtomicU64.new(0));
let stopped = Shared.new(AtomicBool.new(false));

spawn async move {
    while !stopped.load(MemoryOrdering.Acquire) {
        counter.fetch_add(1, MemoryOrdering.Relaxed);
        sleep(10.ms()).await;
    }
};
```

`MemoryOrdering::Relaxed` for counters without inter-thread ordering
constraints; `Acquire`/`Release` for handshakes. When in doubt, use
`SeqCst` — it's correct; only weaken after profiling.

---

## Actor — long critical sections

Instead of locking, give the state to a dedicated task and
communicate via channel:

```verum
type Req is
    | Get { key: Text, reply: OneshotSender<Maybe<Value>> }
    | Put { key: Text, value: Value }
    | Shutdown;

async fn actor_loop(mut rx: Receiver<Req>) {
    let mut store: Map<Text, Value> = Map.new();
    while let Maybe.Some(req) = rx.recv().await {
        match req {
            Req.Get { key, reply } => {
                let _ = reply.send(store.get(&key).cloned());
            }
            Req.Put { key, value } => {
                store.insert(key, value);
            }
            Req.Shutdown => break,
        }
    }
}

// Client
fn make_actor() -> (ActorHandle, JoinHandle<()>) {
    let (tx, rx) = channel::<Req>(128);
    let h = spawn actor_loop(rx);
    (ActorHandle { tx }, h)
}

type ActorHandle is { tx: Sender<Req> };

implement ActorHandle {
    async fn get(&self, key: &Text) -> Maybe<Value> {
        let (reply, wait) = oneshot::<Maybe<Value>>();
        self.tx.send(Req.Get { key: key.to_string(), reply }).await.unwrap();
        wait.await.unwrap()
    }
    async fn put(&self, key: Text, value: Value) {
        self.tx.send(Req.Put { key, value }).await.unwrap();
    }
}
```

Benefits:

- No lock contention — requests queue.
- Arbitrary async inside the actor (DB calls, etc.).
- State mutations linearise on the actor.
- Easy to swap implementations for tests.

Trade-off: one round-trip latency per operation.

---

## Pitfall — `await` inside a mutex

```verum
// DO NOT
let mut guard = mu.lock().await;
let response = Http.get(url).await?;     // serialises all callers!
guard.commit(response);
```

Get what you need, drop the guard, then `await`:

```verum
let req = {
    let g = mu.lock().await;
    g.build_request()
};
let response = Http.get(req.url).await?;
{
    let mut g = mu.lock().await;
    g.commit(response);
}
```

---

## Pitfall — deadlock from lock ordering

Two locks + two tasks + opposite acquisition order = deadlock. Mitigate:

- Define a **canonical lock order** (document it!). All tasks acquire
  in the same order.
- Prefer **one lock** (or actor) over many.
- Use `try_lock` with retries if you must acquire multiple.

---

## See also

- **[sync](/docs/stdlib/sync)** — atomics, mutex, rwlock, condvar.
- **[async → channels](/docs/stdlib/async#channels)** — the actor's
  communication primitive.
- **[Performance](/docs/guides/performance)** — when locking becomes
  the bottleneck.
