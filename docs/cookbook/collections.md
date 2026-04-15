---
title: "Counting and grouping with `Map.entry`"
description: "Atomic upserts, grouping by key, default insertion — every `Map.entry` pattern."
---

# `Map.entry` patterns

`Map.entry(key) -> MapEntry<K, V>` avoids the "look up twice" trap —
one hash, one probe, then decide what to do.

### Counting

```verum
let text = "the quick brown fox jumps over the lazy dog the".to_string();

let mut counts: Map<Text, Int> = Map::new();
for w in text.split_whitespace() {
    *counts.entry(w.to_string()).or_insert(0) += 1;
}

for (w, n) in counts.iter() {
    println(&f"{w}: {n}");
}
// the: 3
// quick: 1
// brown: 1
// ...
```

### Grouping — `or_insert_with`

```verum
type User is { id: Int, dept: Text };

let users = vec![
    User { id: 1, dept: "eng".to_string() },
    User { id: 2, dept: "eng".to_string() },
    User { id: 3, dept: "sales".to_string() },
];

let mut by_dept: Map<Text, List<User>> = Map::new();
for u in users {
    by_dept
        .entry(u.dept.clone())
        .or_insert_with(List::new)
        .push(u);
}
```

### Conditional mutation — `and_modify`

```verum
let mut cache: Map<UserId, User> = Map::new();

match request.user_id {
    Maybe.Some(id) => {
        cache.entry(id)
            .and_modify(|u| u.last_seen = Instant::now())
            .or_insert_with(|| fetch_user(id));
    }
    Maybe.None => (),
}
```

`and_modify` only runs if the key is present; `or_insert_with` only
if absent. Combine for "upsert with mutation."

### Explicit pattern match

When you need to branch on Occupied vs Vacant:

```verum
match counts.entry(key) {
    MapEntry.Occupied(mut e) => {
        *e.get_mut() += 1;
        println(&f"updated: {e.get()}");
    }
    MapEntry.Vacant(e) => {
        e.insert(1);
        println(&"inserted");
    }
}
```

### Default + in-place modification

```verum
// V must implement Default
*cache.entry(key).or_default() += 1;
```

### Returning a reference

`or_insert`/`or_insert_with`/`or_default` return `&mut V` — you get
a mutable reference to the value after insertion (if needed) or to
the existing value.

```verum
let pool = pools.entry(shard).or_insert_with(ThreadPool::new);
pool.submit(job);          // pool: &mut ThreadPool
```

### BTreeMap has the same API

```verum
let mut scores: BTreeMap<Level, Int> = BTreeMap::new();
*scores.entry(Level::Gold).or_insert(0) += 1;

for (level, count) in scores.iter() {      // sorted order
    println(&f"{level:?}: {count}");
}
```

### Performance notes

- `entry` does **one** hash + one probe. The equivalent
  `if map.contains(k) { map.get_mut(k)... } else { map.insert(k, ...) }`
  hashes twice.
- `or_insert` and `or_default` are lazy — the default is only
  materialised on a vacant entry.
- Drop the resulting reference before calling further mutating
  methods on the map (otherwise you have an aliasing conflict).

### See also

- **[collections → Map](/docs/stdlib/collections#mapk-v--hash-map)**
  — full entry API.
- **[Interior mutability](/docs/cookbook/interior-mutability)** — for
  map values you want to mutate through `&map`.
