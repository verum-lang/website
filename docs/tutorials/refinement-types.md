---
sidebar_position: 8
title: Refinement Types
description: Build a verified bounded ring-buffer and see the SMT solver discharge every invariant.
---

# Tutorial: Refinement Types

Refinement types attach a **predicate** to a type. Every value of
that type must satisfy the predicate — proved at compile time by the
SMT solver, zero runtime cost.

In this tutorial we'll build a **verified ring buffer** of `Int`s —
a classic data structure whose invariants (bounded, non-negative
indices, capacity preserved) are exactly where refinement types
shine. You'll:

- Write refinements.
- See the SMT solver accept easy goals and reject impossible ones.
- Write `requires` and `ensures` clauses.
- Use `invariant` / `decreases` on a loop.
- Promote a function up the verification ladder.

**Time: 45 minutes.**

**Prerequisites:** [Hello, World](/docs/getting-started/hello-world),
a little familiarity with `@verify`.

## Step 1 — Your first refinement

```verum
type PositiveInt is Int { self > 0 };

fn divide(a: Int, b: PositiveInt) -> Int {
    a / b                                    // no division-by-zero possible
}
```

`Int { self > 0 }` means "an `Int` where the predicate `self > 0`
holds." When you pass a value, the SMT solver must prove the
predicate; passing `0` or `-5` is a compile error.

```verum
fn main() {
    let n: PositiveInt = 42;                 // OK — 42 > 0 is provable
    let result = divide(100, n);             // OK
    print(f"{result}");

    // let bad: PositiveInt = -5;            // COMPILE ERROR
    // let zero: PositiveInt = 0;            // COMPILE ERROR
}
```

## Step 2 — Design the ring buffer

A ring buffer:

- Has a fixed **capacity** (set at creation).
- Stores up to `capacity` items in a `List<Int>`.
- Has `head` and `tail` indices that wrap around.
- Has `len` — the current number of occupied slots.

Here's the core type:

```verum
pub type RingBuffer is {
    data:     List<Int>,           // preallocated, always data.len() == capacity
    capacity: Int { self > 0 },    // non-zero
    head:     Int { 0 <= self && self < self },   // TODO — fix below
    tail:     Int { 0 <= self && self < self },
    len:      Int { 0 <= self && self <= self },
};
```

The `TODO`s point out that we need the refinements to refer to
**other fields** — `head` must be `< capacity`, `len` must be
`<= capacity`. Verum handles this with a **whole-record
refinement**.

## Step 3 — Whole-record refinements

```verum
pub type RingBuffer is {
    data:     List<Int>,
    capacity: Int { self > 0 },
    head:     Int,
    tail:     Int,
    len:      Int,
}
where self.data.len() == self.capacity,
      0 <= self.head && self.head < self.capacity,
      0 <= self.tail && self.tail < self.capacity,
      0 <= self.len  && self.len  <= self.capacity,
      // the bookkeeping identity:
      (self.head + self.len) % self.capacity == self.tail;
```

Every `RingBuffer` value satisfies every predicate. The SMT solver
will verify this at construction and every mutation.

## Step 4 — Constructor

```verum
impl RingBuffer {
    pub fn new(capacity: Int { self > 0 }) -> Self {
        Self {
            data:     List.with_capacity(capacity).fill(0, capacity),
            capacity,
            head:     0,
            tail:     0,
            len:      0,
        }
    }
}
```

The SMT solver must prove **all five** invariants for the value we're
returning:

1. `self.data.len() == self.capacity` → we just made it so.
2. `0 <= 0 && 0 < self.capacity` → since `self.capacity > 0`.
3. Same for `tail`.
4. `0 <= 0 && 0 <= self.capacity` → trivial.
5. `(0 + 0) % self.capacity == 0` → trivial.

All provable by `omega`. The compiler accepts it.

## Step 5 — `push` with `requires` / `ensures`

```verum
impl RingBuffer {
    pub fn push(&mut self, value: Int)
        where requires self.len < self.capacity
        where ensures  self.len == old(self.len) + 1
        where ensures  self.capacity == old(self.capacity)
    {
        self.data[self.tail] = value;
        self.tail = (self.tail + 1) % self.capacity;
        self.len += 1;
    }
}
```

- **`requires`** — the caller must prove the precondition. Calling
  `push` on a full buffer is a **compile error** (unless the caller
  first proves it's not full).
- **`ensures`** — the callee must prove the postcondition.
  `old(self.len)` refers to the value **before** the call.
- The SMT solver verifies each field's invariant still holds after
  the mutation:
  - `data.len() == capacity` — not changed.
  - `head`, `tail` — `(self.tail + 1) % self.capacity` is still
    `< self.capacity`.
  - `len` — was `< capacity`, now `+1`, so still `<= capacity`.
  - Bookkeeping identity — unchanged modulo arithmetic.

## Step 6 — Call `push` safely

```verum
fn stuff(buf: &mut RingBuffer) {
    buf.push(1);
    // buf.push(2);       // ERROR: cannot prove `self.len < self.capacity`
}
```

To call `push`, we need to prove the precondition. We can do it with
a check:

```verum
fn stuff(buf: &mut RingBuffer) {
    if buf.len < buf.capacity {
        buf.push(1);                         // OK — proof in scope
    }
}
```

Or by maintaining an invariant ourselves:

```verum
fn push_if_space(buf: &mut RingBuffer, value: Int) -> Bool {
    if buf.len < buf.capacity {
        buf.push(value);
        true
    } else {
        false
    }
}
```

## Step 7 — `pop` and `let else` refinement flow

```verum
impl RingBuffer {
    pub fn pop(&mut self) -> Maybe<Int>
        where ensures result.is_some() => self.len == old(self.len) - 1
        where ensures result.is_none() => self.len == old(self.len)
    {
        if self.len == 0 {
            return Maybe.None;
        }
        let value = self.data[self.head];
        self.head = (self.head + 1) % self.capacity;
        self.len -= 1;
        Maybe.Some(value)
    }
}
```

The `ensures` clauses are *conditional*: "if the result is `Some`,
then `len` shrank by 1; if `None`, `len` is unchanged." The SMT
solver checks each branch.

## Step 8 — Add a loop invariant

```verum
impl RingBuffer {
    pub fn sum(&self) -> Int {
        let mut total = 0;
        let mut i = 0;
        while i < self.len
            where invariant 0 <= i && i <= self.len,
                  invariant total == self.data
                      .iter().skip(self.head).take(i).sum()
            where decreases self.len - i
        {
            total += self.data[(self.head + i) % self.capacity];
            i += 1;
        }
        total
    }
}
```

- **`invariant`** — a predicate the solver must prove **before the
  loop**, **preserved by each iteration**, and **upon exit**.
- **`decreases`** — a termination witness. `self.len - i` is always
  non-negative and strictly decreases; the solver uses this to
  prove the loop terminates.

Invariants and `decreases` together close the gap on total
correctness — the function is proved to **terminate** and produce
the specified result.

## Step 9 — Promote to `@verify(formal)`

By default, unannotated functions run under `@verify(static)` — the
compiler checks what's easy and demotes hard goals to runtime
panics. Force all obligations through the SMT solver:

```verum
@verify(formal)
impl RingBuffer {
    // ... all the methods above
}
```

```bash
$ verum check
   compiling ring-buffer v0.1.0
   verifying  30 obligations (formal)
      ✓ 30 / 30 discharged  (median 42 ms per obligation)
    finished in 1.8s
```

30 proofs — all discharged by the SMT backend with median 42 ms per goal.

## Step 10 — See a rejection

Remove the `requires` from `push`:

```verum
pub fn push(&mut self, value: Int)
    // removed: where requires self.len < self.capacity
    where ensures self.len == old(self.len) + 1
{
    ...
}
```

```bash
$ verum check
error[V3402]: postcondition violated
  --> src/ring.rs:35:7
   |
35 |         self.len += 1;
   |         ^^^^^^^^^^^^^ counter-example found by the SMT solver
   |                       | at entry: self.len = capacity (buffer full)
   |                       | at exit:  self.len = capacity + 1  // > capacity — invariant violated!
   = help: add `where requires self.len < self.capacity`
```

The solver found a counter-example — the type's whole-record
invariant says `len <= capacity`, and without the precondition, you
can call `push` on a full buffer and break it.

## Step 11 — Tagged literals for refined input

Refinements play nicely with tagged literals:

```verum
fn parse_positive(input: &Text) -> Maybe<PositiveInt> {
    let n = input.parse_int()?;
    if n > 0 { Maybe.Some(n) } else { Maybe.None }
}

// Or via a compile-time-validated format:
type Port is Int { 1 <= self && self <= 65535 };
const HTTP_PORT: Port = 80;       // trivially in range
```

## What you built

A bounded ring buffer whose:

- **Capacity** is non-zero (refinement).
- **Indices** stay in range (whole-record refinement).
- **Length** is bounded (whole-record refinement).
- **`push`** has a precondition (`requires`) and two postconditions.
- **`pop`** has conditional postconditions.
- **`sum`** has a loop invariant and a termination witness.
- Every obligation is discharged by the SMT solver at compile time.
- All at zero runtime cost — the predicates are erased in the build.

## Where to go next

- **[language/refinement-types](/docs/language/refinement-types)** —
  normative reference.
- **[language/quantifiers](/docs/language/quantifiers)** — `forall` /
  `exists` in refinements.
- **[language/dependent-types](/docs/language/dependent-types)** —
  when you need a value *inside* a type.
- **[verification/refinement-reflection](/docs/verification/refinement-reflection)** —
  `@logic` helpers for non-SMT-native predicates.
- **[cookbook/refinements](/docs/cookbook/refinements)** — catalogue
  of useful refined types.
- **[tutorials/verified-data-structure](/docs/tutorials/verified-data-structure)** —
  a bigger verified data structure (sorted list).
- **[verification/smt-routing](/docs/verification/smt-routing)** —
  how the compiler picks the SMT backend, or portfolio.
