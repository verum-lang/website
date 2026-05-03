---
sidebar_position: 12
title: Deterministic Simulation Testing
description: TigerBeetle-class quality engineering. Seeded clock, RNG, simulated network with chaos injection, bit-exact replay from a single seed. Catches logic bugs that unit tests cannot.
---

# `core.net.weft.dst`

Deterministic Simulation Testing (DST) is the underrated quality
mechanism behind TigerBeetle's 1000-core VOPR running 2 simulated
millennia per day, FoundationDB's near-zero customer-escaped bug
count, and Antithesis's commercial deterministic hypervisor.

For a verifiable-by-construction framework like Weft, SMT catches
implementation bugs and DST catches logic bugs in the specification.

Source: `core/net/weft/dst.vr` (418 LOC).

## Why DST?

Unit tests prove the implementation matches the spec on the cases
the test author thought to write. They miss:

- Race conditions in the supervisor tree (OneForAll restarting
  children in the "wrong" order under simultaneous failure).
- Task leak when cancellation grace period elapses under chaos
  latency.
- OOM in the backpressure path when an upstream is very slow and
  arrival rate is very high.
- Inconsistency in connection-pool reuse under simultaneous timeout
  and close.

DST replaces three sources of non-determinism with seeded
alternatives:

1. **Time** — `TestClock` returns simulation time, not wall clock.
2. **Randomness** — `SeededRng` feeds every random consumer (LB
   jitter, backoff, sub-protocol choice, HPACK decisions).
3. **Network** — `SimNetwork` swaps `TcpStream` with a simulated
   pipe with injection knobs for latency, drop, reorder, partition.

Plus a `TaskSchedule` that forces every poll / yield event order to
match a seeded interleaving — two identical seeds reproduce the
exact same execution bit-for-bit.

## `TestClock` — seeded time

```verum
public type TestClock is { /* opaque */ };

implement TestClock {
    public fn seeded(seed: UInt64) -> TestClock
    public fn advance(&self, by: Duration)
    public fn now_ns(&self) -> Int
}
```

Inside a DST test, every `Instant.now()` call returns simulation
time. `TestClock.advance` moves the simulation forward, firing any
timers whose deadline lies within the advance window.

```verum
let clk = TestClock.seeded(0x1234abcd);
clk.advance(Duration.from_millis(250));
assert(clk.now_ns() == 250_000_000);
```

## `SeededRng` — deterministic randomness

```verum
public type SeededRng is { /* opaque */ };

implement SeededRng {
    public fn new(seed: UInt64) -> SeededRng
    public fn next_u64(&self) -> UInt64
    public fn next_u32(&self) -> UInt32
    public fn next_bounded(&self, max: Int) -> Int
    public fn flip(&self) -> Bool
}
```

Reproducibility guarantee: same seed yields the same byte stream
across runs, builds, and platforms. The simulator uses a single
RNG instance and threads it through every consumer, so the order
of random consumption is part of the deterministic schedule.

## `NetworkEvent` — chaos primitives

```verum
public type NetworkEvent is
    | LatencyMs(Int)
    | PacketLoss(Float)
    | Reorder(Float)
    | Partition { side_a: List<Endpoint>, side_b: List<Endpoint> };
```

Network events are streamed into the simulator. The simulator
applies them to available bytes in order, deterministically.

```verum
public type SimNetworkConfig is {
    base_latency_us: Int,
    jitter_us: Int,
    loss_rate: Float,
    reorder_rate: Float,
};

implement SimNetworkConfig {
    public fn chaos() -> SimNetworkConfig {
        SimNetworkConfig {
            base_latency_us: 5_000,
            jitter_us: 2_000,
            loss_rate: 0.05,
            reorder_rate: 0.02,
        }
    }
}

public type NetworkEventStream is { /* opaque */ };

implement NetworkEventStream {
    public fn new(rng: SeededRng, config: SimNetworkConfig) -> NetworkEventStream
    public fn next_event(&self) -> NetworkEvent
}
```

## Schedulers

`TaskSchedule` defines which task gets the next `poll` slot:

```verum
public type TaskSchedule is protocol {
    fn pick_next(&self, ready_count: Int) -> Int;
};

public type RoundRobinSchedule is { /* ... */ };
public type RandomSchedule is { rng: SeededRng };

implement RoundRobinSchedule {
    public fn new() -> RoundRobinSchedule
    public fn pick_next(&self, ready_count: Int) -> Int
}

implement RandomSchedule {
    public fn new(rng: SeededRng) -> RandomSchedule
    public fn pick_next(&self, ready_count: Int) -> Int
}
```

A test can pick the schedule (round-robin for fairness, random for
chaos) plus the seed to drive the entire interleaving.

## `WeftSimulator` — the entry point

```verum
public type SimConfig is {
    clock: TestClock,
    rng: SeededRng,
    scheduler: TaskSchedule,
    network: SimNetworkConfig,
};

implement SimConfig {
    public fn chaos_from_seed(seed: UInt64) -> SimConfig
}

public type WeftSimulator is { /* opaque */ };

implement WeftSimulator {
    public fn new(cfg: SimConfig) -> WeftSimulator
    public fn run<App>(app: App)                         // run the user app inside the sim
    public fn advance(&self, by: Duration)               // step simulation
    public fn check<F>(&self, predicate: F)              // record a property to check
    public fn invariants_ok(&self) -> Bool               // all checks held throughout
    public fn assert_invariant<F>(&self, predicate: F)   // single-shot assertion
}
```

## Property test pattern

```verum
@test(dst, seed = 0x1234abcd, iterations = 1_000_000)
async fn property_no_connection_leak(
    events: Gen<List<NetworkEvent>>,
    schedule: Gen<TaskSchedule>,
) {
    let sim = WeftSimulator.new(SimConfig {
        clock: TestClock.seeded(seed),
        rng: SeededRng.new(seed),
        scheduler: schedule,
        network: SimNetwork.with_events(events),
    });
    sim.run(my_server_app);
    sim.assert_invariant(|s| s.connections.all(|c| c.properly_closed()));
}
```

Each iteration:

1. Generates a fresh seed.
2. Generates an events list and schedule from the seed.
3. Boots the user's server app inside the simulator.
4. Drives the simulation to completion (drained queues, no pending
   timers, all spawned tasks complete).
5. Evaluates the invariant. Failure dumps the seed for replay.

## Property catalogue

The DST module pre-registers the framework's normative properties
by symbolic name so the CI farm can aggregate failure rates:

```verum
public const PROPERTY_NO_TASK_LEAK: Text = "no_task_leak";
public const PROPERTY_NO_MESSAGE_LOSS: Text = "no_message_loss";
public const PROPERTY_GRACEFUL_SHUTDOWN_ZERO_DROP: Text =
    "graceful_shutdown_zero_drop";
public const PROPERTY_SUPERVISOR_EVENTUALLY_RECOVERS: Text =
    "supervisor_eventually_recovers";
public const PROPERTY_BACKPRESSURE_NEVER_OOM: Text =
    "backpressure_never_OOM";
public const PROPERTY_CANCEL_REACHES_ALL_CHILDREN: Text =
    "cancel_signal_reaches_all_children_within_grace";
```

A new invariant joins the catalogue by adding it here — that's the
"registration" step.

## Replay from seed

When a property fails, the simulator dumps:

- the seed,
- the schedule trace,
- the network events stream,
- the final state snapshot.

A second invocation with the same seed reproduces the failure
bit-for-bit. The simulator includes a shrinking pass that
deterministically minimises the events list while preserving the
property violation.

## CI scale targets

The intended cadence:

| Pipeline | Iterations | Wall time | Cadence |
|---|---|---|---|
| Per-PR | 1 000 unique seeds per property | ~10 minutes | Every PR |
| Nightly | 1 000 000 seeds per property | ~6 hours on a 64-core farm | Nightly |
| Continuous | unbounded, distributed across a 1000-core farm | 24/7 background | Always-on |

Counterexamples are committed to a regression corpus so future builds
re-run the failure-prone seeds first.

## Differences from chaos engineering

| Aspect | Real chaos (e.g. Jepsen) | DST |
|---|---|---|
| Speed | Real wall clock | 1000x faster (no I/O) |
| Determinism | Non-deterministic, hard to replay | Bit-exact replay |
| Resource cost | Cluster of nodes | Single process |
| Scope | Distributed-system level | Single-process correctness |
| Best for | Operational behaviour, real-world latency | Logic invariants, race conditions |

Both are valuable. DST is upstream — it catches what unit tests miss
before any chaos run is wasted on it.

## Status

- **Implementation**: simulator primitives complete (TestClock,
  SeededRng, SimNetworkConfig, TaskSchedule, WeftSimulator).
- **Conformance**: `dst_basic` test passing.
- **Phase**: 6 closed for primitives; the 1000-core CI farm is a
  Phase 7 deployment goal.
- **Next**: per-property regression corpus auto-curation; shrinking
  pass for counterexample minimisation.

## Related documentation

- [Service / Layer / ServiceBuilder](./service)
- [Listener](./listener)
- [Backpressure](./backpressure)
