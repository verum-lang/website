---
sidebar_position: 2
title: collections
---

# `core::collections` — Lists, Maps, Sets, Deques

Semantic-honest collection types. Default implementations are chosen
by the compiler; your code talks only to the protocol.

## `List<T>`

Dynamic, indexable, ordered collection. Amortised O(1) push, O(1)
random access, O(n) insert-at-middle.

```verum
let mut xs: List<Int> = list![];
xs.push(1); xs.push(2); xs.push(3);
xs.insert(1, 10);             // [1, 10, 2, 3]
let y = xs.pop();             // Maybe.Some(3)
let z = xs[0];                // 1

let sum: Int = xs.iter().sum();
let doubled: List<Int> = xs.iter().map(|x| x * 2).collect();
let firsts: [Int; 2] = xs[..2];
```

Key methods: `len()`, `is_empty()`, `push`, `pop`, `insert`, `remove`,
`clear`, `swap`, `sort`, `reverse`, `dedup`, `retain`, `extend`, `iter`,
`iter_mut`, `drain`, `chunks`, `windows`, `split_at`, `concat`.

The `list![...]` macro builds a `List<T>` from its elements;
`list![x; n]` builds a list of length `n` filled with `x`.

## `Map<K, V>`

Hash map with fast average-case lookup. `K: Hash + Eq`.

```verum
let mut m: Map<Text, Int> = map![];
m.insert("one", 1);
m.insert("two", 2);

if let Maybe.Some(&v) = m.get("one") { print(f"one = {v}"); }

// Entry API
m.entry("three").or_insert_with(|| compute());
*m.entry("one").or_default() += 10;

for (k, v) in m.iter() { print(f"{k}={v}"); }
```

Key methods: `insert`, `remove`, `get`, `contains_key`, `entry`,
`keys`, `values`, `iter`, `iter_mut`, `drain`, `extend`.

## `Set<T>`

Hash set. `T: Hash + Eq`.

```verum
let mut s: Set<Int> = set![1, 2, 3];
s.insert(4);
if s.contains(&2) { ... }

let union:    Set<Int> = s.union(&other).collect();
let inter:    Set<Int> = s.intersection(&other).collect();
let diff:     Set<Int> = s.difference(&other).collect();
```

## `Deque<T>`

Double-ended queue. O(1) push/pop at both ends.

```verum
let mut q: Deque<Int> = deque![];
q.push_front(1);
q.push_back(2);
let f = q.pop_front();
```

## `BinaryHeap<T>` / `MinHeap<T>`

Priority queue.

```verum
let mut pq: BinaryHeap<Int> = heap![3, 1, 4, 1, 5];
let top = pq.peek();                // Maybe.Some(&5)
let next = pq.pop();                // Maybe.Some(5)
```

## `BTreeMap<K, V>` / `BTreeSet<T>`

Ordered map / set (red-black tree). `K: Ord`. O(log n) operations;
ordered iteration.

```verum
let mut bm: BTreeMap<Int, Text> = btree_map![];
bm.insert(3, "three");
bm.insert(1, "one");
bm.insert(2, "two");

for (k, v) in bm.iter() {
    print(f"{k} -> {v}");    // 1->one, 2->two, 3->three
}

let range: BTreeMap<Int, Text> = bm.range(2..).collect();
```

## Iterators are free

Every collection produces iterators that compose with zero allocation
until a terminal `collect`. Chain `map`, `filter`, `take`, `skip`,
`zip`, `chain`, `flat_map` freely.

## From / Into

```verum
let l: List<Int>  = (1..=5).collect();
let s: Set<Int>   = l.iter().copied().collect();
let m: Map<Int, Int> = (0..10).map(|i| (i, i*i)).collect();
```

## Performance defaults

| Collection | Default implementation |
|-----------|------------------------|
| `List<T>` | growable contiguous buffer, factor = 2 |
| `Map<K,V>` | Swiss-table (Google's flat-hashmap style) |
| `Set<T>` | Swiss-set |
| `BTreeMap<K,V>` | red-black tree, B=12 cache-friendly |
| `BinaryHeap<T>` | array-backed binary heap |
| `Deque<T>` | ring buffer |

You can opt into alternative implementations via attributes:

```verum
@repr(contiguous, growth = 3)
let xs: List<Int> = ...;
```

## See also

- **[base — Iterator](/docs/stdlib/base)** — the iterator protocol.
- **[text](/docs/stdlib/text)** — `Text` (string collection).
