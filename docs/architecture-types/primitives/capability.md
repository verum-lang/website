---
sidebar_position: 2
title: "Capability — first-class possibility"
description: "The Capability primitive: every architectural permission is a value, conserved across composition, and orthogonal to the context system."
slug: /architecture-types/primitives/capability
---

# Capability — first-class possibility

A **capability** is a first-class architectural permission: a value
of type `Capability`, declared explicitly, conserved across cog
composition, and checked at compile time. Capabilities answer the
question *"what may this cog do?"* — not *"what is this cog
permitted to do at runtime"* (that is the [context
system](../../language/context-system.md)) and not *"what side
effects does the body actually carry"* (that is the [property
system](../../language/type-properties.md)).

The orthogonality of these three axes is documented in
[Three orthogonal axes](../orthogonality.md). This page focuses on
the Capability primitive itself.

## 1. The capability type

```verum
public type Capability is
    | Read(ResourceTag)
    | Write(ResourceTag)
    | Exec(ExecTarget)
    | Escalate(PrivilegeRealm)
    | Spawn(TaskLifetime)
    | TimeBound(ExpirationPolicy)
    | Persist(PersistenceMedium)
    | Network(NetProtocol, NetDirection)
    | CustomCapability(Text);
```

Nine variants cover the full architectural permission surface.
Each variant carries enough payload that auditors can tell two
capabilities of the same kind apart — `Read(File("./config"))` is
distinct from `Read(File("./users"))`.

The supporting variant types describe the *targets* of each
capability:

```verum
public type ResourceTag is
    | Database(Text)
    | File(Text)
    | Memory(Text)
    | Config(Text)
    | Logger
    | Random
    | CustomResource(Text);

public type ExecTarget is
    | Ffi(Text, Text)        // (library_name, symbol)
    | Syscall(Int)
    | Program(Text)
    | CustomTarget(Text);

public type PrivilegeRealm is
    | Admin
    | Root
    | Audit
    | CustomRealm(Text);

public type TaskLifetime is
    | ScopedToParent
    | Detached
    | Deadlined(Int);          // unix-time deadline

public type ExpirationPolicy is
    | AtUnixTime(Int)
    | AfterDuration(Int)       // seconds
    | OnEvent(Text);

public type PersistenceMedium is
    | Disk(Text)
    | DatabaseMedium(Text)
    | DistributedLog(Text);

public type NetProtocol is
    | Tcp | Udp | Unix | Tls | Quic | Http | Grpc;

public type NetDirection is
    | Inbound | Outbound | Bidirectional;
```

## 2. The two slots — `exposes` vs `requires`

A cog's `Shape` carries capabilities in two distinct slots:

- **`exposes: List<Capability>`** — capabilities the cog claims
  *its body uses*. Every `exposes` entry is a promise: "if you
  compose with me, the resulting program may exercise this
  capability through me".
- **`requires: List<Capability>`** — capabilities the cog
  *needs the surrounding context to provide*. Every `requires`
  entry is an ask: "for me to function, the runtime context must
  inject something matching this capability".

The two slots are not symmetric. `exposes` is a *static commitment*;
`requires` is a *runtime dependency*. A cog may expose
`Capability.Read(Database("ledger"))` while requiring
`Capability.Read(Logger)` — it reads the ledger itself, but only
needs a logger from the surrounding context.

## 3. Capability conservation across composition

Capabilities flow through composition. If cog A exposes capability
`C` and cog B imports A, then B's exposed capability set
acquires `C` *transitively* — unless B explicitly *encapsulates*
the capability (turns the call site into a private operation that
B's own boundary mediates).

The discipline:

```verum
// Cog A exposes Network capability:
@arch_module(exposes: [Capability.Network(Tcp, Outbound)])
module storage.s3_client;

// Cog B imports A but DOES NOT expose Network — must encapsulate:
@arch_module(exposes: [Capability.Read(ResourceTag.Database("user_avatars"))])
module app.avatar_store;
```

The compiler reads B's annotation as a *contract*: "B promises that
its public surface only exposes a Database read; any Network
capability flowing in from A must be confined inside B's body".
If B exports a function whose body calls A's network method
*without an intermediate boundary*, the
[`AP-001 CapabilityEscalation`](../anti-patterns/classical.md#ap-001)
diagnostic fires.

The same conservation applies in reverse: if A's `requires` list
asks for `Capability.Read(Logger)` and B does not provide a Logger,
then composition fails at compile time. This is the architectural
analogue of the [context system](../../language/context-system.md)'s
runtime DI check, but performed at the static-shape layer.

## 4. Capability inference from mounts

Verum's compiler can *infer* required capabilities from the import
graph. A cog that mounts `core.io.fs` automatically picks up
`Capability.Read(ResourceTag.File("**"))` as a requirement, because
`core.io.fs`'s exposed capabilities flow into anyone who imports
it.

The inference is conservative — the inferred capabilities are
added to the cog's effective `requires` list, but the cog's
*declared* `requires` and `exposes` remain authoritative. If
the inferred requirements exceed what the cog declares, the
inference engine emits a hint:

```text
hint[ATS-V-INFER-CAP-001]: cog `app.avatar_store` mounts
  `core.io.fs` which exposes `Read(File("**"))`. Consider
  declaring this in `requires` to make the dependency
  explicit.
```

The hint is informational; suppress it by either (a) listing
the capability explicitly, or (b) confining the mount inside a
private sub-cog whose Shape encapsulates the capability.

## 5. The `consumes` field

Adjacent to `exposes` and `requires` is the `Shape.consumes` field:

```verum
public consumes: List<Text>,    // resource tags that are CONSUMED
```

Where `requires` lists capabilities the runtime must provide —
typically *renewable* (a Logger persists across calls) — `consumes`
lists capabilities that are *expended*. A cog that consumes
`"randomness/4 bytes"` is making a one-time withdrawal from the
runtime's entropy pool; the architectural type system tracks the
withdrawal so an auditor can compute the program's total
randomness budget by walking the import graph.

`consumes` strings are free-form for forward extensibility. The
canonical vocabulary is:

| Tag | Meaning |
|-----|---------|
| `"randomness/N"` | N bytes of cryptographic randomness |
| `"clock/monotonic"` | one read of the monotonic clock |
| `"deadline/N seconds"` | N seconds of the parent task's deadline budget |
| `"file_descriptor/N"` | N file-descriptor allocations |
| `"network_socket/N"` | N network sockets |

## 6. Capability — property — context: the orthogonality

A common misreading: "capability is the same as side effect, just
written down architecturally". It is not. The three concepts are
*orthogonal* and play different roles.

| Axis | Where it lives | When it's checked | Cost |
|------|----------------|-------------------|------|
| **Capability** | `@arch_module(exposes: [...])` | compile-time architectural | 0 ns |
| **Property** | `fn f(...) -> T {...}` carries `PropertySet` (Pure / IO / Async / Fallible / Mutates) | compile-time function-type | 0 ns |
| **Context** | `using [Database, Logger]` clause on `fn` | compile-time DI signature, runtime lookup | ~5–30 ns lookup |

A function may simultaneously:

- Architecturally *expose* `Capability.Network(Grpc, Outbound)`
  (the cog has the right to make outbound gRPC calls).
- Carry property `{Async, Fallible, IO}` (its body actually
  performs async I/O that may fail).
- Require context `using [Logger, MetricsSink]` (the runtime
  must provide these providers).

Each of the three axes covers a different aspect:

- A function whose body *does* network I/O but whose cog does NOT
  expose `Network` is an `AP-001 CapabilityEscalation`.
- A function with `{Pure}` whose body actually does I/O is a
  property-type error (caught by the value type checker, not
  ATS-V).
- A function `using [Logger]` whose call site does not `provide`
  a Logger is a context-resolution error (caught by the context
  system, not ATS-V).

For the full discussion see [Three orthogonal axes](../orthogonality.md).

## 7. Substructural quantity

A capability's "linearity" — may it be used once, multiple times,
or never duplicated? — is *not* expressed inside the `Capability`
variant. Verum already carries a substructural-logic discipline
on bindings via `@quantity(0|1|omega)`:

| Quantity | Meaning |
|----------|---------|
| `0` | binding may be unused (relevant logic) |
| `1` | binding must be used exactly once (linear) |
| `omega` | binding may be used freely (unrestricted) |

A capability *binding* (the value that holds the capability at
runtime) inherits the quantity discipline of the surrounding
binding form. A linear capability — one that may be exercised
exactly once — is bound under `@quantity(1)`. The capability
*type* itself is unchanged.

This decomposition keeps `Capability` small (nine variants) and
delegates linearity to the existing substructural surface. ATS-V
introduces zero new quantity machinery.

## 8. Capability and the context system — bridging the two

The context system (`using [Database, Logger]`) is Verum's runtime
DI mechanism; the capability primitive is Verum's compile-time
architectural mechanism. They cooperate via a one-way translation
rule:

```text
context  →  capability    : every context entry implies a Read(<resource>) capability
capability ↛ context       : a capability does NOT imply a context (over-declaration is fine)
```

A function declared `using [Database, Logger]` must, in its
enclosing cog, list at least:

- `Capability.Read(ResourceTag.Database(name))` for the Database
- `Capability.Read(ResourceTag.Logger)` for the Logger

If the cog's `exposes` list is missing one of these, the type
checker emits a CapabilityEscalation diagnostic *at the call site
that uses the context*, not just at the cog declaration. This
ensures the diagnostic locates the offending code.

## 9. Custom capabilities

Codebases that need capability tags beyond the canonical set use
`Capability.CustomCapability(Text)`. The text is free-form and
participates in capability conservation just like the canonical
variants. Convention: prefix custom tags with the cog's namespace,
e.g. `"my_app/admin_console"`.

Custom capabilities are second-class in the sense that the audit
gates do not know how to interpret them. A custom capability
appears verbatim in `verum audit --arch-discharges` reports;
auditors are responsible for understanding what it means.

## 10. Worked example — capability flow

Consider a three-cog stack:

```text
   app.web_handler  ─────► app.avatar_store  ─────►  storage.s3_client
   (HTTP boundary)         (Avatar logic)            (S3 wire calls)
```

The architectural shapes:

```verum
@arch_module(
    exposes: [Capability.Network(NetProtocol.Tcp, NetDirection.Outbound)],
)
module storage.s3_client;

@arch_module(
    exposes:       [Capability.Read(ResourceTag.Database("user_avatars")),
                    Capability.Write(ResourceTag.Database("user_avatars"))],
    composes_with: ["storage.s3_client"],
    // NOTE: does NOT expose Network — encapsulates the s3_client
)
module app.avatar_store;

@arch_module(
    exposes:       [Capability.Network(NetProtocol.Http, NetDirection.Inbound)],
    composes_with: ["app.avatar_store"],
)
module app.web_handler;
```

What the type checker confirms:

1. `storage.s3_client` exposes outbound TCP. ✓
2. `app.avatar_store` imports `s3_client`, which transitively
   contributes outbound TCP — but `avatar_store` does *not*
   expose Network outbound. The body must therefore *encapsulate*
   the network calls behind functions whose surface only deals in
   `Avatar` values. The compiler walks the cog body; if any public
   function returns or accepts a network type (TcpStream,
   GrpcChannel, etc.), `AP-001 CapabilityEscalation` fires.
3. `app.web_handler` exposes inbound HTTP and composes with
   `avatar_store`. The web_handler's public surface is HTTP; it
   does *not* see the underlying S3 calls. ✓

The composition is well-typed at the architectural layer. An
auditor reads the three Shapes and sees the architectural intent
without reading any function body.

## 11. Capability and security boundaries

ATS-V capabilities are an *architectural* discipline, not a
sandbox. They tell auditors *what the program may do*; they do
not, on their own, prevent a malicious cog from reaching the
syscall layer. For runtime sandboxing see
[security/regions](../../stdlib/security/regions.md) and
[security/labels](../../stdlib/security/labels.md), which
implement runtime label-flow control under the same capability
vocabulary.

Architectural capabilities and runtime regions cooperate: a cog
that declares `Capability.Network(Tcp, Outbound)` and runs inside a
region that strips network access at runtime is well-typed
architecturally but *will* trip the runtime check. The two layers
are independent quality gates.

## 12. Cross-references

- [Three orthogonal axes](../orthogonality.md) — Capability /
  Property / Context.
- [Boundary](./boundary.md) — what crosses the cog edge.
- [Shape](./shape.md) — the aggregate carrier.
- [Anti-pattern AP-001 CapabilityEscalation](../anti-patterns/classical.md#ap-001)
- [Anti-pattern AP-022 CapabilityLaundering](../anti-patterns/articulation.md#ap-022)
- [Context system](../../language/context-system.md) — the runtime
  DI mechanism that exposes capabilities as providers.
- [Type properties](../../language/type-properties.md) — the
  function-level effect-tracking system.
- [Security capabilities](../../stdlib/security/capabilities.md) —
  the runtime label-flow enforcement.
