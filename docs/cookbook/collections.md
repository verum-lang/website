---
title: "Collections"
description: "Map, List, Set — creation, access, iteration, and entry patterns."
---

# Collections

## Map basics

```verum
// Create an empty Map
let mut scores: Map<Text, Int> = Map.new();

// Insert entries
scores.insert("alice", 95);
scores.insert("bob", 87);
scores.insert("charlie", 92);

// Access values
let alice_score = scores.get("alice");     // 95
let has_dave = scores.contains_key("dave"); // false

// Update an entry
scores.insert("alice", 98);               // replaces 95

// Remove an entry
scores.remove("bob");
assert_eq(scores.len(), 2);
```

## Counting and grouping

```verum
let words = ["the", "quick", "brown", "fox", "the", "lazy", "the"];
let mut counts: Map<Text, Int> = Map.new();

let mut i = 0;
while i < words.len() {
    let word = words[i];
    if counts.contains_key(word) {
        counts.insert(word, counts.get(word) + 1);
    } else {
        counts.insert(word, 1);
    }
    i = i + 1;
}

assert_eq(counts.get("the"), 3);
assert_eq(counts.get("fox"), 1);
```

## List operations

```verum
// Create a list
let xs = [1, 2, 3, 4, 5];
assert_eq(xs.len(), 5);
assert_eq(xs[0], 1);

// Mutable list
let mut ys: List<Int> = [];
ys.push(10);
ys.push(20);
ys.push(30);
assert_eq(ys.len(), 3);

// Higher-order operations
fn map_list(xs: List<Int>, f: fn(Int) -> Int) -> List<Int> {
    let mut result: List<Int> = [];
    let mut i = 0;
    while i < xs.len() {
        result.push(f(xs[i]));
        i = i + 1;
    }
    result
}

let doubled = map_list(xs, |x| x * 2);
assert_eq(doubled[0], 2);
assert_eq(doubled[4], 10);
```

## Map with integer keys

```verum
let mut squares: Map<Int, Int> = Map.new();
let mut i = 0;
while i < 10 {
    squares.insert(i, i * i);
    i = i + 1;
}

assert_eq(squares.get(5), 25);
assert_eq(squares.get(9), 81);
assert_eq(squares.len(), 10);
```

## Sorting a list

```verum
fn insertion_sort(xs: &mut List<Int>) {
    let n = xs.len();
    let mut i = 1;
    while i < n {
        let key = xs[i];
        let mut j = i - 1;
        while j >= 0 && xs[j] > key {
            xs[j + 1] = xs[j];
            j = j - 1;
        }
        xs[j + 1] = key;
        i = i + 1;
    }
}

let mut data = [5, 3, 8, 1, 9, 2, 7, 4, 6, 10];
insertion_sort(&mut data);
assert_eq(data[0], 1);
assert_eq(data[9], 10);
```

### See also

- **[Type system](/docs/language/types)** — `List<T>`, `Map<K,V>`, `Set<T>`
- **[Generics](/docs/language/generics)** — parameterised collections
