---
sidebar_position: 12
title: Pattern Matching
---

# Tutorial: Pattern Matching

Verum's `match` expression supports exhaustive, nested, and guarded
patterns.

## Basic matching

```verum
type Shape is Circle(Float) | Rectangle(Float, Float) | Triangle(Float, Float, Float);

fn area(shape: Shape) -> Float {
    match shape {
        Circle(r) => 3.14159 * r * r,
        Rectangle(w, h) => w * h,
        Triangle(a, b, c) => {
            let s = (a + b + c) / 2.0;
            (s * (s - a) * (s - b) * (s - c)).sqrt()
        }
    }
}
```

## Guard patterns

```verum
fn classify(x: Int) -> Text {
    match x {
        n if n < 0 => "negative",
        0 => "zero",
        n if n <= 10 => "small",
        _ => "large",
    }
}
```

## Or-patterns

```verum
fn is_weekend(day: Text) -> Bool {
    match day {
        "Saturday" | "Sunday" => true,
        _ => false,
    }
}
```

## Exhaustiveness

The compiler verifies that all variants are covered:

```verum
type Color is Red | Green | Blue;

fn name(c: Color) -> Text {
    match c {
        Red => "red",
        Green => "green",
        // Compile error: non-exhaustive — missing Blue
    }
}
```

## Nested patterns

```verum
type Tree<T> is Leaf(T) | Node(Heap<Tree<T>>, Heap<Tree<T>>);

fn depth<T>(tree: &Tree<T>) -> Int {
    match tree {
        Leaf(_) => 1,
        Node(left, right) => 1 + max(depth(left), depth(right)),
    }
}
```

## See also

- **[Language → Syntax](/docs/language/syntax)**
- **[Type system](/docs/language/types)**
