---
sidebar_position: 12
title: labels — runtime classification tags
description: Label values, explicit flow comparisons, and the Labeled wrapper API.
---

# `core.security.labels` — runtime classification tags

`core.security.labels` pairs values with classification tags and provides
functions for comparing and combining those tags. A label is a runtime
value: `Labeled<Text>` carrying `Secret` and `Labeled<Text>` carrying
`Public` have the same type. The wrapper does not automatically prevent
information from reaching a log, response, or other output.

## Labels and ordering

```verum
public type Label is
    | Public
    | Internal
    | Secret
    | TopSecret
    | Custom { name: Text };
```

`flows_to(lo, hi)` returns a `Bool` according to this canonical ordering:

```text
Public ⊑ Internal ⊑ Secret ⊑ TopSecret
```

The function compares tags; the caller decides how to use its answer.
For example, the comparison from `Secret` to `Public` returns `false`,
while the reverse comparison returns `true`.

A custom label flows only to a custom label with the same name. It does
not flow to or from any canonical label, including `Public` and `TopSecret`.
The module has no API for declaring additional ordering relationships.
If your application needs a different ordering, it must implement and
apply that policy separately.

## The `Labeled<T>` wrapper

`Labeled<T>` stores a `label: Label` and a `value: T`. Both fields are
private in its declaration. The public API provides the `labeled`
factory and `combine`; it provides no field accessors, extraction
method, or `map` function. External code should use the exported
operations rather than construct the record or read its fields directly.

```verum
public fn labeled<T>(label: Label, value: T) -> Labeled<T>;

public fn combine<T, U>(
    a: Labeled<T>,
    b: Labeled<U>,
    op: fn(T, U) -> T,
) -> Labeled<T>;
```

`labeled` attaches the supplied tag without validating how the value was
obtained. `combine` calls `op` with the two raw values, then returns its
result with the tags combined by `join`. The callback returns `T`, so
`combine` is not a general conversion from `Labeled<T>` to `Labeled<U>`.

The callback is an ordinary function. Label propagation does not
restrict its side effects or prevent it from exposing its arguments.
Review callback behavior and output operations wherever confidentiality
matters; the private fields alone do not establish information-flow
control.

## Comparing and combining tags

```verum
public fn flows_to(lo: Label, hi: Label) -> Bool;
public fn join(a: Label, b: Label) -> Label;
```

| Inputs | `join` result |
|---|---|
| Two canonical labels | The higher label in the canonical ordering |
| Custom labels with the same name | That custom label |
| Different custom labels, or a custom and a canonical label | `TopSecret` |

For canonical labels, `join` computes the least upper bound. The
`TopSecret` fallback for incomparable custom labels is only a return
value: `flows_to` still rejects a flow from a custom label to
`TopSecret`. Do not treat this fallback as proof that both inputs may
flow to the result under a custom policy.

## Using labels in an application

Use `Label` and `flows_to` for explicit classification decisions where
your application has the relevant tags. Check the result before the
operation whose policy you want to enforce. Since the wrapper has no
public inspection API, it does not provide a general checked logging or
serialization adapter through its public interface.

Keep secrets out of logs and public responses through the application
code that produces those outputs. Creating a `Labeled<T>` does not make
the logger track its tag, and an ordinary `Text` does not become a
statically restricted type because it passed through this wrapper.

The module provides no `declassify(Labeled<T>)` operation, automatic
label-downgrade audit, or `verum analyze --label-lattice` command.
Compiler classification annotations are a separate mechanism; a
runtime `Label` field does not configure them. See
[capability limitations](/docs/stdlib/security/capabilities) before
relying on annotations to authorize an operation.

## Source and related guidance

- [`core/security/labels.vr`](https://github.com/verum-lang/verum/blob/main/core/security/labels.vr)
  — declarations and implementations of the functions above.
- [Security guide](/docs/guides/security) — application security practices.
- [Regions](/docs/stdlib/security/regions) — memory-region APIs and limitations.
