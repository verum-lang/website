---
sidebar_position: 11
title: Protocols
---

# Tutorial: Protocols

Protocols are Verum's equivalent of traits (Rust) or type classes
(Haskell). They define shared behavior that types can implement.

## Defining a protocol

```verum
type Printable is protocol {
    fn display(&self) -> Text;
};
```

## Implementing a protocol

```verum
type Point is { x: Float, y: Float };

implement Printable for Point {
    fn display(&self) -> Text {
        f"({self.x}, {self.y})"
    }
}
```

## Using protocols as constraints

```verum
fn print_all<T: Printable>(items: List<T>) {
    for item in items {
        print(item.display());
    }
}
```

## Configuration

```toml
[protocols]
coherence = "strict"              # strict | lenient | unchecked
resolution_strategy = "most_specific"  # most_specific | first_declared | error
blanket_impls = true              # allow impl<T> Foo for T
higher_kinded_protocols = true    # protocol Functor<F: Type -> Type>
associated_types = true           # type Output;
generic_associated_types = true   # type Item<'a>;
```

### Coherence modes

- **strict** (default): orphan rules enforced, no overlapping impls.
- **lenient**: orphan impls allowed in the same crate.
- **unchecked**: skip coherence checking entirely.

```bash
verum build -Z protocols.coherence=unchecked
```

## See also

- **[Type system](/docs/language/types)**
- **[`[protocols]` config](/docs/reference/verum-toml#protocols)**
