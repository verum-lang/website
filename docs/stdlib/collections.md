---
sidebar_position: 2
title: collections
description: List, Map, Set, Deque, BinaryHeap, BTreeMap, BTreeSet — every semantic-honest collection.
---

# `core.collections` — Lists, Maps, Sets, Deques

Semantic-honest data structures. You talk to the protocol; the compiler
chooses the implementation.

## Module status

Each `core.collections.*` module carries an explicit conformance status
so you know what you can rely on today versus what is still in flight.
The status is the truth-table over the module's API surface as exercised
by `core-tests/collections/<module>/` under both `verum test --interp`
(Tier 0 VBC interpreter) and `verum test --aot` (Tier 2 LLVM AOT).

| Status | Meaning |
|---|---|
| **stable** | Every public method is conformance-tested. Algebraic laws are pinned by exhaustive or large-domain property tests. Cross-stdlib integration is verified. Interpreter and AOT agree on every test. Safe to depend on in production. |
| **partial** | Subset of the public API is conformance-tested and stable. The rest is exercised in `regression_test.vr` via `@ignore`d tests pinning the specific defects that block coverage. The non-ignored API surface is safe; everything else is documented per-module under "Open defects". |
| **regression-only** | Module is gated by upstream stdlib / language-level defects. Public-API tests do not pass yet — only `@ignore`d regressions exist to lock the bug shapes. Avoid in production until promoted. |
| **undocumented** | Documentation in this reference is authoritative, but the module has not yet been routed through the `core-tests/` conformance suite. The current page is a best-effort snapshot of the source; it may drift from runtime behaviour. |

| Module | Status | Conformance suite |
|---|---|---|
| `list.vr`           | undocumented | — |
| `map.vr`            | undocumented | — |
| `set.vr`            | undocumented | — |
| `multiset.vr`       | undocumented | — |
| `deque.vr`          | undocumented | — |
| `heap.vr`           | undocumented | — |
| `btree.vr`          | undocumented | — |
| `slice.vr`          | undocumented | — |
| `lru.vr`            | undocumented | — |
| `ttl_cache.vr`      | undocumented | — |
| `bloom.vr`          | undocumented | — |
| `hyperloglog.vr`    | undocumented | — |
| `count_min.vr`      | undocumented | — |
| `reservoir.vr`      | **partial**  | [core-tests/collections/reservoir](https://github.com/verum-lang/verum/tree/main/core-tests/collections/reservoir) — 14 unit + 7 property + 4 integration + 4 pinned regressions (CSPRNG-gated replacement phase) |
| `consistent_hash.vr`| undocumented | — |
| `adjacency_list.vr` | undocumented | — |
| `alias_sampler.vr`  | undocumented | — |
| `toposort.vr`       | undocumented | — |
| `trie.vr`           | undocumented | — |
| `union_find.vr`     | **partial** | [core-tests/collections/union_find](https://github.com/verum-lang/verum/tree/main/core-tests/collections/union_find) — 31 unit + 14 property + 7 integration + 11 pinned regressions |

### Core data structures

| File | What's in it |
|---|---|
| `list.vr` | `List<T>` + adapters (`ListIter`, `Drain`, `Chunks`, `Windows`, …) |
| `map.vr` | `Map<K,V>` + `MapEntry<K,V>`, `OccupiedEntry`, `VacantEntry`, `MapIter`, `Keys`, `Values`, `Drain` |
| `set.vr` | `Set<T>` + `SetIter`, `SetDrain` |
| `multiset.vr` | `Multiset<T>` (hash bag with strictly-positive multiplicities) + `MultisetIter`, `MultisetDistinctIter` |
| `deque.vr` | `Deque<T>` + `DequeIter`, `DequeDrain` |
| `heap.vr` | `BinaryHeap<T>`, `MinHeap<T>`, `HeapDrainSorted`, `Reverse<T>` |
| `btree.vr` | `BTreeMap<K,V>`, `BTreeSet<T>`, `BTreeEntry`, range iterators |
| `slice.vr` | slice utilities — `slice_iter`, `chunks`, `windows`, `split_at` |

### Caches + probabilistic sketches

| File | What's in it |
|---|---|
| `lru.vr` | `LruCache<K,V>` — pure capacity-bounded LRU |
| `ttl_cache.vr` | `TtlCache<K,V>` — LRU + per-entry TTL |
| `bloom.vr` | `BloomFilter` — "is X present?" probabilistic set |
| `hyperloglog.vr` | `HyperLogLog` — "how many distinct?" cardinality |
| `count_min.vr` | `CountMinSketch` — "how often was X seen?" frequency |
| `reservoir.vr` | `Reservoir<T>` — Algorithm R uniform streaming sample |
| `consistent_hash.vr` | `ConsistentHashRing` — Ketama-compatible distribution |

Every core data structure implements `Iterator`, `IntoIterator`,
`Clone`, `Debug`, `Display`, `Eq`, `Hash`, `Default`.  Hash is always
consistent with Eq under the structure's equality semantics — for
order-independent collections (`Set`, `Map`, `BinaryHeap`) hashing
is deliberately order-independent (XOR-fold over element hashes for
`Set`/`Map`, sort-then-fold for `BinaryHeap`) so the
`a == b → hash(a) == hash(b)` contract holds across distinct internal
arrangements of the same multiset.

Caches and sketches carry stats counters (hits/misses/evicted)
instead of the `Iterator` shape since they're lossy or ordered by
workload rather than enumeration.

---

## `List<T>` — dynamic array

O(1) amortised push/pop at the end; O(1) random access; O(n) insert-
in-middle.

```verum
public type List<T> is { ptr: &unsafe T, len: Int, cap: Int };
```

### Construction

```verum
List.new() -> List<T>
List.with_capacity(capacity: Int) -> List<T>
List.from_slice(slice: &[T]) -> List<T>    // T: Clone
List.from(iter)                            // from any Iterator<Item=T>

let xs = list![1, 2, 3];                    // macro — array of items
let ys = list![0; 10];                      // macro — 10 copies of 0
```

### Capacity & size

```verum
xs.len() -> Int
xs.is_empty() -> Bool
xs.capacity() -> Int
xs.reserve(additional)        xs.reserve_exact(additional)
xs.shrink_to_fit()            xs.shrink_to(min_capacity)
```

### Access

```verum
xs[i]                 // panics on OOB
xs.get(i) -> Maybe<&T>
xs.get_mut(i) -> Maybe<&mut T>
xs.first() / xs.last() -> Maybe<&T>
xs.first_mut() / xs.last_mut() -> Maybe<&mut T>
```

### Mutation

```verum
xs.push(value)
xs.pop() -> Maybe<T>
xs.insert(index, value)
xs.remove(index) -> T
xs.swap_remove(index) -> T         // O(1); destroys order
xs.swap(i, j)
xs.clear()
xs.truncate(len)
xs.extend(other)                   // extend from an iterator
xs.retain(|x| pred(x))             // keep only matching elements
xs.dedup()                         // remove consecutive duplicates (T: PartialEq)
xs.dedup_by(|a, b| same(a, b))
xs.dedup_by_key(|x| key(x))
xs.sort()                          // T: Ord
xs.sort_by(|a, b| a.cmp(b))
xs.sort_by_key(|x| key(x))
xs.sort_unstable()                 // T: Ord, faster, not stable
xs.reverse()
xs.fill(value)                     // T: Clone
xs.fill_with(|| make())
xs.resize(new_len, value)          // T: Clone
```

### Slicing

```verum
xs[a..b]              // panics on OOB range
xs.slice(a, b)        xs.slice_mut(a, b)
xs.split_at(i) -> (&[T], &[T])
xs.split_first() -> Maybe<(&T, &[T])>
xs.split_last()  -> Maybe<(&T, &[T])>
```

### Iteration

```verum
xs.iter()                 // Iterator<&T>
xs.iter_mut()             // Iterator<&mut T>
xs.into_iter()            // consumes xs
xs.drain(a..b)            // removes and yields a range
xs.chunks(n)              // non-overlapping windows; ChunksIter
xs.chunks_exact(n)        // exact-sized chunks + remainder
xs.windows(n)             // sliding window of n; WindowsIter
xs.enumerate_iter()       // convenience (.iter().enumerate() also works)
```

### Searching

```verum
xs.contains(&value) -> Bool                 // T: PartialEq
xs.position(|x| pred(x)) -> Maybe<Int>
xs.rposition(|x| pred(x)) -> Maybe<Int>
xs.binary_search(&value) -> Result<Int, Int>   // T: Ord
xs.binary_search_by(|probe| cmp)
xs.binary_search_by_key(&target, |x| key(x))
xs.partition_point(|x| pred(x)) -> Int
```

### Conversion

```verum
xs.as_slice() -> &[T]
xs.as_mut_slice() -> &mut [T]
xs.to_vec()     // alias for clone-into-new-list
```

### Example

```verum
let mut words = list!["hello", "world", "verum"];
words.sort();
words.dedup();
for (i, w) in words.iter().enumerate() {
    print(f"{i}: {w}");
}

let counts: Map<Int, Int> = words.iter()
    .map(|w| w.len())
    .fold(Map.new(), |mut m, len| {
        *m.entry(len).or_insert(0) += 1;
        m
    });
```

### Pitfall — `swap_remove` destroys order

`swap_remove(i)` is O(1) because it swaps with the last element. If
order matters, use `remove(i)` (O(n)).

---

## `Map<K, V>` — hash map

Swiss-table-style flat hash map. `K: Hash + Eq`.

### Construction

```verum
Map.new() -> Map<K, V>
Map.with_capacity(capacity) -> Map<K, V>
Map.from_iter(iter: Iter<(K,V)>)
let m = map!["a" => 1, "b" => 2];
```

### Size

```verum
m.len()    m.is_empty()    m.capacity()
m.reserve(additional)      m.shrink_to_fit()
```

### Access

```verum
m.get(&key) -> Maybe<&V>
m.get_mut(&key) -> Maybe<&mut V>
m.get_key_value(&key) -> Maybe<(&K, &V)>
m.contains_key(&key) -> Bool
m[&key]                   // panics on missing
```

### Mutation

```verum
m.insert(key, value) -> Maybe<V>       // returns old value if any
m.remove(&key) -> Maybe<V>
m.remove_entry(&key) -> Maybe<(K, V)>
m.clear()
m.retain(|k, v| pred(k, v))
m.extend(iter)                         // iter yields (K, V)
```

### Entry API — insert-or-update without double lookup

```verum
type MapEntry<K: Hash + Eq, V> is
    | Occupied(OccupiedEntry<K, V>)
    | Vacant(VacantEntry<K, V>);

m.entry(key) -> MapEntry<K, V>

entry.or_insert(default) -> &mut V
entry.or_insert_with(|| compute()) -> &mut V
entry.or_insert_with_key(|k| compute(k)) -> &mut V
entry.or_default() -> &mut V           // V: Default
entry.and_modify(|v| mutate(v)) -> MapEntry<K, V>
entry.key() -> &K

// On Occupied only:
occ.get() / occ.get_mut() / occ.into_mut()
occ.insert(value) -> V             // returns old
occ.remove() -> V
occ.remove_entry() -> (K, V)
```

### Iteration

```verum
m.iter()        // Iterator<(&K, &V)>
m.iter_mut()    // Iterator<(&K, &mut V)>
m.into_iter()   // consumes m
m.keys()        // Iterator<&K>
m.values()      // Iterator<&V>
m.values_mut()  // Iterator<&mut V>
m.drain()       // consuming drain — Iterator<(K, V)>
```

### Examples

```verum
// count words
let mut freq: Map<Text, Int> = Map.new();
for w in text.split_whitespace() {
    *freq.entry(w.to_string()).or_insert(0) += 1;
}

// group by key
let mut groups: Map<Int, List<User>> = Map.new();
for u in users {
    groups.entry(u.dept).or_insert_with(List.new).push(u);
}

// atomic upsert
match map.entry(key) {
    MapEntry.Occupied(mut e) => *e.get_mut() += 1,
    MapEntry.Vacant(e) => { e.insert(1); }
}
```

### Pitfall — mutating while iterating

Inserting or removing entries while iterating with `iter`/`iter_mut`
is undefined. Collect the changes and apply after, or use `retain`.

---

## `Set<T>` — hash set

`T: Hash + Eq`.

### Construction

```verum
Set.new()      Set.with_capacity(cap)      Set.from_iter(iter)
let s = set![1, 2, 3];
```

### Size & access

```verum
s.len()  s.is_empty()  s.capacity()
s.contains(&v) -> Bool
s.get(&v) -> Maybe<&T>         // returns the stored value
```

### Mutation

```verum
s.insert(value) -> Bool        // true if it was new
s.remove(&value) -> Bool
s.take(&value) -> Maybe<T>     // remove + return the stored value
s.replace(value) -> Maybe<T>   // replace if present
s.clear()
s.retain(|v| pred(v))
```

### Set algebra

```verum
a.union(&b)         // Iterator<&T>
a.intersection(&b)  // Iterator<&T>
a.difference(&b)    // Iterator<&T>
a.symmetric_difference(&b)  // Iterator<&T>

a.is_disjoint(&b)   a.is_subset(&b)   a.is_superset(&b)
```

### Example

```verum
let a: Set<Int> = set![1, 2, 3, 4];
let b: Set<Int> = set![3, 4, 5, 6];

let union: Set<Int>      = a.union(&b).copied().collect();     // {1..6}
let intersect: Set<Int>  = a.intersection(&b).copied().collect(); // {3,4}
let diff: Set<Int>       = a.difference(&b).copied().collect();   // {1,2}
```

### Protocol implementations

```verum
implement<T: Hash + Eq + Clone>     Clone   for Set<T>;
implement<T: Hash + Eq>             Default for Set<T>;
implement<T: Hash + Eq + Debug>     Eq      for Set<T>;  // delegates to inner Map
implement<T: Hash + Eq>             Hash    for Set<T>;  // order-independent
implement<T: Hash + Eq + Debug>     Debug   for Set<T>;  // {a, b, c}
implement<T: Hash + Eq + Display>   Display for Set<T>;  // {a, b, c}
```

The `Eq` and `Hash` impls are order-independent — two sets with the
same elements but different insertion order compare equal and hash
identically.  Implementation delegates to the underlying
`Map<T, ()>` so set semantics fall out for free from map's
order-independent invariants.

---

## `Multiset<T>` — hash bag with multiplicities

`T: Hash + Eq`. Generalisation of `Set<T>`: every element carries
an integer **multiplicity** ≥ 1. Insert a value already present →
multiplicity increments; remove → decrement; reaching zero evicts
the entry.

Backed by `Map<T, Int>` exactly the way `Set<T>` is backed by
`Map<T, ()>` — same Robin-Hood hashing, same amortised O(1) per-
element ops.

### Two distinct sizes

Multisets have two natural "size" notions, both exposed:

| Method | Returns | Cost |
|---|---|---|
| `distinct_len()` | number of unique elements (= \|support\|) | O(1) |
| `cardinality()` | sum of multiplicities (Σ counts) | O(1) — cached |

The deprecated `len()` is **not** provided to force the choice —
`Set.len()` has one answer, `Multiset.len()` would have two; making
the caller pick prevents silent wrong-size bugs.

### Construction

```verum
Multiset.new()      Multiset.with_capacity(cap)
let m = Multiset.from([1, 2, 2, 3, 3, 3]);
let m = Multiset.from_counts([(1, 1), (2, 2), (3, 3)]);  // (element, multiplicity)
```

### Access

```verum
m.distinct_len() -> Int        // |support|
m.cardinality()  -> Int        // Σ multiplicities
m.is_empty()                   // cardinality == 0
m.count(&v) -> Int             // multiplicity of v (0 if absent)
m.contains(&v) -> Bool         // count(v) > 0
```

### Mutation

```verum
m.insert(value)            -> Int      // returns new multiplicity
m.insert_n(value, n)       -> Int      // increment by n; n ≤ 0 is a no-op
m.remove(&value)           -> Int      // decrement by 1; saturates at 0
m.remove_n(&value, n)      -> Int      // decrement by n; saturates
m.remove_all(&value)       -> Int      // evict entirely; returns evicted count
m.clear()
m.retain(|v, count| pred(v, count))    // keeps `cardinality` consistent
```

Fallible counterparts (`try_insert`, `try_insert_n`, `try_reserve`)
return `Result<_, AllocError>` instead of panicking on growth.

### Algebraic operations

Standard multiset algebra (Knuth TAOCP §4.6.3) over (ℕ, +, max, min):

| Op | Per-element semantics | Notation |
|---|---|---|
| `union(&other)` | max(count_a, count_b) | A ∪ B |
| `intersection(&other)` | min(count_a, count_b) | A ∩ B |
| `sum(&other)` | count_a + count_b | A ⊎ B (multiset disjoint sum) |
| `difference(&other)` | max(0, count_a − count_b) | A − B |

`is_subset / is_superset / is_disjoint` follow the multiset definitions
(every-element multiplicity ≤, ≥, share-no-support respectively).

### Iteration

```verum
m.iter()                       // Iterator<(&T, Int)>           — distinct + multiplicity
m.distinct_iter()              // Iterator<&T>                  — distinct only
m.to_list()       -> List<T>   // expand by multiplicity (cardinality entries)
m.to_count_list() -> List<(T, Int)>   // (element, count) without expansion
```

### Statistics

```verum
m.mode() -> Maybe<&T>          // element with largest multiplicity (ties broken arbitrarily)
```

### When to choose Multiset vs Set

* **Set** — identity / membership only; "is x present?".
* **Multiset** — frequency counting; "how many times has x occurred?". Statistical aggregations, deduplication-with-counts, MVCC bag semantics, simplicial-multiset structures, fractal-holon sub-holon multisets.

### Protocol implementations

```verum
implement<T: Hash + Eq + Clone> Clone for Multiset<T>;
implement<T: Hash + Eq>         Eq    for Multiset<T>;   // every element same multiplicity
implement<T: Hash + Eq + Debug> Debug for Multiset<T>;   // Multiset {a×2, b×3}
```

Multiset equality is structural — same support, same per-element
multiplicity. Two multisets with the same elements but different
insertion order compare equal.

---

## `Deque<T>` — double-ended queue

Ring buffer. O(1) push/pop at both ends.

```verum
Deque.new()     Deque.with_capacity(cap)
let q = deque![1, 2, 3];
```

```verum
q.len()  q.is_empty()  q.capacity()
q.push_front(v)   q.push_back(v)
q.pop_front() -> Maybe<T>
q.pop_back()  -> Maybe<T>
q.front() / q.back() -> Maybe<&T>
q.front_mut() / q.back_mut()

q.get(i) / q.get_mut(i)   // 0 = front
q[i]                      // panics on OOB
q.iter() / q.iter_mut() / q.into_iter() / q.drain(range)
q.rotate_left(n)  q.rotate_right(n)
q.clear()  q.retain(|x| pred(x))  q.extend(iter)
```

Use as FIFO (`push_back` + `pop_front`) or LIFO (`push_back` + `pop_back`).

---

## `BinaryHeap<T>` / `MinHeap<T>` — priority queue

Max-heap: `BinaryHeap<T>`. Min-heap: `MinHeap<T>`. `T: Ord`.

```verum
let mut pq: BinaryHeap<Int> = heap![3, 1, 4, 1, 5, 9, 2, 6];
pq.push(7);
pq.peek();              // Maybe.Some(&9)
let top = pq.pop();     // Maybe.Some(9)
let all_sorted: List<Int> = pq.into_sorted_vec();  // max-heap -> descending
```

```verum
BinaryHeap.new()  BinaryHeap.with_capacity(cap)
BinaryHeap.from(list)        // heapify in O(n)

h.len()  h.is_empty()  h.capacity()
h.push(v)       h.pop() -> Maybe<T>
h.peek() -> Maybe<&T>
h.peek_mut() -> Maybe<PeekMut<T>>
h.clear()
h.drain()                 // unordered drain; HeapDrain
h.drain_sorted()          // yields in heap order; HeapDrainSorted
h.into_sorted_vec() -> List<T>
h.iter()                  // unordered
```

### Min-heap via wrapping

For "min by custom key", wrap values in `Reverse<T>`:

```verum
let mut h: BinaryHeap<Reverse<(Int, Text)>> = BinaryHeap.new();
h.push(Reverse((3, "three".to_string())));
h.push(Reverse((1, "one".to_string())));
let Reverse((k, v)) = h.pop().unwrap();  // (1, "one")
```

### Protocol implementations

```verum
implement<T: Ord>                       IntoIterator for BinaryHeap<T>;
implement<T: Ord + Eq>                  Eq           for BinaryHeap<T>;  // sorts then compares
implement<T: Ord + Clone>               Clone        for BinaryHeap<T>;
implement<T: Ord>                       Default      for BinaryHeap<T>;
implement<T: Ord + Debug>               Debug        for BinaryHeap<T>;
implement<T: Ord + Display>             Display      for BinaryHeap<T>;
implement<T: Ord + Hash + Clone>        Hash         for BinaryHeap<T>;  // sorts then hashes
implement<T: Ord>                       FromIterator for BinaryHeap<T>;
implement<T: Ord>                       Extend       for BinaryHeap<T>;
```

`Eq` and `Hash` both **sort the contents before comparing/hashing**
so the `a == b → hash(a) == hash(b)` invariant holds across distinct
internal heap arrangements of the same multiset of elements.  Two
heaps built from the same input list, even via different push orders,
are interchangeable as keys in a `Map<BinaryHeap<T>, V>` or as
elements of a `Set<BinaryHeap<T>>`.

---

## `BTreeMap<K, V>` / `BTreeSet<T>` — ordered

Red-black tree (B-factor 12 internally, cache-friendly). `K: Ord`.

### Common operations (BTreeMap/BTreeSet both)

```verum
.new() / .from_iter(iter)
.len()   .is_empty()
.insert(k, v) / .insert(v)
.remove(&k) -> Maybe<V>
.get(&k) / .get_mut(&k)
.contains_key(&k) / .contains(&v)
.iter()                   // sorted ascending
.keys() / .values() / .values_mut()     // map only
.into_iter()     .drain(range)
.retain(|k, v| pred) / |v| pred
.clear()
```

### Ordered operations

```verum
m.first_key_value() -> Maybe<(&K, &V)>    // smallest
m.last_key_value()  -> Maybe<(&K, &V)>    // largest
m.pop_first() -> Maybe<(K, V)>
m.pop_last()  -> Maybe<(K, V)>

m.range(lo..hi)                  // iterator in range
m.range_mut(lo..hi)
m.split_off(&key) -> BTreeMap<K,V>   // split into two halves
```

### Entry API

Same shape as `Map`'s entry API (`or_insert`, `or_insert_with`,
`and_modify`, `or_default`).

### Example — windowed metrics

```verum
let mut by_ts: BTreeMap<Instant, Metric> = BTreeMap.new();
// … populate …

let now = Instant.now();
let last_minute: List<&Metric> = by_ts
    .range((now - 1.minutes())..=now)
    .map(|(_, m)| m)
    .collect();

let recent_total: Float = last_minute.iter().map(|m| m.value).sum();
```

### Choice guide

| Need | Use |
|---|---|
| key lookup, any order | `Map<K,V>` (hash) |
| key lookup **+** ordered iteration | `BTreeMap<K,V>` |
| set membership, any order | `Set<T>` |
| set membership **+** ordered iteration / range queries | `BTreeSet<T>` |
| FIFO/LIFO queue | `Deque<T>` |
| priority queue | `BinaryHeap<T>` (or wrap in `Reverse` for min-heap) |
| "just a list" | `List<T>` |

---

## Slice utilities (`slice.vr`)

`&[T]` is the shared type for "borrowed view of a contiguous run of
`T`". All collections' `.iter()` and indexing yield slices where it
makes sense.

```verum
s.len()  s.is_empty()
s.first() / s.last() / s.split_first() / s.split_last()
s.iter() / s.iter_mut()
s.chunks(n) / s.chunks_exact(n)
s.windows(n)                     // sliding, size-n, WindowsIter
s.split_at(i) -> (&[T], &[T])
s.split(|x| pred(x))             // iterator of sub-slices
s.partition_point(|x| pred(x))
s.binary_search(&v)              // T: Ord
s.contains(&v) -> Bool           // T: PartialEq
s.starts_with(&prefix) / s.ends_with(&suffix)
s.as_ptr() / s.as_mut_ptr() -> *const/mut T    // unsafe bridge
```

`List<T>.as_slice()` and `List<T>.as_mut_slice()` give you `&[T]` /
`&mut [T]` for interop with slice-accepting functions.

---

## Implementation summary

| Collection | Default implementation | Notes |
|---|---|---|
| `List<T>` | growable contiguous buffer, factor = 2 | `@repr(contiguous, growth = N)` overrideable |
| `Map<K,V>` | Swiss-table flat hash map | linear probing, tombstones on delete |
| `Set<T>` | Swiss-set | same as `Map` |
| `BTreeMap<K,V>` | red-black tree, B = 12 | cache-friendly node layout |
| `BTreeSet<T>` | red-black tree | same engine |
| `BinaryHeap<T>` | array-backed binary heap | 4-ary pending evaluation |
| `Deque<T>` | ring buffer | rotation is pointer-update only |

---

## See also

- **[base](/docs/stdlib/base)** — `Iterator` protocol and adapters.
- **[text](/docs/stdlib/text)** — `Text` (semantic "collection of Unicode scalars").
- **[sync](/docs/stdlib/sync)** — locking wrappers (`Mutex<List<T>>`, etc.).
- **[Language → patterns](/docs/language/patterns)** — slice, record, rest patterns over these types.

---

## Caches

### `LruCache<K, V>`

```verum
let mut cache: LruCache<Text, User> = LruCache.new(1024);
let prev = cache.insert(key.clone(), user);
match cache.get(&key) { Some(u) => ..., None => ... }
```

Capacity-bounded hash map with LRU eviction on full. `insert`
returns the prior value when the key was already present
(useful for refcount bookkeeping). `peek` inspects without
touching LRU order; `remove` / `clear` / `contains` cover the
usual surface. `stats()` returns `{ size, hits, misses, evicted }`.

### `TtlCache<K, V>`

```verum
let cfg = TtlCacheConfig { capacity: 1024, default_ttl: Duration.from_secs(300) };
let mut cache: TtlCache<Text, Session> = TtlCache.new(cfg);

cache.insert(key.clone(), session);                               // default TTL
cache.insert_with_ttl(key2, session2, Duration.from_secs(60));   // override
cache.purge_expired();                                            // periodic sweep
```

Combines capacity-based LRU eviction with per-entry time-based
expiration. Expiry is lazy on read (hot-path cost = one
compare) — callers schedule `purge_expired` for idle reclamation.
`TtlCacheStats` surfaces hit/miss/expired/evicted counts for
scraping.

Use `LruCache` when only capacity matters; use `TtlCache` when
freshness windows also apply (session cache, JWT replay cache,
DNS cache).

---

## Probabilistic sketches

The Bloom / HLL / Count-Min trio — bounded-memory answers to
"is X there?", "how many distinct?", "how often?". HMAC-SHA256
keyed hashing with per-filter CSPRNG-sourced keys; adversarial
inputs cannot skew past the theoretical error bound.

### `BloomFilter`

```verum
let mut bf = BloomFilter.with_target(
    100_000,   // expected items
    1000,      // target FP rate × 1,000,000 (0.1%)
);

bf.insert(key);
if bf.contains(key) { ... }
let was_present = bf.check_and_set(key);   // atomic check-and-set
bf.clear();                                 // new HMAC key generated
```

Kirsch-Mitzenmacher double hashing: one HMAC call → two 64-bit
halves → k probe offsets via `h1 + i × h2 mod m`. Typical
operation: ~150 ns end-to-end.

### `HyperLogLog`

```verum
let mut hll = HyperLogLog.new(DEFAULT_PRECISION);   // p=14 ≈ 12 KiB, 0.81% error
hll.add(b"user:alice");
hll.add(b"user:bob");
let approx_distinct: UInt64 = hll.estimate();

// Mergeable sketches across processes share a 32-byte key.
let merged = HyperLogLog.new_with_key(p, shared_key);
merged.merge(&other)?;
```

Flajolet et al. 2007 with small-range linear-counting correction.
Precision `p ∈ [4, 16]` controls memory/accuracy: p=14 is the
Redis PFCOUNT default.

### `CountMinSketch`

```verum
let mut cms = CountMinSketch.with_target(0.001, 0.001);
// ≤ 0.1% error (ε) at 99.9% confidence (1 - δ) — 76 KiB.

cms.add(b"user:alice");
cms.add_n(b"bulk-import", 500);
let upper_bound = cms.estimate(b"user:alice");   // may over- but never under-report
```

Cormode & Muthukrishnan 2005. Width w = ⌈e / ε⌉, depth d =
⌈ln(1/δ)⌉. Saturating u32 cells — no wraparound even at hot
items past 4 billion observations.

### `Reservoir<T>`

> **Status: partial**.
> Fill-phase API (`new`, `offer` while `len < capacity`, `len`,
> `capacity`, `seen`, `take`, `reset`) is conformance-tested on
> `--interp` and `--aot`. The replacement-phase path (`offer` after
> `len == capacity`) is currently gated on the missing
> `core.sys.common.random_bytes` intrinsic in the VBC dispatch table —
> tests pinned in `core-tests/collections/reservoir/regression_test.vr`.

```verum
public type Reservoir<T> is {
    samples:  List<T>,
    capacity: Int,
    seen:     UInt64,
};
```

```verum
let mut res: Reservoir<TraceId> = Reservoir.new(1000);
while let Some(trace) = stream.next() {
    let _ = res.offer(trace);   // Bool: true iff item retained.
}
let sample: List<TraceId> = res.take();
```

API:

```verum
Reservoir.new(capacity: Int) -> Reservoir<T>     // capacity < 1 clamped to 1
res.offer(item: T) -> Bool                       // true iff item retained
res.take(self) -> List<T>                        // consumes
res.len() -> Int                                 // current sample count
res.capacity() -> Int                            // configured cap
res.seen() -> UInt64                             // total items observed
res.reset()                                      // drop samples + zero seen
```

Behavioural laws (pinned by `property_test.vr`):

* **Capacity clamping**: `new(n).capacity() = max(n, 1)`.
* **Seen counter**: `seen()` advances exactly once per `offer`.
* **Fill-phase retention**: every `offer` returns true while
  `seen ≤ capacity`.
* **Length ceiling**: `len() ≤ capacity()` at all times.
* **Reset round-trip**: `reset() ⇒ len = 0 ∧ seen = 0`; `capacity` is
  preserved.
* **Reset idempotency**: repeated `reset()` calls leave the same
  observable state.
* **Capacity invariance**: no public API call besides construction
  changes `capacity()`.

Vitter 1985 Algorithm R — uniform sampling from a stream of
unknown length. Every item has marginal probability
`capacity / stream_length` of surviving. Used by tail-sampling
tracers, streaming analytics, ML out-of-core shuffling.

Conformance suite: `core-tests/collections/reservoir/` —
14 unit + 7 property + 4 integration + 4 pinned regressions.

---

## `ConsistentHashRing`

```verum
let mut ring = ConsistentHashRing.new();    // 160 vnodes default (Ketama)
ring.add_node(Text.from("cache-a"));
ring.add_node(Text.from("cache-b"));
ring.add_node(Text.from("cache-c"));

let primary: Maybe<Text> = ring.node_for_key(b"session:42");
let replicas: List<Text> = ring.nodes_for_key(b"key", 3);
```

Ketama-compatible position derivation — virtual-node positions
are `sha256(node_name + "-" + decimal(vnode_idx))[..8]` as LE
u64. Wire-compatible with memcached Ketama, Redis ring_hash,
Envoy `ring_hash` load balancer.

Adding/removing one node moves only `key_count / node_count`
entries (the consistent-hashing property). `nodes_for_key(key, N)`
returns N distinct nodes in preference order — primary first,
then replicas.

---

## `UnionFindInt` and `UnionFind<T>` — Disjoint-Set Union

> **Status: partial**.
> `UnionFindInt` (Int-keyed dense path) is conformance-tested end-to-end
> on both `--interp` and `--aot`. Generic `UnionFind<T: Hash + Eq>` is
> tested along the working axis (distinct-key make, find on unregistered
> keys, union creates keys, len tracking) and `@ignore`d in
> `regression_test.vr` for the broken axis (idempotent make on duplicate
> keys, component_size after union). Every defect that gates the
> remaining coverage is reproduced in the regression suite and tracked.

DSU — Tarjan 1975, with both path compression and union-by-rank, giving
amortised inverse-Ackermann (`O(α(n)) ≈ O(1)`) cost per operation.

Two APIs. Pick the dense one when keys are densely-indexed integers
(graph nodes 0..n-1, slot indices, etc.); pick the generic one for
strings, UUIDs, or any `Hash + Eq` carrier.

### `UnionFindInt` — dense Int-keyed (array-backed)

```verum
public type UnionFindInt is {
    parent:     List<Int>,
    rank:       List<Int>,
    components: Int,
    size:       List<Int>,
};
```

```verum
let mut uf = UnionFindInt.new(n);

uf.find(x: Int) -> Int                 // canonical root, path-compressed
uf.union(a: Int, b: Int) -> Bool       // true iff this call merged distinct sets
uf.same_set(a: Int, b: Int) -> Bool
uf.component_size(x: Int) -> Int
uf.component_count() -> Int            // O(1) — cached
uf.len() -> Int                        // total elements (== n)
uf.clear()                             // restore initial singleton state
```

Behavioural contract (laws pinned by `property_test.vr`):

* **Reflexivity**:    `same_set(x, x)`
* **Symmetry**:       `same_set(a, b) = same_set(b, a)`
* **Transitivity**:   `same_set(a, b) ∧ same_set(b, c) ⇒ same_set(a, c)`
* **Union introduces equivalence**: `union(a, b) ⇒ same_set(a, b)`
* **Union return-value partition**: `union(a, b) = true` iff `a` and `b`
  were in distinct sets at call entry.
* **Idempotent union**: a second `union(a, b)` is a no-op; state and
  `component_count()` are unchanged.
* **Component-count invariant**: each successful union decrements the
  count by exactly 1; failed unions leave it unchanged.
* **Component-size sum**: `Σ component_size(root_i) = n` over distinct
  roots.
* **Find idempotency**: `find(find(x)) = find(x)`.
* **`same_set` definition**: `same_set(a, b) = (find(a) == find(b))`.
* **Clear restores singletons**: post-`clear()`, every element is its
  own root and `component_count() = n`.

Use cases (industry-standard DSU territory):

* **Kruskal MST** — sort edges by weight, union endpoints, accept the
  edge iff the union returned `true`.
* **CRDT add-wins set reconciliation** — per-key DSU over causal-set
  representatives.
* **Static-analyser equivalence classes** — variable aliasing, escape
  analysis, type-variable bands.
* **Image-segmentation connected-component labelling** —
  4/8-connected pixels via two raster passes.
* **Cycle detection in incremental graph construction** —
  `same_set(u, v)` before adding edge `(u, v)`.

### `UnionFind<T: Hash + Eq>` — generic, map-backed

```verum
public type UnionFind<T: Hash + Eq> is {
    parent:     Map<T, T>,
    rank:       Map<T, Int>,
    size:       Map<T, Int>,
    components: Int,
};
```

```verum
let mut uf: UnionFind<Text> = UnionFind.new();

uf.make(x: T)                          // ensure x is known; idempotent
uf.find(x: &T) -> T                    // canonical root, path-compressed
uf.union(a: T, b: T) -> Bool           // true iff merge happened
uf.same_set(a: &T, b: &T) -> Bool
uf.component_size(x: &T) -> Int
uf.component_count() -> Int
uf.len() -> Int                        // distinct keys ever introduced
```

Same algebraic laws as `UnionFindInt`. The "make is idempotent on
duplicate keys" axis is currently blocked by upstream
`Map.contains_key(&K)` defect (see [Open defects](#open-defects-in-collections)).

### Length protocol

Both types implement `Length`, so the free-function form works:

```verum
assert_eq(uf.len(), len(&uf));
```

### Performance

* `find`: amortised `O(α(n))` ≈ `O(1)`. α is the inverse Ackermann
  function — bounded by 4 for any conceivable input size.
* `union`: amortised `O(α(n))`.
* `component_count`: `O(1)`. The counter is maintained in-line, not
  recomputed.
* `component_size`: `O(α(n))` (one find).
* `clear` (UnionFindInt only): `O(n)` on the dense backing arrays.

### Conformance suite

`core-tests/collections/union_find/` — 52 non-ignored tests, 11 pinned
regressions. Run with `verum test --interp --filter test_uf_` and
`verum test --interp --filter property_int_`.

---

## Open defects in collections

Tracked across the conformance suite under
`core-tests/collections/<module>/regression_test.vr`. Each entry below
links to the regression-pinned reproducer.

| # | Defect | Surface | Status |
|---|---|---|---|
| 1 | `Map.get(K) -> V` returns zero-value on miss instead of `Maybe<V>` | `core/collections/map.vr:457`; ~666 call sites | tracked, fix is a cross-cutting migration |
| 2 | `Map.contains_key(&K)` silently returns false (type mismatch) | `core/collections/map.vr:614`; reachable from `union_find.vr:183` | tracked |
| 3 | `Map.get_optional` / `Map.get_key_value` lenient-skipped at runtime | `core/collections/map.vr:504, 579` | tracked, requires compiler-side investigation |
| 4 | `Text.from_utf8_unchecked` heap-allocated Text has zero-length `as_bytes()` despite correct `len` field | `core/text/text.vr:439`; surfaces in every `Map<Text, V>` populated via `Text.from(...)` | tracked, requires interpreter-side `RefSliceRaw` fix |
| 5 | `Text.eq(&self, &Text)` method dispatch returns false for byte-identical literal Texts | `core/text/text.vr:3370`; method-resolution lands on the wrong impl | tracked |
| 6 | `core.sys.common.random_bytes` intrinsic missing from VBC dispatch table | reachable from `core/collections/reservoir.vr:148`; gates `Reservoir.offer` replacement phase, plus any `core.base.random.*` use site (`Bloom`, `HyperLogLog` HMAC keys) | tracked |

These defects are **not** specific to the `UnionFind` types — they are
foundational stdlib / language-level gaps that cascade into every
module that touches `Map<Text, V>` or `Map<&K, V>`. Closing any of them
unlocks coverage in multiple downstream modules at once.
