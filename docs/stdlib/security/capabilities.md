---
sidebar_position: 14
title: capabilities — supported boundaries
description: Value-level capability restrictions, unsupported authorization annotations, and the distinction from runtime classification labels.
---

# Capabilities and classification boundaries

`core.security.capabilities` is not an available standard-library
module, and `@cap(...)` is not a built-in authorization contract. Do not
use them to establish who may invoke a function or release sensitive data.
An unrecognized attribute may be accepted with a warning; successful
compilation does not establish that the annotation enforces a policy.
See the [attribute registry](/docs/reference/attribute-registry).

## Capability restrictions on values

The language has a separate capability-restricted type form,
`T with [Read, Write]`. It describes restrictions on a value rather than
granting authority to a function. See
[capability attenuation](/docs/architecture/overview#9-a-capability-may-be-given-away-never-acquired)
for the supported type relation and its limits.

These restrictions do not implement user authentication or derive
permissions from a runtime security label. Application code must
validate credentials and apply its authorization policy before the
protected operation.

## Runtime labels and declassification

[`core.security.labels`](/docs/stdlib/security/labels) provides runtime
classification tags. A `Labeled<T>` has a runtime `Label` field, not a
label type parameter. Its API has no `declassify(Labeled<T>)` function,
capability-gated extractor, or automatic audit of label changes.

The module's `combine` callback receives raw values. Its output tag does
not constrain what the callback may send to logs or other outputs.
Review those operations directly instead of relying on an `@cap`
annotation or an inferred declassification report.

## Compiler classification annotations

Compiler handling for `@classification` and `@declassify` is separate
from runtime `Labeled<T>` tags. In the classification down-flow walker,
`@declassify` on a function causes that function's body to be skipped.
It does not extract a `Labeled<T>`, require an `@cap` grant, or prove
that releasing data is safe.

The annotation reader and walker are defined in
[`verum_types::infer`](https://github.com/verum-lang/verum/blob/main/crates/verum_types/src/infer/mod.rs)
and
[`infer/env.rs`](https://github.com/verum-lang/verum/blob/main/crates/verum_types/src/infer/env.rs).
Runtime labels do not automatically configure this analysis. Treat
annotation handling, application authorization, and runtime label
comparisons as separate concerns when reviewing a data flow.

## Related guidance

- [Labels](/docs/stdlib/security/labels) — exported API, tag ordering,
  and callback limitations.
- [Security guide](/docs/guides/security) — application security practices.
- [Capability-restricted types](/docs/language/types#capability-restricted-types)
  — the value-level type syntax.
