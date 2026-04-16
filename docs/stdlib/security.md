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
verum analyze --context
```

---

## Declassification

Information-flow enforcement is strict by default: data labelled
`Secret` cannot reach a `Public` sink. But real systems need
controlled exceptions — logs, audits, human-readable summaries. The
compiler supports **declassification** through explicit
capabilities:

```verum
@cap(name = "declassify", domain = "Secret")
pub fn summary_for_audit(data: Labeled<UserData>) -> Text {
    declassify(data, |d| format!("anonymised: {}", d.id.hash()))
}
```

Only functions marked with `@cap(name = "declassify", ...)` can call
`declassify`. The compiler prevents downgrading without the
capability and records the declassification event in the build
manifest.

```bash
verum analyze --declassifications
# Shows every declassification in the binary, with line numbers
# and the capability that permitted it.
```

Guidance:

- Declassify **once**, at the boundary where the decision is made.
- Log the declassification event.
- Pass the declassified value through `Labeled<Public>` so downstream
  code tracks its new label.

## Label polymorphism

Functions can be polymorphic over labels:

```verum
fn map_labeled<T, U, L>(
    x: Labeled<T, L>,
    f: fn(&T) -> U,
) -> Labeled<U, L>
{
    Labeled { label: x.label.clone(), value: f(&x.value) }
}
```

The resulting value carries the same label as the input — the
function is a **neutral** transformation from a security standpoint.

## Region-based isolation in detail

Regions are useful when:

- **Parser state**: an AST lives only for the duration of a parse; no
  need to manage its lifetime beyond that.
- **Request handlers**: every per-request allocation freed at once when
  the response is sent.
- **Bump allocators for hot loops**: no deallocation during the loop;
  bulk-free after.
- **Embedded systems**: fixed-size region; out-of-memory detected at
  allocation, not at runtime panic.

Region semantics:

```verum
new_region::<Scope, _>(|r| {
    let alloc: &'r Node = r.alloc(Node::new(...));
    let child: &'r Node = r.alloc(Node::child_of(alloc));
    process(alloc, child);
    42
})
// All `alloc` / `child` freed here at once.
```

The lifetime `'r` is brand-new to each `new_region` call; values
from one region cannot escape to another. The compiler enforces this
statically.

### Region + CBGR

A region reference `&'r T` is a **tier-1 checked reference** — zero
overhead, compiler-proven non-escape. You get CBGR's safety without
CBGR's 15 ns per-deref cost, because the region's termination is a
proof of liveness.

## Side-channel awareness

Verum does not promise constant-time execution by default. For
cryptographic code, use the `constant_time` marker:

```verum
@constant_time
fn secure_compare(a: &[Byte], b: &[Byte]) -> Bool {
    if a.len() != b.len() { return false; }
    let mut diff: Byte = 0;
    for i in 0..a.len() {
        diff |= a[i] ^ b[i];
    }
    diff == 0
}
```

`@constant_time` enforces:

- No data-dependent branches.
- No data-dependent memory accesses.
- No calls to non-constant-time functions.
- No dispatch through `dyn T`.

The compiler rejects functions whose body violates these rules.

## Secure-by-default primitives

```verum
// Random — uses the OS RNG, not the userland PRNG.
let nonce = security::random_bytes(32);

// Zeroise — compiler refuses to dead-store-optimise away:
let mut secret = load_secret();
use_secret(&secret);
security::zeroise(&mut secret);

// Secure allocator — pages never swapped, locked in memory:
let buffer = security::SecureBuf.with_capacity(1024);

// Timing-safe comparison (see @constant_time above).
```

## Cross-references

- **[language/attributes](/docs/language/attributes)** — `@cap`,
  `@label`, `@constant_time`.
- **[language/capability-types](/docs/language/capability-types)** —
  the `T with [Read, Write]` machinery.
- **[`stdlib/context`](/docs/stdlib/context)** — capability-carrying
  contexts.
- **[verification/gradual-verification](/docs/verification/gradual-verification)**
  — information-flow checks run at `@verify(static)`.
- **[guides/security](/docs/guides/security)** — practical security
  guide.
