---
title: Collections
description: List, Map, Set, Deque, BinaryHeap, BTreeMap — idioms and recipes for every operation.
---

# Collections

Verum's standard collections — `List`, `Map`, `Set`, `Deque`,
`BinaryHeap`, `BTreeMap`, `BTreeSet` — share a consistent
semantic-honest naming scheme. Every collection implements
`Iterator`, `IntoIterator`, `Clone`, `Debug`, `Eq`, and `Default`.

For the normative API surface of each type, see
[`stdlib/collections`](/docs/stdlib/collections).

## Constructing

```verum
// Empty
let xs: List<Int> = List.new();
let xs: List<Int> = [];

// Literal
let xs = [1, 2, 3, 4, 5];                    // list literal
let ys = [0; 10];                             // 10 copies of 0
let zs = list![1, 2, 3];                      // legacy list macro

// From iter
let fibs: List<Int> = (0..10).map(|n| fib(n)).collect();

// Constructor with capacity
let big: List<Int> = List.with_capacity(1024);

// From range
let r: List<Int> = (0..100).collect();
```

Similarly for `Map`, `Set`, etc.:

```verum
let m = Map.new();
let m = Map.from_pairs([("a", 1), ("b", 2)]);
let m = Map.of(("a", 1), ("b", 2), ("c", 3));

let s = Set.new();
let s = Set.of(1, 2, 3);

let d = Deque.new();
let d = Deque.from_list(list);
```

## Access

```verum
xs[0]                                // panics on OOB
xs.get(i)                            // -> Maybe<&T>
xs.first() / xs.last()               // -> Maybe<&T>

map[&key]                            // panics on missing
map.get(&key)                        // -> Maybe<&V>
map.contains_key(&key) -> Bool

set.contains(&value) -> Bool
```

Prefer `.get` over `[]` when the key might be absent — `.get`
returns `Maybe` and short-circuits elegantly with `?`.

## Mutation

```verum
xs.push(value)
xs.pop() -> Maybe<T>
xs.insert(index, value)
xs.remove(index) -> T
xs.swap_remove(index) -> T          // O(1); reorders

map.insert(key, value) -> Maybe<V>  // returns the old value
map.remove(&key) -> Maybe<V>

set.insert(value) -> Bool           // true if newly inserted
set.remove(&value) -> Bool          // true if was present
```

## The entry API

The **entry API** is the canonical way to do "insert or update":

```verum
let mut counts: Map<Text, Int> = Map.new();
for word in words.iter() {
    *counts.entry(word.clone()).or_insert(0) += 1;
}
```

No double lookup, no `.contains_key + .get + .insert` dance.

```verum
// Or-insert, or-insert-with, or-default:
map.entry(key).or_insert(default_value);
map.entry(key).or_insert_with(|| compute_default());
map.entry(key).or_default();             // T: Default

// And-modify:
map.entry(key).and_modify(|v| *v += 1).or_insert(1);

// Pattern match on the entry:
match map.entry(key) {
    OccupiedEntry(mut entry) => {
        *entry.get_mut() = new_value;
    }
    VacantEntry(entry) => {
        entry.insert(default);
    }
}
```

## Iteration

Every collection iterates:

```verum
for x in &xs { ... }                  // iter()  - &T
for x in &mut xs { ... }              // iter_mut() - &mut T
for x in xs { ... }                   // into_iter() - owned T (consumes xs)

for (k, v) in &map { ... }            // &K, &V
for (k, v) in &mut map { ... }        // &K, &mut V
for (k, v) in map { ... }             // owned K, V
```

### Combinator stack

```verum
let primes: List<Int> = (2..1000)
    .filter(|n| is_prime(*n))
    .take(100)
    .collect();

let by_domain: Map<Text, Int> = emails
    .iter()
    .map(|e| (e.domain(), 1))
    .into_group_map()
    .into_iter()
    .map(|(k, vs)| (k, vs.len()))
    .collect();
```

## Counting

```verum
let counts: Map<Text, Int> = words
    .iter()
    .fold(Map.new(), |mut acc, w| {
        *acc.entry(w.clone()).or_insert(0) += 1;
        acc
    });
```

Or with a comprehension:

```verum
let counts = {w: words.iter().filter(|x| *x == w).count()
              for w in set{x for x in &words}};
```

(See [language/comprehensions](/docs/language/comprehensions).)

## Grouping

```verum
let grouped: Map<Category, List<Item>> = items
    .iter()
    .into_group_map_by(|item| item.category.clone());
```

Or manually:

```verum
let mut groups: Map<Category, List<Item>> = Map.new();
for item in &items {
    groups.entry(item.category.clone())
          .or_insert_with(List.new)
          .push(item.clone());
}
```

## Sorting

```verum
// List<T: Ord>
xs.sort();                            // stable, in place
xs.sort_unstable();                   // faster, not stable
xs.sort_by(|a, b| a.cmp(b));          // custom comparator
xs.sort_by_key(|x| key(x));           // T → K

// Produce a new sorted list:
let ys = xs.sorted();                 // clone + sort

// BTreeMap/BTreeSet are already ordered — iterate in key order.
for (k, v) in &btree_map { ... }
```

### Top-K

For the largest K items, `BinaryHeap` is O(n log k), not O(n log n):

```verum
fn top_k<T: Ord>(items: &List<T>, k: Int) -> List<T> {
    let mut heap: BinaryHeap<Reverse<T>> = BinaryHeap.with_capacity(k);
    for item in items.iter() {
        heap.push(Reverse(item.clone()));
        if heap.len() > k { heap.pop(); }
    }
    heap.into_sorted_vec().into_iter().map(|Reverse(x)| x).collect()
}
```

`Reverse<T>` turns a max-heap into a min-heap. `BinaryHeap` (max by
default) + `Reverse` is the idiomatic top-K.

## Deduplication

```verum
// Preserves order:
let deduped: List<_> = xs.iter().cloned().collect<Set<_>>().into_iter().collect();

// Sorted order:
xs.sort();
xs.dedup();                           // remove consecutive duplicates

// By key:
xs.dedup_by_key(|x| x.id);
```

## Sliding windows and chunks

```verum
xs.windows(3)                         // &[T; 3]... for each of size 3
  .map(|w| w.iter().sum<Int>())
  .collect<List<_>>()

xs.chunks(5)                          // &[T]... fixed chunks
  .for_each(|chunk| process(chunk))
```

## Set operations

```verum
let a: Set<Int> = Set.of(1, 2, 3);
let b: Set<Int> = Set.of(2, 3, 4);

let union:        Set<Int> = a.union(&b).cloned().collect();
let intersection: Set<Int> = a.intersection(&b).cloned().collect();
let difference:   Set<Int> = a.difference(&b).cloned().collect();
let symmetric:    Set<Int> = a.symmetric_difference(&b).cloned().collect();

let is_subset   = a.is_subset(&b);
let is_superset = a.is_superset(&b);
let is_disjoint = a.is_disjoint(&b);
```

## Deque — front and back

```verum
let mut d: Deque<Int> = Deque.new();
d.push_back(1);
d.push_back(2);
d.push_front(0);                      // [0, 1, 2]
d.pop_front();                        // Maybe.Some(0)
d.pop_back();                         // Maybe.Some(2)
d.rotate_left(3);                     // rotate
d.rotate_right(3);
```

## BTreeMap — ordered map

```verum
let mut m: BTreeMap<Int, Text> = BTreeMap.new();
m.insert(3, "three");
m.insert(1, "one");
m.insert(2, "two");

for (k, v) in &m { ... }              // 1 → one, 2 → two, 3 → three

// Range queries:
for (k, v) in m.range(1..3) { ... }   // 1 and 2
for (k, v) in m.range(..=2) { ... }
for (k, v) in m.range(2..) { ... }
```

Use `BTreeMap` when you need **ordered iteration** or **range
queries**. `Map` (hashed) is faster for plain key lookup but
doesn't maintain order.

## Capacity and reallocation

```verum
let mut xs: List<Int> = List.with_capacity(1000);
xs.reserve(500);                      // ensure 500 more fit
xs.shrink_to_fit();                   // shrink unused
xs.shrink_to(100);                    // shrink to at least 100

let cap = xs.capacity();
let n = xs.len();
```

Pre-allocating avoids rehashing/regrowth overhead when you know the
final size.

## Memory layout notes

Per [semantic honesty](/docs/foundations/semantic-honesty):

- `List<T>` might be a contiguous buffer, a ring buffer, or a rope —
  chosen by profile-guided optimisation. Don't rely on specific
  layout.
- `Map<K, V>` might be Swiss-table, B-tree, or perfect hash.
- `Set<T>` is `Map<T, ()>` under the hood.
- `Deque<T>` and `BinaryHeap<T>` commit to their implementation by
  name.

For a **specific** layout, use the `with` attenuation:

```verum
type PackedList<T> is List<T> with [Contiguous, GrowthFactor<2>];
```

## Pitfalls

### `xs.remove(i)` is O(n)

Shifts every later element. For O(1) removal that doesn't preserve
order, use `.swap_remove(i)`.

### `map[&k]` panics on missing

Use `.get(&k)` and `match`/`?` instead of `map[&k]` in production
code.

### Iterator invalidation

Mutating a `List`/`Map` invalidates borrows into it:

```verum
let first = xs.first();               // &T
xs.push(value);                       // COMPILE ERROR: &xs active
```

Move the borrow out of scope, or restructure.

### Don't `clone()` a collection to read

```verum
// Wrong — clones the whole thing:
for x in xs.clone() { ... }

// Right:
for x in &xs { ... }
```

## See also

- **[`stdlib/collections`](/docs/stdlib/collections)** — normative
  API reference.
- **[`stdlib/base`](/docs/stdlib/base)** — `Iterator`, adapters.
- **[language/types](/docs/language/types)** — collection types in
  the type grammar.
- **[Comprehensions](/docs/language/comprehensions)** — list/map/set
  comprehensions.
- **[Generics](/docs/language/generics)** — parameterising over
  collection element types.
