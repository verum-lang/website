---
sidebar_position: 2
title: From TypeScript
description: For web developers — a high-level mapping of TS concepts to Verum.
---

# Migrating from TypeScript

Verum shares TypeScript's reach-for-static-types instinct, but goes
further: types are checked by an SMT solver, not just a structural
type system, and they persist at runtime as nothing — they are fully
erased after verification.

## Quick reference

| TypeScript | Verum |
|---|---|
| `interface Foo { x: number }` | `type Foo is { x: Int };` |
| `type Foo = { x: number }` | `type Foo is { x: Int };` (same syntactic form) |
| `type Status = "ok" \| "error"` | `type Status is Ok \| Error;` — proper sum types |
| `class Foo { constructor(x) {} greet() {} }` | `type Foo is { x: Int }; implement Foo { fn new(x: Int) -> Foo; fn greet(&self); }` |
| `interface Greeter { greet(): void }` | `type Greeter is protocol { fn greet(&self); }` |
| `class Impl implements Greeter` | `implement Greeter for Impl` |
| `array.map(f)`, `array.filter(p)` | `xs.iter().map(f).collect()`, `xs.iter().filter(p).collect()` |
| `async function / await` | `async fn` / `.await` (same) |
| `Promise<T>` | `Future<Output=T>` |
| `Promise.all(p)` | `join_all(futures).await` |
| `Promise.race(p)` | `race(f1, f2).await` |
| `Map<K, V>` | `Map<K, V>` (same) |
| `Set<T>` | `Set<T>` (same) |
| `Array<T>`, `T[]` | `List<T>`, `[T; N]` for fixed arrays |
| `string`, `number`, `boolean` | `Text`, `Int` / `Float`, `Bool` |
| `null`, `undefined` | there is no `null`; use `Maybe<T>` |
| `T \| null`, `T \| undefined` | `Maybe<T>` |
| `any` | `unknown` — top type, must be narrowed |
| `unknown` | `unknown` (same intent) |
| `never` | `!` — the never type |
| `keyof T`, `T[K]` | type-level reflection via `@type_fields(T)` |
| `as const` | `const NAME: T = ...;` at the binding site |
| `readonly` | `&T` — references are immutable by default; use `&mut T` |
| `throw new Error("msg")` | `throw Error.new("msg")` (in a `throws`-declared fn) |
| `try / catch / finally` | `try { } recover { } finally { }` |
| `import { foo } from "bar"` | `mount bar.foo` (or `mount bar.{foo, baz}`) |
| `export default` | `pub fn / type / const` |
| `JSON.parse(s)` | `parse_json(&s) -> Result<Data, DataError>` |
| `JSON.stringify(v)` | `json::to_string(&v)` |
| template literal `` `hi ${x}` `` | `f"hi {x}"` (format literal) |

---

## Types aren't just documentation

In TypeScript, `x: number` is a hint the compiler checks against
usage. In Verum, `x: Int { self > 0 }` is a **proposition** the SMT
solver proves holds at every call site. The cost at runtime is the
same (zero — everything erases), but the guarantees are much stronger.

Example:

```verum
fn divide(a: Int, b: Int { self != 0 }) -> Int { a / b }

fn caller(x: Int) {
    divide(10, x);                            // error: cannot prove x != 0
    if x != 0 {
        divide(10, x);                        // OK; flow narrows x
    }
}
```

---

## No `null` / `undefined`

Use `Maybe<T>`:

```verum
type User is { id: UserId, name: Text, email: Maybe<Text> };

match user.email {
    Maybe.Some(e) => send_to(&e),
    Maybe.None    => skip(),
}
```

`?.` optional chaining works the same way:

```verum
let city = user.address?.city?.name;           // Maybe<Text>
let city_or_default = city.unwrap_or_default();
```

---

## Discriminated unions ↔ sum types

TypeScript:

```ts
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "square"; side: number };
```

Verum:

```verum
type Shape is
    | Circle { radius: Float }
    | Square { side:   Float };

match shape {
    Shape.Circle { radius } => 3.14 * radius * radius,
    Shape.Square { side }   => side * side,
}
```

Verum variants are always exhaustively pattern-matchable (no
`.kind`-string inspection needed) and the compiler rejects
non-exhaustive matches.

---

## Classes ↔ type + implement

There are no classes. Use a record + `implement` block:

```verum
type Counter is { value: Int };

implement Counter {
    fn new() -> Counter { Counter { value: 0 } }
    fn inc(&mut self) { self.value += 1; }
    fn get(&self) -> Int { self.value }
}
```

`self` is explicit (`&self`, `&mut self`, `self`) — no hidden `this`.

---

## Interfaces ↔ protocols

```verum
type Serializable is protocol {
    fn serialize(&self) -> Text;
}

implement Serializable for User {
    fn serialize(&self) -> Text {
        f"""{"id": {self.id}, "name": "{self.name}"}"""
    }
}
```

Interfaces can extend other interfaces — `extends Base1 + Base2`.

---

## Generics & utility types

- `<T>` — works the same way.
- Bounds: `<T extends Serializable>` → `<T: Serializable>`.
- `<T extends Serializable & Clone>` → `<T: Serializable + Clone>`.
- **Negative bounds**: `<T: Send + !Sync>` — no TS equivalent.
- **Higher-kinded**: `<F<_>: Functor>` — TS can sort-of do this with
  conditional types; Verum supports it directly.
- `keyof`, `typeof`, mapped types → use `@type_fields`, `@type_name`,
  etc., at compile time via meta functions.

---

## Async

Nearly identical:

- `async function` → `async fn`.
- `await` → `.await` (postfix).
- `Promise<T>` → `Future<Output = T>`.
- `Promise.all([p1, p2])` → `join_all(&[p1, p2]).await` or
  `join(p1, p2).await` (returns a tuple).
- `Promise.race([p1, p2])` → `race(p1, p2).await`.

**New**: structured concurrency via `nursery { ... }` — no
"unhandled rejection" warnings because the nursery scope guarantees
every child is awaited or cancelled.

---

## Modules

TypeScript ESM:

```ts
import { foo, bar } from "./util";
export default class Foo { }
export const bar = 42;
```

Verum:

```verum
mount .self.util.{foo, bar};

pub type Foo is { ... };
pub const BAR: Int = 42;
```

No default exports — named exports only. `.self` for current cog;
`.super` for parent module; `.crate` for cog root.

---

## Error handling

No exceptions as a primary error mechanism:

```ts
// TypeScript
try {
    const x = JSON.parse(input);
    return process(x);
} catch (e) {
    return handleError(e);
}
```

```verum
// Verum: Result + `?`
fn load(input: &Text) -> Result<Output, Error> {
    let x = parse_json(input)?;
    process(x)
}

// Or with try/recover when mixing with `throws`:
fn load_or_default(input: &Text) -> Output {
    try { load(input)? }
    recover { _ => Output.default() }
}
```

---

## Tooling

| TypeScript | Verum |
|---|---|
| `npm init` / `npm create` | `verum new` |
| `npm install` | `verum add <dep>` |
| `tsc --watch` | `verum watch` |
| `tsc` / `tsc --noEmit` | `verum build` / `verum check` |
| `jest` / `vitest` | `verum test` (libtest-style flag set) |
| `fast-check` | `@property` (built in — refinement types feed the generator) |
| `jest --coverage` | `verum test --coverage` (LLVM source-based coverage) |
| `jest-junit` | `verum test --format junit` (built in) |
| `eslint` | `verum lint` |
| `prettier` | `verum fmt` |
| `tsconfig.json` | `verum.toml` |
| `package.json` | `verum.toml` (same file) |

---

## Testing

Tests live under `tests/`, never alongside source. The runner walks
the directory, dispatches by attribute (`@test`, `@property`,
`@test_case`), and reports each as a discrete entry:

```typescript
// jest
import { add } from './math';
import fc from 'fast-check';

test('add is commutative', () => {
    fc.assert(fc.property(fc.integer(), fc.integer(), (a, b) =>
        add(a, b) === add(b, a)
    ));
});

test.each([
    [0, 0, 0],
    [1, 2, 3],
])('%i + %i = %i', (a, b, expected) => {
    expect(add(a, b)).toBe(expected);
});
```

```verum
// Verum
@property
fn add_is_commutative(a: Int, b: Int) {
    assert_eq(add(a, b), add(b, a));
}

@test
@test_case(0, 0, 0)
@test_case(1, 2, 3)
fn add_table(a: Int, b: Int, expected: Int) {
    assert_eq(add(a, b), expected);
}
```

Notable mappings:

- **`describe` blocks** → split into separate `tests/*.vr` files.
- **`expect(...).toBe(...)`** → `assert_eq(left, right)`.
- **`expect(...).toBeCloseTo(x, digits)`** → `assert_approx_eq(a, b, tol)`.
- **`expect(fn).toThrow()`** → `assert_panics(\|\| fn())`.
- **`test.each(...)`** → `@test_case(...)` (one attribute per row).
- **`fc.assert(fc.property(...))`** → `@property` on a typed fn.
- **`it.skip` / `xit`** → `@ignore(reason = "…")`.
- **`it.only`** → `verum test --filter <name> --exact`.

CI output: `verum test --format junit > results.xml` is the drop-in
for `jest-junit`. SARIF is built in for GitHub Code Scanning.

Full reference: **[Tooling → Testing](/docs/tooling/testing)**.
Walkthrough: **[Tutorials → Testing walkthrough](/docs/tutorials/testing-walkthrough)**.

---

## Common first pain-points

1. **"Why compile at all?"** — Verum compiles to native binaries for
   predictable performance and to enable strong static guarantees.
2. **"Where's `any`?"** — `unknown` is the top type; values must be
   narrowed via `match` or `is` before use. There is no `any`
   intentionally — it would defeat the type system.
3. **"Where's structural typing?"** — Verum uses nominal typing for
   safety. Two structurally-identical records are different types.
   Use `@derive(From, Into)` to convert explicitly.
4. **"Where's method chaining on strings?"** — `s.trim().to_uppercase().replace(&"A", &"B")`.
   Same shape; some methods take a `&Text` where TS takes a plain string.
5. **"Why `List<T>` not `T[]`?"** — `[T; N]` is a fixed-size array;
   `List<T>` is the dynamic one. The dual distinction ("arrays vs. tuples")
   is sharper than in TS.

---

## See also

- **[Language tour](/docs/getting-started/tour)** — 10 minutes.
- **[Philosophy → semantic honesty](/docs/foundations/semantic-honesty)**
  — why `List` and `Text`, not `Vec` and `String`.
- **[Refinement types](/docs/language/refinement-types)** — the
  feature TS has been quietly wishing for.
