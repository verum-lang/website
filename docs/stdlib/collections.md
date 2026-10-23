---
sidebar_position: 2
title: collections
description: List, Map, Set, Deque, BinaryHeap, BTreeMap, BTreeSet — every semantic-honest collection.
status: partial
---

# `core.collections` — Lists, Maps, Sets, Deques

Semantic-honest data structures. You talk to the protocol; the compiler
chooses the implementation.

## Module status

Each `core.collections.*` module carries an explicit conformance status
so you know what you can rely on today versus what is still in flight.
The status is the truth-table over the module's API surface as exercised
by `core-tests/collections/<module>/` under both `verum test --interp`
(Tier 0 VBC interpreter) and `verum test --aot` (Tier 1 LLVM AOT).

:::note Backend coverage

The module statuses record conformance coverage, not a guarantee that
all collection operations agree between the interpreter and native
execution. Per-module audits cover different subsets; use API-specific backend
limitations when choosing an execution mode.

**Known limitation:** native `List<Byte>` allocation
can return an invalid handle on the shrink-and-regrow path. Do not rely
on native byte-list resizing in production until that path is verified.
Empty and nonempty `List<Byte>` and `List<Int>` shrink, push, reserve and
value-preservation checks pass under the interpreter. These results
cover those operations, not every `List` method or another collection.

:::

| Status | Meaning |
|---|---|
| **complete** | Everything **stable** requires, plus the coverage bar the conformance inventory sets for its top mark: algebraic laws pinned by property tests, cross-stdlib integration verified, and the module's audit findings landed or routed. Completion also requires end-to-end checks in both the interpreter and native AOT backend; **stable** alone does not imply this. |
| **stable** | The covered suite passes under the interpreter. Native coverage must be stated separately; this status does not establish backend parity. See the [shared status convention](./status-convention.md#status-keywords). |
| **partial** | Only a subset of the API has measured coverage. Consult the backend-specific limitations before using it; a passing or unignored test alone is not a production-safety guarantee. |
| **regression-only** | Module is gated by upstream stdlib / language-level defects. Public-API tests do not pass yet — only `@ignore`d regressions exist to lock the bug shapes. Avoid in production until promoted. |
| **undocumented** | Documentation in this reference is authoritative, but the module has not yet been routed through the `core-tests/` conformance suite. The current page is a best-effort snapshot of the source; it may drift from runtime behaviour. |
| **unverified** | The conformance suite has not been run against this module, so nothing on its row is a measurement. Distinct from **undocumented**: the module IS routed into `core-tests/`, but no result has been recorded since the liveness check that began demanding one. |

| Module | Status | Conformance suite |
|---|---|---|
| `list.vr` | **partial** | [core-tests/collections/list](https://github.com/verum-lang/verum/tree/main/core-tests/collections/list) — interpreter shrink/regrow and reserve checks preserve Byte and Int values. Native byte-list allocation remains unsafe on that path; see the backend limitation above. Other method coverage remains partial. |
| `map.vr`            | **partial** | [core-tests/collections/map](https://github.com/verum-lang/verum/tree/main/core-tests/collections/map) — interpreter coverage includes lookup, insertion, removal and mutation through `get_mut`. Entry operations, iterator helpers and map copying remain incomplete. See [Map support](#map-support). Native coverage is not established by interpreter results. |
| `set.vr`            | **partial** | [core-tests/collections/set](https://github.com/verum-lang/verum/tree/main/core-tests/collections/set) — 23 unit + 10 property + 5 integration + 4 pinned regressions. Set.insert returns Bool (was Unit); Set.union / Set.intersection auto-deref CBGR ref needle. |
| `multiset.vr`       | **partial** | [core-tests/collections/multiset](https://github.com/verum-lang/verum/tree/main/core-tests/collections/multiset) — 21 unit + 10 property + 5 integration + 12 regressions. Construction / insert / remove / count / contains / clear / cardinality / distinct_len / is_subset / with-empty algebraic ops green; per-element-correct union/intersection/sum/difference and direct iter() pinned (gated on MultisetIter wrapping Map.iter() — wrapper-type dispatch defect, same class as slice §D). |
| `deque.vr`          | **partial** | [core-tests/collections/deque](https://github.com/verum-lang/verum/tree/main/core-tests/collections/deque) — the active conformance suite is green under the interpreter. Sections 8–14 added (get / get_mut after wrap-around / contains / clear+refill / with_capacity / singleton edge cases / repeated push_front / drain-to-empty refill / alternating push-pop). Stdlib type-decl field order matches runtime intercept allocation. |
| `heap.vr`           | **partial** | [core-tests/collections/heap](https://github.com/verum-lang/verum/tree/main/core-tests/collections/heap) — construction, `push_pop` and `replace` in every variant, `try_push`, singletons, insertion in either order, duplicates, the list conversions, `clear` and bulk drain are all covered. The internals moved off raw pointer reads onto the safe indexed accessors.  |
| `btree.vr`          | **regression-only** | [core-tests/collections/btree](https://github.com/verum-lang/verum/tree/main/core-tests/collections/btree) — 6 unit + 5 property + 2 integration + 17 regressions.  Pattern-match ref-deref works: the `IsVar` / `GetVariantData` / `AsVar` handlers auto-deref heap-interior pointers in `cbgr_mutable_ptrs`.  Stdlib refactored `BTreeMap.get/get_mut/insert/remove` from `.as_ref().expect()` to `match &self.root { Some(node) => … }`.  **Residual**: end-to-end `m.insert(1,100); m.get(&1)` still hits `field index 3 OOB on size 24` inside `search_node` chain — `&Heap<BTreeNode<K,V>>` argument-passing through generic methods loses inner T type (sister defect tracked separately).  Empty-state surface remains green. |
| `slice.vr`          | **partial** | [core-tests/collections/slice](https://github.com/verum-lang/verum/tree/main/core-tests/collections/slice) — 47 unit + 10 property + 5 integration + 17 regressions (5 PASS-GUARDs + 12 defect-pins). Sections 7–11 added (index_of / rindex_of value-search; contains via full + subrange; get/first + get/last Maybe-destructure coherence; slice-of-slice nesting independence; split_at boundary cases zero/one/full). `index_of` / `rindex_of` work. Slice-only methods (eq_slice/cmp_slice/to_list/binary_search/partition_point/chunks/windows) still unreachable via CallM because `&[T]` shares the `List` runtime kind. |
| `lru.vr`            | **complete**  | [core-tests/collections/lru](https://github.com/verum-lang/verum/tree/main/core-tests/collections/lru) — construction with a capacity clamp, the prior value returned by `insert`, `get` / `peek` / `remove` / `contains`, `clear`, eviction under capacity pressure, recency tracking through `get`, the size / hit / miss / eviction counters, and the invariant that `peek` does not change recency — all covered. |
| `ttl_cache.vr`      | **regression-only** | [core-tests/collections/ttl_cache](https://github.com/verum-lang/verum/tree/main/core-tests/collections/ttl_cache) — 6 unit + 5 property + 3 integration + 11 regressions (4 PASS-GUARDs on the working surface + 7 @ignore'd insert-path pins). Fundamental source-level defect closed in this branch: `ttl_cache.vr:109` called the non-existent `Instant.add_duration(Duration)`; fixed to use the canonical `Instant.checked_add(Duration) -> Maybe<Instant>` API.  Same fix landed at the parallel QUIC PMTU site (`path_mtu.vr:138`).  Promotes to **stable** after `cargo build --release` refreshes the embedded precompiled stdlib in the verum binary. |
| `bloom.vr`          | **regression-only** | [core-tests/collections/bloom](https://github.com/verum-lang/verum/tree/main/core-tests/collections/bloom) — `BloomFilter.try_new` and the error variants are covered.  |
| `hyperloglog.vr`    | **partial** | [core-tests/collections/hyperloglog](https://github.com/verum-lang/verum/tree/main/core-tests/collections/hyperloglog) — the constructors, the precision constants, the error variant and the precision-mismatch case of `merge` are all covered.  |
| `count_min.vr`      | **partial** | [core-tests/collections/count_min](https://github.com/verum-lang/verum/tree/main/core-tests/collections/count_min) — construction and the error algebra are covered.  |
| `reservoir.vr`      | **unverified**  | [core-tests/collections/reservoir](https://github.com/verum-lang/verum/tree/main/core-tests/collections/reservoir) — 14 unit + 7 property + 4 integration + 4 pinned regressions (CSPRNG-gated replacement phase) |
| `consistent_hash.vr`| **partial** | [core-tests/collections/consistent_hash](https://github.com/verum-lang/verum/tree/main/core-tests/collections/consistent_hash) — 5 unit + 5 property + 2 integration + 4 PASS-GUARDs + 1 @ignore'd populated-ring pin. Empty-ring surface (new / with_virtual_nodes / node_count / position_count / node_for_key-on-empty / nodes_for_key-on-empty / DEFAULT_VIRTUAL_NODES) green; add_node integration deferred pending Text.from reachability. |
| `adjacency_list.vr` | **partial** | [core-tests/collections/adjacency_list](https://github.com/verum-lang/verum/tree/main/core-tests/collections/adjacency_list) — 4 unit + 3 property + 2 integration + 5 regressions (3 PASS-GUARDs + 2 @ignore'd edge-mutator pins). add_edge panics with field-write-out-of-bounds (same layout-drift class as BTreeMap §A but for the inner edge-Map). Vertex-only surface green. |
| `alias_sampler.vr`  | **regression-only** | [core-tests/collections/alias_sampler](https://github.com/verum-lang/verum/tree/main/core-tests/collections/alias_sampler) — 1 unit + 1 property + 1 integration + 4 regressions. AliasSampler construction gated on RNG + wrapper-record layout. Working surface: AliasError variant. |
| `toposort.vr`       | **unverified** | [core-tests/collections/toposort](https://github.com/verum-lang/verum/tree/main/core-tests/collections/toposort) — the active conformance suite is green under the interpreter; the cyclic-graph cases are deferred behind the defect named below. Acyclic path fully covered: topological-order invariant (dep precedes dependent ∀ edges), permutation/totality, stable tie-break, determinism, duplicate-edge in-degree counting, add_node idempotence; cross-stdlib build-order / install-order / incremental-constraint scenarios. **Open, and the reason this row is not higher:** `toposort()` PANICS instead of returning `Err(Cycle)` for any cyclic graph: the cycle branch calls the generic free fn `node_label(n)` from inside the generic `implement<N> TopoGraph<N>` method and VBC codegen mislays the call frame (`field write out of bounds: field index 80 … type_id=0`). 4 cycle property tests `@ignore`'d; fix = thread the monomorphisation frame for generic-free-fn-from-generic-method calls (or stdlib workaround: inline `Text.from("<node>")`, drop `node_label`). See audit.md §1. |
| `trie.vr`           | **regression-only** | [core-tests/collections/trie](https://github.com/verum-lang/verum/tree/main/core-tests/collections/trie) — mutators depend on `Map.get_mut`; a working Map accessor alone does not validate trie insertion or removal. Mutation coverage remains incomplete. |
| `union_find.vr`     | **unverified** | [core-tests/collections/union_find](https://github.com/verum-lang/verum/tree/main/core-tests/collections/union_find) — 31 unit + 14 property + 7 integration + 11 pinned regressions |

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

let xs = [1, 2, 3];                    // macro — array of items
let ys = [0; 10];                           // repeat form — 10 copies of 0
```

A function or closure returning `List<T>` can copy a directly produced
packed numeric array into a new list that supports growth. This conversion
has [specific return-boundary limits](../language/types.md#returning-an-array-as-a-list);
it does not apply to every array-valued expression or function argument.

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
xs.get(i) -> Maybe<T>
xs.get_mut(i) -> Maybe<T>
xs.first() / xs.last() -> Maybe<T>
xs.first_mut() / xs.last_mut() -> Maybe<T>
```

:::caution These return the element BY VALUE, not a reference

`core/collections/list.vr` declares `Maybe<T>` for these accessors.
They return an element value; a mutable-sounding name does not imply a
returned mutable reference.

Two things follow, and both bite in practice:

- **`get_mut` cannot mutate.** Its body is `self.get(idx)`, and the comment
  above it says "returns copy of element value". So
  `xs.get_mut(i).field = v` writes to a copy; where the element is a record
  the compiler rejects it outright with `E103: Cannot access field on
  non-record type`. Use `xs.set(i, value)`, or `get_unchecked_mut` inside
  `unsafe` when you need a reference. It is the only `get_mut` in the
  standard library that does not return `&mut T` — the ones on
  `RenderCell`, `File`, `BufWriter` and `Mutex` all do.

- **Do not dereference the unwrapped element.** `xs.get(i)` already yields
  the value, so `xs.get(i).unwrap()` is a `T`. Writing
  `*xs.get(i).unwrap()` dereferences a value; in generic code that binds the
  function's own type parameter to a reference and produces a cascade of
  "ambiguous type" errors on lines that are perfectly well annotated.

  `*xs.get(i)` on its own IS valid — `implement<T> Deref for Maybe<T>` in
  `core/base/maybe.vr` makes the dereference unwrap the `Maybe`. That is
  exactly why the extra `.unwrap()` is easy to miss.

The by-value signature is not an oversight. `list.vr` records that the raw
`*self.ptr.offset(idx)` form returned bytes from the heap object header,
because codegen resolves `self.ptr` to the start of the backing object
rather than past the header; returning a copy is the retreat from that.

:::

### Mutation

| | |
|---|---|
| `xs.push(value)` |  |
| `xs.pop() -> Maybe<T>` |  |
| `xs.insert(index, value)` |  |
| `xs.remove(index) -> T` |  |
| `xs.swap_remove(index) -> T` | O(1); destroys order |
| `xs.swap(i, j)` |  |
| `xs.clear()` |  |
| `xs.truncate(len)` |  |
| `xs.extend(other)` | extend from an iterator |
| `xs.retain(\|x\| pred(x))` | keep only matching elements |
| `xs.dedup()` | remove consecutive duplicates (T: PartialEq) |
| `xs.dedup_by(\|a, b\| same(a, b))` |  |
| `xs.dedup_by_key(\|x\| key(x))` |  |
| `xs.sort()` | T: Ord |
| `xs.sort_by(\|a, b\| a.cmp(b))` |  |
| `xs.sort_by_key(\|x\| key(x))` |  |
| `xs.sort_unstable()` | T: Ord, faster, not stable |
| `xs.reverse()` |  |
| `xs.fill(value)` | T: Clone |
| `xs.fill_with(\|\| make())` |  |
| `xs.resize(new_len, value)` | T: Clone |

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
xs.iter()                 // ListIter<T>      lazy, Item = &T
xs.iter_mut()             // ListIterMut<T>   lazy, Item = &mut T
xs.into_iter()            // IntoList<T>      lazy, Item = T; consumes xs
xs.drain(start, end)      // Drain<T>         lazy, Item = T

xs.chunks(n)              // List<List<T>>    MATERIALISED
xs.chunks_exact(n)        // List<List<T>>    MATERIALISED, remainder DROPPED
xs.chunks_exact_remainder(n)  // List<T>      the part chunks_exact drops
xs.windows(n)             // List<List<T>>    MATERIALISED
xs.enumerate()            // List<(Int, T)>   MATERIALISED
```

:::caution Some of these return heap addresses instead of elements
Checked at Tier 0 on `[1, 2, 3, 4]`, and the split is not
where you would guess:

| Answers correctly | Answers with pointers or worse |
|---|---|
| `chunks(2)`, `windows(2)` | `chunks_exact(2)`, `rchunks(2)` |
| `take(2)`, `skip(2)`, `filter`, `find` | `tail()`, `intersperse(0)`, `unique()` |
| `product()`, `is_sorted()`, `xs[i]` | `reduce(+)`, `take_while`, `split_first()` |

```text
xs.intersperse(0)   ->  [39989593984, 0, 39989593992, 0, 39989594000]
xs.split_first()    ->  Some(mysql)
xs.take_while(|x| *x < 3)  ->  []
```

`split_first` is reading an unrelated string out of the heap. The
lengths and the separators are right throughout, which is what makes
this survivable in a smoke test: only the ELEMENTS are wrong.

**Why the split falls where it does.** `List`'s declared record and its
runtime layout disagree — the runtime keeps `len` at slot 0, and a
stdlib body indexing off the record's pointer field resolves an `Int` as
a pointer. Methods that answer correctly do so because the interpreter
INTERCEPTS them with a native implementation, so their bodies never run.
There are 41 such intercepts against 96 methods that touch the pointer.

Until that is fixed, prefer the intercepted spellings above, and check
any list-returning method you rely on by printing it once.
:::

Two things in that list are easy to read past, and both change what the
code does rather than how it looks.

**`drain` takes two `Int`s, not a range.** `core/collections/list.vr`
declares `fn drain(&mut self, start: Int, end: Int) -> Drain<T>`;
`xs.drain(a..b)` does not typecheck.

**The lower group allocates.** `List` does not implement `Iterator` —
`chunks`, `windows` and `enumerate` are methods on `List` itself and each
one builds the whole result before returning it, so `xs.chunks(n)` on a
million-element list allocates a million elements' worth of chunks
whether or not you consume them all. The lazy forms exist and are reached
through `iter()`, which does implement `Iterator`:

```verum
xs.iter().chunks(n)       // ChunksIter<ListIter<T>>   — lazy
xs.iter().windows(n)      // WindowsIter<ListIter<T>>  — lazy
xs.iter().enumerate()     // lazy
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
xs.clone()      // clone into a new List
```

### Example

```verum
let mut words = ["hello", "world", "verum"];
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

Hash map with `K: Hash + Eq`. The
[source implementation](https://github.com/verum-lang/verum/blob/main/core/collections/map.vr)
uses Robin Hood probing; the interpreter uses a separate runtime representation. See
[Map support](#map-support) for the resulting API limitations.

The signatures and call shapes in this section are reference excerpts,
not standalone programs. For a complete lookup example, see the
[collections cookbook](/docs/cookbook/collections#map-values-and-mutable-access).

### Construction

```verum
Map.new() -> Map<K, V>
Map.with_capacity(capacity) -> Map<K, V>
Map.from(pairs: [(K, V); _])
let m: Map<Text, Int> = Map.from([("a", 1), ("b", 2)]);
```

### Size

```verum
m.len()    m.is_empty()    m.capacity()
m.reserve(additional)      m.shrink_to_fit()
```

### Access

```verum
m.get(key) -> Maybe<V>
m.get_mut(&key) -> Maybe<&mut V>       // requires K: Clone
m.get_key_value(&key) -> Maybe<(&K, &V)>
m.contains_key(key) -> Bool
m[key]                               // panics on missing
```

`get` takes its key by value and returns `V` inside `Maybe`; it does not
return a reference to the map's value slot. This is not a promise of a
deep copy: values containing references can still alias other objects.
`get_mut` borrows the key and, when present, returns a mutable reference
to the stored value. Replacing `*value` through that reference updates
the original map.

Keep the map alive and end the returned borrow before inserting,
removing or clearing entries, reserving capacity, shrinking, or otherwise
rebuilding its table. These operations can remove or relocate slots.
Changing the stored value through `&mut V` does not permit a concurrent
change to the map's structure. This is a validity requirement; it is not
a claim that every stale-reference use is currently detected.

### Mutation

```verum
m.insert(key, value) -> Maybe<V>       // returns old value if any
m.remove(key) -> Maybe<V>
m.remove_entry(key) -> Maybe<(K, V)>
m.clear()
m.retain(|k, v| pred(k, v))
m.extend(iter)                         // iter yields (K, V)
```

### Map support

Focused interpreter checks cover present and missing keys, scalar replacement
through `get_mut`, and mutation inside nested variant values. A subsequent
`get` observes the changed entry. This does not establish complete Map support.

The source methods and runtime representation do not yet share one
entry layout: the source uses slots containing key, value, hash and probe
distance, while the interpreter stores key/value pairs.

The entry API and other methods that access the source layout, including
`get_key_value` and `remove_entry`, remain incomplete. Failures are not
restricted to empty maps. A successful `get` does not establish that these
methods can read the same table correctly. Iterator helpers and map copying
also have separate limitations listed under [open defects](#open-defects-in-collections).

Use `get` or `get_or` followed by `insert` for insert-or-update code;
the [cookbook](../cookbook/collections.md#the-entry-api) shows this pattern.
These interpreter results do not establish native AOT support, general
entry-API support, or enforcement of every borrow invalidation rule.

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

| Method | Iterator | Item |
|---|---|---|
| `iter()` | `MapIter<K, V>` | `(K, V)` |
| `iter_mut()` | `MapIterMut<K, V>` | `(&K, &mut V)` |
| `into_iter()` | `MapIntoIter<K, V>` | `(K, V)`; consumes the map |
| `keys()` | `MapKeys<K, V>` | `K` |
| `values()` | `MapValues<K, V>` | `V` |
| `values_mut()` | `MapValuesMut<K, V>` | `&mut V` |
| `drain()` | `MapDrain<K, V>` | `(K, V)`; consumes entries |

`keys()` and `values()` return iterators. Call `next()` to advance them;
exhaustion returns `Maybe.None`. `keys_list()` and `values_list()` collect
owned values into lists and require `Clone` for the corresponding item type.
These operations have interpreter coverage for populated and empty maps.

This complete example sorts collected keys to obtain a predictable order:

```verum
fn main() {
    let mut scores: Map<Text, Int> = Map.new();
    scores.insert("Ada", 7);
    scores.insert("Lin", 11);
    let mut names = scores.keys_list();
    names.sort();
    assert_eq(names.len(), 2);
    assert_eq(names[0], "Ada");
    assert_eq(names[1], "Lin");

    let mut values = scores.values();
    let mut total = 0;
    while let Maybe.Some(score) = values.next() {
        total = total + score;
    }
    assert_eq(total, 18);
    assert(values.next() is Maybe.None);

    let collected = scores.values_list();
    assert_eq(collected.len(), 2);
    assert_eq(collected[0] + collected[1], 18);
}
```

**Iteration order is UNSPECIFIED.** `Map` is open-addressed with
tombstones and `resize` moves entries, so the order is a function of
hashes and of the insert history — measured: inserting
`zebra, apple, mango, kiwi` and iterating the keys gives
`mango kiwi apple zebra`. Nothing in `core/collections/map.vr` promises
otherwise, and the `Hash` impl below is deliberately order-independent
for the same reason. Sort the keys when you need an order, and never
compare a `Map`'s iteration against a literal in a test.

**`iter`, `keys` and `values` yield OWNED values, not references** —
`MapKeys.next` returns `Maybe<K>`, not `Maybe<&K>`. That is the opposite
of `List.iter()`, which yields `&T`.

`iter_mut` and `values_mut` yield mutable references into the map.
`drain` also takes `&mut self`, but yields owned `(K, V)` pairs and removes
them from the map; it does not yield borrowed items. Keep the map and
its table intact while using borrowed items, following the access rules
above. A mutable receiver signature alone does
not demonstrate that all invalid uses are rejected.

:::caution `values_mut` does not run at Tier 0
Checked:

```verum
for v in m.values_mut() { *v = *v * 10; }
// Null pointer dereference: op=opcode 0x62 at MapValuesMut.next (pc=60)
```

This iterator path has its own runtime limitation. Coverage of a single
mutable lookup does not establish support for mutable iteration. Rebuild
the map from `iter()` when you need to change every value.
:::

The declared iterator item types differ:

```verum
for k in m.keys() { … }        // k is a K — you own it
for (k, v) in m.iter_mut() { } // k is a &K, v is a &mut V
```

The first loop receives `K` by value; the second receives `&K`.

### Entry API sketches

These reference sketches describe the declared entry API and retain the
[interpreter limitation](#map-support) above.

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

// insert or update
match map.entry(key) {
    MapEntry.Occupied(mut e) => *e.get_mut() += 1,
    MapEntry.Vacant(e) => { e.insert(1); }
}
```

### Pitfall — mutating while iterating

Do not insert, remove, clear or resize the map while its iterator is in
use. Collect changes and apply them after iteration, or use `retain`.

---

## `Set<T>` — hash set

`T: Hash + Eq`.

### Construction

| | |
|---|---|
| `Set.new()` |  |
| `Set.with_capacity(cap)` |  |
| `Set.from(values)` |  |
| `let s: Set<Int> = Set.from([1, 2, 3])` |  |

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
a.union(&b)                 // Set<T>   — a NEW set, not an iterator
a.intersection(&b)          // Set<T>
a.difference(&b)            // Set<T>
a.symmetric_difference(&b)  // Set<T>

a.is_disjoint(&b)   a.is_subset(&b)   a.is_superset(&b)   // Bool
```

**All four return a `Set<T>` outright**, built eagerly — `union` clones
`self` and inserts the other side's elements. They are not lazy views,
there is nothing to `.collect()`, and `Set<T>` has no `.copied()`. Each
therefore requires `T: Clone`.

### Example

```verum
let a: Set<Int> = Set.from([1, 2, 3, 4]);
let b: Set<Int> = Set.from([3, 4, 5, 6]);

let union: Set<Int>      = a.union(&b);                 // {1,2,3,4,5,6}
let intersect: Set<Int>  = a.intersection(&b);          // {3,4}
let diff: Set<Int>       = a.difference(&b);            // {1,2}
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

| | |
|---|---|
| `Multiset.new()` |  |
| `Multiset.with_capacity(cap)` |  |
| `let m = Multiset.from([1, 2, 2, 3, 3, 3])` |  |
| `let m = Multiset.from_counts([(1, 1), (2, 2), (3, 3)])` | (element, multiplicity) |

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

| | |
|---|---|
| `Deque.new()` |  |
| `Deque.with_capacity(cap)` |  |
| `let q = [1, 2, 3]` |  |

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
let mut pq: BinaryHeap<Int> = [3, 1, 4, 1, 5, 9, 2, 6];
pq.push(7);
pq.peek();              // Maybe.Some(&9)
let top = pq.pop();     // Maybe.Some(9)
let all_sorted: List<Int> = pq.into_sorted_list();  // ascending
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
h.into_sorted_list() -> List<T>   // ascending; `to_list` keeps heap order
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

| bounds | protocol | type | |
|---|---|---|---|
| `implement<T: Ord>` | `IntoIterator` | `BinaryHeap<T>` |  |
| `implement<T: Ord + Eq>` | `Eq` | `BinaryHeap<T>` | sorts then compares |
| `implement<T: Ord + Clone>` | `Clone` | `BinaryHeap<T>` |  |
| `implement<T: Ord>` | `Default` | `BinaryHeap<T>` |  |
| `implement<T: Ord + Debug>` | `Debug` | `BinaryHeap<T>` |  |
| `implement<T: Ord + Display>` | `Display` | `BinaryHeap<T>` |  |
| `implement<T: Ord + Hash + Clone>` | `Hash` | `BinaryHeap<T>` | sorts then hashes |
| `implement<T: Ord>` | `FromIterator` | `BinaryHeap<T>` |  |
| `implement<T: Ord>` | `Extend` | `BinaryHeap<T>` |  |

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

| | |
|---|---|
| `.new() / .from_iter(iter)` |  |
| `.len()` |  |
| `.is_empty()` |  |
| `.insert(k, v) / .insert(v)` |  |
| `.remove(&k) -> Maybe<V>` |  |
| `.get(&k) / .get_mut(&k)` |  |
| `.contains_key(&k) / .contains(&v)` |  |
| `.iter()` | sorted ascending |
| `.keys() / .values() / .values_mut()` | map only |
| `.into_iter()` |  |
| `.drain(range)` |  |
| `.retain(\|k, v\| pred) / \|v\| pred` |  |
| `.clear()` |  |

### Ordered operations

```verum
m.first_key_value() -> Maybe<(&K, &V)>    // smallest
m.last_key_value()  -> Maybe<(&K, &V)>    // largest
m.pop_first() -> Maybe<(K, V)>
m.pop_last()  -> Maybe<(K, V)>

m.range(lo..hi)                  // iterator in range (shared refs)
m.iter_mut()  m.values_mut()     // mutable iteration is whole-map
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
    .range((now - 1.mins())..=now)
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

> **Status: regression-only**.
> `&[T]` is the source-level type for "borrowed view of a contiguous
> run of `T`", but at the VBC runtime slice receivers carry a `List`
> kind, so methods declared in `implement<T> [T] { ... }` that are
> not ALSO present on `List<T>` dispatch through CallM and panic with
> `method 'List.<name>' not found`. The working surface — methods
> with a parallel `List<T>` implementation — is conformance-tested
> on `--interp`:
>
> | Method | Conformance |
> |---|---|
> | `len`, `is_empty`, `first`, `last`, `get` | green |
> | `slice(a,b)`, `slice_from`, `slice_to`, `split_at` | green |
> | `min`, `max`, `contains` | green |
> | `iter()` → `SliceIter.next()` | green |
>
> The slice-only surface — `eq_slice`, `cmp_slice`, `to_list`,
> `binary_search`, `partition_point`, `position` / `rposition`,
> `is_sorted`, `starts_with` / `ends_with`, `chunks`, `windows` —
> is gated on the architectural fix to give `&[T]` a distinct
> runtime kind (or to teach codegen to emit `Call(Slice.<m>_fid)`
> rather than `CallM` when the receiver's static type is `&[T]`).
> Defects pinned in
> `core-tests/collections/slice/regression_test.vr` §A–§E.

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
| `Map<K,V>` | Robin Hood probing in source; separate interpreter storage | See [Map support](#map-support); one shared entry representation is not yet established. |
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

:::caution None of the three constructs at Tier 0
Checked. `BloomFilter.new(...)`, `HyperLogLog.new(12)` and
`CountMinSketch.with_target(...)` each stop at the constructor:

```text
Panic: [xmod-unresolved] cross-module call to '...fill_secure...'
never resolved: the callee's body is absent from the assembled module
```

It is the CSPRNG key described in the paragraph above: all three seed
themselves from `random.secure.fill_secure`, and that call does not
resolve from inside the standard library. The same function called
directly from your own programme works — `fill_secure(&mut buf)` fills a
four-byte `List<Byte>`, 4 of 4 non-zero — so the randomness is fine and
the wiring is not. Nothing you can pass to these constructors avoids it.

Everything below describes the intended surface, and the error-variant
coverage the conformance table cites is real; the live path is not.
:::

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

The recorded populated-map controls identify three failure families.
These results apply to the tested interpreter surface; they do not
establish complete native coverage.

| Defect | Where it shows | Evidence |
|---|---|---|
| Source-layout access can fail: `entry`, `get_key_value`, `get_or_default`, `remove_entry`, `into_keys`, `into_values`, `invert` | includes populated maps; method and path matter | field-access failures; see [Map support](#map-support) |
| `clone` and `partition` can trap | copying and partitioning a map | a null dereference at `Map.clone` and `Map.partition` |
| `extend` cannot find `next` on its receiver at all | merging one map into another | the map arrives where an iterator was expected |

`entry` also has a failing populated-map control. An empty map is not a
sufficient explanation for the failure.

Basic lookup and update operations have interpreter coverage. This does
not establish correctness for every entry operation, iterator helper,
capacity change or native execution path; consult [Map support](#map-support).

Key and value iterators, including `keys_list()` and `values_list()`,
have interpreter execution coverage. Map copying remains a separate
limitation: `Data.merge` in `core.base.data` calls `Map.clone` and can
encounter its failure.

### Workarounds

`to_entries()` answers, so a pair-yielding lookup is a filter over it.
For `entry`-shaped code, use `get` followed by `insert` when a separate
lookup and update fits the operation.

### Focused working controls

These behaviours have individual execution controls:

* **`Map.get` on a miss** yields `Maybe.None`.
* **`Map.get_mut`** yields `Maybe.None` on a miss and a mutable reference
  on a hit. Scalar replacement and nested variant mutation are visible
  through a subsequent lookup under the interpreter.
* **`Map.contains_key`** answers `true` for a present key and `false` for
  an absent one.
* **`Text` equality** on byte-identical literals is `true`, and `false`
  on different ones.
* **`Text.from_utf8_unchecked`** builds a Text whose `as_bytes().len()`
  matches its `len()` — two bytes in, two bytes out.
* **`Reservoir.offer`** uses the `random_u64` intrinsic directly in
  `core/collections/reservoir.vr`.

Use the runnable controls and linked per-module audits to evaluate the
relevant API and execution backend.

## Collection architecture

Not every collection is equally ready. This is what works today under
the interpreter, and what to reach for instead where it does not.

| Module | State | What does not work yet |
|---|---|---|
| `lru` | stable | — |
| `deque` | stable | — |
| `reservoir` | usable | the sampling phase is less covered than construction |
| `toposort` | usable | an error payload built from `Text.from` is wrong |
| `heap` | usable | `Heap.into_inner` does not dispatch on a generic receiver |
| `set` | usable | `into_list` and `extract_if` |
| `map` | partial | [Map support](#map-support) describes lookup, mutation, entry and iterator limitations. |
| `list` | usable | `List.of`, `from_elem`, `fill` and the shuffle helpers |
| `slice` | usable | `position` dispatches to the wrong method |
| `multiset` | limited | `iter()` does not dispatch through the wrapper |
| `trie` | limited | Its mutable Map traversal requires separate validation; a passing Map accessor does not establish trie support. |
| `btree` | **avoid** | a record field holding an optional heap value is cleared on write, so `BTreeMap.insert` followed by `get` faults. Use `Map` until this lands. |
| `bloom` / `hyperloglog` / `count_min` | limited | the hashing helper they share does not resolve across module boundaries |
| `alias_sampler` | limited | construction is blocked by the same resolution defect |

The three probabilistic structures and `alias_sampler` share ONE cause,
not four: a call that crosses a module boundary is resolved by numeric
id within the producing module, so a stdlib body reached transitively —
one whose home module the program never mounted directly — can land on
an unrelated function. It is a single fix, and closing it moves all
four at once.

`btree` and `adjacency_list` share the other: writing a record field
whose type is an optional heap value resets the record's data area, so
a later read finds nothing there.
