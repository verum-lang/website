---
sidebar_position: 10
title: Memory Safety (CBGR)
description: Build a doubly-linked list three ways to understand tier 0, tier 1, and tier 2 references.
---

# Tutorial: Memory Safety with CBGR

CBGR — Capability-Based Generational References — is Verum's memory
safety system. Rather than a single ownership model (like Rust) or a
garbage collector (like Go), CBGR offers **three reference tiers**
with different cost/safety trade-offs.

This tutorial walks through a small project: **a doubly-linked list
(DLL)** implemented three ways, one per tier. By the end you'll see
when each tier is appropriate and how the compiler promotes between
them automatically.

**Time: 45 minutes.**

**Prerequisites:** [Hello, World](/docs/getting-started/hello-world),
basic familiarity with `&T`.

## The reference tiers at a glance

| Tier | Syntax          | Runtime cost                              | Invariant provided by     |
|------|-----------------|-------------------------------------------|---------------------------|
| 0    | `&T`            | ~0.93 ns measured (≤ 15 ns design target) | CBGR generation counter   |
| 1    | `&checked T`    | 0 ns                                      | Compiler escape analysis  |
| 2    | `&unsafe T`     | 0 ns                                      | You, with `// SAFETY: …`  |

See [language/references](/docs/language/references) for the
normative reference.

## Step 1 — Set up the project

```bash
$ verum new dll --profile systems
$ cd dll
```

Create `src/lib.vr`:

```verum
pub type Node<T> is {
    value: T,
    next:  Maybe<Heap<Node<T>>>,
    prev:  Maybe<Heap<Node<T>>>,
};

pub type DllT0<T> is {       // tier 0 — plain &T throughout
    head: Maybe<Heap<Node<T>>>,
    tail: Maybe<Heap<Node<T>>>,
    len:  Int,
};
```

A doubly-linked list has *two* pointers per node (forward and
backward) — a classic example where ownership is ambiguous.

## Step 2 — Tier 0: the managed DLL

Implement the default `DllT0`:

```verum
// src/t0.vr
mount .self.lib.*;

impl<T> DllT0<T> {
    pub fn new() -> Self {
        Self { head: Maybe.None, tail: Maybe.None, len: 0 }
    }

    pub fn push_front(&mut self, value: T) {
        let new_node = Heap.new(Node {
            value,
            next: self.head.clone(),
            prev: Maybe.None,
        });

        if let Maybe.Some(old_head) = &self.head {
            old_head.as_mut().prev = Maybe.Some(new_node.clone());
        } else {
            self.tail = Maybe.Some(new_node.clone());
        }
        self.head = Maybe.Some(new_node);
        self.len += 1;
    }

    pub fn iter(&self) -> impl Iterator<Item = &T> {
        gen{
            node.value for node in self.node_iter()
        }
    }

    fn node_iter(&self) -> impl Iterator<Item = &Node<T>> {
        let mut current = self.head.as_ref();
        gen{
            let n = current.unwrap().as_ref();
            current = n.next.as_ref();
            n
        }
    }
}
```

Run:

```bash
$ verum run
```

Every `&self` and every `&Node<T>` in the `node_iter` is a **tier 0
reference** — 15 ns per dereference. For a DLL traversal, this is
fine — the generation check protects you from use-after-free and
mid-iteration mutation.

### Check the generated code

```bash
$ verum check --tier-report | head -20
  src/t0.vr:6   DllT0::new          T0 ref: 0   T1 ref: 0   T2 ref: 0
  src/t0.vr:10  DllT0::push_front   T0 ref: 2   T1 ref: 0   T2 ref: 0
  src/t0.vr:22  DllT0::iter         T0 ref: 1   T1 ref: 1   T2 ref: 0
```

The `iter` function's `current` binding is automatically
**promoted to tier 1** — the compiler proved it cannot escape.

## Step 3 — Tier 1: explicit `&checked`

Sometimes you want to assert tier-1 explicitly, to make the escape
analysis visible:

```verum
// src/t1.vr
pub fn sum_t1(list: &checked DllT0<Int>) -> Int {
    let mut total = 0;
    for &v in list.iter() {
        total += v;
    }
    total
}
```

`&checked DllT0<Int>` forces the compiler to prove the reference
cannot escape. If escape analysis fails, the compile fails with a
diagnostic:

```
error[V5101]: could not promote to &checked
  --> src/t1.vr:3:21
   |
 3 | pub fn sum_t1(list: &checked DllT0<Int>) -> Int {
   |                     ^^^^^^^^ reference escapes via ...
   = note: leaked through `Shared.new(list)` at line 7
```

## Step 4 — Tier 2: `&unsafe` for the raw path

For a DLL implementation that compiles to a C-ABI-compatible struct,
drop to tier 2:

```verum
// src/t2.vr
@repr(C)
pub type RawNode<T> is {
    value: T,
    next:  *unsafe mut RawNode<T>,
    prev:  *unsafe mut RawNode<T>,
};

@repr(C)
pub type RawDll<T> is {
    head: *unsafe mut RawNode<T>,
    tail: *unsafe mut RawNode<T>,
    len:  Int,
};

impl<T> RawDll<T> {
    pub fn new() -> Self {
        Self { head: null_mut(), tail: null_mut(), len: 0 }
    }

    // SAFETY: `value` must be valid for reading; called in exclusive-access
    //         mode only; no external references to `self.head` exist.
    pub unsafe fn push_front(&mut self, value: T) {
        let layout = Layout.new::<RawNode<T>>();
        let new_node: *unsafe mut RawNode<T> = alloc(layout) as *unsafe mut _;
        *new_node = RawNode { value, next: self.head, prev: null_mut() };

        if !self.head.is_null() {
            (*self.head).prev = new_node;
        } else {
            self.tail = new_node;
        }
        self.head = new_node;
        self.len += 1;
    }
}
```

`&unsafe mut` references carry zero runtime check. Every
dereference must be in an `unsafe` block, and you document the
safety invariant with `// SAFETY:` comments.

Use tier 2 when:

- You need a specific memory layout (`@repr(C)`) for FFI.
- You're implementing a low-level data structure (e.g. a lock-free
  queue) where CBGR's check is what you're *trying to replace*.
- You own the safety proof and can articulate it.

## Step 5 — When the compiler promotes automatically

Verum's CBGR pass runs escape analysis on every `&T`. If the
reference cannot escape its enclosing function's scope, it's
promoted to tier 1 silently:

```verum
fn in_scope() -> Int {
    let x = 42;
    let r: &Int = &x;        // automatically tier 1
    *r
}                            // r cannot escape — 0 ns
```

versus:

```verum
fn escapes() -> Shared<Int> {
    let x = 42;
    Shared.new(x)            // escape — but via move, not borrow
}
```

or:

```verum
fn escapes_via_ref(out: &mut &Int) {
    let x = 42;
    *out = &x;               // REJECTED — &x escapes, x drops
}                            // compiler catches this
```

The compiler prints promotion/rejection reasons via
`verum check --tier-report`.

## Step 6 — Build and benchmark

Configure three builds:

```toml
# Verum.toml
[profile.managed]
runtime.cbgr_mode = "managed"     # all refs stay tier 0

[profile.checked]
runtime.cbgr_mode = "checked"     # promote aggressively

[profile.mixed]
runtime.cbgr_mode = "mixed"       # default
```

```bash
$ verum build --profile managed --release
$ verum bench
   dll-push-front/managed  11.8 ns/op
   dll-push-front/mixed     7.4 ns/op
   dll-push-front/checked   4.2 ns/op
```

The `managed` profile always runs the 15 ns check; `mixed` eliminates
the check where provably safe (the default); `checked` forces the
compiler to prove every `&T` safe or fail.

## What you learned

- **Tier 0** (`&T`) is the default — 15 ns safety check, suitable for
  everything by default.
- **Tier 1** (`&checked T`) is what tier 0 **compiles to** when
  escape analysis succeeds. Use the explicit form when you want to
  guarantee a function signature is zero-cost.
- **Tier 2** (`&unsafe T`) is for FFI and low-level code that owns
  its safety proof.
- The compiler's **CBGR pass** promotes where safe and reports the
  result via `verum check --tier-report`.
- The `[runtime].cbgr_mode` manifest field lets you pick the
  policy per profile.

## Further reading

- **[language/memory-model](/docs/language/memory-model)** — the
  ownership story.
- **[language/references](/docs/language/references)** — the full
  reference grammar and semantics.
- **[language/cbgr](/docs/language/cbgr)** — the CBGR machinery.
- **[architecture/cbgr-internals](/docs/architecture/cbgr-internals)** —
  `ThinRef` / `FatRef` layout, generation counter semantics.
- **[cookbook/references](/docs/cookbook/references)** — task-oriented
  reference recipes.
- **[cookbook/arenas](/docs/cookbook/arenas)** — typed arenas, the
  common alternative to DLLs.
- **[cookbook/shared-ownership](/docs/cookbook/shared-ownership)** —
  `Shared<T>`, `Rc<T>`, `Weak<T>`.
