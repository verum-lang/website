---
sidebar_position: 17
title: "core.text.numeric.decimal — fixed-precision decimal arithmetic"
description: "Foundational fixed-precision Decimal type for monetary, financial, and lossless-numeric workloads. Parse / render / add / sub / mul / div / compare with banker's-rounding semantics."
slug: /stdlib/decimal
---

# `core.text.numeric.decimal`

`Decimal` is a foundational stdlib type for use cases where
binary float (`Float = f64`) is unsuitable: monetary amounts,
financial calculations, scientific instrument readings, and
PostgreSQL `NUMERIC` parameter binding.  Values are represented
exactly as

```text
value = coefficient × 10^(-scale)
```

The implementation is **pure stdlib** — no new AST nodes, no
new compiler intrinsics.  Every operation is checked against
overflow and surfaces a precise `DecimalError` variant when the
representation cannot hold the result.

## When to use Decimal

| Workload                              | Use            | Reason |
|---------------------------------------|----------------|--------|
| Money (USD, EUR, JPY, …)              | `Decimal`      | Float rounding produces real money loss at scale. |
| PG `NUMERIC` parameter binding        | `Decimal`      | Binary encode now bridges through `encode_numeric_from_decimal`. |
| Scientific readings with known scale  | `Decimal`      | Exact preservation of the instrument's resolution. |
| Statistics, fast loops, ML            | `Float`        | Decimal is per-op slower; reach for it only when correctness needs it. |
| Sub-nanosecond timestamps             | `Int` ns       | Time should not round. |

## Type surface

```verum
public type Decimal is {
    coefficient: Int,    // signed i64; sign of value tracks sign of coefficient
    scale:       Int,    // 0 ≤ scale ≤ 18
};

public type DecimalError is
      ParseEmpty
    | ParseInvalidChar { byte_offset: Int, byte: Int }
    | ParseInvalidShape { reason: Text }
    | ScaleOutOfRange   { scale: Int }
    | Overflow          { op: Text }
    | DivByZero;

public type RoundingMode is
      HalfEven    // banker's rounding (IEEE 754 default; eliminates +0.5 bias)
    | HalfUp      // halves away from zero
    | HalfDown    // halves towards zero
    | Truncate;   // unconditional truncate towards zero
```

`MAX_SCALE = 18` — the largest scale that fits inside an `i64`
coefficient with at least one significant digit.  Construction
beyond this surfaces `ScaleOutOfRange { scale }`.

## Constructors

```verum
implement Decimal {
    public fn zero()                             -> Decimal;
    public fn one()                              -> Decimal;
    public fn from_int(n: Int)                   -> Decimal;
    public fn from_parts(c: Int, s: Int)         -> Result<Decimal, DecimalError>;
}
```

`zero` and `one` are canonical: `(coefficient: 0, scale: 0)` and
`(coefficient: 1, scale: 0)`.  `from_int` cannot fail.
`from_parts` rejects `scale ∉ [0, 18]`.

## Predicates

```verum
public fn is_zero(&self)     -> Bool;
public fn is_negative(&self) -> Bool;
public fn is_positive(&self) -> Bool;
public fn abs(&self)         -> Decimal;
public fn neg(&self)         -> Decimal;
```

## Arithmetic

```verum
public fn add(&self, other: &Decimal) -> Result<Decimal, DecimalError>;
public fn sub(&self, other: &Decimal) -> Result<Decimal, DecimalError>;
public fn mul(&self, other: &Decimal) -> Result<Decimal, DecimalError>;
public fn div(
    &self,
    other:     &Decimal,
    precision: Int,
    mode:      RoundingMode,
) -> Result<Decimal, DecimalError>;
public fn div_round(&self, other: &Decimal, precision: Int) -> Result<Decimal, DecimalError>;
public fn div_trunc(&self, other: &Decimal)                  -> Result<Decimal, DecimalError>;
```

`add` / `sub` align scales via the 19-entry `POW10` table, then
add or subtract coefficients with `checked_add` /
`checked_sub`.  `mul` uses `i128` intermediate for the
coefficient product before re-narrowing.

`div` runs textbook long division on the i64 coefficients,
iterating `precision + 1` long-division steps (the +1 is the
rounding digit), tracks a sticky bit through the post-loop
remainder, and applies the rounding policy on the
`(round_digit, sticky)` tuple.  Division is **sign-aware**:
`(-7) / 2` HalfEven yields `-3.5`.

```verum
let a = Decimal.from_parts(50, 1)?;   // 5.0
let b = Decimal.from_parts(20, 1)?;   // 2.0
let q = a.div(&b, 2, RoundingMode.HalfEven)?;
// q = Decimal { coefficient: 250, scale: 2 }   →  "2.50"
```

### Rounding mode semantics

For the canonical `5/2 = 2.5` half-tie:

| Mode        | Result | Notes |
|-------------|--------|-------|
| `HalfEven`  | `2`    | last representable digit even (2 even, 3 odd → 2) |
| `HalfUp`    | `3`    | rounds halves away from zero |
| `HalfDown`  | `2`    | rounds halves towards zero |
| `Truncate`  | `2`    | discards round digit |

`HalfEven` is the default for `div_round` because it eliminates
the systematic +0.5 bias that plain `HalfUp` introduces over
many operations.

## Comparison

```verum
public fn compare(&self, other: &Decimal) -> Ordering;
public fn eq(&self, other: &Decimal) -> Bool;
public fn lt(&self, other: &Decimal) -> Bool;
public fn gt(&self, other: &Decimal) -> Bool;
public fn le(&self, other: &Decimal) -> Bool;
public fn ge(&self, other: &Decimal) -> Bool;
```

`compare` is sign-fast-path: differing signs decide ordering
without touching coefficients.  Same-sign values align scales
and compare coefficients directly.  In the degenerate case
where scale-alignment itself would overflow, `compare` falls
back to comparing the rendered text — slow but always correct.

## Parse and render

```verum
public fn parse_decimal(text: &Text) -> Result<Decimal, DecimalError>;
public fn to_text(&self)             -> Text;
```

`parse_decimal` accepts the canonical decimal grammar:

```ebnf
decimal     = [sign] digit+ ['.' digit+]
sign        = '+' | '-'
```

No scientific notation in V0 — exponential parsing is a V1
follow-up.  Trailing zeros in the fractional part are
**preserved**: `parse_decimal("1.50")` produces
`(coefficient: 150, scale: 2)`, `to_text` emits `"1.50"`.

`to_text` is byte-exact relative to the canonical text format.
Round-trip property:
`parse_decimal(d.to_text()) = Ok(d)` for every well-formed
`Decimal d`.

## Integration with PostgreSQL `NUMERIC`

The PG wire codec at `core.db.postgres.codec` exposes two
encoders that both bridge through `Decimal`:

```verum
// Integer fast-path (no Decimal allocation, V0).
public fn encode_numeric_from_int(
    buf:   &mut WireBuf,
    arena: &Arena,
    n:     Int,
) -> Bool;

// Decimal-backed encoder (V1; non-integer values).
public fn encode_numeric_from_decimal(
    buf:   &mut WireBuf,
    arena: &Arena,
    d:     &Decimal,
) -> Bool;

// Convenience wrapper: Text → Decimal → encode.
public fn encode_numeric_from_text(
    buf:   &mut WireBuf,
    arena: &Arena,
    s:     &Text,
) -> Bool;
```

Before V1, non-integer NUMERIC parameter binding fell back to
`FmtText` mode.  After V1 every NUMERIC binding takes the
binary path with full PG-side fidelity.

## V0 boundaries and V1 follow-ups

| Surface                  | V0                              | V1 plan |
|--------------------------|---------------------------------|---------|
| Coefficient precision    | `Int` (i64, ~18 sig digits)     | BigInt coefficient |
| Scale range              | `[0, 18]`                       | Tracked together with BigInt |
| Scientific-notation parse| **out of scope**                | `1.5e3` → Decimal |
| Square root, transcendentals | **out of scope**            | Needs extended-precision intermediate |
| Division                 | **shipped** (HalfEven default)  | — |
| Banker's rounding        | **shipped** (`RoundingMode.HalfEven`) | — |

## Testing

The exhaustive functional test fixture lives at
`vcs/specs/L2-standard/text/numeric_decimal.vr`.  It exercises:

- Every constructor + every error path.
- Add / sub / mul scale alignment + overflow detection.
- All four rounding modes on the canonical `5/2` half-tie.
- Sign propagation including `i64::MIN` saturation.
- Round-trip parse / render fidelity including trailing-zero
  preservation.

## Cross-references

- [PostgreSQL wire codec](./database-postgres.md) — the
  primary V1 consumer.
- [`stdlib/text`](./text.md) — text parsing utilities.
- [`stdlib/math`](./math.md) — for floating-point counterparts.
