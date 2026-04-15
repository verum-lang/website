---
sidebar_position: 5
title: concurrency
description: π-calculus processes and session types — formal concurrency foundations.
---

# `core::concurrency` — Process algebra & session types

Formal models for concurrent computation: the **π-calculus** (for
process semantics) and **session types** (for structured protocol
descriptions). Used internally by the compiler for deadlock-freedom
analyses and by user code that reasons about protocols at the type
level.

| File | What's in it |
|---|---|
| `process.vr` | `Process` (π-calculus), `substitute` |
| `session.vr` | `Protocol` (session types), `dual`, `compatible` |

For runtime concurrency (threads, tasks, channels), see
[`async`](/docs/stdlib/async) and [`sync`](/docs/stdlib/sync).

---

## π-calculus — `process.vr`

### `Process` term algebra

```verum
type Process is
    | Zero                                                               // 0 — inert process
    | Par      { left: Heap<Process>, right: Heap<Process> }             // P | Q   — parallel
    | Restrict { name: Text, body: Heap<Process> }                       // (νx) P  — name restriction
    | Send     { channel: Text, message: Text, cont: Heap<Process> }     // x⟨y⟩. P — send on x, value y
    | Recv     { channel: Text, binder: Text, cont: Heap<Process> }      // x(z). P — receive on x, bind z
    | Replicate{ inner: Heap<Process> };                                 // !P      — infinite replication
```

### Smart constructors

```verum
proc_zero() -> Process
proc_par(p: Process, q: Process) -> Process
proc_restrict(name: Text, body: Process) -> Process
proc_send(channel: Text, message: Text, cont: Process) -> Process
proc_recv(channel: Text, binder: Text, cont: Process) -> Process
proc_replicate(inner: Process) -> Process
```

### Substitution

```verum
substitute(p: Process, from: Text, to: Text) -> Process   // capture-avoiding
```

### COMM rule

The characteristic π-calculus reduction:

```
x⟨y⟩. P  |  x(z). Q   →   P  |  Q[y/z]
```

Translates directly: `proc_par(proc_send("x", "y", P), proc_recv("x", "z", Q))`
reduces to `proc_par(P, substitute(Q, "z", "y"))` for matching channel names.

---

## Session types — `session.vr`

Describe communication protocols at the type level. A session type is
a "contract" a channel promises to follow.

### `Protocol`

```verum
type Protocol is
    | Send   { payload: Text, rest: Heap<Protocol> }       // !T. Rest — send T, then Rest
    | Recv   { payload: Text, rest: Heap<Protocol> }       // ?T. Rest — receive T, then Rest
    | Offer  { left: Heap<Protocol>, right: Heap<Protocol> }  // S₁ & S₂ — offer a choice
    | Select { left: Heap<Protocol>, right: Heap<Protocol> }  // S₁ ⊕ S₂ — make a choice
    | End;                                                  // end of protocol
```

### Smart constructors

```verum
send(payload: Text, rest: Protocol) -> Protocol
recv(payload: Text, rest: Protocol) -> Protocol
offer(left: Protocol, right: Protocol) -> Protocol
select(left: Protocol, right: Protocol) -> Protocol
end() -> Protocol
```

### Duality and compatibility

```verum
dual(p: Protocol) -> Protocol
    // send ↔ recv, offer ↔ select, end ↔ end
compatible(a: Protocol, b: Protocol) -> Bool
    // compatible iff b == dual(a)
protocols_equal(a: Protocol, b: Protocol) -> Bool
```

### Example — login-then-query protocol

```verum
// Client's view
let client = send("Credentials",
               offer(
                 recv("UserData", end()),         // success branch
                 recv("ErrorCode", end())));       // failure branch

// Server's view should be exactly dual(client):
let server = recv("Credentials",
               select(
                 send("UserData", end()),
                 send("ErrorCode", end())));

assert(compatible(client, server));
```

The compiler uses session types in the `verum_types::session_types`
module to typecheck channel usage in `async` code — detecting
deadlocks, forgotten handshakes, and protocol violations at compile
time.

---

## Cross-references

- **[async](/docs/stdlib/async)** — the runtime implementation of
  channels (`Sender`/`Receiver`).
- **[logic](/docs/stdlib/logic)** — linear logic, the metatheory that
  backs session types (session types are linear-logic propositions).
