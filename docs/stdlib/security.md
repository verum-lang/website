---
sidebar_position: 2
title: security
description: Security labels, information-flow control, region-based isolation.
---

# `core::security` — Labels and regions

Types for capability- and label-based security analyses. The
`@verify(static)` pipeline uses them to enforce information-flow
properties and region isolation.

| File | What's in it |
|---|---|
| `labels.vr` | `Label`, `Labeled<T>`, `flows_to`, `join`, `combine` |
| `regions.vr` | `Region<'r, T>`, `new_region`, capability-scoped allocation |

---

## Security labels

### `Label`

A lattice of sensitivity levels:

```verum
type Label is
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

A value labelled `Secret` can legally flow to `TopSecret` sinks (more
restricted is always OK), but not to `Public` sinks.

### `Labeled<T>`

```verum
type Labeled<T> is { label: Label, value: T };

labeled<T>(label: Label, value: T) -> Labeled<T>
l.unwrap_value() -> T                       // retains label propagation
l.label() -> &Label
```

### Operations

```verum
flows_to(lo: Label, hi: Label) -> Bool       // lo ⊑ hi
join(a: Label, b: Label) -> Label            // least upper bound
meet(a: Label, b: Label) -> Label            // greatest lower bound

combine<T, U>(a: Labeled<T>, b: Labeled<U>, op: fn(T, U) -> T) -> Labeled<T>
// Result's label = join(a.label, b.label).
```

### Typical pattern — protecting sensitive outputs

```verum
type UserEmail is Labeled<Text>;            // labelled at boundary
type DisplayName is Labeled<Text>;

fn new_user_email(raw: Text) -> UserEmail {
    labeled(Label.Secret, raw)
}

fn public_profile(email: UserEmail) -> Labeled<Text> {
    // Compiler tracks that the result is at least Secret.
    combine(email, labeled(Label.Public, " (hidden)".to_string()),
        |secret, suffix| f"{secret[..3]}***@****{suffix}")
}

fn log_public_only(msg: Labeled<Text>) using [Logger] {
    if flows_to(msg.label().clone(), Label.Public) {
        Logger.info(&msg.unwrap_value());
    } else {
        Logger.warn(&"suppressed: non-public message");
    }
}
```

---

## Regions

Region-based memory management — an alternative to CBGR for specific
workloads (arena allocation, bump allocation, compile-time-bounded
lifetimes).

```verum
type Region<'r, T> is { ... };

new_region<'r, T, F, U>(f: F) -> U
    where F: FnOnce(Region<'r, T>) -> U
// All allocations made inside `f` are freed in O(1) when the region ends.
```

### Example

```verum
let stats = new_region(|r: Region<'_, ParseNode>| {
    let tree = parse_into_region(source, &r);
    // `tree` and all child nodes live in the region.
    compute_statistics(&tree)
});
// Region is fully deallocated here — O(1) bulk free.
```

Unlike CBGR, region-allocated values do not bear generation tags; they
are valid throughout the region and uniformly invalidated on region
exit.

---

## Capabilities

`@cap` attribute marks which capabilities a function holds and
requires.

```verum
@cap(name = "declassify", domain = "Secret")
fn expose_for_audit(x: Labeled<Secret>) -> Text {
    declassify(x)
}

@cap(name = "admin")
fn drop_table(name: &Text) using [Database with [Admin]] {
    Database.execute(sql#"DROP TABLE ${name}").await?;
}
```

Audit what capabilities your build requires:

```bash
verum analyze --report capabilities
```

---

## Cross-references

- **[Language → attributes](/docs/language/attributes)** — `@cap`, `@label`.
- **[context](/docs/stdlib/context)** — capability-carrying contexts
  (`Database with [Read]`).
- **[Verification → gradual verification](/docs/verification/gradual-verification)**
  — information-flow checks run at `@verify(static)`.
