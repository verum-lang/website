---
sidebar_position: 3
title: "Boundary — typed cross-cog traffic"
description: "The Boundary primitive: every message that crosses a cog edge passes through a typed discipline of message kinds, invariants, wire encoding, and physical layer."
slug: /architecture-types/primitives/boundary
---

# Boundary — typed cross-cog traffic

A **boundary** in ATS-V is the edge of a cog: the point at which
data crosses from inside the cog to outside (or vice versa). The
`Boundary` record describes *what* crosses the edge and *under
which discipline*. Where the [Capability primitive](./capability.md)
answers "what may this cog *do*?", the Boundary primitive answers
"what crosses the cog's *edges*, and how?"

Boundaries are typed, checked at compile time, and load-bearing
in the [`AP-002 BoundaryViolation`](../anti-patterns/classical.md#ap-002)
anti-pattern. Every public function that accepts arguments from
outside the cog or returns values to the outside passes through
the Boundary check.

## 1. The Boundary record

```verum
public type Boundary is {
    messages_in:        List<MessageType>,
    messages_out:       List<MessageType>,
    capability_handoff: List<Capability>,
    invariants:         List<BoundaryInvariant>,
    wire_encoding:      WireEncoding,
    physical_layer:     BoundaryPhysicalLayer,
};
```

Six fields, each carrying a different facet of the cross-edge
discipline.

## 2. `MessageType` — what kinds of message cross

```verum
public type MessageType is
    | TypedMessage(name: Text, schema: Text)
    | CapabilityTransfer(cap: Text)
    | ControlFrame(name: Text)
    | RawMessage;
```

Four kinds:

- **TypedMessage(name, schema)** — a value with a stable
  schema (e.g., `("UserCreated", "user_v3.proto")`). The most
  common case for application messages.
- **CapabilityTransfer(cap)** — a capability being handed across
  the boundary. Capabilities crossing a boundary are tracked
  separately from data; an audit chronicle of capability
  transfers is enumerable via `verum audit --arch-discharges`.
- **ControlFrame(name)** — protocol-level frames (handshake,
  acknowledgement, heartbeat) that carry no payload but
  participate in the protocol.
- **RawMessage** — opaque bytes; used for foreign protocols
  whose schema is unknown to the verifier.

A Boundary that lists `RawMessage` in its `messages_in` is
saying "I accept opaque bytes" and forfeits stricter checking of
those messages.

## 3. `BoundaryInvariant` — what must hold across the edge

```verum
public type BoundaryInvariant is
    | AllOrNothing
    | DeterministicSerialisation
    | AuthenticatedFirst
    | BackpressureHonoured
    | CustomInvariant(Text);
```

Five canonical invariants:

- **AllOrNothing** — atomic: either the entire message crosses
  the edge or none of it does. The compiler rejects partial
  reads of inbound messages and partial writes of outbound
  messages.
- **DeterministicSerialisation** — the same value serialises to
  the same bytes every time. The compiler rejects non-canonical
  encodings (e.g., HashMap iteration order in a serialised
  payload).
- **AuthenticatedFirst** — the first byte to be processed must
  participate in authentication. A function body that reads
  payload bytes before completing the authentication handshake
  triggers `AP-002 BoundaryViolation`.
- **BackpressureHonoured** — the function respects flow-control
  signals; a body that writes outbound without checking the
  receiver's back-pressure flag triggers `AP-002`.
- **CustomInvariant(name)** — project-specific invariant; the
  invariant's discharge is the project's responsibility.

## 4. `WireEncoding` — how bytes are laid out

```verum
public type WireEncoding is
    | VerumNative
    | ProtoBuf(Text)
    | JsonEncoding(Text)
    | MsgPack
    | RawBytes;
```

Five encodings:

- **VerumNative** — Verum's canonical binary encoding. The
  default for intra-Verum traffic.
- **ProtoBuf(schema)** — Google Protocol Buffers with the named
  schema. The verifier reads the schema and confirms the cog's
  message types are consistent with the schema.
- **JsonEncoding(schema)** — JSON with a JSON-Schema or
  TypeScript declaration. Same schema verification as ProtoBuf.
- **MsgPack** — MessagePack canonical encoding.
- **RawBytes** — opaque bytes; the verifier does not check
  schema consistency.

The wire encoding affects which `BoundaryInvariant`s are
admissible. `VerumNative` encoding satisfies
`DeterministicSerialisation` by construction; `JsonEncoding`
does not (object key order is implementation-defined) without
an explicit canonicalisation step.

## 5. `BoundaryPhysicalLayer` — where the boundary lives

```verum
public type BoundaryPhysicalLayer is
    | Intracrate
    | Intracess
    | Ipc
    | NetworkLayer;
```

Four physical layers:

- **Intracrate** — the boundary is inside a single Verum compilation
  unit. Crossing the boundary is a function call.
- **Intracess** — the boundary is inside a single OS process,
  potentially across threads. Crossing the boundary may
  involve a channel operation.
- **Ipc** — the boundary spans two OS processes on the same host.
  Crossing involves Unix domain sockets, shared memory, or
  similar.
- **NetworkLayer** — the boundary spans hosts. Crossing
  involves a TCP / UDP / Unix-socket / TLS / QUIC / HTTP / gRPC
  call.

The physical layer constrains which `WireEncoding`s and
`BoundaryInvariant`s are sensible. `Intracrate` boundaries
typically use `VerumNative` and `AllOrNothing`; `NetworkLayer`
boundaries typically use a serialisation format and explicit
back-pressure.

## 6. The `Shape.preserves` field

A cog's `@arch_module(...)` annotation does not declare a full
`Boundary` record explicitly. Instead, it declares the
*invariants* the cog's public surface preserves:

```verum
@arch_module(
    preserves: [
        BoundaryInvariant.AllOrNothing,
        BoundaryInvariant.AuthenticatedFirst,
        BoundaryInvariant.BackpressureHonoured,
    ],
)
module my_app.api.handler;
```

The compiler synthesises the full `Boundary` from the cog's
public function signatures (message types), the project-wide wire
encoding configuration, and the cog's physical layer. The
`preserves` field is the *checkable claim* — the invariants the
public functions are asserted to honour.

## 7. The boundary check in action

A worked example with diagnostics. The cog declares
`AuthenticatedFirst`:

```verum
@arch_module(preserves: [BoundaryInvariant.AuthenticatedFirst])
module my_app.api.handler;

public fn handle_request(req: &Request) -> Response {
    log.info(f"received: {req.body}");           // <-- reads body
    let auth = req.headers.get("Authorization");
    if !validate_auth(auth) {                    // <-- auth check AFTER read
        return Response.unauthorised();
    }
    process(req)
}
```

The compiler walks the body in order:

1. `log.info(f"received: {req.body}")` — reads `req.body`. The
   compiler tracks this as the first observation of inbound
   message content.
2. `validate_auth(auth)` — would be the authenticator. But the
   compiler has already recorded a content read at step 1.

Diagnostic:

```text
error[ATS-V-AP-002]: boundary violation
  --> src/handler.vr:8:5
   |
 8 |     log.info(f"received: {req.body}");
   |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ first byte of inbound
   |                                     message is consumed
   |                                     BEFORE validate_auth.
   |
note: cog declares preserves [AuthenticatedFirst, ...]
help: move authentication BEFORE any access to req.body.
```

Fixed code:

```verum
public fn handle_request(req: &Request) -> Response {
    let auth = req.headers.get("Authorization");
    if !validate_auth(auth) {
        return Response.unauthorised();
    }
    log.info(f"received: {req.body}");           // ← now after auth
    process(req)
}
```

The boundary check walks function bodies in source order; the
diagnostic locates the *first* operation that violates the
invariant, which is typically the easiest to fix.

## 8. Capability transfer across the boundary

A capability is allowed to cross a boundary explicitly via the
`capability_handoff` slot. The slot makes the transfer a typed
event:

```verum
@arch_module(
    preserves: [BoundaryInvariant.AllOrNothing],
    // implicit: capability_handoff lists every Capability
    // appearing in public function signatures as MessageType.CapabilityTransfer
)
module my_app.session_factory;

public fn create_session(...) -> SessionToken {
    SessionToken { capability: Capability.Read(ResourceTag.Database("user_data")) }
}
```

The compiler reads the function's return type, finds a
`Capability` value, and adds the corresponding
`CapabilityTransfer` to the cog's effective `messages_out`.
The audit chronicle records every capability handoff.

[`AP-022 CapabilityLaundering`](../anti-patterns/articulation.md#ap-022)
fires when a capability is *erased* by transit through an
unmarked boundary — the cog's `messages_out` does not list
the corresponding `CapabilityTransfer`, but the body returns
a Capability value. The compiler detects the omission.

## 9. Cross-format boundaries — the bridge attribute

When two cogs use different `WireEncoding`s, composing them
requires an explicit bridge:

```verum
@arch_module(wire_encoding: WireEncoding.VerumNative)
module my_app.internal;

@arch_module(wire_encoding: WireEncoding.ProtoBuf("api_v1.proto"))
module my_app.external;

@bridge_encoding(from: WireEncoding.VerumNative,
                 to:   WireEncoding.ProtoBuf("api_v1.proto"))
public fn translate(internal: InternalMsg) -> ExternalMsg
```

The bridge function is itself an architectural artefact and is
audited as a citation in the `--framework-axioms` inventory.

## 10. The boundary's `[I]` rendering

Like every other primitive, Boundary surfaces in the audit
chronicle. A cog's Boundary is rendered as:

```json
{
  "cog": "my_app.api.handler",
  "boundary": {
    "messages_in":  ["TypedMessage(\"Request\", \"http_v1.proto\")"],
    "messages_out": ["TypedMessage(\"Response\", \"http_v1.proto\")"],
    "capability_handoff": [],
    "invariants": ["AllOrNothing", "AuthenticatedFirst"],
    "wire_encoding": "ProtoBuf(\"http_v1.proto\")",
    "physical_layer": "NetworkLayer"
  }
}
```

This is the architectural type of the cog's edge, made
machine-readable.

## 11. Cross-references

- [Capability primitive](./capability.md) — what flows *through*
  the boundary's `capability_handoff` slot.
- [Composition primitive](./composition.md) — how boundaries
  compose across cogs.
- [Shape](./shape.md) — the aggregate carrier.
- [Anti-pattern AP-002 BoundaryViolation](../anti-patterns/classical.md#ap-002).
- [Anti-pattern AP-022 CapabilityLaundering](../anti-patterns/articulation.md#ap-022).
- [Three orthogonal axes](../orthogonality.md) — boundary vs
  property vs context.
