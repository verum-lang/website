---
sidebar_position: 8
title: Refinement Types
---

# Tutorial: Refinement Types

Refinement types add **compile-time constraints** to values. The compiler
proves your invariants before the program runs — zero runtime overhead.

## Your first refinement

```verum
type PositiveInt is Int{x: x > 0};

fn divide(a: Int, b: PositiveInt) -> Int {
    a / b   // Division by zero is impossible — b > 0 is proven at compile time.
}
```

`Int{x: x > 0}` means "an `Int` where the predicate `x > 0` holds."
The SMT solver (Z3) proves the constraint statically.

## Using refinements in practice

```verum
fn main() {
    let n: PositiveInt = 42;           // OK — the literal 42 > 0
    let result = divide(100, n);       // OK — n is PositiveInt
    assert_eq(result, 2);

    // let bad: PositiveInt = -5;      // Compile error: -5 > 0 is false
    // let zero: PositiveInt = 0;      // Compile error: 0 > 0 is false
}
```

## Verification strategies

Control how the compiler checks refinements:

```toml
# verum.toml
[verify]
default_strategy = "formal"          # uses SMT solver
solver_timeout_ms = 10000            # 10s per obligation

# Per-function override:
```

```verum
@verify(fast)                         // quick check, may skip complex proofs
fn simple_add(a: PositiveInt, b: PositiveInt) -> PositiveInt {
    a + b   // Trivially positive
}

@verify(thorough)                     // parallel solvers, maximum completeness
fn complex_algorithm(data: List<PositiveInt>) -> PositiveInt {
    // ...
}
```

Available strategies: `runtime`, `static`, `formal`, `fast`, `thorough`,
`certified`, `synthesize`.

## Viewing verification telemetry

```bash
verum build --smt-stats               # persist stats
verum smt-stats                       # view report
```

## Configuration

```toml
[types]
refinement = true                     # enabled by default

[verify]
default_strategy = "formal"
solver_timeout_ms = 10000
```

Disable refinement checking entirely with:

```bash
verum build -Z types.refinement=false
```

## See also

- **[Verification pipeline](/docs/architecture/verification-pipeline)**
- **[SMT integration](/docs/architecture/smt-integration)**
- **[`@verify` attribute](/docs/reference/verum-toml#verify--formal-verification)**
