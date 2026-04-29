---
sidebar_position: 30
title: Type Properties
description: "Compile-time type metadata via T.size, T.alignment, T.name, and friends."
---

# Type Properties

Verum treats types as first-class values at compile time. Any type
expression carries a set of **properties** — constants that describe
its shape, its identity, and its bounds — accessible with ordinary dot
notation:

```verum
let s = Int.size;          // 8
let a = Float.alignment;   // 8
let m = u32.max;           // 4294967295
let n = Int.name;          // "Int"
```

No parentheses. No intrinsic function. Properties are values attached
to the type itself; the compiler resolves them during monomorphisation
and emits a constant.

The facility replaces the older `size_of<T>()`, `align_of<T>()`, and
`stride_of<T>()` intrinsics. Those names still exist in
[`stdlib/mem`](/docs/stdlib/mem) but are now trivial wrappers around
`T.size` et al.

## The full property set

From the grammar:

```ebnf
type_property_name = 'size' | 'alignment' | 'stride'
                   | 'min' | 'max' | 'bits' | 'name' | 'id' ;
```

| Property     | Type    | Meaning                                              |
|--------------|---------|------------------------------------------------------|
| `T.size`     | `Int`   | Size of a value of `T` in bytes.                     |
| `T.alignment`| `Int`   | Required alignment in bytes.                         |
| `T.stride`   | `Int`   | Size rounded up to alignment — the stride in an array. |
| `T.min`      | `T`     | Minimum value (numeric types only).                  |
| `T.max`      | `T`     | Maximum value (numeric types only).                  |
| `T.bits`     | `Int`   | Bit width (numeric types only).                      |
| `T.name`     | `Text`  | The canonical type name as a compile-time string.    |
| `T.id`       | `u64`   | Stable hash of the canonical name — a type identifier. |

All values are **compile-time constants**. Using them in a `const`
context is legal; no runtime overhead, no panic.

## Works on any type expression

Properties work on every type — not just primitives.

```verum
// Primitives
Int.size                       // 8
i32.size                       // 4
i32.bits                       // 32
i32.max                        // 2147483647
Float.alignment                // 8
Bool.size                      // 1
Char.size                      // 4 (Unicode scalar value)

// User-defined types
type Point is { x: Float, y: Float };
Point.size                     // 16
Point.alignment                // 8
Point.stride                   // 16

// Arrays and slices
[Int; 10].size                 // 80
[Byte; 256].size               // 256
[Float; 4].alignment           // 8

// References — compile-time constants for each tier
&Int.size                      // 16  (ThinRef: ptr + generation + caps)
&checked Int.size              // 8   (tier 1: raw pointer)
&unsafe Int.size               // 8   (tier 2: raw pointer)
&[Int].size                    // 32  (FatRef: ThinRef + metadata + offset + reserved)

// Generic types in a polymorphic function
fn describe<T>() {
    print(f"{T.name}: {T.size}B, align {T.alignment}");
}
```

Inside `describe<T>`, each monomorphisation substitutes the concrete
`T` — there is one version per `T` the caller supplies, each with
`T.size` folded to its constant.

## Numeric properties

`min`, `max`, and `bits` are defined only on numeric types. Reading
them from a non-numeric type is a compile error with a diagnostic
pointing at the offending property.

```verum
i8.min       // -128
i8.max       // 127
i8.bits      // 8

u16.min      // 0
u16.max      // 65535

f32.min      // -3.4028235e38
f32.max      //  3.4028235e38
f32.bits     // 32
f64.bits     // 64

usize.max    // 2^64 - 1 on 64-bit platforms
```

## Names and identifiers

`T.name` is the canonical path-qualified name:

```verum
List<Int>.name                  // "core.collections.List<Int>"
Map<Text, User>.name            // "core.collections.Map<core.text.Text, User>"
Point.name                      // "crate::geom::Point" (if defined in crate.geom)
```

`T.id` is the FNV-64 hash of the canonical name. It is **stable**
across builds of the same source — two compilations of the same
program produce the same `T.id`. Across different Verum versions,
stability is not guaranteed (but is preserved when possible).

Use `T.id` for type-indexed maps and dispatch:

```verum
type TypeMap<V> is { table: Map<u64, V> };

fn put<T, V>(&mut self, value: V) {
    self.table.insert(T.id, value);
}

fn get<T, V>(&self) -> Maybe<&V> {
    self.table.get(&T.id)
}
```

## References, slices, and tuples

Reference types have well-defined sizes per tier:

| Reference form     | Size     | Notes                                   |
|--------------------|----------|-----------------------------------------|
| `&T` (tier 0, sized) | 16 bytes | ThinRef — ptr + generation + capabilities |
| `&T` (tier 0, unsized) | 32 bytes | FatRef — ThinRef + metadata + offset + reserved |
| `&checked T` (tier 1) | 8 bytes | bare pointer |
| `&unsafe T` (tier 2)  | 8 bytes | bare pointer |

A slice `&[T]` always takes the FatRef form (32 bytes).

Tuples are laid out as anonymous records:

```verum
(Int, Bool).size               // 16 — 8 for Int + 1 for Bool + 7 padding
(Int, Bool).alignment          // 8
(Byte, Byte, Byte).size        // 3
(Byte, Byte, Byte).alignment   // 1
```

## Use in refinements and types

Type properties participate in refinement predicates and array
bounds:

```verum
type ChunkBuffer is [Byte; 4096]
    where ensures self.len() % Int.size == 0;

fn pack(x: Int) -> [Byte; Int.size] { ... }

type AlignedPtr<T> is &checked T
    where ((self as usize) % T.alignment) == 0;
```

Because the properties are constant, the SMT solver treats them as
concrete numeric literals during verification.

## Examples

### Arena sizing

```verum
fn arena_for<T>(n: Int) -> Arena<T> {
    Arena.with_capacity(n * T.stride, T.alignment)
}
```

### Reflective debug

```verum
fn debug_layout<T>() {
    print(f"{T.name}: {T.size}B aligned {T.alignment}, stride {T.stride}");
}

fn main() {
    debug_layout<Point>();   // Point: 16B aligned 8, stride 16
    debug_layout<Int>();     // Int: 8B aligned 8, stride 8
    debug_layout<Bool>();    // Bool: 1B aligned 1, stride 1
}
```

### Compile-time assertion

```verum
const _: () = if Int.size != 8 { @error("Expected 8-byte Int") };
```

### Polymorphic dispatch by type id

```verum
fn handle<T>(event: &Event)
    using [Handlers]
{
    match T.id {
        Click.id   => handle_click(event),
        Keypress.id => handle_keypress(event),
        _ => handle_default<T>(event),
    }
}
```

`T.id` at the pattern position constrains the solver to constant
values — the match is compile-time-monomorphised, not a runtime
dispatch table.

## The underlying protocol

Every type implicitly implements `TypeMetadata`:

```verum
type TypeMetadata is protocol {
    const size: Int;
    const alignment: Int;
    const stride: Int;
    const min: Self;        // numeric only
    const max: Self;        // numeric only
    const bits: Int;        // numeric only
    const name: Text;
    const id: u64;
};
```

You cannot implement `TypeMetadata` yourself — the compiler
synthesises it for every type.

## See also

- **[Types](/docs/language/types)** — the type grammar.
- **[Refinement Types](/docs/language/refinement-types)** — using `T.size` in predicates.
- **[`stdlib/mem`](/docs/stdlib/mem)** — legacy `size_of/align_of/stride_of`.
- **[Metaprogramming](/docs/language/meta/overview)** — `@type_name`, `@type_fields`.
