---
sidebar_position: 12
title: labels — information-flow control
description: Labelled data, the flows-to lattice, and information-flow tracking enforced by the type system.
---

# `core::security::labels` — information-flow labels

## What is information-flow control?

**Information-flow control** (IFC) is the discipline of tracking —
at the type level — where secret data is and where it can go. The
goal: make it structurally impossible for high-sensitivity data
(passwords, PII, medical records) to reach low-sensitivity sinks
(logs, unauthenticated HTTP responses, public telemetry).

IFC complements access control:

- **Access control** says "who can read this file?"
- **IFC** says "once someone with permission reads this, where can
  they put it?"

The second question is what famous data-leak stories fail. Uber had
the right access controls on their "God View" — but logged
identifying data to an unrestricted analytics sink. Equifax had
customer data encrypted at rest — but had it in cleartext in
a web-facing logging path. Uber's privacy nightmare, Equifax's
breach — both are **IFC failures**, not access-control failures.

## Verum's approach

Verum's IFC is a **lattice of labels** applied to values:

```
               TopSecret
                  ↑
                Secret
                  ↑
               Internal
                  ↑
                Public
```

`Labeled<T>` wraps a value `T` with a label `L`. Operations over
labelled data propagate labels: `combine(a_secret, b_internal)`
produces a value labelled `Secret` (the join in the lattice).

The type checker tracks labels statically. A function that takes a
`Labeled<Public>` and a `Labeled<Secret>` and returns a
`Labeled<Public>` **does not compile** — the compiler can't prove
the output doesn't leak Secret content.

Downgrading labels ("declassification") requires an explicit
capability — see [capabilities](/docs/stdlib/security/capabilities).

## When do I need IFC?

IFC is power-tool territory. You want it when:

- You're building a service that handles regulated data (HIPAA,
  GDPR, PCI-DSS) and you want *structural* evidence that PII isn't
  sent to the wrong place.
- You have a multi-tenant system where one customer's data must
  never reach another's code path.
- You're in a red-team / blue-team environment where auditing "what
  can touch user passwords?" is a mandatory control.

You do NOT need IFC for:

- Most ordinary applications. Constant discipline plus code review
  is usually enough.
- Side-channel protection (use `@constant_time` for that).
- Memory safety (that's [CBGR](/docs/language/cbgr)).

IFC is a *complement* to those, not a replacement.

---

## API — `core.security.labels`

### Label lattice

```verum
public type Label is
    | Public
    | Internal
    | Secret
    | TopSecret
    | Custom { name: Text };
```

Canonical ordering (the "flows-to" relation):

```
Public ⊑ Internal ⊑ Secret ⊑ TopSecret
```

A value labelled `Secret` can legally flow to `TopSecret` sinks
(more restricted is always OK), but not to `Public` sinks.

Custom labels with arbitrary names can be defined for
application-specific categories (e.g. `Custom { name: "Billing" }`,
`Custom { name: "HealthRecord" }`). Custom labels form a poset
declared by the application.

### `Labeled<T>` — the wrapper

```verum
public type Labeled<T> is {
    label: Label,
    value: T,
};

/// Build a labelled value.
public fn labeled<T>(label: Label, value: T) -> Labeled<T>;
```

Access is via the fields directly — `lbl.label`, `lbl.value`. No
accessor methods are defined; the record exposes both fields
publicly because information-flow tracking is a *type-level*
property rather than a privacy boundary.

### Lattice operations

```verum
/// `lo ⊑ hi` — true iff a value labelled `lo` can legally flow to
/// a context expecting label `hi`. Custom labels only flow
/// reflexively to themselves.
public fn flows_to(lo: Label, hi: Label) -> Bool;

/// Least upper bound — "the more sensitive of two labels". For
/// incompatible custom labels, returns `TopSecret` as a
/// conservative upper bound.
public fn join(a: Label, b: Label) -> Label;

/// Combine two labelled values into one; result label is the
/// `join` of the inputs.
public fn combine<T, U>(
    a: Labeled<T>,
    b: Labeled<U>,
    op: fn(T, U) -> T,
) -> Labeled<T>;
```

`combine` is the main way to compute over labelled data without
silently leaking. The result's label is the *join* (upper bound)
of both inputs — it captures "at least as restricted as anything
that went into it".

A `meet` (greatest lower bound) operation is NOT shipped — this
lattice is modelled as upward-only. Controlled downgrades happen
through `declassify` gated by a capability (see
[capabilities](/docs/stdlib/security/capabilities)), not through
a lattice meet.

---

## Quick example — protecting an email through a render pipeline

```verum
use core.security.labels.{Label, Labeled, labeled, combine, flows_to};

type UserEmail is Labeled<Text>;
type DisplayName is Labeled<Text>;

fn new_user_email(raw: Text) -> UserEmail {
    labeled(Label.Secret, raw)
}

fn partial_redact(email: UserEmail) -> Labeled<Text> {
    // combine's `op` computes over the raw values; the compiler
    // propagates labels at the wrapper level.
    combine(email, labeled(Label.Public, " (hidden)".into()),
        |secret, suffix| f"{secret[..3]}***@****{suffix}")
}

fn log_public_only(msg: Labeled<Text>) using [Logger] {
    if flows_to(msg.label, Label.Public) {
        Logger.info(&msg.value);
    } else {
        Logger.warn("suppressed: non-public message");
    }
}
```

The key property: the function signature itself tells you what
flows where. A reviewer looking at `log_public_only` sees "this
accepts any label and logs only if it's Public" — no reading body
required.

---

## Label polymorphism

Functions can be polymorphic over labels:

```verum
fn map_labeled<T, U>(
    x: Labeled<T>,
    f: fn(&T) -> U,
) -> Labeled<U>
{
    Labeled { label: x.label.clone(), value: f(&x.value) }
}
```

The resulting value carries the same label as the input — `f` is a
**neutral** transformation from a security standpoint (it can't
lower the label).

Functions that *combine* two inputs of possibly different labels
return `join(a.label, b.label)`.

---

## When the type checker says "no"

Consider:

```verum
fn broken_log(user: UserEmail) using [Logger] {
    Logger.info(&user.value);   // ❌ compile error — label leak
}
```

The `Logger.info` signature looks like:

```verum
fn info(msg: &Text) using [Logger];
// equivalent to msg being labelled Public
```

Since `user.value` is a `Text` that was labelled `Secret` (via its
`Labeled<Text>` wrapper), and `info` accepts only `Public`, the
compiler rejects the call. `flows_to(Secret, Public) == false`.

To fix, either:

1. Redact the value (see `partial_redact` above) so the result is
   legitimately `Public`.
2. Declassify with an explicit capability (see
   [capabilities](/docs/stdlib/security/capabilities)).
3. Accept the compile error — it's telling you there's a leak.

---

## Security considerations

### IFC is not a silver bullet

IFC catches **explicit** leaks (assigning a `Secret` value to a
`Public` sink). It does NOT catch:

- **Implicit flows** via branching (`if secret_bool { public_sink(0) } else { public_sink(1) }`
  leaks one bit per call). These are caught by stricter systems;
  Verum's lattice is intentionally simpler for broader adoption.
- **Side channels** via timing / caching / resource exhaustion.
  Those are [constant-time](/docs/stdlib/security/util) territory.
- **Application logic bugs** that put the wrong data in the wrong
  `Labeled<T>` wrapper in the first place. Garbage in, garbage
  labels out.

### Custom labels — plan the lattice

If you add `Custom { name: "Billing" }`, your application needs to
declare how `Billing` compares to `Secret`, `Public`, etc. Run
`verum analyze --label-lattice` to see the currently-inferred
partial order.

### Declassification is audited

Every declassification (lowering a label) must be gated by a
capability annotation. See
[capabilities](/docs/stdlib/security/capabilities) — the build
manifest records every declassification event for audit.

---

## File layout

| File | Role |
|---|---|
| `core/security/labels.vr` | `Label`, `Labeled<T>`, lattice ops, `combine` |

## Related modules

- [`capabilities`](/docs/stdlib/security/capabilities) — `@cap`
  attribute, `declassify` primitive, audit.
- [`regions`](/docs/stdlib/security/regions) — region-based
  isolation, complementary to IFC.
- [`language/attributes`](/docs/language/attributes) — `@label`
  attribute for pinning labels on external data boundaries.
- [`verification/gradual-verification`](/docs/verification/gradual-verification) —
  how `@verify(static)` discharges IFC proof obligations.

## References

- Sabelfeld & Myers, ["Language-based information-flow security"](https://www.cse.chalmers.se/~andrei/mod09.pdf) (2003) — foundational IFC survey
- [Jif](http://www.cs.cornell.edu/jif/) — Java with IFC (research language that informed Verum's design)
- [LIO](https://hackage.haskell.org/package/lio) — Haskell LIO labelled-IO monad
- [OWASP — Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
