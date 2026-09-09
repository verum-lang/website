---
sidebar_position: 5
title: HTTP/3 server push (RFC 9114 §4.6 + §7.2.5)
description: PUSH_PROMISE emission, push_id lifecycle, MAX_PUSH_ID budget, and CANCEL_PUSH.
---

# HTTP/3 server push — RFC 9114 §4.6 + §7.2.5

Server push lets the origin pre-emptively send resources the client
will need before it asks. Unlike HTTP/2 push (which was retired in
practice) HTTP/3 push is well-scoped: clients explicitly opt in via
`MAX_PUSH_ID`, server announces with `PUSH_PROMISE`, server opens a
push uni-stream per resource.

## Lifecycle

```
Client                    Server
──────                    ──────
MAX_PUSH_ID(n) ────────►                          ← raises budget
                        ◄──── PUSH_PROMISE(id,H)   ← announce on request stream
                        ◄──── push stream id=1   ← open uni (type 0x01)
                              [push_id][HEADERS][DATA...]
[optionally]
CANCEL_PUSH(id) ───────►                          ← reject outstanding push
                        ◄──── CANCEL_PUSH(id)    ← server declines
```

## PushEmitter (RFC 9114 §4.6)

Server-side tracker for push budget + outstanding / cancelled pushes:

```verum
public type PushEmitter is {
    limit_inclusive:    UInt64,       // MAX_PUSH_ID, INCLUSIVE
    next_push_id:       UInt64,
    cancelled:          List<UInt64>,
    client_goneaway_at: Maybe<UInt64>,
};
```

Public API:

```verum
implement PushEmitter {
    public fn new() -> PushEmitter;
    public fn on_peer_max_push_id(&mut self, id: UInt64);
    public fn on_peer_cancel_push(&mut self, id: UInt64);
    public fn on_peer_goaway(&mut self, cap: UInt64);

    public fn allocate(&mut self) -> Result<UInt64, PushError>;
    public fn mark_completed(&mut self, id: UInt64);
}

public type PushError is
    | BudgetExhausted { requested: UInt64, limit: UInt64 }
    | AlreadyCancelled(UInt64)
    | ClientGoneAway;
```

Rules:

- The budget is `limit_inclusive`, so `allocate` fails with
  `BudgetExhausted { requested, limit }` when `next_push_id >
  limit_inclusive` — the id EQUAL to the limit is still usable, which is
  the off-by-one RFC 9114 puts in the frame's name.
- The error arms carry their subject: `BudgetExhausted` reports both
  numbers and `AlreadyCancelled` names the id, so a caller logs the
  failure without re-reading the emitter.
- There is no `outstanding` set. The emitter tracks the next id, the
  cancelled ids and the GOAWAY watermark; a completed push leaves no
  entry behind.
- Client `MAX_PUSH_ID(n)` MUST be non-decreasing; emitter clamps
  incoming updates to their max.
- Client `CANCEL_PUSH(id)` moves `id` to `cancelled`; any subsequent
  data for that push is dropped.
- Inbound `GOAWAY(cap)` — server stops allocating push_ids above `cap`.

## PUSH_PROMISE frame (§7.2.5)

```
PUSH_PROMISE Frame {
    Type (i) = 0x05,
    Length (i),
    Push ID (i),
    Encoded Field Section (..)   ← QPACK field section
}
```

Emitted on the *request stream* (not the push stream). The
`Push ID` identifies which subsequent push uni-stream carries the
response. `Encoded Field Section` is the QPACK wire for the
*request* headers the server is simulating.

## Push uni-stream body (§4.6)

```
[varint 0x01]                   ← stream type = Push Stream
[varint push_id]                ← matches the PUSH_PROMISE
[HEADERS frame]                 ← response status + response headers
[DATA frame × N]                ← response body
[optional TRAILERS]
```

## MAX_PUSH_ID frame (§7.2.7)

```
MAX_PUSH_ID Frame {
    Type (i) = 0x0D,
    Length (i),
    Max Push ID (i),
}
```

Client uses this to raise the ceiling. The server MUST NOT emit
`PUSH_PROMISE` with `push_id ≥ max_push_id`.

## CANCEL_PUSH frame (§7.2.3)

```
CANCEL_PUSH Frame {
    Type (i) = 0x03,
    Length (i),
    Push ID (i),
}
```

Either peer may send: client to reject an outstanding promise; server
to retract one before it opens the push stream. If the server already
opened the stream, it resets with `H3_REQUEST_CANCELLED`.

## Configuration

Clients opt out of push entirely by never sending `MAX_PUSH_ID` —
default `max_push_id = 0` means "no pushes allowed". Servers check
the budget before each `allocate` and simply skip the push if denied.

## References

- `core/net/h3/push.vr`
- `vcs/specs/L2-standard/net/h3/push_emitter_typecheck.vr`
- `core/net/h3/frame.vr` — PUSH_PROMISE / CANCEL_PUSH / MAX_PUSH_ID
  encoders
- `vcs/specs/L2-standard/net/h3/frame_encode_kat.vr` — PUSH_PROMISE
  + CANCEL_PUSH + MAX_PUSH_ID byte-exact
