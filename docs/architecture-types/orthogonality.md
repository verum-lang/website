---
sidebar_position: 10
title: "Three orthogonal axes — Capability, Property, Context"
description: "Why Verum carries three independent dimensions of effect-tracking, what each tracks, and why merging them is a category error."
slug: /architecture-types/orthogonality
---

# Three orthogonal axes — Capability, Property, Context

A common misreading of Verum: *"capabilities, properties, and the
context system all describe what a function does — surely they're
the same thing in three syntaxes?"* They are not. The three are
**orthogonal**: each tracks a different aspect, runs at a different
phase, costs a different amount, and fails for a different reason.
Conflating them is a category error that leaves codebases
under-specified in subtle ways.

This page explains, with examples, why Verum keeps the three
distinct, how they cooperate, and what kind of bug each one
catches that the others cannot.

## 1. The three axes — at a glance

| Axis | Where it lives | What it tracks | Phase | Cost | Failure mode |
|------|----------------|----------------|-------|------|--------------|
| **Capability** | `@arch_module(exposes: [...], requires: [...])` | What the cog is *permitted* to do | compile-time architectural | 0 ns | `AP-001 CapabilityEscalation` — body does X but cog doesn't expose X |
| **Property** | `PropertySet` carried on function types | What the function's *body* actually does | compile-time function-type | 0 ns | Property-system mismatch — `{Pure}` function calls `{IO}` function |
| **Context** | `using [Database, Logger]` clause on `fn` | Which providers the runtime must inject *now* | compile-time DI signature; runtime lookup | ~5–30 ns | `unresolved_provider` — call site lacks a `provide` block |

Three axes, three phases, three failure surfaces — chosen because
they correspond to three different *engineering questions* a
reviewer asks of a function:

- *"Is this allowed in this part of the system?"* — capability.
- *"What does this function actually compute?"* — property.
- *"What does this function need at the moment of call?"* —
  context.

A single mechanism cannot answer all three without losing
precision in at least two of them.

## 2. The orthogonality, demonstrated

Consider four functions, each carrying different combinations of
the three axes:

### 2.1 Pure arithmetic — none of the three

```verum
fn square(x: Int) -> Int { x * x }
```

- **Capability:** none — pure computation.
- **Property:** `{Pure}` — no side effects.
- **Context:** none — no providers needed.

The simplest possible function. All three axes are at zero. The
type checker confirms each separately; none is implied by the
others.

### 2.2 Logging — property + context, no capability

```verum
fn log_result(x: Int) -> Int
    using [Logger]
{
    Logger.info(f"got {x}");
    x
}
```

- **Capability:** the *cog* must declare
  `Capability.Read(ResourceTag.Logger)` in its `requires`. The
  function itself does not introduce a new capability.
- **Property:** `{IO}` — the body performs IO via Logger.
- **Context:** `using [Logger]` — the runtime must inject a
  Logger provider.

A function that *uses* a context implicitly *requires* the
corresponding capability at the cog level. A function that has a
property does not necessarily require a context (e.g., `{IO}`
caused by direct file syscalls without any context provider).

### 2.3 Direct file write — capability + property, no context

```verum
fn dump_to_disk(data: &Bytes) -> Result<(), Error> {
    let fd = sys.io.open("/tmp/dump", OpenFlag.WriteOnly | OpenFlag.Create);
    sys.io.write_all(fd, data)?;
    sys.io.close(fd);
    Ok(())
}
```

- **Capability:** the cog must expose
  `Capability.Write(ResourceTag.File("/tmp/dump"))`.
- **Property:** `{IO, Fallible}` — the body performs file I/O
  that may fail.
- **Context:** none — uses raw syscalls, no DI.

Capabilities and properties move together here, but contexts do
not. The function calls into a stateless syscall layer; the
runtime context is empty.

### 2.4 The full triple — gRPC outbound + DI + property

```verum
fn fetch_score(user: UserId) -> Result<FraudScore, Error>
    using [FraudClient, Logger, Tracer]
{
    Tracer.span("fetch_score", || {
        Logger.info(f"checking user {user}");
        FraudClient.score(user)
    })
}
```

- **Capability:** the cog exposes
  `Capability.Network(NetProtocol.Grpc, NetDirection.Outbound)`
  (the FraudClient speaks outbound gRPC) and requires
  `Capability.Read(ResourceTag.Logger)` and `Read(Tracer)`.
- **Property:** `{Async, Fallible, IO}`.
- **Context:** `using [FraudClient, Logger, Tracer]`.

All three axes are non-trivial. Each one catches a different
class of bug:

- *Capability* would catch: the cog claims it does *not* speak
  outbound gRPC, but the body calls FraudClient — `AP-001`.
- *Property* would catch: a caller declared `{Pure}` function
  invokes `fetch_score` — property-system error.
- *Context* would catch: the call site does not `provide` a
  FraudClient — runtime DI error.

Removing any one axis would silently allow one of these bug
classes to slip through.

## 3. Why not unify them?

A natural design instinct is "this looks redundant; let's collapse
all three into one mechanism". The reasons against:

### 3.1 Different abstraction levels

- **Capability** lives at the *cog* level — a static
  architectural fact about the unit of compilation.
- **Property** lives at the *function* level — a static fact
  about a particular function's body.
- **Context** lives at the *call* level — a dynamic dependency
  resolved per call.

Each is meaningful at a different scope. A single axis at any one
of these scopes loses information at the others.

### 3.2 Different audiences

- Capability speaks to the **architect/auditor**: "what may this
  cog do?"
- Property speaks to the **caller**: "what should I expect when I
  invoke this?"
- Context speaks to the **runtime/operator**: "what providers
  must I wire up?"

A unified mechanism would force every audience to sift through
information addressed to the others.

### 3.3 Different cost profiles

- Capability and Property checks are pure compile-time;
  zero-cost.
- Context resolution is runtime — provider lookup costs ~5–30 ns
  per call.

Promoting context to the architectural level (capability) loses
its dynamic dispatch; demoting capability to runtime loses
compile-time enforcement. The cost asymmetry forces the split.

### 3.4 Different failure recoveries

- A capability failure is an *architectural* error — the code
  does not pass review and does not compile.
- A property mismatch is a *type* error — the caller's
  expectations are wrong.
- A context-resolution failure is a *deployment* error — the
  binary is correct but the runtime is misconfigured.

Each error category requires a different remediation discipline.

## 4. How they cooperate — the implication chain

The three axes are independent in failure but related in
sufficiency:

```text
context     →  capability   :  using [Database] implies cog requires Read(Database)
property    →  capability   :  body's {IO} property implies cog touches some I/O resource
capability  ↛  property     :  exposing a capability does NOT imply the body uses it
property    ↛  context      :  body's {IO} does NOT imply context-driven I/O
```

The compiler exploits the implications:

- A function declared `using [Database]` automatically contributes
  to its cog's effective `requires` list. If the cog's *declared*
  requires omit `Read(Database)`, a hint fires.
- A function whose body has property `{Network}` (caught by the
  property type checker) automatically contributes to the cog's
  `exposes` if the network operation is outbound.

The implications are conservative — over-declaration is allowed,
under-declaration is the error.

## 5. The compile-time / runtime split

The compile-time work happens in three sequential phases:

```text
   ┌─────────────────────────────────────┐
   │  Phase 1: value type-check          │
   │  (Hindley-Milner + refinements)     │
   │                                     │
   │  → checks property mismatches       │
   │  → checks context resolution sigs   │
   └────────────┬────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────┐
   │  Phase 2: ATS-V architectural check │
   │  (Shape against body)               │
   │                                     │
   │  → checks capability discipline     │
   │  → checks boundary preservation     │
   │  → checks lifecycle ordering        │
   └────────────┬────────────────────────┘
                │
                ▼
   ┌─────────────────────────────────────┐
   │  Phase 3: anti-pattern catalog      │
   │  (32 RFC-coded checks)              │
   │                                     │
   │  → AP-001 .. AP-032                 │
   └─────────────────────────────────────┘
```

Phase 1 and Phase 2 are independent — the property/context check
does not consult the architectural check, and vice versa. Phase 3
consumes the outputs of both.

At runtime, *only* the context-system DI persists. Capabilities
and properties are erased; they are compile-time-only.

## 6. Concrete diagnostic surfaces

Each axis has its own diagnostic family, with stable error codes
and link-back URLs.

### 6.1 Capability diagnostics — `ATS-V-AP-NNN`

```text
error[ATS-V-AP-001]: capability escalation
  --> src/payment.vr:42:5
   |
42 |     net.tcp.connect("fraud.svc:443")
   |     ^^^^^^^^^^^^^^^ body opens outbound TCP, but cog
   |                     does not expose Network capability.
   |
note: cog `payment.settlement` declares
        @arch_module(exposes: [Capability.Read(Database("ledger"))])
note: this body requires Capability.Network(Tcp, Outbound)
help: add `Capability.Network(Tcp, Outbound)` to `exposes`,
      or move the network call into a child cog whose Shape
      encapsulates the capability.
```

### 6.2 Property diagnostics — `VERUM-TYPE-PROP-NNN`

```text
error[VERUM-TYPE-PROP-002]: property mismatch
  --> src/lib.vr:11:12
   |
11 |     pure_calc(fetch_score(user))
   |               ^^^^^^^^^^^^^^^^^ this expression has
   |                                 properties {Async, IO},
   |                                 but `pure_calc` requires
   |                                 properties {Pure}.
```

### 6.3 Context diagnostics — `VERUM-CTX-NNN`

```text
error[VERUM-CTX-003]: unresolved provider
  --> src/main.vr:7:5
   |
7  |     fetch_score(user_id)
   |     ^^^^^^^^^^^^^^^^^^^ requires `FraudClient` provider.
   |
help: add a `provide { FraudClient = …; }` block at the
      enclosing scope, or wire FraudClient into the
      application's root context.
```

The three diagnostic families are stable across versions and are
indexed in [Reference → diagnostic registry](/docs/reference/glossary).

## 7. Worked example — the same code, three perspectives

A single function viewed from each axis:

```verum
@arch_module(
    exposes:  [Capability.Network(Grpc, Outbound),
               Capability.Read(ResourceTag.Database("users"))],
    requires: [Capability.Read(ResourceTag.Logger),
               Capability.Read(ResourceTag.Clock)],
)
module payment.score;

public fn score_user(uid: UserId) -> Result<FraudScore, Error>
    using [FraudClient, Logger, Clock]
{
    let now = Clock.now();
    Logger.info(f"scoring user {uid} at {now}");
    let raw = users_db.lookup(uid)?;
    FraudClient.score(raw)
}
```

The same function from each angle:

| Angle | What it tells us |
|-------|------------------|
| **Architect** (capability axis) | This cog speaks outbound gRPC and reads the `users` database. It needs a Logger and a Clock from the surrounding system. |
| **Caller** (property axis) | This function is `{Async, Fallible, IO}` — it suspends, may fail, and performs I/O. |
| **Operator** (context axis) | At runtime, the call site must `provide` a FraudClient, a Logger, and a Clock. |

Three audiences, three independent specifications, all carried by
the same code. None of the three is derivable from the others
without information loss.

## 8. The orthogonality applied — choosing the right axis

A guideline for code reviewers:

- *"This cog should never write to disk."* → **Capability**
  constraint. Express via `@arch_module(exposes: [...])` and rely
  on AP-001 to enforce.
- *"This function must not block."* → **Property** constraint.
  Express via the function's `PropertySet` (e.g., reject `{IO}`
  in a hot loop).
- *"This call needs a logger right now."* → **Context**
  constraint. Express via `using [Logger]` on the function.

Choose the axis that matches the level of granularity. A
capability constraint applies to *all* code in the cog; a property
constraint applies to *one* function; a context constraint applies
to *one call*.

## 9. Common confusions resolved

### "Isn't `using [Logger]` already a capability?"

No. `using [Logger]` is a *runtime DI binding* — the logger value
must be available at the call site. The corresponding capability
is `Capability.Read(ResourceTag.Logger)`, which is an
architectural permission. The function `using [Logger]` *implies*
the cog must require the capability (the compiler enforces this),
but the two live at different layers.

### "Aren't algebraic effects exactly this?"

Verum does *not* have algebraic effects in the Koka sense. The
property system is a *non-algebraic* effect tracker — it tags
function types with a `PropertySet` but does not provide handler
machinery. The context system is *not* an effect system at all —
it is dependency injection with capability typing. Conflating
"properties" with "effects" is a category error specific to
Verum.

### "Why not put capabilities on functions instead of cogs?"

Per-function capabilities exist as an inferred view (the property
system tracks what a function's body does). The *declared*
capability lives at the cog level because architectural review is
cog-grained — auditors care about *modules*, not *functions*.
Per-function capability declaration would multiply the annotation
burden by 100× without adding precision.

## 10. Cross-references

- [Capability primitive](./primitives/capability.md) — the
  architectural permission type.
- [Type properties](../language/type-properties.md) — the
  function-level effect tracker.
- [Context system](../language/context-system.md) — the runtime DI
  mechanism.
- [Anti-pattern AP-001 CapabilityEscalation](./anti-patterns/classical.md#ap-001).
- [Anti-pattern AP-022 CapabilityLaundering](./anti-patterns/articulation.md#ap-022)
  — the same axis abused at the boundary.
- [Verification → soundness gates](../verification/soundness-gates.md)
  — the audit-level confirmation that the three axes remain
  independent across releases.
