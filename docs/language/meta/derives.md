---
sidebar_position: 7
title: Derives Catalogue
description: The derive macros that ship with Verum — exact generated-code semantics for each.
---

# Derives catalogue

`@derive(Name)` turns a one-line annotation into a generated
`implement` block. Verum ships **six core derives** — the set every
project can rely on from the initial release onward — and a
**library-derive set** (`Display`, `Error`, `Builder`, and others)
provided through the standard library. This page documents every
shipped derive: **what the generated code looks like**, what
fields/variants it can and cannot handle, and what diagnostics are
emitted when the derive cannot proceed.

Expand any derive inline to see exactly what it emitted:

```bash
verum build --show-expansions src/models.vr
```

## Core derives (initial release)

| Derive          | What it generates                                      |
|-----------------|--------------------------------------------------------|
| `Clone`         | Deep-clone via field-by-field `.clone()`               |
| `Debug`         | `Debug.fmt_debug` — the `{:?}` formatter               |
| `Default`       | `Default.default()` using per-field defaults           |
| `PartialEq`     | `Eq.eq` — field-by-field equality                      |
| `Serialize`     | `Serialize` via the generic serialiser pipeline        |
| `Deserialize`   | `Deserialize` via the generic parser pipeline          |

## Additional library derives

| Derive          | What it generates                                      |
|-----------------|--------------------------------------------------------|
| `Display`       | `Display.fmt` with a configurable template             |
| `Error`         | `Error` delegating to `Display` for the message        |
| `Builder`       | Fluent `.with_*(...).build()` constructor              |

These are ordinary user-space derives built on the same
`@proc_macro_derive(Name)` machinery; they ship in the standard
library but are not part of the compiler-provided core.

## Shared rules

Before the per-derive details, a few invariants every derive obeys.

### Record vs sum-type dispatch

`TypeInfo.kind_of<T>()` returns either `Record`, `Variant`, or
`Newtype`. Each derive inspects it and emits the appropriate shape:

- **Record (`type T is { a: A, b: B, ... }`)**: one arm, field-by-field.
- **Variant (`type T is | C1(x1) | C2 { f1, f2 } | ...`)**: one match arm
  per variant; generated code destructures and reconstructs.
- **Newtype (`type T is (A)`)**: trivial pass-through — the derive
  forwards to `A`'s implementation.

### Reference-aware field handling

Field types are inspected. For each field:

- `&T` → the reference is copied (it is `Copy` by definition).
- `&checked T` / `&unsafe T` → copied (also `Copy`).
- `Heap<T>` / `Shared<T>` → call `.clone()` (respects `Rc` vs deep
  clone according to protocol).
- Any other sized `T: Clone` → call `.clone()`.

For `PartialEq` / `Debug` the analogous rules apply — references are
dereferenced, `Heap`/`Shared` forward to the pointee.

### Generic-parameter bounds

A derive for `T<A, B, ...>` emits an `implement` block with a bound
on each generic parameter appropriate to the protocol being derived:

```verum
// @derive(Clone) on:
type Pair<A, B> is { first: A, second: B };

// generates:
implement<A: Clone, B: Clone> Clone for Pair<A, B> {
    fn clone(&self) -> Self {
        Self { first: self.first.clone(), second: self.second.clone() }
    }
}
```

If a field's type is *not* a generic parameter, no bound is added
for it (it is checked directly at the call site). This matches
Rust's behaviour and minimises spurious bounds.

### Opting out

A field annotated `@derive_skip(Protocol)` is excluded from that
protocol's generated implementation. For `Default` the field is
replaced by `Default.default()`; for `Debug` the field is elided
from the output; for `PartialEq` the field is ignored in comparison.
Misuse raises a diagnostic when the protocol cannot proceed
without the field (for example, `Serialize`).

### Opt-in protocols vs derivable protocols

A protocol is derivable if it ships with a companion
`meta fn derive_X<T>() -> TokenStream`. Protocols without a derive
helper (`Send`, `Sync`, and marker protocols generally) cannot
appear in `@derive(...)`; trying to derive them raises a diagnostic
that names the protocol and the missing derive helper.

## `Clone`

### Shape

```verum
@derive(Clone)
type User is { id: Int, name: Text, email: Text };

// generates:
implement Clone for User {
    fn clone(&self) -> Self {
        Self {
            id: self.id.clone(),
            name: self.name.clone(),
            email: self.email.clone(),
        }
    }
}
```

### Variant handling

```verum
@derive(Clone)
type Status is | Active | Inactive { reason: Text } | Pending(Instant);

// generates:
implement Clone for Status {
    fn clone(&self) -> Self {
        match self {
            Status.Active => Status.Active,
            Status.Inactive { reason } => Status.Inactive { reason: reason.clone() },
            Status.Pending(t) => Status.Pending(t.clone()),
        }
    }
}
```

### Failure modes

| Error                                                          | Cause / fix                                |
|----------------------------------------------------------------|--------------------------------------------|
| "cannot derive Clone: field f is not Clone"              | add `@derive(Clone)` to `f`'s type, or mark it `@derive_skip(Clone)` |
| "cannot derive Clone for protocol type"                  | derive on the concrete implementer, not the protocol |

## `Debug`

`Debug.fmt_debug(&self, f: &mut Formatter)` renders the type as
`TypeName { field: value, field: value }` for records,
`VariantName(value, value)` / `VariantName { field: value }` for
variants, and `TypeName(inner)` for newtypes.

### Example

```verum
@derive(Debug)
type Point is { x: Float, y: Float };

fn demo() {
    let p = Point { x: 1.5, y: 2.5 };
    print(&f"{p:?}");   // Point { x: 1.5, y: 2.5 }
}
```

### Controlling output

- `@debug(skip)` on a field omits it from the output.
- `@debug(as = "…")` on a field renders it via a named formatter
  (e.g. `@debug(as = "hex")` for `Int`, `@debug(as = "truncated")`
  for long `Text`).
- `@debug(transparent)` on a newtype renders the inner value
  directly without the outer wrapper.

## `Default`

`Default.default()` returns the zero value for primitives, the
empty value for collections, and a record or variant constructed
from per-field defaults.

### Per-field defaults

- Primitives use `Default.default()` recursively (`0`, `0.0`,
  `false`, `""`, `[]`, `{}`).
- Fields annotated `@default(value = expr)` use `expr` instead.
- Fields annotated `@default(fn = some_fn)` call `some_fn()`.
- Sum types take the first declared variant that is nullary or
  whose fields are all `Default`. If no such variant exists,
  the derive emits the corresponding diagnostic ("no default variant").

### Example

```verum
@derive(Default)
type Config is {
    host: Text,
    port: Int,
    @default(value = 30) timeout_s: Int,
    @default(fn = Uuid.new_v4) request_id: Uuid,
};
```

## `PartialEq`

Field-by-field equality. Variants must match the same discriminant
and their payloads must be equal.

```verum
@derive(PartialEq)
type Rect is { w: Float, h: Float };

assert(Rect { w: 1.0, h: 2.0 } == Rect { w: 1.0, h: 2.0 });
```

### Controlling comparison

- `@eq(skip)` on a field excludes it from equality.
- `@eq(by = some_fn)` compares via a named function rather than `==`.

`PartialEq` **does not** imply `Eq` — `Eq` (total equality) is a
marker protocol. If all fields are `Eq`, the compiler silently
upgrades the derivation; otherwise only `PartialEq` is emitted.

## `Display`

`Display.fmt(&self, f: &mut Formatter)` uses a declarative template
attached via `@display`.

### Declarative templates

```verum
@derive(Display)
@display("{name} <{email}>")
type User is { name: Text, email: Text };
```

The template string uses `{field_name}` placeholders that expand to
`self.field.fmt(f)` at the appropriate position. Every placeholder
must name a field of the type; unknown placeholders emit
the corresponding diagnostic ("unknown display placeholder").

### Template-less derivation

For sum types a catch-all template is usually wrong. Omit the
template and provide a `@display_variant("template")` per variant:

```verum
@derive(Display)
type Event is
    | @display_variant("connect {host}")        Connect { host: Text }
    | @display_variant("disconnect")            Disconnect
    | @display_variant("data ({bytes.len()} B)") Data { bytes: List<u8> };
```

## `Serialize` and `Deserialize`

A pair of companion derives that implement the `Serialize` and
`Deserialize` protocols defined in `core.serde`. The generated code
is format-agnostic: the same implementation handles JSON, CBOR,
YAML, MessagePack, or any format that exposes a `Serializer`.

### Record example

```verum
@derive(Serialize, Deserialize)
type User is {
    id: Int,
    name: Text,
    email: Text,
};
```

### Field annotations

| Attribute                       | Effect                                        |
|---------------------------------|-----------------------------------------------|
| `@serde(rename = "id")`         | Field name in the serialised form             |
| `@serde(skip)`                  | Omitted on both sides                         |
| `@serde(skip_serializing_if = …)` | Condition-gated omission                    |
| `@serde(default)`               | Missing on deserialise → field's `Default`    |
| `@serde(flatten)`               | Inline the field's fields into the parent     |
| `@serde(with = module)`         | Use custom `serialize`/`deserialize` pair     |
| `@serde(bound = "T: Trait")`    | Extra generic bound on the impl               |

### Sum-type tagging

Variants are tagged via the type-level `@serde(tag = ..., content = ...)`:

```verum
@derive(Serialize, Deserialize)
@serde(tag = "kind", content = "data")
type Message is
    | Ping
    | Chat { author: Text, text: Text }
    | Join(UserId);
```

produces JSON like `{"kind": "Chat", "data": {"author": "Alice",
"text": "hi"}}`. Other tag shapes — `internally_tagged`,
`untagged`, `adjacent_tag` — are available; see
the `core.serde` section of the standard library for the full
matrix.

## `Error`

Implements the `Error` protocol by delegating `display` to the
`Display` impl (which `Error` derives must be paired with) and
generating an optional `source()` method.

```verum
@derive(Debug, Display, Error)
@display("failed to connect to {host}")
type ConnectError is {
    host: Text,
    @error(source) cause: IoError,
};

// @error(source) marks the field returned from Error.source(); there
// may be at most one such field.
```

## `Builder`

Generates a fluent builder:

```verum
@derive(Builder)
type HttpRequest is {
    method: Method,
    url: Url,
    headers: List<Header>,
    body: Maybe<Bytes>,
};

// generates:
implement HttpRequest {
    pub fn builder() -> HttpRequestBuilder { HttpRequestBuilder.new() }
}

type HttpRequestBuilder is {
    method: Maybe<Method>,
    url: Maybe<Url>,
    headers: List<Header>,
    body: Maybe<Bytes>,
};

implement HttpRequestBuilder {
    pub fn new() -> Self { Self { ... all None / [] ... } }

    pub fn with_method(mut self, v: Method) -> Self { self.method = Maybe.Some(v); self }
    pub fn with_url(mut self, v: Url) -> Self { self.url = Maybe.Some(v); self }
    pub fn with_headers(mut self, v: List<Header>) -> Self { self.headers = v; self }
    pub fn with_body(mut self, v: Bytes) -> Self { self.body = Maybe.Some(v); self }

    pub fn build(self) -> Result<HttpRequest, BuilderError> {
        Result.Ok(HttpRequest {
            method: self.method.ok_or(BuilderError.Missing("method"))?,
            url:    self.url.ok_or(BuilderError.Missing("url"))?,
            headers: self.headers,
            body:   self.body,
        })
    }
}
```

### Customisations

- `@builder(required)` on a field forces it to be present at `build()`.
- `@builder(optional)` makes it optional even if its type is not
  `Maybe<_>`.
- `@builder(default = expr)` supplies a default on `build()`.
- `@builder(collection(add = add_header))` generates `.add_header(h)`
  in addition to `.with_headers([...])`.
- `@builder(rename = "uri")` renames the setter (`.with_uri(...)`).

## Composing derives

Derives compose left-to-right. `@derive(Clone, Debug, PartialEq,
Default)` generates four separate `implement` blocks, each as if
derived alone. They do not interact.

A derive may depend on another: `@derive(Error)` requires `Display`
be derived or hand-written on the same type. Missing dependencies
emit the corresponding diagnostic ("derive missing dependency") with a suggestion.

## Custom derives

Anyone can add a derive. Write a `@proc_macro_derive(Name)`
function matching the signature `fn<T>() -> TokenStream using [...]`
and it becomes available as `@derive(Name)`.

See [Macro kinds → derive macros](./macro-kinds#derive-macros) for
the full cookbook, and the
[cookbook → write a derive](/docs/cookbook/write-a-derive) tutorial
for a step-by-step walk-through.

## See also

- **[Macro kinds](./macro-kinds)** — how derives fit among the
  four macro forms.
- **[Quote and hygiene](./quote-and-hygiene)** — the mechanism
  derives use.
- **[Token-stream API](./token-api)** — the AST types
  `TypeInfo.fields_of` and friends return.
- **`core.serde`** — `Serialize` / `Deserialize` protocol details
  in the standard library.
- **[Diagnostics](./error-codes)** — how derive-emitted diagnostics
  are structured.
