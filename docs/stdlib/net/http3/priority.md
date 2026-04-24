---
sidebar_position: 4
title: HTTP priority (RFC 9218)
description: Structured-header Priority value, PRIORITY_UPDATE frames, and scheduler integration.
---

# HTTP priority — RFC 9218

RFC 9218 defines a small, cross-version priority scheme that
supersedes the HTTP/2 stream-dependency tree. The same scheme applies
to HTTP/2 (RFC 9113 §5.3.2) and HTTP/3 (this module).

## Typed priority

```verum
public type H3Priority is {
    urgency:     UInt8,         ← 0..=7; 0 = highest priority
    incremental: Bool,          ← deliver progressively or contiguous
};
```

Defaults (§4.1):

- `urgency = 3` (DEFAULT_URGENCY)
- `incremental = false`
- `urgency` is clamped on construction to `[0, MAX_URGENCY=7]`.

## Priority header (§4)

Wire form is a Structured Field dictionary emitted in the request or
response headers:

```
priority: u=3, i
priority: u=0               ← highest urgency, non-incremental
priority: u=6, i=?0         ← explicit "not incremental"
```

Parser:

```verum
mount core.net.h3.priority.{H3Priority, parse_header, encode_header};

let p = parse_header(f"u=0, i").unwrap();
assert(p.urgency == 0);
assert(p.incremental == true);

let hdr_value = encode_header(&p);       // produces the Structured-Header text
```

Silent-tolerance rules (§4.2):

- Unknown dictionary keys are ignored.
- Out-of-range urgency values clamp to the nearest valid value.
- Missing keys fall back to defaults.

See [`priority_rfc9218`](#references).

## PRIORITY_UPDATE frame (§7)

Clients and servers can update priority of an outstanding stream or
push at any time via a control-stream frame:

```
PRIORITY_UPDATE (request streams) — frame type 0xF0700
PRIORITY_UPDATE (push IDs)        — frame type 0xF0701

Frame Payload {
    Prioritized Element ID (i),     ← stream_id or push_id
    Priority Field Value (..)       ← Structured-Header bytes
}
```

The frame types are greased-size varints (≥ 4 bytes on the wire)
signalling "extension, may be absent" per §7.2.8.

ADT:

```verum
public type PriorityUpdate is {
    target: PriorityUpdateTarget,   ← Request(stream_id) | Push(push_id)
    priority_field: List<Byte>,
};

public const PRIORITY_UPDATE_REQUEST: UInt64 = 0xF0700;
public const PRIORITY_UPDATE_PUSH:    UInt64 = 0xF0701;
```

## SETTINGS interaction

Servers advertise `SETTINGS_NO_RFC7540_PRIORITIES = 0x09` (value 1)
to indicate they've disabled the legacy HTTP/2 stream-dependency tree
and rely solely on RFC 9218. Clients MAY skip emitting
`HEADERS.stream_dependency` when this setting is set.

## Scheduler integration

The priority layer is *parsing only* — it does NOT implement
send-ordering. The actual scheduler lives in `core.net.h3.server` /
`client`. This module hands typed `H3Priority` values to the
send-queue, which consumes them via a comparator:

```
1. Lower urgency sends first.
2. Within same urgency, non-incremental sends before incremental.
3. Within same urgency + incremental, round-robin.
```

## References

- `core/net/h3/priority.vr`
- `vcs/specs/L2-standard/net/h3/priority_rfc9218.vr`
- `vcs/specs/L2-standard/net/h3/priority_typecheck.vr`
