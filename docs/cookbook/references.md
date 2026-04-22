---
title: When to use `&checked T` vs `&T` vs `&unsafe T`
description: Three reference tiers, one decision.
---

# Reference tiers — a decision flowchart

**In order, ask yourself:**

### 1. Do I care about the ~0.93 ns per deref?

- **No** → use `&T`. Default for 90%+ of code.
- **Yes** → continue.

### 2. Can the compiler prove the reference never outlives its target?

- **Yes, automatically** — escape analysis promotes `&T` to `&checked T`.
  Cost: 0 ns. You don't have to do anything.
- **Yes, but I want to guarantee it** — ask for `&checked T`
  explicitly. If the compiler can't prove it, you get an error
  telling you exactly what's wrong.
- **No, and I'm willing to prove it myself** → `&unsafe T`.

### 3. Otherwise

`&T`. The 15 ns is invisible in almost all code.

---

## Default case

```verum
fn area(r: &Rectangle) -> Float {
    r.width * r.height                // CBGR-checked deref
}
```

95% of the time this is what you want. Escape analysis typically
eliminates the check during AOT.

---

## Explicit `&checked T`

```verum
fn dot_product(a: &checked [Float; 3], b: &checked [Float; 3]) -> Float {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
```

Use `&checked T` when:

- The function is on a performance-critical path (profile confirms).
- You want the compiler to refuse code that would require runtime checks.
- The caller naturally holds a reference for the duration of the call
  (stack-local, no storage in between).

If the compiler can't prove it's safe:

```
error[V5201]: cannot prove reference is safe for `&checked T`
  --> src/compute.vr:12:21
   |
12 | fn dot(a: &checked List<Float>, b: &checked List<Float>) -> Float {
   |                  ^^^^^^^^^^^^^ argument `a` may escape into
   |                                `self.store` at line 28
   = help: either use `&T` (CBGR-checked) or ensure `a` is not stored.
```

---

## `&unsafe T`

```verum
unsafe fn memcpy_like(dst: &unsafe mut [Byte], src: &unsafe [Byte]) {
    // SAFETY: callers guarantee dst.len() >= src.len() and the
    // regions do not overlap.
    for i in 0..src.len() {
        unsafe { dst[i] = src[i]; }
    }
}
```

Use `&unsafe T` when:

- Writing FFI wrappers — pointers come from C code.
- Implementing primitives in `core::mem`.
- You need zero cost AND the compiler cannot prove safety AND you can
  articulate why it's safe in a comment.

Every `&unsafe T` use must be justified. Convention:

```verum
// SAFETY: <the invariant you rely on, and how it's ensured>.
let out: &unsafe T = ...;
```

---

## Promotion inspection

```bash
verum analyze --escape
```

```
function             total   tier0   tier1   tier2   promoted
process                  42       3      39       0     39/42 (92.9%)
tight_loop                8       0       8       0      8/8  (100%)
vec_sum                  64      44      18       2     18/64 (28.1%)
```

- **tier0** = `&T` with a runtime CBGR check.
- **tier1** = `&checked T` (or promoted).
- **tier2** = `&unsafe T`.

A low promotion rate on a hot function means the compiler had to keep
the check. Investigate — often it's because:

- The reference is stored in a struct (breaks escape tracking).
- It's returned from a function whose inputs are all owned (nothing
  to borrow from).
- It crosses an opaque function boundary (closures, trait objects,
  async suspensions).

---

## Idioms

### Short-lived borrow in a loop

```verum
for item in &items {       // &item is &Item, promoted
    process(item);
}
```

Almost always a zero-cost `&checked`.

### Stored reference → own it instead

```verum
// Tempting but hard to promote
type Cache<'a> is { data: &'a Map<Key, Value> };

// Easier to optimise, same semantics in practice
type Cache is { data: Shared<Map<Key, Value>> };
```

Using `Shared<T>` has a pointer + refcount; `&T` has a pointer +
generation + epoch+caps. In practice the Shared version inlines better.

### Chained methods

```verum
user.address.city.name       // each `.` deref is ~0.93 ns unless promoted
```

The optimiser typically collapses adjacent CBGR checks into one
validation at the head of the chain.

---

## See also

- **[Language → CBGR](/docs/language/cbgr)** — how the check works.
- **[Architecture → CBGR internals](/docs/architecture/cbgr-internals)**
  — data structures, escape analysis, promotion algorithm.
- **[Performance](/docs/guides/performance)** — when 15 ns matters.
