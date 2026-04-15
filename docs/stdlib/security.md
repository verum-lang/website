---
sidebar_position: 2
title: security
---

# `core::security` — Labels and regions

Types for capability- and label-based security analyses. Used by the
`@verify(static)` pipeline to enforce information-flow properties and
region isolation.

## Security labels

```verum
type Label is
    | Public
    | Confidential
    | Secret
    | TopSecret
    | Custom(Text);

type Labeled<T, const L: Label> is (T);

fn classify<T>(x: T, label: meta Label) -> Labeled<T, label> { ... }
fn declassify<T, const L: Label>(x: Labeled<T, L>) -> T
    where requires @cap.has("declassify", L)
{ ... }
```

The type system tracks labels through data flow. A value labelled
`Secret` cannot flow to a sink labelled `Public` without an explicit
`declassify` — itself gated by a capability check.

## Regions

```verum
type Region<'r, T>;

fn new_region<'r, T, F: FnOnce(Region<'r, T>) -> U, U>(f: F) -> U {
    let r = Region::enter();
    let result = f(r);
    // All allocations made in r are freed here.
    result
}
```

Region-based memory management — an alternative to CBGR for specific
workloads (arena allocation, bump allocation, compile-time-bounded
lifetimes).

## Capabilities

```verum
type Capability is { name: Text, domain: Text };

@cap(name = "declassify", domain = "Secret")
fn expose(x: Labeled<Data, Secret>) -> Data { declassify(x) }
```

The compiler tracks which capabilities each function holds and
requires — audit a build with `verum analyze --report capabilities`.

## See also

- **[Language → attributes](/docs/language/attributes)** —
  `@capability`, `@label`.
- **[context](/docs/stdlib/context)** — capability-carrying contexts.
