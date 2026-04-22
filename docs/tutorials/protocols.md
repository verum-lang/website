---
sidebar_position: 11
title: Protocols
description: Build a small Serialize/Deserialize framework and learn Verum's interface system hands-on.
---

# Tutorial: Protocols

Protocols are Verum's interfaces — equivalent to Rust's traits or
Haskell's type classes. This tutorial builds a **small serialisation
framework** from scratch: define the protocol, implement it for core
types, derive it for user types, and see how generics + protocol
bounds compose.

**Time: 45 minutes.**

**Prerequisites:** generics (from the
[language tour](/docs/getting-started/tour)), basic pattern matching.

## Step 1 — Define the protocol

```verum
// src/serialize.vr
pub type Serialize is protocol {
    fn write(&self, out: &mut SerializeBuf);
}

pub type SerializeBuf is { bytes: List<Byte> };

impl SerializeBuf {
    pub fn new() -> Self {
        Self { bytes: List.new() }
    }

    pub fn push_byte(&mut self, b: Byte) {
        self.bytes.push(b);
    }

    pub fn push_bytes(&mut self, b: &[Byte]) {
        self.bytes.extend(b);
    }

    pub fn into_bytes(self) -> List<Byte> {
        self.bytes
    }
}
```

A `Serialize` implementation's only job is to write its bytes into
the buffer. The buffer API is concrete (no generic over output) for
simplicity; a real framework would use a `Write` protocol. We'll get
there.

## Step 2 — Implement for primitives

```verum
// src/impls.vr
mount .self.serialize.*;

implement Serialize for Int {
    fn write(&self, out: &mut SerializeBuf) {
        let bytes = self.to_le_bytes();       // little-endian, 8 bytes
        out.push_bytes(&bytes);
    }
}

implement Serialize for Bool {
    fn write(&self, out: &mut SerializeBuf) {
        out.push_byte(if *self { 1 } else { 0 });
    }
}

implement Serialize for Text {
    fn write(&self, out: &mut SerializeBuf) {
        let bytes = self.as_bytes();
        let len = bytes.len();
        (len as Int).write(out);              // length prefix
        out.push_bytes(bytes);
    }
}
```

Each implementation is a recipe. Note the recursion in `Text` —
`(len as Int).write(out)` calls the `Int` impl.

## Step 3 — Implement for a tuple

Protocols compose with generics:

```verum
implement<A: Serialize, B: Serialize> Serialize for (A, B) {
    fn write(&self, out: &mut SerializeBuf) {
        self.0.write(out);
        self.1.write(out);
    }
}
```

Now `(42, "hello")`, `(true, false)`, and any pair whose components
are themselves `Serialize` work automatically.

## Step 4 — Use the protocol

```verum
// src/main.vr
mount .self.serialize.*;
mount .self.impls.*;

fn main() {
    let mut out = SerializeBuf.new();
    42.write(&mut out);
    "hello".write(&mut out);
    (true, 100).write(&mut out);

    let bytes = out.into_bytes();
    print(f"wrote {bytes.len()} bytes: {bytes:?}");
}
```

```bash
$ verum run
wrote 26 bytes: [42, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 104, 101, 108, 108, 111, 1, 100, 0, 0, 0, 0, 0, 0, 0]
```

## Step 5 — Implement for `List<T>`

```verum
implement<T: Serialize> Serialize for List<T> {
    fn write(&self, out: &mut SerializeBuf) {
        (self.len() as Int).write(out);        // length prefix
        for item in self.iter() {
            item.write(out);
        }
    }
}
```

With this, `List<Int>`, `List<Text>`, and `List<(Bool, Int)>` all
serialize — the compiler builds the right implementation chain.

## Step 6 — Derive for user types

Writing `Serialize` for every record would be tedious. Use
`@derive(Serialize)` to have the compiler generate it:

```verum
@derive(Serialize)
type User is {
    id:    Int,
    name:  Text,
    admin: Bool,
};

fn main() {
    let u = User { id: 42, name: "Alice", admin: true };
    let mut out = SerializeBuf.new();
    u.write(&mut out);
    print(f"{out.into_bytes().len()} bytes");
}
```

`@derive(Serialize)` synthesises the obvious impl: write each field
in declaration order. For variants, the derive also writes a tag
byte for the discriminant.

See [cookbook/write-a-derive](/docs/cookbook/write-a-derive) for how
to write your own derive macro — it's the same machinery.

## Step 7 — Add a second protocol (`Deserialize`)

```verum
pub type Deserialize is protocol {
    fn read(input: &mut DeserializeBuf) -> Result<Self, DeserializeError>;
}

pub type DeserializeBuf is {
    bytes: List<Byte>,
    pos:   Int,
};

impl DeserializeBuf {
    pub fn new(bytes: List<Byte>) -> Self {
        Self { bytes, pos: 0 }
    }

    pub fn read_byte(&mut self) -> Result<Byte, DeserializeError> {
        if self.pos >= self.bytes.len() {
            return Result.Err(DeserializeError.Eof);
        }
        let b = self.bytes[self.pos];
        self.pos += 1;
        Result.Ok(b)
    }

    pub fn read_bytes(&mut self, n: Int) -> Result<&[Byte], DeserializeError> {
        if self.pos + n > self.bytes.len() {
            return Result.Err(DeserializeError.Eof);
        }
        let slice = &self.bytes[self.pos..self.pos + n];
        self.pos += n;
        Result.Ok(slice)
    }
}

type DeserializeError is Eof | InvalidData(Text);
```

And the round-trip:

```verum
implement Deserialize for Int {
    fn read(input: &mut DeserializeBuf) -> Result<Self, DeserializeError> {
        let bytes = input.read_bytes(8)?;
        Result.Ok(Int.from_le_bytes(bytes.try_into().unwrap()))
    }
}
```

## Step 8 — Protocol extension (`extends`)

Combine protocols with `extends`:

```verum
pub type Serde is protocol extends Serialize + Deserialize {
    // Any type that implements both Serialize and Deserialize
    // automatically implements Serde.
}

fn roundtrip<T: Serde>(value: &T) -> Result<T, DeserializeError> {
    let mut out = SerializeBuf.new();
    value.write(&mut out);
    let mut input = DeserializeBuf.new(out.into_bytes());
    T.read(&mut input)
}
```

`Serde` is a **marker protocol** — it adds no methods, but any type
implementing both `Serialize` and `Deserialize` gets it for free.
Useful for demanding the whole round-trip at a boundary.

## Step 9 — Associated types

For a protocol that produces a specific type:

```verum
pub type Parser is protocol {
    type Output;
    fn parse(&self, input: &Text) -> Result<Self.Output, ParseError>;
}

type IntParser is ();

implement Parser for IntParser {
    type Output = Int;
    fn parse(&self, input: &Text) -> Result<Int, ParseError> {
        input.trim().parse_int().ok_or(ParseError.InvalidInt)
    }
}
```

`Self.Output` in the signature references the implementer's chosen
type. Using `IntParser.parse("42")` gives you `Result<Int, ParseError>`
— the type system propagates the choice.

## Step 10 — Generic associated types (GATs)

An associated type can itself take parameters:

```verum
pub type Iterable is protocol {
    type Iter<'a>;
    fn iter<'a>(&'a self) -> Self.Iter<'a>;
}
```

GATs are essential for lending iterators and for higher-kinded
abstractions. See
[language/protocols](/docs/language/protocols#generic-associated-types-gats).

## Step 11 — Specialisation

For types where a more specific implementation is faster, use
`@specialize`:

```verum
@specialize
implement Serialize for List<Byte> {
    fn write(&self, out: &mut SerializeBuf) {
        (self.len() as Int).write(out);
        out.push_bytes(self.as_slice());    // single memcpy, no per-item call
    }
}
```

The generic `implement<T: Serialize> for List<T>` still works for
`List<Int>` or `List<Text>`; the compiler uses the specialised
version only for `List<Byte>`.

## What you built

A minimal but real serialisation framework:

- `Serialize` / `Deserialize` protocols.
- Implementations for primitives, tuples, `List<T>`.
- `@derive(Serialize)` on user types.
- `Serde` as a marker protocol extending both.
- Associated types (`Parser.Output`).
- Specialisation for `List<Byte>`.

And along the way, you've seen:

- Protocol definitions and implementations.
- Generic parameters bounded by protocols.
- Protocol extension with `extends`.
- Recursive protocol calls (`Text` calls the `Int` impl).
- Derive machinery via `@derive(...)`.

## What to read next

- **[language/protocols](/docs/language/protocols)** — GATs, negative
  bounds, specialisation, coherence.
- **[language/generics](/docs/language/generics)** — type parameters,
  bounds, HKTs.
- **[cookbook/write-a-derive](/docs/cookbook/write-a-derive)** — how
  to write your own `@derive(...)` macro.
- **[language/metaprogramming](/docs/language/meta/overview)** —
  the `meta fn` / `quote` foundation of derive.
- **[`stdlib/base`](/docs/stdlib/base)** — the protocols the standard
  library ships (Eq, Ord, Hash, Clone, Display, Debug, Default, etc.).
