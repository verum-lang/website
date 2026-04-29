---
title: "`Shared<T>` and cycle-breaking with `Weak<T>`"
description: "Multi-owner heap, reference counting, breaking cycles without leaks."
---

# `Shared<T>` + `Weak<T>`

`Heap<T>` is unique ownership; `Shared<T>` is multiple owners via
atomic reference counting. `Weak<T>` breaks cycles.

### When to reach for `Shared`

- Multiple tasks need the same data.
- You want the data freed automatically when no one references it.
- You can't (or don't want to) impose a single owner.

```verum
let config: Shared<Config> = Shared.new(load_config());
let copy1 = config.clone();        // bumps strong count to 2
let copy2 = config.clone();        // 3
Shared.strong_count(&config);     // -> 3
```

All clones point to the same heap allocation. The allocation is
freed when the last `Shared<Config>` is dropped.

### `Shared.get_mut` — safe interior mutation

```verum
let mut s: Shared<i32> = Shared.new(42);
*Shared.get_mut(&mut s).unwrap() += 1;    // Some(&mut) when strong_count == 1
```

Returns `Some(&mut T)` only when no other `Shared` clone exists.
For shared mutation, wrap in a lock: `Shared<Mutex<T>>`.

### Cycles leak without `Weak`

Children pointing to parents via `Shared` creates a reference cycle
that ARC can't break:

```verum
type Node is {
    value: Int,
    parent: Maybe<Shared<Node>>,
    children: List<Shared<Node>>,
};
// Parent owns child; child owns parent. Neither refcount reaches 0.
// Memory leaks.
```

### Break with `Weak`

```verum
type Node is {
    value: Int,
    parent: Maybe<Weak<Node>>,           // ← non-owning
    children: List<Shared<Node>>,
};

implement Node {
    fn new(value: Int) -> Shared<Node> {
        Shared.new(Node { value, parent: Maybe.None, children: List.new() })
    }

    fn add_child(parent: &Shared<Node>, child: Shared<Node>) {
        // Give child a weak pointer back to parent.
        let mut child_inner = Shared.get_mut(&mut child.clone()).unwrap();
        child_inner.parent = Maybe.Some(Shared.downgrade(parent));
        // Parent owns child.
        parent.children.push(child);
    }

    fn parent(&self) -> Maybe<Shared<Node>> {
        self.parent.as_ref().and_then(Weak.upgrade)
    }
}
```

- `Shared.downgrade(&s) -> Weak<T>` — creates a non-owning handle.
- `Weak<T>.upgrade() -> Maybe<Shared<T>>` — returns `Some` if the
  target is still live; `None` if the last `Shared` was dropped.
- `Weak` doesn't keep the allocation alive; cycles involving only
  `Shared` + `Weak` free correctly.

### Typical cases

| Relationship | Pattern |
|---|---|
| Tree (parents own children) | parents `Shared`, children `Weak` back-pointer |
| Observer | subject keeps `List<Weak<Observer>>`; observers hold `Shared<Subject>` (or nothing) |
| Cache with weak refs to loaded values | `Map<Key, Weak<Value>>` |
| Graph with shared nodes | `Shared<Mutex<GraphData>>` — central data, avoid cycles altogether |

### Count inspection

```verum
Shared.strong_count(&s)      // current number of Shared clones
Shared.weak_count(&s)        // current number of Weak clones
```

### Thread-safety

- `Shared<T>` is `Send` and `Sync` when `T: Send + Sync`.
- Cloning / dropping is atomic.
- **Interior mutation still needs synchronisation** — wrap in `Mutex<T>`
  / `RwLock<T>` / `AtomicCell<T>` for multi-task writes.

### Pitfall — accidentally constructing a cycle

Always audit *both directions*: if a `Shared<Parent>` holds a
`List<Shared<Child>>` and `Shared<Child>` holds a `Shared<Parent>`,
you have a cycle. One of the two arrows **must** be `Weak`.

### `Rc<T>` — the single-threaded alternative

`Rc<T>` has the same shape as `Shared<T>` but is `!Send` (no atomics).
Significantly cheaper:

| Op | `Shared<T>` | `Rc<T>` |
|---|---|---|
| `.clone()` | atomic fetch-add | plain increment |
| `.drop()` | atomic fetch-sub + (maybe) free | plain decrement |

Use `Rc<T>` inside single-threaded code (GUI main thread, WASM,
parser internal state).

### See also

- **[base → memory](/docs/stdlib/base#heap-shared-cow-pin)** —
  `Heap`, `Shared`, `Weak`, `Rc`.
- **[mem](/docs/stdlib/mem#sharedt--atomically-ref-counted)** —
  implementation details.
- **[Shared state](/docs/cookbook/shared-state)** — multi-task
  mutation patterns.
