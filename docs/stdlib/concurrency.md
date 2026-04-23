---
sidebar_position: 5
title: concurrency
description: π-calculus processes and session types — formal concurrency foundations.
---

# `core.concurrency` — Process algebra & session types

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

## Why formal models live here

The π-calculus and session types are **semantic foundations**, not
runtime primitives. They are exposed as Verum data types so you
can:

- **Model** concurrent systems symbolically before implementing them.
- **Verify** that a concrete implementation refines its specification.
- **Translate** between systems that use different concurrency
  calculi (CSP ↔ π-calculus ↔ actors).
- **Prove properties** (deadlock-freedom, no channel-use-after-close,
  progress) using the term algebra and standard bisimulation tactics.

The compiler's own `verum_types::session_types` module uses this
data to **typecheck channel usage** in `async` code — deadlocks,
forgotten handshakes, and protocol violations are detected at
compile time where the programmer declares a channel's protocol.

## Common patterns

### A client-server protocol with recursion

```verum
// Echo server: receive Int, send Int back, loop.
fn echo_protocol() -> Protocol {
    let rec = Protocol.Recv { payload: "Int", rest: Heap.new(/* tail */) };
    // Without a real recursion primitive, represent the repeat count
    // as replication or as an unfolded finite prefix.
    recv("Int", send("Int", recv("Int", send("Int", end()))))
}
```

### Branching: "either succeed or fail"

```verum
// The client sends credentials, then the server offers:
//   - success: send userdata, end
//   - failure: send error code, end
let client = send("Credentials",
    offer(
        recv("UserData", end()),
        recv("ErrorCode", end()),
    ));
let server = dual(&client);
assert(compatible(&client, &server));
```

`offer` vs `select`:

- **`offer(a, b)`** — "the other party chooses; I handle whichever"
  (external choice).
- **`select(a, b)`** — "I choose; the other party handles whichever"
  (internal choice).

`dual` swaps `offer` ↔ `select` to match the directional flip.

### Linearity checking

Session types encode **linearity** — each channel handle may be used
exactly once before it's consumed. The checker ensures:

- No channel is used after `end`.
- No channel is left unused (except `End` protocols).
- No double-send or double-receive on a single handle.

## Interaction with the runtime

At runtime, session-typed code compiles to ordinary channel
operations — `send`, `recv`, pattern match on `Select`/`Offer`
tags. The session type is **erased**; what's left is a straightforward
typed channel protocol with zero overhead beyond an ordinary
(`Sender<T>`, `Receiver<T>`) pair.

See [`stdlib/async`](/docs/stdlib/async) for the runtime layer, and
[cookbook/channels](/docs/cookbook/channels) for everyday usage.

## Extended forms

### π-calculus reductions

The COMM rule is the only structural reduction; congruences extend
it:

```
P | 0 ≡ P                                (identity)
P | Q ≡ Q | P                            (commutativity)
(P | Q) | R ≡ P | (Q | R)                (associativity)
(νx)(P | Q) ≡ (νx)P | Q       if x ∉ fv(Q)   (scope extrusion)
(νx)(νy)P ≡ (νy)(νx)P                    (restriction commutes)
!P ≡ P | !P                              (replication unfolds)
```

These congruences are definitional — the module today ships the
term algebra plus capture-avoiding `substitute`, not a reducer or
congruence oracle. Callers who need one build it on top of
`substitute` + pattern matching on `Process`; a reference
implementation in ~50 LOC lives in
`vcs/specs/L3-extended/concurrency/pi_reducer.vr`.

### Multi-party session types

Single-party duality suffices for 2-party protocols; for N-party
protocols, use **global types** — these project into each role's
local type. Verum's current model supports only binary session
types; multi-party extensions are experimental (see
`vcs/specs/L3-extended/multi_party/`).

## Cross-references

- **[async](/docs/stdlib/async)** — the runtime implementation of
  channels (`Sender`/`Receiver`).
- **[sync](/docs/stdlib/sync)** — lower-level synchronisation
  primitives.
- **[logic](/docs/stdlib/logic)** — linear logic, the metatheory that
  backs session types (session types are linear-logic propositions
  under the Curry–Howard-style correspondence).
- **[control](/docs/stdlib/control)** — delimited continuations; can
  be used to encode session protocols.
- **[cookbook/channels](/docs/cookbook/channels)** — day-to-day
  channel usage.
- **[language/async-concurrency](/docs/language/async-concurrency)** —
  runtime surface.
