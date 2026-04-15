---
sidebar_position: 6
title: Protocols
---

# Protocols

A **protocol** is Verum's interface mechanism — a set of method and
associated-type signatures that a type can implement. Protocols are
the bridge between the static polymorphism you ask for and the
dispatch the compiler arranges.

## Defining a protocol

```verum
type Display is protocol {
    fn fmt(&self, f: &mut Formatter) -> Result<(), FormatError>;
};

type Debug is protocol {
    fn fmt_debug(&self, f: &mut Formatter) -> Result<(), FormatError>;
};

type Iterator is protocol {
    type Item;
    fn next(&mut self) -> Maybe<Self.Item>;
};
```

- `type P is protocol { ... }` declares the protocol.
- Method signatures use `fn name(...) -> ReturnType` with no body.
- **Associated types** (`type Item;`) let implementations supply
  type-level parameters.
- `Self` refers to the implementing type; `Self.Item` to its
  associated type.

## Implementing

```verum
implement Display for User {
    fn fmt(&self, f: &mut Formatter) -> Result<(), FormatError> {
        f.write_str(&f"User({self.id})")
    }
}

implement<T> Iterator for Range<T: Numeric + Ord> {
    type Item = T;
    fn next(&mut self) -> Maybe<T> {
        if self.current < self.end {
            let v = self.current;
            self.current = self.current + T.one();
            Maybe.Some(v)
        } else {
            Maybe.None
        }
    }
}
```

## Protocol inheritance

Protocols can extend others:

```verum
type Clone is protocol {
    fn clone(&self) -> Self;
};

type Copy  is protocol extends Clone {
    // Marker: types are trivially copyable. No new methods.
};
```

## Default methods

From the real `core/protocols.vr` definition:

```verum
type Eq is protocol {
    fn eq(&self, other: &Self) -> Bool;
    fn ne(&self, other: &Self) -> Bool { !self.eq(other) }
};

type Ord is protocol where Self: Eq {
    fn cmp(&self, other: &Self) -> Ordering;

    // Default methods — overridable in implementations.
    fn lt(&self, other: &Self) -> Bool { self.cmp(other) is Less }
    fn le(&self, other: &Self) -> Bool { !(self.cmp(other) is Greater) }
    fn gt(&self, other: &Self) -> Bool { self.cmp(other) is Greater }
    fn ge(&self, other: &Self) -> Bool { !(self.cmp(other) is Less) }
    fn max(self, other: Self) -> Self { if self.ge(&other) { self } else { other } }
    fn min(self, other: Self) -> Self { if self.le(&other) { self } else { other } }
    fn clamp(self, min: Self, max: Self) -> Self { self.max(min).min(max) }
};
```

## Specialisation

A generic implementation can have a more specific override:

```verum
implement<T: Clone> List<T> {
    fn copy(&self) -> List<T> { ... }        // generic
}

@specialize
implement List<UInt8> {
    fn copy(&self) -> List<UInt8> {
        // memcpy fast path
        ...
    }
}
```

The compiler checks **specialisation coherence**: the specialised
instance must satisfy the same contracts as the generic one (a
metatheorem discharged at compile time).

## Generic associated types (GATs)

```verum
type LendingIterator is protocol {
    type Item<'a>;
    fn next<'a>(&'a mut self) -> Maybe<Self.Item<'a>>;
};
```

GATs let associated types depend on the lifetime/shape of each call,
not on the implementation as a whole.

## Static vs dynamic dispatch

### `impl P` (static)

```verum
fn draw_each(shapes: &[impl Drawable]) { ... }
```

- Monomorphised per concrete type.
- Zero overhead.
- Different monomorphisations are different compiled functions.

### `dyn P` (dynamic)

```verum
fn draw_each(shapes: &[dyn Drawable]) { ... }
```

- Single compiled function, virtual dispatch.
- Allows a heterogeneous collection.
- One pointer + one vtable pointer per value.

Rule of thumb: `impl` unless you need runtime polymorphism.

## Negative bounds

```verum
fn send_to<T: Send + !Sync>(x: T) { ... }
```

Reads "`T` must be `Send` but must _not_ be `Sync`." Useful for
single-owner-per-thread APIs.

## Context protocols

A protocol can be declared as a context:

```verum
context protocol Logger {
    fn info(&self, msg: Text);
    fn error(&self, msg: Text);
};
```

Context protocols can be both **required** by functions (`using
[Logger]`) and **implemented** by types that serve as logger backends.
See **[Context system](/docs/language/context-system)**.

## Coherence (orphan rule)

An implementation `implement P for T` is valid only if either:
- The cog defining the protocol `P` also defines `T`, or
- The cog defining `T` also defines the implementation.

Two cogs cannot both provide an `implement P for T` without
coordination. This rule keeps protocols unambiguous across an ecosystem.

## Marker protocols

Protocols with no methods that communicate a fact to the type
checker. From `core/protocols.vr`:

```verum
type Send  is protocol { };                       // safe to move across threads
type Sync  is protocol { };                       // safe to share across threads
type Copy  is protocol where Self: Clone { };     // trivial copy semantics
type Sized is protocol { };                       // statically sized
type Unpin is protocol { };                       // can be moved while pinned
```

The compiler auto-derives these where it can prove them; you can opt
out with `!Send`, `!Sync`, etc.
