---
sidebar_position: 14
title: capabilities — @cap, declassification, audit
description: Capability annotations, declassification primitives, and the build-manifest audit trail for security-sensitive operations.
---

# `core::security::capabilities` — capability annotations & audit

## What is a capability?

A **capability** in Verum is a compile-time token that says
"this code is allowed to do X". Capabilities are not runtime
values — they're annotations (`@cap(...)`) on functions, checked at
compile time, recorded in the build manifest for audit.

The three canonical security capabilities:

| Capability | Grants | When to grant |
|---|---|---|
| `declassify` | Lowering a [label](/docs/stdlib/security/labels) (e.g. `Secret → Public`) | Audit paths, sanitised telemetry, client-facing output |
| `unsafe_ffi` | Calling into non-Verum code | Wrapping a vetted C library |
| `admin` | Calling admin-only operations (`DROP TABLE`, user-deletion, …) | Operations behind an auth gate |

Applications can define more capabilities specific to their domain.
See [custom capabilities](#custom-capabilities) below.

## The three-part contract

When you mark a function with `@cap(name = "X")`:

1. **Only functions themselves bearing `@cap(X)` may call it.** The
   compiler rejects any call path that doesn't transitively carry
   the capability.
2. **The capability is recorded in the build manifest.** Running
   `verum analyze --declassifications` lists every declassification
   site in the final binary, with file/line and the reason.
3. **Label-downgrade operations** (`declassify`) refuse to execute
   unless the surrounding function carries the matching `@cap`.

The capability is a compile-time construct; no runtime overhead.
Authority flows *down* the call graph from a root function that
has been explicitly granted it.

---

## `@cap` annotation

### Syntax

```verum
@cap(name = "CAP_NAME")
pub fn priv_operation() { ... }

@cap(name = "declassify", domain = "Secret")
pub fn reveal_for_audit(x: Labeled<Text>) -> Text { ... }

@cap(name = "admin")
pub async fn drop_table(name: &Text) using [Database with [Admin]] {
    Database.execute(sql#"DROP TABLE ${name}").await?;
}
```

### Granting a capability to the caller

A function marked `@cap(name = "admin")` may be called only from
another function marked `@cap(name = "admin")` (or higher). The
chain of calls must be continuous — the capability flows down, it
doesn't magically appear mid-chain.

Root sources of capabilities:

- **`fn main`** — the top-level main function can be granted all
  capabilities via an explicit list in `Verum.toml`:
  ```toml
  [capabilities]
  main_caps = ["declassify:Secret", "admin", "unsafe_ffi"]
  ```
- **Attribute-annotated entry points** — e.g. a CLI subcommand
  explicitly marked `@cap(name = "admin")` + the user passing
  `--admin` at runtime before the function runs.

If you try to call `drop_table` from a function that isn't
`@cap("admin")` without granting the capability, you get a
compile error pointing to the call site.

### Label-scoped capabilities

The `declassify` capability takes an optional `domain` argument
restricting it to a label prefix:

```verum
@cap(name = "declassify", domain = "Secret")
// ^^^ can declassify Secret-labelled values, nothing higher
fn audit_summary(s: Labeled<Text>) -> Text { declassify(s) }

@cap(name = "declassify", domain = "Internal")
// ^^^ can declassify Internal but NOT Secret
fn public_render(s: Labeled<Text>) -> Text { declassify(s) }
```

This gives fine-grained control — a service handling both Secret
medical data and Internal metrics can hold the right label
capability per module.

---

## `declassify` primitive

### Signature

```verum
pub fn declassify<T>(x: Labeled<T>) -> T;
```

Explicitly lowers a labelled value to an unlabelled plain `T`. The
compiler rejects this call unless the surrounding function holds
the `@cap(name = "declassify", domain = ...)` covering the input's
label.

### Usage pattern

```verum
use core.security.labels.{Label, Labeled, labeled};

@cap(name = "declassify", domain = "Secret")
pub fn summary_for_audit(data: Labeled<UserData>) -> Text {
    let raw = declassify(data);   // legal — we hold the cap
    f"anonymised: {}", raw.id.hash())
}
```

The key property: only `summary_for_audit` can produce the
declassified form. A logger that tries to log the raw value has to
come through `summary_for_audit` — and reviewers can audit it once.

### Every declassify call is audited

```bash
verum analyze --declassifications
```

Prints:

```
core/billing/audit.vr:47   declassify Secret→Public     @cap "declassify:Secret"
core/notifications/sms.vr:83 declassify Internal→Public   @cap "declassify:Internal"
```

Make this a required CI step. Any new declassification site that
didn't exist last release surfaces for review. Security review can
focus on the handful of declassify sites rather than the entire
codebase.

---

## Custom capabilities

Your application can define arbitrary capabilities:

```verum
// in your codebase:
@cap(name = "billing.write")
pub fn charge_card(customer: CustomerId, amount: Money) { ... }

@cap(name = "billing.write", name = "admin")     // union of caps
pub fn refund(charge: ChargeId) { ... }
```

Capabilities are just symbolic identifiers — the compiler enforces
the transitive-closure rule, your build manifest lists the grants,
and your security review reviews the list.

Naming convention: `domain.action` (e.g. `billing.write`,
`telemetry.read_raw`, `auth.impersonate`). Hierarchical names give
audit tools something to group on.

---

## Inspecting the capability surface

### Per-build audit

```bash
verum analyze --context       # all @cap annotations + their call chains
verum analyze --capabilities  # summary table
```

Output:

```
Capability           Used by              Grant roots
───────────────────────────────────────────────────────────
admin                 3 fns (core/...)    fn main (Verum.toml)
declassify:Secret     2 fns (core/...)    fn run_audit (@cap in src)
unsafe_ffi            1 fn  (core/...)    fn call_openssl (@cap in src)
```

### Per-function query

```bash
verum explain fn my_module::charge_card
```

Output:

```
fn my_module::charge_card
├── @cap(name = "billing.write")
├── Called from:
│   └── handlers::pay_endpoint          @cap("billing.write")
│       └── fn main                     @cap("billing.write") via Verum.toml
└── Requires: [Database with [Write]]
```

### Diff against last release

```bash
verum analyze --capabilities-diff origin/main..HEAD
```

Shows caps added, removed, or now-newly-required. Perfect for PR
reviews — flags "this change introduces a new declassify" without
the reviewer having to spot it by hand.

---

## Grant sources — where capabilities start

### `fn main` entry point

The root entry point can declare which capabilities it holds:

```toml
# Verum.toml
[capabilities]
main_caps = ["admin", "declassify:Secret"]
```

```verum
// All code reachable from `fn main` can call functions requiring
// these caps. The set is recorded in the build artefact.
fn main() using [Config] { ... }
```

### Scoped grant blocks

For more fine-grained control, capabilities can be scoped to a
block:

```verum
@cap(name = "declassify", domain = "Secret")
fn audit_job() {
    for record in all_records() {
        // declassify allowed here (we hold the cap)
        let text = declassify(record.email);
        write_audit_log(&text);
    }
    // After this fn returns, other code in this module cannot
    // declassify Secret without its own @cap annotation.
}
```

### CLI-gated capabilities (runtime check + compile-time plumbing)

A pattern for operator tools:

```verum
fn main(args: Args) {
    if args.contains("--unsafe") {
        grant_cap!("unsafe_ffi", || run_diagnostics());
    } else {
        run_normal();
    }
}
```

(This is a pattern; Verum doesn't yet have `grant_cap!` as a
first-class macro. Today you'd have two main-branch builds or a
separate entry point.)

---

## Comparison — capabilities vs. runtime checks

| Aspect | Capabilities | Runtime auth |
|---|---|---|
| When checked | Compile time | Request time |
| Audit trail | Build manifest | Log lines |
| Failure mode | Won't compile | Runtime error |
| Granularity | Per function | Per call |
| Cost | Zero runtime overhead | ~0.1 µs per check |
| Best for | Structural guarantees | Per-user/tenant decisions |

Capabilities are for **static** security properties — "this binary
cannot possibly access X without declassify". Runtime auth is for
**dynamic** per-request decisions — "this particular user cannot
delete that particular row".

Use both. They don't conflict.

---

## Relation to effects / contexts

Verum's `using [Database]` context system is adjacent but distinct.
Contexts are *runtime* values (a Database connection, a Logger) —
capabilities are *compile-time* attestations.

A function that needs both:

```verum
@cap(name = "admin")
async fn drop_table(name: &Text) using [Database with [Admin]] {
    // @cap ensures this binary has the `admin` capability compiled in.
    // `using [Database with [Admin]]` ensures this call ran with an
    // admin-scoped Database connection at runtime.
    Database.execute(sql#"DROP TABLE ${name}").await?;
}
```

The two layers catch different classes of bug:

- `@cap` catches "this binary shouldn't even be capable of
  declassification".
- `using` catches "this particular call shouldn't run without
  admin privileges".

---

## Security considerations

### Don't grant capabilities bulk

A function that requires three capabilities and gets four is
strictly worse than a function that requires three. Grant the
minimum each chain needs.

### Review every `@cap` in PRs

Every new `@cap` annotation widens the capability surface. Every
new declassify call removes a structural guarantee. CI should flag
capability changes as requiring extra scrutiny.

### `unsafe_ffi` especially

`unsafe_ffi` lets the function escape Verum's safety guarantees
(memory safety, information flow, capability tracking) for the
duration of the FFI call. Wrap FFI calls in the smallest possible
`@cap(unsafe_ffi)` function; never smuggle pointers out.

### Capability laundering

The compiler does NOT let a function without `@cap(X)` obtain one
at runtime — there's no `try_get_cap("X")` API. If you want an
operator-gated capability, use a separate entry point or build
profile (as in the CLI-gated pattern above).

---

## File layout

Capabilities are a language feature with scattered stdlib support;
there is no single `core/security/capabilities.vr` file — the
enforcement lives in the compiler and the `@cap` attribute
registry.

## Related modules

- [`labels`](/docs/stdlib/security/labels) — what `declassify`
  lowers.
- [`language/attributes`](/docs/language/attributes) — the
  `@cap` attribute surface.
- [`tooling/cli`](/docs/tooling/cli) — `verum analyze`
  subcommands.
- [`verification/gradual-verification`](/docs/verification/gradual-verification) —
  how capability checks interact with the `@verify(static)` pipeline.

## References

- Miller, [Robust Composition: Towards a Unified Approach to Access
  Control and Concurrency Control](http://www.erights.org/talks/thesis/markm-thesis.pdf) (2006) — the object-capability
  model that inspired Verum's `@cap` design.
- [Cap'n Proto capabilities](https://capnproto.org/rpc.html#security) — runtime capability dispatch
  for inter-process.
- [Pony capabilities](https://tutorial.ponylang.io/capabilities/capabilities.html) — another language with capability-first design.
